// Kasir tahap 3B: hitungan, shift, penjualan, void, dan PIN dengan basis data uji.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcryptjs'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import { bagiBayar, hitungKeranjang, hitungTotal, kasSeharusnya, kembalian, perluPersetujuan, totalPecahan } from '../src/lib/hitung-kasir'
import type { Pengguna } from '../src/lib/izin-inti'
import { BATAS_GAGAL_NAMA } from '../src/lib/masuk'
import { potonganMember, ubahStatusMember, ubahStatusTingkat } from '../src/lib/member'
import { ambilPenjualan, cariMember, simpanPenjualan, voidPenjualan } from '../src/lib/penjualan'
import { aturPin, bolehMasukPin, cobaMasukPin, daftarMasukPin, daftarPenyetujuVoid } from '../src/lib/pin'
import { bukaShift, catatKasLaci, setujuiShift, tutupShift } from '../src/lib/shift'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let kasir: Pengguna
let kasir2: Pengguna
const menu: Record<string, number> = {}
const metode: Record<string, number> = {}
let memberId = 0

const tolakAturan = (pesan: RegExp) => (e: unknown) => e instanceof GalatAturan && pesan.test(e.message)

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('kasir'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  kasir = await buatAktor(db, 'kasir', 'kasir1')
  kasir2 = await buatAktor(db, 'kasir', 'kasir2')
  const cabang = await db.branch.findFirstOrThrow()
  await db.branch.update({ where: { id: cabang.id }, data: { taxPct: 10, servicePct: 5 } })
  // menu_item.category adalah kunci asing ke menu_category.code (tahap 3A), jadi kategorinya dibuat dulu.
  await db.menuCategory.createMany({ data: [{ code: 'kopi', name: 'Kopi', sort: 10 }, { code: 'nonkopi', name: 'Non kopi', sort: 20 }] })
  for (const [n, c, p] of [
    ['Kopi', 'kopi', 28000n],
    ['Teh', 'nonkopi', 18000n],
    ['Mati', 'kopi', 1000n],
    ['Nasi', 'nonkopi', 30000n],
  ] as const) {
    menu[n] = (await db.menuItem.create({ data: { name: n, category: c, price: p, active: n !== 'Mati' } })).id
  }
  for (const [n, kind] of [
    ['Tunai', 'tunai'],
    ['QRIS', 'qris'],
  ]) {
    metode[n] = (await db.paymentMethod.create({ data: { name: n, kind } })).id
  }
  await db.memberTier.createMany({ data: [{ name: 'Reguler', minVisits: 0, discountPct: 0 }, { name: 'Sahabat', minVisits: 5, discountPct: 10 }] })
  // Nomor disimpan dalam format 62 seperti hasil modul member; tier_id sengaja kosong (tingkat dihitung dari kunjungan).
  memberId = (await db.member.create({ data: { name: 'Budi', wa: '6281234567890', visits: 5, discountOn: true } })).id
})
after(() => hapus())

