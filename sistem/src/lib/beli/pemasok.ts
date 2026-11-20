// Master Pemasok (tahap 4C, RANCANGAN 3). Izin beli.pemasok (Owner L T U H, Admin L T U). Pemasok tidak dihapus,
// hanya dinonaktifkan (KONTRAK 3.1). Termin bayar (hari) dipakai untuk jatuh tempo bawaan faktur dan pembelian kredit.
// Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db, DbAtauTx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman } from '../master'
import type { Aktor } from './dokumen'

const MENU = 'beli.pemasok'

const teks = (label: string, maks: number) => z.string().trim().max(maks, `${label} paling panjang ${maks} huruf.`).default('')

export const skemaPemasok = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Kode 2 sampai 20 huruf besar, angka, garis bawah, atau tanda hubung.')),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.'),
  contact: teks('Nama kontak', 80),
  phone: z
    .string()
    .trim()
    .max(30, 'Telepon paling panjang 30 huruf.')
    .regex(/^[0-9+()\s.-]*$/, 'Telepon hanya berisi angka, spasi, +, (, ), titik, atau tanda hubung.')
    .default(''),
  address: teks('Alamat', 200),
  npwp: teks('NPWP', 30),
  creditDays: z
    .string()
    .default('')
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? '0' : v))
    .pipe(z.string().regex(/^\d{1,3}$/, 'Termin berupa jumlah hari, 0 sampai 365.'))
    .transform(Number)
    .pipe(z.number().max(365, 'Termin paling lama 365 hari.')),
  bankName: teks('Nama bank', 40),
  bankAccountNo: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^\d{0,20}$/, 'Nomor rekening berisi angka saja, paling banyak 20.'))
    .default(''),
  note: teks('Catatan', 300),
})

const NAMA_KOLOM: Record<string, string> = {
  code: 'kode',
  name: 'nama',
  contact: 'kontak',
  phone: 'telepon',
  address: 'alamat',
  npwp: 'NPWP',
  creditDays: 'termin',
  bankName: 'bank',
  bankAccountNo: 'rekening',
  note: 'catatan',
}
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

async function periksaKembar(tx: DbAtauTx, d: z.infer<typeof skemaPemasok>, kecuali?: number) {
  const lain = kecuali ? { NOT: { id: kecuali } } : {}
  if (await tx.supplier.findFirst({ where: { code: d.code, ...lain } })) throw new GalatAturan('Kode pemasok sudah dipakai.', 'code')
  if (await tx.supplier.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...lain } })) throw new GalatAturan('Nama pemasok sudah dipakai.', 'name')
}

export async function tambahPemasok(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaPemasok.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pemasok'))`
    await periksaKembar(tx, d)
    const s = await tx.supplier.create({ data: { ...d, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pemasok.tambah', docType: 'supplier', docId: s.id, summary: `Menambah pemasok ${s.code} ${s.name}`, after: d })
    return s
  })
}

export async function ubahPemasok(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaPemasok.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pemasok'))`
    const s = await tx.supplier.findUnique({ where: { id } })
    if (!s) throw new GalatAturan('Pemasok tidak ditemukan.')
    await periksaKembar(tx, d, id)
    const beda = selisih(
      { code: s.code, name: s.name, contact: s.contact, phone: s.phone, address: s.address, npwp: s.npwp, creditDays: s.creditDays, bankName: s.bankName, bankAccountNo: s.bankAccountNo, note: s.note },
      d,
    )
    if (!beda.berubah.length) return 0
    await tx.supplier.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pemasok.ubah', docType: 'supplier', docId: id, summary: `Mengubah ${label(beda.berubah)} pemasok ${d.name}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

export async function ubahStatusPemasok(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const s = await tx.supplier.findUnique({ where: { id } })
    if (!s) throw new GalatAturan('Pemasok tidak ditemukan.')
    if (s.active === aktif) return
    await tx.supplier.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'pemasok.aktifkan' : 'pemasok.nonaktifkan',
      docType: 'supplier',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} pemasok ${s.name}`,
      before: { active: s.active },
      after: { active: aktif },
    })
  })
}

export type SaringPemasok = { q?: string; status?: string; hal?: string }

export async function daftarPemasok(db: Db, s: SaringPemasok) {
  const q = s.q?.trim().slice(0, 60)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q.toUpperCase() } }, { contact: { contains: q, mode: 'insensitive' as const } }] } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.supplier.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.supplier.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const pilihanPemasok = (db: DbAtauTx) => db.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
