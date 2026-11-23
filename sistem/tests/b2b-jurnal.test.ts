// Jurnal penjualan B2B tahap 6B (KONTRAK 11 butir 96): faktur, penerimaan, dan retur saat diposting dan dibatalkan,
// Piutang Usaha di buku sama dengan halaman Piutang Pelanggan di setiap langkah, periode tertutup menolak posting
// beserta gerak stoknya, dan bentuk ulang untuk faktur lama yang belum berjurnal.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan } from '../src/lib/aksi'
import { bentukUlangJurnal } from '../src/lib/akuntansi/bentuk-ulang'
import { cocokkanPiutang } from '../src/lib/akuntansi/bentuk-ulang-b2b'
import { cocokkanPersediaan } from '../src/lib/akuntansi/laporan'
import { buatFakturJual, tambahBarisFakturJual, ubahStatusFakturJual } from '../src/lib/b2b/faktur'
import { simpanHargaPelanggan, tambahPelanggan } from '../src/lib/b2b/pelanggan'
import { buatTerima, simpanAlokasiTerima, ubahStatusTerima } from '../src/lib/b2b/penerimaan'
import { buatReturJual, simpanBarisReturJual, ubahStatusReturJual } from '../src/lib/b2b/retur'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { catatGerak } from '../src/lib/stok/mesin'
import { simpanKonversi, tambahProduk } from '../src/lib/stok/produk'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let outlet: number
let kg: number
let kopi: number
let pelanggan: number
let fj = 0
let t1 = 0
let t2 = 0
let rj = 0

const tgl = () => hariIni().toISOString().slice(0, 10)
const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}

// Baris jurnal maju (atau balik) dokumen sebagai daftar "kode D/K nilai" yang diurutkan, supaya mudah dibandingkan.
async function barisJurnal(docType: string, docId: number, balik = false) {
  const j = await db.journal.findFirstOrThrow({ where: { sourceType: docType, sourceId: docId, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
  const isi = j.journalLines.map((l) => `${l.account.code} ${l.debit > 0n ? 'D' : 'K'} ${l.debit > 0n ? l.debit : l.credit}${l.customerId ? ` c${l.customerId}` : ''}`).sort()
  return { j, isi }
}

async function piutangCocok(harap: bigint, pesan: string) {
  const c = await cocokkanPiutang(db)
  assert.equal(c.buku, harap, `${pesan}: piutang buku`)
  assert.equal(c.halaman, harap, `${pesan}: halaman Piutang Pelanggan`)
  assert.ok(c.cocok, `${pesan}: cocok per pelanggan ${JSON.stringify(c.selisih, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`)
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('b2bjurnal'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  const gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  kg = (await db.unit.findFirstOrThrow({ where: { name: 'kilogram' } })).id
  kopi = (await tambahProduk(db, k(owner), owner, { code: 'UJI-BIJI', name: 'Biji kopi uji', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  await simpanKonversi(db, k(owner), owner, kopi, { unitId: String(kg), factor: '1000' })
  // Stok awal lewat dokumen yang dijurnal (penyesuaian tidak dipakai di sini, jadi persediaan buku dibandingkan dengan
  // selisih gerak B2B saja): 3000 g @ 200.
  await db.$transaction((tx) => catatGerak(tx, { docType: 'uji', docId: 1, docNo: 'UJI-1', tanggal: hariIni(), oleh: null }, [{ productId: kopi, locationId: outlet, qty: '3000', hargaSatuan: '200' }]))
  pelanggan = (await tambahPelanggan(db, k(admin), admin, { code: 'CUS-JURNAL', name: 'Hotel Jurnal', paymentDays: '30' })).id
  await simpanHargaPelanggan(db, k(admin), admin, pelanggan, { item: `${kopi}:${kg}`, price: '400000' })
})
after(() => hapus())

// Stok awal tidak berjurnal (doc_type uji), jadi persediaan buku = nilai stok dikurangi nilai awal Rp 600.000.
const persediaanBersih = async () => {
  const p = await cocokkanPersediaan(db)
  return p.buku - (p.stok - 600000)
}

describe('jurnal faktur penjualan', () => {
  test('posting: debit Piutang Usaha, kredit Penjualan B2B, debit HPP, kredit Persediaan; audit memuat nomor jurnal', async () => {
    const f = await buatFakturJual(db, k(admin), admin, { customerId: String(pelanggan), locationId: String(outlet), date: tgl() })
    fj = f.id
    await tambahBarisFakturJual(db, k(admin), admin, f.id, { item: `${kopi}:${kg}`, qty: '1' })
    await ubahStatusFakturJual(db, k(admin), admin, f.id, 'ajukan')
    await ubahStatusFakturJual(db, k(owner), owner, f.id, 'posting')
    const { j, isi } = await barisJurnal('sales_invoice', f.id)
    assert.deepEqual(isi, ['1-1450 D 400000 c' + pelanggan, '1-1500 K 200000', '4-1100 K 400000', '5-1000 D 200000'].sort())
    assert.equal(j.date.getTime(), hariIni().getTime())
    assert.equal(j.docNo, f.no)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'faktur_jual.posting', docId: String(f.id) } })
    assert.equal((audit.afterJson as { jurnal?: string }).jurnal, j.no)
    assert.equal(await persediaanBersih(), 0)
    await piutangCocok(400000n, 'sesudah faktur')
  })

  test('periode tertutup menolak posting dan gerak stoknya ikut batal', async () => {
    const lalu = new Date(hariIni().getTime() - 40 * 86_400_000)
    const ym = lalu.toISOString().slice(0, 7)
    await db.fiscalPeriod.upsert({ where: { yearMonth: ym }, create: { yearMonth: ym, status: 'Ditutup', closedAt: new Date() }, update: { status: 'Ditutup' } })
    const f = await buatFakturJual(db, k(owner), owner, { customerId: String(pelanggan), locationId: String(outlet), date: lalu.toISOString().slice(0, 10) })
    await tambahBarisFakturJual(db, k(owner), owner, f.id, { item: `${kopi}:${kg}`, qty: '0,5' })
    await galat(() => ubahStatusFakturJual(db, k(owner), owner, f.id, 'posting'), /sudah ditutup/)
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: f.id } })).status, 'Draft')
    assert.equal(await db.stockLedger.count({ where: { docType: 'sales_invoice', docId: f.id } }), 0)
    await db.fiscalPeriod.update({ where: { yearMonth: ym }, data: { status: 'Terbuka' } })
    await db.salesInvoice.delete({ where: { id: f.id } })
  })
})

