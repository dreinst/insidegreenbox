// Data contoh untuk kasir dan back office: bahan baku, resep, pemasok, pembelian, shift, dan transaksi beberapa hari terakhir.
// Semua angka ini perkiraan untuk demo, bukan data asli kafe.
import type { Back, Ingredient, PO, Store } from '../store'
import type { Rec } from './hitung'
import { dayStart, expectedCash } from './hitung'
import { batalkan, bayar, bukaShift, catat, mid, sesuaikan, shiftOpen, terimaPO, tutupShift, type Keranjang } from './aksi'

type Core = Omit<Store, keyof Back>

// [id, nama, satuan, stok akhir, stok minimum, harga rata-rata per satuan]
const ING: [string, string, string, number, number, number][] = [
  ['kopi', 'Biji kopi', 'gram', 2400, 1000, 320], ['susu', 'Susu segar', 'ml', 14500, 6000, 18], ['gula', 'Gula pasir', 'gram', 3800, 1500, 16],
  ['es', 'Es batu', 'gram', 22000, 8000, 3], ['cup', 'Cup dan tutup', 'pcs', 260, 100, 750], ['madu', 'Sirup madu', 'ml', 900, 500, 55],
  ['lemon', 'Lemon', 'iris', 34, 40, 500], ['teh', 'Teh hitam', 'gram', 450, 200, 160], ['matcha', 'Bubuk matcha', 'gram', 260, 150, 700],
  ['whip', 'Whipping cream', 'ml', 480, 500, 62], ['nasi', 'Nasi matang', 'gram', 9000, 4000, 14], ['ayam', 'Dada ayam', 'gram', 3600, 2000, 42],
  ['telur', 'Telur', 'butir', 46, 30, 2400], ['kentang', 'Kentang', 'gram', 5200, 3000, 22], ['roti', 'Roti sando', 'pcs', 22, 12, 3500],
  ['beef', 'Roast beef', 'gram', 60, 400, 150], ['sayur', 'Sayur salad', 'gram', 1900, 1000, 30], ['berry', 'Sirup mixed berries', 'ml', 1100, 500, 70],
  ['cokelat', 'Bubuk cokelat 70%', 'gram', 700, 300, 280], ['oolong', 'Teh oolong', 'gram', 300, 150, 200], ['pecan', 'Pecan praline', 'gram', 400, 150, 220],
  ['soda', 'Soda dan air mineral', 'ml', 6000, 2000, 5], ['kaleng', 'Kaleng RTD kosong', 'pcs', 120, 40, 1800], ['pasta', 'Pasta kering', 'gram', 4000, 1500, 25],
  ['wijen', 'Saus wijen', 'ml', 1200, 400, 60], ['tepung', 'Tepung bumbu dan terigu', 'gram', 3000, 1000, 20], ['enoki', 'Jamur enoki', 'gram', 1500, 600, 70],
  ['biskuit', 'Biskuit remah', 'gram', 800, 300, 45],
]

