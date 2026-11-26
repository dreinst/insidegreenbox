// Keterangan per baris jurnal memorial: tersimpan di barisnya sendiri, terpisah dari keterangan kepala, dan tidak
// menimpa jurnal otomatis dari dokumen. Id elemen formulir kepala dan baris tidak boleh bentrok (label "Keterangan baris"
// pernah menunjuk ke isian kepala karena sama-sama k-memo).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { buatJurnal, dk } from '../src/lib/akuntansi/jurnal'
import { ambilJurnal, buatMemorial, tambahBarisMemorial, ubahKepalaMemorial } from '../src/lib/akuntansi/memorial'
import { medanBarisMemorial, medanKepalaMemorial } from '../src/lib/akuntansi/memorial-form'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { idMedan } from '../src/lib/medan'
import { pasangBawaanAkuntansi } from '../src/lib/akuntansi/pemetaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
const tgl = () => hariIni().toISOString().slice(0, 10)

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('memorialbaris'))
  owner = await buatAktor(db, 'owner', 'owner1')
  await pasangBawaanAkuntansi(db)
})
after(() => hapus())

describe('keterangan baris jurnal memorial', () => {
  test('tiap baris menyimpan keterangannya sendiri dan kepala tetap terpisah', async () => {
    const m = await buatMemorial(db, k(owner), owner, { date: tgl(), memo: 'Kepala: setor modal' })
    const kas = await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })
    const modal = await db.account.findUniqueOrThrow({ where: { code: '3-1000' } })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(kas.id), debit: '500.000', kredit: '', pihak: '', memo: 'Baris debit: uang masuk kas' })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(modal.id), debit: '', kredit: '500.000', pihak: '', memo: 'Baris kredit: tambahan modal' })

    const j = await ambilJurnal(db, m.id)
    assert.ok(j)
    assert.equal(j.memo, 'Kepala: setor modal')
    assert.deepEqual(
      j.journalLines.map((l) => l.memo),
      ['Baris debit: uang masuk kas', 'Baris kredit: tambahan modal'],
    )

    // Mengubah kepala tidak menyentuh keterangan baris.
    await ubahKepalaMemorial(db, k(owner), owner, m.id, { date: tgl(), memo: 'Kepala sudah diganti' })
    const sesudah = await ambilJurnal(db, m.id)
    assert.equal(sesudah?.memo, 'Kepala sudah diganti')
    assert.deepEqual(
      sesudah?.journalLines.map((l) => l.memo),
      ['Baris debit: uang masuk kas', 'Baris kredit: tambahan modal'],
    )
  })

  test('baris tanpa keterangan tetap kosong, tidak diisi keterangan kepala', async () => {
    const m = await buatMemorial(db, k(owner), owner, { date: tgl(), memo: 'Kepala saja' })
    const kas = await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(kas.id), debit: '1.000', kredit: '' })
    const l = await db.journalLine.findFirstOrThrow({ where: { journalId: m.id } })
    assert.equal(l.memo, '')
  })

  test('jurnal otomatis dari dokumen: keterangan baris mengikuti barisnya, kepala tidak masuk ke baris', async () => {
    const kepala = { docType: 'uji', docId: 7, docNo: 'UJI-7', tanggal: hariIni(), memo: 'Kepala dokumen', oleh: owner.id }
    const h = await db.$transaction((tx) => buatJurnal(tx, kepala, [dk('kas_besar', 1000n, 'Terima tunai'), dk('penjualan', -1000n, 'Penjualan menu')]))
    assert.ok(h)
    const j = await db.journal.findUniqueOrThrow({ where: { id: h.id }, include: { journalLines: { orderBy: { id: 'asc' } } } })
    assert.equal(j.memo, 'Kepala dokumen')
    assert.deepEqual(
      j.journalLines.map((l) => l.memo),
      ['Terima tunai', 'Penjualan menu'],
    )
  })
})

describe('id elemen formulir rincian memorial', () => {
  test('medan kepala dan medan baris tidak berbagi id, meski sama-sama bernama memo', () => {
    const kepala = medanKepalaMemorial({ date: '2026-11-26', memo: 'x' })
    const baris = medanBarisMemorial([{ id: 1, code: '1-1200', name: 'Kas Besar' }], [], [])
    const id = [...kepala, ...baris].map(idMedan)
    assert.equal(new Set(id).size, id.length, `id ganda: ${id.join(', ')}`)
    // Nama isian tetap memo untuk keduanya, karena aksi server membaca field itu.
    assert.ok(kepala.some((m) => m.nama === 'memo') && baris.some((m) => m.nama === 'memo'))
    // Id medan lain tetap k-<nama>, supaya uji klik dan panduan yang memakai #k-accountId dan #k-debit tidak berubah.
    assert.equal(idMedan(baris.find((m) => m.nama === 'accountId')!), 'k-accountId')
    assert.equal(idMedan(kepala.find((m) => m.nama === 'memo')!), 'k-memo')
  })
})
