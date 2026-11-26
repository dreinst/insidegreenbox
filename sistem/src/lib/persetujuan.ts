// Aturan persetujuan dokumen (approval_rule), keputusan pemilik 24 November 2026 (KONTRAK 11 butir 156). Owner
// mengubah wajib tidaknya persetujuan dan batasnya dari halaman Aturan Persetujuan. Baris tidak ditambah atau dihapus
// dari layar; isinya dibuat migrasi dan seed. Tanpa impor Next.
import { z } from 'zod'
import { GalatIzin } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import { isOwner, pastikanIzin, punyaIzin, type Pengguna } from './izin-inti'
import { bacaRupiah, formatRupiah } from './master'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'peran'>

export const MENU_PERSETUJUAN = 'atur.persetujuan'

// nominal: min_amount (rupiah); persen: min_pct. lebih: dokumen di atas batas kena aturan; minimal: sama dengan atau di
// atas batas (cara baca kas.ts). Kosong selalu berarti semua dokumen jenis itu.
export type JenisBatas = 'nominal' | 'persen'
export type InfoAturan = { nama: string; keterangan: string; batas?: JenisBatas; banding?: 'lebih' | 'minimal'; tetap?: string }

// Urutan ini juga urutan tampil. Keterangan menjelaskan cara modulnya membaca baris itu, supaya Owner tahu akibatnya.
export const ATURAN_PERSETUJUAN: Record<string, InfoAturan> = {
  purchase_request: { nama: 'Permintaan Pembelian', keterangan: 'Permintaan wajib diajukan lalu disetujui pemegang Setujui sebelum bisa dipesan.' },
  purchase_order: { nama: 'Pesanan Pembelian', batas: 'nominal', banding: 'lebih', keterangan: 'Pesanan dengan total di atas batas wajib diajukan lalu disetujui Owner. Kosong berarti semua pesanan.' },
  purchase_invoice: { nama: 'Faktur Pembelian: selisih harga', batas: 'persen', banding: 'lebih', keterangan: 'Faktur yang selisih harganya terhadap nilai penerimaan di atas batas persen wajib disetujui. Kosong berarti semua faktur.' },
  'purchase_invoice.jasa': { nama: 'Faktur Pembelian: jasa atau biaya', batas: 'nominal', banding: 'lebih', keterangan: 'Faktur yang berisi baris jasa atau biaya dengan total faktur di atas batas wajib disetujui. Kosong berarti semua faktur berisi jasa.' },
  direct_purchase: { nama: 'Pembelian Langsung tunai', batas: 'nominal', banding: 'lebih', keterangan: 'Pembelian langsung tunai dengan total di atas batas wajib disetujui. Pembelian kredit tidak termasuk karena pembayarannya sudah wajib disetujui.' },
  purchase_payment: { nama: 'Pembayaran Pembelian', keterangan: 'Pembayaran pemasok disetujui dulu, lalu diposting saat uang keluar.', tetap: 'Selalu wajib, karena alur dokumennya Disetujui lalu Diposting.' },
  sales_order: { nama: 'Pesanan Penjualan', batas: 'nominal', banding: 'lebih', keterangan: 'Pesanan penjualan dengan total di atas batas wajib diajukan lalu disetujui. Kosong berarti semua pesanan.' },
  'cash_transaction.masuk': { nama: 'Kas Masuk', batas: 'nominal', banding: 'minimal', keterangan: 'Kas masuk dengan jumlah sama dengan atau di atas batas wajib disetujui. Kosong berarti semua kas masuk.' },
  'cash_transaction.keluar': { nama: 'Kas Keluar', batas: 'nominal', banding: 'minimal', keterangan: 'Kas keluar dengan jumlah sama dengan atau di atas batas wajib disetujui. Kosong berarti semua kas keluar.' },
  'cash_transaction.pindah': { nama: 'Pindah Dana', batas: 'nominal', banding: 'minimal', keterangan: 'Pindah dana dengan jumlah sama dengan atau di atas batas wajib disetujui. Kosong berarti semua pindah dana.' },
  journal: { nama: 'Jurnal Memorial', keterangan: 'Jurnal memorial wajib diajukan lalu disetujui dan diposting.' },
  stock_adjustment: { nama: 'Penyesuaian Stok', keterangan: 'Penyesuaian yang punya baris tambah wajib disetujui. Penyesuaian yang semua barisnya kurang boleh langsung diposting.' },
  stock_opname: { nama: 'Stock Opname', keterangan: 'Opname wajib diajukan lalu disetujui dan diposting.' },
  production_order: { nama: 'Perintah Produksi', keterangan: 'Perintah produksi wajib diajukan lalu disetujui.' },
  material_issue: { nama: 'Pengeluaran Bahan', keterangan: 'Pengeluaran bahan wajib diajukan lalu disetujui dan diposting.' },
  production_result: { nama: 'Hasil Produksi', keterangan: 'Hasil produksi wajib diajukan lalu disetujui dan diposting.' },
  quick_production: { nama: 'Produksi Cepat', keterangan: 'Produksi cepat wajib diajukan lalu disetujui dan diposting.' },
}

