// Modul Metode Bayar (tahap 3A). Akun kliring dan setoran dibiarkan kosong sampai akuntansi di tahap 5.
// Izin memakai akun.metode_bayar. Tanpa Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db } from './db'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { PER_HALAMAN, pesanUnik, sesuaiHalaman, skemaCentang, skemaPersen, labelKolom } from './master'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'akun.metode_bayar'

export const JENIS_METODE = { tunai: 'Tunai', qris: 'QRIS', debit: 'Debit', lainnya: 'Lainnya' } as const
export type JenisMetode = keyof typeof JENIS_METODE

export const skemaMetode = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(40, 'Nama paling panjang 40 huruf.'),
  kind: z.enum(['tunai', 'qris', 'debit', 'lainnya'], { message: 'Pilih jenis metode.' }),
  mdrPct: skemaPersen('MDR', { max: 20 }),
  openDrawer: skemaCentang,
})

function periksaMdr(d: z.infer<typeof skemaMetode>) {
  if (d.kind === 'tunai' && Number(d.mdrPct) !== 0) throw new GalatAturan('Metode tunai tidak punya MDR. Isi 0.', 'mdrPct')
}

export async function tambahMetode(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaMetode.parse(masukan)
  periksaMdr(d)
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.paymentMethod.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
      const m = await tx.paymentMethod.create({ data: { name: d.name, kind: d.kind, mdrPct: d.mdrPct, openDrawer: d.openDrawer } })
      await catatAudit(tx, k, {
        action: 'metode_bayar.tambah',
        docType: 'payment_method',
        docId: m.id,
        summary: `Menambah metode bayar ${m.name} (${JENIS_METODE[d.kind]}, MDR ${m.mdrPct.toString().replace('.', ',')}%)`,
        after: { name: m.name, kind: m.kind, mdrPct: m.mdrPct, openDrawer: m.openDrawer },
      })
      return m
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahMetode(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaMetode.parse(masukan)
  periksaMdr(d)
  try {
    return await db.$transaction(async (tx) => {
      const m = await tx.paymentMethod.findUnique({ where: { id } })
      if (!m) throw new GalatAturan('Metode bayar tidak ditemukan.')
      if (await tx.paymentMethod.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
      const s = selisih({ name: m.name, kind: m.kind, mdrPct: m.mdrPct.toString(), openDrawer: m.openDrawer }, { name: d.name, kind: d.kind, mdrPct: Number(d.mdrPct).toString(), openDrawer: d.openDrawer })
      if (!s.berubah.length) return { m, berubah: 0 }
      const b = await tx.paymentMethod.update({ where: { id }, data: { name: d.name, kind: d.kind, mdrPct: d.mdrPct, openDrawer: d.openDrawer } })
      await catatAudit(tx, k, { action: 'metode_bayar.ubah', docType: 'payment_method', docId: id, summary: `Mengubah ${labelKolom(s.berubah)} metode bayar ${b.name}`, before: s.sebelum, after: s.sesudah })
      return { m: b, berubah: s.berubah.length }
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahStatusMetode(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const m = await tx.paymentMethod.findUnique({ where: { id } })
    if (!m) throw new GalatAturan('Metode bayar tidak ditemukan.')
    if (m.active === aktif) return m
    if (!aktif && (await tx.paymentMethod.count({ where: { active: true, NOT: { id } } })) === 0) throw new GalatAturan('Ini satu-satunya metode bayar aktif. Kasir butuh minimal satu.')
    const baru = await tx.paymentMethod.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, { action: aktif ? 'metode_bayar.aktifkan' : 'metode_bayar.nonaktifkan', docType: 'payment_method', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} metode bayar ${m.name}`, before: { active: m.active }, after: { active: aktif } })
    return baru
  })
}

export type SaringMetode = { q?: string; jenis?: string; status?: string; hal?: string }

export async function daftarMetode(db: Db, s: SaringMetode) {
  const q = s.q?.trim().slice(0, 64)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const jenis = s.jenis && s.jenis in JENIS_METODE ? s.jenis : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = { ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}), ...(jenis ? { kind: jenis } : {}), ...(status ? { active: status === 'aktif' } : {}) }
  const [baris, total] = await Promise.all([
    db.paymentMethod.findMany({ where, orderBy: [{ active: 'desc' }, { id: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.paymentMethod.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