const RESEP: Record<string, Rec[]> = {
  espresso: [{ ing: 'kopi', qty: 18 }],
  'long-black': [{ ing: 'kopi', qty: 18 }],
  'iced-black': [{ ing: 'kopi', qty: 18 }, { ing: 'es', qty: 150 }, { ing: 'cup', qty: 1 }],
  latte: [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 180 }, { ing: 'cup', qty: 1 }],
  cappuccino: [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 150 }, { ing: 'cup', qty: 1 }],
  'iced-white': [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 120 }, { ing: 'es', qty: 120 }, { ing: 'cup', qty: 1 }],
  'coffee-cloud': [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 150 }, { ing: 'whip', qty: 40 }, { ing: 'es', qty: 100 }, { ing: 'gula', qty: 10 }, { ing: 'cup', qty: 1 }],
  'matcha-latte': [{ ing: 'matcha', qty: 6 }, { ing: 'susu', qty: 180 }, { ing: 'gula', qty: 12 }, { ing: 'es', qty: 100 }, { ing: 'cup', qty: 1 }],
  'iced-shaken-honey-lemon-tea': [{ ing: 'teh', qty: 4 }, { ing: 'madu', qty: 20 }, { ing: 'lemon', qty: 2 }, { ing: 'es', qty: 150 }, { ing: 'cup', qty: 1 }],
  'iced-shaken-mixed-berries-tea': [{ ing: 'teh', qty: 4 }, { ing: 'berry', qty: 25 }, { ing: 'es', qty: 150 }, { ing: 'cup', qty: 1 }],
  'easy-nasgor': [{ ing: 'nasi', qty: 200 }, { ing: 'ayam', qty: 80 }, { ing: 'telur', qty: 1 }, { ing: 'sayur', qty: 40 }],
  'real-potato-fries': [{ ing: 'kentang', qty: 150 }],
  'beef-sando': [{ ing: 'roti', qty: 2 }, { ing: 'beef', qty: 80 }, { ing: 'sayur', qty: 30 }, { ing: 'kentang', qty: 120 }],
  // Menu lain, supaya HPP dan laba kotor tidak timpang. Semua takaran perkiraan.
  piccolo: [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 60 }, { ing: 'cup', qty: 1 }],
  'magic-white-6oz': [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 120 }, { ing: 'cup', qty: 1 }],
  'dirty-latte': [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 150 }, { ing: 'es', qty: 100 }, { ing: 'gula', qty: 8 }, { ing: 'cup', qty: 1 }],
  'woc-white-on-crack': [{ ing: 'kopi', qty: 36 }, { ing: 'susu', qty: 120 }, { ing: 'es', qty: 100 }, { ing: 'gula', qty: 10 }, { ing: 'cup', qty: 1 }],
  'pour-over-coffee': [{ ing: 'kopi', qty: 15 }, { ing: 'cup', qty: 1 }],
  'iced-pour-over-coffee': [{ ing: 'kopi', qty: 15 }, { ing: 'es', qty: 150 }, { ing: 'cup', qty: 1 }],
  'cold-brewed-coffee': [{ ing: 'kopi', qty: 20 }, { ing: 'es', qty: 120 }, { ing: 'cup', qty: 1 }],
  'mont-blanc': [{ ing: 'kopi', qty: 18 }, { ing: 'susu', qty: 100 }, { ing: 'whip', qty: 40 }, { ing: 'es', qty: 100 }, { ing: 'gula', qty: 12 }, { ing: 'cup', qty: 1 }],
  'cold-brew-sorbet': [{ ing: 'kopi', qty: 20 }, { ing: 'es', qty: 200 }, { ing: 'gula', qty: 15 }, { ing: 'cup', qty: 1 }],
  'oolong-cloud': [{ ing: 'oolong', qty: 5 }, { ing: 'whip', qty: 40 }, { ing: 'susu', qty: 80 }, { ing: 'es', qty: 120 }, { ing: 'gula', qty: 10 }, { ing: 'cup', qty: 1 }],
  'rtd-classic': [{ ing: 'kopi', qty: 25 }, { ing: 'soda', qty: 200 }, { ing: 'kaleng', qty: 1 }],
  'rtd-fruity': [{ ing: 'kopi', qty: 25 }, { ing: 'berry', qty: 30 }, { ing: 'soda', qty: 200 }, { ing: 'kaleng', qty: 1 }],
  'rtd-decaf': [{ ing: 'kopi', qty: 25 }, { ing: 'soda', qty: 200 }, { ing: 'kaleng', qty: 1 }],
  'sunset-soother': [{ ing: 'teh', qty: 4 }, { ing: 'berry', qty: 25 }, { ing: 'madu', qty: 20 }, { ing: 'soda', qty: 200 }, { ing: 'kaleng', qty: 1 }],
  'sunrise-booster': [{ ing: 'teh', qty: 4 }, { ing: 'lemon', qty: 2 }, { ing: 'madu', qty: 20 }, { ing: 'soda', qty: 200 }, { ing: 'kaleng', qty: 1 }],
  '70-chocolate': [{ ing: 'cokelat', qty: 30 }, { ing: 'susu', qty: 200 }, { ing: 'gula', qty: 10 }, { ing: 'cup', qty: 1 }],
  'pecan-praline-matcha': [{ ing: 'matcha', qty: 6 }, { ing: 'pecan', qty: 15 }, { ing: 'susu', qty: 180 }, { ing: 'es', qty: 100 }, { ing: 'cup', qty: 1 }],
  'red-box': [{ ing: 'berry', qty: 30 }, { ing: 'soda', qty: 200 }, { ing: 'es', qty: 150 }, { ing: 'lemon', qty: 1 }, { ing: 'cup', qty: 1 }],
  napkin: [{ ing: 'teh', qty: 4 }, { ing: 'lemon', qty: 2 }, { ing: 'madu', qty: 15 }, { ing: 'soda', qty: 200 }, { ing: 'es', qty: 150 }, { ing: 'cup', qty: 1 }],
  'sesame-pasta': [{ ing: 'pasta', qty: 120 }, { ing: 'wijen', qty: 40 }, { ing: 'ayam', qty: 80 }, { ing: 'telur', qty: 1 }],
  'nanban-chicken-with-rice': [{ ing: 'nasi', qty: 200 }, { ing: 'ayam', qty: 120 }, { ing: 'tepung', qty: 30 }, { ing: 'sayur', qty: 40 }],
  'salad-with-pan-seared-chicken': [{ ing: 'sayur', qty: 150 }, { ing: 'ayam', qty: 100 }],
  'pad-kra-pao': [{ ing: 'nasi', qty: 200 }, { ing: 'ayam', qty: 90 }, { ing: 'telur', qty: 1 }, { ing: 'sayur', qty: 30 }],
  'enoki-fries': [{ ing: 'enoki', qty: 100 }, { ing: 'tepung', qty: 25 }],
  'soft-panna': [{ ing: 'whip', qty: 100 }, { ing: 'susu', qty: 60 }, { ing: 'gula', qty: 15 }],
  'sweet-waffle': [{ ing: 'tepung', qty: 80 }, { ing: 'telur', qty: 1 }, { ing: 'susu', qty: 60 }, { ing: 'gula', qty: 15 }],
  'coffee-parfait': [{ ing: 'whip', qty: 60 }, { ing: 'kopi', qty: 10 }, { ing: 'biskuit', qty: 30 }, { ing: 'susu', qty: 50 }, { ing: 'gula', qty: 10 }],
}

