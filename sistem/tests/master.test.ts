// Modul master tahap 3A: validasi harga dan WA, impor idempoten, aturan bisnis, izin, dan audit.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { DRINKS, FOODS } from '../../src/data'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import { tentukanFoto } from '../src/lib/foto'
import { bangunDataImpor, imporMenu, isiMetodeBayar } from '../src/lib/impor-menu'
import type { Pengguna } from '../src/lib/izin-inti'
import { bacaRupiah, skemaUang } from '../src/lib/master'
import { formatWa, normalisasiWa, tambahMember, tambahTingkat, ubahMember, ubahStatusTingkat, ubahTingkat } from '../src/lib/member'
import { ubahStatusMetode, tambahMetode, ubahMetode } from '../src/lib/metode-bayar'
import { hitungHargaBaru, rencanaHarga, riwayatHarga, tambahKategori, tambahMenu, tambahPaket, terapkanHargaMassal, ubahKategori, ubahMenu, ubahStatusKategori, ubahStatusMenu, ubahStatusPaket } from '../src/lib/menu'
import { statusPromo, tambahPromo, ubahPromo } from '../src/lib/promo'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
const TANPA_FOTO = { pilihan: '', berkas: null }

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('master'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
})
after(() => hapus())

const jumlahAudit = (action?: string) => db.auditLog.count({ where: action ? { action } : {} })
const galat = async (f: () => Promise<unknown>, kolom?: string, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (kolom) assert.equal(e.kolom, kolom)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}

describe('validasi harga dan nomor WA', () => {
  test('bacaRupiah menerima rupiah bulat dan menolak pecahan', () => {
    assert.equal(bacaRupiah('38000'), 38000n)
    assert.equal(bacaRupiah('38.000'), 38000n)
    assert.equal(bacaRupiah('Rp 1.250.000'), 1250000n)
    assert.equal(bacaRupiah('38,5'), null)
    assert.equal(bacaRupiah('38.50'), null)
    assert.equal(bacaRupiah('abc'), null)
    assert.equal(bacaRupiah('-5'), null)
  })
  test('skemaUang menolak kosong, nol, dan terlalu besar', () => {
    const s = skemaUang({ label: 'Harga' })
    assert.equal(s.safeParse('').success, false)
    assert.equal(s.safeParse('0').success, false)
    assert.equal(s.safeParse('10000001').success, false)
    assert.equal(s.parse('35.500'), 35500n)
  })
  test('normalisasiWa menyeragamkan ke format 62', () => {
    for (const x of ['0812-3456-7890', '+62 812 3456 7890', '6281234567890', '81234567890', '(0812) 3456 7890']) assert.equal(normalisasiWa(x), '6281234567890', x)
    for (const x of ['', '12345', '0212345678', '08123', 'abc', '62812345']) assert.equal(normalisasiWa(x), null, x)
    assert.equal(formatWa('6281234567890'), '+62 812-3456-7890')
  })
  test('hitungHargaBaru membulatkan ke terdekat', () => {
    assert.equal(hitungHargaBaru(38000n, 'persen', 500n, 500n), 40000n) // naik 5% = 39.900 jadi 40.000
    assert.equal(hitungHargaBaru(35500n, 'persen', -1000n, 500n), 32000n) // turun 10% = 31.950 jadi 32.000
    assert.equal(hitungHargaBaru(28000n, 'nominal', 2000n, 1n), 30000n)
    assert.equal(hitungHargaBaru(1000n, 'nominal', -2000n, 500n) <= 0n, true)
  })
})

