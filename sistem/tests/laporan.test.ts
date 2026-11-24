// Laporan penjualan dan POS tahap 5A: total cocok dengan penjualan uji, void dipisah, batas tanggal WIB, alokasi
// potongan per menu, ringkasan pembayaran, tutup harian, selisih kas, dan CSV.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { rekapMenu, rekapPenjualan, rentang, ringkasanPembayaran, selisihKas, tutupHarian } from '../src/lib/laporan'
import { keCsv, tabelHarian, tabelMenu, tabelRekap } from '../src/lib/laporan-kolom'
import { hitungKeranjang } from '../src/lib/hitung-kasir'
import { simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { bukaShift, tutupShift } from '../src/lib/shift'
import { buatAktor, k, siapkanDbUji } from './db-uji'
import { hariKe, pindahJual, pindahShift, siapkanToko } from './toko-uji'

let db: Db
let hapus: () => Promise<void>
let admin: Pengguna
let kasir: Pengguna
let kasir2: Pengguna
let toko: Awaited<ReturnType<typeof siapkanToko>>
let teh = 0
const D1 = hariKe(-2)
const D2 = hariKe(-1)
const jual: Record<string, { id: number; total: number }> = {}
let s1 = 0
let s2 = 0

const tunai = (jumlah: number) => [{ metodeId: toko.metode.Tunai, jumlah }]

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('laporan'))
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  kasir2 = await buatAktor(db, 'kasir', 'kasir2')
  toko = await siapkanToko(db)
  // Harga tidak bulat supaya alokasi potongan member punya sisa pembulatan.
  teh = (await db.menuItem.create({ data: { name: 'Teh Spesial', category: 'kopi', price: 33333n } })).id

  s1 = (await bukaShift(db, k(kasir), kasir, { modal: '200000' })).id
  await pindahShift(db, s1, D1, '20:00')
  const simpan = async (nama: string, data: Parameters<typeof simpanPenjualan>[3], aktor = kasir) => {
    const j = await simpanPenjualan(db, k(aktor), aktor, data)
    jual[nama] = j
    return j
  }
  // j1: dua Kopi Susu dan satu Croissant, member, tunai. Tanggal D1 23:30 WIB.
  await simpan('j1', { mode: 'dinein', meja: '3', memberId: toko.member, baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 2 }, { menuItemId: toko.menu.Croissant, qty: 1 }], bayar: tunai(200000) })
  await pindahJual(db, jual.j1.id, D1, '23:30')
  // j2: paket set dan Americano, member, QRIS. D2 00:10 WIB, yang di UTC masih tanggal D1.
  const total2Akhir = hitungKeranjang([{ harga: 45000, qty: 1, jenis: 'paket' }, { harga: 22000, qty: 1, jenis: 'menu' }], 10, { pajak: 10, service: 5 }).total
  await simpan('j2', { mode: 'takeaway', memberId: toko.member, baris: [{ menuSetId: toko.paket, qty: 1 }, { menuItemId: toko.menu.Americano, qty: 1 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: total2Akhir }] })
  await pindahJual(db, jual.j2.id, D2, '00:10')
  // j3: Nasi Goreng tunai, lalu di-void Admin. D1 21:00.
  await simpan('j3', { mode: 'takeaway', baris: [{ menuItemId: toko.menu['Nasi Goreng'], qty: 1 }], bayar: tunai(100000) })
  await pindahJual(db, jual.j3.id, D1, '21:00')
  await voidPenjualan(db, k(admin), admin, jual.j3.id, { alasan: 'Salah input' })
  // j4: Teh Spesial dan Kopi Susu, member, tunai. D2 01:00.
  await simpan('j4', { mode: 'takeaway', memberId: toko.member, baris: [{ menuItemId: teh, qty: 1 }, { menuItemId: toko.menu['Kopi Susu'], qty: 1 }], bayar: tunai(200000) })
  await pindahJual(db, jual.j4.id, D2, '01:00')
  const kas1 = 200000 + Number(jual.j1.total) + Number(jual.j4.total)
  await tutupShift(db, k(kasir), kasir, s1, { kasDihitung: String(kas1) })

  // Shift kasir2 tanggal D2 dengan kas kurang 20.000 (tahap 6C: beralasan, langsung Ditutup tanpa persetujuan).
  s2 = (await bukaShift(db, k(kasir2), kasir2, { modal: '100000' })).id
  await pindahShift(db, s2, D2, '08:00')
  await simpan('j5', { mode: 'takeaway', baris: [{ menuItemId: toko.menu.Croissant, qty: 2 }], bayar: tunai(100000) }, kasir2)
  await pindahJual(db, jual.j5.id, D2, '09:00')
  await tutupShift(db, k(kasir2), kasir2, s2, { kasDihitung: String(100000 + Number(jual.j5.total) - 20000), catatan: 'Kembalian salah' })
})
after(() => hapus())

