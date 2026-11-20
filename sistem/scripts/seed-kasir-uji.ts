// Data uji kasir (tahap 3B) untuk lokal dan e2e: beberapa menu, metode Tunai/QRIS/Debit, dua tingkat member, dan
// satu member. Diisi langsung ke tabel yang sudah ada tanpa UI master (master menu dan metode bayar milik sesi A).
// Aman dijalankan berulang: baris dicari lewat nama dan diperbarui.
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { pastikanLokasiBawaan } from '../src/lib/seed-inti'

if (process.env.NODE_ENV === 'production') throw new Error('seed-kasir-uji hanya untuk lokal dan uji.')

const db = buatKlien()

const MENU = [
  { name: 'Kopi Susu Greenbox', category: 'Kopi', price: 28000n },
  { name: 'Americano', category: 'Kopi', price: 22000n },
  { name: 'Matcha Latte', category: 'Non kopi', price: 32000n },
  { name: 'Teh Lemon', category: 'Non kopi', price: 18000n },
  { name: 'Croissant Mentega', category: 'Makanan', price: 25000n },
  { name: 'Nasi Goreng Kampung', category: 'Makanan', price: 35000n },
  { name: 'Menu Lama Nonaktif', category: 'Kopi', price: 10000n, active: false },
]

const METODE = [
  { name: 'Tunai', kind: 'tunai', openDrawer: true },
  { name: 'QRIS', kind: 'qris', mdrPct: 0.7 },
  { name: 'Debit', kind: 'debit', mdrPct: 1 },
]

async function main() {
  await pastikanLokasiBawaan(db)
  // Pajak dan service dinyalakan di data uji supaya hitungannya ikut teruji (bawaan produksi 0 persen).
  const cabang = await db.branch.findFirstOrThrow({ orderBy: { id: 'asc' } })
  await db.branch.update({ where: { id: cabang.id }, data: { taxPct: 10, servicePct: 5, receiptHeader: 'Greenbox Coffee', receiptFooter: 'Terima kasih sudah mampir.' } })

  for (const m of MENU) {
    const ada = await db.menuItem.findFirst({ where: { name: m.name } })
    const data = { name: m.name, category: m.category, price: m.price, active: m.active ?? true }
    if (ada) await db.menuItem.update({ where: { id: ada.id }, data })
    else await db.menuItem.create({ data })
  }
  for (const m of METODE) {
    await db.paymentMethod.upsert({ where: { name: m.name }, update: { kind: m.kind, active: true }, create: { name: m.name, kind: m.kind, mdrPct: m.mdrPct ?? 0, openDrawer: m.openDrawer ?? false } })
  }
  const tingkat = [
    { name: 'Reguler', minVisits: 0, discountPct: 0 },
    { name: 'Sahabat', minVisits: 5, discountPct: 10 },
  ]
  for (const t of tingkat) {
    const ada = await db.memberTier.findFirst({ where: { name: t.name } })
    if (ada) await db.memberTier.update({ where: { id: ada.id }, data: t })
    else await db.memberTier.create({ data: t })
  }
  await db.member.upsert({
    where: { wa: '081234567890' },
    update: { name: 'Member Uji', visits: 6, discountOn: true, tierId: null },
    create: { name: 'Member Uji', wa: '081234567890', visits: 6, discountOn: true },
  })
  console.log(`Data uji kasir siap: ${MENU.length} menu, ${METODE.length} metode bayar, 1 member.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
