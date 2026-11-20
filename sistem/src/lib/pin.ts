// PIN kasir (tahap 3B): atur PIN, masuk dengan PIN, dan PIN penyetuju void. Tanpa Next, jadi bisa dites.
// Rate limit memakai login_attempt dengan kunci "pin:<nama pengguna>", batasnya sama dengan login sandi
// (KONTRAK 7): 5 gagal per nama dalam 15 menit, 20 gagal per IP dalam 15 menit.
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import { isOwner, muatIzin, muatSaklar, pastikanIzin, punyaIzin, type PetaIzin, type Pengguna } from './izin-inti'
import { BATAS_GAGAL_NAMA, hitungGagal, PESAN_MASUK, type HasilMasuk } from './masuk'
import { BIAYA_BCRYPT } from './seed-inti'
import { UMUR_SESI_JAM } from './sesi-token'

export const skemaPin = z
  .object({ pin: z.string().regex(/^\d{4,6}$/, 'PIN berisi 4 sampai 6 angka.'), ulangiPin: z.string() })
  .refine((d) => d.pin === d.ulangiPin, { path: ['ulangiPin'], message: 'Ulangi PIN tidak sama dengan PIN.' })

export const kunciPin = (username: string) => `pin:${username}`

let hashTiruan: Promise<string> | null = null
const ambilHashTiruan = () => (hashTiruan ??= bcrypt.hash(randomBytes(8).toString('hex'), BIAYA_BCRYPT))

// Masuk dengan PIN hanya untuk peran yang tidak memegang menu Pengaturan apa pun (Owner dan Admin tetap memakai
// sandi, RANCANGAN 8.1), dan perannya harus bisa memakai layar kasir.
export const bolehMasukPin = (kodePeran: string, izin: PetaIzin) =>
  kodePeran !== 'owner' && punyaIzin(izin, 'kasir.layar', 'T') && !Object.keys(izin).some((m) => m.startsWith('atur.'))

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'peran' | 'sesiId'>

async function izinPeran(db: DbAtauTx, roleId: number, cache: Map<number, PetaIzin>) {
  if (!cache.has(roleId)) cache.set(roleId, await muatIzin(db, roleId))
  return cache.get(roleId)!
}

// Owner boleh mengatur PIN siapa saja. Pemegang kasir.pin lain hanya PIN dirinya sendiri dan PIN pengguna yang
// perannya boleh masuk dengan PIN, supaya PIN tidak bisa dipakai menyamar sebagai Admin lain.
export async function bolehAturPinUntuk(db: DbAtauTx, aktor: Aktor, target: { id: number; roleId: number; role: { code: string } }, cache = new Map<number, PetaIzin>()) {
  if (isOwner(aktor)) return true
  if (target.role.code === 'owner') return false
  if (target.id === aktor.id) return true
  return bolehMasukPin(target.role.code, await izinPeran(db, target.roleId, cache))
}

export async function daftarPinBisaDiatur(db: Db, aktor: Aktor) {
  const pengguna = await db.appUser.findMany({ where: { active: true }, include: { role: true }, orderBy: { name: 'asc' }, take: 500 })
  const cache = new Map<number, PetaIzin>()
  const hasil = []
  for (const u of pengguna) {
    if (await bolehAturPinUntuk(db, aktor, u, cache)) {
      hasil.push({ id: u.id, name: u.name, username: u.username, peran: u.role.name, adaPin: !!u.pinHash, masukPin: bolehMasukPin(u.role.code, await izinPeran(db, u.roleId, cache)) })
    }
  }
  return hasil
}

async function targetPin(db: DbAtauTx, aktor: Aktor, id: number) {
  const u = await db.appUser.findUnique({ where: { id }, include: { role: true } })
  if (!u || !u.active) throw new GalatAturan('Pengguna tidak ditemukan atau nonaktif.')
  if (!(await bolehAturPinUntuk(db, aktor, u))) throw new GalatAturan('Kamu tidak bisa mengatur PIN pengguna ini.')
  return u
}

