// Modul persediaan tahap 4A: master produk, satuan, lokasi, alasan; dokumen penyesuaian, opname, pindah stok dengan
// alur status, saklar, izin, audit; dan impor saldo awal.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { tambahAlasan, ubahStatusAlasan } from '../src/lib/stok/alasan'
import { bacaAngka } from '../src/lib/stok/angka'
import { KODE_SALDO_AWAL, isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni, periksaTanggal } from '../src/lib/stok/dokumen'
import { BAHAN_LAMA, imporStok, kodeBahan } from '../src/lib/stok/impor'
import { tambahLokasi, ubahStatusLokasi } from '../src/lib/stok/lokasi'
import { periksaRantai, periksaSaldo } from '../src/lib/stok/mesin'
import { buatOpname, muatOpname, simpanHitungan, ubahStatusOpname } from '../src/lib/stok/opname'
import { buatPenyesuaian, hapusPenyesuaian, tambahBarisPenyesuaian, ubahStatusPenyesuaian } from '../src/lib/stok/penyesuaian'
import { buatPindah, tambahBarisPindah, ubahStatusPindah } from '../src/lib/stok/pindah'
import { daftarPosisi, kartuStok } from '../src/lib/stok/posisi'
import { hapusKonversi, simpanKonversi, tambahProduk, ubahProduk, ubahStatusProduk } from '../src/lib/stok/produk'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let outlet: number
let gudang: number
let gram: number
let rusak: number
let selisihHitung: number

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('stokdok'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gudang = (await db.location.findUniqueOrThrow({ where: { code: 'HO' } })).id
  gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  rusak = (await db.stockReason.findFirstOrThrow({ where: { name: 'Rusak' } })).id
  selisihHitung = (await db.stockReason.findFirstOrThrow({ where: { name: 'Selisih hitung' } })).id
})
after(() => hapus())

const galat = async (f: () => Promise<unknown>, pesan?: RegExp, kolom?: string) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    if (kolom) assert.equal(e.kolom, kolom)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)
const tglHariIni = () => hariIni().toISOString().slice(0, 10)
const qty = async (p: number, l: number) => (await db.stockBalance.findUnique({ where: { productId_locationId: { productId: p, locationId: l } } }))?.qty.toString() ?? '0'
const audit = (action: string) => db.auditLog.count({ where: { action } })

describe('angka dan tanggal', () => {
  test('bacaAngka memahami koma desimal dan titik ribuan', () => {
    assert.equal(bacaAngka('12,5')?.toString(), '12.5')
    assert.equal(bacaAngka('1.250')?.toString(), '1250')
    assert.equal(bacaAngka('1.250,75')?.toString(), '1250.75')
    assert.equal(bacaAngka('12.5')?.toString(), '12.5')
    assert.equal(bacaAngka('0.125')?.toString(), '0.125')
    assert.equal(bacaAngka('abc'), null)
    assert.equal(bacaAngka('1,2,3'), null)
  })
  test('tanggal mundur mengikuti saklar dok.tanggal_mundur', () => {
    const sekarang = new Date('2026-11-20T10:00:00+07:00')
    const tgl = (t: string) => new Date(`${t}T00:00:00Z`)
    periksaTanggal(owner, tgl('2026-01-01'), 'date', sekarang)
    periksaTanggal(admin, tgl('2026-11-19'), 'date', sekarang)
    assert.throws(() => periksaTanggal(admin, tgl('2026-11-18'), 'date', sekarang), /mundur 1 hari/)
    assert.throws(() => periksaTanggal(owner, tgl('2026-11-21'), 'date', sekarang), /lewat dari hari ini/)
    assert.throws(() => periksaTanggal(kasir, tgl('2026-11-19'), 'date', sekarang), /hari ini/)
  })
})

