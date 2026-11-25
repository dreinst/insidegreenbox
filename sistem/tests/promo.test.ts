// Promo otomatis di kasir (KONTRAK 11 butir 160): hitungan murni, promo yang berlaku, penjualan, struk data, jurnal,
// stok hadiah, dan void.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan } from '../src/lib/aksi'
import { pasangBawaanAkuntansi } from '../src/lib/akuntansi/pemetaan'
import type { Db } from '../src/lib/db'
import { bagiBayar, bulatTunai, hitungKeranjang, type PromoKasir } from '../src/lib/hitung-kasir'
import type { Pengguna } from '../src/lib/izin-inti'
import { rekapMenu, rekapPenjualan } from '../src/lib/laporan'
import { ambilPenjualan, simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { simpanBahan, tambahResep } from '../src/lib/produksi/resep'
import { promoBerlaku } from '../src/lib/promo'
import { bukaShift } from '../src/lib/shift'
import { isiBawaanStok } from '../src/lib/stok/bawaan'
import { hariIni } from '../src/lib/stok/dokumen'
import { catatGerak } from '../src/lib/stok/mesin'
import { tanggalIso } from '../src/lib/waktu'
import { buatAktor, k, siapkanDbUji } from './db-uji'
import { siapkanToko } from './toko-uji'

const biaya = { pajak: 10, service: 5 }
const promo = (p: Partial<PromoKasir> & Pick<PromoKasir, 'id' | 'jenis'>): PromoKasir => ({ nama: `P${p.id}`, persen: 0, nominal: 0, minBelanja: 0, syarat: '', hadiah: null, ...p })
const kopi = { harga: 28000, qty: 1, jenis: 'menu' as const }
const paket = { harga: 45000, qty: 1, jenis: 'paket' as const }

describe('hitungan promo', () => {
  test('persen hanya memotong menu biasa, paket tidak kena; service dan pajak dari harga sesudah potongan', () => {
    const t = hitungKeranjang([kopi, paket], 0, biaya, [promo({ id: 1, jenis: 'persen', persen: 10 })])
    assert.equal(t.discPromo, 2800)
    assert.equal(t.disc, 2800)
    assert.equal(t.net, 73000 - 2800)
    assert.equal(t.svc, Math.round(70200 * 0.05))
    assert.equal(t.tax, Math.round((70200 + 3510) * 0.1))
    assert.equal(t.total, 70200 + 3510 + 7371)
    assert.equal(t.promo?.id, 1)
  })

  test('nominal dibatasi subtotal menu biasa; keranjang hanya paket tidak kena promo', () => {
    assert.equal(hitungKeranjang([kopi], 0, biaya, [promo({ id: 1, jenis: 'nominal', nominal: 5000 })]).discPromo, 5000)
    assert.equal(hitungKeranjang([kopi], 0, biaya, [promo({ id: 1, jenis: 'nominal', nominal: 50000 })]).discPromo, 28000)
    const p = hitungKeranjang([paket], 0, biaya, [promo({ id: 1, jenis: 'nominal', nominal: 5000 })])
    assert.equal(p.promo, null)
    assert.equal(p.disc, 0)
  })

  test('hadiah menambah menu gratis bila belanja minimal terpenuhi, tanpa mengubah total', () => {
    const h = promo({ id: 3, jenis: 'hadiah', minBelanja: 50000, hadiah: { menuItemId: 9, nama: 'Teh', harga: 18000 } })
    const kurang = hitungKeranjang([kopi], 0, biaya, [h])
    assert.equal(kurang.hadiah, null, 'belanja 28.000 di bawah minimal 50.000')
    const cukup = hitungKeranjang([kopi, paket], 0, biaya, [h])
    assert.deepEqual(cukup.hadiah, { menuItemId: 9, nama: 'Teh', harga: 18000 })
    assert.equal(cukup.disc, 0)
    assert.equal(cukup.total, hitungKeranjang([kopi, paket], 0, biaya).total)
  })

  test('promo lawan member: yang lebih besar untuk pembeli, tidak digabung, seri dimenangkan member', () => {
    const nominal = promo({ id: 1, jenis: 'nominal', nominal: 5000 })
    const p = hitungKeranjang([kopi], 10, biaya, [nominal])
    assert.deepEqual([p.discPromo, p.disc, p.pctMember, p.promo?.id], [5000, 5000, 0, 1], 'promo 5.000 lawan member 2.800')
    assert.match(p.alasan, /lebih besar dari potongan member \(Rp 2\.800\)/)
    const m = hitungKeranjang([kopi], 20, biaya, [nominal])
    assert.deepEqual([m.discPromo, m.disc, m.pctMember, m.promo], [0, 5600, 20, null], 'member 5.600 lawan promo 5.000')
    assert.match(m.alasan, /potongan member yang dipakai/)
    const seri = hitungKeranjang([kopi], 10, biaya, [promo({ id: 2, jenis: 'nominal', nominal: 2800 })])
    assert.deepEqual([seri.discPromo, seri.pctMember], [0, 10])
    assert.match(seri.alasan, /sama dengan promo/)
  })

  test('beberapa promo: nilai terbesar menang, seri ke id terkecil', () => {
    const t = hitungKeranjang([kopi], 0, biaya, [promo({ id: 5, jenis: 'nominal', nominal: 3000 }), promo({ id: 2, jenis: 'persen', persen: 15 }), promo({ id: 7, jenis: 'nominal', nominal: 4200 })])
    assert.equal(t.promo?.id, 2, '15% dari 28.000 = 4.200, seri dengan id 7, id 2 menang')
    assert.equal(t.discPromo, 4200)
  })

  test('pembulatan tunai Rp 500 berlaku pada total sesudah promo, pajak, dan service', () => {
    // 28.000 - 5.000 = 23.000; service 1.150; pajak 2.415; total 26.565, tunai 26.500.
    const t = hitungKeranjang([kopi], 0, biaya, [promo({ id: 1, jenis: 'nominal', nominal: 5000 })])
    assert.equal(t.total, 26565)
    assert.equal(bulatTunai(t.total), 26500)
    const b = bagiBayar(t.total, [{ metodeId: 1, tunai: true, jumlah: 30000 }])
    assert.ok(b.ok)
    assert.deepEqual([b.pembulatan, b.kembalian], [-65, 3500])
  })
})

describe('promo di basis data', () => {
  let db: Db
  let hapus: () => Promise<void>
  let owner: Pengguna
  let kasir: Pengguna
  let toko: Awaited<ReturnType<typeof siapkanToko>>
  let teh = 0
  const hari = (n: number) => new Date(`${tanggalIso(new Date(Date.now() + n * 86_400_000))}T00:00:00Z`)

  before(async () => {
    ;({ db, hapus } = await siapkanDbUji('promo'))
    await isiBawaanStok(db)
    owner = await buatAktor(db, 'owner', 'owner1')
    kasir = await buatAktor(db, 'kasir', 'kasir1')
    toko = await siapkanToko(db)
    await pasangBawaanAkuntansi(db)
    teh = (await db.menuItem.create({ data: { name: 'Teh Hadiah', category: 'kopi', price: 18000n } })).id
    // Resep teh: 10 g bahan @ 200, supaya baris hadiah ber-HPP dan memotong stok.
    const outlet = (await db.location.findUniqueOrThrow({ where: { code: 'OUTLET' } })).id
    const gram = (await db.unit.findFirstOrThrow({ where: { name: 'gram' } })).id
    const daun = (await db.product.create({ data: { code: 'DAUN', name: 'Daun teh', baseUnitId: gram, kind: 'bahan' } })).id
    await db.$transaction((tx) => catatGerak(tx, { docType: 'uji', docId: 1, docNo: 'UJI-1', tanggal: hariIni(), oleh: null }, [{ productId: daun, locationId: outlet, qty: 1000, hargaSatuan: 200 }]))
    const r = await tambahResep(db, k(owner), owner, { kind: 'menu', name: 'Resep Teh Hadiah', menuItemId: String(teh) })
    await simpanBahan(db, k(owner), owner, r.id, { productId: String(daun), qty: '10' })
    await bukaShift(db, k(kasir), kasir, { modal: '0' })
  })
  after(() => hapus())

  const jurnal = async (id: number, balik = false) => {
    const j = await db.journal.findFirstOrThrow({ where: { sourceType: 'sale', sourceId: id, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
    assert.equal(
      j.journalLines.reduce((n, l) => n + l.debit, 0n),
      j.journalLines.reduce((n, l) => n + l.credit, 0n),
      `jurnal ${j.no} seimbang`,
    )
    const peta: Record<string, bigint> = {}
    for (const l of j.journalLines) peta[l.account.code] = (peta[l.account.code] ?? 0n) + l.debit - l.credit
    return peta
  }

  test('hanya promo aktif yang masa berlakunya mencakup hari ini, dan hadiah dengan menu aktif', async () => {
    const mati = (await db.menuItem.create({ data: { name: 'Menu Mati', category: 'kopi', price: 5000n, active: false } })).id
    await db.promo.createMany({
      data: [
        { name: 'Kedaluwarsa', kind: 'persen', percent: 50, startsOn: hari(-10), endsOn: hari(-1) },
        { name: 'Belum mulai', kind: 'persen', percent: 50, startsOn: hari(1) },
        { name: 'Nonaktif', kind: 'persen', percent: 50, active: false },
        { name: 'Hadiah menu mati', kind: 'hadiah', giftItemId: mati },
      ],
    })
    assert.deepEqual(await promoBerlaku(db), [])
    // Penjualan tanpa promo berlaku tidak memakai promo apa pun.
    const j = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: toko.menu.Americano, qty: 1 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: 25410 }], promoLayar: null })
    const s = await db.sale.findUniqueOrThrow({ where: { id: j.id } })
    assert.deepEqual([s.promoId, s.promoDisc, s.disc], [null, 0n, 0n])
  })

  test('promo persen lawan member: promo menang, tersimpan, struk dan jurnal memuat potongan promo', async () => {
    const p = await db.promo.create({ data: { name: 'Hemat 25', kind: 'persen', percent: 25, startsOn: hari(0), endsOn: hari(0) } })
    const [berlaku] = await promoBerlaku(db)
    assert.equal(berlaku.id, p.id)
    // Kopi Susu 28.000 + paket 45.000. Member 10% = 2.800, promo 25% = 7.000 (paket tidak kena).
    // Net 66.000, service 3.300, pajak 6.930, total 76.230; tunai 76.000.
    const t = hitungKeranjang([kopi, paket], 10, biaya, [berlaku])
    assert.equal(t.total, 76230)
    const j = await simpanPenjualan(db, k(kasir), kasir, {
      mode: 'takeaway',
      memberId: toko.member,
      baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 1 }, { menuSetId: toko.paket, qty: 1 }],
      bayar: [{ metodeId: toko.metode.Tunai, jumlah: 100000 }],
      totalLayar: t.total,
      promoLayar: p.id,
    })
    assert.deepEqual([j.total, j.pembulatan, j.potonganPromo], [76230, -230, 7000])
    const s = await db.sale.findUniqueOrThrow({ where: { id: j.id } })
    assert.deepEqual([s.promoId, s.promoName, s.promoDisc, s.disc, s.memberPct.toString()], [p.id, 'Hemat 25', 7000n, 7000n, '0'])
    const r = await ambilPenjualan(db, owner, j.id)
    assert.equal(r?.promoName, 'Hemat 25')
    // Jurnal: potongan promo didebit ke akun pemetaan potongan_promo (bawaan 4-3000), kas laci sesudah pembulatan.
    const pj = await jurnal(j.id)
    assert.equal(pj['4-3000'], 7000n)
    assert.equal(pj['4-1000'], -73000n)
    assert.equal(pj['1-1100'], 76000n)
    assert.equal(pj['4-9200'], 230n)
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'penjualan.simpan', docId: String(j.id) } })
    const after = audit.afterJson as { promo: { nama: string; potongan: number }; alasanPotongan: string; memberPct: number }
    assert.equal(after.promo.potongan, 7000)
    assert.equal(after.memberPct, 0)
    assert.match(after.alasanPotongan, /Hemat 25/)
    assert.match(audit.summary, /promo Hemat 25 -Rp 7\.000/)
    // Laporan: Potongan memuat promo, kolom promo sendiri, dan alokasi per menu sama dengan disc.
    const rekap = await rekapPenjualan(db, { dari: tanggalIso(new Date()), sampai: tanggalIso(new Date()) })
    assert.equal(rekap.jumlah.potonganPromo, 7000)
    const menu = await rekapMenu(db, { dari: tanggalIso(new Date()), sampai: tanggalIso(new Date()) })
    assert.equal(menu.baris.find((b) => b.nama === 'Kopi Susu')?.potongan, 7000)

    // Void membalik potongan promo di jurnal balik.
    await voidPenjualan(db, k(owner), owner, j.id, { alasan: 'Uji void promo' })
    const balik = await jurnal(j.id, true)
    assert.equal(balik['4-3000'], -7000n)
    assert.equal(balik['1-1100'], -76000n)
    await db.promo.update({ where: { id: p.id }, data: { active: false } })
  })

  test('total atau promo di layar yang basi ditolak dan tidak menyimpan apa pun', async () => {
    const p = await db.promo.create({ data: { name: 'Potong 5rb', kind: 'nominal', amount: 5000n } })
    const tanpa = hitungKeranjang([kopi], 0, biaya).total
    const sebelum = await db.sale.count()
    await assert.rejects(
      simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 1 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: tanpa }], totalLayar: tanpa }),
      (e: unknown) => e instanceof GalatAturan && /total sekarang Rp 26\.565/.test(e.message),
    )
    await assert.rejects(
      simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: toko.menu['Kopi Susu'], qty: 1 }], bayar: [{ metodeId: toko.metode.QRIS, jumlah: 26565 }], promoLayar: null }),
      (e: unknown) => e instanceof GalatAturan && /Promo berubah/.test(e.message),
    )
    assert.equal(await db.sale.count(), sebelum)
    await db.promo.update({ where: { id: p.id }, data: { active: false } })
  })

  test('promo hadiah: baris gratis memotong stok dan ber-HPP, jurnal seimbang, void mengembalikan stok', async () => {
    const p = await db.promo.create({ data: { name: 'Gratis Teh', kind: 'hadiah', giftItemId: teh, minSpend: 40000n, condition: 'Belanja minimal Rp 40.000' } })
    const [berlaku] = await promoBerlaku(db)
    assert.deepEqual(berlaku.hadiah, { menuItemId: teh, nama: 'Teh Hadiah', harga: 18000 })
    const j = await simpanPenjualan(db, k(kasir), kasir, {
      mode: 'takeaway',
      baris: [{ menuItemId: toko.menu['Nasi Goreng'], qty: 1 }, { menuItemId: toko.menu.Croissant, qty: 1 }],
      bayar: [{ metodeId: toko.metode.QRIS, jumlah: 69300 }],
      totalLayar: 69300,
      promoLayar: p.id,
    })
    const s = await db.sale.findUniqueOrThrow({ where: { id: j.id }, include: { saleLines: { orderBy: { id: 'asc' } } } })
    assert.deepEqual([s.total, s.disc, s.promoDisc, s.promoId], [69300n, 0n, 0n, p.id])
    const hadiah = s.saleLines.find((l) => l.promoGift)!
    assert.deepEqual([hadiah.menuItemId, hadiah.price, hadiah.qty, hadiah.hpp], [teh, 0n, 1, 2000n])
    assert.equal(s.hpp, 2000n)
    const gerak = await db.stockLedger.findMany({ where: { docType: 'sale', docId: j.id } })
    assert.equal(gerak.length, 1)
    const pj = await jurnal(j.id)
    assert.deepEqual([pj['5-1000'], pj['1-1500'], pj['4-1000']], [2000n, -2000n, -60000n])

    await voidPenjualan(db, k(owner), owner, j.id, { alasan: 'Uji void hadiah' })
    const balik = await db.stockLedger.findMany({ where: { docType: 'sale', docId: j.id, isReversal: true } })
    assert.equal(balik.length, 1)
    assert.equal(balik[0].qty.toString(), '10')
    const pb = await jurnal(j.id, true)
    assert.deepEqual([pb['5-1000'], pb['1-1500']], [-2000n, 2000n])
    await db.promo.update({ where: { id: p.id }, data: { active: false } })
  })
})
