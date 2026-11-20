// Tahap 4B: resep dan BOM, potong stok penjualan dan void, dokumen produksi (perintah, pengeluaran bahan, hasil produksi,
// produksi cepat) dengan nilai, pembatalan lewat gerak balik, izin, audit, dan impor resep admin lama.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { buatCepat, muatCepat, ubahQtyCepat, ubahStatusCepat } from '../src/lib/produksi/cepat'
import { buatHasil, nilaiHasil, ubahStatusHasil } from '../src/lib/produksi/hasil'
import { imporResep } from '../src/lib/produksi/impor'
import { buatPengeluaran, muatPengeluaran, ubahQtyPengeluaran, ubahStatusPengeluaran } from '../src/lib/produksi/pengeluaran'
import { buatPerintah, muatPerintah, ubahStatusPerintah } from '../src/lib/produksi/perintah'
import { hitungHpp, hppResep, menuTanpaResep, muatResep, simpanBahan, tambahResep, ubahStatusResep } from '../src/lib/produksi/resep'
import { bukaShift } from '../src/lib/shift'
import { Desimal, des } from '../src/lib/stok/angka'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { imporStok } from '../src/lib/stok/impor'
import { catatGerak, periksaRantai, periksaSaldo } from '../src/lib/stok/mesin'
import { buatAktor, k, muatAktor, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let outlet: number
let gudang: number
const p: Record<string, number> = {}
const menu: Record<string, number> = {}
let tunai = 0
let paket = 0

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)
const saldo = async (produk: number, lokasi: number) => {
  const b = await db.stockBalance.findUnique({ where: { productId_locationId: { productId: produk, locationId: lokasi } } })
  return { qty: b ? des(b.qty).toString() : '0', nilai: b?.value ?? 0n }
}
const tgl = () => hariIni().toISOString().slice(0, 10)
const audit = (action: string, docId?: number) => db.auditLog.count({ where: { action, ...(docId ? { docId: String(docId) } : {}) } })
const bersih = async () => {
  assert.deepEqual(await periksaSaldo(db), [], 'saldo cocok dengan ledger')
  assert.equal(await periksaRantai(db), 0, 'kartu stok tidak putus')
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('produksi'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gudang = (await db.location.findUniqueOrThrow({ where: { code: 'HO' } })).id
  const gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  const ml = (await db.unit.findFirstOrThrow({ where: { name: 'mililiter' } })).id
  const pcs = (await db.unit.findFirstOrThrow({ where: { name: 'pcs' } })).id
  for (const [kode, nama, satuan, jenis] of [
    ['KOPI', 'Kopi uji', gram, 'bahan'],
    ['SUSU', 'Susu uji', ml, 'bahan'],
    ['CUP', 'Cup uji', pcs, 'bahan'],
    ['ROTI', 'Roti uji', pcs, 'bahan'],
    ['AIR', 'Air uji', ml, 'bahan'],
    ['CB', 'Cold brew uji', ml, 'setengah_jadi'],
  ] as const) {
    p[kode] = (await db.product.create({ data: { code: kode, name: nama, baseUnitId: satuan, kind: jenis } })).id
  }
  // Saldo awal: kopi 1000 g @ 300, susu 5000 ml @ 20, cup 100 @ 750, roti 2 @ 3.500, air 10.000 ml @ 1 di Outlet; kopi 2000 g @ 320 di gudang.
  await db.$transaction((tx) =>
    catatGerak(tx, { docType: 'uji', docId: 1, docNo: 'UJI-1', tanggal: hariIni(), oleh: null }, [
      { productId: p.KOPI, locationId: outlet, qty: 1000, hargaSatuan: 300 },
      { productId: p.SUSU, locationId: outlet, qty: 5000, hargaSatuan: 20 },
      { productId: p.CUP, locationId: outlet, qty: 100, hargaSatuan: 750 },
      { productId: p.ROTI, locationId: outlet, qty: 2, hargaSatuan: 3500 },
      { productId: p.AIR, locationId: outlet, qty: 10000, hargaSatuan: 1 },
      { productId: p.KOPI, locationId: gudang, qty: 2000, hargaSatuan: 320 },
    ]),
  )
  await db.menuCategory.createMany({ data: [{ code: 'kopi', name: 'Kopi' }, { code: 'makan', name: 'Makanan' }] })
  for (const [n, c, h] of [
    ['Latte', 'kopi', 30000n],
    ['Sando', 'makan', 25000n],
    ['Air putih', 'kopi', 5000n],
  ] as const) {
    menu[n] = (await db.menuItem.create({ data: { name: n, category: c, price: h } })).id
  }
  paket = (await db.menuSet.create({ data: { name: 'Pagi', mainItemId: menu.Sando, drinkItemId: menu.Latte, normalPrice: 55000n, price: 45000n } })).id
  tunai = (await db.paymentMethod.create({ data: { name: 'Tunai', kind: 'tunai' } })).id
})
after(() => hapus())

