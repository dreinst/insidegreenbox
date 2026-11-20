// Aturan izin: matriks bawaan, saklar, dan pengaman Owner (KONTRAK 4).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import { muatIzin, muatSaklar, punyaIzin, type Pengguna } from '../src/lib/izin-inti'
import { MENU_IZIN, SAKLAR } from '../src/lib/katalog'
import { tambahPengguna, ubahPengguna, ubahStatusPengguna } from '../src/lib/pengguna'
import { simpanIzinPeran, simpanSaklarPeran, tambahPeran, ubahStatusPeran } from '../src/lib/peran'
import { buatAktor, k, muatAktor, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
const idPeran = async (code: string) => (await db.role.findUniqueOrThrow({ where: { code } })).id
const matriksSaatIni = async (roleId: number) => {
  const izin = await muatIzin(db, roleId)
  return Object.fromEntries(MENU_IZIN.map((m) => [m.kode, izin[m.kode] ?? '']))
}

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('izin'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
})
after(() => hapus())

describe('matriks bawaan RANCANGAN 8.2', () => {
  test('setiap peran sistem punya izin persis sesuai katalog', async () => {
    for (const p of [owner, admin, kasir]) {
      for (const m of MENU_IZIN) {
        const harap = m.bawaan[p.peran.code as 'owner' | 'admin' | 'kasir']
        assert.equal(p.izin[m.kode] ?? '', harap, `${p.peran.code} ${m.kode}`)
      }
    }
  })
  test('Owner memegang semua aksi yang berlaku di setiap menu', () => {
    for (const m of MENU_IZIN) assert.equal(owner.izin[m.kode], m.aksi, m.kode)
  })
  test('Admin tidak bisa membuka pengelolaan pengguna, peran, dan saklar, tetapi bisa Jejak Audit', () => {
    for (const menu of ['atur.pengguna', 'atur.peran', 'atur.saklar']) assert.equal(punyaIzin(admin.izin, menu, 'L'), false, menu)
    assert.equal(punyaIzin(admin.izin, 'atur.audit', 'L'), true)
    assert.equal(punyaIzin(admin.izin, 'beli.pembayaran', 'S'), false)
    assert.equal(punyaIzin(admin.izin, 'beli.penerimaan', 'P'), true)
  })
  test('Kasir hanya melihat menu kasir, menu, member, dan tingkat member', () => {
    // menu.tingkat ditambah di tahap 3A (Kasir hanya Lihat).
    assert.deepEqual(Object.keys(kasir.izin).sort(), ['kasir.layar', 'kasir.shift', 'kasir.transaksi', 'menu.member', 'menu.menu', 'menu.tingkat'])
  })
  test('aksi yang tidak berlaku untuk menu diabaikan walau tersimpan di database', async () => {
    const r = await idPeran('kasir')
    await db.rolePermission.update({ where: { roleId_menuCode: { roleId: r, menuCode: 'stok.saldo' } }, data: { canView: true, canPost: true } })
    const izin = await muatIzin(db, r)
    assert.equal(izin['stok.saldo'], 'L')
    await db.rolePermission.update({ where: { roleId_menuCode: { roleId: r, menuCode: 'stok.saldo' } }, data: { canView: false, canPost: false } })
  })
})

