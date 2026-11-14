// Operasi yang mengubah data kasir dan back office. Tiap fungsi menerima Store dan mengembalikan Store baru.
// Hanya mengimpor tipe dari store.ts supaya tidak terjadi impor melingkar saat data bawaan dibuat.
import type { EarlySet, Item, Member, Move, MoveType, Sale, SaleLine, Store, User } from '../store'
import { dayKey, expectedCash, hppOf, kembalian, saleNo, shortage, totals, usage, weightedAvg, type Method, type Rec } from './hitung'

export const mid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-with(?=-)/, '')

/** Produk penyusun satu Early set (menu makanan dan minuman pasangannya), dicocokkan lewat nama. */
export const setParts = (s: Pick<Store, 'items'>, e: EarlySet): Item[] =>
  [norm(e.name), norm(e.pair)].map(k => s.items.find(i => norm(i.name) === k)).filter((i): i is Item => !!i)

export function recipeOf(s: Store, kind: 'item' | 'set', id: string): Rec[] {
  if (kind === 'item') return s.recipes[id] ?? []
  const e = s.promo.sets.find(x => x.id === id)
  return e ? setParts(s, e).flatMap(i => s.recipes[i.id] ?? []) : []
}
export const avgMap = (s: Store) => Object.fromEntries(s.ings.map(i => [i.id, i.avg]))
export const stockMap = (s: Store) => Object.fromEntries(s.ings.map(i => [i.id, i.stock]))
export const hppItem = (s: Store, kind: 'item' | 'set', id: string) => hppOf(recipeOf(s, kind, id), avgMap(s))
/** Produk yang tidak punya resep tidak memotong stok. Early set dianggap punya resep kalau salah satu penyusunnya punya. */
export const hasRecipe = (s: Store, kind: 'item' | 'set', id: string) => recipeOf(s, kind, id).length > 0

export const catat = (s: Store, by: string, what: string, at = Date.now()): Store => ({ ...s, logs: [...s.logs, { at, by, what }].slice(-500) })

/** Ubah stok dan catat mutasinya di kartu stok. qty bertanda: plus masuk, minus keluar. */
export function mutasi(s: Store, rows: Rec[], type: MoveType, by: string, note: string, at = Date.now()): Store {
  const moves: Move[] = []
  const ings = s.ings.map(i => {
    const r = rows.filter(x => x.ing === i.id)
    if (!r.length) return i
    const d = r.reduce((a, x) => a + x.qty, 0)
    moves.push({ id: mid('v'), at, ing: i.id, qty: d, bal: i.stock + d, type, by, note })
    return { ...i, stock: i.stock + d }
  })
  return { ...s, ings, moves: [...s.moves, ...moves] }
}

export type Keranjang = { kind: 'item' | 'set'; id: string; qty: number; note: string }
export type BayarIn = {
  by: User; shift: string; mode: 'dinein' | 'takeaway'; table: string; lines: Keranjang[]
  member?: Pick<Member, 'id' | 'name'>; memberPct: number; method: Method; paid: number; at?: number
}

/** Simpan transaksi: nomor urut, kurangi stok sesuai resep, tambah kunjungan member. */
export function bayar(s: Store, p: BayarIn): { s: Store; sale: Sale } | { err: string } {
  const at = p.at ?? Date.now()
  if (!p.lines.length) return { err: 'Keranjang masih kosong.' }
  const lines: SaleLine[] = []
  for (const l of p.lines) {
    if (l.kind === 'item') {
      const it = s.items.find(i => i.id === l.id)
      if (!it) return { err: 'Ada menu di keranjang yang sudah dihapus dari daftar produk.' }
      lines.push({ key: `item:${it.id}`, kind: 'item', id: it.id, name: it.name, cat: it.cat, price: it.price, qty: l.qty, note: l.note })
    } else {
      const e = s.promo.sets.find(x => x.id === l.id)
      if (!e) return { err: 'Ada paket di keranjang yang sudah dihapus dari promo.' }
      lines.push({ key: `set:${e.id}`, kind: 'set', id: e.id, name: `Early set ${e.name}`, cat: 'set', price: e.price, qty: l.qty, note: l.note })
    }
  }
  const pctM = p.member ? p.memberPct : 0
  const t = totals(lines.map(l => ({ price: l.price, qty: l.qty, reg: l.kind === 'item' })), pctM, s.fees)
  if (p.method === 'tunai' && p.paid < t.total) return { err: 'Uang yang diterima kurang dari total.' }
  const recs = lines.map(l => ({ qty: l.qty, recipe: recipeOf(s, l.kind, l.id) }))
  const use = usage(recs)
  const lack = shortage(use, stockMap(s))
  if (lack.length) return { err: `Stok tidak cukup: ${lack.map(id => s.ings.find(i => i.id === id)?.name ?? id).join(', ')}.` }
  const avg = avgMap(s)
  const hpp = recs.reduce((a, r) => a + hppOf(r.recipe, avg) * r.qty, 0)
  const paid = p.method === 'tunai' ? p.paid : t.total
  const sale: Sale = {
    id: mid('t'), no: saleNo(at, s.sales.filter(x => dayKey(x.at) === dayKey(at)).length), at, shift: p.shift, uid: p.by.id, by: p.by.name,
    mode: p.mode, table: p.mode === 'dinein' ? p.table : '', lines, member: p.member ? { id: p.member.id, name: p.member.name, pct: pctM } : undefined,
    ...t, method: p.method, paid, change: kembalian(t.total, paid), hpp, use, status: 'ok',
  }
  let n = mutasi(s, use.map(u => ({ ing: u.ing, qty: -u.qty })), 'pakai', p.by.name, `Penjualan ${sale.no}`, at)
  n = { ...n, sales: [...n.sales, sale], members: p.member ? n.members.map(m => m.id === p.member!.id ? { ...m, visits: m.visits + 1 } : m) : n.members }
  return { s: n, sale }
}

