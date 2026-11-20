import type { Metadata } from 'next'
import { pilihanShift, RingkasLaporan, SaringanLaporan, TabelLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { saklarNyala } from '@/lib/izin-inti'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { KELOMPOK_REKAP, lihatVoid, pilihanSaring, rekapPenjualan, type SaringLaporan } from '@/lib/laporan'
import { tabelRekap } from '@/lib/laporan-kolom'
import { MODE } from '@/lib/penjualan'

export const metadata: Metadata = { title: 'Rekap Penjualan' }

export default async function RekapPenjualan({ searchParams }: { searchParams: Promise<SaringLaporan> }) {
  const p = await wajibIzin('laporan.penjualan', 'L')
  const s = await searchParams
  const [d, pil] = await Promise.all([rekapPenjualan(db, s), pilihanSaring(db)])
  const tampilVoid = lihatVoid(p)
  const nilai = saklarNyala(p, 'stok.lihat_nilai')
  const t = tabelRekap(d, { void: tampilVoid, nilai })
  return (
    <>
      <KepalaHalaman judul="Rekap Penjualan" keterangan={`Penjualan selesai ${d.rentang.dari} sampai ${d.rentang.sampai} (WIB). Void tidak ikut dijumlah.`} />
      <SaringanLaporan
        dasar="/laporan"
        jenis="penjualan"
        s={s}
        berlaku={d.rentang}
        opsi={{
          rentang: true,
          kelompok: Object.entries(KELOMPOK_REKAP).map(([nilai, label]) => ({ nilai, label })),
          kasir: pil.kasir.map((k) => ({ nilai: String(k.id), label: k.name })),
          shift: pilihanShift(pil.shift),
          mode: Object.entries(MODE).map(([nilai, label]) => ({ nilai, label })),
          metode: pil.metode.map((m) => ({ nilai: String(m.id), label: m.name })),
        }}
      />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <RingkasLaporan
        isi={[
          { label: 'Transaksi', nilai: d.jumlah.n.toLocaleString('id-ID') },
          { label: 'Penjualan bersih', nilai: rupiah(d.jumlah.bersih), catatan: `Kotor ${rupiah(d.jumlah.kotor)}, potongan ${rupiah(d.jumlah.potongan)}` },
          { label: 'Total diterima', nilai: rupiah(d.jumlah.total), catatan: `Service ${rupiah(d.jumlah.service)}, pajak ${rupiah(d.jumlah.pajak)}` },
          ...(nilai ? [{ label: 'Laba kotor', nilai: rupiah(d.jumlah.laba), catatan: `HPP ${rupiah(d.jumlah.hpp)}${d.jumlah.persenLaba === null ? '' : `, ${d.jumlah.persenLaba.toLocaleString('id-ID')}% dari penjualan bersih`}` }] : []),
          ...(tampilVoid ? [{ label: 'Void', nilai: `${d.jumlah.nVoid} transaksi`, catatan: rupiah(d.jumlah.nilaiVoid) }] : []),
        ]}
      />
      <TabelLaporan tabel={t} judul={`Rekap penjualan ${KELOMPOK_REKAP[d.kelompok].toLowerCase()}`} kunci={(b) => b.kunci} kosong="Tidak ada penjualan pada rentang dan saringan ini." />
      {nilai ? <p className="redup kecil">HPP adalah nilai bahan resep yang keluar saat penjualan. Menu tanpa resep dan penjualan sebelum potong stok berjalan ber-HPP 0.</p> : null}
    </>
  )
}
