// Memotret bagian atas halaman (bukan seluruh halaman) supaya potret HP yang sangat panjang tetap terbaca saat diperiksa.
// Pakai: BASE_URL=... node tests/e2e/potret-atas.mjs 390 /menu /member ... Hasil: tests/potret/atas-<lebar>-<alamat>.png
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3241'
const POTRET = new URL('../potret/', import.meta.url).pathname
mkdirSync(POTRET, { recursive: true })
const [lebar, ...jalur] = process.argv.slice(2)
const w = Number(lebar) || 390
const akun = { u: process.env.SEED_OWNER_USERNAME, p: process.env.SEED_OWNER_PASSWORD }

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.9' }, locale: 'id-ID' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/masuk`)
  await page.fill('#k-username', akun.u)
  await page.fill('#k-password', akun.p)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/masuk')), page.click('button[type=submit]')])
  for (const j of jalur) {
    await page.goto(`${BASE}${j}`)
    await page.waitForLoadState('networkidle')
    const nama = j.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'beranda'
    await page.screenshot({ path: `${POTRET}atas-${w}-${nama}.png`, fullPage: true, clip: { x: 0, y: 0, width: w, height: 1500 } })
    console.log(`atas-${w}-${nama}.png`)
  }
} finally {
  await browser.close()
}
