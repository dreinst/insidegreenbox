// Penjualan B2B dan Profil Usaha tahap 6A: harga khusus pelanggan, pesanan, faktur sebagian dengan HPP rata-rata, qty
// faktur tidak melebihi sisa pesanan, alokasi penerimaan dan status bayar, retur dengan HPP asal, pembatalan yang
// ditolak karena turunan, piutang, dan persen pajak dari Profil Usaha yang dipakai kasir.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { buatFakturJual, simpanBarisFakturJual, tambahBarisFakturJual, ubahStatusFakturJual } from '../src/lib/b2b/faktur'
import { simpanHargaPelanggan, tambahPelanggan } from '../src/lib/b2b/pelanggan'
import { buatTerima, piutangTerbuka, simpanAlokasiTerima, ubahStatusTerima } from '../src/lib/b2b/penerimaan'
import { buatPesananJual, tambahBarisPesananJual, ubahStatusPesananJual } from '../src/lib/b2b/pesanan'
import { csvPiutang, piutangPelanggan } from '../src/lib/b2b/piutang'
import { buatReturJual, simpanBarisReturJual, ubahStatusReturJual } from '../src/lib/b2b/retur'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { simpanPenjualan } from '../src/lib/penjualan'
import { ubahProfil } from '../src/lib/profil'
import { bukaShift } from '../src/lib/shift'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { catatGerak, periksaRantai, periksaSaldo } from '../src/lib/stok/mesin'
import { simpanKonversi, tambahProduk } from '../src/lib/stok/produk'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let outlet: number
let gram: number
let kg: number
let kopi: number
let pelanggan: number
let fj1 = 0
let fj2 = 0
let so1 = 0

const tgl = () => hariIni().toISOString().slice(0, 10)
const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)
const saldo = async (p: number) => {
  const b = await db.stockBalance.findUnique({ where: { productId_locationId: { productId: p, locationId: outlet } } })
  return { qty: b?.qty.toString() ?? '0', nilai: b?.value ?? 0n, rata: b?.avgCost.toString() ?? '0' }
}
const masuk = (qty: string, harga: string, no: number) =>
  db.$transaction((tx) => catatGerak(tx, { docType: 'uji', docId: no, docNo: `UJI-${no}`, tanggal: hariIni(), oleh: null }, [{ productId: kopi, locationId: outlet, qty, hargaSatuan: harga }]))
