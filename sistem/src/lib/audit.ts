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
}

export const NAMA_ENTITAS: Record<string, string> = {
  app_user: 'Pengguna',
  role: 'Peran',
  role_permission: 'Izin peran',
  role_feature_switch: 'Saklar peran',
  user_session: 'Sesi',
}
