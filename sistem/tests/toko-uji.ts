// Data toko uji bersama untuk tes laporan dan setoran: pajak 10%, service 5%, dua kategori, empat menu, satu paket
// set, metode Tunai dan QRIS (MDR 0,7%), dan satu member berpotongan 10%. Juga pembantu untuk memindah waktu
// penjualan dan shift ke jam WIB tertentu.
import type { Db } from '../src/lib/db'
import { tanggalIso } from '../src/lib/waktu'

export async function siapkanToko(db: Db) {
  const cabang = await db.branch.findFirstOrThrow()
  await db.branch.update({ where: { id: cabang.id }, data: { taxPct: 10, servicePct: 5 } })
  await db.menuCategory.createMany({ data: [{ code: 'kopi', name: 'Kopi', sort: 10 }, { code: 'makan', name: 'Makanan', sort: 20 }] })
  const menu: Record<string, number> = {}
  for (const [n, c, p] of [
    ['Kopi Susu', 'kopi', 28000n],
    ['Americano', 'kopi', 22000n],
    ['Croissant', 'makan', 25000n],
    ['Nasi Goreng', 'makan', 35000n],
  ] as const) {
    menu[n] = (await db.menuItem.create({ data: { name: n, category: c, price: p } })).id
  }
  const paket = (await db.menuSet.create({ data: { name: 'Sarapan', mainItemId: menu['Nasi Goreng'], drinkItemId: menu.Americano, normalPrice: 57000n, price: 45000n } })).id
  const metode = {
    Tunai: (await db.paymentMethod.create({ data: { name: 'Tunai', kind: 'tunai' } })).id,
    QRIS: (await db.paymentMethod.create({ data: { name: 'QRIS', kind: 'qris', mdrPct: 0.7 } })).id,
  }
  await db.memberTier.create({ data: { name: 'Sahabat', minVisits: 0, discountPct: 10 } })
  const member = (await db.member.create({ data: { name: 'Budi', wa: '6281234567890', visits: 3, discountOn: true } })).id
  return { menu, paket, metode, member }
}

// Tanggal WIB n hari dari hari ini (negatif berarti mundur).
export const hariKe = (n: number) => tanggalIso(new Date(Date.now() + n * 86_400_000))

// Memindah waktu buka shift atau waktu penjualan ke jam WIB tertentu, misalnya pindahShift(db, 3, '2026-11-18', '23:30').
export const waktuWib = (iso: string, jam: string) => new Date(`${iso}T${jam}:00+07:00`)
export const pindahShift = (db: Db, id: number, iso: string, jam: string) => db.shift.update({ where: { id }, data: { openedAt: waktuWib(iso, jam) } })
export const pindahJual = (db: Db, id: number, iso: string, jam: string) => db.sale.update({ where: { id }, data: { at: waktuWib(iso, jam) } })