describe('jurnal penerimaan dan retur', () => {
  test('penerimaan ke kas: debit Kas Besar, kredit Piutang Usaha', async () => {
    const t = await buatTerima(db, k(admin), admin, { customerId: String(pelanggan), date: tgl(), tujuan: 'kas' })
    t1 = t.id
    await simpanAlokasiTerima(db, k(admin), admin, t.id, { [`terima_f${fj}`]: '150000' })
    await ubahStatusTerima(db, k(owner), owner, t.id, 'posting')
    const { isi } = await barisJurnal('customer_payment', t.id)
    assert.deepEqual(isi, ['1-1200 D 150000', `1-1450 K 150000 c${pelanggan}`].sort())
    await piutangCocok(250000n, 'sesudah penerimaan pertama')
  })

  test('retur: debit Retur Penjualan, kredit Piutang Usaha (nota kredit); persediaan masuk lawan HPP', async () => {
    const r = await buatReturJual(db, k(admin), admin, { salesInvoiceId: String(fj), date: tgl(), reason: 'Kemasan rusak' })
    rj = r.id
    const asal = await db.salesInvoiceLine.findFirstOrThrow({ where: { salesInvoiceId: fj } })
    await simpanBarisReturJual(db, k(admin), admin, r.id, { [`qty_${asal.id}`]: '0,25' })
    await ubahStatusReturJual(db, k(owner), owner, r.id, 'posting')
    const { isi } = await barisJurnal('sales_return', r.id)
    assert.deepEqual(isi, [`1-1450 K 100000 c${pelanggan}`, '1-1500 D 50000', '4-3100 D 100000', '5-1000 K 50000'].sort())
    assert.equal(await persediaanBersih(), 0)
    // Halaman: sisa faktur 250.000 dikurangi nota kredit belum terpakai 100.000.
    await piutangCocok(150000n, 'sesudah retur')
  })

  test('penerimaan dengan nota kredit: debit Kas, debit Piutang (pemakaian nota kredit), kredit Piutang (faktur)', async () => {
    const t = await buatTerima(db, k(admin), admin, { customerId: String(pelanggan), date: tgl(), tujuan: 'kas' })
    t2 = t.id
    await simpanAlokasiTerima(db, k(admin), admin, t.id, { [`terima_f${fj}`]: '150000', [`terima_r${rj}`]: '100000' })
    await ubahStatusTerima(db, k(owner), owner, t.id, 'posting')
    const { isi } = await barisJurnal('customer_payment', t.id)
    assert.deepEqual(isi, ['1-1200 D 50000', `1-1450 D 100000 c${pelanggan}`, `1-1450 K 150000 c${pelanggan}`].sort())
    await piutangCocok(100000n, 'sesudah penerimaan kedua')
  })
})