describe('impor menu', () => {
  test('impor mengisi data dan aman diulang', async () => {
    const data = bangunDataImpor(DRINKS, FOODS)
    const total = [...DRINKS, ...FOODS].reduce((n, g) => n + g.items.length, 0)
    const a = await imporMenu(db, data)
    assert.equal(a.kategori.baru, 10)
    assert.equal(a.menu.baru, total)
    assert.equal(a.tingkat.baru, 3)
    assert.equal(a.paket.baru, 3)
    assert.equal(a.metode.baru, 4)
    const audit = await jumlahAudit('impor.menu')
    const b = await imporMenu(db, data)
    assert.deepEqual(Object.values(b).map((x) => x.baru), [0, 0, 0, 0, 0])
    assert.equal(await db.menuItem.count(), total)
    assert.equal(await jumlahAudit('impor.menu'), audit, 'impor tanpa perubahan tidak menulis audit')
    assert.equal((await db.menuItem.findFirstOrThrow({ where: { name: 'Pad Kra Pao' } })).price, 35500n)
    assert.equal((await db.menuItem.findFirstOrThrow({ where: { name: 'Easy-Nasgor' } })).kcal, 640)
    assert.equal((await db.menuSet.findFirstOrThrow({ where: { name: 'Salad Pan-seared Chicken' }, include: { mainItem: true } })).mainItem.name, 'Salad With Pan-seared Chicken')
  })
  test('impor tidak menimpa perubahan Owner', async () => {
    const m = await db.menuItem.findFirstOrThrow({ where: { name: 'Latte' } })
    await ubahMenu(db, k(owner), owner, m.id, { name: 'Latte', category: m.category, price: '34000', description: '', kcal: '', featured: 'on' }, { pilihan: 'p-latte', berkas: null })
    await imporMenu(db, bangunDataImpor(DRINKS, FOODS))
    assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: m.id } })).price, 34000n)
  })
  test('semua foto yang dirujuk impor ada di public/img situs', async () => {
    for (const m of bangunDataImpor(DRINKS, FOODS).menu.filter((x) => x.image)) {
      assert.ok(existsSync(path.resolve(process.cwd(), '../public/img', `${m.image}.webp`)), `foto ${m.image} untuk ${m.name}`)
    }
  })
  test('seed metode bayar idempoten', async () => {
    assert.deepEqual(await isiMetodeBayar(db), { baru: 0, dilewati: 4 })
  })
})

describe('menu dan kategori', () => {
  test('tambah menu menulis audit dan menolak harga salah dengan galat per kolom', async () => {
    const kat = await db.menuCategory.findFirstOrThrow({ where: { code: 'espresso' } })
    const awal = await jumlahAudit()
    const m = await tambahMenu(db, k(owner), owner, { name: 'Kopi Uji', category: kat.code, price: '31.500', description: 'Uji', kcal: '12', featured: 'on' }, TANPA_FOTO)
    assert.equal(m.price, 31500n)
    assert.equal(m.featured, true)
    assert.equal(await jumlahAudit(), awal + 1)
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'menu.tambah', docId: String(m.id) } })
    assert.equal(a.userId, owner.id)
    for (const harga of ['', '0', 'abc', '12,5', '-100']) {
      await assert.rejects(() => tambahMenu(db, k(owner), owner, { name: `Salah ${harga}`, category: kat.code, price: harga }, TANPA_FOTO), (e: unknown) => {
        const z = e as { issues?: { path: string[] }[] }
        assert.equal(z.issues?.[0].path[0], 'price', `harga "${harga}"`)
        return true
      })
    }
    assert.equal(await jumlahAudit(), awal + 1, 'penolakan tidak menulis audit')
  })
  test('nama menu unik tanpa peduli huruf besar dan kategori harus aktif', async () => {
    await galat(() => tambahMenu(db, k(owner), owner, { name: 'kopi uji', category: 'espresso', price: '30000' }, TANPA_FOTO), 'name')
    await galat(() => tambahMenu(db, k(owner), owner, { name: 'Tanpa Kategori', category: 'tidak-ada', price: '30000' }, TANPA_FOTO), 'category')
  })
  test('ubah harga menulis riwayat harga dan audit sebelum/sesudah', async () => {
    const m = await db.menuItem.findFirstOrThrow({ where: { name: 'Kopi Uji' } })
    const r = await ubahMenu(db, k(admin), admin, m.id, { name: 'Kopi Uji', category: m.category, price: '33000', description: 'Uji', kcal: '12', featured: 'on' }, TANPA_FOTO)
    assert.equal(r.berubah, 1)
    const h = await db.menuPriceHistory.findFirstOrThrow({ where: { menuItemId: m.id } })
    assert.equal(h.oldPrice, 31500n)
    assert.equal(h.newPrice, 33000n)
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'menu.ubah', docId: String(m.id) } })
    assert.deepEqual(a.beforeJson, { price: '31500' })
  })
  test('foto di luar daftar ditolak', async () => {
    await galat(() => tentukanFoto({ pilihan: '../../etc/passwd', berkas: null }, null), 'foto')
    await galat(() => tentukanFoto({ pilihan: 'tidak-ada-foto', berkas: null }, null), 'foto')
    const ok = await tentukanFoto({ pilihan: 'p-latte', berkas: null }, null)
    assert.equal(ok.image, 'p-latte')
  })
  test('berkas unggahan yang bukan gambar ditolak', async () => {
    const palsu = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])], 'x.webp', { type: 'image/webp' })
    await galat(() => tentukanFoto({ pilihan: '', berkas: palsu }, null), 'fotoUnggah', /WebP, PNG, atau JPG/)
    const besar = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'besar.png')
    await galat(() => tentukanFoto({ pilihan: '', berkas: besar }, null), 'fotoUnggah', /2 MB/)
  })
  test('kategori dengan menu aktif tidak bisa dinonaktifkan, menu nonaktif membuka jalan', async () => {
    const t = await tambahKategori(db, k(owner), owner, { name: 'Musiman Uji', sort: '' })
    assert.equal(t.code, 'musiman-uji')
    await galat(() => tambahKategori(db, k(owner), owner, { name: 'musiman uji' }), 'name')
    const m = await tambahMenu(db, k(owner), owner, { name: 'Menu Musiman', category: t.code, price: '20000' }, TANPA_FOTO)
    await galat(() => ubahStatusKategori(db, k(owner), owner, t.id, false), undefined, /masih punya 1 menu aktif/)
    await ubahStatusMenu(db, k(owner), owner, m.id, false)
    await ubahStatusKategori(db, k(owner), owner, t.id, false)
    await galat(() => ubahStatusMenu(db, k(owner), owner, m.id, true), undefined, /nonaktif/)
    await galat(() => tambahMenu(db, k(owner), owner, { name: 'Menu Lain', category: t.code, price: '20000' }, TANPA_FOTO), 'category')
    const r = await ubahKategori(db, k(owner), owner, t.id, { name: 'Musiman Baru', sort: '5' })
    assert.equal(r.berubah, 2)
  })
})

