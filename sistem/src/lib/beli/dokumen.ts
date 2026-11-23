// Alur status dokumen pembelian (tahap 4C, RANCANGAN 2 dan 3). Satu pintu untuk semua perubahan status: cek izin,
// transisi, saklar, tanggal, aturan persetujuan, kait per dokumen (gerak stok, penghitung turunan), dan audit dalam satu
// transaksi. Dokumen rencana: Permintaan dan Pesanan. Pelaksana: Penerimaan, Faktur, Retur, Pembelian Langsung.
// Pelaksana yang disetujui dulu: Pembayaran. Tanpa impor Next.
import type { DocStatus, PayStatus, Progress } from '@/generated/prisma/client'
import { z } from 'zod'
import { GalatAturan, GalatIzin } from '../aksi'
import { BALIK_JURNAL_BELI, JURNAL_BELI, type JenisBeliJurnal } from '../akuntansi/beli'
import { pastikanPeriodeTerbuka } from '../akuntansi/jurnal'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { JENIS_DOKUMEN, transisiSah, type GolonganDokumen } from '../status'
import { Desimal, NOL, des, keRupiah, type Angka } from '../stok/angka'
import { hariIni, periksaTanggal } from '../stok/dokumen'
import { balikDokumen, type DokumenAsal } from '../stok/mesin'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>

export type JenisBeli = 'purchase_request' | 'purchase_order' | 'goods_receipt' | 'purchase_invoice' | 'purchase_return' | 'direct_purchase' | 'purchase_payment'
// tahap 6A: dokumen penjualan B2B memakai pintu status yang sama (KONTRAK 11).
export type JenisJual = 'sales_order' | 'sales_invoice' | 'customer_payment' | 'sales_return'
export type JenisDok = JenisBeli | JenisJual

export type InfoBeli = { menu: string; awalan: string; nama: string; jalur: string; audit: string; golongan: GolonganDokumen }

const info = (jenis: JenisDok, menu: string, jalur: string, audit: string): InfoBeli => ({
  menu,
  jalur,
  audit,
  awalan: JENIS_DOKUMEN[jenis].awalan,
  nama: JENIS_DOKUMEN[jenis].nama,
  golongan: JENIS_DOKUMEN[jenis].golongan,
})

export const DOK_BELI: Record<JenisDok, InfoBeli> = {
  purchase_request: info('purchase_request', 'beli.permintaan', '/permintaan', 'permintaan'),
  purchase_order: info('purchase_order', 'beli.pesanan', '/pesanan', 'pesanan'),
  goods_receipt: info('goods_receipt', 'beli.penerimaan', '/penerimaan', 'penerimaan'),
  purchase_invoice: info('purchase_invoice', 'beli.faktur', '/faktur', 'faktur'),
  purchase_return: info('purchase_return', 'beli.retur', '/retur-beli', 'retur_beli'),
  direct_purchase: info('direct_purchase', 'beli.langsung', '/beli-langsung', 'beli_langsung'),
  purchase_payment: info('purchase_payment', 'beli.pembayaran', '/pembayaran', 'pembayaran'),
  sales_order: info('sales_order', 'b2b.pesanan', '/pesanan-jual', 'pesanan_jual'),
  sales_invoice: info('sales_invoice', 'b2b.faktur', '/faktur-jual', 'faktur_jual'),
  customer_payment: info('customer_payment', 'b2b.penerimaan', '/terima-pelanggan', 'terima_pelanggan'),
  sales_return: info('sales_return', 'b2b.retur', '/retur-jual', 'retur_jual'),
}

export const BATAS_BARIS_BELI = 200

export type KepalaBeli = { id: number; no: string; status: DocStatus; date: Date; submittedBy: number | null }

export type DataStatus = {
  status: DocStatus
  updatedBy: number
  submittedBy?: number | null
  submittedAt?: Date | null
  approvedBy?: number | null
  approvedAt?: Date | null
  postedBy?: number
  postedAt?: Date
  cancelledBy?: number
  cancelledAt?: Date
  cancelReason?: string
  closeReason?: string
  closedAt?: Date
}

