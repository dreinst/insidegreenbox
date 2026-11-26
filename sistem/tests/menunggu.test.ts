// Menunggu Persetujuan (KONTRAK 11 butir 158). Daftar jenis diambil dari JENIS_DOKUMEN dan skema basis data, lalu
// setiap jenis diisi satu baris sungguhan di basis data uji untuk memastikan kuerinya menemukannya.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { JENIS_MENUNGGU, TANPA_AJUKAN, bolehLihatMenunggu, daftarMenunggu, hitungMenunggu, lamaMenunggu } from '../src/lib/menunggu'
import { JENIS_DOKUMEN, transisiSah } from '../src/lib/status'
import { buatAktor, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('menunggu'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
})
after(() => hapus())

type Kolom = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }

// Mengisi satu baris dengan nilai sekadarnya untuk kolom wajib. Kunci asing tidak diperiksa (session_replication_role
// replica di dalam transaksi), karena yang diuji hanya kueri antrean, bukan alur modulnya.
async function sisipkan(tabel: string, isi: Record<string, unknown>, urut: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica')
    const kolom = await tx.$queryRawUnsafe<Kolom[]>(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      tabel,
    )
    const nilai: Record<string, unknown> = {}
    for (const c of kolom) {
      if (c.column_name in isi || c.is_nullable === 'YES' || c.column_default !== null) continue
      if (c.data_type === 'USER-DEFINED') {
        const [e] = await tx.$queryRawUnsafe<{ v: string }[]>(`SELECT (enum_range(NULL::${c.udt_name}))[1]::text AS v`)
        nilai[c.column_name] = e.v
      } else if (/int|numeric/.test(c.udt_name)) nilai[c.column_name] = 1
      else if (c.udt_name === 'bool') nilai[c.column_name] = false
      else if (c.udt_name === 'date') nilai[c.column_name] = new Date('2026-11-20T00:00:00Z')
      else if (c.udt_name === 'timestamptz') nilai[c.column_name] = new Date()
      else if (c.udt_name === 'jsonb' || c.udt_name === 'json') nilai[c.column_name] = '{}'
      else nilai[c.column_name] = `UJI-${tabel}-${urut}`
    }
    const semua = { ...nilai, ...isi }
    const nama = Object.keys(semua)
    const tipe = new Map(kolom.map((c) => [c.column_name, c]))
    const tanda = nama.map((n, i) => {
      const c = tipe.get(n)!
      return c.data_type === 'USER-DEFINED' ? `$${i + 1}::${c.udt_name}` : c.udt_name === 'jsonb' ? `$${i + 1}::jsonb` : `$${i + 1}`
    })
    const [b] = await tx.$queryRawUnsafe<{ id: number }[]>(`INSERT INTO ${tabel} (${nama.join(', ')}) VALUES (${tanda.join(', ')}) RETURNING id`, ...nama.map((n) => semua[n]))
    return b.id
  })
}