const isiBaris = async (fakturId: number, qty: string[]) => {
  const baris = await db.salesInvoiceLine.findMany({ where: { salesInvoiceId: fakturId }, orderBy: { id: 'asc' } })
  return Object.fromEntries(baris.map((b, i) => [`qty_${b.id}`, qty[i] ?? '0']))
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('b2b'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  kg = (await db.unit.findFirstOrThrow({ where: { name: 'kilogram' } })).id
  kopi = (await tambahProduk(db, k(owner), owner, { code: 'UJI-BIJI', name: 'Biji kopi uji', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  await simpanKonversi(db, k(owner), owner, kopi, { unitId: String(kg), factor: '1000' })
  // Dua kali masuk dengan harga berbeda: 1000 g @ 150 dan 2000 g @ 225, rata-rata (150.000 + 450.000) / 3000 = 200 per gram.
  await masuk('1000', '150', 1)
  await masuk('2000', '225', 2)
})
after(() => hapus())

describe('pelanggan dan harga khusus', () => {
  test('harga khusus menjadi harga bawaan, dan mengubahnya butuh saklar b2b.ubah_harga', async () => {
    const c = await tambahPelanggan(db, k(admin), admin, { code: 'cus-kantor', name: 'Kantor Maju', paymentDays: '14' })
    assert.equal(c.code, 'CUS-KANTOR')
    pelanggan = c.id
    await galat(() => tambahPelanggan(db, k(admin), admin, { code: 'CUS-LAIN', name: 'kantor maju' }), /Nama pelanggan sudah dipakai/)
    await ditolak(() => simpanHargaPelanggan(db, k(kasir), kasir, pelanggan, { item: `${kopi}:${kg}`, price: '400000' }))
    assert.equal(await simpanHargaPelanggan(db, k(admin), admin, pelanggan, { item: `${kopi}:${kg}`, price: '400000' }), 1)
    assert.equal(await simpanHargaPelanggan(db, k(admin), admin, pelanggan, { item: `${kopi}:${kg}`, price: '400000' }), 0)

    const so = await buatPesananJual(db, k(admin), admin, { customerId: String(pelanggan), locationId: String(outlet), date: tgl() })
    so1 = so.id
    const b = await tambahBarisPesananJual(db, k(admin), admin, so.id, { item: `${kopi}:${kg}`, qty: '2' })
    assert.equal(b.price, 400000n, 'harga bawaan dari harga khusus')
    // Admin tidak punya saklar b2b.ubah_harga: harga lain ditolak. Owner boleh.
    await galat(() => tambahBarisPesananJual(db, k(admin), admin, so.id, { item: `${kopi}:${kg}`, qty: '1', price: '350000' }), /harga khusus pelanggan/)
    // Produk dan satuan tanpa harga khusus bebas harga, tapi harga wajib diisi.
    await galat(() => tambahBarisPesananJual(db, k(admin), admin, so.id, { item: `${kopi}:${gram}`, qty: '10' }), /belum punya harga khusus/)
    const lain = await buatPesananJual(db, k(owner), owner, { customerId: String(pelanggan), locationId: String(outlet), date: tgl() })
    assert.equal((await tambahBarisPesananJual(db, k(owner), owner, lain.id, { item: `${kopi}:${kg}`, qty: '1', price: '350000' })).price, 350000n)
    const kepala = await db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })
    assert.equal(kepala.total, 800000n)
    const audit = await db.auditLog.findMany({ where: { docType: 'customer', docId: String(pelanggan) }, select: { action: true } })
    assert.deepEqual(audit.map((a) => a.action).sort(), ['pelanggan.harga_tambah', 'pelanggan.tambah'])
  })
})

describe('pesanan dan faktur penjualan', () => {
  test('pesanan tanpa aturan persetujuan dikonfirmasi Admin, faktur sebagian mengeluarkan stok dengan HPP rata-rata', async () => {
    await ubahStatusPesananJual(db, k(admin), admin, so1, 'setujui')
    assert.equal((await db.salesOrder.findUniqueOrThrow({ where: { id: so1 } })).status, 'Disetujui')
    const f = await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so1), locationId: String(outlet), date: tgl() })
    fj1 = f.id
    const kepala = await db.salesInvoice.findUniqueOrThrow({ where: { id: f.id } })
    assert.equal(kepala.customerId, pelanggan)
    assert.equal(kepala.dueDate?.getTime(), hariIni().getTime() + 14 * 86_400_000, 'jatuh tempo = tanggal + termin pelanggan')
    assert.equal(kepala.total, 800000n, 'baris bawaan = sisa pesanan')
    // Faktur dari pesanan tidak menerima baris langsung.
    await galat(() => tambahBarisFakturJual(db, k(admin), admin, f.id, { item: `${kopi}:${kg}`, qty: '1' }), /hanya memakai baris pesanannya/)
    await simpanBarisFakturJual(db, k(admin), admin, f.id, await isiBaris(f.id, ['1,5']))
    // Admin memegang L T U H di b2b.faktur (RANCANGAN 8.2), jadi mengajukan; Owner memposting.
    await ditolak(() => ubahStatusFakturJual(db, k(admin), admin, f.id, 'posting'))
    await ubahStatusFakturJual(db, k(admin), admin, f.id, 'ajukan')
    await ubahStatusFakturJual(db, k(owner), owner, f.id, 'posting')
    const sesudah = await db.salesInvoice.findUniqueOrThrow({ where: { id: f.id }, include: { salesInvoiceLines: true } })
    assert.equal(sesudah.status, 'Diposting')
    assert.equal(sesudah.total, 600000n)
    assert.equal(sesudah.hpp, 300000n, '1.500 g x rata-rata 200')
    assert.equal(sesudah.salesInvoiceLines[0].unitCost.toString(), '200')
    assert.equal(sesudah.payStatus, 'BelumBayar')
    assert.deepEqual(await saldo(kopi), { qty: '1500', nilai: 300000n, rata: '200' })
    const ledger = await db.stockLedger.findFirstOrThrow({ where: { docType: 'sales_invoice', docId: f.id } })
    assert.equal(ledger.qty.toString(), '-1500')
    const so = await db.salesOrder.findUniqueOrThrow({ where: { id: so1 }, include: { salesOrderLines: true } })
    assert.equal(so.invoiceProgress, 'Sebagian')
    assert.equal(so.salesOrderLines[0].qtyInvoiced.toString(), '1.5')
  })

  test('qty faktur tidak boleh melebihi sisa pesanan; pesanan Selesai otomatis saat difakturkan penuh', async () => {
    const a = await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so1), locationId: String(outlet), date: tgl() })
    const b = await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so1), locationId: String(outlet), date: tgl() })
    await galat(async () => simpanBarisFakturJual(db, k(admin), admin, a.id, await isiBaris(a.id, ['0,6'])), /melebihi sisa pesanan/)
    // Dua draf sama-sama berisi sisa 0,5 kg; yang pertama diposting dan menutup pesanan, yang kedua ditolak.
    await ubahStatusFakturJual(db, k(owner), owner, a.id, 'posting')
    fj2 = a.id
    await galat(() => ubahStatusFakturJual(db, k(owner), owner, b.id, 'posting'), /tidak lagi berstatus Disetujui/)
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: b.id } })).status, 'Draft')
    const so = await db.salesOrder.findUniqueOrThrow({ where: { id: so1 } })
    assert.equal(so.invoiceProgress, 'Penuh')
    assert.equal(so.status, 'Selesai', 'pesanan Selesai otomatis saat difakturkan penuh')
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: a.id } })).hpp, 100000n)
    await galat(() => buatFakturJual(db, k(admin), admin, { salesOrderId: String(so1), locationId: String(outlet), date: tgl() }), /Disetujui/)
  })
})

