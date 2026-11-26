// Peran Superadmin dan Finance (KONTRAK 4.1, 4.6, dan 11 butir 161): Superadmin lolos semua pengecekan Owner,
// pengaman Owner aktif terakhir atas gabungan keduanya, matriks Finance, migrasi data, dan skrip akun awal.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'
import pg from 'pg'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { akunDariEnv, pasangAkun } from '../src/lib/akun-awal'
import { buatMemorial, ubahStatusMemorial } from '../src/lib/akuntansi/memorial'
import { bukaPeriode, bulanIni, geserBulan, tutupPeriode } from '../src/lib/akuntansi/periode'
import type { Db } from '../src/lib/db'
import { isOwner, muatIzin, muatSaklar, punyaIzin, type Pengguna } from '../src/lib/izin-inti'
import { buatKas, tambahBarisKas, ubahStatusKas } from '../src/lib/kas'
import { MENU_IZIN, MENU_TERKUNCI_OWNER, SAKLAR, setaraOwner } from '../src/lib/katalog'
import { cobaMasuk } from '../src/lib/masuk'
import { bolehLihatMenunggu } from '../src/lib/menunggu'
import { aturUlangSandi, peranBolehDiberi, skemaSandi, tambahPengguna, ubahPengguna, ubahStatusPengguna } from '../src/lib/pengguna'
import { simpanIzinPeran, simpanSaklarPeran, tambahPeran, ubahStatusPeran } from '../src/lib/peran'
import { bolehUbahAturan, simpanAturan } from '../src/lib/persetujuan'
import { bolehAturPinUntuk, bolehMasukPin } from '../src/lib/pin'
import { tambahRekening } from '../src/lib/rekening'
import { buatPenyesuaian } from '../src/lib/stok/penyesuaian'
import { hariIni } from '../src/lib/stok/dokumen'
import { isiPeranDanIzin } from '../src/lib/seed-inti'
import { buatAktor, k, muatAktor, siapkanDbUji } from './db-uji'

let db: Db
let url: string
let hapus: () => Promise<void>
let owner: Pengguna
let superadmin: Pengguna
let admin: Pengguna
let finance: Pengguna
const idPeran = async (code: string) => (await db.role.findUniqueOrThrow({ where: { code } })).id
const matriks = async (roleId: number) => {
  const izin = await muatIzin(db, roleId)
  return Object.fromEntries(MENU_IZIN.map((m) => [m.kode, izin[m.kode] ?? '']))
}
const tgl = () => hariIni().toISOString().slice(0, 10)
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)
const MIGRASI = readFileSync(new URL('../prisma/migrations/20261126100000_peran_superadmin_finance/migration.sql', import.meta.url), 'utf8')

async function jalankanMigrasi() {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(MIGRASI)
  } finally {
    await c.end()
  }
}

before(async () => {
  ;({ db, url, hapus } = await siapkanDbUji('peran'))
  owner = await buatAktor(db, 'owner', 'owner1')
  superadmin = await buatAktor(db, 'superadmin', 'super1')
  admin = await buatAktor(db, 'admin', 'admin1')
  finance = await buatAktor(db, 'finance', 'finance1')
})
after(() => hapus())

