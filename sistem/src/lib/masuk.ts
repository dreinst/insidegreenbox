// Login, sesi di database, dan rate limit (KONTRAK 7). Tanpa Next, jadi bisa dites dengan basis data uji.
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import { muatIzin, muatSaklar, type Pengguna } from './izin-inti'
import { UMUR_SESI_JAM } from './sesi-token'

export const BATAS_GAGAL_NAMA = 5
export const BATAS_GAGAL_IP = 20
export const JENDELA_MENIT = 15

let hashTiruan: Promise<string> | null = null
// Hash untuk nama pengguna yang tidak dikenal, supaya waktu jawab sama dengan sandi salah.
const ambilHashTiruan = () => (hashTiruan ??= bcrypt.hash(randomBytes(16).toString('hex'), 12))

export type HasilMasuk =
  | { ok: true; sesiId: string; kedaluwarsa: Date; userId: number }
  | { ok: false; alasan: 'salah' | 'terkunci' | 'nonaktif' }

export const PESAN_MASUK: Record<'salah' | 'terkunci' | 'nonaktif', string> = {
  salah: 'Nama pengguna atau sandi salah.',
  terkunci: `Terlalu banyak percobaan gagal. Coba lagi dalam ${JENDELA_MENIT} menit.`,
  nonaktif: 'Akunmu sedang nonaktif. Hubungi Owner.',
}

export async function hitungGagal(db: DbAtauTx, username: string, ip: string, sekarang = new Date()) {
  const sejak = new Date(sekarang.getTime() - JENDELA_MENIT * 60_000)
  const berhasil = await db.loginAttempt.findFirst({ where: { username, success: true, at: { gte: sejak } }, orderBy: { at: 'desc' } })
  const [nama, alamat] = await Promise.all([
    db.loginAttempt.count({ where: { username, success: false, at: { gt: berhasil?.at ?? sejak } } }),
    db.loginAttempt.count({ where: { ip, success: false, at: { gte: sejak } } }),
  ])
  return { nama, alamat, terkunci: nama >= BATAS_GAGAL_NAMA || alamat >= BATAS_GAGAL_IP }
}

// Temuan audit A-5 (KONTRAK 7 dan 11 butir 135): percobaan dicatat lebih dulu sebagai gagal, sebelum sandi atau PIN
// diperiksa, di bawah kunci advisory per kunci nama lalu per IP (urutan tetap, jadi tidak saling mengunci silang).
// Permintaan bersamaan antre di kunci itu dan masing-masing melihat percobaan sebelumnya, jadi batas 5 per nama dan
// 20 per IP tidak bisa dilewati. Percobaan yang ternyata benar diubah menjadi berhasil lewat tandaiBerhasil.
export async function pesanPercobaan(db: Db, kunci: string, ip: string): Promise<{ id: number } | { terkunci: 'nama' | 'ip' }> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`masuk:${kunci}`}))`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`masuk-ip:${ip}`}))`
      const g = await hitungGagal(tx, kunci, ip)
      if (g.terkunci) return { terkunci: g.nama >= BATAS_GAGAL_NAMA ? ('nama' as const) : ('ip' as const) }
      const a = await tx.loginAttempt.create({ data: { username: kunci, ip, success: false }, select: { id: true } })
      return { id: a.id }
    },
    { maxWait: 10_000, timeout: 10_000 },
  )
}

export const tandaiBerhasil = (tx: DbAtauTx, id: number) => tx.loginAttempt.update({ where: { id }, data: { success: true, at: new Date() } })
// Sandi atau PIN benar tetapi akun tidak bisa masuk (nonaktif): bukan tebakan salah, jadi catatannya dibuang.
export const batalkanPercobaan = (tx: DbAtauTx, id: number) => tx.loginAttempt.deleteMany({ where: { id } })

