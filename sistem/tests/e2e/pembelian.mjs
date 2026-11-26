// Uji klik modul pembelian tahap 4C: permintaan, semua pesanan disetujui Owner, penerimaan sebagian lalu sisa,
// faktur dari dua penerimaan, pembayaran disetujui lalu diposting, retur, pembelian langsung tunai, hutang pemasok,
// akses tanpa izin, dan jejak audit. Dijalankan oleh tests/e2e/jalankan.sh sesudah stok.mjs, atau langsung:
// BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/pembelian.mjs
// Basis data harus sudah berisi seed, seed:contoh, dan impor:stok. Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-pembelian.json.
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
const ITEM_BELI = ['Pemasok', 'Permintaan', 'Pesanan', 'Penerimaan', 'Faktur', 'Retur', 'Pembelian Langsung', 'Pembayaran', 'Hutang Pemasok']
const tanda = Date.now().toString(36).slice(-5).toUpperCase()
const KODE = `E2E-${tanda}`
const NAMA_PEMASOK = `Pemasok uji ${tanda}`

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
// Kirim lalu tunggu pengalihan ke rincian dokumen baru.
async function kirimKe(page, pemilih, pola) {
  await Promise.all([page.waitForURL(pola, { timeout: 60000 }), page.click(pemilih)])
  await page.waitForLoadState('networkidle')
}
const tombol = (teks) => `button[type=submit]:text-is("${teks}")`
const idDari = (url) => Number(new URL(url).pathname.split('/').filter(Boolean).pop())
const status = async (tabel, id) => (await satu(`select status from ${tabel} where id=$1`, [id])).status
const pesanGalat = async (page) => ((await page.locator('.pesan.galat').allTextContents()) || []).join(' | ')

const outlet = (await satu("select id from location where code='OUTLET'")).id
const kopi = await satu("select id, avg_cost::float8 a from product where code='BHN-KOPI'")
const gula = await satu("select p.id, p.base_unit_id u from product p where code='BHN-GULA'")
const kg = (await satu("select id from unit where name='kilogram'")).id
const saldo = async (p) => satu('select coalesce(qty,0)::float8 q, coalesce(value,0)::bigint v, avg_cost::float8 a from stock_balance where product_id=$1 and location_id=$2', [p, outlet])

// 1. Sidebar per peran: item pembelian tampil sesuai izin dan halaman tiap item terbuka tanpa luapan.
for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]) {
  for (const peran of ['owner', 'admin', 'kasir']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
    const ada = ITEM_BELI.filter((x) => label.includes(x))
    cek(`${w}px ${peran}: item sidebar pembelian sesuai izin`, peran === 'kasir' ? ada.length === 0 : ada.length === ITEM_BELI.length, ada.join(', ') || 'tidak ada')
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
    ['kasir', '/pemasok', 403], ['kasir', '/permintaan/baru', 403], ['kasir', '/pesanan', 403], ['kasir', '/penerimaan/baru', 403], ['kasir', '/faktur', 403],
    ['kasir', '/retur-beli', 403], ['kasir', '/beli-langsung/baru', 403], ['kasir', '/pembayaran', 403], ['kasir', '/hutang', 403], ['kasir', '/hutang/unduh', 403],
    ['admin', '/pemasok/baru', 200], ['admin', '/pembayaran/baru', 200], ['admin', '/hutang', 200],
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
      await potret(page, '1440-b-kasir-ditolak')
      const n = (await satu("select count(*)::int n from audit_log where action='izin.ditolak' and doc_id like '%beli.%'")).n
      cek('kasir: penolakan halaman pembelian tercatat di audit', n >= 1, `${n} baris`)
    }
    await ctx.close()
  }
}

// 3. Alur lengkap: Admin menyiapkan, Owner menyetujui.
const A = await konteks(1440, 900)
const O = await konteks(1440, 900)
await masuk(A.page, AKUN.admin)
await masuk(O.page, AKUN.owner)
const a = A.page
const o = O.page
let idPemasok, idPr, idPo, idGr1, idGr2, idFaktur, idBayar, idRetur, idLangsung

// a. Konversi kg untuk biji kopi (Owner, menu Produk dan Satuan).
if (!(await satu('select 1 x from product_unit where product_id=$1 and unit_id=$2', [kopi.id, kg]))) {
  await buka(o, `/produk/${kopi.id}`)
  await o.selectOption('#k-unitId', String(kg))
  await o.fill('#k-factor', '1000')
  await o.check('#k-isPurchase')
  await kirim(o, tombol('Simpan konversi'))
}
cek('produk: konversi kg biji kopi ada', !!(await satu('select 1 x from product_unit where product_id=$1 and unit_id=$2', [kopi.id, kg])))