describe('penerimaan pelanggan', () => {
  test('alokasi memperbarui status bayar: Sebagian lalu Lunas; alokasi melebihi sisa ditolak', async () => {
    const t1 = await buatTerima(db, k(admin), admin, { customerId: String(pelanggan), date: tgl(), tujuan: 'kas' })
    await galat(() => simpanAlokasiTerima(db, k(admin), admin, t1.id, { [`terima_f${fj1}`]: '600001' }), /melebihi sisanya/)
    await simpanAlokasiTerima(db, k(admin), admin, t1.id, { [`terima_f${fj1}`]: '200000' })
    assert.equal((await db.customerPayment.findUniqueOrThrow({ where: { id: t1.id } })).amount, 200000n)
    // Status bayar belum berubah sebelum Diposting.
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: fj1 } })).payStatus, 'BelumBayar')
    await ditolak(() => ubahStatusTerima(db, k(admin), admin, t1.id, 'posting'))
    await ubahStatusTerima(db, k(owner), owner, t1.id, 'posting')
    let f = await db.salesInvoice.findUniqueOrThrow({ where: { id: fj1 } })
    assert.equal(f.paidAmount, 200000n)
    assert.equal(f.payStatus, 'Sebagian')

    const t2 = await buatTerima(db, k(admin), admin, { customerId: String(pelanggan), date: tgl(), tujuan: 'kas' })
    await simpanAlokasiTerima(db, k(admin), admin, t2.id, { [`terima_f${fj1}`]: '400000' })
    await ubahStatusTerima(db, k(owner), owner, t2.id, 'posting')
    f = await db.salesInvoice.findUniqueOrThrow({ where: { id: fj1 } })
    assert.equal(f.payStatus, 'Lunas')
    assert.equal(f.paidAmount, 600000n)
    assert.ok(!(await piutangTerbuka(db, pelanggan)).some((p) => p.kunci === `f${fj1}`))
  })
})

