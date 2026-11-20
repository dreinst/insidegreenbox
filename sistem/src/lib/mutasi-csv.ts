// Pengurai CSV mutasi rekening (tahap 5C, RANCANGAN 7 dan 11.2 butir 10). Bank yang dipakai belum diputuskan, jadi
// pemetaan kolomnya bisa diatur: tanggal, keterangan, referensi, debit dan kredit (terpisah, satu kolom jumlah dengan
// tanda DB/CR, atau jumlah bertanda), dan saldo. Ada contoh siap pakai untuk KlikBCA dan format umum. Baris yang
// tanggalnya tidak terbaca (judul, PEND, saldo awal dan akhir di kaki berkas) dilewati dan dihitung. Murni, tanpa
// basis data dan tanpa impor Next.
import { createHash } from 'node:crypto'
import { z } from 'zod'

export type PemetaanCsv = {
  pemisah: 'auto' | ',' | ';' | 'tab'
  lewati: number
  kolTanggal: number
  formatTanggal: 'otomatis' | 'DMY' | 'YMD' | 'MDY' | 'DM'
  tahun: number | null
  kolKet: number
  kolRef: number | null
  mode: 'terpisah' | 'tanda' | 'bertanda'
  kolDebit: number | null
  kolKredit: number | null
  kolJumlah: number | null
  kolTanda: number | null
  kolSaldo: number | null
  angka: 'titik' | 'koma'
}

// Contoh format. KlikBCA (unduhan Mutasi Rekening, CSV): baris judul rekening di atas, lalu kolom Tanggal Transaksi
// ('DD/MM tanpa tahun, atau PEND), Keterangan, Cabang, Jumlah ("1,234,567.00"), DB atau CR, Saldo; kaki berisi Saldo
// Awal, Mutasi Kredit, Mutasi Debet, dan Saldo Akhir. Umum: baris pertama judul, lalu Tanggal, Keterangan, Referensi,
// Debit, Kredit, Saldo dengan angka gaya Indonesia (titik ribuan).
export const CONTOH_FORMAT: Record<'klikbca' | 'umum', { nama: string; pemetaan: PemetaanCsv; keterangan: string }> = {
  klikbca: {
    nama: 'KlikBCA (Mutasi Rekening)',
    keterangan: 'Kolom: Tanggal (DD/MM tanpa tahun), Keterangan, Cabang, Jumlah, DB/CR, Saldo. Tahun diisi sendiri. Baris PEND dan kaki saldo dilewati.',
    pemetaan: { pemisah: ',', lewati: 0, kolTanggal: 1, formatTanggal: 'DM', tahun: null, kolKet: 2, kolRef: null, mode: 'tanda', kolDebit: null, kolKredit: null, kolJumlah: 4, kolTanda: 5, kolSaldo: 6, angka: 'titik' },
  },
  umum: {
    nama: 'Umum (debit dan kredit terpisah)',
    keterangan: 'Baris pertama judul. Kolom: Tanggal (DD/MM/YYYY atau YYYY-MM-DD), Keterangan, Referensi, Debit, Kredit, Saldo. Angka gaya Indonesia (1.234.567).',
    pemetaan: { pemisah: 'auto', lewati: 1, kolTanggal: 1, formatTanggal: 'otomatis', tahun: null, kolKet: 2, kolRef: 3, mode: 'terpisah', kolDebit: 4, kolKredit: 5, kolJumlah: null, kolTanda: null, kolSaldo: 6, angka: 'koma' },
  },
}

const kol = (label: string, wajib: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim())
    .transform((v, ctx) => {
      if (!v) {
        if (wajib) ctx.addIssue({ code: 'custom', message: `${label} wajib diisi.` })
        return null
      }
      if (!/^\d{1,2}$/.test(v) || Number(v) < 1 || Number(v) > 40) {
        ctx.addIssue({ code: 'custom', message: `${label} berisi nomor kolom 1 sampai 40.` })
        return z.NEVER
      }
      return Number(v)
    })