// b. Pemasok baru (Admin), termasuk galat dengan isian terjaga.
await buka(a, '/pemasok/baru')
await a.fill('#k-code', KODE)
await a.fill('#k-name', NAMA_PEMASOK)
await a.fill('#k-creditDays', 'tiga puluh')
await kirim(a, tombol('Simpan pemasok'))
cek('pemasok: galat termin tampil dan isian terjaga', (await a.locator('.pesan.galat').count()) === 1 && (await a.inputValue('#k-name')) === NAMA_PEMASOK)
await a.fill('#k-creditDays', '30')
await a.fill('#k-phone', '0812 555 0303')
await kirimKe(a, tombol('Simpan pemasok'), /\/pemasok\/\d+\?pesan=dibuat/)
idPemasok = idDari(a.url())
cek('pemasok: tersimpan dengan termin 30 hari', (await satu('select credit_days from supplier where id=$1', [idPemasok])).credit_days === 30)
await potret(a, '1440-b-pemasok-rincian')

// c. Permintaan 12 kg biji kopi, disetujui Admin.
await buka(a, '/permintaan/baru')
await kirimKe(a, tombol('Buat draf'), /\/permintaan\/\d+\?pesan=draf/)
idPr = idDari(a.url())
await a.selectOption('#k-item', `${kopi.id}:${kg}`)
await a.fill('#k-qty', '12')
await kirim(a, tombol('Tambah baris'))
cek('permintaan: baris tersimpan', (await satu('select count(*)::int n from purchase_request_line where purchase_request_id=$1', [idPr])).n === 1)
await potret(a, '1440-b-permintaan-draf')
await kirim(a, tombol('Setujui sekarang'))
cek('permintaan: Disetujui oleh Admin', (await status('purchase_request', idPr)) === 'Disetujui', await pesanGalat(a))

// d. Pesanan dari permintaan, harga 450.000 per kg (total Rp 5.400.000). Semua PO lewat Owner, berapa pun nilainya.
await a.selectOption('#k-supplierId', String(idPemasok))
await kirimKe(a, tombol('Buat draf pesanan'), /\/pesanan\/\d+\?pesan=draf/)
idPo = idDari(a.url())
const pol = await satu('select id, qty::float8 q, price::bigint h from purchase_order_line where purchase_order_id=$1', [idPo])
cek('pesanan: baris dari permintaan 12 kg dengan harga terakhir', pol.q === 12 && Number(pol.h) === Math.round(kopi.a * 1000), `qty ${pol.q}, harga ${pol.h}`)
await a.fill(`#k-price_${pol.id}`, '450.000')
await kirim(a, tombol('Simpan qty dan harga'))
cek('pesanan: total Rp 5.400.000', Number((await satu('select total from purchase_order where id=$1', [idPo])).total) === 5_400_000, await pesanGalat(a))
cek('pesanan: Admin tidak bisa mengonfirmasi langsung, hanya Ajukan', (await a.locator(tombol('Setujui sekarang')).count()) === 0 && (await a.locator(tombol('Ajukan untuk disetujui')).count()) === 1)
await potret(a, '1440-b-pesanan-draf')
await kirim(a, tombol('Ajukan untuk disetujui'))
cek('pesanan: Diajukan, Admin tidak melihat tombol Setujui', (await status('purchase_order', idPo)) === 'Diajukan' && (await a.locator(tombol('Setujui')).count()) === 0)
await buka(o, `/pesanan/${idPo}`)
await kirim(o, tombol('Setujui'))
const po = await satu('select status, approved_by from purchase_order where id=$1', [idPo])
const idOwner = (await satu('select id from app_user where username=$1', [AKUN.owner.u.toLowerCase()])).id
cek('pesanan: Disetujui oleh Owner', po.status === 'Disetujui' && po.approved_by === idOwner)
cek('permintaan: Selesai karena sudah dipesan penuh', (await status('purchase_request', idPr)) === 'Selesai')
await potret(o, '1440-b-pesanan-disetujui')

