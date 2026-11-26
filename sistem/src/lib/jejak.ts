// Membaca jejak audit (hanya baca). Lingkup ditentukan izin: tanpa saklar log.lihat_semua hanya aktivitas sendiri.
import type { Prisma } from '@/generated/prisma/client'
import type { Db } from './db'
import { saklarNyala, type Pengguna } from './izin-inti'
import { akhirHari, awalHari } from './waktu'

export const PER_HALAMAN_AUDIT = 50

export type SaringAudit = { dari?: string; sampai?: string; aktor?: string; aksi?: string; entitas?: string; dok?: string; hal?: string }

const tanggalSah = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined)

export const lihatSemua = (p: Pick<Pengguna, 'saklar'>) => saklarNyala(p, 'log.lihat_semua')

export function syaratAudit(p: Pick<Pengguna, 'id' | 'saklar'>, s: SaringAudit): Prisma.AuditLogWhereInput {
  const dari = tanggalSah(s.dari)
  const sampai = tanggalSah(s.sampai)
  const w: Prisma.AuditLogWhereInput = {}
  if (dari || sampai) w.at = { ...(dari ? { gte: awalHari(dari) } : {}), ...(sampai ? { lte: akhirHari(sampai) } : {}) }
  if (s.aksi) w.action = s.aksi.slice(0, 60)
  if (s.entitas) w.docType = s.entitas.slice(0, 60)
  if (s.dok) w.docId = s.dok.slice(0, 60)
  if (!lihatSemua(p)) w.userId = p.id
  else if (s.aktor === '0') w.userId = null
  else if (Number(s.aktor) > 0) w.userId = Number(s.aktor)
  return w
}

export async function cariAudit(db: Db, p: Pick<Pengguna, 'id' | 'saklar'>, s: SaringAudit) {
  const hal = Math.max(1, Math.min(10000, Number(s.hal) || 1))
  const where = syaratAudit(p, s)
  const [baris, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (hal - 1) * PER_HALAMAN_AUDIT, take: PER_HALAMAN_AUDIT, include: { user: { select: { name: true, username: true } } } }),
    db.auditLog.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN_AUDIT)) }
}

export async function ambilAudit(db: Db, p: Pick<Pengguna, 'id' | 'saklar'>, id: number) {
  const a = await db.auditLog.findUnique({ where: { id }, include: { user: { select: { name: true, username: true, role: { select: { name: true } } } } } })
  if (!a) return null
  if (!lihatSemua(p) && a.userId !== p.id) return null
  return a
}

// Baris kolom untuk tampilan sebelum dan sesudah. Nilai bersarang ditampilkan sebagai JSON.
export function barisSelisih(sebelum: unknown, sesudah: unknown) {
  const a = (sebelum && typeof sebelum === 'object' ? sebelum : {}) as Record<string, unknown>
  const b = (sesudah && typeof sesudah === 'object' ? sesudah : {}) as Record<string, unknown>
  const teks = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((kunci) => ({
    kunci,
    sebelum: teks(a[kunci]),
    sesudah: teks(b[kunci]),
    beda: teks(a[kunci]) !== teks(b[kunci]),
  }))
}
