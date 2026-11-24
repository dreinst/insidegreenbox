import type { Metadata } from 'next'
import { RingkasLaporan, SaringanLaporan, TabelLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { lihatVoid, pilihanSaring, ringkasanPembayaran, type SaringLaporan } from '@/lib/laporan'
import { tabelBayar } from '@/lib/laporan-kolom'

export const metadata: Metadata = { title: 'Ringkasan Pembayaran' }

export default async function RingkasanPembayaran({ searchParams }: { searchParams: Promise<SaringLaporan> }) {
  const p = await wajibIzin('laporan.penjualan', 'L')
  const s = await searchParams
  const [d, pil] = await Promise.all([ringkasanPembayaran(db, s), pilihanSaring(db)])
  return (
    <>
      <KepalaHalaman
        judul="Ringkasan Pembayaran"
        keterangan={`Pembayaran penjualan selesai ${d.rentang.dari} sampai ${d.rentang.sampai} (WIB). Sudah disetor artinya shift dan metodenya ada di setoran yang Diposting. MDR diperkirakan per transaksi dengan tarif yang berlaku pada tanggal penjualan.`}
      />
      <SaringanLaporan
        dasar="/laporan/pembayaran"
        jenis="pembayaran"
        s={s}
        berlaku={d.rentang}
        opsi={{ rentang: true, kasir: pil.kasir.map((k) => ({ nilai: String(k.id), label: k.name })), metode: pil.metode.map((m) => ({ nilai: String(m.id), label: m.name })), setoran: true }}
      />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <RingkasLaporan
        isi={[
          { label: 'Nominal', nilai: rupiah(d.jumlah.nominal), catatan: `${d.jumlah.n} transaksi` },
          { label: 'Estimasi MDR', nilai: rupiah(d.jumlah.mdr) },
          { label: 'Sudah disetor', nilai: rupiah(d.jumlah.sudah) },
          { label: 'Belum disetor', nilai: rupiah(d.jumlah.belum) },
        ]}
      />
      <TabelLaporan tabel={tabelBayar(d)} judul="Ringkasan pembayaran per metode" kunci={(b) => String(b.id)} kosong="Tidak ada pembayaran pada rentang dan saringan ini." />
      <p className="redup kecil">Satu transaksi yang dibayar dengan dua metode dihitung di kedua metode, tetapi sekali di baris Jumlah.</p>
      {lihatVoid(p) && d.void.n ? (
        <p className="redup kecil">
          {d.void.n} transaksi void ({rupiah(d.void.nilai)}) tidak dihitung.
        </p>
      ) : null}
    </>
  )
}
