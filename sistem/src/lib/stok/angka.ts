// Angka persediaan: qty satuan dasar 3 desimal, harga satuan 4 desimal, nilai rupiah bulat (KONTRAK 3.1 dan 12).
// Semua hitungan memakai Decimal supaya tidak ada galat pecahan biner. Tanpa impor Next.
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'

export const Desimal = Prisma.Decimal
export type Desimal = Prisma.Decimal
export type Angka = Prisma.Decimal | string | number

export const NOL = new Desimal(0)
export const QTY_MAKS = new Desimal('999999999999')

export const des = (x: Angka | bigint) => (x instanceof Desimal ? x : new Desimal(typeof x === 'bigint' ? x.toString() : x))

// Rupiah bulat, setengah dibulatkan menjauhi nol (simetris, jadi gerak balik menghasilkan angka yang sama).
export const keRupiah = (x: Desimal) => BigInt(x.toDecimalPlaces(0, Desimal.ROUND_HALF_UP).toFixed(0))
export const keHarga = (x: Desimal) => x.toDecimalPlaces(4, Desimal.ROUND_HALF_UP)

// Isian qty dari pengguna. Koma adalah desimal ("12,5"). Titik dibaca sebagai pemisah ribuan bila polanya ribuan
// ("1.250" = 1250) dan sebagai desimal bila tidak ("12.5" = 12,5). Hasil null bila bukan angka.
export function bacaAngka(teks: string): Desimal | null {
  let t = teks.trim().replace(/\s/g, '')
  if (!t) return null
  const minus = t.startsWith('-')
  if (minus) t = t.slice(1)
  if (t.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(t)) return null
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  } else if (!/^\d+(\.\d+)?$/.test(t)) {
    return null
  }
  const d = new Desimal(t)
  return minus ? d.neg() : d
}

type OpsiQty = { label: string; boleh0?: boolean; bolehMinus?: boolean }

// Skema zod untuk qty satuan dasar: paling banyak 3 desimal. Isian kosong menjadi null (skemaQty menolaknya).
export function skemaQtyOpsional({ label, boleh0 = false, bolehMinus = false }: OpsiQty) {
  return z
    .string()
    .optional()
    .transform((v, ctx): Desimal | null => {
      if (!(v ?? '').trim()) return null
      v = v ?? ''
      const d = bacaAngka(v)
      if (!d) {
        ctx.addIssue({ code: 'custom', message: `${label} harus berupa angka, misalnya 250 atau 12,5.` })
        return z.NEVER
      }
      if (d.decimalPlaces() > 3) {
        ctx.addIssue({ code: 'custom', message: `${label} paling banyak 3 angka di belakang koma.` })
        return z.NEVER
      }
      if (d.isNeg() && !bolehMinus) {
        ctx.addIssue({ code: 'custom', message: `${label} tidak boleh minus.` })
        return z.NEVER
      }
      if (d.isZero() && !boleh0) {
        ctx.addIssue({ code: 'custom', message: `${label} harus lebih dari 0.` })
        return z.NEVER
      }
      if (d.abs().gt(QTY_MAKS)) {
        ctx.addIssue({ code: 'custom', message: `${label} terlalu besar.` })
        return z.NEVER
      }
      return d
    })
}

export const skemaQty = (o: OpsiQty) =>
  skemaQtyOpsional(o).transform((v, ctx) => {
    if (v === null) {
      ctx.addIssue({ code: 'custom', message: `${o.label} wajib diisi.` })
      return z.NEVER
    }
    return v
  })

// Harga satuan per satuan dasar, paling banyak 4 desimal. Kosong menjadi null (artinya pakai harga rata-rata).
export function skemaHargaSatuan(label: string) {
  return z
    .string()
    .optional()
    .transform((v, ctx): Desimal | null => {
      const t = (v ?? '').trim().replace(/^rp\.?\s*/i, '')
      if (!t) return null
      const d = bacaAngka(t)
      if (!d || d.isNeg()) {
        ctx.addIssue({ code: 'custom', message: `${label} harus berupa angka, misalnya 320 atau 18,5.` })
        return z.NEVER
      }
      if (d.decimalPlaces() > 4) {
        ctx.addIssue({ code: 'custom', message: `${label} paling banyak 4 angka di belakang koma.` })
        return z.NEVER
      }
      if (d.gt(10_000_000)) {
        ctx.addIssue({ code: 'custom', message: `${label} paling besar Rp 10.000.000 per satuan.` })
        return z.NEVER
      }
      return d
    })
}

const fmt = (maks: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: maks, minimumFractionDigits: 0 })
const FMT_QTY = fmt(3)
const FMT_HARGA = fmt(2)

// Tampilan qty dan harga dengan gaya Indonesia (titik ribuan, koma desimal).
export const formatQty = (x: Angka | null | undefined) => (x === null || x === undefined ? '-' : FMT_QTY.format(Number(des(x).toFixed(3))))
export const formatHarga = (x: Angka) => `Rp ${FMT_HARGA.format(Number(des(x).toFixed(4)))}`
export const formatNilai = (n: bigint | number) => `${n < 0 ? '-' : ''}Rp ${Math.abs(Number(n)).toLocaleString('id-ID')}`
// Nilai isian untuk formulir (koma desimal, tanpa pemisah ribuan).
export const isianQty = (x: Angka | null | undefined) =>
  x === null || x === undefined
    ? ''
    : des(x)
        .toFixed(3)
        .replace(/\.?0+$/, '')
        .replace('.', ',')
export const isianHarga = (x: Angka | null | undefined) =>
  x === null || x === undefined
    ? ''
    : des(x)
        .toFixed(4)
        .replace(/\.?0+$/, '')
        .replace('.', ',')