describe('hitungan (sama dengan admin lama)', () => {
  test('total: potongan member hanya baris reguler, service dari net, pajak dari net + service', () => {
    const t = hitungTotal(
      [
        { harga: 28000, qty: 2, reguler: true },
        { harga: 20000, qty: 1, reguler: false },
      ],
      10,
      { pajak: 10, service: 5 },
    )
    assert.deepEqual(t, { sub: 76000, disc: 5600, net: 70400, svc: 3520, tax: 7392, total: 81312 })
  })
  test('pembulatan persen ke rupiah terdekat', () => {
    const t = hitungTotal([{ harga: 18333, qty: 1, reguler: true }], 7.5, { pajak: 11, service: 0 })
    assert.equal(t.disc, 1375)
    assert.equal(t.tax, Math.round((18333 - 1375) * 0.11))
  })
  test('kembalian tidak pernah negatif', () => {
    assert.equal(kembalian(50000, 100000), 50000)
    assert.equal(kembalian(50000, 20000), 0)
  })
  test('bagi bayar: tunai menutup sisa sesudah non tunai dan menghasilkan kembalian', () => {
    const r = bagiBayar(81312, [
      { metodeId: 2, tunai: false, jumlah: 50000 },
      { metodeId: 1, tunai: true, jumlah: 50000 },
    ])
    assert.ok(r.ok)
    if (r.ok) {
      assert.equal(r.kembalian, 18688)
      assert.deepEqual(r.baris.find((b) => b.tunai), { metodeId: 1, tunai: true, amount: 31312, paid: 50000, change: 18688 })
    }
  })
  test('bagi bayar menolak kurang bayar, non tunai berlebih, dan metode ganda', () => {
    assert.equal(bagiBayar(10000, [{ metodeId: 1, tunai: true, jumlah: 9000 }]).ok, false)
    assert.equal(bagiBayar(10000, [{ metodeId: 2, tunai: false, jumlah: 12000 }]).ok, false)
    assert.equal(bagiBayar(10000, [{ metodeId: 2, tunai: false, jumlah: 6000 }]).ok, false)
    assert.equal(
      bagiBayar(10000, [
        { metodeId: 2, tunai: false, jumlah: 5000 },
        { metodeId: 2, tunai: false, jumlah: 5000 },
      ]).ok,
      false,
    )
    assert.equal(bagiBayar(10000, [{ metodeId: 2, tunai: false, jumlah: 10000 }]).ok, true)
  })
  test('kas seharusnya = modal + tunai + kas masuk - kas keluar', () => {
    assert.equal(kasSeharusnya(200000, 81312, 10000, 5000), 286312)
  })
  test('batas selisih dari saklar', () => {
    const s = { nyala: true, batas: 10000 }
    assert.equal(perluPersetujuan(10000, s), false)
    assert.equal(perluPersetujuan(-10001, s), true)
    assert.equal(perluPersetujuan(0, { nyala: false, batas: null }), false)
    assert.equal(perluPersetujuan(1, { nyala: false, batas: null }), true)
    assert.equal(perluPersetujuan(999999, { nyala: true, batas: null }), false)
  })
  test('hitung pecahan', () => {
    assert.equal(totalPecahan({ 100000: 2, 5000: 3, 500: 1 }), 215500)
  })
  test('potongan member: persen tingkat, 0 bila member nonaktif, potongan mati, tanpa tingkat, atau tingkat nonaktif', () => {
    const tier = { active: true, discountPct: '10' }
    assert.equal(potonganMember({ active: true, discountOn: true, tier }), 10)
    assert.equal(potonganMember({ active: false, discountOn: true, tier }), 0)
    assert.equal(potonganMember({ active: true, discountOn: false, tier }), 0)
    assert.equal(potonganMember({ active: true, discountOn: true, tier: null }), 0)
    assert.equal(potonganMember({ active: true, discountOn: true, tier: { active: false, discountPct: '10' } }), 0)
  })
  test('paket set tidak kena potongan member, menu biasa kena (admin lama: hanya baris reguler)', () => {
    const t = hitungKeranjang(
      [
        { harga: 28000, qty: 1, jenis: 'menu' },
        { harga: 45000, qty: 2, jenis: 'paket' },
      ],
      10,
      { pajak: 10, service: 5 },
    )
    // Potongan 10% hanya dari 28.000. Net 115.200, service 5.760, pajak 12.096.
    assert.deepEqual(t, { sub: 118000, disc: 2800, net: 115200, svc: 5760, tax: 12096, total: 133056 })
    assert.equal(hitungKeranjang([{ harga: 45000, qty: 1, jenis: 'paket' }], 15, { pajak: 0, service: 0 }).disc, 0)
  })
})

