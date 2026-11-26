// Akun awal per peran sistem (KONTRAK 11 butir 161), dipakai scripts/akun-awal.ts dan tes. Tanpa Next.
// Hash sandi ditulis langsung tanpa validasi formulir, supaya pemilik bisa memasang sandi awal yang lebih pendek dari
// batas 8 karakter formulir. Sandi seperti itu wajib diganti lewat menu Pengguna sesudah masuk; batas formulir tetap 8.
import bcrypt from 'bcryptjs'
import { catatAudit, type Konteks } from './audit'
import type { Db } from './db'
import { KODE_SETARA_OWNER, setaraOwner, type KodePeranSistem } from './katalog'
import { cabutSemuaSesi } from './masuk'
import { BIAYA_BCRYPT } from './seed-inti'

export const SANDI_FORMULIR_MIN = 8

const KONTEKS: Konteks = { userId: null, actorName: 'akun-awal', ip: 'lokal', userAgent: 'scripts/akun-awal.ts' }

export type AkunAwal = { username: string; name: string; password: string; roleCode: KodePeranSistem }
export type HasilAkun = { hasil: 'dibuat' | 'diperbarui' | 'tetap'; perubahan: string[]; sandiPendek: boolean }

// Membuat pengguna bila belum ada. Bila sudah ada, sandi, peran, dan status aktifnya disamakan dengan masukan; nama
// tidak diubah. Menjalankan ulang dengan masukan yang sama tidak mengubah apa pun (sandi dicocokkan dengan bcrypt),
// jadi sesi yang sedang berjalan tidak dicabut tanpa perlu.
export async function pasangAkun(db: Db, d: AkunAwal): Promise<HasilAkun> {
  const username = d.username.trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error(`Nama pengguna ${d.roleCode} harus 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.`)
  if (!d.password || d.password.length > 200) throw new Error(`Sandi ${d.roleCode} kosong atau lebih dari 200 karakter.`)
  const sandiPendek = d.password.length < SANDI_FORMULIR_MIN
  const role = await db.role.findUnique({ where: { code: d.roleCode } })
  if (!role) throw new Error(`Peran ${d.roleCode} belum ada. Jalankan prisma migrate deploy dan prisma db seed dulu.`)
  if (!role.active) throw new Error(`Peran ${role.name} sedang nonaktif.`)

  const ada = await db.appUser.findUnique({ where: { username }, include: { role: true } })
  if (!ada) {
    const passwordHash = await bcrypt.hash(d.password, BIAYA_BCRYPT)
    await db.$transaction(async (tx) => {
      const u = await tx.appUser.create({ data: { username, name: d.name, passwordHash, roleId: role.id } })
      await catatAudit(tx, KONTEKS, {
        action: 'pengguna.tambah',
        docType: 'app_user',
        docId: u.id,
        summary: `Akun awal membuat ${role.name} ${username}`,
        after: { username, name: d.name, role: role.code, active: true },
      })
    })
    return { hasil: 'dibuat', perubahan: [], sandiPendek }
  }

  const gantiSandi = !(await bcrypt.compare(d.password, ada.passwordHash))
  const gantiPeran = ada.roleId !== role.id
  const aktifkan = !ada.active
  const perubahan = [...(gantiSandi ? ['sandi'] : []), ...(gantiPeran ? [`peran ${ada.role.name} menjadi ${role.name}`] : []), ...(aktifkan ? ['diaktifkan'] : [])]
  if (!perubahan.length) return { hasil: 'tetap', perubahan, sandiPendek }

  const passwordHash = gantiSandi ? await bcrypt.hash(d.password, BIAYA_BCRYPT) : ada.passwordHash
  await db.$transaction(async (tx) => {
    // Pengaman yang sama dengan menu Pengguna: pengguna Owner atau Superadmin aktif tidak boleh habis (KONTRAK 4.6).
    if (gantiPeran && setaraOwner(ada.role.code) && !setaraOwner(role.code) && ada.active) {
      const lain = await tx.$queryRaw<{ id: number }[]>`SELECT u.id FROM app_user u JOIN role r ON r.id = u.role_id
        WHERE r.code = ANY(${[...KODE_SETARA_OWNER]}::text[]) AND u.active AND u.id <> ${ada.id} ORDER BY u.id FOR UPDATE OF u`
      if (!lain.length) throw new Error(`${username} adalah pengguna aktif terakhir berperan Owner atau Superadmin, jadi perannya tidak diganti ke ${role.name}.`)
    }
    await tx.appUser.update({ where: { id: ada.id }, data: { passwordHash, roleId: role.id, active: true } })
    const dicabut = gantiSandi || gantiPeran ? await cabutSemuaSesi(tx, ada.id) : { count: 0 }
    if (gantiPeran) {
      await catatAudit(tx, KONTEKS, { action: 'pengguna.ubah', docType: 'app_user', docId: ada.id, summary: `Akun awal mengganti peran ${username}`, before: { role: ada.role.code }, after: { role: role.code } })
    }
    if (aktifkan) {
      await catatAudit(tx, KONTEKS, { action: 'pengguna.aktifkan', docType: 'app_user', docId: ada.id, summary: `Akun awal mengaktifkan ${username}`, before: { active: false }, after: { active: true } })
    }
    if (gantiSandi) {
      await catatAudit(tx, KONTEKS, {
        action: 'pengguna.sandi',
        docType: 'app_user',
        docId: ada.id,
        summary: `Akun awal mengatur ulang sandi ${username}, ${dicabut.count} sesi dicabut`,
        after: { sandiDiganti: true, sesiDicabut: dicabut.count, sandiPendek },
      })
    }
  })
  return { hasil: 'diperbarui', perubahan, sandiPendek }
}

// Nama variabel env per peran: SEED_<PERAN>_USERNAME, SEED_<PERAN>_PASSWORD, dan SEED_<PERAN>_NAME (boleh kosong).
export const PERAN_AKUN_AWAL: { kode: KodePeranSistem; env: string; nama: string }[] = [
  { kode: 'owner', env: 'OWNER', nama: 'Owner' },
  { kode: 'superadmin', env: 'SUPERADMIN', nama: 'Superadmin' },
  { kode: 'admin', env: 'ADMIN', nama: 'Admin' },
  { kode: 'kasir', env: 'KASIR', nama: 'Kasir' },
  { kode: 'finance', env: 'FINANCE', nama: 'Finance' },
]

// Daftar akun dari env. Peran tanpa nama pengguna dilewati; nama pengguna tanpa sandi dianggap salah isi.
export function akunDariEnv(env: Record<string, string | undefined>): AkunAwal[] {
  const hasil: AkunAwal[] = []
  for (const p of PERAN_AKUN_AWAL) {
    const username = env[`SEED_${p.env}_USERNAME`]?.trim()
    if (!username) continue
    const password = env[`SEED_${p.env}_PASSWORD`] ?? ''
    if (!password) throw new Error(`SEED_${p.env}_USERNAME terisi tetapi SEED_${p.env}_PASSWORD kosong.`)
    hasil.push({ username, password, name: env[`SEED_${p.env}_NAME`]?.trim() || p.nama, roleCode: p.kode })
  }
  return hasil
}
