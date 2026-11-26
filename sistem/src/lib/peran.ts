// Modul Peran dan Izin serta Saklar Fitur (KONTRAK 4). Tanpa Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, type Konteks } from './audit'
import type { Db } from './db'
import { hurufIzin, isOwner, pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from './izin-inti'
import { AKSI, MENU_IZIN, MENU_PER_KODE, MENU_TERKUNCI_OWNER, SAKLAR_TERKUNCI_OWNER, setaraOwner, type Aksi } from './katalog'
import { barisIzin } from './seed-inti'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'peran' | 'saklar'>

export const skemaPeranBaru = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,31}$/, 'Kode 2 sampai 32 karakter, diawali huruf kecil, lalu huruf kecil, angka, atau garis bawah.'),
  name: z.string().trim().min(2, 'Nama peran minimal 2 huruf.').max(60, 'Nama peran paling panjang 60 huruf.'),
  salinDari: z.coerce.number().int().nonnegative().optional(),
})

export const skemaUbahPeran = z.object({ name: z.string().trim().min(2, 'Nama peran minimal 2 huruf.').max(60, 'Nama peran paling panjang 60 huruf.') })

// Pengaman bersama untuk mengubah izin atau saklar sebuah peran. Owner dan Superadmin saling setara (KONTRAK 4.6).
function cekBolehAturPeran(aktor: Aktor, peran: { id: number; code: string }) {
  if (setaraOwner(peran.code) && !isOwner(aktor)) throw new GalatAturan('Hanya Owner atau Superadmin yang bisa mengubah peran Owner dan Superadmin.')
  if (peran.id === aktor.peran.id && !isOwner(aktor)) throw new GalatAturan('Kamu tidak bisa mengubah izin atau saklar peranmu sendiri.')
}

export async function tambahPeran(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'atur.peran', 'T')
  const d = skemaPeranBaru.parse(masukan)
  if (await db.role.findUnique({ where: { code: d.code } })) throw new GalatAturan('Kode peran sudah dipakai.', 'code')
  const sumber = d.salinDari ? await db.role.findUnique({ where: { id: d.salinDari }, include: { permissions: true, switches: true } }) : null
  if (d.salinDari && !sumber) throw new GalatAturan('Peran sumber tidak ditemukan.', 'salinDari')
  // Bukan Owner hanya boleh menyalin izin yang ia sendiri punya.
  if (sumber && !isOwner(aktor)) {
    for (const p of sumber.permissions) {
      const lebih = hurufIzin(p)
        .split('')
        .filter((h) => !punyaIzin(aktor.izin, p.menuCode, h as Aksi))
      if (lebih.length) throw new GalatAturan(`Peran ${sumber.name} punya izin yang tidak kamu miliki, jadi tidak bisa kamu salin.`, 'salinDari')
    }
  }
  return db.$transaction(async (tx) => {
    const r = await tx.role.create({ data: { code: d.code, name: d.name, createdBy: aktor.id, updatedBy: aktor.id } })
    const izinSumber = new Map(sumber?.permissions.map((p) => [p.menuCode, p]) ?? [])
    await tx.rolePermission.createMany({
      data: MENU_IZIN.map((m) => {
        const p = izinSumber.get(m.kode)
        return { roleId: r.id, menuCode: m.kode, ...barisIzin(p ? hurufIzin(p) : ''), updatedBy: aktor.id }
      }),
    })
    const saklar = await tx.featureSwitch.findMany()
    const saklarSumber = new Map(sumber?.switches.map((s) => [s.featureSwitchId, s]) ?? [])
    await tx.roleFeatureSwitch.createMany({
      data: saklar.map((s) => {
        const x = saklarSumber.get(s.id)
        const nyala = !!x?.enabled && (isOwner(aktor) || saklarNyala(aktor, s.code))
        return { roleId: r.id, featureSwitchId: s.id, enabled: nyala, limitValue: x?.limitValue ?? null, updatedBy: aktor.id }
      }),
    })
    await catatAudit(tx, k, {
      action: 'peran.tambah',
      docType: 'role',
      docId: r.id,
      summary: `Menambah peran ${r.name} (${r.code})${sumber ? `, izin disalin dari ${sumber.name}` : ''}`,
      after: { code: r.code, name: r.name, salinDari: sumber?.code ?? null },
    })
    return r
  })
}

