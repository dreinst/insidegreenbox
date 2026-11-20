// Master Rekening Bank (tahap 5A), tujuan setoran POS. Izin kas.rekening (RANCANGAN 8.2: Owner L T U H, Admin L).
// Akun COA (bank_account.account_id) diisi saat modul akuntansi ada. Rekening tidak dihapus, hanya dinonaktifkan
// (KONTRAK 3.1). Tanpa Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { PER_HALAMAN, sesuaiHalaman } from './master'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'kas.rekening'

export const skemaRekening = z.object({
  bankName: z.string().trim().min(2, 'Nama bank minimal 2 huruf.').max(40, 'Nama bank paling panjang 40 huruf.'),
  accountNo: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^\d{5,20}$/, 'Nomor rekening berisi 5 sampai 20 angka.')),
  holderName: z.string().trim().min(2, 'Nama pemilik minimal 2 huruf.').max(80, 'Nama pemilik paling panjang 80 huruf.'),
})

const NAMA_KOLOM: Record<string, string> = { bankName: 'nama bank', accountNo: 'nomor rekening', holderName: 'nama pemilik' }
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

export const namaRekening = (r: { bankName: string; accountNo: string; holderName?: string }) => `${r.bankName} ${r.accountNo}${r.holderName ? ` a.n. ${r.holderName}` : ''}`

async function periksaKembar(tx: DbAtauTx, d: z.infer<typeof skemaRekening>, kecuali?: number) {
  const ada = await tx.bankAccount.findFirst({ where: { bankName: { equals: d.bankName, mode: 'insensitive' }, accountNo: d.accountNo, ...(kecuali ? { NOT: { id: kecuali } } : {}) } })
  if (ada) throw new GalatAturan('Rekening dengan bank dan nomor ini sudah ada.', 'accountNo')
}

export async function tambahRekening(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaRekening.parse(masukan)
  return db.$transaction(async (tx) => {
    // Kunci tabel ringan supaya dua tambah bersamaan dengan nomor sama tidak sama-sama lolos.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rekening'))`
    await periksaKembar(tx, d)
    const r = await tx.bankAccount.create({ data: { ...d, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'rekening.tambah', docType: 'bank_account', docId: r.id, summary: `Menambah rekening ${namaRekening(r)}`, after: d })
    return r
  })
}

export async function ubahRekening(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaRekening.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rekening'))`
    const r = await tx.bankAccount.findUnique({ where: { id } })
    if (!r) throw new GalatAturan('Rekening tidak ditemukan.')
    await periksaKembar(tx, d, id)
    const s = selisih({ bankName: r.bankName, accountNo: r.accountNo, holderName: r.holderName }, d)
    if (!s.berubah.length) return { r, berubah: 0 }
    const b = await tx.bankAccount.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'rekening.ubah', docType: 'bank_account', docId: id, summary: `Mengubah ${label(s.berubah)} rekening ${namaRekening(b)}`, before: s.sebelum, after: s.sesudah })
    return { r: b, berubah: s.berubah.length }
  })
}

export async function ubahStatusRekening(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const r = await tx.bankAccount.findUnique({ where: { id } })
    if (!r) throw new GalatAturan('Rekening tidak ditemukan.')
    if (r.active === aktif) return r
    const b = await tx.bankAccount.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'rekening.aktifkan' : 'rekening.nonaktifkan',
      docType: 'bank_account',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} rekening ${namaRekening(r)}`,
      before: { active: r.active },
      after: { active: aktif },
    })
    return b
  })
}

export type SaringRekening = { q?: string; status?: string; hal?: string }

export async function daftarRekening(db: Db, s: SaringRekening) {
  const q = s.q?.trim().slice(0, 40)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(q ? { OR: [{ bankName: { contains: q, mode: 'insensitive' as const } }, { accountNo: { contains: q.replace(/[\s.-]/g, '') } }, { holderName: { contains: q, mode: 'insensitive' as const } }] } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.bankAccount.findMany({ where, orderBy: [{ active: 'desc' }, { bankName: 'asc' }, { id: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN, include: { _count: { select: { posSettlements: true } } } }),
    db.bankAccount.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
