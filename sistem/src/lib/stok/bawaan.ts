// Isi bawaan persediaan (tahap 4A): satu cabang, dua lokasi (RANCANGAN prinsip 8 dan 11.2 butir 7), alasan
// penyesuaian, satuan dasar, dan aturan persetujuan dokumen stok (RANCANGAN 2.2). Aman dijalankan berulang: baris yang
// sudah ada (cocok menurut kode atau nama) tidak ditimpa. Tanpa impor Next.
import type { Db } from '../db'

export const CABANG_BAWAAN = { code: 'GB', name: 'Inside Greenbox' }

// Data ESB punya dua cabang (Head Office dan Outlet); keduanya menjadi lokasi stok dalam satu cabang.
export const LOKASI_BAWAAN = [
  { code: 'HO', name: 'Head Office', kind: 'gudang' },
  { code: 'OUTLET', name: 'Outlet', kind: 'outlet' },
] as const

export const KODE_SALDO_AWAL = 'saldo_awal'

export const ALASAN_BAWAAN: { code: string | null; name: string; appliesTo: string }[] = [
  { code: KODE_SALDO_AWAL, name: 'Saldo awal', appliesTo: 'sesuai' },
  { code: null, name: 'Rusak', appliesTo: 'semua' },
  { code: null, name: 'Kedaluwarsa', appliesTo: 'semua' },
  { code: null, name: 'Tumpah atau terbuang', appliesTo: 'semua' },
  { code: null, name: 'Selisih hitung', appliesTo: 'opname' },
  { code: null, name: 'Koreksi catatan', appliesTo: 'semua' },
]

export const SATUAN_BAWAAN = [
  { name: 'gram', symbol: 'g' },
  { name: 'mililiter', symbol: 'ml' },
  { name: 'pcs', symbol: 'pcs' },
  { name: 'iris', symbol: 'iris' },
  { name: 'butir', symbol: 'butir' },
  { name: 'kilogram', symbol: 'kg' },
  { name: 'liter', symbol: 'L' },
]

// Dokumen stok yang wajib lewat Diajukan sebelum Diposting. stock_adjustment hanya berlaku untuk penyesuaian yang
// punya baris tambah (KONTRAK 12.6).
export const ATURAN_SETUJU_STOK = ['stock_opname', 'stock_adjustment']

export async function isiBawaanStok(db: Db) {
  const cabang = (await db.branch.findUnique({ where: { code: CABANG_BAWAAN.code } })) ?? (await db.branch.create({ data: { code: CABANG_BAWAAN.code, name: CABANG_BAWAAN.name } }))
  let lokasiBaru = 0
  for (const l of LOKASI_BAWAAN) {
    const ada = await db.location.findFirst({ where: { OR: [{ code: l.code }, { name: { equals: l.name, mode: 'insensitive' } }] } })
    if (!ada) {
      await db.location.create({ data: { branchId: cabang.id, code: l.code, name: l.name, kind: l.kind } })
      lokasiBaru++
    } else if (ada.code !== l.code && /^L\d+$/.test(ada.code)) {
      // Lokasi dari seed kasir tahap 3B mendapat kode sementara L<id> saat migrasi 4A; samakan dengan kode bawaan.
      await db.location.update({ where: { id: ada.id }, data: { code: l.code } })
    }
  }
  let alasanBaru = 0
  for (const a of ALASAN_BAWAAN) {
    const ada = await db.stockReason.findFirst({ where: a.code ? { OR: [{ code: a.code }, { name: { equals: a.name, mode: 'insensitive' } }] } : { name: { equals: a.name, mode: 'insensitive' } } })
    if (!ada) {
      await db.stockReason.create({ data: a })
      alasanBaru++
    } else if (a.code && !ada.code) {
      await db.stockReason.update({ where: { id: ada.id }, data: { code: a.code } })
    }
  }
  let satuanBaru = 0
  for (const s of SATUAN_BAWAAN) {
    if (!(await db.unit.findFirst({ where: { name: { equals: s.name, mode: 'insensitive' } } }))) {
      await db.unit.create({ data: s })
      satuanBaru++
    }
  }
  await db.approvalRule.createMany({ data: ATURAN_SETUJU_STOK.map((docType) => ({ docType, requiresApproval: true })), skipDuplicates: true })
  return { lokasiBaru, alasanBaru, satuanBaru }
}