// e. Penerimaan sebagian 5 kg, lalu sisa 7 kg.
const awal = await saldo(kopi.id)
await buka(a, `/pesanan/${idPo}`)
await Promise.all([a.waitForURL(/\/penerimaan\/baru\?po=/), a.click('a:text-is("Terima barang")')])
await kirimKe(a, tombol('Buat draf penerimaan'), /\/penerimaan\/\d+\?pesan=draf/)
idGr1 = idDari(a.url())
const grl = await satu('select id from goods_receipt_line where goods_receipt_id=$1', [idGr1])
await a.fill(`#k-qty_${grl.id}`, '13')
await kirim(a, tombol('Simpan qty terima'))
cek('penerimaan: qty melebihi sisa pesanan ditolak di formulir', /melebihi sisa/.test(await pesanGalat(a)) && (await a.inputValue(`#k-qty_${grl.id}`)) === '13')
await a.fill(`#k-qty_${grl.id}`, '5')
await kirim(a, tombol('Simpan qty terima'))
await potret(a, '1440-b-penerimaan-draf')
await kirim(a, tombol('Posting'))
cek('penerimaan 1: Diposting', (await status('goods_receipt', idGr1)) === 'Diposting', await pesanGalat(a))
cek('pesanan: progres terima Sebagian', (await satu('select receive_progress p, status from purchase_order where id=$1', [idPo])).p === 'Sebagian')
const s1 = await saldo(kopi.id)
const rataHarap = Math.round(((Number(awal.v) + 2_250_000) / (awal.q + 5000)) * 10000) / 10000
cek('stok: bertambah 5000 g senilai Rp 2.250.000, rata-rata tertimbang', s1.q === awal.q + 5000 && Number(s1.v) === Number(awal.v) + 2_250_000 && Math.abs(s1.a - rataHarap) < 0.0001, `qty ${s1.q}, nilai ${s1.v}, rata ${s1.a} harap ${rataHarap}`)
await potret(a, '1440-b-penerimaan-diposting')

await buka(a, `/penerimaan/baru?po=${idPo}`)
await kirimKe(a, tombol('Buat draf penerimaan'), /\/penerimaan\/\d+\?pesan=draf/)
idGr2 = idDari(a.url())
cek('penerimaan 2: draf berisi sisa 7 kg', (await satu('select qty::float8 q from goods_receipt_line where goods_receipt_id=$1', [idGr2])).q === 7)
await kirim(a, tombol('Posting'))
const po2 = await satu('select receive_progress p, status from purchase_order where id=$1', [idPo])
cek('pesanan: diterima Penuh dan Selesai', po2.p === 'Penuh' && po2.status === 'Selesai', JSON.stringify(po2))

// Posisi stok dan kartu stok dengan harga baru.
const noGr1 = (await satu('select no from goods_receipt where id=$1', [idGr1])).no
await buka(o, `/stok/kartu?produk=${kopi.id}&lokasi=${outlet}`)
const kartu = await o.textContent('table.tabel tbody')
cek('kartu stok: gerak penerimaan dengan harga Rp 450 per gram', kartu.includes(noGr1) && /Rp\s?450(?![\d.,])/.test(kartu), kartu.replace(/\s+/g, ' ').slice(-200))
const tautan = o.locator(`table.tabel a:text-is("${noGr1}")`)
cek('kartu stok: tautan ke penerimaan', (await tautan.count()) >= 1)
await potret(o, '1440-b-kartu-stok')
await buka(o, `/stok?q=BHN-KOPI&lokasi=${outlet}`)
const posisi = await o.textContent('table.tabel tbody')
const s2 = await saldo(kopi.id)
cek('posisi stok: qty kopi sesudah dua penerimaan', posisi.includes(s2.q.toLocaleString('id-ID')), `${s2.q} g`)

// f. Faktur dari dua penerimaan (Admin memposting, selisih harga 0).
await buka(a, '/faktur/baru')
await a.selectOption('#k-supplierId', String(idPemasok))
await a.fill('#k-supplierInvoiceNo', `INV-${tanda}`)
await kirimKe(a, tombol('Buat draf faktur'), /\/faktur\/\d+\?pesan=draf/)
idFaktur = idDari(a.url())
for (const g of [idGr1, idGr2]) {
  await a.selectOption('#k-goodsReceiptId', String(g))
  await kirim(a, tombol('Tarik ke faktur'))
}
const fk = await satu('select total, price_diff from purchase_invoice where id=$1', [idFaktur])
cek('faktur: dua penerimaan tertarik, total Rp 5.400.000 tanpa selisih', Number(fk.total) === 5_400_000 && Number(fk.price_diff) === 0, JSON.stringify(fk))
await potret(a, '1440-b-faktur-draf')
await kirim(a, tombol('Posting'))
const fk2 = await satu('select status, pay_status from purchase_invoice where id=$1', [idFaktur])
cek('faktur: Diposting, Belum bayar', fk2.status === 'Diposting' && fk2.pay_status === 'BelumBayar', await pesanGalat(a))
cek('penerimaan: progres faktur Penuh', (await satu('select count(*)::int n from goods_receipt where id = any($1) and invoice_progress=$2', [[idGr1, idGr2], 'Penuh'])).n === 2)

