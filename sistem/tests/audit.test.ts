// Audit trail, login, rate limit, dan sesi (KONTRAK 5 dan 7).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan } from '../src/lib/aksi'
import { catatAudit } from '../src/lib/audit'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { BATAS_GAGAL_IP, BATAS_GAGAL_NAMA, cobaMasuk, keluar, muatPengguna } from '../src/lib/masuk'
import { aturUlangSandi, tambahPengguna, ubahPengguna, ubahStatusPengguna } from '../src/lib/pengguna'
import { simpanIzinPeran } from '../src/lib/peran'
import { MENU_IZIN } from '../src/lib/katalog'
import { muatIzin } from '../src/lib/izin-inti'
import { KONTEKS_UJI, buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
const SANDI = 'sandi-uji-123'
const jumlahAudit = () => db.auditLog.count()
const masuk = (username: string, password: string, ip = '10.0.0.1') => cobaMasuk(db, { username, password, ip, userAgent: 'tes' })

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('audit'))
  owner = await buatAktor(db, 'owner', 'owner1')
})
after(() => hapus())

describe('audit dalam transaksi yang sama', () => {
  test('tambah pengguna menulis satu audit dengan data sesudah, tanpa hash sandi', async () => {
    const awal = await jumlahAudit()
    const u = await tambahPengguna(db, k(owner), owner, { name: 'Budi Kasir', username: 'budi', roleId: 3, sandi: 'rahasia-budi-1', ulangiSandi: 'rahasia-budi-1' })
    assert.equal(await jumlahAudit(), awal + 1)
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'pengguna.tambah', docId: String(u.id) } })
    assert.equal(a.userId, owner.id)
    assert.equal(a.ip, '10.0.0.1')
    assert.equal(a.userAgent, 'tes')
    assert.deepEqual(a.afterJson, { name: 'Budi Kasir', username: 'budi', role: 'kasir', active: true })
    const teks = JSON.stringify(await db.auditLog.findMany())
    assert.ok(!teks.includes(u.passwordHash), 'hash sandi tidak boleh ada di audit')
    assert.ok(!teks.includes('rahasia-budi-1'), 'sandi tidak boleh ada di audit')
  })
  test('ubah pengguna menyimpan sebelum dan sesudah hanya untuk kolom yang berubah', async () => {
    const u = await db.appUser.findUniqueOrThrow({ where: { username: 'budi' } })
    await ubahPengguna(db, k(owner), owner, u.id, { name: 'Budi Santoso', username: 'budi', roleId: 3 })
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'pengguna.ubah', docId: String(u.id) }, orderBy: { id: 'desc' } })
    assert.deepEqual(a.beforeJson, { name: 'Budi Kasir' })
    assert.deepEqual(a.afterJson, { name: 'Budi Santoso' })
  })
  test('simpan yang gagal tidak meninggalkan audit', async () => {
    const awal = await jumlahAudit()
    await assert.rejects(tambahPengguna(db, k(owner), owner, { name: 'Budi Lain', username: 'budi', roleId: 3, sandi: '12345678', ulangiSandi: '12345678' }), GalatAturan)
    await assert.rejects(ubahStatusPengguna(db, k(owner), owner, owner.id, false), GalatAturan)
    const m = Object.fromEntries(MENU_IZIN.map((x) => [x.kode, '']))
    await assert.rejects(simpanIzinPeran(db, k(owner), owner, owner.peran.id, m), GalatAturan)
    assert.equal(await jumlahAudit(), awal)
  })
  test('galat sesudah audit ditulis membatalkan audit dan perubahannya bersama', async () => {
    const awal = await jumlahAudit()
    const u = await db.appUser.findUniqueOrThrow({ where: { username: 'budi' } })
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.appUser.update({ where: { id: u.id }, data: { name: 'Tidak Jadi' } })
        await catatAudit(tx, k(owner), { action: 'pengguna.ubah', docType: 'app_user', docId: u.id, summary: 'uji batal' })
        throw new Error('gagal di tengah')
      }),
      /gagal di tengah/,
    )
    assert.equal(await jumlahAudit(), awal)
    assert.equal((await db.appUser.findUniqueOrThrow({ where: { id: u.id } })).name, 'Budi Santoso')
  })
  test('database menolak UPDATE, DELETE, dan TRUNCATE pada audit_log', async () => {
    await assert.rejects(db.$executeRawUnsafe('UPDATE audit_log SET summary = $1', 'diubah'), /hanya boleh ditambah/)
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM audit_log'), /hanya boleh ditambah/)
    await assert.rejects(db.$executeRawUnsafe('TRUNCATE audit_log'), /hanya boleh ditambah/)
    await assert.rejects(db.auditLog.deleteMany({}), /hanya boleh ditambah/)
  })
  test('izin peran yang diubah tercatat dengan menu yang berubah saja', async () => {
    const kasirId = (await db.role.findUniqueOrThrow({ where: { code: 'kasir' } })).id
    const izin = await muatIzin(db, kasirId)
    const m = Object.fromEntries(MENU_IZIN.map((x) => [x.kode, izin[x.kode] ?? '']))
    m['menu.promo'] = 'L'
    await simpanIzinPeran(db, k(owner), owner, kasirId, m)
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'peran.izin' }, orderBy: { id: 'desc' } })
    assert.deepEqual(a.beforeJson, { 'menu.promo': '' })
    assert.deepEqual(a.afterJson, { 'menu.promo': 'L' })
  })
})

