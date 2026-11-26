// Uji klik modul master tahap 3A (menu, kategori, paket, harga massal, promo, metode bayar, member, tingkat).
// Dijalankan sesudah klik.mjs oleh tests/e2e/jalankan.sh, atau langsung: BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/master.mjs
// Basis data harus sudah berisi seed, seed:contoh, dan impor:menu. Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-master.json.
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
const tanda = Date.now().toString(36)
// PNG 1x1 yang sah, untuk uji unggah foto.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const hasil = []
const cek = (nama, lulus, rincian = '') => {
  hasil.push({ nama, lulus: !!lulus, rincian })
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${rincian ? `  (${rincian})` : ''}`)
}

const sql = new pg.Client({ connectionString: DB_URL })
await sql.connect()
const satu = async (q, v = []) => (await sql.query(q, v)).rows[0]
const semua = async (q, v = []) => (await sql.query(q, v)).rows

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

// Klik tombol kirim lalu tunggu POST aksi server dan render sesudahnya selesai.
async function kirim(page, pemilih) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 30000 }), page.click(pemilih)])
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

const buka = async (page, jalur) => {
  const r = await page.goto(`${BASE}${jalur}`)
  await page.waitForLoadState('networkidle')
  return r
}

// Id contoh dari database untuk halaman rincian.
const id = async (q) => (await satu(q)).id
const idMenu = await id("select id from menu_item where name='Latte'")
const idKategori = await id("select id from menu_category where code='espresso'")
const idPaket = await id('select id from menu_set order by id limit 1')
const idMetode = await id("select id from payment_method where name='QRIS'")
const idMember = await id('select id from member order by id limit 1')
const idTingkat = await id("select id from member_tier where name='House Key'")

// 1. Semua halaman modul terbuka di dua lebar sebagai Owner: tanpa luapan, tanpa galat konsol, dipotret.
const BERKAS = [
  ['/menu', 'menu'], ['/menu/baru', 'menu-baru'], [`/menu/${idMenu}`, 'menu-rincian'], ['/menu/kategori', 'kategori'], [`/menu/kategori/${idKategori}`, 'kategori-rincian'],
  ['/menu/paket', 'paket'], ['/menu/paket/baru', 'paket-baru'], [`/menu/paket/${idPaket}`, 'paket-rincian'], ['/menu/harga', 'harga'], ['/menu/riwayat', 'riwayat'],
  ['/promo', 'promo'], ['/promo/baru', 'promo-baru'],
  ['/metode-bayar', 'metode'], ['/metode-bayar/baru', 'metode-baru'], [`/metode-bayar/${idMetode}`, 'metode-rincian'],
  ['/member', 'member'], ['/member/baru', 'member-baru'], [`/member/${idMember}`, 'member-rincian'], ['/member/tingkat', 'tingkat'], ['/member/tingkat/baru', 'tingkat-baru'], [`/member/tingkat/${idTingkat}`, 'tingkat-rincian'],
]
for (const { w, h } of LEBAR) {
  const { ctx, page, galat } = await konteks(w, h)
  await masuk(page, AKUN.owner)
  for (const [jalur, nama] of BERKAS) {
    const r = await buka(page, jalur)
    const lebih = await luapan(page)
    await potret(page, `${w}-m-${nama}`)
    cek(`${w}px owner: ${jalur} terbuka`, r.status() === 200, `status ${r.status()}`)
    cek(`${w}px owner: ${jalur} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
  }
  cek(`${w}px owner: halaman master tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 2. Izin per peran: halaman yang boleh terbuka, yang ditolak (403), dan tombol yang tersembunyi.
{
  const kasus = [
    ['admin', '/menu', 200], ['admin', `/menu/${idMenu}`, 200], ['admin', '/menu/harga', 200], ['admin', '/menu/baru', 403], ['admin', '/promo', 200], ['admin', '/promo/baru', 403],
    ['admin', '/metode-bayar', 200], ['admin', `/metode-bayar/${idMetode}`, 200], ['admin', '/metode-bayar/baru', 403], ['admin', '/member/baru', 200], ['admin', '/member/tingkat', 200],
    ['kasir', '/menu', 200], ['kasir', `/menu/${idMenu}`, 200], ['kasir', '/menu/riwayat', 200], ['kasir', '/menu/harga', 403], ['kasir', '/menu/baru', 403], ['kasir', '/menu/kategori', 200],
    ['kasir', '/promo', 403], ['kasir', '/metode-bayar', 403], ['kasir', '/member', 200], ['kasir', '/member/baru', 200], ['kasir', `/member/${idMember}`, 200], ['kasir', '/member/tingkat/baru', 403], ['kasir', '/member/tingkat', 200],
  ]
  for (const peran of ['admin', 'kasir']) {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN[peran])
    for (const [, jalur, status] of kasus.filter((x) => x[0] === peran)) {
      const r = await buka(page, jalur)
      const h1 = await page.textContent('h1')
      cek(`${peran}: ${jalur} berstatus ${status}`, r.status() === status && (status === 200 || h1.includes('Akses ditolak')), `status ${r.status()}, h1 "${h1}"`)
    }
    if (peran === 'admin') {
      await buka(page, `/menu/${idMenu}`)
      cek('admin: form ubah menu ada, tombol nonaktif ada', (await page.locator('#k-price').count()) === 1 && (await page.locator('button:text-is("Nonaktifkan menu")').count()) === 1)
      await buka(page, '/menu')
      cek('admin: tombol Tambah menu tersembunyi', (await page.locator('a:text-is("Tambah menu")').count()) === 0)
      await potret(page, '1440-admin-menu')
      await buka(page, '/promo')
      await potret(page, '1440-admin-promo')
    } else {
      await buka(page, `/menu/${idMenu}`)
      cek('kasir: rincian menu hanya bisa dibaca', (await page.locator('#k-price').count()) === 0 && (await page.locator('.rincian').count()) >= 1)
      await potret(page, '1440-kasir-menu-rincian')
      await buka(page, '/member')
      cek('kasir: tombol Tambah member ada', (await page.locator('a:text-is("Tambah member")').count()) === 1)
      await buka(page, `/member/${idMember}`)
      cek('kasir: rincian member hanya bisa dibaca', (await page.locator('#k-wa').count()) === 0)
      await potret(page, '1440-kasir-member-rincian')
    }
    await ctx.close()
  }
}

// 3. Alur formulir sungguhan sebagai Owner di 1440 px.
const namaKategori = `Uji ${tanda}`
const namaMenu = `Menu Uji ${tanda}`
let menuId
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)

  // Kategori
  await buka(page, '/menu/kategori')
  await page.fill('#k-name', namaKategori)
  await kirim(page, 'button:text-is("Simpan kategori")')
  const kat = await satu('select id, code, sort from menu_category where name=$1', [namaKategori])
  cek('alur kategori: tambah tersimpan dan tampil di daftar', !!kat && (await page.locator(`td:has-text("${namaKategori}")`).count()) >= 1, JSON.stringify(kat))

  // Menu: formulir salah dulu, isian harus terjaga
  await buka(page, '/menu/baru')
  await page.fill('#k-name', namaMenu)
  await page.selectOption('#k-category', kat.code)
  await page.fill('#k-price', '12,5')
  await page.fill('#k-description', 'Deskripsi uji')
  await page.check('#k-featured')
  await kirim(page, 'form.form button[type=submit]')
  const g = await page.$$eval('.galat-kolom', (x) => x.map((e) => e.textContent.trim()))
  cek('alur menu: harga salah menampilkan galat di kolomnya', g.some((t) => t.includes('Harga harus berupa rupiah bulat')), g.join(' | '))
  cek('alur menu: isian tetap terjaga sesudah galat', (await page.inputValue('#k-name')) === namaMenu && (await page.inputValue('#k-description')) === 'Deskripsi uji' && (await page.inputValue('#k-category')) === kat.code && (await page.isChecked('#k-featured')) && (await page.inputValue('#k-price')) === '12,5')
  cek('alur menu: tidak ada menu tersimpan saat galat', (await satu('select count(*)::int n from menu_item where name=$1', [namaMenu])).n === 0)
  await potret(page, '1440-m-alur-menu-galat')
  await page.fill('#k-price', '31.500')
  await page.setInputFiles('#k-foto-unggah', { name: 'uji.png', mimeType: 'image/png', buffer: PNG })
  await Promise.all([page.waitForURL(/\/menu\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  menuId = Number(new URL(page.url()).pathname.split('/').pop())
  const m = await satu('select price::int, featured, image from menu_item where id=$1', [menuId])
  cek('alur menu: tambah tersimpan dengan harga dan foto unggahan', m && m.price === 31500 && m.featured && /^unggahan\/[a-f0-9]{16}\.png$/.test(m.image), JSON.stringify(m))
  const urlFoto = await page.getAttribute('img[alt="Foto saat ini"]', 'src')
  const resFoto = await page.request.get(`${BASE}${urlFoto}`)
  cek('alur menu: foto unggahan dilayani dengan tipe gambar', resFoto.status() === 200 && resFoto.headers()['content-type'] === 'image/png', `${urlFoto} ${resFoto.status()}`)
  const resBaru = await (await konteks(1440, 900)).page.request.get(`${BASE}${urlFoto}`, { maxRedirects: 0 }).catch(() => null)
  cek('alur menu: foto tanpa login ditolak', !resBaru || resBaru.status() >= 300, `status ${resBaru?.status()}`)
  await potret(page, '1440-m-alur-menu-tersimpan')

  // Ubah harga
  await page.fill('#k-price', '33000')
  await kirim(page, 'form.form button[type=submit]')
  const riw = await satu('select old_price::int o, new_price::int n from menu_price_history where menu_item_id=$1', [menuId])
  cek('alur menu: ubah harga tercatat di riwayat harga', riw && riw.o === 31500 && riw.n === 33000, JSON.stringify(riw))
  cek('alur menu: riwayat harga tampil di rincian menu', (await page.locator('#j-harga ~ ul li, #j-harga + ul li').count()) >= 1)

  // Nonaktifkan lalu aktifkan lagi
  await kirim(page, 'button:text-is("Nonaktifkan menu")')
  cek('alur menu: nonaktifkan menu', (await page.textContent('.kepala .lencana'))?.trim() === 'Nonaktif')
  await kirim(page, 'button:text-is("Aktifkan lagi")')
  cek('alur menu: aktifkan lagi menu', (await page.textContent('.kepala .lencana'))?.trim() === 'Aktif')

  // Daftar menu: cari dan saring
  await buka(page, `/menu?q=${encodeURIComponent(namaMenu)}&kategori=${kat.code}`)
  cek('alur menu: pencarian dan saringan menemukan menu baru', (await page.locator(`td a:text-is("${namaMenu}")`).count()) === 1 && (await page.locator('tbody tr').count()) === 1)
  await potret(page, '1440-m-alur-menu-cari')

  // Harga massal pada kategori uji
  await buka(page, '/menu/harga')
  await page.selectOption('#h-kategori', kat.code)
  await page.selectOption('#h-arah', 'naik')
  await page.selectOption('#h-mode', 'persen')
  await page.fill('#h-nilai', '10')
  await page.selectOption('#h-bulat', '500')
  await Promise.all([page.waitForURL(/nilai=10/), page.click('button:text-is("Lihat pratinjau")')])
  await page.waitForLoadState('networkidle')
  const baris = await page.$$eval('.tabel tbody tr', (tr) => tr.map((r) => r.textContent.replace(/\s+/g, ' ').trim()))
  cek('alur harga massal: pratinjau menampilkan harga lama dan baru', baris.length === 1 && baris[0].includes('31.500') === false && baris[0].includes('33.000') && baris[0].includes('36.500'), baris.join(' | '))
  await potret(page, '1440-m-alur-harga-pratinjau')
  await page.fill('#k-label', 'Uji kenaikan')
  await kirim(page, 'button:text-is("Terapkan perubahan harga")')
  cek('alur harga massal: tanpa centang konfirmasi ditolak', (await page.locator('.kolom:has(#k-konfirmasi) .galat-kolom').count()) === 1 && (await satu('select price::int p from menu_item where id=$1', [menuId])).p === 33000, await page.textContent('.pesan.galat').catch(() => ''))
  cek('alur harga massal: catatan terjaga sesudah galat', (await page.inputValue('#k-label')) === 'Uji kenaikan')
  await page.check('#k-konfirmasi')
  await Promise.all([page.waitForURL(/\/menu\/riwayat\?pesan=harga/, { timeout: 30000 }), page.click('button:text-is("Terapkan perubahan harga")')])
  await page.waitForLoadState('networkidle')
  cek('alur harga massal: harga berubah dan tercatat', (await satu('select price::int p from menu_item where id=$1', [menuId])).p === 36500 && (await page.locator('h2:text-is("Uji kenaikan")').count()) === 1)
  await potret(page, '1440-m-alur-riwayat')

  // Paket: harga paket lebih mahal dari normal ditolak, lalu benar
  await buka(page, '/menu/paket/baru')
  const nasgor = await id("select id from menu_item where name='Pad Kra Pao'")
  const teh = await id("select id from menu_item where name='Iced Black'")
  await page.fill('#k-name', `Paket Uji ${tanda}`)
  await page.selectOption('#k-mainItemId', String(nasgor))
  await page.selectOption('#k-drinkItemId', String(teh))
  await page.fill('#k-price', '99000')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur paket: harga paket di atas harga normal ditolak', (await page.locator('#k-price ~ .galat-kolom').count()) === 1, await page.textContent('.pesan.galat').catch(() => ''))
  cek('alur paket: isian paket terjaga', (await page.inputValue('#k-name')) === `Paket Uji ${tanda}` && (await page.inputValue('#k-mainItemId')) === String(nasgor))
  await page.fill('#k-price', '50000')
  await Promise.all([page.waitForURL(/\/menu\/paket\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  cek('alur paket: tersimpan dengan harga normal dari jumlah menu', (await satu('select normal_price::int n from menu_set where name=$1', [`Paket Uji ${tanda}`])).n === 63500)
  await potret(page, '1440-m-alur-paket')

  // Promo
  await buka(page, '/promo/baru')
  await page.fill('#k-name', `Promo Uji ${tanda}`)
  await page.fill('#k-percent', '150')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur promo: persen di atas 100 ditolak, isian terjaga', (await page.locator('#k-percent ~ .galat-kolom').count()) === 1 && (await page.inputValue('#k-name')) === `Promo Uji ${tanda}`)
  await page.selectOption('#k-kind', 'hadiah')
  cek('alur promo: pilihan jenis mengganti kolom nilai', (await page.locator('#k-giftItemId').count()) === 1 && (await page.locator('#k-percent').count()) === 0)
  await potret(page, '1440-m-alur-promo-hadiah')
  await page.selectOption('#k-kind', 'persen')
  await page.fill('#k-percent', '7,5')
  await page.fill('#k-startsOn', '2026-12-10')
  await page.fill('#k-endsOn', '2026-12-01')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur promo: tanggal berakhir sebelum mulai ditolak', (await page.locator('#k-endsOn ~ .galat-kolom').count()) === 1)
  await page.fill('#k-endsOn', '2026-12-31')
  await Promise.all([page.waitForURL(/\/promo\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  const idPromoBaru = Number(new URL(page.url()).pathname.split('/').pop())
  cek('alur promo: tersimpan dengan masa berlaku', (await satu('select percent::float p, starts_on::text s, ends_on::text e from promo where id=$1', [idPromoBaru])).p === 7.5)
  await kirim(page, 'button:text-is("Nonaktifkan promo")')
  cek('alur promo: nonaktifkan promo', (await page.textContent('.kepala .lencana'))?.trim() === 'Nonaktif')
  await buka(page, `/promo?q=${encodeURIComponent(`Promo Uji ${tanda}`)}&status=nonaktif`)
  cek('alur promo: saringan status menemukan promo nonaktif', (await page.locator('tbody tr').count()) === 1)
  await potret(page, '1440-m-alur-promo')

  // Metode bayar
  await buka(page, '/metode-bayar/baru')
  await page.fill('#k-name', `Dompet ${tanda}`)
  await page.selectOption('#k-kind', 'tunai')
  await page.fill('#k-mdrPct', '2')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur metode bayar: tunai dengan MDR ditolak, isian terjaga', (await page.locator('#k-mdrPct ~ .galat-kolom').count()) === 1 && (await page.inputValue('#k-name')) === `Dompet ${tanda}`)
  await page.selectOption('#k-kind', 'lainnya')
  await page.fill('#k-mdrPct', '1,25')
  await page.check('#k-openDrawer')
  await Promise.all([page.waitForURL(/\/metode-bayar\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  cek('alur metode bayar: tersimpan', (await satu('select mdr_pct::float m, open_drawer o from payment_method where name=$1', [`Dompet ${tanda}`])).m === 1.25)
  await kirim(page, 'button:text-is("Nonaktifkan metode")')
  cek('alur metode bayar: nonaktifkan', (await page.textContent('.kepala .lencana'))?.trim() === 'Nonaktif')
  await potret(page, '1440-m-alur-metode')

  // Tingkat dan member
  await buka(page, '/member/tingkat/baru')
  await page.fill('#k-name', `Tingkat ${tanda}`)
  await page.fill('#k-minVisits', '10')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur tingkat: syarat kunjungan kembar ditolak', (await page.locator('#k-minVisits ~ .galat-kolom').count()) === 1)
  await page.fill('#k-minVisits', '40')
  await page.fill('#k-discountPct', '20')
  await Promise.all([page.waitForURL(/\/member\/tingkat\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  cek('alur tingkat: tersimpan', (await satu('select discount_pct::float d from member_tier where name=$1', [`Tingkat ${tanda}`])).d === 20)

  const wa = `0812${String(randomInt(1000, 9999))}${String(randomInt(1000, 9999))}`
  await buka(page, '/member/baru')
  await page.fill('#k-name', `Member Uji ${tanda}`)
  await page.fill('#k-wa', '12345')
  await page.fill('#k-visits', '42')
  await kirim(page, 'form.form button[type=submit]')
  cek('alur member: nomor WA salah ditolak, isian terjaga', (await page.locator('#k-wa ~ .galat-kolom').count()) === 1 && (await page.inputValue('#k-name')) === `Member Uji ${tanda}` && (await page.inputValue('#k-visits')) === '42')
  await potret(page, '1440-m-alur-member-galat')
  await page.fill('#k-wa', wa.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3'))
  // Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 157): kunjungan awal di atas 0 wajib beralasan.
  await kirim(page, 'form.form button[type=submit]')
  cek('alur member: kunjungan awal tanpa alasan ditolak di isian alasan', (await page.locator('#k-alasanKunjungan ~ .galat-kolom').count()) === 1 && (await page.inputValue('#k-visits')) === '42')
  await page.fill('#k-alasanKunjungan', 'Pindahan kartu stempel')
  await Promise.all([page.waitForURL(/\/member\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  const mem = await satu('select m.wa, t.name tingkat from member m left join member_tier t on t.id=m.tier_id where m.name=$1', [`Member Uji ${tanda}`])
  cek('alur member: WA disimpan format 62 dan tingkat mengikuti kunjungan', mem && mem.wa === `62${wa.slice(1)}` && mem.tingkat === `Tingkat ${tanda}`, JSON.stringify(mem))
  await potret(page, '1440-m-alur-member')
  await buka(page, '/member/baru')
  await page.fill('#k-name', 'Kembar')
  await page.fill('#k-wa', `+62 ${wa.slice(1)}`)
  await kirim(page, 'form.form button[type=submit]')
  cek('alur member: nomor yang sama dalam format lain ditolak', (await page.locator('#k-wa ~ .galat-kolom').count()) === 1, (await page.locator('#k-wa ~ .galat-kolom').textContent().catch(() => '')) ?? '')
  await buka(page, `/member?q=${encodeURIComponent(wa)}`)
  cek('alur member: cari dengan nomor format 08 menemukan member', (await page.locator('tbody tr').count()) === 1)

  // Jejak Audit memuat semua perubahan tadi
  const aksiAudit = (await semua("select distinct action from audit_log where at > now() - interval '15 minutes'")).map((r) => r.action)
  const harapAudit = ['kategori.tambah', 'menu.tambah', 'menu.ubah', 'menu.nonaktifkan', 'menu.aktifkan', 'harga.massal', 'paket.tambah', 'promo.tambah', 'promo.nonaktifkan', 'metode_bayar.tambah', 'metode_bayar.nonaktifkan', 'tingkat.tambah', 'member.tambah']
  cek('audit: semua peristiwa alur tercatat', harapAudit.every((a) => aksiAudit.includes(a)), harapAudit.filter((a) => !aksiAudit.includes(a)).join(', '))
  await buka(page, `/audit?entitas=menu_item&dok=${menuId}`)
  const teksAudit = await page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
  cek('audit: Jejak Audit menampilkan tambah, ubah, dan ubah status menu', ['Tambah menu', 'Ubah menu', 'Nonaktifkan menu', 'Aktifkan menu'].every((a) => teksAudit.includes(a)), teksAudit.join(', '))
  await potret(page, '1440-m-audit-menu')
  cek('alur owner: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 4. Formulir salah di 390 px: galat terlihat, isian terjaga, tanpa luapan. Lalu simpan di HP.
{
  const { ctx, page, galat } = await konteks(390, 844)
  await masuk(page, AKUN.owner)
  await buka(page, '/menu/baru')
  await page.fill('#k-name', `HP ${tanda}`)
  await page.fill('#k-price', 'abc')
  await kirim(page, 'form.form button[type=submit]')
  const kotak = await page.$eval('.pesan.galat', (e) => {
    const r = e.getBoundingClientRect()
    return { kiri: r.left, kanan: r.right, lebar: window.innerWidth, tampil: r.width > 0 && r.height > 0 }
  })
  cek('390px menu: pesan galat tampil di layar', kotak.tampil && kotak.kiri >= 0 && kotak.kanan <= kotak.lebar, JSON.stringify(kotak))
  cek('390px menu: isian terjaga dan tanpa luapan', (await page.inputValue('#k-name')) === `HP ${tanda}` && (await luapan(page)) <= 1)
  await potret(page, '390-m-alur-menu-galat')
  await page.selectOption('#k-category', { index: 1 })
  await page.fill('#k-price', '25000')
  await Promise.all([page.waitForURL(/\/menu\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  await page.waitForLoadState('networkidle')
  cek('390px menu: simpan dari HP berhasil', (await satu('select count(*)::int n from menu_item where name=$1', [`HP ${tanda}`])).n === 1)
  await potret(page, '390-m-alur-menu-tersimpan')
  await buka(page, '/menu/harga?kategori=&arah=naik&mode=persen&nilai=5&bulat=500')
  cek('390px harga massal: pratinjau tanpa luapan', (await luapan(page)) <= 1)
  await potret(page, '390-m-alur-harga-pratinjau')
  cek('390px: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 5. Kasir menambah member lewat formulir, Admin mengubah harga menu (izin sesuai matriks).
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.kasir)
  await buka(page, '/member/baru')
  const wa = `0813${String(randomInt(1000, 9999))}${String(randomInt(1000, 9999))}`
  await page.fill('#k-name', `Member Kasir ${tanda}`)
  await page.fill('#k-wa', wa)
  await Promise.all([page.waitForURL(/\/member\/\d+\?pesan=dibuat/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
  cek('kasir: tambah member lewat formulir berhasil', (await satu('select count(*)::int n from member where name=$1', [`Member Kasir ${tanda}`])).n === 1)
  const a = await satu("select actor_name from audit_log where action='member.tambah' order by id desc limit 1")
  cek('kasir: pembuat member tercatat di audit', a.actor_name === AKUN.kasir.u, a.actor_name)
  cek('kasir: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.admin)
  await buka(page, `/menu/${menuId}`)
  await page.fill('#k-price', '37000')
  await kirim(page, 'form.form button[type=submit]')
  cek('admin: ubah harga menu lewat formulir berhasil', (await satu('select price::int p from menu_item where id=$1', [menuId])).p === 37000)
  await buka(page, '/menu/harga')
  cek('admin: halaman ubah harga massal terbuka', (await page.textContent('h1')).includes('Ubah harga massal'))
  cek('admin: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-master.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan master: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
