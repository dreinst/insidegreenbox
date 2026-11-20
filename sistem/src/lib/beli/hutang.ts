// Hutang Pemasok (tahap 4C, RANCANGAN 9 Mutasi Hutang Pemasok versi saldo). Hanya membaca. Saldo per pemasok = sisa faktur
// Diposting + sisa pembelian langsung kredit Diposting - nota debit retur yang belum terpakai. Barang diterima belum
// difakturkan ditampilkan terpisah dan tidak dihitung sebagai hutang. Umur dari jatuh tempo. Tanpa impor Next.
import type { Db } from '../db'
import { Desimal, des, keRupiah } from '../stok/angka'
import { tanggalIso } from '../waktu'

export type BarisDokHutang = {
  jenis: 'Faktur' | 'Pembelian langsung' | 'Nota debit'
  jalur: string
  id: number
  no: string
  ref: string
  pemasok: string
  supplierId: number
  date: Date
  dueDate: Date | null
  total: bigint
  dibayar: bigint
  sisa: bigint
  umur: number | null
  kelompok: string
}

export const KELOMPOK_UMUR = ['Belum jatuh tempo', '1-30 hari', '31-60 hari', '61-90 hari', 'Di atas 90 hari'] as const

const hari = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000

// Umur hutang dalam hari dari jatuh tempo sampai tanggal acuan (WIB). Tanpa jatuh tempo dianggap jatuh tempo di tanggal dokumen.
export function umurHutang(jatuh: Date | null, tanggal: Date, acuan: Date) {
  const tempo = (jatuh ?? tanggal).toISOString().slice(0, 10)
  return Math.round(hari(tanggalIso(acuan)) - hari(tempo))
}

export const kelompokUmur = (umur: number) => (umur <= 0 ? KELOMPOK_UMUR[0] : umur <= 30 ? KELOMPOK_UMUR[1] : umur <= 60 ? KELOMPOK_UMUR[2] : umur <= 90 ? KELOMPOK_UMUR[3] : KELOMPOK_UMUR[4])

export type SaringHutang = { pemasok?: string }