// Isian formulir pemetaan (semua teks), menjadi PemetaanCsv.
export const skemaPemetaan = z
  .object({
    pemisah: z.enum(['auto', ',', ';', 'tab'], { message: 'Pilih pemisah kolom.' }),
    lewati: z
      .string()
      .optional()
      .transform((v) => (v ?? '').trim() || '0')
      .pipe(z.string().regex(/^\d{1,2}$/, 'Baris yang dilewati berisi angka 0 sampai 99.').transform(Number)),
    kolTanggal: kol('Kolom tanggal', true),
    formatTanggal: z.enum(['otomatis', 'DMY', 'YMD', 'MDY', 'DM'], { message: 'Pilih format tanggal.' }),
    tahun: z
      .string()
      .optional()
      .transform((v) => (v ?? '').trim())
      .transform((v, ctx) => {
        if (!v) return null
        if (!/^20\d{2}$/.test(v)) {
          ctx.addIssue({ code: 'custom', message: 'Tahun berisi empat angka, misalnya 2026.' })
          return z.NEVER
        }
        return Number(v)
      }),
    kolKet: kol('Kolom keterangan', true),
    kolRef: kol('Kolom referensi', false),
    mode: z.enum(['terpisah', 'tanda', 'bertanda'], { message: 'Pilih cara membaca nominal.' }),
    kolDebit: kol('Kolom debit', false),
    kolKredit: kol('Kolom kredit', false),
    kolJumlah: kol('Kolom jumlah', false),
    kolTanda: kol('Kolom tanda DB/CR', false),
    kolSaldo: kol('Kolom saldo', false),
    angka: z.enum(['titik', 'koma'], { message: 'Pilih format angka.' }),
  })
  .superRefine((p, ctx) => {
    if (p.mode === 'terpisah' && (!p.kolDebit || !p.kolKredit)) ctx.addIssue({ code: 'custom', path: ['kolDebit'], message: 'Isi kolom debit dan kolom kredit.' })
    if (p.mode === 'tanda' && (!p.kolJumlah || !p.kolTanda)) ctx.addIssue({ code: 'custom', path: ['kolJumlah'], message: 'Isi kolom jumlah dan kolom tanda DB/CR.' })
    if (p.mode === 'bertanda' && !p.kolJumlah) ctx.addIssue({ code: 'custom', path: ['kolJumlah'], message: 'Isi kolom jumlah.' })
    if (p.formatTanggal === 'DM' && !p.tahun) ctx.addIssue({ code: 'custom', path: ['tahun'], message: 'Format tanggal tanpa tahun butuh isian tahun.' })
  })
  // kolTanggal dan kolKet wajib (sudah ditolak di atas bila kosong).
  .transform((p): PemetaanCsv => ({ ...p, kolTanggal: p.kolTanggal ?? 1, kolKet: p.kolKet ?? 2 }))

// Pemecah CSV: tanda kutip ganda, kutip di dalam kutip ("" ), dan baris baru di dalam kutip.
export function pecahCsv(teks: string, pemisah: PemetaanCsv['pemisah']): string[][] {
  const isi = teks.replace(/^﻿/, '')
  const sep = pemisah === 'tab' ? '\t' : pemisah === 'auto' ? tebakPemisah(isi) : pemisah
  const baris: string[][] = []
  let sel = ''
  let deret: string[] = []
  let kutip = false
  for (let i = 0; i < isi.length; i++) {
    const c = isi[i]
    if (kutip) {
      if (c === '"' && isi[i + 1] === '"') {
        sel += '"'
        i++
      } else if (c === '"') kutip = false
      else sel += c
    } else if (c === '"') kutip = true
    else if (c === sep) {
      deret.push(sel)
      sel = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && isi[i + 1] === '\n') i++
      deret.push(sel)
      baris.push(deret)
      deret = []
      sel = ''
    } else sel += c
  }
  if (sel || deret.length) {
    deret.push(sel)
    baris.push(deret)
  }
  return baris
}

function tebakPemisah(teks: string): ',' | ';' | '\t' {
  const awal = teks.split(/\r?\n/).slice(0, 20).join('\n')
  const n = (c: string) => awal.split(c).length
  return n('\t') > n(';') && n('\t') > n(',') ? '\t' : n(';') > n(',') ? ';' : ','
}