// g. Pembayaran: Admin mengajukan, Owner menyetujui lalu memposting.
await buka(a, `/pembayaran/baru?pemasok=${idPemasok}`)
await a.selectOption('#k-sumber', 'kas')
await kirimKe(a, tombol('Buat draf pembayaran'), /\/pembayaran\/\d+\?pesan=draf/)
idBayar = idDari(a.url())
cek('pembayaran: bawaan alokasi penuh untuk faktur', (await a.inputValue(`#k-bayar_f${idFaktur}`)) === '5400000')
await kirim(a, tombol('Simpan alokasi'))
cek('pembayaran: jumlah Rp 5.400.000', Number((await satu('select amount from purchase_payment where id=$1', [idBayar])).amount) === 5_400_000, await pesanGalat(a))
await potret(a, '1440-b-pembayaran-draf')
cek('pembayaran: Admin tidak punya tombol Posting di draf', (await a.locator(tombol('Posting')).count()) === 0)
await kirim(a, tombol('Ajukan untuk disetujui'))
cek('pembayaran: Admin tidak bisa menyetujui', (await status('purchase_payment', idBayar)) === 'Diajukan' && (await a.locator(tombol('Setujui')).count()) === 0)
await buka(o, `/pembayaran/${idBayar}`)
await kirim(o, tombol('Setujui'))
cek('pembayaran: Disetujui, faktur masih Belum bayar', (await status('purchase_payment', idBayar)) === 'Disetujui' && (await satu('select pay_status from purchase_invoice where id=$1', [idFaktur])).pay_status === 'BelumBayar')
await kirim(o, tombol('Posting'))
cek('pembayaran: Diposting', (await status('purchase_payment', idBayar)) === 'Diposting', await pesanGalat(o))
cek('faktur: Lunas', (await satu('select pay_status from purchase_invoice where id=$1', [idFaktur])).pay_status === 'Lunas')
await potret(o, '1440-b-pembayaran-diposting')
await buka(o, `/faktur/${idFaktur}`)
cek('faktur: layar menampilkan Lunas', (await o.locator('.kepala .lencana:text-is("Lunas")').count()) === 1)

// h. Retur 1 kg dari penerimaan pertama sesudah difakturkan: nota debit, stok keluar dengan harga terima.
const sebelumRetur = await saldo(kopi.id)
await buka(a, `/penerimaan/${idGr1}`)
await Promise.all([a.waitForURL(/\/retur-beli\/baru/), a.click('a:text-is("Buat retur dari penerimaan ini")')])
await a.fill('#k-reason', 'Kemasan sobek saat diterima')
await kirimKe(a, tombol('Buat draf retur'), /\/retur-beli\/\d+\?pesan=draf/)
idRetur = idDari(a.url())
await a.fill(`#k-qty_${grl.id}`, '1')
await kirim(a, tombol('Simpan qty retur'))
await potret(a, '1440-b-retur-draf')
cek('retur: Admin hanya bisa mengajukan', (await a.locator(tombol('Posting')).count()) === 0)
await kirim(a, tombol('Ajukan ke Owner'))
await buka(o, `/retur-beli/${idRetur}`)
await kirim(o, tombol('Posting'))
const rt = await satu('select status, debit_note_amount n, subtotal v from purchase_return where id=$1', [idRetur])
cek('retur: Diposting, nota debit Rp 450.000, nilai keluar Rp 450.000', rt.status === 'Diposting' && Number(rt.n) === 450_000 && Number(rt.v) === 450_000, JSON.stringify(rt))
const sesudahRetur = await saldo(kopi.id)
cek('stok: berkurang 1000 g senilai Rp 450.000', sesudahRetur.q === sebelumRetur.q - 1000 && Number(sesudahRetur.v) === Number(sebelumRetur.v) - 450_000)
await potret(o, '1440-b-retur-diposting')

