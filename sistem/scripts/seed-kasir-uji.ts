// Data uji kasir untuk lokal dan e2e: beberapa menu, satu paket set, metode Tunai/QRIS/Debit, tingkat member, dan
// satu member. Diisi langsung ke tabel tanpa UI master. Aman dijalankan berulang dan sesudah impor:menu:
// kategori dan tingkat yang sudah ada dipakai, yang belum ada dibuat dulu (menu_item.category adalah kunci asing ke
// menu_category.code, KONTRAK 11 butir 8). Menu, paket, dan member uji dicari lewat nama atau nomor lalu diperbarui.
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { TINGKAT_BAWAAN } from '../src/lib/impor-menu'
import { tingkatUntuk } from '../src/lib/member'
import { pastikanLokasiBawaan } from '../src/lib/seed-inti'
import { normalisasiWa } from '../src/lib/wa'

if (process.env.NODE_ENV === 'production') throw new Error('seed-kasir-uji hanya untuk lokal dan uji.')

const db = buatKlien()

// Kode dan nama sama dengan hasil impor:menu (kelompok di src/data.ts), jadi tidak ada kategori kembar.
const KATEGORI = [
  { code: 'espresso', name: 'Espresso based', sort: 10 },
  { code: 'noncoffee', name: 'Non-coffee', sort: 50 },
  { code: 'main', name: 'Makanan', sort: 80 },
  { code: 'snack', name: 'Snack', sort: 90 },
]

const MENU = [
  { name: 'Kopi Susu Greenbox', category: 'espresso', price: 28000n },
  { name: 'Americano', category: 'espresso', price: 22000n },
  { name: 'Matcha Susu', category: 'noncoffee', price: 32000n },
  { name: 'Teh Lemon', category: 'noncoffee', price: 18000n },
  { name: 'Croissant Mentega', category: 'snack', price: 25000n },
  { name: 'Nasi Goreng Kampung', category: 'main', price: 35000n },
  { name: 'Menu Lama Nonaktif', category: 'espresso', price: 10000n, active: false },
]

// Paket uji: Nasi Goreng Kampung + Americano, normal 57.000, harga paket 45.000.
const PAKET = { name: 'Sarapan Uji', main: 'Nasi Goreng Kampung', drink: 'Americano', normalPrice: 57000n, price: 45000n }

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

  for (const c of KATEGORI) await db.menuCategory.upsert({ where: { code: c.code }, update: { active: true }, create: c })

  const idMenu = new Map<string, number>()
  for (const [i, m] of MENU.entries()) {
    const ada = await db.menuItem.findFirst({ where: { name: { equals: m.name, mode: 'insensitive' } } })
    const data = { name: m.name, category: m.category, price: m.price, active: m.active ?? true }
    const baris = ada ? await db.menuItem.update({ where: { id: ada.id }, data }) : await db.menuItem.create({ data: { ...data, sort: 900 + i } })
    idMenu.set(m.name, baris.id)
  }

  const paket = { name: PAKET.name, mainItemId: idMenu.get(PAKET.main)!, drinkItemId: idMenu.get(PAKET.drink)!, normalPrice: PAKET.normalPrice, price: PAKET.price, active: true }
  const adaPaket = await db.menuSet.findFirst({ where: { name: { equals: PAKET.name, mode: 'insensitive' } } })
  if (adaPaket) await db.menuSet.update({ where: { id: adaPaket.id }, data: paket })
  else await db.menuSet.create({ data: { ...paket, sort: 900 } })

  for (const m of METODE) {
    await db.paymentMethod.upsert({ where: { name: m.name }, update: { kind: m.kind, active: true }, create: { name: m.name, kind: m.kind, mdrPct: m.mdrPct ?? 0, openDrawer: m.openDrawer ?? false } })
  }
  // tahap 6C: metode yang dibuat di sini (tanpa seed) mendapat satu tarif MDR dari persennya. Tarif yang sudah ada,
  // misalnya bawaan seed, tidak diubah.
  for (const m of await db.paymentMethod.findMany({ where: { tarifMdr: { none: {} } } })) {
    await db.paymentMethodMdr.create({ data: { paymentMethodId: m.id, mdrPct: m.mdrPct, effectiveFrom: new Date('2026-10-01T00:00:00Z'), note: 'Tarif uji.' } })
  }

  // Tingkat "Greenbox Key" bawaan bila belum ada, dengan aturan lewati yang sama dengan impor:menu.
  for (const t of TINGKAT_BAWAAN) {
    const ada = await db.memberTier.findFirst({ where: { OR: [{ name: { equals: t.name, mode: 'insensitive' } }, { minVisits: t.minVisits, active: true }] } })
    if (!ada) await db.memberTier.create({ data: t })
  }

  // Member uji: 12 kunjungan, jadi House Key (potongan 10 persen) bila tingkat bawaan dipakai.
  const wa = normalisasiWa('0812-3456-7890')!
  const tingkat = await tingkatUntuk(db, 12)
  const lama = await db.member.findFirst({ where: { OR: [{ wa }, { wa: '081234567890' }] } })
  const data = { name: 'Member Uji', wa, visits: 12, discountOn: true, active: true, tierId: tingkat?.id ?? null }
  if (lama) await db.member.update({ where: { id: lama.id }, data })
  else await db.member.create({ data })

  console.log(`Data uji kasir siap: ${MENU.length} menu, 1 paket, ${METODE.length} metode bayar, 1 member (${tingkat?.name ?? 'tanpa tingkat'}).`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
