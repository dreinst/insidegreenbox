// Jejak audit (KONTRAK bagian 5). catatAudit wajib dipanggil dengan klien transaksi yang sama dengan perubahannya.
import type { Prisma } from '@/generated/prisma/client'
import type { DbAtauTx } from './db'

export type Konteks = {
  userId: number | null
  actorName: string
  ip: string
  userAgent: string
}

export type EntriAudit = {
  action: string
  docType?: string
  docId?: string | number
  summary: string
  before?: unknown
  after?: unknown
}

const RAHASIA = new Set(['passwordHash', 'pinHash', 'password_hash', 'pin_hash', 'password', 'sandi'])

// Mengubah nilai menjadi JSON yang aman disimpan: hash sandi dan PIN diganti tanda, BigInt, Decimal,
// dan tanggal menjadi teks.
export function bersihkanUntukAudit(nilai: unknown): Prisma.InputJsonValue | null {
  if (nilai === undefined || nilai === null) return null
  if (typeof nilai === 'bigint') return nilai.toString()
  if (nilai instanceof Date) return nilai.toISOString()
  if (typeof nilai === 'object' && nilai !== null && 'toFixed' in nilai && typeof (nilai as { toFixed: unknown }).toFixed === 'function' && !(nilai instanceof Number)) {
    return String(nilai)
  }
  if (Array.isArray(nilai)) return nilai.map((v) => bersihkanUntukAudit(v)) as Prisma.InputJsonValue
  if (typeof nilai === 'object') {
    const hasil: Record<string, Prisma.InputJsonValue | null> = {}
    for (const [k, v] of Object.entries(nilai as Record<string, unknown>)) {
      hasil[k] = RAHASIA.has(k) ? '[disembunyikan]' : bersihkanUntukAudit(v)
    }
    return hasil as Prisma.InputJsonValue
  }
  if (typeof nilai === 'string' || typeof nilai === 'number' || typeof nilai === 'boolean') return nilai
  return String(nilai)
}

export async function catatAudit(tx: DbAtauTx, k: Konteks, e: EntriAudit) {
  const before = bersihkanUntukAudit(e.before)
  const after = bersihkanUntukAudit(e.after)
  await tx.auditLog.create({
    data: {
      userId: k.userId,
      actorName: k.actorName.slice(0, 100),
      action: e.action,
      docType: e.docType ?? null,
      docId: e.docId === undefined ? null : String(e.docId),
      summary: e.summary.slice(0, 500),
      beforeJson: before ?? undefined,
      afterJson: after ?? undefined,
      ip: k.ip.slice(0, 100),
      userAgent: k.userAgent.slice(0, 300),
    },
  })
}

// Kolom yang berubah antara dua objek datar, untuk ringkasan dan isi before/after yang ringkas.
export function selisih<T extends Record<string, unknown>>(sebelum: T, sesudah: Partial<T>) {
  const a: Record<string, unknown> = {}
  const b: Record<string, unknown> = {}
  for (const kunci of Object.keys(sesudah)) {
    const x = sebelum[kunci]
    const y = sesudah[kunci]
    if (JSON.stringify(bersihkanUntukAudit(x)) !== JSON.stringify(bersihkanUntukAudit(y))) {
      a[kunci] = x
      b[kunci] = y
    }
  }
  return { sebelum: a, sesudah: b, berubah: Object.keys(b) }
}