describe('Superadmin setara Owner', () => {
  test('isOwner menerima Owner dan Superadmin; izin dan saklar bawaannya sama dengan Owner', async () => {
    assert.equal(isOwner(superadmin), true)
    assert.equal(isOwner(owner), true)
    assert.equal(isOwner(admin), false)
    assert.equal(isOwner(finance), false)
    assert.deepEqual(superadmin.izin, owner.izin)
    for (const m of MENU_IZIN) assert.equal(superadmin.izin[m.kode], m.aksi, m.kode)
    assert.deepEqual(superadmin.saklar, owner.saklar)
    assert.equal(setaraOwner('superadmin') && setaraOwner('owner') && !setaraOwner('finance'), true)
  })

  test('Superadmin mengelola pengguna dan peran Owner, dan Owner mengelola Superadmin', async () => {
    const o2 = await tambahPengguna(db, k(superadmin), superadmin, { name: 'Owner Dua', username: 'owner_dua', roleId: owner.peran.id, sandi: 'sandi-owner-2', ulangiSandi: 'sandi-owner-2' })
    await ubahPengguna(db, k(superadmin), superadmin, o2.id, { name: 'Owner Kedua', username: 'owner_dua', roleId: owner.peran.id })
    await aturUlangSandi(db, k(superadmin), superadmin, o2.id, { sandi: 'sandi-baru-123', ulangiSandi: 'sandi-baru-123' })
    // Pindah antara Owner dan Superadmin, oleh keduanya.
    await ubahPengguna(db, k(superadmin), superadmin, o2.id, { name: 'Owner Kedua', username: 'owner_dua', roleId: superadmin.peran.id })
    await ubahPengguna(db, k(owner), owner, o2.id, { name: 'Owner Kedua', username: 'owner_dua', roleId: owner.peran.id })
    await ubahStatusPengguna(db, k(superadmin), superadmin, o2.id, false)
    await ubahStatusPengguna(db, k(owner), owner, o2.id, true)
    await ubahStatusPengguna(db, k(owner), owner, o2.id, false)
    // Matriks dan saklar peran Owner bisa diubah Superadmin, dan sebaliknya.
    const mo = await matriks(owner.peran.id)
    assert.equal(await simpanIzinPeran(db, k(superadmin), superadmin, owner.peran.id, { ...mo, 'b2b.retur': 'L' }), 1)
    assert.equal(await simpanIzinPeran(db, k(superadmin), superadmin, owner.peran.id, mo), 1)
    const ms = await matriks(superadmin.peran.id)
    assert.equal(await simpanIzinPeran(db, k(owner), owner, superadmin.peran.id, { ...ms, 'b2b.retur': 'L' }), 1)
    assert.equal(await simpanIzinPeran(db, k(owner), owner, superadmin.peran.id, ms), 1)
    const so = await muatSaklar(db, owner.peran.id)
    assert.equal(await simpanSaklarPeran(db, k(superadmin), superadmin, owner.peran.id, { ...so, 'b2b.ubah_harga': { nyala: false, batas: null } }), 1)
    assert.equal(await simpanSaklarPeran(db, k(superadmin), superadmin, owner.peran.id, so), 1)
    assert.ok((await peranBolehDiberi(db, superadmin)).some((r) => r.code === 'owner'))
  })

  test('menu dan saklar terkunci Owner juga terkunci di peran Superadmin', async () => {
    for (const menu of MENU_TERKUNCI_OWNER) {
      const m = await matriks(superadmin.peran.id)
      m[menu] = ''
      await assert.rejects(simpanIzinPeran(db, k(owner), owner, superadmin.peran.id, m), (e: unknown) => e instanceof GalatAturan && /Superadmin harus tetap/.test(e.message))
    }
    const s = await muatSaklar(db, superadmin.peran.id)
    await assert.rejects(simpanSaklarPeran(db, k(superadmin), superadmin, superadmin.peran.id, { ...s, 'log.lihat_semua': { nyala: false, batas: null } }), /harus tetap bisa melihat/)
    await assert.rejects(ubahStatusPeran(db, k(owner), owner, superadmin.peran.id, false), /Peran sistem/)
    await assert.rejects(ubahStatusPeran(db, k(superadmin), superadmin, await idPeran('finance'), false), /Peran sistem/)
  })

  test('Aturan Persetujuan, buka periode, dan PIN memperlakukan Superadmin seperti Owner', async () => {
    assert.equal(bolehUbahAturan(superadmin), true)
    assert.equal(await simpanAturan(db, k(superadmin), superadmin, {}), 0)
    const lalu = geserBulan(bulanIni(), -1)
    await tutupPeriode(db, k(owner), owner, lalu)
    await bukaPeriode(db, k(superadmin), superadmin, lalu, { alasan: 'Uji Superadmin membuka periode' })
    assert.equal(bolehMasukPin('superadmin', superadmin.izin), false, 'Superadmin masuk dengan sandi')
    const tSuper = await db.appUser.findUniqueOrThrow({ where: { id: superadmin.id }, include: { role: true } })
    assert.equal(await bolehAturPinUntuk(db, admin, tSuper), false, 'Admin tidak mengatur PIN Superadmin')
    const tAdmin = await db.appUser.findUniqueOrThrow({ where: { id: admin.id }, include: { role: true } })
    assert.equal(await bolehAturPinUntuk(db, superadmin, tAdmin), true)
  })

  test('bukan Owner tidak bisa memberi, mengubah, atau menyalin peran Superadmin', async () => {
    await tambahPeran(db, k(owner), owner, { code: 'spv_akun', name: 'SPV Akun' })
    const spvId = await idPeran('spv_akun')
    await simpanIzinPeran(db, k(owner), owner, spvId, { ...(await matriks(spvId)), 'atur.pengguna': 'LTU', 'atur.peran': 'LTU' })
    const spv = await buatAktor(db, 'spv_akun', 'spv_akun1')
    await assert.rejects(tambahPengguna(db, k(spv), spv, { name: 'Calon', username: 'calon_super', roleId: superadmin.peran.id, sandi: '12345678', ulangiSandi: '12345678' }), /Hanya Owner atau Superadmin/)
    await assert.rejects(ubahStatusPengguna(db, k(spv), spv, superadmin.id, false), /Hanya Owner atau Superadmin/)
    await assert.rejects(aturUlangSandi(db, k(spv), spv, superadmin.id, { sandi: 'sandibaru123', ulangiSandi: 'sandibaru123' }), /Hanya Owner atau Superadmin/)
    await assert.rejects(simpanIzinPeran(db, k(spv), spv, superadmin.peran.id, await matriks(superadmin.peran.id)), /Hanya Owner atau Superadmin/)
    await assert.rejects(tambahPeran(db, k(spv), spv, { code: 'tiruan_super', name: 'Tiruan', salinDari: superadmin.peran.id }), /tidak bisa kamu salin/)
    assert.ok(!(await peranBolehDiberi(db, spv)).some((r) => setaraOwner(r.code)))
  })
})