// i. Pembelian langsung tunai gula 1000 g @ Rp 18.
const gulaAwal = await saldo(gula.id)
await buka(a, '/beli-langsung/baru')
await a.selectOption('#k-supplierId', String(idPemasok))
await a.selectOption('#k-payMode', 'tunai')
await a.fill('#k-supplierInvoiceNo', `NOTA-${tanda}`)
await kirimKe(a, tombol('Buat draf'), /\/beli-langsung\/\d+\?pesan=draf/)
idLangsung = idDari(a.url())
await a.selectOption('#k-item', `${gula.id}:${gula.u}`)
await a.fill('#k-qty', '1000')
await a.fill('#k-price', '18')
await kirim(a, tombol('Tambah barang'))
await a.fill('#k-description', 'Es batu tidak distok')
await a.fill('#k-amount', '5000')
await kirim(a, tombol('Tambah biaya'))
await potret(a, '1440-b-langsung-draf')
await kirim(a, tombol('Posting'))
const bl = await satu('select status, pay_status, total from direct_purchase where id=$1', [idLangsung])
cek('pembelian langsung: Diposting tunai, Lunas, total Rp 23.000', bl.status === 'Diposting' && bl.pay_status === 'Lunas' && Number(bl.total) === 23_000, JSON.stringify(bl) + ' ' + (await pesanGalat(a)))
const gulaAkhir = await saldo(gula.id)
cek('stok: gula bertambah 1000 g senilai Rp 18.000', gulaAkhir.q === (gulaAwal?.q ?? 0) + 1000 && Number(gulaAkhir.v) === Number(gulaAwal?.v ?? 0) + 18_000)
await potret(a, '1440-b-langsung-diposting')

// j. Hutang pemasok cocok dengan perhitungan dari database.
{
  const harap = await satu(
    `select
      coalesce((select sum(total - paid_amount) from purchase_invoice where supplier_id=$1 and status='Diposting'), 0)
      + coalesce((select sum(total - paid_amount) from direct_purchase where supplier_id=$1 and status='Diposting' and pay_mode='kredit'), 0)
      - coalesce((select sum(debit_note_amount - debit_note_used) from purchase_return where supplier_id=$1 and status='Diposting'), 0) as s`,
    [idPemasok],
  )
  await buka(o, `/hutang?pemasok=${idPemasok}`)
  const teks = (await o.textContent('#j-pemasok + * tbody')) ?? ''
  const rupiah = (n) => `${n < 0 ? '-' : ''}Rp ${Math.abs(n).toLocaleString('id-ID')}`
  cek('hutang: saldo pemasok sama dengan database (nota debit Rp -450.000)', Number(harap.s) === -450_000 && teks.replace(/\s/g, ' ').includes(rupiah(Number(harap.s)).replace(/\s/g, ' ')), `harap ${harap.s}, layar ${teks.replace(/\s+/g, ' ').slice(0, 160)}`)
  await potret(o, '1440-b-hutang')
  const r = await o.request.get(`${BASE}/hutang/unduh?pemasok=${idPemasok}`)
  const csv = await r.text()
  cek('hutang: CSV berisi nota debit retur', r.status() === 200 && csv.startsWith('﻿Pemasok') && csv.includes('Nota debit') && csv.includes('-450000'), csv.slice(0, 120))
}

// k. Semua langkah tercatat di Jejak Audit.
{
  const periksa = [
    ['supplier', idPemasok, ['Tambah pemasok']],
    ['purchase_request', idPr, ['Buat permintaan pembelian', 'Tambah baris permintaan pembelian', 'Setujui permintaan pembelian']],
    ['purchase_order', idPo, ['Buat pesanan pembelian', 'Ubah baris pesanan pembelian', 'Ajukan pesanan pembelian', 'Setujui pesanan pembelian']],
    ['goods_receipt', idGr1, ['Buat penerimaan barang', 'Ubah baris penerimaan barang', 'Posting penerimaan barang']],
    ['purchase_invoice', idFaktur, ['Buat faktur pembelian', 'Tambah baris faktur pembelian', 'Posting faktur pembelian']],
    ['purchase_payment', idBayar, ['Buat pembayaran pembelian', 'Isi alokasi pembayaran pembelian', 'Ajukan pembayaran pembelian', 'Setujui pembayaran pembelian', 'Posting pembayaran pembelian']],
    ['purchase_return', idRetur, ['Buat retur pembelian', 'Ubah baris retur pembelian', 'Ajukan retur pembelian', 'Posting retur pembelian']],
    ['direct_purchase', idLangsung, ['Buat pembelian langsung', 'Tambah baris pembelian langsung', 'Posting pembelian langsung']],
  ]
  for (const [entitas, id, aksi] of periksa) {
    await buka(o, `/audit?entitas=${entitas}&dok=${id}`)
    const ada = await o.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
    cek(`audit: ${entitas} lengkap`, aksi.every((x) => ada.includes(x)), ada.join(', '))
  }
  await potret(o, '1440-b-audit')
}
cek('alur admin: tanpa galat konsol', A.galat.length === 0, A.galat.slice(0, 3).join(' | '))
cek('alur owner: tanpa galat konsol', O.galat.length === 0, O.galat.slice(0, 3).join(' | '))
await A.ctx.close()
await O.ctx.close()

