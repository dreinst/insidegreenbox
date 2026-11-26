// Uji klik keputusan pemilik 24 November 2026 (KONTRAK 11 butir 155 sampai 157): pembulatan tunai di layar kasir,
// struk, rincian transaksi, dan tutup shift; halaman Aturan Persetujuan hanya untuk Owner; alasan wajib saat mengubah
// kunjungan member. Dijalankan oleh tests/e2e/jalankan.sh sebelum klik.mjs, atau langsung:
// BASE_URL=... E2E_DATABASE_URL=... node tests/e2e/keputusan.mjs
// Potret ke tests/potret/kpt-*, ringkasan ke tests/hasil/e2e-keputusan.json.
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
const potret = (page, nama) => page.screenshot({ path: `${POTRET}kpt-${nama}.png`, fullPage: true })
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
const ubin = (n) => `.lk-ubin button:has(b:text-is("${n}"))`

try {
  const ownerId = (await satu('select id from app_user where username = $1', [AKUN.owner.u])).id

  // 1. Pembulatan tunai (butir 155). Owner membuka shift bermodal 0, jual tunai saja lalu campuran QRIS dan tunai.
  {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.owner)
    let shift = await satu("select id from shift where user_id = $1 and status = 'Buka'", [ownerId])
    if (!shift) {
      await buka(page, '/shift')
      await page.fill('#k-modal', '0')
      await Promise.all([page.waitForURL(/\/shift\/\d+\?pesan=shift-buka/, { timeout: 30000 }), page.click('button:text-is("Buka shift")')])
      shift = await satu("select id from shift where user_id = $1 and status = 'Buka'", [ownerId])
    }
    const pajak = await satu("select b.tax_pct::float pajak, b.service_pct::float svc from shift s join location l on l.id = s.location_id join branch b on b.id = l.branch_id where s.id = $1", [shift.id])
    const harga = Number((await satu("select price from menu_item where name = 'Kopi Susu Greenbox'")).price)
    const net = harga
    const svc = Math.round((net * pajak.svc) / 100)
    const total = net + svc + Math.round(((net + svc) * pajak.pajak) / 100)
    const bulat = Math.floor((total + 250) / 500) * 500
    const terima = []

    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h })
      await buka(page, '/kasir')
      await page.click('button:text-is("Take away")')
      await page.click(ubin('Kopi Susu Greenbox'))
      await page.fill('#k-jumlah-0', '50.000')
      const dl = await page.textContent('.lk-jumlah-dl')
      cek(`${w}px kasir: pembulatan tunai tampil (${total} menjadi ${bulat})`, dl?.includes('Pembulatan tunai') && dl.includes('Total bayar') && dl.includes(bulat.toLocaleString('id-ID')), dl)
      cek(`${w}px kasir: kembalian dari total bayar`, (await page.textContent('.lk-kembali'))?.includes((50000 - bulat).toLocaleString('id-ID')))
      const pas = await page.locator('.lk-cepat button').first().textContent()
      cek(`${w}px kasir: tombol pertama Uang pas`, pas === 'Uang pas', pas)
      cek(`${w}px kasir: tanpa luapan`, (await luapan(page)) <= 0)
      await page.locator('#keranjang').scrollIntoViewIfNeeded()
      await potret(page, `${w}-kasir-pembulatan`)
      const sebelum = Number((await satu('select coalesce(max(id),0) n from sale')).n)
      await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > sebelum, { timeout: 30000 }), page.click('button.lk-tombol-bayar')])
      const id = Number(new URL(page.url()).searchParams.get('selesai'))
      const s = await satu("select s.total, s.rounding, p.amount, p.change from sale s join sale_payment p on p.sale_id = s.id where s.id = $1", [id])
      cek(`${w}px kasir: tersimpan dengan pembulatan`, Number(s.total) === total && Number(s.rounding) === bulat - total && Number(s.amount) === bulat && Number(s.change) === 50000 - bulat, JSON.stringify(s))
      cek(`${w}px kasir: pesan sukses menyebut pembulatan`, (await page.textContent('.lk-selesai'))?.includes(`dibulatkan menjadi Rp ${bulat.toLocaleString('id-ID')}`))
      terima.push(bulat)
      const j = await satu("select sum(l.debit)::bigint d, sum(l.credit)::bigint k, sum(case when a.code = '4-9200' then l.credit - l.debit else 0 end)::bigint bulat from journal j join journal_line l on l.journal_id = j.id join account a on a.id = l.account_id where j.source_type = 'sale' and j.source_id = $1 and j.reversal_of_id is null", [id])
      cek(`${w}px kasir: jurnal seimbang dengan baris pembulatan`, j.d === j.k && Number(j.bulat) === bulat - total, JSON.stringify(j))

      await buka(page, `/struk/${id}`)
      const struk = await page.textContent('.struk')
      cek(`${w}px struk: Pembulatan dan Total bayar`, struk?.includes('Pembulatan') && struk.includes('Total bayar') && struk.includes(bulat.toLocaleString('id-ID')), struk?.slice(-200))
      await potret(page, `${w}-struk`)
      await buka(page, `/transaksi/${id}`)
      cek(`${w}px rincian transaksi: Pembulatan tampil`, (await page.textContent('.struk'))?.includes('Pembulatan'))
      cek(`${w}px rincian transaksi: tanpa luapan`, (await luapan(page)) <= 0)
      await potret(page, `${w}-transaksi`)
    }

    // Campuran: QRIS 20.000 pas, sisa tunai dibulatkan.
    await page.setViewportSize({ width: 1440, height: 900 })
    await buka(page, '/kasir')
    await page.click('button:text-is("Take away")')
    await page.click(ubin('Kopi Susu Greenbox'))
    await page.selectOption('#k-metode-0', { label: 'QRIS' })
    await page.fill('#k-jumlah-0', '20.000')
    await page.click('button:text-is("+ Tambah metode bayar")')
    const sisa = total - 20000
    const sisaBulat = Math.floor((sisa + 250) / 500) * 500
    await page.selectOption('#k-metode-1', { label: 'Tunai' })
    await page.fill('#k-jumlah-1', String(sisaBulat))
    cek('campuran: kembalian 0 untuk sisa tunai yang sudah dibulatkan', (await page.textContent('.lk-kembali'))?.includes('Rp 0'), await page.textContent('.lk-kembali'))
    await potret(page, '1440-kasir-campuran')
    const sebelum = Number((await satu('select coalesce(max(id),0) n from sale')).n)
    await Promise.all([page.waitForURL((u) => Number(u.searchParams.get('selesai')) > sebelum, { timeout: 30000 }), page.click('button.lk-tombol-bayar')])
    const idC = Number(new URL(page.url()).searchParams.get('selesai'))
    const bayar = (await sql.query('select m.kind, p.amount from sale_payment p join payment_method m on m.id = p.payment_method_id where p.sale_id = $1 order by p.id', [idC])).rows
    const rc = await satu('select rounding from sale where id = $1', [idC])
    cek('campuran: QRIS pas, tunai dibulatkan', bayar.some((b) => b.kind === 'qris' && Number(b.amount) === 20000) && bayar.some((b) => b.kind === 'tunai' && Number(b.amount) === sisaBulat) && Number(rc.rounding) === sisaBulat - sisa, JSON.stringify({ bayar, rc }))
    terima.push(sisaBulat)

    // Tutup shift lewat hitung pecahan: uang tunai bulat ke Rp 500, jadi pecahan pas tanpa selisih (temuan A-8).
    const tunaiLaci = terima.reduce((a, b) => a + b, 0)
    const modal = Number((await satu('select open_cash from shift where id = $1', [shift.id])).open_cash)
    const gerak = await satu("select coalesce(sum(case when kind = 'masuk' then amount else -amount end), 0)::bigint n from shift_cash_move where shift_id = $1", [shift.id])
    const tunaiLain = Number((await satu("select coalesce(sum(p.amount),0)::bigint n from sale_payment p join sale s on s.id = p.sale_id join payment_method m on m.id = p.payment_method_id where s.shift_id = $1 and s.status = 'Selesai' and m.kind = 'tunai'", [shift.id])).n)
    const harus = modal + tunaiLain + Number(gerak.n)
    cek('shift: kas tunai penjualan uji sama dengan jumlah sesudah pembulatan', tunaiLain >= tunaiLaci, `${tunaiLain} lawan ${tunaiLaci}`)
    await buka(page, `/shift/${shift.id}`)
    await page.click('details.pecahan summary')
    let sisaPecahan = harus
    for (const p of [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500]) {
      const n = Math.floor(sisaPecahan / p)
      sisaPecahan -= n * p
      if (n) await page.fill(`input[name="pecahan_${p}"]`, String(n))
    }
    cek('shift: kas seharusnya habis dibagi pecahan sampai Rp 500', sisaPecahan === 0, String(sisaPecahan))
    await Promise.all([page.waitForURL(/\?pesan=shift-tutup/, { timeout: 30000 }), page.click('button:text-is("Tutup shift")')])
    const t = await satu('select expected_cash, counted_cash, cash_diff from shift where id = $1', [shift.id])
    cek('shift: tutup lewat pecahan tanpa selisih', Number(t.expected_cash) === harus && Number(t.cash_diff) === 0, JSON.stringify(t))
    await potret(page, '1440-shift-pembulatan')
    await ctx.close()
  }

  // 2. Aturan Persetujuan (butir 156): Owner melihat dan mengubah, Admin ditolak.
  {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.admin)
    const r = await buka(page, '/persetujuan')
    cek('persetujuan: Admin ditolak (403)', r?.status() === 403, String(r?.status()))
    cek('persetujuan: Admin tidak melihat item sidebar', (await page.locator('a[href="/persetujuan"]').count()) === 0)
    // Galat konsol 403 dari halaman itu memang diharapkan.
    galatKonsol.splice(0, galatKonsol.length, ...galatKonsol.filter((g) => !g.includes('403')))
    await ctx.close()
  }
  {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.owner)
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h })
      await buka(page, '/persetujuan')
      const isi = await page.textContent('main')
      cek(`${w}px persetujuan: nama jenis dokumen berbahasa Indonesia`, ['Pesanan Pembelian', 'Pembelian Langsung tunai', 'Pembayaran Pembelian', 'Jurnal Memorial'].every((x) => isi?.includes(x)))
      cek(`${w}px persetujuan: tanpa luapan`, (await luapan(page)) <= 0, String(await luapan(page)))
      await potret(page, `${w}-persetujuan`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    cek('persetujuan: Owner melihat item sidebar', (await page.locator('a[href="/persetujuan"]').count()) >= 1)
    const kotak = (jenis) => page.locator(`li:has(input[type=hidden][value="${jenis}"]) input[type=checkbox]`)
    cek('persetujuan: Pembayaran Pembelian terkunci', await kotak('purchase_payment').isDisabled())
    // Batas salah ditolak di isian itu, isian lain terjaga.
    await page.fill('#a-purchase_order-b', 'dua juta')
    await page.fill('#a-direct_purchase-b', '1.500.000')
    await kirim(page, 'button:text-is("Simpan aturan")')
    cek('persetujuan: batas salah ditolak di isiannya', (await page.locator('#a-purchase_order-g').count()) === 1 && (await page.inputValue('#a-direct_purchase-b')) === '1.500.000')
    // Saklar tetap seperti sebelum galat, termasuk Pindah Dana (nama jenisnya memuat "pin").
    cek('persetujuan: saklar Pindah Dana tetap menyala sesudah galat', await kotak('cash_transaction.pindah').isChecked())
    await potret(page, '1440-persetujuan-galat')
    await page.fill('#a-purchase_order-b', '2.000.000')
    await page.fill('#a-direct_purchase-b', '1.000.000')
    await Promise.all([page.waitForURL(/\/persetujuan\?pesan=tersimpan/, { timeout: 30000 }), page.click('button:text-is("Simpan aturan")')])
    const po = await satu("select requires_approval, min_amount, updated_by from approval_rule where doc_type = 'purchase_order'")
    cek('persetujuan: batas pesanan tersimpan', po.requires_approval && Number(po.min_amount) === 2000000 && po.updated_by === ownerId, JSON.stringify(po))
    const a = await satu("select summary, before_json, after_json from audit_log where action = 'persetujuan.ubah' and doc_id = 'purchase_order' order by id desc limit 1")
    cek('persetujuan: audit sebelum dan sesudah', a && a.before_json?.nominal === null && a.after_json?.nominal === '2000000', JSON.stringify(a))
    // Kembalikan ke bawaan (semua pesanan wajib disetujui), supaya uji lain tidak terpengaruh.
    await page.fill('#a-purchase_order-b', '')
    // Alamat sesudah simpan sama dengan alamat sekarang, jadi tunggu jawaban POST, bukan perubahan URL.
    await kirim(page, 'button:text-is("Simpan aturan")')
    cek('persetujuan: dikembalikan ke semua nilai', (await satu("select min_amount from approval_rule where doc_type = 'purchase_order'")).min_amount === null)
    await ctx.close()
  }

  // 3. Alasan kunjungan member (butir 157) oleh Admin.
  {
    const { ctx, page } = await konteks(1440, 900)
    await masuk(page, AKUN.admin)
    const m = await satu('select id, visits from member where active order by id limit 1')
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h })
      await buka(page, `/member/${m.id}`)
      cek(`${w}px member: isian alasan kunjungan tampil`, (await page.locator('#k-alasanKunjungan').count()) === 1)
      await page.fill('#k-visits', String(m.visits + 1))
      await page.fill('#k-note', `Catatan uji ${w}`)
      await kirim(page, 'form.form button[type=submit]')
      cek(`${w}px member: ubah kunjungan tanpa alasan ditolak, isian terjaga`, (await page.locator('#k-alasanKunjungan ~ .galat-kolom').count()) === 1 && (await page.inputValue('#k-visits')) === String(m.visits + 1))
      cek(`${w}px member: tanpa luapan`, (await luapan(page)) <= 0)
      await potret(page, `${w}-member-alasan`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.fill('#k-alasanKunjungan', 'Kartu stempel lama')
    await Promise.all([page.waitForURL(/\/member\/\d+\?pesan=tersimpan/, { timeout: 30000 }), page.click('form.form button[type=submit]')])
    const a = await satu("select summary, after_json from audit_log where action = 'member.ubah' and doc_id = $1 order by id desc limit 1", [String(m.id)])
    cek('member: alasan tercatat di audit', a?.after_json?.alasanKunjungan === 'Kartu stempel lama' && a.summary.includes('Alasan: Kartu stempel lama'), JSON.stringify(a))
    // Ubah catatan saja tidak butuh alasan; kunjungan dikembalikan dengan alasan.
    await page.fill('#k-note', '')
    await kirim(page, 'form.form button[type=submit]')
    cek('member: ubah catatan saja tanpa alasan tersimpan', (await satu('select note from member where id = $1', [m.id])).note === '')
    await page.fill('#k-visits', String(m.visits))
    await page.fill('#k-alasanKunjungan', 'Kembalikan data uji')
    await kirim(page, 'form.form button[type=submit]')
    cek('member: kunjungan kembali ke semula', (await satu('select visits from member where id = $1', [m.id])).visits === m.visits)
    await ctx.close()
  }
  cek('tidak ada galat konsol', galatKonsol.length === 0, galatKonsol.slice(0, 3).join(' | '))
} catch (e) {
  cek('skrip selesai tanpa galat', false, String(e).slice(0, 300))
} finally {
  await browser.close()
  await sql.end()
  writeFileSync(`${HASIL}e2e-keputusan.json`, JSON.stringify(hasil, null, 2))
  const gagal = hasil.filter((h) => !h.lulus)
  console.log(`\n${hasil.length - gagal.length} lulus, ${gagal.length} gagal`)
  process.exitCode = gagal.length ? 1 : 0
}
