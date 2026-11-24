// Uji klik penjualan B2B dan Profil Usaha tahap 6A: pelanggan dengan harga khusus, pesanan, faktur sebagian lalu sisa,
// stok berkurang dengan HPP rata-rata, penerimaan sebagian, retur dengan HPP asal, penerimaan yang memakai nota kredit
// sampai Lunas, piutang cocok, Profil Usaha diubah lalu struk kasir memakai kepala barunya, akses tanpa izin, dan
// Jejak Audit. Dijalankan oleh tests/e2e/jalankan.sh sesudah pembelian.mjs dan sebelum klik.mjs, atau langsung:
// BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/b2b.mjs
// Basis data harus sudah berisi seed, seed:contoh, impor:stok, dan penjualan kasir (kasir.mjs). Potret ke tests/potret/,
// ringkasan ke tests/hasil/e2e-b2b.json.
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
const ITEM_B2B = ['Pelanggan', 'Pesanan Penjualan', 'Faktur Penjualan', 'Terima Pembayaran', 'Retur Penjualan', 'Piutang Pelanggan', 'Profil Usaha']
const tanda = Date.now().toString(36).slice(-5).toUpperCase()
const KODE = `CUS-${tanda}`
const NAMA_PELANGGAN = `Kantor uji ${tanda}`

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
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/masuk'), { timeout: 30000 }), page.click('button[type=submit]')])
}

const luapan = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const potret = (page, nama) => page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
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
const status = async (tabel, id) => (await satu(`select status from ${tabel} where id=$1`, [id])).status
const pesanGalat = async (page) => ((await page.locator('.pesan.galat').allTextContents()) || []).join(' | ')

const outlet = (await satu("select id from location where code='OUTLET'")).id
const kopi = await satu("select id from product where code='BHN-KOPI'")
const kg = (await satu("select id from unit where name='kilogram'")).id
const saldo = async (p) => satu('select coalesce(qty,0)::float8 q, coalesce(value,0)::bigint v, avg_cost::float8 a from stock_balance where product_id=$1 and location_id=$2', [p, outlet])
const cabang = await satu('select b.* from branch b join location l on l.branch_id = b.id where l.id = $1', [outlet])

