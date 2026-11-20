// Alur status dokumen persediaan (tahap 4A): Penyesuaian Stok, Stock Opname, Pindah Stok. Ketiganya dokumen pelaksana
// (KONTRAK 3.2, RANCANGAN 2.2): Draft -> (Diajukan ->) Diposting, Diajukan -> Draft, Draft | Diajukan -> Batal,
// Diposting -> Batal lewat gerak balik. Tanpa impor Next.
import type { DocStatus } from '@/generated/prisma/client'
import { GalatAturan, GalatIzin } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { batasSaklar, pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from '../izin-inti'
import { transisiSah } from '../status'
import { tanggalIso } from '../waktu'
import { balikDokumen, type DokumenAsal } from './mesin'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>

export type JenisDokStok = 'stock_adjustment' | 'stock_opname' | 'stock_transfer'

export const DOK_STOK: Record<JenisDokStok, { menu: string; awalan: string; nama: string; jalur: string; audit: string }> = {
  stock_adjustment: { menu: 'stok.penyesuaian', awalan: 'PS', nama: 'Penyesuaian Stok', jalur: '/penyesuaian', audit: 'penyesuaian' },
  stock_opname: { menu: 'stok.opname', awalan: 'OP', nama: 'Stock Opname', jalur: '/opname', audit: 'opname' },
  stock_transfer: { menu: 'stok.pindah', awalan: 'PD', nama: 'Pindah Stok', jalur: '/pindah-stok', audit: 'pindah' },
}

export const BATAS_BARIS = 500

// Tanggal hari ini (WIB) sebagai Date UTC tengah malam, sama dengan bentuk kolom date dari skemaTanggal.
export const hariIni = (sekarang = new Date()) => new Date(`${tanggalIso(sekarang)}T00:00:00Z`)

// Tanggal dokumen tidak boleh di masa depan dan hanya boleh mundur sejauh saklar dok.tanggal_mundur. Saklar mati
// berarti hanya hari ini; saklar nyala tanpa batas berarti bebas mundur (periode akuntansi belum ada sampai tahap 5).
export function periksaTanggal(aktor: Aktor, tanggal: Date, kolom = 'date', sekarang = new Date()) {
  const hari = hariIni(sekarang)
  if (tanggal.getTime() > hari.getTime()) throw new GalatAturan('Tanggal dokumen tidak boleh lewat dari hari ini.', kolom)
  const mundur = Math.round((hari.getTime() - tanggal.getTime()) / 86_400_000)
  if (mundur === 0) return
  const batas = saklarNyala(aktor, 'dok.tanggal_mundur') ? batasSaklar(aktor, 'dok.tanggal_mundur') : 0
  if (batas !== null && mundur > batas) {
    throw new GalatAturan(batas === 0 ? 'Kamu hanya boleh membuat dokumen bertanggal hari ini.' : `Tanggal dokumen paling jauh mundur ${batas} hari.`, kolom)
  }
}

export function pastikanSalahSatu(aktor: Aktor, menu: string, aksi: ('T' | 'U')[]) {
  if (!aksi.some((a) => punyaIzin(aktor.izin, menu, a))) throw new GalatIzin(menu, aksi[0])
}

export async function aturanSetuju(db: Db | Tx, docType: JenisDokStok) {
  const r = await db.approvalRule.findUnique({ where: { docType } })
  return !!r?.requiresApproval
}

export type KepalaDok = { id: number; no: string; status: DocStatus; date: Date; submittedBy: number | null }

type DataStatus = {
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
}

export type KaitDok<K extends KepalaDok> = {
  jenis: JenisDokStok
  muat: (tx: Tx, id: number) => Promise<K | null>
  simpan: (tx: Tx, id: number, data: DataStatus) => Promise<unknown>
  // Apakah dokumen ini wajib lewat Diajukan (aturan persetujuan).
  butuhSetuju: (tx: Tx, d: K) => Promise<boolean>
  // Pemeriksaan dan gerak stok saat Diposting. Mengembalikan ringkasan untuk audit.
  posting: (tx: Tx, d: K, dok: DokumenAsal) => Promise<{ ringkas: string; sesudah?: unknown }>
  // Pemeriksaan sebelum diajukan (misalnya baris kosong).
  periksaAjukan?: (tx: Tx, d: K) => Promise<void>
}

export type AksiStatus = 'ajukan' | 'kembalikan' | 'posting' | 'batal'

const NAMA_AKSI: Record<AksiStatus, string> = { ajukan: 'Mengajukan', kembalikan: 'Mengembalikan ke draf', posting: 'Memposting', batal: 'Membatalkan' }

// Satu pintu untuk semua perubahan status dokumen persediaan, termasuk cek izin, transisi, saklar, dan audit.
export async function ubahStatusDok<K extends KepalaDok>(db: Db, k: Konteks, aktor: Aktor, kait: KaitDok<K>, id: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) {
  const info = DOK_STOK[kait.jenis]
  pastikanIzin(aktor, info.menu, 'L')
  return db.$transaction(async (tx) => {
    // Kunci kepala dokumen dulu supaya dua klik bersamaan tidak memposting dua kali.
    await tx.$executeRawUnsafe(`SELECT id FROM "${kait.jenis}" WHERE id = $1 FOR UPDATE`, id)
    const kini = await kait.muat(tx, id)
    if (!kini) throw new GalatAturan(`${info.nama} tidak ditemukan.`)
    const setuju = await kait.butuhSetuju(tx, kini)
    const sekarang = new Date()
    const tolakTransisi = () => {
      throw new GalatAturan(`${info.nama} berstatus ${kini.status} tidak bisa ${NAMA_AKSI[aksi].toLowerCase()}.`)
    }
    let data: DataStatus
    let ringkas = `${NAMA_AKSI[aksi]} ${info.nama.toLowerCase()} ${kini.no}`
    let sesudah: unknown = undefined
    if (aksi === 'ajukan') {
      pastikanSalahSatu(aktor, info.menu, ['T', 'U'])
      if (!transisiSah('pelaksana', kini.status, 'Diajukan')) tolakTransisi()
      await kait.periksaAjukan?.(tx, kini)
      data = { status: 'Diajukan', submittedBy: aktor.id, submittedAt: sekarang, updatedBy: aktor.id }
    } else if (aksi === 'kembalikan') {
      if (!transisiSah('pelaksana', kini.status, 'Draft')) tolakTransisi()
      // Dikembalikan oleh penyetuju atau oleh pengaju sendiri (RANCANGAN 2.1).
      if (!punyaIzin(aktor.izin, info.menu, 'S') && kini.submittedBy !== aktor.id) throw new GalatIzin(info.menu, 'S')
      data = { status: 'Draft', submittedBy: null, submittedAt: null, updatedBy: aktor.id }
    } else if (aksi === 'posting') {
      pastikanIzin(aktor, info.menu, 'P')
      if (!transisiSah('pelaksana', kini.status, 'Diposting', { butuhSetuju: setuju })) {
        if (setuju && kini.status === 'Draft') throw new GalatAturan(`${info.nama} ini perlu disetujui. Ajukan dulu, lalu penyetuju menekan Setujui dan posting.`)
        tolakTransisi()
      }
      if (setuju) pastikanIzin(aktor, info.menu, 'S')
      periksaTanggal(aktor, kini.date)
      const hasil = await kait.posting(tx, kini, { docType: kait.jenis, docId: kini.id, docNo: kini.no, tanggal: kini.date, oleh: aktor.id })
      ringkas = `${setuju ? 'Menyetujui dan memposting' : 'Memposting'} ${info.nama.toLowerCase()} ${kini.no}: ${hasil.ringkas}`
      sesudah = hasil.sesudah
      data = { status: 'Diposting', postedBy: aktor.id, postedAt: sekarang, updatedBy: aktor.id, ...(setuju ? { approvedBy: aktor.id, approvedAt: sekarang } : {}) }
    } else {
      const alasan = (opsi.alasan ?? '').trim()
      if (kini.status === 'Diposting') {
        // Batal sesudah posting: gerak balik, butuh izin Posting, saklar dok.batal_posting, dan alasan (KONTRAK 3.2).
        pastikanIzin(aktor, info.menu, 'P')
        if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan dokumen yang sudah Diposting butuh saklar Batalkan dokumen diposting.')
        if (alasan.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
        const balik = await balikDokumen(tx, { docType: kait.jenis, docId: kini.id, docNo: kini.no, tanggal: hariIni(sekarang), oleh: aktor.id })
        ringkas = `Membatalkan ${info.nama.toLowerCase()} ${kini.no} yang sudah Diposting dengan ${balik.length} gerak balik. Alasan: ${alasan}`
        sesudah = { gerakBalik: balik.map((g) => ({ productId: g.productId, locationId: g.locationId, qty: g.qty.toString(), nilai: g.nilai })) }
      } else {
        pastikanIzin(aktor, info.menu, 'U')
        if (!transisiSah('pelaksana', kini.status, 'Batal')) tolakTransisi()
        if (alasan && alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
        if (alasan) ringkas += `. Alasan: ${alasan}`
      }
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan.slice(0, 300) || undefined, updatedBy: aktor.id }
    }
    await kait.simpan(tx, id, data)
    await catatAudit(tx, k, {
      action: `${info.audit}.${aksi}`,
      docType: kait.jenis,
      docId: id,
      summary: ringkas,
      before: { status: kini.status },
      after: sesudah === undefined ? { status: data.status } : { status: data.status, ...(sesudah as object) },
    })
    return data.status
  })
}

// Tombol yang ditawarkan di layar rincian. Server tetap memeriksa ulang di ubahStatusDok.
export function tombolStatus(aktor: Aktor, jenis: JenisDokStok, status: DocStatus, butuhSetuju: boolean, submittedBy: number | null) {
  const menu = DOK_STOK[jenis].menu
  const izin = (a: string) => punyaIzin(aktor.izin, menu, a as 'L')
  return {
    ubah: status === 'Draft' && (izin('T') || izin('U')),
    hapus: status === 'Draft' && izin('H'),
    ajukan: status === 'Draft' && (izin('T') || izin('U')),
    kembalikan: status === 'Diajukan' && (izin('S') || submittedBy === aktor.id),
    posting: (status === 'Draft' && !butuhSetuju && izin('P')) || (status === 'Diajukan' && izin('P') && (!butuhSetuju || izin('S'))),
    setujuiPosting: butuhSetuju,
    batal: (status === 'Draft' || status === 'Diajukan') && izin('U'),
    batalPosting: status === 'Diposting' && izin('P') && saklarNyala(aktor, 'dok.batal_posting'),
  }
}

// Hapus draf (izin H). Baris ikut terhapus lewat onDelete Cascade. Nomor yang sudah keluar tidak dipakai ulang.
export async function hapusDraf(db: Db, k: Konteks, aktor: Aktor, jenis: JenisDokStok, id: number, hapus: (tx: Tx) => Promise<{ no: string; status: DocStatus } | null>) {
  const info = DOK_STOK[jenis]
  pastikanIzin(aktor, info.menu, 'H')
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT id FROM "${jenis}" WHERE id = $1 FOR UPDATE`, id)
    const d = await hapus(tx)
    if (!d) throw new GalatAturan(`${info.nama} tidak ditemukan atau bukan Draft.`)
    await catatAudit(tx, k, { action: `${info.audit}.hapus`, docType: jenis, docId: id, summary: `Menghapus draf ${info.nama.toLowerCase()} ${d.no}`, before: { no: d.no, status: d.status } })
  })
}

export const STATUS_DOK = ['Draft', 'Diajukan', 'Diposting', 'Batal'] as const

export type SaringDok = { status?: string; lokasi?: string; dari?: string; sampai?: string; q?: string; hal?: string }

// Saringan umum daftar dokumen persediaan. Lokasi dikembalikan terpisah karena kolomnya beda per dokumen.
export function saringDok(s: SaringDok) {
  const status = (STATUS_DOK as readonly string[]).includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const lokasi = s.lokasi && /^\d+$/.test(s.lokasi) ? Number(s.lokasi) : undefined
  const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  const q = s.q?.trim().slice(0, 30)
  return {
    lokasi,
    where: {
      ...(status ? { status } : {}),
      ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
      ...(q ? { no: { contains: q.toUpperCase() } } : {}),
    },
  }
}
