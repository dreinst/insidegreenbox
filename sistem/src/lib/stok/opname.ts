// Stock Opname (tahap 4A; RANCANGAN 4). Saat draf dibuat, qty sistem setiap produk aktif di lokasi (bisa disaring
// kategori) dibekukan. Hitungan fisik diisi di draf. Saat Diposting, selisih (qty fisik - qty sistem beku) menjadi gerak
// stok, sehingga gerak lain sesudah pembekuan tetap terhitung. Opname wajib disetujui (approval_rule). Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { NOL, bacaAngka, des, formatNilai, formatQty, type Desimal } from './angka'
import {
  BATAS_BARIS,
  DOK_STOK,
  aturanSetuju,
  hapusDraf,
  pastikanSalahSatu,
  periksaTanggal,
  saringDok,
  ubahStatusDok,
  type Aktor,
  type AksiStatus,
  type KaitDok,
  type KepalaDok,
  type SaringDok,
} from './dokumen'
import { catatGerak } from './mesin'

const JENIS = 'stock_opname' as const
const MENU = DOK_STOK[JENIS].menu

export const skemaKepalaOpname = z.object({
  locationId: z.string().regex(/^\d+$/, 'Pilih lokasi.').transform(Number),
  categoryId: z
    .string()
    .optional()
    .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null)),
  date: skemaTanggal('Tanggal').transform((v, ctx) => {
    if (!v) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
      return z.NEVER
    }
    return v
  }),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export async function buatOpname(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaOpname.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const l = await tx.location.findUnique({ where: { id: d.locationId } })
    if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
    const kat = d.categoryId ? await tx.productCategory.findUnique({ where: { id: d.categoryId } }) : null
    if (d.categoryId && (!kat || !kat.active)) throw new GalatAturan('Kategori tidak ditemukan atau nonaktif.', 'categoryId')
    const produk = await tx.product.findMany({ where: { active: true, ...(d.categoryId ? { categoryId: d.categoryId } : {}) }, orderBy: { name: 'asc' }, take: BATAS_BARIS + 1 })
    if (!produk.length) throw new GalatAturan('Tidak ada produk aktif untuk dihitung.', 'categoryId')
    if (produk.length > BATAS_BARIS) throw new GalatAturan(`Produk terlalu banyak untuk satu opname (lebih dari ${BATAS_BARIS}). Saring dengan kategori.`, 'categoryId')
    const saldo = await tx.stockBalance.findMany({ where: { locationId: d.locationId, productId: { in: produk.map((p) => p.id) } } })
    const peta = new Map(saldo.map((s) => [s.productId, s]))
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const beku = new Date()
    const dok = await tx.stockOpname.create({
      data: {
        no,
        locationId: d.locationId,
        categoryId: d.categoryId,
        date: d.date,
        note: d.note,
        frozenAt: beku,
        createdBy: aktor.id,
        updatedBy: aktor.id,
        stockOpnameLines: {
          create: produk.map((p) => ({ productId: p.id, systemQty: peta.get(p.id)?.qty ?? 0, unitCost: peta.get(p.id)?.avgCost ?? 0 })),
        },
      },
    })
    await catatAudit(tx, k, {
      action: 'opname.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf stock opname ${no} di ${l.name}${kat ? ` kategori ${kat.name}` : ''}, ${produk.length} produk dibekukan`,
      after: { no, lokasi: l.name, kategori: kat?.name ?? null, date: d.date, produk: produk.length },
    })
    return dok
  })
}

async function muatDraf(tx: Tx, idDok: number) {
  await tx.$executeRaw`SELECT id FROM stock_opname WHERE id = ${idDok} FOR UPDATE`
  const dok = await tx.stockOpname.findUnique({ where: { id: idDok } })
  if (!dok) throw new GalatAturan('Stock opname tidak ditemukan.')
  if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return dok
}

// Isian hitungan dari formulir: hitung_<idBaris> (kosong = belum dihitung) dan alasan_<idBaris>.
export function bacaHitungan(masukan: Record<string, unknown>) {
  const galat: Record<string, string> = {}
  const hasil = new Map<number, { counted: Desimal | null; reasonId: number | null }>()
  for (const [kunci, nilai] of Object.entries(masukan)) {
    const m = /^(hitung|alasan)_(\d+)$/.exec(kunci)
    if (!m || typeof nilai !== 'string') continue
    const idb = Number(m[2])
    const isi = hasil.get(idb) ?? { counted: null, reasonId: null }
    if (m[1] === 'hitung') {
      if (nilai.trim()) {
        const d = bacaAngka(nilai)
        if (!d || d.isNeg() || d.decimalPlaces() > 3) galat[kunci] = 'Qty fisik harus angka 0 atau lebih, paling banyak 3 desimal.'
        else isi.counted = d
      }
    } else if (/^\d+$/.test(nilai)) isi.reasonId = Number(nilai)
    hasil.set(idb, isi)
  }
  return { hasil, galat }
}

