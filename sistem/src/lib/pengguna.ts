// Modul Pengguna (KONTRAK 4.6 untuk pengaman). Tanpa Next, dipanggil aksi server dan tes.
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, Tx } from './db'
import { isOwner, pastikanIzin, type Pengguna } from './izin-inti'
import { cabutSemuaSesi } from './masuk'
import { BIAYA_BCRYPT } from './seed-inti'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'peran' | 'sesiId'>

const nama = z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.')
const namaPengguna = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Nama pengguna 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.')
const idPeran = z.coerce.number({ message: 'Pilih peran.' }).int().positive('Pilih peran.')
const sandi = z.string().min(8, 'Sandi minimal 8 karakter.').max(200, 'Sandi paling panjang 200 karakter.')

export const skemaPenggunaBaru = z
  .object({ name: nama, username: namaPengguna, roleId: idPeran, sandi, ulangiSandi: z.string() })
  .refine((d) => d.sandi === d.ulangiSandi, { path: ['ulangiSandi'], message: 'Ulangi sandi tidak sama dengan sandi.' })

export const skemaUbahPengguna = z.object({ name: nama, username: namaPengguna, roleId: idPeran })

export const skemaSandi = z
  .object({ sandi, ulangiSandi: z.string() })
  .refine((d) => d.sandi === d.ulangiSandi, { path: ['ulangiSandi'], message: 'Ulangi sandi tidak sama dengan sandi.' })

const idOwner = async (tx: Tx) => (await tx.role.findUniqueOrThrow({ where: { code: 'owner' } })).id

