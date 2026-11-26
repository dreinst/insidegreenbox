// Uji klik tahap 5B (akuntansi), dijalankan jalankan.sh sesudah produksi.mjs dan sebelum klik.mjs. Kasir menjual lalu
// Owner menemukan jurnalnya di Buku Besar; Owner membuat akun dan jurnal memorial sampai Diposting; Laba Rugi dan Neraca
// terbuka dan seimbang; periode bulan lalu ditutup lalu posting bertanggal di bulan itu ditolak; Admin dan Kasir ditolak
// di akuntansi inti. Semua halaman baru dipotret di 1440 dan 390 px tanpa galat konsol dan tanpa luapan horizontal.
// Potret ke tests/potret/, ringkasan ke tests/hasil/e2e-akuntansi.json.
import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import pg from 'pg'
import { chromium } from 'playwright'
import { klikSamping } from './sidebar.mjs'

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

const browser = await chromium.launch({ headless: true })
const ipAcak = () => `10.${randomInt(1, 250)}.${randomInt(1, 250)}.${randomInt(1, 250)}`

async function konteks(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-forwarded-for': ipAcak() }, locale: 'id-ID', acceptDownloads: true })
  const page = await ctx.newPage()
  const galat = []
  page.on('console', (m) => {
    // Status 403 halaman yang memang ditolak tercatat sebagai galat sumber daya; itu yang diuji, bukan galat.
    if (m.type() === 'error' && !/status of 403/.test(m.text())) galat.push(`${page.url()}: ${m.text()}`)
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
const idDariUrl = (page) => Number(new URL(page.url()).pathname.split('/').pop())
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const bulanLalu = (() => {
  const d = new Date(Date.UTC(Number(hariIni.slice(0, 4)), Number(hariIni.slice(5, 7)) - 2, 1))
  return d.toISOString().slice(0, 7)
})()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const namaBulanLalu = `${NAMA_BULAN[Number(bulanLalu.slice(5, 7)) - 1]} ${bulanLalu.slice(0, 4)}`
const akunId = async (kode) => (await satu('select id from account where code=$1', [kode])).id

// Kirim formulir lewat tombol berteks tertentu dan tunggu alamat berikutnya.
const kirimKe = (page, tombol, pola) => Promise.all([page.waitForURL(pola, { timeout: 20000 }), page.click(`button:text-is("${tombol}")`)])

// 1. Kasir menjual tunai; jurnalnya muncul di Buku Besar Kas Laci dan seimbang.
let idJurnalJual = 0
let noJual = ''
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.kasir)
  const idKasir = (await satu('select id from app_user where username=$1', [AKUN.kasir.u])).id
  if (!(await satu("select id from shift where user_id=$1 and status='Buka'", [idKasir]))) {
    await page.goto(`${BASE}/shift`)
    await page.fill('#k-modal', '100.000')
    await kirimKe(page, 'Buka shift', /pesan=shift-buka/)
  }
  await page.goto(`${BASE}/kasir`)
  await page.click('button:text-is("Take away")')
  await page.click('.lk-ubin button:has(b:text-is("Kopi Susu Greenbox"))')
  await page.fill('#k-jumlah-0', '100000')
  const idSebelum = Number((await satu('select coalesce(max(id),0) n from sale')).n)
  await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > idSebelum, { timeout: 20000 }), page.click('button.lk-tombol-bayar')])
  const idJual = Number(new URL(page.url()).searchParams.get('selesai'))
  const jual = await satu('select no, total::text from sale where id=$1', [idJual])
  noJual = jual.no
  const j = await satu(
    `select j.id, j.no, sum(l.debit)::text d, sum(l.credit)::text k from journal j join journal_line l on l.journal_id=j.id
     where j.source_type='sale' and j.source_id=$1 and j.reversal_of_id is null group by j.id`,
    [idJual],
  )
  idJurnalJual = j?.id ?? 0
  cek('jual: jurnal penjualan terbentuk dan seimbang', j && j.d === j.k && Number(j.d) >= Number(jual.total), JSON.stringify(j))
  cek('jual: kasir tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  // Kasir tidak punya akses akuntansi apa pun.
  const label = await page.$$eval('.samping nav a', (a) => a.map((x) => x.textContent.trim()))
  cek('kasir: sidebar tanpa grup Akuntansi', !(await page.$('#grup-akuntansi')) && !label.some((l) => ['Akun dan Pemetaan', 'Jurnal Umum', 'Buku Besar', 'Laporan Keuangan', 'Tutup Periode'].includes(l)), label.join(', '))
  for (const jalur of ['/laporan-keuangan/unduh?jenis=neraca', '/akun', '/akun/pemetaan', '/jurnal', '/jurnal/baru', '/buku-besar', '/laporan-keuangan', '/laporan-keuangan/neraca', '/tutup-periode']) {
    const r = await page.goto(`${BASE}${jalur}`)
    cek(`kasir: ${jalur} ditolak`, r.status() === 403, `status ${r.status()}`)
  }
  await potret(page, '1440-ak-kasir-ditolak')
  await ctx.close()
}