// Menyimpan PIN baru. Sesi lain milik pengguna itu dicabut, sama seperti atur ulang sandi.
export async function aturPin(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.pin', 'U')
  const d = skemaPin.parse(masukan)
  const pinHash = await bcrypt.hash(d.pin, BIAYA_BCRYPT)
  return db.$transaction(async (tx) => {
    const u = await targetPin(tx, aktor, id)
    await tx.appUser.update({ where: { id }, data: { pinHash, updatedBy: aktor.id } })
    const dicabut = await tx.userSession.updateMany({ where: { userId: id, revokedAt: null, NOT: { id: aktor.sesiId } }, data: { revokedAt: new Date() } })
    await catatAudit(tx, k, {
      action: 'pengguna.pin',
      docType: 'app_user',
      docId: id,
      summary: `${u.pinHash ? 'Mengganti' : 'Memasang'} PIN ${u.username}, ${dicabut.count} sesi dicabut`,
      before: { adaPin: !!u.pinHash },
      after: { adaPin: true, sesiDicabut: dicabut.count },
    })
  })
}

export async function hapusPin(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, 'kasir.pin', 'U')
  return db.$transaction(async (tx) => {
    const u = await targetPin(tx, aktor, id)
    if (!u.pinHash) return
    await tx.appUser.update({ where: { id }, data: { pinHash: null, updatedBy: aktor.id } })
    const dicabut = await tx.userSession.updateMany({ where: { userId: id, revokedAt: null, NOT: { id: aktor.sesiId } }, data: { revokedAt: new Date() } })
    await catatAudit(tx, k, {
      action: 'pengguna.pin',
      docType: 'app_user',
      docId: id,
      summary: `Menghapus PIN ${u.username}, ${dicabut.count} sesi dicabut`,
      before: { adaPin: true },
      after: { adaPin: false, sesiDicabut: dicabut.count },
    })
  })
}

// Nama yang tampil di pilihan masuk dengan PIN: pengguna aktif berperan aktif yang punya PIN dan boleh masuk PIN.
export async function daftarMasukPin(db: Db) {
  const u = await db.appUser.findMany({ where: { active: true, pinHash: { not: null }, role: { active: true } }, include: { role: true }, orderBy: { name: 'asc' }, take: 200 })
  const cache = new Map<number, PetaIzin>()
  const hasil: { id: number; name: string }[] = []
  for (const x of u) if (bolehMasukPin(x.role.code, await izinPeran(db, x.roleId, cache))) hasil.push({ id: x.id, name: x.name })
  return hasil
}

type MasukanPin = { userId: number; pin: string; ip: string; userAgent: string }

// Memeriksa PIN dengan rate limit. Gagal dicatat di login_attempt dan audit di luar transaksi pemanggil, supaya
// tetap tersimpan walau tindakan yang meminta PIN dibatalkan.
async function periksaPin(db: Db, m: MasukanPin, tujuan: string) {
  const u = await db.appUser.findUnique({ where: { id: m.userId }, include: { role: true } })
  const kunci = kunciPin(u?.username ?? `#${m.userId}`)
  const k: Konteks = { userId: u?.id ?? null, actorName: u?.username ?? '(tidak dikenal)', ip: m.ip, userAgent: m.userAgent }
  const gagal = await hitungGagal(db, kunci, m.ip)
  if (gagal.terkunci) {
    await catatAudit(db, k, {
      action: 'masuk.terkunci',
      docType: 'app_user',
      docId: u?.id,
      summary: gagal.nama >= BATAS_GAGAL_NAMA ? `PIN ${u?.username ?? 'pengguna'} terkunci sementara (${tujuan})` : `Alamat IP terkunci sementara (${tujuan})`,
    })
    return { ok: false as const, alasan: 'terkunci' as const, u: null }
  }
  const pinSah = /^\d{4,6}$/.test(m.pin)
  const cocok = await bcrypt.compare(pinSah ? m.pin : 'x', u?.pinHash ?? (await ambilHashTiruan()))
  if (!u || !u.pinHash || !cocok) {
    await db.$transaction(async (tx) => {
      await tx.loginAttempt.create({ data: { username: kunci, ip: m.ip, success: false } })
      await catatAudit(tx, k, { action: 'masuk.gagal', docType: 'app_user', docId: u?.id, summary: `PIN salah (${tujuan})` })
    })
    return { ok: false as const, alasan: 'salah' as const, u: null }
  }
  return { ok: true as const, u, kunci }
}

