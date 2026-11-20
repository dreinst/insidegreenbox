// Isi bawaan yang dipakai prisma/seed.ts dan tes. Aman dijalankan berulang: baris yang sudah ada tidak ditimpa,
// sehingga matriks dan saklar yang sudah diatur Owner tidak kembali ke bawaan.
import bcrypt from 'bcryptjs'
import { catatAudit } from './audit'
import type { Db } from './db'
import { KOLOM_AKSI, MENU_IZIN, PERAN_SISTEM, SAKLAR, type Aksi, type KodePeranSistem } from './katalog'

export const BIAYA_BCRYPT = 12

export function barisIzin(aksi: string) {
  const baris: Record<string, boolean> = {}
  for (const [a, kolom] of Object.entries(KOLOM_AKSI)) baris[kolom] = aksi.includes(a as Aksi)
  return baris as Record<(typeof KOLOM_AKSI)[Aksi], boolean>
}

export async function isiPeranDanIzin(db: Db) {
  for (const p of PERAN_SISTEM) {
    await db.role.upsert({ where: { code: p.kode }, update: { isSystem: true }, create: { code: p.kode, name: p.nama, isSystem: true } })
  }
  const peran = await db.role.findMany({ where: { code: { in: PERAN_SISTEM.map((p) => p.kode) } } })
  const idPeran = new Map(peran.map((r) => [r.code as KodePeranSistem, r.id]))

  await db.rolePermission.createMany({
    data: PERAN_SISTEM.flatMap((p) => MENU_IZIN.map((m) => ({ roleId: idPeran.get(p.kode)!, menuCode: m.kode, ...barisIzin(m.bawaan[p.kode]) }))),
    skipDuplicates: true,
  })

  // Definisi saklar milik kode, jadi nama dan keterangannya diperbarui; nilai per peran tidak ditimpa.
  for (const [i, s] of SAKLAR.entries()) {
    const ket = s.satuan ? `${s.keterangan} Batas dalam ${s.satuan}.` : s.keterangan
    await db.featureSwitch.upsert({
      where: { code: s.kode },
      update: { name: s.nama, description: ket, hasLimit: !!s.satuan, sort: i + 1 },
      create: { code: s.kode, name: s.nama, description: ket, hasLimit: !!s.satuan, sort: i + 1 },
    })
  }
  const saklar = await db.featureSwitch.findMany()
  const idSaklar = new Map(saklar.map((s) => [s.code, s.id]))
  await db.roleFeatureSwitch.createMany({
    data: PERAN_SISTEM.flatMap((p) =>
      SAKLAR.map((s) => ({
        roleId: idPeran.get(p.kode)!,
        featureSwitchId: idSaklar.get(s.kode)!,
        enabled: s.bawaan[p.kode].nyala,
        limitValue: s.bawaan[p.kode].batas === null ? null : BigInt(s.bawaan[p.kode].batas!),
      })),
    ),
    skipDuplicates: true,
  })
  return idPeran
}

// Membuat pengguna bila nama penggunanya belum ada. Mengembalikan true bila baru dibuat.
export async function pastikanPengguna(db: Db, data: { username: string; name: string; password: string; roleCode: KodePeranSistem }, gantiSandi = false) {
  const username = data.username.trim().toLowerCase()
  const role = await db.role.findUniqueOrThrow({ where: { code: data.roleCode } })
  const ada = await db.appUser.findUnique({ where: { username } })
  if (ada) {
    if (gantiSandi) {
      await db.$transaction(async (tx) => {
        await tx.appUser.update({ where: { id: ada.id }, data: { passwordHash: await bcrypt.hash(data.password, BIAYA_BCRYPT), active: true, roleId: role.id } })
        await tx.userSession.updateMany({ where: { userId: ada.id, revokedAt: null }, data: { revokedAt: new Date() } })
        await catatAudit(tx, { userId: null, actorName: 'seed', ip: 'lokal', userAgent: 'seed' }, { action: 'pengguna.sandi', docType: 'app_user', docId: ada.id, summary: `Seed mengatur ulang sandi ${username}` })
      })
    }
    return false
  }
  await db.$transaction(async (tx) => {
    const u = await tx.appUser.create({ data: { username, name: data.name, passwordHash: await bcrypt.hash(data.password, BIAYA_BCRYPT), roleId: role.id } })
    await catatAudit(tx, { userId: null, actorName: 'seed', ip: 'lokal', userAgent: 'seed' }, {
      action: 'pengguna.tambah',
      docType: 'app_user',
      docId: u.id,
      summary: `Seed membuat ${role.name} ${username}`,
      after: { username, name: data.name, role: role.code, active: true },
    })
  })
  return true
}
