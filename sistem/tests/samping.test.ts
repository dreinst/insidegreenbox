// Cookie pilihan grup sidebar yang bisa dilipat (KONTRAK 11 butir 162).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { bacaPilihanSamping } from '../src/lib/katalog'

const isi = (o: unknown) => encodeURIComponent(JSON.stringify(o))

describe('bacaPilihanSamping', () => {
  test('membaca judul grup yang dikenal dengan nilai boolean', () => {
    assert.deepEqual(bacaPilihanSamping(isi({ Kasir: true, Pengaturan: false })), { Kasir: true, Pengaturan: false })
  })

  test('membuang kunci asing dan nilai yang bukan boolean', () => {
    assert.deepEqual(bacaPilihanSamping(isi({ Kasir: 'ya', Asing: true, __proto__: true, Menu: 1, Laporan: true })), { Laporan: true })
  })

  test('isi kosong, rusak, bukan objek, atau terlalu panjang dianggap kosong', () => {
    for (const n of [undefined, '', '%E0%A4%A', 'bukan-json', isi([true]), isi(null), isi(5), 'x'.repeat(2001)]) assert.deepEqual(bacaPilihanSamping(n), {})
  })
})
