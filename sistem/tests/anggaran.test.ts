// Anggaran tahap 6B: draf per akun dan bulan, persetujuan, satu anggaran berlaku per tahun, revisi sebagai versi baru,
// realisasi dari jurnal (termasuk jurnal balik dan akun tanpa anggaran), CSV, dan izin.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { buatJurnal, buatJurnalBalik, dk } from '../src/lib/akuntansi/jurnal'
import { bagiRata, batalAnggaran, buatAnggaran, muatAnggaran, revisiAnggaran, setujuiAnggaran, simpanRincianAnggaran, tambahAkunAnggaran } from '../src/lib/anggaran/anggaran'
import { csvRealisasi, realisasiAnggaran } from '../src/lib/anggaran/realisasi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { hariIni } from '../src/lib/stok/dokumen'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let gaji = 0
let sewa = 0
let ag1 = 0
let ag2 = 0

const tahun = Number(hariIni().toISOString().slice(0, 4))
const bulan = Number(hariIni().toISOString().slice(5, 7))
const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)
const jurnalUji = (id: number, baris: Parameters<typeof buatJurnal>[2]) => db.$transaction((tx) => buatJurnal(tx, { docType: 'uji_anggaran', docId: id, docNo: `UJI-${id}`, tanggal: hariIni(), memo: 'uji', oleh: null }, baris))

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('anggaran'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  gaji = (await db.account.findUniqueOrThrow({ where: { code: '6-1400' } })).id
  sewa = (await db.account.findUniqueOrThrow({ where: { code: '6-1500' } })).id
})
after(() => hapus())

describe('draf dan persetujuan', () => {
  test('jumlah setahun dibagi rata, sisa ke Desember', () => {
    assert.deepEqual(bagiRata(12_000_010n), [...Array(11).fill(1_000_000n), 1_000_010n])
  })

  test('buat, isi per bulan, setujui; anggaran Disetujui tidak bisa diubah', async () => {
    await ditolak(() => buatAnggaran(db, k(admin), admin, { name: 'Operasional', year: String(tahun) }))
    const b = await buatAnggaran(db, k(owner), owner, { name: 'Operasional', year: String(tahun) })
    ag1 = b.id
    assert.match(b.no, /^AG-\d{4}-\d{4}$/)
    await galat(() => setujuiAnggaran(db, k(owner), owner, b.id), /minimal satu angka/)
    const kasBesar = (await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })).id
    await galat(() => tambahAkunAnggaran(db, k(owner), owner, b.id, { accountId: String(kasBesar), tahunan: '1000' }), /pendapatan, HPP, dan beban/)
    await tambahAkunAnggaran(db, k(owner), owner, b.id, { accountId: String(gaji), tahunan: '12.000.000' })
    await tambahAkunAnggaran(db, k(owner), owner, b.id, { accountId: String(sewa), tahunan: '' })
    await galat(() => tambahAkunAnggaran(db, k(owner), owner, b.id, { accountId: String(gaji), tahunan: '1' }), /sudah ada/)
    assert.equal(await simpanRincianAnggaran(db, k(owner), owner, b.id, { [`n_${sewa}_${bulan}`]: '3.000.000', [`n_${gaji}_${bulan}`]: '1000000' }), 1)
    await galat(() => simpanRincianAnggaran(db, k(owner), owner, b.id, { [`n_${sewa}_1`]: '-5' }), /rupiah bulat/)
    const isi = await muatAnggaran(db, b.id)
    assert.equal(isi!.total, 15_000_000n)
    assert.equal(isi!.akun.length, 2)
    await ditolak(() => setujuiAnggaran(db, k(admin), admin, b.id))
    await setujuiAnggaran(db, k(owner), owner, b.id)
    assert.equal((await db.budget.findUniqueOrThrow({ where: { id: b.id } })).status, 'Disetujui')
    await galat(() => simpanRincianAnggaran(db, k(owner), owner, b.id, { [`n_${sewa}_1`]: '1' }), /buat revisi/)
    // Anggaran kedua untuk tahun yang sama tanpa revisi ditolak saat disetujui.
    const lain = await buatAnggaran(db, k(owner), owner, { name: 'Pemasaran', year: String(tahun) })
    await tambahAkunAnggaran(db, k(owner), owner, lain.id, { accountId: String(gaji), tahunan: '1200' })
    await galat(() => setujuiAnggaran(db, k(owner), owner, lain.id), /sudah punya anggaran Disetujui/)
    await batalAnggaran(db, k(owner), owner, lain.id, '')
  })
})

