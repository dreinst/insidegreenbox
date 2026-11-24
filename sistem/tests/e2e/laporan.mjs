// Uji klik tahap 5A (laporan dan setoran POS), dijalankan jalankan.sh sesudah kasir.mjs dan master.mjs, sebelum
// klik.mjs. Owner menambah rekening bank, Kasir (masuk dengan sandi, PIN-nya sudah dikunci kasir.mjs) menjual tunai
// dan QRIS lalu menutup shift, Admin membuat setoran hari ini lalu memposting Tunai, QRIS, dan Debit dengan selisih
// (tahap 6C: selisih tidak lagi butuh Owner; MDR bawaan dihitung per transaksi dari tarif). Laporan dicocokkan dengan basis data, CSV diunduh, akses tanpa izin ditolak, dan
// semua halaman baru dibuka per peran di 1440 dan 390 px tanpa galat konsol dan tanpa luapan horizontal.
// Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-laporan.json.
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
    if (m.type() === 'error') galat.push(`${page.url()}: ${m.text()}`)
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

async function potret(page, nama) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${POTRET}${nama}.png`, fullPage: true })
  const lebih = await luapan(page)
  cek(`potret ${nama} tanpa luapan horizontal`, lebih <= 1, `lebih ${lebih}px`)
}

const teks = (page) => page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
const rp = (n) => `${n < 0 ? '-' : ''}Rp ${Math.abs(Number(n)).toLocaleString('id-ID')}`
const idDariUrl = (page) => Number(new URL(page.url()).pathname.split('/').pop())
// Nilai sel kolom berlabel di baris tfoot (baris Jumlah) tabel laporan.
const sel = (page, label, bagian = 'tfoot') => page.$eval(`.lap-tabel ${bagian} td[data-label="${label}"]`, (td) => td.textContent.trim()).catch(() => null)

async function unduhCsv(page) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('a.lap-unduh')])
  const jalur = await d.path()
  return { nama: d.suggestedFilename(), isi: readFileSync(jalur, 'utf8') }
}

const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const syaratHari = "(s.at AT TIME ZONE 'Asia/Jakarta')::date = $1::date"

// 0. Owner menambah rekening bank tujuan non tunai.
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/rekening`)
  await potret(page, '1440-owner-rekening-kosong')
  await Promise.all([page.waitForURL('**/rekening/baru'), page.click('a:text-is("Tambah rekening")')])
  await page.fill('#k-bankName', 'BCA')
  await page.fill('#k-accountNo', '12')
  await page.fill('#k-holderName', 'Greenbox Coffee')
  await page.click('button:text-is("Simpan rekening")')
  await page.waitForSelector('.galat-kolom')
  cek('rekening: nomor terlalu pendek ditolak dan isian terjaga', (await page.inputValue('#k-holderName')) === 'Greenbox Coffee', await page.textContent('.galat-kolom'))
  await potret(page, '1440-owner-rekening-galat')
  await page.fill('#k-accountNo', '123-456-7890')
  await Promise.all([page.waitForURL(/\/rekening\/\d+\?pesan=dibuat/), page.click('button:text-is("Simpan rekening")')])
  const r = await satu("select account_no, active from bank_account where bank_name='BCA'")
  cek('rekening: tersimpan dengan nomor angka saja', r?.account_no === '1234567890' && r.active, JSON.stringify(r))
  await potret(page, '1440-owner-rekening-rincian')
  cek('rekening: Owner tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 1. Kasir menjual tunai dan QRIS lalu menutup shift tanpa selisih.
let idShift = 0
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.kasir)
  await page.goto(`${BASE}/shift`)
  await page.fill('#k-modal', '100.000')
  await Promise.all([page.waitForURL(/\/shift\/\d+\?pesan=shift-buka/), page.click('button:text-is("Buka shift")')])
  idShift = idDariUrl(page)
  const ubin = (n) => `.lk-ubin button:has(b:text-is("${n}"))`
  await page.goto(`${BASE}/kasir`)
  await page.click('button:text-is("Take away")')
  await page.click(ubin('Kopi Susu Greenbox'))
  await page.fill('#k-jumlah-0', '50000')
  await Promise.all([page.waitForURL(/\/kasir\?selesai=\d+/, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const j1 = Number(new URL(page.url()).searchParams.get('selesai'))
  await page.goto(`${BASE}/kasir`)
  await page.click('button:text-is("Take away")')
  await page.click(ubin('Matcha Susu'))
  await page.selectOption('#k-metode-0', { label: 'QRIS' })
  await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > j1, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const tunai = await satu('select total from sale where id=$1', [j1])
  await page.goto(`${BASE}/shift/${idShift}`)
  await page.fill('#k-kasDihitung', String(100000 + Number(tunai.total)))
  await Promise.all([page.waitForURL(/\?pesan=shift-tutup/), page.click('button:text-is("Tutup shift")')])
  const s = await satu('select status, cash_diff from shift where id=$1', [idShift])
  cek('kasir: jual tunai dan QRIS lalu tutup shift tanpa selisih', s.status === 'Tutup' && s.cash_diff === '0', JSON.stringify(s))
  cek('kasir: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  // Akses tanpa izin: Kasir tidak punya laporan, setoran, dan rekening.
  const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
  cek('kasir: sidebar tanpa Setoran POS, Laporan, dan Rekening Bank', !label.some((l) => ['Setoran POS', 'Laporan', 'Rekening Bank'].includes(l)), label.join(', '))
  for (const jalur of ['/laporan', '/laporan/harian', '/setoran', '/rekening', '/laporan/unduh?jenis=penjualan']) {
    const r = await page.goto(`${BASE}${jalur}`)
    cek(`kasir: ${jalur} ditolak`, r.status() === 403, `status ${r.status()}`)
  }
  await ctx.close()
}

// 2. Admin membuat setoran hari ini lalu memposting Tunai, QRIS, dan Debit yang berselisih.
const setoran = {}
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.admin)
  await page.goto(`${BASE}/setoran`)
  await potret(page, '1440-admin-setoran-kosong')
  cek('setoran: tanggal bawaan hari ini (WIB)', (await page.inputValue('#k-tanggal')) === hariIni, await page.inputValue('#k-tanggal'))
  await Promise.all([page.waitForURL(/pesan=setoran-dibuat/), page.click('button:text-is("Buat setoran hari ini")')])
  const dok = await semua("select s.id, s.no, s.status, m.name metode, s.expected_total, s.bank_account_id from pos_settlement s join payment_method m on m.id=s.payment_method_id where s.date=$1::date order by s.id", [hariIni])
  for (const d of dok) setoran[d.metode] = d
  cek('setoran: satu draf per metode (Tunai, QRIS, Debit)', ['Tunai', 'QRIS', 'Debit'].every((m) => setoran[m]?.status === 'Draft') && dok.length === 3, dok.map((d) => `${d.no} ${d.metode}`).join(', '))
  const shiftTutup = await satu("select count(*)::int n from shift where status <> 'Buka' and (opened_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date", [hariIni])
  const barisTunai = await satu('select count(*)::int n from pos_settlement_line where pos_settlement_id=$1', [setoran.Tunai.id])
  cek('setoran: baris tunai berisi semua shift yang ditutup hari ini', barisTunai.n === shiftTutup.n, `${barisTunai.n} dari ${shiftTutup.n}`)
  const harapQris = await satu(`select coalesce(sum(p.amount),0)::bigint t from sale_payment p join sale s on s.id=p.sale_id join payment_method m on m.id=p.payment_method_id where s.status='Selesai' and m.name='QRIS' and ${syaratHari}`, [hariIni])
  cek('setoran: nilai sistem QRIS sama dengan penjualan QRIS hari ini', setoran.QRIS.expected_total === harapQris.t, `${setoran.QRIS.expected_total} lawan ${harapQris.t}`)
  cek('setoran: rekening QRIS terisi rekening aktif', !!setoran.QRIS.bank_account_id)
  // tahap 6C: MDR bawaan = jumlah MDR per transaksi dengan tarif yang berlaku pada tanggal penjualan.
  for (const m of ['QRIS', 'Debit']) {
    const harap = await satu(
      `select coalesce(sum(case when tr.free_limit is not null and p.amount <= tr.free_limit then 0 else round(p.amount * tr.mdr_pct / 100) end),0)::bigint mdr
       from sale_payment p join sale s on s.id=p.sale_id join payment_method m on m.id=p.payment_method_id
       left join lateral (select t.mdr_pct, t.free_limit from payment_method_mdr t where t.payment_method_id=p.payment_method_id and t.effective_from <= (s.at at time zone 'Asia/Jakarta')::date order by t.effective_from desc limit 1) tr on true
       where s.status='Selesai' and m.name=$2 and ${syaratHari}`,
      [hariIni, m],
    )
    const st = await satu('select mdr_fee from pos_settlement where id=$1', [setoran[m].id])
    cek(`setoran: MDR ${m} dihitung per transaksi dari tarif`, st.mdr_fee === harap.mdr, `${st.mdr_fee} lawan ${harap.mdr}`)
  }
  const nDebit = await satu(`select count(*)::int n from sale_payment p join sale s on s.id=p.sale_id join payment_method m on m.id=p.payment_method_id where s.status='Selesai' and m.name='Debit' and ${syaratHari}`, [hariIni])
  cek('setoran: Debit punya transaksi dan MDR-nya bukan nol (tarif bawaan 1%)', nDebit.n > 0 && (await satu('select mdr_fee from pos_settlement where id=$1', [setoran.Debit.id])).mdr_fee !== '0')
  await potret(page, '1440-admin-setoran-daftar')
  await page.setViewportSize({ width: 390, height: 844 })
  await potret(page, '390-admin-setoran-daftar')
  await page.setViewportSize({ width: 1440, height: 900 })

  // Tombol kedua tidak membuat dokumen ganda.
  await page.goto(`${BASE}/setoran`)
  await page.click('button:text-is("Buat setoran hari ini")')
  await page.waitForSelector('.pesan.galat')
  cek('setoran: tombol kedua ditolak tanpa dokumen ganda', (await page.textContent('.pesan.galat')).includes('Tidak ada shift ditutup') && (await satu('select count(*)::int n from pos_settlement')).n === 3, await page.textContent('.pesan.galat'))

  // Tunai: isi catatan baris dan bukti, simpan, lalu posting.
  await page.goto(`${BASE}/setoran/${setoran.Tunai.id}`)
  await potret(page, '1440-admin-setoran-tunai-draft')
  // Formulir draf juga dipotret di HP.
  await page.setViewportSize({ width: 390, height: 844 })
  await potret(page, '390-admin-setoran-tunai-draft')
  await page.setViewportSize({ width: 1440, height: 900 })
  const idBaris = (await satu('select id from pos_settlement_line where pos_settlement_id=$1 and shift_id=$2', [setoran.Tunai.id, idShift])).id
  await page.fill(`input[name="catatan_${idBaris}"]`, 'Disetor ke brankas')
  await page.fill('#k-note', 'Setoran tunai harian')
  const isiAsli = await page.inputValue(`input[name="actual_${idBaris}"]`)
  await page.fill(`input[name="actual_${idBaris}"]`, '')
  await page.click('button:text-is("Simpan setoran")')
  await page.waitForSelector('.st-galat')
  cek('setoran: nilai disetor kosong ditolak per baris dan catatan terjaga', (await page.textContent('.st-galat')).includes('Isi nilai disetor') && (await page.inputValue('#k-note')) === 'Setoran tunai harian', await page.textContent('.st-galat'))
  await page.setViewportSize({ width: 390, height: 844 })
  await potret(page, '390-admin-setoran-galat-baris')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.fill(`input[name="actual_${idBaris}"]`, isiAsli)
  // PNG 1 x 1 sebagai bukti setor.
  await page.setInputFiles('#k-bukti', { name: 'bukti.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') })
  await Promise.all([page.waitForURL(/\?pesan=setoran-tersimpan/), page.click('button:text-is("Simpan setoran")')])
  const t = await satu('select note, proof_file from pos_settlement where id=$1', [setoran.Tunai.id])
  cek('setoran: catatan dan bukti setor tersimpan', t.note === 'Setoran tunai harian' && /^bukti\/[a-f0-9]{16}\.png$/.test(t.proof_file ?? ''), JSON.stringify(t))
  const bukti = await page.request.get(`${BASE}/setoran/${setoran.Tunai.id}/bukti`)
  cek('setoran: bukti bisa dibuka pemegang izin', bukti.status() === 200 && bukti.headers()['content-type'] === 'image/png', `status ${bukti.status()}`)
  await Promise.all([page.waitForURL(/\?pesan=setoran-posting/), page.click('button:text-is("Posting setoran")')])
  cek('setoran: Admin memposting setoran Tunai', (await satu('select status, posted_by from pos_settlement where id=$1', [setoran.Tunai.id])).status === 'Diposting')
  await potret(page, '1440-admin-setoran-tunai-diposting')
  cek('setoran: Admin tidak bisa membatalkan yang Diposting', (await page.$$('summary:text-is("Batalkan setoran")')).length === 0)

  // QRIS: langsung posting.
  await page.goto(`${BASE}/setoran/${setoran.QRIS.id}`)
  await Promise.all([page.waitForURL(/\?pesan=setoran-posting/), page.click('button:text-is("Posting setoran")')])
  cek('setoran: Admin memposting setoran QRIS', (await satu('select status from pos_settlement where id=$1', [setoran.QRIS.id])).status === 'Diposting')

  // Debit: nilai disetor dikurangi 20.000. Sejak tahap 6C selisih tidak butuh Owner, jadi Admin langsung memposting.
  await page.goto(`${BASE}/setoran/${setoran.Debit.id}`)
  cek('setoran: keterangan tarif MDR Debit tampil', (await page.textContent('#j-data + dl'))?.includes('MDR 1%'))
  const bd = await satu('select id, actual from pos_settlement_line where pos_settlement_id=$1 order by id limit 1', [setoran.Debit.id])
  await page.fill(`input[name="actual_${bd.id}"]`, String(Number(bd.actual) - 20000))
  cek('setoran: selisih dihitung di layar saat mengetik', (await page.textContent('.lap-ringkas div:last-child dd')).includes('-Rp 20.000'))
  await Promise.all([page.waitForURL(/\?pesan=setoran-tersimpan/), page.click('button:text-is("Simpan setoran")')])
  cek('setoran: selisih tidak lagi memunculkan alasan butuh Owner', !((await page.textContent('main')) ?? '').includes('butuh persetujuan Owner'))
  cek('setoran: Admin melihat tombol posting walau berselisih', (await page.$$('button:text-is("Posting setoran")')).length === 1)
  await potret(page, '1440-admin-setoran-debit-selisih')
  await page.setViewportSize({ width: 390, height: 844 })
  await potret(page, '390-admin-setoran-debit-selisih')
  await page.setViewportSize({ width: 1440, height: 900 })
  await Promise.all([page.waitForURL(/\?pesan=setoran-posting/), page.click('button:text-is("Posting setoran")')])
  const d = await satu('select status, approved_by, diff from pos_settlement where id=$1', [setoran.Debit.id])
  cek('setoran: Admin memposting Debit berselisih tanpa Owner', d.status === 'Diposting' && d.approved_by === null && d.diff === '-20000', JSON.stringify(d))
  cek('setoran: Admin tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  // Admin hanya melihat rekening.
  const r = await page.goto(`${BASE}/rekening/baru`)
  cek('rekening: Admin tidak bisa menambah', r.status() === 403, `status ${r.status()}`)
  await ctx.close()
}

// 3. Owner tidak punya antrean setoran, dan jejak audit Debit tanpa langkah persetujuan.
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/setoran`)
  cek('setoran: tidak ada antrean persetujuan untuk Owner', !((await page.textContent('main')) ?? '').includes('menunggu persetujuan'))
  await page.goto(`${BASE}/setoran/${setoran.Debit.id}`)
  await potret(page, '1440-owner-setoran-debit-diposting')
  await page.goto(`${BASE}/audit?entitas=pos_settlement&dok=${setoran.Debit.id}`)
  const aksi = await page.$$eval('.tabel tbody td[data-label="Aksi"]', (td) => td.map((x) => x.textContent.trim()))
  cek('audit: buat, ubah, posting setoran tanpa ajukan dan setujui', ['Buat setoran', 'Ubah setoran', 'Posting setoran'].every((a) => aksi.includes(a)) && !aksi.includes('Setujui setoran'), aksi.join(', '))
  cek('setoran: Owner tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 4. Laporan menampilkan angka yang sama dengan basis data, dan CSV terunduh.
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.admin)
  const j = await satu(`select count(*)::int n, coalesce(sum(total),0)::bigint total, coalesce(sum(sub),0)::bigint sub, coalesce(sum(disc),0)::bigint disc from sale s where status='Selesai' and ${syaratHari}`, [hariIni])
  const v = await satu(`select count(*)::int n, coalesce(sum(total),0)::bigint total from sale s where status='Void' and ${syaratHari}`, [hariIni])
  await page.goto(`${BASE}/laporan?dari=${hariIni}&sampai=${hariIni}`)
  cek('laporan: rekap total diterima sama dengan basis data', (await sel(page, 'Total diterima')) === rp(j.total), `${await sel(page, 'Total diterima')} lawan ${rp(j.total)}`)
  cek('laporan: rekap jumlah transaksi dan void dipisah', (await sel(page, 'Transaksi')) === String(j.n) && (await sel(page, 'Nilai void')) === rp(v.total), `${await sel(page, 'Transaksi')} / ${await sel(page, 'Nilai void')}`)
  await potret(page, '1440-admin-laporan-rekap')
  const csv = await unduhCsv(page)
  const barisCsv = csv.isi.replace(/^﻿/, '').trim().split(/\r?\n/)
  cek('csv: rekap terunduh dengan BOM, kepala kolom, dan baris jumlah', csv.isi.startsWith('﻿') && barisCsv[0].startsWith('Tanggal,Transaksi') && barisCsv.at(-1).startsWith(`Jumlah,${j.n},`) && barisCsv.at(-1).includes(`,${j.total},`), `${csv.nama}: ${barisCsv.at(-1)}`)
  cek('csv: nama berkas memuat jenis dan tanggal', csv.nama === `rekap-penjualan-hari_${hariIni}_${hariIni}.csv`, csv.nama)

  await page.goto(`${BASE}/laporan/menu?dari=${hariIni}&sampai=${hariIni}`)
  cek('laporan: rekap menu kotor dan potongan sama dengan basis data', (await sel(page, 'Penjualan kotor')) === rp(j.sub) && (await sel(page, 'Potongan teralokasi')) === rp(j.disc), `${await sel(page, 'Penjualan kotor')} / ${await sel(page, 'Potongan teralokasi')}`)
  const csvMenu = await unduhCsv(page)
  cek('csv: rekap menu terunduh', csvMenu.isi.includes('Potongan teralokasi') && csvMenu.isi.includes(`,${j.sub},${j.disc},`), csvMenu.nama)
  await potret(page, '1440-admin-laporan-menu')

  await page.goto(`${BASE}/laporan/pembayaran?dari=${hariIni}&sampai=${hariIni}`)
  cek('laporan: nominal pembayaran sama dengan total, dan semuanya sudah disetor', (await sel(page, 'Nominal')) === rp(j.total) && (await sel(page, 'Sudah disetor')) === rp(j.total) && (await sel(page, 'Belum disetor')) === 'Rp 0', `${await sel(page, 'Nominal')} / ${await sel(page, 'Sudah disetor')} / ${await sel(page, 'Belum disetor')}`)
  const csvBayar = await unduhCsv(page)
  cek('csv: ringkasan pembayaran terunduh', csvBayar.isi.split('\r\n')[0].includes('Sudah disetor'), csvBayar.nama)
  await potret(page, '1440-admin-laporan-pembayaran')

  await page.goto(`${BASE}/laporan/harian?tanggal=${hariIni}`)
  const kolomSetoran = await page.$$eval('.lap-tabel tbody td[data-label="Setoran Tunai"]', (td) => td.map((x) => x.textContent.trim()))
  cek('laporan: tutup harian menandai semua shift sudah disetor tunai', kolomSetoran.length > 0 && kolomSetoran.every((x) => x.startsWith(setoran.Tunai.no)), kolomSetoran.join(', '))
  const baris = await page.$eval(`.lap-tabel tbody tr:has(a[href="/shift/${idShift}"])`, (tr) => Object.fromEntries([...tr.querySelectorAll('td')].map((td) => [td.dataset.label, td.textContent.trim()])))
  const sh = await satu('select expected_cash, counted_cash from shift where id=$1', [idShift])
  cek('laporan: kas seharusnya dan dihitung sama dengan hitungan tutup shift', baris['Kas seharusnya'] === rp(sh.expected_cash) && baris['Kas dihitung'] === rp(sh.counted_cash) && baris.Selisih === 'Rp 0', JSON.stringify(baris))
  cek('laporan: tidak ada yang belum disetor', (await page.textContent('#j-belum + *')).includes('sudah disetor'))
  const csvHarian = await unduhCsv(page)
  cek('csv: tutup harian terunduh', csvHarian.nama === `tutup-harian_${hariIni}.csv` && csvHarian.isi.includes(setoran.Tunai.no), csvHarian.nama)
  await potret(page, '1440-admin-laporan-harian')

  await page.goto(`${BASE}/laporan/selisih?dari=${hariIni}&sampai=${hariIni}`)
  const owner = await page.$eval('.lap-tabel tbody tr:has(td[data-label="Kasir"]:text-is("Kasir Contoh")) td[data-label="Perlu Owner"]', (td) => td.textContent.trim()).catch(() => null)
  const harapOwner = await satu("select count(*)::int n from shift sh join app_user u on u.id=sh.user_id where u.name='Kasir Contoh' and sh.status <> 'Buka' and (sh.status='PerluPersetujuan' or sh.approved_by is not null) and (sh.opened_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date", [hariIni])
  cek('laporan: selisih per kasir menghitung shift yang perlu Owner', owner === String(harapOwner.n), `${owner} lawan ${harapOwner.n}`)
  const csvSelisih = await unduhCsv(page)
  cek('csv: selisih kas terunduh', csvSelisih.isi.includes('Kasir Contoh'), csvSelisih.nama)
  await potret(page, '1440-admin-laporan-selisih')
  cek('laporan: Admin tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 5. Semua halaman baru dibuka per peran di dua lebar: tanpa galat konsol dan tanpa luapan horizontal.
const idRekening = (await satu("select id from bank_account where bank_name='BCA'")).id
const HALAMAN = {
  owner: ['/setoran', `/setoran/${setoran.Tunai.id}`, `/setoran/${setoran.Debit.id}`, '/laporan', '/laporan/menu', '/laporan/menu?kelompok=kategori', '/laporan/pembayaran', '/laporan/harian', '/laporan/selisih', '/rekening', '/rekening/baru', `/rekening/${idRekening}`],
  admin: ['/setoran', `/setoran/${setoran.QRIS.id}`, '/laporan?kelompok=kasir', '/laporan/harian', '/rekening', `/rekening/${idRekening}`],
}
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  for (const peran of ['owner', 'admin']) {
    const { ctx, page, galat } = await konteks(w, h)
    await masuk(page, AKUN[peran])
    for (const jalur of HALAMAN[peran]) {
      const r = await page.goto(`${BASE}${jalur}`)
      const nama = `${w}-${peran}${jalur.replace(/[/?=&]+/g, '-')}`
      cek(`${w}px ${peran}: ${jalur} terbuka`, r.status() === 200, `status ${r.status()}`)
      await potret(page, nama)
    }
    // Sidebar memuat item baru dan bisa diketuk.
    if (w < 900) {
      await page.goto(`${BASE}/`)
      await page.click('.tombol-menu')
      await page.waitForSelector('.laci-buka .samping')
    }
    for (const [href, label] of [
      ['/setoran', 'Setoran POS'],
      ['/laporan', 'Laporan'],
      ['/rekening', 'Rekening Bank'],
    ]) {
      cek(`${w}px ${peran}: sidebar memuat ${label}`, (await page.$$(`.samping nav a[href="${href}"]`)).length === 1)
    }
    if (w < 900) {
      await Promise.all([page.waitForURL('**/laporan'), page.click('.samping nav a[href="/laporan"]')])
      cek(`${w}px ${peran}: item Laporan di laci bisa diketuk`, !(await page.$('.laci-buka')) && (await teks(page)).includes('Rekap Penjualan'))
    }
    cek(`${w}px ${peran}: halaman baru tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-laporan.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`\nRingkasan laporan: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exitCode = gagal.length ? 1 : 0
