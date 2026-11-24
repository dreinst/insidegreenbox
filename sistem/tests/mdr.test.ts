// tahap 6C: MDR per transaksi dengan batas bebas dan riwayat tarif bertanggal (KONTRAK 11 butir 123 sampai 125).
// Hitungan murni, tarif mengikuti tanggal penjualan (bukan tanggal shift), void tidak dihitung, setoran dan jurnal
// memakai MDR hasil hitungan, laporan memakai hitungan yang sama, serta aturan menambah tarif.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import { isiMetodeBayar, METODE_BAWAAN } from '../src/lib/impor-menu'
import type { Pengguna } from '../src/lib/izin-inti'
import { ringkasanPembayaran } from '../src/lib/laporan'
import { mdrTransaksi, tarifPada, teksTarif } from '../src/lib/mdr'
import { riwayatTarif, tambahMetode, tambahTarif, ubahMetode } from '../src/lib/metode-bayar'
import { simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { tambahRekening } from '../src/lib/rekening'
import { buatSetoranHarian, postingSetoran } from '../src/lib/setoran'
import { bukaShift, tutupShift } from '../src/lib/shift'
import { buatAktor, k, siapkanDbUji } from './db-uji'
import { hariKe, pindahJual, pindahShift, siapkanToko } from './toko-uji'

const BI = { mdrPct: 0.3, freeLimit: 500000 }

describe('hitungan MDR satu transaksi', () => {
  test('di bawah batas 0, tepat di batas 0, di atas batas 0,3% dari seluruh nominal', () => {
    assert.equal(mdrTransaksi(499999, BI), 0)
    assert.equal(mdrTransaksi(500000, BI), 0)
    assert.equal(mdrTransaksi(500001, BI), 1500)
    assert.equal(mdrTransaksi(600000, BI), 1800)
  })
  test('tanpa batas bebas, tunai, tanpa tarif, dan pembulatan setengah rupiah ke atas', () => {
    assert.equal(mdrTransaksi(1000, { mdrPct: 1, freeLimit: null }), 10)
    assert.equal(mdrTransaksi(1000, { mdrPct: 0.15, freeLimit: null }), 2, '1,5 dibulatkan ke 2 seperti ROUND PostgreSQL')
    assert.equal(mdrTransaksi(600000, BI, true), 0)
    assert.equal(mdrTransaksi(600000, null), 0)
    assert.equal(teksTarif(BI), '0,3% di atas Rp 500.000 per transaksi')
    assert.equal(teksTarif({ mdrPct: 1, freeLimit: null }), '1%')
  })
})

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let toko: Awaited<ReturnType<typeof siapkanToko>>
const D3 = hariKe(-3)
const D1 = hariKe(-1)
const menu: Record<number, number> = {}
let qrisBi = 0

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('mdr'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  toko = await siapkanToko(db)
  // Tanpa pajak dan service supaya nominal pembayaran tepat sama dengan harga menu.
  const cabang = await db.branch.findFirstOrThrow()
  await db.branch.update({ where: { id: cabang.id }, data: { taxPct: 0, servicePct: 0 } })
  for (const harga of [400000, 450000, 500000, 600000, 700000]) menu[harga] = (await db.menuItem.create({ data: { name: `Paket ${harga}`, category: 'kopi', price: BigInt(harga) } })).id
  await tambahRekening(db, k(owner), owner, { bankName: 'Mandiri', accountNo: '1230009999', holderName: 'Greenbox' })
})
after(() => hapus())

const jual = (harga: number, metodeId = qrisBi) => simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu[harga], qty: 1 }], bayar: [{ metodeId, jumlah: harga }] })

describe('tarif bertanggal', () => {
  test('metode baru membawa tarif pertama; tarif baru bertanggal, tanggal kembar dan izin ditolak', async () => {
    const m = await tambahMetode(db, k(owner), owner, { name: 'QRIS BI', kind: 'qris', mdrPct: '0,3', freeLimit: '500.000', effectiveFrom: '2026-10-01', note: 'Aturan BI' })
    qrisBi = m.id
    await assert.rejects(tambahTarif(db, k(admin), admin, m.id, { mdrPct: '1', freeLimit: '', effectiveFrom: D1 }), (e) => e instanceof GalatIzin)
    await assert.rejects(tambahTarif(db, k(owner), owner, m.id, { mdrPct: '1', freeLimit: '', effectiveFrom: '2026-10-01' }), (e) => e instanceof GalatAturan && e.kolom === 'effectiveFrom')
    await assert.rejects(tambahTarif(db, k(owner), owner, m.id, { mdrPct: '1', freeLimit: '', effectiveFrom: '2030-01-01' }), (e) => e instanceof GalatAturan && e.kolom === 'effectiveFrom')
    await assert.rejects(tambahTarif(db, k(owner), owner, m.id, { mdrPct: '25', freeLimit: '', effectiveFrom: D1 }))
    // Mulai D1 tarif naik jadi 1% tanpa batas bebas.
    await tambahTarif(db, k(owner), owner, m.id, { mdrPct: '1', freeLimit: '', effectiveFrom: D1, note: 'Uji' })
    assert.equal(Number((await tarifPada(db, m.id, D3))!.mdrPct), 0.3)
    assert.equal((await tarifPada(db, m.id, D3))!.freeLimit, 500000n)
    assert.equal(Number((await tarifPada(db, m.id, D1))!.mdrPct), 1)
    assert.equal(await tarifPada(db, m.id, '2026-09-30'), null)
    const r = await riwayatTarif(db, m.id)
    assert.deepEqual(r.map((x) => [x.iso, x.keadaan]), [[D1, 'berlaku'], ['2026-10-01', 'lama']])
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'metode_bayar.tarif', docId: String(m.id) } })
    assert.match(audit.summary, /1% mulai/)
    assert.deepEqual((audit.beforeJson as { mdrPct: string }).mdrPct, '0.3')
    // Kolom lama disamakan dengan tarif hari ini untuk image lama.
    assert.equal(Number((await db.paymentMethod.findUniqueOrThrow({ where: { id: m.id } })).mdrPct), 1)
  })
  test('tunai tidak boleh punya MDR, dan metode bertarif tidak bisa diganti jadi tunai', async () => {
    await assert.rejects(tambahTarif(db, k(owner), owner, toko.metode.Tunai, { mdrPct: '0,5', freeLimit: '', effectiveFrom: D1 }), (e) => e instanceof GalatAturan && e.kolom === 'mdrPct')
    await assert.rejects(ubahMetode(db, k(owner), owner, qrisBi, { name: 'QRIS BI', kind: 'tunai' }), (e) => e instanceof GalatAturan && e.kolom === 'kind')
  })
})

