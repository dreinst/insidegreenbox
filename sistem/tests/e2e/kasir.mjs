// Uji klik modul kasir tahap 3B, dijalankan jalankan.sh sesudah klik.mjs dengan basis data e2e yang sama.
// Di 1440 dan 390 px: Owner memasang PIN, Kasir masuk dengan PIN, buka shift, kas keluar, jual tunai dan QRIS,
// jual paket set dengan member yang dicari lewat WA format 08 (integrasi 3A dan 3B), void dengan PIN Admin, tutup shift dengan selisih di atas batas, Admin tidak bisa menyetujui, Owner menyetujui.
// Lalu akses tanpa izin, Jejak Audit, dan rate limit PIN. Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-kasir.json.
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
const PIN_KASIR = String(randomInt(100000, 999999))
const PIN_ADMIN = String(randomInt(1000, 9999))

const hasil = []
const cek = (nama, lulus, rincian = '') => {
  hasil.push({ nama, lulus: !!lulus, rincian })
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${rincian ? `  (${rincian})` : ''}`)
}

const sql = new pg.Client({ connectionString: DB_URL })
await sql.connect()
const satu = async (q, v = []) => (await sql.query(q, v)).rows[0]
const idPengguna = async (u) => (await satu('select id from app_user where username=$1', [u])).id

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

async function kirim(page, pemilih) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith(BASE), { timeout: 20000 }), page.click(pemilih)])
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
}

const luapan = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

// Potret satu halaman penuh dan cek tidak ada luapan horizontal.
async function potret(page, nama) {
  await page.waitForLoadState('networkidle')
  // Gulir ke atas dulu supaya header dan bilah yang menempel tidak tercetak di tengah potret satu halaman.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
  const lebih = await luapan(page)
  cek(`potret ${nama} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
}

const teks = (page) => page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
const idDariUrl = (page) => Number(new URL(page.url()).pathname.split('/').pop())