describe('ubah harga massal', () => {
  test('pratinjau dan penerapan memakai aturan yang sama, tercatat di riwayat dan audit', async () => {
    const aturan = { kategori: 'espresso', mode: 'persen', arah: 'naik', nilai: '10', bulat: '500' }
    const rencana = await rencanaHarga(db, aturan)
    assert.ok(rencana.baris.length >= 9)
    const sebelum = new Map((await db.menuItem.findMany({ where: { category: 'espresso', active: true } })).map((m) => [m.id, m.price]))
    const auditAwal = await jumlahAudit('harga.massal')
    const r = await terapkanHargaMassal(db, k(owner), owner, { ...aturan, label: 'Uji kenaikan bahan' })
    assert.equal(r.jumlah, rencana.baris.filter((b) => b.baru !== b.lama).length)
    assert.equal(await jumlahAudit('harga.massal'), auditAwal + 1)
    for (const b of rencana.baris) assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: b.id } })).price, b.baru, b.name)
    const batch = await db.menuPriceBatch.findFirstOrThrow({ where: { label: 'Uji kenaikan bahan' }, include: { rows: true } })
    assert.equal(batch.rows.length, r.jumlah)
    for (const row of batch.rows) assert.equal(row.oldPrice, sebelum.get(row.menuItemId))
    const rw = await riwayatHarga(db, '1')
    assert.ok(rw.baris.length >= 2, 'riwayat memuat perubahan satuan dan massal')
    assert.equal(rw.baris[0].label, 'Uji kenaikan bahan')
  })
  test('aturan yang membuat harga nol atau tanpa perubahan ditolak, dan tidak ada yang berubah', async () => {
    const awal = await jumlahAudit()
    await galat(() => terapkanHargaMassal(db, k(owner), owner, { kategori: '', mode: 'nominal', arah: 'turun', nilai: '50000', bulat: '1', label: 'Terlalu besar' }), 'nilai', /nol atau kurang/)
    await galat(() => rencanaHarga(db, { kategori: '', mode: 'persen', arah: 'turun', nilai: '100', bulat: '500' }), 'nilai')
    await galat(() => rencanaHarga(db, { kategori: '', mode: 'persen', arah: 'naik', nilai: 'abc', bulat: '500' }), 'nilai')
    await galat(() => rencanaHarga(db, { kategori: 'tidak-ada', mode: 'persen', arah: 'naik', nilai: '5', bulat: '500' }), 'kategori')
    await assert.rejects(() => terapkanHargaMassal(db, k(owner), owner, { kategori: '', mode: 'persen', arah: 'naik', nilai: '5', bulat: '500', label: 'x' }), (e: unknown) => (e as { issues?: unknown[] }).issues !== undefined)
    assert.equal(await jumlahAudit(), awal)
  })
})