const jumlahDb = async (dari: string, sampai: string) => {
  const r = await db.sale.aggregate({ where: { status: 'Selesai', at: { gte: new Date(`${dari}T00:00:00+07:00`), lte: new Date(`${sampai}T23:59:59.999+07:00`) } }, _sum: { sub: true, disc: true, svc: true, tax: true, total: true }, _count: { _all: true } })
  return { n: r._count._all, kotor: Number(r._sum.sub), potongan: Number(r._sum.disc), service: Number(r._sum.svc), pajak: Number(r._sum.tax), total: Number(r._sum.total) }
}

describe('rentang tanggal', () => {
  test('bawaan tujuh hari terakhir, dibalik bila terbalik, dipotong 366 hari', () => {
    assert.deepEqual(rentang({}, '2026-11-20'), { dari: '2026-11-14', sampai: '2026-11-20', catatan: undefined })
    assert.equal(rentang({ dari: '2026-11-20', sampai: '2026-11-01' }).dari, '2026-11-01')
    const r = rentang({ dari: '2024-01-01', sampai: '2026-11-20' })
    assert.equal(r.dari, '2025-11-20')
    assert.ok(r.catatan)
    assert.equal(rentang({ dari: '2026-02-30' }, '2026-11-20').dari, '2026-11-14')
  })
})

describe('rekap penjualan', () => {
  test('total cocok dengan penjualan uji dan void dipisah', async () => {
    const r = await rekapPenjualan(db, { dari: D1, sampai: D2 })
    const harap = await jumlahDb(D1, D2)
    assert.equal(r.jumlah.n, 4)
    assert.deepEqual({ n: r.jumlah.n, kotor: r.jumlah.kotor, potongan: r.jumlah.potongan, service: r.jumlah.service, pajak: r.jumlah.pajak, total: r.jumlah.total }, harap)
    assert.equal(r.jumlah.total, jual.j1.total + jual.j2.total + jual.j4.total + jual.j5.total)
    assert.equal(r.jumlah.bersih, harap.kotor - harap.potongan)
    assert.equal(r.jumlah.nVoid, 1)
    assert.equal(r.jumlah.nilaiVoid, Number(jual.j3.total))
  })
  test('batas tanggal WIB: 00:10 WIB masuk hari berikutnya walau di UTC masih hari sebelumnya', async () => {
    const h1 = await rekapPenjualan(db, { dari: D1, sampai: D1 })
    assert.equal(h1.jumlah.n, 1)
    assert.equal(h1.jumlah.total, Number(jual.j1.total))
    assert.equal(h1.jumlah.nVoid, 1)
    const h2 = await rekapPenjualan(db, { dari: D2, sampai: D2 })
    assert.equal(h2.jumlah.n, 3)
    const perHari = await rekapPenjualan(db, { dari: D1, sampai: D2, kelompok: 'hari' })
    assert.deepEqual(perHari.baris.map((b) => [b.label, b.n]), [[D1, 1], [D2, 3]])
  })
  test('kelompok kasir dan saringan metode, mode, kasir', async () => {
    const kasirnya = await rekapPenjualan(db, { dari: D1, sampai: D2, kelompok: 'kasir' })
    assert.deepEqual(kasirnya.baris.map((b) => [b.label, b.n]), [['kasir1', 3], ['kasir2', 1]])
    const qris = await rekapPenjualan(db, { dari: D1, sampai: D2, metode: String(toko.metode.QRIS) })
    assert.equal(qris.jumlah.n, 1)
    assert.equal(qris.jumlah.total, Number(jual.j2.total))
    const dinein = await rekapPenjualan(db, { dari: D1, sampai: D2, mode: 'dinein' })
    assert.equal(dinein.jumlah.n, 1)
    const k2 = await rekapPenjualan(db, { dari: D1, sampai: D2, kasir: String(kasir2.id) })
    assert.equal(k2.jumlah.total, Number(jual.j5.total))
  })
})

