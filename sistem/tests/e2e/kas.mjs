// Uji klik tahap 5C: beli dari pesanan sampai dibayar lalu Hutang Usaha pemasok itu kembali 0 di buku, kas keluar biaya,
// pindah dana, unggah CSV mutasi lalu cocokkan sampai rekonsiliasi Diposting (sebagian di layar 390 px), baris yang
// dicocokkan terkunci, akses Admin ke rekonsiliasi ditolak, dan semua langkah tercatat di Jejak Audit. Setiap halaman
// baru dipotret di 1440 dan 390 px. Dijalankan oleh tests/e2e/jalankan.sh sebelum klik.mjs, atau langsung:
// BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/kas.mjs
// Basis data harus sudah berisi seed, seed:contoh, impor:stok, dan impor:beli. Potret ke tests/potret/, ringkasan ke
// tests/hasil/e2e-kas.json.
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
}
const tanda = Date.now().toString(36).slice(-5).toUpperCase()
const NOREK = String(8800000000 + randomInt(1, 99999999))

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
const akunId = async (code) => (await satu('select id from account where code=$1', [code])).id
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const nilaiRingkas = async (page, label) => (await page.locator(`dl div:has(> dt:text-is("${label}")) dd`).first().textContent())?.trim()
// "Rp 1.234", "-Rp 1.234", dan "Rp -1.234" menjadi angka bertanda.
const angka = (t) => Number((t ?? '').replace(/[^\d-]/g, '') || 'NaN')

const gula = await satu("select p.id, p.base_unit_id u, p.last_cost::float8 c from product p where code='BHN-GULA'")
const halamanBaru = []
const catatHalaman = (jalur, nama) => halamanBaru.push({ jalur, nama })

const O = await konteks(1440, 900)
const A = await konteks(1440, 900)
await masuk(O.page, AKUN.owner)
await masuk(A.page, AKUN.admin)
const o = O.page
const a = A.page

// 0. Rekening bank baru untuk uji ini (Owner).
await buka(o, '/rekening/baru')
await o.fill('#k-bankName', 'BCA')
await o.fill('#k-accountNo', NOREK)
await o.fill('#k-holderName', `Greenbox uji ${tanda}`)
await kirimKe(o, tombol('Simpan rekening'), /\/rekening\/\d+/)
const rek = (await satu('select id from bank_account where account_no=$1', [NOREK])).id
cek('rekening: tersimpan', !!rek)

