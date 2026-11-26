// Modul Promo (tahap 3A): diskon persen, diskon nominal, atau hadiah menu, dengan masa berlaku dan aktif/nonaktif.
// Izin memakai menu.promo. Tanpa Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import type { PromoKasir } from './hitung-kasir'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { PER_HALAMAN, formatRupiah, sesuaiHalaman, skemaPersen, skemaTanggal, skemaTeksOpsional, skemaUang, labelKolom } from './master'
import { tanggalIso } from './waktu'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const PROMO = 'menu.promo'

export const JENIS_PROMO = { persen: 'Diskon persen', nominal: 'Diskon nominal', hadiah: 'Hadiah menu' } as const
export type JenisPromo = keyof typeof JENIS_PROMO

export const skemaPromo = z
  .object({
    name: z.string().trim().min(3, 'Nama promo minimal 3 huruf.').max(80, 'Nama promo paling panjang 80 huruf.'),
    kind: z.enum(['persen', 'nominal', 'hadiah'], { message: 'Pilih jenis promo.' }),
    percent: z.string().default(''),
    amount: z.string().default(''),
    giftItemId: z.string().default(''),
    condition: skemaTeksOpsional('Syarat', 200),
    minSpend: skemaUang({ label: 'Belanja minimal', wajib: false, min: 0n }),
    startsOn: skemaTanggal('Tanggal mulai'),
    endsOn: skemaTanggal('Tanggal berakhir'),
  })
  .superRefine((d, ctx) => {
    if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Tanggal berakhir tidak boleh sebelum tanggal mulai.' })
  })

// Memisahkan isian jenis promo ke nilai yang disimpan. Isian jenis lain diabaikan.
function nilaiJenis(d: z.infer<typeof skemaPromo>) {
  if (d.kind === 'persen') {
    const h = skemaPersen('Persen diskon', { min: 0.001 }).safeParse(d.percent)
    if (!h.success) throw new GalatAturan(d.percent.trim() ? h.error.issues[0].message : 'Persen diskon wajib diisi.', 'percent')
    return { percent: h.data, amount: null, giftItemId: null }
  }
  if (d.kind === 'nominal') {
    const h = skemaUang({ label: 'Potongan' }).safeParse(d.amount)
    if (!h.success) throw new GalatAturan(h.error.issues[0].message, 'amount')
    return { percent: null, amount: h.data, giftItemId: null }
  }
  const id = Number(d.giftItemId)
  if (!Number.isInteger(id) || id <= 0) throw new GalatAturan('Pilih menu hadiahnya.', 'giftItemId')
  return { percent: null, amount: null, giftItemId: id }
}

const ringkasNilai = (n: ReturnType<typeof nilaiJenis>, namaHadiah?: string) => (n.percent ? `${n.percent.replace('.', ',')}%` : n.amount ? formatRupiah(n.amount) : `hadiah ${namaHadiah ?? ''}`.trim())