describe('rekap penjualan menu', () => {
  test('jumlah kotor dan potongan sama dengan sale.sub dan sale.disc', async () => {
    const r = await rekapMenu(db, { dari: D1, sampai: D2 })
    const harap = await jumlahDb(D1, D2)
    assert.equal(r.jumlah.kotor, harap.kotor)
    assert.equal(r.jumlah.potongan, harap.potongan)
    assert.equal(r.jumlah.bersih, harap.kotor - harap.potongan)
    const kategori = await rekapMenu(db, { dari: D1, sampai: D2, kelompok: 'kategori' })
    assert.equal(kategori.jumlah.kotor, harap.kotor)
    assert.equal(kategori.jumlah.potongan, harap.potongan)
    assert.ok(kategori.baris.some((b) => b.nama === 'Paket set' && b.potongan === 0))
  })
  test('paket tanpa potongan, void tidak dihitung, sisa pembulatan dibagi ke pecahan terbesar', async () => {
    const r = await rekapMenu(db, { dari: D1, sampai: D2 })
    const paket = r.baris.find((b) => b.nama === 'Paket Sarapan')!
    assert.deepEqual([paket.qty, paket.kotor, paket.potongan, paket.kategori], [1, 45000, 0, 'Paket set'])
    // Nasi Goreng hanya terjual di transaksi yang di-void; baris paket memakai kunci paket, bukan menu utama.
    assert.ok(!r.baris.some((b) => b.nama === 'Nasi Goreng'))
    assert.equal(r.void.n, 1)
    // j4: 33.333 + 28.000 = 61.333, potongan 6.133. Bagian dasar 3.333 dan 2.799, sisa 1 ke Kopi Susu (pecahan ,8).
    assert.equal(Number((await db.sale.findUniqueOrThrow({ where: { id: jual.j4.id } })).disc), 6133)
    const tehBaris = r.baris.find((b) => b.nama === 'Teh Spesial')!
    assert.equal(tehBaris.potongan, 3333)
    const kopi = r.baris.find((b) => b.nama === 'Kopi Susu')!
    assert.equal(kopi.qty, 3)
    assert.equal(kopi.potongan, 5600 + 2800)
    const saring = await rekapMenu(db, { dari: D1, sampai: D2, kategori: 'makan' })
    assert.deepEqual(saring.baris.map((b) => b.nama), ['Croissant'])
    const cari = await rekapMenu(db, { dari: D1, sampai: D2, q: 'teh' })
    assert.deepEqual(cari.baris.map((b) => b.nama), ['Teh Spesial'])
  })
})

