// Tahap 5B: mesin jurnal (seimbang dan ditolak), jurnal penjualan tunai, QRIS, dan bermember, void, selisih kas dan kas
// laci, setoran dengan MDR, penyesuaian stok, produksi cepat, jurnal memorial, tutup periode, bentuk ulang idempoten,
// serta neraca seimbang dan nilai persediaan sama dengan stok.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { ubahAkun, tambahAkun, simpanPemetaan, ubahStatusAkun } from '../src/lib/akuntansi/akun'
import { bentukUlangJurnal } from '../src/lib/akuntansi/bentuk-ulang'
import { buatJurnal, dk, periodeDari } from '../src/lib/akuntansi/jurnal'
import { bukuBesar, cocokkanPersediaan, labaRugi, neraca, neracaSaldo } from '../src/lib/akuntansi/laporan'
import { buatMemorial, tambahBarisMemorial, ubahStatusMemorial } from '../src/lib/akuntansi/memorial'
import { pasangBawaanAkuntansi } from '../src/lib/akuntansi/pemetaan'
import { bukaPeriode, bulanIni, geserBulan, tutupPeriode } from '../src/lib/akuntansi/periode'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { rekapMenu, rekapPenjualan } from '../src/lib/laporan'
import { keCsv, tabelMenu, tabelRekap } from '../src/lib/laporan-kolom'
import { simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { buatCepat, ubahStatusCepat } from '../src/lib/produksi/cepat'
import { simpanBahan, tambahResep } from '../src/lib/produksi/resep'
import { tambahRekening } from '../src/lib/rekening'
import { batalSetoran, buatSetoranHarian, postingSetoran } from '../src/lib/setoran'
import { bukaShift, catatKasLaci, tutupShift } from '../src/lib/shift'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { catatGerak } from '../src/lib/stok/mesin'
import { buatPenyesuaian, tambahBarisPenyesuaian, ubahStatusPenyesuaian } from '../src/lib/stok/penyesuaian'
import { buatAktor, k, siapkanDbUji } from './db-uji'
import { siapkanToko } from './toko-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let toko: Awaited<ReturnType<typeof siapkanToko>>
let outlet = 0
let kopi = 0
let alasanAwal = 0
let alasanRusak = 0
const tgl = () => hariIni().toISOString().slice(0, 10)

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)