describe('login dan rate limit', () => {
  test('login berhasil membuat sesi, mencatat audit, dan memperbarui masuk terakhir', async () => {
    const h = await masuk('OWNER1 ', SANDI)
    assert.equal(h.ok, true)
    if (!h.ok) return
    const s = await db.userSession.findUniqueOrThrow({ where: { id: h.sesiId } })
    assert.equal(s.userId, owner.id)
    assert.ok(await db.auditLog.findFirst({ where: { action: 'masuk.berhasil', userId: owner.id } }))
    assert.ok((await db.appUser.findUniqueOrThrow({ where: { id: owner.id } })).lastLoginAt)
    assert.ok(await muatPengguna(db, h.sesiId))
  })
  test('login gagal tercatat di audit dan login_attempt, untuk nama dikenal maupun tidak', async () => {
    assert.deepEqual(await masuk('owner1', 'salah'), { ok: false, alasan: 'salah' })
    assert.deepEqual(await masuk('tidakada', 'salah'), { ok: false, alasan: 'salah' })
    const a = await db.auditLog.findMany({ where: { action: 'masuk.gagal' }, orderBy: { id: 'asc' } })
    assert.equal(a.length, 2)
    assert.equal(a[0].userId, owner.id)
    assert.equal(a[1].userId, null)
    assert.equal(a[1].actorName, 'tidakada')
    assert.equal(await db.loginAttempt.count({ where: { success: false } }), 2)
  })
  test(`sesudah ${BATAS_GAGAL_NAMA} kali gagal, nama pengguna terkunci walau sandinya benar`, async () => {
    await buatAktor(db, 'admin', 'admin1')
    for (let i = 0; i < BATAS_GAGAL_NAMA; i++) assert.deepEqual(await masuk('admin1', `salah${i}`, '10.0.0.2'), { ok: false, alasan: 'salah' })
    assert.deepEqual(await masuk('admin1', SANDI, '10.0.0.2'), { ok: false, alasan: 'terkunci' })
    assert.deepEqual(await masuk('admin1', SANDI, '10.0.0.3'), { ok: false, alasan: 'terkunci' }, 'IP lain tetap terkunci untuk nama yang sama')
    assert.ok(await db.auditLog.findFirst({ where: { action: 'masuk.terkunci', actorName: 'admin1' } }))
    // Kunci lepas sesudah jendela 15 menit: geser catatan gagalnya ke masa lalu.
    await db.loginAttempt.updateMany({ where: { username: 'admin1' }, data: { at: new Date(Date.now() - 16 * 60_000) } })
    assert.equal((await masuk('admin1', SANDI, '10.0.0.2')).ok, true)
  })
  test('login berhasil mengosongkan hitungan gagal nama itu', async () => {
    // owner1 sudah punya satu gagal dari tes sebelumnya; login berhasil dulu supaya hitungan mulai dari nol.
    assert.equal((await masuk('owner1', SANDI, '10.0.0.4')).ok, true)
    for (let i = 0; i < BATAS_GAGAL_NAMA - 1; i++) await masuk('owner1', 'salah', '10.0.0.4')
    assert.equal((await masuk('owner1', SANDI, '10.0.0.4')).ok, true)
    for (let i = 0; i < BATAS_GAGAL_NAMA - 1; i++) assert.equal((await masuk('owner1', 'salah', '10.0.0.4')).ok, false)
    assert.equal((await masuk('owner1', SANDI, '10.0.0.4')).ok, true)
  })
  test(`sesudah ${BATAS_GAGAL_IP} kali gagal dari satu IP, IP itu terkunci untuk semua nama`, async () => {
    for (let i = 0; i < BATAS_GAGAL_IP; i++) await masuk(`acak${i}`, 'salah', '10.9.9.9')
    assert.deepEqual(await masuk('owner1', SANDI, '10.9.9.9'), { ok: false, alasan: 'terkunci' })
    assert.equal((await masuk('owner1', SANDI, '10.0.0.5')).ok, true)
  })
  test('akun nonaktif dengan sandi benar ditolak dan tidak menambah hitungan gagal', async () => {
    const u = await buatAktor(db, 'kasir', 'kasir_mati')
    await ubahStatusPengguna(db, k(owner), owner, u.id, false)
    const gagalAwal = await db.loginAttempt.count({ where: { username: 'kasir_mati', success: false } })
    assert.deepEqual(await masuk('kasir_mati', SANDI, '10.0.0.6'), { ok: false, alasan: 'nonaktif' })
    assert.equal(await db.loginAttempt.count({ where: { username: 'kasir_mati', success: false } }), gagalAwal)
  })
})