// Dokumen pelaksana tidak punya kolom tutup sisa (close_reason, closed_at).
export function dataPelaksana(d: DataStatus) {
  const salin: Omit<DataStatus, 'closeReason' | 'closedAt'> & { closeReason?: string; closedAt?: Date } = { ...d }
  delete salin.closeReason
  delete salin.closedAt
  return salin as Omit<DataStatus, 'closeReason' | 'closedAt'>
}

export type HasilKait ={ ringkas?: string; sesudah?: Record<string, unknown> }

export type KaitBeli<K extends KepalaBeli> = {
  jenis: JenisDok
  muat: (tx: Tx, id: number) => Promise<K | null>
  simpan: (tx: Tx, id: number, data: DataStatus) => Promise<unknown>
  // Dokumen ini terkena approval_rule (tidak boleh melompati Diajukan, dan penyetujunya butuh izin Setujui).
  butuhSetuju: (tx: Tx, d: K) => Promise<boolean>
  // Pemeriksaan isi sebelum diajukan, disetujui, atau diposting dari Draft (misalnya baris kosong).
  periksaIsi?: (tx: Tx, d: K, aktor: Aktor) => Promise<void>
  // Dokumen rencana dan pembayaran: dijalankan saat Disetujui.
  setujui?: (tx: Tx, d: K, aktor: Aktor) => Promise<HasilKait | void>
  // Dokumen pelaksana: gerak stok dan penghitung turunan saat Diposting.
  posting?: (tx: Tx, d: K, dok: DokumenAsal, aktor: Aktor) => Promise<HasilKait>
  // Dijalankan sebelum status menjadi Batal: memeriksa dokumen turunan dan mengembalikan penghitung.
  batal?: (tx: Tx, d: K, aktor: Aktor, dari: DocStatus) => Promise<HasilKait | void>
  // tahap 6B: pembatalan dari Diposting, dijalankan sesudah gerak balik stok ditulis (jurnal balik dibentuk dari gerak
  // balik, KONTRAK 14.2 aturan 3). tanggal = hari pembatalan.
  sesudahBalik?: (tx: Tx, d: K, aktor: Aktor, tanggal: Date) => Promise<HasilKait | void>
  // Dokumen rencana: syarat tambahan Tutup sisa.
  tutup?: (tx: Tx, d: K, aktor: Aktor) => Promise<void>
}

export type AksiBeli = 'ajukan' | 'kembalikan' | 'setujui' | 'posting' | 'batal' | 'tutup'

const NAMA_AKSI: Record<AksiBeli, string> = {
  ajukan: 'Mengajukan',
  kembalikan: 'Mengembalikan ke draf',
  setujui: 'Menyetujui',
  posting: 'Memposting',
  batal: 'Membatalkan',
  tutup: 'Menutup sisa',
}

export const kunciBaris = (tx: Tx, tabel: string, id: number) => tx.$executeRawUnsafe(`SELECT id FROM "${tabel}" WHERE id = $1 FOR UPDATE`, id)

export function pastikanSalahSatu(aktor: Aktor, menu: string, aksi: ('T' | 'U' | 'S')[]) {
  if (!aksi.some((a) => punyaIzin(aktor.izin, menu, a))) throw new GalatIzin(menu, aksi[0])
}

