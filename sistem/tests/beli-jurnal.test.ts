// Tahap 5C: jurnal dokumen pembelian. Penerimaan (dengan biaya tambahan), faktur dengan selisih harga dan baris jasa,
// retur dari bagian belum dan sudah difakturkan, pembelian langsung tunai dari rekening dan kredit dengan baris biaya,
// pembayaran dengan nota debit, pembatalan semuanya, periode tertutup, dan bentuk ulang. Di setiap titik: saldo Hutang
// Usaha di buku = total halaman Hutang Pemasok, saldo BDBF = nilai penerimaan yang belum difakturkan, dan persediaan
// buku = nilai stok.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan } from '../src/lib/aksi'
import { bentukUlangJurnal } from '../src/lib/akuntansi/bentuk-ulang'
import { cocokkanPersediaan } from '../src/lib/akuntansi/laporan'
import { bukaPeriode, bulanIni, geserBulan, tutupPeriode } from '../src/lib/akuntansi/periode'
import { buatFaktur, simpanBarisFaktur, tambahBiayaFaktur, tarikPenerimaan, ubahStatusFaktur } from '../src/lib/beli/faktur'
import { belumDifakturkan, hutangPemasok } from '../src/lib/beli/hutang'
import { buatLangsung, tambahBarisLangsung, ubahStatusLangsung } from '../src/lib/beli/langsung'
import { tambahPemasok } from '../src/lib/beli/pemasok'
import { buatPembayaran, simpanAlokasi, ubahStatusPembayaran } from '../src/lib/beli/pembayaran'
import { buatPenerimaan, ubahStatusPenerimaan } from '../src/lib/beli/penerimaan'
import { buatPesanan, tambahBarisPesanan, ubahStatusPesanan } from '../src/lib/beli/pesanan'
import { buatRetur, simpanBarisRetur, ubahStatusRetur } from '../src/lib/beli/retur'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { tambahRekening } from '../src/lib/rekening'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { tambahProduk } from '../src/lib/stok/produk'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let outlet = 0
let gram = 0
let kopi = 0
let susu = 0
let pemasok = 0
let rekening = 0
const tgl = () => hariIni().toISOString().slice(0, 10)

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}

