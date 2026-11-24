// Modul pembelian tahap 4C: pemasok, permintaan, pesanan dengan batas persetujuan, penerimaan sebagian, rata-rata
// tertimbang, faktur dari dua penerimaan, selisih harga, retur sebelum dan sesudah faktur, pembelian langsung kredit,
// alokasi pembayaran dan status bayar, pembatalan yang ditolak karena turunan, hutang pemasok, dan impor admin lama.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { ZodError } from 'zod'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { bagiBiaya, hitungProgres } from '../src/lib/beli/dokumen'
import { alasanSetujuFaktur, buatFaktur, simpanBarisFaktur, tambahBiayaFaktur, tarikPenerimaan, ubahStatusFaktur, butuhSetujuFaktur } from '../src/lib/beli/faktur'
import { csvHutang, hutangPemasok } from '../src/lib/beli/hutang'
import { PO_LAMA, imporBeli } from '../src/lib/beli/impor'
import { buatLangsung, butuhSetujuLangsung, tambahBarisLangsung, ubahStatusLangsung } from '../src/lib/beli/langsung'
import { peringatanKasMinus } from '../src/lib/akuntansi/kas-minus'
import { pasangBawaanAkuntansi } from '../src/lib/akuntansi/pemetaan'
import { tambahPemasok, ubahPemasok, ubahStatusPemasok } from '../src/lib/beli/pemasok'
import { buatPembayaran, simpanAlokasi, tagihanTerbuka, ubahStatusPembayaran } from '../src/lib/beli/pembayaran'
import { buatPenerimaan, simpanBarisPenerimaan, ubahStatusPenerimaan } from '../src/lib/beli/penerimaan'
import { buatPermintaan, tambahBarisPermintaan, ubahStatusPermintaan } from '../src/lib/beli/permintaan'
import { buatPesanan, butuhSetujuPesanan, simpanBarisPesanan, tambahBarisPesanan, ubahStatusPesanan } from '../src/lib/beli/pesanan'
import { bolehUbahAturan, daftarAturan, simpanAturan } from '../src/lib/persetujuan'
import { buatRetur, simpanBarisRetur, ubahStatusRetur } from '../src/lib/beli/retur'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { imporStok } from '../src/lib/stok/impor'
import { periksaRantai, periksaSaldo } from '../src/lib/stok/mesin'
import { simpanKonversi, tambahProduk } from '../src/lib/stok/produk'
import { buatAktor, k, muatAktor, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let outlet: number
let gram: number
let kg: number
let kopi: number
let gula: number
let pemasok: number
let pemasok2: number

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

// Pesanan kopi dalam kg ke pemasok utama: Admin mengajukan, lalu Owner menyetujui (semua PO lewat Owner, KONTRAK 11 butir 63).
async function pesanKopi(kgQty: string, harga: string) {
  const po = await buatPesanan(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl() })
  await tambahBarisPesanan(db, k(admin), admin, po.id, { item: `${kopi}:${kg}`, qty: kgQty, price: harga })
  await ubahStatusPesanan(db, k(admin), admin, po.id, 'ajukan')
  await ubahStatusPesanan(db, k(owner), owner, po.id, 'setujui')
  return po
}

