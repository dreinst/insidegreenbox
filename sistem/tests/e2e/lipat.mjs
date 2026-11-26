// Uji klik sidebar yang grupnya bisa dilipat, lebar isi, dan kaki sidebar (KONTRAK 11 butir 162).
// Dijalankan lewat tests/e2e/jalankan.sh. Potret ke tests/potret/lipat-*.png, ringkasan ke tests/hasil/e2e-lipat.json.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { chromium } from 'playwright'
import { klikSamping } from './sidebar.mjs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3241'
const POTRET = new URL('../potret/', import.meta.url).pathname
const HASIL = new URL('../hasil/', import.meta.url).pathname
mkdirSync(POTRET, { recursive: true })
mkdirSync(HASIL, { recursive: true })

const AKUN = {
  owner: { u: process.env.SEED_OWNER_USERNAME, p: process.env.SEED_OWNER_PASSWORD },
  kasir: { u: process.env.SEED_KASIR_USERNAME, p: process.env.SEED_KASIR_PASSWORD },
  finance: { u: process.env.SEED_FINANCE_USERNAME, p: process.env.SEED_FINANCE_PASSWORD },
}

const hasil = []
const cek = (nama, lulus, rincian = '') => {
  hasil.push({ nama, lulus: !!lulus, rincian })
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${rincian ? `  (${rincian})` : ''}`)
}

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
  return { ctx, page, galat }
}

async function masuk(page, akun) {
  await page.goto(`${BASE}/masuk`)
  await page.fill('#k-username', akun.u)
  await page.fill('#k-password', akun.p)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/masuk'), { timeout: 15000 }), page.click('button[type=submit]')])
}

// Di layar sempit sidebar ada di laci; buka lacinya dan tunggu animasinya selesai.
async function siap(page, w) {
  if (w > 900) return
  if (!(await page.$('.laci-buka'))) await page.click('.tombol-menu')
  await page.waitForFunction(() => Math.abs(document.querySelector('.samping').getBoundingClientRect().left) < 1)
}

const terbuka = (page) => page.$$eval('.samping details.samping-lipat[open] .samping-judul', (x) => x.map((e) => e.textContent.trim()))
const ringkas = (page, judul) => page.locator(`.samping details.samping-lipat:has(.samping-judul:text-is("${judul}")) > summary`)
const grupBuka = (page, judul) => ringkas(page, judul).evaluate((s) => s.parentElement.open)
// Event toggle dikirim sesudah atribut open berubah; tunggu keadaan grup sebelum lanjut.
const tunggu = (page, judul, buka) =>
  page.waitForFunction(([j, b]) => [...document.querySelectorAll('.samping details.samping-lipat')].find((d) => d.querySelector('.samping-judul').textContent.trim() === j)?.open === b, [judul, buka])

// Grup yang terbuka di HTML dari server (sebelum JavaScript jalan), dengan cookie konteks ini.
async function terbukaDiServer(page, jalur) {
  const html = await (await page.request.get(`${BASE}${jalur}`)).text()
  return [...html.matchAll(/<details[^>]*>/g)].map((m) => m[0]).filter((t) => /\sopen=""/.test(t)).map((t) => (t.match(/aria-labelledby="([^"]+)"/) ?? [])[1])
}

for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]) {
  // 1. Owner: grup tertutup secara bawaan, buka tutup dengan klik dan papan ketik, pilihan diingat.
  {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN.owner)
    await siap(page, w)
    const semua = await page.$$eval('.samping details.samping-lipat', (x) => x.length)
    cek(`${w}px owner: di Beranda semua grup tertutup`, semua === 11 && (await terbuka(page)).length === 0, `${semua} grup, terbuka: ${(await terbuka(page)).join(', ')}`)
    cek(`${w}px owner: Beranda dan Perlu Disetujui tampil di atas tanpa grup`, JSON.stringify(await page.$$eval('.samping-utama a', (a) => a.map((x) => x.childNodes[1]?.textContent.trim()))) === JSON.stringify(['Beranda', 'Perlu Disetujui']))
    cek(`${w}px owner: tautan di grup tertutup tidak tampil`, !(await page.locator('.samping nav a[href="/stok"]').isVisible()))
    const jumlah = await ringkas(page, 'Persediaan').locator('.samping-jumlah').textContent()
    cek(`${w}px owner: judul grup memuat jumlah item`, jumlah.replace(/\s+/g, ' ').trim() === ', 7 menu', jumlah)
    cek(`${w}px owner: grup bernama untuk pembaca layar`, (await page.getByRole('group', { name: 'Keuangan' }).count()) === 1)

    await ringkas(page, 'Persediaan').click()
    await tunggu(page, 'Persediaan', true)
    cek(`${w}px owner: klik judul membuka grup`, await page.locator('.samping nav a[href="/stok"]').isVisible())
    await ringkas(page, 'Persediaan').click()
    await tunggu(page, 'Persediaan', false)
    cek(`${w}px owner: klik judul lagi menutup grup`, !(await page.locator('.samping nav a[href="/stok"]').isVisible()))

    await ringkas(page, 'Keuangan').focus()
    await page.keyboard.press('Enter')
    await tunggu(page, 'Keuangan', true)
    cek(`${w}px owner: Enter membuka grup`, await grupBuka(page, 'Keuangan'))
    await page.keyboard.press('Space')
    await tunggu(page, 'Keuangan', false)
    cek(`${w}px owner: Spasi menutup grup`, !(await grupBuka(page, 'Keuangan')))
    await page.keyboard.press('Space')
    await tunggu(page, 'Keuangan', true)
    // Tab dari judul grup yang terbuka masuk ke item pertamanya.
    await page.keyboard.press('Tab')
    cek(`${w}px owner: Tab dari judul masuk ke item grup`, (await page.evaluate(() => document.activeElement?.getAttribute('href'))) === '/kas')

    await page.reload()
    await siap(page, w)
    cek(`${w}px owner: sesudah muat ulang Keuangan tetap terbuka, Persediaan tertutup`, JSON.stringify(await terbuka(page)) === JSON.stringify(['Keuangan']), (await terbuka(page)).join(', '))
    cek(`${w}px owner: HTML server sudah memuat pilihan (tanpa kedip)`, JSON.stringify(await terbukaDiServer(page, '/')) === JSON.stringify(['grup-keuangan']))
    await potret(page, `lipat-${w}-owner-ingat`)

    // Pindah halaman: grup halaman aktif terbuka, pilihan lain tetap.
    await Promise.all([page.waitForURL('**/stok'), klikSamping(page, '/stok')])
    await siap(page, w)
    cek(`${w}px owner: grup halaman aktif terbuka sesudah pindah halaman`, JSON.stringify(await terbuka(page)) === JSON.stringify(['Persediaan', 'Keuangan']), (await terbuka(page)).join(', '))
    // Grup aktif boleh ditutup sementara, tapi selalu terbuka lagi saat halaman dimuat.
    await ringkas(page, 'Persediaan').click()
    await tunggu(page, 'Persediaan', false)
    await page.reload()
    await siap(page, w)
    cek(`${w}px owner: grup halaman aktif tetap terbuka sesudah muat ulang walau ditutup`, (await terbuka(page)).includes('Persediaan'), (await terbuka(page)).join(', '))
    cek(`${w}px owner: grup aktif terbuka di HTML server`, (await terbukaDiServer(page, '/jurnal')).includes('grup-akuntansi'))
    await page.goto(`${BASE}/jurnal`)
    await siap(page, w)
    cek(`${w}px owner: buka alamat langsung membuka grupnya dan menggulir item aktif ke pandangan`, (await terbuka(page)).includes('Akuntansi') && (await page.locator('.samping nav a.aktif').isVisible()) && (await page.locator('.samping nav a.aktif').evaluate((a) => { const r = a.getBoundingClientRect(); return r.top >= 0 && r.bottom <= document.querySelector('.samping-kaki').getBoundingClientRect().top + 1 })))
    cek(`${w}px owner: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // 2. Potret sidebar tiga peran: tertutup (Beranda) dan satu grup terbuka (halaman di grup itu).
  for (const [peran, jalur, grup] of [
    ['owner', '/stok', 'Persediaan'],
    ['finance', '/kas', 'Keuangan'],
    ['kasir', '/transaksi', 'Kasir'],
  ]) {
    if (!AKUN[peran].u || !AKUN[peran].p) {
      cek(`${w}px ${peran}: akun uji tersedia`, false)
      continue
    }
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    await siap(page, w)
    cek(`${w}px ${peran}: di Beranda semua grup tertutup`, (await terbuka(page)).length === 0)
    await potret(page, `lipat-${w}-${peran}-tertutup`)
    await page.goto(`${BASE}${jalur}`)
    await siap(page, w)
    cek(`${w}px ${peran}: di ${jalur} hanya grup ${grup} terbuka`, JSON.stringify(await terbuka(page)) === JSON.stringify([grup]), (await terbuka(page)).join(', '))
    // Judul grup, item, dan kaki sidebar tidak terpotong.
    const potong = await page.$$eval('.samping-judul, .samping nav a, .samping-kaki', (x) => x.filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()))
    cek(`${w}px ${peran}: teks sidebar tidak terpotong`, potong.length === 0, potong.join(', '))
    await potret(page, `lipat-${w}-${peran}-satu-grup`)
    cek(`${w}px ${peran}: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 3. Lebar isi, kaki sidebar, logo, dan judul tab di layar lebar dan HP.
for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 390, h: 844 },
]) {
  const { ctx, page, galat } = await konteks(w, h)
  await masuk(page, AKUN.owner)
  // Next mengalirkan metadata sesudah isi, jadi judul tab ditunggu dulu.
  await page.waitForFunction(() => document.title.includes('Greenbox Management Page'), null, { timeout: 5000 }).catch(() => {})
  cek(`${w}px: judul tab memakai nama Greenbox Management Page`, (await page.title()).includes('Greenbox Management Page'), await page.title())
  cek(`${w}px: logo tanpa sublabel admin`, !/admin/i.test(await page.locator('.samping-logo').innerText()))
  for (const jalur of ['/', '/stok', '/jurnal', '/pengguna/baru', '/kasir']) {
    await page.goto(`${BASE}${jalur}`)
    const ukur = await page.evaluate(() => {
      const isi = document.querySelector('.isi').getBoundingClientRect()
      return { kanan: Math.round(innerWidth - isi.right), lebar: Math.round(isi.width), luap: document.documentElement.scrollWidth - innerWidth }
    })
    cek(`${w}px ${jalur}: isi memenuhi lebar layar tanpa luapan`, ukur.kanan <= 1 && ukur.luap <= 1, JSON.stringify(ukur))
    if (w !== 390) await potret(page, `lipat-${w}-owner${jalur === '/' ? '-beranda' : jalur.replace(/\//g, '-')}`)
  }
  await page.goto(`${BASE}/`)
  await siap(page, w)
  const kaki = await page.locator('.samping-kaki').evaluate((e) => {
    const r = e.getBoundingClientRect()
    const s = document.querySelector('.samping').getBoundingClientRect()
    return { teks: e.textContent, bawah: Math.round(s.bottom - r.bottom), tampil: r.top < innerHeight && r.bottom <= innerHeight + 1 }
  })
  cek(`${w}px: kaki sidebar Greenbox Management Page tampil di bawah`, kaki.teks === 'Greenbox Management Page' && kaki.tampil && kaki.bawah <= 1, JSON.stringify(kaki))
  if (w === 390) await potret(page, `lipat-390-owner-laci-kaki`)
  cek(`${w}px: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

async function potret(page, nama) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${POTRET}${nama}.png` })
}

await browser.close()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-lipat.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
