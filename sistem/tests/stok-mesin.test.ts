// Mesin stok tahap 4A: rata-rata tertimbang, keluar dengan harga rata-rata, stok minus, gerak balik, gerak bersamaan,
// dan hitung ulang saldo dari ledger.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan } from '../src/lib/aksi'
import { buatKlien, type Db } from '../src/lib/db'
import { des } from '../src/lib/stok/angka'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { balikDokumen, catatGerak, hitungUlangSaldo, periksaRantai, periksaSaldo, pindahStok, type DokumenAsal } from '../src/lib/stok/mesin'
import { siapkanDbUji } from './db-uji'

let db: Db
let url: string
let hapus: () => Promise<void>
let gudang: number
let outlet: number
let gram: number
let nomorDok = 0

before(async () => {
  ;({ db, url, hapus } = await siapkanDbUji('stok'))
  await isiBawaanStok(db)
  gudang = (await db.location.findUniqueOrThrow({ where: { code: 'HO' } })).id
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
})
after(() => hapus())

const produkBaru = async (code: string) => (await db.product.create({ data: { code, name: `Produk ${code}`, baseUnitId: gram } })).id
const dok = (docType = 'uji'): DokumenAsal => ({ docType, docId: ++nomorDok, docNo: `UJI-${nomorDok}`, tanggal: new Date('2026-11-20T00:00:00Z'), oleh: null })
const saldo = async (p: number, l: number) => {
  const b = await db.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: p, locationId: l } } })
  return { qty: b.qty.toString(), nilai: b.value, rata: b.avgCost.toString() }
}
const galatAturan = (pesan: RegExp) => (e: unknown) => {
  assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
  assert.match(e.message, pesan)
  return true
}

describe('rata-rata tertimbang', () => {
  test('barang masuk menghitung ulang harga rata-rata', async () => {
    const p = await produkBaru('RT1')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '1000', hargaSatuan: '320' }]))
    assert.deepEqual(await saldo(p, gudang), { qty: '1000', nilai: 320000n, rata: '320' })
    // 1000 g @ 320 + 500 g @ 350 = 495.000 / 1500 = 330
    const [h] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '500', hargaSatuan: '350' }]))
    assert.equal(h.nilai, 175000n)
    assert.equal(h.hargaRata.toString(), '330')
    assert.deepEqual(await saldo(p, gudang), { qty: '1500', nilai: 495000n, rata: '330' })
    // Harga yang tidak bulat: 3 g @ 0,3333 = 1 rupiah; rata-rata disimpan 4 desimal.
    const [h2] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '7,5'.replace(',', '.'), hargaSatuan: '333.3333' }]))
    assert.equal(h2.nilai, 2500n)
    assert.deepEqual(await saldo(p, gudang), { qty: '1507.5', nilai: 497500n, rata: '330.0166' })
    const produk = await db.product.findUniqueOrThrow({ where: { id: p } })
    assert.equal(produk.avgCost.toString(), '330.0166')
  })

  test('nilai masuk yang ditentukan pemanggil mengalahkan harga satuan', async () => {
    const p = await produkBaru('RT2')
    const [h] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '3', nilai: 1000n }], { hargaBeli: true }))
    assert.equal(h.nilai, 1000n)
    assert.equal(h.hargaSatuan.toString(), '333.3333')
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: p } })).lastCost.toString(), '333.3333')
  })
})

describe('barang keluar', () => {
  test('keluar memakai harga rata-rata dan tidak mengubahnya', async () => {
    const p = await produkBaru('KL1')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '1000', hargaSatuan: '18' }, { productId: p, locationId: gudang, qty: '1000', hargaSatuan: '20' }]))
    const [h] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '-150' }]))
    assert.equal(h.hargaSatuan.toString(), '19')
    assert.equal(h.nilai, -2850n)
    assert.deepEqual(await saldo(p, gudang), { qty: '1850', nilai: 35150n, rata: '19' })
  })

  test('keluar sampai habis mengeluarkan seluruh sisa nilai', async () => {
    const p = await produkBaru('KL2')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '3', nilai: 1000n }]))
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '-1' }]))
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '-1' }]))
    const [h] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '-1' }]))
    assert.equal(h.nilai, -334n)
    assert.deepEqual(await saldo(p, gudang), { qty: '0', nilai: 0n, rata: '333.3333' })
  })

  test('harga satuan untuk barang keluar ditolak', async () => {
    const p = await produkBaru('KL3')
    await assert.rejects(db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '-1', hargaSatuan: '5' }])), galatAturan(/harga rata-rata/))
  })

  test('qty 0 dan lebih dari 3 desimal ditolak', async () => {
    const p = await produkBaru('KL4')
    await assert.rejects(db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '0' }])), galatAturan(/tidak boleh 0/))
    await assert.rejects(db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '1.2345', hargaSatuan: '1' }])), galatAturan(/3 desimal/))
  })
})