describe('ringkasan pembayaran', () => {
  test('nominal per metode cocok dengan total, MDR dari persen metode, belum disetor', async () => {
    const r = await ringkasanPembayaran(db, { dari: D1, sampai: D2 })
    const harap = await jumlahDb(D1, D2)
    assert.equal(r.jumlah.nominal, harap.total)
    assert.equal(r.jumlah.n, 4)
    const q = r.baris.find((b) => b.metode === 'QRIS')!
    assert.equal(q.nominal, Number(jual.j2.total))
    assert.equal(q.mdr, Math.round((Number(jual.j2.total) * 0.7) / 100))
    assert.equal(q.neto, q.nominal - q.mdr)
    assert.equal(r.jumlah.sudah, 0)
    assert.equal(r.jumlah.belum, harap.total)
    assert.equal(r.void.n, 1)
    const sudah = await ringkasanPembayaran(db, { dari: D1, sampai: D2, setoran: 'sudah' })
    assert.equal(sudah.baris.length, 0)
  })
})

describe('tutup harian dan selisih kas', () => {
  test('per shift: kas seharusnya, dihitung, selisih sama dengan hitungan tutup shift', async () => {
    const r = await tutupHarian(db, { tanggal: D1 })
    assert.equal(r.baris.length, 1)
    const b = r.baris[0]
    const sh = await db.shift.findUniqueOrThrow({ where: { id: s1 } })
    assert.equal(b.seharusnya, Number(sh.expectedCash))
    assert.equal(b.dihitung, Number(sh.countedCash))
    assert.equal(b.selisih, 0)
    assert.equal(b.tunai, jual.j1.total + jual.j4.total)
    assert.equal(b.perMetode[toko.metode.QRIS], Number(jual.j2.total))
    assert.equal(r.ringkas.penjualan, jual.j1.total + jual.j2.total + jual.j4.total)
    assert.equal(r.ringkas.nVoid, 1)
    assert.deepEqual(
      r.belum.map((x) => x.metode),
      ['Tunai', 'QRIS'],
    )
    const d2 = await tutupHarian(db, { tanggal: D2 })
    assert.deepEqual(d2.baris.map((x) => [x.id, x.status, x.selisih]), [[s2, 'Tutup', -20000]])
    const csv = keCsv(tabelHarian(r))
    assert.ok(csv.includes('Setoran Tunai'))
  })
  test('selisih per kasir untuk memantau pola', async () => {
    const r = await selisihKas(db, { dari: D1, sampai: D2 })
    const k2 = r.baris.find((b) => b.kasir === 'kasir2')!
    assert.deepEqual([k2.n, k2.nBeda, k2.nKurang, k2.kurang, k2.bersih, k2.nOwner, k2.persenBeda], [1, 1, 1, 20000, -20000, 0, 100])
    const k1 = r.baris.find((b) => b.kasir === 'kasir1')!
    assert.deepEqual([k1.n, k1.nBeda], [1, 0])
    assert.deepEqual(r.rinci.map((x) => x.id), [s2])
  })
})

describe('CSV', () => {
  test('BOM, kepala kolom, angka polos, baris jumlah, dan sel rumus dinetralkan', async () => {
    const r = await rekapPenjualan(db, { dari: D1, sampai: D2 })
    const csv = keCsv(tabelRekap(r, { void: true }))
    assert.ok(csv.startsWith('﻿Tanggal,Transaksi,Penjualan kotor'))
    const baris = csv.trim().split('\r\n')
    assert.equal(baris.length, 1 + r.baris.length + 1)
    assert.equal(baris.at(-1), `Jumlah,4,${r.jumlah.kotor},${r.jumlah.potongan},${r.jumlah.bersih},${r.jumlah.service},${r.jumlah.pajak},${r.jumlah.total},1,${r.jumlah.nilaiVoid}`)
    const aneh = keCsv({ kolom: [{ h: 'Nama', v: (b: { n: string }) => b.n }], baris: [{ n: '=SUM(A1)' }, { n: 'a,"b"' }] })
    assert.ok(aneh.includes("'=SUM(A1)"))
    assert.ok(aneh.includes('"a,""b"""'))
    const m = keCsv(tabelMenu(await rekapMenu(db, { dari: D1, sampai: D2 })))
    assert.ok(m.split('\r\n')[0].includes('Potongan teralokasi'))
  })
})