// 1. Sidebar per peran: item B2B, piutang, dan profil usaha tampil sesuai izin dan tiap halaman terbuka tanpa luapan.
for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]) {
  for (const peran of ['owner', 'admin', 'kasir']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
    const ada = ITEM_B2B.filter((x) => label.includes(x))
    cek(`${w}px ${peran}: item sidebar B2B sesuai izin`, peran === 'kasir' ? ada.length === 0 : ada.length === ITEM_B2B.length, ada.join(', ') || 'tidak ada')
    if (peran !== 'kasir') {
      const grup = await page.$$eval('.samping-judul', (x) => x.map((e) => e.textContent.trim()))
      cek(`${w}px ${peran}: grup Penjualan B2B sesudah Pembelian`, grup.indexOf('Penjualan B2B') === grup.indexOf('Pembelian') + 1, grup.join(', '))
    }
    for (const teks of ada) {
      const href = await page.locator(`.samping nav a:text-is("${teks}")`).getAttribute('href')
      const r = await buka(page, href)
      const h1 = await page.textContent('h1')
      const lebih = await luapan(page)
      cek(`${w}px ${peran}: ${teks} terbuka tanpa luapan`, r.status() === 200 && !/Akses ditolak/.test(h1) && lebih <= 1, `status ${r.status()}, h1 "${h1}", lebih ${lebih}px`)
    }
    cek(`${w}px ${peran}: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 2. Akses tanpa izin ditolak.
{
  const kasus = [
    ['kasir', '/pelanggan', 403], ['kasir', '/pelanggan/baru', 403], ['kasir', '/pesanan-jual/baru', 403], ['kasir', '/faktur-jual', 403],
    ['kasir', '/terima-pelanggan', 403], ['kasir', '/retur-jual/baru', 403], ['kasir', '/piutang', 403], ['kasir', '/piutang/unduh', 403], ['kasir', '/profil-usaha', 403],
    ['admin', '/pelanggan/baru', 200], ['admin', '/faktur-jual/baru', 200], ['admin', '/piutang', 200], ['admin', '/profil-usaha', 200],
  ]
  for (const peran of ['kasir', 'admin']) {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN[peran])
    for (const [, jalur, st] of kasus.filter((x) => x[0] === peran)) {
      const r = await page.goto(`${BASE}${jalur}`)
      const h1 = jalur.endsWith('unduh') ? '' : await page.textContent('h1')
      cek(`${peran}: ${jalur} berstatus ${st}`, r.status() === st && (st === 200 || jalur.endsWith('unduh') || h1.includes('Akses ditolak')), `status ${r.status()}`)
    }
    if (peran === 'kasir') {
      await potret(page, '1440-j-kasir-ditolak')
      const n = (await satu("select count(*)::int n from audit_log where action='izin.ditolak' and (doc_id like '%b2b.%' or doc_id like '%kas.piutang%' or doc_id like '%atur.lokasi%')")).n
      cek('kasir: penolakan halaman B2B tercatat di audit', n >= 3, `${n} baris`)
    } else {
      await page.goto(`${BASE}/profil-usaha`)
      cek('admin: Profil Usaha hanya dibaca (tanpa tombol simpan)', (await page.locator(tombol('Simpan profil')).count()) === 0 && (await page.locator('dl.rincian').count()) >= 1)
    }
    await ctx.close()
  }
}

// 3. Alur lengkap: Admin menyiapkan dan mengajukan, Owner memposting.
const A = await konteks(1440, 900)
const O = await konteks(1440, 900)
await masuk(A.page, AKUN.admin)
await masuk(O.page, AKUN.owner)
const a = A.page
const o = O.page
let idPelanggan, idSo, idF1, idF2, idT1, idT2, idR

// a. Konversi kg biji kopi (Owner), bila pembelian.mjs belum membuatnya.
if (!(await satu('select 1 x from product_unit where product_id=$1 and unit_id=$2', [kopi.id, kg]))) {
  await buka(o, `/produk/${kopi.id}`)
  await o.selectOption('#k-unitId', String(kg))
  await o.fill('#k-factor', '1000')
  await kirim(o, tombol('Simpan konversi'))
}
cek('produk: konversi kg biji kopi ada', !!(await satu('select 1 x from product_unit where product_id=$1 and unit_id=$2', [kopi.id, kg])))

// b. Pelanggan baru (Admin) dengan galat termin yang isiannya terjaga, lalu harga khusus.
await buka(a, '/pelanggan/baru')
await a.fill('#k-code', KODE)
await a.fill('#k-name', NAMA_PELANGGAN)
await a.fill('#k-paymentDays', 'empat belas')
await kirim(a, tombol('Simpan pelanggan'))
cek('pelanggan: galat termin tampil dan isian terjaga', (await a.locator('.pesan.galat').count()) === 1 && (await a.inputValue('#k-name')) === NAMA_PELANGGAN)
await a.fill('#k-paymentDays', '14')
await kirimKe(a, tombol('Simpan pelanggan'), /\/pelanggan\/\d+\?pesan=dibuat/)
idPelanggan = idDari(a.url())
cek('pelanggan: tersimpan dengan termin 14 hari', (await satu('select payment_days from customer where id=$1', [idPelanggan])).payment_days === 14)
await a.selectOption('#k-item', `${kopi.id}:${kg}`)
await a.fill('#k-price', '400.000')
await kirim(a, tombol('Simpan harga'))
cek('pelanggan: harga khusus kopi per kg tersimpan', Number((await satu('select price from customer_price where customer_id=$1', [idPelanggan]))?.price) === 400000, await pesanGalat(a))
await potret(a, '1440-j-pelanggan-rincian')

// c. Pesanan 2 kg dengan harga bawaan dari harga khusus, dikonfirmasi Admin.
await buka(a, `/pesanan-jual/baru?pelanggan=${idPelanggan}`)
await a.fill('#k-customerRef', `PO-${tanda}`)
await kirimKe(a, tombol('Buat draf'), /\/pesanan-jual\/\d+\?pesan=draf/)
idSo = idDari(a.url())
await a.selectOption('#k-item', `${kopi.id}:${kg}`)
await a.fill('#k-qty', '2')
await kirim(a, tombol('Tambah baris'))
const sol = await satu('select id, qty::float8 q, price::bigint h from sales_order_line where sales_order_id=$1', [idSo])
cek('pesanan: baris 2 kg dengan harga khusus Rp 400.000', sol?.q === 2 && Number(sol.h) === 400000, JSON.stringify(sol))
await a.fill(`#k-price_${sol.id}`, '350.000')
await kirim(a, tombol('Simpan qty dan harga'))
cek('pesanan: Admin tanpa saklar Ubah harga jual B2B ditolak mengubah harga', /harga khusus pelanggan/.test(await pesanGalat(a)) && Number((await satu('select price from sales_order_line where id=$1', [sol.id])).price) === 400000)
await potret(a, '1440-j-pesanan-draf')
await buka(a, `/pesanan-jual/${idSo}`)
await kirim(a, tombol('Setujui sekarang'))
cek('pesanan: Disetujui oleh Admin', (await status('sales_order', idSo)) === 'Disetujui', await pesanGalat(a))

// d. Faktur sebagian 1,5 kg (Admin mengajukan, Owner memposting), stok berkurang dengan HPP rata-rata.
const awal = await saldo(kopi.id)
await Promise.all([a.waitForURL(/\/faktur-jual\/baru\?so=/), a.click('a:text-is("Buat faktur")')])
await kirimKe(a, tombol('Buat draf'), /\/faktur-jual\/\d+\?pesan=draf/)
idF1 = idDari(a.url())
const fl = await satu('select id, qty::float8 q from sales_invoice_line where sales_invoice_id=$1', [idF1])
cek('faktur: draf berisi sisa pesanan 2 kg', fl?.q === 2)
await a.fill(`#k-qty_${fl.id}`, '3')
await kirim(a, tombol('Simpan qty dan harga'))
cek('faktur: qty melebihi sisa pesanan ditolak dan isian terjaga', /melebihi sisa pesanan/.test(await pesanGalat(a)) && (await a.inputValue(`#k-qty_${fl.id}`)) === '3')
await a.fill(`#k-qty_${fl.id}`, '1,5')
await kirim(a, tombol('Simpan qty dan harga'))
cek('faktur: total Rp 600.000', Number((await satu('select total from sales_invoice where id=$1', [idF1])).total) === 600000, await pesanGalat(a))
cek('faktur: Admin tidak melihat tombol Posting', (await a.locator(tombol('Posting')).count()) === 0)
await potret(a, '1440-j-faktur-draf')
await kirim(a, tombol('Ajukan'))
cek('faktur: Diajukan oleh Admin', (await status('sales_invoice', idF1)) === 'Diajukan', await pesanGalat(a))
await buka(o, `/faktur-jual/${idF1}`)
await kirim(o, tombol('Posting'))
const f1 = await satu('select status, pay_status, hpp::bigint hpp, due_date::text tempo, date::text tgl from sales_invoice where id=$1', [idF1])
cek('faktur 1: Diposting, Belum bayar', f1.status === 'Diposting' && f1.pay_status === 'BelumBayar', await pesanGalat(o))
const s1 = await saldo(kopi.id)
const hppHarap = Math.round(1500 * awal.a)
cek('stok: berkurang 1500 g dengan HPP rata-rata', s1.q === awal.q - 1500 && Math.abs(Number(f1.hpp) - hppHarap) <= 1 && Number(s1.v) === Number(awal.v) - Number(f1.hpp), `qty ${awal.q} ke ${s1.q}, HPP ${f1.hpp} harap ${hppHarap}`)
cek('faktur 1: jatuh tempo = tanggal + 14 hari', new Date(f1.tempo).getTime() - new Date(f1.tgl).getTime() === 14 * 86_400_000, `${f1.tgl} ke ${f1.tempo}`)
cek('pesanan: progres faktur Sebagian', (await satu('select invoice_progress p from sales_order where id=$1', [idSo])).p === 'Sebagian')
await potret(o, '1440-j-faktur-diposting')
const noF1 = (await satu('select no from sales_invoice where id=$1', [idF1])).no
await buka(o, `/stok/kartu?produk=${kopi.id}&lokasi=${outlet}`)
cek('kartu stok: gerak faktur penjualan bertaut', (await o.locator(`table.tabel a:text-is("${noF1}")`).count()) >= 1)

// e. Faktur sisa 0,5 kg oleh Owner, pesanan Selesai.
await buka(o, `/faktur-jual/baru?so=${idSo}`)
await kirimKe(o, tombol('Buat draf'), /\/faktur-jual\/\d+\?pesan=draf/)
idF2 = idDari(o.url())
await kirim(o, tombol('Posting'))
cek('faktur 2: sisa 0,5 kg Diposting', (await status('sales_invoice', idF2)) === 'Diposting', await pesanGalat(o))
const so2 = await satu('select invoice_progress p, status from sales_order where id=$1', [idSo])
cek('pesanan: difakturkan Penuh dan Selesai', so2.p === 'Penuh' && so2.status === 'Selesai', JSON.stringify(so2))

// f. Penerimaan sebagian Rp 200.000 untuk faktur 1 (Admin mengajukan, Owner memposting).
await buka(a, `/faktur-jual/${idF1}`)
await Promise.all([a.waitForURL(/\/terima-pelanggan\/baru/), a.click('a:text-is("Catat penerimaan")')])
await a.selectOption('#k-tujuan', 'kas')
await kirimKe(a, tombol('Buat draf penerimaan'), /\/terima-pelanggan\/\d+\?pesan=draf/)
idT1 = idDari(a.url())
cek('penerimaan: bawaan alokasi penuh untuk dua faktur', (await a.inputValue(`#k-terima_f${idF1}`)) === '600000' && (await a.inputValue(`#k-terima_f${idF2}`)) === '200000')
await a.fill(`#k-terima_f${idF1}`, '700.000')
await kirim(a, tombol('Simpan alokasi'))
cek('penerimaan: alokasi melebihi sisa ditolak', /melebihi sisanya/.test(await pesanGalat(a)))
await a.fill(`#k-terima_f${idF1}`, '200.000')
await a.fill(`#k-terima_f${idF2}`, '0')
await kirim(a, tombol('Simpan alokasi'))
cek('penerimaan: jumlah Rp 200.000', Number((await satu('select amount from customer_payment where id=$1', [idT1])).amount) === 200000, await pesanGalat(a))
await potret(a, '1440-j-terima-draf')
await kirim(a, tombol('Ajukan'))
await buka(o, `/terima-pelanggan/${idT1}`)
await kirim(o, tombol('Posting'))
cek('penerimaan 1: Diposting', (await status('customer_payment', idT1)) === 'Diposting', await pesanGalat(o))
cek('faktur 1: status bayar Sebagian', (await satu('select pay_status from sales_invoice where id=$1', [idF1])).pay_status === 'Sebagian')

// g. Piutang cocok dengan sisa faktur.
{
  await buka(o, `/piutang?pelanggan=${idPelanggan}`)
  const teks = (await o.textContent('.bl-ringkas')).replace(/\s+/g, ' ')
  const harap = (await satu("select sum(total - paid_amount)::bigint n from sales_invoice where customer_id=$1 and status='Diposting'", [idPelanggan])).n
  cek('piutang: saldo Rp 600.000 dan sama dengan sisa faktur di basis data', Number(harap) === 600000 && teks.includes('Rp 600.000'), teks.slice(0, 120))
  const csv = await o.request.get(`${BASE}/piutang/unduh?pelanggan=${idPelanggan}`)
  const isi = await csv.text()
  cek('piutang: CSV terunduh berisi dua faktur', csv.status() === 200 && isi.split('\r\n').filter((b) => b.includes(NAMA_PELANGGAN)).length === 2 && isi.includes('400000'), isi.slice(0, 160))
  await potret(o, '1440-j-piutang')
}

// h. Retur 0,25 kg dari faktur 2 (Admin mengajukan, Owner memposting): barang kembali dengan HPP asal.
const hppF2 = await satu('select value::bigint v, id from sales_invoice_line where sales_invoice_id=$1', [idF2])
const sebelumRetur = await saldo(kopi.id)
await buka(a, `/faktur-jual/${idF2}`)
await Promise.all([a.waitForURL(/\/retur-jual\/baru\?faktur=/), a.click('a:text-is("Buat retur")')])
await a.fill('#k-reason', 'Kemasan sobek saat dikirim')
await kirimKe(a, tombol('Buat draf retur'), /\/retur-jual\/\d+\?pesan=draf/)
idR = idDari(a.url())
await a.fill(`#k-qty_${hppF2.id}`, '0,25')
await kirim(a, tombol('Simpan qty retur'))
await potret(a, '1440-j-retur-draf')
await kirim(a, tombol('Ajukan'))
await buka(o, `/retur-jual/${idR}`)
await kirim(o, tombol('Posting'))
const r = await satu('select status, total::bigint total, value::bigint v from sales_return where id=$1', [idR])
cek('retur: Diposting dengan nota kredit Rp 100.000', r.status === 'Diposting' && Number(r.total) === 100000, await pesanGalat(o))
const sesudahRetur = await saldo(kopi.id)
cek('retur: stok bertambah 250 g senilai separuh HPP faktur 2', sesudahRetur.q === sebelumRetur.q + 250 && Number(sesudahRetur.v) - Number(sebelumRetur.v) === Math.round(Number(hppF2.v) / 2) && Number(r.v) === Math.round(Number(hppF2.v) / 2), `nilai masuk ${Number(sesudahRetur.v) - Number(sebelumRetur.v)}, HPP baris ${hppF2.v}`)
await potret(o, '1440-j-retur-diposting')

// i. Penerimaan kedua oleh Owner memakai nota kredit: semua faktur Lunas.
await buka(o, `/terima-pelanggan/baru?pelanggan=${idPelanggan}`)
await o.selectOption('#k-tujuan', 'kas')
await kirimKe(o, tombol('Buat draf penerimaan'), /\/terima-pelanggan\/\d+\?pesan=draf/)
idT2 = idDari(o.url())
cek('penerimaan 2: bawaan memakai nota kredit retur', (await o.inputValue(`#k-terima_r${idR}`)) === '100000')
await kirim(o, tombol('Simpan alokasi'))
cek('penerimaan 2: uang masuk Rp 500.000 sesudah nota kredit', Number((await satu('select amount from customer_payment where id=$1', [idT2])).amount) === 500000, await pesanGalat(o))
await kirim(o, tombol('Posting'))
const lunas = await satu("select count(*)::int n from sales_invoice where id = any($1) and pay_status='Lunas'", [[idF1, idF2]])
cek('faktur: keduanya Lunas', lunas.n === 2)
cek('retur: nota kredit terpakai penuh', Number((await satu('select credit_used from sales_return where id=$1', [idR])).credit_used) === 100000)
await buka(o, `/piutang?pelanggan=${idPelanggan}`)
cek('piutang: kosong sesudah Lunas', (await o.locator('text=Tidak ada piutang pelanggan.').count()) === 1)

// j. Pembatalan faktur yang sudah dibayar ditolak.
await buka(o, `/faktur-jual/${idF1}`)
await o.click('summary:text-is("Batalkan dokumen yang sudah Diposting")')
await o.fill('#k-batal-posting-alasan', 'Uji pembatalan ditolak')
await kirim(o, tombol('Batalkan dengan gerak balik'))
cek('faktur: pembatalan ditolak karena sudah dibayar', /sudah dibayar/.test(await pesanGalat(o)) && (await status('sales_invoice', idF1)) === 'Diposting', await pesanGalat(o))

// k. Profil Usaha diubah Owner, struk kasir memakai kepala baru.
const kepala = `GREENBOX ${tanda}`
await buka(o, '/profil-usaha')
await o.fill('#k-receiptHeader', kepala)
await o.fill('#k-npwp', '01.234.567.8-901.000')
await o.fill('#k-taxPct', '30')
// C-5: logo 4 MB ditolak di peramban sebelum dikirim; isian lain tetap, tanpa layar galat.
{
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(4 * 1024 * 1024)])
  await o.setInputFiles('#k-receiptLogo-unggah', { name: 'logo-besar.png', mimeType: 'image/png', buffer: png })
  const pesanBesar = await o.locator('#k-receiptLogo-unggah-terlalu-besar').textContent().catch(() => '')
  const kosong = await o.$eval('#k-receiptLogo-unggah', (i) => i.files.length === 0)
  cek('profil: logo 4 MB ditolak di peramban dengan pesan, isian lain tetap', /paling besar 2 MB/.test(pesanBesar ?? '') && kosong && (await o.inputValue('#k-receiptHeader')) === kepala, pesanBesar)
  await potret(o, '1440-j-profil-logo-besar')
  // Berkas besar yang lolos dari pemeriksaan peramban (dipasang tanpa event change) jatuh ke halaman galat berbahasa
  // Indonesia dengan sidebar tetap tampil, bukan layar galat Next berbahasa Inggris.
  await o.evaluate(() => {
    const i = document.querySelector('#k-receiptLogo-unggah')
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(4 * 1024 * 1024)], 'lolos.png', { type: 'image/png' }))
    i.files = dt.files
  })
  const galatSebelum = O.galat.length
  await o.click(tombol('Simpan profil'))
  await o.waitForSelector('text=Halaman ini gagal dimuat', { timeout: 30000 }).catch(() => {})
  const isi = await o.textContent('main')
  cek('galat: unggahan di atas batas server menampilkan halaman galat berbahasa Indonesia dengan sidebar', /Halaman ini gagal dimuat/.test(isi ?? '') && (await o.locator('nav a[href="/profil-usaha"]').count()) > 0 && !/This page couldn/.test(isi ?? ''), (isi ?? '').slice(0, 120))
  await potret(o, '1440-j-galat-unggah')
  O.galat.splice(galatSebelum)
  await buka(o, '/profil-usaha')
  await o.fill('#k-receiptHeader', kepala)
  await o.fill('#k-npwp', '01.234.567.8-901.000')
  await o.fill('#k-taxPct', '30')
}
await kirim(o, tombol('Simpan profil'))
cek('profil: pajak di atas 25 persen ditolak dan isian terjaga', /antara 0 dan 25/.test(await pesanGalat(o)) && (await o.inputValue('#k-receiptHeader')) === kepala)
await o.fill('#k-taxPct', '10')
await kirim(o, tombol('Simpan profil'))
const b = await satu('select receipt_header h, tax_pct::float8 t, npwp from branch where id=$1', [cabang.id])
cek('profil: tersimpan', b.h === kepala && b.t === 10 && b.npwp === '01.234.567.8-901.000', JSON.stringify(b))
await potret(o, '1440-j-profil-tersimpan')
const jual = await satu("select s.id from sale s join shift h on h.id = s.shift_id join location l on l.id = h.location_id where l.branch_id = $1 order by s.id desc limit 1", [cabang.id])
if (jual) {
  await buka(o, `/struk/${jual.id}`)
  const struk = await o.textContent('.struk')
  cek('struk: memakai kepala dan NPWP baru dari Profil Usaha', struk.includes(kepala) && struk.includes('NPWP 01.234.567.8-901.000'), struk.slice(0, 120))
  await potret(o, '1440-j-struk-kepala-baru')
} else cek('struk: ada penjualan kasir untuk diperiksa', false, 'jalankan kasir.mjs lebih dulu')

