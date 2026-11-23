// Uji klik nyata dengan Chromium tanpa kepala (KONTRAK 10). Dijalankan lewat tests/e2e/jalankan.sh yang
// menyiapkan basis data e2e baru dan server produksi. Bisa juga langsung: BASE_URL=... node tests/e2e/klik.mjs
// Potret disimpan ke tests/potret/ (di-gitignore), ringkasan ke tests/hasil/e2e.json.
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
// tahap 3A dan 3B menambah modul kasir (Layar Kasir, Shift, Transaksi, PIN Kasir) dan master (Menu dan Harga, Promo, Member, Metode Bayar) sesuai izin tiap peran.
// tahap 4A: tujuh item persediaan dan lokasi.
// tahap 4B: sidebar berkelompok (Kasir, Menu, Persediaan, Produksi, Pengaturan). Metode Bayar pindah ke grup Kasir,
// Resep dan BOM masuk Persediaan, empat menu produksi di grup Produksi, dan Lokasi di grup Pengaturan.
const KASIR_3B = ['Layar Kasir', 'Shift', 'Transaksi']
const STOK_4A = ['Produk dan Satuan', 'Resep dan BOM', 'Stok', 'Penyesuaian', 'Opname', 'Pindah Stok', 'Alasan']
const PRODUKSI_4B = ['Perintah Produksi', 'Pengeluaran Bahan', 'Hasil Produksi', 'Produksi Cepat']
// tahap 4C: grup Pembelian sesudah Produksi, Hutang Pemasok di grup Keuangan.
const BELI_4C = ['Pemasok', 'Permintaan', 'Pesanan', 'Penerimaan', 'Faktur', 'Retur', 'Pembelian Langsung', 'Pembayaran']
const AKUNTANSI_5B = ['Akun dan Pemetaan', 'Jurnal Umum', 'Buku Besar', 'Laporan Keuangan', 'Tutup Periode']
// tahap 6A: grup Penjualan B2B sesudah Pembelian, Piutang Pelanggan di grup Keuangan, Profil Usaha di grup Pengaturan.
const B2B_6A = ['Pelanggan', 'Pesanan Penjualan', 'Faktur Penjualan', 'Terima Pembayaran', 'Retur Penjualan']
// tahap 6B: grup Aset dan Anggaran sesudah Akuntansi. Admin hanya melihat Aset Tetap, Anggaran, dan Realisasi Anggaran.
const ASET_6B = ['Aset Tetap', 'Penyusutan', 'Pelepasan Aset', 'Anggaran', 'Realisasi Anggaran']
const ASET_6B_ADMIN = ['Aset Tetap', 'Anggaran', 'Realisasi Anggaran']
const SIDEBAR_HARAP = {
  // tahap 5A: Setoran POS di grup Kasir, Rekening Bank di grup Keuangan, Laporan di grup Laporan (Owner dan Admin).
  // tahap 5B: grup Akuntansi sesudah Keuangan; Admin hanya Akun dan Pemetaan.
  // tahap 5C: Kas Masuk/Keluar, Pindah Dana, dan Rekonsiliasi Bank di awal grup Keuangan; Admin hanya Kas Masuk/Keluar.
  owner: ['Beranda', ...KASIR_3B, 'PIN Kasir', 'Setoran POS', 'Metode Bayar', 'Menu dan Harga', 'Promo', 'Member', ...STOK_4A, ...PRODUKSI_4B, ...BELI_4C, ...B2B_6A, 'Kas Masuk/Keluar', 'Pindah Dana', 'Rekonsiliasi Bank', 'Rekening Bank', 'Hutang Pemasok', 'Piutang Pelanggan', ...AKUNTANSI_5B, ...ASET_6B, 'Laporan', 'Lokasi', 'Profil Usaha', 'Pengguna', 'Peran dan Izin', 'Saklar Fitur', 'Jejak Audit'],
  admin: ['Beranda', ...KASIR_3B, 'PIN Kasir', 'Setoran POS', 'Metode Bayar', 'Menu dan Harga', 'Promo', 'Member', ...STOK_4A, ...PRODUKSI_4B, ...BELI_4C, ...B2B_6A, 'Kas Masuk/Keluar', 'Rekening Bank', 'Hutang Pemasok', 'Piutang Pelanggan', 'Akun dan Pemetaan', ...ASET_6B_ADMIN, 'Laporan', 'Lokasi', 'Profil Usaha', 'Jejak Audit'],
  kasir: ['Beranda', ...KASIR_3B, 'Menu dan Harga', 'Member'],
}
const LEBAR = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]

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

async function bukaLaci(page, w) {
  if (w > 900) return
  await page.click('.tombol-menu')
  await page.waitForSelector('.laci-buka .samping nav a', { state: 'visible' })
  await page.waitForFunction(() => Math.abs(document.querySelector('.samping').getBoundingClientRect().left) < 1)
}