describe('resep dan HPP', () => {
  test('hitungHpp: nilai per baris dibulatkan rupiah, ditambah biaya, dibagi qty hasil', () => {
    const h = hitungHpp(
      [
        { productId: 1, qty: '18', harga: new Desimal('300.5') },
        { productId: 2, qty: '150', harga: new Desimal('20') },
      ],
      1000n,
      '4',
    )
    assert.deepEqual(
      h.rinci.map((r) => r.nilai),
      [5409n, 3000n],
    )
    assert.equal(h.total, 9409n)
    assert.equal(h.perSatuan.toString(), '2352.25')
  })

  test('resep menu: tambah, bahan, HPP dari harga rata-rata lokasi, audit', async () => {
    const r = await tambahResep(db, k(admin), admin, { kind: 'menu', name: 'Resep Latte', menuItemId: String(menu.Latte) })
    assert.match(r.code, /^RM-\d{4}-\d{4}$/)
    assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: menu.Latte } })).bomId, r.id)
    await simpanBahan(db, k(admin), admin, r.id, { productId: String(p.KOPI), qty: '18' })
    await simpanBahan(db, k(admin), admin, r.id, { productId: String(p.SUSU), qty: '150' })
    await simpanBahan(db, k(admin), admin, r.id, { productId: String(p.CUP), qty: '1' })
    // Bahan yang sama disimpan lagi berarti mengubah qty, bukan baris baru.
    assert.equal(await simpanBahan(db, k(admin), admin, r.id, { productId: String(p.SUSU), qty: '180' }), 'ubah')
    const b = (await muatResep(db, r.id))!
    assert.equal(b.bomLines.length, 3)
    assert.equal(b.version, 5)
    const h = (await hppResep(db, [b], outlet)).get(r.id)!
    // 18 x 300 + 180 x 20 + 1 x 750
    assert.equal(h.total, 5400n + 3600n + 750n)
    const hGudang = (await hppResep(db, [b], gudang)).get(r.id)!
    assert.equal(hGudang.rinci[0].nilai, 18n * 320n, 'harga rata-rata lokasi gudang')
    assert.equal(await audit('resep.tambah', r.id), 1)
    assert.equal(await audit('resep.bahan_tambah', r.id), 3)
    assert.equal(await audit('resep.bahan_ubah', r.id), 1)
    await galat(() => tambahResep(db, k(admin), admin, { kind: 'menu', name: 'Latte kedua', menuItemId: String(menu.Latte) }), /sudah punya resep aktif/)
  })

  test('resep sando dan izin: Kasir tidak bisa mengubah resep', async () => {
    const r = await tambahResep(db, k(owner), owner, { kind: 'menu', name: 'Resep Sando', menuItemId: String(menu.Sando) })
    await simpanBahan(db, k(owner), owner, r.id, { productId: String(p.ROTI), qty: '2' })
    await simpanBahan(db, k(owner), owner, r.id, { productId: String(p.CUP), qty: '1' })
    await ditolak(() => tambahResep(db, k(kasir), kasir, { kind: 'menu', name: 'Resep Air', menuItemId: String(menu['Air putih']) }))
    await ditolak(() => simpanBahan(db, k(kasir), kasir, r.id, { productId: String(p.CUP), qty: '2' }))
  })

  test('menu tanpa resep tampil sebagai peringatan', async () => {
    const t = await menuTanpaResep(db)
    assert.deepEqual(
      t.map((m) => m.name),
      ['Air putih'],
    )
    assert.equal(t[0].sebab, 'belum ada resep')
  })
})

