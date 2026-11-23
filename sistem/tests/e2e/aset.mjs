// Uji klik tahap 6B: jurnal faktur B2B lalu Buku Besar Piutang sama dengan halaman Piutang Pelanggan; kategori dan aset
// tetap, aktivasi berjurnal, hitung penyusutan bulan berjalan lalu cek jurnal, lepas aset dengan laba; anggaran dibuat,
// disetujui, direvisi, lalu realisasinya dicek; akses tanpa izin ditolak; semua langkah di Jejak Audit; dan potret
// setiap halaman baru di 1440 dan 390 px. Dijalankan oleh tests/e2e/jalankan.sh sesudah b2b.mjs dan sebelum klik.mjs,
// atau langsung: BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/aset.mjs
// Basis data harus sudah berisi seed, seed:contoh, dan impor:stok. Potret ke tests/potret/, ringkasan ke
// tests/hasil/e2e-aset.json.
import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const ITEM = { owner: ['Aset Tetap', 'Penyusutan', 'Pelepasan Aset', 'Anggaran', 'Realisasi Anggaran'], admin: ['Aset Tetap', 'Anggaran', 'Realisasi Anggaran'], kasir: [] }
const tanda = Date.now().toString(36).slice(-5).toUpperCase()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const tahun = Number(hariIni.slice(0, 4))
const bulan = Number(hariIni.slice(5, 7))
const NAMA_PERIODE = `${NAMA_BULAN[bulan - 1]} ${tahun}`

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
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-forwarded-for': ipAcak() }, locale: 'id-ID', acceptDownloads: true })
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
const pesanGalat = async (page) => ((await page.locator('.pesan.galat').allTextContents()) || []).join(' | ')
const angka = (t) => Number(String(t).replace(/[^\d-]/g, ''))
async function barisJurnal(docType, id, balik = false) {
  return (
    await semua(
      `select a.code || ' ' || case when l.debit > 0 then 'D ' || l.debit else 'K ' || l.credit end x from journal j join journal_line l on l.journal_id = j.id join account a on a.id = l.account_id
       where j.source_type = $1 and j.source_id = $2 and (j.reversal_of_id is not null) = $3 order by 1`,
      [docType, id, balik],
    )
  ).map((r) => r.x)
}

const outlet = (await satu("select id from location where code='OUTLET'")).id
const piutangAkun = (await satu("select account_id id from account_mapping where key='piutang_usaha'")).id
const bebanSusut = (await satu("select id from account where code='6-1700'")).id

