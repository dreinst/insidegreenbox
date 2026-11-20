// Piutang Pelanggan (tahap 6A, kas.piutang). Hanya membaca. Saldo per pelanggan = sisa faktur penjualan Diposting - nota
// kredit retur yang belum terpakai. Umur dari jatuh tempo ke hari ini (WIB), kelompoknya sama dengan Hutang Pemasok.
// Tanpa impor Next.
import type { Db } from '../db'
import { KELOMPOK_UMUR, kelompokUmur, umurHutang } from '../beli/hutang'

export type BarisDokPiutang = {
  jenis: 'Faktur' | 'Nota kredit'
  jalur: string
  id: number
  no: string
  ref: string
  pelanggan: string
  customerId: number
  date: Date
  dueDate: Date | null
  total: bigint
  dibayar: bigint
  sisa: bigint
  umur: number | null
  kelompok: string
}

export { KELOMPOK_UMUR }

export type SaringPiutang = { pelanggan?: string }

export async function piutangPelanggan(db: Db, s: SaringPiutang = {}, acuan = new Date()) {
  const pelanggan = s.pelanggan && /^\d+$/.test(s.pelanggan) ? Number(s.pelanggan) : undefined
  const sp = pelanggan ? { customerId: pelanggan } : {}
  const [faktur, retur] = await Promise.all([
    db.salesInvoice.findMany({ where: { ...sp, status: 'Diposting', payStatus: { not: 'Lunas' } }, include: { customer: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.salesReturn.findMany({ where: { ...sp, status: 'Diposting', total: { gt: 0 } }, include: { customer: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 2000 }),
  ])
  const dok: BarisDokPiutang[] = []
  for (const f of faktur) {
    const umur = umurHutang(f.dueDate, f.date, acuan)
    dok.push({ jenis: 'Faktur', jalur: '/faktur-jual', id: f.id, no: f.no, ref: f.customerRef, pelanggan: f.customer.name, customerId: f.customerId, date: f.date, dueDate: f.dueDate, total: f.total, dibayar: f.paidAmount, sisa: f.total - f.paidAmount, umur, kelompok: kelompokUmur(umur) })
  }
  for (const r of retur) {
    if (r.total <= r.creditUsed) continue
    dok.push({ jenis: 'Nota kredit', jalur: '/retur-jual', id: r.id, no: r.no, ref: r.reason, pelanggan: r.customer.name, customerId: r.customerId, date: r.date, dueDate: null, total: -r.total, dibayar: -r.creditUsed, sisa: -(r.total - r.creditUsed), umur: null, kelompok: '-' })
  }
  const peta = new Map<number, { customerId: number; pelanggan: string; tagihan: bigint; kredit: bigint; saldo: bigint; jatuhTempo: bigint; dokumen: number }>()
  for (const d of dok) {
    if (!peta.has(d.customerId)) peta.set(d.customerId, { customerId: d.customerId, pelanggan: d.pelanggan, tagihan: 0n, kredit: 0n, saldo: 0n, jatuhTempo: 0n, dokumen: 0 })
    const p = peta.get(d.customerId)!
    if (d.jenis === 'Nota kredit') p.kredit += -d.sisa
    else {
      p.tagihan += d.sisa
      if ((d.umur ?? 0) > 0) p.jatuhTempo += d.sisa
    }
    p.saldo += d.sisa
    p.dokumen++
  }
  const perPelanggan = [...peta.values()].sort((a, b) => a.pelanggan.localeCompare(b.pelanggan, 'id'))
  const umur = KELOMPOK_UMUR.map((k) => ({ kelompok: k, sisa: dok.filter((d) => d.kelompok === k).reduce((n, d) => n + d.sisa, 0n) }))
  return {
    perPelanggan,
    dokumen: dok.sort((a, b) => a.pelanggan.localeCompare(b.pelanggan, 'id') || (a.dueDate ?? a.date).getTime() - (b.dueDate ?? b.date).getTime() || a.id - b.id),
    umur,
    kredit: perPelanggan.reduce((n, p) => n + p.kredit, 0n),
    total: perPelanggan.reduce((n, p) => n + p.saldo, 0n),
  }
}

// CSV dokumen piutang, gaya sama dengan CSV laporan dan hutang (BOM UTF-8, koma, angka tanpa format, sel berbahaya dikutip).
export function csvPiutang(dok: BarisDokPiutang[]) {
  const sel = (v: string | number | bigint | null) => {
    let t = v === null ? '' : String(v)
    if (/^[=+\-@]/.test(t) && typeof v === 'string') t = `'${t}`
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const kepala = ['Pelanggan', 'Jenis', 'Nomor', 'Rujukan atau alasan', 'Tanggal', 'Jatuh tempo', 'Total', 'Dibayar', 'Sisa', 'Umur (hari)', 'Kelompok umur']
  const baris = dok.map((d) => [d.pelanggan, d.jenis, d.no, d.ref, d.date.toISOString().slice(0, 10), d.dueDate ? d.dueDate.toISOString().slice(0, 10) : '', d.total, d.dibayar, d.sisa, d.umur, d.kelompok])
  return '﻿' + [kepala, ...baris].map((b) => b.map((x) => sel(x as string)).join(',')).join('\r\n') + '\r\n'
}
