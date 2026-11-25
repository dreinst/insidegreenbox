// Uji klik perbaikan dari panduan (KONTRAK 11 butir 158 sampai 160): Admin mengajukan pesanan pembelian dan kas keluar,
// Owner melihat keduanya di Menunggu Persetujuan dan menyetujuinya dari sana; kasir menjual dengan promo aktif dan
// struknya menampilkan potongan promo; tombol setoran menyebut tanggal. Dijalankan oleh tests/e2e/jalankan.sh sebelum
// klik.mjs, atau langsung: BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/panduan.mjs
// Potret ke tests/potret/pp-*, ringkasan ke tests/hasil/e2e-panduan.json.
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
  [1440, 900],
  [390, 844],
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
const potret = (page, nama) => page.screenshot({ path: `${POTRET}pp-${nama}.png`, fullPage: true })
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
const status = async (tabel, id) => (await satu(`select status::text s from ${tabel} where id = $1`, [id])).s
const ubin = (n) => `.lk-ubin button:has(b:text-is("${n}"))`
const lencana = (page) => page.locator('.samping nav a[href="/menunggu-persetujuan"] .lencana-samping').textContent({ timeout: 2000 }).catch(() => null)
const barisAntre = (page, no) => page.locator('.tabel tbody tr', { has: page.locator(`a:text-is("${no}")`) })

