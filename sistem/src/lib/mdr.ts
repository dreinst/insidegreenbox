// Tarif MDR per metode bayar dan MDR per transaksi (tahap 6C, KONTRAK 11 butir 123 dan 124). Tanpa Next.
// Tarif yang berlaku untuk satu penjualan adalah baris payment_method_mdr dengan effective_from paling akhir yang tidak
// sesudah tanggal WIB penjualan. MDR satu pembayaran = persen x seluruh nominal pembayaran bila nominal di atas batas
// bebas, dan 0 bila sama dengan atau di bawah batas. Tunai selalu 0, dan penjualan tanpa tarif juga 0.
import { Prisma } from '@/generated/prisma/client'
import type { DbAtauTx } from './db'

export type Tarif = { mdrPct: number; freeLimit: number | null }

// Persen disimpan dengan tiga angka di belakang koma, jadi hitungannya memakai bilangan bulat (persen x 1000) supaya
// hasilnya sama dengan ROUND di PostgreSQL, termasuk saat tepat setengah rupiah.
export function mdrTransaksi(nominal: number, tarif: Tarif | null, tunai = false) {
  if (tunai || !tarif || nominal <= 0) return 0
  if (tarif.freeLimit !== null && nominal <= tarif.freeLimit) return 0
  return Math.round((nominal * Math.round(tarif.mdrPct * 1000)) / 100000)
}

// Potongan SQL dengan alias p (sale_payment), s (sale), dan pm (payment_method). SQL_TARIF menambah alias tr berisi
// tarif yang berlaku pada tanggal WIB penjualan; SQL_MDR menghitung MDR satu baris pembayaran.
export const SQL_TARIF = Prisma.sql`LEFT JOIN LATERAL (
    SELECT t.mdr_pct, t.free_limit FROM payment_method_mdr t
    WHERE t.payment_method_id = p.payment_method_id AND t.effective_from <= (s.at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY t.effective_from DESC LIMIT 1
  ) tr ON true`
export const SQL_MDR = Prisma.sql`(CASE WHEN pm.kind = 'tunai' OR tr.mdr_pct IS NULL OR (tr.free_limit IS NOT NULL AND p.amount <= tr.free_limit) THEN 0 ELSE ROUND(p.amount * tr.mdr_pct / 100) END)`

// Nilai dan MDR per shift untuk satu metode non tunai, dari penjualan yang tidak void.
export async function mdrPerShift(db: DbAtauTx, metodeId: number, shiftIds: number[]) {
  const hasil = new Map<number, { nilai: number; mdr: number }>()
  if (!shiftIds.length) return hasil
  const baris = await db.$queryRaw<{ shift_id: number; nilai: bigint; mdr: bigint }[]>`
    SELECT s.shift_id, SUM(p.amount)::bigint AS nilai, SUM(${SQL_MDR})::bigint AS mdr
    FROM sale_payment p JOIN sale s ON s.id = p.sale_id JOIN payment_method pm ON pm.id = p.payment_method_id ${SQL_TARIF}
    WHERE p.payment_method_id = ${metodeId} AND s.status = 'Selesai' AND s.shift_id IN (${Prisma.join(shiftIds)})
    GROUP BY s.shift_id`
  for (const b of baris) hasil.set(Number(b.shift_id), { nilai: Number(b.nilai), mdr: Number(b.mdr) })
  return hasil
}

// Kolom date disimpan sebagai tengah malam UTC.
const keTanggal = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const keTarif = (t: { mdrPct: Prisma.Decimal; freeLimit: bigint | null }): Tarif => ({ mdrPct: Number(t.mdrPct), freeLimit: t.freeLimit === null ? null : Number(t.freeLimit) })

// Tarif yang berlaku pada tanggal WIB (YYYY-MM-DD) untuk satu metode, atau null bila belum ada.
export async function tarifPada(db: DbAtauTx, metodeId: number, iso: string) {
  const t = await db.paymentMethodMdr.findFirst({ where: { paymentMethodId: metodeId, effectiveFrom: { lte: keTanggal(iso) } }, orderBy: { effectiveFrom: 'desc' } })
  return t ? { ...t, tarif: keTarif(t) } : null
}

// Tarif yang berlaku pada tanggal itu untuk beberapa metode sekaligus (daftar Metode Bayar).
export async function tarifPadaBanyak(db: DbAtauTx, metodeIds: number[], iso: string) {
  const hasil = new Map<number, Tarif>()
  if (!metodeIds.length) return hasil
  const baris = await db.$queryRaw<{ payment_method_id: number; mdr_pct: Prisma.Decimal; free_limit: bigint | null }[]>`
    SELECT DISTINCT ON (payment_method_id) payment_method_id, mdr_pct, free_limit FROM payment_method_mdr
    WHERE payment_method_id IN (${Prisma.join(metodeIds)}) AND effective_from <= ${keTanggal(iso)}::date
    ORDER BY payment_method_id, effective_from DESC`
  for (const b of baris) hasil.set(Number(b.payment_method_id), keTarif({ mdrPct: b.mdr_pct, freeLimit: b.free_limit }))
  return hasil
}

export const persenTeks = (n: number) => `${String(n).replace('.', ',')}%`

// "0,3% di atas Rp 500.000 per transaksi" atau "1%". Tanpa tarif: "Belum diatur".
export function teksTarif(t: Tarif | null) {
  if (!t) return 'Belum diatur'
  if (t.freeLimit === null || t.mdrPct === 0) return persenTeks(t.mdrPct)
  return `${persenTeks(t.mdrPct)} di atas Rp ${t.freeLimit.toLocaleString('id-ID')} per transaksi`
}