describe('retur penjualan', () => {
  test('barang kembali dengan HPP asal faktur, bukan rata-rata saat ini, dan nota kredit = qty x harga jual', async () => {
    // Harga rata-rata berubah sesudah faktur: 1000 g masuk @ 500 sehingga rata-rata menjadi (200.000 + 500.000) / 2000 = 350.
    await masuk('1000', '500', 3)
    assert.equal((await saldo(kopi)).rata, '350')
    const r = await buatReturJual(db, k(admin), admin, { salesInvoiceId: String(fj2), date: tgl(), reason: 'Kemasan sobek saat kirim' })
    const asal = await db.salesInvoiceLine.findFirstOrThrow({ where: { salesInvoiceId: fj2 } })
    await galat(() => simpanBarisReturJual(db, k(admin), admin, r.id, { [`qty_${asal.id}`]: '0,6' }), /melebihi qty yang belum diretur/)
    await simpanBarisReturJual(db, k(admin), admin, r.id, { [`qty_${asal.id}`]: '0,25' })
    await ditolak(() => ubahStatusReturJual(db, k(admin), admin, r.id, 'posting'))
    await ubahStatusReturJual(db, k(owner), owner, r.id, 'posting')
    const sesudah = await db.salesReturn.findUniqueOrThrow({ where: { id: r.id }, include: { salesReturnLines: true } })
    assert.equal(sesudah.status, 'Diposting')
    assert.equal(sesudah.value, 50000n, '250 g x HPP asal 200')
    assert.equal(sesudah.total, 100000n, '0,25 kg x Rp 400.000')
    assert.equal(sesudah.salesReturnLines[0].unitCost.toString(), '200')
    const g = await db.stockLedger.findFirstOrThrow({ where: { docType: 'sales_return', docId: r.id } })
    assert.equal(g.qty.toString(), '250')
    assert.equal(g.value, 50000n)
    assert.deepEqual(await saldo(kopi), { qty: '2250', nilai: 750000n, rata: '333.3333' })
    assert.equal((await db.salesInvoiceLine.findUniqueOrThrow({ where: { id: asal.id } })).qtyReturned.toString(), '0.25')

    // Retur sisa baris mengambil sisa HPP dan sisa jumlah baris persis.
    const r2 = await buatReturJual(db, k(admin), admin, { salesInvoiceId: String(fj2), date: tgl(), reason: 'Sisa ditolak pelanggan' })
    await simpanBarisReturJual(db, k(admin), admin, r2.id, { [`qty_${asal.id}`]: '0,25' })
    await ubahStatusReturJual(db, k(owner), owner, r2.id, 'posting')
    const r2s = await db.salesReturn.findUniqueOrThrow({ where: { id: r2.id } })
    assert.equal(r2s.value + sesudah.value, 100000n, 'jumlah HPP retur = HPP baris faktur')
    assert.equal(r2s.total + sesudah.total, 200000n)
    // Batalkan retur kedua (gerak balik) supaya piutang berikutnya memakai satu nota kredit saja.
    await ubahStatusReturJual(db, k(owner), owner, r2.id, 'batal', { alasan: 'Pelanggan jadi menerima barangnya' })
    assert.equal((await db.salesInvoiceLine.findUniqueOrThrow({ where: { id: asal.id } })).qtyReturned.toString(), '0.25')
    assert.deepEqual(await periksaSaldo(db, { productId: kopi }), [])
    assert.equal(await periksaRantai(db), 0)
  })

  test('nota kredit dipakai di penerimaan sebagai pengurang', async () => {
    const t = await buatTerima(db, k(admin), admin, { customerId: String(pelanggan), date: tgl(), tujuan: 'kas' })
    const retur = await db.salesReturn.findFirstOrThrow({ where: { salesInvoiceId: fj2, status: 'Diposting' } })
    await galat(() => simpanAlokasiTerima(db, k(admin), admin, t.id, { [`terima_r${retur.id}`]: '100000' }), /tidak boleh lebih besar/)
    await simpanAlokasiTerima(db, k(admin), admin, t.id, { [`terima_f${fj2}`]: '150000', [`terima_r${retur.id}`]: '100000' })
    assert.equal((await db.customerPayment.findUniqueOrThrow({ where: { id: t.id } })).amount, 50000n)
    await ubahStatusTerima(db, k(owner), owner, t.id, 'posting')
    const f = await db.salesInvoice.findUniqueOrThrow({ where: { id: fj2 } })
    assert.equal(f.paidAmount, 150000n)
    assert.equal(f.payStatus, 'Sebagian')
    assert.equal((await db.salesReturn.findUniqueOrThrow({ where: { id: retur.id } })).creditUsed, 100000n)
  })
})