// Baris jurnal maju (atau balik) dokumen sebagai peta kode akun -> nilai bertanda (debit plus, kredit minus).
async function isiJurnal(docType: string, docId: number, balik = false) {
  const j = await db.journal.findFirst({ where: { sourceType: docType, sourceId: docId, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
  if (!j) return null
  const peta: Record<string, bigint> = {}
  for (const l of j.journalLines) peta[l.account.code] = (peta[l.account.code] ?? 0n) + l.debit - l.credit
  const d = j.journalLines.reduce((n, l) => n + l.debit, 0n)
  const c = j.journalLines.reduce((n, l) => n + l.credit, 0n)
  assert.equal(d, c, `jurnal ${j.no} seimbang`)
  return { j, peta }
}
const saldoAkun = async (code: string) => {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id WHERE a.code = ${code} AND j.posted_at IS NOT NULL`
  return r.n
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('akuntansi'))
  await isiBawaanStok(db)
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  toko = await siapkanToko(db)
  await pasangBawaanAkuntansi(db)
  outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
  const gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
  kopi = (await db.product.create({ data: { code: 'KOPI', name: 'Kopi uji', baseUnitId: gram, kind: 'bahan' } })).id
  alasanAwal = (await db.stockReason.findUniqueOrThrow({ where: { code: 'saldo_awal' } })).id
  alasanRusak = (await db.stockReason.findFirstOrThrow({ where: { name: 'Rusak' } })).id
})
after(() => hapus())

describe('mesin jurnal', () => {
  test('jurnal seimbang tersimpan dengan nomor JU, yang tidak seimbang dan dokumen ganda ditolak', async () => {
    const kepala = { docType: 'uji', docId: 1, docNo: 'UJI-1', tanggal: hariIni(), memo: 'uji', oleh: owner.id }
    const h = await db.$transaction((tx) => buatJurnal(tx, kepala, [dk('kas_besar', 1000n), dk('penjualan', -600n), dk('pendapatan_service', -400n)]))
    assert.ok(h)
    assert.match(h.no, /^JU-\d{4}-\d{4}$/)
    assert.equal(h.total, 1000n)
    await galat(() => db.$transaction((tx) => buatJurnal(tx, { ...kepala, docId: 2 }, [dk('kas_besar', 1000n), dk('penjualan', -999n)])), /tidak seimbang/)
    await galat(() => db.$transaction((tx) => buatJurnal(tx, kepala, [dk('kas_besar', 5n), dk('penjualan', -5n)])), /sudah punya jurnal/)
    await galat(() => db.$transaction((tx) => buatJurnal(tx, { ...kepala, docId: 3 }, [{ akun: 'kas_besar', debit: -5n }, { akun: 'penjualan', kredit: -5n }])), /minus/)
    await galat(() => db.$transaction((tx) => buatJurnal(tx, { ...kepala, docId: 4 }, [dk('kunci_tidak_ada', 5n), dk('penjualan', -5n)])), /belum dipetakan/)
    // Semua baris nol: tidak ada jurnal.
    assert.equal(await db.$transaction((tx) => buatJurnal(tx, { ...kepala, docId: 5 }, [dk('kas_besar', 0n)])), null)
    // Baris jurnal yang sudah berlaku tidak bisa diubah langsung di basis data.
    await assert.rejects(db.journalLine.updateMany({ where: { journalId: h.id }, data: { debit: 1n } }))
    await assert.rejects(db.journal.delete({ where: { id: h.id } }))
  })
})

describe('akun dan pemetaan', () => {
  test('tambah akun, jenis tidak bisa diubah sesudah punya jurnal, pemetaan memeriksa jenis, Admin hanya melihat', async () => {
    const induk = await db.account.findUniqueOrThrow({ where: { code: '6-1000' } })
    const a = await tambahAkun(db, k(owner), owner, { code: '6-1950', name: 'Beban Kebersihan', kind: 'Beban', parentId: String(induk.id), isPostable: 'on' })
    await galat(() => tambahAkun(db, k(owner), owner, { code: '6-1950', name: 'Ganda', kind: 'Beban', parentId: '', isPostable: 'on' }), /sudah dipakai/)
    await galat(() => tambahAkun(db, k(owner), owner, { code: '1-9999', name: 'Salah induk', kind: 'Aset', parentId: String(induk.id), isPostable: 'on' }), /sama dengan induknya/)
    await ditolak(() => tambahAkun(db, k(admin), admin, { code: '6-1960', name: 'Coba', kind: 'Beban', parentId: '', isPostable: 'on' }))
    // Akun yang sudah punya jurnal (Kas Besar) tidak bisa diganti jenisnya.
    const kasBesar = await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })
    await galat(() => ubahAkun(db, k(owner), owner, kasBesar.id, { code: '1-1200', name: 'Kas Besar', kind: 'Beban', parentId: '', isPostable: 'on' }), /sudah punya/)
    // Akun yang dipetakan tidak bisa dinonaktifkan.
    await galat(() => ubahStatusAkun(db, k(owner), owner, kasBesar.id, false), /Pemetaan Akun/)
    await galat(() => simpanPemetaan(db, k(owner), owner, { selisih_kas: String(kasBesar.id) }), /berjenis Beban/)
    await simpanPemetaan(db, k(owner), owner, { laci_keluar: String(a.id) })
    assert.equal((await db.accountMapping.findUniqueOrThrow({ where: { key: 'laci_keluar' } })).accountId, a.id)
    await ditolak(() => simpanPemetaan(db, k(admin), admin, { laci_keluar: String(kasBesar.id) }))
    assert.equal(await db.auditLog.count({ where: { action: { in: ['akun.tambah', 'pemetaan.ubah'] } } }), 2)
  })
})

describe('jurnal dokumen', () => {
  let jualTunai = 0
  let shiftId = 0

  test('penyesuaian stok: tambah dan kurang lawan Selisih Persediaan atau akun pemetaan alasannya', async () => {
    // Alasan Saldo awal hanya dipakai impor (tidak ditawarkan di layar); jurnalnya diuji di bentuk ulang.
    const koreksi = (await db.stockReason.findFirstOrThrow({ where: { name: 'Koreksi catatan' } })).id
    const d = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tgl() })
    await tambahBarisPenyesuaian(db, k(owner), owner, d.id, { productId: String(kopi), reasonId: String(koreksi), direction: 'tambah', qty: '1000', unitCost: '300' })
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'ajukan')
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'posting')
    const a = (await isiJurnal('stock_adjustment', d.id))!
    assert.deepEqual(a.peta, { '1-1500': 300000n, '5-3000': -300000n })
    const r = await buatPenyesuaian(db, k(admin), admin, { locationId: String(outlet), date: tgl() })
    await tambahBarisPenyesuaian(db, k(admin), admin, r.id, { productId: String(kopi), reasonId: String(alasanRusak), direction: 'kurang', qty: '10' })
    await ubahStatusPenyesuaian(db, k(admin), admin, r.id, 'posting')
    const b = (await isiJurnal('stock_adjustment', r.id))!
    assert.deepEqual(b.peta, { '5-3000': 3000n, '1-1500': -3000n })
    // Alasan dengan pemetaan sendiri memakai akun itu.
    const beban = await db.account.findUniqueOrThrow({ where: { code: '6-1900' } })
    await simpanPemetaan(db, k(owner), owner, { [`alasan.${alasanRusak}`]: String(beban.id) })
    const r2 = await buatPenyesuaian(db, k(admin), admin, { locationId: String(outlet), date: tgl() })
    await tambahBarisPenyesuaian(db, k(admin), admin, r2.id, { productId: String(kopi), reasonId: String(alasanRusak), direction: 'kurang', qty: '10' })
    await ubahStatusPenyesuaian(db, k(admin), admin, r2.id, 'posting')
    assert.deepEqual((await isiJurnal('stock_adjustment', r2.id))!.peta, { '6-1900': 3000n, '1-1500': -3000n })
  })

  test('penjualan tunai: kas laci, penjualan, service, PB1, serta HPP lawan persediaan', async () => {
    const r = await tambahResep(db, k(admin), admin, { kind: 'menu', name: 'Resep Kopi Susu', menuItemId: String(toko.menu['Kopi Susu']) })
    await simpanBahan(db, k(admin), admin, r.id, { productId: String(kopi), qty: '18' })
    shiftId = (await bukaShift(db, k(kasir), kasir, { modal: '100000' })).id
    const j = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 1 }], bayar: [{ metodeId: toko.metode.Tunai, jumlah: 50000 }] })
    jualTunai = j.id
    // 28.000 + service 5% 1.400 + pajak 10% dari 29.400 = 2.940; HPP 18 g x 300.
    assert.equal(j.total, 32340)
    const { peta, j: jurnal } = (await isiJurnal('sale', j.id))!
    assert.deepEqual(peta, { '1-1100': 32340n, '4-1000': -28000n, '4-2000': -1400n, '2-1300': -2940n, '5-1000': 5400n, '1-1500': -5400n })
    assert.equal(jurnal.docNo, (await db.sale.findUniqueOrThrow({ where: { id: j.id } })).no)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'penjualan.simpan', docId: String(j.id) } })
    assert.equal((audit.afterJson as { jurnal: string }).jurnal, jurnal.no)
  })

  test('penjualan QRIS ke Piutang Kliring QRIS, penjualan bermember ke Potongan Penjualan', async () => {
    const q = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: toko.menu.Croissant, qty: 2 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: 57750 }] })
    assert.deepEqual((await isiJurnal('sale', q.id))!.peta, { '1-1410': 57750n, '4-1000': -50000n, '4-2000': -2500n, '2-1300': -5250n })
    const m = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', memberId: toko.member, baris: [{ menuItemId: toko.menu.Americano, qty: 2 }], bayar: [{ metodeId: toko.metode.Tunai, jumlah: 100000 }] })
    // 44.000 - 10% 4.400 = 39.600; service 1.980; pajak 4.158; total 45.738.
    assert.equal(m.total, 45738)
    assert.deepEqual((await isiJurnal('sale', m.id))!.peta, { '1-1100': 45738n, '4-3000': 4400n, '4-1000': -44000n, '4-2000': -1980n, '2-1300': -4158n })
  })

  test('void membalik jurnal penjualan, termasuk HPP, bertanggal hari void', async () => {
    const persediaan = await saldoAkun('1-1500')
    await voidPenjualan(db, k(owner), owner, jualTunai, { alasan: 'Salah input' })
    const maju = (await isiJurnal('sale', jualTunai))!
    const balik = (await isiJurnal('sale', jualTunai, true))!
    assert.equal(balik.j.reversalOfId, maju.j.id)
    for (const [kode, v] of Object.entries(maju.peta)) assert.equal(balik.peta[kode], -v, `akun ${kode} dibalik`)
    assert.equal(await saldoAkun('1-1500'), persediaan + 5400n)
    await galat(() => voidPenjualan(db, k(owner), owner, jualTunai, { alasan: 'Lagi' }), /sudah void/)
  })

  test('kas keluar laci dan selisih kas tutup shift dijurnal', async () => {
    const m = await catatKasLaci(db, k(kasir), kasir, shiftId, { jenis: 'keluar', jumlah: '5000', alasan: 'Beli es batu' })
    assert.deepEqual((await isiJurnal('shift_cash_move', m.id))!.peta, { '6-1950': 5000n, '1-1100': -5000n })
    // Kas seharusnya 100.000 + 45.738 - 5.000 = 140.738; dihitung kurang 2.000.
    await tutupShift(db, k(kasir), kasir, shiftId, { kasDihitung: '138738', catatan: 'Uang kurang 2.000' })
    assert.deepEqual((await isiJurnal('shift', shiftId))!.peta, { '6-1100': 2000n, '1-1100': -2000n })
  })

  test('setoran: QRIS dengan MDR ke bank, tunai ke kas besar, kas laci kembali nol, batal membalik', async () => {
    const rek = await tambahRekening(db, k(owner), owner, { bankName: 'BCA', accountNo: '111222333', holderName: 'Greenbox' })
    await buatSetoranHarian(db, k(owner), owner, { tanggal: tgl() })
    const st = await db.posSettlement.findMany({ orderBy: { id: 'asc' }, include: { paymentMethod: true } })
    const qris = st.find((s) => s.paymentMethod.kind === 'qris')!
    const tunai = st.find((s) => s.paymentMethod.kind === 'tunai')!
    assert.equal(qris.mdrFee, 404n, 'MDR 0,7% dari 57.750 dibulatkan')
    await postingSetoran(db, k(owner), owner, qris.id)
    assert.deepEqual((await isiJurnal('pos_settlement', qris.id))!.peta, { '1-1310': 57346n, '6-1200': 404n, '1-1410': -57750n })
    assert.equal(qris.bankAccountId, rek.id)
    await postingSetoran(db, k(owner), owner, tunai.id)
    assert.deepEqual((await isiJurnal('pos_settlement', tunai.id))!.peta, { '1-1200': 38738n, '1-1100': -38738n })
    assert.equal(await saldoAkun('1-1100'), 0n, 'kas laci nol sesudah semua disetor')
    assert.equal(await saldoAkun('1-1410'), 0n, 'kliring QRIS nol sesudah disetor')
    await batalSetoran(db, k(owner), owner, qris.id, { alasan: 'Mutasi belum masuk' })
    const balik = (await isiJurnal('pos_settlement', qris.id, true))!
    assert.deepEqual(balik.peta, { '1-1310': -57346n, '6-1200': -404n, '1-1410': 57750n })
    assert.equal((await db.posSettlement.findUniqueOrThrow({ where: { id: qris.id } })).reversalJournalId, balik.j.id)
  })

  test('produksi cepat: persediaan hasil lawan persediaan bahan, nilai bersih ke persediaan 0', async () => {
    const pcs = (await db.unit.findFirstOrThrow({ where: { name: 'mililiter' } })).id
    const cb = (await db.product.create({ data: { code: 'CB', name: 'Cold brew uji', baseUnitId: pcs, kind: 'setengah_jadi' } })).id
    const b = await tambahResep(db, k(admin), admin, { kind: 'assembly', name: 'Cold brew', productId: String(cb), outputQty: '1000', extraCost: '0' })
    await simpanBahan(db, k(admin), admin, b.id, { productId: String(kopi), qty: '100' })
    const persediaan = await saldoAkun('1-1500')
    const d = await buatCepat(db, k(admin), admin, { bomId: String(b.id), qty: '1', fromLocationId: String(outlet), toLocationId: String(outlet), date: tgl() })
    await ubahStatusCepat(db, k(admin), admin, d.id, 'posting')
    const { j } = (await isiJurnal('quick_production', d.id))!
    const baris = await db.journalLine.findMany({ where: { journalId: j.id }, include: { account: true } })
    assert.deepEqual(
      baris.map((l) => [l.account.code, l.debit, l.credit]),
      [
        ['1-1500', 30000n, 0n],
        ['1-1500', 0n, 30000n],
      ],
    )
    assert.equal(await saldoAkun('1-1500'), persediaan, 'nilai bersih ke persediaan 0')
  })
})

describe('jurnal memorial dan tutup periode', () => {
  const lalu = geserBulan(bulanIni(), -1)
  const tglLalu = `${lalu}-15`
  let dokLalu = 0

  test('memorial: draf, baris, ajukan, setujui dan posting; Admin tidak punya akses', async () => {
    await ditolak(() => buatMemorial(db, k(admin), admin, { date: tgl(), memo: 'Coba admin' }))
    const m = await buatMemorial(db, k(owner), owner, { date: tgl(), memo: 'Setor modal pemilik' })
    assert.match(m.no, /^JM-\d{4}-\d{4}$/)
    const modal = await db.account.findUniqueOrThrow({ where: { code: '3-1000' } })
    const kas = await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(kas.id), debit: '1.000.000', kredit: '' })
    await galat(() => ubahStatusMemorial(db, k(owner), owner, m.id, 'ajukan'), /minimal dua baris/)
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(modal.id), debit: '', kredit: '900000' })
    await galat(() => ubahStatusMemorial(db, k(owner), owner, m.id, 'ajukan'), /tidak seimbang/)
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(modal.id), debit: '', kredit: '100000' })
    // Belum berlaku selama Draft.
    const sebelum = await saldoAkun('3-1000')
    await galat(() => ubahStatusMemorial(db, k(owner), owner, m.id, 'posting'), /perlu disetujui/)
    await ubahStatusMemorial(db, k(owner), owner, m.id, 'ajukan')
    assert.equal(await saldoAkun('3-1000'), sebelum)
    assert.equal(await ubahStatusMemorial(db, k(owner), owner, m.id, 'posting'), 'Diposting')
    assert.equal(await saldoAkun('3-1000'), sebelum - 1_000_000n)
    const bb = await bukuBesar(db, { akun: String(modal.id) })
    assert.ok(bb.akun && bb.baris.some((b) => b.no === m.no))
    assert.equal(bb.saldoAkhir, Number(-(sebelum - 1_000_000n)))
  })

  test('periode tertutup menolak posting dan pembatalan bertanggal di dalamnya; Owner membuka lagi dengan alasan', async () => {
    // Dokumen bertanggal bulan lalu diposting sebelum periodenya ditutup.
    const d = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tglLalu })
    await tambahBarisPenyesuaian(db, k(owner), owner, d.id, { productId: String(kopi), reasonId: String(alasanRusak), direction: 'kurang', qty: '1' })
    await ubahStatusPenyesuaian(db, k(owner), owner, d.id, 'posting')
    dokLalu = d.id
    await galat(() => tutupPeriode(db, k(owner), owner, bulanIni()), /belum berakhir/)
    await ditolak(() => tutupPeriode(db, k(admin), admin, lalu))
    await tutupPeriode(db, k(owner), owner, lalu)
    assert.equal((await db.fiscalPeriod.findUniqueOrThrow({ where: { yearMonth: lalu } })).status, 'Ditutup')
    // Posting dokumen stok dan memorial bertanggal bulan itu ditolak, dan transaksinya batal seluruhnya.
    const baru = await buatPenyesuaian(db, k(owner), owner, { locationId: String(outlet), date: tglLalu })
    await tambahBarisPenyesuaian(db, k(owner), owner, baru.id, { productId: String(kopi), reasonId: String(alasanRusak), direction: 'kurang', qty: '1' })
    await galat(() => ubahStatusPenyesuaian(db, k(owner), owner, baru.id, 'posting'), /sudah ditutup/)
    assert.equal(await db.stockLedger.count({ where: { docType: 'stock_adjustment', docId: baru.id } }), 0, 'gerak stok ikut batal')
    const m = await buatMemorial(db, k(owner), owner, { date: tglLalu, memo: 'Koreksi bulan lalu' })
    const a1 = await db.account.findUniqueOrThrow({ where: { code: '6-1900' } })
    const a2 = await db.account.findUniqueOrThrow({ where: { code: '1-1200' } })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(a1.id), debit: '1000', kredit: '' })
    await tambahBarisMemorial(db, k(owner), owner, m.id, { accountId: String(a2.id), debit: '', kredit: '1000' })
    await ubahStatusMemorial(db, k(owner), owner, m.id, 'ajukan')
    await galat(() => ubahStatusMemorial(db, k(owner), owner, m.id, 'posting'), /sudah ditutup/)
    // Pembatalan dokumen yang diposting di periode tertutup juga ditolak.
    await galat(() => ubahStatusPenyesuaian(db, k(owner), owner, dokLalu, 'batal', { alasan: 'Salah catat' }), /ditutup/)
    assert.equal((await db.stockAdjustment.findUniqueOrThrow({ where: { id: dokLalu } })).status, 'Diposting')
    // Membuka lagi: hanya Owner, alasan wajib.
    await ditolak(() => bukaPeriode(db, k(admin), admin, lalu, { alasan: 'Koreksi stok' }))
    await assert.rejects(bukaPeriode(db, k(owner), owner, lalu, { alasan: '' }))
    await bukaPeriode(db, k(owner), owner, lalu, { alasan: 'Koreksi memorial bulan lalu' })
    assert.equal(await ubahStatusMemorial(db, k(owner), owner, m.id, 'posting'), 'Diposting')
    const j = await db.journal.findUniqueOrThrow({ where: { id: m.id }, include: { period: true } })
    assert.equal(j.period?.yearMonth, periodeDari(j.date))
    assert.deepEqual(
      (await db.auditLog.findMany({ where: { docType: 'fiscal_period' }, orderBy: { id: 'asc' }, select: { action: true } })).map((x) => x.action),
      ['periode.tutup', 'periode.buka'],
    )
  })
})

describe('bentuk ulang dan laporan', () => {
  test('bentuk ulang membentuk jurnal dokumen lama sekali saja', async () => {
    // Dokumen lama: penyesuaian Diposting dan kas laci yang dibuat sebelum modul jurnal (tanpa jurnal).
    const d = await db.$transaction(async (tx) => {
      const dok = await tx.stockAdjustment.create({ data: { no: 'PS-LAMA-1', locationId: outlet, date: hariIni(), status: 'Diposting', postedAt: new Date(), stockAdjustmentLines: { create: [{ productId: kopi, reasonId: alasanAwal, direction: 'tambah', qty: 50, unitCost: 300 }] } }, include: { stockAdjustmentLines: true } })
      await catatGerak(tx, { docType: 'stock_adjustment', docId: dok.id, docNo: dok.no, tanggal: hariIni(), oleh: null }, [{ productId: kopi, locationId: outlet, qty: 50, hargaSatuan: 300, lineId: dok.stockAdjustmentLines[0].id }])
      return dok
    })
    const s2 = await bukaShift(db, k(kasir), kasir, { modal: '0' })
    await db.shiftCashMove.create({ data: { shiftId: s2.id, kind: 'masuk', amount: 20000n, reason: 'Receh lama' } })
    const awal = await cocokkanPersediaan(db)
    assert.equal(awal.cocok, false, 'sebelum bentuk ulang, persediaan buku tertinggal')
    const h1 = await bentukUlangJurnal(db)
    assert.equal(h1.per.stock_adjustment?.dibuat, 1)
    assert.equal(h1.per.kas_laci?.dibuat, 1)
    assert.deepEqual((await isiJurnal('stock_adjustment', d.id))!.peta, { '1-1500': 15000n, '3-1100': -15000n })
    assert.ok(h1.persediaan.cocok)
    const jumlah = await db.journal.count()
    const h2 = await bentukUlangJurnal(db)
    assert.equal(Object.values(h2.per).reduce((n, r) => n + r.dibuat + r.gagal.length, 0), 0, 'jalan kedua tidak membentuk apa pun')
    assert.equal(await db.journal.count(), jumlah)
  })

  test('neraca seimbang, neraca saldo seimbang, laba rugi cocok, persediaan buku sama dengan stok', async () => {
    const n = await neraca(db, {})
    assert.ok(n.seimbang, `aset ${n.ringkas.aset}, selisih ${n.selisih}`)
    const ns = await neracaSaldo(db, { dari: geserBulan(bulanIni(), -1) })
    assert.ok(ns.seimbang)
    const lr = await labaRugi(db, { dari: geserBulan(bulanIni(), -1) })
    assert.ok(lr.cek)
    // Laba tahun berjalan di neraca sama dengan laba bersih (semua jurnal uji ada di tahun ini atau bulan lalu).
    if (bulanIni().slice(0, 4) === geserBulan(bulanIni(), -1).slice(0, 4)) assert.equal(n.ringkas.labaBerjalan, lr.ringkas.bersih)
    const p = await cocokkanPersediaan(db)
    const [stok] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(value), 0)::bigint AS n FROM stock_balance`
    assert.equal(p.stok, Number(stok.n))
    assert.equal(p.buku, p.stok)
    const persediaanNeraca = n.baris.find((b) => b.kode === '1-1500')
    assert.equal(persediaanNeraca?.nilai, p.stok)
  })

  test('laporan penjualan: kolom HPP dan laba kotor dari sale.hpp untuk pemegang lihat nilai', async () => {
    const r = await rekapPenjualan(db, {})
    const [h] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(hpp), 0)::bigint AS n FROM sale WHERE status = 'Selesai'`
    assert.equal(r.jumlah.hpp, Number(h.n))
    assert.equal(r.jumlah.laba, r.jumlah.bersih - r.jumlah.hpp)
    assert.ok(keCsv(tabelRekap(r, { void: false, nilai: true })).split('\r\n')[0].endsWith('HPP,Laba kotor,Persen laba'))
    assert.ok(!keCsv(tabelRekap(r, { void: false })).includes('HPP'))
    const m = await rekapMenu(db, {})
    const kopiSusu = m.baris.find((b) => b.nama === 'Kopi Susu')
    assert.ok(!kopiSusu || kopiSusu.hppPorsi === 5400 || kopiSusu.qty === 0)
    assert.ok(keCsv(tabelMenu(m, { nilai: true })).includes('HPP per porsi'))
  })
})
