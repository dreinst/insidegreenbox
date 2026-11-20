// Uji klik modul persediaan tahap 4A: produk, stok, kartu stok, penyesuaian, opname, pindah stok, alasan, lokasi.
// Dijalankan oleh tests/e2e/jalankan.sh sesudah master.mjs, atau langsung: BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/stok.mjs
// Basis data harus sudah berisi seed, seed:contoh, dan impor:stok. Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-stok.json.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import pg from 'pg'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3241'
const DB_URL = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL
const POTRET = new URL('../potret/', import.meta.url).pathname
const HASIL = new URL('../hasil/', import.meta.url).pathname
mkdirSync(POTRET, { recursive: true })
mkdirSync(HASIL, { recursive: true })

const AKUN = {
  owner: { u: process.env.SEED_OWNER_USERNAME, p: process.env.SEED_OWNER_PASSWORD },
  admin: { u: process.env.SEED_ADMIN_USERNAME, p: process.env.SEED_ADMIN_PASSWORD },
  kasir: { u: process.env.SEED_KASIR_USERNAME, p: process.env.SEED_KASIR_PASSWORD },
}
const LEBAR = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]
const ITEM_STOK = ['Produk dan Satuan', 'Stok', 'Penyesuaian', 'Opname', 'Pindah Stok', 'Alasan', 'Lokasi']
const tanda = Date.now().toString(36).slice(-5).toUpperCase()
const KODE = `E2E-${tanda}`

