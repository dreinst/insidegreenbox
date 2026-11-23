// Realisasi lawan Anggaran (tahap 6B). Realisasi dibaca dari jurnal yang berlaku (journal_line), per akun dan per bulan:
// pendapatan = kredit - debit, HPP dan beban = debit - kredit, sehingga jurnal balik otomatis mengurangi realisasi.
// Anggaran yang dipakai adalah anggaran Disetujui yang berlaku untuk tahun itu, kecuali dipilih versi tertentu. Akun
// yang punya realisasi tetapi tidak dianggarkan tetap tampil dengan anggaran 0. Tanpa impor Next.
import type { AccountKind } from '@/generated/prisma/client'
import type { DbAtauTx } from '../db'
import { anggaranBerlaku, JENIS_ANGGARAN, NAMA_BULAN_PENDEK } from './anggaran'

export type BarisRealisasi = {
  accountId: number
  code: string
  name: string
  kind: AccountKind
  anggaran: bigint
  realisasi: bigint
  selisih: bigint
  persen: number | null
  bulan: { anggaran: bigint; realisasi: bigint }[]
}

// Persen realisasi terhadap anggaran, satu angka di belakang koma; null bila anggaran 0.
export const persenRealisasi = (realisasi: bigint, anggaran: bigint) => (anggaran === 0n ? null : Math.round((Number(realisasi) / Number(anggaran)) * 1000) / 10)

export async function realisasiAnggaran(db: DbAtauTx, tahun: number, opsi: { bulan?: number | null; anggaranId?: number | null } = {}) {
  const pilihan = opsi.anggaranId ? await db.budget.findFirst({ where: { id: opsi.anggaranId, year: tahun, status: { in: ['Disetujui'] } } }) : null
  const anggaran = pilihan ?? (await anggaranBerlaku(db, tahun))
  const dari = new Date(Date.UTC(tahun, 0, 1))
  const sampai = new Date(Date.UTC(tahun, 11, 31))
  const [garis, nyata] = await Promise.all([
    anggaran ? db.budgetLine.findMany({ where: { budgetId: anggaran.id }, select: { accountId: true, month: true, amount: true } }) : Promise.resolve([]),
    db.$queryRaw<{ account_id: number; bulan: number; debit: bigint; kredit: bigint }[]>`
      SELECT l.account_id, EXTRACT(MONTH FROM j.date)::int AS bulan, SUM(l.debit)::bigint AS debit, SUM(l.credit)::bigint AS kredit
      FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id
      WHERE j.posted_at IS NOT NULL AND j.date BETWEEN ${dari}::date AND ${sampai}::date AND a.kind::text IN ('Pendapatan', 'HPP', 'Beban')
      GROUP BY 1, 2`,
  ])
  const ids = [...new Set([...garis.map((g) => g.accountId), ...nyata.map((n) => n.account_id)])]
  const akun = await db.account.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, kind: true } })
  const peta = new Map<number, BarisRealisasi>()
  for (const a of akun) {
    if (!JENIS_ANGGARAN.includes(a.kind)) continue
    peta.set(a.id, { accountId: a.id, code: a.code, name: a.name, kind: a.kind, anggaran: 0n, realisasi: 0n, selisih: 0n, persen: null, bulan: Array.from({ length: 12 }, () => ({ anggaran: 0n, realisasi: 0n })) })
  }
  for (const g of garis) {
    const b = peta.get(g.accountId)
    if (b) b.bulan[g.month - 1].anggaran += g.amount
  }
  for (const n of nyata) {
    const b = peta.get(n.account_id)
    if (!b) continue
    const v = b.kind === 'Pendapatan' ? BigInt(n.kredit) - BigInt(n.debit) : BigInt(n.debit) - BigInt(n.kredit)
    b.bulan[n.bulan - 1].realisasi += v
  }
  const bulan = opsi.bulan && opsi.bulan >= 1 && opsi.bulan <= 12 ? opsi.bulan : null
  const baris = [...peta.values()]
    .map((b) => {
      const isi = bulan ? [b.bulan[bulan - 1]] : b.bulan
      const ang = isi.reduce((n, x) => n + x.anggaran, 0n)
      const real = isi.reduce((n, x) => n + x.realisasi, 0n)
      return { ...b, anggaran: ang, realisasi: real, selisih: real - ang, persen: persenRealisasi(real, ang) }
    })
    .filter((b) => b.anggaran !== 0n || b.realisasi !== 0n)
    .sort((x, y) => x.code.localeCompare(y.code, 'id', { numeric: true }))
  const kelompok = (pilih: (k: AccountKind) => boolean) => {
    const ang = baris.filter((b) => pilih(b.kind)).reduce((n, b) => n + b.anggaran, 0n)
    const real = baris.filter((b) => pilih(b.kind)).reduce((n, b) => n + b.realisasi, 0n)
    return { anggaran: ang, realisasi: real, selisih: real - ang, persen: persenRealisasi(real, ang) }
  }
  // Ringkasan per bulan: pendapatan dan biaya (HPP ditambah beban).
  const semua = [...peta.values()]
  const perBulan = NAMA_BULAN_PENDEK.map((nama, i) => {
    const jumlah = (pilih: (k: AccountKind) => boolean, f: 'anggaran' | 'realisasi') => semua.filter((b) => pilih(b.kind)).reduce((n, b) => n + b.bulan[i][f], 0n)
    const pa = jumlah((k) => k === 'Pendapatan', 'anggaran')
    const pr = jumlah((k) => k === 'Pendapatan', 'realisasi')
    const ba = jumlah((k) => k !== 'Pendapatan', 'anggaran')
    const br = jumlah((k) => k !== 'Pendapatan', 'realisasi')
    return { bulan: i + 1, nama, pendapatan: { anggaran: pa, realisasi: pr, persen: persenRealisasi(pr, pa) }, biaya: { anggaran: ba, realisasi: br, persen: persenRealisasi(br, ba) } }
  })
  return {
    anggaran,
    tahun,
    bulan,
    baris,
    perBulan,
    pendapatan: kelompok((k) => k === 'Pendapatan'),
    biaya: kelompok((k) => k !== 'Pendapatan'),
  }
}

const sel = (v: string | number | bigint | null) => {
  let t = v === null ? '' : String(v)
  if (/^[=+\-@]/.test(t) && typeof v === 'string') t = `'${t}`
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

// CSV per akun per bulan (gaya sama dengan CSV laporan: BOM UTF-8, koma, angka tanpa format). Dengan saringan bulan,
// hanya bulan itu.
export function csvRealisasi(h: Awaited<ReturnType<typeof realisasiAnggaran>>) {
  const kepala = ['Tahun', 'Bulan', 'Kode akun', 'Akun', 'Jenis', 'Anggaran', 'Realisasi', 'Selisih', 'Persen realisasi']
  const isi: (string | number | bigint | null)[][] = []
  for (const b of h.baris) {
    for (let m = 1; m <= 12; m++) {
      if (h.bulan && m !== h.bulan) continue
      const x = b.bulan[m - 1]
      if (x.anggaran === 0n && x.realisasi === 0n) continue
      isi.push([h.tahun, m, b.code, b.name, b.kind, x.anggaran, x.realisasi, x.realisasi - x.anggaran, persenRealisasi(x.realisasi, x.anggaran)])
    }
  }
  return '﻿' + [kepala, ...isi].map((r) => r.map(sel).join(',')).join('\r\n') + '\r\n'
}