export async function hutangPemasok(db: Db, s: SaringHutang = {}, acuan = new Date()) {
  const pemasok = s.pemasok && /^\d+$/.test(s.pemasok) ? Number(s.pemasok) : undefined
  const sp = pemasok ? { supplierId: pemasok } : {}
  const [faktur, langsung, retur, terima] = await Promise.all([
    db.purchaseInvoice.findMany({ where: { ...sp, status: 'Diposting', payStatus: { not: 'Lunas' } }, include: { supplier: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.directPurchase.findMany({ where: { ...sp, status: 'Diposting', payMode: 'kredit', payStatus: { not: 'Lunas' } }, include: { supplier: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.purchaseReturn.findMany({ where: { ...sp, status: 'Diposting', debitNoteAmount: { gt: 0 } }, include: { supplier: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.goodsReceipt.findMany({ where: { ...sp, status: 'Diposting', invoiceProgress: { not: 'Penuh' } }, include: { supplier: true, goodsReceiptLines: true, purchaseInvoiceLines: { where: { kind: 'biaya_terima', purchaseInvoice: { status: 'Diposting' } }, select: { id: true } } }, take: 2000 }),
  ])
  const dok: BarisDokHutang[] = []
  const tambah = (x: Omit<BarisDokHutang, 'umur' | 'kelompok'>) => {
    const umur = x.jenis === 'Nota debit' ? null : umurHutang(x.dueDate, x.date, acuan)
    dok.push({ ...x, umur, kelompok: umur === null ? '-' : kelompokUmur(umur) })
  }
  for (const f of faktur) tambah({ jenis: 'Faktur', jalur: '/faktur', id: f.id, no: f.no, ref: f.supplierInvoiceNo, pemasok: f.supplier.name, supplierId: f.supplierId, date: f.date, dueDate: f.dueDate, total: f.total, dibayar: f.paidAmount, sisa: f.total - f.paidAmount })
  for (const f of langsung) tambah({ jenis: 'Pembelian langsung', jalur: '/beli-langsung', id: f.id, no: f.no, ref: f.supplierInvoiceNo, pemasok: f.supplier.name, supplierId: f.supplierId, date: f.date, dueDate: f.dueDate, total: f.total, dibayar: f.paidAmount, sisa: f.total - f.paidAmount })
  for (const r of retur) {
    if (r.debitNoteAmount <= r.debitNoteUsed) continue
    tambah({ jenis: 'Nota debit', jalur: '/retur-beli', id: r.id, no: r.no, ref: r.reason, pemasok: r.supplier.name, supplierId: r.supplierId, date: r.date, dueDate: null, total: -r.debitNoteAmount, dibayar: -r.debitNoteUsed, sisa: -(r.debitNoteAmount - r.debitNoteUsed) })
  }
  // Barang diterima belum difakturkan per pemasok: qty sisa x harga terima, ditambah biaya tambahan yang belum tertagih.
  const bdbf = new Map<number, bigint>()
  for (const g of terima) {
    let n = g.purchaseInvoiceLines.length || g.extraCost === 0n ? 0n : g.extraCost
    for (const b of g.goodsReceiptLines) {
      const sisa = Desimal.max(0, des(b.qty).minus(des(b.qtyInvoiced)).minus(des(b.qtyRetUninv)))
      if (sisa.gt(0)) n += keRupiah(sisa.times(des(b.price)))
    }
    if (n) bdbf.set(g.supplierId, (bdbf.get(g.supplierId) ?? 0n) + n)
  }
  const peta = new Map<number, { supplierId: number; pemasok: string; tagihan: bigint; nota: bigint; saldo: bigint; jatuhTempo: bigint; dokumen: number; belumFaktur: bigint }>()
  const ambil = (id: number, nama: string) => {
    if (!peta.has(id)) peta.set(id, { supplierId: id, pemasok: nama, tagihan: 0n, nota: 0n, saldo: 0n, jatuhTempo: 0n, dokumen: 0, belumFaktur: 0n })
    return peta.get(id)!
  }
  for (const d of dok) {
    const p = ambil(d.supplierId, d.pemasok)
    if (d.jenis === 'Nota debit') p.nota += -d.sisa
    else {
      p.tagihan += d.sisa
      if ((d.umur ?? 0) > 0) p.jatuhTempo += d.sisa
    }
    p.saldo += d.sisa
    p.dokumen++
  }
  for (const g of terima) if (bdbf.get(g.supplierId)) ambil(g.supplierId, g.supplier.name).belumFaktur = bdbf.get(g.supplierId)!
  const perPemasok = [...peta.values()].sort((a, b) => a.pemasok.localeCompare(b.pemasok, 'id'))
  const umur = KELOMPOK_UMUR.map((k) => ({ kelompok: k, sisa: dok.filter((d) => d.kelompok === k).reduce((n, d) => n + d.sisa, 0n) }))
  return {
    perPemasok,
    dokumen: dok.sort((a, b) => a.pemasok.localeCompare(b.pemasok, 'id') || (a.dueDate ?? a.date).getTime() - (b.dueDate ?? b.date).getTime() || a.id - b.id),
    umur,
    total: perPemasok.reduce((n, p) => n + p.saldo, 0n),
    belumFaktur: perPemasok.reduce((n, p) => n + p.belumFaktur, 0n),
  }
}

// CSV dokumen hutang, gaya sama dengan CSV laporan (BOM UTF-8, koma, angka tanpa format, sel berbahaya dikutip).
export function csvHutang(dok: BarisDokHutang[]) {
  const sel = (v: string | number | bigint | null) => {
    let t = v === null ? '' : String(v)
    if (/^[=+\-@]/.test(t) && typeof v === 'string') t = `'${t}`
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const kepala = ['Pemasok', 'Jenis', 'Nomor', 'Nomor pemasok atau alasan', 'Tanggal', 'Jatuh tempo', 'Total', 'Dibayar', 'Sisa', 'Umur (hari)', 'Kelompok umur']
  const baris = dok.map((d) => [d.pemasok, d.jenis, d.no, d.ref, d.date.toISOString().slice(0, 10), d.dueDate ? d.dueDate.toISOString().slice(0, 10) : '', d.total, d.dibayar, d.sisa, d.umur, d.kelompok])
  return '﻿' + [kepala, ...baris].map((b) => b.map((x) => sel(x as string)).join(',')).join('\r\n') + '\r\n'
}