async function terima(poId: number, qty?: Record<string, string>) {
  const gr = await buatPenerimaan(db, k(admin), admin, { purchaseOrderId: String(poId), locationId: String(outlet), date: tgl(), extraCost: '' })
  if (qty) {
    const baris = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: gr.id }, orderBy: { id: 'asc' } })
    await simpanBarisPenerimaan(db, k(admin), admin, gr.id, Object.fromEntries(baris.map((b, i) => [`qty_${b.id}`, Object.values(qty)[i] ?? '0'])))
  }
  await ubahStatusPenerimaan(db, k(admin), admin, gr.id, 'posting')
  return gr
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('beli'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  kg = (await db.unit.findFirstOrThrow({ where: { name: 'kilogram' } })).id
  kopi = (await tambahProduk(db, k(owner), owner, { code: 'UJI-KOPI', name: 'Kopi uji beli', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  gula = (await tambahProduk(db, k(owner), owner, { code: 'UJI-GULA', name: 'Gula uji beli', kind: 'bahan', baseUnitId: String(gram), purchasable: 'on' })).id
  await simpanKonversi(db, k(owner), owner, kopi, { unitId: String(kg), factor: '1000', isPurchase: 'on' })
})
after(() => hapus())

describe('pemasok', () => {
  test('tambah, ubah termin, kembar ditolak, nonaktifkan; audit tercatat', async () => {
    const s = await tambahPemasok(db, k(admin), admin, { code: 'sup-a', name: 'Pemasok A', creditDays: '14', phone: '0812 555', bankAccountNo: '123.456' })
    assert.equal(s.code, 'SUP-A')
    assert.equal(s.creditDays, 14)
    assert.equal(s.bankAccountNo, '123456')
    pemasok = s.id
    await galat(() => tambahPemasok(db, k(admin), admin, { code: 'SUP-B', name: 'pemasok a', creditDays: '0' }), /Nama pemasok/)
    assert.equal(await ubahPemasok(db, k(admin), admin, s.id, { code: 'SUP-A', name: 'Pemasok A', creditDays: '30', phone: '0812 555', bankAccountNo: '123456' }), 1)
    pemasok2 = (await tambahPemasok(db, k(admin), admin, { code: 'SUP-B', name: 'Pemasok B', creditDays: '0' })).id
    await ditolak(() => tambahPemasok(db, k(admin), { ...admin, izin: {} }, { code: 'X1', name: 'Tanpa izin', creditDays: '0' }))
    await ubahStatusPemasok(db, k(admin), admin, pemasok2, false)
    await galat(() => buatPesanan(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl() }), /Pemasok/)
    await ubahStatusPemasok(db, k(admin), admin, pemasok2, true)
    assert.equal(await db.auditLog.count({ where: { docType: 'supplier' } }), 5)
  })
})

describe('permintaan dan persetujuan Owner untuk semua pesanan', () => {
  test('PR disetujui Admin, PO dari PR butuh Owner, qty dipesan dan progres PR terbarui', async () => {
    const pr = await buatPermintaan(db, k(admin), admin, { locationId: String(outlet), date: tgl() })
    await tambahBarisPermintaan(db, k(admin), admin, pr.id, { item: `${kopi}:${kg}`, qty: '12' })
    await ubahStatusPermintaan(db, k(admin), admin, pr.id, 'setujui')
    assert.equal((await db.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).status, 'Disetujui')
    const po = await buatPesanan(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl() }, pr.id)
    const [b] = await db.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } })
    assert.equal(b.qty.toString(), '12')
    // Produk belum pernah dibeli: harga bawaan 0, wajib diisi sebelum diajukan.
    await galat(() => ubahStatusPesanan(db, k(admin), admin, po.id, 'ajukan'), /harga/i)
    await simpanBarisPesanan(db, k(admin), admin, po.id, { [`qty_${b.id}`]: '12', [`price_${b.id}`]: '450.000' })
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).total, 5_400_000n)
    // Semua PO lewat Owner: Admin tidak bisa menyetujui langsung dari Draft, dan sesudah diajukan pun tidak memegang Setujui.
    await galat(() => ubahStatusPesanan(db, k(admin), admin, po.id, 'setujui'), /perlu disetujui/)
    await ubahStatusPesanan(db, k(admin), admin, po.id, 'ajukan')
    await ditolak(() => ubahStatusPesanan(db, k(admin), admin, po.id, 'setujui'))
    await ubahStatusPesanan(db, k(owner), owner, po.id, 'setujui')
    const sesudah = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(sesudah.status, 'Disetujui')
    assert.equal(sesudah.approvedBy, owner.id)
    const prs = await db.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { purchaseRequestLines: true } })
    assert.equal(prs.purchaseRequestLines[0].qtyOrdered.toString(), '12')
    assert.equal(prs.orderProgress, 'Penuh')
    assert.equal(prs.status, 'Selesai')
  })

  test('PO kecil (Rp 100.000) dari Admin tidak bisa disetujui Admin dan harus diajukan; Owner bisa menyetujui', async () => {
    const po = await buatPesanan(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl() })
    await tambahBarisPesanan(db, k(admin), admin, po.id, { item: `${kopi}:${kg}`, qty: '1', price: '100000' })
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).total, 100_000n)
    await galat(() => ubahStatusPesanan(db, k(admin), admin, po.id, 'setujui'), /perlu disetujui Owner/)
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, 'Draft')
    await ubahStatusPesanan(db, k(admin), admin, po.id, 'ajukan')
    await ditolak(() => ubahStatusPesanan(db, k(admin), admin, po.id, 'setujui'))
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, 'Diajukan')
    // Owner tidak bisa melompati Draft, tetapi bisa menyetujui yang sudah diajukan.
    await ubahStatusPesanan(db, k(owner), owner, po.id, 'setujui')
    const sesudah = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(sesudah.status, 'Disetujui')
    assert.equal(sesudah.approvedBy, owner.id)
    await ubahStatusPesanan(db, k(owner), owner, po.id, 'batal', { alasan: 'uji batal' })
    // Admin tanpa saklar beli.ubah_harga_po hanya boleh harga terakhir (sesudah ada penerimaan, dicek di bawah).
  })

  test('PO dari Owner sendiri juga tidak boleh melompati Diajukan', async () => {
    const po = await buatPesanan(db, k(owner), owner, { supplierId: String(pemasok), locationId: String(outlet), date: tgl() })
    await tambahBarisPesanan(db, k(owner), owner, po.id, { item: `${kopi}:${kg}`, qty: '1', price: '100000' })
    await galat(() => ubahStatusPesanan(db, k(owner), owner, po.id, 'setujui'), /perlu disetujui Owner/)
    await ubahStatusPesanan(db, k(owner), owner, po.id, 'batal', { alasan: 'uji batal' })
  })
})

describe('penerimaan barang', () => {
  let poId: number
  test('qty terima tidak melebihi sisa PO; progres Sebagian lalu Penuh dan PO Selesai', async () => {
    const po = await db.purchaseOrder.findFirstOrThrow({ where: { total: 5_400_000n } })
    poId = po.id
    const gr = await buatPenerimaan(db, k(admin), admin, { purchaseOrderId: String(po.id), locationId: String(outlet), date: tgl(), extraCost: '' })
    const [b] = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: gr.id } })
    assert.equal(b.qty.toString(), '12')
    await galat(() => simpanBarisPenerimaan(db, k(admin), admin, gr.id, { [`qty_${b.id}`]: '12,5' }), /melebihi sisa/)
    await simpanBarisPenerimaan(db, k(admin), admin, gr.id, { [`qty_${b.id}`]: '5' })
    await ubahStatusPenerimaan(db, k(admin), admin, gr.id, 'posting')
    let p = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(p.receiveProgress, 'Sebagian')
    assert.equal(p.status, 'Disetujui')
    // 5 kg = 5000 g dengan nilai 5 x 450.000, harga satuan 450 per gram.
    assert.deepEqual(await saldo(kopi), { qty: '5000', nilai: 2_250_000n, rata: '450' })
    const gl = await db.goodsReceiptLine.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(gl.unitCost.toString(), '450')
    assert.equal(gl.value, 2_250_000n)
    // Draf kedua dibuat dengan sisa 7 kg; mencoba 8 kg ditolak.
    const gr2 = await buatPenerimaan(db, k(admin), admin, { purchaseOrderId: String(po.id), locationId: String(outlet), date: tgl(), extraCost: '70.000' })
    const [b2] = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: gr2.id } })
    assert.equal(b2.qty.toString(), '7')
    await galat(() => simpanBarisPenerimaan(db, k(admin), admin, gr2.id, { [`qty_${b2.id}`]: '8' }), /melebihi sisa/)
    await ubahStatusPenerimaan(db, k(admin), admin, gr2.id, 'posting')
    p = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(p.receiveProgress, 'Penuh')
    assert.equal(p.status, 'Selesai')
    // Penerimaan ketiga ditolak karena pesanan sudah Selesai.
    await galat(() => buatPenerimaan(db, k(admin), admin, { purchaseOrderId: String(po.id), locationId: String(outlet), date: tgl() }), /Disetujui/)
  })

  test('rata-rata tertimbang sesudah penerimaan dengan biaya tambahan', async () => {
    // Penerimaan kedua: 7 kg x 450.000 + biaya 70.000 = 3.220.000 untuk 7000 g. Saldo 12000 g senilai 5.470.000.
    const s = await saldo(kopi)
    assert.equal(s.qty, '12000')
    assert.equal(s.nilai, 5_470_000n)
    assert.equal(s.rata, '455.8333')
    const p = await db.product.findUniqueOrThrow({ where: { id: kopi } })
    assert.equal(p.lastCost.toString(), '460')
    assert.equal(await periksaRantai(db), 0)
    assert.deepEqual(await periksaSaldo(db), [])
    assert.equal(poId > 0, true)
  })
})