describe('master produk, satuan, lokasi, alasan', () => {
  test('produk baru, kode unik, satuan dasar terkunci sesudah ada gerak', async () => {
    const p = await tambahProduk(db, k(admin), admin, { code: 'tes-kopi', name: 'Kopi uji', kind: 'bahan', baseUnitId: String(gram), minStock: '500', purchasable: 'on' })
    assert.equal(p.code, 'TES-KOPI')
    await galat(() => tambahProduk(db, k(admin), admin, { code: 'TES-KOPI', name: 'Lain', kind: 'bahan', baseUnitId: String(gram) }), /Kode produk/, 'code')
    await galat(() => tambahProduk(db, k(admin), admin, { code: 'TES-2', name: 'kopi UJI', kind: 'bahan', baseUnitId: String(gram) }), /Nama produk/, 'name')
    await ditolak(() => tambahProduk(db, k(kasir), kasir, { code: 'X1', name: 'X', kind: 'bahan', baseUnitId: String(gram) }))
    const kg = (await db.unit.findFirstOrThrow({ where: { name: 'kilogram' } })).id
    await simpanKonversi(db, k(admin), admin, p.id, { unitId: String(kg), factor: '1000', isDefault: 'on' })
    const pu = await db.productUnit.findFirstOrThrow({ where: { productId: p.id } })
    assert.equal(pu.factorToBase.toString(), '1000')
    assert.ok(pu.isPurchase && pu.isDefault)
    await galat(() => simpanKonversi(db, k(admin), admin, p.id, { unitId: String(gram), factor: '1' }), /tidak perlu/)
    await assert.rejects(simpanKonversi(db, k(admin), admin, p.id, { unitId: String(kg), factor: '0' }), /lebih dari 0/)
    await hapusKonversi(db, k(admin), admin, p.id, kg)
    assert.equal(await db.productUnit.count({ where: { productId: p.id } }), 0)
    assert.equal(await audit('produk.satuan_hapus'), 1)

    // Gerak pertama, lalu satuan dasar tidak bisa diganti dan Admin tidak bisa mengganti nama.
    const d = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tglHariIni() })
    await tambahBarisPenyesuaian(db, k(owner), owner, d.id, { productId: String(p.id), reasonId: String(rusak), direction: 'tambah', qty: '1000', unitCost: '300' })
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'ajukan')
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'posting')
    const ml = (await db.unit.findFirstOrThrow({ where: { name: 'mililiter' } })).id
    await galat(
      () => ubahProduk(db, k(owner), owner, p.id, { code: 'TES-KOPI', name: 'Kopi uji', kind: 'bahan', baseUnitId: String(ml), minStock: '500', purchasable: 'on' }),
      /Satuan dasar/,
      'baseUnitId',
    )
    await galat(() => ubahProduk(db, k(admin), admin, p.id, { code: 'TES-KOPI', name: 'Kopi uji baru', kind: 'bahan', baseUnitId: String(gram), minStock: '500', purchasable: 'on' }), /saklar/, 'name')
    const { berubah } = await ubahProduk(db, k(owner), owner, p.id, { code: 'TES-KOPI', name: 'Kopi uji baru', kind: 'bahan', baseUnitId: String(gram), minStock: '600', purchasable: 'on' })
    assert.equal(berubah, 2)
    await galat(() => ubahStatusProduk(db, k(owner), owner, p.id, false), /masih punya stok/)
  })

  test('lokasi dan alasan', async () => {
    const l = await tambahLokasi(db, k(owner), owner, { code: 'bar', name: 'Bar depan', kind: 'bar' })
    assert.equal(l.code, 'BAR')
    await ditolak(() => tambahLokasi(db, k(admin), admin, { code: 'X', name: 'X', kind: 'bar' }))
    await ubahStatusLokasi(db, k(owner), owner, l.id, false)
    await galat(() => ubahStatusLokasi(db, k(owner), owner, outlet, false), /masih menyimpan stok/)
    const a = await tambahAlasan(db, k(owner), owner, { name: 'Sampel', appliesTo: 'sesuai' })
    await ditolak(() => tambahAlasan(db, k(admin), admin, { name: 'Lain', appliesTo: 'sesuai' }))
    await ubahStatusAlasan(db, k(owner), owner, a.id, false)
    const sistem = await db.stockReason.findUniqueOrThrow({ where: { code: KODE_SALDO_AWAL } })
    await galat(() => ubahStatusAlasan(db, k(owner), owner, sistem.id, false), /sistem/)
  })
})