describe('potong stok penjualan', () => {
  let jual1 = 0
  test('jual menu biasa dan paket set: bahan keluar di lokasi shift, HPP dari nilai keluar', async () => {
    await bukaShift(db, k(kasir), kasir, { modal: '100000' })
    const a = await saldo(p.KOPI, outlet)
    const j = await simpanPenjualan(db, k(kasir), kasir, {
      mode: 'takeaway',
      baris: [
        { menuItemId: menu.Latte, qty: 2 },
        { menuSetId: paket, qty: 1 },
        { menuItemId: menu['Air putih'], qty: 1 },
      ],
      bayar: [{ metodeId: tunai, jumlah: 200000 }],
    })
    jual1 = j.id
    // Latte x2: kopi 36, susu 360, cup 2. Paket: sando (roti 2, cup 1) + latte (kopi 18, susu 180, cup 1). Air putih tanpa resep.
    assert.equal((await saldo(p.KOPI, outlet)).qty, String(Number(a.qty) - 54))
    assert.equal((await saldo(p.ROTI, outlet)).qty, '0')
    assert.equal((await saldo(p.CUP, outlet)).qty, '96')
    const s = await db.sale.findUniqueOrThrow({ where: { id: j.id }, include: { saleLines: { orderBy: { id: 'asc' } } } })
    const latte = 18n * 300n + 180n * 20n + 750n
    assert.deepEqual(
      s.saleLines.map((l) => l.hpp),
      [2n * latte, 7000n + 750n + latte, 0n],
    )
    assert.equal(s.hpp, 2n * latte + 7000n + 750n + latte)
    assert.equal(j.hpp, s.hpp)
    const g = await db.stockLedger.findMany({ where: { docType: 'sale', docId: j.id } })
    assert.ok(g.every((x) => x.locationId === outlet && des(x.qty).isNeg() && x.docNo === j.no))
    const a1 = await db.auditLog.findFirstOrThrow({ where: { action: 'penjualan.simpan', docId: String(j.id) } })
    assert.deepEqual((a1.afterJson as { tanpaResep: string[] }).tanpaResep, ['Air putih'])
    await bersih()
  })

  test('void mengembalikan stok dan nilai lewat gerak balik', async () => {
    const sebelum = await Promise.all([p.KOPI, p.SUSU, p.CUP, p.ROTI].map((x) => db.stockLedger.aggregate({ where: { productId: x, locationId: outlet, docType: { not: 'sale' } }, _sum: { qty: true, value: true } })))
    await voidPenjualan(db, k(owner), owner, jual1, { alasan: 'Salah input menu' })
    for (const [i, x] of [p.KOPI, p.SUSU, p.CUP, p.ROTI].entries()) {
      const s = await saldo(x, outlet)
      assert.equal(s.qty, des(sebelum[i]._sum.qty ?? 0).toString(), `qty ${x} kembali`)
      assert.equal(s.nilai, sebelum[i]._sum.value, `nilai ${x} kembali`)
    }
    assert.equal(await db.stockLedger.count({ where: { docType: 'sale', docId: jual1, isReversal: true } }), 7)
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'penjualan.void', docId: String(jual1) } })
    assert.equal((a.afterJson as { gerakBalik: number }).gerakBalik, 7)
    await bersih()
  })

  test('stok kurang: saklar pos.jual_stok_minus nyala membolehkan minus, mati menolak', async () => {
    // Roti tinggal 2 (sesudah void). Jual 2 sando = 4 roti.
    const j = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Sando, qty: 2 }], bayar: [{ metodeId: tunai, jumlah: 50000 }] })
    assert.equal((await saldo(p.ROTI, outlet)).qty, '-2')
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'penjualan.simpan', docId: String(j.id) } })
    assert.equal((a.afterJson as { stokMinus: { produk: string }[] }).stokMinus[0].produk, 'Roti uji')
    const r = await db.role.findUniqueOrThrow({ where: { code: 'kasir' } })
    const s = await db.featureSwitch.findUniqueOrThrow({ where: { code: 'pos.jual_stok_minus' } })
    await db.roleFeatureSwitch.update({ where: { roleId_featureSwitchId: { roleId: r.id, featureSwitchId: s.id } }, data: { enabled: false } })
    const kasirMati = await muatAktor(db, 'kasir1')
    const n = await db.sale.count()
    await galat(() => simpanPenjualan(db, k(kasirMati), kasirMati, { mode: 'takeaway', baris: [{ menuItemId: menu.Sando, qty: 1 }], bayar: [{ metodeId: tunai, jumlah: 25000 }] }), /Stok Roti uji di Outlet tidak cukup/)
    assert.equal(await db.sale.count(), n, 'penjualan ikut batal')
    await db.roleFeatureSwitch.update({ where: { roleId_featureSwitchId: { roleId: r.id, featureSwitchId: s.id } }, data: { enabled: true } })
    // Void penjualan yang membuat minus mengembalikan saldo ke 2.
    await voidPenjualan(db, k(owner), owner, j.id, { alasan: 'Uji stok minus' })
    assert.equal((await saldo(p.ROTI, outlet)).qty, '2')
    await bersih()
  })
})

