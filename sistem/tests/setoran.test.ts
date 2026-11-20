// Setoran POS tahap 5A: isi otomatis dari shift ditutup, tolak ganda, tunai butuh semua shift tanggal itu ditutup,
// selisih dan shift "Perlu persetujuan" butuh Owner, batal dari Diposting, hapus draf, rekening bank, dan audit.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { ringkasanPembayaran, tutupHarian } from '../src/lib/laporan'
import { simpanPenjualan } from '../src/lib/penjualan'
import { tambahRekening, ubahStatusRekening } from '../src/lib/rekening'
import { ajukanSetoran, batalSetoran, buatSetoranHarian, hapusSetoran, kembalikanSetoran, muatUlangSetoran, postingSetoran, ubahSetoran } from '../src/lib/setoran'
import { bukaShift, setujuiShift, tutupShift } from '../src/lib/shift'
import { buatAktor, k, siapkanDbUji } from './db-uji'
import { hariKe, pindahJual, pindahShift, siapkanToko } from './toko-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let kasir2: Pengguna
let toko: Awaited<ReturnType<typeof siapkanToko>>
let rekening = 0
const D = hariKe(-1)
const D2 = hariKe(-2)
const tolak = (pesan: RegExp) => (e: unknown) => e instanceof GalatAturan && pesan.test(e.message)

// Satu shift berisi satu penjualan tunai dan satu QRIS, ditutup dengan selisih tertentu.
async function shiftLengkap(aktor: Pengguna, tanggal: string, selisih = 0) {
  const s = await bukaShift(db, k(aktor), aktor, { modal: '150000' })
  await pindahShift(db, s.id, tanggal, '09:00')
  const a = await simpanPenjualan(db, k(aktor), aktor, { mode: 'takeaway', baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 1 }], bayar: [{ metodeId: toko.metode.Tunai, jumlah: 50000 }] })
  const total = Number(a.total)
  const b = await simpanPenjualan(db, k(aktor), aktor, { mode: 'takeaway', baris: [{ menuItemId: toko.menu.Croissant, qty: 2 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: 57750 }] })
  await pindahJual(db, a.id, tanggal, '10:00')
  await pindahJual(db, b.id, tanggal, '11:00')
  await tutupShift(db, k(aktor), aktor, s.id, { kasDihitung: String(150000 + total + selisih) })
  return { id: s.id, tunai: total, qris: Number(b.total) }
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('setoran'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  kasir2 = await buatAktor(db, 'kasir', 'kasir2')
  toko = await siapkanToko(db)
})
after(() => hapus())

describe('rekening bank', () => {
  test('Owner menambah, Admin hanya melihat, nomor kembar ditolak, nonaktif tercatat', async () => {
    const r = await tambahRekening(db, k(owner), owner, { bankName: 'BCA', accountNo: '123-456 7890', holderName: 'Greenbox' })
    rekening = r.id
    assert.equal(r.accountNo, '1234567890')
    await assert.rejects(tambahRekening(db, k(owner), owner, { bankName: 'bca', accountNo: '1234567890', holderName: 'Xy' }), tolak(/sudah ada/))
    await assert.rejects(tambahRekening(db, k(admin), admin, { bankName: 'BRI', accountNo: '99999', holderName: 'Yz' }), (e) => e instanceof GalatIzin)
    const lain = await tambahRekening(db, k(owner), owner, { bankName: 'Mandiri', accountNo: '55555', holderName: 'Greenbox' })
    await ubahStatusRekening(db, k(owner), owner, lain.id, false)
    const audit = await db.auditLog.findMany({ where: { docType: 'bank_account' }, select: { action: true } })
    assert.deepEqual(audit.map((a) => a.action).sort(), ['rekening.nonaktifkan', 'rekening.tambah', 'rekening.tambah'])
  })
})