describe('shift', () => {
  test('satu kasir hanya boleh punya satu shift terbuka, termasuk saat dibuka bersamaan', async () => {
    const hasil = await Promise.allSettled([bukaShift(db, k(kasir2), kasir2, { modal: '100.000' }), bukaShift(db, k(kasir2), kasir2, { modal: '100.000' })])
    assert.equal(hasil.filter((h) => h.status === 'fulfilled').length, 1)
    const tolak = hasil.find((h) => h.status === 'rejected') as PromiseRejectedResult
    assert.ok(tolakAturan(/masih punya shift terbuka/)(tolak.reason))
    assert.equal(await db.shift.count({ where: { userId: kasir2.id, status: 'Buka' } }), 1)
  })

  test('alur: buka, jual tunai dan QRIS, kas keluar, void, tutup buta dengan selisih di atas batas, lalu disetujui Owner', async () => {
    const s = await bukaShift(db, k(kasir), kasir, { modal: '200000' })
    assert.equal(s.openCash, 200000n)
    await catatKasLaci(db, k(kasir), kasir, s.id, { jenis: 'keluar', jumlah: '5.000', alasan: 'Beli es batu' })
    await catatKasLaci(db, k(kasir), kasir, s.id, { jenis: 'masuk', jumlah: '20000', alasan: 'Uang receh' })

    const m = await cariMember(db, '0812 3456 7890')
    assert.equal(m?.id, memberId)
    assert.equal(m?.persen, 10)

    // Tunai: 2 Kopi + 1 Teh, member 10%, service 5%, pajak 10%.
    const j1 = await simpanPenjualan(db, k(kasir), kasir, {
      mode: 'dinein',
      meja: '7',
      memberId,
      baris: [
        { menuItemId: menu.Kopi, qty: 2, catatan: 'kurang manis' },
        { menuItemId: menu.Teh, qty: 1 },
      ],
      bayar: [{ metodeId: metode.Tunai, jumlah: 100000 }],
    })
    const harap = hitungTotal(
      [
        { harga: 28000, qty: 2, reguler: true },
        { harga: 18000, qty: 1, reguler: true },
      ],
      10,
      { pajak: 10, service: 5 },
    )
    assert.equal(j1.total, harap.total)
    assert.equal(j1.kembalian, 100000 - harap.total)
    assert.match(j1.no, /^GB-\d{4}-0001$/)
    const r1 = await ambilPenjualan(db, kasir, j1.id)
    assert.equal(r1?.hpp, 0n)
    assert.equal(r1?.saleLines[0].name, 'Kopi')
    assert.equal(r1?.salePayments[0].amount, BigInt(harap.total))
    assert.equal(r1?.salePayments[0].change, BigInt(100000 - harap.total))
    assert.equal((await db.member.findUniqueOrThrow({ where: { id: memberId } })).visits, 6)

    const j2 = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Teh, qty: 1 }], bayar: [{ metodeId: metode.QRIS, jumlah: 0 }] }).catch((e) => e)
    assert.ok(tolakAturan(/Isi pembayaran/)(j2), 'QRIS 0 berarti belum bayar')
    const t2 = hitungTotal([{ harga: 18000, qty: 1, reguler: true }], 0, { pajak: 10, service: 5 }).total
    const j3 = await simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Teh, qty: 1 }], bayar: [{ metodeId: metode.QRIS, jumlah: t2 }] })
    assert.match(j3.no, /-0002$/)

    // Kasir tidak punya saklar pos.void: tanpa PIN ditolak, PIN salah ditolak, PIN Admin benar diterima.
    await assert.rejects(voidPenjualan(db, k(kasir), kasir, j3.id, { alasan: 'Salah input' }), tolakAturan(/penyetuju/))
    await aturPin(db, k(owner), owner, admin.id, { pin: '246810', ulangiPin: '246810' })
    assert.deepEqual((await daftarPenyetujuVoid(db)).map((p) => p.id), [admin.id])
    await assert.rejects(voidPenjualan(db, k(kasir), kasir, j3.id, { alasan: 'Salah input', penyetujuId: admin.id, pinPenyetuju: '111111' }), tolakAturan(/PIN penyetuju salah/))
    await voidPenjualan(db, k(kasir), kasir, j3.id, { alasan: 'Salah input', penyetujuId: admin.id, pinPenyetuju: '246810' })
    const v = await db.sale.findUniqueOrThrow({ where: { id: j3.id } })
    assert.equal(v.status, 'Void')
    assert.equal(v.voidApprovedBy, admin.id)
    await assert.rejects(voidPenjualan(db, k(admin), admin, j3.id, { alasan: 'lagi' }), tolakAturan(/sudah void/))

    // Kasir lain tidak melihat transaksi ini.
    assert.equal(await ambilPenjualan(db, kasir2, j1.id), null)
    await assert.rejects(voidPenjualan(db, k(kasir2), kasir2, j1.id, { alasan: 'coba', penyetujuId: admin.id, pinPenyetuju: '246810' }), tolakAturan(/tidak ditemukan/))

    // Tutup buta: seharusnya = 200000 + tunai j1 + 20000 - 5000. Dihitung lewat pecahan 2 x 100.000.
    const harus = 200000 + harap.total + 20000 - 5000
    const tutup = await tutupShift(db, k(kasir), kasir, s.id, { kasDihitung: '', catatan: 'Uang kurang', pecahan_100000: '2' })
    assert.equal(tutup.expectedCash, BigInt(harus))
    assert.equal(tutup.countedCash, 200000n)
    assert.equal(tutup.cashDiff, BigInt(200000 - harus))
    assert.equal(tutup.status, 'PerluPersetujuan')
    assert.equal(tutup.diffLimit, 10000n)

    // Sesudah ditutup: jual dan kas laci ditolak, void oleh Admin ditolak, Admin tidak bisa menyetujui.
    await assert.rejects(simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Teh, qty: 1 }], bayar: [{ metodeId: metode.QRIS, jumlah: t2 }] }), tolakAturan(/Buka shift/))
    await assert.rejects(catatKasLaci(db, k(kasir), kasir, s.id, { jenis: 'masuk', jumlah: '1000', alasan: 'telat' }), tolakAturan(/sudah ditutup/))
    await assert.rejects(voidPenjualan(db, k(admin), admin, j1.id, { alasan: 'Sesudah tutup' }), tolakAturan(/hanya bisa oleh Owner/))
    await assert.rejects(setujuiShift(db, k(admin), admin, s.id, { catatan: 'oke' }), (e) => e instanceof GalatIzin)
    await assert.rejects(setujuiShift(db, k(owner), owner, s.id, { catatan: '' }))

    await setujuiShift(db, k(owner), owner, s.id, { catatan: 'Sudah dibicarakan dengan kasir' })
    const ok = await db.shift.findUniqueOrThrow({ where: { id: s.id } })
    assert.equal(ok.status, 'Tutup')
    assert.equal(ok.approvedBy, owner.id)

    // Kasir dengan PIN Admin ditolak sesudah shift ditutup, dengan PIN Owner diterima. Owner sendiri juga boleh.
    const jualLain = await db.sale.create({ data: { shiftId: s.id, no: 'UJI-VOID-1', mode: 'takeaway', total: 1000n, createdBy: kasir.id } })
    await assert.rejects(voidPenjualan(db, k(kasir), kasir, jualLain.id, { alasan: 'Sesudah tutup', penyetujuId: admin.id, pinPenyetuju: '246810' }), tolakAturan(/hanya bisa oleh Owner/))
    await aturPin(db, k(owner), owner, owner.id, { pin: '8642', ulangiPin: '8642' })
    await voidPenjualan(db, k(kasir), kasir, jualLain.id, { alasan: 'Sesudah tutup', penyetujuId: owner.id, pinPenyetuju: '8642' })
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: jualLain.id } })).voidApprovedBy, owner.id)
    await voidPenjualan(db, k(owner), owner, j1.id, { alasan: 'Koreksi Owner' })
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: j1.id } })).status, 'Void')
    assert.equal((await db.member.findUniqueOrThrow({ where: { id: memberId } })).visits, 5)

    // Semua langkah tercatat di audit.
    const aksi = (await db.auditLog.findMany({ where: { OR: [{ docType: 'shift', docId: String(s.id) }, { docType: 'sale' }] }, select: { action: true } })).map((a) => a.action)
    for (const a of ['shift.buka', 'shift.kas', 'penjualan.simpan', 'penjualan.void', 'shift.tutup', 'shift.setujui']) assert.ok(aksi.includes(a), a)
  })

  test('selisih kecil tidak perlu persetujuan, dan shift kasir lain tidak bisa ditutup oleh kasir', async () => {
    const s = await bukaShift(db, k(kasir), kasir, { modal: '50000' })
    const lain = await db.shift.findFirstOrThrow({ where: { userId: kasir2.id, status: 'Buka' } })
    await assert.rejects(tutupShift(db, k(kasir), kasir, lain.id, { kasDihitung: '100000' }), tolakAturan(/tidak ditemukan/))
    const t = await tutupShift(db, k(kasir), kasir, s.id, { kasDihitung: '45.000' })
    assert.equal(t.status, 'Tutup')
    assert.equal(t.cashDiff, -5000n)
  })

  test('menu nonaktif dan dine in tanpa meja ditolak', async () => {
    await bukaShift(db, k(kasir), kasir, { modal: '0' })
    await assert.rejects(simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Mati, qty: 1 }], bayar: [{ metodeId: metode.Tunai, jumlah: 5000 }] }), tolakAturan(/tidak aktif/))
    await assert.rejects(simpanPenjualan(db, k(kasir), kasir, { mode: 'dinein', meja: '', baris: [{ menuItemId: menu.Kopi, qty: 1 }], bayar: [{ metodeId: metode.Tunai, jumlah: 50000 }] }))
  })

  // Tes di bawah memakai shift kasir yang masih terbuka dari tes sebelumnya.
  test('paket set dijual sebagai satu baris berpenanda paket tanpa potongan member, menu biasa tetap kena', async () => {
    const paket = await db.menuSet.create({ data: { name: 'Pagi', mainItemId: menu.Nasi, drinkItemId: menu.Teh, normalPrice: 48000n, price: 40000n } })
    const sebelum = await db.member.findUniqueOrThrow({ where: { id: memberId } })
    // Member dicari dengan nomor format 08, tersimpan dalam format 62.
    const m = await cariMember(db, '0812-3456-7890')
    assert.equal(m?.id, memberId)
    assert.equal(m?.persen, 10)
    const j = await simpanPenjualan(db, k(kasir), kasir, {
      mode: 'takeaway',
      memberId,
      baris: [
        { menuSetId: paket.id, qty: 2, catatan: 'es sedikit' },
        { menuItemId: menu.Kopi, qty: 1 },
      ],
      bayar: [{ metodeId: metode.Tunai, jumlah: 200000 }],
    })
    const harap = hitungKeranjang(
      [
        { harga: 40000, qty: 2, jenis: 'paket' },
        { harga: 28000, qty: 1, jenis: 'menu' },
      ],
      10,
      { pajak: 10, service: 5 },
    )
    assert.equal(harap.disc, 2800)
    assert.equal(j.total, harap.total)
    const r = await ambilPenjualan(db, kasir, j.id)
    assert.equal(r?.disc, 2800n)
    const bp = r!.saleLines.find((l) => l.menuSetId === paket.id)
    assert.ok(bp, 'baris paket tersimpan dengan menu_set_id')
    assert.deepEqual(
      { name: bp.name, category: bp.category, menuItemId: bp.menuItemId, drinkId: bp.drinkId, price: bp.price, qty: bp.qty, note: bp.note },
      { name: 'Paket Pagi', category: 'paket', menuItemId: menu.Nasi, drinkId: menu.Teh, price: 40000n, qty: 2, note: 'es sedikit' },
    )
    const bm = r!.saleLines.find((l) => l.menuSetId === null)
    assert.deepEqual({ menuItemId: bm?.menuItemId, drinkId: bm?.drinkId, category: bm?.category }, { menuItemId: menu.Kopi, drinkId: null, category: 'kopi' })
    // Kunjungan bertambah dan tier_id ikut dihitung ulang dari tingkat aktif.
    const sesudah = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { tier: true } })
    assert.equal(sesudah.visits, sebelum.visits + 1)
    assert.equal(sesudah.tier?.name, 'Sahabat')

    // Paket berisi menu dan paket sekaligus ditolak, paket nonaktif ditolak.
    await assert.rejects(simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuItemId: menu.Kopi, menuSetId: paket.id, qty: 1 }], bayar: [{ metodeId: metode.Tunai, jumlah: 100000 }] }))
    await db.menuSet.update({ where: { id: paket.id }, data: { active: false } })
    await assert.rejects(
      simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', baris: [{ menuSetId: paket.id, qty: 1 }], bayar: [{ metodeId: metode.Tunai, jumlah: 100000 }] }),
      tolakAturan(/paket yang sudah tidak aktif/),
    )
  })

  test('member nonaktif tidak ditemukan dan ditolak saat jual, tingkat nonaktif tidak memberi potongan', async () => {
    const sahabat = await db.memberTier.findFirstOrThrow({ where: { name: 'Sahabat' } })
    await ubahStatusTingkat(db, k(owner), owner, sahabat.id, false)
    // Tanpa Sahabat, tingkat aktif tertinggi yang tercapai adalah Reguler (0%).
    assert.deepEqual(await cariMember(db, '6281234567890'), { id: memberId, name: 'Budi', tingkat: 'Reguler', persen: 0 })
    await ubahStatusTingkat(db, k(owner), owner, sahabat.id, true)
    assert.equal((await cariMember(db, '+62 812 3456 7890'))?.persen, 10)

    await ubahStatusMember(db, k(owner), owner, memberId, false)
    assert.equal(await cariMember(db, '081234567890'), null)
    await assert.rejects(
      simpanPenjualan(db, k(kasir), kasir, { mode: 'takeaway', memberId, baris: [{ menuItemId: menu.Kopi, qty: 1 }], bayar: [{ metodeId: metode.Tunai, jumlah: 50000 }] }),
      tolakAturan(/nonaktif/),
    )
    await ubahStatusMember(db, k(owner), owner, memberId, true)
    assert.equal(await cariMember(db, '0812'), null, 'nomor tidak sah tidak dicari')
  })
})

