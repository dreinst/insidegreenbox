// Setoran POS tahap 5A: isi otomatis dari shift ditutup, tolak ganda, tunai butuh semua shift tanggal itu ditutup,
// selisih tidak lagi butuh Owner (tahap 6C), shift lama "Perlu persetujuan" butuh Owner, batal dari Diposting,
// hapus draf, rekening bank, dan audit.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { ringkasanPembayaran, tutupHarian } from '../src/lib/laporan'
import { simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { ubahMetode } from '../src/lib/metode-bayar'
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
  // Uang tunai yang masuk laci sudah dibulatkan ke Rp 500 (KONTRAK 11 butir 155): 32.340 menjadi 32.500.
  const total = Number(a.total) + a.pembulatan
  const b = await simpanPenjualan(db, k(aktor), aktor, { mode: 'takeaway', baris: [{ menuItemId: toko.menu.Croissant, qty: 2 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: 57750 }] })
  await pindahJual(db, a.id, tanggal, '10:00')
  await pindahJual(db, b.id, tanggal, '11:00')
  await tutupShift(db, k(aktor), aktor, s.id, { kasDihitung: String(150000 + total + selisih), catatan: selisih ? 'Selisih uji' : '' })
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
  test('tahap 6C: setoran berselisih tidak lagi butuh Owner, Admin langsung memposting', async () => {
    const l = await db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: tunaiId, shiftId: sA.id } })
    const lain = await db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: tunaiId, NOT: { id: l.id } } })
    await ubahSetoran(db, k(admin), admin, tunaiId, { bankAccountId: String(rekening), mdrFee: '0', note: 'Setor ke BCA', [`actual_${l.id}`]: String(sA.tunai - 15000), [`catatan_${l.id}`]: 'Kurang', [`actual_${lain.id}`]: String(lain.actual), [`catatan_${lain.id}`]: '' })
    const st = await db.posSettlement.findUniqueOrThrow({ where: { id: tunaiId } })
    assert.equal(Number(st.diff), -15000)
    const p = await postingSetoran(db, k(admin), admin, tunaiId)
    assert.equal(p.status, 'Diposting')
    assert.equal(p.approvedBy, null)
    const aksi = (await db.auditLog.findMany({ where: { docType: 'pos_settlement', docId: String(tunaiId) }, orderBy: { id: 'asc' }, select: { action: true } })).map((a) => a.action)
    assert.deepEqual(aksi, ['setoran.tambah', 'setoran.ubah', 'setoran.ubah', 'setoran.posting'])
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
  test('shift lama "Perlu persetujuan" membuat setoran butuh Owner walau selisih setoran nol', async () => {
    const s = await shiftLengkap(kasir, D2, -30000)
    assert.equal((await db.shift.findUniqueOrThrow({ where: { id: s.id } })).status, 'Tutup')
    // Data lama dari sebelum tahap 6C: shift yang masih menunggu persetujuan Owner.
    await db.shift.update({ where: { id: s.id }, data: { status: 'PerluPersetujuan', diffLimit: 10000n } })
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D2 })
    const tunai = h.dibuat.find((x) => x.metode === 'Tunai')!
    await assert.rejects(postingSetoran(db, k(admin), admin, tunai.id), tolak(/masih perlu persetujuan.*Ajukan dulu/))
    await ajukanSetoran(db, k(admin), admin, tunai.id)
    await assert.rejects(ubahSetoran(db, k(admin), admin, tunai.id, { mdrFee: '0' }), tolak(/masih Draft/))
    await assert.rejects(postingSetoran(db, k(admin), admin, tunai.id), tolak(/Tunggu Owner/))
    await kembalikanSetoran(db, k(admin), admin, tunai.id, { catatan: 'Tunggu shift disetujui' })
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

describe('tahap 6C: alasan selisih kosong', () => {
  test('setoran tetap bisa dibuat dan diposting dari shift yang alasan selisihnya belum diisi', async () => {
    const D3 = hariKe(-3)
    const s = await bukaShift(db, k(kasir2), kasir2, { modal: '100000' })
    await pindahShift(db, s.id, D3, '09:00')
    await tutupShift(db, k(kasir2), kasir2, s.id, { kasDihitung: '90000' })
    assert.equal((await db.shift.findUniqueOrThrow({ where: { id: s.id } })).reasonMissing, true)
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D3 })
    const tunai = h.dibuat.find((x) => x.metode === 'Tunai')!
    const p = await postingSetoran(db, k(admin), admin, tunai.id)
    assert.equal(p.status, 'Diposting')
    const baris = await db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: tunai.id }, include: { shift: true } })
    assert.equal(baris.shift.reasonMissing, true, 'baris setoran bisa menandai shift tanpa alasan')
  })
})

