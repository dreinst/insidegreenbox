// Menunggu Persetujuan (KONTRAK 11 butir 158). Satu kueri untuk semua dokumen yang sedang menunggu tindakan pemegang
// Setujui atau Posting: status Diajukan di semua modul, pembayaran pembelian dan kas yang sudah Disetujui tetapi belum
// Diposting, serta shift lama berstatus "Perlu persetujuan". Daftar jenisnya disusun dari JENIS_DOKUMEN (status.ts) dan
// info modul (DOK_BELI, DOK_STOK, INFO_KAS), jadi jenis baru yang ditambah di sana ikut terbaca. Tanpa impor Next.
import { Prisma } from '@/generated/prisma/client'
import { DOK_BELI } from './beli/dokumen'
import type { DbAtauTx } from './db'
import { punyaIzin, type Pengguna } from './izin-inti'
import { INFO_KAS } from './kas'
import { MENU_PER_KODE } from './katalog'
import { PER_HALAMAN } from './master'
import { MENU_PERINTAH } from './produksi/perintah'
import { lihatSemuaKasir } from './shift'
import { JENIS_DOKUMEN } from './status'
import { DOK_STOK } from './stok/dokumen'

type Aktor = Pick<Pengguna, 'id' | 'izin'>

// Satu jenis antrean. tabel dan kolom berasal dari kode ini sendiri, bukan dari masukan pengguna.
export type JenisMenunggu = {
  kunci: string
  jenisDok: string
  nama: string
  tabel: string
  menu: string
  jalur: string
  status: 'Diajukan' | 'Disetujui' | 'PerluPersetujuan'
  // Aksi yang dibutuhkan untuk menindaklanjuti: Setujui untuk yang diajukan, Posting untuk yang sudah disetujui.
  aksi: 'S' | 'P'
  // Kolom pembeda di tabel yang dipakai beberapa jenis (cash_transaction.kind, journal.source_type).
  syarat?: { kolom: string; nilai: string }
  nilai: string
  sejak: string
}

// Dokumen berstatus yang modulnya tidak pernah memakai Diajukan, beserta alasannya. Tes memastikan setiap tabel
// berkolom doc_status ada di antrean atau di sini.
export const TANPA_AJUKAN: Record<string, string> = {
  budget: 'Anggaran langsung Disetujui Owner dari Draft (KONTRAK 11, tahap 6B).',
  bank_reconcile: 'Rekonsiliasi diposting langsung oleh pemegang Posting tanpa diajukan.',
  asset_disposal: 'Pelepasan aset diposting langsung oleh pemegang Posting aset.penyusutan.',
  asset_depreciation_run: 'Penyusutan bulanan dihitung dan diposting dalam satu langkah.',
}

// Nilai dokumen per tabel (rupiah). Tabel tanpa kolom nilai di kepala dokumen tampil tanpa nilai.
const NILAI: Record<string, string> = {
  purchase_order: 't.total',
  goods_receipt: 't.subtotal',
  purchase_invoice: 't.total',
  purchase_return: 't.total',
  direct_purchase: 't.total',
  purchase_payment: 't.amount',
  sales_order: 't.total',
  sales_invoice: 't.total',
  customer_payment: 't.amount',
  sales_return: 't.total',
  production_result: 't.value',
  quick_production: 't.value',
  pos_settlement: 't.actual_total',
  cash_transaction: 't.amount',
  journal: '(SELECT COALESCE(SUM(l.debit), 0) FROM journal_line l WHERE l.journal_id = t.id)',
}

type Dasar = Omit<JenisMenunggu, 'kunci' | 'status' | 'aksi' | 'sejak' | 'nilai'> & { golongan: string }