describe('produksi', () => {
  let bom = 0
  test('BOM assembly: hasil per batch dan biaya tambahan', async () => {
    const b = await tambahResep(db, k(admin), admin, { kind: 'assembly', name: 'Cold brew 1 liter', productId: String(p.CB), outputQty: '1000', extraCost: '2.000' })
    bom = b.id
    assert.match(b.code, /^BA-/)
    await simpanBahan(db, k(admin), admin, bom, { productId: String(p.KOPI), qty: '100', tolPct: '5' })
    await simpanBahan(db, k(admin), admin, bom, { productId: String(p.AIR), qty: '1100' })
    await galat(() => simpanBahan(db, k(admin), admin, bom, { productId: String(p.CB), qty: '1' }), /bahannya sendiri/)
    const h = (await hppResep(db, [(await muatResep(db, bom))!], gudang)).get(bom)!
    // Di gudang kopi 320, air belum ada stok: harga beli terakhir 0 (air dibeli di Outlet tanpa hargaBeli).
    assert.equal(h.total, 100n * 320n + 2000n)
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.CB } })).bomId, bom)
  })

  test('produksi cepat: bahan keluar dan hasil masuk dengan nilai bahan + biaya', async () => {
    const d = await buatCepat(db, k(admin), admin, { bomId: String(bom), qty: '2', fromLocationId: String(outlet), toLocationId: String(outlet), date: tgl() })
    const isi = (await muatCepat(db, d.id))!
    assert.equal(des(isi.outputQty).toString(), '2000')
    assert.equal(isi.extraCost, 4000n)
    assert.deepEqual(
      isi.quickProductionLines.map((l) => des(l.systemQty).toString()),
      ['200', '2200'],
    )
    // Qty aktual kopi 230 menyimpang 15% (toleransi 5%): posting tanpa catatan ditolak.
    await ubahQtyCepat(db, k(admin), admin, d.id, { [`qty_${isi.quickProductionLines[0].id}`]: '230', [`qty_${isi.quickProductionLines[1].id}`]: '2200' })
    await galat(() => ubahStatusCepat(db, k(admin), admin, d.id, 'posting'), /menyimpang/)
    await ubahQtyCepat(db, k(admin), admin, d.id, { [`qty_${isi.quickProductionLines[0].id}`]: '200', [`qty_${isi.quickProductionLines[1].id}`]: '2200' })
    const kopiSebelum = await saldo(p.KOPI, outlet)
    await ubahStatusCepat(db, k(admin), admin, d.id, 'posting')
    const g = await db.stockLedger.findMany({ where: { docType: 'quick_production', docId: d.id }, orderBy: { id: 'asc' } })
    const nilaiBahan = -g.filter((x) => des(x.qty).isNeg()).reduce((n, x) => n + x.value, 0n)
    const masuk = g.find((x) => x.productId === p.CB)!
    assert.equal(nilaiBahan, 200n * 300n + 2200n)
    assert.equal(masuk.value, nilaiBahan + 4000n)
    assert.equal(des(masuk.qty).toString(), '2000')
    assert.equal((await saldo(p.KOPI, outlet)).nilai, kopiSebelum.nilai - 60000n)
    const dok = await db.quickProduction.findUniqueOrThrow({ where: { id: d.id } })
    assert.equal(dok.status, 'Diposting')
    assert.equal(dok.value, masuk.value)
    assert.equal(await audit('produksi_cepat.posting', d.id), 1)
    await bersih()
  })

  test('pembatalan produksi cepat lewat gerak balik mengembalikan qty dan nilai', async () => {
    const d = await db.quickProduction.findFirstOrThrow({ where: { status: 'Diposting' } })
    const sebelum = await Promise.all([saldo(p.KOPI, outlet), saldo(p.AIR, outlet), saldo(p.CB, outlet)])
    await galat(() => ubahStatusCepat(db, k(admin), admin, d.id, 'batal', { alasan: 'Salah batch' }), /saklar/)
    await ubahStatusCepat(db, k(owner), owner, d.id, 'batal', { alasan: 'Salah batch' })
    const sesudah = await Promise.all([saldo(p.KOPI, outlet), saldo(p.AIR, outlet), saldo(p.CB, outlet)])
    assert.equal(sesudah[0].nilai, sebelum[0].nilai + 60000n)
    assert.equal(Number(sesudah[1].qty), Number(sebelum[1].qty) + 2200)
    assert.equal(sesudah[2].qty, '0')
    assert.equal(sesudah[2].nilai, 0n)
    assert.equal((await db.quickProduction.findUniqueOrThrow({ where: { id: d.id } })).status, 'Batal')
    await bersih()
  })

  test('perintah, pengeluaran bahan, hasil produksi: nilai hasil = nilai bahan, Selesai otomatis', async () => {
    const po = await buatPerintah(db, k(admin), admin, { bomId: String(bom), plannedQty: '2000', materialLocationId: String(outlet), outputLocationId: String(outlet), date: tgl() })
    const isi = (await muatPerintah(db, po.id))!
    assert.deepEqual(
      isi.productionOrderLines.map((l) => [des(l.requiredQty).toString(), des(l.tolPct).toString()]),
      [
        ['200', '5'],
        ['2200', '0'],
      ],
    )
    await galat(() => buatPengeluaran(db, k(admin), admin, { productionOrderId: String(po.id), kind: 'keluar', locationId: String(outlet), date: tgl() }), /Disetujui/)
    await ditolak(() => ubahStatusPerintah(db, k(kasir), kasir, po.id, 'setujui'))
    await ubahStatusPerintah(db, k(admin), admin, po.id, 'setujui')

    // Pengeluaran pertama: semua sisa kebutuhan, lalu kopi dikurangi jadi 150.
    const k1 = await buatPengeluaran(db, k(admin), admin, { productionOrderId: String(po.id), kind: 'keluar', locationId: String(outlet), date: tgl() })
    const b1 = (await muatPengeluaran(db, k1.id))!.materialIssueLines
    assert.deepEqual(
      b1.map((b) => des(b.qty).toString()),
      ['200', '2200'],
    )
    await ubahQtyPengeluaran(db, k(admin), admin, k1.id, { [`qty_${b1[0].id}`]: '150', [`qty_${b1[1].id}`]: '2200' })
    // Hasil sebelum ada pengeluaran yang Diposting ditolak.
    const h0 = await buatHasil(db, k(admin), admin, { productionOrderId: String(po.id), locationId: String(outlet), date: tgl(), qty: '500' })
    await galat(() => ubahStatusHasil(db, k(admin), admin, h0.id, 'posting'), /belum punya pengeluaran bahan/)
    await ubahStatusPengeluaran(db, k(admin), admin, k1.id, 'posting')
    let po1 = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(po1.wipValue, 150n * 300n + 2200n)

    // Pengeluaran kedua melebihi kebutuhan + toleransi ditolak (150 + 70 > 210).
    const k2 = await buatPengeluaran(db, k(admin), admin, { productionOrderId: String(po.id), kind: 'keluar', locationId: String(outlet), date: tgl() })
    const b2 = (await muatPengeluaran(db, k2.id))!.materialIssueLines
    assert.equal(des(b2[0].qty).toString(), '50')
    await ubahQtyPengeluaran(db, k(admin), admin, k2.id, { [`qty_${b2[0].id}`]: '70', [`qty_${b2[1].id}`]: '0' })
    await galat(() => ubahStatusPengeluaran(db, k(admin), admin, k2.id, 'posting'), /melebihi kebutuhan/)
    await ubahQtyPengeluaran(db, k(admin), admin, k2.id, { [`qty_${b2[0].id}`]: '50', [`qty_${b2[1].id}`]: '0' })
    await ubahStatusPengeluaran(db, k(admin), admin, k2.id, 'posting')

    // Pengembalian 10 g kopi dengan harga keluar terakhir.
    const kb = await buatPengeluaran(db, k(admin), admin, { productionOrderId: String(po.id), kind: 'kembali', locationId: String(outlet), date: tgl() })
    const b3 = (await muatPengeluaran(db, kb.id))!.materialIssueLines
    await ubahQtyPengeluaran(db, k(admin), admin, kb.id, { [`qty_${b3[0].id}`]: '10', [`qty_${b3[1].id}`]: '0' })
    await ubahStatusPengeluaran(db, k(admin), admin, kb.id, 'posting')
    po1 = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })
    const nilaiBahan = -(await db.stockLedger.aggregate({ where: { docType: 'material_issue', docId: { in: [k1.id, k2.id, kb.id] } }, _sum: { value: true } }))._sum.value!
    assert.equal(po1.wipValue, nilaiBahan)

    // Hasil pertama 500 dari 2000: seperempat nilai dalam proses.
    await ubahStatusHasil(db, k(admin), admin, h0.id, 'posting')
    const r1 = await db.productionResult.findUniqueOrThrow({ where: { id: h0.id } })
    assert.equal(r1.value, nilaiHasil(nilaiBahan, des(500), des(0), des(2000)).nilai)
    assert.equal(r1.value, (nilaiBahan * 500n + 1000n) / 2000n)
    // Pembatalan hasil mengembalikan nilainya ke proses, lalu diposting ulang lewat dokumen baru.
    await ubahStatusHasil(db, k(owner), owner, h0.id, 'batal', { alasan: 'Salah timbang' })
    po1 = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(po1.wipValue, nilaiBahan)
    assert.equal(des(po1.producedQty).toString(), '0')
    // Pengeluaran tidak bisa dibatalkan bila ada hasil Diposting.
    const h1 = await buatHasil(db, k(admin), admin, { productionOrderId: String(po.id), locationId: String(outlet), date: tgl(), qty: '500' })
    await ubahStatusHasil(db, k(admin), admin, h1.id, 'posting')
    await galat(() => ubahStatusPengeluaran(db, k(owner), owner, k1.id, 'batal', { alasan: 'Coba batal' }), /Batalkan hasil produksinya dulu/)
    // Hasil kedua 1500 menuntaskan rencana: seluruh sisa nilai, perintah Selesai.
    const h2 = await buatHasil(db, k(admin), admin, { productionOrderId: String(po.id), locationId: String(outlet), date: tgl(), qty: '1500', wasteQty: '20' })
    await ubahStatusHasil(db, k(admin), admin, h2.id, 'posting')
    po1 = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(po1.status, 'Selesai')
    assert.equal(po1.wipValue, 0n)
    const hasil = await db.productionResult.findMany({ where: { productionOrderId: po.id, status: 'Diposting' } })
    assert.equal(
      hasil.reduce((n, h) => n + h.value, 0n),
      nilaiBahan,
      'jumlah nilai hasil sama dengan nilai bahan bersih',
    )
    assert.equal((await saldo(p.CB, outlet)).nilai, nilaiBahan)
    assert.equal(await audit('perintah.selesai', po.id), 1)
    // Sesudah Selesai, dokumen turunannya tidak bisa dibatalkan.
    await galat(() => ubahStatusHasil(db, k(owner), owner, h2.id, 'batal', { alasan: 'Coba batal' }), /sudah Selesai/)
    for (const a of ['perintah.tambah', 'perintah.setujui', 'pengeluaran.tambah', 'pengeluaran.baris_ubah', 'pengeluaran.posting', 'hasil.posting', 'hasil.batal']) assert.ok((await audit(a)) > 0, a)
    await bersih()
  })

  test('tutup manual membuang sisa nilai dalam proses dan pembatalan pengeluaran mengembalikan bahan', async () => {
    const po = await buatPerintah(db, k(owner), owner, { bomId: String(bom), plannedQty: '1000', materialLocationId: String(gudang), outputLocationId: String(outlet), date: tgl() })
    await ubahStatusPerintah(db, k(owner), owner, po.id, 'setujui')
    const kx = await buatPengeluaran(db, k(owner), owner, { productionOrderId: String(po.id), kind: 'keluar', locationId: String(gudang), date: tgl() })
    const bx = (await muatPengeluaran(db, kx.id))!.materialIssueLines
    await ubahQtyPengeluaran(db, k(owner), owner, kx.id, { [`qty_${bx[0].id}`]: '100', [`qty_${bx[1].id}`]: '0' })
    const sebelum = await saldo(p.KOPI, gudang)
    await ubahStatusPengeluaran(db, k(owner), owner, kx.id, 'posting')
    assert.equal((await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).wipValue, 32000n)
    await galat(() => ubahStatusPerintah(db, k(owner), owner, po.id, 'batal'), /belum Batal/)
    await ubahStatusPengeluaran(db, k(owner), owner, kx.id, 'batal', { alasan: 'Salah lokasi' })
    assert.deepEqual(await saldo(p.KOPI, gudang), sebelum)
    assert.equal((await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).wipValue, 0n)
    // Keluarkan lagi lalu tutup manual tanpa hasil: seluruh nilai menjadi selisih produksi.
    const ky = await buatPengeluaran(db, k(owner), owner, { productionOrderId: String(po.id), kind: 'keluar', locationId: String(gudang), date: tgl() })
    const by = (await muatPengeluaran(db, ky.id))!.materialIssueLines
    await ubahQtyPengeluaran(db, k(owner), owner, ky.id, { [`qty_${by[0].id}`]: '50', [`qty_${by[1].id}`]: '0' })
    await ubahStatusPengeluaran(db, k(owner), owner, ky.id, 'posting')
    await galat(() => ubahStatusPerintah(db, k(owner), owner, po.id, 'tutup', { alasan: '' }), /alasan/)
    await ubahStatusPerintah(db, k(owner), owner, po.id, 'tutup', { alasan: 'Mesin rusak, produksi dihentikan' })
    const akhir = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })
    assert.equal(akhir.status, 'Selesai')
    assert.equal(akhir.wipWriteOff, 16000n)
    assert.equal(akhir.wipValue, 0n)
    assert.equal(await audit('perintah.tutup', po.id), 1)
    await bersih()
  })

  test('izin produksi: Kasir tanpa akses, Admin tidak bisa membatalkan dokumen Diposting', async () => {
    await ditolak(() => buatCepat(db, k(kasir), kasir, { bomId: String(bom), qty: '1', fromLocationId: String(outlet), toLocationId: String(outlet), date: tgl() }))
    await ditolak(() => buatPerintah(db, k(kasir), kasir, { bomId: String(bom), plannedQty: '1', materialLocationId: String(outlet), outputLocationId: String(outlet), date: tgl() }))
    await ditolak(() => buatHasil(db, k(kasir), kasir, { productionOrderId: '1', locationId: String(outlet), date: tgl(), qty: '1' }))
  })

  test('resep nonaktif membuat menu tanpa resep dan penjualannya ber-HPP 0', async () => {
    const r = (await db.menuItem.findUniqueOrThrow({ where: { id: menu.Sando } })).bomId!
    await ubahStatusResep(db, k(owner), owner, r, false)
    assert.ok((await menuTanpaResep(db)).some((m) => m.name === 'Sando' && m.sebab === 'resep nonaktif'))
    const j = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Sando, qty: 1 }], bayar: [{ metodeId: tunai, jumlah: 25000 }] })
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: j.id } })).hpp, 0n)
    assert.equal(await db.stockLedger.count({ where: { docType: 'sale', docId: j.id } }), 0)
    await ubahStatusResep(db, k(owner), owner, r, true)
    assert.equal(await audit('resep.nonaktifkan', r), 1)
  })
})

