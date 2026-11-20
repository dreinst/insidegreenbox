// Resep dan BOM (tahap 4B, KONTRAK 13). Resep menu (bom.kind = menu) menghubungkan menu_item lewat menu_item.bom_id ke
// bahan dengan qty per porsi dalam satuan dasar. BOM Assembly (bom.kind = assembly) mengolah bahan menjadi produk hasil
// (bom.product_id) dengan qty hasil per batch (bom.output_qty). Master: tidak dihapus, hanya dinonaktifkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, type Pengguna } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, NOL, des, formatNilai, formatQty, keRupiah, skemaQty, type Angka } from '../stok/angka'
import { hariIni } from '../stok/dokumen'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>

const MENU = 'stok.resep'

export const JENIS_RESEP = { menu: 'Resep menu', assembly: 'BOM Assembly' } as const
export type JenisResep = keyof typeof JENIS_RESEP

export const BATAS_BAHAN = 60

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)
const nama = z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.')

// Persen toleransi 0 sampai 100, boleh koma. Kosong berarti 0.
const skemaToleransi = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = (v ?? '').trim().replace(',', '.')
    if (!t) return '0'
    if (!/^\d{1,3}(\.\d{1,3})?$/.test(t) || Number(t) > 100) {
      ctx.addIssue({ code: 'custom', message: 'Toleransi harus angka 0 sampai 100, misalnya 5 atau 2,5.' })
      return z.NEVER
    }
    return t
  })

export const skemaResepBaru = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('menu'), name: nama, menuItemId: idWajib('menu') }),
  z.object({
    kind: z.literal('assembly'),
    name: nama,
    productId: idWajib('produk hasil'),
    outputQty: skemaQty({ label: 'Qty hasil per batch' }),
    extraCost: skemaUang({ label: 'Biaya tambahan per batch', min: 0n, wajib: false }),
  }),
])

export const skemaUbahResep = z.object({
  name: nama,
  outputQty: skemaQty({ label: 'Qty hasil per batch' }).optional(),
  extraCost: skemaUang({ label: 'Biaya tambahan per batch', min: 0n, wajib: false }).optional(),
})

export const skemaBahan = z.object({ productId: idWajib('bahan'), qty: skemaQty({ label: 'Qty' }), tolPct: skemaToleransi })

const pesanJenis = (kind: string) => (kind === 'menu' ? 'resep menu' : 'BOM assembly')

// Resep yang sedang berlaku untuk sebuah menu: bom aktif yang ditunjuk menu_item.bom_id.
async function resepAktifMenu(tx: DbAtauTx, menuItemId: number) {
  const m = await tx.menuItem.findUnique({ where: { id: menuItemId }, include: { bom: true } })
  return m?.bom && m.bom.active ? m.bom : null
}

export async function tambahResep(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaResepBaru.parse(masukan)
  return db.$transaction(async (tx) => {
    let sasaran: string
    if (d.kind === 'menu') {
      // Kunci baris menu supaya dua resep tidak dipasang bersamaan ke menu yang sama.
      await tx.$executeRaw`SELECT id FROM menu_item WHERE id = ${d.menuItemId} FOR UPDATE`
      const m = await tx.menuItem.findUnique({ where: { id: d.menuItemId } })
      if (!m) throw new GalatAturan('Menu tidak ditemukan.', 'menuItemId')
      if (await resepAktifMenu(tx, m.id)) throw new GalatAturan(`${m.name} sudah punya resep aktif. Ubah resep itu atau nonaktifkan dulu.`, 'menuItemId')
      sasaran = m.name
    } else {
      const p = await tx.product.findUnique({ where: { id: d.productId } })
      if (!p || !p.active) throw new GalatAturan('Produk hasil tidak ditemukan atau nonaktif.', 'productId')
      sasaran = p.name
    }
    const kode = await ambilNomor(tx, 'bom', d.kind === 'menu' ? 'RM' : 'BA', hariIni())
    const hasilProduk = d.kind === 'assembly' ? await tx.product.findUniqueOrThrow({ where: { id: d.productId } }) : null
    const bom = await tx.bom.create({
      data: {
        code: kode,
        name: d.name,
        kind: d.kind,
        productId: hasilProduk?.id ?? null,
        unitId: hasilProduk?.baseUnitId ?? null,
        outputQty: d.kind === 'assembly' ? d.outputQty : 1,
        extraCost: d.kind === 'assembly' ? d.extraCost : 0n,
        createdBy: aktor.id,
        updatedBy: aktor.id,
      },
    })
    if (d.kind === 'menu') await tx.menuItem.update({ where: { id: d.menuItemId }, data: { bomId: bom.id, updatedBy: aktor.id } })
    // Produk hasil menunjuk BOM assembly terbarunya bila belum punya BOM aktif.
    if (hasilProduk) {
      const lama = hasilProduk.bomId ? await tx.bom.findUnique({ where: { id: hasilProduk.bomId } }) : null
      if (!lama?.active) await tx.product.update({ where: { id: hasilProduk.id }, data: { bomId: bom.id, updatedBy: aktor.id } })
    }
    await catatAudit(tx, k, {
      action: 'resep.tambah',
      docType: 'bom',
      docId: bom.id,
      summary: `Membuat ${pesanJenis(d.kind)} ${kode} ${d.name} untuk ${sasaran}`,
      after: { code: kode, name: d.name, kind: d.kind, untuk: sasaran, outputQty: bom.outputQty, extraCost: bom.extraCost },
    })
    return bom
  })
}