// Info modul tiap jenis dokumen di JENIS_DOKUMEN. Jenis yang tidak punya info di sini dan tidak ada di TANPA_AJUKAN
// membuat tes gagal, supaya modul baru tidak lupa didaftarkan.
function dasarJenis(): Dasar[] {
  const hasil: Dasar[] = []
  for (const [jenis, j] of Object.entries(JENIS_DOKUMEN)) {
    if (jenis in TANPA_AJUKAN) continue
    const beli = (DOK_BELI as Record<string, { menu: string; jalur: string; nama: string }>)[jenis]
    const stok = (DOK_STOK as Record<string, { menu: string; jalur: string; nama: string }>)[jenis]
    const info = beli ?? stok
    if (info) hasil.push({ jenisDok: jenis, nama: info.nama, tabel: jenis, menu: info.menu, jalur: info.jalur, golongan: j.golongan })
    else if (jenis === 'cash_transaction') {
      for (const [kind, k] of Object.entries(INFO_KAS)) hasil.push({ jenisDok: `${jenis}.${kind}`, nama: k.nama, tabel: jenis, menu: k.menu, jalur: k.jalur, golongan: j.golongan, syarat: { kolom: 'kind', nilai: kind } })
    } else if (jenis === 'production_order') hasil.push({ jenisDok: jenis, nama: j.nama, tabel: jenis, menu: MENU_PERINTAH, jalur: '/perintah-produksi', golongan: j.golongan })
    else if (jenis === 'pos_settlement') hasil.push({ jenisDok: jenis, nama: j.nama, tabel: jenis, menu: 'kasir.setoran', jalur: '/setoran', golongan: j.golongan })
  }
  // Jurnal memorial memakai tabel journal yang juga berisi jurnal otomatis (selalu Diposting), dan tidak ada di
  // JENIS_DOKUMEN karena nomornya dari modul jurnal.
  hasil.push({ jenisDok: 'journal', nama: 'Jurnal Memorial', tabel: 'journal', menu: 'akun.jurnal', jalur: '/jurnal', golongan: 'pelaksana', syarat: { kolom: 'source_type', nilai: 'memorial' } })
  return hasil
}

function susunJenis(): JenisMenunggu[] {
  const hasil: JenisMenunggu[] = []
  for (const d of dasarJenis()) {
    const { golongan, ...isi } = d
    const nilai = NILAI[d.tabel] ?? 'NULL'
    // Menu tanpa aksi Setujui (Pindah Stok) diposting pemegang Posting langsung dari Diajukan.
    const aksi = (MENU_PER_KODE.get(d.menu)?.aksi ?? '').includes('S') ? 'S' : 'P'
    hasil.push({ ...isi, kunci: d.jenisDok, status: 'Diajukan', aksi, nilai, sejak: 't.submitted_at' })
    // Pembayaran pembelian dan kas: Disetujui lalu Diposting saat uang keluar, oleh pemegang Posting.
    if (golongan === 'pelaksana_setuju') hasil.push({ ...isi, kunci: `${d.jenisDok}:posting`, nama: `${d.nama} (menunggu posting)`, status: 'Disetujui', aksi: 'P', nilai, sejak: 't.approved_at' })
  }
  // Shift lama yang ditutup sebelum tahap 6C dengan selisih di atas batas (KONTRAK 11 butir 121).
  hasil.push({ kunci: 'shift', jenisDok: 'shift', nama: 'Shift (selisih kas)', tabel: 'shift', menu: 'kasir.shift', jalur: '/shift', status: 'PerluPersetujuan', aksi: 'S', nilai: 't.cash_diff', sejak: 't.closed_at' })
  return hasil
}

export const JENIS_MENUNGGU: JenisMenunggu[] = susunJenis()
export const NAMA_MENUNGGU = new Map(JENIS_MENUNGGU.map((j) => [j.kunci, j.nama]))
export const MENU_MENUNGGU = [...new Set(JENIS_MENUNGGU.map((j) => j.menu))]

// Halaman dan item sidebar tampil untuk peran yang memegang Setujui di salah satu modul antrean.
export const bolehLihatMenunggu = (p: Pick<Pengguna, 'izin'>) => MENU_MENUNGGU.some((m) => punyaIzin(p.izin, m, 'S'))

export const bisaTindak = (p: Pick<Pengguna, 'izin'>, j: Pick<JenisMenunggu, 'menu' | 'aksi'>) => punyaIzin(p.izin, j.menu, j.aksi)

// Isi daftar mengikuti izin Lihat pengguna. Shift orang lain hanya untuk yang boleh melihat semua kasir.
function jenisTerlihat(aktor: Aktor, jenis?: string) {
  return JENIS_MENUNGGU.filter((j) => punyaIzin(aktor.izin, j.menu, 'L') && (!jenis || j.kunci === jenis))
}

function sqlJenis(aktor: Aktor, j: JenisMenunggu): Prisma.Sql {
  const pengaju = j.tabel === 'shift' ? 't.user_id' : 't.submitted_by'
  const no = j.tabel === 'shift' ? `'Shift #' || t.id` : 't.no'
  const tanggal = j.tabel === 'shift' ? `(t.closed_at AT TIME ZONE 'Asia/Jakarta')::date` : 't.date'
  const syarat = [`t.status = '${j.status}'`, ...(j.syarat ? [`t.${j.syarat.kolom} = '${j.syarat.nilai}'`] : [])]
  const sendiri = j.tabel === 'shift' && !lihatSemuaKasir(aktor)
  return Prisma.sql`SELECT ${j.kunci}::text AS jenis, t.id, ${Prisma.raw(no)} AS no, ${Prisma.raw(tanggal)} AS tanggal, ${Prisma.raw(pengaju)} AS pengaju_id,
    ${Prisma.raw(j.sejak)} AS sejak, (${Prisma.raw(j.nilai)})::bigint AS nilai
    FROM ${Prisma.raw(j.tabel)} t WHERE ${Prisma.raw(syarat.join(' AND '))}${sendiri ? Prisma.sql` AND t.user_id = ${aktor.id}` : Prisma.empty}`
}

