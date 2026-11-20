// Posisi stok per lokasi dan kartu stok per produk, dibaca dari stock_balance dan stock_ledger (tahap 4A).
// Hanya membaca. Tanpa impor Next.
import type { Db } from '../db'
import { PER_HALAMAN, sesuaiHalaman } from '../master'
import { des, type Desimal } from './angka'

// Halaman rincian per jenis dokumen asal. Jenis yang belum punya halaman ditampilkan tanpa tautan.
// Modul berikutnya (pembelian, produksi, kasir) menambah barisnya di sini.
export const TAUTAN_DOK: Record<string, { nama: string; jalur?: string }> = {
  stock_adjustment: { nama: 'Penyesuaian', jalur: '/penyesuaian' },
  stock_opname: { nama: 'Opname', jalur: '/opname' },
  stock_transfer: { nama: 'Pindah stok', jalur: '/pindah-stok' },
}

export const tautanDok = (docType: string, docId: number) => {
  const t = TAUTAN_DOK[docType]
  return { nama: t?.nama ?? docType, href: t?.jalur ? `${t.jalur}/${docId}` : null }
}

export type SaringPosisi = { lokasi?: string; q?: string; kategori?: string; bawah?: string; hal?: string }

type BarisPosisi = {
  product_id: number
  code: string
  name: string
  active: boolean
  min_stock: Desimal
  symbol: string
  location_id: number
  location_name: string
  qty: Desimal
  value: bigint
  avg_cost: Desimal
}

const angkaId = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null)

// Satu baris per produk per lokasi aktif. Produk nonaktif hanya muncul bila masih punya stok.
export async function daftarPosisi(db: Db, s: SaringPosisi) {
  const lokasi = angkaId(s.lokasi)
  const kategori = angkaId(s.kategori)
  const q = s.q?.trim().slice(0, 64) || null
  const pola = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
  const bawah = s.bawah === '1'
  const hal = sesuaiHalaman(s.hal)
  const lewati = (hal - 1) * PER_HALAMAN
  const [baris, [ringkas]] = await Promise.all([
    db.$queryRaw<BarisPosisi[]>`
      SELECT p.id AS product_id, p.code, p.name, p.active, p.min_stock, u.symbol, l.id AS location_id, l.name AS location_name,
             COALESCE(b.qty, 0) AS qty, COALESCE(b.value, 0)::bigint AS value, COALESCE(b.avg_cost, 0) AS avg_cost
      FROM product p JOIN unit u ON u.id = p.base_unit_id CROSS JOIN location l
      LEFT JOIN stock_balance b ON b.product_id = p.id AND b.location_id = l.id
      WHERE l.active AND (p.active OR COALESCE(b.qty, 0) <> 0)
        AND (${lokasi}::int IS NULL OR l.id = ${lokasi}::int) AND (${kategori}::int IS NULL OR p.category_id = ${kategori}::int)
        AND (${pola}::text IS NULL OR p.name ILIKE ${pola}::text OR p.code ILIKE ${pola}::text)
        AND (NOT ${bawah}::boolean OR COALESCE(b.qty, 0) < p.min_stock)
      ORDER BY l.id, p.name LIMIT ${PER_HALAMAN} OFFSET ${lewati}`,
    db.$queryRaw<{ n: bigint; nilai: bigint | null; kurang: bigint }[]>`
      SELECT count(*) AS n, sum(COALESCE(b.value, 0))::bigint AS nilai, count(*) FILTER (WHERE COALESCE(b.qty, 0) < p.min_stock) AS kurang
      FROM product p CROSS JOIN location l
      LEFT JOIN stock_balance b ON b.product_id = p.id AND b.location_id = l.id
      WHERE l.active AND (p.active OR COALESCE(b.qty, 0) <> 0)
        AND (${lokasi}::int IS NULL OR l.id = ${lokasi}::int) AND (${kategori}::int IS NULL OR p.category_id = ${kategori}::int)
        AND (${pola}::text IS NULL OR p.name ILIKE ${pola}::text OR p.code ILIKE ${pola}::text)
        AND (NOT ${bawah}::boolean OR COALESCE(b.qty, 0) < p.min_stock)`,
  ])
  const total = Number(ringkas.n)
  return {
    baris: baris.map((b) => ({ ...b, qty: des(b.qty), min_stock: des(b.min_stock), avg_cost: des(b.avg_cost), value: BigInt(b.value), bawahMinimum: des(b.qty).lt(des(b.min_stock)) })),
    total,
    nilai: BigInt(ringkas.nilai ?? 0),
    kurang: Number(ringkas.kurang),
    hal,
    jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)),
  }
}

export type SaringKartu = { produk?: string; lokasi?: string; dari?: string; sampai?: string; hal?: string }

const tanggal = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : null)

// Kartu stok satu produk, urut sesuai urutan gerak dicatat. Dengan lokasi terpilih, saldo awal periode ikut dihitung.
export async function kartuStok(db: Db, s: SaringKartu) {
  const produkId = angkaId(s.produk)
  if (!produkId) return null
  const produk = await db.product.findUnique({ where: { id: produkId }, include: { baseUnit: true, category: true } })
  if (!produk) return null
  const lokasi = angkaId(s.lokasi)
  const dari = tanggal(s.dari)
  const sampai = tanggal(s.sampai)
  const hal = sesuaiHalaman(s.hal)
  const where = {
    productId: produkId,
    ...(lokasi ? { locationId: lokasi } : {}),
    ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
  }
  const [baris, total, awal, masukKeluar] = await Promise.all([
    db.stockLedger.findMany({ where, include: { location: true }, orderBy: { id: 'asc' }, skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.stockLedger.count({ where }),
    lokasi && dari ? db.stockLedger.aggregate({ where: { productId: produkId, locationId: lokasi, date: { lt: dari } }, _sum: { qty: true, value: true } }) : null,
    db.stockLedger.groupBy({ by: ['isReversal'], where: { ...where }, _sum: { qty: true, value: true } }),
  ])
  const pengguna = await db.appUser.findMany({ where: { id: { in: [...new Set(baris.map((b) => b.createdBy).filter((x): x is number => x !== null))] } }, select: { id: true, username: true } })
  const nama = new Map(pengguna.map((u) => [u.id, u.username]))
  const saldo = lokasi ? await db.stockBalance.findUnique({ where: { productId_locationId: { productId: produkId, locationId: lokasi } } }) : null
  return {
    produk,
    baris: baris.map((b) => ({ ...b, oleh: b.createdBy ? (nama.get(b.createdBy) ?? `#${b.createdBy}`) : '-', tautan: tautanDok(b.docType, b.docId) })),
    awal: awal ? { qty: des(awal._sum.qty ?? 0), nilai: awal._sum.value ?? 0n } : null,
    gerakBersih: masukKeluar.reduce((n, g) => n.plus(des(g._sum.qty ?? 0)), des(0)),
    saldo: saldo ? { qty: des(saldo.qty), nilai: saldo.value, rata: des(saldo.avgCost) } : null,
    total,
    hal,
    jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)),
  }
}