// Laci tertutup penuh (animasi selesai) sebelum memotret halaman di layar sempit.
async function lacitutup(page, w) {
  if (w > 900) return
  await page.waitForFunction(() => document.querySelector('.samping').getBoundingClientRect().right <= 0)
}

// Klik tombol kirim lalu tunggu POST aksi server dan navigasi sesudahnya selesai.
async function kirim(page, pemilih) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 20000 }), page.click(pemilih)])
  // Tombol kirim berstatus sibuk sampai aksi dan pengalihannya selesai dirender.
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
}

async function potret(page, nama) {
  await page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
}

// 1. Setiap peran di dua lebar: sidebar sesuai izin, tiap item terbuka tanpa galat, potret.
for (const { w, h } of LEBAR) {
  for (const peran of ['owner', 'admin', 'kasir']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    await bukaLaci(page, w)
    if (w <= 900) await potret(page, `${w}-${peran}-laci`)
    const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
    cek(`${w}px ${peran}: sidebar sesuai izin`, JSON.stringify(label) === JSON.stringify(SIDEBAR_HARAP[peran]), label.join(', '))
    if (w <= 900) await page.click('.tutup-laci')
    for (const teks of label) {
      await bukaLaci(page, w)
      const tautan = page.locator(`.samping nav a:text-is("${teks}")`)
      const href = await tautan.getAttribute('href')
      await tautan.click()
      await page.waitForURL((u) => u.pathname === href, { timeout: 15000 })
      await page.waitForLoadState('networkidle')
      await page.waitForFunction((t) => document.querySelector('.samping nav a.aktif')?.textContent.trim() === t, teks)
      await lacitutup(page, w)
      const res = await page.request.get(page.url())
      const h1 = await page.textContent('h1')
      const aktif = await page.$eval('.samping nav a.aktif', (a) => a.textContent.trim()).catch(() => '')
      const lebih = await luapan(page)
      const slug = teks.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await potret(page, `${w}-${peran}-${slug}`)
      cek(`${w}px ${peran}: klik ${teks}`, aktif === teks && !/Akses ditolak|tidak ditemukan|Galat/i.test(h1) && (!res || res.status() < 400), `h1 "${h1}"`)
      cek(`${w}px ${peran}: ${teks} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
    }
    // Halaman turunan untuk Owner.
    if (peran === 'owner') {
      const idKasir = (await satu("select id from role where code='kasir'")).id
      const idOwnerUser = (await satu("select u.id from app_user u join role r on r.id=u.role_id where r.code='owner' order by u.id limit 1")).id
      const idAudit = (await satu('select max(id) as id from audit_log')).id
      for (const [jalur, nama] of [
        ['/pengguna/baru', 'pengguna-baru'],
        [`/pengguna/${idOwnerUser}`, 'pengguna-rincian'],
        ['/peran/baru', 'peran-baru'],
        [`/peran/${idKasir}`, 'peran-rincian'],
        [`/audit/${idAudit}`, 'audit-rincian'],
      ]) {
        const r = await page.goto(`${BASE}${jalur}`)
        await page.waitForLoadState('networkidle')
        const lebih = await luapan(page)
        await potret(page, `${w}-owner-${nama}`)
        cek(`${w}px owner: buka ${jalur}`, r.status() === 200, `status ${r.status()}`)
        cek(`${w}px owner: ${jalur} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
      }
    }
    cek(`${w}px ${peran}: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 2. Alur tambah, ubah, nonaktifkan pengguna sungguhan di browser (1440), lalu cek Jejak Audit.
const tanda = Date.now().toString(36)
const userBaru = `uji_${tanda}`
const sandiBaru = `Sandi-${tanda}-x`
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/pengguna`)
  await page.click('a:text-is("Tambah pengguna")')
  await page.waitForURL('**/pengguna/baru')
  await page.fill('#k-name', 'Pengguna Uji')
  await page.fill('#k-username', userBaru)
  await page.selectOption('#k-roleId', { label: 'Kasir' })
  await page.fill('#k-sandi', sandiBaru)
  await page.fill('#k-ulangiSandi', sandiBaru)
  await Promise.all([page.waitForURL(/\/pengguna\/\d+\?pesan=dibuat/), page.click('button:text-is("Simpan pengguna")')])
  const idBaru = Number(new URL(page.url()).pathname.split('/').pop())
  cek('alur: tambah pengguna tersimpan', (await page.textContent('.pesan.sukses'))?.includes('Data baru tersimpan'), `id ${idBaru}`)
  const diDb = await satu('select u.name, r.code from app_user u join role r on r.id=u.role_id where u.username=$1', [userBaru])
  cek('alur: pengguna baru ada di database', diDb?.code === 'kasir', JSON.stringify(diDb))

  // Pengguna baru masuk di konteks lain, untuk membuktikan penonaktifan langsung memutus sesinya.
  const lain = await konteks(1440, 900)
  await masuk(lain.page, { u: userBaru, p: sandiBaru })
  cek('alur: pengguna baru bisa masuk', new URL(lain.page.url()).pathname === '/')

  await page.fill('#k-name', 'Pengguna Uji Diubah')
  await kirim(page, 'button:text-is("Simpan perubahan")')
  cek('alur: ubah pengguna tersimpan', (await page.inputValue('#k-name')) === 'Pengguna Uji Diubah')

  await kirim(page, 'button:text-is("Nonaktifkan pengguna")')
  cek('alur: nonaktifkan pengguna', (await page.textContent('.kepala .lencana'))?.trim() === 'Nonaktif')

  const r = await lain.page.goto(`${BASE}/`)
  cek('alur: sesi pengguna yang dinonaktifkan langsung putus', new URL(lain.page.url()).pathname === '/masuk', `akhir ${lain.page.url()} status ${r.status()}`)
  await lain.ctx.close()

  await page.goto(`${BASE}/audit?entitas=app_user&dok=${idBaru}`)
  const aksiAudit = await page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
  await potret(page, '1440-owner-audit-alur')
  cek(
    'alur: tambah, ubah, nonaktifkan muncul di Jejak Audit',
    ['Tambah pengguna', 'Ubah pengguna', 'Nonaktifkan pengguna'].every((a) => aksiAudit.includes(a)),
    aksiAudit.join(', '),
  )
  await page.click('.tabel tbody tr:first-child .sel-aksi a')
  await page.waitForURL(/\/audit\/\d+/)
  const beda = await page.$$eval('.tabel.selisih tr.beda', (tr) => tr.length)
  cek('alur: rincian audit menampilkan sebelum dan sesudah', beda > 0, `${beda} kolom berbeda`)

  // Peran dan saklar diubah lewat formulir, lalu dikembalikan.
  const idKasir = (await satu("select id from role where code='kasir'")).id
  await page.goto(`${BASE}/peran/${idKasir}`)
  await page.check('input[name="izin:menu.promo:L"]')
  await kirim(page, 'button:text-is("Simpan izin")')
  const izinPromo = await satu("select can_view from role_permission where role_id=$1 and menu_code='menu.promo'", [idKasir])
  cek('alur: ubah matriks izin tersimpan', izinPromo.can_view === true)
  await page.uncheck('input[name="izin:menu.promo:L"]')
  await kirim(page, 'button:text-is("Simpan izin")')

  const idAdmin = (await satu("select id from role where code='admin'")).id
  await page.goto(`${BASE}/saklar?peran=${idAdmin}`)
  await page.click('label.saklar:has(input[name="nyala:stok.sesuai_tambah"])')
  await kirim(page, 'button:text-is("Simpan saklar")')
  const s = await satu("select rfs.enabled from role_feature_switch rfs join feature_switch f on f.id=rfs.feature_switch_id where rfs.role_id=$1 and f.code='stok.sesuai_tambah'", [idAdmin])
  cek('alur: ubah saklar tersimpan', s.enabled === true)
  await page.click('label.saklar:has(input[name="nyala:stok.sesuai_tambah"])')
  await kirim(page, 'button:text-is("Simpan saklar")')
  const jejak = await satu("select count(*)::int n from audit_log where action in ('peran.izin','saklar.ubah') and at > now() - interval '5 minutes'")
  cek('alur: perubahan izin dan saklar tercatat di audit', jejak.n >= 4, `${jejak.n} catatan`)
  cek('alur: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 3. Formulir salah di 390 px: pesan galat terlihat dan isian terjaga.
{
  const { ctx, page, galat } = await konteks(390, 844)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/pengguna/baru`)
  await page.fill('#k-name', 'A')
  await page.fill('#k-username', 'Nama Salah')
  await page.fill('#k-sandi', '123')
  await page.fill('#k-ulangiSandi', '456')
  await page.click('button:text-is("Simpan pengguna")')
  await page.waitForSelector('.pesan.galat')
  const kotak = await page.$eval('.pesan.galat', (e) => {
    const r = e.getBoundingClientRect()
    return { kiri: r.left, kanan: r.right, lebar: window.innerWidth, tampil: r.width > 0 && r.height > 0 }
  })
  const galatKolom = await page.$$eval('.galat-kolom', (g) => g.map((x) => x.textContent.trim()))
  cek('390px: pesan galat formulir tampil di layar', kotak.tampil && kotak.kiri >= 0 && kotak.kanan <= kotak.lebar, JSON.stringify(kotak))
  cek('390px: galat per kolom tampil', galatKolom.length >= 3, galatKolom.join(' | '))
  cek('390px: isian nama dan nama pengguna terjaga', (await page.inputValue('#k-name')) === 'A' && (await page.inputValue('#k-username')) === 'Nama Salah')
  cek('390px: sandi tidak dikembalikan ke formulir', (await page.inputValue('#k-sandi')) === '')
  await potret(page, '390-owner-form-galat')
  cek('390px: formulir galat tanpa luapan', (await luapan(page)) <= 1)
  cek('390px: formulir galat tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 4. Kasir ditolak di alamat langsung dan di aksi server.
{
  // Ambil kolom formulir aksi server dari HTML milik Owner (tanpa JavaScript, jalur progressive enhancement).
  const owner = await konteks(1440, 900)
  await masuk(owner.page, AKUN.owner)
  const html = await (await owner.page.request.get(`${BASE}/pengguna/baru`)).text()
  await owner.ctx.close()
  const kolomAksi = [...html.matchAll(/<input type="hidden" name="(\$ACTION_[^"]+)"(?: value="([^"]*)")?/g)].map((m) => [m[1], (m[2] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')])

  const { ctx, page } = await konteks(1440, 900)
  await masuk(page, AKUN.kasir)
  for (const jalur of ['/pengguna', '/pengguna/baru', '/peran', '/saklar', '/audit']) {
    const r = await page.goto(`${BASE}${jalur}`)
    const h1 = await page.textContent('h1')
    cek(`kasir: alamat ${jalur} ditolak`, r.status() === 403 && h1.includes('Akses ditolak'), `status ${r.status()}, h1 "${h1}"`)
  }
  await potret(page, '1440-kasir-akses-ditolak')
  const userSusup = `susup_${tanda}`
  const multipart = Object.fromEntries(kolomAksi)
  Object.assign(multipart, { name: 'Penyusup', username: userSusup, roleId: '1', sandi: 'SandiSusup123', ulangiSandi: 'SandiSusup123' })
  const r = await page.request.post(`${BASE}/pengguna/baru`, { multipart, maxRedirects: 0 })
  const ada = await satu('select count(*)::int n from app_user where username=$1', [userSusup])
  const tolak = await satu("select count(*)::int n from audit_log a join app_user u on u.id=a.user_id where a.action='izin.ditolak' and u.username=$1 and a.summary like '%aksi%'", [AKUN.kasir.u])
  cek('kasir: aksi server tambah pengguna ditolak', kolomAksi.length > 0 && ada.n === 0 && tolak.n >= 1, `kolom aksi ${kolomAksi.length}, status ${r.status()}, pengguna dibuat ${ada.n}, audit tolak ${tolak.n}`)
  await ctx.close()
}

// 5. Keluar mencabut sesi di database: cookie lama tidak bisa dipakai lagi.
{
  const { ctx, page } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  const cookieLama = (await ctx.cookies()).find((c) => c.name === 'gb_sesi')
  await Promise.all([page.waitForURL(/\/masuk\?pesan=keluar/), page.click('button:has-text("Keluar")')])
  cek('keluar: kembali ke halaman masuk', (await page.textContent('.pesan.sukses'))?.includes('sudah keluar'))
  await ctx.addCookies([cookieLama])
  await page.goto(`${BASE}/pengguna`)
  cek('keluar: cookie lama ditolak sesudah keluar', new URL(page.url()).pathname === '/masuk')
  await ctx.close()
}

// 6. Login salah berulang terkunci, termasuk saat sandi benar dimasukkan sesudahnya.
{
  const { ctx, page } = await konteks(390, 844)
  const pesan = []
  for (let i = 0; i < 5; i++) {
    await page.goto(`${BASE}/masuk`)
    await page.fill('#k-username', AKUN.admin.u)
    await page.fill('#k-password', `salah-${i}`)
    await page.click('button[type=submit]')
    await page.waitForSelector('.pesan.galat')
    pesan.push(await page.textContent('.pesan.galat'))
  }
  cek('kunci: 5 sandi salah ditolak dengan pesan umum', pesan.every((p) => p.includes('Nama pengguna atau sandi salah')))
  cek('kunci: nama pengguna tetap terisi sesudah galat', (await page.inputValue('#k-username')) === AKUN.admin.u)
  await page.fill('#k-password', AKUN.admin.p)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.pesan.galat')?.textContent.includes('Terlalu banyak'))
  await potret(page, '390-masuk-terkunci')
  cek('kunci: percobaan ke-6 dengan sandi benar tetap terkunci', new URL(page.url()).pathname === '/masuk')
  const n = await satu("select count(*)::int n from audit_log where action='masuk.terkunci' and actor_name=$1", [AKUN.admin.u])
  cek('kunci: penguncian tercatat di audit', n.n >= 1)
  await ctx.close()
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
