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
  // tahap 5A
  pos_settlement: 'Setoran POS',
  bank_account: 'Rekening bank',
}