// Daftar peristiwa dan entitas untuk saringan Jejak Audit.
export const NAMA_PERISTIWA: Record<string, string> = {
  'masuk.berhasil': 'Masuk berhasil',
  'masuk.gagal': 'Masuk gagal',
  'masuk.terkunci': 'Masuk terkunci',
  keluar: 'Keluar',
  'izin.ditolak': 'Akses ditolak',
  'pengguna.tambah': 'Tambah pengguna',
  'pengguna.ubah': 'Ubah pengguna',
  'pengguna.sandi': 'Atur ulang sandi',
  'pengguna.aktifkan': 'Aktifkan pengguna',
  'pengguna.nonaktifkan': 'Nonaktifkan pengguna',
  'peran.tambah': 'Tambah peran',
  'peran.ubah': 'Ubah peran',
  'peran.izin': 'Ubah izin peran',
  'peran.aktifkan': 'Aktifkan peran',
  'peran.nonaktifkan': 'Nonaktifkan peran',
  'saklar.ubah': 'Ubah saklar fitur',
  // tahap 3A
  'kategori.tambah': 'Tambah kategori menu',
  'kategori.ubah': 'Ubah kategori menu',
  'kategori.aktifkan': 'Aktifkan kategori menu',
  'kategori.nonaktifkan': 'Nonaktifkan kategori menu',
  'menu.tambah': 'Tambah menu',
  'menu.ubah': 'Ubah menu',
  'menu.aktifkan': 'Aktifkan menu',
  'menu.nonaktifkan': 'Nonaktifkan menu',
  'harga.massal': 'Ubah harga massal',
  'paket.tambah': 'Tambah paket set',
  'paket.ubah': 'Ubah paket set',
  'paket.aktifkan': 'Aktifkan paket set',
  'paket.nonaktifkan': 'Nonaktifkan paket set',
  'promo.tambah': 'Tambah promo',
  'promo.ubah': 'Ubah promo',
  'promo.aktifkan': 'Aktifkan promo',
  'promo.nonaktifkan': 'Nonaktifkan promo',
  'metode_bayar.tambah': 'Tambah metode bayar',
  'metode_bayar.ubah': 'Ubah metode bayar',
  'metode_bayar.aktifkan': 'Aktifkan metode bayar',
  'metode_bayar.nonaktifkan': 'Nonaktifkan metode bayar',
  'tingkat.tambah': 'Tambah tingkat member',
  'tingkat.ubah': 'Ubah tingkat member',
  'tingkat.aktifkan': 'Aktifkan tingkat member',
  'tingkat.nonaktifkan': 'Nonaktifkan tingkat member',
  'member.tambah': 'Tambah member',
  'member.ubah': 'Ubah member',
  'member.aktifkan': 'Aktifkan member',
  'member.nonaktifkan': 'Nonaktifkan member',
  'impor.menu': 'Impor data menu',
  // tahap 3B
  'kasir.masuk_pin': 'Masuk dengan PIN',
  'pengguna.pin': 'Atur PIN',
  'shift.buka': 'Buka shift',
  'shift.kas': 'Kas laci',
  'shift.tutup': 'Tutup shift',
  'shift.setujui': 'Setujui selisih shift',
  'penjualan.simpan': 'Simpan penjualan',
  'penjualan.void': 'Void penjualan',
  // tahap 4A
  'produk.tambah': 'Tambah produk',
  'produk.ubah': 'Ubah produk',
  'produk.aktifkan': 'Aktifkan produk',
  'produk.nonaktifkan': 'Nonaktifkan produk',
  'produk.satuan_tambah': 'Tambah konversi satuan',
  'produk.satuan_ubah': 'Ubah konversi satuan',
  'produk.satuan_hapus': 'Hapus konversi satuan',
  'kategori_produk.tambah': 'Tambah kategori produk',
  'kategori_produk.ubah': 'Ubah kategori produk',
  'kategori_produk.aktifkan': 'Aktifkan kategori produk',
  'kategori_produk.nonaktifkan': 'Nonaktifkan kategori produk',
  'satuan.tambah': 'Tambah satuan',
  'satuan.ubah': 'Ubah satuan',
  'satuan.aktifkan': 'Aktifkan satuan',
  'satuan.nonaktifkan': 'Nonaktifkan satuan',
  'lokasi.tambah': 'Tambah lokasi',
  'lokasi.ubah': 'Ubah lokasi',
  'lokasi.aktifkan': 'Aktifkan lokasi',
  'lokasi.nonaktifkan': 'Nonaktifkan lokasi',
  'alasan.tambah': 'Tambah alasan penyesuaian',
  'alasan.ubah': 'Ubah alasan penyesuaian',
  'alasan.aktifkan': 'Aktifkan alasan penyesuaian',
  'alasan.nonaktifkan': 'Nonaktifkan alasan penyesuaian',
  'penyesuaian.tambah': 'Buat penyesuaian stok',
  'penyesuaian.ubah': 'Ubah kepala penyesuaian stok',
  'penyesuaian.baris_tambah': 'Tambah baris penyesuaian stok',
  'penyesuaian.baris_hapus': 'Hapus baris penyesuaian stok',
  'penyesuaian.hapus': 'Hapus draf penyesuaian stok',
  'penyesuaian.ajukan': 'Ajukan penyesuaian stok',
  'penyesuaian.kembalikan': 'Kembalikan penyesuaian stok ke draf',
  'penyesuaian.posting': 'Posting penyesuaian stok',
  'penyesuaian.batal': 'Batalkan penyesuaian stok',
  'opname.tambah': 'Buat stock opname',
  'opname.ubah': 'Ubah kepala stock opname',
  'opname.hitung': 'Simpan hitungan opname',
  'opname.hapus': 'Hapus draf stock opname',
  'opname.ajukan': 'Ajukan stock opname',
  'opname.kembalikan': 'Kembalikan stock opname ke draf',
  'opname.posting': 'Posting stock opname',
  'opname.batal': 'Batalkan stock opname',
  'pindah.tambah': 'Buat pindah stok',
  'pindah.ubah': 'Ubah kepala pindah stok',
  'pindah.baris_tambah': 'Tambah baris pindah stok',
  'pindah.baris_hapus': 'Hapus baris pindah stok',
  'pindah.hapus': 'Hapus draf pindah stok',
  'pindah.ajukan': 'Ajukan pindah stok',
  'pindah.kembalikan': 'Kembalikan pindah stok ke draf',
  'pindah.posting': 'Posting pindah stok',
  'pindah.batal': 'Batalkan pindah stok',
  'impor.stok': 'Impor bahan dan saldo awal',
  // tahap 5A
  'setoran.tambah': 'Buat setoran',
  'setoran.ubah': 'Ubah setoran',
  'setoran.ajukan': 'Ajukan setoran',
  'setoran.kembalikan': 'Kembalikan setoran ke draf',
  'setoran.setujui': 'Setujui setoran',
  'setoran.posting': 'Posting setoran',
  'setoran.batal': 'Batalkan setoran',
  'setoran.hapus': 'Hapus draf setoran',
  'rekening.tambah': 'Tambah rekening bank',
  'rekening.ubah': 'Ubah rekening bank',
  'rekening.aktifkan': 'Aktifkan rekening bank',
  'rekening.nonaktifkan': 'Nonaktifkan rekening bank',
  // tahap 4C
  'pemasok.tambah': 'Tambah pemasok',
  'pemasok.ubah': 'Ubah pemasok',
  'pemasok.aktifkan': 'Aktifkan pemasok',
  'pemasok.nonaktifkan': 'Nonaktifkan pemasok',
  'permintaan.tambah': 'Buat permintaan pembelian',
  'permintaan.ubah': 'Ubah kepala permintaan pembelian',
  'permintaan.baris_tambah': 'Tambah baris permintaan pembelian',
  'permintaan.baris_hapus': 'Hapus baris permintaan pembelian',
  'permintaan.hapus': 'Hapus draf permintaan pembelian',
  'permintaan.ajukan': 'Ajukan permintaan pembelian',
  'permintaan.kembalikan': 'Kembalikan permintaan pembelian ke draf',
  'permintaan.setujui': 'Setujui permintaan pembelian',
  'permintaan.tutup': 'Tutup sisa permintaan pembelian',
  'permintaan.batal': 'Batalkan permintaan pembelian',
  'pesanan.tambah': 'Buat pesanan pembelian',
  'pesanan.ubah': 'Ubah kepala pesanan pembelian',
  'pesanan.baris_tambah': 'Tambah baris pesanan pembelian',
  'pesanan.baris_ubah': 'Ubah baris pesanan pembelian',
  'pesanan.baris_hapus': 'Hapus baris pesanan pembelian',
  'pesanan.hapus': 'Hapus draf pesanan pembelian',
  'pesanan.ajukan': 'Ajukan pesanan pembelian',
  'pesanan.kembalikan': 'Kembalikan pesanan pembelian ke draf',
  'pesanan.setujui': 'Setujui pesanan pembelian',
  'pesanan.tutup': 'Tutup sisa pesanan pembelian',
  'pesanan.batal': 'Batalkan pesanan pembelian',
  'penerimaan.tambah': 'Buat penerimaan barang',
  'penerimaan.ubah': 'Ubah kepala penerimaan barang',
  'penerimaan.baris_ubah': 'Ubah baris penerimaan barang',
  'penerimaan.hapus': 'Hapus draf penerimaan barang',
  'penerimaan.ajukan': 'Ajukan penerimaan barang',
  'penerimaan.kembalikan': 'Kembalikan penerimaan barang ke draf',
  'penerimaan.posting': 'Posting penerimaan barang',
  'penerimaan.batal': 'Batalkan penerimaan barang',
  'faktur.tambah': 'Buat faktur pembelian',
  'faktur.ubah': 'Ubah kepala faktur pembelian',
  'faktur.baris_tambah': 'Tambah baris faktur pembelian',
  'faktur.baris_ubah': 'Ubah baris faktur pembelian',
  'faktur.baris_hapus': 'Hapus baris faktur pembelian',
  'faktur.hapus': 'Hapus draf faktur pembelian',
  'faktur.ajukan': 'Ajukan faktur pembelian',
  'faktur.kembalikan': 'Kembalikan faktur pembelian ke draf',
  'faktur.posting': 'Posting faktur pembelian',
  'faktur.batal': 'Batalkan faktur pembelian',
  'retur_beli.tambah': 'Buat retur pembelian',
  'retur_beli.ubah': 'Ubah kepala retur pembelian',
  'retur_beli.baris_ubah': 'Ubah baris retur pembelian',
  'retur_beli.hapus': 'Hapus draf retur pembelian',
  'retur_beli.ajukan': 'Ajukan retur pembelian',
  'retur_beli.kembalikan': 'Kembalikan retur pembelian ke draf',
  'retur_beli.posting': 'Posting retur pembelian',
  'retur_beli.batal': 'Batalkan retur pembelian',
  'beli_langsung.tambah': 'Buat pembelian langsung',
  'beli_langsung.ubah': 'Ubah kepala pembelian langsung',
  'beli_langsung.baris_tambah': 'Tambah baris pembelian langsung',
  'beli_langsung.baris_hapus': 'Hapus baris pembelian langsung',
  'beli_langsung.hapus': 'Hapus draf pembelian langsung',
  'beli_langsung.ajukan': 'Ajukan pembelian langsung',
  'beli_langsung.kembalikan': 'Kembalikan pembelian langsung ke draf',
  'beli_langsung.posting': 'Posting pembelian langsung',
  'beli_langsung.batal': 'Batalkan pembelian langsung',
  'pembayaran.tambah': 'Buat pembayaran pembelian',
  'pembayaran.ubah': 'Ubah kepala pembayaran pembelian',
  'pembayaran.alokasi': 'Isi alokasi pembayaran pembelian',
  'pembayaran.hapus': 'Hapus draf pembayaran pembelian',
  'pembayaran.ajukan': 'Ajukan pembayaran pembelian',
  'pembayaran.kembalikan': 'Kembalikan pembayaran pembelian ke draf',
  'pembayaran.setujui': 'Setujui pembayaran pembelian',
  'pembayaran.posting': 'Posting pembayaran pembelian',
  'pembayaran.batal': 'Batalkan pembayaran pembelian',
  'impor.beli': 'Impor pesanan pembelian lama',
}