describe('pengaman Owner aktif terakhir atas gabungan Owner dan Superadmin', () => {
  test('Owner boleh dinonaktifkan selama Superadmin aktif; yang terakhir tidak bisa dinonaktifkan atau diturunkan', async () => {
    const o = await buatAktor(db, 'owner', 'owner_g')
    const s = await buatAktor(db, 'superadmin', 'super_g')
    // Hanya o dan s yang aktif di antara Owner dan Superadmin.
    const lain = await db.appUser.findMany({ where: { role: { code: { in: ['owner', 'superadmin'] } }, active: true, id: { notIn: [o.id, s.id] } } })
    await db.appUser.updateMany({ where: { id: { in: lain.map((u) => u.id) } }, data: { active: false } })
    try {
      await ubahStatusPengguna(db, k(s), s, o.id, false)
      // s kini satu-satunya. Aktor o tetap dipakai sebagai pemanggil (cek tidak bergantung status aktor).
      await assert.rejects(ubahStatusPengguna(db, k(o), o, s.id, false), /aktif terakhir berperan Owner atau Superadmin/)
      await assert.rejects(ubahPengguna(db, k(o), o, s.id, { name: s.name, username: s.username, roleId: await idPeran('admin') }), /aktif terakhir/)
      // Pindah ke Owner tidak mengurangi jumlah, jadi boleh.
      await ubahPengguna(db, k(o), o, s.id, { name: s.name, username: s.username, roleId: owner.peran.id })
      await ubahPengguna(db, k(o), o, s.id, { name: s.name, username: s.username, roleId: superadmin.peran.id })
      // Dua penonaktifan bersamaan (Owner dan Superadmin saling menonaktifkan) menyisakan tepat satu.
      await db.appUser.update({ where: { id: o.id }, data: { active: true } })
      const hasil = await Promise.allSettled([ubahStatusPengguna(db, k(o), o, s.id, false), ubahStatusPengguna(db, k(s), s, o.id, false)])
      const aktif = await db.appUser.count({ where: { id: { in: [o.id, s.id] }, active: true } })
      assert.equal(aktif, 1, JSON.stringify(hasil.map((h) => h.status)))
    } finally {
      await db.appUser.updateMany({ where: { id: { in: [...lain.map((u) => u.id), o.id, s.id] } }, data: { active: true } })
    }
  })
})

