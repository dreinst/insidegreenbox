// Tahap 5C: Kas Masuk, Kas Keluar, dan Pindah Dana. Alur status dengan dan tanpa aturan persetujuan, izin Admin dan
// Owner, akun lawan yang diizinkan, jurnal dan jurnal balik, periode tertutup, dan audit.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { bukaPeriode, bulanIni, geserBulan, tutupPeriode } from '../src/lib/akuntansi/periode'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { akunLawan, buatKas, buatPindah, hapusKas, tambahBarisKas, ubahStatusKas } from '../src/lib/kas'
import { tambahRekening } from '../src/lib/rekening'
import { hariIni } from '../src/lib/stok/dokumen'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let rekening = 0
const akun: Record<string, number> = {}
const tgl = () => hariIni().toISOString().slice(0, 10)

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)

async function petaJurnal(id: number, balik = false) {
  const j = await db.journal.findFirstOrThrow({ where: { sourceType: 'cash_transaction', sourceId: id, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
  const peta: Record<string, bigint> = {}
  for (const l of j.journalLines) peta[l.account.code] = (peta[l.account.code] ?? 0n) + l.debit - l.credit
  return { j, peta }
}
const saldo = async (code: string) => {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id WHERE a.code = ${code} AND j.posted_at IS NOT NULL`
  return BigInt(r.n)
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('kas'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  rekening = (await tambahRekening(db, k(owner), owner, { bankName: 'BCA', accountNo: '5550001111', holderName: 'Greenbox' })).id
  for (const a of await db.account.findMany()) akun[a.code] = a.id
})
after(() => hapus())

describe('akun lawan', () => {
  test('akun inti tidak ditawarkan; Admin hanya beban dan pendapatan, Owner lebih luas', async () => {
    const a = new Set((await akunLawan(db, admin)).map((x) => x.code))
    const o = new Set((await akunLawan(db, owner)).map((x) => x.code))
    for (const inti of ['1-1100', '1-1200', '1-1310', '1-1500', '2-1100', '2-1200', '4-1000', '5-1000']) {
      assert.ok(!a.has(inti) && !o.has(inti), `${inti} bukan lawan kas`)
    }
    assert.ok(a.has('6-1300') && a.has('6-1500') && a.has('4-9000'))
    assert.ok(!a.has('3-1000') && !a.has('2-1900'), 'Admin tidak memilih modal atau hutang lain')
    assert.ok(o.has('3-1000') && o.has('2-1900'), 'Owner boleh modal dan hutang lain')
  })

  test('C-1: piutang, aset tetap, akumulasi penyusutan, penjualan dan retur B2B tidak ditawarkan ke siapa pun, dan ditolak saat ditambah', async () => {
    const a = new Set((await akunLawan(db, admin)).map((x) => x.code))
    const o = new Set((await akunLawan(db, owner)).map((x) => x.code))
    for (const inti of ['1-1450', '1-2100', '1-2900', '4-1100', '4-3100']) assert.ok(!a.has(inti) && !o.has(inti), `${inti} akun inti, bukan lawan kas`)
    const c = await buatKas(db, k(owner), owner, { kind: 'masuk', date: tgl(), sumber: String(rekening), partyName: 'Pelanggan B2B' })
    await galat(() => tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(akun['1-1450']), amount: '250.000' }), /tidak boleh dipakai/)
    await galat(() => tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(akun['1-2900']), amount: '1.000' }), /tidak boleh dipakai/)
    await hapusKas(db, k(owner), owner, c.id)
  })
})

describe('kas keluar', () => {
  test('Admin menyusun dan mengajukan, Owner menyetujui lalu memposting; jurnal debit beban kredit bank', async () => {
    const c = await buatKas(db, k(admin), admin, { kind: 'keluar', date: tgl(), sumber: String(rekening), partyName: 'PLN', note: 'Listrik November' })
    assert.match(c.no, /^KK-\d{4}-\d{4}$/)
    await galat(() => tambahBarisKas(db, k(admin), admin, c.id, { accountId: String(akun['3-1000']), amount: '1000' }), /tidak boleh dipakai/)
    await galat(() => tambahBarisKas(db, k(admin), admin, c.id, { accountId: String(akun['1-1500']), amount: '1000' }), /tidak boleh dipakai/)
    await tambahBarisKas(db, k(admin), admin, c.id, { accountId: String(akun['6-1600']), amount: '750.000', memo: 'Tagihan listrik' })
    await tambahBarisKas(db, k(admin), admin, c.id, { accountId: String(akun['6-1300']), amount: '2.500', memo: 'Biaya transfer' })
    // Kas keluar terkena aturan persetujuan: tidak bisa langsung diposting, dan Admin tidak memegang S atau P.
    await ditolak(() => ubahStatusKas(db, k(admin), admin, c.id, 'posting'))
    await ubahStatusKas(db, k(admin), admin, c.id, 'ajukan')
    await ditolak(() => ubahStatusKas(db, k(admin), admin, c.id, 'setujui'))
    await galat(() => ubahStatusKas(db, k(owner), owner, c.id, 'posting'), /disetujui dulu/)
    await ubahStatusKas(db, k(owner), owner, c.id, 'setujui')
    await ubahStatusKas(db, k(owner), owner, c.id, 'posting')
    const d = await db.cashTransaction.findUniqueOrThrow({ where: { id: c.id } })
    assert.equal(d.status, 'Diposting')
    assert.equal(d.amount, 752_500n)
    const { peta, j } = await petaJurnal(c.id)
    assert.equal(peta['6-1600'], 750_000n)
    assert.equal(peta['6-1300'], 2_500n)
    assert.equal(peta['1-1310'], -752_500n)
    const bank = await db.journalLine.findFirstOrThrow({ where: { journalId: j.id, account: { code: '1-1310' } } })
    assert.equal(bank.bankAccountId, rekening)
    const aksi = (await db.auditLog.findMany({ where: { docType: 'cash_transaction', docId: String(c.id) }, orderBy: { id: 'asc' } })).map((x) => x.action)
    assert.deepEqual(aksi, ['kas_keluar.tambah', 'kas_keluar.baris_tambah', 'kas_keluar.baris_tambah', 'kas_keluar.ajukan', 'kas_keluar.setujui', 'kas_keluar.posting'])
  })

  test('batal dari Diposting membuat jurnal balik; butuh alasan dan saklar', async () => {
    const c = await buatKas(db, k(owner), owner, { kind: 'keluar', date: tgl(), sumber: 'kas' })
    await tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(akun['6-1900']), amount: '40000', memo: 'Galon' })
    await ubahStatusKas(db, k(owner), owner, c.id, 'ajukan')
    await ubahStatusKas(db, k(owner), owner, c.id, 'setujui')
    await ubahStatusKas(db, k(owner), owner, c.id, 'posting')
    assert.equal((await petaJurnal(c.id)).peta['1-1200'], -40_000n)
    await galat(() => ubahStatusKas(db, k(owner), owner, c.id, 'batal', { alasan: '' }), /alasan/)
    await ubahStatusKas(db, k(owner), owner, c.id, 'batal', { alasan: 'Salah catat galon' })
    const b = await petaJurnal(c.id, true)
    assert.equal(b.peta['1-1200'], 40_000n)
    assert.equal((await db.cashTransaction.findUniqueOrThrow({ where: { id: c.id } })).reversalJournalId, b.j.id)
  })
})

describe('kas masuk', () => {
  test('tanpa aturan persetujuan: Owner langsung memposting dari draf; debit kas kredit pendapatan lain', async () => {
    const c = await buatKas(db, k(owner), owner, { kind: 'masuk', date: tgl(), sumber: 'kas', partyName: 'Penjualan kardus' })
    assert.match(c.no, /^KM-/)
    await tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(akun['4-9000']), amount: '25000' })
    await ubahStatusKas(db, k(owner), owner, c.id, 'posting')
    const { peta } = await petaJurnal(c.id)
    assert.equal(peta['1-1200'], 25_000n)
    assert.equal(peta['4-9000'], -25_000n)
  })

  test('draf tanpa baris tidak bisa diajukan dan bisa dihapus', async () => {
    const c = await buatKas(db, k(admin), admin, { kind: 'masuk', date: tgl(), sumber: 'kas' })
    await galat(() => ubahStatusKas(db, k(admin), admin, c.id, 'ajukan'), /minimal satu baris/)
    await hapusKas(db, k(admin), admin, c.id)
    assert.equal(await db.cashTransaction.count({ where: { id: c.id } }), 0)
  })
})

describe('pindah dana', () => {
  test('hanya pemegang kas.pindah; setujui lalu posting; debit tujuan kredit sumber', async () => {
    await ditolak(() => buatPindah(db, k(admin), admin, { date: tgl(), sumber: 'kas', tujuan: String(rekening), amount: '1000' }))
    await galat(() => buatPindah(db, k(owner), owner, { date: tgl(), sumber: 'kas', tujuan: 'kas', amount: '1000' }), /berbeda/)
    const sebelumKas = await saldo('1-1200')
    const c = await buatPindah(db, k(owner), owner, { date: tgl(), sumber: 'kas', tujuan: String(rekening), amount: '2.000.000', note: 'Setor kas besar ke bank' })
    assert.match(c.no, /^PN-/)
    await ubahStatusKas(db, k(owner), owner, c.id, 'ajukan')
    await ubahStatusKas(db, k(owner), owner, c.id, 'setujui')
    await ubahStatusKas(db, k(owner), owner, c.id, 'posting')
    const { peta, j } = await petaJurnal(c.id)
    assert.equal(peta['1-1310'], 2_000_000n)
    assert.equal(peta['1-1200'], -2_000_000n)
    assert.equal(await saldo('1-1200'), sebelumKas - 2_000_000n)
    const bank = await db.journalLine.findFirstOrThrow({ where: { journalId: j.id, debit: { gt: 0 } } })
    assert.equal(bank.bankAccountId, rekening)
    assert.ok(await db.auditLog.findFirst({ where: { action: 'pindah_dana.posting', docId: String(c.id) } }))
  })
})

describe('periode tertutup', () => {
  test('kas bertanggal di bulan yang ditutup tidak bisa diposting', async () => {
    const lalu = geserBulan(bulanIni(), -1)
    const c = await buatKas(db, k(owner), owner, { kind: 'masuk', date: `${lalu}-15`, sumber: 'kas' })
    await tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(akun['4-9000']), amount: '5000' })
    await tutupPeriode(db, k(owner), owner, lalu)
    await galat(() => ubahStatusKas(db, k(owner), owner, c.id, 'posting'), /ditutup/)
    await bukaPeriode(db, k(owner), owner, lalu, { alasan: 'Selesai uji kas' })
  })
})