// 1. Sidebar per peran: grup Aset dan Anggaran sesudah Akuntansi, item sesuai izin, tiap halaman terbuka tanpa luapan.
for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]) {
  for (const peran of ['owner', 'admin', 'kasir']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
    const ada = ['Aset Tetap', 'Penyusutan', 'Pelepasan Aset', 'Anggaran', 'Realisasi Anggaran'].filter((x) => label.includes(x))
    cek(`${w}px ${peran}: item sidebar aset dan anggaran sesuai izin`, JSON.stringify(ada) === JSON.stringify(ITEM[peran]), ada.join(', ') || 'tidak ada')
    if (peran !== 'kasir') {
      const grup = await page.$$eval('.samping-judul', (x) => x.map((e) => e.textContent.trim()))
      cek(`${w}px ${peran}: grup Aset dan Anggaran sesudah Akuntansi`, grup.indexOf('Aset dan Anggaran') === grup.indexOf('Akuntansi') + 1, grup.join(', '))
    }
    for (const teks of ada) {
      const href = await page.locator(`.samping nav a:text-is("${teks}")`).getAttribute('href')
      const r = await buka(page, href)
      const h1 = await page.textContent('h1')
      const lebih = await luapan(page)
      cek(`${w}px ${peran}: ${teks} terbuka tanpa luapan`, r.status() === 200 && !/Akses ditolak/.test(h1) && lebih <= 1, `status ${r.status()}, h1 "${h1}", lebih ${lebih}px`)
    }
    if (peran === 'admin') {
      await buka(page, '/aset')
      cek(`${w}px admin: Aset Tetap tanpa tombol tambah`, (await page.locator('a:text-is("Tambah aset")').count()) === 0)
      await buka(page, '/anggaran')
      cek(`${w}px admin: Anggaran tanpa tombol buat`, (await page.locator('a:text-is("Buat anggaran")').count()) === 0)
    }
    cek(`${w}px ${peran}: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

// 2. Akses tanpa izin ditolak dan tercatat di audit.
{
  const kasus = [
    ['kasir', '/aset', 403], ['kasir', '/aset/kategori', 403], ['kasir', '/penyusutan', 403], ['kasir', '/pelepasan-aset', 403], ['kasir', '/anggaran', 403],
    ['kasir', '/realisasi-anggaran', 403], ['kasir', '/realisasi-anggaran/unduh', 403],
    ['admin', '/aset/baru', 403], ['admin', '/penyusutan', 403], ['admin', '/pelepasan-aset', 403], ['admin', '/pelepasan-aset/baru', 403], ['admin', '/anggaran/baru', 403],
    ['admin', '/aset', 200], ['admin', '/aset/kategori', 200], ['admin', '/anggaran', 200], ['admin', '/realisasi-anggaran', 200],
  ]
  for (const peran of ['kasir', 'admin']) {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN[peran])
    for (const [, jalur, st] of kasus.filter((x) => x[0] === peran)) {
      const r = await page.goto(`${BASE}${jalur}`)
      const h1 = jalur.endsWith('unduh') ? '' : await page.textContent('h1')
      cek(`${peran}: ${jalur} berstatus ${st}`, r.status() === st && (st === 200 || jalur.endsWith('unduh') || h1.includes('Akses ditolak')), `status ${r.status()}`)
    }
    if (peran === 'admin') await potret(page, '1440-as-admin-realisasi')
    await ctx.close()
  }
  const n = (await satu("select count(*)::int n from audit_log where action='izin.ditolak' and (doc_id like '%aset.%' or doc_id like '%anggaran.%')")).n
  cek('akses: penolakan halaman aset dan anggaran tercatat di audit', n >= 6, `${n} baris`)
}

const O = await konteks(1440, 900)
await masuk(O.page, AKUN.owner)
const o = O.page

// 3. Faktur B2B diposting, lalu Buku Besar Piutang Usaha sama dengan halaman Piutang Pelanggan.
let idFaktur
{
  const pelanggan = (await satu("insert into customer (code, name, payment_days, updated_at) values ($1, $2, 7, now()) returning id", [`CUS-A${tanda}`, `Kantor aset ${tanda}`])).id
  const barang = await satu(
    `select b.product_id, p.base_unit_id from stock_balance b join product p on p.id = b.product_id
     where b.location_id = $1 and b.qty >= 5 and p.active order by b.qty desc limit 1`,
    [outlet],
  )
  await buka(o, `/faktur-jual/baru?pelanggan=${pelanggan}`)
  await kirimKe(o, tombol('Buat draf'), /\/faktur-jual\/\d+\?pesan=draf/)
  idFaktur = idDari(o.url())
  await o.selectOption('#k-item', `${barang.product_id}:${barang.base_unit_id}`)
  await o.fill('#k-qty', '2')
  await o.fill('#k-price', '125.000')
  await kirim(o, tombol('Tambah baris'))
  await kirim(o, tombol('Posting'))
  const f = await satu('select status, total::bigint total, hpp::bigint hpp from sales_invoice where id=$1', [idFaktur])
  cek('faktur B2B: Diposting dengan total Rp 250.000', f.status === 'Diposting' && Number(f.total) === 250000, (await pesanGalat(o)) || JSON.stringify(f))
  const j = await barisJurnal('sales_invoice', idFaktur)
  cek('faktur B2B: jurnal piutang, penjualan B2B, HPP, persediaan', j.includes('1-1450 D 250000') && j.includes('4-1100 K 250000') && j.some((x) => x.startsWith('5-1000 D')) && j.some((x) => x.startsWith('1-1500 K')), j.join('; '))
  const audit = await satu("select after_json->>'jurnal' j from audit_log where action='faktur_jual.posting' and doc_id=$1", [String(idFaktur)])
  cek('faktur B2B: nomor jurnal di audit posting', /^JU-/.test(audit?.j ?? ''), audit?.j)
  await potret(o, '1440-as-faktur-diposting')

  await buka(o, `/buku-besar?akun=${piutangAkun}&dari=2000-01-01&sampai=${hariIni}`)
  const saldoBuku = angka(await o.locator('.lap-ringkas div:has(dt:text-is("Saldo akhir")) dd').textContent())
  await potret(o, '1440-as-buku-besar-piutang')
  await buka(o, '/piutang')
  const saldoHalaman = angka(await o.locator('.bl-ringkas div:has(dt:text-is("Saldo piutang")) dd').textContent())
  const db = await satu("select coalesce(sum(l.debit - l.credit),0)::bigint n from journal_line l join journal j on j.id=l.journal_id where j.posted_at is not null and l.account_id=$1", [piutangAkun])
  cek('piutang: Buku Besar Piutang Usaha sama dengan halaman Piutang Pelanggan', saldoBuku === saldoHalaman && saldoBuku === Number(db.n) && saldoBuku >= 250000, `buku ${saldoBuku}, halaman ${saldoHalaman}, basis data ${db.n}`)
  cek('piutang: tanda cocok tampil di halaman', (await o.locator('[data-cocok-piutang="ya"]').count()) === 1, await o.locator('[data-cocok-piutang]').textContent().catch(() => 'tidak ada'))
  await potret(o, '1440-as-piutang-cocok')
}

// 4. Kategori dan aset: tambah, galat terjaga, setujui dan aktifkan, jurnal perolehan.
let idKategori, idAset, idRun, idLepas
{
  await buka(o, '/aset/kategori')
  await o.fill('#k-code', `MSN${tanda}`)
  await o.fill('#k-name', `Mesin uji ${tanda}`)
  await o.fill('#k-usefulMonths', '48')
  await kirimKe(o, tombol('Simpan kategori'), /\/aset\/kategori\?pesan=dibuat/)
  idKategori = (await satu('select id from asset_category where code=$1', [`MSN${tanda}`])).id
  cek('kategori: tersimpan dengan umur 48 bulan', (await satu('select useful_months from asset_category where id=$1', [idKategori])).useful_months === 48)

  await buka(o, '/aset/baru')
  await o.fill('#k-name', `Grinder uji ${tanda}`)
  await o.selectOption('#k-categoryId', String(idKategori))
  await o.fill('#k-acquiredDate', hariIni)
  await o.fill('#k-cost', '12.000.000')
  await o.fill('#k-salvage', '12.000.000')
  await o.fill('#k-usefulMonths', '12')
  await kirim(o, tombol('Simpan draf aset'))
  cek('aset: nilai sisa tidak lebih kecil dari perolehan ditolak dan isian terjaga', /Nilai sisa harus lebih kecil/.test(await pesanGalat(o)) && (await o.inputValue('#k-name')) === `Grinder uji ${tanda}`)
  await o.fill('#k-salvage', '0')
  await kirimKe(o, tombol('Simpan draf aset'), /\/aset\/\d+\?pesan=draf/)
  idAset = idDari(o.url())
  await potret(o, '1440-as-aset-draf')
  await kirim(o, tombol('Setujui dan aktifkan'))
  const a = await satu('select status, book_value::bigint b from fixed_asset where id=$1', [idAset])
  cek('aset: aktif dengan nilai buku Rp 12.000.000', a.status === 'aktif' && Number(a.b) === 12000000, (await pesanGalat(o)) || JSON.stringify(a))
  const j = await barisJurnal('fixed_asset', idAset)
  cek('aset: jurnal perolehan debit Peralatan, kredit Kas Besar', JSON.stringify(j) === JSON.stringify(['1-1200 K 12000000', '1-2100 D 12000000']), j.join('; '))
  cek('aset: rincian menampilkan nomor jurnal', (await o.locator('ul[aria-label="Jurnal dokumen"] li').count()) === 1)
  await potret(o, '1440-as-aset-aktif')
}

// 5. Hitung penyusutan bulan berjalan, cek jurnal, dan tidak bisa ganda.
{
  await buka(o, '/penyusutan')
  await potret(o, '1440-as-penyusutan-pratinjau')
  cek('penyusutan: pratinjau memuat aset baru', (await o.locator(`.tabel a:text-is("${(await satu('select code from fixed_asset where id=$1', [idAset])).code}")`).count()) === 1)
  await kirimKe(o, tombol(`Hitung penyusutan ${NAMA_PERIODE}`), /\/penyusutan\/\d+\?pesan=dihitung/)
  idRun = idDari(o.url())
  const r = await satu('select no, total::bigint total, asset_count n, year_month ym from asset_depreciation_run where id=$1', [idRun])
  const baris = await satu('select amount::bigint a from asset_depreciation where run_id=$1 and fixed_asset_id=$2', [idRun, idAset])
  cek('penyusutan: dokumen bulan ini dengan Rp 1.000.000 untuk aset baru', r.ym === hariIni.slice(0, 7) && Number(baris?.a) === 1000000, JSON.stringify(r))
  const j = await barisJurnal('asset_depreciation_run', idRun)
  cek('penyusutan: jurnal debit Beban Penyusutan, kredit Akumulasi', j.some((x) => x.startsWith('6-1700 D')) && j.some((x) => x.startsWith('1-2900 K')) && j.reduce((n, x) => n + (x.includes(' D ') ? angka(x.split(' D ')[1]) : 0), 0) === Number(r.total), j.join('; '))
  await potret(o, '1440-as-penyusutan-rincian')
  await buka(o, '/penyusutan')
  cek('penyusutan: tombol hitung bulan yang sama tidak ditawarkan lagi', (await o.locator(tombol(`Hitung penyusutan ${NAMA_PERIODE}`)).count()) === 0)
  cek('penyusutan: satu dokumen Diposting per bulan', (await satu("select count(*)::int n from asset_depreciation_run where year_month=$1 and status='Diposting'", [hariIni.slice(0, 7)])).n === 1)
  // Dari rincian penyusutan, tautan jurnal membuka Jurnal Umum dengan baris yang sama.
  await buka(o, `/penyusutan/${idRun}`)
  const tautan = o.locator('ul[aria-label="Jurnal dokumen"] a').first()
  const noJurnal = (await tautan.textContent()).trim()
  await Promise.all([o.waitForURL(/\/jurnal\/\d+/), tautan.click()])
  await o.waitForLoadState('networkidle')
  cek('penyusutan: tautan jurnal membuka Jurnal Umum', (await o.textContent('h1')).includes(noJurnal) && (await o.locator('text=Beban Penyusutan').count()) >= 1, noJurnal)
  await potret(o, '1440-as-penyusutan-jurnal')
  await buka(o, `/aset/${idAset}`)
  cek('aset: nilai buku sesudah penyusutan Rp 11.000.000', Number((await satu('select book_value::bigint b from fixed_asset where id=$1', [idAset])).b) === 11000000)
}

// 6. Lepas aset dengan laba.
{
  await Promise.all([o.waitForURL(/\/pelepasan-aset\/baru\?aset=/), o.click('a:text-is("Lepas atau jual aset")')])
  await o.fill('#k-proceeds', '11.500.000')
  await kirimKe(o, tombol('Buat draf pelepasan'), /\/pelepasan-aset\/\d+\?pesan=draf/)
  idLepas = idDari(o.url())
  await potret(o, '1440-as-pelepasan-draf')
  await kirim(o, tombol('Posting pelepasan'))
  const x = await satu('select status, book_value::bigint b, gain_loss::bigint g from asset_disposal where id=$1', [idLepas])
  cek('pelepasan: Diposting, nilai buku Rp 11.000.000, laba Rp 500.000', x.status === 'Diposting' && Number(x.b) === 11000000 && Number(x.g) === 500000, (await pesanGalat(o)) || JSON.stringify(x))
  const j = await barisJurnal('asset_disposal', idLepas)
  cek('pelepasan: jurnal kas, akumulasi, aset, dan laba', JSON.stringify(j) === JSON.stringify(['1-1200 D 11500000', '1-2100 K 12000000', '1-2900 D 1000000', '4-9100 K 500000']), j.join('; '))
  cek('pelepasan: aset berstatus Dilepas', (await satu('select status from fixed_asset where id=$1', [idAset])).status === 'dilepas')
  await potret(o, '1440-as-pelepasan-diposting')
}

// 7. Anggaran: buat, tambah akun, ubah angka, setujui, cek realisasi dan CSV, lalu revisi menjadi versi baru.
let idAnggaran, idRevisi
{
  await buka(o, '/anggaran/baru')
  await o.fill('#k-name', `Operasional ${tanda}`)
  await o.fill('#k-year', String(tahun + 50))
  await kirimKe(o, tombol('Buat draf anggaran'), /\/anggaran\/\d+\?pesan=draf/)
  idAnggaran = idDari(o.url())
  // Tahun yang jauh dipakai supaya tidak bentrok dengan anggaran yang sudah ada; lalu diubah ke tahun ini bila kosong.
  const berlaku = await satu("select id from budget where year=$1 and status='Disetujui' and replaced_at is null", [tahun])
  const tahunUji = berlaku ? tahun + 50 : tahun
  await o.fill('#k-year', String(tahunUji))
  await kirim(o, tombol('Simpan kepala'))
  await o.selectOption('#k-accountId', String(bebanSusut))
  await o.fill('#k-tahunan', '24.000.000')
  await kirim(o, tombol('Tambah akun'))
  const n = (await satu('select count(*)::int n, sum(amount)::bigint s from budget_line where budget_id=$1', [idAnggaran]))
  cek('anggaran: akun ditambah dengan 12 bulan dibagi rata', n.n === 12 && Number(n.s) === 24000000, (await pesanGalat(o)) || JSON.stringify(n))
  await o.fill(`#k-n_${bebanSusut}_${bulan}`, '2,5')
  await kirim(o, tombol('Simpan angka anggaran'))
  cek('anggaran: angka tidak sah ditolak dan isian terjaga', /rupiah bulat/.test(await pesanGalat(o)) && (await o.inputValue(`#k-n_${bebanSusut}_${bulan}`)) === '2,5')
  await o.fill(`#k-n_${bebanSusut}_${bulan}`, '1.600.000')
  await kirim(o, tombol('Simpan angka anggaran'))
  cek('anggaran: angka bulan ini tersimpan', Number((await satu('select amount from budget_line where budget_id=$1 and account_id=$2 and month=$3', [idAnggaran, bebanSusut, bulan])).amount) === 1600000, await pesanGalat(o))
  await potret(o, '1440-as-anggaran-draf')
  await kirim(o, tombol('Setujui anggaran'))
  cek('anggaran: Disetujui', (await satu('select status from budget where id=$1', [idAnggaran])).status === 'Disetujui', await pesanGalat(o))
  cek('anggaran: Disetujui tanpa isian angka', (await o.locator(`#k-n_${bebanSusut}_${bulan}`).count()) === 0)

  await buka(o, `/realisasi-anggaran?tahun=${tahunUji}&bulan=${bulan}`)
  const baris = o.locator('.tabel tbody tr', { has: o.locator('td[data-label="Akun"]:has-text("6-1700")') })
  const sel = async (label) => (await baris.locator(`td[data-label="${label}"]`).textContent()).trim()
  const realHarap = tahunUji === tahun ? Number((await satu("select coalesce(sum(l.debit-l.credit),0)::bigint n from journal_line l join journal j on j.id=l.journal_id where j.posted_at is not null and l.account_id=$1 and date_trunc('month', j.date) = date_trunc('month', $2::date)", [bebanSusut, hariIni])).n) : 0
  const real = angka(await sel('Realisasi'))
  cek('realisasi: anggaran bulan ini Rp 1.600.000 dan realisasi dari jurnal', angka(await sel('Anggaran')) === 1600000 && real === realHarap && (tahunUji !== tahun || real >= 1000000), `realisasi ${real}, harap ${realHarap}`)
  const persen = Math.round((realHarap / 1600000) * 1000) / 10
  cek('realisasi: selisih dan persen', angka(await sel('Selisih')) === realHarap - 1600000 && (await sel('Persen')).startsWith(`${persen.toLocaleString('id-ID')}%`), `${await sel('Selisih')} / ${await sel('Persen')}`)
  await potret(o, '1440-as-realisasi')
  const [unduh] = await Promise.all([o.waitForEvent('download', { timeout: 15000 }), o.click('a:text-is("Unduh CSV")')])
  const csv = readFileSync(await unduh.path(), 'utf8')
  cek('realisasi: CSV berisi akun dan bulan', csv.startsWith('﻿Tahun,Bulan,Kode akun') && csv.includes(`${tahunUji},${bulan},6-1700,`), unduh.suggestedFilename())

  await buka(o, `/anggaran/${idAnggaran}`)
  await kirimKe(o, tombol('Buat revisi'), /\/anggaran\/\d+\?pesan=revisi/)
  idRevisi = idDari(o.url())
  const rv = await satu('select version, revised_from_id, status from budget where id=$1', [idRevisi])
  cek('revisi: draf versi 2 dari anggaran asal', rv.version === 2 && rv.revised_from_id === idAnggaran && rv.status === 'Draft', JSON.stringify(rv))
  await o.fill(`#k-n_${bebanSusut}_${bulan}`, '2.000.000')
  await kirim(o, tombol('Simpan angka anggaran'))
  await kirim(o, tombol('Setujui anggaran'))
  const lama = await satu('select status, replaced_at is not null diganti from budget where id=$1', [idAnggaran])
  cek('revisi: disetujui dan versi lama digantikan tetapi tetap tersimpan', (await satu('select status from budget where id=$1', [idRevisi])).status === 'Disetujui' && lama.status === 'Disetujui' && lama.diganti, JSON.stringify(lama))
  await buka(o, `/realisasi-anggaran?tahun=${tahunUji}&bulan=${bulan}`)
  cek('revisi: realisasi memakai angka versi baru', angka(await o.locator('.tabel tbody tr', { has: o.locator('td[data-label="Akun"]:has-text("6-1700")') }).locator('td[data-label="Anggaran"]').textContent()) === 2000000)
  await potret(o, '1440-as-anggaran-revisi')
}

// 8. Semua langkah tercatat di Jejak Audit.
{
  const periksa = [
    ['sales_invoice', idFaktur, ['Buat faktur penjualan', 'Tambah baris faktur penjualan', 'Posting faktur penjualan']],
    ['asset_category', idKategori, ['Tambah kategori aset']],
    ['fixed_asset', idAset, ['Buat draf aset', 'Setujui dan aktifkan aset']],
    ['asset_depreciation_run', idRun, ['Hitung penyusutan']],
    ['asset_disposal', idLepas, ['Buat pelepasan aset', 'Posting pelepasan aset']],
    ['budget', idAnggaran, ['Buat anggaran', 'Ubah kepala anggaran', 'Tambah akun anggaran', 'Ubah angka anggaran', 'Setujui anggaran']],
    ['budget', idRevisi, ['Buat revisi anggaran', 'Ubah angka anggaran', 'Setujui anggaran']],
  ]
  for (const [entitas, id, aksi] of periksa) {
    await buka(o, `/audit?entitas=${entitas}&dok=${id}`)
    const ada = await o.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
    cek(`audit: ${entitas} #${id} lengkap`, aksi.every((x) => ada.includes(x)), ada.join(', '))
  }
  await potret(o, '1440-as-audit')
}
cek('alur owner: tanpa galat konsol', O.galat.length === 0, O.galat.slice(0, 3).join(' | '))
await O.ctx.close()

// 9. Potret semua halaman baru di kedua lebar (dibuka dan diperiksa manual).
{
  const draf = (await satu('insert into budget (no, name, year, status, updated_at) values ($1, $2, $3, $4, now()) returning id', [`AG-UJI-${tanda}`, `Draf potret ${tanda}`, tahun + 60, 'Draft'])).id
  await sql.query('insert into budget_line (budget_id, account_id, month, amount) select $1, $2, m, 1000000 from generate_series(1, 12) m', [draf, bebanSusut])
  const halaman = [
    ['aset', '/aset'], ['aset-baru', '/aset/baru'], ['aset-rincian', `/aset/${idAset}`], ['kategori', '/aset/kategori'], ['kategori-rincian', `/aset/kategori/${idKategori}`],
    ['penyusutan', '/penyusutan'], ['penyusutan-rincian', `/penyusutan/${idRun}`],
    ['pelepasan', '/pelepasan-aset'], ['pelepasan-baru', '/pelepasan-aset/baru'], ['pelepasan-rincian', `/pelepasan-aset/${idLepas}`],
    ['anggaran', '/anggaran'], ['anggaran-baru', '/anggaran/baru'], ['anggaran-rincian', `/anggaran/${idRevisi}`], ['anggaran-draf', `/anggaran/${draf}`],
    ['realisasi', '/realisasi-anggaran'], ['pemetaan', '/akun/pemetaan'],
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
      await potret(page, `${w}-as-hal-${nama}`)
      cek(`${w}px owner: ${jalur} terbuka tanpa luapan`, r.status() === 200 && lebih <= 1, `status ${r.status()}, lebih ${lebih}px`)
    }
    cek(`${w}px owner: halaman aset dan anggaran tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
  await sql.query('delete from budget where id=$1', [draf])
}

// 10. Persediaan buku sama dengan stok untuk dokumen yang sudah berjurnal, dan piutang tetap cocok di akhir.
{
  const tanpaJurnal = BigInt(
    (await satu('select coalesce(sum(g.value),0)::text n from stock_ledger g where not exists (select 1 from journal j where j.source_type=g.doc_type and j.source_id=g.doc_id and j.reversal_of_id is null)')).n,
  )
  const stok = BigInt((await satu('select coalesce(sum(value),0)::text n from stock_balance')).n)
  const buku = BigInt((await satu("select coalesce(sum(l.debit-l.credit),0)::text n from journal_line l join journal j on j.id=l.journal_id where j.posted_at is not null and l.account_id in (select account_id from account_mapping where key='persediaan' or key like 'persediaan.%')")).n)
  cek('persediaan: buku = stok dikurangi gerak yang belum berjurnal', stok - tanpaJurnal === buku, `stok ${stok}, buku ${buku}, belum berjurnal ${tanpaJurnal}`)
  const b2b = (await satu("select count(*)::int n from stock_ledger g where g.doc_type in ('sales_invoice','sales_return') and not exists (select 1 from journal j where j.source_type=g.doc_type and j.source_id=g.doc_id and j.reversal_of_id is null)")).n
  cek('persediaan: semua gerak faktur dan retur penjualan berjurnal', b2b === 0, `${b2b} gerak tanpa jurnal`)
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-aset.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan aset: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