describe('paket set', () => {
  test('harga paket harus lebih murah dari harga normal dan menu tidak boleh sama', async () => {
    const nasgor = await db.menuItem.findFirstOrThrow({ where: { name: 'Easy-Nasgor' } })
    const teh = await db.menuItem.findFirstOrThrow({ where: { name: 'Iced Shaken Honey Lemon Tea' } })
    const dasar = { name: 'Paket Uji', mainItemId: String(nasgor.id), drinkItemId: String(teh.id), normalPrice: '', price: '40000' }
    await galat(() => tambahPaket(db, k(owner), owner, { ...dasar, price: '99000' }, TANPA_FOTO), 'price')
    await galat(() => tambahPaket(db, k(owner), owner, { ...dasar, drinkItemId: String(nasgor.id) }, TANPA_FOTO), 'drinkItemId')
    await galat(() => tambahPaket(db, k(owner), owner, { ...dasar, name: 'easy-nasgor' }, TANPA_FOTO), 'name')
    const p = await tambahPaket(db, k(owner), owner, dasar, TANPA_FOTO)
    assert.equal(p.normalPrice, nasgor.price + teh.price, 'harga normal kosong diisi jumlah harga menu')
    await galat(() => ubahStatusMenu(db, k(owner), owner, nasgor.id, false), undefined, /dipakai paket set aktif/)
    await ubahStatusPaket(db, k(owner), owner, p.id, false)
  })
})

