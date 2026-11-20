// Pembantu validasi untuk modul master tahap 3A (menu, promo, metode bayar, member). Tanpa impor Next.
import { z } from 'zod'

const POLA_RUPIAH = /^(\d{1,3}(\.\d{3})+|\d+)$/

// Rupiah bulat dari isian pengguna: "38000", "38.000", atau "Rp 38.000". Koma dan pecahan ditolak.
export function bacaRupiah(teks: string): bigint | null {
  const bersih = teks.replace(/^\s*rp\.?\s*/i, '').replace(/\s/g, '')
  return POLA_RUPIAH.test(bersih) ? BigInt(bersih.replace(/\./g, '')) : null
}

export const BATAS_HARGA = 10_000_000n

export const formatRupiah = (n: bigint | number) => `Rp ${Number(n).toLocaleString('id-ID')}`

type OpsiUang = { label: string; min?: bigint; max?: bigint; wajib?: boolean }

// Skema rupiah: hasilnya bigint. Isian kosong diterima (jadi 0n) hanya bila wajib false.
export function skemaUang({ label, min = 1n, max = BATAS_HARGA, wajib = true }: OpsiUang) {
  return z.string().transform((v, ctx) => {
    if (!v.trim()) {
      if (!wajib) return 0n
      ctx.addIssue({ code: 'custom', message: `${label} wajib diisi.` })
      return z.NEVER
    }
    const n = bacaRupiah(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `${label} harus berupa rupiah bulat, misalnya 38000 atau 38.000.` })
      return z.NEVER
    }
    if (n < min) {
      ctx.addIssue({ code: 'custom', message: min <= 1n ? `${label} harus lebih dari 0.` : `${label} minimal ${formatRupiah(min)}.` })
      return z.NEVER
    }
    if (n > max) {
      ctx.addIssue({ code: 'custom', message: `${label} paling besar ${formatRupiah(max)}.` })
      return z.NEVER
    }
    return n
  })
}

// Persen dengan paling banyak tiga angka di belakang koma, boleh ditulis dengan koma atau titik. Hasilnya teks bertitik.
export function skemaPersen(label: string, { min = 0, max = 100 }: { min?: number; max?: number } = {}) {
  return z.string().transform((v, ctx) => {
    const t = v.trim().replace(',', '.')
    if (!/^\d{1,3}(\.\d{1,3})?$/.test(t)) {
      ctx.addIssue({ code: 'custom', message: `${label} harus berupa angka, misalnya 7 atau 0,7.` })
      return z.NEVER
    }
    const n = Number(t)
    if (n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: `${label} harus antara ${min} dan ${max}.` })
      return z.NEVER
    }
    return t
  })
}

// Kotak centang: ada di FormData berarti dicentang.
export const skemaCentang = z
  .string()
  .optional()
  .transform((v) => v === 'on' || v === 'true')

// Tanggal YYYY-MM-DD yang nyata, kosong menjadi null. Hasilnya Date UTC tengah malam untuk kolom date.
export const skemaTanggal = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? '').trim()
      if (!t) return null
      const d = new Date(`${t}T00:00:00Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
        ctx.addIssue({ code: 'custom', message: `${label} bukan tanggal yang sah.` })
        return z.NEVER
      }
      return d
    })

export const skemaTeksOpsional = (label: string, maks: number) => z.string().trim().max(maks, `${label} paling panjang ${maks} huruf.`).default('')

export const sesuaiHalaman = (hal: string | undefined) => Math.max(1, Math.min(1000, Number(hal) || 1))

export const PER_HALAMAN = 50

// Kode dari nama: huruf kecil, angka, dan tanda hubung.
export const jadikanKode = (nama: string) =>
  nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export const pesanUnik = (e: unknown) => (e as { code?: string })?.code === 'P2002'
