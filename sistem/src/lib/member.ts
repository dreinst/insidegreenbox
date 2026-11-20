// Modul Member dan Tingkat, "Greenbox Key" (tahap 3A). Izin memakai menu.member. Tanpa Next.
// Tingkat seorang member adalah tingkat aktif dengan syarat kunjungan tertinggi yang sudah ia penuhi.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, Tx } from './db'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { PER_HALAMAN, pesanUnik, sesuaiHalaman, skemaCentang, skemaPersen, skemaTeksOpsional, labelKolom } from './master'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'menu.member'
const TINGKAT = 'menu.tingkat'

// Nomor WhatsApp ke format 62: "0812-3456-0001", "+62 812 3456 0001", dan "812..." semuanya menjadi 62812...
// Hanya nomor seluler Indonesia (62 8xx, 11 sampai 14 angka) yang diterima. Hasil null berarti tidak sah.
export function normalisasiWa(masukan: string): string | null {
  let d = masukan.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = `62${d.slice(1)}`
  else if (d.startsWith('8')) d = `62${d}`
  return /^628\d{8,11}$/.test(d) ? d : null
}

// Tampilan nomor yang mudah dibaca: 62 812-3456-0001.
export function formatWa(wa: string) {
  const s = wa.replace(/^62/, '')
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
}

// ===== Tingkat =====

export const skemaTingkat = z.object({
  name: z.string().trim().min(2, 'Nama tingkat minimal 2 huruf.').max(40, 'Nama tingkat paling panjang 40 huruf.'),
  minVisits: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, 'Syarat kunjungan harus angka bulat, 0 atau lebih.')
    .transform(Number),
  discountPct: skemaPersen('Potongan', { max: 100 }),
  perk: skemaTeksOpsional('Keterangan', 160),
})

// Menghitung ulang tingkat semua member sesudah tingkat berubah, dalam satu pernyataan.
async function hitungUlangTingkat(tx: Tx) {
  await tx.$executeRaw`UPDATE member m SET tier_id = (SELECT t.id FROM member_tier t WHERE t.active AND t.min_visits <= m.visits ORDER BY t.min_visits DESC LIMIT 1) WHERE m.tier_id IS DISTINCT FROM (SELECT t.id FROM member_tier t WHERE t.active AND t.min_visits <= m.visits ORDER BY t.min_visits DESC LIMIT 1)`
}

export async function tingkatUntuk(tx: Db | Tx, kunjungan: number) {
  return tx.memberTier.findFirst({ where: { active: true, minVisits: { lte: kunjungan } }, orderBy: { minVisits: 'desc' } })
}

async function periksaTingkat(tx: Tx, d: z.infer<typeof skemaTingkat>, kecuali?: number) {
  const dasar = kecuali ? { NOT: { id: kecuali } } : {}
  if (await tx.memberTier.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...dasar } })) throw new GalatAturan('Nama tingkat sudah dipakai.', 'name')
  if (await tx.memberTier.findFirst({ where: { minVisits: d.minVisits, active: true, ...dasar } })) throw new GalatAturan(`Sudah ada tingkat aktif dengan syarat ${d.minVisits} kunjungan.`, 'minVisits')
}

export async function tambahTingkat(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, TINGKAT, 'T')
  const d = skemaTingkat.parse(masukan)
  return db.$transaction(async (tx) => {
    await periksaTingkat(tx, d)
    const t = await tx.memberTier.create({ data: { name: d.name, minVisits: d.minVisits, discountPct: d.discountPct, perk: d.perk } })
    await hitungUlangTingkat(tx)
    await catatAudit(tx, k, {
      action: 'tingkat.tambah',
      docType: 'member_tier',
      docId: t.id,
      summary: `Menambah tingkat ${t.name} (${t.minVisits} kunjungan, potongan ${t.discountPct.toString().replace('.', ',')}%)`,
      after: { name: t.name, minVisits: t.minVisits, discountPct: t.discountPct, perk: t.perk },
    })
    return t
  })
}

export async function ubahTingkat(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, TINGKAT, 'U')
  const d = skemaTingkat.parse(masukan)
  return db.$transaction(async (tx) => {
    const t = await tx.memberTier.findUnique({ where: { id } })
    if (!t) throw new GalatAturan('Tingkat tidak ditemukan.')
    if (t.active) await periksaTingkat(tx, d, id)
    else if (await tx.memberTier.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama tingkat sudah dipakai.', 'name')
    const s = selisih({ name: t.name, minVisits: t.minVisits, discountPct: t.discountPct.toString(), perk: t.perk }, { name: d.name, minVisits: d.minVisits, discountPct: Number(d.discountPct).toString(), perk: d.perk })
    if (!s.berubah.length) return { t, berubah: 0 }
    const b = await tx.memberTier.update({ where: { id }, data: { name: d.name, minVisits: d.minVisits, discountPct: d.discountPct, perk: d.perk } })
    await hitungUlangTingkat(tx)
    await catatAudit(tx, k, { action: 'tingkat.ubah', docType: 'member_tier', docId: id, summary: `Mengubah ${labelKolom(s.berubah)} tingkat ${b.name}`, before: s.sebelum, after: s.sesudah })
    return { t: b, berubah: s.berubah.length }
  })
}