// Satu pintu perubahan status dokumen pembelian. opsi.alasan untuk batal dan tutup.
export async function ubahStatusBeli<K extends KepalaBeli>(db: Db, k: Konteks, aktor: Aktor, kait: KaitBeli<K>, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) {
  const inf = DOK_BELI[kait.jenis]
  const gol = inf.golongan
  pastikanIzin(aktor, inf.menu, 'L')
  return db.$transaction(async (tx) => {
    // Kunci kepala dokumen dulu supaya dua klik bersamaan tidak memproses dua kali.
    await kunciBaris(tx, kait.jenis, id)
    const kini = await kait.muat(tx, id)
    if (!kini) throw new GalatAturan(`${inf.nama} tidak ditemukan.`)
    const setuju = await kait.butuhSetuju(tx, kini)
    const sekarang = new Date()
    const iz = (a: 'T' | 'U' | 'S' | 'P') => punyaIzin(aktor.izin, inf.menu, a)
    const tolak = (): never => {
      throw new GalatAturan(`${inf.nama} berstatus ${kini.status} tidak bisa ${NAMA_AKSI[aksi].toLowerCase()}.`)
    }
    const nama = inf.nama.toLowerCase()
    let data: DataStatus
    let ringkas = `${NAMA_AKSI[aksi]} ${nama} ${kini.no}`
    let sesudah: Record<string, unknown> | undefined
    const tambahHasil = (h: HasilKait | void) => {
      if (!h) return
      if (h.ringkas) ringkas += `: ${h.ringkas}`
      if (h.sesudah) sesudah = { ...sesudah, ...h.sesudah }
    }
    if (aksi === 'ajukan') {
      pastikanSalahSatu(aktor, inf.menu, ['T', 'U'])
      if (!transisiSah(gol, kini.status, 'Diajukan')) tolak()
      await kait.periksaIsi?.(tx, kini, aktor)
      data = { status: 'Diajukan', submittedBy: aktor.id, submittedAt: sekarang, updatedBy: aktor.id }
    } else if (aksi === 'kembalikan') {
      if (!transisiSah(gol, kini.status, 'Draft')) tolak()
      // Dikembalikan oleh penyetuju atau pengaju sendiri (RANCANGAN 2.1).
      if (!iz('S') && kini.submittedBy !== aktor.id) throw new GalatIzin(inf.menu, 'S')
      data = { status: 'Draft', submittedBy: null, submittedAt: null, updatedBy: aktor.id }
    } else if (aksi === 'setujui') {
      if (gol === 'pelaksana') tolak()
      if (!transisiSah(gol, kini.status, 'Disetujui', { butuhSetuju: setuju })) {
        if (setuju && kini.status === 'Draft') throw new GalatAturan(`${inf.nama} ini perlu disetujui Owner. Ajukan dulu.`)
        tolak()
      }
      // Dokumen yang terkena aturan persetujuan (dan semua pembayaran) butuh izin Setujui. Dokumen rencana tanpa aturan
      // boleh dikonfirmasi pemegang Tambah atau Ubah (KONTRAK 11 butir 63).
      if (setuju || gol === 'pelaksana_setuju') pastikanIzin(aktor, inf.menu, 'S')
      else pastikanSalahSatu(aktor, inf.menu, ['T', 'U', 'S'])
      await kait.periksaIsi?.(tx, kini, aktor)
      tambahHasil(await kait.setujui?.(tx, kini, aktor))
      data = {
        status: 'Disetujui',
        approvedBy: aktor.id,
        approvedAt: sekarang,
        updatedBy: aktor.id,
      }
    } else if (aksi === 'posting') {
      if (gol === 'rencana' || !kait.posting) tolak()
      pastikanIzin(aktor, inf.menu, 'P')
      if (!transisiSah(gol, kini.status, 'Diposting', { butuhSetuju: setuju })) {
        if (gol === 'pelaksana_setuju' && kini.status !== 'Disetujui') throw new GalatAturan(`${inf.nama} harus diajukan dan disetujui dulu sebelum diposting.`)
        if (setuju && kini.status === 'Draft') throw new GalatAturan(`${inf.nama} ini perlu disetujui Owner. Ajukan dulu, lalu penyetuju menekan Setujui dan posting.`)
        tolak()
      }
      const setujuSekaligus = gol === 'pelaksana' && setuju
      if (setujuSekaligus) pastikanIzin(aktor, inf.menu, 'S')
      periksaTanggal(aktor, kini.date)
      // tahap 5C: periode tertutup menolak posting dokumen pembelian (RANCANGAN 2.3 butir 5, KONTRAK 11 butir 73).
      await pastikanPeriodeTerbuka(tx, kini.date, `Posting ${kini.no}`)
      await kait.periksaIsi?.(tx, kini, aktor)
      const h = await kait.posting!(tx, kini, { docType: kait.jenis, docId: kini.id, docNo: kini.no, tanggal: kini.date, oleh: aktor.id }, aktor)
      ringkas = `${setujuSekaligus ? 'Menyetujui dan memposting' : 'Memposting'} ${nama} ${kini.no}`
      tambahHasil(h)
      // Jurnal di transaksi yang sama, sesudah gerak stok dan penghitung turunan (KONTRAK 14.2 aturan 1).
      const j = kait.jenis in JURNAL_BELI ? await JURNAL_BELI[kait.jenis as JenisBeliJurnal](tx, kini.id, aktor.id) : null
      if (j) sesudah = { ...sesudah, jurnal: j.no }
      data = {
        status: 'Diposting',
        postedBy: aktor.id,
        postedAt: sekarang,
        updatedBy: aktor.id,
        ...(setujuSekaligus ? { approvedBy: aktor.id, approvedAt: sekarang } : {}),
      }
    } else if (aksi === 'tutup') {
      if (gol !== 'rencana' || kini.status !== 'Disetujui') tolak()
      pastikanIzin(aktor, inf.menu, 'U')
      const alasan = (opsi.alasan ?? '').trim()
      if (alasan.length < 5) throw new GalatAturan('Tulis alasan menutup sisa, minimal 5 huruf.', 'alasan')
      if (alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
      await kait.tutup?.(tx, kini, aktor)
      ringkas += `. Alasan: ${alasan}`
      data = { status: 'Selesai', closeReason: alasan, closedAt: sekarang, updatedBy: aktor.id }
    } else {
      const alasan = (opsi.alasan ?? '').trim()
      if (alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
      if (kini.status === 'Diposting') {
        // Batal sesudah posting: gerak balik, butuh izin Posting, saklar dok.batal_posting, dan alasan (KONTRAK 3.2).
        pastikanIzin(aktor, inf.menu, 'P')
        if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan dokumen yang sudah Diposting butuh saklar Batalkan dokumen diposting.')
        if (alasan.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
        // tahap 5C: dokumen bertanggal di periode tertutup tidak bisa dibatalkan, begitu juga bila hari ini tertutup.
        await pastikanPeriodeTerbuka(tx, kini.date, `Pembatalan ${kini.no}`)
        await pastikanPeriodeTerbuka(tx, hariIni(sekarang), `Pembatalan ${kini.no}`)
        tambahHasil(await kait.batal?.(tx, kini, aktor, kini.status))
        const balik = await balikDokumen(tx, { docType: kait.jenis, docId: kini.id, docNo: kini.no, tanggal: hariIni(sekarang), oleh: aktor.id })
        const sesudahBalik = await kait.sesudahBalik?.(tx, kini, aktor, hariIni(sekarang))
        ringkas = `Membatalkan ${nama} ${kini.no} yang sudah Diposting${balik.length ? ` dengan ${balik.length} gerak balik` : ''}. Alasan: ${alasan}`
        if (balik.length) sesudah = { ...sesudah, gerakBalik: balik.map((g) => ({ productId: g.productId, locationId: g.locationId, qty: g.qty.toString(), nilai: g.nilai })) }
        const jb = kait.jenis in BALIK_JURNAL_BELI ? await BALIK_JURNAL_BELI[kait.jenis as JenisBeliJurnal](tx, kini.id, hariIni(sekarang), aktor.id) : null
        if (jb) sesudah = { ...sesudah, jurnalBalik: jb.no }
        if (sesudahBalik?.sesudah) sesudah = { ...sesudah, ...sesudahBalik.sesudah }
      } else {
        pastikanIzin(aktor, inf.menu, 'U')
        if (!transisiSah(gol, kini.status, 'Batal')) tolak()
        tambahHasil(await kait.batal?.(tx, kini, aktor, kini.status))
        if (alasan) ringkas += `. Alasan: ${alasan}`
      }
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan || undefined, updatedBy: aktor.id }
    }
    await kait.simpan(tx, id, data)
    await catatAudit(tx, k, {
      action: `${inf.audit}.${aksi}`,
      docType: kait.jenis,
      docId: id,
      summary: ringkas,
      before: { status: kini.status },
      after: { status: data.status, ...sesudah },
    })
    return data.status
  })
}

export type TombolBeli = {
  ubah: boolean
  hapus: boolean
  ajukan: boolean
  kembalikan: boolean
  setujui: boolean
  posting: boolean
  setujuiPosting: boolean
  batal: boolean
  batalPosting: boolean
  tutup: boolean
}

// Tombol yang ditawarkan di layar rincian. Server tetap memeriksa ulang di ubahStatusBeli.
export function tombolBeli(aktor: Aktor, jenis: JenisDok, status: DocStatus, butuhSetuju: boolean, submittedBy: number | null, opsi: { bolehTutup?: boolean } = {}): TombolBeli {
  const { menu, golongan } = DOK_BELI[jenis]
  const iz = (a: 'T' | 'U' | 'H' | 'S' | 'P') => punyaIzin(aktor.izin, menu, a)
  const tu = iz('T') || iz('U')
  const draf = status === 'Draft'
  const aju = status === 'Diajukan'
  const t: TombolBeli = {
    ubah: draf && tu,
    hapus: draf && iz('H'),
    ajukan: false,
    kembalikan: aju && (iz('S') || submittedBy === aktor.id),
    setujui: false,
    posting: false,
    setujuiPosting: false,
    batal: (draf || aju || status === 'Disetujui') && iz('U'),
    batalPosting: status === 'Diposting' && iz('P') && saklarNyala(aktor, 'dok.batal_posting'),
    tutup: false,
  }
  if (golongan === 'rencana') {
    t.ajukan = draf && tu && butuhSetuju
    t.setujui = butuhSetuju ? aju && iz('S') : (draf || aju) && (tu || iz('S'))
    t.tutup = status === 'Disetujui' && iz('U') && opsi.bolehTutup !== false
  } else if (golongan === 'pelaksana') {
    t.ajukan = draf && tu
    t.posting = (draf && !butuhSetuju && iz('P')) || (aju && iz('P') && (!butuhSetuju || iz('S')))
    t.setujuiPosting = butuhSetuju
  } else {
    t.ajukan = draf && tu
    t.setujui = aju && iz('S')
    t.posting = status === 'Disetujui' && iz('P')
  }
  return t
}

// Hapus draf (izin H). Baris ikut terhapus lewat onDelete Cascade. Nomor yang sudah keluar tidak dipakai ulang.
export async function hapusDrafBeli(db: Db, k: Konteks, aktor: Aktor, jenis: JenisDok, id: number, hapus: (tx: Tx) => Promise<{ no: string; status: DocStatus } | null>) {
  const inf = DOK_BELI[jenis]
  pastikanIzin(aktor, inf.menu, 'H')
  return db.$transaction(async (tx) => {
    await kunciBaris(tx, jenis, id)
    const d = await hapus(tx)
    if (!d) throw new GalatAturan(`${inf.nama} tidak ditemukan atau bukan Draft.`)
    await catatAudit(tx, k, { action: `${inf.audit}.hapus`, docType: jenis, docId: id, summary: `Menghapus draf ${inf.nama.toLowerCase()} ${d.no}`, before: { no: d.no, status: d.status } })
  })
}

// Aturan persetujuan per jenis dokumen (approval_rule). null berarti tidak ada aturan.
export async function aturanBeli(db: DbAtauTx, docType: JenisDok) {
  const r = await db.approvalRule.findUnique({ where: { docType } })
  if (!r || !r.requiresApproval) return null
  return { minAmount: r.minAmount, minPct: r.minPct === null ? null : des(r.minPct) }
}

// Rupiah bulat boleh kosong (menjadi 0) atau tidak dikirim sama sekali.
export const uangOpsional = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => v ?? '')
    .pipe(skemaUang({ label, min: 0n, wajib: false }))

export const idSkema = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

export const skemaTanggalWajib = (label: string) =>
  z.string().transform((v, ctx) => {
    const t = v.trim()
    const d = new Date(`${t}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
      ctx.addIssue({ code: 'custom', message: t ? `${label} bukan tanggal yang sah.` : `${label} wajib diisi.` })
      return z.NEVER
    }
    return d
  })

export { periksaTanggal, hariIni }

// Rupiah bulat qty x harga satuan beli.
export const nilaiBaris = (qty: Angka, harga: bigint) => keRupiah(des(qty).times(des(harga)))

// Membagi biaya ke baris menurut bobot (nilai baris) dengan sisa pembulatan ke pecahan terbesar, jadi jumlahnya persis.
export function bagiBiaya(total: bigint, bobot: bigint[]): bigint[] {
  if (!bobot.length || total === 0n) return bobot.map(() => 0n)
  const jumlah = bobot.reduce((a, b) => a + b, 0n)
  if (jumlah <= 0n) {
    // Semua baris bernilai 0 (barang gratis): bagi rata.
    const n = BigInt(bobot.length)
    return bobot.map((_, i) => total / n + (BigInt(i) < total % n ? 1n : 0n))
  }
  const dasar = bobot.map((b) => (total * b) / jumlah)
  const sisa = bobot.map((b, i) => ({ i, pecahan: (total * b) % jumlah }))
  let kurang = total - dasar.reduce((a, b) => a + b, 0n)
  sisa.sort((a, b) => (a.pecahan === b.pecahan ? a.i - b.i : a.pecahan > b.pecahan ? -1 : 1))
  for (const s of sisa) {
    if (kurang <= 0n) break
    dasar[s.i] += 1n
    kurang -= 1n
  }
  return dasar
}

// Progres dari pasangan (qty target, qty selesai). Target 0 diabaikan.
export function hitungProgres(baris: { target: Angka; selesai: Angka }[]): Progress {
  const isi = baris.filter((b) => des(b.target).gt(0))
  if (!isi.length) return 'Belum'
  const penuh = isi.every((b) => des(b.selesai).gte(des(b.target)))
  if (penuh) return 'Penuh'
  return isi.some((b) => des(b.selesai).gt(0)) ? 'Sebagian' : 'Belum'
}

export const statusBayar = (total: bigint, dibayar: bigint): PayStatus => (dibayar <= 0n ? 'BelumBayar' : dibayar >= total ? 'Lunas' : 'Sebagian')

export const NAMA_PROGRES: Record<Progress, string> = { Belum: 'Belum', Sebagian: 'Sebagian', Penuh: 'Penuh' }
export const NAMA_BAYAR: Record<PayStatus, string> = { BelumBayar: 'Belum bayar', Sebagian: 'Sebagian', Lunas: 'Lunas' }

// Faktor satuan beli ke satuan dasar: 1 untuk satuan dasar, selain itu dari product_unit.
export async function faktorSatuan(tx: DbAtauTx, productId: number, unitId: number): Promise<Desimal> {
  const p = await tx.product.findUnique({ where: { id: productId }, select: { baseUnitId: true } })
  if (!p) throw new GalatAturan('Produk tidak ditemukan.', 'item')
  if (p.baseUnitId === unitId) return new Desimal(1)
  const pu = await tx.productUnit.findUnique({ where: { productId_unitId: { productId, unitId } } })
  if (!pu) throw new GalatAturan('Satuan ini belum punya konversi ke satuan dasar produk. Tambahkan di Produk dan Satuan.', 'item')
  return des(pu.factorToBase)
}

// Pilihan "produk dan satuan" untuk formulir baris: satuan dasar dan semua konversi produk aktif yang boleh dibeli.
export async function pilihanBarang(db: DbAtauTx) {
  const produk = await db.product.findMany({
    where: { active: true, purchasable: true },
    include: { baseUnit: true, productUnits: { include: { unit: true }, orderBy: { factorToBase: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return produk.flatMap((p) => [
    { nilai: `${p.id}:${p.baseUnitId}`, label: `${p.name} (${p.baseUnit.symbol})`, productId: p.id, unitId: p.baseUnitId, faktor: '1', lastCost: p.lastCost.toString() },
    ...p.productUnits
      .filter((u) => u.unitId !== p.baseUnitId)
      .map((u) => ({
        nilai: `${p.id}:${u.unitId}`,
        label: `${p.name} (${u.unit.symbol}, 1 ${u.unit.symbol} = ${des(u.factorToBase).toString().replace('.', ',')} ${p.baseUnit.symbol})`,
        productId: p.id,
        unitId: u.unitId,
        faktor: u.factorToBase.toString(),
        lastCost: p.lastCost.toString(),
      })),
  ])
}

// Isian "produk:satuan" dari formulir.
export const skemaBarang = z.string().regex(/^\d+:\d+$/, 'Pilih produk dan satuannya.').transform((v) => {
  const [productId, unitId] = v.split(':').map(Number)
  return { productId, unitId }
})

// Harga terakhir per satuan beli = product.last_cost x faktor, dibulatkan. 0 berarti belum pernah dibeli.
export const hargaTerakhir = (lastCost: Angka, faktor: Angka) => keRupiah(des(lastCost).times(des(faktor)))

export async function produkBeli(tx: DbAtauTx, productId: number) {
  const p = await tx.product.findUnique({ where: { id: productId }, include: { baseUnit: true } })
  if (!p || !p.active) throw new GalatAturan('Produk tidak ditemukan atau nonaktif.', 'item')
  if (!p.purchasable) throw new GalatAturan(`${p.name} tidak ditandai boleh dibeli.`, 'item')
  return p
}

export async function pemasokAktif(tx: DbAtauTx, supplierId: number) {
  const s = await tx.supplier.findUnique({ where: { id: supplierId } })
  if (!s || !s.active) throw new GalatAturan('Pemasok tidak ditemukan atau nonaktif.', 'supplierId')
  return s
}

export async function lokasiAktif(tx: DbAtauTx, locationId: number) {
  const l = await tx.location.findUnique({ where: { id: locationId } })
  if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
  return l
}

// Tanggal jatuh tempo bawaan: tanggal dokumen + termin pemasok (hari).
export const jatuhTempo = (tanggal: Date, hari: number) => new Date(tanggal.getTime() + Math.max(0, hari) * 86_400_000)

export const STATUS_BELI = ['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Selesai', 'Batal'] as const

export type SaringBeli = { status?: string; pemasok?: string; dari?: string; sampai?: string; q?: string; hal?: string }

export function saringBeli(s: SaringBeli) {
  const status = (STATUS_BELI as readonly string[]).includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const pemasok = s.pemasok && /^\d+$/.test(s.pemasok) ? Number(s.pemasok) : undefined
  const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  const q = s.q?.trim().slice(0, 30)
  return {
    pemasok,
    hal: sesuaiHalaman(s.hal),
    per: PER_HALAMAN,
    where: {
      ...(status ? { status } : {}),
      ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
      ...(q ? { no: { contains: q.toUpperCase() } } : {}),
    },
  }
}

export const jumlahHal = (total: number) => Math.max(1, Math.ceil(total / PER_HALAMAN))

// Qty sisa yang tidak boleh minus untuk tampilan.
export const sisaQty = (a: Angka, b: Angka) => Desimal.max(NOL, des(a).minus(des(b)))