const URUTAN = new Map(Object.keys(ATURAN_PERSETUJUAN).map((k, i) => [k, i]))

export type BarisAturan = { docType: string; info: InfoAturan | null; wajib: boolean; nominal: bigint | null; persen: string | null; updatedAt: Date; updatedBy: string | null }

// Semua baris approval_rule yang ada, dengan nama jenis dokumen. Jenis yang tidak dikenal sistem tetap tampil (baca saja).
export async function daftarAturan(db: DbAtauTx): Promise<BarisAturan[]> {
  const baris = await db.approvalRule.findMany()
  const ids = [...new Set(baris.flatMap((b) => (b.updatedBy ? [b.updatedBy] : [])))]
  const nama = new Map((await db.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  return baris
    .map((b) => ({
      docType: b.docType,
      info: ATURAN_PERSETUJUAN[b.docType] ?? null,
      wajib: b.requiresApproval,
      nominal: b.minAmount,
      persen: b.minPct === null ? null : b.minPct.toString(),
      updatedAt: b.updatedAt,
      updatedBy: b.updatedBy ? (nama.get(b.updatedBy) ?? null) : null,
    }))
    .sort((a, b) => (URUTAN.get(a.docType) ?? 999) - (URUTAN.get(b.docType) ?? 999) || a.docType.localeCompare(b.docType))
}

export const BATAS_NOMINAL_MAKS = 10_000_000_000n

// Isian batas nominal: kosong berarti semua nilai (null), selain itu rupiah bulat 1 sampai 10 miliar.
const skemaNominal = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = (v ?? '').trim()
    if (!t) return null
    const n = bacaRupiah(t)
    if (n === null || n < 1n || n > BATAS_NOMINAL_MAKS) {
      ctx.addIssue({ code: 'custom', message: `Batas nominal harus rupiah bulat 1 sampai ${formatRupiah(BATAS_NOMINAL_MAKS)}, misalnya 5000000 atau 5.000.000. Kosongkan untuk semua nilai.` })
      return z.NEVER
    }
    return n
  })

// Isian batas persen: kosong berarti semua dokumen (null), selain itu 0 sampai 100 dengan paling banyak tiga desimal.
const skemaPersenBatas = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = (v ?? '').trim().replace(',', '.')
    if (!t) return null
    if (!/^\d{1,3}(\.\d{1,3})?$/.test(t) || Number(t) > 100) {
      ctx.addIssue({ code: 'custom', message: 'Batas persen harus angka 0 sampai 100, misalnya 5 atau 2,5. Kosongkan untuk semua faktur.' })
      return z.NEVER
    }
    return String(Number(t))
  })

const skemaWajib = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'on')

// Nama isian memakai nomor urut baris di formulir, bukan jenis dokumen: jenis:<i> (tersembunyi, berisi jenis dokumen),
// wajib:<i>, nominal:<i>, persen:<i>. Jenis dokumen seperti cash_transaction.pindah mengandung "pin", dan isian
// bernama begitu dibuang dari isian terjaga (RAHASIA di aksi.ts), sehingga sesudah galat saklarnya tampil mati.
export const namaIsian = (jenis: 'jenis' | 'wajib' | 'nominal' | 'persen', i: number) => `${jenis}:${i}`