describe('stok minus', () => {
  test('ditolak bila lokasi tidak mengizinkan, dan seluruh transaksi batal', async () => {
    const p = await produkBaru('MN1')
    const q = await produkBaru('MN2')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '10', hargaSatuan: '100' }, { productId: q, locationId: outlet, qty: '1', hargaSatuan: '100' }]))
    const ledgerSebelum = await db.stockLedger.count()
    await assert.rejects(
      db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '-4' }, { productId: q, locationId: outlet, qty: '-2' }])),
      galatAturan(/tidak cukup: tersedia 1 g, perlu 2 g/),
    )
    assert.equal(await db.stockLedger.count(), ledgerSebelum)
    assert.equal((await saldo(p, outlet)).qty, '10')
  })

  test('diizinkan lewat opsi atau pengaturan lokasi', async () => {
    const p = await produkBaru('MN3')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '2', hargaSatuan: '50' }]))
    const [h] = await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '-5' }], { izinkanMinus: true }))
    assert.equal(h.nilai, -250n)
    assert.deepEqual(await saldo(p, outlet), { qty: '-3', nilai: -150n, rata: '50' })
    // Masuk saat saldo minus: rata-rata dihitung dari saldo sesudahnya.
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '5', hargaSatuan: '60' }]))
    assert.deepEqual(await saldo(p, outlet), { qty: '2', nilai: 150n, rata: '75' })

    const lain = await db.location.create({ data: { branchId: (await db.branch.findFirstOrThrow()).id, code: 'MINUS', name: 'Lokasi minus', allowNegativeStock: true } })
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: lain.id, qty: '-1' }]))
    assert.equal((await saldo(p, lain.id)).qty, '-1')
  })
})

describe('gerak balik', () => {
  test('pembatalan mengembalikan qty, nilai, dan harga rata-rata persis', async () => {
    const p = await produkBaru('BL1')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '1000', hargaSatuan: '320' }]))
    const sebelum = await saldo(p, gudang)
    const d = dok('stock_adjustment')
    await db.$transaction((tx) => catatGerak(tx, d, [{ productId: p, locationId: gudang, qty: '333', hargaSatuan: '411.1111' }, { productId: p, locationId: gudang, qty: '-77.7' }]))
    assert.notDeepEqual(await saldo(p, gudang), sebelum)
    const balik = await db.$transaction((tx) => balikDokumen(tx, { ...d, tanggal: new Date('2026-11-21T00:00:00Z') }))
    assert.equal(balik.length, 2)
    assert.deepEqual(await saldo(p, gudang), sebelum)
    const asal = await db.stockLedger.findMany({ where: { docType: d.docType, docId: d.docId, isReversal: false } })
    const lawan = await db.stockLedger.findMany({ where: { docType: d.docType, docId: d.docId, isReversal: true } })
    assert.equal(asal.reduce((n, g) => n + g.value, 0n) + lawan.reduce((n, g) => n + g.value, 0n), 0n)
    assert.equal(lawan[0].date.toISOString().slice(0, 10), '2026-11-21')
    await assert.rejects(db.$transaction((tx) => balikDokumen(tx, d)), galatAturan(/sudah pernah dibalik/))
  })

  test('gagal bila stok sudah terpakai, kecuali minus diizinkan', async () => {
    const p = await produkBaru('BL2')
    const d = dok('stock_adjustment')
    await db.$transaction((tx) => catatGerak(tx, d, [{ productId: p, locationId: outlet, qty: '10', hargaSatuan: '100' }]))
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '-4' }]))
    await assert.rejects(db.$transaction((tx) => balikDokumen(tx, d)), galatAturan(/tidak cukup/))
    await db.$transaction((tx) => balikDokumen(tx, d, { izinkanMinus: true }))
    assert.deepEqual(await saldo(p, outlet), { qty: '-4', nilai: -400n, rata: '100' })
  })

  test('pindah stok memindahkan nilai persis dan bisa dibalik', async () => {
    const p = await produkBaru('PD1')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: gudang, qty: '3', nilai: 1000n }]))
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '10', hargaSatuan: '500' }]))
    const d = dok('stock_transfer')
    const h = await db.$transaction((tx) => pindahStok(tx, d, [{ productId: p, dari: gudang, ke: outlet, qty: '1' }]))
    assert.equal(h[0].nilai, -333n)
    assert.equal(h[1].nilai, 333n)
    assert.deepEqual(await saldo(p, gudang), { qty: '2', nilai: 667n, rata: '333.3333' })
    assert.deepEqual(await saldo(p, outlet), { qty: '11', nilai: 5333n, rata: '484.8182' })
    await db.$transaction((tx) => balikDokumen(tx, d))
    assert.deepEqual(await saldo(p, gudang), { qty: '3', nilai: 1000n, rata: '333.3333' })
    assert.deepEqual(await saldo(p, outlet), { qty: '10', nilai: 5000n, rata: '500' })
  })

  test('ledger tidak bisa diubah atau dihapus', async () => {
    const g = await db.stockLedger.findFirstOrThrow()
    await assert.rejects(db.stockLedger.update({ where: { id: g.id }, data: { qty: des('1') } }))
    await assert.rejects(db.stockLedger.delete({ where: { id: g.id } }))
  })
})