describe('saklar fitur RANCANGAN 8.3', () => {
  test('25 saklar dengan nilai bawaan per peran (tahap 4B menambah pos.jual_stok_minus)', async () => {
    assert.equal(await db.featureSwitch.count(), 25)
    for (const p of [owner, admin, kasir]) {
      const s = await muatSaklar(db, p.peran.id)
      for (const def of SAKLAR) {
        const b = def.bawaan[p.peran.code as 'owner' | 'admin' | 'kasir']
        assert.equal(s[def.kode].nyala, b.nyala, `${p.peran.code} ${def.kode}`)
        if (def.satuan) assert.equal(s[def.kode].batas, b.batas, `batas ${p.peran.code} ${def.kode}`)
      }
    }
  })
  test('batas tanggal mundur: Owner tanpa batas, Admin 1 hari; selisih kas 10.000', () => {
    assert.equal(owner.saklar['dok.tanggal_mundur'].batas, null)
    assert.equal(admin.saklar['dok.tanggal_mundur'].batas, 1)
    assert.equal(kasir.saklar['pos.batas_selisih_kas'].batas, 10000)
  })
  test('saklar tersimpan dan dicatat, dan Owner tidak bisa kehilangan log.lihat_semua', async () => {
    const r = await idPeran('admin')
    const nilai = await muatSaklar(db, r)
    nilai['stok.sesuai_tambah'] = { nyala: true, batas: null }
    assert.equal(await simpanSaklarPeran(db, k(owner), owner, r, nilai), 1)
    assert.equal((await muatSaklar(db, r))['stok.sesuai_tambah'].nyala, true)
    const o = await muatSaklar(db, owner.peran.id)
    o['log.lihat_semua'] = { nyala: false, batas: null }
    await assert.rejects(simpanSaklarPeran(db, k(owner), owner, owner.peran.id, o), GalatAturan)
  })
})

describe('pengaman peran dan izin', () => {
  test('Owner tidak bisa mencabut izin pengelolaan pengguna dan peran dari peran Owner', async () => {
    for (const menu of ['atur.pengguna', 'atur.peran']) {
      const m = await matriksSaatIni(owner.peran.id)
      m[menu] = 'L'
      await assert.rejects(simpanIzinPeran(db, k(owner), owner, owner.peran.id, m), (e: unknown) => e instanceof GalatAturan && /Owner harus tetap/.test(e.message))
    }
    // Menu lain milik Owner tetap boleh diubah.
    const m = await matriksSaatIni(owner.peran.id)
    m['b2b.retur'] = 'L'
    assert.equal(await simpanIzinPeran(db, k(owner), owner, owner.peran.id, m), 1)
    m['b2b.retur'] = 'LTUHSP'
    await simpanIzinPeran(db, k(owner), owner, owner.peran.id, m)
  })
  test('peran tanpa izin atur.peran ditolak dengan GalatIzin', async () => {
    const m = await matriksSaatIni(await idPeran('kasir'))
    await assert.rejects(simpanIzinPeran(db, k(admin), admin, await idPeran('kasir'), m), GalatIzin)
    await assert.rejects(tambahPengguna(db, k(kasir), kasir, { name: 'X Y', username: 'xy1', roleId: 3, sandi: '12345678', ulangiSandi: '12345678' }), GalatIzin)
  })
  test('bukan Owner tidak bisa mengubah perannya sendiri, peran Owner, atau memberi izin yang tidak ia punya', async () => {
    // Peran SPV diberi izin atur.peran dan atur.pengguna oleh Owner.
    await tambahPeran(db, k(owner), owner, { code: 'spv', name: 'SPV' })
    const spvId = await idPeran('spv')
    const m = await matriksSaatIni(spvId)
    m['atur.peran'] = 'LTU'
    m['atur.pengguna'] = 'LTU'
    m['stok.saldo'] = 'L'
    await simpanIzinPeran(db, k(owner), owner, spvId, m)
    const spv = await buatAktor(db, 'spv', 'spv1')

    await assert.rejects(simpanIzinPeran(db, k(spv), spv, spvId, { ...m, 'beli.faktur': 'L' }), /peranmu sendiri/)
    await assert.rejects(simpanIzinPeran(db, k(spv), spv, owner.peran.id, await matriksSaatIni(owner.peran.id)), /Hanya Owner/)
    const kasirId = await idPeran('kasir')
    const mk = await matriksSaatIni(kasirId)
    await assert.rejects(simpanIzinPeran(db, k(spv), spv, kasirId, { ...mk, 'beli.faktur': 'L' }), /tidak kamu miliki/)
    assert.equal(await simpanIzinPeran(db, k(spv), spv, kasirId, { ...mk, 'stok.saldo': 'L' }), 1)
    await simpanIzinPeran(db, k(spv), spv, kasirId, mk)

    // SPV tidak bisa memberi peran Owner dan tidak bisa menyalin izin Owner.
    await assert.rejects(tambahPengguna(db, k(spv), spv, { name: 'Calon', username: 'calon1', roleId: owner.peran.id, sandi: '12345678', ulangiSandi: '12345678' }), /Hanya Owner/)
    await assert.rejects(tambahPeran(db, k(spv), spv, { code: 'tiruan', name: 'Tiruan', salinDari: owner.peran.id }), /tidak kamu miliki|tidak bisa kamu salin/)
    await assert.rejects(ubahStatusPengguna(db, k(spv), spv, owner.id, false), /Hanya Owner/)
  })
  test('peran sistem tidak bisa dinonaktifkan; peran tambahan bisa', async () => {
    await assert.rejects(ubahStatusPeran(db, k(owner), owner, await idPeran('kasir'), false), /Peran sistem/)
    const r = await tambahPeran(db, k(owner), owner, { code: 'gudang', name: 'Gudang' })
    const baru = await ubahStatusPeran(db, k(owner), owner, r.id, false)
    assert.equal(baru.active, false)
  })
})