describe('impor resep admin lama', () => {
  test('mencocokkan menu dan bahan menurut nama, idempoten, yang tidak cocok dilaporkan', async () => {
    await imporStok(db)
    await db.menuCategory.create({ data: { code: 'impor', name: 'Impor' } })
    for (const n of ['Iced Black', 'Real Potato Fries', 'Beef-Sando']) await db.menuItem.create({ data: { name: n, category: 'impor', price: 20000n } })
    // Bahan "Roast beef" dihapus namanya supaya resep Beef-Sando tidak cocok.
    await db.product.update({ where: { code: 'BHN-BEEF' }, data: { name: 'Daging sapi' } })
    const h = await imporResep(db)
    assert.deepEqual(h.dibuat.sort(), ['Iced Black', 'Real Potato Fries'])
    assert.deepEqual(h.bahanTakCocok, [{ menu: 'Beef-Sando', bahan: ['Roast beef'] }])
    assert.ok(h.menuTakCocok.includes('espresso'), 'menu yang tidak ada dilaporkan')
    assert.ok(h.dilewati.includes('Latte'), 'menu yang sudah punya resep dilewati')
    const iced = await db.menuItem.findFirstOrThrow({ where: { name: 'Iced Black' }, include: { bom: { include: { bomLines: true } } } })
    assert.equal(iced.bom?.bomLines.length, 3)
    const ulang = await imporResep(db)
    assert.equal(ulang.dibuat.length, 0)
    assert.ok(ulang.dilewati.includes('Iced Black'))
    assert.equal(await audit('impor.resep'), 1)
  })
})