describe('faktur pembelian', () => {
  let fakturId: number
  test('faktur dari dua penerimaan dengan biaya tambahan, progres faktur penerimaan Penuh', async () => {
    const gr = await db.goodsReceipt.findMany({ where: { supplierId: pemasok, status: 'Diposting' }, orderBy: { id: 'asc' } })
    assert.equal(gr.length, 2)
    const f = await buatFaktur(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), supplierInvoiceNo: 'INV-001' })
    fakturId = f.id
    assert.equal(f.dueDate!.getTime() - f.date.getTime(), 30 * 86_400_000)
    await tarikPenerimaan(db, k(admin), admin, f.id, gr[0].id)
    await tarikPenerimaan(db, k(admin), admin, f.id, gr[1].id)
    await galat(() => tarikPenerimaan(db, k(admin), admin, f.id, gr[1].id), /sudah ada/)
    const fa = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: f.id }, include: { purchaseInvoiceLines: true } })
    assert.equal(fa.purchaseInvoiceLines.length, 3)
    assert.equal(fa.total, 5_470_000n)
    assert.equal(fa.priceDiff, 0n)
    // Nomor faktur pemasok kembar ditolak.
    await galat(() => buatFaktur(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), supplierInvoiceNo: 'inv-001' }), /sudah tercatat/)
    await ubahStatusFaktur(db, k(admin), admin, f.id, 'posting')
    for (const g of gr) assert.equal((await db.goodsReceipt.findUniqueOrThrow({ where: { id: g.id } })).invoiceProgress, 'Penuh')
    const hasil = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: f.id } })
    assert.equal(hasil.status, 'Diposting')
    assert.equal(hasil.payStatus, 'BelumBayar')
  })

  test('selisih harga: kecil diposting Admin, di atas 5 persen butuh Owner; ubah harga dijaga saklar', async () => {
    const po = await pesanKopi('2', '460000')
    const gr = await terima(po.id)
    // Admin tanpa saklar beli.ubah_harga_faktur tidak boleh mengubah harga.
    const fs = await db.featureSwitch.findUniqueOrThrow({ where: { code: 'beli.ubah_harga_faktur' } })
    await db.roleFeatureSwitch.update({ where: { roleId_featureSwitchId: { roleId: admin.peran.id, featureSwitchId: fs.id } }, data: { enabled: false } })
    const adminTanpa = await muatAktor(db, 'admin1')
    const f = await buatFaktur(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), supplierInvoiceNo: 'INV-002' })
    await tarikPenerimaan(db, k(admin), admin, f.id, gr.id)
    const [b] = await db.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: f.id } })
    await galat(() => simpanBarisFaktur(db, k(adminTanpa), adminTanpa, f.id, { [`qty_${b.id}`]: '2', [`price_${b.id}`]: '470000' }), /saklar Ubah harga faktur/)
    await db.roleFeatureSwitch.update({ where: { roleId_featureSwitchId: { roleId: admin.peran.id, featureSwitchId: fs.id } }, data: { enabled: true } })
    // Selisih 2 x 10.000 = 20.000 dari 920.000 (2,2 persen): Admin boleh memposting.
    await simpanBarisFaktur(db, k(admin), admin, f.id, { [`qty_${b.id}`]: '2', [`price_${b.id}`]: '470000' })
    assert.equal(await butuhSetujuFaktur(db, f.id), false)
    // Selisih 2 x 40.000 = 80.000 (8,7 persen): perlu Owner.
    await simpanBarisFaktur(db, k(admin), admin, f.id, { [`qty_${b.id}`]: '2', [`price_${b.id}`]: '500000' })
    assert.equal(await butuhSetujuFaktur(db, f.id), true)
    await galat(() => ubahStatusFaktur(db, k(admin), admin, f.id, 'posting'), /perlu disetujui/)
    await ubahStatusFaktur(db, k(admin), admin, f.id, 'ajukan')
    await ditolak(() => ubahStatusFaktur(db, k(admin), admin, f.id, 'posting'))
    await tambahBiayaFaktur(db, k(admin), admin, f.id, { description: 'Ongkos tidak masuk', amount: '5000' }).then(
      () => assert.fail('draf saja'),
      (e) => assert.ok(e instanceof GalatAturan),
    )
    await ubahStatusFaktur(db, k(owner), owner, f.id, 'posting')
    const fa = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: f.id }, include: { purchaseInvoiceLines: true } })
    assert.equal(fa.priceDiff, 80_000n)
    assert.equal(fa.purchaseInvoiceLines[0].receiptValue, 920_000n)
    assert.equal(fa.purchaseInvoiceLines[0].priceDiff, 80_000n)
    assert.equal(fa.total, 1_000_000n)
    assert.equal(fa.approvedBy, owner.id)
  })

  test('pembatalan ditolak karena ada turunan', async () => {
    const gr = await db.goodsReceipt.findFirstOrThrow({ where: { supplierId: pemasok, status: 'Diposting' }, orderBy: { id: 'asc' } })
    await galat(() => ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'batal', { alasan: 'salah catat' }), /sudah difakturkan/)
    const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: gr.purchaseOrderId } })
    await galat(() => ubahStatusPesanan(db, k(owner), owner, po.id, 'batal', { alasan: 'salah' }), /tidak bisa/)
    // Pesanan Disetujui yang sudah punya penerimaan Diposting tidak bisa dibatalkan.
    const sebagian = await pesanKopi('2', '460000')
    await terima(sebagian.id, { a: '1' })
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: sebagian.id } })).status, 'Disetujui')
    await galat(() => ubahStatusPesanan(db, k(owner), owner, sebagian.id, 'batal', { alasan: 'tidak jadi' }), /penerimaan barang yang Diposting/)
    assert.equal(fakturId > 0, true)
  })
})