describe('matriks Finance', () => {
  test('izin dan saklar bawaan persis sesuai katalog', async () => {
    for (const m of MENU_IZIN) assert.equal(finance.izin[m.kode] ?? '', m.bawaan.finance, m.kode)
    for (const m of MENU_IZIN) assert.ok([...m.bawaan.finance].every((h) => m.aksi.includes(h)), `aksi Finance ${m.kode} berlaku di menunya`)
    const s = await muatSaklar(db, finance.peran.id)
    for (const def of SAKLAR) {
      assert.equal(s[def.kode].nyala, def.bawaan.finance.nyala, def.kode)
      if (def.satuan) assert.equal(s[def.kode].batas, def.bawaan.finance.batas, `batas ${def.kode}`)
    }
    assert.equal(finance.saklar['dok.tanggal_mundur'].batas, 1)
    assert.equal(finance.saklar['log.lihat_semua'].nyala, false)
    assert.equal(finance.saklar['pos.void'].nyala, false)
  })

  test('boleh: keuangan, laporan, akuntansi baca, jurnal memorial tanpa posting; tidak boleh: Setujui di mana pun dan menu operasional', () => {
    const boleh: [string, string][] = [
      ['kasir.setoran', 'LTUHP'],
      ['kas.transaksi', 'LTUHP'],
      ['kas.pindah', 'LTUHP'],
      ['kas.rekonsiliasi', 'LTUHP'],
      ['kas.rekening', 'LTUH'],
      ['beli.faktur', 'LTUH'],
      ['beli.pembayaran', 'LTUH'],
      ['b2b.penerimaan', 'LTUHP'],
      ['akun.jurnal', 'LTUH'],
      ['laporan.penjualan', 'L'],
      ['laporan.keuangan', 'L'],
      ['akun.tutup_periode', 'L'],
      ['atur.audit', 'L'],
    ]
    for (const [menu, huruf] of boleh) assert.equal(finance.izin[menu], huruf, menu)
    for (const m of MENU_IZIN) assert.equal(punyaIzin(finance.izin, m.kode, 'S'), false, `Finance tanpa Setujui di ${m.kode}`)
    for (const menu of ['kasir.layar', 'kasir.shift', 'kasir.transaksi', 'kasir.pin', 'menu.menu', 'menu.promo', 'menu.member', 'stok.saldo', 'stok.penyesuaian', 'produksi.perintah', 'beli.pesanan', 'beli.penerimaan', 'atur.pengguna', 'atur.peran', 'atur.saklar', 'atur.persetujuan']) {
      assert.equal(punyaIzin(finance.izin, menu, 'L'), false, menu)
    }
    for (const menu of ['beli.faktur', 'beli.pembayaran', 'akun.jurnal']) assert.equal(punyaIzin(finance.izin, menu, 'P'), false, `${menu} diposting Owner`)
    assert.equal(bolehMasukPin('finance', finance.izin), false)
    assert.equal(bolehLihatMenunggu(finance), true, 'Finance memegang Posting kas yang sudah disetujui')
  })

  test('aksi modul tanpa izin ditolak untuk Finance', async () => {
    const isi = { name: 'X Y', username: 'xy_fin', roleId: admin.peran.id, sandi: '12345678', ulangiSandi: '12345678' }
    await ditolak(() => tambahPengguna(db, k(finance), finance, isi))
    await ditolak(() => simpanIzinPeran(db, k(finance), finance, admin.peran.id, {}))
    await ditolak(() => simpanSaklarPeran(db, k(finance), finance, admin.peran.id, {}))
    await ditolak(() => simpanAturan(db, k(finance), finance, {}))
    await ditolak(() => buatPenyesuaian(db, k(finance), finance, { date: tgl(), note: 'Coba Finance' }))
    await ditolak(() => bukaPeriode(db, k(finance), finance, geserBulan(bulanIni(), -1), { alasan: 'Coba Finance' }))
    const m = await buatMemorial(db, k(finance), finance, { date: tgl(), memo: 'Draf memorial Finance' })
    await ditolak(() => ubahStatusMemorial(db, k(finance), finance, m.id, 'posting'))
  })

  test('kas keluar: Finance menyusun dan mengajukan, Owner menyetujui, Finance memposting', async () => {
    const rek = await tambahRekening(db, k(finance), finance, { bankName: 'Mandiri', accountNo: '9990001111', holderName: 'Greenbox' })
    const akun = await db.account.findFirstOrThrow({ where: { code: '6-1600' } })
    const c = await buatKas(db, k(finance), finance, { kind: 'keluar', date: tgl(), sumber: String(rek.id), partyName: 'PLN' })
    await tambahBarisKas(db, k(finance), finance, c.id, { accountId: String(akun.id), amount: '125.000', memo: 'Listrik' })
    await ubahStatusKas(db, k(finance), finance, c.id, 'ajukan')
    await ditolak(() => ubahStatusKas(db, k(finance), finance, c.id, 'setujui'))
    await ubahStatusKas(db, k(owner), owner, c.id, 'setujui')
    await ubahStatusKas(db, k(finance), finance, c.id, 'posting')
    assert.equal((await db.cashTransaction.findUniqueOrThrow({ where: { id: c.id } })).status, 'Diposting')
  })
})

