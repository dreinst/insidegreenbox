// Modul Menu dan Harga: kategori, menu, ubah harga massal dengan riwayat, dan paket set (tahap 3A).
// Izin memakai menu.menu. Tanpa Next, dipanggil aksi server dan tes.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, Tx } from './db'
import { bacaPilihanFoto, hapusUnggahan, tentukanFoto, type PilihanFoto } from './foto'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { BATAS_HARGA, PER_HALAMAN, bacaRupiah, formatRupiah, jadikanKode, pesanUnik, sesuaiHalaman, skemaCentang, skemaTeksOpsional, skemaUang } from './master'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'menu.menu'

const nama = (label: string, maks = 80) => z.string().trim().min(2, `${label} minimal 2 huruf.`).max(maks, `${label} paling panjang ${maks} huruf.`)

// ===== Kategori =====

export const skemaKategori = z.object({
  name: nama('Nama kategori', 40),
  sort: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, 'Urutan harus angka 0 sampai 9999.')
    .default(''),
})

export async function tambahKategori(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKategori.parse(masukan)
  const kode = jadikanKode(d.name)
  if (!kode) throw new GalatAturan('Nama kategori harus memuat huruf atau angka.', 'name')
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.menuCategory.findFirst({ where: { OR: [{ code: kode }, { name: { equals: d.name, mode: 'insensitive' } }] } })) {
        throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
      }
      const akhir = await tx.menuCategory.aggregate({ _max: { sort: true } })
      const urut = d.sort === '' ? (akhir._max.sort ?? 0) + 10 : Number(d.sort)
      const c = await tx.menuCategory.create({ data: { code: kode, name: d.name, sort: urut, createdBy: aktor.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, { action: 'kategori.tambah', docType: 'menu_category', docId: c.id, summary: `Menambah kategori menu ${c.name}`, after: { code: c.code, name: c.name, sort: c.sort } })
      return c
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahKategori(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaKategori.parse(masukan)
  return db.$transaction(async (tx) => {
    const c = await tx.menuCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori tidak ditemukan.')
    if (await tx.menuCategory.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
    const urut = d.sort === '' ? c.sort : Number(d.sort)
    const s = selisih({ name: c.name, sort: c.sort }, { name: d.name, sort: urut })
    if (!s.berubah.length) return { c, berubah: 0 }
    const baru = await tx.menuCategory.update({ where: { id }, data: { name: d.name, sort: urut, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'kategori.ubah', docType: 'menu_category', docId: id, summary: `Mengubah ${s.berubah.join(', ')} kategori ${baru.name}`, before: s.sebelum, after: s.sesudah })
    return { c: baru, berubah: s.berubah.length }
  })
}

export async function ubahStatusKategori(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const c = await tx.menuCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori tidak ditemukan.')
    if (c.active === aktif) return c
    if (!aktif) {
      const pakai = await tx.menuItem.count({ where: { category: c.code, active: true } })
      if (pakai) throw new GalatAturan(`Kategori ${c.name} masih punya ${pakai} menu aktif. Nonaktifkan atau pindahkan menunya dulu.`)
    }
    const baru = await tx.menuCategory.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'kategori.aktifkan' : 'kategori.nonaktifkan', docType: 'menu_category', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} kategori ${c.name}`, before: { active: c.active }, after: { active: aktif } })
    return baru
  })
}

// ===== Menu =====

export const skemaMenu = z.object({
  name: nama('Nama menu'),
  category: z.string().trim().min(1, 'Pilih kategori.'),
  price: skemaUang({ label: 'Harga' }),
  description: skemaTeksOpsional('Deskripsi', 400),
  kcal: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, 'Kalori harus angka bulat 0 sampai 9999, atau dikosongkan.')
    .default(''),
  featured: skemaCentang,
})

async function periksaKategoriMenu(tx: Tx, kode: string, kategoriLama?: string) {
  const c = await tx.menuCategory.findUnique({ where: { code: kode } })
  if (!c) throw new GalatAturan('Kategori tidak ditemukan.', 'category')
  if (!c.active && c.code !== kategoriLama) throw new GalatAturan(`Kategori ${c.name} sedang nonaktif.`, 'category')
  return c
}

async function namaMenuPakai(tx: Tx, nm: string, kecuali?: number) {
  return tx.menuItem.findFirst({ where: { name: { equals: nm, mode: 'insensitive' }, ...(kecuali ? { NOT: { id: kecuali } } : {}) } })
}

async function catatHarga(tx: Tx, aktor: Aktor, label: string, rule: string, baris: { menuItemId: number; lama: bigint; baru: bigint }[]) {
  const b = await tx.menuPriceBatch.create({ data: { label, rule, createdBy: aktor.id } })
  await tx.menuPriceHistory.createMany({ data: baris.map((r) => ({ batchId: b.id, menuItemId: r.menuItemId, oldPrice: r.lama, newPrice: r.baru })) })
  return b
}

export async function tambahMenu(db: Db, k: Konteks, aktor: Aktor, masukan: unknown, foto: PilihanFoto) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaMenu.parse(masukan)
  const { image, baru } = await tentukanFoto(foto, null)
  try {
    return await db.$transaction(async (tx) => {
      const c = await periksaKategoriMenu(tx, d.category)
      if (await namaMenuPakai(tx, d.name)) throw new GalatAturan('Nama menu sudah dipakai.', 'name')
      const akhir = await tx.menuItem.aggregate({ _max: { sort: true } })
      const m = await tx.menuItem.create({
        data: { name: d.name, category: c.code, price: d.price, description: d.description, kcal: d.kcal === '' ? null : Number(d.kcal), featured: d.featured, image, sort: (akhir._max.sort ?? 0) + 1, createdBy: aktor.id, updatedBy: aktor.id },
      })
      await catatAudit(tx, k, {
        action: 'menu.tambah',
        docType: 'menu_item',
        docId: m.id,
        summary: `Menambah menu ${m.name} (${c.name}) ${formatRupiah(m.price)}`,
        after: { name: m.name, category: m.category, price: m.price, featured: m.featured, image: m.image, kcal: m.kcal },
      })
      return m
    })
  } catch (e) {
    await hapusUnggahan(baru)
    if (pesanUnik(e)) throw new GalatAturan('Nama menu sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahMenu(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown, foto: PilihanFoto) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaMenu.parse(masukan)
  const sebelumnya = await db.menuItem.findUnique({ where: { id } })
  if (!sebelumnya) throw new GalatAturan('Menu tidak ditemukan.')
  const { image, baru } = await tentukanFoto(foto, sebelumnya.image)
  try {
    const hasil = await db.$transaction(async (tx) => {
      const m = await tx.menuItem.findUniqueOrThrow({ where: { id } })
      const c = await periksaKategoriMenu(tx, d.category, m.category)
      if (await namaMenuPakai(tx, d.name, id)) throw new GalatAturan('Nama menu sudah dipakai.', 'name')
      const kcal = d.kcal === '' ? null : Number(d.kcal)
      const s = selisih(
        { name: m.name, category: m.category, price: m.price, description: m.description, kcal: m.kcal, featured: m.featured, image: m.image },
        { name: d.name, category: c.code, price: d.price, description: d.description, kcal, featured: d.featured, image },
      )
      if (!s.berubah.length) return { m, berubah: 0, fotoLama: null as string | null }
      const b = await tx.menuItem.update({ where: { id }, data: { name: d.name, category: c.code, price: d.price, description: d.description, kcal, featured: d.featured, image, updatedBy: aktor.id } })
      if (d.price !== m.price) await catatHarga(tx, aktor, `Ubah harga ${b.name}`, 'manual', [{ menuItemId: id, lama: m.price, baru: d.price }])
      await catatAudit(tx, k, { action: 'menu.ubah', docType: 'menu_item', docId: id, summary: `Mengubah ${s.berubah.join(', ')} menu ${b.name}`, before: s.sebelum, after: s.sesudah })
      return { m: b, berubah: s.berubah.length, fotoLama: m.image !== image ? m.image : null }
    })
    await hapusUnggahan(hasil.fotoLama)
    return hasil
  } catch (e) {
    await hapusUnggahan(baru)
    if (pesanUnik(e)) throw new GalatAturan('Nama menu sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahStatusMenu(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const m = await tx.menuItem.findUnique({ where: { id }, include: { categoryRef: true } })
    if (!m) throw new GalatAturan('Menu tidak ditemukan.')
    if (m.active === aktif) return m
    if (aktif && !m.categoryRef.active) throw new GalatAturan(`Kategori ${m.categoryRef.name} sedang nonaktif. Aktifkan kategorinya dulu.`)
    if (!aktif) {
      const paket = await tx.menuSet.findMany({ where: { active: true, OR: [{ mainItemId: id }, { drinkItemId: id }] }, select: { name: true } })
      if (paket.length) throw new GalatAturan(`Menu ini dipakai paket set aktif: ${paket.map((p) => p.name).join(', ')}. Nonaktifkan paketnya dulu.`)
    }
    const baru = await tx.menuItem.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'menu.aktifkan' : 'menu.nonaktifkan', docType: 'menu_item', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} menu ${m.name}`, before: { active: m.active }, after: { active: aktif } })
    return baru
  })
}