describe('retur pembelian', () => {
  test('retur sebelum faktur memotong qty yang menunggu faktur, tanpa nota debit', async () => {
    const po = await pesanKopi('3', '460000')
    const gr = await terima(po.id)
    const sebelum = await saldo(kopi)
    const r = await buatRetur(db, k(admin), admin, { sumber: `gr:${gr.id}`, date: tgl(), reason: 'Biji basah', settleMode: 'potong' })
    const [g] = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: gr.id } })
    await galat(() => simpanBarisRetur(db, k(admin), admin, r.id, { [`qty_${g.id}`]: '4' }), /melebihi/)
    await simpanBarisRetur(db, k(admin), admin, r.id, { [`qty_${g.id}`]: '1' })
    // Admin hanya L T U H di retur: mengajukan, Owner memposting.
    await ubahStatusRetur(db, k(admin), admin, r.id, 'ajukan')
    await ditolak(() => ubahStatusRetur(db, k(admin), admin, r.id, 'posting'))
    await ubahStatusRetur(db, k(owner), owner, r.id, 'posting')
    const rr = await db.purchaseReturn.findUniqueOrThrow({ where: { id: r.id }, include: { purchaseReturnLines: true } })
    assert.equal(rr.debitNoteAmount, 0n)
    assert.equal(rr.subtotal, 460_000n)
    assert.equal(rr.purchaseReturnLines[0].qtyUninvoiced.toString(), '1')
    const gl = await db.goodsReceiptLine.findUniqueOrThrow({ where: { id: g.id } })
    assert.equal(gl.qtyRetUninv.toString(), '1')
    assert.equal((await db.goodsReceipt.findUniqueOrThrow({ where: { id: gr.id } })).invoiceProgress, 'Sebagian')
    const s = await saldo(kopi)
    assert.equal(Number(s.qty), Number(sebelum.qty) - 1000)
    // Keluar dengan nilai penerimaan (460 per gram), bukan harga rata-rata.
    assert.equal(s.nilai, sebelum.nilai - 460_000n)
    // Faktur hanya bisa menarik sisa 2 kg.
    const f = await buatFaktur(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), supplierInvoiceNo: 'INV-003' })
    await tarikPenerimaan(db, k(admin), admin, f.id, gr.id)
    const [fb] = await db.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: f.id } })
    assert.equal(fb.qty.toString(), '2')
    await ubahStatusFaktur(db, k(admin), admin, f.id, 'posting')
    assert.equal((await db.goodsReceipt.findUniqueOrThrow({ where: { id: gr.id } })).invoiceProgress, 'Penuh')
  })

  test('retur sesudah faktur menjadi nota debit sebesar qty x harga faktur', async () => {
    // Penerimaan INV-002 difakturkan 500.000 per kg; retur 1 kg -> nota debit 500.000, stok keluar 460.000.
    const fa = await db.purchaseInvoice.findFirstOrThrow({ where: { supplierInvoiceNo: 'INV-002' }, include: { purchaseInvoiceLines: true } })
    const grId = fa.purchaseInvoiceLines[0].goodsReceiptId!
    const r = await buatRetur(db, k(owner), owner, { sumber: `gr:${grId}`, date: tgl(), reason: 'Kemasan sobek', settleMode: 'potong' })
    const [g] = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: grId } })
    await simpanBarisRetur(db, k(owner), owner, r.id, { [`qty_${g.id}`]: '1' })
    await ubahStatusRetur(db, k(owner), owner, r.id, 'posting')
    const rr = await db.purchaseReturn.findUniqueOrThrow({ where: { id: r.id }, include: { purchaseReturnLines: true } })
    assert.equal(rr.debitNoteAmount, 500_000n)
    assert.equal(rr.subtotal, 460_000n)
    assert.equal(rr.purchaseReturnLines[0].qtyInvoiced.toString(), '1')
    assert.equal(rr.purchaseReturnLines[0].invoicePrice, 500_000n)
    // Faktur tidak bisa dibatalkan selama retur dari bagian yang difakturkan masih Diposting.
    await galat(() => ubahStatusFaktur(db, k(owner), owner, fa.id, 'batal', { alasan: 'uji turunan' }), /retur/)
    assert.equal(await periksaRantai(db), 0)
    assert.deepEqual(await periksaSaldo(db), [])
  })
})