describe('migrasi 20261126100000_peran_superadmin_finance', () => {
  test('basis data lama mendapat kedua peran sesuai katalog; diulang tidak menimpa izin yang diubah', async () => {
    // Tiru basis data produksi sebelum migrasi: hanya Owner, Admin, Kasir.
    const pengguna = await db.appUser.findMany({ where: { role: { code: { in: ['superadmin', 'finance'] } } }, select: { id: true } })
    await db.appUser.updateMany({ where: { id: { in: pengguna.map((u) => u.id) } }, data: { roleId: admin.peran.id } })
    await db.role.deleteMany({ where: { code: { in: ['superadmin', 'finance'] } } })
    const sebelum = await db.rolePermission.count()

    await jalankanMigrasi()
    const s = await db.role.findUniqueOrThrow({ where: { code: 'superadmin' } })
    const f = await db.role.findUniqueOrThrow({ where: { code: 'finance' } })
    assert.equal(s.isSystem && f.isSystem && s.active && f.active, true)
    assert.equal(await db.rolePermission.count(), sebelum + 2 * MENU_IZIN.length)
    const izinS = await muatIzin(db, s.id)
    const izinF = await muatIzin(db, f.id)
    for (const m of MENU_IZIN) {
      assert.equal(izinS[m.kode] ?? '', m.bawaan.superadmin, `superadmin ${m.kode}`)
      assert.equal(izinF[m.kode] ?? '', m.bawaan.finance, `finance ${m.kode}`)
    }
    const saklarS = await muatSaklar(db, s.id)
    const saklarF = await muatSaklar(db, f.id)
    for (const def of SAKLAR) {
      assert.deepEqual(saklarS[def.kode], def.bawaan.superadmin, `saklar superadmin ${def.kode}`)
      assert.deepEqual(saklarF[def.kode], def.bawaan.finance, `saklar finance ${def.kode}`)
    }

    // Pemilik mengubah izin dan saklar Finance, lalu migrasi dan seed dijalankan lagi.
    const mf = await matriks(f.id)
    await simpanIzinPeran(db, k(owner), owner, f.id, { ...mf, 'kas.rekening': 'L', 'stok.saldo': 'L' })
    await simpanSaklarPeran(db, k(owner), owner, f.id, { ...saklarF, 'dok.tanggal_mundur': { nyala: true, batas: 3 } })
    await jalankanMigrasi()
    await isiPeranDanIzin(db)
    const izinF2 = await muatIzin(db, f.id)
    assert.equal(izinF2['kas.rekening'], 'L')
    assert.equal(izinF2['stok.saldo'], 'L')
    assert.equal((await muatSaklar(db, f.id))['dok.tanggal_mundur'].batas, 3)
    assert.equal(await db.role.count({ where: { code: { in: ['superadmin', 'finance'] } } }), 2)
    assert.equal(await db.rolePermission.count(), sebelum + 2 * MENU_IZIN.length)
  })

  test('basis data baru tanpa peran tidak diubah, dan peran tambahan berkode superadmin menghentikan migrasi', async () => {
    // Peran tambahan berkode superadmin: migrasi dan seed berhenti dengan galat.
    const s = await db.role.findUniqueOrThrow({ where: { code: 'superadmin' } })
    await db.role.update({ where: { id: s.id }, data: { isSystem: false } })
    await assert.rejects(jalankanMigrasi(), /peran tambahan berkode superadmin/)
    await assert.rejects(isiPeranDanIzin(db), /peran tambahan berkode superadmin/)
    await db.role.update({ where: { id: s.id }, data: { isSystem: true } })
    // Tanpa peran owner (basis data baru sebelum seed) migrasi tidak menambah peran.
    const c = new pg.Client({ connectionString: url })
    await c.connect()
    try {
      await c.query('BEGIN')
      await c.query("DELETE FROM role WHERE code IN ('superadmin', 'finance')")
      await c.query("UPDATE role SET code = 'owner_sementara' WHERE code = 'owner'")
      await c.query(MIGRASI)
      const n = await c.query("SELECT count(*)::int AS n FROM role WHERE code IN ('superadmin', 'finance')")
      assert.equal(n.rows[0].n, 0)
    } finally {
      await c.query('ROLLBACK')
      await c.end()
    }
  })
})