async function kunciResep(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM bom WHERE id = ${id} FOR UPDATE`
  const b = await tx.bom.findUnique({ where: { id }, include: { product: true, menuItems: { select: { id: true, name: true } } } })
  if (!b) throw new GalatAturan('Resep tidak ditemukan.')
  return b
}

export async function ubahResep(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaUbahResep.parse(masukan)
  return db.$transaction(async (tx) => {
    const b = await kunciResep(tx, id)
    const sebelum = { name: b.name, outputQty: des(b.outputQty).toString(), extraCost: b.extraCost.toString() }
    const sesudah = {
      name: d.name,
      outputQty: b.kind === 'assembly' && d.outputQty ? d.outputQty.toString() : sebelum.outputQty,
      extraCost: b.kind === 'assembly' && d.extraCost !== undefined ? d.extraCost.toString() : sebelum.extraCost,
    }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    const angkaBerubah = sebelum.outputQty !== sesudah.outputQty || sebelum.extraCost !== sesudah.extraCost
    await tx.bom.update({
      where: { id },
      data: { name: sesudah.name, outputQty: sesudah.outputQty, extraCost: BigInt(sesudah.extraCost), updatedBy: aktor.id, ...(angkaBerubah ? { version: { increment: 1 } } : {}) },
    })
    await catatAudit(tx, k, { action: 'resep.ubah', docType: 'bom', docId: id, summary: `Mengubah ${pesanJenis(b.kind)} ${b.code} ${sesudah.name}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Menambah bahan, atau mengubah qty dan toleransi bila bahan itu sudah ada di resep. Versi resep naik satu.
export async function simpanBahan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaBahan.parse(masukan)
  return db.$transaction(async (tx) => {
    const b = await kunciResep(tx, id)
    const p = await tx.product.findUnique({ where: { id: d.productId }, include: { baseUnit: true } })
    if (!p || !p.active) throw new GalatAturan('Bahan tidak ditemukan atau nonaktif.', 'productId')
    if (b.productId === p.id) throw new GalatAturan('Produk hasil tidak boleh menjadi bahannya sendiri.', 'productId')
    const ada = await tx.bomLine.findUnique({ where: { bomId_productId: { bomId: id, productId: p.id } } })
    if (!ada && (await tx.bomLine.count({ where: { bomId: id } })) >= BATAS_BAHAN) throw new GalatAturan(`Satu resep paling banyak ${BATAS_BAHAN} bahan.`)
    const data = { qty: d.qty, tolPct: d.tolPct, unitId: p.baseUnitId }
    if (ada) await tx.bomLine.update({ where: { id: ada.id }, data })
    else await tx.bomLine.create({ data: { bomId: id, productId: p.id, ...data } })
    await tx.bom.update({ where: { id }, data: { version: { increment: 1 }, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: ada ? 'resep.bahan_ubah' : 'resep.bahan_tambah',
      docType: 'bom',
      docId: id,
      summary: `${ada ? 'Mengubah' : 'Menambah'} bahan ${b.code}: ${formatQty(d.qty)} ${p.baseUnit.symbol} ${p.name}`,
      before: ada ? { produk: p.code, qty: ada.qty, tolPct: ada.tolPct } : undefined,
      after: { produk: p.code, qty: d.qty, tolPct: d.tolPct },
    })
    return ada ? 'ubah' : 'tambah'
  })
}

export async function hapusBahan(db: Db, k: Konteks, aktor: Aktor, id: number, barisId: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const b = await kunciResep(tx, id)
    const l = await tx.bomLine.findFirst({ where: { id: barisId, bomId: id }, include: { product: true } })
    if (!l) throw new GalatAturan('Bahan tidak ditemukan di resep ini.')
    await tx.bomLine.delete({ where: { id: l.id } })
    await tx.bom.update({ where: { id }, data: { version: { increment: 1 }, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'resep.bahan_hapus', docType: 'bom', docId: id, summary: `Menghapus bahan ${l.product.name} dari ${b.code}`, before: { produk: l.product.code, qty: l.qty } })
  })
}