describe('pembelian langsung dan pembayaran', () => {
  let kredit: number
  test('pembelian langsung tunai Lunas, kredit menjadi hutang', async () => {
    const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl(), payMode: 'tunai', sumber: 'kas' })
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'barang', item: `${gula}:${gram}`, qty: '2000', price: '18' })
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'biaya', description: 'Es batu tidak distok', price: '10000' })
    await ubahStatusLangsung(db, k(admin), admin, t.id, 'posting')
    const tt = await db.directPurchase.findUniqueOrThrow({ where: { id: t.id } })
    assert.equal(tt.total, 46_000n)
    assert.equal(tt.payStatus, 'Lunas')
    assert.equal((await saldo(gula)).qty, '2000')
    // Harga 30 berbeda 67 persen dari harga terakhir 18: Admin (saklar mati, batas 20 persen) ditolak.
    const c = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl(), payMode: 'kredit', sumber: 'kas', extraCost: '2.000' })
    await galat(() => tambahBarisLangsung(db, k(admin), admin, c.id, { jenis: 'barang', item: `${gula}:${gram}`, qty: '1000', price: '30' }), /melebihi batas 20%/)
    await tambahBarisLangsung(db, k(admin), admin, c.id, { jenis: 'barang', item: `${gula}:${gram}`, qty: '1000', price: '20' })
    await ubahStatusLangsung(db, k(admin), admin, c.id, 'posting')
    const cc = await db.directPurchase.findUniqueOrThrow({ where: { id: c.id }, include: { directPurchaseLines: true } })
    assert.equal(cc.total, 22_000n)
    assert.equal(cc.payStatus, 'BelumBayar')
    assert.equal(cc.dueDate!.getTime(), cc.date.getTime())
    // Biaya tambahan masuk ke nilai persediaan.
    assert.equal(cc.directPurchaseLines[0].value, 22_000n)
    assert.equal((await saldo(gula)).nilai, 36_000n + 22_000n)
    kredit = c.id
    const terbuka = await tagihanTerbuka(db, pemasok2)
    assert.deepEqual(terbuka.map((x) => [x.no, x.sisa]), [[cc.no, 22_000n]])
  })

  test('alokasi pembayaran, persetujuan Owner, status bayar Sebagian lalu Lunas, dan pembatalan mengembalikannya', async () => {
    const b = await buatPembayaran(db, k(admin), admin, { supplierId: String(pemasok2), date: tgl(), sumber: 'kas' })
    await galat(() => simpanAlokasi(db, k(admin), admin, b.id, { [`bayar_b${kredit}`]: '30000' }), /melebihi/)
    await simpanAlokasi(db, k(admin), admin, b.id, { [`bayar_b${kredit}`]: '10000' })
    await ditolak(() => ubahStatusPembayaran(db, k(admin), admin, b.id, 'posting'))
    await galat(() => ubahStatusPembayaran(db, k(owner), owner, b.id, 'posting'), /disetujui dulu/)
    await ubahStatusPembayaran(db, k(admin), admin, b.id, 'ajukan')
    await ditolak(() => ubahStatusPembayaran(db, k(admin), admin, b.id, 'setujui'))
    await ubahStatusPembayaran(db, k(owner), owner, b.id, 'setujui')
    assert.equal((await db.directPurchase.findUniqueOrThrow({ where: { id: kredit } })).payStatus, 'BelumBayar')
    await ubahStatusPembayaran(db, k(owner), owner, b.id, 'posting')
    let c = await db.directPurchase.findUniqueOrThrow({ where: { id: kredit } })
    assert.equal(c.payStatus, 'Sebagian')
    assert.equal(c.paidAmount, 10_000n)
    // Pembelian kredit yang sudah dibayar tidak bisa dibatalkan.
    await galat(() => ubahStatusLangsung(db, k(owner), owner, kredit, 'batal', { alasan: 'uji turunan' }), /sudah dibayar/)
    const b2 = await buatPembayaran(db, k(owner), owner, { supplierId: String(pemasok2), date: tgl(), sumber: 'kas' })
    await simpanAlokasi(db, k(owner), owner, b2.id, { [`bayar_b${kredit}`]: '12.000' })
    await ubahStatusPembayaran(db, k(owner), owner, b2.id, 'ajukan')
    await ubahStatusPembayaran(db, k(owner), owner, b2.id, 'setujui')
    await ubahStatusPembayaran(db, k(owner), owner, b2.id, 'posting')
    c = await db.directPurchase.findUniqueOrThrow({ where: { id: kredit } })
    assert.equal(c.payStatus, 'Lunas')
    // Batal pembayaran Diposting oleh Owner (saklar dok.batal_posting) mengembalikan status bayar.
    await ditolak(() => ubahStatusPembayaran(db, k(admin), admin, b2.id, 'batal', { alasan: 'salah transfer' }))
    await ubahStatusPembayaran(db, k(owner), owner, b2.id, 'batal', { alasan: 'salah transfer' })
    c = await db.directPurchase.findUniqueOrThrow({ where: { id: kredit } })
    assert.equal(c.payStatus, 'Sebagian')
    assert.equal(c.paidAmount, 10_000n)
  })

  test('pembayaran faktur memakai nota debit retur', async () => {
    const terbuka = await tagihanTerbuka(db, pemasok)
    const faktur = terbuka.filter((t) => t.jenis === 'faktur')
    const nota = terbuka.filter((t) => t.jenis === 'retur')
    assert.equal(nota.length, 1)
    assert.equal(nota[0].sisa, 500_000n)
    const isi: Record<string, string> = Object.fromEntries(faktur.map((f) => [`bayar_${f.kunci}`, f.sisa.toString()]))
    isi[`bayar_${nota[0].kunci}`] = '500000'
    const b = await buatPembayaran(db, k(admin), admin, { supplierId: String(pemasok), date: tgl(), sumber: 'kas' })
    await simpanAlokasi(db, k(admin), admin, b.id, isi)
    const total = faktur.reduce((n, f) => n + f.sisa, 0n)
    assert.equal((await db.purchasePayment.findUniqueOrThrow({ where: { id: b.id } })).amount, total - 500_000n)
    await ubahStatusPembayaran(db, k(admin), admin, b.id, 'ajukan')
    await ubahStatusPembayaran(db, k(owner), owner, b.id, 'setujui')
    await ubahStatusPembayaran(db, k(owner), owner, b.id, 'posting')
    for (const f of faktur) assert.equal((await db.purchaseInvoice.findUniqueOrThrow({ where: { id: f.id } })).payStatus, 'Lunas')
    const r = await db.purchaseReturn.findUniqueOrThrow({ where: { id: nota[0].id } })
    assert.equal(r.debitNoteUsed, 500_000n)
    // Faktur yang sudah dibayar tidak bisa dibatalkan; retur yang nota debitnya terpakai juga tidak.
    await galat(() => ubahStatusFaktur(db, k(owner), owner, faktur[0].id, 'batal', { alasan: 'uji turunan' }), /sudah dibayar/)
    await galat(() => ubahStatusRetur(db, k(owner), owner, r.id, 'batal', { alasan: 'uji turunan' }), /sudah dipakai/)
  })

  test('hutang pemasok: saldo per pemasok, umur, dan CSV', async () => {
    const h = await hutangPemasok(db)
    const b = h.perPemasok.find((p) => p.supplierId === pemasok2)!
    assert.equal(b.tagihan, 12_000n)
    assert.equal(b.saldo, 12_000n)
    assert.equal(h.perPemasok.find((p) => p.supplierId === pemasok)?.saldo ?? 0n, 0n)
    // Satu kilogram dari penerimaan sebagian di uji pembatalan belum difakturkan: 1 x 460.000.
    assert.equal(h.perPemasok.find((p) => p.supplierId === pemasok)?.belumFaktur, 460_000n)
    assert.equal(h.total, 12_000n)
    assert.equal(h.dokumen[0].kelompok, 'Belum jatuh tempo')
    // Temuan audit B-4: nota debit yang belum dipakai menjadi kelompok sendiri, jadi jumlah kelompok = saldo hutang.
    const lokasi = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
    const nd = await db.purchaseReturn.create({ data: { supplierId: pemasok2, locationId: lokasi, no: 'RB-UJI-B4', date: hariIni(), reason: 'Uji nota debit', status: 'Diposting', debitNoteAmount: 9_000n } })
    const h2 = await hutangPemasok(db)
    assert.equal(h2.total, 3_000n)
    assert.deepEqual(h2.umur.at(-1), { kelompok: 'Nota debit belum dipakai', sisa: -9_000n })
    assert.equal(h2.umur.reduce((n, u) => n + u.sisa, 0n), h2.total)
    await db.purchaseReturn.delete({ where: { id: nd.id } })
    const csv = csvHutang(h.dokumen)
    assert.ok(csv.startsWith('﻿Pemasok,Jenis'))
    assert.match(csv, /Pemasok B,Pembelian langsung,BL-\d{4}-\d{4},,\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2},22000,10000,12000,0,Belum jatuh tempo/)
  })
})