/** Void: transaksi tetap tercatat berstatus void, stok dan kunjungan member dikembalikan. */
export function batalkan(s: Store, id: string, by: string, reason: string, at = Date.now()): Store {
  const sale = s.sales.find(x => x.id === id)
  if (!sale || sale.status !== 'ok') return s
  let n = mutasi(s, sale.use.map(u => ({ ing: u.ing, qty: u.qty })), 'batal', by, `Void ${sale.no}`, at)
  n = {
    ...n,
    sales: n.sales.map(x => x.id === id ? { ...x, status: 'void', voidAt: at, voidBy: by, voidReason: reason } : x),
    members: sale.member ? n.members.map(m => m.id === sale.member!.id ? { ...m, visits: Math.max(0, m.visits - 1) } : m) : n.members,
  }
  return catat(n, by, `Void ${sale.no} senilai Rp ${sale.total.toLocaleString('id-ID')}. Alasan: ${reason}`, at)
}

export const shiftOpen = (s: Store, uid: string) => s.shifts.find(x => x.uid === uid && !x.closedAt)
export const shiftSales = (s: Store, shiftId: string) => s.sales.filter(x => x.shift === shiftId)

export function bukaShift(s: Store, u: User, openCash: number, at = Date.now()): Store {
  if (shiftOpen(s, u.id)) return s
  return catat({ ...s, shifts: [...s.shifts, { id: mid('sh'), uid: u.id, by: u.name, at, openCash }] }, u.name, `Buka shift dengan modal Rp ${openCash.toLocaleString('id-ID')}`, at)
}
export function tutupShift(s: Store, shiftId: string, counted: number, note: string, at = Date.now()): Store {
  const sh = s.shifts.find(x => x.id === shiftId)
  if (!sh || sh.closedAt) return s
  const expected = expectedCash(sh.openCash, shiftSales(s, shiftId))
  const diff = counted - expected
  const n = { ...s, shifts: s.shifts.map(x => x.id === shiftId ? { ...x, closedAt: at, counted, expected, note } : x) }
  return catat(n, sh.by, `Tutup shift. Kas seharusnya Rp ${expected.toLocaleString('id-ID')}, dihitung Rp ${counted.toLocaleString('id-ID')}, selisih ${diff < 0 ? '-' : diff > 0 ? '+' : ''}Rp ${Math.abs(diff).toLocaleString('id-ID')}`, at)
}

export function sesuaikan(s: Store, ing: string, delta: number, type: 'sesuai' | 'buang', by: string, note: string, at = Date.now()): Store {
  const i = s.ings.find(x => x.id === ing)
  if (!i || !delta) return s
  const sign = delta < 0 ? '-' : '+'
  return catat(mutasi(s, [{ ing, qty: delta }], type, by, note, at), by, `${type === 'buang' ? 'Stok terbuang' : 'Penyesuaian stok'} ${i.name} ${sign}${Math.abs(delta).toLocaleString('id-ID')} ${i.unit}. ${note}`, at)
}

export function simpanOpname(s: Store, fisik: Record<string, number>, by: string, at = Date.now()): Store {
  const rows = s.ings.filter(i => i.id in fisik && fisik[i.id] !== i.stock).map(i => ({ ing: i.id, qty: fisik[i.id] - i.stock }))
  if (!rows.length) return s
  return catat(mutasi(s, rows, 'opname', by, 'Stock opname', at), by, `Stock opname: ${rows.length} bahan disesuaikan dengan stok fisik`, at)
}

/** Terima pesanan: stok bertambah dan harga rata-rata bahan dihitung ulang (rata-rata tertimbang). */
export function terimaPO(s: Store, id: string, by: string, at = Date.now()): Store {
  const po = s.pos.find(x => x.id === id)
  if (!po || po.status !== 'dipesan') return s
  let n: Store = {
    ...s,
    ings: s.ings.map(i => {
      const ls = po.lines.filter(x => x.ing === i.id)
      if (!ls.length) return i
      let st = i.stock, av = i.avg
      for (const x of ls) { av = weightedAvg(st, av, x.qty, x.price); st += x.qty }
      return { ...i, avg: av }
    }),
  }
  n = mutasi(n, po.lines.map(l => ({ ing: l.ing, qty: l.qty })), 'beli', by, `Penerimaan ${po.no}`, at)
  n = { ...n, pos: n.pos.map(x => x.id === id ? { ...x, status: 'diterima', received: at } : x) }
  return catat(n, by, `Terima pembelian ${po.no}: ${po.lines.length} bahan masuk, harga rata-rata dihitung ulang`, at)
}