describe('pembatalan dengan turunan', () => {
  test('faktur yang dibayar, faktur yang punya retur, retur yang kreditnya terpakai, dan pesanan yang punya faktur ditolak', async () => {
    await galat(() => ubahStatusFakturJual(db, k(owner), owner, fj1, 'batal', { alasan: 'Salah pelanggan' }), /sudah dibayar/)
    const retur = await db.salesReturn.findFirstOrThrow({ where: { salesInvoiceId: fj2, status: 'Diposting' } })
    await galat(() => ubahStatusReturJual(db, k(owner), owner, retur.id, 'batal', { alasan: 'Salah input retur' }), /sudah dipakai penerimaan/)
    // Admin tidak memegang saklar dok.batal_posting dan izin Posting.
    await ditolak(() => ubahStatusFakturJual(db, k(admin), admin, fj1, 'batal', { alasan: 'Salah pelanggan' }))
    // Pesanan Disetujui dengan draf faktur tidak bisa dibatalkan.
    const so = await buatPesananJual(db, k(admin), admin, { customerId: String(pelanggan), locationId: String(outlet), date: tgl() })
    await tambahBarisPesananJual(db, k(admin), admin, so.id, { item: `${kopi}:${kg}`, qty: '1' })
    await ubahStatusPesananJual(db, k(admin), admin, so.id, 'setujui')
    await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so.id), locationId: String(outlet), date: tgl() })
    await galat(() => ubahStatusPesananJual(db, k(admin), admin, so.id, 'batal'), /sudah punya faktur/)

    // Sesudah penerimaan dibatalkan, faktur pertama bisa dibatalkan: stok kembali dan pesanan dibuka lagi.
    const terima = await db.customerPaymentAlloc.findMany({ where: { salesInvoiceId: fj1 }, select: { customerPaymentId: true } })
    for (const t of terima) await ubahStatusTerima(db, k(owner), owner, t.customerPaymentId, 'batal', { alasan: 'Transfer ditolak bank' })
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: fj1 } })).payStatus, 'BelumBayar')
    const sebelum = await saldo(kopi)
    await ubahStatusFakturJual(db, k(owner), owner, fj1, 'batal', { alasan: 'Salah pelanggan' })
    const sesudah = await saldo(kopi)
    assert.equal(Number(sesudah.qty) - Number(sebelum.qty), 1500)
    assert.equal(sesudah.nilai - sebelum.nilai, 300000n, 'gerak balik memakai nilai faktur')
    const so1s = await db.salesOrder.findUniqueOrThrow({ where: { id: so1 } })
    assert.equal(so1s.status, 'Disetujui', 'pesanan yang Selesai otomatis dibuka lagi')
    assert.equal(so1s.invoiceProgress, 'Sebagian')
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'faktur_jual.batal', docId: String(fj1) } })
    assert.match(audit.summary, /gerak balik/)
  })
})

describe('sisa pesanan saat posting', () => {
  test('dua draf yang jumlahnya melebihi sisa pesanan: draf kedua ditolak saat posting', async () => {
    const c = await tambahPelanggan(db, k(admin), admin, { code: 'CUS-B', name: 'Kafe Tetangga' })
    const so = await buatPesananJual(db, k(admin), admin, { customerId: String(c.id), locationId: String(outlet), date: tgl() })
    await tambahBarisPesananJual(db, k(admin), admin, so.id, { item: `${kopi}:${kg}`, qty: '1', price: '380000' })
    await ubahStatusPesananJual(db, k(admin), admin, so.id, 'setujui')
    const a = await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so.id), locationId: String(outlet), date: tgl() })
    const b = await buatFakturJual(db, k(admin), admin, { salesOrderId: String(so.id), locationId: String(outlet), date: tgl() })
    await simpanBarisFakturJual(db, k(admin), admin, a.id, await isiBaris(a.id, ['0,6']))
    await simpanBarisFakturJual(db, k(admin), admin, b.id, await isiBaris(b.id, ['0,6']))
    await ubahStatusFakturJual(db, k(owner), owner, a.id, 'posting')
    await galat(() => ubahStatusFakturJual(db, k(owner), owner, b.id, 'posting'), /melebihi sisa pesanan .* \(0,4\)/)
    const s = await db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })
    assert.equal(s.status, 'Disetujui')
    assert.equal(s.invoiceProgress, 'Sebagian')
  })
})