describe('pembatalan dengan gerak balik', () => {
  test('penerimaan tanpa turunan dibatalkan: stok kembali, pesanan terbuka lagi', async () => {
    const po = await pesanKopi('1', '460000')
    const sebelum = await saldo(kopi)
    const gr = await terima(po.id)
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, 'Selesai')
    await galat(() => ubahStatusPenerimaan(db, k(admin), admin, gr.id, 'batal', { alasan: 'salah terima' }), /tidak bisa|saklar/)
    await ubahStatusPenerimaan(db, k(owner), owner, gr.id, 'batal', { alasan: 'salah terima' })
    assert.deepEqual(await saldo(kopi), sebelum)
    const p = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(p.status, 'Disetujui')
    assert.equal(p.receiveProgress, 'Belum')
    assert.equal(await db.stockLedger.count({ where: { docType: 'goods_receipt', docId: gr.id, isReversal: true } }), 1)
    // Pesanan tanpa penerimaan Diposting boleh dibatalkan.
    await ubahStatusPesanan(db, k(owner), owner, po.id, 'batal', { alasan: 'tidak jadi' })
    assert.equal(await periksaRantai(db), 0)
  })

  test('semua langkah tercatat di audit', async () => {
    for (const a of ['pesanan.setujui', 'penerimaan.posting', 'faktur.posting', 'retur_beli.posting', 'beli_langsung.posting', 'pembayaran.setujui', 'pembayaran.posting', 'pembayaran.batal', 'penerimaan.batal']) {
      assert.ok((await db.auditLog.count({ where: { action: a } })) > 0, a)
    }
  })
})