export type BarisMenunggu = {
  jenis: string
  nama: string
  id: number
  no: string
  tanggal: Date | null
  pengaju: string | null
  sejak: Date | null
  nilai: bigint | null
  href: string
  aksi: 'S' | 'P'
  bisa: boolean
}

type Mentah = { jenis: string; id: number; no: string; tanggal: Date | null; pengaju_id: number | null; sejak: Date | null; nilai: bigint | null }

const gabung = (aktor: Aktor, jenis: JenisMenunggu[]) => Prisma.join(jenis.map((j) => sqlJenis(aktor, j)), ' UNION ALL ')

// Jumlah per jenis untuk saringan, angka Beranda, dan lencana sidebar.
export async function hitungMenunggu(db: DbAtauTx, aktor: Aktor) {
  const jenis = jenisTerlihat(aktor)
  const perJenis = new Map<string, number>()
  if (jenis.length) {
    const baris = await db.$queryRaw<{ jenis: string; n: bigint }[]>`SELECT u.jenis, COUNT(*)::bigint AS n FROM (${gabung(aktor, jenis)}) u GROUP BY u.jenis`
    for (const b of baris) perJenis.set(b.jenis, Number(b.n))
  }
  const total = [...perJenis.values()].reduce((a, b) => a + b, 0)
  const bisa = jenis.filter((j) => bisaTindak(aktor, j)).reduce((a, j) => a + (perJenis.get(j.kunci) ?? 0), 0)
  return { total, bisa, perJenis }
}

export type SaringMenunggu = { jenis?: string; hal?: string }

export async function daftarMenunggu(db: DbAtauTx, aktor: Aktor, s: SaringMenunggu) {
  const pilih = s.jenis && NAMA_MENUNGGU.has(s.jenis) ? s.jenis : undefined
  const jenis = jenisTerlihat(aktor, pilih)
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const hitung = await hitungMenunggu(db, aktor)
  const total = pilih ? (hitung.perJenis.get(pilih) ?? 0) : hitung.total
  const mentah = jenis.length
    ? await db.$queryRaw<Mentah[]>`SELECT u.* FROM (${gabung(aktor, jenis)}) u ORDER BY u.sejak ASC NULLS LAST, u.jenis, u.id LIMIT ${PER_HALAMAN} OFFSET ${(hal - 1) * PER_HALAMAN}`
    : []
  const ids = [...new Set(mentah.flatMap((m) => (m.pengaju_id ? [m.pengaju_id] : [])))]
  const nama = new Map((ids.length ? await db.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]))
  const info = new Map(JENIS_MENUNGGU.map((j) => [j.kunci, j]))
  const baris: BarisMenunggu[] = mentah.map((m) => {
    const j = info.get(m.jenis)!
    return { jenis: m.jenis, nama: j.nama, id: m.id, no: m.no, tanggal: m.tanggal, pengaju: m.pengaju_id ? (nama.get(m.pengaju_id) ?? null) : null, sejak: m.sejak, nilai: m.nilai, href: `${j.jalur}/${m.id}`, aksi: j.aksi, bisa: bisaTindak(aktor, j) }
  })
  // Pilihan saringan hanya jenis yang terlihat oleh pengguna, dengan jumlahnya.
  const pilihan = jenisTerlihat(aktor).map((j) => ({ kunci: j.kunci, nama: j.nama, jumlah: hitung.perJenis.get(j.kunci) ?? 0 }))
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)), pilihan, bisa: hitung.bisa, jenis: pilih }
}

// "3 hari 4 jam" dari waktu mulai menunggu sampai sekarang.
export function lamaMenunggu(sejak: Date | null, sekarang = new Date()) {
  if (!sejak) return '-'
  const menit = Math.max(0, Math.floor((sekarang.getTime() - sejak.getTime()) / 60_000))
  if (menit < 60) return `${menit} menit`
  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam`
  const hari = Math.floor(jam / 24)
  return jam % 24 ? `${hari} hari ${jam % 24} jam` : `${hari} hari`
}
