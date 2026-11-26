// Uji klik perbaikan audit area A dan B (KONTRAK 11 butir 127 sampai 141) yang terlihat di layar: isian kunjungan
// member untuk Kasir (A-1), peran yang bisa diberikan peran tambahan (A-2), kartu jumlah Transaksi untuk Kasir (A-4),
// jenis metode bayar terkunci (A-6), Pembelian Langsung tunai di atas batas wajib Owner beserta peringatan kas minus
// (B-2), dan kelompok umur Hutang Pemasok (B-4). Dijalankan oleh tests/e2e/jalankan.sh sebelum klik.mjs, atau langsung:
// BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/audit-ab.mjs
// Potret ke tests/potret/audit-*, ringkasan ke tests/hasil/e2e-audit-ab.json.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
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
const tanda = Date.now().toString(36).slice(-5)

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
const galatKonsol = []

async function konteks(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-forwarded-for': ipAcak() }, locale: 'id-ID' })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') galatKonsol.push(m.text())
  })
  page.on('pageerror', (e) => galatKonsol.push(String(e)))
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}
async function masuk(page, akun) {
  await page.goto(`${BASE}/masuk`)
  await page.fill('#k-username', akun.u)
  await page.fill('#k-password', akun.p)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/masuk'), { timeout: 30000 }), page.click('button[type=submit]')])
}
const luapan = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const potret = (page, nama) => page.screenshot({ path: `${POTRET}audit-${nama}.png`, fullPage: true })
const buka = async (page, jalur) => {
  const r = await page.goto(`${BASE}${jalur}`)
  await page.waitForLoadState('networkidle')
  return r
}
async function kirim(page, pemilih) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 60000 }), page.click(pemilih)])
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 60000 })
  await page.waitForLoadState('networkidle')
}
async function kirimKe(page, pemilih, pola) {
  await Promise.all([page.waitForURL(pola, { timeout: 60000 }), page.click(pemilih)])
  await page.waitForLoadState('networkidle')
}
const tombol = (teks) => `button[type=submit]:text-is("${teks}")`
const idDari = (url) => Number(new URL(url).pathname.split('/').filter(Boolean).pop())