// Temuan audit B-2, keputusan pemilik 24 November 2026: Pembelian Langsung tunai dan faktur berisi baris jasa di atas
// batas approval_rule (bawaan Rp 1.000.000) wajib disetujui Owner; saldo kas minus hanya diperingatkan.
describe('persetujuan pembelian tunai dan baris jasa (B-2)', () => {
  test('aturan bawaan dari migrasi: Rp 1.000.000 untuk direct_purchase dan purchase_invoice.jasa', async () => {
    const r = await db.approvalRule.findMany({ where: { docType: { in: ['direct_purchase', 'purchase_invoice.jasa'] } }, orderBy: { docType: 'asc' } })
    assert.deepEqual(r.map((x) => [x.docType, x.requiresApproval, x.minAmount]), [['direct_purchase', true, 1_000_000n], ['purchase_invoice.jasa', true, 1_000_000n]])
  })

  // Temuan audit B-6: "1.250" kg ditolak karena rancu, "1,25" kg diterima sebagai 1.250 g.
  test('qty satuan kg berpola ribuan ditolak, koma desimal diterima', async () => {
    const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok), locationId: String(outlet), date: tgl(), payMode: 'kredit', sumber: 'kas' })
    await galat(() => tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'barang', item: `${kopi}:${kg}`, qty: '1.250' }), /bisa berarti 1\.250 atau 1,250/)
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'barang', item: `${kopi}:${kg}`, qty: '1,25' })
    const b = await db.directPurchaseLine.findFirstOrThrow({ where: { directPurchaseId: t.id } })
    assert.equal(b.qty.toString(), '1.25')
  })

  test('pembelian langsung tunai di atas batas wajib Owner, sama dengan batas dan kredit boleh Admin', async () => {
    const buat = async (payMode: string, biaya: string) => {
      const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl(), payMode, sumber: 'kas' })
      await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'biaya', description: 'Sewa peralatan', price: biaya })
      return t
    }
    const pas = await buat('tunai', '1000000')
    assert.equal(await butuhSetujuLangsung(db, pas), false)
    await ubahStatusLangsung(db, k(admin), admin, pas.id, 'posting')

    const besar = await buat('tunai', '1000001')
    assert.equal(await butuhSetujuLangsung(db, besar), true)
    await galat(() => ubahStatusLangsung(db, k(admin), admin, besar.id, 'posting'), /perlu disetujui Owner/)
    await ubahStatusLangsung(db, k(admin), admin, besar.id, 'ajukan')
    await ditolak(() => ubahStatusLangsung(db, k(admin), admin, besar.id, 'posting'))
    await ubahStatusLangsung(db, k(owner), owner, besar.id, 'posting')
    const b = await db.directPurchase.findUniqueOrThrow({ where: { id: besar.id } })
    assert.deepEqual([b.status, b.approvedBy, b.postedBy], ['Diposting', owner.id, owner.id])

    const kredit = await buat('kredit', '5000000')
    assert.equal(await butuhSetujuLangsung(db, kredit), false)
    await ubahStatusLangsung(db, k(admin), admin, kredit.id, 'posting')

    // Batas bisa diubah di approval_rule.
    await db.approvalRule.update({ where: { docType: 'direct_purchase' }, data: { minAmount: 5_000_000n } })
    const lagi = await buat('tunai', '2000000')
    assert.equal(await butuhSetujuLangsung(db, lagi), false)
    await db.approvalRule.update({ where: { docType: 'direct_purchase' }, data: { minAmount: 1_000_000n } })
    assert.equal(await butuhSetujuLangsung(db, lagi), true)
  })

  test('faktur berisi baris jasa dengan total di atas batas wajib Owner', async () => {
    const f = await buatFaktur(db, k(admin), admin, { supplierId: String(pemasok2), date: tgl(), supplierInvoiceNo: 'JASA-1' })
    await tambahBiayaFaktur(db, k(admin), admin, f.id, { description: 'Servis mesin kopi', amount: '1000000' })
    assert.equal(await butuhSetujuFaktur(db, f.id), false)
    await tambahBiayaFaktur(db, k(admin), admin, f.id, { description: 'Suku cadang', amount: '1' })
    assert.match((await alasanSetujuFaktur(db, f.id)).join(), /baris jasa atau biaya dengan total Rp 1\.000\.001, di atas batas Rp 1\.000\.000/)
    await galat(() => ubahStatusFaktur(db, k(admin), admin, f.id, 'posting'), /perlu disetujui Owner/)
    await ubahStatusFaktur(db, k(admin), admin, f.id, 'ajukan')
    await ditolak(() => ubahStatusFaktur(db, k(admin), admin, f.id, 'posting'))
    await ubahStatusFaktur(db, k(owner), owner, f.id, 'posting')
    assert.equal((await db.purchaseInvoice.findUniqueOrThrow({ where: { id: f.id } })).approvedBy, owner.id)
  })

  test('saldo kas yang akan minus hanya diperingatkan, posting tetap jalan', async () => {
    await pasangBawaanAkuntansi(db)
    const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl(), payMode: 'tunai', sumber: 'kas' })
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'biaya', description: 'Gas elpiji', price: '50000' })
    const [r] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account_mapping m ON m.account_id = l.account_id AND m.key = 'kas_besar' WHERE j.posted_at IS NOT NULL`
    // Keluar 1 rupiah lebih besar dari saldo buku (yang mungkin sudah minus karena pembelian tunai sebelumnya).
    const saldoBuku = BigInt(r.n)
    const keluar = saldoBuku > 0n ? saldoBuku + 1n : 50_000n
    const pesan = await peringatanKasMinus(db, null, keluar)
    const sesudah = saldoBuku - keluar
    assert.match(pesan ?? '', new RegExp(`menjadi -Rp ${(-sesudah).toLocaleString('id-ID').replace(/\./g, '\\.')} sesudah posting ini\\. Posting tetap bisa`))
    assert.equal(await peringatanKasMinus(db, null, 0n), null)
    await ubahStatusLangsung(db, k(admin), admin, t.id, 'posting')
    assert.equal((await db.directPurchase.findUniqueOrThrow({ where: { id: t.id } })).status, 'Diposting')
  })
})

describe('pembantu dan impor', () => {
  test('bagi biaya dan progres', () => {
    assert.deepEqual(bagiBiaya(100n, [1n, 1n, 1n]), [34n, 33n, 33n])
    assert.deepEqual(bagiBiaya(10n, [0n, 0n]), [5n, 5n])
    assert.equal(hitungProgres([{ target: '2', selesai: '0' }]), 'Belum')
    assert.equal(hitungProgres([{ target: '2', selesai: '1' }]), 'Sebagian')
    assert.equal(hitungProgres([{ target: '2', selesai: '2' }]), 'Penuh')
  })

  test('impor pemasok dan PO admin lama idempoten, PO diterima tanpa gerak stok', async () => {
    await imporStok(db)
    const ledger = await db.stockLedger.count()
    const h1 = await imporBeli(db)
    assert.equal(h1.pemasokBaru, 2)
    assert.equal(h1.pesananBaru, PO_LAMA.length)
    const h2 = await imporBeli(db)
    assert.equal(h2.pemasokBaru + h2.pesananBaru, 0)
    assert.equal(await db.stockLedger.count(), ledger)
    const selesai = await db.purchaseOrder.findUniqueOrThrow({ where: { legacyNo: 'PO-001' }, include: { purchaseOrderLines: true } })
    assert.equal(selesai.status, 'Selesai')
    assert.equal(selesai.receiveProgress, 'Penuh')
    assert.ok(selesai.purchaseOrderLines.every((b) => b.qtyReceived.eq(b.qty)))
    assert.equal(await db.goodsReceipt.count({ where: { purchaseOrderId: selesai.id } }), 0)
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { legacyNo: 'PO-002' } })).status, 'Disetujui')
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({ where: { legacyNo: 'PO-003' } })).status, 'Draft')
  })
})

// Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 156): halaman Aturan Persetujuan hanya untuk Owner.
describe('aturan persetujuan dari layar', () => {
  // Isi formulir dari keadaan sekarang, seperti halaman mengirimnya, lalu timpa isian tertentu.
  // Kunci timpa ditulis dengan jenis dokumen (wajib:purchase_order) supaya tes mudah dibaca, lalu diterjemahkan ke nomor
  // urut baris seperti nama isian di halaman.
  const isiForm = async (timpa: Record<string, string | null> = {}) => {
    const f: Record<string, string> = {}
    const nomor = new Map<string, number>()
    ;(await daftarAturan(db)).forEach((b, i) => {
      nomor.set(b.docType, i)
      f[`jenis:${i}`] = b.docType
      if (!b.info || b.info.tetap) return
      if (b.wajib) f[`wajib:${i}`] = '1'
      if (b.info.batas === 'nominal') f[`nominal:${i}`] = b.nominal === null ? '' : String(b.nominal)
      if (b.info.batas === 'persen') f[`persen:${i}`] = b.persen ?? ''
    })
    for (const [kunci, v] of Object.entries(timpa)) {
      const [jenis, dok] = kunci.split(/:(.*)/)
      const k = `${jenis}:${nomor.get(dok)}`
      if (v === null) delete f[k]
      else f[k] = v
    }
    return f
  }

  test('daftar memuat semua baris dengan nama Indonesia; hanya Owner yang bisa mengubah', async () => {
    const d = await daftarAturan(db)
    const po = d.find((b) => b.docType === 'purchase_order')!
    assert.equal(po.info?.nama, 'Pesanan Pembelian')
    assert.equal(po.nominal, null, 'bawaan semua pesanan (butir 63)')
    assert.ok(d.find((b) => b.docType === 'purchase_payment')?.info?.tetap)
    assert.equal(d.length, await db.approvalRule.count())
    await ditolak(() => simpanAturan(db, k(admin), admin, {}))
    // Peran lain yang diberi izinnya tetap ditolak karena bukan Owner.
    const spv = { ...admin, izin: { ...admin.izin, 'atur.persetujuan': 'LU' } }
    await ditolak(() => simpanAturan(db, k(spv), spv, {}))
    assert.equal(bolehUbahAturan(spv), false)
    assert.equal(bolehUbahAturan(owner), true)
    assert.equal(await simpanAturan(db, k(owner), owner, await isiForm()), 0, 'tanpa perubahan tidak menulis apa pun')
  })

  test('perubahan berlaku untuk pesanan pembelian dan pembelian langsung, tercatat sebelum dan sesudah', async () => {
    assert.equal(await butuhSetujuPesanan(db, 1n), true)
    const n = await simpanAturan(db, k(owner), owner, await isiForm({ 'nominal:purchase_order': '3.000.000', 'nominal:direct_purchase': '5000000' }))
    assert.equal(n, 2)
    assert.equal(await butuhSetujuPesanan(db, 3_000_000n), false)
    assert.equal(await butuhSetujuPesanan(db, 3_000_001n), true)
    const t = await buatLangsung(db, k(admin), admin, { supplierId: String(pemasok2), locationId: String(outlet), date: tgl(), payMode: 'tunai', sumber: 'kas' })
    await tambahBarisLangsung(db, k(admin), admin, t.id, { jenis: 'biaya', description: 'Sewa tenda', price: '2000000' })
    assert.equal(await butuhSetujuLangsung(db, t), false, 'di bawah batas baru Rp 5.000.000')
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'persetujuan.ubah', docType: 'approval_rule', docId: 'purchase_order' } })
    assert.deepEqual([a.beforeJson, a.afterJson], [{ nominal: null }, { nominal: '3000000' }])
    assert.match(a.summary, /Pesanan Pembelian: wajib untuk semua nilai menjadi wajib di atas Rp 3\.000\.000/)

    // Mematikan persetujuan pesanan: tidak ada pesanan yang wajib disetujui, batasnya tetap tersimpan.
    await simpanAturan(db, k(owner), owner, await isiForm({ 'wajib:purchase_order': null }))
    assert.equal(await butuhSetujuPesanan(db, 50_000_000n), false)
    const po = await db.approvalRule.findUniqueOrThrow({ where: { docType: 'purchase_order' } })
    assert.deepEqual([po.requiresApproval, po.minAmount, po.updatedBy], [false, 3_000_000n, owner.id])
    // Pembelian langsung kembali ke batas lama, jadi dokumen yang sama sekarang wajib disetujui.
    await simpanAturan(db, k(owner), owner, await isiForm({ 'wajib:purchase_order': '1', 'nominal:purchase_order': '', 'nominal:direct_purchase': '1.000.000' }))
    assert.equal(await butuhSetujuLangsung(db, t), true)
    assert.equal(await butuhSetujuPesanan(db, 1n), true)
  })

  test('validasi batas dan baris yang tidak bisa diubah', async () => {
    await assert.rejects(simpanAturan(db, k(owner), owner, await isiForm({ 'nominal:direct_purchase': 'satu juta' })), (e: unknown) => e instanceof ZodError && String(e.issues[0].path[0]).startsWith('nominal:'))
    await assert.rejects(simpanAturan(db, k(owner), owner, await isiForm({ 'nominal:direct_purchase': '0' })), ZodError)
    await assert.rejects(simpanAturan(db, k(owner), owner, await isiForm({ 'persen:purchase_invoice': '150' })), ZodError)
    await simpanAturan(db, k(owner), owner, await isiForm({ 'persen:purchase_invoice': '2,5' }))
    assert.equal((await db.approvalRule.findUniqueOrThrow({ where: { docType: 'purchase_invoice' } })).minPct?.toString(), '2.5')
    // Pembayaran Pembelian selalu wajib: isian rakitan diabaikan.
    await simpanAturan(db, k(owner), owner, await isiForm({ 'wajib:purchase_payment': '' }))
    assert.equal((await db.approvalRule.findUniqueOrThrow({ where: { docType: 'purchase_payment' } })).requiresApproval, true)
    await simpanAturan(db, k(owner), owner, await isiForm({ 'persen:purchase_invoice': '5' }))
    // Nama isian yang memuat "pin" (cash_transaction.pindah) dulu dibuang dari isian terjaga; kini nama memakai nomor urut.
    const form = await isiForm()
    assert.ok(Object.keys(form).every((x) => !/pin/i.test(x)), 'nama isian tidak memuat pin')
    // Baris yang tidak ada di formulir (halaman basi) tidak disentuh.
    const tanpaPindah = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== 'cash_transaction.pindah'))
    await simpanAturan(db, k(owner), owner, tanpaPindah)
    assert.equal((await db.approvalRule.findUniqueOrThrow({ where: { docType: 'cash_transaction.pindah' } })).requiresApproval, true)
    // Tidak ada aksi hapus: jumlah baris tetap.
    assert.equal((await daftarAturan(db)).length, await db.approvalRule.count())
  })
})