// Nomor urut tiap jenis dokumen yang dikirim formulir. Baris yang tidak ada di formulir (halaman basi) tidak disentuh.
export function urutanForm(masukan: Record<string, unknown>) {
  const urut = new Map<string, number>()
  for (const [k, v] of Object.entries(masukan)) {
    const m = /^jenis:(\d{1,3})$/.exec(k)
    if (m && typeof v === 'string' && !urut.has(v)) urut.set(v, Number(m[1]))
  }
  return urut
}

// Skema satu formulir untuk baris yang bisa diubah dan ada di formulir.
export function skemaAturan(baris: Pick<BarisAturan, 'docType' | 'info'>[], urut: Map<string, number>) {
  const bentuk: Record<string, z.ZodType> = {}
  for (const b of baris) {
    const i = urut.get(b.docType)
    if (!b.info || b.info.tetap || i === undefined) continue
    bentuk[namaIsian('wajib', i)] = skemaWajib
    if (b.info.batas === 'nominal') bentuk[namaIsian('nominal', i)] = skemaNominal
    if (b.info.batas === 'persen') bentuk[namaIsian('persen', i)] = skemaPersenBatas
  }
  return z.object(bentuk)
}

const tampilAturan = (x: { wajib: boolean; nominal: bigint | null; persen: string | null }, info: InfoAturan) => {
  if (!x.wajib) return 'tidak wajib'
  if (info.batas === 'nominal') return x.nominal === null ? 'wajib untuk semua nilai' : `wajib ${info.banding === 'minimal' ? 'mulai' : 'di atas'} ${formatRupiah(x.nominal)}`
  if (info.batas === 'persen') return x.persen === null ? 'wajib untuk semua faktur' : `wajib bila selisih di atas ${x.persen.replace('.', ',')}%`
  return 'wajib'
}

// Menyimpan semua baris yang berubah dalam satu transaksi. Hanya pengguna berperan Owner atau Superadmin yang memegang Ubah
// atur.persetujuan yang boleh, walau peran lain diberi izinnya. Satu baris audit persetujuan.ubah per jenis dokumen.
// Batas tidak dihapus saat persetujuan dimatikan, supaya menyalakannya lagi memakai batas yang sama.
export async function simpanAturan(db: Db, k: Konteks, aktor: Aktor, masukan: Record<string, unknown>) {
  pastikanIzin(aktor, MENU_PERSETUJUAN, 'U')
  if (!isOwner(aktor)) throw new GalatIzin(MENU_PERSETUJUAN, 'U')
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT doc_type FROM approval_rule FOR UPDATE`
    const baris = await daftarAturan(tx)
    const urut = urutanForm(masukan)
    const d = skemaAturan(baris, urut).parse(masukan) as Record<string, boolean | bigint | string | null>
    let berubah = 0
    for (const b of baris) {
      const info = b.info
      const i = urut.get(b.docType)
      if (!info || info.tetap || i === undefined) continue
      const lama = { wajib: b.wajib, nominal: b.nominal, persen: b.persen === null ? null : String(Number(b.persen)) }
      const baru = {
        wajib: d[namaIsian('wajib', i)] as boolean,
        nominal: info.batas === 'nominal' ? (d[namaIsian('nominal', i)] as bigint | null) : lama.nominal,
        persen: info.batas === 'persen' ? (d[namaIsian('persen', i)] as string | null) : lama.persen,
      }
      const s = selisih(lama, baru)
      if (!s.berubah.length) continue
      await tx.approvalRule.update({
        where: { docType: b.docType },
        data: { requiresApproval: baru.wajib, minAmount: baru.nominal, minPct: baru.persen, updatedBy: aktor.id },
      })
      await catatAudit(tx, k, {
        action: 'persetujuan.ubah',
        docType: 'approval_rule',
        docId: b.docType,
        summary: `Mengubah aturan persetujuan ${info.nama}: ${tampilAturan(lama, info)} menjadi ${tampilAturan(baru, info)}`,
        before: s.sebelum,
        after: s.sesudah,
      })
      berubah++
    }
    return berubah
  })
}

// Untuk tampilan: apakah aktor boleh mengubah (pemegang Ubah dan berperan Owner).
export const bolehUbahAturan = (aktor: Aktor) => isOwner(aktor) && punyaIzin(aktor.izin, MENU_PERSETUJUAN, 'U')