// 2. Owner: buku besar Kas Laci memuat jurnal penjualan tadi; rincian jurnal seimbang.
const idKasLaci = await akunId('1-1100')
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.owner)
  await page.goto(`${BASE}/buku-besar?akun=${idKasLaci}&dari=${hariIni}&sampai=${hariIni}`)
  const isi = await teks(page)
  const jj = await satu('select no from journal where id=$1', [idJurnalJual])
  cek('buku besar: jurnal penjualan tampil di Kas Laci', isi.includes(noJual) && isi.includes(jj?.no ?? '?'), `${noJual} ${jj?.no}`)
  await Promise.all([page.waitForURL(`**/jurnal/${idJurnalJual}`), page.click(`a:text-is("${jj.no}")`)])
  cek('jurnal: rincian penjualan seimbang', (await teks(page)).includes('Seimbang'))
  await potret(page, '1440-ak-jurnal-penjualan')

  // 3. Akun baru lewat formulir (galat dulu, isian terjaga), lalu jurnal memorial sampai Diposting.
  await page.goto(`${BASE}/akun/baru`)
  await page.fill('#k-code', '6-1960')
  await page.fill('#k-name', 'B')
  await page.click('button:text-is("Simpan akun")')
  await page.waitForSelector('.galat-kolom')
  cek('akun: nama terlalu pendek ditolak dan kode terjaga', (await page.inputValue('#k-code')) === '6-1960', await page.textContent('.galat-kolom'))
  await page.fill('#k-name', 'Beban Promosi')
  await page.selectOption('#k-parentId', { label: '6-1000 Beban Operasional (Beban)' })
  await kirimKe(page, 'Simpan akun', /\/akun\/\d+\?pesan=dibuat/)
  const akunBaru = await satu("select id, kind::text, parent_id from account where code='6-1960'")
  cek('akun: akun baru tersimpan di bawah induknya', akunBaru?.kind === 'Beban' && akunBaru.parent_id === (await akunId('6-1000')), JSON.stringify(akunBaru))

  await page.goto(`${BASE}/jurnal/baru`)
  await page.fill('#k-memo', 'Setoran modal pemilik ke kas besar')
  await kirimKe(page, 'Buat draf', /\/jurnal\/\d+\?pesan=draf/)
  const idMemorial = idDariUrl(page)
  const tambahBaris = async (akunLabel, debit, kredit) => {
    await page.selectOption('#k-accountId', { label: akunLabel })
    if (debit) await page.fill('#k-debit', debit)
    if (kredit) await page.fill('#k-kredit', kredit)
    await kirimKe(page, 'Tambah baris', /pesan=baris/)
  }
  await tambahBaris('1-1200 Kas Besar', '250.000', '')
  await page.click('button:text-is("Ajukan untuk disetujui")')
  await page.waitForSelector('.pesan.galat')
  cek('memorial: satu baris ditolak saat diajukan', (await page.textContent('.pesan.galat')).includes('minimal dua baris'))
  await tambahBaris('3-1000 Modal Pemilik', '', '250.000')
  await potret(page, '1440-ak-memorial-draf')
  await kirimKe(page, 'Ajukan untuk disetujui', /pesan=ajukan/)
  cek('memorial: Diajukan', (await satu('select status::text s from journal where id=$1', [idMemorial])).s === 'Diajukan')
  await kirimKe(page, 'Setujui dan posting', /pesan=posting/)
  const m = await satu('select status::text s, posted_at is not null berlaku, approved_by is not null disetujui from journal where id=$1', [idMemorial])
  cek('memorial: Diposting, berlaku, dan tercatat penyetujunya', m.s === 'Diposting' && m.berlaku && m.disetujui, JSON.stringify(m))
  await potret(page, '1440-ak-memorial-diposting')
  await page.goto(`${BASE}/buku-besar?akun=${await akunId('3-1000')}`)
  const noMemorial = (await satu('select no from journal where id=$1', [idMemorial])).no
  cek('memorial: tampil di buku besar Modal Pemilik', (await teks(page)).includes(noMemorial), noMemorial)
  const audit = await satu("select count(*)::int n from audit_log where doc_type='journal' and doc_id=$1 and action like 'memorial.%'", [String(idMemorial)])
  cek('memorial: tambah, baris, ajukan, posting tercatat di audit', audit.n >= 5, `${audit.n} baris`)

  // 4. Laba Rugi dan Neraca terbuka dan seimbang, persediaan buku sama dengan stok; CSV neraca saldo terunduh.
  await page.goto(`${BASE}/laporan-keuangan`)
  cek('neraca saldo: seimbang', (await page.textContent('.lk-status')).startsWith('Seimbang'))
  const [unduh] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('a.lap-unduh')])
  const csv = readFileSync(await unduh.path(), 'utf8')
  cek('neraca saldo: CSV berisi kolom saldo akhir', csv.startsWith('﻿Kode,Akun,Jenis') && csv.includes('Saldo akhir kredit'), unduh.suggestedFilename())
  await page.goto(`${BASE}/laporan-keuangan/laba-rugi`)
  const lr = await teks(page)
  cek('laba rugi: terbuka dengan laba kotor dan laba bersih', lr.includes('Laba kotor') && lr.includes('Laba bersih') && lr.includes('Penjualan'))
  await page.goto(`${BASE}/laporan-keuangan/neraca`)
  cek('neraca: seimbang', (await page.textContent('.lk-status')).startsWith('Seimbang'), await page.textContent('.lk-status'))
  // Gerak stok dari dokumen yang belum punya jurnal maju (setelah penggabungan tahap 4C dan 5B: dokumen pembelian dari
  // pembelian.mjs, sampai jurnal pembelian digabung; KONTRAK 11 butir 86) dikeluarkan dari pembanding. Bila semuanya
  // sudah berjurnal, nilainya 0 dan neraca wajib menulis Cocok.
  const tanpaJurnal = BigInt(
    (
      await satu(
        'select coalesce(sum(g.value),0)::text n from stock_ledger g where not exists (select 1 from journal j where j.source_type=g.doc_type and j.source_id=g.doc_id and j.reversal_of_id is null)',
      )
    ).n,
  )
  const isiNeraca = await teks(page)
  cek('neraca: persediaan buku cocok dengan kartu stok', tanpaJurnal === 0n ? isiNeraca.includes('Cocok') : !isiNeraca.includes('Cocok'), `gerak belum berjurnal ${tanpaJurnal}`)
  const stok = await satu('select coalesce(sum(value),0)::text n from stock_balance')
  const buku = await satu(
    "select coalesce(sum(l.debit-l.credit),0)::text n from journal_line l join journal j on j.id=l.journal_id where j.posted_at is not null and l.account_id in (select account_id from account_mapping where key='persediaan' or key like 'persediaan.%')",
  )
  cek('neraca: saldo akun persediaan sama dengan nilai stock_balance dikurangi gerak belum berjurnal', BigInt(stok.n) - tanpaJurnal === BigInt(buku.n), `stok ${stok.n}, buku ${buku.n}, belum berjurnal ${tanpaJurnal}`)

  // 5. Tutup periode bulan lalu, lalu memorial bertanggal di bulan itu ditolak saat diposting; buka lagi dengan alasan.
  await page.goto(`${BASE}/tutup-periode`)
  await potret(page, '1440-ak-tutup-periode-awal')
  await kirimKe(page, `Tutup ${namaBulanLalu}`, /pesan=tutup/)
  cek('tutup periode: bulan lalu Ditutup', (await satu('select status::text s from fiscal_period where year_month=$1', [bulanLalu]))?.s === 'Ditutup', bulanLalu)
  await potret(page, '1440-ak-tutup-periode-ditutup')
  await page.goto(`${BASE}/jurnal/baru`)
  await page.fill('#k-date', `${bulanLalu}-15`)
  await page.fill('#k-memo', 'Koreksi bulan lalu')
  await kirimKe(page, 'Buat draf', /\/jurnal\/\d+\?pesan=draf/)
  const idLalu = idDariUrl(page)
  await tambahBaris('6-1900 Beban Lain-lain', '10.000', '')
  await tambahBaris('1-1200 Kas Besar', '', '10.000')
  await kirimKe(page, 'Ajukan untuk disetujui', /pesan=ajukan/)
  await page.click('button:text-is("Setujui dan posting")')
  await page.waitForSelector('.pesan.galat')
  const pesan = await page.textContent('.pesan.galat')
  const lalu = await satu('select status::text s, posted_at from journal where id=$1', [idLalu])
  cek('tutup periode: posting bertanggal bulan lalu ditolak', pesan.includes('sudah ditutup') && lalu.s === 'Diajukan' && lalu.posted_at === null, pesan)
  await potret(page, '1440-ak-memorial-periode-tertutup')
  await page.goto(`${BASE}/tutup-periode`)
  await page.click(`tr:has-text("${namaBulanLalu}") summary:text-is("Buka lagi")`)
  await page.fill('#k-alasan', 'Koreksi memorial bulan lalu')
  await kirimKe(page, `Buka ${namaBulanLalu}`, /pesan=buka/)
  const p2 = await satu('select status::text s, reopen_reason from fiscal_period where year_month=$1', [bulanLalu])
  cek('tutup periode: Owner membuka lagi dengan alasan', p2.s === 'Terbuka' && p2.reopen_reason === 'Koreksi memorial bulan lalu', JSON.stringify(p2))
  cek('akuntansi: Owner tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 6. Admin: hanya melihat Akun dan Pemetaan; akuntansi inti ditolak, termasuk aksi tutup periode.
{
  const { ctx, page, galat } = await konteks(1440, 900)
  await masuk(page, AKUN.admin)
  const judul = await page.$$eval('.samping-grup:has(#grup-akuntansi) a', (a) => a.map((x) => x.textContent.trim()))
  cek('admin: grup Akuntansi hanya berisi Akun dan Pemetaan', JSON.stringify(judul) === JSON.stringify(['Akun dan Pemetaan']), judul.join(', '))
  for (const jalur of ['/laporan-keuangan/unduh?jenis=neraca', '/jurnal', '/jurnal/baru', `/jurnal/${idJurnalJual}`, '/buku-besar', '/laporan-keuangan', '/laporan-keuangan/laba-rugi', '/laporan-keuangan/neraca', '/tutup-periode', '/akun/baru']) {
    const r = await page.goto(`${BASE}${jalur}`)
    cek(`admin: ${jalur} ditolak`, r.status() === 403, `status ${r.status()}`)
  }
  const r = await page.goto(`${BASE}/akun`)
  cek('admin: bagan akun terbuka tanpa tombol tambah', r.status() === 200 && !(await page.$('a:text-is("Tambah akun")')))
  await page.goto(`${BASE}/akun/pemetaan`)
  cek('admin: pemetaan hanya dibaca (tanpa pilihan akun)', !(await page.$('form select')) && (await teks(page)).includes('Kas laci kasir'))
  const tolak = await satu("select count(*)::int n from audit_log where action='izin.ditolak' and (doc_id like '%akun.%' or doc_id like '%laporan.keuangan')")
  cek('admin dan kasir: penolakan akuntansi tercatat di audit', tolak.n >= 18, `${tolak.n} baris`)
  cek('admin: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}

// 7. Semua halaman baru per peran di dua lebar: terbuka, tanpa galat konsol, tanpa luapan horizontal.
const idMemorialAkhir = (await satu("select max(id) n from journal where source_type='memorial' and posted_at is not null")).n
const HALAMAN = {
  owner: [
    '/akun',
    '/akun/baru',
    `/akun/${idKasLaci}`,
    '/akun/pemetaan',
    '/jurnal',
    '/jurnal/baru',
    `/jurnal/${idMemorialAkhir}`,
    `/jurnal/${idJurnalJual}`,
    `/buku-besar?akun=${idKasLaci}`,
    '/buku-besar',
    '/laporan-keuangan',
    '/laporan-keuangan/laba-rugi',
    '/laporan-keuangan/neraca',
    '/tutup-periode',
    '/laporan',
    '/laporan/menu',
  ],
  admin: ['/akun', `/akun/${idKasLaci}`, '/akun/pemetaan'],
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
      const nama = `${w}-ak-${peran}${jalur.replace(/[/?=&]+/g, '-')}`
      cek(`${w}px ${peran}: ${jalur} terbuka`, r.status() === 200, `status ${r.status()}`)
      await potret(page, nama)
    }
    if (peran === 'owner') {
      await page.goto(`${BASE}/laporan`)
      cek(`${w}px owner: rekap penjualan memuat kolom HPP dan laba kotor`, !!(await page.$('th:text-is("Laba kotor")')) && !!(await page.$('th:text-is("HPP")')))
    }
    if (w < 900) {
      await page.goto(`${BASE}/`)
      await page.click('.tombol-menu')
      await page.waitForSelector('.laci-buka .samping')
      await Promise.all([page.waitForURL('**/akun'), klikSamping(page, '/akun')])
      cek(`${w}px ${peran}: item Akun dan Pemetaan di laci bisa diketuk`, !(await page.$('.laci-buka')) && (await teks(page)).includes('Bagan Akun'))
    }
    cek(`${w}px ${peran}: halaman akuntansi tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
    await ctx.close()
  }
}

await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus)
writeFileSync(`${HASIL}e2e-akuntansi.json`, JSON.stringify({ lulus: hasil.length - gagal.length, gagal: gagal.length, hasil }, null, 2))
console.log(`Ringkasan akuntansi: ${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
process.exit(gagal.length ? 1 : 0)