try {
  // 1. Admin mengajukan pesanan pembelian dan kas keluar.
  const A = await konteks(1440, 900)
  await masuk(A.page, AKUN.admin)
  const a = A.page
  const pemasok = (await satu('select id from supplier where active order by id limit 1')).id
  await buka(a, '/pesanan/baru')
  await a.selectOption('#k-supplierId', String(pemasok))
  await kirimKe(a, tombol('Buat draf'), /\/pesanan\/\d+\?pesan=draf/)
  const idPo = idDari(a.url())
  const item = await a.$eval('#k-item', (s) => [...s.options].map((o) => o.value).find((v) => v))
  await a.selectOption('#k-item', item)
  await a.fill('#k-qty', '2')
  await kirim(a, tombol('Tambah baris'))
  const pol = await satu('select id from purchase_order_line where purchase_order_id = $1', [idPo])
  await a.fill(`#k-price_${pol.id}`, '125.000')
  await kirim(a, tombol('Simpan qty dan harga'))
  await kirim(a, tombol('Ajukan untuk disetujui'))
  const po = await satu('select no, status::text s, total from purchase_order where id = $1', [idPo])
  cek('admin: pesanan pembelian Diajukan', po.s === 'Diajukan' && Number(po.total) === 250000, JSON.stringify(po))

  await buka(a, '/kas/baru?jenis=keluar')
  const sumber = await a.$eval('#k-sumber', (s) => [...s.options].map((o) => o.value).find((v) => v))
  await a.selectOption('#k-sumber', sumber)
  await a.fill('#k-partyName', 'Toko Es Batu')
  await kirimKe(a, tombol('Buat draf'), /\/kas\/\d+\?pesan=draf/)
  const idKas = idDari(a.url())
  const akun = (await satu("select id from account where code = '6-1600'")).id
  await a.selectOption('#k-accountId', String(akun))
  await a.fill('#k-amount', '175.000')
  await a.fill('#k-memo', 'Es batu acara')
  await kirim(a, tombol('Tambah baris'))
  await kirim(a, tombol('Ajukan untuk disetujui'))
  const kas = await satu('select no, status::text s from cash_transaction where id = $1', [idKas])
  cek('admin: kas keluar Diajukan', kas.s === 'Diajukan', JSON.stringify(kas))

  // Admin memegang Setujui di Permintaan dan Perintah Produksi, jadi melihat halaman; PO dan kas keluar menunggu Owner.
  const r = await buka(a, '/menunggu-persetujuan')
  cek('admin: halaman Menunggu Persetujuan terbuka', r?.status() === 200)
  const sel = await barisAntre(a, po.no).locator('td[data-label="Tindakan"]').textContent()
  cek('admin: pesanan pembelian menunggu pemegang Setujui', sel?.includes('Menunggu pemegang izin Setujui'), sel)
  await potret(a, '1440-admin-menunggu')
  await A.ctx.close()

  // Kasir tidak memegang Setujui di modul mana pun.
  {
    const K = await konteks(1440, 900)
    await masuk(K.page, AKUN.kasir)
    const rk = await buka(K.page, '/menunggu-persetujuan')
    cek('kasir: Menunggu Persetujuan ditolak 403', rk?.status() === 403)
    cek('kasir: item sidebar tidak tampil', (await K.page.locator('.samping nav a[href="/menunggu-persetujuan"]').count()) === 0)
    await K.ctx.close()
    // Galat konsol 403 dari penolakan yang memang diuji di atas tidak dihitung.
    for (let i = galatKonsol.length - 1; i >= 0; i--) if (galatKonsol[i].includes('403')) galatKonsol.splice(i, 1)
  }

  // 2. Owner melihat keduanya, di Beranda, sidebar, dan halaman, di dua lebar.
  const O = await konteks(1440, 900)
  const o = O.page
  await masuk(o, AKUN.owner)
  for (const [w, h] of LEBAR) {
    await o.setViewportSize({ width: w, height: h })
    await buka(o, '/')
    const angka = Number((await o.textContent('section[aria-labelledby="judul-menunggu"] .angka-besar'))?.trim())
    cek(`${w}px beranda: kartu Menunggu persetujuan berisi angka`, angka >= 2, String(angka))
    cek(`${w}px beranda: tanpa luapan`, (await luapan(o)) <= 0)
    await potret(o, `${w}-beranda-owner`)
    if (w <= 900) {
      await o.click('.tombol-menu')
      await o.waitForSelector('.laci-buka .samping nav a', { state: 'visible' })
      await o.waitForFunction(() => Math.abs(document.querySelector('.samping').getBoundingClientRect().left) < 1)
    }
    const l = await lencana(o)
    cek(`${w}px sidebar: lencana sama dengan angka Beranda`, Number(l?.match(/\d+/)?.[0]) === angka, `${l} lawan ${angka}`)
    if (w <= 900) {
      await potret(o, `${w}-laci-lencana`)
      await o.click('.tutup-laci')
    }
    await buka(o, '/menunggu-persetujuan')
    const teks = await o.textContent('.tabel tbody')
    cek(`${w}px menunggu: pesanan dan kas keluar tampil`, teks?.includes(po.no) && teks.includes(kas.no), `${po.no}, ${kas.no}`)
    const bPo = barisAntre(o, po.no)
    cek(
      `${w}px menunggu: kolom pesanan lengkap`,
      (await bPo.locator('td[data-label="Jenis dokumen"]').textContent()) === 'Pesanan Pembelian' &&
        (await bPo.locator('td[data-label="Nilai"]').textContent())?.includes('250.000') &&
        (await bPo.locator('td[data-label="Pengaju"]').textContent())?.trim().length > 0 &&
        /menit|jam|hari/.test((await bPo.locator('td[data-label="Menunggu"]').textContent()) ?? ''),
    )
    cek(`${w}px menunggu: tanpa luapan`, (await luapan(o)) <= 0, String(await luapan(o)))
    await potret(o, `${w}-menunggu`)
  }
  await o.setViewportSize({ width: 1440, height: 900 })

  // Saringan per jenis.
  await buka(o, '/menunggu-persetujuan?jenis=cash_transaction.keluar')
  const jenisTampil = await o.$$eval('.tabel tbody td[data-label="Jenis dokumen"]', (td) => [...new Set(td.map((x) => x.textContent))])
  cek('menunggu: saringan kas keluar hanya kas keluar', jenisTampil.length === 1 && jenisTampil[0] === 'Kas Keluar', jenisTampil.join(', '))

  // 3. Owner menyetujui pesanan dari antrean.
  await buka(o, '/menunggu-persetujuan')
  await Promise.all([o.waitForURL(`**/pesanan/${idPo}`), barisAntre(o, po.no).locator('td[data-label="Tindakan"] a').click()])
  await o.waitForLoadState('networkidle')
  await kirim(o, tombol('Setujui'))
  cek('owner: pesanan Disetujui dari antrean', (await status('purchase_order', idPo)) === 'Disetujui')
  await buka(o, '/menunggu-persetujuan')
  cek('owner: pesanan hilang dari antrean', (await barisAntre(o, po.no).count()) === 0)

  // Kas keluar: Setujui, lalu muncul lagi sebagai menunggu posting, lalu Posting.
  await Promise.all([o.waitForURL(`**/kas/${idKas}`), barisAntre(o, kas.no).locator('td[data-label="Tindakan"] a').click()])
  await o.waitForLoadState('networkidle')
  await kirim(o, tombol('Setujui'))
  cek('owner: kas keluar Disetujui dari antrean', (await status('cash_transaction', idKas)) === 'Disetujui')
  await buka(o, '/menunggu-persetujuan')
  const bKas = barisAntre(o, kas.no)
  cek('owner: kas keluar Disetujui muncul sebagai menunggu posting', (await bKas.locator('td[data-label="Jenis dokumen"]').textContent()) === 'Kas Keluar (menunggu posting)' && (await bKas.locator('td[data-label="Tindakan"] a').textContent()) === 'Posting')
  await Promise.all([o.waitForURL(`**/kas/${idKas}`), bKas.locator('td[data-label="Tindakan"] a').click()])
  await o.waitForLoadState('networkidle')
  await kirim(o, tombol('Posting'))
  cek('owner: kas keluar Diposting', (await status('cash_transaction', idKas)) === 'Diposting')
  await buka(o, '/menunggu-persetujuan')
  cek('owner: kas keluar hilang dari antrean', (await barisAntre(o, kas.no).count()) === 0)

  // 4. Setoran: tombol menyebut tanggal yang dipilih, teks bantu menjelaskan per metode bayar.
  for (const [w, h] of LEBAR) {
    await o.setViewportSize({ width: w, height: h })
    await buka(o, '/setoran')
    cek(`${w}px setoran: tombol Buat setoran untuk tanggal ini`, (await o.locator('button:text-is("Buat setoran untuk tanggal ini")').count()) === 1 && (await o.locator('button:text-is("Buat setoran hari ini")').count()) === 0)
    const bantu = await o.textContent('#k-tanggal-bantu')
    cek(`${w}px setoran: teks bantu per metode bayar dan shift ditutup`, bantu?.includes('per metode bayar') && bantu.includes('sudah ditutup'), bantu)
    cek(`${w}px setoran: isian tanggal terikat ke teks bantu`, (await o.getAttribute('#k-tanggal', 'aria-describedby'))?.includes('k-tanggal-bantu'))
    cek(`${w}px setoran: tanpa luapan`, (await luapan(o)) <= 0)
    await potret(o, `${w}-setoran`)
  }
  await O.ctx.close()

  // 5. Kasir menjual dengan promo nominal aktif; struk menampilkan potongan promo.
  const nama = `Promo Uji Panduan ${randomInt(1000, 9999)}`
  const promoId = (await satu("insert into promo (name, kind, amount, min_spend, condition, updated_at) values ($1, 'nominal', 5000, 30000, 'Belanja minimal Rp 30.000', now()) returning id", [nama])).id
  try {
    const K = await konteks(1440, 900)
    const k = K.page
    await masuk(k, AKUN.kasir)
    const kasirId = (await satu('select id from app_user where username = $1', [AKUN.kasir.u])).id
    if (!(await satu("select id from shift where user_id = $1 and status = 'Buka'", [kasirId]))) {
      await buka(k, '/shift')
      await k.fill('#k-modal', '0')
      await Promise.all([k.waitForURL(/\/shift\/\d+\?pesan=shift-buka/, { timeout: 30000 }), k.click('button:text-is("Buka shift")')])
    }
    const shift = await satu("select s.id, b.tax_pct::float pajak, b.service_pct::float svc from shift s join location l on l.id = s.location_id join branch b on b.id = l.branch_id where s.user_id = $1 and s.status = 'Buka'", [kasirId])
    const harga = Number((await satu("select price from menu_item where name = 'Kopi Susu Greenbox'")).price)
    const net = harga * 2 - 5000
    const svc = Math.round((net * shift.svc) / 100)
    const total = net + svc + Math.round(((net + svc) * shift.pajak) / 100)
    for (const [w, h] of LEBAR) {
      await k.setViewportSize({ width: w, height: h })
      await buka(k, '/kasir')
      await k.click('button:text-is("Take away")')
      await k.click(ubin('Kopi Susu Greenbox'))
      const satuItem = await k.textContent('.lk-promo')
      cek(`${w}px kasir: promo belum berlaku di bawah belanja minimal`, satuItem?.includes('Promo hari ini') && satuItem.includes(nama.replace(/^Promo /, '')) && !(await k.textContent('.lk-jumlah-dl'))?.includes('Potongan promo'), satuItem)
      await k.click(ubin('Kopi Susu Greenbox'))
      const dl = await k.textContent('.lk-jumlah-dl')
      cek(`${w}px kasir: potongan promo Rp 5.000 dan total ${total}`, dl?.includes(`Potongan promo ${nama.replace(/^Promo /, '')}`) && dl.includes('-Rp 5.000') && dl.includes(total.toLocaleString('id-ID')), dl)
      cek(`${w}px kasir: catatan promo dipakai otomatis`, (await k.textContent('.lk-promo'))?.includes('dipakai otomatis'))
      await k.locator('.lk-cepat button').first().click()
      cek(`${w}px kasir: tanpa luapan`, (await luapan(k)) <= 0)
      await k.locator('#keranjang').scrollIntoViewIfNeeded()
      await potret(k, `${w}-kasir-promo`)
      const sebelum = Number((await satu('select coalesce(max(id),0) n from sale')).n)
      await Promise.all([k.waitForURL((u) => Number(u.searchParams.get('selesai')) > sebelum, { timeout: 30000 }), k.click('button.lk-tombol-bayar')])
      const id = Number(new URL(k.url()).searchParams.get('selesai'))
      const s = await satu('select total, disc, promo_disc, promo_id, promo_name from sale where id = $1', [id])
      cek(`${w}px kasir: penjualan menyimpan potongan promo`, Number(s.total) === total && Number(s.promo_disc) === 5000 && Number(s.disc) === 5000 && s.promo_id === promoId && s.promo_name === nama, JSON.stringify(s))
      const j = await satu("select sum(l.debit)::bigint d, sum(l.credit)::bigint k, sum(case when a.code = '4-3000' then l.debit - l.credit else 0 end)::bigint potong from journal j join journal_line l on l.journal_id = j.id join account a on a.id = l.account_id where j.source_type = 'sale' and j.source_id = $1 and j.reversal_of_id is null", [id])
      cek(`${w}px kasir: jurnal seimbang dengan potongan promo`, j.d === j.k && Number(j.potong) === 5000, JSON.stringify(j))
      await buka(k, `/struk/${id}`)
      const struk = await k.textContent('.struk')
      cek(`${w}px struk: Potongan promo tampil`, struk?.includes(`Potongan promo ${nama.replace(/^Promo /, '')}`) && struk.includes('-Rp 5.000'), struk?.slice(0, 400))
      cek(`${w}px struk: tanpa luapan`, (await luapan(k)) <= 0)
      await potret(k, `${w}-struk-promo`)
      await buka(k, `/transaksi/${id}`)
      cek(`${w}px rincian transaksi: Potongan promo tampil`, (await k.textContent('.struk'))?.includes('Potongan promo'))
    }
    await K.ctx.close()
  } finally {
    await sql.query('update promo set active = false where id = $1', [promoId])
  }

  cek('tanpa galat konsol', galatKonsol.length === 0, galatKonsol.slice(0, 3).join(' | '))
} catch (e) {
  cek('uji berjalan sampai selesai', false, String(e?.stack ?? e).slice(0, 800))
} finally {
  await browser.close()
  await sql.end()
  writeFileSync(`${HASIL}e2e-panduan.json`, JSON.stringify(hasil, null, 2))
  const gagal = hasil.filter((h) => !h.lulus)
  console.log(`\n${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
  process.exit(gagal.length ? 1 : 0)
}
