// Satu sumber data untuk website dan admin.
// Belum ada server: semuanya disimpan di localStorage browser ini dan ikut berubah di tab lain lewat event "storage".
// Kalau nanti pakai server, cukup ganti isi load() dan update() di berkas ini.
import { useSyncExternalStore } from 'react'
import { DRINKS, FOODS, MAPS, WA, type Drink, type Food, type Level, type Serve } from './data'
import { seedBack } from './admin/contoh'
import type { Fees, Method, Rec } from './admin/hitung'

export type Mat = 'steel' | 'concrete' | 'ply' | 'green'
export type Role = 'superadmin' | 'owner' | 'admin'

export type Item = {
  id: string; name: string; cat: string; price: number; line: string; mat: Mat; on: boolean; fav: boolean
  level?: Level; serve?: Serve; beans?: string; kcal?: string; desc?: string
  img?: string // nama berkas di /img (tanpa .webp) atau data URL hasil unggah
}
// Tingkat member. Tingkat seorang member = tingkat tertinggi yang syarat kunjungannya terpenuhi.
export type Tier = { id: string; name: string; min: number; pct: number; perk: string }
export type Member = { id: string; name: string; wa: string; visits: number; discount: boolean; joined: number; note: string }
export type EarlySet = { id: string; img: string; name: string; pair: string; old: number; price: number; on: boolean }
export type Promo = {
  earlyOn: boolean; sets: EarlySet[]
  dailyOn: boolean; dailySteps: number; dailyGift: string
}
export type Info = {
  address: string; area: string; open: string; close: string; waNumber: string; wa: string; maps: string
  instagram: string; tiktok: string; threads: string; facilities: string[]
}
export type User = { id: string; name: string; role: Role; on: boolean }
export type History = { at: number; by: string; label: string; prices: Record<string, number> }
export type Store = {
  items: Item[]; history: History[]; members: Member[]; tiers: Tier[]; memberRule: string
  promo: Promo; info: Info; users: User[]; session: string | null
} & Back