export async function simpanHitungan(db: Db, k: Konteks, aktor: Aktor, idDok: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const { hasil, galat } = bacaHitungan(masukan)
  const kunciGalat = Object.keys(galat)
  if (kunciGalat.length) throw new GalatAturan(kunciGalat.length === 1 ? galat[kunciGalat[0]] : `Ada ${kunciGalat.length} hitungan yang perlu diperbaiki.`, kunciGalat[0])
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const baris = await tx.stockOpnameLine.findMany({ where: { stockOpnameId: idDok }, include: { product: true } })
    const alasanSah = new Set((await tx.stockReason.findMany({ where: { active: true, code: null, appliesTo: { in: ['semua', 'opname'] } } })).map((a) => a.id))
    let berubah = 0
    const contoh: string[] = []
    for (const b of baris) {
      const isi = hasil.get(b.id)
      if (!isi) continue
      if (isi.reasonId !== null && !alasanSah.has(isi.reasonId) && isi.reasonId !== b.reasonId) throw new GalatAturan(`Alasan untuk ${b.product.name} tidak berlaku untuk opname.`, `alasan_${b.id}`)
      const lama = b.countedQty === null ? null : des(b.countedQty)
      const samaQty = (lama === null && isi.counted === null) || (lama !== null && isi.counted !== null && lama.eq(isi.counted))
      if (samaQty && isi.reasonId === b.reasonId) continue
      await tx.stockOpnameLine.update({ where: { id: b.id }, data: { countedQty: isi.counted, reasonId: isi.reasonId } })
      berubah++
      if (contoh.length < 5) contoh.push(`${b.product.code} ${isi.counted === null ? 'kosong' : formatQty(isi.counted)}`)
    }
    if (!berubah) return 0
    await tx.stockOpname.update({ where: { id: idDok }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'opname.hitung', docType: JENIS, docId: idDok, summary: `Menyimpan ${berubah} hitungan fisik ${dok.no}`, after: { berubah, contoh } })
    return berubah
  })
}

// Baris yang punya selisih: sudah dihitung dan qty fisik berbeda dari qty sistem beku.
const selisihBaris = (b: { systemQty: Desimal; countedQty: Desimal | null }) => (b.countedQty === null ? NOL : des(b.countedQty).minus(des(b.systemQty)))

async function periksaBaris(tx: Tx, idDok: number, wajibAlasan: boolean) {
  const baris = await tx.stockOpnameLine.findMany({ where: { stockOpnameId: idDok }, include: { product: true }, orderBy: { id: 'asc' } })
  if (!baris.some((b) => b.countedQty !== null)) throw new GalatAturan('Isi minimal satu hitungan fisik dulu.')
  const tanpaAlasan = baris.filter((b) => !selisihBaris(b).isZero() && b.reasonId === null)
  if (wajibAlasan && tanpaAlasan.length) {
    throw new GalatAturan(
      `Alasan wajib diisi untuk baris yang berselisih: ${tanpaAlasan
        .slice(0, 3)
        .map((b) => b.product.name)
        .join(', ')}${tanpaAlasan.length > 3 ? ', dan lainnya' : ''}.`,
    )
  }
  return baris
}

type KepalaOpname = KepalaDok & { locationId: number }

export const kaitOpname = (aktor: Aktor): KaitDok<KepalaOpname> => ({
  jenis: JENIS,
  muat: (tx, idDok) => tx.stockOpname.findUnique({ where: { id: idDok } }),
  simpan: (tx, idDok, data) => tx.stockOpname.update({ where: { id: idDok }, data }),
  butuhSetuju: (tx) => aturanSetuju(tx, JENIS),
  periksaAjukan: async (tx, d) => {
    await periksaBaris(tx, d.id, saklarNyala(aktor, 'stok.wajib_alasan'))
  },
  posting: async (tx, d, asal) => {
    const baris = await periksaBaris(tx, d.id, saklarNyala(aktor, 'stok.wajib_alasan'))
    const gerak = baris.filter((b) => !selisihBaris(b).isZero())
    const hasil = await catatGerak(
      tx,
      asal,
      gerak.map((b) => ({ productId: b.productId, locationId: d.locationId, qty: selisihBaris(b), lineId: b.id })),
    )
    for (const h of hasil) await tx.stockOpnameLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
    const bersih = hasil.reduce((n, h) => n + h.nilai, 0n)
    const dihitung = baris.filter((b) => b.countedQty !== null).length
    return { ringkas: `${dihitung} produk dihitung, ${hasil.length} berselisih, nilai selisih ${formatNilai(bersih)}`, sesudah: { dihitung, berselisih: hasil.length, nilaiSelisih: bersih } }
  },
})

export const ubahStatusOpname = (db: Db, k: Konteks, aktor: Aktor, idDok: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) => ubahStatusDok(db, k, aktor, kaitOpname(aktor), idDok, aksi, opsi)

export const hapusOpname = (db: Db, k: Konteks, aktor: Aktor, idDok: number) =>
  hapusDraf(db, k, aktor, JENIS, idDok, async (tx) => {
    const d = await tx.stockOpname.findUnique({ where: { id: idDok } })
    if (!d || d.status !== 'Draft') return null
    await tx.stockOpname.delete({ where: { id: idDok } })
    return d
  })

export const muatOpname = (db: Db, idDok: number) =>
  db.stockOpname.findUnique({
    where: { id: idDok },
    include: { location: true, category: true, stockOpnameLines: { include: { product: { include: { baseUnit: true } }, reason: true }, orderBy: [{ product: { name: 'asc' } }] } },
  })

// Gerak stok di lokasi opname sesudah dibekukan, per produk (untuk informasi di layar).
export async function gerakSesudahBeku(db: Db, locationId: number, frozenAt: Date | null, docId: number) {
  if (!frozenAt) return new Map<number, Desimal>()
  const baris = await db.stockLedger.groupBy({
    by: ['productId'],
    where: { locationId, at: { gt: frozenAt }, NOT: { docType: JENIS, docId } },
    _sum: { qty: true },
  })
  return new Map(baris.map((b) => [b.productId, des(b._sum.qty ?? 0)]))
}

export async function daftarOpname(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { locationId: lokasi } : {}) }
  const [baris, total] = await Promise.all([
    db.stockOpname.findMany({
      where,
      include: { location: true, category: true, _count: { select: { stockOpnameLines: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.stockOpname.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export { selisihBaris }
