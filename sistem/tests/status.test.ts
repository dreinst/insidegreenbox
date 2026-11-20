// Transisi status dokumen dan nomor dokumen (KONTRAK 3.2 dan 3.3).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { Db } from '../src/lib/db'
import { ambilNomor } from '../src/lib/nomor'
import { transisiSah } from '../src/lib/status'
import { siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
before(async () => {
  ;({ db, hapus } = await siapkanDbUji('status'))
})
after(() => hapus())

test('dokumen rencana tidak pernah Diposting dan berakhir di Selesai atau Batal', () => {
  assert.equal(transisiSah('rencana', 'Draft', 'Diajukan'), true)
  assert.equal(transisiSah('rencana', 'Draft', 'Disetujui'), true)
  assert.equal(transisiSah('rencana', 'Draft', 'Disetujui', { butuhSetuju: true }), false)
  assert.equal(transisiSah('rencana', 'Diajukan', 'Draft'), true)
  assert.equal(transisiSah('rencana', 'Disetujui', 'Selesai'), true)
  assert.equal(transisiSah('rencana', 'Disetujui', 'Diposting'), false)
  assert.equal(transisiSah('rencana', 'Selesai', 'Batal'), false)
  assert.equal(transisiSah('rencana', 'Batal', 'Draft'), false)
})

test('dokumen pelaksana: posting langsung hanya tanpa aturan persetujuan, batal dari Diposting lewat gerak balik', () => {
  assert.equal(transisiSah('pelaksana', 'Draft', 'Diposting'), true)
  assert.equal(transisiSah('pelaksana', 'Draft', 'Diposting', { butuhSetuju: true }), false)
  assert.equal(transisiSah('pelaksana', 'Diajukan', 'Diposting', { butuhSetuju: true }), true)
  assert.equal(transisiSah('pelaksana', 'Diposting', 'Batal'), true)
  assert.equal(transisiSah('pelaksana', 'Diposting', 'Draft'), false)
  assert.equal(transisiSah('pelaksana', 'Draft', 'Selesai'), false)
})

test('pembayaran: wajib Disetujui dulu sebelum Diposting', () => {
  assert.equal(transisiSah('pelaksana_setuju', 'Draft', 'Diposting'), false)
  assert.equal(transisiSah('pelaksana_setuju', 'Diajukan', 'Diposting'), false)
  assert.equal(transisiSah('pelaksana_setuju', 'Diajukan', 'Disetujui'), true)
  assert.equal(transisiSah('pelaksana_setuju', 'Disetujui', 'Diposting'), true)
})

test('nomor dokumen berurutan per jenis dan per bulan WIB, aman dipanggil bersamaan', async () => {
  const nov = new Date('2026-11-20T10:00:00+07:00')
  assert.equal(await ambilNomor(db, 'purchase_order', 'PO', nov), 'PO-2611-0001')
  assert.equal(await ambilNomor(db, 'purchase_order', 'PO', nov), 'PO-2611-0002')
  assert.equal(await ambilNomor(db, 'goods_receipt', 'TB', nov), 'TB-2611-0001')
  // 30 November 23.30 WIB masih November walau di UTC sudah tanggal berbeda; 1 Desember 00.30 WIB sudah Desember.
  assert.equal(await ambilNomor(db, 'purchase_order', 'PO', new Date('2026-11-30T23:30:00+07:00')), 'PO-2611-0003')
  assert.equal(await ambilNomor(db, 'purchase_order', 'PO', new Date('2026-12-01T00:30:00+07:00')), 'PO-2612-0001')
  const bersamaan = await Promise.all(Array.from({ length: 6 }, () => db.$transaction((tx) => ambilNomor(tx, 'stock_opname', 'OP', nov))))
  assert.equal(new Set(bersamaan).size, 6)
  assert.deepEqual([...bersamaan].sort(), ['OP-2611-0001', 'OP-2611-0002', 'OP-2611-0003', 'OP-2611-0004', 'OP-2611-0005', 'OP-2611-0006'])
})
