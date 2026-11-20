// Unduh CSV laporan dengan saringan yang sama dengan halamannya. Izin sama dengan halaman: Lihat laporan.penjualan.
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { lihatVoid, rekapMenu, rekapPenjualan, ringkasanPembayaran, selisihKas, tutupHarian, type SaringLaporan } from '@/lib/laporan'
import { JENIS_LAPORAN, keCsv, tabelBayar, tabelHarian, tabelMenu, tabelRekap, tabelSelisih, type JenisLaporan } from '@/lib/laporan-kolom'

export async function GET(req: NextRequest) {
  const p = await wajibIzin('laporan.penjualan', 'L')
  const q = req.nextUrl.searchParams
  const jenis = q.get('jenis') ?? ''
  if (!(jenis in JENIS_LAPORAN)) return new Response('Jenis laporan tidak dikenal.', { status: 404 })
  const s: SaringLaporan = Object.fromEntries([...q.entries()].map(([k, v]) => [k, v.slice(0, 80)]))
  let isi: string
  let nama: string
  switch (jenis as JenisLaporan) {
    case 'penjualan': {
      const d = await rekapPenjualan(db, s)
      isi = keCsv(tabelRekap(d, { void: lihatVoid(p), nilai: saklarNyala(p, 'stok.lihat_nilai') }))
      nama = `rekap-penjualan-${d.kelompok}_${d.rentang.dari}_${d.rentang.sampai}`
      break
    }
    case 'menu': {
      const d = await rekapMenu(db, s)
      isi = keCsv(tabelMenu(d, { nilai: saklarNyala(p, 'stok.lihat_nilai') }))
      nama = `rekap-menu-${d.kelompok}_${d.rentang.dari}_${d.rentang.sampai}`
      break
    }
    case 'pembayaran': {
      const d = await ringkasanPembayaran(db, s)
      isi = keCsv(tabelBayar(d))
      nama = `ringkasan-pembayaran_${d.rentang.dari}_${d.rentang.sampai}`
      break
    }
    case 'harian': {
      const d = await tutupHarian(db, s)
      isi = keCsv(tabelHarian(d))
      nama = `tutup-harian_${d.tanggal}`
      break
    }
    case 'selisih': {
      const d = await selisihKas(db, s)
      isi = keCsv(tabelSelisih(d))
      nama = `selisih-kas_${d.rentang.dari}_${d.rentang.sampai}`
      break
    }
  }
  return new Response(isi, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nama}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
