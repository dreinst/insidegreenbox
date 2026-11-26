// Basis data PostgreSQL sementara untuk tes. Alamat server diambil dari TEST_DATABASE_URL (atau DATABASE_URL).
// Tiap berkas tes membuat basis data greenbox_uji_<acak>, memigrasinya, mengisi peran dan izin bawaan, lalu
// menghapusnya sesudah selesai. Basis data dev tidak pernah disentuh.
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import type { Konteks } from '../src/lib/audit'
import { buatKlien, type Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { muatIzin, muatSaklar } from '../src/lib/izin-inti'
import { isiPeranDanIzin, pastikanPengguna } from '../src/lib/seed-inti'
import { PERAN_SISTEM, type KodePeranSistem } from '../src/lib/katalog'

export async function siapkanDbUji(awalan: string) {
  const dasar = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!dasar?.startsWith('postgres')) throw new Error('Tes butuh TEST_DATABASE_URL berupa alamat PostgreSQL (lihat .env.example).')
  const nama = `greenbox_uji_${awalan}_${randomBytes(4).toString('hex')}`
  const alamat = (d: string) => {
    const u = new URL(dasar)
    u.pathname = `/${d}`
    return u.toString()
  }
  const admin = async (q: string) => {
    const c = new pg.Client({ connectionString: alamat('postgres') })
    await c.connect()
    try {
      await c.query(q)
    } finally {
      await c.end()
    }
  }
  await admin(`CREATE DATABASE "${nama}"`)
  const url = alamat(nama)
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
  const db = buatKlien(url)
  await isiPeranDanIzin(db)
  return {
    db,
    url,
    hapus: async () => {
      await db.$disconnect()
      await admin(`DROP DATABASE IF EXISTS "${nama}" WITH (FORCE)`)
    },
  }
}

export const KONTEKS_UJI: Konteks = { userId: null, actorName: 'uji', ip: '10.0.0.1', userAgent: 'tes' }

// Membuat pengguna lalu mengembalikan objek Pengguna seperti hasil sesi, untuk dipakai sebagai aktor.
export async function buatAktor(db: Db, roleCode: KodePeranSistem | string, username: string): Promise<Pengguna> {
  if (PERAN_SISTEM.some((p) => p.kode === roleCode)) {
    await pastikanPengguna(db, { username, name: username, password: 'sandi-uji-123', roleCode: roleCode as KodePeranSistem })
  } else {
    const r = await db.role.findUniqueOrThrow({ where: { code: roleCode } })
    await db.appUser.create({ data: { username, name: username, passwordHash: 'x', roleId: r.id } })
  }
  return muatAktor(db, username)
}

export async function muatAktor(db: Db, username: string): Promise<Pengguna> {
  const u = await db.appUser.findUniqueOrThrow({ where: { username }, include: { role: true } })
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    sesiId: 'sesi-uji',
    peran: { id: u.role.id, code: u.role.code, name: u.role.name },
    izin: await muatIzin(db, u.roleId),
    saklar: await muatSaklar(db, u.roleId),
  }
}

export const k = (p: Pengguna): Konteks => ({ ...KONTEKS_UJI, userId: p.id, actorName: p.username })
