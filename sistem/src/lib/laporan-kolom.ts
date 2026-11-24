// Kolom tiap laporan, dipakai bersama oleh tabel halaman dan berkas CSV supaya isinya selalu sama.
// Nilai uang disimpan sebagai angka rupiah; tabel memformatnya, CSV menulis angka polos. Tanpa Next.
import type { BarisBayar, BarisMenu, BarisRekap, BarisSelisihKasir, rekapMenu, rekapPenjualan, ringkasanPembayaran, selisihKas, tutupHarian } from './laporan'
import { formatWaktu, tanggalIso } from './waktu'

export type JenisNilai = 'teks' | 'angka' | 'uang' | 'persen' | 'selisih'
export type Kolom<T> = { h: string; v: (b: T) => string | number | null; jenis?: JenisNilai; href?: (b: T) => string | null }
export type Tabel<T> = { kolom: Kolom<T>[]; baris: T[]; jumlah?: T }

const jam = (d: Date | null) => (d ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(d) : '')

export const JENIS_LAPORAN = {
  penjualan: { judul: 'Rekap Penjualan', href: '/laporan' },
  menu: { judul: 'Rekap Penjualan Menu', href: '/laporan/menu' },
  pembayaran: { judul: 'Ringkasan Pembayaran', href: '/laporan/pembayaran' },
  harian: { judul: 'Tutup Harian POS', href: '/laporan/harian' },
  selisih: { judul: 'Selisih Kas per Kasir', href: '/laporan/selisih' },
} as const
export type JenisLaporan = keyof typeof JENIS_LAPORAN

// tahap 5B: nilai = pemegang saklar stok.lihat_nilai melihat kolom HPP dan laba (RANCANGAN 9).
export function tabelRekap(d: Awaited<ReturnType<typeof rekapPenjualan>>, opsi: { void: boolean; nilai?: boolean }): Tabel<BarisRekap> {
  const label = { hari: 'Tanggal', kasir: 'Kasir', shift: 'Shift' }[d.kelompok]
  const kolom: Kolom<BarisRekap>[] = [
    { h: label, v: (b) => b.label },
    { h: 'Transaksi', v: (b) => b.n, jenis: 'angka' },
    { h: 'Penjualan kotor', v: (b) => b.kotor, jenis: 'uang' },
    { h: 'Potongan', v: (b) => b.potongan, jenis: 'uang' },
    { h: 'Penjualan bersih', v: (b) => b.bersih, jenis: 'uang' },
    { h: 'Service', v: (b) => b.service, jenis: 'uang' },
    { h: 'Pajak PB1', v: (b) => b.pajak, jenis: 'uang' },
    // Pembulatan tunai ke Rp 500 (KONTRAK 11 butir 142); Total diterima sudah termasuk pembulatan.
    { h: 'Pembulatan', v: (b) => b.pembulatan, jenis: 'uang' },
    { h: 'Total diterima', v: (b) => b.total, jenis: 'uang' },
  ]
  if (opsi.nilai) kolom.push({ h: 'HPP', v: (b) => b.hpp, jenis: 'uang' }, { h: 'Laba kotor', v: (b) => b.laba, jenis: 'uang' }, { h: 'Persen laba', v: (b) => b.persenLaba, jenis: 'persen' })
  if (opsi.void) kolom.push({ h: 'Void', v: (b) => b.nVoid, jenis: 'angka' }, { h: 'Nilai void', v: (b) => b.nilaiVoid, jenis: 'uang' })
  return { kolom, baris: d.baris, jumlah: d.jumlah }
}

export function tabelMenu(d: Awaited<ReturnType<typeof rekapMenu>>, opsi: { nilai?: boolean } = {}): Tabel<BarisMenu> {
  const kolom: Kolom<BarisMenu>[] = d.kelompok === 'menu' ? [{ h: 'Kategori', v: (b) => b.kategori }, { h: 'Menu', v: (b) => b.nama }] : [{ h: 'Kategori', v: (b) => b.nama }]
  kolom.push(
    { h: 'Qty terjual', v: (b) => b.qty, jenis: 'angka' },
    { h: 'Penjualan kotor', v: (b) => b.kotor, jenis: 'uang' },
    { h: 'Potongan teralokasi', v: (b) => b.potongan, jenis: 'uang' },
    { h: 'Penjualan bersih', v: (b) => b.bersih, jenis: 'uang' },
  )
  if (opsi.nilai)
    kolom.push(
      { h: 'HPP per porsi', v: (b) => b.hppPorsi, jenis: 'uang' },
      { h: 'HPP total', v: (b) => b.hpp, jenis: 'uang' },
      { h: 'Margin', v: (b) => b.margin, jenis: 'uang' },
      { h: 'Margin persen', v: (b) => b.marginPersen, jenis: 'persen' },
    )
  kolom.push({ h: 'Kontribusi', v: (b) => b.kontribusi, jenis: 'persen' })
  return { kolom, baris: d.baris, jumlah: d.jumlah }
}