// Menu yang sering terjual: [id produk, bobot].
const POPULER: [string, number][] = [
  ['iced-black', 5], ['latte', 6], ['cappuccino', 3], ['iced-white', 4], ['coffee-cloud', 5], ['matcha-latte', 3], ['iced-shaken-honey-lemon-tea', 3],
  ['espresso', 2], ['dirty-latte', 2], ['easy-nasgor', 4], ['real-potato-fries', 3], ['beef-sando', 2], ['pad-kra-pao', 2], ['sweet-waffle', 1],
]

const rng = (a: number) => () => {
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const DAYS = 5 // hari penuh sebelum hari ini

/** Jalankan seluruh riwayat contoh dengan stok awal tertentu. Dipanggil dua kali: pertama untuk mengukur pemakaian, kedua untuk hasil akhir. */
function jalankan(core: Core, awal: Record<string, number>, ings0: Ingredient[], now: number): Store {
  const owner = core.users[1], kasir = core.users[2]
  const r = rng(20261114)
  const t0 = dayStart(now) - DAYS * 86400000
  const PO1: PO = {
    id: 'po1', no: 'PO-001', supplier: 'sp1', status: 'dipesan', created: t0 + 1 * 86400000 + 9 * 3600000, ordered: t0 + 1 * 86400000 + 9.5 * 3600000, by: owner.name, note: 'Stok kopi dan susu mingguan',
    lines: [{ ing: 'kopi', qty: 1500, price: 340 }, { ing: 'susu', qty: 10000, price: 17 }, { ing: 'cup', qty: 100, price: 720 }],
  }
  let s: Store = {
    ...core,
    ings: ings0.map(i => ({ ...i, stock: awal[i.id] })), recipes: RESEP, fees: { tax: 0, svc: 0 },
    suppliers: [
      { id: 'sp1', name: 'CV Sumber Biji Malang', contact: '0341 555 0101', note: 'Kopi, cup, gula. Kirim Selasa dan Jumat.' },
      { id: 'sp2', name: 'Pasar Besar dan Toko Segar', contact: '0812 5550 0202', note: 'Susu, telur, ayam, sayur. Pesan sehari sebelumnya.' },
    ],
    pos: [PO1], moves: [], shifts: [], sales: [], logs: [],
  }
  // Stok awal tercatat sebagai satu mutasi per bahan.
  s = { ...s, moves: s.ings.map(i => ({ id: mid('v'), at: t0, ing: i.id, qty: i.stock, bal: i.stock, type: 'awal' as const, by: 'Sistem', note: 'Stok awal (data contoh)' })) }

  const pick = () => {
    const tot = POPULER.reduce((a, p) => a + p[1], 0)
    let x = r() * tot
    return POPULER.find(p => (x -= p[1]) < 0)![0]
  }
  const mem = core.members.filter(m => m.discount)
  const metode = () => { const x = r(); return x < 0.4 ? 'tunai' as const : x < 0.85 ? 'qris' as const : 'debit' as const }
  const tierPct = (visits: number) => [...core.tiers].sort((a, b) => b.min - a.min).find(t => visits >= t.min)?.pct ?? 0
  let voidDone = false

  for (let d = 0; d <= DAYS; d++) {
    const base = t0 + d * 86400000
    const today = d === DAYS
    const diffs = [0, -5000, 2000, 0, -2000]
    if (d === 3) {
      s = terimaPO(s, 'po1', owner.name, base + 6.5 * 3600000)
    }
    if (d === 2) s = sesuaikan(s, 'susu', -400, 'buang', kasir.name, 'Tumpah saat menuang', base + 15 * 3600000)
    s = bukaShift(s, kasir, 200000, base + 7 * 3600000)
    const shift = shiftOpen(s, kasir.id)!
    // Hari ini hanya sampai sekarang, hari lain seluruh jam buka.
    const endH = today ? Math.min(22, (now - base) / 3600000 - 0.1) : 21.5
    const n = today ? Math.max(0, Math.floor((endH - 7.5) * 1.3)) : 13 + Math.floor(r() * 6)
    const times = Array.from({ length: n }, () => 7.5 + r() * (endH - 7.5)).sort((a, b) => a - b)
    for (const h of times) {
      const k = 1 + Math.floor(r() * 3)
      const lines: Keranjang[] = Array.from({ length: k }, () => ({ kind: 'item', id: pick(), qty: 1 + (r() < 0.2 ? 1 : 0), note: '' }))
      if (r() < 0.12 && core.promo.sets.length) lines.push({ kind: 'set', id: core.promo.sets[Math.floor(r() * core.promo.sets.length)].id, qty: 1, note: '' })
      const member = r() < 0.25 ? mem[Math.floor(r() * mem.length)] : undefined
      const method = metode()
      const mode = r() < 0.7 ? 'dinein' as const : 'takeaway' as const
      const table = String(1 + Math.floor(r() * 10))
      // paid dibuat besar; uang pas atau pecahan tidak penting untuk contoh
      const res = bayar(s, { by: kasir, shift: shift.id, mode, table, lines, member, memberPct: member ? tierPct(member.visits) : 0, method, paid: 1_000_000, at: base + h * 3600000 })
      if ('s' in res) {
        s = res.s
        // Kembalian tunai dibulatkan ke 50 ribu terdekat supaya terlihat wajar
        if (method === 'tunai') {
          const paid = Math.ceil(res.sale.total / 50000) * 50000
          s = { ...s, sales: s.sales.map(x => x.id === res.sale.id ? { ...x, paid, change: paid - x.total } : x) }
        }
        if (!voidDone && d === 3 && method === 'qris' && !member) { s = batalkan(s, res.sale.id, owner.name, 'Pesanan salah input, diganti transaksi baru', base + (h + 0.1) * 3600000); voidDone = true }
      }
    }
    if (!today) {
      const exp = expectedCash(200000, s.sales.filter(x => x.shift === shift.id))
      s = tutupShift(s, shift.id, exp + diffs[d % diffs.length], diffs[d % diffs.length] ? 'Ada selisih kecil, kembalian recehan.' : '', base + 22 * 3600000)
    }
  }
  return s
}

export function seedBack(core: Core): Back {
  const now = Date.now()
  const ings0: Ingredient[] = ING.map(([id, name, unit, stock, min, avg]) => ({ id, name, unit, stock, min, avg }))
  const big = Object.fromEntries(ING.map(([id]) => [id, 1e7]))
  // Putaran pertama: ukur selisih stok bersih (pemakaian dikurangi pembelian), supaya putaran kedua berakhir tepat di stok akhir yang kita mau.
  const a = jalankan(core, big, ings0, now)
  const awal = Object.fromEntries(a.ings.map((i, k) => [i.id, ING[k][3] + (1e7 - i.stock)]))
  let s = jalankan(core, awal, ings0, now)
  // PO yang belum diterima dan satu draf, dibuat setelah riwayat selesai
  const t = now
  const pos: PO[] = [
    ...s.pos,
    { id: 'po2', no: 'PO-002', supplier: 'sp2', status: 'dipesan', created: t - 86400000, ordered: t - 80000000, by: core.users[1].name, note: 'Ayam, telur, sayur untuk akhir pekan', lines: [{ ing: 'ayam', qty: 4000, price: 43 }, { ing: 'telur', qty: 60, price: 2500 }, { ing: 'sayur', qty: 2000, price: 31 }] },
    { id: 'po3', no: 'PO-003', supplier: 'sp2', status: 'draf', created: t - 3600000, by: core.users[1].name, note: 'Roast beef dan roti, bahan Beef-Sando habis', lines: [{ ing: 'beef', qty: 1500, price: 150 }, { ing: 'roti', qty: 40, price: 3500 }] },
  ]
  s = catat({ ...s, pos, moves: [...s.moves].sort((x, y) => x.at - y.at) }, core.users[1].name, 'Buat PO-002 dan PO-003', t - 3600000)
  s = { ...s, logs: [...s.logs].sort((x, y) => x.at - y.at) }
  const { ings, recipes, suppliers, pos: pos2, moves, shifts, sales, logs, fees } = s
  return { ings, recipes, suppliers, pos: pos2, moves, shifts, sales, logs, fees }
}