// 4. Formulir banyak baris di 390 px: pesanan dengan tiga baris dan tabel isian qty dan harga.
{
  const { ctx, page, galat } = await konteks(390, 844)
  await masuk(page, AKUN.admin)
  await buka(page, '/pesanan/baru')
  await page.selectOption('#k-supplierId', String(idPemasok))
  await kirimKe(page, tombol('Buat draf'), /\/pesanan\/\d+\?pesan=draf/)
  const idHp = idDari(page.url())
  const produk = (await sql.query("select id, base_unit_id u from product where code in ('BHN-SUSU','BHN-TELUR','BHN-CUP') order by code")).rows
  for (const p of produk) {
    await page.selectOption('#k-item', `${p.id}:${p.u}`)
    await page.fill('#k-qty', '10')
    await kirim(page, tombol('Tambah baris'))
  }
  const n = (await satu('select count(*)::int n from purchase_order_line where purchase_order_id=$1', [idHp])).n
  cek('390px: tiga baris pesanan ditambah dari HP', n === 3)
  const lebih = await luapan(page)
  const isian = await page.$$eval('.bl-tabel input', (x) => x.map((i) => Math.round(i.getBoundingClientRect().width)))
  cek('390px: tabel isian tanpa luapan dan kolom isian cukup lebar', lebih <= 1 && isian.length === 6 && isian.every((w) => w >= 120), `lebih ${lebih}px, lebar ${isian.join(',')}`)
  await potret(page, '390-b-pesanan-banyak-baris')
  await kirim(page, tombol('Hapus draf'))
  cek('390px: draf dihapus', (await satu('select count(*)::int n from purchase_order where id=$1', [idHp])).n === 0)
  cek('390px: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 5. Potret semua halaman baru di kedua lebar (dibuka dan diperiksa manual).
{
  const halaman = [
    ['pemasok', '/pemasok'], ['pemasok-baru', '/pemasok/baru'], ['pemasok-rincian', `/pemasok/${idPemasok}`],
    ['permintaan', '/permintaan'], ['permintaan-baru', '/permintaan/baru'], ['permintaan-rincian', `/permintaan/${idPr}`],
    ['pesanan', '/pesanan'], ['pesanan-baru', '/pesanan/baru'], ['pesanan-rincian', `/pesanan/${idPo}`],
    ['penerimaan', '/penerimaan'], ['penerimaan-baru', `/penerimaan/baru`], ['penerimaan-rincian', `/penerimaan/${idGr1}`],
    ['faktur', '/faktur'], ['faktur-baru', '/faktur/baru'], ['faktur-rincian', `/faktur/${idFaktur}`],
    ['retur', '/retur-beli'], ['retur-baru', '/retur-beli/baru'], ['retur-rincian', `/retur-beli/${idRetur}`],
    ['langsung', '/beli-langsung'], ['langsung-baru', '/beli-langsung/baru'], ['langsung-rincian', `/beli-langsung/${idLangsung}`],
    ['pembayaran', '/pembayaran'], ['pembayaran-baru', '/pembayaran/baru'], ['pembayaran-rincian', `/pembayaran/${idBayar}`],
    ['hutang', '/hutang'],
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
      await potret(page, `${w}-b-hal-${nama}`)
      cek(`${w}px owner: ${jalur} terbuka tanpa luapan`, r.status() === 200 && lebih <= 1, `status ${r.status()}, lebih ${lebih}px`)
    }
    cek(`${w}px owner: halaman pembelian tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 6. Saldo stok cocok dengan ledger sesudah semua langkah.
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
writeFileSync(`${HASIL}e2e-pembelian.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan pembelian: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