// Aktifkan atau nonaktifkan. Resep menu yang diaktifkan dipasang lagi ke menunya; satu menu hanya punya satu resep aktif.
export async function ubahStatusResep(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const b = await kunciResep(tx, id)
    if (b.active === aktif) return 0
    if (aktif && b.kind === 'menu') {
      const menu = b.menuItems[0] ?? null
      // Resep menu yang dinonaktifkan tetap ditunjuk menunya sampai menu itu diberi resep baru.
      const asal = menu ?? (await tx.menuItem.findFirst({ where: { bomId: id } }))
      if (!asal) throw new GalatAturan('Menu resep ini sudah memakai resep lain. Buat resep baru untuk menu itu.')
      const lain = await resepAktifMenu(tx, asal.id)
      if (lain && lain.id !== id) throw new GalatAturan(`${asal.name} sudah punya resep aktif lain (${lain.code}).`)
    }
    await tx.bom.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'resep.aktifkan' : 'resep.nonaktifkan',
      docType: 'bom',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} ${pesanJenis(b.kind)} ${b.code} ${b.name}`,
      before: { active: b.active },
      after: { active: aktif },
    })
    return 1
  })
}

// ===== HPP =====

// Harga satuan bahan di sebuah lokasi, aturan yang sama dengan mesin stok saat barang keluar: harga rata-rata lokasi,
// lalu harga beli terakhir produk bila rata-rata lokasi belum ada.
export async function hargaBahan(db: DbAtauTx, idProduk: number[], locationId: number | null) {
  const unik = [...new Set(idProduk)]
  if (!unik.length) return new Map<number, Desimal>()
  const [produk, saldo] = await Promise.all([
    db.product.findMany({ where: { id: { in: unik } }, select: { id: true, lastCost: true, avgCost: true } }),
    locationId ? db.stockBalance.findMany({ where: { productId: { in: unik }, locationId }, select: { productId: true, avgCost: true } }) : [],
  ])
  const rata = new Map(saldo.map((s) => [s.productId, des(s.avgCost)]))
  return new Map(
    produk.map((p) => {
      const r = rata.get(p.id)
      // Tanpa lokasi: rata-rata gabungan semua lokasi (product.avg_cost), lalu harga beli terakhir.
      const pakai = r && r.gt(0) ? r : !locationId && des(p.avgCost).gt(0) ? des(p.avgCost) : des(p.lastCost)
      return [p.id, pakai]
    }),
  )
}

export type BarisHpp = { productId: number; qty: Angka; harga: Desimal }

// HPP murni: nilai tiap bahan = qty x harga satuan, dibulatkan rupiah per baris; total = jumlah baris + biaya tambahan.
// Per satuan hasil = total / qty hasil (4 desimal). Resep menu berqty hasil 1, jadi per satuan = per porsi.
export function hitungHpp(baris: BarisHpp[], biayaTambahan: bigint, qtyHasil: Angka) {
  const rinci = baris.map((b) => ({ ...b, nilai: keRupiah(des(b.qty).times(b.harga)) }))
  const total = rinci.reduce((n, b) => n + b.nilai, 0n) + biayaTambahan
  const q = des(qtyHasil)
  return { rinci, total, perSatuan: q.gt(0) ? new Desimal(total.toString()).div(q).toDecimalPlaces(4, Desimal.ROUND_HALF_UP) : NOL }
}

// HPP beberapa resep sekaligus di satu lokasi (untuk daftar dan rincian).
export async function hppResep(db: DbAtauTx, resep: { id: number; outputQty: Angka; extraCost: bigint; bomLines: { productId: number; qty: Angka }[] }[], locationId: number | null) {
  const harga = await hargaBahan(
    db,
    resep.flatMap((r) => r.bomLines.map((l) => l.productId)),
    locationId,
  )
  return new Map(resep.map((r) => [r.id, hitungHpp(r.bomLines.map((l) => ({ productId: l.productId, qty: l.qty, harga: harga.get(l.productId) ?? NOL })), r.extraCost, r.outputQty)]))
}

// ===== Daftar dan rincian =====

export type SaringResep = { q?: string; jenis?: string; status?: string; lokasi?: string; hal?: string }

export async function daftarResep(db: Db, s: SaringResep) {
  const hal = sesuaiHalaman(s.hal)
  const q = s.q?.trim().slice(0, 60)
  const where = {
    ...(s.jenis === 'menu' || s.jenis === 'assembly' ? { kind: s.jenis } : {}),
    ...(s.status === 'aktif' ? { active: true } : s.status === 'nonaktif' ? { active: false } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q.toUpperCase() } }, { menuItems: { some: { name: { contains: q, mode: 'insensitive' as const } } } }] } : {}),
  }
  const [baris, total] = await Promise.all([
    db.bom.findMany({
      where,
      include: { product: { include: { baseUnit: true } }, menuItems: { select: { id: true, name: true, price: true } }, bomLines: { select: { productId: true, qty: true } } },
      orderBy: [{ active: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.bom.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const muatResep = (db: Db, id: number) =>
  db.bom.findUnique({
    where: { id },
    include: {
      product: { include: { baseUnit: true } },
      unit: true,
      menuItems: { select: { id: true, name: true, price: true, active: true } },
      bomLines: { include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } },
    },
  })

// Menu aktif tanpa resep yang berlaku (tanpa bom, bom nonaktif, atau bom tanpa bahan). Penjualannya ber-HPP 0 dan tidak
// memotong stok. terjual = qty terjual 30 hari terakhir (termasuk sebagai bagian paket), supaya dampaknya terlihat.
export async function menuTanpaResep(db: DbAtauTx, sekarang = new Date()) {
  const menu = await db.menuItem.findMany({
    where: { active: true, OR: [{ bomId: null }, { bom: { active: false } }, { bom: { bomLines: { none: {} } } }] },
    select: { id: true, name: true, category: true, bom: { select: { id: true, active: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  if (!menu.length) return []
  const dari = new Date(sekarang.getTime() - 30 * 86_400_000)
  const ids = menu.map((m) => m.id)
  const jual = await db.$queryRaw<{ id: number; qty: bigint }[]>`
    SELECT x.id, sum(x.qty)::bigint AS qty FROM (
      SELECT l.menu_item_id AS id, l.qty FROM sale_line l JOIN sale s ON s.id = l.sale_id WHERE s.status = 'Selesai' AND s.at >= ${dari}
      UNION ALL
      SELECT l.set_drink_item_id AS id, l.qty FROM sale_line l JOIN sale s ON s.id = l.sale_id WHERE s.status = 'Selesai' AND s.at >= ${dari} AND l.set_drink_item_id IS NOT NULL
    ) x WHERE x.id = ANY(${ids}::int[]) GROUP BY x.id`
  const qty = new Map(jual.map((j) => [j.id, Number(j.qty)]))
  return menu.map((m) => ({ ...m, terjual: qty.get(m.id) ?? 0, sebab: !m.bom ? 'belum ada resep' : !m.bom.active ? 'resep nonaktif' : 'resep tanpa bahan' }))
}

// Pilihan menu untuk resep baru: menu yang belum punya resep aktif.
export const menuBelumBerresep = (db: Db) =>
  db.menuItem.findMany({ where: { OR: [{ bomId: null }, { bom: { active: false } }] }, select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } })

export const pilihanBomAssembly = (db: DbAtauTx) =>
  db.bom.findMany({ where: { kind: 'assembly', active: true, bomLines: { some: {} }, productId: { not: null } }, include: { product: { include: { baseUnit: true } } }, orderBy: { name: 'asc' } })

// ===== Pemakaian bahan penjualan =====

// Baris penjualan yang memotong stok: lineId = sale_line.id, menu = menu yang resepnya dipakai (menu biasa satu, paket set
// dua: menu utama dan minuman saat dijual, KONTRAK 11 butir 27), qty = qty baris.
export type BarisPakai = { lineId: number; menu: number[]; qty: number }

// Bahan yang dipakai tiap baris dari resep aktif menu-menunya. Bahan yang sama dalam satu baris digabung.
// tanpaResep berisi menu yang tidak punya resep berlaku (penjualannya tetap jalan dengan HPP 0).
export async function pemakaianJual(tx: DbAtauTx, baris: BarisPakai[]) {
  const ids = [...new Set(baris.flatMap((b) => b.menu))]
  const menu = ids.length
    ? await tx.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, bom: { select: { active: true, bomLines: { select: { productId: true, qty: true }, orderBy: { id: 'asc' } } } } } })
    : []
  const perMenu = new Map(menu.map((m) => [m.id, m]))
  const pakai: { lineId: number; productId: number; qty: Desimal }[] = []
  const tanpaResep = new Set<string>()
  for (const b of baris) {
    const gabung = new Map<number, Desimal>()
    for (const id of b.menu) {
      const m = perMenu.get(id)
      const bahan = m?.bom?.active ? m.bom.bomLines : []
      if (!bahan.length) {
        if (m) tanpaResep.add(m.name)
        continue
      }
      for (const l of bahan) gabung.set(l.productId, (gabung.get(l.productId) ?? NOL).plus(des(l.qty).times(b.qty)))
    }
    for (const [productId, qty] of gabung) pakai.push({ lineId: b.lineId, productId, qty })
  }
  return { pakai, tanpaResep: [...tanpaResep] }
}

export const ringkasNilai = (n: bigint) => formatNilai(n)