const hasil = []
const cek = (nama, lulus, rincian = '') => {
  hasil.push({ nama, lulus: !!lulus, rincian })
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${rincian ? `  (${rincian})` : ''}`)
}

const sql = new pg.Client({ connectionString: DB_URL })
await sql.connect()
const satu = async (q, v = []) => (await sql.query(q, v)).rows[0]

const browser = await chromium.launch({ headless: true })
const ipAcak = () => `10.${randomInt(1, 250)}.${randomInt(1, 250)}.${randomInt(1, 250)}`

async function konteks(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-forwarded-for': ipAcak() }, locale: 'id-ID' })
  const page = await ctx.newPage()
  const galat = []
  page.on('console', (m) => {
    if (m.type() === 'error') galat.push(m.text())
  })
  page.on('pageerror', (e) => galat.push(String(e)))
  page.on('dialog', (d) => d.accept())
  return { ctx, page, galat }
}

async function masuk(page, akun) {
  await page.goto(`${BASE}/masuk`)
  await page.fill('#k-username', akun.u)
  await page.fill('#k-password', akun.p)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/masuk'), { timeout: 15000 }), page.click('button[type=submit]')])
}

const luapan = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const potret = (page, nama) => page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
const buka = async (page, jalur) => {
  const r = await page.goto(`${BASE}${jalur}`)
  await page.waitForLoadState('networkidle')
  return r
}

// Klik tombol lalu tunggu POST aksi server dan render sesudahnya selesai.
async function kirim(page, pemilih) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 30000 }), page.click(pemilih)])
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

// Kirim formulir yang berisi tombol berteks tertentu.
const tombol = (teks) => `button[type=submit]:text-is("${teks}")`

const saldo = async (produk, kodeLokasi) =>
  Number(
    (
      await satu(
        'select coalesce((select b.qty from stock_balance b join location l on l.id=b.location_id where b.product_id=$1 and l.code=$2), 0)::float8 q',
        [produk, kodeLokasi],
      )
    ).q,
  )
const idLokasi = async (kode) => (await satu('select id from location where code=$1', [kode])).id
const outlet = await idLokasi('OUTLET')
const ho = await idLokasi('HO')
const idDari = (url) => Number(new URL(url).pathname.split('/').filter(Boolean).pop())

// 1. Sidebar per peran: item persediaan tampil sesuai izin dan halaman tiap item terbuka.
for (const { w, h } of LEBAR) {
  for (const peran of ['owner', 'admin', 'kasir']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
    const ada = ITEM_STOK.filter((x) => label.includes(x))
    cek(`${w}px ${peran}: item sidebar persediaan sesuai izin`, peran === 'kasir' ? ada.length === 0 : ada.length === ITEM_STOK.length, ada.join(', ') || 'tidak ada')
    for (const teks of ada) {
      const href = await page.locator(`.samping nav a:text-is("${teks}")`).getAttribute('href')
      const r = await buka(page, href)
      const h1 = await page.textContent('h1')
      const lebih = await luapan(page)
      cek(`${w}px ${peran}: ${teks} terbuka tanpa luapan`, r.status() === 200 && !/Akses ditolak/.test(h1) && lebih <= 1, `status ${r.status()}, h1 "${h1}", lebih ${lebih}px`)
    }
    cek(`${w}px ${peran}: sidebar persediaan tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 2. Akses tanpa izin ditolak (403 dan layar Akses ditolak), tombol tersembunyi sesuai izin.
{
  const kasus = [
    ['kasir', '/produk', 403], ['kasir', '/stok', 403], ['kasir', '/stok/kartu', 403], ['kasir', '/penyesuaian', 403], ['kasir', '/penyesuaian/baru', 403],
    ['kasir', '/opname', 403], ['kasir', '/pindah-stok', 403], ['kasir', '/alasan-stok', 403], ['kasir', '/lokasi', 403],
    ['admin', '/produk/baru', 200], ['admin', '/lokasi/baru', 403], ['admin', '/penyesuaian/baru', 200], ['admin', '/opname/baru', 200], ['admin', '/pindah-stok/baru', 200],
  ]
  for (const peran of ['kasir', 'admin']) {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN[peran])
    for (const [, jalur, status] of kasus.filter((x) => x[0] === peran)) {
      const r = await buka(page, jalur)
      const h1 = await page.textContent('h1')
      cek(`${peran}: ${jalur} berstatus ${status}`, r.status() === status && (status === 200 || h1.includes('Akses ditolak')), `status ${r.status()}, h1 "${h1}"`)
    }
    if (peran === 'kasir') {
      await potret(page, '1440-s-kasir-ditolak')
      const tolak = await satu("select count(*)::int n from audit_log where action='izin.ditolak' and doc_id like '%stok.penyesuaian'")
      cek('kasir: penolakan tercatat di audit', tolak.n >= 1, `${tolak.n} baris`)
    } else {
      await buka(page, '/alasan-stok')
      cek('admin: formulir tambah alasan tersembunyi (hanya Lihat)', (await page.locator('#j-baru').count()) === 0)
      await buka(page, '/lokasi')
      cek('admin: tombol Tambah lokasi tersembunyi', (await page.locator('a:text-is("Tambah lokasi")').count()) === 0)
    }
    await ctx.close()
  }
}