describe('setoran harian', () => {
  let sA: Awaited<ReturnType<typeof shiftLengkap>>
  let tunaiId = 0
  let qrisId = 0
  test('isi otomatis: satu dokumen per metode dari shift yang sudah ditutup', async () => {
    sA = await shiftLengkap(kasir, D)
    // Shift kasir2 tanggal D masih terbuka: tidak ikut, dan menahan posting tunai.
    const buka = await bukaShift(db, k(kasir2), kasir2, { modal: '100000' })
    await pindahShift(db, buka.id, D, '15:00')
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D })
    assert.deepEqual(h.dibuat.map((x) => x.metode), ['Tunai', 'QRIS'])
    tunaiId = h.dibuat[0].id
    qrisId = h.dibuat[1].id
    const t = await db.posSettlement.findUniqueOrThrow({ where: { id: tunaiId }, include: { posSettlementLines: true } })
    assert.match(t.no, /^ST-\d{4}-\d{4}$/)
    assert.equal(t.status, 'Draft')
    assert.deepEqual(t.posSettlementLines.map((l) => [l.shiftId, Number(l.expected), Number(l.actual)]), [[sA.id, sA.tunai, sA.tunai]])
    assert.equal(t.bankAccountId, null)
    const q = await db.posSettlement.findUniqueOrThrow({ where: { id: qrisId }, include: { posSettlementLines: true } })
    const mdr = Math.round((sA.qris * 0.7) / 100)
    assert.deepEqual([Number(q.expectedTotal), Number(q.mdrFee), Number(q.actualTotal), Number(q.diff)], [sA.qris, mdr, sA.qris - mdr, 0])
    assert.equal(q.bankAccountId, rekening)
    assert.equal((await db.auditLog.count({ where: { action: 'setoran.tambah' } })), 2)
  })
  test('tolak ganda: tombol kedua tidak membuat dokumen baru, dan basis data menolak shift ganda', async () => {
    await assert.rejects(buatSetoranHarian(db, k(admin), admin, { tanggal: D }), tolak(/Tidak ada shift ditutup/))
    assert.equal(await db.posSettlement.count(), 2)
    await assert.rejects(
      db.posSettlementLine.create({ data: { posSettlementId: qrisId, shiftId: sA.id, paymentMethodId: toko.metode.Tunai, expected: 1n, actual: 1n } }),
      (e: { code?: string }) => e.code === 'P2002',
    )
    await assert.rejects(
      db.posSettlement.create({ data: { no: 'ST-UJI', date: new Date(`${D}T00:00:00Z`), paymentMethodId: toko.metode.Tunai } }),
      (e: { code?: string }) => e.code === 'P2002',
    )
    await assert.rejects(buatSetoranHarian(db, k(admin), admin, { tanggal: hariKe(2) }), (e: Error) => /masa depan/.test(e.message))
    await assert.rejects(buatSetoranHarian(db, k(kasir), kasir, { tanggal: D }), (e) => e instanceof GalatIzin)
  })
  test('tunai butuh semua shift tanggal itu ditutup, non tunai tidak', async () => {
    await assert.rejects(postingSetoran(db, k(admin), admin, tunaiId), tolak(/semua shift tanggal itu ditutup/))
    const q = await postingSetoran(db, k(admin), admin, qrisId)
    assert.equal(q.status, 'Diposting')
    assert.equal(q.approvedBy, null)
  })
  test('shift yang ditutup belakangan masuk lewat muat ulang; posting tanpa muat ulang ditolak', async () => {
    const sB = await db.shift.findFirstOrThrow({ where: { userId: kasir2.id, status: 'Buka' } })
    await tutupShift(db, k(kasir2), kasir2, sB.id, { kasDihitung: '100000' })
    await assert.rejects(postingSetoran(db, k(admin), admin, tunaiId), tolak(/belum masuk setoran ini/))
    const m = await muatUlangSetoran(db, k(admin), admin, tunaiId)
    assert.equal(m.baru, 1)
    const baris = await db.posSettlementLine.count({ where: { posSettlementId: tunaiId } })
    assert.equal(baris, 2)
  })
  test('selisih di atas batas butuh Owner: Admin ditolak, diajukan, Owner menyetujui dan memposting', async () => {
    const l = await db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: tunaiId, shiftId: sA.id } })
    const lain = await db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: tunaiId, NOT: { id: l.id } } })
    await ubahSetoran(db, k(admin), admin, tunaiId, { bankAccountId: String(rekening), mdrFee: '0', note: 'Setor ke BCA', [`actual_${l.id}`]: String(sA.tunai - 15000), [`catatan_${l.id}`]: 'Kurang', [`actual_${lain.id}`]: String(lain.actual), [`catatan_${lain.id}`]: '' })
    const st = await db.posSettlement.findUniqueOrThrow({ where: { id: tunaiId } })
    assert.equal(Number(st.diff), -15000)
    await assert.rejects(postingSetoran(db, k(admin), admin, tunaiId), tolak(/butuh persetujuan Owner.*Ajukan dulu/))
    await ajukanSetoran(db, k(admin), admin, tunaiId)
    await assert.rejects(ubahSetoran(db, k(admin), admin, tunaiId, { mdrFee: '0' }), tolak(/masih Draft/))
    await assert.rejects(postingSetoran(db, k(admin), admin, tunaiId), tolak(/Tunggu Owner/))
    const p = await postingSetoran(db, k(owner), owner, tunaiId)
    assert.equal(p.status, 'Diposting')
    assert.equal(p.approvedBy, owner.id)
    const aksi = (await db.auditLog.findMany({ where: { docType: 'pos_settlement', docId: String(tunaiId) }, orderBy: { id: 'asc' }, select: { action: true } })).map((a) => a.action)
    assert.deepEqual(aksi, ['setoran.tambah', 'setoran.ubah', 'setoran.ubah', 'setoran.ajukan', 'setoran.setujui', 'setoran.posting'])
    // Laporan membaca status setoran: semua pembayaran tanggal D sudah disetor.
    const r = await ringkasanPembayaran(db, { dari: D, sampai: D })
    assert.equal(r.jumlah.belum, 0)
    const h = await tutupHarian(db, { tanggal: D })
    assert.deepEqual(h.belum, [])
  })
  test('batal dari Diposting: Admin ditolak saklar, Owner dengan alasan, shift bisa disetor ulang', async () => {
    await assert.rejects(batalSetoran(db, k(admin), admin, qrisId, { alasan: 'Salah rekening' }), tolak(/saklar/))
    await assert.rejects(batalSetoran(db, k(owner), owner, qrisId, { alasan: '' }), (e: Error) => /ZodError/.test(e.name))
    const b = await batalSetoran(db, k(owner), owner, qrisId, { alasan: 'Salah rekening' })
    assert.equal(b.status, 'Batal')
    assert.equal(await db.posSettlementLine.count({ where: { posSettlementId: qrisId, cancelled: false } }), 0)
    const ulang = await buatSetoranHarian(db, k(admin), admin, { tanggal: D })
    assert.deepEqual(ulang.dibuat.map((x) => x.metode), ['QRIS'])
    assert.notEqual(ulang.dibuat[0].no, b.no)
  })
})

