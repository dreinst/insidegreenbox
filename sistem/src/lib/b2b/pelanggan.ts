// Master Pelanggan B2B (tahap 6A). Izin b2b.pelanggan (Owner L T U H, Admin L T U). Pelanggan tidak dihapus, hanya
// dinonaktifkan (KONTRAK 3.1). Termin bayar (hari) dipakai untuk jatuh tempo bawaan faktur penjualan. Daftar harga khusus
// per produk dan satuan jual bersifat opsional. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db, DbAtauTx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { faktorSatuan, skemaBarang, type Aktor } from '../beli/dokumen'
import { produkJual } from './umum'

const MENU = 'b2b.pelanggan'

const teks = (label: string, maks: number) => z.string().trim().max(maks, `${label} paling panjang ${maks} huruf.`).default('')

export const skemaPelanggan = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Kode 2 sampai 20 huruf besar, angka, garis bawah, atau tanda hubung.')),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.'),
  category: teks('Kelompok', 40),
  contact: teks('Nama kontak', 80),
  phone: z
    .string()
    .trim()
    .max(30, 'Telepon paling panjang 30 huruf.')
    .regex(/^[0-9+()\s.-]*$/, 'Telepon hanya berisi angka, spasi, +, (, ), titik, atau tanda hubung.')
    .default(''),
  address: teks('Alamat', 200),
  npwp: teks('NPWP', 30),
  paymentDays: z
    .string()
    .default('')
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? '0' : v))
    .pipe(z.string().regex(/^\d{1,3}$/, 'Termin berupa jumlah hari, 0 sampai 365.'))
    .transform(Number)
    .pipe(z.number().max(365, 'Termin paling lama 365 hari.')),
  note: teks('Catatan', 300),
})

const NAMA_KOLOM: Record<string, string> = {
  code: 'kode',
  name: 'nama',
  category: 'kelompok',
  contact: 'kontak',
  phone: 'telepon',
  address: 'alamat',
  npwp: 'NPWP',
  paymentDays: 'termin',
  note: 'catatan',
}
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

async function periksaKembar(tx: DbAtauTx, d: z.infer<typeof skemaPelanggan>, kecuali?: number) {
  const lain = kecuali ? { NOT: { id: kecuali } } : {}
  if (await tx.customer.findFirst({ where: { code: d.code, ...lain } })) throw new GalatAturan('Kode pelanggan sudah dipakai.', 'code')
  if (await tx.customer.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...lain } })) throw new GalatAturan('Nama pelanggan sudah dipakai.', 'name')
}

export async function tambahPelanggan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaPelanggan.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pelanggan'))`
    await periksaKembar(tx, d)
    const c = await tx.customer.create({ data: { ...d, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pelanggan.tambah', docType: 'customer', docId: c.id, summary: `Menambah pelanggan ${c.code} ${c.name}`, after: d })
    return c
  })
}

export async function ubahPelanggan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaPelanggan.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pelanggan'))`
    const c = await tx.customer.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Pelanggan tidak ditemukan.')
    await periksaKembar(tx, d, id)
    const beda = selisih(
      { code: c.code, name: c.name, category: c.category, contact: c.contact, phone: c.phone, address: c.address, npwp: c.npwp, paymentDays: c.paymentDays, note: c.note },
      d,
    )
    if (!beda.berubah.length) return 0
    await tx.customer.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pelanggan.ubah', docType: 'customer', docId: id, summary: `Mengubah ${label(beda.berubah)} pelanggan ${d.name}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

export async function ubahStatusPelanggan(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Pelanggan tidak ditemukan.')
    if (c.active === aktif) return
    await tx.customer.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'pelanggan.aktifkan' : 'pelanggan.nonaktifkan',
      docType: 'customer',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} pelanggan ${c.name}`,
      before: { active: c.active },
      after: { active: aktif },
    })
  })
}

export const BATAS_HARGA_PELANGGAN = 300

export const skemaHargaPelanggan = z.object({
  item: skemaBarang,
  price: skemaUang({ label: 'Harga', max: 1_000_000_000n }),
})

// Tambah atau ganti harga khusus satu produk dan satuan. Harga yang sama dengan sebelumnya tidak dicatat.
export async function simpanHargaPelanggan(db: Db, k: Konteks, aktor: Aktor, customerId: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaHargaPelanggan.parse(masukan)
  return db.$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id: customerId } })
    if (!c) throw new GalatAturan('Pelanggan tidak ditemukan.')
    const p = await produkJual(tx, d.item.productId)
    await faktorSatuan(tx, p.id, d.item.unitId)
    const u = await tx.unit.findUniqueOrThrow({ where: { id: d.item.unitId } })
    const kunci = { customerId_productId_unitId: { customerId, productId: p.id, unitId: u.id } }
    const lama = await tx.customerPrice.findUnique({ where: kunci })
    if (lama && lama.price === d.price) return 0
    if (!lama && (await tx.customerPrice.count({ where: { customerId } })) >= BATAS_HARGA_PELANGGAN) throw new GalatAturan(`Satu pelanggan paling banyak ${BATAS_HARGA_PELANGGAN} harga khusus.`)
    const h = lama
      ? await tx.customerPrice.update({ where: { id: lama.id }, data: { price: d.price, updatedBy: aktor.id } })
      : await tx.customerPrice.create({ data: { customerId, productId: p.id, unitId: u.id, price: d.price, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: lama ? 'pelanggan.harga_ubah' : 'pelanggan.harga_tambah',
      docType: 'customer',
      docId: customerId,
      summary: `${lama ? 'Mengubah' : 'Menambah'} harga khusus ${c.name}: ${p.name} per ${u.symbol} ${formatRupiah(d.price)}`,
      before: lama ? { priceId: lama.id, produk: p.code, satuan: u.symbol, price: lama.price } : undefined,
      after: { priceId: h.id, produk: p.code, satuan: u.symbol, price: d.price },
    })
    return 1
  })
}

export async function hapusHargaPelanggan(db: Db, k: Konteks, aktor: Aktor, customerId: number, priceId: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const h = await tx.customerPrice.findFirst({ where: { id: priceId, customerId }, include: { product: true, unit: true, customer: true } })
    if (!h) throw new GalatAturan('Harga khusus tidak ditemukan.')
    await tx.customerPrice.delete({ where: { id: h.id } })
    await catatAudit(tx, k, {
      action: 'pelanggan.harga_hapus',
      docType: 'customer',
      docId: customerId,
      summary: `Menghapus harga khusus ${h.customer.name}: ${h.product.name} per ${h.unit.symbol}`,
      before: { priceId: h.id, produk: h.product.code, satuan: h.unit.symbol, price: h.price },
    })
  })
}

export const hargaPelanggan = (db: DbAtauTx, customerId: number) =>
  db.customerPrice.findMany({ where: { customerId }, include: { product: true, unit: true }, orderBy: [{ product: { name: 'asc' } }, { unitId: 'asc' }] })

export type SaringPelanggan = { q?: string; status?: string; hal?: string }

export async function daftarPelanggan(db: Db, s: SaringPelanggan) {
  const q = s.q?.trim().slice(0, 60)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q.toUpperCase() } }, { contact: { contains: q, mode: 'insensitive' as const } }] } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.customer.findMany({ where, include: { _count: { select: { customerPrices: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.customer.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