// Baris jurnal dokumen sebagai peta kode akun -> nilai bertanda (debit plus). Memeriksa seimbang.
async function isiJurnal(docType: string, docId: number, balik = false) {
  const j = await db.journal.findFirst({ where: { sourceType: docType, sourceId: docId, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
  assert.ok(j, `jurnal ${balik ? 'balik ' : ''}${docType}#${docId} ada`)
  const peta: Record<string, bigint> = {}
  for (const l of j.journalLines) peta[l.account.code] = (peta[l.account.code] ?? 0n) + l.debit - l.credit
  assert.equal(
    j.journalLines.reduce((n, l) => n + l.debit, 0n),
    j.journalLines.reduce((n, l) => n + l.credit, 0n),
    `jurnal ${j.no} seimbang`,
  )
  return { j, peta }
}
const saldoKunci = async (kunci: string) => {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND l.account_id = (SELECT account_id FROM account_mapping WHERE key = ${kunci})`
  return BigInt(r.n)
}

// Tiga pencocokan yang dijanjikan tahap 5C.
async function cocokSemua(label: string) {
  const hutang = await hutangPemasok(db)
  assert.equal(-(await saldoKunci('hutang_usaha')), hutang.total, `${label}: Hutang Usaha di buku = halaman Hutang Pemasok`)
  const bdbf = (await belumDifakturkan(db)).reduce((n, b) => n + b.n, 0n)
  assert.equal(-(await saldoKunci('grni')), bdbf, `${label}: BDBF di buku = penerimaan belum difakturkan`)
  assert.equal(hutang.belumFaktur, bdbf, `${label}: kolom belum difakturkan halaman Hutang`)
  const p = await cocokkanPersediaan(db)
  assert.ok(p.cocok, `${label}: persediaan buku ${p.buku} = stok ${p.stok}`)
}

async function pesanTerima(qty: Record<number, string>, harga: Record<number, string>, extraCost = '', tanggal = tgl()) {
  const po = await buatPesanan(db, k(owner), owner, { supplierId: String(pemasok), locationId: String(outlet), date: tanggal })
  for (const [p, q] of Object.entries(qty)) await tambahBarisPesanan(db, k(owner), owner, po.id, { item: `${p}:${gram}`, qty: q, price: harga[Number(p)] })
  await ubahStatusPesanan(db, k(owner), owner, po.id, 'ajukan')
  await ubahStatusPesanan(db, k(owner), owner, po.id, 'setujui')
  const gr = await buatPenerimaan(db, k(owner), owner, { purchaseOrderId: String(po.id), locationId: String(outlet), date: tanggal, extraCost })
  return gr
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('belijurnal'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  kopi = (await tambahProduk(db, k(owner), owner, { code: 'J-KOPI', name: 'Kopi jurnal', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  susu = (await tambahProduk(db, k(owner), owner, { code: 'J-SUSU', name: 'Susu jurnal', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  pemasok = (await tambahPemasok(db, k(owner), owner, { code: 'SUP-J', name: 'Pemasok Jurnal', creditDays: '30' })).id
  rekening = (await tambahRekening(db, k(owner), owner, { bankName: 'BCA', accountNo: '1234567890', holderName: 'Greenbox' })).id
})
after(() => hapus())

let gr1 = 0
let faktur1 = 0
let retur1 = 0
let kredit = 0
let bayar = 0

describe('jurnal pembelian', () => {
  test('penerimaan: debit persediaan termasuk biaya tambahan, kredit BDBF', async () => {
    const gr = await pesanTerima({ [kopi]: '1000', [susu]: '2000' }, { [kopi]: '200', [susu]: '20' }, '12.000')
    gr1 = gr.id
    await ubahStatusPenerimaan(db, k(admin), admin, gr.id, 'posting')
    const { peta, j } = await isiJurnal('goods_receipt', gr.id)
    // 1000 x 200 + 2000 x 20 = 240.000, ditambah biaya 12.000.
    assert.equal(peta['1-1500'], 252_000n)
    assert.equal(peta['2-1200'], -252_000n)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'penerimaan.posting', docId: String(gr.id) } })
    assert.equal((audit.afterJson as { jurnal?: string }).jurnal, j.no)
    await cocokSemua('sesudah penerimaan')
  })

  test('faktur sebagian: selisih harga dan baris jasa, kredit Hutang Usaha bersama pemasoknya', async () => {
    const f = await buatFaktur(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), supplierInvoiceNo: 'J-001' })
    faktur1 = f.id
    await tarikPenerimaan(db, k(admin), admin, f.id, gr1)
    const baris = await db.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: f.id }, orderBy: { id: 'asc' } })
    const k1 = baris.find((b) => b.productId === kopi)!
    const s1 = baris.find((b) => b.productId === susu)!
    // Kopi difakturkan 600 dari 1000 dengan harga 210 (lebih mahal 10 per gram), susu penuh dengan harga sama.
    await simpanBarisFaktur(db, k(admin), admin, f.id, { [`qty_${k1.id}`]: '600', [`price_${k1.id}`]: '210', [`qty_${s1.id}`]: '2000', [`price_${s1.id}`]: '20' })
    await tambahBiayaFaktur(db, k(admin), admin, f.id, { description: 'Servis grinder', amount: '50000' })
    await ubahStatusFaktur(db, k(admin), admin, f.id, 'posting')
    const { peta } = await isiJurnal('purchase_invoice', f.id)
    // Nilai terima difakturkan: 600 x 200 + 40.000 + biaya 12.000 = 172.000. Selisih 600 x 10 = 6.000. Jasa 50.000.
    assert.equal(peta['2-1200'], 172_000n)
    assert.equal(peta['5-2000'], 6_000n)
    assert.equal(peta['6-1900'], 50_000n)
    assert.equal(peta['2-1100'], -228_000n)
    const l = await db.journalLine.findFirstOrThrow({ where: { journal: { sourceType: 'purchase_invoice', sourceId: f.id }, account: { code: '2-1100' } } })
    assert.equal(l.supplierId, pemasok)
    // Sisa BDBF: kopi 400 x 200 = 80.000.
    assert.equal((await belumDifakturkan(db))[0].n, 80_000n)
    await cocokSemua('sesudah faktur')
  })

  test('retur dari penerimaan: bagian belum difakturkan ke BDBF, bagian sudah difakturkan jadi nota debit', async () => {
    const r = await buatRetur(db, k(admin), admin, { sumber: `gr:${gr1}`, date: tgl(), reason: 'Biji basah sebagian', settleMode: 'potong' })
    retur1 = r.id
    const g = await db.goodsReceiptLine.findFirstOrThrow({ where: { goodsReceiptId: gr1, productId: kopi } })
    // 500 gram kopi: 400 dari bagian belum difakturkan, 100 dari bagian yang difakturkan seharga 210.
    await simpanBarisRetur(db, k(admin), admin, r.id, { [`qty_${g.id}`]: '500' })
    await ubahStatusRetur(db, k(admin), admin, r.id, 'ajukan')
    await ubahStatusRetur(db, k(owner), owner, r.id, 'posting')
    const { peta } = await isiJurnal('purchase_return', r.id)
    // Nilai keluar: nilai baris kopi (200.000 + bagian biaya 10.000) x 500/1000 = 105.000.
    assert.equal(peta['1-1500'], -105_000n)
    assert.equal(peta['2-1200'], 80_000n)
    assert.equal(peta['2-1100'], 21_000n)
    // Sisa 4.000 (bagian biaya tambahan 5.000 dikurangi selisih harga 1.000) ke Selisih Harga Pembelian.
    assert.equal(peta['5-2000'], 4_000n)
    await cocokSemua('sesudah retur')
  })

  test('pembelian langsung tunai dari rekening dan kredit dengan baris hanya biaya', async () => {
    const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl(), payMode: 'tunai', sumber: String(rekening) })
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'barang', item: `${susu}:${gram}`, qty: '1000', price: '20' })
    await ubahStatusLangsung(db, k(admin), admin, t.id, 'posting')
    const a = await isiJurnal('direct_purchase', t.id)
    assert.equal(a.peta['1-1500'], 20_000n)
    assert.equal(a.peta['1-1310'], -20_000n)
    const bank = await db.journalLine.findFirstOrThrow({ where: { journalId: a.j.id, account: { code: '1-1310' } } })
    assert.equal(bank.bankAccountId, rekening)

    const c = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl(), payMode: 'kredit', sumber: 'kas', extraCost: '1.000' })
    kredit = c.id
    await tambahBarisLangsung(db, k(admin), admin, c.id, { jenis: 'barang', item: `${kopi}:${gram}`, qty: '100', price: '200' })
    await tambahBarisLangsung(db, k(admin), admin, c.id, { jenis: 'biaya', description: 'Es batu', price: '15000' })
    await ubahStatusLangsung(db, k(admin), admin, c.id, 'posting')
    const b = await isiJurnal('direct_purchase', c.id)
    assert.equal(b.peta['1-1500'], 21_000n)
    assert.equal(b.peta['6-1900'], 15_000n)
    assert.equal(b.peta['2-1100'], -36_000n)
    await cocokSemua('sesudah pembelian langsung')
  })

  test('pembayaran dengan nota debit: debit hutang tagihan, kredit hutang nota, kredit bank', async () => {
    const p = await buatPembayaran(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), sumber: String(rekening) })
    bayar = p.id
    await simpanAlokasi(db, k(admin), admin, p.id, { [`bayar_f${faktur1}`]: '228000', [`bayar_b${kredit}`]: '36000', [`bayar_r${retur1}`]: '21000' })
    await ubahStatusPembayaran(db, k(admin), admin, p.id, 'ajukan')
    await ubahStatusPembayaran(db, k(owner), owner, p.id, 'setujui')
    await cocokSemua('pembayaran disetujui belum diposting')
    await ubahStatusPembayaran(db, k(owner), owner, p.id, 'posting')
    const { j } = await isiJurnal('purchase_payment', p.id)
    const baris = await db.journalLine.findMany({ where: { journalId: j.id }, include: { account: true } })
    const hutang = baris.filter((l) => l.account.code === '2-1100')
    assert.equal(hutang.find((l) => l.debit > 0n)?.debit, 264_000n)
    assert.equal(hutang.find((l) => l.credit > 0n)?.credit, 21_000n)
    assert.equal(baris.find((l) => l.account.code === '1-1310')?.credit, 243_000n)
    assert.equal(-(await saldoKunci('hutang_usaha')), 0n, 'semua tagihan lunas, hutang kembali 0')
    await cocokSemua('sesudah pembayaran')
  })

  test('pembatalan dari Diposting membentuk jurnal balik dan reversal_journal_id', async () => {
    await ubahStatusPembayaran(db, k(owner), owner, bayar, 'batal', { alasan: 'Salah rekening' })
    const bb = await isiJurnal('purchase_payment', bayar, true)
    assert.equal((await db.purchasePayment.findUniqueOrThrow({ where: { id: bayar } })).reversalJournalId, bb.j.id)
    await cocokSemua('sesudah batal pembayaran')
    await ubahStatusLangsung(db, k(owner), owner, kredit, 'batal', { alasan: 'Nota ganda' })
    assert.equal((await isiJurnal('direct_purchase', kredit, true)).peta['2-1100'], 36_000n)
    await cocokSemua('sesudah batal pembelian kredit')
    await ubahStatusRetur(db, k(owner), owner, retur1, 'batal', { alasan: 'Barang tidak jadi dikirim' })
    const rb = await isiJurnal('purchase_return', retur1, true)
    assert.equal(rb.peta['1-1500'], 105_000n)
    await cocokSemua('sesudah batal retur')
    await ubahStatusFaktur(db, k(owner), owner, faktur1, 'batal', { alasan: 'Faktur salah nomor' })
    assert.equal((await isiJurnal('purchase_invoice', faktur1, true)).peta['2-1100'], 228_000n)
    await cocokSemua('sesudah batal faktur')
    await ubahStatusPenerimaan(db, k(owner), owner, gr1, 'batal', { alasan: 'Salah input penerimaan' })
    await cocokSemua('sesudah batal penerimaan')
    assert.equal(await saldoKunci('grni'), 0n, 'BDBF kembali 0')
    assert.equal(await saldoKunci('hutang_usaha'), 0n, 'Hutang kembali 0')
  })
})

describe('periode tertutup menolak dokumen pembelian', () => {
  test('posting dan pembatalan bertanggal di bulan yang ditutup ditolak', async () => {
    const lalu = geserBulan(bulanIni(), -1)
    const tanggal = `${lalu}-28`
    const gr = await pesanTerima({ [kopi]: '100' }, { [kopi]: '200' }, '', tanggal)
    await tutupPeriode(db, k(owner), owner, lalu)
    await galat(() => ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'posting'), /ditutup/)
    assert.equal((await db.goodsReceipt.findUniqueOrThrow({ where: { id: gr.id } })).status, 'Draft')
    assert.equal(await db.stockLedger.count({ where: { docType: 'goods_receipt', docId: gr.id } }), 0, 'stok tidak bergerak')
    await bukaPeriode(db, k(owner), owner, lalu, { alasan: 'Uji posting terlambat' })
    await ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'posting')
    await tutupPeriode(db, k(owner), owner, lalu)
    await galat(() => ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'batal', { alasan: 'Uji batal di periode tutup' }), /ditutup/)
    const f = await buatFaktur(db, k(owner), owner, { supplierId: String(pemasok), date: tanggal, supplierInvoiceNo: 'J-LALU' })
    await tarikPenerimaan(db, k(owner), owner, f.id, gr.id)
    await galat(() => ubahStatusFaktur(db, k(owner), owner, f.id, 'posting'), /ditutup/)
    await bukaPeriode(db, k(owner), owner, lalu, { alasan: 'Kembalikan seperti semula' })
    await cocokSemua('sesudah uji periode')
  })
})

describe('bentuk ulang dokumen pembelian lama', () => {
  test('jurnal yang hilang dibentuk lagi dan jalan kedua tidak membentuk apa pun', async () => {
    // Tiru dokumen lama: penerimaan Diposting tanpa jurnal (jurnalnya dihapus lewat jalur di luar trigger).
    const gr = await pesanTerima({ [susu]: '500' }, { [susu]: '20' })
    await ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'posting')
    await db.$executeRawUnsafe('ALTER TABLE journal_line DISABLE TRIGGER journal_line_tetap')
    await db.$executeRawUnsafe('ALTER TABLE journal DISABLE TRIGGER journal_tetap')
    await db.$executeRaw`DELETE FROM journal WHERE source_type = 'goods_receipt' AND source_id = ${gr.id}`
    await db.$executeRawUnsafe('ALTER TABLE journal ENABLE TRIGGER journal_tetap')
    await db.$executeRawUnsafe('ALTER TABLE journal_line ENABLE TRIGGER journal_line_tetap')
    const h = await bentukUlangJurnal(db)
    assert.equal(h.per.goods_receipt?.dibuat, 1)
    assert.ok(!h.belumDidukung.some((b) => b.docType === 'goods_receipt'))
    assert.ok(h.persediaan.cocok)
    const lagi = await bentukUlangJurnal(db)
    assert.equal(Object.values(lagi.per).reduce((n, r) => n + r.dibuat, 0), 0)
    await cocokSemua('sesudah bentuk ulang')
  })
})