// Kasir dan back office (ala POS dan Core): bahan baku, resep, pembelian, shift, transaksi, log.
// Uang selalu bilangan bulat rupiah. Takaran dan stok memakai satuan bahan (gram, ml, pcs).
export type Ingredient = { id: string; name: string; unit: string; stock: number; min: number; avg: number } // avg = harga rata-rata per satuan
export type Supplier = { id: string; name: string; contact: string; note: string }
export type POLine = { ing: string; qty: number; price: number }
export type PO = { id: string; no: string; supplier: string; status: 'draf' | 'dipesan' | 'diterima'; created: number; ordered?: number; received?: number; by: string; note: string; lines: POLine[] }
export type MoveType = 'awal' | 'beli' | 'pakai' | 'sesuai' | 'buang' | 'opname' | 'batal'
export type Move = { id: string; at: number; ing: string; qty: number; bal: number; type: MoveType; by: string; note: string }
export type ShiftRec = { id: string; uid: string; by: string; at: number; openCash: number; closedAt?: number; counted?: number; expected?: number; note?: string }
export type SaleLine = { key: string; kind: 'item' | 'set'; id: string; name: string; cat: string; price: number; qty: number; note: string }
export type Sale = {
  id: string; no: string; at: number; shift: string; uid: string; by: string; mode: 'dinein' | 'takeaway'; table: string
  lines: SaleLine[]; member?: { id: string; name: string; pct: number }
  sub: number; disc: number; net: number; svc: number; tax: number; total: number
  method: Method; paid: number; change: number; hpp: number; use: Rec[]
  status: 'ok' | 'void'; voidAt?: number; voidBy?: string; voidReason?: string
}
export type LogRec = { at: number; by: string; what: string }
export type Back = {
  ings: Ingredient[]; recipes: Record<string, Rec[]>; suppliers: Supplier[]; pos: PO[]; moves: Move[]
  shifts: ShiftRec[]; sales: Sale[]; logs: LogRec[]; fees: Fees
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const fmt = (n: number) => n.toLocaleString('id-ID')
// 38000 jadi "38 K", 35500 jadi "35,5 K" (format harga di website)
export const priceK = (n: number) => `${(n / 1000).toLocaleString('id-ID')} K`
export const imgSrc = (img: string) => /^(data|blob):/.test(img) ? img : `/img/${img}.webp`
const rupiah = (p: string) => Math.round(parseFloat(p.replace(',', '.')) * 1000)

const PHOTO: Record<string, [string, Mat]> = {
  'Coffee Cloud': ['p-coffee-cloud', 'green'], 'Oolong Cloud': ['p-oolong-cloud', 'concrete'], 'RTD Decaf': ['p-rtd-decaf', 'steel'], 'Sunset Soother': ['p-rtd-sunset', 'steel'],
  'Easy-Nasgor': ['c-easy-nasgor', 'steel'], 'Beef-Sando': ['c-beef-sando', 'ply'], 'Pad Kra Pao': ['c-pad-kra-pao', 'concrete'], 'Real Potato Fries': ['c-fries', 'green'],
}
const LINE: Record<string, string> = {
  'Coffee Cloud': 'Kopi susu di bawah, awan di atas.', 'Easy-Nasgor': 'Nasi goreng mentega plus telur. Beres.',
  'Beef-Sando': 'Roast beef, roti, plus fries.', 'Oolong Cloud': 'Teh oolong dingin, awan yang sama.',
}

// Kategori menu: [id, nama di admin]. Urutan dan id sama dengan DRINKS dan FOODS di data.ts.
export const CATS: [string, string][] = [...DRINKS, ...FOODS].map(g => [g.id, g.id === 'main' ? 'Makanan' : g.title])
export const FOOD_CATS = FOODS.map(g => g.id)

function seedItems(): Item[] {
  const base: Pick<Item, 'name' | 'cat' | 'price' | 'level' | 'serve' | 'beans' | 'kcal' | 'desc'>[] = [
    ...DRINKS.flatMap(g => g.items.map(d => ({ name: d.name, cat: g.id, price: rupiah(d.price), level: d.level, serve: d.serve, beans: d.beans }))),
    ...FOODS.flatMap(g => g.items.map(f => ({ name: f.name, cat: g.id, price: rupiah(f.price), kcal: f.kcal.replace(' kcal', ''), desc: f.desc }))),
  ]
  return base.map(p => {
    const [img, mat = 'steel'] = PHOTO[p.name] ?? []
    return { ...p, id: slug(p.name), line: LINE[p.name] ?? '', img, mat, on: true, fav: p.name in LINE }
  })
}

function seedMain(): Omit<Store, keyof Back> {
  return {
    items: seedItems(), history: [],
    // Skema usulan "Greenbox Key": naik tingkat dari jumlah kunjungan yang dicatat kasir.
    tiers: [
      { id: 'guest', name: 'Guest Key', min: 0, pct: 5, perk: 'Langsung berlaku begitu daftar.' },
      { id: 'house', name: 'House Key', min: 10, pct: 10, perk: 'Setelah 10 kunjungan.' },
      { id: 'master', name: 'Master Key', min: 25, pct: 15, perk: 'Setelah 25 kunjungan.' },
    ],
    memberRule: 'Sebutkan nomor WhatsApp-mu di kasir. Potongan berlaku untuk menu reguler dan tidak digabung dengan Early set atau promo lain.',
    members: [
      { id: 'm1', name: 'Raka Pradana', wa: '081234560001', visits: 27, discount: true, joined: Date.UTC(2026, 8, 6), note: '' },
      { id: 'm2', name: 'Salsa Maharani', wa: '081234560002', visits: 12, discount: true, joined: Date.UTC(2026, 8, 20), note: '' },
      { id: 'm3', name: 'Dimas Aryo', wa: '081234560003', visits: 4, discount: false, joined: Date.UTC(2026, 9, 11), note: 'Karyawan, sudah dapat harga staf.' },
      { id: 'm4', name: 'Nadia Putri', wa: '081234560004', visits: 1, discount: true, joined: Date.UTC(2026, 10, 2), note: '' },
    ],
    promo: {
      earlyOn: true,
      sets: [
        { id: 's1', img: 'c-set-nasgor', name: 'Easy-Nasgor', pair: 'Iced Shaken Honey Lemon Tea', old: 63000, price: 40000, on: true },
        { id: 's2', img: 'c-set-salad', name: 'Salad Pan-seared Chicken', pair: 'Iced Black', old: 65000, price: 50000, on: true },
        { id: 's3', img: 'c-set-beef', name: 'Beef-Sando', pair: 'Iced Shaken Mixed Berries Tea', old: 80000, price: 60000, on: true },
      ],
      dailyOn: true, dailySteps: 2000, dailyGift: 'Panna Cotta',
    },
    info: {
      address: 'Jl. Nusakambangan No. 42, Kasin, Klojen', area: 'Malang', open: '07.00', close: '22.00',
      waNumber: '0819-3786-6638', wa: WA, maps: MAPS,
      instagram: 'https://www.instagram.com/inside.greenbox/', tiktok: 'https://www.tiktok.com/@inside.greenbox', threads: 'https://www.threads.com/@inside.greenbox',
      facilities: ['Ramah WFC', 'Ruang artwork', 'Mushola'],
    },
    users: [
      { id: 'u1', name: 'Superadmin', role: 'superadmin', on: true },
      { id: 'u2', name: 'Owner', role: 'owner', on: true },
      { id: 'u3', name: 'Admin', role: 'admin', on: true },
    ],
    session: null,
  }
}

export function seed(): Store {
  const main = seedMain()
  return { ...main, ...seedBack(main) }
}

const KEY = 'gb-store-v2'
function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '')
    if (Array.isArray(s.items)) return { ...seed(), ...s }
  } catch { /* belum ada simpanan atau isinya rusak: pakai data bawaan */ }
  return seed()
}

