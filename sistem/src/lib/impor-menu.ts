// Pindah data menu dari admin lama (localStorage) ke database (tahap 3A, KONTRAK bagian 11).
// Sumbernya src/data.ts (menu situs) dan bawaan src/store.ts (tingkat, paket, foto, kalimat pendek). Isi store.ts
// tidak bisa diimpor dari Node karena menyentuh localStorage, jadi nilainya disalin ke sini. Fungsi di bawah
// idempoten: baris yang sudah ada (cocok menurut kode atau nama) dilewati dan tidak ditimpa, supaya perubahan yang
// sudah dibuat Owner di layar admin tidak hilang saat impor dijalankan lagi.
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'

type ItemMinuman = { name: string; price: string }
type ItemMakanan = { name: string; kcal: string; price: string; desc?: string }
type Kelompok<T> = { id: string; title: string; items: T[] }

export type DataImpor = {
  kategori: { code: string; name: string; sort: number }[]
  menu: { name: string; category: string; price: bigint; image: string | null; description: string; kcal: number | null; featured: boolean; sort: number }[]
  tingkat: { name: string; minVisits: number; discountPct: string; perk: string }[]
  paket: { name: string; main: string; drink: string; normalPrice: bigint; price: bigint; image: string | null; sort: number }[]
}

// Foto situs per nama menu (store.ts PHOTO).
export const FOTO_MENU: Record<string, string> = {
  'Coffee Cloud': 'p-coffee-cloud', 'Oolong Cloud': 'p-oolong-cloud', 'RTD Decaf': 'p-rtd-decaf', 'Sunset Soother': 'p-rtd-sunset',
  'Easy-Nasgor': 'c-easy-nasgor', 'Beef-Sando': 'c-beef-sando', 'Pad Kra Pao': 'c-pad-kra-pao', 'Real Potato Fries': 'c-fries',
  'RTD Classic': 'p-rtd-classic', 'RTD Fruity': 'p-rtd-fruity', 'Sunrise Booster': 'p-sunrise-booster',
  'Mont Blanc': 'p-mont-blanc', 'Dirty Latte': 'p-dirty-latte', 'Matcha Latte': 'p-matcha-latte',
  'Iced Shaken Honey Lemon Tea': 'p-iced-shaken-honey-lemon-tea',
  'Nanban Chicken With Rice': 'c-nanban-chicken-with-rice', 'Coffee Parfait': 'c-coffee-parfait', 'Sweet Waffle': 'c-sweet-waffle',
  'Salad With Pan-seared Chicken': 'c-salad-with-pan-seared-chicken', 'Sesame-Pasta': 'c-sesame-pasta',
  'Enoki Fries': 'c-enoki-fries', 'Soft-Panna': 'c-soft-panna',
  'Iced Black': 'p-iced-black', Latte: 'p-latte', Cappuccino: 'p-cappuccino', Piccolo: 'p-piccolo',
  'Red Box': 'p-red-box', '70% Chocolate': 'p-70-chocolate',
}

// Kalimat pendek menu unggulan (store.ts LINE). Menu yang ada di sini juga ditandai unggulan.
export const KALIMAT_MENU: Record<string, string> = {
  'Coffee Cloud': 'Kopi susu di bawah, awan di atas.',
  'Easy-Nasgor': 'Nasi goreng mentega plus telur. Beres.',
  'Beef-Sando': 'Roast beef, roti, plus fries.',
  'Oolong Cloud': 'Teh oolong dingin, awan yang sama.',
}

// Skema "Greenbox Key" usulan dari store.ts.
export const TINGKAT_BAWAAN: DataImpor['tingkat'] = [
  { name: 'Guest Key', minVisits: 0, discountPct: '5', perk: 'Langsung berlaku begitu daftar.' },
  { name: 'House Key', minVisits: 10, discountPct: '10', perk: 'Setelah 10 kunjungan.' },
  { name: 'Master Key', minVisits: 25, discountPct: '15', perk: 'Setelah 25 kunjungan.' },
]

// Early set dari store.ts. main dan drink menunjuk nama menu di data.ts.
export const PAKET_BAWAAN: { name: string; main: string; drink: string; image: string; normal: number; price: number }[] = [
  { name: 'Easy-Nasgor', main: 'Easy-Nasgor', drink: 'Iced Shaken Honey Lemon Tea', image: 'c-set-nasgor', normal: 63000, price: 40000 },
  { name: 'Salad Pan-seared Chicken', main: 'Salad With Pan-seared Chicken', drink: 'Iced Black', image: 'c-set-salad', normal: 65000, price: 50000 },
  { name: 'Beef-Sando', main: 'Beef-Sando', drink: 'Iced Shaken Mixed Berries Tea', image: 'c-set-beef', normal: 80000, price: 60000 },
]