describe('shift perlu persetujuan dan draf', () => {
  test('shift "Perlu persetujuan" membuat setoran butuh Owner walau selisih setoran nol', async () => {
    const s = await shiftLengkap(kasir, D2, -30000)
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D2 })
    const tunai = h.dibuat.find((x) => x.metode === 'Tunai')!
    await assert.rejects(postingSetoran(db, k(admin), admin, tunai.id), tolak(/masih perlu persetujuan/))
    await setujuiShift(db, k(owner), owner, s.id, { catatan: 'Sudah dicek' })
    const p = await postingSetoran(db, k(admin), admin, tunai.id)
    assert.equal(p.status, 'Diposting')
  })
  test('kembalikan ke Draft, hapus draf, dan setoran dari tanggal lain tidak tercampur', async () => {
    const qris = await db.posSettlement.findFirstOrThrow({ where: { date: new Date(`${D2}T00:00:00Z`), paymentMethod: { kind: 'qris' } } })
    await ajukanSetoran(db, k(admin), admin, qris.id)
    await kembalikanSetoran(db, k(admin), admin, qris.id, { catatan: 'Salah ajukan' })
    await assert.rejects(hapusSetoran(db, k(kasir), kasir, qris.id), (e) => e instanceof GalatIzin)
    await hapusSetoran(db, k(admin), admin, qris.id)
    assert.equal(await db.posSettlement.count({ where: { id: qris.id } }), 0)
    assert.equal(await db.auditLog.count({ where: { action: 'setoran.hapus', docId: String(qris.id) } }), 1)
    const lagi = await buatSetoranHarian(db, k(admin), admin, { tanggal: D2 })
    assert.deepEqual(lagi.dibuat.map((x) => x.metode), ['QRIS'])
    const baris = await db.posSettlementLine.findMany({ where: { posSettlementId: lagi.dibuat[0].id }, include: { shift: true } })
    assert.ok(baris.every((b) => b.shift.openedAt.toISOString() >= `${D2}T00:00` && b.shift.openedAt < new Date(`${D}T00:00:00+07:00`)))
  })
  test('rekening nonaktif ditolak saat posting non tunai', async () => {
    const qris = await db.posSettlement.findFirstOrThrow({ where: { date: new Date(`${D2}T00:00:00Z`), paymentMethod: { kind: 'qris' }, status: 'Draft' } })
    await ubahStatusRekening(db, k(owner), owner, rekening, false)
    await assert.rejects(postingSetoran(db, k(admin), admin, qris.id), tolak(/nonaktif/))
    await ubahStatusRekening(db, k(owner), owner, rekening, true)
    await db.posSettlement.update({ where: { id: qris.id }, data: { bankAccountId: null } })
    await assert.rejects(postingSetoran(db, k(admin), admin, qris.id), tolak(/Pilih rekening tujuan/))
  })
})