describe('setoran QRIS memakai MDR per transaksi', () => {
  let setoranId = 0
  test('tarif mengikuti tanggal penjualan, batas bebas, dan void tidak dihitung', async () => {
    const s = await bukaShift(db, k(kasir), kasir, { modal: '0' })
    await pindahShift(db, s.id, D3, '08:00')
    const a = await jual(400000)
    const b = await jual(500000)
    const c = await jual(600000)
    const v = await jual(700000)
    // Penjualan sesudah tengah malam di shift yang sama jatuh di tanggal D1, jadi memakai tarif D1 (1%).
    const e = await jual(450000)
    for (const [x, iso] of [[a, D3], [b, D3], [c, D3], [v, D3], [e, D1]] as const) await pindahJual(db, x.id, iso, iso === D1 ? '00:30' : '10:00')
    await voidPenjualan(db, k(owner), owner, v.id, { alasan: 'Salah input' })
    await tutupShift(db, k(kasir), kasir, s.id, { kasDihitung: '0' })
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D3 })
    const q = h.dibuat.find((x) => x.metode === 'QRIS BI')!
    setoranId = q.id
    const st = await db.posSettlement.findUniqueOrThrow({ where: { id: q.id }, include: { posSettlementLines: true } })
    // 400.000 dan 500.000 bebas, 600.000 x 0,3% = 1.800, 450.000 x 1% = 4.500, 700.000 void tidak dihitung.
    const harap = 1800 + 4500
    assert.equal(Number(st.expectedTotal), 400000 + 500000 + 600000 + 450000)
    assert.equal(Number(st.mdrFee), harap)
    assert.equal(Number(st.actualTotal), Number(st.expectedTotal) - harap)
    assert.equal(Number(st.diff), 0)
    assert.equal(Number(st.posSettlementLines[0].actual), Number(st.expectedTotal) - harap)
    // Laporan Ringkasan Pembayaran memakai hitungan yang sama.
    const r = await ringkasanPembayaran(db, { dari: D3, sampai: D1 })
    assert.equal(r.baris.find((x) => x.id === qrisBi)!.mdr, harap)
  })
  test('jurnal setoran memakai MDR hasil hitungan sebagai beban MDR', async () => {
    await postingSetoran(db, k(admin), admin, setoranId)
    const j = await db.journal.findFirstOrThrow({ where: { sourceType: 'pos_settlement', sourceId: setoranId }, include: { journalLines: { include: { account: true } } } })
    const beban = j.journalLines.filter((l) => l.account.code === '6-1200').reduce((n, l) => n + l.debit - l.credit, 0n)
    assert.equal(beban, 6300n)
  })
})

describe('bawaan seed', () => {
  test('isiMetodeBayar membuat empat metode bertarif bawaan dan tidak menimpa tarif yang sudah ada', async () => {
    const qris = await db.paymentMethod.findFirstOrThrow({ where: { name: 'QRIS' } })
    const sebelum = await db.paymentMethodMdr.count({ where: { paymentMethodId: qris.id } })
    assert.deepEqual(await isiMetodeBayar(db), { baru: 2, dilewati: 2 })
    assert.equal(await db.paymentMethodMdr.count({ where: { paymentMethodId: qris.id } }), sebelum, 'QRIS uji tidak ditimpa')
    assert.equal(Number((await tarifPada(db, qris.id, D1))!.mdrPct), 0.7)
    const debit = await db.paymentMethod.findFirstOrThrow({ where: { name: 'Debit' }, include: { tarifMdr: true } })
    const mandiri = await db.paymentMethod.findFirstOrThrow({ where: { name: 'Debit Mandiri' }, include: { tarifMdr: true } })
    assert.deepEqual([debit.kind, Number(debit.tarifMdr[0].mdrPct), debit.tarifMdr[0].freeLimit], ['debit', 1, null])
    assert.deepEqual([mandiri.kind, mandiri.active, Number(mandiri.tarifMdr[0].mdrPct)], ['debit', true, 0.15])
    assert.equal(METODE_BAWAAN.find((m) => m.name === 'QRIS')!.tarif.freeLimit, 500000n)
    assert.deepEqual(await isiMetodeBayar(db), { baru: 0, dilewati: 4 })
  })
})
