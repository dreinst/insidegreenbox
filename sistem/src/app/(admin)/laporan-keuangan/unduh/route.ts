// Unduh CSV laporan keuangan dan buku besar dengan saringan yang sama dengan halamannya. Izin sama dengan halaman:
// Lihat laporan.keuangan untuk Neraca Saldo, Laba Rugi, Neraca; Lihat akun.buku_besar untuk Buku Besar.
import type { NextRequest } from 'next/server'
import { bukuBesar, labaRugi, neraca, neracaSaldo } from '@/lib/akuntansi/laporan'
import { tabelBukuBesar, tabelKeuangan, tabelNeracaSaldo } from '@/lib/akuntansi/laporan-kolom'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { keCsv } from '@/lib/laporan-kolom'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const jenis = q.get('jenis') ?? ''
  const s = Object.fromEntries([...q.entries()].map(([k, v]) => [k, v.slice(0, 40)]))
  let isi: string
  let nama: string
  if (jenis === 'buku-besar') {
    await wajibIzin('akun.buku_besar', 'L')
    const d = await bukuBesar(db, s, { semua: true })
    if (!d.akun) return new Response('Pilih akun dulu.', { status: 400 })
    isi = keCsv(tabelBukuBesar(d))
    nama = `buku-besar-${d.akun.code}_${d.rentang.dari}_${d.rentang.sampai}`
  } else {
    await wajibIzin('laporan.keuangan', 'L')
    if (jenis === 'neraca-saldo') {
      const d = await neracaSaldo(db, s)
      isi = keCsv(tabelNeracaSaldo(d))
      nama = `neraca-saldo_${d.rentang.dari}_${d.rentang.sampai}`
    } else if (jenis === 'laba-rugi') {
      const d = await labaRugi(db, s)
      isi = keCsv(tabelKeuangan(d, true))
      nama = `laba-rugi_${d.rentang.dari}_${d.rentang.sampai}`
    } else if (jenis === 'neraca') {
      const d = await neraca(db, s)
      isi = keCsv(tabelKeuangan(d, false))
      nama = `neraca_${d.per}`
    } else return new Response('Jenis laporan tidak dikenal.', { status: 404 })
  }
  return new Response(isi, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nama}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