export async function ubahStatusTingkat(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, TINGKAT, 'U')
  return db.$transaction(async (tx) => {
    const t = await tx.memberTier.findUnique({ where: { id } })
    if (!t) throw new GalatAturan('Tingkat tidak ditemukan.')
    if (t.active === aktif) return t
    if (aktif && (await tx.memberTier.findFirst({ where: { active: true, minVisits: t.minVisits, NOT: { id } } }))) {
      throw new GalatAturan(`Sudah ada tingkat aktif dengan syarat ${t.minVisits} kunjungan. Ubah syarat tingkat ini dulu.`)
    }
    const baru = await tx.memberTier.update({ where: { id }, data: { active: aktif } })
    await hitungUlangTingkat(tx)
    await catatAudit(tx, k, { action: aktif ? 'tingkat.aktifkan' : 'tingkat.nonaktifkan', docType: 'member_tier', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} tingkat ${t.name}`, before: { active: t.active }, after: { active: aktif } })
    return baru
  })
}

export async function daftarTingkat(db: Db) {
  const baris = await db.memberTier.findMany({ include: { _count: { select: { members: true } } }, orderBy: [{ active: 'desc' }, { minVisits: 'asc' }] })
  return baris
}

// ===== Member =====

export const skemaMember = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.'),
  wa: z.string().trim().min(1, 'Nomor WhatsApp wajib diisi.'),
  visits: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, 'Kunjungan harus angka bulat, 0 atau lebih.')
    .default('')
    .transform((v) => (v === '' ? 0 : Number(v))),
  discountOn: skemaCentang,
  note: skemaTeksOpsional('Catatan', 300),
})

function bacaWa(teks: string) {
  const wa = normalisasiWa(teks)
  if (!wa) throw new GalatAturan('Nomor WhatsApp tidak sah. Pakai nomor seluler Indonesia, misalnya 0812 3456 7890.', 'wa')
  return wa
}

async function waDipakai(tx: Tx, wa: string, kecuali?: number) {
  const ada = await tx.member.findFirst({ where: { wa, ...(kecuali ? { NOT: { id: kecuali } } : {}) } })
  if (ada) throw new GalatAturan(`Nomor WhatsApp ini sudah dipakai member ${ada.name}.`, 'wa')
}

export async function tambahMember(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaMember.parse(masukan)
  const wa = bacaWa(d.wa)
  try {
    return await db.$transaction(async (tx) => {
      await waDipakai(tx, wa)
      const tingkat = await tingkatUntuk(tx, d.visits)
      const m = await tx.member.create({ data: { name: d.name, wa, visits: d.visits, discountOn: d.discountOn, note: d.note, tierId: tingkat?.id ?? null, createdBy: aktor.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'member.tambah',
        docType: 'member',
        docId: m.id,
        summary: `Menambah member ${m.name} (${wa})${tingkat ? `, tingkat ${tingkat.name}` : ''}`,
        after: { name: m.name, wa: m.wa, visits: m.visits, discountOn: m.discountOn, tingkat: tingkat?.name ?? null },
      })
      return m
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nomor WhatsApp ini sudah dipakai member lain.', 'wa')
    throw e
  }
}

export async function ubahMember(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaMember.parse(masukan)
  const wa = bacaWa(d.wa)
  try {
    return await db.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id } })
      if (!m) throw new GalatAturan('Member tidak ditemukan.')
      await waDipakai(tx, wa, id)
      const tingkat = await tingkatUntuk(tx, d.visits)
      const s = selisih({ name: m.name, wa: m.wa, visits: m.visits, discountOn: m.discountOn, note: m.note }, { name: d.name, wa, visits: d.visits, discountOn: d.discountOn, note: d.note })
      if (!s.berubah.length) return { m, berubah: 0 }
      const b = await tx.member.update({ where: { id }, data: { name: d.name, wa, visits: d.visits, discountOn: d.discountOn, note: d.note, tierId: tingkat?.id ?? null, updatedBy: aktor.id } })
      await catatAudit(tx, k, { action: 'member.ubah', docType: 'member', docId: id, summary: `Mengubah ${labelKolom(s.berubah)} member ${b.name}`, before: s.sebelum, after: s.sesudah })
      return { m: b, berubah: s.berubah.length }
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nomor WhatsApp ini sudah dipakai member lain.', 'wa')
    throw e
  }
}

export async function ubahStatusMember(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const m = await tx.member.findUnique({ where: { id } })
    if (!m) throw new GalatAturan('Member tidak ditemukan.')
    if (m.active === aktif) return m
    const baru = await tx.member.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'member.aktifkan' : 'member.nonaktifkan', docType: 'member', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} member ${m.name}`, before: { active: m.active }, after: { active: aktif } })
    return baru
  })
}

export type SaringMember = { q?: string; tingkat?: string; status?: string; hal?: string }

export async function daftarMember(db: Db, s: SaringMember) {
  const q = s.q?.trim().slice(0, 64)
  const digit = q?.replace(/\D/g, '')
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const tierId = Number(s.tingkat) || undefined
  const hal = sesuaiHalaman(s.hal)
  // Pencarian angka dicocokkan ke nomor berformat 62, jadi "0812" menemukan 62812....
  const cariWa = digit && digit.length >= 3 ? (digit.startsWith('0') ? `62${digit.slice(1)}` : digit) : null
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, ...(cariWa ? [{ wa: { contains: cariWa } }] : [])] } : {}),
    ...(tierId ? { tierId } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.member.findMany({ where, include: { tier: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.member.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

// Potongan yang berlaku untuk member: 0 bila potongan dimatikan atau member nonaktif.
export const potonganMember = (m: { active: boolean; discountOn: boolean; tier: { discountPct: { toString(): string } } | null }) => (m.active && m.discountOn && m.tier ? Number(m.tier.discountPct.toString()) : 0)