describe('impor saldo awal', () => {
  test('impor membuat produk dan saldo awal, lalu aman diulang', async () => {
    const a = await imporStok(db)
    assert.equal(a.produkBaru, BAHAN_LAMA.length)
    assert.equal(a.baris, BAHAN_LAMA.length)
    const kopi = await db.product.findUniqueOrThrow({ where: { code: kodeBahan('kopi') } })
    assert.equal(await qty(kopi.id, outlet), '2400')
    const b = await db.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: kopi.id, locationId: outlet } } })
    assert.equal(b.value, 768000n)
    assert.equal(b.avgCost.toString(), '320')
    const dok = await db.stockAdjustment.findFirstOrThrow({ where: { note: { contains: 'admin lama' } }, include: { stockAdjustmentLines: { include: { reason: true } } } })
    assert.equal(dok.status, 'Diposting')
    assert.ok(dok.stockAdjustmentLines.every((l) => l.reason.code === KODE_SALDO_AWAL))
    const ulang = await imporStok(db)
    assert.deepEqual([ulang.produkBaru, ulang.kategoriBaru, ulang.baris, ulang.saldoAwal], [0, 0, 0, null])
    assert.equal(await db.stockAdjustment.count({ where: { note: { contains: 'admin lama' } } }), 1)
    assert.equal(await audit('impor.stok'), 1)
  })
})

describe('penyesuaian stok', () => {
  test('admin: kurang langsung diposting, tambah ditolak saklar', async () => {
    const kopi = (await db.product.findUniqueOrThrow({ where: { code: kodeBahan('kopi') } })).id
    const d = await buatPenyesuaian(db, k(admin), admin, { locationId: String(outlet), date: tglHariIni(), note: 'Biji tumpah' })
    assert.match(d.no, /^PS-\d{4}-\d{4}$/)
    await galat(
      () => tambahBarisPenyesuaian(db, k(admin), admin, d.id, { productId: String(kopi), reasonId: String(rusak), direction: 'tambah', qty: '5' }),
      /saklar Penyesuaian stok tambah/,
      'direction',
    )
    await galat(
      () => tambahBarisPenyesuaian(db, k(admin), admin, d.id, { productId: String(kopi), reasonId: String(rusak), direction: 'kurang', qty: '5', unitCost: '10' }),
      /harga rata-rata/,
      'unitCost',
    )
    await tambahBarisPenyesuaian(db, k(admin), admin, d.id, { productId: String(kopi), reasonId: String(rusak), direction: 'kurang', qty: '100' })
    await ubahStatusPenyesuaian(db, k(admin), admin, d.id, 'posting')
    assert.equal(await qty(kopi, outlet), '2300')
    const baris = await db.stockAdjustmentLine.findFirstOrThrow({ where: { stockAdjustmentId: d.id } })
    assert.equal(baris.unitCost.toString(), '320')
    await galat(() => tambahBarisPenyesuaian(db, k(admin), admin, d.id, { productId: String(kopi), reasonId: String(rusak), direction: 'kurang', qty: '1' }), /Hanya draf/)
    // Admin tidak punya saklar batal posting.
    await galat(() => ubahStatusPenyesuaian(db, k(admin), admin, d.id, 'batal', { alasan: 'Salah catat' }), /saklar Batalkan/)
    // Owner membatalkan: stok kembali, butuh alasan.
    await galat(() => ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'batal', { alasan: '' }), /alasan/, 'alasan')
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'batal', { alasan: 'Ternyata tidak tumpah' })
    assert.equal(await qty(kopi, outlet), '2400')
    const batal = await db.stockAdjustment.findUniqueOrThrow({ where: { id: d.id } })
    assert.equal(batal.status, 'Batal')
    assert.equal(batal.cancelReason, 'Ternyata tidak tumpah')
    await galat(() => ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'batal', { alasan: 'lagi lagi' }), /tidak bisa/)
    for (const a of ['penyesuaian.tambah', 'penyesuaian.baris_tambah', 'penyesuaian.posting', 'penyesuaian.batal']) assert.ok((await audit(a)) >= 1, a)
  })

  test('penyesuaian dengan baris tambah wajib lewat Diajukan dan disetujui Owner', async () => {
    const susu = (await db.product.findUniqueOrThrow({ where: { code: kodeBahan('susu') } })).id
    const d = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tglHariIni() })
    await tambahBarisPenyesuaian(db, k(owner), owner, d.id, { productId: String(susu), reasonId: String(rusak), direction: 'tambah', qty: '500' })
    await galat(() => ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'posting'), /perlu disetujui/)
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'ajukan')
    // Admin tidak punya Setujui.
    await ditolak(() => ubahStatusPenyesuaian(db, k(admin), admin, d.id, 'kembalikan'))
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'posting')
    const dok = await db.stockAdjustment.findUniqueOrThrow({ where: { id: d.id } })
    assert.equal(dok.status, 'Diposting')
    assert.equal(dok.approvedBy, owner.id)
    assert.equal(await qty(susu, outlet), '15000')
  })

  test('draf bisa dihapus, kasir tidak bisa apa-apa', async () => {
    const d = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tglHariIni() })
    await ditolak(() => hapusPenyesuaian(db, k(kasir), kasir, d.id))
    await ditolak(() => buatPenyesuaian(db, k(kasir), kasir, { locationId: String(outlet), date: tglHariIni() }))
    await hapusPenyesuaian(db, k(owner), owner, d.id)
    assert.equal(await db.stockAdjustment.count({ where: { id: d.id } }), 0)
  })
})