describe('realisasi dari jurnal', () => {
  test('per akun dan bulan, dengan selisih dan persen; jurnal balik mengurangi; akun tanpa anggaran tetap tampil', async () => {
    const kas = 'kas_besar'
    await jurnalUji(1, [dk(gaji, 800_000n), dk(kas, -800_000n)])
    await jurnalUji(2, [dk(sewa, 3_300_000n), dk(kas, -3_300_000n)])
    await jurnalUji(3, [dk(kas, 5_000_000n), dk('penjualan', -5_000_000n)])
    const h = await realisasiAnggaran(db, tahun, { bulan })
    assert.equal(h.anggaran?.id, ag1)
    const g = h.baris.find((b) => b.accountId === gaji)!
    assert.deepEqual([g.anggaran, g.realisasi, g.selisih, g.persen], [1_000_000n, 800_000n, -200_000n, 80])
    const s = h.baris.find((b) => b.accountId === sewa)!
    assert.deepEqual([s.anggaran, s.realisasi, s.selisih, s.persen], [3_000_000n, 3_300_000n, 300_000n, 110])
    const p = h.baris.find((b) => b.code === '4-1000')!
    assert.deepEqual([p.anggaran, p.realisasi, p.persen], [0n, 5_000_000n, null])
    assert.equal(h.biaya.realisasi, 4_100_000n)
    assert.equal(h.perBulan[bulan - 1].biaya.anggaran, 4_000_000n)
    // Setahun: anggaran gaji 12 juta.
    const setahun = await realisasiAnggaran(db, tahun)
    assert.equal(setahun.baris.find((b) => b.accountId === gaji)!.anggaran, 12_000_000n)
    // Jurnal balik menghapus realisasi gaji.
    await db.$transaction((tx) => buatJurnalBalik(tx, { docType: 'uji_anggaran', docId: 1, docNo: 'UJI-1', tanggal: hariIni(), memo: 'balik', oleh: null }))
    const sesudah = await realisasiAnggaran(db, tahun, { bulan })
    assert.equal(sesudah.baris.find((b) => b.accountId === gaji)!.realisasi, 0n)
    const csv = csvRealisasi(sesudah)
    assert.ok(csv.startsWith('﻿Tahun,Bulan,Kode akun,Akun,Jenis,Anggaran,Realisasi,Selisih,Persen realisasi'))
    assert.match(csv, new RegExp(`${tahun},${bulan},6-1500,Beban Sewa,Beban,3000000,3300000,300000,110`))
  })
})

describe('revisi anggaran', () => {
  test('salin menjadi versi baru; saat disetujui versi lama digantikan dan riwayatnya tetap ada', async () => {
    await ditolak(() => revisiAnggaran(db, k(admin), admin, ag1))
    const r = await revisiAnggaran(db, k(owner), owner, ag1)
    ag2 = r.id
    assert.equal(r.version, 2)
    assert.equal(r.revisedFromId, ag1)
    await galat(() => revisiAnggaran(db, k(owner), owner, ag1), /Sudah ada draf revisi/)
    const salinan = await muatAnggaran(db, r.id)
    assert.equal(salinan!.total, 15_000_000n, 'baris tersalin')
    await simpanRincianAnggaran(db, k(owner), owner, r.id, { [`n_${sewa}_${bulan}`]: '3500000' })
    // Sebelum revisi disetujui, realisasi masih memakai versi 1.
    assert.equal((await realisasiAnggaran(db, tahun, { bulan })).anggaran?.id, ag1)
    await setujuiAnggaran(db, k(owner), owner, r.id)
    const lama = await db.budget.findUniqueOrThrow({ where: { id: ag1 } })
    assert.equal(lama.status, 'Disetujui')
    assert.ok(lama.replacedAt, 'versi lama ditandai digantikan')
    assert.equal(await db.budgetLine.count({ where: { budgetId: ag1 } }), 24, 'baris versi lama tetap ada')
    const h = await realisasiAnggaran(db, tahun, { bulan })
    assert.equal(h.anggaran?.id, ag2)
    assert.equal(h.baris.find((b) => b.accountId === sewa)!.anggaran, 3_500_000n)
    // Versi lama tetap bisa dibuka di realisasi.
    assert.equal((await realisasiAnggaran(db, tahun, { bulan, anggaranId: ag1 })).baris.find((b) => b.accountId === sewa)!.anggaran, 3_000_000n)
    await galat(() => revisiAnggaran(db, k(owner), owner, ag1), /masih berlaku/)
    await galat(() => batalAnggaran(db, k(owner), owner, ag1, 'Tidak dipakai lagi'), /sudah digantikan/)
    await galat(() => batalAnggaran(db, k(owner), owner, ag2, ''), /minimal 5 huruf/)
    await ditolak(() => batalAnggaran(db, k(admin), admin, ag2, 'Tidak dipakai lagi'))
    const audit = await db.auditLog.findMany({ where: { docType: 'budget' }, select: { action: true } })
    const aksi = new Set(audit.map((a) => a.action))
    for (const a of ['anggaran.tambah', 'anggaran.akun_tambah', 'anggaran.rincian', 'anggaran.setujui', 'anggaran.revisi', 'anggaran.batal']) assert.ok(aksi.has(a), a)
  })
})