let state = load()
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
addEventListener('storage', e => { if (e.key === KEY) { state = load(); emit() } })

/** Ubah data. Mengembalikan false kalau penyimpanan browser penuh (biasanya karena foto terlalu banyak). */
export function update(fn: (s: Store) => Store): boolean {
  const next = fn(state)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { return false }
  state = next; emit()
  return true
}
export const reset = () => update(s => ({ ...seed(), session: s.session }))
export const getStore = () => state
export function useStore(): Store {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => state)
}

/** Foto unggahan dikecilkan ke sisi terpanjang 640 px dan disimpan sebagai data URL WebP (transparansi tetap ada). */
export function readPhoto(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const im = new Image()
    im.onload = () => {
      const k = Math.min(1, 640 / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k)
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
      URL.revokeObjectURL(im.src)
      ok(c.toDataURL('image/webp', 0.85))
    }
    im.onerror = fail
    im.src = URL.createObjectURL(file)
  })
}

// Member
export const waDigits = (wa: string) => wa.replace(/\D/g, '').replace(/^62/, '0')
export const tierOf = (m: Member, tiers: Tier[]) => [...tiers].sort((a, b) => b.min - a.min).find(t => m.visits >= t.min) ?? tiers[0]
export const nextTier = (m: Member, tiers: Tier[]) => [...tiers].sort((a, b) => a.min - b.min).find(t => t.min > m.visits)
/** Persen potongan yang berlaku untuk member ini. 0 kalau potongannya dimatikan admin. */
export const discountOf = (m: Member, tiers: Tier[]) => m.discount ? tierOf(m, tiers).pct : 0
export const findMember = (s: Store, wa: string) => s.members.find(m => waDigits(m.wa) === waDigits(wa))

// Hak akses per role. superadmin: semua. owner: semua kecuali mengatur akun superadmin dan reset data. admin: operasional harian.
export type Action = 'produk.edit' | 'produk.tambah' | 'produk.hapus' | 'harga.massal' | 'promo' | 'member.catat' | 'member.atur' | 'info' | 'pengaturan' | 'pengguna' | 'reset'
  | 'shift' | 'kasir' | 'transaksi.lihat' | 'transaksi.void' | 'stok.lihat' | 'stok.atur' | 'resep' | 'pembelian' | 'laporan'
const ADMIN_CAN: Action[] = ['produk.edit', 'member.catat', 'shift', 'kasir', 'transaksi.lihat', 'stok.lihat']
export function can(role: Role | undefined, a: Action) {
  if (!role) return false
  if (role === 'superadmin') return true
  if (role === 'owner') return a !== 'reset'
  return ADMIN_CAN.includes(a)
}
export const ROLE_NAME: Record<Role, string> = { superadmin: 'Superadmin', owner: 'Owner', admin: 'Admin' }
export const currentUser = (s: Store) => s.users.find(u => u.id === s.session && u.on)

// Bentuk data untuk halaman website: sama dengan DRINKS dan FOODS di data.ts, tapi isinya dari store dan hanya yang tayang.
export function menuDrinks(items: Item[]) {
  return DRINKS.map(g => ({ ...g, items: items.filter(i => i.on && i.cat === g.id).map((i): Drink => ({ name: i.name, level: i.level ?? 'A', serve: i.serve ?? 'ice', price: priceK(i.price), beans: i.beans || undefined })) }))
}
export function menuFoods(items: Item[]) {
  return FOODS.map(g => ({ ...g, items: items.filter(i => i.on && i.cat === g.id).map((i): Food => ({ name: i.name, kcal: i.kcal ? `${i.kcal} kcal` : '', price: priceK(i.price), desc: i.desc })) }))
}
