// Kolom laporan keuangan untuk tabel halaman dan CSV (pola yang sama dengan laporan-kolom.ts tahap 5A). Tanpa Next.
import type { Tabel } from '../laporan-kolom'
import type { BarisBukuBesar, BarisLaporan, BarisNeracaSaldo, bukuBesar, labaRugi, neraca, neracaSaldo } from './laporan'

export function tabelNeracaSaldo(d: Awaited<ReturnType<typeof neracaSaldo>>): Tabel<BarisNeracaSaldo> {
  return {
    kolom: [
      { h: 'Kode', v: (b) => b.kode, href: (b) => (b.id ? `/buku-besar?akun=${b.id}&dari=${d.rentang.awal}&sampai=${d.rentang.akhir}` : null) },
      { h: 'Akun', v: (b) => b.nama },
      { h: 'Jenis', v: (b) => b.jenis },
      { h: 'Saldo awal debit', v: (b) => b.awalD, jenis: 'uang' },
      { h: 'Saldo awal kredit', v: (b) => b.awalK, jenis: 'uang' },
      { h: 'Mutasi debit', v: (b) => b.mutD, jenis: 'uang' },
      { h: 'Mutasi kredit', v: (b) => b.mutK, jenis: 'uang' },
      { h: 'Saldo akhir debit', v: (b) => b.akhirD, jenis: 'uang' },
      { h: 'Saldo akhir kredit', v: (b) => b.akhirK, jenis: 'uang' },
    ],
    baris: d.baris,
    jumlah: d.jumlah,
  }
}

const NAMA_JENIS = { judul: 'Kelompok', akun: 'Akun', jumlah: 'Jumlah', hasil: 'Hasil' }

export function tabelKeuangan(d: Awaited<ReturnType<typeof labaRugi>> | Awaited<ReturnType<typeof neraca>>, persen: boolean): Tabel<BarisLaporan> {
  return {
    kolom: [
      { h: 'Baris', v: (b) => NAMA_JENIS[b.jenis] },
      { h: 'Kode', v: (b) => b.kode },
      { h: 'Nama', v: (b) => b.nama },
      { h: 'Nilai', v: (b) => b.nilai, jenis: 'uang' },
      ...(persen ? [{ h: 'Persen pendapatan', v: (b: BarisLaporan) => b.persen ?? null, jenis: 'persen' as const }] : []),
    ],
    baris: d.baris,
  }
}

export function tabelBukuBesar(d: Awaited<ReturnType<typeof bukuBesar>>): Tabel<BarisBukuBesar> {
  return {
    kolom: [
      { h: 'Tanggal', v: (b) => b.tanggal },
      { h: 'Nomor jurnal', v: (b) => b.no },
      { h: 'Sumber', v: (b) => b.sumber },
      { h: 'Nomor dokumen', v: (b) => b.docNo },
      { h: 'Keterangan', v: (b) => b.keterangan },
      { h: 'Debit', v: (b) => b.debit, jenis: 'uang' },
      { h: 'Kredit', v: (b) => b.kredit, jenis: 'uang' },
      { h: 'Saldo', v: (b) => b.saldo, jenis: 'uang' },
    ],
    baris: d.baris ?? [],
  }
}