describe('PIN kasir', () => {
  test('hanya peran tanpa menu Pengaturan yang boleh masuk dengan PIN', () => {
    assert.equal(bolehMasukPin('kasir', kasir.izin), true)
    assert.equal(bolehMasukPin('admin', admin.izin), false)
    assert.equal(bolehMasukPin('owner', owner.izin), false)
  })
  test('PIN 4 sampai 6 angka dan disimpan sebagai hash bcrypt', async () => {
    await assert.rejects(aturPin(db, k(owner), owner, kasir.id, { pin: '12a4', ulangiPin: '12a4' }))
    await assert.rejects(aturPin(db, k(owner), owner, kasir.id, { pin: '1234567', ulangiPin: '1234567' }))
    await aturPin(db, k(admin), admin, kasir.id, { pin: '4321', ulangiPin: '4321' })
    const u = await db.appUser.findUniqueOrThrow({ where: { id: kasir.id } })
    assert.ok(u.pinHash && u.pinHash !== '4321' && (await bcrypt.compare('4321', u.pinHash)))
    const a = await db.auditLog.findFirstOrThrow({ where: { action: 'pengguna.pin', docId: String(kasir.id) }, orderBy: { id: 'desc' } })
    assert.ok(!JSON.stringify(a).includes('4321'))
  })
  test('Admin tidak bisa mengatur PIN Owner atau Admin lain, Kasir tidak punya izin', async () => {
    const admin2 = await buatAktor(db, 'admin', 'admin2')
    await assert.rejects(aturPin(db, k(admin), admin, owner.id, { pin: '1111', ulangiPin: '1111' }), tolakAturan(/tidak bisa mengatur PIN/))
    await assert.rejects(aturPin(db, k(admin), admin, admin2.id, { pin: '1111', ulangiPin: '1111' }), tolakAturan(/tidak bisa mengatur PIN/))
    await aturPin(db, k(admin), admin, admin.id, { pin: '1357', ulangiPin: '1357' })
    await assert.rejects(aturPin(db, k(kasir), kasir, kasir.id, { pin: '1111', ulangiPin: '1111' }), (e) => e instanceof GalatIzin)
  })
  test('daftar masuk PIN tidak memuat Admin walau punya PIN', async () => {
    const ids = (await daftarMasukPin(db)).map((x) => x.id)
    assert.ok(ids.includes(kasir.id))
    assert.ok(!ids.includes(admin.id))
    const r = await cobaMasukPin(db, { userId: admin.id, pin: '1357', ip: '10.9.9.9', userAgent: 'tes' })
    assert.equal(r.ok, false)
  })
  test('masuk PIN berhasil membuat sesi dan audit kasir.masuk_pin', async () => {
    const r = await cobaMasukPin(db, { userId: kasir.id, pin: '4321', ip: '10.1.1.1', userAgent: 'tes' })
    assert.equal(r.ok, true)
    assert.equal(await db.auditLog.count({ where: { action: 'kasir.masuk_pin', userId: kasir.id } }), 1)
  })
  test('rate limit PIN: 5 kali salah mengunci, PIN benar sesudahnya tetap ditolak, sandi tidak ikut terkunci', async () => {
    for (let i = 0; i < BATAS_GAGAL_NAMA; i++) {
      const r = await cobaMasukPin(db, { userId: kasir.id, pin: String(1000 + i), ip: `10.2.0.${i}`, userAgent: 'tes' })
      assert.deepEqual(r, { ok: false, alasan: 'salah' })
    }
    const r = await cobaMasukPin(db, { userId: kasir.id, pin: '4321', ip: '10.2.1.1', userAgent: 'tes' })
    assert.deepEqual(r, { ok: false, alasan: 'terkunci' })
    assert.ok((await db.auditLog.count({ where: { action: 'masuk.terkunci', userId: kasir.id } })) >= 1)
    const { cobaMasuk } = await import('../src/lib/masuk')
    const s = await cobaMasuk(db, { username: 'kasir1', password: 'sandi-uji-123', ip: '10.2.2.2', userAgent: 'tes' })
    assert.equal(s.ok, true)
  })
  test('rate limit per IP berlaku untuk PIN', async () => {
    const ip = '10.3.3.3'
    for (let i = 0; i < 20; i++) await db.loginAttempt.create({ data: { username: `pin:lain${i}`, ip, success: false } })
    await aturPin(db, k(owner), owner, kasir2.id, { pin: '9999', ulangiPin: '9999' })
    const r = await cobaMasukPin(db, { userId: kasir2.id, pin: '9999', ip, userAgent: 'tes' })
    assert.deepEqual(r, { ok: false, alasan: 'terkunci' })
  })
  test('mengganti PIN mencabut sesi pengguna itu', async () => {
    const sesi = await db.userSession.count({ where: { userId: kasir.id, revokedAt: null } })
    assert.ok(sesi >= 1)
    await aturPin(db, k(owner), owner, kasir.id, { pin: '5555', ulangiPin: '5555' })
    assert.equal(await db.userSession.count({ where: { userId: kasir.id, revokedAt: null } }), 0)
  })
})