export type SaringMenu = { q?: string; kategori?: string; status?: string; unggulan?: string; hal?: string }

export async function daftarMenu(db: Db, s: SaringMenu) {
  const q = s.q?.trim().slice(0, 64)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(s.kategori ? { category: s.kategori } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
    ...(s.unggulan === 'ya' ? { featured: true } : {}),
  }
  const [baris, total] = await Promise.all([
    db.menuItem.findMany({ where, include: { categoryRef: true }, orderBy: [{ active: 'desc' }, { categoryRef: { sort: 'asc' } }, { sort: 'asc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.menuItem.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

// ===== Ubah harga massal dan riwayat =====

const BULAT = ['1', '100', '500', '1000'] as const

export const skemaRencanaHarga = z.object({
  kategori: z.string().trim().default(''),
  mode: z.enum(['persen', 'nominal'], { message: 'Pilih cara mengubah: persen atau nominal.' }),
  arah: z.enum(['naik', 'turun'], { message: 'Pilih naik atau turun.' }),
  nilai: z.string().trim().min(1, 'Nilai perubahan wajib diisi.'),
  bulat: z.enum(BULAT, { message: 'Pilih pembulatan.' }).default('500'),
})
export const skemaHargaMassal = skemaRencanaHarga.extend({
  label: z.string().trim().min(3, 'Alasan atau catatan minimal 3 huruf.').max(120, 'Catatan paling panjang 120 huruf.'),
})

// Harga baru dari harga lama. nilaiBp: persen dalam basis poin (1% = 100) atau rupiah, bertanda. Dibulatkan ke terdekat.
export function hitungHargaBaru(lama: bigint, mode: 'persen' | 'nominal', nilai: bigint, bulat: bigint): bigint {
  const mentah = mode === 'persen' ? (lama * (10_000n + nilai) + 5_000n) / 10_000n : lama + nilai
  if (mentah <= 0n) return mentah
  return ((mentah + bulat / 2n) / bulat) * bulat
}

function bacaNilaiPerubahan(d: z.infer<typeof skemaRencanaHarga>) {
  const tanda = d.arah === 'turun' ? -1n : 1n
  if (d.mode === 'persen') {
    const t = d.nilai.replace(',', '.')
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) throw new GalatAturan('Persen harus berupa angka, misalnya 5 atau 7,5.', 'nilai')
    const bp = BigInt(Math.round(Number(t) * 100))
    if (bp <= 0n) throw new GalatAturan('Persen harus lebih dari 0.', 'nilai')
    if (d.arah === 'turun' && bp >= 10_000n) throw new GalatAturan('Penurunan harus kurang dari 100 persen.', 'nilai')
    if (d.arah === 'naik' && bp > 100_000n) throw new GalatAturan('Kenaikan paling besar 1000 persen.', 'nilai')
    return tanda * bp
  }
  const n = bacaRupiah(d.nilai)
  if (n === null || n <= 0n) throw new GalatAturan('Nominal harus rupiah bulat lebih dari 0, misalnya 2000 atau 2.000.', 'nilai')
  return tanda * n
}

export type BarisRencana = { id: number; name: string; category: string; lama: bigint; baru: bigint }

// Rencana perubahan untuk menu aktif. Dipakai pratinjau dan penerapan, jadi hasilnya selalu dihitung ulang di server.
export async function rencanaHarga(db: Db | Tx, masukan: unknown): Promise<{ baris: BarisRencana[]; ringkas: string }> {
  const d = skemaRencanaHarga.parse(masukan)
  const nilai = bacaNilaiPerubahan(d)
  if (d.kategori && !(await db.menuCategory.findUnique({ where: { code: d.kategori } }))) throw new GalatAturan('Kategori tidak ditemukan.', 'kategori')
  const items = await db.menuItem.findMany({ where: { active: true, ...(d.kategori ? { category: d.kategori } : {}) }, include: { categoryRef: true }, orderBy: [{ categoryRef: { sort: 'asc' } }, { sort: 'asc' }, { name: 'asc' }] })
  if (!items.length) throw new GalatAturan('Tidak ada menu aktif yang cocok dengan pilihan ini.', 'kategori')
  const baris = items.map((m) => ({ id: m.id, name: m.name, category: m.categoryRef.name, lama: m.price, baru: hitungHargaBaru(m.price, d.mode, nilai, BigInt(d.bulat)) }))
  const jelek = baris.find((b) => b.baru <= 0n || b.baru > BATAS_HARGA)
  if (jelek) throw new GalatAturan(`Harga ${jelek.name} menjadi ${jelek.baru <= 0n ? 'nol atau kurang' : `di atas ${formatRupiah(BATAS_HARGA)}`}. Kurangi perubahannya.`, 'nilai')
  const arah = d.arah === 'naik' ? 'naik' : 'turun'
  const besar = d.mode === 'persen' ? `${d.nilai.replace('.', ',')}%` : formatRupiah(bacaRupiah(d.nilai)!)
  return { baris, ringkas: `${arah} ${besar}, pembulatan ${d.bulat === '1' ? 'tanpa' : `ke ${formatRupiah(BigInt(d.bulat))}`}` }
}

export async function terapkanHargaMassal(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaHargaMassal.parse(masukan)
  return db.$transaction(async (tx) => {
    const { baris, ringkas } = await rencanaHarga(tx, d)
    const berubah = baris.filter((b) => b.baru !== b.lama)
    if (!berubah.length) throw new GalatAturan('Tidak ada harga yang berubah dengan aturan ini.', 'nilai')
    for (const b of berubah) await tx.menuItem.update({ where: { id: b.id }, data: { price: b.baru, updatedBy: aktor.id } })
    const batch = await catatHarga(tx, aktor, d.label, ringkas + (d.kategori ? `, kategori ${d.kategori}` : ', semua kategori'), berubah.map((b) => ({ menuItemId: b.id, lama: b.lama, baru: b.baru })))
    await catatAudit(tx, k, {
      action: 'harga.massal',
      docType: 'menu_price_batch',
      docId: batch.id,
      summary: `Mengubah harga ${berubah.length} menu (${ringkas}): ${d.label}`,
      after: { aturan: ringkas, kategori: d.kategori || null, jumlah: berubah.length, contoh: berubah.slice(0, 5).map((b) => ({ menu: b.name, dari: b.lama, ke: b.baru })) },
    })
    return { batch, jumlah: berubah.length }
  })
}

export async function riwayatHarga(db: Db, hal: string | undefined) {
  const h = sesuaiHalaman(hal)
  const [baris, total] = await Promise.all([
    db.menuPriceBatch.findMany({ include: { rows: { include: { menuItem: { select: { name: true } } }, orderBy: { id: 'asc' } } }, orderBy: { id: 'desc' }, skip: (h - 1) * 20, take: 20 }),
    db.menuPriceBatch.count(),
  ])
  return { baris, total, hal: h, jumlahHal: Math.max(1, Math.ceil(total / 20)) }
}

// ===== Paket set =====

export const skemaPaket = z.object({
  name: nama('Nama paket'),
  mainItemId: z.coerce.number({ message: 'Pilih menu utama.' }).int().positive('Pilih menu utama.'),
  drinkItemId: z.coerce.number({ message: 'Pilih minuman.' }).int().positive('Pilih minuman.'),
  normalPrice: skemaUang({ label: 'Harga normal', wajib: false, min: 0n }),
  price: skemaUang({ label: 'Harga paket' }),
})

async function bacaPaket(tx: Tx, d: z.infer<typeof skemaPaket>) {
  if (d.mainItemId === d.drinkItemId) throw new GalatAturan('Menu utama dan minuman harus berbeda.', 'drinkItemId')
  const [utama, minum] = await Promise.all([tx.menuItem.findUnique({ where: { id: d.mainItemId } }), tx.menuItem.findUnique({ where: { id: d.drinkItemId } })])
  if (!utama) throw new GalatAturan('Menu utama tidak ditemukan.', 'mainItemId')
  if (!minum) throw new GalatAturan('Minuman tidak ditemukan.', 'drinkItemId')
  const normal = d.normalPrice > 0n ? d.normalPrice : utama.price + minum.price
  if (d.price >= normal) throw new GalatAturan(`Harga paket harus lebih murah dari harga normal (${formatRupiah(normal)}).`, 'price')
  return { utama, minum, normal }
}

export async function tambahPaket(db: Db, k: Konteks, aktor: Aktor, masukan: unknown, foto: PilihanFoto) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaPaket.parse(masukan)
  const { image, baru } = await tentukanFoto(foto, null)
  try {
    return await db.$transaction(async (tx) => {
      const { utama, minum, normal } = await bacaPaket(tx, d)
      if (await tx.menuSet.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama paket sudah dipakai.', 'name')
      if (!utama.active) throw new GalatAturan(`Menu ${utama.name} sedang nonaktif.`, 'mainItemId')
      if (!minum.active) throw new GalatAturan(`Menu ${minum.name} sedang nonaktif.`, 'drinkItemId')
      const akhir = await tx.menuSet.aggregate({ _max: { sort: true } })
      const p = await tx.menuSet.create({ data: { name: d.name, mainItemId: utama.id, drinkItemId: minum.id, normalPrice: normal, price: d.price, image, sort: (akhir._max.sort ?? 0) + 1, createdBy: aktor.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'paket.tambah',
        docType: 'menu_set',
        docId: p.id,
        summary: `Menambah paket ${p.name} (${utama.name} + ${minum.name}) ${formatRupiah(p.price)}`,
        after: { name: p.name, utama: utama.name, minuman: minum.name, normalPrice: p.normalPrice, price: p.price, image: p.image },
      })
      return p
    })
  } catch (e) {
    await hapusUnggahan(baru)
    throw e
  }
}

export async function ubahPaket(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown, foto: PilihanFoto) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaPaket.parse(masukan)
  const sebelumnya = await db.menuSet.findUnique({ where: { id } })
  if (!sebelumnya) throw new GalatAturan('Paket tidak ditemukan.')
  const { image, baru } = await tentukanFoto(foto, sebelumnya.image)
  try {
    const hasil = await db.$transaction(async (tx) => {
      const p = await tx.menuSet.findUniqueOrThrow({ where: { id } })
      const { utama, minum, normal } = await bacaPaket(tx, d)
      if (await tx.menuSet.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama paket sudah dipakai.', 'name')
      const s = selisih(
        { name: p.name, mainItemId: p.mainItemId, drinkItemId: p.drinkItemId, normalPrice: p.normalPrice, price: p.price, image: p.image },
        { name: d.name, mainItemId: utama.id, drinkItemId: minum.id, normalPrice: normal, price: d.price, image },
      )
      if (!s.berubah.length) return { p, berubah: 0, fotoLama: null as string | null }
      const b = await tx.menuSet.update({ where: { id }, data: { name: d.name, mainItemId: utama.id, drinkItemId: minum.id, normalPrice: normal, price: d.price, image, updatedBy: aktor.id } })
      await catatAudit(tx, k, { action: 'paket.ubah', docType: 'menu_set', docId: id, summary: `Mengubah ${s.berubah.join(', ')} paket ${b.name}`, before: s.sebelum, after: s.sesudah })
      return { p: b, berubah: s.berubah.length, fotoLama: p.image !== image ? p.image : null }
    })
    await hapusUnggahan(hasil.fotoLama)
    return hasil
  } catch (e) {
    await hapusUnggahan(baru)
    throw e
  }
}

export async function ubahStatusPaket(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const p = await tx.menuSet.findUnique({ where: { id }, include: { mainItem: true, drinkItem: true } })
    if (!p) throw new GalatAturan('Paket tidak ditemukan.')
    if (p.active === aktif) return p
    if (aktif && (!p.mainItem.active || !p.drinkItem.active)) throw new GalatAturan('Menu utama atau minuman paket ini sedang nonaktif. Aktifkan menunya dulu.')
    const baru = await tx.menuSet.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'paket.aktifkan' : 'paket.nonaktifkan', docType: 'menu_set', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} paket ${p.name}`, before: { active: p.active }, after: { active: aktif } })
    return baru
  })
}

export type SaringPaket = { q?: string; status?: string; hal?: string }

export async function daftarPaket(db: Db, s: SaringPaket) {
  const q = s.q?.trim().slice(0, 64)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = { ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}), ...(status ? { active: status === 'aktif' } : {}) }
  const [baris, total] = await Promise.all([
    db.menuSet.findMany({ where, include: { mainItem: true, drinkItem: true }, orderBy: [{ active: 'desc' }, { sort: 'asc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.menuSet.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export { bacaPilihanFoto }