// l. Semua langkah tercatat di Jejak Audit.
{
  const periksa = [
    ['customer', idPelanggan, ['Tambah pelanggan', 'Tambah harga khusus pelanggan']],
    ['sales_order', idSo, ['Buat pesanan penjualan', 'Tambah baris pesanan penjualan', 'Setujui pesanan penjualan']],
    ['sales_invoice', idF1, ['Buat faktur penjualan', 'Ubah baris faktur penjualan', 'Ajukan faktur penjualan', 'Posting faktur penjualan']],
    ['customer_payment', idT1, ['Buat penerimaan pelanggan', 'Isi alokasi penerimaan pelanggan', 'Ajukan penerimaan pelanggan', 'Posting penerimaan pelanggan']],
    ['sales_return', idR, ['Buat retur penjualan', 'Ubah baris retur penjualan', 'Ajukan retur penjualan', 'Posting retur penjualan']],
    ['branch', cabang.id, ['Ubah profil usaha']],
  ]
  for (const [entitas, id, aksi] of periksa) {
    await buka(o, `/audit?entitas=${entitas}&dok=${id}`)
    const ada = await o.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
    cek(`audit: ${entitas} lengkap`, aksi.every((x) => ada.includes(x)), ada.join(', '))
  }
  await potret(o, '1440-j-audit')
}
cek('alur admin: tanpa galat konsol', A.galat.length === 0, A.galat.slice(0, 3).join(' | '))
cek('alur owner: tanpa galat konsol', O.galat.length === 0, O.galat.slice(0, 3).join(' | '))
await A.ctx.close()
await O.ctx.close()

