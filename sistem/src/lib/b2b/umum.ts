// Pembantu bersama dokumen penjualan B2B (tahap 6A): pelanggan aktif, pilihan barang jual, harga khusus pelanggan, dan
// aturan saklar b2b.ubah_harga. Pola dokumen mengikuti pembelian (src/lib/beli). Tanpa impor Next.
import { GalatAturan, GalatSaklar } from '../aksi'
import type { DbAtauTx } from '../db'
import { saklarNyala } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman } from '../master'
import { des } from '../stok/angka'
import { STATUS_BELI, type Aktor } from '../beli/dokumen'
import type { DocStatus } from '@/generated/prisma/client'

export async function pelangganAktif(tx: DbAtauTx, customerId: number) {
  const c = await tx.customer.findUnique({ where: { id: customerId } })
  if (!c || !c.active) throw new GalatAturan('Pelanggan tidak ditemukan atau nonaktif.', 'customerId')
  return c
}

export const pilihanPelanggan = (db: DbAtauTx) => db.customer.findMany({ where: { active: true }, orderBy: { name: 'asc' } })

// Produk aktif yang boleh dijual: semua produk aktif (B2B menjual bahan, setengah jadi, atau barang jadi), dalam satuan
// dasar dan semua konversinya.
export async function pilihanBarangJual(db: DbAtauTx) {
  const produk = await db.product.findMany({
    where: { active: true },
    include: { baseUnit: true, productUnits: { include: { unit: true }, orderBy: { factorToBase: 'asc' } } },
    orderBy: { name: 'asc' },
    take: 2000,
  })
  return produk.flatMap((p) => [
    { nilai: `${p.id}:${p.baseUnitId}`, label: `${p.name} (${p.baseUnit.symbol})`, productId: p.id, unitId: p.baseUnitId },
    ...p.productUnits
      .filter((u) => u.unitId !== p.baseUnitId)
      .map((u) => ({
        nilai: `${p.id}:${u.unitId}`,
        label: `${p.name} (${u.unit.symbol}, 1 ${u.unit.symbol} = ${des(u.factorToBase).toString().replace('.', ',')} ${p.baseUnit.symbol})`,
        productId: p.id,
        unitId: u.unitId,
      })),
  ])
}

export async function produkJual(tx: DbAtauTx, productId: number) {
  const p = await tx.product.findUnique({ where: { id: productId }, include: { baseUnit: true } })
  if (!p || !p.active) throw new GalatAturan('Produk tidak ditemukan atau nonaktif.', 'item')
  return p
}

// Harga khusus pelanggan untuk produk dan satuan itu, atau null bila tidak ada di daftar harga.
export async function hargaKhusus(tx: DbAtauTx, customerId: number, productId: number, unitId: number) {
  const h = await tx.customerPrice.findUnique({ where: { customerId_productId_unitId: { customerId, productId, unitId } } })
  return h?.price ?? null
}

// Harga yang berbeda dari daftar harga pelanggan butuh saklar b2b.ubah_harga (RANCANGAN 8.3). Produk tanpa harga khusus
// bebas harga, karena Greenbox belum punya harga jual standar untuk produk.
export function periksaHargaJual(aktor: Aktor, nama: string, harga: bigint, daftar: bigint | null, kolom = 'price') {
  if (daftar !== null && harga !== daftar && !saklarNyala(aktor, 'b2b.ubah_harga')) {
    throw new GalatSaklar('b2b.ubah_harga', `Harga ${nama} harus sama dengan harga khusus pelanggan ${formatRupiah(daftar)}. Mengubahnya butuh saklar Ubah harga jual B2B.`, kolom)
  }
}

export type SaringJual = { status?: string; pelanggan?: string; dari?: string; sampai?: string; q?: string; hal?: string }

export function saringJual(s: SaringJual) {
  const status = (STATUS_BELI as readonly string[]).includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const pelanggan = s.pelanggan && /^\d+$/.test(s.pelanggan) ? Number(s.pelanggan) : undefined
  const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  const q = s.q?.trim().slice(0, 30)
  const hal = sesuaiHalaman(s.hal)
  return {
    hal,
    per: PER_HALAMAN,
    where: {
      ...(status ? { status } : {}),
      ...(pelanggan ? { customerId: pelanggan } : {}),
      ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
      ...(q ? { no: { contains: q.toUpperCase() } } : {}),
    },
  }
}