// 3. Alur sungguhan sebagai Owner: produk, penyesuaian, opname, pindah stok, batal dengan gerak balik.
let idProduk
let idPenyesuaian
let idOpname
let idPindah
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)

  // a. Tambah produk, termasuk formulir salah dulu (isian terjaga).
  await buka(page, '/produk/baru')
  await page.fill('#k-code', KODE)
  await page.fill('#k-name', `Produk uji ${tanda}`)
  await page.fill('#k-minStock', 'abc')
  await kirim(page, tombol('Simpan produk'))
  cek('produk: galat qty tampil dan isian terjaga', (await page.locator('.pesan.galat').count()) === 1 && (await page.inputValue('#k-code')) === KODE)
  await page.selectOption('#k-baseUnitId', { label: 'gram (g)' })
  await page.fill('#k-minStock', '100')
  await Promise.all([page.waitForURL(/\/produk\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click(tombol('Simpan produk'))])
  idProduk = idDari(page.url())
  cek('produk: tersimpan lewat formulir', (await satu('select count(*)::int n from product where code=$1', [KODE])).n === 1)
  await page.waitForLoadState('networkidle')
  await page.selectOption('#k-unitId', { label: 'kilogram (kg)' })
  await page.fill('#k-factor', '1000')
  await page.check('#k-isDefault')
  await kirim(page, tombol('Simpan konversi'))
  cek('produk: konversi kg tersimpan', (await satu('select factor_to_base::float8 f from product_unit where product_id=$1', [idProduk]))?.f === 1000)
  await potret(page, '1440-s-alur-produk')

  // b. Penyesuaian tambah: wajib diajukan lalu disetujui dan diposting.
  await buka(page, '/penyesuaian/baru')
  await page.selectOption('#k-locationId', { label: 'Outlet' })
  await page.fill('#k-note', `Uji e2e ${tanda}`)
  await Promise.all([page.waitForURL(/\/penyesuaian\/\d+\?pesan=draf/, { timeout: 30000 }), page.click(tombol('Buat draf'))])
  idPenyesuaian = idDari(page.url())
  await page.waitForLoadState('networkidle')
  await page.selectOption('#k-productId', { label: `Produk uji ${tanda} (g)` })
  await page.selectOption('#k-direction', 'tambah')
  await page.fill('#k-qty', '1.000')
  await page.selectOption('#k-reasonId', { label: 'Koreksi catatan' })
  await page.fill('#k-unitCost', '50')
  await kirim(page, tombol('Tambah baris'))
  cek('penyesuaian: baris tambah tersimpan', (await satu('select count(*)::int n from stock_adjustment_line where stock_adjustment_id=$1', [idPenyesuaian])).n === 1)
  cek('penyesuaian: tombol Posting belum ada karena perlu persetujuan', (await page.locator(tombol('Posting')).count()) === 0)
  await potret(page, '1440-s-alur-penyesuaian-draf')
  await kirim(page, tombol('Ajukan untuk disetujui'))
  cek('penyesuaian: berstatus Diajukan', (await satu('select status from stock_adjustment where id=$1', [idPenyesuaian])).status === 'Diajukan')
  await kirim(page, tombol('Setujui dan posting'))
  cek('penyesuaian: Diposting, stok Outlet 1000', (await satu('select status from stock_adjustment where id=$1', [idPenyesuaian])).status === 'Diposting' && (await saldo(idProduk, 'OUTLET')) === 1000)
  await potret(page, '1440-s-alur-penyesuaian-diposting')

  await buka(page, `/stok?q=${encodeURIComponent(KODE)}&lokasi=${outlet}`)
  const teksPosisi = await page.textContent('table.tabel tbody')
  cek('stok: posisi stok menampilkan 1.000 g dan nilai Rp 50.000', /1\.000 g/.test(teksPosisi) && /Rp\s?50\.000/.test(teksPosisi), teksPosisi.replace(/\s+/g, ' ').slice(0, 160))
  await buka(page, `/stok/kartu?produk=${idProduk}&lokasi=${outlet}`)
  const noPs = (await satu('select no from stock_adjustment where id=$1', [idPenyesuaian])).no
  const tautanPs = page.locator(`table.tabel a:text-is("${noPs}")`)
  cek('kartu stok: baris penyesuaian dengan tautan dokumen', (await tautanPs.count()) === 1)
  await Promise.all([page.waitForURL(new RegExp(`/penyesuaian/${idPenyesuaian}$`), { timeout: 15000 }), tautanPs.click()])
  cek('kartu stok: tautan membuka dokumen asal', (await page.textContent('h1')).includes(noPs))

  // c. Opname: hitung fisik 990, alasan, ajukan, setujui dan posting.
  await buka(page, '/opname/baru')
  await page.selectOption('#k-locationId', { label: 'Outlet' })
  await Promise.all([page.waitForURL(/\/opname\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click(tombol('Buat lembar hitung'))])
  idOpname = idDari(page.url())
  await page.waitForLoadState('networkidle')
  const baris = await satu('select id, system_qty::float8 s from stock_opname_line where stock_opname_id=$1 and product_id=$2', [idOpname, idProduk])
  cek('opname: qty sistem dibekukan 1000', baris?.s === 1000)
  const alasanSelisih = (await satu("select id from stock_reason where name='Selisih hitung'")).id
  await page.fill(`#k-hitung_${baris.id}`, '990')
  await page.selectOption(`#k-alasan_${baris.id}`, String(alasanSelisih))
  await kirim(page, tombol('Simpan hitungan'))
  cek('opname: hitungan tersimpan', (await satu('select counted_qty::float8 c from stock_opname_line where id=$1', [baris.id])).c === 990)
  await potret(page, '1440-s-alur-opname-draf')
  await kirim(page, tombol('Ajukan untuk disetujui'))
  await kirim(page, tombol('Setujui dan posting'))
  cek('opname: Diposting dan selisih -10 jadi gerak stok', (await satu('select status from stock_opname where id=$1', [idOpname])).status === 'Diposting' && (await saldo(idProduk, 'OUTLET')) === 990)
  await potret(page, '1440-s-alur-opname-diposting')

  // d. Pindah stok Outlet ke Head Office 200.
  await buka(page, '/pindah-stok/baru')
  await page.selectOption('#k-fromLocationId', String(outlet))
  await page.selectOption('#k-toLocationId', String(ho))
  await Promise.all([page.waitForURL(/\/pindah-stok\/\d+\?pesan=draf/, { timeout: 30000 }), page.click(tombol('Buat draf'))])
  idPindah = idDari(page.url())
  await page.waitForLoadState('networkidle')
  await page.selectOption('#k-productId', { label: `Produk uji ${tanda} (g)` })
  await page.fill('#k-qty', '200')
  await kirim(page, tombol('Tambah baris'))
  await kirim(page, tombol('Posting'))
  cek('pindah: Diposting, Outlet 790 dan Head Office 200', (await satu('select status from stock_transfer where id=$1', [idPindah])).status === 'Diposting' && (await saldo(idProduk, 'OUTLET')) === 790 && (await saldo(idProduk, 'HO')) === 200)
  const nilaiHo = await satu('select value::int v from stock_balance where product_id=$1 and location_id=$2', [idProduk, ho])
  cek('pindah: nilai ikut harga rata-rata (200 x 50)', nilaiHo.v === 10000, `nilai ${nilaiHo.v}`)
  await potret(page, '1440-s-alur-pindah-diposting')

  // e. Batalkan pindah stok yang sudah Diposting: alasan wajib, stok kembali. Formulirnya dilipat dulu.
  cek('batal: formulir pembatalan terlipat', !(await page.locator(tombol('Batalkan dengan gerak balik')).isVisible()))
  await page.click('summary:text-is("Batalkan dokumen yang sudah Diposting")')
  await kirim(page, tombol('Batalkan dengan gerak balik'))
  cek('batal: tanpa alasan ditolak', (await page.locator('#k-alasan-g').count()) === 1 && (await satu('select status from stock_transfer where id=$1', [idPindah])).status === 'Diposting')
  await page.fill('#k-alasan', 'Barang tidak jadi dikirim')
  await kirim(page, tombol('Batalkan dengan gerak balik'))
  cek('batal: status Batal dan stok kembali (Outlet 990, Head Office 0)', (await satu('select status from stock_transfer where id=$1', [idPindah])).status === 'Batal' && (await saldo(idProduk, 'OUTLET')) === 990 && (await saldo(idProduk, 'HO')) === 0)
  const balik = await satu('select count(*)::int n from stock_ledger where doc_type=$1 and doc_id=$2 and is_reversal', ['stock_transfer', idPindah])
  cek('batal: dua gerak balik tercatat di ledger', balik.n === 2, `${balik.n} baris`)
  await buka(page, `/stok/kartu?produk=${idProduk}`)
  cek('kartu stok: gerak balik tampil', (await page.locator('tr.baris-balik').count()) === 2)
  await potret(page, '1440-s-alur-kartu-stok')

  // f. Jejak Audit memuat semua langkah.
  const harap = [
    ['produk.tambah', 'product'], ['produk.satuan_tambah', 'product_unit'],
    ['penyesuaian.tambah', 'stock_adjustment'], ['penyesuaian.baris_tambah', 'stock_adjustment'], ['penyesuaian.ajukan', 'stock_adjustment'], ['penyesuaian.posting', 'stock_adjustment'],
    ['opname.tambah', 'stock_opname'], ['opname.hitung', 'stock_opname'], ['opname.ajukan', 'stock_opname'], ['opname.posting', 'stock_opname'],
    ['pindah.tambah', 'stock_transfer'], ['pindah.baris_tambah', 'stock_transfer'], ['pindah.posting', 'stock_transfer'], ['pindah.batal', 'stock_transfer'],
  ]
  const kurang = []
  for (const [aksi, jenis] of harap) {
    const n = (await satu('select count(*)::int n from audit_log where action=$1 and doc_type=$2 and actor_name=$3', [aksi, jenis, AKUN.owner.u])).n
    if (n < 1) kurang.push(aksi)
  }
  cek('audit: semua langkah alur tercatat atas nama Owner', kurang.length === 0, kurang.join(', '))
  await buka(page, `/audit?entitas=stock_transfer&dok=${idPindah}`)
  const teksAudit = (await page.textContent('main')).replace(/\s+/g, ' ')
  cek('audit: halaman Jejak Audit menampilkan posting dan batal pindah stok', /Posting pindah stok/.test(teksAudit) && /Batalkan pindah stok/.test(teksAudit), teksAudit.slice(0, 200))
  await potret(page, '1440-s-audit-pindah')
  cek('alur owner: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 4. Admin: penyesuaian kurang langsung Diposting, tidak bisa membatalkan dokumen Diposting.
{
  const { ctx, page, galat } = await konteks(390, 844)
  await masuk(page, AKUN.admin)
  await buka(page, '/penyesuaian/baru')
  await Promise.all([page.waitForURL(/\/penyesuaian\/\d+\?pesan=draf/, { timeout: 30000 }), page.click(tombol('Buat draf'))])
  const id = idDari(page.url())
  await page.waitForLoadState('networkidle')
  const pilihanArah = await page.$$eval('#k-direction option', (o) => o.map((x) => x.value))
  cek('admin: arah hanya kurang (saklar tambah mati)', JSON.stringify(pilihanArah) === '["kurang"]', pilihanArah.join(','))
  await page.selectOption('#k-productId', { label: `Produk uji ${tanda} (g)` })
  await page.fill('#k-qty', '10')
  await page.selectOption('#k-reasonId', { label: 'Rusak' })
  await kirim(page, tombol('Tambah baris'))
  cek('390px admin: halaman draf tanpa luapan', (await luapan(page)) <= 1)
  await potret(page, '390-s-admin-penyesuaian-draf')
  await kirim(page, tombol('Posting'))
  cek('admin: penyesuaian kurang Diposting, stok Outlet 980', (await satu('select status from stock_adjustment where id=$1', [id])).status === 'Diposting' && (await saldo(idProduk, 'OUTLET')) === 980)
  cek('admin: tidak ada tombol batal untuk dokumen Diposting', (await page.locator(tombol('Batalkan dengan gerak balik')).count()) === 0)
  await potret(page, '390-s-admin-penyesuaian-diposting')
  await buka(page, `/opname/${idOpname}`)
  cek('admin: opname Diposting tanpa tombol posting atau batal', (await page.locator('button[type=submit]').count()) === 1)
  cek('390px admin: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 5. Semua halaman baru di dua lebar sebagai Owner: tanpa luapan dan galat konsol, dipotret.
{
  // Draf yang dibiarkan Draft supaya formulirnya ikut dipotret.
  const { ctx: c0, page: p0 } = await konteks(1440, 900)
  await masuk(p0, AKUN.owner)
  await buka(p0, '/opname/baru')
  await Promise.all([p0.waitForURL(/\/opname\/\d+\?pesan=dibuat/, { timeout: 30000 }), p0.click(tombol('Buat lembar hitung'))])
  const idOpnameDraf = idDari(p0.url())
  await buka(p0, '/pindah-stok/baru')
  await Promise.all([p0.waitForURL(/\/pindah-stok\/\d+\?pesan=draf/, { timeout: 30000 }), p0.click(tombol('Buat draf'))])
  const idPindahDraf = idDari(p0.url())
  await c0.close()

  const idKat = (await satu('select id from product_category order by id limit 1')).id
  const idSat = (await satu("select id from unit where name='gram'")).id
  const idAlasan = (await satu("select id from stock_reason where name='Rusak'")).id
  const kopi = (await satu("select id from product where code='BHN-KOPI'")).id
  const BERKAS = [
    ['/produk', 'produk'], ['/produk/baru', 'produk-baru'], [`/produk/${kopi}`, 'produk-rincian'], ['/produk/kategori', 'kategori-produk'], [`/produk/kategori/${idKat}`, 'kategori-produk-rincian'],
    ['/produk/satuan', 'satuan'], [`/produk/satuan/${idSat}`, 'satuan-rincian'],
    ['/stok', 'stok'], ['/stok?bawah=1', 'stok-bawah-minimum'], [`/stok/kartu?produk=${kopi}&lokasi=${outlet}`, 'kartu-stok'],
    ['/penyesuaian', 'penyesuaian'], ['/penyesuaian/baru', 'penyesuaian-baru'], [`/penyesuaian/${idPenyesuaian}`, 'penyesuaian-rincian'],
    ['/opname', 'opname'], ['/opname/baru', 'opname-baru'], [`/opname/${idOpname}`, 'opname-rincian'], [`/opname/${idOpnameDraf}`, 'opname-draf'],
    ['/pindah-stok', 'pindah'], ['/pindah-stok/baru', 'pindah-baru'], [`/pindah-stok/${idPindah}`, 'pindah-rincian'], [`/pindah-stok/${idPindahDraf}`, 'pindah-draf'],
    ['/alasan-stok', 'alasan'], [`/alasan-stok/${idAlasan}`, 'alasan-rincian'],
    ['/lokasi', 'lokasi'], ['/lokasi/baru', 'lokasi-baru'], [`/lokasi/${outlet}`, 'lokasi-rincian'],
  ]
  for (const { w, h } of LEBAR) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN.owner)
    for (const [jalur, nama] of BERKAS) {
      const r = await buka(page, jalur)
      const lebih = await luapan(page)
      await potret(page, `${w}-s-${nama}`)
      cek(`${w}px owner: ${jalur} terbuka tanpa luapan`, r.status() === 200 && lebih <= 1, `status ${r.status()}, lebih ${lebih}px`)
    }
    cek(`${w}px owner: halaman persediaan tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 6. Saldo cocok dengan ledger sesudah semua langkah.
{
  const beda = await satu(`
    with l as (select product_id, location_id, sum(qty) q, sum(value) v from stock_ledger group by 1, 2)
    select count(*)::int n from stock_balance b full join l using (product_id, location_id)
    where coalesce(b.qty, 0) <> coalesce(l.q, 0) or coalesce(b.value, 0) <> coalesce(l.v, 0)`)
  cek('ledger: stock_balance sama dengan jumlah stock_ledger', beda.n === 0, `${beda.n} beda`)
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-stok.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan stok: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
