// Hutang Pemasok (tahap 4C, RANCANGAN 9 Mutasi Hutang Pemasok versi saldo). Hanya membaca. Saldo per pemasok = sisa faktur
// Diposting + sisa pembelian langsung kredit Diposting - nota debit retur yang belum terpakai. Barang diterima belum
// difakturkan ditampilkan terpisah dan tidak dihitung sebagai hutang. Umur dari jatuh tempo. Tanpa impor Next.
import type { Db, DbAtauTx } from '../db'
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

// Barang diterima belum difakturkan per pemasok (tahap 5C): nilai penerimaan Diposting (subtotal + biaya tambahan)
// dikurangi nilai terima yang sudah difakturkan (receipt_value baris barang dan biaya tambahan faktur Diposting) dan
// bagian retur sebelum difakturkan (qty x harga terima). Rumus ini sama persis dengan jurnal BDBF (KONTRAK 11 butir 71),
// jadi saldo akun BDBF di Buku Besar sama dengan totalnya. Pada qty pecahan bisa berbeda 1 rupiah dari qty sisa x harga.
export async function belumDifakturkan(db: DbAtauTx, supplierId?: number) {
  const pemasok = supplierId ?? null
  const baris = await db.$queryRaw<{ supplier_id: number; pemasok: string; n: bigint }[]>`
    SELECT x.supplier_id, s.name AS pemasok, SUM(x.n)::bigint AS n FROM (
      SELECT g.supplier_id, g.subtotal + g.extra_cost AS n FROM goods_receipt g WHERE g.status = 'Diposting'
      UNION ALL
      SELECT g.supplier_id, -l.receipt_value FROM purchase_invoice_line l
        JOIN purchase_invoice f ON f.id = l.purchase_invoice_id JOIN goods_receipt g ON g.id = l.goods_receipt_id
        WHERE f.status = 'Diposting' AND l.kind IN ('barang', 'biaya_terima')
      UNION ALL
      SELECT g.supplier_id, -round(rl.qty_uninvoiced * gl.price) FROM purchase_return_line rl
        JOIN purchase_return r ON r.id = rl.purchase_return_id JOIN goods_receipt_line gl ON gl.id = rl.goods_receipt_line_id
        JOIN goods_receipt g ON g.id = gl.goods_receipt_id
        WHERE r.status = 'Diposting' AND rl.qty_uninvoiced > 0
    ) x JOIN supplier s ON s.id = x.supplier_id
    WHERE ${pemasok}::int IS NULL OR x.supplier_id = ${pemasok}::int
    GROUP BY 1, 2 HAVING SUM(x.n) <> 0`
  return baris.map((b) => ({ supplierId: b.supplier_id, pemasok: b.pemasok, n: BigInt(b.n) }))
}

export async function hutangPemasok(db: Db, s: SaringHutang = {}, acuan = new Date()) {
  const pemasok = s.pemasok && /^\d+$/.test(s.pemasok) ? Number(s.pemasok) : undefined
  const sp = pemasok ? { supplierId: pemasok } : {}
  const [faktur, langsung, retur, terima] = await Promise.all([
    db.purchaseInvoice.findMany({ where: { ...sp, status: 'Diposting', payStatus: { not: 'Lunas' } }, include: { supplier: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.directPurchase.findMany({ where: { ...sp, status: 'Diposting', payMode: 'kredit', payStatus: { not: 'Lunas' } }, include: { supplier: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2000 }),
    db.purchaseReturn.findMany({ where: { ...sp, status: 'Diposting', debitNoteAmount: { gt: 0 } }, include: { supplier: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 2000 }),
    belumDifakturkan(db, pemasok),
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
  const bdbf = new Map(terima.map((t) => [t.supplierId, t.n]))
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
  for (const t of terima) if (bdbf.get(t.supplierId)) ambil(t.supplierId, t.pemasok).belumFaktur = bdbf.get(t.supplierId)!
  const perPemasok = [...peta.values()].sort((a, b) => a.pemasok.localeCompare(b.pemasok, 'id'))
  const umur: { kelompok: string; sisa: bigint }[] = KELOMPOK_UMUR.map((k) => ({ kelompok: k, sisa: dok.filter((d) => d.kelompok === k).reduce((n, d) => n + d.sisa, 0n) }))
  // Temuan audit B-4: nota debit yang belum dipakai mengurangi saldo tetapi tidak punya umur, jadi tampil sebagai
  // kelompok sendiri (bernilai minus) supaya jumlah semua kelompok sama dengan saldo hutang.
  const nota = dok.filter((d) => d.jenis === 'Nota debit').reduce((n, d) => n + d.sisa, 0n)
  if (nota !== 0n) umur.push({ kelompok: 'Nota debit belum dipakai', sisa: nota })
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