const bersih = (v: string | undefined) => (v ?? '').replace(/^'+/, '').trim()

// Angka rupiah dari teks bank. titik: 1,234,567.89 (desimal titik). koma: 1.234.567,89 (desimal koma). Sen dibulatkan.
export function bacaAngka(v: string | undefined, gaya: PemetaanCsv['angka']): bigint | null {
  let t = bersih(v).replace(/rp\.?/i, '').replace(/\s/g, '')
  if (!t) return null
  let minus = false
  if (/^\(.*\)$/.test(t)) {
    minus = true
    t = t.slice(1, -1)
  }
  if (t.startsWith('-')) {
    minus = !minus
    t = t.slice(1)
  }
  t = gaya === 'titik' ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const [bulat, pecahan = ''] = t.split('.')
  let n = BigInt(bulat)
  if (pecahan && Number(`0.${pecahan}`) >= 0.5) n += 1n
  return minus ? -n : n
}

// Tanggal UTC tengah malam, atau null bila sel bukan tanggal.
export function bacaTanggal(v: string | undefined, format: PemetaanCsv['formatTanggal'], tahun: number | null): Date | null {
  const t = bersih(v)
  let y: number, m: number, d: number
  let r: RegExpExecArray | null
  if ((format === 'otomatis' || format === 'YMD') && (r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((format === 'otomatis' || format === 'DMY') && (r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if (format === 'MDY' && (r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t))) [m, d, y] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if (format === 'DM' && tahun && (r = /^(\d{1,2})[-/.](\d{1,2})$/.exec(t))) [d, m, y] = [Number(r[1]), Number(r[2]), tahun]
  else return null
  const tgl = new Date(Date.UTC(y, m - 1, d))
  return tgl.getUTCFullYear() === y && tgl.getUTCMonth() === m - 1 && tgl.getUTCDate() === d ? tgl : null
}

export type BarisMutasi = { date: Date; description: string; ref: string; debit: bigint; credit: bigint; balance: bigint | null; dedupKey: string; nomorBaris: number }

// Mengurai berkas menjadi baris mutasi. debit = uang keluar dari rekening, kredit = uang masuk (sudut pandang rekening
// koran). Sidik dedupKey dari tanggal, keterangan, nominal, saldo, dan urutan kemunculan baris yang sama persis di
// berkas itu, sehingga mengimpor berkas yang sama dua kali tidak menambah baris.
export function uraiMutasi(teks: string, p: PemetaanCsv) {
  const semua = pecahCsv(teks, p.pemisah)
  const hasil: BarisMutasi[] = []
  const lewat: { nomorBaris: number; alasan: string }[] = []
  const muncul = new Map<string, number>()
  semua.forEach((sel, i) => {
    const nomorBaris = i + 1
    if (i < p.lewati) return
    if (sel.every((x) => !x.trim())) return
    const ambil = (k: number | null) => (k ? sel[k - 1] : undefined)
    const date = bacaTanggal(ambil(p.kolTanggal), p.formatTanggal, p.tahun)
    if (!date) {
      lewat.push({ nomorBaris, alasan: 'tanggal tidak terbaca' })
      return
    }
    let debit = 0n
    let credit = 0n
    if (p.mode === 'terpisah') {
      debit = bacaAngka(ambil(p.kolDebit), p.angka) ?? 0n
      credit = bacaAngka(ambil(p.kolKredit), p.angka) ?? 0n
      if (debit < 0n) [debit, credit] = [0n, credit - debit]
      if (credit < 0n) [debit, credit] = [debit - credit, 0n]
    } else {
      const n = bacaAngka(ambil(p.kolJumlah), p.angka) ?? 0n
      const abs = n < 0n ? -n : n
      if (p.mode === 'tanda') {
        const tanda = bersih(ambil(p.kolTanda)).toUpperCase()
        if (/^(DB|D|DEBIT|DEBET|DR)$/.test(tanda)) debit = abs
        else if (/^(CR|K|C|KREDIT|CREDIT)$/.test(tanda)) credit = abs
        else {
          lewat.push({ nomorBaris, alasan: 'tanda DB/CR tidak terbaca' })
          return
        }
      } else if (n < 0n) debit = abs
      else credit = abs
    }
    if (debit === 0n && credit === 0n) {
      lewat.push({ nomorBaris, alasan: 'nominal kosong' })
      return
    }
    if (debit > 0n && credit > 0n) {
      lewat.push({ nomorBaris, alasan: 'debit dan kredit terisi bersamaan' })
      return
    }
    const description = bersih(ambil(p.kolKet)).replace(/\s+/g, ' ').slice(0, 300)
    const ref = bersih(ambil(p.kolRef)).slice(0, 60)
    const balance = bacaAngka(ambil(p.kolSaldo), p.angka)
    const isi = [date.toISOString().slice(0, 10), description.toUpperCase(), ref.toUpperCase(), debit, credit, balance ?? ''].join('|')
    const ke = (muncul.get(isi) ?? 0) + 1
    muncul.set(isi, ke)
    const dedupKey = createHash('sha256').update(`${isi}|${ke}`).digest('hex').slice(0, 40)
    hasil.push({ date, description: description || '(tanpa keterangan)', ref, debit, credit, balance, dedupKey, nomorBaris })
  })
  return { baris: hasil, lewat, jumlahBaris: semua.length }
}

// Isian formulir dari pemetaan (untuk nilai awal formulir impor).
export const isianPemetaan = (p: PemetaanCsv): Record<string, string> =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === null ? '' : String(v)]))