export const PESAN_PIN: Record<'salah' | 'terkunci' | 'nonaktif', string> = {
  salah: 'Nama atau PIN salah.',
  terkunci: PESAN_MASUK.terkunci,
  nonaktif: PESAN_MASUK.nonaktif,
}

export async function cobaMasukPin(db: Db, m: MasukanPin): Promise<HasilMasuk> {
  const hasil = await periksaPin(db, m, 'masuk kasir')
  if (!hasil.ok) return { ok: false, alasan: hasil.alasan }
  const u = hasil.u
  const k: Konteks = { userId: u.id, actorName: u.username, ip: m.ip, userAgent: m.userAgent }
  if (!u.active || !u.role.active) {
    await catatAudit(db, k, { action: 'masuk.gagal', docType: 'app_user', docId: u.id, summary: u.active ? 'Masuk PIN: peran nonaktif' : 'Masuk PIN: akun nonaktif' })
    return { ok: false, alasan: 'nonaktif' }
  }
  if (!bolehMasukPin(u.role.code, await muatIzin(db, u.roleId))) {
    await catatAudit(db, k, { action: 'masuk.gagal', docType: 'app_user', docId: u.id, summary: `Masuk PIN ditolak: peran ${u.role.name} wajib memakai sandi` })
    return { ok: false, alasan: 'salah' }
  }
  const sesiId = randomBytes(32).toString('hex')
  const kedaluwarsa = new Date(Date.now() + UMUR_SESI_JAM * 3600_000)
  await db.$transaction(async (tx) => {
    await tx.loginAttempt.create({ data: { username: hasil.kunci, ip: m.ip, success: true } })
    await tx.userSession.create({ data: { id: sesiId, userId: u.id, expiresAt: kedaluwarsa, ip: m.ip, userAgent: m.userAgent.slice(0, 300) } })
    await tx.appUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })
    await catatAudit(tx, k, { action: 'kasir.masuk_pin', docType: 'app_user', docId: u.id, summary: `${u.name} masuk dengan PIN sebagai ${u.role.name}` })
  })
  return { ok: true, sesiId, kedaluwarsa, userId: u.id }
}

// Pengguna yang berhak menyetujui void lewat PIN: aktif, punya PIN, perannya aktif dan memegang Ubah di
// kasir.transaksi serta saklar pos.void.
async function berhakVoid(db: DbAtauTx, roleId: number) {
  const [izin, saklar] = await Promise.all([muatIzin(db, roleId), muatSaklar(db, roleId)])
  return punyaIzin(izin, 'kasir.transaksi', 'U') && saklar['pos.void']?.nyala === true
}

export async function daftarPenyetujuVoid(db: Db, kecuali?: number) {
  const u = await db.appUser.findMany({ where: { active: true, pinHash: { not: null }, role: { active: true }, ...(kecuali ? { NOT: { id: kecuali } } : {}) }, include: { role: true }, orderBy: { name: 'asc' }, take: 200 })
  const peran = new Map<number, boolean>()
  const hasil: { id: number; name: string; peran: string }[] = []
  for (const x of u) {
    if (!peran.has(x.roleId)) peran.set(x.roleId, await berhakVoid(db, x.roleId))
    if (peran.get(x.roleId)) hasil.push({ id: x.id, name: x.name, peran: x.role.name })
  }
  return hasil
}

export async function periksaPenyetujuVoid(db: Db, m: MasukanPin) {
  const calon = await db.appUser.findUnique({ where: { id: m.userId }, include: { role: true } })
  if (!calon || !calon.active || !calon.role.active || !calon.pinHash || !(await berhakVoid(db, calon.roleId))) {
    throw new GalatAturan('Pilih penyetuju yang berhak menyetujui void.', 'penyetujuId')
  }
  const hasil = await periksaPin(db, m, 'penyetuju void')
  if (!hasil.ok) throw new GalatAturan(hasil.alasan === 'terkunci' ? PESAN_MASUK.terkunci : 'PIN penyetuju salah.', 'pinPenyetuju')
  // PIN benar mengosongkan hitungan gagal untuk penyetuju itu, sama seperti masuk berhasil.
  await db.loginAttempt.create({ data: { username: hasil.kunci, ip: m.ip, success: true } })
  return { id: calon.id, name: calon.name, username: calon.username, roleCode: calon.role.code }
}