// Temuan audit A-3: void sesudah setoran Draft dibuat, lalu Muat ulang baris.
describe('muat ulang sesudah void (A-3)', () => {
  test('nilai disetor dan MDR bawaan ikut dihitung ulang, yang sudah diubah user tidak ditimpa, shift bernilai 0 ikut', async () => {
    const D4 = hariKe(-4)
    const kasir3 = await buatAktor(db, 'kasir', 'kasir3')
    const s = await bukaShift(db, k(kasir3), kasir3, { modal: '100000' })
    await pindahShift(db, s.id, D4, '09:00')
    const jual = []
    // Total dengan service 5% dan pajak 10%: 32.340, 28.875, 40.425.
    for (const [i, [menu, bayar]] of ([['Kopi Susu', 32340], ['Croissant', 28875], ['Nasi Goreng', 40425]] as const).entries()) {
      const j = await simpanPenjualan(db, k(kasir3), kasir3, { mode: 'takeaway', baris: [{ menuItemId: toko.menu[menu], qty: 1 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: bayar }] })
      await pindahJual(db, j.id, D4, `1${i}:00`)
      jual.push(await db.sale.findUniqueOrThrow({ where: { id: j.id } }))
    }
    await tutupShift(db, k(kasir3), kasir3, s.id, { kasDihitung: '100000' })
    const h = await buatSetoranHarian(db, k(admin), admin, { tanggal: D4 })
    const qris = h.dibuat.find((x) => x.metode === 'QRIS')!
    const mdr = (n: bigint) => BigInt(Math.round((Number(n) * 0.7) / 100))
    const [a, b, c] = jual.map((j) => j.total)
    const baris = () => db.posSettlementLine.findFirstOrThrow({ where: { posSettlementId: qris.id } })
    const kepala = () => db.posSettlement.findUniqueOrThrow({ where: { id: qris.id } })
    assert.equal((await kepala()).mdrFee, mdr(a) + mdr(b) + mdr(c))

    // Void C sesudah shift ditutup (Owner). Muat ulang: nilai sistem, MDR, dan nilai disetor ikut turun, selisih tetap 0.
    await voidPenjualan(db, k(owner), owner, jual[2].id, { alasan: 'Salah input' })
    await assert.rejects(postingSetoran(db, k(admin), admin, qris.id), tolak(/berubah sesudah setoran dibuat/))
    const m1 = await muatUlangSetoran(db, k(admin), admin, qris.id)
    assert.deepEqual(m1, { baru: 0, berubah: 1, periksa: 0 })
    let l = await baris()
    assert.equal(l.expected, a + b)
    assert.equal(l.mdr, mdr(a) + mdr(b))
    assert.equal(l.actual, a + b - mdr(a) - mdr(b))
    let st = await kepala()
    assert.deepEqual([st.expectedTotal, st.actualTotal, st.mdrFee, st.diff], [a + b, a + b - mdr(a) - mdr(b), mdr(a) + mdr(b), 0n])
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'setoran.ubah', docId: String(qris.id) }, orderBy: { id: 'desc' } })
    assert.match(audit.summary, new RegExp(`shift #${s.id} berubah`))

    // Nilai disetor yang diubah user (sesuai mutasi) tidak ditimpa sesudah void berikutnya, dan dilaporkan.
    await ubahSetoran(db, k(admin), admin, qris.id, { bankAccountId: String(rekening), mdrFee: String(st.mdrFee), note: '', [`actual_${l.id}`]: '60000', [`catatan_${l.id}`]: 'Sesuai mutasi' })
    await voidPenjualan(db, k(owner), owner, jual[1].id, { alasan: 'Salah input' })
    assert.deepEqual(await muatUlangSetoran(db, k(admin), admin, qris.id), { baru: 0, berubah: 1, periksa: 1 })
    l = await baris()
    assert.deepEqual([l.expected, l.actual, l.mdr], [a, 60000n, mdr(a)])
    assert.equal((await kepala()).mdrFee, mdr(a))

    // Semua transaksi QRIS shift itu di-void: nilai sistem 0 tetap terdeteksi saat posting dan saat muat ulang.
    await voidPenjualan(db, k(owner), owner, jual[0].id, { alasan: 'Salah input' })
    await assert.rejects(postingSetoran(db, k(admin), admin, qris.id), tolak(/berubah sesudah setoran dibuat/))
    await muatUlangSetoran(db, k(admin), admin, qris.id)
    l = await baris()
    assert.deepEqual([l.expected, l.mdr], [0n, 0n])
    st = await kepala()
    assert.deepEqual([st.expectedTotal, st.mdrFee], [0n, 0n])
  })
})

// Temuan audit A-6: jenis metode yang sudah dipakai tidak bisa diganti, supaya angka shift lama dan kas seharusnya
// shift terbuka tidak ikut berubah.
describe('jenis metode bayar yang sudah dipakai (A-6)', () => {
  test('jenis Tunai dan QRIS yang punya pembayaran ditolak diganti, nama tetap bisa', async () => {
    await assert.rejects(ubahMetode(db, k(admin), admin, toko.metode.Tunai, { name: 'Tunai', kind: 'lainnya' }), tolak(/sudah dipakai di \d+ pembayaran/))
    await assert.rejects(ubahMetode(db, k(owner), owner, toko.metode.QRIS, { name: 'QRIS', kind: 'debit' }), tolak(/tidak bisa diganti/))
    assert.equal((await db.paymentMethod.findUniqueOrThrow({ where: { id: toko.metode.Tunai } })).kind, 'tunai')
    const h = await ubahMetode(db, k(owner), owner, toko.metode.QRIS, { name: 'QRIS Toko', kind: 'qris' })
    assert.equal(h.berubah, 1)
  })
})