describe('pembatalan berjurnal balik', () => {
  test('batal penerimaan, retur, penerimaan, lalu faktur: tiap langkah membalik jurnalnya dan piutang tetap cocok', async () => {
    await ubahStatusTerima(db, k(owner), owner, t2, 'batal', { alasan: 'Transfer ditolak' })
    const tb = await barisJurnal('customer_payment', t2, true)
    assert.deepEqual(tb.isi, ['1-1200 K 50000', `1-1450 D 150000 c${pelanggan}`, `1-1450 K 100000 c${pelanggan}`].sort())
    assert.equal((await db.customerPayment.findUniqueOrThrow({ where: { id: t2 } })).reversalJournalId, tb.j.id)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'terima_pelanggan.batal', docId: String(t2) } })
    assert.equal((audit.afterJson as { jurnalBalik?: string }).jurnalBalik, tb.j.no)
    await piutangCocok(150000n, 'sesudah batal penerimaan kedua')

    await ubahStatusReturJual(db, k(owner), owner, rj, 'batal', { alasan: 'Barang ternyata baik' })
    const rb = await barisJurnal('sales_return', rj, true)
    assert.deepEqual(rb.isi, [`1-1450 D 100000 c${pelanggan}`, '1-1500 K 50000', '4-3100 K 100000', '5-1000 D 50000'].sort())
    assert.equal((await db.salesReturn.findUniqueOrThrow({ where: { id: rj } })).reversalJournalId, rb.j.id)
    assert.equal(await persediaanBersih(), 0)
    await piutangCocok(250000n, 'sesudah batal retur')

    await ubahStatusTerima(db, k(owner), owner, t1, 'batal', { alasan: 'Salah pelanggan' })
    await piutangCocok(400000n, 'sesudah batal penerimaan pertama')

    await ubahStatusFakturJual(db, k(owner), owner, fj, 'batal', { alasan: 'Pesanan dibatalkan' })
    const fb = await barisJurnal('sales_invoice', fj, true)
    assert.deepEqual(fb.isi, [`1-1450 K 400000 c${pelanggan}`, '1-1500 D 200000', '4-1100 D 400000', '5-1000 K 200000'].sort())
    assert.equal((await db.salesInvoice.findUniqueOrThrow({ where: { id: fj } })).reversalJournalId, fb.j.id)
    assert.equal(await persediaanBersih(), 0)
    await piutangCocok(0n, 'sesudah batal faktur')
  })
})

describe('bentuk ulang jurnal B2B', () => {
  test('faktur yang diposting sebelum jurnal B2B ada dibentukkan jurnalnya sekali, lalu piutang dan persediaan cocok', async () => {
    // Faktur lama: stok sudah keluar dan status Diposting, tetapi belum punya jurnal.
    const f = await buatFakturJual(db, k(admin), admin, { customerId: String(pelanggan), locationId: String(outlet), date: tgl() })
    await tambahBarisFakturJual(db, k(admin), admin, f.id, { item: `${kopi}:${kg}`, qty: '0,5' })
    const baris = await db.salesInvoiceLine.findFirstOrThrow({ where: { salesInvoiceId: f.id } })
    await db.$transaction(async (tx) => {
      const [g] = await catatGerak(tx, { docType: 'sales_invoice', docId: f.id, docNo: f.no, tanggal: hariIni(), oleh: owner.id }, [{ productId: kopi, locationId: outlet, qty: '-500', lineId: baris.id }])
      await tx.salesInvoiceLine.update({ where: { id: baris.id }, data: { unitCost: g.hargaSatuan, value: -g.nilai } })
      await tx.salesInvoice.update({ where: { id: f.id }, data: { status: 'Diposting', postedAt: new Date(), postedBy: owner.id, hpp: -g.nilai } })
    })
    const awal = await cocokkanPiutang(db)
    assert.equal(awal.buku, 0n)
    assert.equal(awal.halaman, 200000n)
    assert.equal(awal.cocok, false)

    const h = await bentukUlangJurnal(db)
    assert.equal(h.per.faktur_jual?.dibuat, 1)
    assert.ok(h.piutang.cocok, 'piutang cocok sesudah bentuk ulang')
    assert.equal(h.piutang.buku, 200000n)
    assert.ok(!h.belumDidukung.some((b) => b.docType === 'sales_invoice' || b.docType === 'sales_return'))
    assert.equal(await persediaanBersih(), 0)
    const kedua = await bentukUlangJurnal(db)
    assert.equal(kedua.per.faktur_jual, undefined, 'jalan kedua tidak membentuk apa pun')
  })
})