// 1. Beli dari pesanan sampai dibayar dari rekening, lalu Hutang Usaha pemasok itu kembali 0 di buku besar.
const sup = (await satu("select id from supplier where code='SUP-SP1'")).id
const hargaGula = Math.max(1, Math.round(gula.c || 18))
await buka(a, '/pesanan/baru')
await a.selectOption('#k-supplierId', String(sup))
await kirimKe(a, tombol('Buat draf'), /\/pesanan\/\d+\?pesan=draf/)
const idPo = idDari(a.url())
await a.selectOption('#k-item', `${gula.id}:${gula.u}`)
await a.fill('#k-qty', '2000')
await a.fill('#k-price', String(hargaGula))
await kirim(a, tombol('Tambah baris'))
await kirim(a, tombol('Setujui sekarang'))
cek('beli: pesanan Disetujui', (await status('purchase_order', idPo)) === 'Disetujui', await pesanGalat(a))
await buka(a, `/penerimaan/baru?po=${idPo}`)
await kirimKe(a, tombol('Buat draf penerimaan'), /\/penerimaan\/\d+\?pesan=draf/)
const idGr = idDari(a.url())
await kirim(a, tombol('Posting'))
cek('beli: penerimaan Diposting', (await status('goods_receipt', idGr)) === 'Diposting', await pesanGalat(a))
const jGr = await satu("select j.no, sum(l.credit) filter (where a.code='2-1200')::bigint bdbf from journal j join journal_line l on l.journal_id=j.id join account a on a.id=l.account_id where j.source_type='goods_receipt' and j.source_id=$1 and j.reversal_of_id is null group by j.no", [idGr])
const nilaiGr = 2000 * hargaGula
cek('beli: jurnal penerimaan kredit BDBF sebesar nilai terima', jGr && Number(jGr.bdbf) === nilaiGr, JSON.stringify(jGr))
await buka(a, '/faktur/baru')
await a.selectOption('#k-supplierId', String(sup))
await a.fill('#k-supplierInvoiceNo', `INV-K-${tanda}`)
await kirimKe(a, tombol('Buat draf faktur'), /\/faktur\/\d+\?pesan=draf/)
const idFaktur = idDari(a.url())
await a.selectOption('#k-goodsReceiptId', String(idGr))
await kirim(a, tombol('Tarik ke faktur'))
await kirim(a, tombol('Posting'))
cek('beli: faktur Diposting', (await status('purchase_invoice', idFaktur)) === 'Diposting', await pesanGalat(a))
const hutangSup = async () => Number((await satu("select coalesce(sum(l.credit - l.debit),0)::bigint n from journal_line l join journal j on j.id=l.journal_id join account a on a.id=l.account_id where a.code='2-1100' and l.supplier_id=$1 and j.posted_at is not null", [sup])).n)
const hutangAwal = await hutangSup()
cek('beli: Hutang Usaha pemasok di buku bertambah sebesar faktur', hutangAwal >= nilaiGr, `${hutangAwal}`)
await buka(a, `/pembayaran/baru?pemasok=${sup}`)
await a.selectOption('#k-sumber', String(rek))
await kirimKe(a, tombol('Buat draf pembayaran'), /\/pembayaran\/\d+\?pesan=draf/)
const idBayar = idDari(a.url())
await kirim(a, tombol('Simpan alokasi'))
const jumlahBayar = Number((await satu('select amount from purchase_payment where id=$1', [idBayar])).amount)
await kirim(a, tombol('Ajukan untuk disetujui'))
await buka(o, `/pembayaran/${idBayar}`)
await kirim(o, tombol('Setujui'))
await kirim(o, tombol('Posting'))
cek('beli: pembayaran Diposting dari rekening', (await status('purchase_payment', idBayar)) === 'Diposting' && jumlahBayar >= nilaiGr, `${jumlahBayar} ${await pesanGalat(o)}`)
cek('beli: Hutang Usaha pemasok kembali 0 sesudah dibayar', (await hutangSup()) === 0, `${await hutangSup()}`)
await potret(o, '1440-k-pembayaran-diposting')
// Buku Besar Hutang Usaha sama dengan halaman Hutang Pemasok, dan BDBF sama dengan kolom belum difakturkan.
{
  await buka(o, `/buku-besar?akun=${await akunId('2-1100')}`)
  const bbHutang = await nilaiRingkas(o, 'Saldo akhir')
  await potret(o, '1440-k-buku-besar-hutang')
  await buka(o, `/buku-besar?akun=${await akunId('2-1200')}`)
  const bbBdbf = await nilaiRingkas(o, 'Saldo akhir')
  await buka(o, '/hutang')
  const halHutang = await nilaiRingkas(o, 'Saldo hutang')
  const halBdbf = await nilaiRingkas(o, 'Diterima belum difakturkan')
  cek('buku besar: saldo Hutang Usaha = saldo halaman Hutang Pemasok', angka(bbHutang) === angka(halHutang), `${bbHutang} lawan ${halHutang}`)
  cek('buku besar: saldo BDBF = diterima belum difakturkan di Hutang Pemasok', angka(bbBdbf) === angka(halBdbf), `${bbBdbf} lawan ${halBdbf}`)
  await potret(o, '1440-k-hutang')
}

// 2. Kas keluar biaya dari rekening: Admin menyusun dan mengajukan, Owner menyetujui lalu memposting.
await buka(a, '/kas/baru?jenis=keluar')
catatHalaman('/kas/baru?jenis=keluar', 'kas-baru')
await a.selectOption('#k-sumber', String(rek))
await a.fill('#k-partyName', 'PLN')
await kirimKe(a, tombol('Buat draf'), /\/kas\/\d+\?pesan=draf/)
const idKas = idDari(a.url())
cek('kas keluar: Admin tidak ditawari akun persediaan atau hutang', (await a.locator('#k-accountId option').allTextContents()).every((t) => !/Persediaan|Hutang Usaha|Kas Besar/.test(t)))
await a.selectOption('#k-accountId', String(await akunId('6-1600')))
await a.fill('#k-amount', '650.000')
await a.fill('#k-memo', 'Listrik bulan ini')
await kirim(a, tombol('Tambah baris'))
await potret(a, '1440-k-kas-draf')
cek('kas keluar: Admin tidak punya tombol Posting', (await a.locator(tombol('Posting')).count()) === 0)
await kirim(a, tombol('Ajukan untuk disetujui'))
cek('kas keluar: Diajukan', (await status('cash_transaction', idKas)) === 'Diajukan', await pesanGalat(a))
await buka(o, `/kas/${idKas}`)
await kirim(o, tombol('Setujui'))
await kirim(o, tombol('Posting'))
cek('kas keluar: Diposting', (await status('cash_transaction', idKas)) === 'Diposting', await pesanGalat(o))
const jKas = await satu("select sum(l.debit) filter (where a.code='6-1600')::bigint beban, sum(l.credit) filter (where l.bank_account_id=$2)::bigint bank from journal j join journal_line l on l.journal_id=j.id join account a on a.id=l.account_id where j.source_type='cash_transaction' and j.source_id=$1", [idKas, rek])
cek('kas keluar: jurnal debit beban listrik, kredit rekening', Number(jKas.beban) === 650_000 && Number(jKas.bank) === 650_000, JSON.stringify(jKas))
await potret(o, '1440-k-kas-diposting')
catatHalaman(`/kas/${idKas}`, 'kas-rincian')