// 4. Potret semua halaman baru di kedua lebar (dibuka dan diperiksa manual).
{
  const halaman = [
    ['pelanggan', '/pelanggan'], ['pelanggan-baru', '/pelanggan/baru'], ['pelanggan-rincian', `/pelanggan/${idPelanggan}`],
    ['pesanan', '/pesanan-jual'], ['pesanan-baru', '/pesanan-jual/baru'], ['pesanan-rincian', `/pesanan-jual/${idSo}`],
    ['faktur', '/faktur-jual'], ['faktur-baru', '/faktur-jual/baru'], ['faktur-rincian', `/faktur-jual/${idF1}`],
    ['terima', '/terima-pelanggan'], ['terima-baru', '/terima-pelanggan/baru'], ['terima-rincian', `/terima-pelanggan/${idT2}`],
    ['retur', '/retur-jual'], ['retur-baru', '/retur-jual/baru'], ['retur-rincian', `/retur-jual/${idR}`],
    ['piutang', '/piutang'], ['profil', '/profil-usaha'],
  ]
  for (const { w, h } of [
    { w: 1440, h: 900 },
    { w: 390, h: 844 },
  ]) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN.owner)
    for (const [nama, jalur] of halaman) {
      const r = await buka(page, jalur)
      const lebih = await luapan(page)
      await potret(page, `${w}-j-hal-${nama}`)
      cek(`${w}px owner: ${jalur} terbuka tanpa luapan`, r.status() === 200 && lebih <= 1, `status ${r.status()}, lebih ${lebih}px`)
    }
    cek(`${w}px owner: halaman B2B tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 5. Saldo stok cocok dengan ledger, lalu profil usaha dikembalikan supaya uji berikutnya tidak berubah.
{
  const beda = await satu(`
    with l as (select product_id, location_id, sum(qty) q, sum(value) v from stock_ledger group by 1, 2)
    select count(*)::int n from stock_balance b full join l using (product_id, location_id)
    where coalesce(b.qty, 0) <> coalesce(l.q, 0) or coalesce(b.value, 0) <> coalesce(l.v, 0)`)
  cek('ledger: stock_balance sama dengan jumlah stock_ledger', beda.n === 0, `${beda.n} beda`)
  await sql.query('update branch set receipt_header=$2, tax_pct=$3, service_pct=$4, npwp=$5 where id=$1', [cabang.id, cabang.receipt_header, cabang.tax_pct, cabang.service_pct, cabang.npwp])
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-b2b.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan b2b: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