describe('daftar jenis', () => {
  test('setiap jenis di JENIS_DOKUMEN yang bisa Diajukan ada di antrean, kecuali yang dikecualikan beralasan', () => {
    const antre = new Set(JENIS_MENUNGGU.map((j) => j.tabel))
    for (const [jenis, j] of Object.entries(JENIS_DOKUMEN)) {
      if (!transisiSah(j.golongan, 'Draft', 'Diajukan')) continue
      assert.ok(antre.has(jenis) || jenis in TANPA_AJUKAN, `${jenis} tidak ada di antrean dan tidak dikecualikan`)
      assert.ok(!(antre.has(jenis) && jenis in TANPA_AJUKAN), `${jenis} ada di antrean sekaligus dikecualikan`)
    }
  })

  test('setiap tabel berkolom doc_status ada di antrean atau dikecualikan', async () => {
    const tabel = await db.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND udt_name = 'doc_status' AND column_name = 'status'`
    const antre = new Set(JENIS_MENUNGGU.map((j) => j.tabel))
    assert.ok(tabel.length > 20)
    for (const { t } of tabel) assert.ok(antre.has(t) || t in TANPA_AJUKAN, `${t} belum ada di antrean Menunggu Persetujuan`)
  })

  test('modul yang dikecualikan memang tidak pernah menulis status Diajukan', () => {
    const berkas = (dir: string) => readdirSync(new URL(`../src/lib/${dir}/`, import.meta.url)).map((f) => readFileSync(new URL(`../src/lib/${dir}/${f}`, import.meta.url), 'utf8'))
    const modul: Record<string, string[]> = {
      budget: berkas('anggaran'),
      asset_disposal: berkas('aset'),
      asset_depreciation_run: berkas('aset'),
      bank_reconcile: [readFileSync(new URL('../src/lib/rekonsiliasi.ts', import.meta.url), 'utf8')],
    }
    assert.deepEqual(Object.keys(modul).sort(), Object.keys(TANPA_AJUKAN).sort())
    for (const [jenis, isi] of Object.entries(modul)) assert.ok(!isi.some((s) => s.includes("'Diajukan'")), `${jenis} kini memakai Diajukan, masukkan ke antrean`)
  })

  test('pembayaran pembelian dan kas yang Disetujui menunggu Posting', () => {
    const posting = JENIS_MENUNGGU.filter((j) => j.status === 'Disetujui').map((j) => j.kunci).sort()
    assert.deepEqual(posting, ['cash_transaction.keluar:posting', 'cash_transaction.masuk:posting', 'cash_transaction.pindah:posting', 'purchase_payment:posting'])
    assert.ok(JENIS_MENUNGGU.every((j) => j.status !== 'Disetujui' || j.aksi === 'P'))
  })
})

describe('kueri bersama', () => {
  const id = new Map<string, number>()

  before(async () => {
    let urut = 0
    const lalu = new Date(Date.now() - (2 * 24 + 3) * 3_600_000)
    for (const j of JENIS_MENUNGGU) {
      urut++
      const isi: Record<string, unknown> = { status: j.status }
      if (j.syarat) isi[j.syarat.kolom] = j.syarat.nilai
      if (j.tabel === 'shift') Object.assign(isi, { user_id: owner.id, closed_at: lalu, cash_diff: -5000 })
      else Object.assign(isi, { no: `UJI-${urut}`, submitted_by: admin.id, submitted_at: lalu, ...(j.status === 'Disetujui' ? { approved_at: lalu } : {}) })
      id.set(j.kunci, await sisipkan(j.tabel, isi, urut))
      // Dokumen Draft jenis yang sama tidak boleh ikut.
      if (j.tabel !== 'shift') await sisipkan(j.tabel, { ...isi, status: 'Draft', no: `UJI-D-${urut}`, date: new Date('2026-11-19T00:00:00Z') }, urut + 1000)
    }
  })

  test('Owner melihat setiap jenis, dan semuanya bisa ditindak', async () => {
    const h = await daftarMenunggu(db, owner, {})
    assert.equal(h.total, JENIS_MENUNGGU.length)
    const ada = new Set(h.baris.map((b) => `${b.jenis}:${b.id}`))
    for (const j of JENIS_MENUNGGU) assert.ok(ada.has(`${j.kunci}:${id.get(j.kunci)}`), `${j.kunci} tidak muncul`)
    assert.ok(h.baris.every((b) => b.bisa))
    assert.ok(h.baris.every((b) => !b.no.startsWith('UJI-D-')), 'Draft tidak ikut')
    const po = h.baris.find((b) => b.jenis === 'purchase_order')!
    assert.equal(po.pengaju, 'admin1')
    assert.equal(po.href, `/pesanan/${id.get('purchase_order')}`)
    assert.equal(lamaMenunggu(po.sejak), '2 hari 3 jam')
    assert.equal(h.baris.find((b) => b.jenis === 'cash_transaction.pindah')!.href, `/pindah-dana/${id.get('cash_transaction.pindah')}`)
    assert.equal(h.baris.find((b) => b.jenis === 'shift')!.nilai, -5000n)
    const c = await hitungMenunggu(db, owner)
    assert.equal(c.bisa, JENIS_MENUNGGU.length)
  })

  test('saringan per jenis', async () => {
    const h = await daftarMenunggu(db, owner, { jenis: 'cash_transaction.keluar' })
    assert.equal(h.total, 1)
    assert.deepEqual(h.baris.map((b) => b.jenis), ['cash_transaction.keluar'])
    const asal = await daftarMenunggu(db, owner, { jenis: 'bukan_jenis' })
    assert.equal(asal.total, JENIS_MENUNGGU.length, 'jenis tak dikenal diabaikan')
  })

  test('Admin hanya melihat modul yang boleh dilihat, dan lencana hanya yang bisa ia tindak', async () => {
    assert.ok(bolehLihatMenunggu(admin), 'Admin memegang Setujui di permintaan dan perintah produksi')
    assert.ok(!bolehLihatMenunggu(kasir))
    const h = await daftarMenunggu(db, admin, {})
    const jenis = new Set(h.baris.map((b) => b.jenis))
    assert.ok(jenis.has('purchase_order') && jenis.has('cash_transaction.keluar'))
    assert.ok(!jenis.has('cash_transaction.pindah') && !jenis.has('journal'), 'Admin tanpa Lihat pindah dana dan jurnal')
    const bisa = h.baris.filter((b) => b.bisa).map((b) => b.jenis).sort()
    assert.ok(bisa.includes('purchase_request') && bisa.includes('production_order'))
    assert.ok(!bisa.includes('purchase_order') && !bisa.includes('cash_transaction.keluar'), 'PO dan kas keluar menunggu Owner')
    assert.equal((await hitungMenunggu(db, admin)).bisa, bisa.length)
  })
})