// 3. Pindah dana dari Kas Besar ke rekening (Owner).
await buka(o, '/pindah-dana/baru')
catatHalaman('/pindah-dana/baru', 'pindah-baru')
await o.selectOption('#k-sumber', 'kas')
await o.selectOption('#k-tujuan', String(rek))
await o.fill('#k-amount', '10.000.000')
await kirimKe(o, tombol('Buat draf pindah dana'), /\/pindah-dana\/\d+\?pesan=draf/)
const idPindah = idDari(o.url())
const noPindah = (await satu('select no from cash_transaction where id=$1', [idPindah])).no
await kirim(o, tombol('Ajukan untuk disetujui'))
await kirim(o, tombol('Setujui'))
await kirim(o, tombol('Posting'))
cek('pindah dana: Diposting', (await status('cash_transaction', idPindah)) === 'Diposting', await pesanGalat(o))
await potret(o, '1440-k-pindah-diposting')
catatHalaman(`/pindah-dana/${idPindah}`, 'pindah-rincian')

// 4. Unggah CSV mutasi, cocokkan, sampai rekonsiliasi Diposting.
const akunBank = (await satu("select account_id from account_mapping where key = any($1) order by key = 'bank' limit 1", [[`bank.${rek}`, 'bank']])).account_id
const awalBuku = Number(
  (await satu('select coalesce(sum(l.debit - l.credit),0)::bigint n from journal_line l join journal j on j.id=l.journal_id where l.account_id=$1 and j.posted_at is not null and j.date < $2::date and (l.bank_account_id is null or l.bank_account_id=$3)', [akunBank, hariIni, rek])).n,
)
const noBayar = (await satu('select no from purchase_payment where id=$1', [idBayar])).no
let saldo = awalBuku
const baris = [
  ['SETORAN KAS BESAR', noPindah, 0, 10_000_000],
  ['TRSF E-BANKING DB PLN', '', 650_000, 0],
  [`TRSF DB SUP-SP1 ${noBayar}`, '', jumlahBayar, 0],
  ['BIAYA ADM BULANAN', '', 6_500, 0],
]
const fmt = (n) => (n ? Number(n).toLocaleString('id-ID') : '')
const csv = ['Tanggal,Keterangan,Referensi,Debit,Kredit,Saldo', ...baris.map(([ket, ref, d, k]) => ((saldo += k - d), `${dmy(hariIni)},${ket},${ref},"${fmt(d)}","${fmt(k)}","${saldo.toLocaleString('id-ID')}"`))].join('\r\n')
const unggah = async () => {
  await buka(o, `/rekonsiliasi/impor?format=umum&rekening=${rek}`)
  await o.setInputFiles('#k-berkas', { name: `mutasi-${tanda}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
  await kirimKe(o, tombol('Impor mutasi'), /\/rekonsiliasi\?pesan=impor/)
}
await unggah()
cek('impor: 4 baris mutasi baru', (await satu('select count(*)::int n from bank_statement_line where bank_account_id=$1', [rek])).n === 4 && /4 baris baru/.test(await o.textContent('.rk-hasil')), await o.textContent('.rk-hasil'))
await potret(o, '1440-k-rekonsiliasi-sesudah-impor')
await unggah()
cek('impor: berkas yang sama diimpor lagi dilewati', (await satu('select count(*)::int n from bank_statement_line where bank_account_id=$1', [rek])).n === 4 && /0 baris baru, 4 sudah pernah diimpor/.test(await o.textContent('.rk-hasil')))
await buka(o, `/rekonsiliasi/baru?rekening=${rek}`)
catatHalaman(`/rekonsiliasi/baru?rekening=${rek}`, 'rekonsiliasi-baru')
await o.fill('#k-periodFrom', hariIni)
await o.fill('#k-periodTo', hariIni)
await o.fill('#k-stmtOpening', String(awalBuku))
await kirimKe(o, tombol('Buat rekonsiliasi'), /\/rekonsiliasi\/\d+\?pesan=draf/)
const idRk = idDari(o.url())
catatHalaman(`/rekonsiliasi/${idRk}`, 'rekonsiliasi-rincian')
cek('rekonsiliasi: draf memuat 4 mutasi, tombol Posting belum ada', (await satu('select count(*)::int n from bank_statement_line where bank_reconcile_id=$1', [idRk])).n === 4 && (await o.locator(tombol('Posting rekonsiliasi')).count()) === 0)
await potret(o, '1440-k-rekonsiliasi-draf')
const saranTeks = (await o.locator('button[type=submit]:has-text("Terapkan")').textContent()) ?? ''
cek('rekonsiliasi: 3 saran (referensi pindah dana, nominal kas keluar dan pembayaran)', /Terapkan 3 saran/.test(saranTeks), saranTeks)
await kirim(o, 'button[type=submit]:has-text("Terapkan")')
cek('rekonsiliasi: 3 mutasi cocok lewat saran', (await satu("select count(*)::int n from bank_statement_line where bank_reconcile_id=$1 and match_status='Cocok'", [idRk])).n === 3, await pesanGalat(o))

// Biaya admin belum ada di buku: dibuat kas keluar dari baris mutasi di layar 390 px.
{
  const { ctx, page, galat } = await konteks(390, 844)
  await masuk(page, AKUN.owner)
  await buka(page, `/rekonsiliasi/${idRk}`)
  await potret(page, '390-k-rekonsiliasi-cocok')
  const li = page.locator('li.rk-baris:has-text("BIAYA ADM BULANAN")')
  const idm = (await li.getAttribute('id')).slice(2)
  await li.locator('summary').click()
  await page.selectOption(`#k-akun_${idm}`, String(await akunId('6-1300')))
  const kotak = await li.locator(tombol('Buat, posting, dan cocokkan')).boundingBox()
  cek('390px: tombol buat kas dari mutasi utuh di layar', kotak && kotak.x >= 0 && kotak.x + kotak.width <= 390, JSON.stringify(kotak))
  await potret(page, '390-k-rekonsiliasi-buat-kas')
  await kirim(page, tombol('Buat, posting, dan cocokkan'))
  cek('390px: biaya admin menjadi kas keluar Diposting dan cocok', (await satu("select match_status s from bank_statement_line where id=$1", [idm])).s === 'Cocok', await pesanGalat(page))
  cek('390px: layar pencocokan tanpa luapan', (await luapan(page)) <= 1, `${await luapan(page)}px`)
  const kotakPosting = await page.locator(tombol('Posting rekonsiliasi')).boundingBox()
  cek('390px: tombol Posting rekonsiliasi tampil dan utuh', kotakPosting && kotakPosting.x + kotakPosting.width <= 390, JSON.stringify(kotakPosting))
  await potret(page, '390-k-rekonsiliasi-siap')
  cek('390px: tanpa galat konsol', galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}
await buka(o, `/rekonsiliasi/${idRk}`)
await kirim(o, tombol('Posting rekonsiliasi'))
const rkAkhir = await satu('select status, diff from bank_reconcile where id=$1', [idRk])
cek('rekonsiliasi: Diposting dengan selisih 0', rkAkhir.status === 'Diposting' && Number(rkAkhir.diff) === 0, `${JSON.stringify(rkAkhir)} ${await pesanGalat(o)}`)
await potret(o, '1440-k-rekonsiliasi-diposting')

// Baris jurnal yang sudah dicocokkan terkunci dari pembatalan kas keluar.
await buka(o, `/kas/${idKas}`)
await o.click('summary:text-is("Batalkan dokumen yang sudah Diposting")')
await o.fill('#k-batal-posting-alasan', 'Uji kunci rekonsiliasi')
await kirim(o, tombol('Batalkan dengan jurnal balik'))
cek('kunci: kas keluar yang sudah dicocokkan tidak bisa dibatalkan', (await status('cash_transaction', idKas)) === 'Diposting' && /dicocokkan/.test(await pesanGalat(o)), await pesanGalat(o))

// 5. Akses Admin ke rekonsiliasi dan pindah dana ditolak. Jawaban 403 di konsol Admin sesudah ini memang disengaja.
const galatAdminSebelum = A.galat.length
for (const jalur of ['/rekonsiliasi', '/rekonsiliasi/impor', `/rekonsiliasi/${idRk}`, '/pindah-dana']) {
  const r = await buka(a, jalur)
  cek(`akses: Admin ke ${jalur} ditolak`, r.status() === 403 && /Akses ditolak/.test(await a.textContent('h1')), `status ${r.status()}`)
}
const sidebarAdmin = await a.$$eval('.samping nav a', (x) => x.map((e) => e.textContent.trim()))
cek('akses: sidebar Admin tanpa Rekonsiliasi dan Pindah Dana, dengan Kas Masuk/Keluar', !sidebarAdmin.includes('Rekonsiliasi Bank') && !sidebarAdmin.includes('Pindah Dana') && sidebarAdmin.includes('Kas Masuk/Keluar'))

// 6. Semua langkah tercatat di Jejak Audit.
{
  const harap = ['pesanan.setujui', 'penerimaan.posting', 'faktur.posting', 'pembayaran.posting', 'kas_keluar.tambah', 'kas_keluar.ajukan', 'kas_keluar.setujui', 'kas_keluar.posting', 'pindah_dana.posting', 'mutasi.impor', 'rekonsiliasi.tambah', 'rekonsiliasi.cocok', 'rekonsiliasi.posting', 'izin.ditolak']
  const ada = new Set((await sql.query('select distinct action from audit_log where at > now() - interval \'1 hour\'')).rows.map((r) => r.action))
  const kurang = harap.filter((x) => !ada.has(x))
  cek('audit: semua langkah tercatat', kurang.length === 0, kurang.join(', '))
  const jb = await satu("select after_json->>'jurnal' j from audit_log where action='penerimaan.posting' and doc_id=$1", [String(idGr)])
  cek('audit: nomor jurnal penerimaan ikut di after_json', jb?.j === jGr?.no, JSON.stringify(jb))
  await buka(o, `/audit?entitas=bank_reconcile&dok=${idRk}`)
  const isi = await o.textContent('main')
  cek('audit: halaman Jejak Audit menampilkan posting rekonsiliasi', /Memposting rekonsiliasi/.test(isi))
  await potret(o, '1440-k-audit-rekonsiliasi')
}

// 7. Potret semua halaman baru di 1440 dan 390 px, tanpa luapan dan tanpa galat konsol.
const daftar = [
  { jalur: '/kas', nama: 'kas' },
  { jalur: '/pindah-dana', nama: 'pindah' },
  { jalur: '/rekonsiliasi', nama: 'rekonsiliasi' },
  { jalur: '/rekonsiliasi/impor', nama: 'rekonsiliasi-impor' },
  { jalur: '/rekonsiliasi/impor?format=umum', nama: 'rekonsiliasi-impor-umum' },
  ...halamanBaru,
]
for (const { w, h } of [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]) {
  const { ctx, page, galat } = await konteks(w, h)
  await masuk(page, AKUN.owner)
  for (const { jalur, nama } of daftar) {
    const r = await buka(page, jalur)
    const h1 = await page.textContent('h1')
    const lebih = await luapan(page)
    await potret(page, `${w}-k-hal-${nama}`)
    cek(`${w}px: ${jalur} terbuka tanpa luapan`, r.status() === 200 && !/Akses ditolak|Galat/.test(h1) && lebih <= 1, `status ${r.status()}, h1 "${h1}", lebih ${lebih}px`)
  }
  cek(`${w}px: tanpa galat konsol`, galat.length === 0, galat.slice(0, 3).join(' | '))
  await ctx.close()
}
const galatAdmin = [...A.galat.slice(0, galatAdminSebelum), ...A.galat.slice(galatAdminSebelum).filter((t) => !/status of 403/.test(t))]
cek('konsol Owner dan Admin tanpa galat', O.galat.length === 0 && galatAdmin.length === 0, [...O.galat, ...galatAdmin].slice(0, 3).join(' | '))

await O.ctx.close()
await A.ctx.close()
await browser.close()
await sql.end()
const gagal = hasil.filter((x) => !x.lulus).length
writeFileSync(`${HASIL}e2e-kas.json`, JSON.stringify({ waktu: new Date().toISOString(), lulus: hasil.length - gagal, gagal, hasil }, null, 2))
console.log(`Ringkasan kas: ${hasil.length - gagal} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