export function tabelBayar(d: Awaited<ReturnType<typeof ringkasanPembayaran>>): Tabel<BarisBayar> {
  return {
    kolom: [
      { h: 'Metode', v: (b) => b.metode },
      { h: 'Transaksi', v: (b) => b.n, jenis: 'angka' },
      { h: 'Nominal', v: (b) => b.nominal, jenis: 'uang' },
      { h: 'Estimasi MDR', v: (b) => b.mdr, jenis: 'uang' },
      { h: 'Neto', v: (b) => b.neto, jenis: 'uang' },
      { h: 'Sudah disetor', v: (b) => b.sudah, jenis: 'uang' },
      { h: 'Belum disetor', v: (b) => b.belum, jenis: 'uang' },
    ],
    baris: d.baris,
    jumlah: d.jumlah,
  }
}

type BarisHarian = Awaited<ReturnType<typeof tutupHarian>>['baris'][number]

export function tabelHarian(d: Awaited<ReturnType<typeof tutupHarian>>): Tabel<BarisHarian> {
  // Shift tanpa penjualan non tunai metode itu tidak perlu disetor untuk metode tersebut.
  const setoran = (b: BarisHarian, id: number, tunai: boolean) => {
    const s = b.setoran[id]
    if (s) return `${s.no} (${s.status})`
    if (b.status === 'Buka' || (!tunai && !b.perMetode[id])) return '-'
    return 'Belum'
  }
  const kolom: Kolom<BarisHarian>[] = [
    { h: 'Shift', v: (b) => `#${b.id}`, href: (b) => `/shift/${b.id}` },
    { h: 'Kasir', v: (b) => b.kasir },
    { h: 'Buka', v: (b) => jam(b.buka) },
    { h: 'Tutup', v: (b) => (b.tutup ? (tanggalIso(b.tutup) === d.tanggal ? jam(b.tutup) : formatWaktu(b.tutup)) : 'Masih buka') },
    { h: 'Modal awal', v: (b) => b.modal, jenis: 'uang' },
    { h: 'Penjualan tunai', v: (b) => b.tunai, jenis: 'uang' },
    { h: 'Kas masuk laci', v: (b) => b.masuk, jenis: 'uang' },
    { h: 'Kas keluar laci', v: (b) => b.keluar, jenis: 'uang' },
    { h: 'Kas seharusnya', v: (b) => b.seharusnya, jenis: 'uang' },
    { h: 'Kas dihitung', v: (b) => b.dihitung, jenis: 'uang' },
    { h: 'Selisih', v: (b) => b.selisih, jenis: 'selisih' },
    { h: 'Status', v: (b) => b.namaStatus },
    { h: 'Persetujuan', v: (b) => b.persetujuan },
    ...d.nonTunai.map((m): Kolom<BarisHarian> => ({ h: m.nama, v: (b) => b.perMetode[m.id] ?? 0, jenis: 'uang' })),
    ...(d.tunaiUtama ? [{ h: `Setoran ${d.tunaiUtama.nama}`, v: (b: BarisHarian) => setoran(b, d.tunaiUtama!.id, true) }] : []),
    ...d.nonTunai.map((m): Kolom<BarisHarian> => ({ h: `Setoran ${m.nama}`, v: (b) => setoran(b, m.id, false) })),
  ]
  return { kolom, baris: d.baris }
}

export function tabelSelisih(d: Awaited<ReturnType<typeof selisihKas>>): Tabel<BarisSelisihKasir> {
  return {
    kolom: [
      { h: 'Kasir', v: (b) => b.kasir },
      { h: 'Shift ditutup', v: (b) => b.n, jenis: 'angka' },
      { h: 'Shift berselisih', v: (b) => b.nBeda, jenis: 'angka' },
      { h: 'Persen berselisih', v: (b) => b.persenBeda, jenis: 'persen' },
      { h: 'Kali kurang', v: (b) => b.nKurang, jenis: 'angka' },
      { h: 'Total kurang', v: (b) => b.kurang, jenis: 'uang' },
      { h: 'Kali lebih', v: (b) => b.nLebih, jenis: 'angka' },
      { h: 'Total lebih', v: (b) => b.lebih, jenis: 'uang' },
      { h: 'Selisih bersih', v: (b) => b.bersih, jenis: 'selisih' },
      { h: 'Selisih terbesar', v: (b) => b.terbesar, jenis: 'uang' },
      { h: 'Perlu Owner', v: (b) => b.nOwner, jenis: 'angka' },
    ],
    baris: d.baris,
  }
}

// CSV dengan koma dan BOM seperti admin lama, supaya Excel membaca huruf dengan benar. Sel teks yang diawali
// = + - @ diberi tanda kutip tunggal supaya tidak dijalankan sebagai rumus.
export function keCsv<T>(t: Tabel<T>) {
  const sel = (v: string | number | null) => {
    if (v === null) return ''
    if (typeof v === 'number') return String(v)
    const aman = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return /[",\n\r]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman
  }
  const baris = [t.kolom.map((k) => sel(k.h)).join(',')]
  for (const b of [...t.baris, ...(t.jumlah ? [t.jumlah] : [])]) baris.push(t.kolom.map((k) => sel(k.v(b))).join(','))
  return `﻿${baris.join('\r\n')}\r\n`
}
