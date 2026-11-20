// Hitungan murni untuk kasir dan back office. Semua uang berupa bilangan bulat rupiah.
// Berkas ini tidak mengimpor apa pun supaya bisa diuji langsung dengan node.

export type Fees = { tax: number; svc: number }
export type Row = { price: number; qty: number; reg: boolean }
export type Rec = { ing: string; qty: number }
export type Method = 'tunai' | 'qris' | 'debit'

export const pct = (n: number, p: number) => Math.round(n * p / 100)

/**
 * Total keranjang. Potongan member hanya untuk baris reguler (reg = true).
 * Service dihitung dari harga setelah potongan, pajak dari harga setelah potongan ditambah service.
 */
export function totals(rows: Row[], memberPct: number, fees: Fees) {
  const sub = rows.reduce((a, r) => a + r.price * r.qty, 0)
  const regSub = rows.reduce((a, r) => a + (r.reg ? r.price * r.qty : 0), 0)
  const disc = pct(regSub, memberPct)
  const net = sub - disc
  const svc = pct(net, fees.svc)
  const tax = pct(net + svc, fees.tax)
  return { sub, disc, net, svc, tax, total: net + svc + tax }
}

export const kembalian = (total: number, paid: number) => Math.max(0, paid - total)

/** Pemakaian bahan dari beberapa baris. recipe = resep satu porsi baris itu. */
export function usage(lines: { qty: number; recipe: Rec[] }[]): Rec[] {
  const m = new Map<string, number>()
  for (const l of lines) for (const r of l.recipe) m.set(r.ing, (m.get(r.ing) ?? 0) + r.qty * l.qty)
  return [...m].map(([ing, qty]) => ({ ing, qty }))
}

/** Bahan yang kurang: pemakaian lebih besar dari stok. Mengembalikan id bahan. */
export const shortage = (use: Rec[], stock: Record<string, number>) => use.filter(u => u.qty > (stock[u.ing] ?? 0)).map(u => u.ing)

/** HPP satu porsi = jumlah takaran kali harga rata-rata bahan, dibulatkan ke rupiah. */
export const hppOf = (recipe: Rec[], avg: Record<string, number>) => Math.round(recipe.reduce((a, r) => a + r.qty * (avg[r.ing] ?? 0), 0))

export function margin(price: number, hpp: number) {
  const rp = price - hpp
  return { rp, pct: price > 0 ? Math.round(rp / price * 1000) / 10 : 0 }
}

/** Harga rata-rata tertimbang setelah barang masuk. Stok kosong atau minus: harga baru yang berlaku. */
export function weightedAvg(stock: number, avg: number, qty: number, price: number) {
  const have = Math.max(0, stock)
  if (qty <= 0) return avg
  return Math.round((have * avg + qty * price) / (have + qty))
}

type SaleLike = { method: Method; total: number; status: string }
/** Kas seharusnya di laci = modal awal + penjualan tunai (yang tidak void). */
export const expectedCash = (openCash: number, sales: SaleLike[]) =>
  openCash + sales.filter(s => s.status === 'ok' && s.method === 'tunai').reduce((a, s) => a + s.total, 0)

export function byMethod(sales: SaleLike[]): Record<Method, { n: number; total: number }> {
  const r = { tunai: { n: 0, total: 0 }, qris: { n: 0, total: 0 }, debit: { n: 0, total: 0 } }
  for (const s of sales) if (s.status === 'ok') { r[s.method].n++; r[s.method].total += s.total }
  return r
}

// Tanggal lokal
const p2 = (n: number) => String(n).padStart(2, '0')
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
export const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
/** "2026-11-14" jadi awal hari itu (waktu lokal). */
export const parseDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getTime() }
export const saleNo = (at: number, countThatDay: number) => `GB${dayKey(at).slice(2).replace(/-/g, '')}-${String(countThatDay + 1).padStart(3, '0')}`

/** Isi berkas CSV dari baris mentah. Kutip dan koma di dalam sel diamankan. */
export const csv = (rows: (string | number)[][]) => rows.map(r => r.map(c => {
  const t = String(c)
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}).join(',')).join('\n')