// 0. Owner memasang PIN Kasir dan Admin lewat menu PIN Kasir.
const idKasir = await idPengguna(AKUN.kasir.u)
const idAdmin = await idPengguna(AKUN.admin.u)
const idOwner = await idPengguna(AKUN.owner.u)
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/pin`)
  await potret(page, '1440-owner-pin')
  await page.click(`a[href="/pin/${idKasir}"].tebal`)
  await page.waitForURL(`**/pin/${idKasir}`)
  await page.fill('#k-pin', PIN_KASIR)
  await page.fill('#k-ulangiPin', '000000')
  await kirim(page, 'button:text-is("Simpan PIN")')
  const galatPin = await page.$$eval('.galat-kolom', (g) => g.map((x) => x.textContent.trim()))
  cek('pin: ulangi PIN salah ditolak dengan galat per kolom', galatPin.some((g) => g.includes('Ulangi PIN')), galatPin.join(' | '))
  cek('pin: PIN tidak dikembalikan ke formulir', (await page.inputValue('#k-pin')) === '')
  await potret(page, '1440-owner-pin-galat')
  await page.fill('#k-pin', PIN_KASIR)
  await page.fill('#k-ulangiPin', PIN_KASIR)
  await Promise.all([page.waitForURL(/\?pesan=pin/), page.click('button:text-is("Simpan PIN")')])
  await potret(page, '1440-owner-pin-rincian')
  await page.goto(`${BASE}/pin/${idAdmin}`)
  await page.fill('#k-pin', PIN_ADMIN)
  await page.fill('#k-ulangiPin', PIN_ADMIN)
  await Promise.all([page.waitForURL(/\?pesan=pin/), page.click('button:text-is("Simpan PIN")')])
  const pin = await sql.query('select username from app_user where pin_hash is not null and id = any($1)', [[idKasir, idAdmin]])
  cek('pin: PIN Kasir dan Admin tersimpan sebagai hash', pin.rowCount === 2)
  cek('pin: Owner tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 1. Alur kasir di dua lebar.
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const kasir = await konteks(w, h)
  const { page } = kasir
  await page.goto(`${BASE}/masuk?cara=pin`)
  await potret(page, `${w}-masuk-pin`)
  await page.selectOption('#k-userId', { label: 'Kasir Contoh' })
  await page.fill('#k-pin', PIN_KASIR)
  await Promise.all([page.waitForURL('**/kasir', { timeout: 15000 }), page.click('button[type=submit]')])
  cek(`${w}px kasir: masuk dengan PIN ke layar kasir`, new URL(page.url()).pathname === '/kasir')
  await potret(page, `${w}-kasir-gerbang`)
  await Promise.all([page.waitForURL('**/shift'), page.click('a:text-is("Ke halaman Shift")')])
  await potret(page, `${w}-kasir-shift-buka`)
  await page.fill('#k-modal', '200.000')
  await Promise.all([page.waitForURL(/\/shift\/\d+\?pesan=shift-buka/), page.click('button:text-is("Buka shift")')])
  const idShift = idDariUrl(page)
  const sh = await satu('select open_cash, status from shift where id=$1', [idShift])
  cek(`${w}px kasir: shift dibuka dengan modal`, sh?.open_cash === '200000' && sh.status === 'Buka', JSON.stringify(sh))
  cek(`${w}px kasir: kas seharusnya tidak tampil sebelum tutup`, (await page.$$('#j-kas, #j-rekap')).length === 0)

  await page.fill('#k-jumlah', '5000')
  await page.fill('#k-alasan', 'Beli es batu')
  await kirim(page, 'button:text-is("Catat kas laci")')
  const gerak = await satu("select count(*)::int n from shift_cash_move where shift_id=$1 and kind='keluar' and amount=5000", [idShift])
  cek(`${w}px kasir: kas keluar laci tercatat`, gerak.n === 1)
  await potret(page, `${w}-kasir-shift-berjalan`)

  // Penjualan 1: dine in meja 5, tunai 100.000. 2 x 28.000 + 25.000 = 81.000, service 5% 4.050, pajak 10% 8.505.
  await page.goto(`${BASE}/kasir`)
  await potret(page, `${w}-kasir-layar-kosong`)
  const ubin = (n) => `.lk-ubin button:has(b:text-is("${n}"))`
  await page.click(ubin('Kopi Susu Greenbox'))
  await page.click(ubin('Kopi Susu Greenbox'))
  await page.click(ubin('Croissant Mentega'))
  await page.fill('input[aria-label="Catatan Kopi Susu Greenbox"]', 'Kurang manis')
  await page.fill('#k-meja', '5')
  await page.fill('#k-jumlah-0', '100000')
  const kembali = await page.textContent('.lk-kembali')
  cek(`${w}px kasir: kembalian tunai dihitung`, kembali?.includes('6.445'), kembali)
  await potret(page, `${w}-kasir-keranjang`)
  await Promise.all([page.waitForURL(/\/kasir\?selesai=\d+/, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const idJual1 = Number(new URL(page.url()).searchParams.get('selesai'))
  const j1 = await satu("select s.no, s.total, s.svc, s.tax, s.table_no, p.change, m.kind from sale s join sale_payment p on p.sale_id=s.id join payment_method m on m.id=p.payment_method_id where s.id=$1", [idJual1])
  cek(`${w}px kasir: penjualan tunai tersimpan`, j1?.total === '93555' && j1.change === '6445' && j1.kind === 'tunai' && j1.table_no === '5', JSON.stringify(j1))
  const catatan = await satu("select note from sale_line where sale_id=$1 and name='Kopi Susu Greenbox'", [idJual1])
  cek(`${w}px kasir: catatan per baris tersimpan`, catatan?.note === 'Kurang manis')
  cek(`${w}px kasir: pesan sukses dan keranjang kosong`, (await page.textContent('.lk-selesai'))?.includes(j1?.no) && (await page.$$('.lk-baris li')).length === 0)
  await potret(page, `${w}-kasir-selesai`)

  // Penjualan 2: take away, member 10%, QRIS. 32.000 - 3.200 = 28.800, service 1.440, pajak 3.024.
  await page.click('button:text-is("Take away")')
  await page.click(ubin('Matcha Susu'))
  await page.fill('#k-wa', '0812-3456-7890')
  await page.click('button:text-is("Cari")')
  await page.waitForSelector('.lk-member-pilih')
  cek(`${w}px kasir: member ditemukan lewat WA`, (await page.textContent('.lk-member-pilih'))?.includes('Member Uji'))
  await page.selectOption('#k-metode-0', { label: 'QRIS' })
  cek(`${w}px kasir: QRIS terisi sebesar total`, (await page.inputValue('#k-jumlah-0')) === '33.264', await page.inputValue('#k-jumlah-0'))
  await potret(page, `${w}-kasir-member-qris`)
  await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > idJual1, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const idJual2 = Number(new URL(page.url()).searchParams.get('selesai'))
  const j2 = await satu("select s.total, s.disc, s.member_id, m.name metode from sale s join sale_payment p on p.sale_id=s.id join payment_method m on m.id=p.payment_method_id where s.id=$1", [idJual2])
  cek(`${w}px kasir: penjualan QRIS dengan potongan member tersimpan`, j2?.total === '33264' && j2.disc === '3200' && j2.metode === 'QRIS' && j2.member_id, JSON.stringify(j2))

  await Promise.all([page.waitForURL(`**/struk/${idJual2}`), page.click('.lk-selesai a:text-is("Cetak struk")')])
  const isiStruk = await page.textContent('.struk')
  cek(`${w}px kasir: struk memuat potongan, total, dan QRIS`, isiStruk?.includes('Potongan member') && isiStruk.includes('33.264') && isiStruk.includes('QRIS'), isiStruk?.slice(0, 120))
  await potret(page, `${w}-struk`)

  // Penjualan 3 (integrasi 3A dan 3B): kategori dari menu_category, paket set, member dari WA format 08, Debit.
  // Paket Sarapan Uji 45.000 tanpa potongan + Teh Lemon 18.000 dipotong 10% (1.800). Net 61.200, service 3.060,
  // pajak 6.426, total 70.686.
  await page.goto(`${BASE}/kasir`)
  const pil = await page.$$eval('.pil.gulir button', (b) => b.map((x) => x.textContent.trim()))
  const harapKategori = (
    await sql.query('select c.name from menu_category c where c.active and exists (select 1 from menu_item m where m.category = c.code and m.active) order by c.sort, c.name')
  ).rows.map((r) => r.name)
  cek(`${w}px kasir: pilihan kategori memakai nama dan urutan menu_category, paket sebagai kelompok sendiri`, JSON.stringify(pil) === JSON.stringify(['Semua', 'Paket set', ...harapKategori]), pil.join(', '))
  await page.click('.pil.gulir button:text-is("Paket set")')
  const ubinPaket = await page.$$eval('.lk-ubin button', (b) => b.map((x) => x.querySelector('b')?.textContent.trim()))
  cek(`${w}px kasir: kelompok Paket set hanya berisi paket aktif`, ubinPaket.length >= 1 && ubinPaket.every((n) => n?.startsWith('Paket ')) && ubinPaket.includes('Paket Sarapan Uji'), ubinPaket.join(', '))
  await page.click(ubin('Paket Sarapan Uji'))
  await page.click('.pil.gulir button:text-is("Non-coffee")')
  await page.click(ubin('Teh Lemon'))
  await page.click('button:text-is("Take away")')
  await page.fill('#k-wa', '081234567890')
  await page.click('button:text-is("Cari")')
  await page.waitForSelector('.lk-member-pilih')
  cek(`${w}px kasir: member ditemukan lewat WA format 08 tanpa pemisah`, (await page.textContent('.lk-member-pilih'))?.includes('Member Uji'))
  const ketPaket = await page.textContent('.lk-baris li:has(b:text-is("Paket Sarapan Uji")) .lk-baris-ket')
  cek(`${w}px kasir: baris paket bertanda tanpa potongan member`, ketPaket?.includes('Americano') && ketPaket.includes('tanpa potongan member'), ketPaket)
  cek(`${w}px kasir: potongan hanya dari menu biasa di layar`, (await page.textContent('.lk-jumlah-dl'))?.includes('-Rp 1.800'))
  await page.selectOption('#k-metode-0', { label: 'Debit' })
  cek(`${w}px kasir: Debit terisi sebesar total`, (await page.inputValue('#k-jumlah-0')) === '70.686', await page.inputValue('#k-jumlah-0'))
  await potret(page, `${w}-kasir-paket-member`)
  await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > idJual2, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const idJual3 = Number(new URL(page.url()).searchParams.get('selesai'))
  const j3 = await satu('select total, disc, member_id, member_pct from sale where id=$1', [idJual3])
  cek(`${w}px kasir: penjualan paket dengan member tersimpan`, j3?.total === '70686' && j3.disc === '1800' && j3.member_id && Number(j3.member_pct) === 10, JSON.stringify(j3))
  const bp = await satu(
    "select l.name, l.price, l.category, l.menu_set_id, l.set_drink_item_id, s.name paket, d.name minuman from sale_line l join menu_set s on s.id = l.menu_set_id join menu_item d on d.id = l.set_drink_item_id where l.sale_id=$1",
    [idJual3],
  )
  cek(`${w}px kasir: baris paket menyimpan penanda paket dan minumannya`, bp?.name === 'Paket Sarapan Uji' && bp.price === '45000' && bp.category === 'paket' && bp.paket === 'Sarapan Uji' && bp.minuman === 'Americano', JSON.stringify(bp))

  // Void penjualan 1 dengan PIN Admin; tanpa PIN ditolak dan alasan tetap terisi.
  await page.goto(`${BASE}/transaksi`)
  await potret(page, `${w}-kasir-transaksi`)
  await Promise.all([page.waitForURL(`**/transaksi/${idJual1}`), page.click(`a:text-is("${j1.no}")`)])
  await page.fill('#k-alasan', 'Salah input menu')
  await kirim(page, 'button:text-is("Void transaksi")')
  const galatVoid = await page.textContent('.pesan.galat').catch(() => '')
  cek(`${w}px kasir: void tanpa penyetuju ditolak`, galatVoid?.includes('penyetuju'), galatVoid)
  cek(`${w}px kasir: alasan void terjaga sesudah galat`, (await page.inputValue('#k-alasan')) === 'Salah input menu')
  await potret(page, `${w}-kasir-void-galat`)
  await page.selectOption('#k-penyetujuId', { label: 'Admin Contoh (Admin)' })
  await page.fill('#k-pinPenyetuju', PIN_ADMIN)
  await Promise.all([page.waitForURL(/\?pesan=void/), page.click('button:text-is("Void transaksi")')])
  const v = await satu('select status, void_reason, void_approved_by, void_by from sale where id=$1', [idJual1])
  cek(`${w}px kasir: void dengan PIN Admin tersimpan`, v.status === 'Void' && v.void_approved_by === idAdmin && v.void_by === idKasir && v.void_reason === 'Salah input menu', JSON.stringify(v))
  await potret(page, `${w}-kasir-void`)

  // Tutup buta lewat pecahan: 3 x 50.000 = 150.000. Seharusnya 200.000 - 5.000 = 195.000 (penjualan tunai di-void).
  await page.goto(`${BASE}/shift/${idShift}`)
  cek(`${w}px kasir: kas seharusnya tetap tersembunyi sebelum tutup`, (await page.$$('#j-kas, #j-rekap')).length === 0)
  await page.click('details.pecahan summary')
  await page.fill('input[name="pecahan_50000"]', '3')
  cek(`${w}px kasir: total pecahan dihitung di layar`, (await page.textContent('.pecahan-total'))?.includes('150.000'))
  await page.fill('#k-catatan', 'Uang kurang, belum tahu sebabnya')
  await potret(page, `${w}-kasir-shift-tutup-isi`)
  await Promise.all([page.waitForURL(/\?pesan=shift-tutup/), page.click('button:text-is("Tutup shift")')])
  const t = await satu('select status, expected_cash, counted_cash, cash_diff from shift where id=$1', [idShift])
  cek(`${w}px kasir: tutup shift dengan selisih di atas batas perlu persetujuan`, t.status === 'PerluPersetujuan' && t.expected_cash === '195000' && t.counted_cash === '150000' && t.cash_diff === '-45000', JSON.stringify(t))
  cek(`${w}px kasir: sesudah tutup kas seharusnya tampil`, (await page.textContent('#j-kas + dl'))?.includes('195.000'))
  await potret(page, `${w}-kasir-shift-tutup`)

  // Galat konsol dicek sebelum kunjungan yang sengaja ditolak, karena 403 dan 404 tercatat sebagai galat sumber daya.
  cek(`${w}px kasir: tanpa galat konsol`, kasir.galat.length === 0, kasir.galat.slice(0, 3).join(' | '))
  for (const jalur of ['/pin', `/pin/${idKasir}`, '/pengguna', '/saklar']) {
    const r = await page.goto(`${BASE}${jalur}`)
    cek(`${w}px kasir: ${jalur} ditolak`, r.status() === 403, `status ${r.status()}`)
  }
  await page.goto(`${BASE}/kasir`)
  cek(`${w}px kasir: layar kasir kembali meminta buka shift`, (await teks(page)).includes('Buka shift dulu'))
  await kasir.ctx.close()

  // Admin: tidak bisa menyetujui selisih, tidak bisa void sesudah shift ditutup, tidak bisa membuka PIN Owner.
  const admin = await konteks(w, h)
  await masuk(admin.page, AKUN.admin)
  await admin.page.goto(`${BASE}/shift/${idShift}`)
  cek(`${w}px admin: tidak ada formulir setujui selisih`, (await admin.page.$$('button:text-is("Setujui selisih")')).length === 0)
  await potret(admin.page, `${w}-admin-shift-rincian`)
  await admin.page.goto(`${BASE}/transaksi/${idJual2}`)
  cek(`${w}px admin: void sesudah shift ditutup ditolak`, (await teks(admin.page)).includes('hanya bisa oleh Owner') && (await admin.page.$$('button:text-is("Void transaksi")')).length === 0)
  await admin.page.goto(`${BASE}/pin`)
  await potret(admin.page, `${w}-admin-pin`)
  cek(`${w}px admin: daftar PIN tanpa Owner`, !(await admin.page.$(`a[href="/pin/${idOwner}"]`)))
  cek(`${w}px admin: tanpa galat konsol`, admin.galat.length === 0, admin.galat.slice(0, 3).join(' | '))
  const r = await admin.page.goto(`${BASE}/pin/${idOwner}`)
  cek(`${w}px admin: PIN Owner tidak bisa dibuka`, r.status() === 404, `status ${r.status()}`)
  await admin.ctx.close()

  // Owner menyetujui shift dari antrean.
  const owner = await konteks(w, h)
  await masuk(owner.page, AKUN.owner)
  await owner.page.goto(`${BASE}/shift`)
  cek(`${w}px owner: antrean persetujuan tampil`, (await owner.page.textContent('.pesan.peringatan'))?.includes('menunggu persetujuan'))
  await potret(owner.page, `${w}-owner-shift`)
  await owner.page.click('.pesan.peringatan a')
  await owner.page.waitForURL(/status=PerluPersetujuan/)
  await Promise.all([owner.page.waitForURL(`**/shift/${idShift}`), owner.page.click(`.tabel a.tebal:text-is("#${idShift}")`)])
  await potret(owner.page, `${w}-owner-shift-setuju`)
  await owner.page.fill('#k-catatan', 'Sudah dicek bersama kasir')
  await Promise.all([owner.page.waitForURL(/\?pesan=shift-setuju/), owner.page.click('button:text-is("Setujui selisih")')])
  const s2 = await satu('select status, approved_by, approval_note from shift where id=$1', [idShift])
  cek(`${w}px owner: selisih disetujui`, s2.status === 'Tutup' && s2.approved_by === idOwner && s2.approval_note === 'Sudah dicek bersama kasir', JSON.stringify(s2))
  await potret(owner.page, `${w}-owner-shift-disetujui`)
  await owner.page.goto(`${BASE}/transaksi/${idJual2}`)
  cek(`${w}px owner: Owner masih bisa void sesudah shift ditutup`, (await owner.page.$$('button:text-is("Void transaksi")')).length === 1)
  await potret(owner.page, `${w}-owner-transaksi-rincian`)
  await owner.page.goto(`${BASE}/transaksi?status=Void&shift=${idShift}`)
  const nomorVoid = await owner.page.$$eval('.tabel tbody td[data-label="Nomor"]', (td) => td.map((x) => x.textContent.trim()))
  cek(`${w}px owner: saringan status dan shift`, nomorVoid.length === 1 && nomorVoid[0] === j1.no, nomorVoid.join(', '))
  await potret(owner.page, `${w}-owner-transaksi-saring`)

  // Semua langkah tercatat di Jejak Audit.
  await owner.page.goto(`${BASE}/audit?entitas=shift&dok=${idShift}`)
  const aksiShift = await owner.page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
  cek(`${w}px audit: buka, kas, tutup, setujui shift`, ['Buka shift', 'Kas laci', 'Tutup shift', 'Setujui selisih shift'].every((a) => aksiShift.includes(a)), aksiShift.join(', '))
  await owner.page.goto(`${BASE}/audit?entitas=sale&dok=${idJual1}`)
  const aksiJual = await owner.page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
  cek(`${w}px audit: simpan dan void penjualan`, ['Simpan penjualan', 'Void penjualan'].every((a) => aksiJual.includes(a)), aksiJual.join(', '))
  await potret(owner.page, `${w}-owner-audit-penjualan`)

  // Sidebar Owner berisi semua menu sampai tahap 4. Sejak tahap 4A itemnya lebih dari 20, jadi di 1440 x 900 pun
  // sidebar digulir: item terakhir harus bisa dicapai dengan menggulir sidebar, di desktop maupun di laci HP.
  {
    const p = owner.page
    const ukur = () =>
      p.evaluate(() => {
        const el = document.querySelector('.samping')
        const a = [...el.querySelectorAll('nav a')]
        const r = a.at(-1).getBoundingClientRect()
        return { n: a.length, atas: Math.round(r.top), bawah: Math.round(r.bottom), tinggi: window.innerHeight, gulir: el.scrollTop, oy: getComputedStyle(el).overflowY }
      })
    if (w > 820) {
      await p.goto(`${BASE}/`)
      await p.screenshot({ path: `${POTRET}${w}-owner-sidebar.png` })
      await p.mouse.move(120, 400)
      await p.mouse.wheel(0, 5000)
      await p.waitForTimeout(300)
      const s = await ukur()
      cek(`${w}px owner: item terakhir sidebar tercapai dengan gulir di ${w} x ${h}`, s.n >= 20 && s.bawah <= s.tinggi && s.atas >= 0 && s.oy === 'auto', JSON.stringify(s))
      await p.screenshot({ path: `${POTRET}${w}-owner-sidebar-bawah.png` })
      await p.setViewportSize({ width: w, height: 640 })
      await p.mouse.move(120, 400)
      await p.mouse.wheel(0, 5000)
      await p.waitForTimeout(300)
      const pendek = await ukur()
      cek(`${w}px owner: sidebar bisa digulir di layar pendek (640 px)`, pendek.bawah <= pendek.tinggi && pendek.atas >= 0, JSON.stringify(pendek))
      await p.screenshot({ path: `${POTRET}${w}-owner-sidebar-pendek.png` })
      await p.setViewportSize({ width: w, height: h })
    } else {
      for (const tinggi of [h, 560]) {
        await p.setViewportSize({ width: w, height: tinggi })
        await p.goto(`${BASE}/`)
        await p.click('.tombol-menu')
        await p.waitForSelector('.laci-buka .samping')
        await p.waitForTimeout(350)
        await p.screenshot({ path: `${POTRET}${w}x${tinggi}-owner-laci-atas.png` })
        await p.mouse.move(120, tinggi / 2)
        await p.mouse.wheel(0, 5000)
        await p.waitForTimeout(300)
        const s = await ukur()
        cek(`${w} x ${tinggi} owner: laci bisa digulir sampai item terakhir`, s.n >= 13 && s.bawah <= s.tinggi && s.atas >= 0 && s.oy === 'auto', JSON.stringify(s))
        await p.screenshot({ path: `${POTRET}${w}x${tinggi}-owner-laci-bawah.png` })
        await Promise.all([p.waitForURL('**/audit'), p.click('.samping nav a[href="/audit"]')])
        cek(`${w} x ${tinggi} owner: item terakhir laci bisa diketuk dan laci menutup`, !(await p.$('.laci-buka')))
      }
      await p.setViewportSize({ width: w, height: h })
    }
  }
  cek(`${w}px owner: tanpa galat konsol`, owner.galat.length === 0, owner.galat.slice(0, 3).join(' | '))
  await owner.ctx.close()
}

{
  const n = await satu("select count(*)::int n from audit_log where action='kasir.masuk_pin' and user_id=$1", [idKasir])
  const pin = await satu("select count(*)::int n from audit_log where action='pengguna.pin'")
  cek('audit: masuk PIN dan atur PIN tercatat', n.n >= 2 && pin.n >= 2, `masuk ${n.n}, atur ${pin.n}`)
}

// 2. Rate limit PIN: 5 PIN salah mengunci, PIN benar sesudahnya tetap ditolak.
{
  const { ctx, page } = await konteks(390, 844)
  const pesan = []
  for (let i = 0; i < 5; i++) {
    await page.goto(`${BASE}/masuk?cara=pin`)
    await page.selectOption('#k-userId', { label: 'Kasir Contoh' })
    await page.fill('#k-pin', String(1000 + i))
    await page.click('button[type=submit]')
    await page.waitForSelector('.pesan.galat')
    pesan.push(await page.textContent('.pesan.galat'))
  }
  cek('kunci PIN: 5 PIN salah ditolak dengan pesan umum', pesan.every((p) => p.includes('Nama atau PIN salah')), pesan[0])
  cek('kunci PIN: nama kasir tetap terpilih sesudah galat', (await page.$eval('#k-userId', (s) => s.selectedOptions[0]?.textContent)) === 'Kasir Contoh')
  await page.fill('#k-pin', PIN_KASIR)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.pesan.galat')?.textContent.includes('Terlalu banyak'))
  await potret(page, '390-masuk-pin-terkunci')
  cek('kunci PIN: PIN benar sesudah 5 gagal tetap terkunci', new URL(page.url()).pathname === '/masuk')
  const n = await satu("select count(*)::int n from audit_log where action='masuk.terkunci' and user_id=$1", [idKasir])
  cek('kunci PIN: penguncian tercatat di audit', n.n >= 1)
  await ctx.close()
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-kasir.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan kasir: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