export const METODE_BAWAAN = [
  { name: 'Tunai', kind: 'tunai', mdrPct: '0', openDrawer: true },
  { name: 'QRIS', kind: 'qris', mdrPct: '0', openDrawer: false },
  { name: 'Debit', kind: 'debit', mdrPct: '0', openDrawer: false },
] as const

// "38 K" jadi 38000 dan "35,5 K" jadi 35500.
export const rupiahDariK = (teks: string) => BigInt(Math.round(parseFloat(teks.replace(',', '.')) * 1000))

// "±640 kcal" jadi 640.
export const kaloriDari = (teks: string) => {
  const n = Number(teks.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Merakit DataImpor dari DRINKS dan FOODS di src/data.ts (diberikan oleh pemanggil, supaya berkas ini tidak
// mengimpor di luar folder sistem).
export function bangunDataImpor(minuman: Kelompok<ItemMinuman>[], makanan: Kelompok<ItemMakanan>[]): DataImpor {
  const kelompok = [...minuman, ...makanan]
  const kategori = kelompok.map((g, i) => ({ code: g.id, name: g.id === 'main' ? 'Makanan' : g.title, sort: (i + 1) * 10 }))
  let urut = 0
  const menu: DataImpor['menu'] = [
    ...minuman.flatMap((g) => g.items.map((d) => ({ g: g.id, name: d.name, price: d.price, kcal: null as number | null, desc: undefined as string | undefined }))),
    ...makanan.flatMap((g) => g.items.map((f) => ({ g: g.id, name: f.name, price: f.price, kcal: kaloriDari(f.kcal), desc: f.desc }))),
  ].map((p) => ({
    name: p.name,
    category: p.g,
    price: rupiahDariK(p.price),
    image: FOTO_MENU[p.name] ?? null,
    description: p.desc ?? KALIMAT_MENU[p.name] ?? '',
    kcal: p.kcal,
    featured: p.name in KALIMAT_MENU,
    sort: ++urut,
  }))
  const nama = new Map(menu.map((m) => [m.name, m]))
  const paket = PAKET_BAWAAN.map((p, i) => {
    if (!nama.has(p.main) || !nama.has(p.drink)) throw new Error(`Paket ${p.name}: menu ${!nama.has(p.main) ? p.main : p.drink} tidak ada di data menu.`)
    return { name: p.name, main: p.main, drink: p.drink, normalPrice: BigInt(p.normal), price: BigInt(p.price), image: p.image, sort: i + 1 }
  })
  return { kategori, menu, tingkat: TINGKAT_BAWAAN, paket }
}

// Metode bayar bawaan Tunai, QRIS, dan Debit. Yang sudah ada (menurut nama) dilewati.
export async function isiMetodeBayar(db: DbAtauTx) {
  const hasil = { baru: 0, dilewati: 0 }
  for (const m of METODE_BAWAAN) {
    if (await db.paymentMethod.findFirst({ where: { name: { equals: m.name, mode: 'insensitive' } } })) hasil.dilewati++
    else {
      await db.paymentMethod.create({ data: m })
      hasil.baru++
    }
  }
  return hasil
}

export type HasilImpor = Record<'kategori' | 'menu' | 'tingkat' | 'paket' | 'metode', { baru: number; dilewati: number }>

const ID_IMPOR: Konteks = { userId: null, actorName: 'impor', ip: 'lokal', userAgent: 'impor-menu' }

// Memasukkan data yang belum ada. Satu transaksi dan satu baris audit per jalan, sehingga gagal di tengah tidak
// meninggalkan setengah data.
export async function imporMenu(db: Db, data: DataImpor, k: Konteks = ID_IMPOR): Promise<HasilImpor> {
  return db.$transaction(
    async (tx) => {
      const hasil: HasilImpor = { kategori: { baru: 0, dilewati: 0 }, menu: { baru: 0, dilewati: 0 }, tingkat: { baru: 0, dilewati: 0 }, paket: { baru: 0, dilewati: 0 }, metode: { baru: 0, dilewati: 0 } }
      for (const c of data.kategori) {
        const ada = await tx.menuCategory.findUnique({ where: { code: c.code } })
        if (ada) hasil.kategori.dilewati++
        else {
          await tx.menuCategory.create({ data: { code: c.code, name: c.name, sort: c.sort } })
          hasil.kategori.baru++
        }
      }
      for (const m of data.menu) {
        if (await tx.menuItem.findFirst({ where: { name: { equals: m.name, mode: 'insensitive' } } })) {
          hasil.menu.dilewati++
          continue
        }
        if (!(await tx.menuCategory.findUnique({ where: { code: m.category } }))) throw new Error(`Menu ${m.name}: kategori ${m.category} tidak ada.`)
        await tx.menuItem.create({ data: { name: m.name, category: m.category, price: m.price, image: m.image, description: m.description, kcal: m.kcal, featured: m.featured, sort: m.sort } })
        hasil.menu.baru++
      }
      for (const t of data.tingkat) {
        const ada = await tx.memberTier.findFirst({ where: { OR: [{ name: { equals: t.name, mode: 'insensitive' } }, { minVisits: t.minVisits, active: true }] } })
        if (ada) hasil.tingkat.dilewati++
        else {
          await tx.memberTier.create({ data: t })
          hasil.tingkat.baru++
        }
      }
      for (const p of data.paket) {
        if (await tx.menuSet.findFirst({ where: { name: { equals: p.name, mode: 'insensitive' } } })) {
          hasil.paket.dilewati++
          continue
        }
        const [utama, minum] = await Promise.all([
          tx.menuItem.findFirst({ where: { name: { equals: p.main, mode: 'insensitive' } } }),
          tx.menuItem.findFirst({ where: { name: { equals: p.drink, mode: 'insensitive' } } }),
        ])
        if (!utama || !minum) throw new Error(`Paket ${p.name}: menu ${!utama ? p.main : p.drink} belum ada.`)
        await tx.menuSet.create({ data: { name: p.name, mainItemId: utama.id, drinkItemId: minum.id, normalPrice: p.normalPrice, price: p.price, image: p.image, sort: p.sort } })
        hasil.paket.baru++
      }
      hasil.metode = await isiMetodeBayar(tx)
      // Tingkat member disesuaikan dengan tingkat yang baru ada.
      await tx.$executeRaw`UPDATE member m SET tier_id = (SELECT t.id FROM member_tier t WHERE t.active AND t.min_visits <= m.visits ORDER BY t.min_visits DESC LIMIT 1) WHERE m.tier_id IS DISTINCT FROM (SELECT t.id FROM member_tier t WHERE t.active AND t.min_visits <= m.visits ORDER BY t.min_visits DESC LIMIT 1)`
      const baru = Object.values(hasil).reduce((n, h) => n + h.baru, 0)
      if (baru > 0) {
        await catatAudit(tx, k, {
          action: 'impor.menu',
          docType: 'menu_item',
          summary: `Impor data menu: ${hasil.kategori.baru} kategori, ${hasil.menu.baru} menu, ${hasil.tingkat.baru} tingkat, ${hasil.paket.baru} paket, ${hasil.metode.baru} metode bayar baru`,
          after: hasil,
        })
      }
      return hasil
    },
    { timeout: 60_000 },
  )
}

// Member contoh dari admin lama (store.ts), hanya untuk lokal dan uji. Nomor sudah berformat lokal 08.
export const MEMBER_CONTOH = [
  { name: 'Raka Pradana', wa: '081234560001', visits: 27, discountOn: true, note: '' },
  { name: 'Salsa Maharani', wa: '081234560002', visits: 12, discountOn: true, note: '' },
  { name: 'Dimas Aryo', wa: '081234560003', visits: 4, discountOn: false, note: 'Karyawan, sudah dapat harga staf.' },
  { name: 'Nadia Putri', wa: '081234560004', visits: 1, discountOn: true, note: '' },
]

// Menambah member contoh yang nomornya belum ada. Tingkat dihitung dari kunjungan. Mengembalikan jumlah yang baru.
export async function isiMemberContoh(db: Db, normalisasi: (wa: string) => string | null) {
  let baru = 0
  for (const m of MEMBER_CONTOH) {
    const wa = normalisasi(m.wa)
    if (!wa) throw new Error(`Nomor contoh ${m.wa} tidak sah.`)
    if (await db.member.findUnique({ where: { wa } })) continue
    const tingkat = await db.memberTier.findFirst({ where: { active: true, minVisits: { lte: m.visits } }, orderBy: { minVisits: 'desc' } })
    await db.member.create({ data: { name: m.name, wa, visits: m.visits, discountOn: m.discountOn, note: m.note, tierId: tingkat?.id ?? null } })
    baru++
  }
  return baru
}