describe('pengaman Owner aktif terakhir dan diri sendiri', () => {
  test('Owner aktif terakhir tidak bisa dinonaktifkan atau diganti perannya', async () => {
    const owner2 = await buatAktor(db, 'owner', 'owner2')
    // Dua Owner aktif: satu boleh dinonaktifkan oleh yang lain.
    await ubahStatusPengguna(db, k(owner), owner, owner2.id, false)
    // Sekarang owner1 satu-satunya; owner2 (nonaktif) tidak bisa menonaktifkan, dan owner1 tidak bisa diturunkan.
    await assert.rejects(ubahPengguna(db, k(owner), owner, owner.id, { name: owner.name, username: owner.username, roleId: await idPeran('admin') }), /peranmu sendiri/)
    const o2 = await muatAktor(db, 'owner2')
    await db.appUser.update({ where: { id: o2.id }, data: { active: true } })
    await ubahPengguna(db, k(o2), o2, owner.id, { name: owner.name, username: owner.username, roleId: await idPeran('admin') })
    // owner2 kini Owner aktif terakhir.
    await assert.rejects(ubahStatusPengguna(db, k(owner), { ...owner, peran: o2.peran, izin: o2.izin }, o2.id, false), /Owner aktif terakhir/)
    await assert.rejects(
      ubahPengguna(db, k(owner), { ...owner, peran: o2.peran, izin: o2.izin }, o2.id, { name: 'owner2', username: 'owner2', roleId: await idPeran('kasir') }),
      /Owner aktif terakhir/,
    )
    // Kembalikan owner1 ke Owner.
    await ubahPengguna(db, k(o2), o2, owner.id, { name: owner.name, username: owner.username, roleId: owner.peran.id })
  })
  test('pengguna tidak bisa menonaktifkan dirinya sendiri', async () => {
    await assert.rejects(ubahStatusPengguna(db, k(owner), owner, owner.id, false), /dirimu sendiri/)
  })
  test('dua penonaktifan Owner bersamaan tidak menghabiskan Owner aktif', async () => {
    const a = await buatAktor(db, 'owner', 'owner_a')
    const jumlahAwal = await db.appUser.count({ where: { roleId: owner.peran.id, active: true } })
    // Nonaktifkan semua Owner lain kecuali dua, lalu keduanya saling menonaktifkan bersamaan.
    const lain = await db.appUser.findMany({ where: { roleId: owner.peran.id, active: true, id: { notIn: [owner.id, a.id] } } })
    for (const u of lain) await ubahStatusPengguna(db, k(owner), owner, u.id, false)
    const hasil = await Promise.allSettled([ubahStatusPengguna(db, k(owner), owner, a.id, false), ubahStatusPengguna(db, k(a), a, owner.id, false)])
    const aktif = await db.appUser.count({ where: { roleId: owner.peran.id, active: true } })
    assert.ok(jumlahAwal >= 2)
    assert.equal(aktif, 1, JSON.stringify(hasil.map((h) => h.status)))
    // Pulihkan.
    await db.appUser.updateMany({ where: { roleId: owner.peran.id }, data: { active: true } })
  })
})