describe('sesi dicek ke database', () => {
  test('menonaktifkan pengguna langsung mematikan sesinya', async () => {
    const u = await buatAktor(db, 'kasir', 'kasir_sesi')
    const h = await masuk('kasir_sesi', SANDI, '10.0.1.1')
    assert.ok(h.ok)
    if (!h.ok) return
    assert.ok(await muatPengguna(db, h.sesiId))
    await ubahStatusPengguna(db, k(owner), owner, u.id, false)
    assert.equal(await muatPengguna(db, h.sesiId), null)
    const s = await db.userSession.findUniqueOrThrow({ where: { id: h.sesiId } })
    assert.ok(s.revokedAt, 'sesi dicabut di database')
  })
  test('atur ulang sandi mencabut semua sesi pengguna itu', async () => {
    const u = await buatAktor(db, 'kasir', 'kasir_sandi')
    const a = await masuk('kasir_sandi', SANDI, '10.0.1.2')
    const b = await masuk('kasir_sandi', SANDI, '10.0.1.3')
    assert.ok(a.ok && b.ok)
    if (!a.ok || !b.ok) return
    await aturUlangSandi(db, k(owner), owner, u.id, { sandi: 'sandi-baru-123', ulangiSandi: 'sandi-baru-123' })
    assert.equal(await muatPengguna(db, a.sesiId), null)
    assert.equal(await muatPengguna(db, b.sesiId), null)
    assert.equal((await masuk('kasir_sandi', SANDI, '10.0.1.2')).ok, false)
    assert.equal((await masuk('kasir_sandi', 'sandi-baru-123', '10.0.1.2')).ok, true)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'pengguna.sandi', docId: String(u.id) } })
    assert.deepEqual(audit.afterJson, { sandiDiganti: true, sesiDicabut: 2 })
  })
  test('peran yang dinonaktifkan mematikan sesi penggunanya', async () => {
    const r = await db.role.create({ data: { code: 'tamu', name: 'Tamu' } })
    const u = await buatAktor(db, 'tamu', 'tamu1')
    const sesi = await db.userSession.create({ data: { id: 'sesi-tamu', userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } })
    assert.ok(await muatPengguna(db, sesi.id))
    await db.role.update({ where: { id: r.id }, data: { active: false } })
    assert.equal(await muatPengguna(db, sesi.id), null)
  })
  test('sesi kedaluwarsa ditolak', async () => {
    await db.userSession.create({ data: { id: 'sesi-lama', userId: owner.id, expiresAt: new Date(Date.now() - 1000) } })
    assert.equal(await muatPengguna(db, 'sesi-lama'), null)
  })
  test('keluar mencabut sesi dan mencatat audit', async () => {
    const h = await masuk('owner1', SANDI, '10.0.1.4')
    assert.ok(h.ok, JSON.stringify(h))
    if (!h.ok) return
    const p = (await muatPengguna(db, h.sesiId))!
    await keluar(db, p, { ...KONTEKS_UJI, userId: p.id, actorName: p.username })
    assert.equal(await muatPengguna(db, h.sesiId), null)
    assert.ok(await db.auditLog.findFirst({ where: { action: 'keluar', userId: owner.id } }))
  })
})