describe('promo', () => {
  test('validasi jenis, nilai, dan masa berlaku', async () => {
    const dasar = { name: 'Promo Uji', kind: 'persen', percent: '10', amount: '', giftItemId: '', condition: '', minSpend: '', startsOn: '', endsOn: '' }
    await galat(() => tambahPromo(db, k(owner), owner, { ...dasar, percent: '' }), 'percent')
    await galat(() => tambahPromo(db, k(owner), owner, { ...dasar, percent: '150' }), 'percent')
    await galat(() => tambahPromo(db, k(owner), owner, { ...dasar, kind: 'nominal', amount: '0' }), 'amount')
    await galat(() => tambahPromo(db, k(owner), owner, { ...dasar, kind: 'hadiah' }), 'giftItemId')
    await assert.rejects(() => tambahPromo(db, k(owner), owner, { ...dasar, startsOn: '2026-12-10', endsOn: '2026-12-01' }), (e: unknown) => (e as { issues?: { path: string[] }[] }).issues?.[0].path[0] === 'endsOn')
    await assert.rejects(() => tambahPromo(db, k(owner), owner, { ...dasar, startsOn: '2026-02-31' }), (e: unknown) => (e as { issues?: { path: string[] }[] }).issues?.[0].path[0] === 'startsOn')
    const x = await tambahPromo(db, k(owner), owner, { ...dasar, percent: '7,5', minSpend: '50.000', startsOn: '2026-11-01', endsOn: '2026-11-30' })
    assert.equal(x.percent?.toString(), '7.5')
    assert.equal(x.minSpend, 50000n)
    await galat(() => tambahPromo(db, k(owner), owner, dasar), 'name')
    const g = await db.menuItem.findFirstOrThrow({ where: { name: 'Soft-Panna' } })
    const h = await tambahPromo(db, k(owner), owner, { ...dasar, name: 'Hadiah Uji', kind: 'hadiah', percent: '', giftItemId: String(g.id) })
    assert.equal(h.percent, null)
    assert.equal(h.giftItemId, g.id)
    await ubahPromo(db, k(owner), owner, h.id, { ...dasar, name: 'Hadiah Uji', kind: 'nominal', percent: '', amount: '5000', giftItemId: '' })
    assert.equal((await db.promo.findUniqueOrThrow({ where: { id: h.id } })).giftItemId, null, 'ganti jenis membersihkan nilai jenis lama')
  })
  test('status mengikuti tanggal', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`)
    const sekarang = new Date('2026-11-20T03:00:00Z')
    assert.equal(statusPromo({ active: true, startsOn: null, endsOn: null }, sekarang), 'berlaku')
    assert.equal(statusPromo({ active: true, startsOn: d('2026-11-21'), endsOn: null }, sekarang), 'belum')
    assert.equal(statusPromo({ active: true, startsOn: null, endsOn: d('2026-11-19') }, sekarang), 'berakhir')
    assert.equal(statusPromo({ active: true, startsOn: null, endsOn: d('2026-11-20') }, sekarang), 'berlaku')
    assert.equal(statusPromo({ active: false, startsOn: null, endsOn: null }, sekarang), 'nonaktif')
  })
})

describe('metode bayar', () => {
  test('aturan MDR, nama unik, dan minimal satu metode aktif', async () => {
    await galat(() => tambahMetode(db, k(owner), owner, { name: 'Tunai Dua', kind: 'tunai', mdrPct: '1', effectiveFrom: '2026-10-01' }), 'mdrPct')
    await assert.rejects(() => tambahMetode(db, k(owner), owner, { name: 'Dompet', kind: 'ewallet', mdrPct: '1', effectiveFrom: '2026-10-01' }))
    await assert.rejects(() => tambahMetode(db, k(owner), owner, { name: 'Dompet', kind: 'qris', mdrPct: '25', effectiveFrom: '2026-10-01' }))
    await galat(() => tambahMetode(db, k(owner), owner, { name: 'qris', kind: 'qris', mdrPct: '0,7', effectiveFrom: '2026-10-01' }), 'name')
    await assert.rejects(() => tambahMetode(db, k(owner), owner, { name: 'Dompet', kind: 'qris', mdrPct: '1' }), 'tanggal mulai berlaku wajib')
    const m = await tambahMetode(db, k(owner), owner, { name: 'Dompet Digital', kind: 'lainnya', mdrPct: '1,25', freeLimit: '', effectiveFrom: '2026-10-01', openDrawer: 'on' })
    assert.equal(m.openDrawer, true)
    const t = await db.paymentMethodMdr.findMany({ where: { paymentMethodId: m.id } })
    assert.deepEqual(t.map((x) => [x.mdrPct.toString(), x.freeLimit, x.effectiveFrom.toISOString().slice(0, 10)]), [['1.25', null, '2026-10-01']])
    // tahap 6C: ubah metode tidak lagi mengubah MDR; isian mdrPct diabaikan.
    await ubahMetode(db, k(admin), admin, m.id, { name: 'Dompet Digital', kind: 'lainnya', mdrPct: '1,5' })
    assert.equal(await db.paymentMethodMdr.count({ where: { paymentMethodId: m.id } }), 1)
    const semua = await db.paymentMethod.findMany({ where: { active: true } })
    for (const x of semua.slice(0, -1)) await ubahStatusMetode(db, k(owner), owner, x.id, false)
    await galat(() => ubahStatusMetode(db, k(owner), owner, semua.at(-1)!.id, false), undefined, /satu-satunya/)
    for (const x of semua.slice(0, -1)) await ubahStatusMetode(db, k(owner), owner, x.id, true)
  })
})

describe('member dan tingkat', () => {
  test('nomor WA dinormalisasi dan unik walau ditulis berbeda', async () => {
    const m = await tambahMember(db, k(kasir), kasir, { name: 'Budi Uji', wa: '0812-9999-0001', visits: '', discountOn: 'on', note: '' })
    assert.equal(m.wa, '6281299990001')
    await galat(() => tambahMember(db, k(kasir), kasir, { name: 'Budi Dua', wa: '+62 812 9999 0001' }), 'wa', /Budi Uji/)
    await galat(() => tambahMember(db, k(kasir), kasir, { name: 'Salah', wa: '12345' }), 'wa')
    assert.equal((await db.member.findUniqueOrThrow({ where: { id: m.id }, include: { tier: true } })).tier?.name, 'Guest Key')
  })
  test('tingkat mengikuti kunjungan dan dihitung ulang saat tingkat berubah', async () => {
    const m = await db.member.findFirstOrThrow({ where: { name: 'Budi Uji' } })
    await ubahMember(db, k(admin), admin, m.id, { name: 'Budi Uji', wa: '081299990001', visits: '12', discountOn: 'on', note: '' })
    const tier = async () => (await db.member.findUniqueOrThrow({ where: { id: m.id }, include: { tier: true } })).tier?.name
    assert.equal(await tier(), 'House Key')
    const house = await db.memberTier.findFirstOrThrow({ where: { name: 'House Key' } })
    await ubahTingkat(db, k(owner), owner, house.id, { name: 'House Key', minVisits: '15', discountPct: '10', perk: '' })
    assert.equal(await tier(), 'Guest Key')
    await ubahTingkat(db, k(owner), owner, house.id, { name: 'House Key', minVisits: '10', discountPct: '10', perk: '' })
    assert.equal(await tier(), 'House Key')
    await ubahStatusTingkat(db, k(owner), owner, house.id, false)
    assert.equal(await tier(), 'Guest Key')
    await ubahStatusTingkat(db, k(owner), owner, house.id, true)
  })
  test('tingkat tidak boleh bernama atau bersyarat sama', async () => {
    await galat(() => tambahTingkat(db, k(owner), owner, { name: 'guest key', minVisits: '3', discountPct: '5', perk: '' }), 'name')
    await galat(() => tambahTingkat(db, k(owner), owner, { name: 'Tamu Baru', minVisits: '10', discountPct: '5', perk: '' }), 'minVisits')
    await assert.rejects(() => tambahTingkat(db, k(owner), owner, { name: 'Salah', minVisits: '3', discountPct: '101', perk: '' }))
  })
})

describe('izin dan audit', () => {
  test('aksi tanpa izin ditolak dan tidak menyentuh data', async () => {
    const awal = await jumlahAudit()
    await assert.rejects(() => tambahMenu(db, k(kasir), kasir, { name: 'Ilegal', category: 'espresso', price: '1000' }, TANPA_FOTO), GalatIzin)
    await assert.rejects(() => tambahMenu(db, k(admin), admin, { name: 'Ilegal', category: 'espresso', price: '1000' }, TANPA_FOTO), GalatIzin, 'Admin tidak boleh menambah menu')
    await assert.rejects(() => terapkanHargaMassal(db, k(kasir), kasir, { kategori: '', mode: 'persen', arah: 'naik', nilai: '5', bulat: '500', label: 'Ilegal' }), GalatIzin)
    await assert.rejects(() => tambahPromo(db, k(admin), admin, { name: 'Ilegal', kind: 'persen', percent: '5' }), GalatIzin, 'Admin hanya melihat promo')
    await assert.rejects(() => tambahMetode(db, k(admin), admin, { name: 'Ilegal', kind: 'qris', mdrPct: '0', effectiveFrom: '2026-10-01' }), GalatIzin, 'Admin tidak menambah metode bayar')
    await assert.rejects(() => tambahTingkat(db, k(kasir), kasir, { name: 'Ilegal', minVisits: '99', discountPct: '50', perk: '' }), GalatIzin, 'Kasir tidak mengatur tingkat')
    await assert.rejects(() => ubahStatusTingkat(db, k(kasir), kasir, 1, false), GalatIzin)
    await assert.rejects(() => ubahMember(db, k(kasir), kasir, 1, { name: 'x', wa: '081200000000' }), GalatIzin, 'Kasir menambah tapi tidak mengubah member')
    assert.equal(await jumlahAudit(), awal)
    assert.equal(await db.menuItem.count({ where: { name: 'Ilegal' } }), 0)
  })
  test('kegagalan di tengah transaksi membatalkan audit dan data', async () => {
    const awal = await jumlahAudit()
    const harga = (await db.menuItem.findFirstOrThrow({ where: { name: 'Kopi Uji' } })).price
    await galat(() => terapkanHargaMassal(db, k(owner), owner, { kategori: '', mode: 'nominal', arah: 'turun', nilai: '34.000', bulat: '1', label: 'Gagal di tengah' }), 'nilai')
    assert.equal(await jumlahAudit(), awal)
    assert.equal((await db.menuItem.findFirstOrThrow({ where: { name: 'Kopi Uji' } })).price, harga)
    assert.equal(await db.menuPriceBatch.count({ where: { label: 'Gagal di tengah' } }), 0)
  })
})
