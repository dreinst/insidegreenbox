// Uji klik tahap 4B di 1440 dan 390 px: buat resep menu, jual menu itu di kasir lalu cek kartu stok bahan dan HPP,
// void lalu cek stok kembali, BOM assembly dan produksi cepat untuk produk setengah jadi (termasuk batal lewat gerak
// balik), alur Perintah Produksi, Pengeluaran Bahan, Hasil Produksi sampai Selesai, akses tanpa izin ditolak, sidebar
// berkelompok, dan semua langkah di Jejak Audit. Dijalankan tests/e2e/jalankan.sh sesudah stok.mjs dan sebelum klik.mjs.
// Basis data harus berisi seed, seed:contoh, impor:menu, seed-kasir-uji, dan impor:stok. Ringkasan ke tests/hasil/e2e-produksi.json.
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
  { w: 1440, h: 900, menu: 'Teh Lemon' },
  { w: 390, h: 844, menu: 'Matcha Susu' },
]
const GRUP_HARAP = {
  // Grup sesudah gabungan tahap 4C, 5B, dan 6A.
  owner: ['Kasir', 'Menu', 'Persediaan', 'Produksi', 'Pembelian', 'Penjualan B2B', 'Keuangan', 'Akuntansi', 'Laporan', 'Pengaturan'],
  admin: ['Kasir', 'Menu', 'Persediaan', 'Produksi', 'Pembelian', 'Penjualan B2B', 'Keuangan', 'Akuntansi', 'Laporan', 'Pengaturan'],
  kasir: ['Kasir', 'Menu'],
}
const tanda = Date.now().toString(36).slice(-4).toUpperCase()

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
const potret = async (page, nama) => {
  // Gulir ke atas dulu supaya header dan sidebar yang menempel tidak terpotret di tengah halaman.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(100)
  await page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
  const lebih = await luapan(page)
  cek(`potret ${nama} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
}
const buka = async (page, jalur) => {
  const r = await page.goto(`${BASE}${jalur}`)
  await page.waitForLoadState('networkidle')
  return r
}
const teks = (page) => page.evaluate(() => document.querySelector('main')?.innerText ?? '')
const idDari = (url) => Number(new URL(url).pathname.split('/').filter(Boolean).pop())
// Kirim formulir lewat tombol berteks tertentu lalu tunggu pengalihan ke alamat yang cocok.
// Menunggu jawaban POST aksi server dulu, karena alamat sesudah kiriman kedua bisa sama dengan alamat sebelumnya.
async function kirimKe(page, label, pola) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 30000 }), page.click(`button[type=submit]:text-is("${label}")`)])
  await page.waitForURL(pola, { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}
const produk = async (kode) => (await satu('select id, name from product where code=$1', [kode]))
const saldo = async (idProduk, kodeLokasi) =>
  (await satu('select coalesce((select b.qty from stock_balance b join location l on l.id=b.location_id where b.product_id=$1 and l.code=$2), 0)::float8 q, coalesce((select b.value from stock_balance b join location l on l.id=b.location_id where b.product_id=$1 and l.code=$2), 0)::text v', [idProduk, kodeLokasi]))
const aksiAudit = async (page, entitas, id) => {
  await buka(page, `/audit?entitas=${entitas}&dok=${id}`)
  return page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
}

const teh = await produk('BHN-TEH')
const cup = await produk('BHN-CUP')
const kopi = await produk('BHN-KOPI')
const es = await produk('BHN-ES')
const idOutlet = (await satu("select id from location where code='OUTLET'")).id

for (const { w, h, menu } of LEBAR) {
  const owner = await konteks(w, h)
  await masuk(owner.page, AKUN.owner)
  const p = owner.page

  // 1. Sidebar berkelompok dan halaman daftar baru.
  if (w <= 900) {
    await p.click('.tombol-menu')
    await p.waitForSelector('.laci-buka .samping')
    await p.waitForTimeout(350)
  }
  const judul = await p.$$eval('.samping-judul', (x) => x.map((e) => e.textContent.trim()))
  cek(`${w}px owner: judul grup sidebar`, JSON.stringify(judul) === JSON.stringify(GRUP_HARAP.owner), judul.join(', '))
  const produksiItem = await p.$$eval('#grup-produksi ~ a', (a) => a.map((x) => x.textContent.trim()))
  cek(`${w}px owner: grup Produksi berisi empat menu`, JSON.stringify(produksiItem) === JSON.stringify(['Perintah Produksi', 'Pengeluaran Bahan', 'Hasil Produksi', 'Produksi Cepat']), produksiItem.join(', '))
  await p.screenshot({ path: `${POTRET}${w}-p-sidebar-grup.png` })
  if (w <= 900) {
    await p.locator('.samping').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await p.waitForTimeout(200)
    await p.screenshot({ path: `${POTRET}${w}-p-sidebar-grup-bawah.png` })
    await p.click('.tutup-laci')
  }
  for (const [jalur, nama] of [
    ['/resep', 'resep'],
    ['/perintah-produksi', 'perintah'],
    ['/pengeluaran-bahan', 'pengeluaran'],
    ['/hasil-produksi', 'hasil'],
    ['/produksi-cepat', 'cepat'],
  ]) {
    const r = await buka(p, jalur)
    cek(`${w}px owner: ${jalur} terbuka`, r.status() === 200, `status ${r.status()}`)
    await potret(p, `${w}-p-${nama}-daftar`)
  }
  await buka(p, '/resep')
  cek(`${w}px owner: peringatan menu tanpa resep tampil`, (await teks(p)).includes('Menu tanpa resep'))

  // 2. Resep menu lewat layar.
  await buka(p, '/resep/baru?jenis=menu')
  await p.selectOption('#k-menuItemId', { label: menu })
  await p.fill('#k-name', `Resep ${menu} ${tanda}`)
  await potret(p, `${w}-p-resep-baru`)
  await kirimKe(p, 'Buat resep', /\/resep\/\d+\?pesan=dibuat/)
  const idResep = idDari(p.url())
  await p.selectOption('#k-productId', String(teh.id))
  await p.fill('#k-qty', '4')
  await kirimKe(p, 'Simpan bahan', /pesan=bahan/)
  await p.selectOption('#k-productId', String(cup.id))
  await p.fill('#k-qty', '1')
  await kirimKe(p, 'Simpan bahan', /pesan=bahan/)
  const bahan = await p.$$eval('.tabel tbody td[data-label="Bahan"] .tebal', (x) => x.map((e) => e.textContent.trim()))
  const hppLayar = await p.textContent('.angka-besar-kecil')
  cek(`${w}px resep: dua bahan dan HPP per porsi tampil`, bahan.length === 2 && /Rp [1-9]/.test(hppLayar ?? ''), `${bahan.join(', ')}; HPP ${hppLayar}`)
  await potret(p, `${w}-p-resep-rincian`)
  // Isian tidak sah ditolak dengan pesan di kolomnya dan isian terjaga.
  await p.selectOption('#k-productId', String(teh.id))
  await p.fill('#k-qty', 'abc')
  await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), p.click('button[type=submit]:text-is("Simpan bahan")')])
  await p.waitForSelector('#k-qty-g')
  cek(`${w}px resep: qty tidak sah ditolak dan isian terjaga`, (await p.inputValue('#k-qty')) === 'abc', await p.textContent('#k-qty-g'))
  await potret(p, `${w}-p-resep-galat`)

  // 3. Jual menu itu di kasir, lalu cek stok bahan, kartu stok, dan HPP.
  const kasir = await konteks(w, h)
  await masuk(kasir.page, AKUN.kasir)
  const k = kasir.page
  const idKasir = (await satu('select id from app_user where username=$1', [AKUN.kasir.u])).id
  if (!(await satu("select id from shift where user_id=$1 and status='Buka'", [idKasir]))) {
    await buka(k, '/shift')
    await k.fill('#k-modal', '100.000')
    await kirimKe(k, 'Buka shift', /pesan=shift-buka/)
  }
  const tehAwal = await saldo(teh.id, 'OUTLET')
  const cupAwal = await saldo(cup.id, 'OUTLET')
  await buka(k, '/kasir')
  await k.click('.pil.gulir button:text-is("Non-coffee")')
  await k.click(`.lk-ubin button:has(b:text-is("${menu}"))`)
  await k.click(`.lk-ubin button:has(b:text-is("${menu}"))`)
  await k.click('button:text-is("Take away")')
  await k.fill('#k-jumlah-0', '200000')
  const idSebelum = Number((await satu('select coalesce(max(id),0) n from sale')).n)
  await Promise.all([k.waitForURL((u) => Number(u.searchParams.get('selesai')) > idSebelum, { timeout: 20000 }), k.click('button.lk-tombol-bayar')])
  const idJual = Number(new URL(k.url()).searchParams.get('selesai'))
  const jual = await satu('select no, hpp::text from sale where id=$1', [idJual])
  const tehJual = await saldo(teh.id, 'OUTLET')
  const cupJual = await saldo(cup.id, 'OUTLET')
  cek(`${w}px jual: bahan resep berkurang (teh 8 g, cup 2)`, Math.abs(tehAwal.q - tehJual.q - 8) < 1e-9 && Math.abs(cupAwal.q - cupJual.q - 2) < 1e-9, `teh ${tehAwal.q} ke ${tehJual.q}, cup ${cupAwal.q} ke ${cupJual.q}`)
  const nilaiKeluar = -Number((await satu("select coalesce(sum(value),0)::text v from stock_ledger where doc_type='sale' and doc_id=$1 and not is_reversal", [idJual])).v)
  cek(`${w}px jual: HPP terisi dari nilai keluar`, Number(jual.hpp) > 0 && Number(jual.hpp) === nilaiKeluar, `hpp ${jual.hpp}, nilai keluar ${nilaiKeluar}`)
  await kasir.ctx.close()
  await buka(p, `/stok/kartu?produk=${teh.id}&lokasi=${idOutlet}`)
  const kartu = await teks(p)
  cek(`${w}px kartu stok: gerak penjualan tampil dengan nomornya`, kartu.includes(jual.no) && kartu.includes('Penjualan'), jual.no)
  await potret(p, `${w}-p-kartu-stok-jual`)
  await buka(p, `/transaksi/${idJual}`)
  cek(`${w}px transaksi: HPP tampil di rincian`, (await teks(p)).includes('HPP Rp'))
  await potret(p, `${w}-p-transaksi-hpp`)

  // 4. Void mengembalikan stok bahan lewat gerak balik.
  await p.fill('#k-alasan', 'Uji void produksi')
  await kirimKe(p, 'Void transaksi', /pesan=void/)
  const tehVoid = await saldo(teh.id, 'OUTLET')
  const balik = await satu("select count(*)::int n from stock_ledger where doc_type='sale' and doc_id=$1 and is_reversal", [idJual])
  cek(`${w}px void: stok dan nilai bahan kembali`, Math.abs(tehVoid.q - tehAwal.q) < 1e-9 && tehVoid.v === tehAwal.v && balik.n === 2, `teh ${tehVoid.q}/${tehVoid.v} lawan ${tehAwal.q}/${tehAwal.v}, ${balik.n} gerak balik`)

  // 5. Produk setengah jadi, BOM assembly, dan produksi cepat.
  const kodeCb = `CB-${tanda}-${w}`
  await buka(p, '/produk/baru')
  await p.fill('#k-code', kodeCb)
  await p.fill('#k-name', `Cold brew ${tanda} ${w}`)
  await p.selectOption('#k-kind', 'setengah_jadi')
  await p.selectOption('#k-baseUnitId', { label: 'mililiter (ml)' })
  await kirimKe(p, 'Simpan produk', /\/produk\/\d+\?pesan=dibuat/)
  const cb = await produk(kodeCb)
  await buka(p, '/resep/baru?jenis=assembly')
  await p.selectOption('#k-productId', String(cb.id))
  await p.fill('#k-name', `BOM cold brew ${tanda} ${w}`)
  await p.fill('#k-outputQty', '1000')
  await p.fill('#k-extraCost', '2.000')
  await potret(p, `${w}-p-bom-baru`)
  await kirimKe(p, 'Buat BOM', /\/resep\/\d+\?pesan=dibuat/)
  const idBom = idDari(p.url())
  await p.selectOption('#k-productId', String(kopi.id))
  await p.fill('#k-qty', '100')
  await p.fill('#k-tolPct', '5')
  await kirimKe(p, 'Simpan bahan', /pesan=bahan/)
  await p.selectOption('#k-productId', String(es.id))
  await p.fill('#k-qty', '500')
  await kirimKe(p, 'Simpan bahan', /pesan=bahan/)
  await potret(p, `${w}-p-bom-rincian`)

  await buka(p, '/produksi-cepat/baru')
  await p.selectOption('#k-bomId', String(idBom))
  await p.fill('#k-qty', '2')
  await potret(p, `${w}-p-cepat-baru`)
  await kirimKe(p, 'Buat draf', /\/produksi-cepat\/\d+\?pesan=draf/)
  const idCepat = idDari(p.url())
  await potret(p, `${w}-p-cepat-draf`)
  const kopiAwal = await saldo(kopi.id, 'OUTLET')
  await kirimKe(p, 'Posting', /pesan=posting/)
  const pc = await satu("select status, value::text, extra_cost::text from quick_production where id=$1", [idCepat])
  const bahanCepat = -Number((await satu("select sum(value)::text v from stock_ledger where doc_type='quick_production' and doc_id=$1 and qty < 0", [idCepat])).v)
  const cbSaldo = await saldo(cb.id, 'OUTLET')
  cek(`${w}px produksi cepat: Diposting, hasil 2000 ml bernilai bahan + biaya`, pc.status === 'Diposting' && cbSaldo.q === 2000 && Number(pc.value) === bahanCepat + 4000 && cbSaldo.v === pc.value, `${JSON.stringify(pc)}, bahan ${bahanCepat}, saldo ${cbSaldo.q}/${cbSaldo.v}`)
  cek(`${w}px produksi cepat: kopi berkurang 200 g`, Math.abs(kopiAwal.q - (await saldo(kopi.id, 'OUTLET')).q - 200) < 1e-9)
  await potret(p, `${w}-p-cepat-diposting`)
  // Pembatalan lewat gerak balik (Owner punya saklar dok.batal_posting).
  await p.click('summary:text-is("Batalkan dokumen yang sudah Diposting")')
  await p.fill('.lipat-batal[open] #k-alasan', 'Uji pembatalan produksi')
  await kirimKe(p, 'Batalkan dengan gerak balik', /pesan=batal_posting/)
  const cbBatal = await saldo(cb.id, 'OUTLET')
  const kopiBatal = await saldo(kopi.id, 'OUTLET')
  cek(`${w}px produksi cepat: batal mengembalikan bahan dan mengeluarkan hasil`, cbBatal.q === 0 && cbBatal.v === '0' && kopiBatal.q === kopiAwal.q && kopiBatal.v === kopiAwal.v, `cb ${cbBatal.q}/${cbBatal.v}, kopi ${kopiBatal.q}`)
  await potret(p, `${w}-p-cepat-batal`)

  // 6. Perintah Produksi, Pengeluaran Bahan, Hasil Produksi sampai Selesai.
  await buka(p, '/perintah-produksi/baru')
  await p.selectOption('#k-bomId', String(idBom))
  await p.fill('#k-plannedQty', '1500')
  await potret(p, `${w}-p-perintah-baru`)
  await kirimKe(p, 'Buat draf', /\/perintah-produksi\/\d+\?pesan=draf/)
  const idPerintah = idDari(p.url())
  await potret(p, `${w}-p-perintah-draf`)
  await kirimKe(p, 'Setujui', /pesan=setujui/)
  await Promise.all([p.waitForURL(/\/pengeluaran-bahan\/baru\?perintah=/), p.click('a:text-is("Keluarkan bahan")')])
  await potret(p, `${w}-p-pengeluaran-baru`)
  await kirimKe(p, 'Buat draf', /\/pengeluaran-bahan\/\d+\?pesan=draf/)
  const idKeluar = idDari(p.url())
  const qtyBawaan = await p.$$eval('.tabel-qty input', (x) => x.map((e) => e.value))
  cek(`${w}px pengeluaran: qty bawaan sisa kebutuhan`, JSON.stringify(qtyBawaan) === JSON.stringify(['150', '750']), qtyBawaan.join(', '))
  await potret(p, `${w}-p-pengeluaran-draf`)
  await kirimKe(p, 'Posting', /pesan=posting/)
  await potret(p, `${w}-p-pengeluaran-diposting`)
  const wip = await satu('select wip_value::text, status from production_order where id=$1', [idPerintah])
  const nilaiKeluar2 = -Number((await satu("select sum(value)::text v from stock_ledger where doc_type='material_issue' and doc_id=$1", [idKeluar])).v)
  cek(`${w}px pengeluaran: nilai bahan menjadi barang dalam proses`, Number(wip.wip_value) === nilaiKeluar2 && nilaiKeluar2 > 0, `wip ${wip.wip_value}, keluar ${nilaiKeluar2}`)
  await buka(p, `/perintah-produksi/${idPerintah}`)
  await Promise.all([p.waitForURL(/\/hasil-produksi\/baru\?perintah=/), p.click('a:text-is("Catat hasil")')])
  cek(`${w}px hasil: qty bawaan sisa rencana`, (await p.inputValue('#k-qty')) === '1500', await p.inputValue('#k-qty'))
  await potret(p, `${w}-p-hasil-baru`)
  await kirimKe(p, 'Buat draf', /\/hasil-produksi\/\d+\?pesan=draf/)
  const idHasil = idDari(p.url())
  await potret(p, `${w}-p-hasil-draf`)
  await kirimKe(p, 'Posting', /pesan=posting/)
  await potret(p, `${w}-p-hasil-diposting`)
  const hp = await satu('select value::text from production_result where id=$1', [idHasil])
  const po = await satu('select status, wip_value::text, produced_qty::float8 q from production_order where id=$1', [idPerintah])
  cek(`${w}px hasil: nilai hasil sama dengan nilai bahan dan perintah Selesai`, Number(hp.value) === nilaiKeluar2 && po.status === 'Selesai' && po.wip_value === '0' && po.q === 1500, `${hp.value} lawan ${nilaiKeluar2}, ${JSON.stringify(po)}`)
  await buka(p, `/perintah-produksi/${idPerintah}`)
  cek(`${w}px perintah: rincian menunjukkan Selesai dan dua dokumen pelaksana`, (await teks(p)).includes('Selesai') && (await p.$$('section[aria-labelledby="j-turunan"] tbody tr')).length === 2)
  await potret(p, `${w}-p-perintah-selesai`)

  // 7. Semua langkah di Jejak Audit.
  const aResep = await aksiAudit(p, 'bom', idResep)
  cek(`${w}px audit: resep dibuat dan bahan ditambah`, ['Tambah resep atau BOM', 'Tambah bahan resep'].every((a) => aResep.includes(a)), aResep.join(', '))
  const aJual = await aksiAudit(p, 'sale', idJual)
  cek(`${w}px audit: penjualan dan void`, ['Simpan penjualan', 'Void penjualan'].every((a) => aJual.includes(a)), aJual.join(', '))
  const aCepat = await aksiAudit(p, 'quick_production', idCepat)
  cek(`${w}px audit: produksi cepat dibuat, diposting, dibatalkan`, ['Buat produksi cepat', 'Posting produksi cepat', 'Batalkan produksi cepat'].every((a) => aCepat.includes(a)), aCepat.join(', '))
  const aPerintah = await aksiAudit(p, 'production_order', idPerintah)
  cek(`${w}px audit: perintah dibuat, disetujui, selesai`, ['Buat perintah produksi', 'Setujui perintah produksi', 'Perintah produksi selesai'].every((a) => aPerintah.includes(a)), aPerintah.join(', '))
  const aKeluar = await aksiAudit(p, 'material_issue', idKeluar)
  cek(`${w}px audit: pengeluaran dibuat dan diposting`, ['Buat pengeluaran bahan', 'Posting pengeluaran bahan'].every((a) => aKeluar.includes(a)), aKeluar.join(', '))
  const aHasil = await aksiAudit(p, 'production_result', idHasil)
  cek(`${w}px audit: hasil dibuat dan diposting`, ['Buat hasil produksi', 'Posting hasil produksi'].every((a) => aHasil.includes(a)), aHasil.join(', '))
  await potret(p, `${w}-p-audit-hasil`)
  cek(`${w}px owner: tanpa galat konsol`, owner.galat.length === 0, owner.galat.slice(0, 3).join(' | '))
  await owner.ctx.close()
}

// 8. Akses tanpa izin ditolak, dan sidebar Kasir tanpa grup Persediaan dan Produksi.
{
  const kasir = await konteks(1440, 900)
  await masuk(kasir.page, AKUN.kasir)
  const judul = await kasir.page.$$eval('.samping-judul', (x) => x.map((e) => e.textContent.trim()))
  cek('kasir: grup sidebar hanya Kasir dan Menu', JSON.stringify(judul) === JSON.stringify(GRUP_HARAP.kasir), judul.join(', '))
  const idPerintah = (await satu('select max(id) id from production_order')).id
  for (const jalur of ['/resep', '/resep/baru', '/perintah-produksi', `/perintah-produksi/${idPerintah}`, '/pengeluaran-bahan', '/pengeluaran-bahan/baru', '/hasil-produksi', '/produksi-cepat', '/produksi-cepat/baru']) {
    const r = await buka(kasir.page, jalur)
    const h1 = await kasir.page.textContent('h1')
    cek(`kasir: ${jalur} ditolak`, r.status() === 403 && h1.includes('Akses ditolak'), `status ${r.status()}, h1 "${h1}"`)
  }
  await potret(kasir.page, '1440-p-kasir-ditolak')
  const tolak = await satu("select count(*)::int n from audit_log where action='izin.ditolak' and (doc_id like '%produksi.%' or doc_id like '%stok.resep')")
  cek('kasir: penolakan produksi tercatat di audit', tolak.n >= 9, `${tolak.n} baris`)
  await kasir.ctx.close()

  const admin = await konteks(390, 844)
  await masuk(admin.page, AKUN.admin)
  const judulAdmin = await admin.page.$$eval('.samping-judul', (x) => x.map((e) => e.textContent.trim()))
  cek('390px admin: grup sidebar sesuai izin', JSON.stringify(judulAdmin) === JSON.stringify(GRUP_HARAP.admin), judulAdmin.join(', '))
  const idCepat = (await satu("select max(id) id from quick_production where status='Batal'")).id
  await buka(admin.page, `/produksi-cepat/${idCepat}`)
  cek('390px admin: produksi cepat Batal terbuka tanpa tombol batal posting', (await admin.page.$$('summary:text-is("Batalkan dokumen yang sudah Diposting")')).length === 0)
  const idHasil = (await satu("select max(id) id from production_result where status='Diposting'")).id
  await buka(admin.page, `/hasil-produksi/${idHasil}`)
  cek('390px admin: hasil Diposting tanpa tombol batal posting (tanpa saklar)', (await admin.page.$$('summary:text-is("Batalkan dokumen yang sudah Diposting")')).length === 0)
  await potret(admin.page, '390-p-admin-hasil')
  await buka(admin.page, '/resep')
  cek('390px admin: boleh membuat resep (L T U)', (await admin.page.$$('a:text-is("Buat resep menu")')).length === 1)
  cek('390px admin: tanpa galat konsol', admin.galat.length === 0, admin.galat.slice(0, 3).join(' | '))
  await admin.ctx.close()
}

const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-produksi.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan produksi: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
await browser.close()
await sql.end()
process.exit(gagal.length ? 1 : 0)