export async function cobaMasuk(db: Db, masukan: { username: string; password: string; ip: string; userAgent: string }): Promise<HasilMasuk> {
  const username = masukan.username.trim().toLowerCase().slice(0, 64)
  const k: Konteks = { userId: null, actorName: username || '(kosong)', ip: masukan.ip, userAgent: masukan.userAgent }

  const percobaan = await pesanPercobaan(db, username, masukan.ip)
  const user = await db.appUser.findUnique({ where: { username }, include: { role: true } })
  if ('terkunci' in percobaan) {
    await catatAudit(db, { ...k, userId: user?.id ?? null }, {
      action: 'masuk.terkunci',
      docType: 'app_user',
      docId: user?.id,
      summary: percobaan.terkunci === 'nama' ? `Nama pengguna ${username} terkunci sementara` : 'Alamat IP terkunci sementara',
    })
    return { ok: false, alasan: 'terkunci' }
  }

  const cocok = await bcrypt.compare(masukan.password, user?.passwordHash ?? (await ambilHashTiruan()))
  if (!user || !cocok) {
    await catatAudit(db, { ...k, userId: user?.id ?? null }, {
      action: 'masuk.gagal',
      docType: 'app_user',
      docId: user?.id,
      summary: user ? 'Sandi salah' : 'Nama pengguna tidak dikenal',
    })
    return { ok: false, alasan: 'salah' }
  }
  if (!user.active || !user.role.active) {
    await batalkanPercobaan(db, percobaan.id)
    await catatAudit(db, { ...k, userId: user.id }, { action: 'masuk.gagal', docType: 'app_user', docId: user.id, summary: user.active ? 'Peran nonaktif' : 'Akun nonaktif' })
    return { ok: false, alasan: 'nonaktif' }
  }

  const sesiId = randomBytes(32).toString('hex')
  const kedaluwarsa = new Date(Date.now() + UMUR_SESI_JAM * 3600_000)
  await db.$transaction(async (tx) => {
    await tandaiBerhasil(tx, percobaan.id)
    await tx.userSession.create({ data: { id: sesiId, userId: user.id, expiresAt: kedaluwarsa, ip: masukan.ip, userAgent: masukan.userAgent.slice(0, 300) } })
    await tx.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await catatAudit(tx, { ...k, userId: user.id }, { action: 'masuk.berhasil', docType: 'app_user', docId: user.id, summary: `${user.name} masuk sebagai ${user.role.name}` })
  })
  return { ok: true, sesiId, kedaluwarsa, userId: user.id }
}

// Sesi sah bila belum dicabut, belum kedaluwarsa, pengguna aktif, dan peran aktif.
export async function muatPengguna(db: Db, sesiId: string): Promise<Pengguna | null> {
  const s = await db.userSession.findUnique({ where: { id: sesiId }, include: { user: { include: { role: true } } } })
  const sekarang = new Date()
  if (!s || s.revokedAt || s.expiresAt <= sekarang || !s.user.active || !s.user.role.active) return null
  // last_seen_at cukup diperbarui tiap 5 menit supaya tidak menulis di setiap permintaan.
  if (sekarang.getTime() - s.lastSeenAt.getTime() > 5 * 60_000) {
    await db.userSession.update({ where: { id: s.id }, data: { lastSeenAt: sekarang } })
  }
  const [izin, saklar] = await Promise.all([muatIzin(db, s.user.roleId), muatSaklar(db, s.user.roleId)])
  return {
    id: s.user.id,
    username: s.user.username,
    name: s.user.name,
    sesiId: s.id,
    peran: { id: s.user.role.id, code: s.user.role.code, name: s.user.role.name },
    izin,
    saklar,
  }
}

export async function keluar(db: Db, p: Pengguna, k: Konteks) {
  await db.$transaction(async (tx) => {
    await tx.userSession.updateMany({ where: { id: p.sesiId, revokedAt: null }, data: { revokedAt: new Date() } })
    await catatAudit(tx, k, { action: 'keluar', docType: 'app_user', docId: p.id, summary: `${p.name} keluar` })
  })
}

// Mencabut semua sesi seorang pengguna, misalnya saat dinonaktifkan atau sandinya diatur ulang.
export const cabutSemuaSesi = (tx: DbAtauTx, userId: number) => tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