export const NAMA_ENTITAS: Record<string, string> = {
  app_user: 'Pengguna',
  role: 'Peran',
  role_permission: 'Izin peran',
  role_feature_switch: 'Saklar peran',
  user_session: 'Sesi',
  // tahap 3A
  menu_category: 'Kategori menu',
  menu_item: 'Menu',
  menu_price_batch: 'Perubahan harga',
  menu_set: 'Paket set',
  promo: 'Promo',
  payment_method: 'Metode bayar',
  member_tier: 'Tingkat member',
  member: 'Member',
  // tahap 3B
  shift: 'Shift kasir',
  sale: 'Penjualan',
  // tahap 4A
  product: 'Produk',
  product_unit: 'Konversi satuan',
  product_category: 'Kategori produk',
  unit: 'Satuan',
  location: 'Lokasi',
  stock_reason: 'Alasan penyesuaian',
  stock_adjustment: 'Penyesuaian stok',
  stock_opname: 'Stock opname',
  stock_transfer: 'Pindah stok',
  // tahap 5A
  pos_settlement: 'Setoran POS',
  bank_account: 'Rekening bank',
  // tahap 4C
  supplier: 'Pemasok',
  purchase_request: 'Permintaan pembelian',
  purchase_order: 'Pesanan pembelian',
  goods_receipt: 'Penerimaan barang',
  purchase_invoice: 'Faktur pembelian',
  purchase_return: 'Retur pembelian',
  direct_purchase: 'Pembelian langsung',
  purchase_payment: 'Pembayaran pembelian',
}