describe('skrip akun awal', () => {
  test('memasang sandi pendek, login berhasil, diulang tidak mengubah apa pun, dan formulir tetap minimal 8', async () => {
    const h = await pasangAkun(db, { username: 'Finance', name: 'Finance', password: 'financegb', roleCode: 'finance' })
    assert.equal(h.hasil, 'dibuat')
    assert.equal(h.sandiPendek, false, '9 karakter tidak pendek')
    const sp = await pasangAkun(db, { username: 'superadmin', name: 'Superadmin', password: 'superadmingb', roleCode: 'superadmin' })
    assert.equal(sp.hasil, 'dibuat')
    const pendek = await pasangAkun(db, { username: 'kasir', name: 'Kasir', password: 'kasirgb', roleCode: 'kasir' })
    assert.equal(pendek.sandiPendek, true)
    const masuk = await cobaMasuk(db, { username: 'kasir', password: 'kasirgb', ip: '10.9.9.1', userAgent: 'tes' })
    assert.equal(masuk.ok, true)
    const masukF = await cobaMasuk(db, { username: 'finance', password: 'financegb', ip: '10.9.9.2', userAgent: 'tes' })
    assert.equal(masukF.ok, true)
    assert.equal((await muatAktor(db, 'finance')).peran.code, 'finance')

    // Diulang dengan sandi sama: tetap, sesi tidak dicabut.
    assert.equal((await pasangAkun(db, { username: 'kasir', name: 'Kasir', password: 'kasirgb', roleCode: 'kasir' })).hasil, 'tetap')
    const u = await db.appUser.findUniqueOrThrow({ where: { username: 'kasir' } })
    assert.equal(await db.userSession.count({ where: { userId: u.id, revokedAt: null } }), 1)
    // Sandi berbeda: diperbarui, sesi dicabut, sandi lama tidak berlaku.
    const ganti = await pasangAkun(db, { username: 'kasir', name: 'Kasir', password: 'kasirgb2', roleCode: 'kasir' })
    assert.deepEqual([ganti.hasil, ganti.perubahan], ['diperbarui', ['sandi']])
    assert.equal(await db.userSession.count({ where: { userId: u.id, revokedAt: null } }), 0)
    assert.equal((await cobaMasuk(db, { username: 'kasir', password: 'kasirgb', ip: '10.9.9.3', userAgent: 'tes' })).ok, false)
    // Batas formulir tidak berubah.
    assert.equal(skemaSandi.safeParse({ sandi: 'kasirgb', ulangiSandi: 'kasirgb' }).success, false)
  })

  test('tidak menurunkan pengguna aktif terakhir berperan Owner atau Superadmin; env dibaca per peran', async () => {
    const aktif = await db.appUser.findMany({ where: { role: { code: { in: ['owner', 'superadmin'] } }, active: true }, select: { id: true } })
    const sisa = await db.appUser.findUniqueOrThrow({ where: { username: 'superadmin' } })
    await db.appUser.updateMany({ where: { id: { in: aktif.map((u) => u.id).filter((id) => id !== sisa.id) } }, data: { active: false } })
    try {
      await assert.rejects(pasangAkun(db, { username: 'superadmin', name: 'x', password: 'superadmingb', roleCode: 'admin' }), /aktif terakhir/)
      assert.equal((await db.appUser.findUniqueOrThrow({ where: { id: sisa.id }, include: { role: true } })).role.code, 'superadmin')
    } finally {
      await db.appUser.updateMany({ where: { id: { in: aktif.map((u) => u.id) } }, data: { active: true } })
    }
    const daftar = akunDariEnv({ SEED_OWNER_USERNAME: 'owner', SEED_OWNER_PASSWORD: 'ownergb', SEED_FINANCE_USERNAME: 'finance', SEED_FINANCE_PASSWORD: 'financegb', SEED_FINANCE_NAME: 'Tim Keuangan' })
    assert.deepEqual(
      daftar.map((a) => [a.roleCode, a.username, a.name]),
      [
        ['owner', 'owner', 'Owner'],
        ['finance', 'finance', 'Tim Keuangan'],
      ],
    )
    assert.throws(() => akunDariEnv({ SEED_ADMIN_USERNAME: 'admin' }), /SEED_ADMIN_PASSWORD kosong/)
    await assert.rejects(pasangAkun(db, { username: 'a', name: 'x', password: 'x', roleCode: 'admin' }), /3 sampai 32/)
  })
})