try {
  // A-1: Kasir mendaftarkan member tanpa isian kunjungan dan potongan; kiriman rakitan diabaikan server.
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    const { ctx, page } = await konteks(w, h)
    await masuk(page, AKUN.kasir)
    await buka(page, '/member/baru')
    cek(`A-1 ${w}: Kasir tidak melihat isian kunjungan dan potongan`, (await page.locator('#k-visits').count()) === 0 && (await page.locator('#k-discountOn').count()) === 0)
    cek(`A-1 ${w}: tanpa luapan`, (await luapan(page)) <= 0)
    await potret(page, `${w}-a1-member-kasir`)
    if (w === 390) {
      const wa = `0857${randomInt(10000000, 99999999)}`
      await page.fill('#k-name', `Teman Kasir ${tanda}`)
      await page.fill('#k-wa', wa)
      // Isian kunjungan rakitan, seperti yang dicoba auditor lewat DOM.
      await page.evaluate(() => {
        const f = document.querySelector('form')
        const i = document.createElement('input')
        i.type = 'hidden'
        i.name = 'visits'
        i.value = '999'
        f.appendChild(i)
      })
      await kirimKe(page, tombol('Simpan member'), /\/member\/\d+/)
      const m = await satu('select visits, discount_on from member where name = $1', [`Teman Kasir ${tanda}`])
      cek('A-1: member dari Kasir tersimpan dengan 0 kunjungan dan potongan bawaan', m && m.visits === 0 && m.discount_on === true, JSON.stringify(m))
    }
    // A-4: Kasir tidak melihat kartu jumlah penjualan di Transaksi.
    await buka(page, '/transaksi')
    cek(`A-4 ${w}: Kasir tidak melihat kartu Transaksi selesai dan Penjualan`, (await page.locator('.ringkas-angka').count()) === 0)
    await potret(page, `${w}-a4-transaksi-kasir`)
    await ctx.close()
  }
  {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.admin)
    await buka(page, '/transaksi')
    cek('A-4: Admin tetap melihat kartu jumlah penjualan', (await page.locator('.ringkas-angka').count()) === 1)
    await ctx.close()
  }

  // A-2: peran tambahan yang hanya memegang atur.pengguna.
  const spvRole = (await satu("insert into role (code, name, is_system, active, updated_at) values ($1, 'Supervisor E2E', false, true, now()) returning id", [`spv_${tanda}`])).id
  await sql.query("insert into role_permission (role_id, menu_code, can_view, can_create, can_update, updated_at) values ($1, 'atur.pengguna', true, true, true, now())", [spvRole])
  const sandiSpv = 'sandi-spv-e2e-123'
  await sql.query('insert into app_user (username, name, password_hash, role_id, active, updated_at) values ($1, $2, $3, $4, true, now())', [`spv${tanda}`, 'Supervisor E2E', await bcrypt.hash(sandiSpv, 4), spvRole])
  const adminId = (await satu('select id from app_user where username = $1', [AKUN.admin.u])).id
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const { ctx, page } = await konteks(w, h)
    await masuk(page, { u: `spv${tanda}`, p: sandiSpv })
    await buka(page, '/pengguna/baru')
    const pilihan = await page.locator('#k-roleId option').allTextContents()
    cek(`A-2 ${w}: pilihan peran hanya peran yang tercakup`, JSON.stringify(pilihan) === JSON.stringify(['Pilih peran', 'Supervisor E2E']), pilihan.join(', '))
    await potret(page, `${w}-a2-pengguna-baru-spv`)
    await buka(page, `/pengguna/${adminId}`)
    cek(`A-2 ${w}: rincian Admin tanpa formulir sandi dan ubah`, (await page.locator('#j-sandi').count()) === 0 && (await page.locator('#k-roleId').count()) === 0 && (await page.getByText('hanya bisa diubah Owner').count()) === 1)
    cek(`A-2 ${w}: tanpa luapan`, (await luapan(page)) <= 0)
    await potret(page, `${w}-a2-rincian-admin-spv`)
    await ctx.close()
  }

  // A-6: jenis Tunai sudah dipakai kasir.mjs, jadi pilihannya terkunci.
  {
    const tunai = (await satu("select id from payment_method where kind = 'tunai' order by id limit 1")).id
    const dipakai = (await satu('select count(*)::int n from sale_payment where payment_method_id = $1', [tunai])).n
    const { ctx, page } = await konteks(390, 844)
    await masuk(page, AKUN.owner)
    await buka(page, `/metode-bayar/${tunai}`)
    const opsi = await page.locator('#k-kind option').count()
    cek('A-6: jenis metode Tunai yang sudah dipakai hanya punya satu pilihan', dipakai === 0 || opsi === 1, `${dipakai} pembayaran, ${opsi} pilihan`)
    await potret(page, '390-a6-metode-tunai')
    await ctx.close()
  }

  // B-2: Pembelian Langsung tunai Rp 1.500.000 oleh Admin wajib disetujui Owner; kas minus hanya diperingatkan.
  let idBl = 0
  {
    const pemasok = (await satu('select id from supplier where active order by id limit 1')).id
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.admin)
    await buka(page, '/beli-langsung/baru')
    await page.selectOption('#k-supplierId', String(pemasok))
    await page.selectOption('#k-payMode', 'tunai')
    await kirimKe(page, tombol('Buat draf'), /\/beli-langsung\/\d+\?pesan=draf/)
    idBl = idDari(page.url())
    await page.fill('#k-description', 'Sewa mesin E2E')
    await page.fill('#k-amount', '1500000')
    await kirim(page, tombol('Tambah biaya'))
    cek('B-2: Admin tidak melihat tombol Posting', (await page.locator(tombol('Posting')).count()) === 0)
    cek('B-2: panel menyebut wajib disetujui Owner', (await page.getByText('wajib diajukan dan disetujui Owner').count()) === 1)
    cek('B-2: peringatan saldo kas minus tampil', (await page.locator('.pesan.awas').count()) === 1, (await page.locator('.pesan.awas').first().textContent().catch(() => '')) ?? '')
    await potret(page, '1440-b2-langsung-admin')
    await kirim(page, tombol('Ajukan untuk disetujui'))
    cek('B-2: Diajukan oleh Admin', (await satu('select status from direct_purchase where id = $1', [idBl])).status === 'Diajukan')
    await page.setViewportSize({ width: 390, height: 844 })
    await buka(page, `/beli-langsung/${idBl}`)
    cek('B-2 390: tanpa luapan', (await luapan(page)) <= 0)
    await potret(page, '390-b2-langsung-diajukan')
    await ctx.close()
  }
  {
    const { ctx, page } = await konteks(390, 844)
    await masuk(page, AKUN.owner)
    await buka(page, `/beli-langsung/${idBl}`)
    await potret(page, '390-b2-langsung-owner')
    await kirim(page, tombol('Setujui dan posting'))
    const d = await satu('select status, approved_by from direct_purchase where id = $1', [idBl])
    const ownerId = (await satu('select id from app_user where username = $1', [AKUN.owner.u])).id
    cek('B-2: Owner Setujui dan posting', d.status === 'Diposting' && d.approved_by === ownerId, JSON.stringify(d))
    // B-4: kelompok umur dijumlah sama dengan saldo hutang.
    await buka(page, '/hutang')
    await potret(page, '390-b4-hutang')
    await page.setViewportSize({ width: 1440, height: 900 })
    await buka(page, '/hutang')
    await potret(page, '1440-b4-hutang')
    await ctx.close()
  }
  cek('tidak ada galat konsol', galatKonsol.length === 0, galatKonsol.slice(0, 3).join(' | '))
} catch (e) {
  cek('skrip selesai tanpa galat', false, String(e).slice(0, 300))
} finally {
  await browser.close()
  await sql.end()
  writeFileSync(`${HASIL}e2e-audit-ab.json`, JSON.stringify(hasil, null, 2))
  const gagal = hasil.filter((h) => !h.lulus)
  console.log(`\n${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
  process.exitCode = gagal.length ? 1 : 0
}