export async function tambahPromo(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, PROMO, 'T')
  const d = skemaPromo.parse(masukan)
  const n = nilaiJenis(d)
  return db.$transaction(async (tx) => {
    const hadiah = n.giftItemId ? await tx.menuItem.findUnique({ where: { id: n.giftItemId } }) : null
    if (n.giftItemId && !hadiah) throw new GalatAturan('Menu hadiah tidak ditemukan.', 'giftItemId')
    if (await tx.promo.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama promo sudah dipakai.', 'name')
    const p = await tx.promo.create({ data: { name: d.name, kind: d.kind, ...n, condition: d.condition, minSpend: d.minSpend, startsOn: d.startsOn, endsOn: d.endsOn, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'promo.tambah',
      docType: 'promo',
      docId: p.id,
      summary: `Menambah promo ${p.name} (${JENIS_PROMO[d.kind]} ${ringkasNilai(n, hadiah?.name)})`,
      after: { name: p.name, kind: p.kind, percent: p.percent, amount: p.amount, hadiah: hadiah?.name ?? null, minSpend: p.minSpend, startsOn: p.startsOn, endsOn: p.endsOn },
    })
    return p
  })
}

export async function ubahPromo(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, PROMO, 'U')
  const d = skemaPromo.parse(masukan)
  const n = nilaiJenis(d)
  return db.$transaction(async (tx) => {
    const p = await tx.promo.findUnique({ where: { id } })
    if (!p) throw new GalatAturan('Promo tidak ditemukan.')
    if (n.giftItemId && !(await tx.menuItem.findUnique({ where: { id: n.giftItemId } }))) throw new GalatAturan('Menu hadiah tidak ditemukan.', 'giftItemId')
    if (await tx.promo.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama promo sudah dipakai.', 'name')
    const baru = { name: d.name, kind: d.kind, ...n, condition: d.condition, minSpend: d.minSpend, startsOn: d.startsOn, endsOn: d.endsOn }
    const s = selisih(
      { name: p.name, kind: p.kind, percent: p.percent?.toString() ?? null, amount: p.amount, giftItemId: p.giftItemId, condition: p.condition, minSpend: p.minSpend, startsOn: p.startsOn, endsOn: p.endsOn },
      baru,
    )
    if (!s.berubah.length) return { p, berubah: 0 }
    const b = await tx.promo.update({ where: { id }, data: { ...baru, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'promo.ubah', docType: 'promo', docId: id, summary: `Mengubah ${labelKolom(s.berubah)} promo ${b.name}`, before: s.sebelum, after: s.sesudah })
    return { p: b, berubah: s.berubah.length }
  })
}

export async function ubahStatusPromo(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, PROMO, 'U')
  return db.$transaction(async (tx) => {
    const p = await tx.promo.findUnique({ where: { id } })
    if (!p) throw new GalatAturan('Promo tidak ditemukan.')
    if (p.active === aktif) return p
    const baru = await tx.promo.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'promo.aktifkan' : 'promo.nonaktifkan', docType: 'promo', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} promo ${p.name}`, before: { active: p.active }, after: { active: aktif } })
    return baru
  })
}

export type StatusPromo = 'berlaku' | 'belum' | 'berakhir' | 'nonaktif'

// Status promo pada hari ini (WIB). Kolom tanggal disimpan sebagai tanggal tanpa jam.
export function statusPromo(p: { active: boolean; startsOn: Date | null; endsOn: Date | null }, sekarang = new Date()): StatusPromo {
  if (!p.active) return 'nonaktif'
  const hariIni = tanggalIso(sekarang)
  if (p.startsOn && p.startsOn.toISOString().slice(0, 10) > hariIni) return 'belum'
  if (p.endsOn && p.endsOn.toISOString().slice(0, 10) < hariIni) return 'berakhir'
  return 'berlaku'
}

export const NAMA_STATUS_PROMO: Record<StatusPromo, { teks: string; warna: 'hijau' | 'abu' | 'merah' | 'kuning' }> = {
  berlaku: { teks: 'Berlaku', warna: 'hijau' },
  belum: { teks: 'Belum mulai', warna: 'kuning' },
  berakhir: { teks: 'Sudah berakhir', warna: 'merah' },
  nonaktif: { teks: 'Nonaktif', warna: 'abu' },
}

export type SaringPromo = { q?: string; status?: string; hal?: string }

export async function daftarPromo(db: Db, s: SaringPromo) {
  const q = s.q?.trim().slice(0, 64)
  const hal = sesuaiHalaman(s.hal)
  const hariIni = new Date(`${tanggalIso(new Date())}T00:00:00Z`)
  const status = ['berlaku', 'belum', 'berakhir', 'nonaktif'].includes(s.status ?? '') ? (s.status as StatusPromo) : undefined
  const waktu =
    status === 'berlaku'
      ? { active: true, AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: hariIni } }] }, { OR: [{ endsOn: null }, { endsOn: { gte: hariIni } }] }] }
      : status === 'belum'
        ? { active: true, startsOn: { gt: hariIni } }
        : status === 'berakhir'
          ? { active: true, endsOn: { lt: hariIni } }
          : status === 'nonaktif'
            ? { active: false }
            : {}
  const where = { ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}), ...waktu }
  const [baris, total] = await Promise.all([
    db.promo.findMany({ where, include: { giftItem: true }, orderBy: [{ active: 'desc' }, { startsOn: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.promo.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

// Promo yang berlaku pada tanggal itu (WIB) untuk layar kasir dan simpan penjualan (KONTRAK 11 butir 160): aktif dan
// tanggalnya masuk masa berlaku. Promo hadiah hanya ikut bila menu hadiahnya aktif dan kategorinya aktif, karena baris
// hadiah memakai menu itu. Paling banyak 50 promo, cukup untuk satu hari.
export async function promoBerlaku(db: DbAtauTx, sekarang = new Date()): Promise<PromoKasir[]> {
  const hari = new Date(`${tanggalIso(sekarang)}T00:00:00Z`)
  const baris = await db.promo.findMany({
    where: { active: true, AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: hari } }] }, { OR: [{ endsOn: null }, { endsOn: { gte: hari } }] }] },
    include: { giftItem: { select: { id: true, name: true, price: true, active: true, categoryRef: { select: { active: true } } } } },
    orderBy: { id: 'asc' },
    take: 50,
  })
  return baris.flatMap((p): PromoKasir[] => {
    if (p.kind !== 'persen' && p.kind !== 'nominal' && p.kind !== 'hadiah') return []
    const g = p.giftItem
    if (p.kind === 'hadiah' && !(g && g.active && g.categoryRef.active)) return []
    return [
      {
        id: p.id,
        nama: p.name,
        jenis: p.kind,
        persen: p.kind === 'persen' ? Number(p.percent ?? 0) : 0,
        nominal: p.kind === 'nominal' ? Number(p.amount ?? 0n) : 0,
        minBelanja: Number(p.minSpend),
        syarat: p.condition,
        hadiah: p.kind === 'hadiah' && g ? { menuItemId: g.id, nama: g.name, harga: Number(g.price) } : null,
      },
    ]
  })
}

export const nilaiPromoTeks =(p: { kind: string; percent: { toString(): string } | null; amount: bigint | null; giftItem: { name: string } | null }) =>
  p.kind === 'persen' ? `${(p.percent?.toString() ?? '0').replace('.', ',')}%` : p.kind === 'nominal' ? formatRupiah(p.amount ?? 0n) : `Gratis ${p.giftItem?.name ?? 'menu'}`