describe('stock opname', () => {
  test('qty sistem dibekukan, selisih jadi gerak saat Diposting, gerak sesudah beku tetap terhitung', async () => {
    const kat = (await db.productCategory.findFirstOrThrow({ where: { name: 'Kemasan' } })).id
    const cup = (await db.product.findUniqueOrThrow({ where: { code: kodeBahan('cup') } })).id
    const kaleng = (await db.product.findUniqueOrThrow({ where: { code: kodeBahan('kaleng') } })).id
    const d = await buatOpname(db, k(admin), admin, { locationId: String(outlet), categoryId: String(kat), date: tglHariIni() })
    const isi = await muatOpname(db, d.id)
    assert.equal(isi!.stockOpnameLines.length, 2)
    const bCup = isi!.stockOpnameLines.find((l) => l.productId === cup)!
    const bKaleng = isi!.stockOpnameLines.find((l) => l.productId === kaleng)!
    assert.equal(bCup.systemQty.toString(), '260')

    // Gerak lain sesudah pembekuan: 10 cup terpakai.
    const p = await buatPenyesuaian(db, k(admin), admin, { locationId: String(outlet), date: tglHariIni() })
    await tambahBarisPenyesuaian(db, k(admin), admin, p.id, { productId: String(cup), reasonId: String(rusak), direction: 'kurang', qty: '10' })
    await ubahStatusPenyesuaian(db, k(admin), admin, p.id, 'posting')

    await galat(() => simpanHitungan(db, k(admin), admin, d.id, { [`hitung_${bCup.id}`]: 'abc' }), /Qty fisik/)
    await simpanHitungan(db, k(admin), admin, d.id, { [`hitung_${bCup.id}`]: '255', [`hitung_${bKaleng.id}`]: '120' })
    // Alasan wajib untuk baris berselisih.
    await galat(() => ubahStatusOpname(db, k(admin), admin, d.id, 'ajukan'), /Alasan wajib/)
    await simpanHitungan(db, k(admin), admin, d.id, { [`hitung_${bCup.id}`]: '255', [`alasan_${bCup.id}`]: String(selisihHitung), [`hitung_${bKaleng.id}`]: '120' })
    // Admin tidak punya Posting di opname; Owner tidak bisa posting dari Draft karena opname wajib disetujui.
    await ditolak(() => ubahStatusOpname(db, k(admin), admin, d.id, 'posting'))
    await galat(() => ubahStatusOpname(db, k(owner), owner, d.id, 'posting'), /perlu disetujui/)
    await ubahStatusOpname(db, k(admin), admin, d.id, 'ajukan')
    await galat(() => simpanHitungan(db, k(admin), admin, d.id, { [`hitung_${bCup.id}`]: '1' }), /Hanya draf/)
    await ubahStatusOpname(db, k(owner), owner, d.id, 'posting')
    // 260 beku, fisik 255: selisih -5. Saldo 250 (sesudah 10 terpakai) menjadi 245.
    assert.equal(await qty(cup, outlet), '245')
    assert.equal(await qty(kaleng, outlet), '120')
    const g = await db.stockLedger.findMany({ where: { docType: 'stock_opname', docId: d.id } })
    assert.equal(g.length, 1)
    assert.equal(g[0].qty.toString(), '-5')
    assert.equal(g[0].value, -3750n)
    // Batal sesudah posting mengembalikan stok.
    await ubahStatusOpname(db, k(owner), owner, d.id, 'batal', { alasan: 'Hitungan ulang' })
    assert.equal(await qty(cup, outlet), '250')
  })
})