describe('gerak bersamaan', () => {
  test('dua transaksi yang menyentuh produk-lokasi yang sama tidak merusak saldo', async () => {
    const p = await produkBaru('BS1')
    const q = await produkBaru('BS2')
    await db.$transaction((tx) => catatGerak(tx, dok(), [{ productId: p, locationId: outlet, qty: '1000', hargaSatuan: '10' }, { productId: q, locationId: outlet, qty: '1000', hargaSatuan: '10' }]))
    // Dua klien terpisah supaya benar-benar memakai dua koneksi. Tiap transaksi menahan kunci sebentar.
    const a = buatKlien(url)
    const b = buatKlien(url)
    try {
      const jalan = (klien: Db, n: number, urut: 'pq' | 'qp') =>
        Promise.all(
          Array.from({ length: n }, () =>
            klien.$transaction(async (tx) => {
              const gerak = [
                { productId: p, locationId: outlet, qty: '-3' },
                { productId: q, locationId: outlet, qty: '-2' },
              ]
              await catatGerak(tx, dok('kasir'), urut === 'pq' ? gerak : gerak.reverse())
              await tx.$executeRaw`SELECT pg_sleep(0.02)`
            }),
          ),
        )
      await Promise.all([jalan(a, 10, 'pq'), jalan(b, 10, 'qp')])
    } finally {
      await a.$disconnect()
      await b.$disconnect()
    }
    assert.deepEqual(await saldo(p, outlet), { qty: '940', nilai: 9400n, rata: '10' })
    assert.deepEqual(await saldo(q, outlet), { qty: '960', nilai: 9600n, rata: '10' })
    assert.equal(await periksaRantai(db), 0)
  })
})

describe('hitung ulang saldo dari ledger', () => {
  test('saldo sama dengan hasil hitung ulang dari ledger', async () => {
    assert.ok((await db.stockLedger.count()) > 20)
    assert.deepEqual(await periksaSaldo(db), [])
    assert.equal(await periksaRantai(db), 0)
    assert.deepEqual(await db.$transaction((tx) => hitungUlangSaldo(tx)), [])
  })

  test('saldo yang rusak ditemukan lalu diperbaiki dari ledger', async () => {
    const p = (await db.product.findUniqueOrThrow({ where: { code: 'RT1' } })).id
    const benar = await saldo(p, gudang)
    await db.stockBalance.update({ where: { productId_locationId: { productId: p, locationId: gudang } }, data: { qty: des('1'), value: 5n } })
    const beda = await periksaSaldo(db)
    assert.equal(beda.length, 1)
    assert.equal(beda[0].ledger.qty, benar.qty)
    const diperbaiki = await db.$transaction((tx) => hitungUlangSaldo(tx))
    assert.equal(diperbaiki.length, 1)
    assert.deepEqual(await saldo(p, gudang), benar)
    assert.deepEqual(await periksaSaldo(db), [])
  })
})