export async function ubahPeran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, 'atur.peran', 'U')
  const d = skemaUbahPeran.parse(masukan)
  return db.$transaction(async (tx) => {
    const r = await tx.role.findUnique({ where: { id } })
    if (!r) throw new GalatAturan('Peran tidak ditemukan.')
    if (setaraOwner(r.code) && !isOwner(aktor)) throw new GalatAturan('Hanya Owner atau Superadmin yang bisa mengubah peran Owner dan Superadmin.')
    if (r.name === d.name) return r
    const baru = await tx.role.update({ where: { id }, data: { name: d.name, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'peran.ubah', docType: 'role', docId: id, summary: `Mengganti nama peran ${r.name} menjadi ${d.name}`, before: { name: r.name }, after: { name: d.name } })
    return baru
  })
}

export async function ubahStatusPeran(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, 'atur.peran', 'U')
  return db.$transaction(async (tx) => {
    const r = await tx.role.findUnique({ where: { id } })
    if (!r) throw new GalatAturan('Peran tidak ditemukan.')
    if (r.active === aktif) return r
    if (r.isSystem) throw new GalatAturan('Peran sistem (Owner, Superadmin, Admin, Kasir, Finance) tidak bisa dinonaktifkan.')
    if (r.id === aktor.peran.id) throw new GalatAturan('Kamu tidak bisa menonaktifkan peranmu sendiri.')
    const baru = await tx.role.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    const pemakai = await tx.appUser.count({ where: { roleId: id, active: true } })
    await catatAudit(tx, k, {
      action: aktif ? 'peran.aktifkan' : 'peran.nonaktifkan',
      docType: 'role',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} peran ${r.name}${aktif ? '' : `; ${pemakai} pengguna aktif tidak bisa masuk selama peran nonaktif`}`,
      before: { active: r.active },
      after: { active: aktif },
    })
    return baru
  })
}

// Matriks dari formulir: { kodeMenu: 'LTU' }. Aksi yang tidak berlaku untuk menu itu dibuang.
export function matriksDariForm(fd: FormData) {
  const m: Record<string, string> = {}
  for (const menu of MENU_IZIN) {
    m[menu.kode] = AKSI.filter((a) => menu.aksi.includes(a) && fd.get(`izin:${menu.kode}:${a}`) === '1').join('')
  }
  return m
}

export async function simpanIzinPeran(db: Db, k: Konteks, aktor: Aktor, id: number, matriks: Record<string, string>) {
  pastikanIzin(aktor, 'atur.peran', 'U')
  const r = await db.role.findUnique({ where: { id }, include: { permissions: true } })
  if (!r) throw new GalatAturan('Peran tidak ditemukan.')
  cekBolehAturPeran(aktor, r)

  const baru: Record<string, string> = {}
  for (const menu of MENU_IZIN) {
    baru[menu.kode] = AKSI.filter((a) => menu.aksi.includes(a) && (matriks[menu.kode] ?? '').includes(a)).join('')
  }
  if (setaraOwner(r.code)) {
    const kurang = MENU_TERKUNCI_OWNER.filter((m) => baru[m] !== MENU_PER_KODE.get(m)!.aksi)
    if (kurang.length) {
      throw new GalatAturan(`Peran ${r.name} harus tetap memegang semua izin ${kurang.map((m) => MENU_PER_KODE.get(m)!.nama).join(', ')}.`)
    }
  }
  const lama = new Map(r.permissions.map((p) => [p.menuCode, hurufIzin(p)]))
  const berubah = MENU_IZIN.filter((m) => (lama.get(m.kode) ?? '') !== baru[m.kode])
  if (!isOwner(aktor)) {
    for (const m of berubah) {
      const tambahan = baru[m.kode].split('').filter((h) => !(lama.get(m.kode) ?? '').includes(h))
      if (tambahan.some((h) => !punyaIzin(aktor.izin, m.kode, h as Aksi))) {
        throw new GalatAturan(`Kamu tidak bisa memberi izin ${m.nama} yang tidak kamu miliki.`)
      }
    }
  }
  if (!berubah.length) return 0
  await db.$transaction(async (tx) => {
    for (const m of berubah) {
      await tx.rolePermission.upsert({
        where: { roleId_menuCode: { roleId: id, menuCode: m.kode } },
        update: { ...barisIzin(baru[m.kode]), updatedBy: aktor.id },
        create: { roleId: id, menuCode: m.kode, ...barisIzin(baru[m.kode]), updatedBy: aktor.id },
      })
    }
    await catatAudit(tx, k, {
      action: 'peran.izin',
      docType: 'role_permission',
      docId: id,
      summary: `Mengubah izin peran ${r.name} di ${berubah.length} menu: ${berubah.map((m) => m.nama).join(', ')}`.slice(0, 500),
      before: Object.fromEntries(berubah.map((m) => [m.kode, lama.get(m.kode) ?? ''])),
      after: Object.fromEntries(berubah.map((m) => [m.kode, baru[m.kode]])),
    })
  })
  return berubah.length
}

export type NilaiSaklar = Record<string, { nyala: boolean; batas: number | null }>

export async function saklarDariForm(db: Db, fd: FormData): Promise<NilaiSaklar> {
  const semua = await db.featureSwitch.findMany()
  const nilai: NilaiSaklar = {}
  for (const s of semua) {
    let batas: number | null = null
    if (s.hasLimit) {
      const teks = String(fd.get(`batas:${s.code}`) ?? '').trim().replace(/\./g, '')
      if (teks !== '') {
        if (!/^\d{1,12}$/.test(teks)) throw new GalatAturan(`Batas ${s.name} harus angka bulat 0 atau lebih, atau dikosongkan.`, `batas:${s.code}`)
        batas = Number(teks)
      }
    }
    nilai[s.code] = { nyala: fd.get(`nyala:${s.code}`) === '1', batas }
  }
  return nilai
}

export async function simpanSaklarPeran(db: Db, k: Konteks, aktor: Aktor, id: number, nilai: NilaiSaklar) {
  pastikanIzin(aktor, 'atur.saklar', 'U')
  const r = await db.role.findUnique({ where: { id }, include: { switches: { include: { featureSwitch: true } } } })
  if (!r) throw new GalatAturan('Peran tidak ditemukan.')
  cekBolehAturPeran(aktor, r)
  if (setaraOwner(r.code)) {
    const mati = SAKLAR_TERKUNCI_OWNER.filter((kode) => nilai[kode] && !nilai[kode].nyala)
    if (mati.length) throw new GalatAturan(`Peran ${r.name} harus tetap bisa melihat semua jejak audit.`)
  }
  const semua = await db.featureSwitch.findMany()
  const lama = new Map(r.switches.map((s) => [s.featureSwitch.code, { nyala: s.enabled, batas: s.limitValue === null ? null : Number(s.limitValue) }]))
  const berubah = semua.filter((s) => {
    const a = lama.get(s.code) ?? { nyala: false, batas: null }
    const b = nilai[s.code]
    return b && (a.nyala !== b.nyala || (s.hasLimit && a.batas !== b.batas))
  })
  if (!isOwner(aktor)) {
    const lebih = berubah.find((s) => nilai[s.code].nyala && !lama.get(s.code)?.nyala && !saklarNyala(aktor, s.code))
    if (lebih) throw new GalatAturan(`Kamu tidak bisa menyalakan saklar ${lebih.name} yang tidak menyala untukmu.`)
  }
  if (!berubah.length) return 0
  await db.$transaction(async (tx) => {
    for (const s of berubah) {
      const b = nilai[s.code]
      const data = { enabled: b.nyala, limitValue: s.hasLimit ? (b.batas === null ? null : BigInt(b.batas)) : null, updatedBy: aktor.id }
      await tx.roleFeatureSwitch.upsert({
        where: { roleId_featureSwitchId: { roleId: id, featureSwitchId: s.id } },
        update: data,
        create: { roleId: id, featureSwitchId: s.id, ...data },
      })
    }
    await catatAudit(tx, k, {
      action: 'saklar.ubah',
      docType: 'role_feature_switch',
      docId: id,
      summary: `Mengubah ${berubah.length} saklar peran ${r.name}: ${berubah.map((s) => s.name).join(', ')}`.slice(0, 500),
      before: Object.fromEntries(berubah.map((s) => [s.code, lama.get(s.code) ?? null])),
      after: Object.fromEntries(berubah.map((s) => [s.code, { nyala: nilai[s.code].nyala, batas: s.hasLimit ? nilai[s.code].batas : null }])),
    })
  })
  return berubah.length
}