describe('pindah stok', () => {
  test('pindah memindahkan qty dan nilai, stok kurang ditolak, batal mengembalikan', async () => {
    const kopi = (await db.product.findUniqueOrThrow({ where: { code: kodeBahan('kopi') } })).id
    await assert.rejects(buatPindah(db, k(admin), admin, { fromLocationId: String(outlet), toLocationId: String(outlet), date: tglHariIni() }), /berbeda dari lokasi asal/)
    const d = await buatPindah(db, k(admin), admin, { fromLocationId: String(outlet), toLocationId: String(gudang), date: tglHariIni() })
    await tambahBarisPindah(db, k(admin), admin, d.id, { productId: String(kopi), qty: '9999' })
    await galat(() => ubahStatusPindah(db, k(admin), admin, d.id, 'posting'), /tidak cukup/)
    assert.equal((await db.stockTransfer.findUniqueOrThrow({ where: { id: d.id } })).status, 'Draft')
    const b = await db.stockTransferLine.findFirstOrThrow({ where: { stockTransferId: d.id } })
    await db.stockTransferLine.update({ where: { id: b.id }, data: { qty: 400 } })
    await galat(() => tambahBarisPindah(db, k(admin), admin, d.id, { productId: String(kopi), qty: '1' }), /sudah ada/)
    await ubahStatusPindah(db, k(admin), admin, d.id, 'posting')
    assert.equal(await qty(kopi, outlet), '2000')
    assert.equal(await qty(kopi, gudang), '400')
    const bal = await db.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: kopi, locationId: gudang } } })
    assert.equal(bal.value, 128000n)
    await ubahStatusPindah(db, k(owner), owner, d.id, 'batal', { alasan: 'Tidak jadi kirim' })
    assert.equal(await qty(kopi, outlet), '2400')
    assert.equal(await qty(kopi, gudang), '0')
  })
})

describe('posisi dan kartu stok', () => {
  test('posisi menandai stok di bawah minimum, kartu stok memuat dokumen asal', async () => {
    const pos = await daftarPosisi(db, { lokasi: String(outlet), bawah: '1' })
    const lemon = pos.baris.find((b) => b.code === kodeBahan('lemon'))
    assert.ok(lemon?.bawahMinimum, 'lemon 34 di bawah minimum 40')
    assert.ok(pos.baris.every((b) => b.bawahMinimum))
    const kopi = await db.product.findUniqueOrThrow({ where: { code: kodeBahan('kopi') } })
    const kartu = await kartuStok(db, { produk: String(kopi.id), lokasi: String(outlet) })
    assert.ok(kartu)
    assert.ok(kartu.baris.some((b) => b.tautan.href?.startsWith('/penyesuaian/')))
    assert.ok(kartu.baris.some((b) => b.isReversal))
    assert.equal(kartu.saldo?.qty.toString(), '2400')
  })

  test('saldo cocok dengan ledger sesudah semua dokumen', async () => {
    assert.deepEqual(await periksaSaldo(db), [])
    assert.equal(await periksaRantai(db), 0)
  })
})