describe('piutang pelanggan', () => {
  test('saldo = sisa faktur - nota kredit belum terpakai, dengan umur dan CSV', async () => {
    const h = await piutangPelanggan(db, { pelanggan: String(pelanggan) })
    const faktur = await db.salesInvoice.findMany({ where: { customerId: pelanggan, status: 'Diposting' } })
    const harap = faktur.reduce((n, f) => n + f.total - f.paidAmount, 0n)
    assert.equal(h.total, harap)
    assert.equal(h.total, 50000n, 'FJ kedua Rp 200.000 - dibayar Rp 150.000')
    assert.equal(h.perPelanggan[0].jatuhTempo, 0n)
    assert.equal(h.umur[0].sisa, 50000n, 'belum jatuh tempo')
    assert.equal(h.umur.reduce((n, u) => n + u.sisa, 0n), h.total, 'jumlah kelompok umur = saldo (temuan audit B-4)')
    const csv = csvPiutang(h.dokumen)
    assert.ok(csv.startsWith('﻿Pelanggan,Jenis,Nomor'))
    assert.match(csv, /Kantor Maju,Faktur,FJ-/)
  })
})

describe('profil usaha', () => {
  test('hanya Owner yang mengubah; persen pajak baru dipakai kasir di transaksi berikutnya', async () => {
    const cabang = await db.branch.findFirstOrThrow({ where: { locations: { some: { id: outlet } } } })
    const isi = { name: 'Greenbox Kopi', address: 'Jl. Uji 1', npwp: '01.234.567.8-901.000', phone: '0812', taxPct: '10', servicePct: '5', receiptHeader: 'GREENBOX', receiptFooter: 'Sampai jumpa' }
    const tanpaLogo = { pilihan: '', berkas: null }
    await ditolak(() => ubahProfil(db, k(admin), admin, cabang.id, isi, tanpaLogo))
    await assert.rejects(() => ubahProfil(db, k(owner), owner, cabang.id, { ...isi, taxPct: '30' }, tanpaLogo), /antara 0 dan 25/)
    assert.ok((await ubahProfil(db, k(owner), owner, cabang.id, isi, tanpaLogo)) > 0)
    assert.equal(await ubahProfil(db, k(owner), owner, cabang.id, isi, tanpaLogo), 0, 'tanpa perubahan tidak dicatat')

    const menu = (await db.menuItem.create({ data: { name: 'Kopi Profil', category: (await db.menuCategory.create({ data: { code: 'uji', name: 'Uji' } })).code, price: 10000n } })).id
    const tunai = (await db.paymentMethod.create({ data: { name: 'Tunai', kind: 'tunai' } })).id
    await bukaShift(db, k(kasir), kasir, { modal: '0' })
    const j1 = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu, qty: 1 }], bayar: [{ metodeId: tunai, jumlah: 20000 }] })
    const s1 = await db.sale.findUniqueOrThrow({ where: { id: j1.id } })
    assert.equal(Number(s1.taxPct), 10)
    assert.equal(Number(s1.svcPct), 5)
    assert.equal(s1.svc, 500n)
    assert.equal(s1.tax, 1050n, 'pajak dari harga ditambah service')

    await ubahProfil(db, k(owner), owner, cabang.id, { ...isi, taxPct: '11', servicePct: '0' }, tanpaLogo)
    const j2 = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu, qty: 1 }], bayar: [{ metodeId: tunai, jumlah: 20000 }] })
    const s2 = await db.sale.findUniqueOrThrow({ where: { id: j2.id } })
    assert.equal(Number(s2.taxPct), 11)
    assert.equal(s2.tax, 1100n)
    assert.equal(s2.svc, 0n)
    // Transaksi lama tetap memakai persen saat dijual.
    assert.equal(Number((await db.sale.findUniqueOrThrow({ where: { id: j1.id } })).taxPct), 10)
    const audit = await db.auditLog.findMany({ where: { action: 'profil.ubah', docType: 'branch' } })
    assert.equal(audit.length, 2)
    assert.match(audit[1].summary, /pajak PB1/)
  })
})