// Mengunci baris Owner aktif sampai transaksi selesai, supaya dua perubahan bersamaan tidak menghabiskan Owner.
async function jumlahOwnerAktif(tx: Tx) {
  const roleId = await idOwner(tx)
  const baris = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM app_user WHERE role_id = ${roleId} AND active FOR UPDATE`
  return baris.length
}

const pesanUnik = (e: unknown) => (e as { code?: string })?.code === 'P2002'

export async function tambahPengguna(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'atur.pengguna', 'T')
  const d = skemaPenggunaBaru.parse(masukan)
  const peran = await db.role.findUnique({ where: { id: d.roleId } })
  if (!peran || !peran.active) throw new GalatAturan('Peran tidak ditemukan atau sedang nonaktif.', 'roleId')
  if (peran.code === 'owner' && !isOwner(aktor)) throw new GalatAturan('Hanya Owner yang bisa memberi peran Owner.', 'roleId')
  if (await db.appUser.findUnique({ where: { username: d.username } })) throw new GalatAturan('Nama pengguna sudah dipakai.', 'username')
  const passwordHash = await bcrypt.hash(d.sandi, BIAYA_BCRYPT)
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.appUser.create({ data: { name: d.name, username: d.username, roleId: peran.id, passwordHash, createdBy: aktor.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'pengguna.tambah',
        docType: 'app_user',
        docId: u.id,
        summary: `Menambah ${peran.name} ${u.username} (${u.name})`,
        after: { name: u.name, username: u.username, role: peran.code, active: u.active },
      })
      return u
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama pengguna sudah dipakai.', 'username')
    throw e
  }
}

async function ambilTarget(tx: Db | Tx, aktor: Aktor, id: number) {
  const u = await tx.appUser.findUnique({ where: { id }, include: { role: true } })
  if (!u) throw new GalatAturan('Pengguna tidak ditemukan.')
  if (u.role.code === 'owner' && !isOwner(aktor)) throw new GalatAturan('Hanya Owner yang bisa mengubah pengguna berperan Owner.')
  return u
}

export async function ubahPengguna(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, 'atur.pengguna', 'U')
  const d = skemaUbahPengguna.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      const u = await ambilTarget(tx, aktor, id)
      const peranBaru = d.roleId === u.roleId ? u.role : await tx.role.findUnique({ where: { id: d.roleId } })
      if (!peranBaru || (!peranBaru.active && peranBaru.id !== u.roleId)) throw new GalatAturan('Peran tidak ditemukan atau sedang nonaktif.', 'roleId')
      if (peranBaru.id !== u.roleId) {
        if (u.id === aktor.id) throw new GalatAturan('Kamu tidak bisa mengganti peranmu sendiri.', 'roleId')
        if (peranBaru.code === 'owner' && !isOwner(aktor)) throw new GalatAturan('Hanya Owner yang bisa memberi peran Owner.', 'roleId')
        if (u.role.code === 'owner' && u.active && (await jumlahOwnerAktif(tx)) <= 1) {
          throw new GalatAturan('Ini Owner aktif terakhir, jadi perannya tidak bisa diganti.', 'roleId')
        }
      }
      if (d.username !== u.username && (await tx.appUser.findUnique({ where: { username: d.username } }))) {
        throw new GalatAturan('Nama pengguna sudah dipakai.', 'username')
      }
      const s = selisih({ name: u.name, username: u.username, role: u.role.code }, { name: d.name, username: d.username, role: peranBaru.code })
      if (!s.berubah.length) return { u, berubah: 0 }
      const baru = await tx.appUser.update({ where: { id }, data: { name: d.name, username: d.username, roleId: peranBaru.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'pengguna.ubah',
        docType: 'app_user',
        docId: id,
        summary: `Mengubah ${s.berubah.join(', ')} pengguna ${baru.username}`,
        before: s.sebelum,
        after: s.sesudah,
      })
      return { u: baru, berubah: s.berubah.length }
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama pengguna sudah dipakai.', 'username')
    throw e
  }
}

export async function aturUlangSandi(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, 'atur.pengguna', 'U')
  const d = skemaSandi.parse(masukan)
  const passwordHash = await bcrypt.hash(d.sandi, BIAYA_BCRYPT)
  return db.$transaction(async (tx) => {
    const u = await ambilTarget(tx, aktor, id)
    await tx.appUser.update({ where: { id }, data: { passwordHash, updatedBy: aktor.id } })
    // Semua sesi pengguna itu dicabut. Kalau mengatur sandi sendiri, sesi yang sedang dipakai tetap jalan.
    const dicabut =
      u.id === aktor.id
        ? await tx.userSession.updateMany({ where: { userId: id, revokedAt: null, NOT: { id: aktor.sesiId } }, data: { revokedAt: new Date() } })
        : await cabutSemuaSesi(tx, id)
    await catatAudit(tx, k, {
      action: 'pengguna.sandi',
      docType: 'app_user',
      docId: id,
      summary: `Mengatur ulang sandi ${u.username}, ${dicabut.count} sesi dicabut`,
      after: { sandi: 'diganti', sesiDicabut: dicabut.count },
    })
  })
}

export async function ubahStatusPengguna(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, 'atur.pengguna', 'U')
  if (!aktif && id === aktor.id) throw new GalatAturan('Kamu tidak bisa menonaktifkan dirimu sendiri.')
  return db.$transaction(async (tx) => {
    const u = await ambilTarget(tx, aktor, id)
    if (u.active === aktif) return u
    if (aktif && !u.role.active) throw new GalatAturan(`Peran ${u.role.name} sedang nonaktif. Aktifkan perannya dulu atau ganti peran pengguna ini.`)
    if (!aktif && u.role.code === 'owner' && (await jumlahOwnerAktif(tx)) <= 1) {
      throw new GalatAturan('Ini Owner aktif terakhir, jadi tidak bisa dinonaktifkan.')
    }
    const baru = await tx.appUser.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    const dicabut = aktif ? { count: 0 } : await cabutSemuaSesi(tx, id)
    await catatAudit(tx, k, {
      action: aktif ? 'pengguna.aktifkan' : 'pengguna.nonaktifkan',
      docType: 'app_user',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} ${u.username}${aktif ? '' : `, ${dicabut.count} sesi dicabut`}`,
      before: { active: u.active },
      after: { active: aktif },
    })
    return baru
  })
}

export const PER_HALAMAN = 50

export type SaringPengguna = { q?: string; peran?: string; status?: string; hal?: string }

export async function daftarPengguna(db: Db, s: SaringPengguna) {
  const q = s.q?.trim().slice(0, 64)
  const roleId = Number(s.peran) || undefined
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { username: { contains: q.toLowerCase() } }] } : {}),
    ...(roleId ? { roleId } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.appUser.findMany({ where, include: { role: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.appUser.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
