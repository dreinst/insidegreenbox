import type { Metadata } from 'next'
import { RingkasLaporan, SaringanLaporan, TabelLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { KELOMPOK_MENU, lihatVoid, pilihanSaring, rekapMenu, type SaringLaporan } from '@/lib/laporan'
import { tabelMenu } from '@/lib/laporan-kolom'
import { MODE } from '@/lib/penjualan'

export const metadata: Metadata = { title: 'Rekap Penjualan Menu' }

export default async function RekapMenu({ searchParams }: { searchParams: Promise<SaringLaporan> }) {
  const p = await wajibIzin('laporan.penjualan', 'L')
  const s = await searchParams
  const [d, pil] = await Promise.all([rekapMenu(db, s), pilihanSaring(db)])
  const nilai = saklarNyala(p, 'stok.lihat_nilai')
  return (
    <>
      <KepalaHalaman judul="Rekap Penjualan Menu" keterangan={`Menu, kategori, dan paket set terjual ${d.rentang.dari} sampai ${d.rentang.sampai} (WIB). Potongan member dibagi ke menu biasa sebanding nilainya; paket set tidak kena potongan.`} />
      <SaringanLaporan
        dasar="/laporan/menu"
        jenis="menu"
        s={s}
        berlaku={d.rentang}
        opsi={{
          rentang: true,
          kelompok: Object.entries(KELOMPOK_MENU).map(([nilai, label]) => ({ nilai, label })),
          kategori: d.kategoriPilihan.map((k) => ({ nilai: k.kode, label: k.nama })),
          kasir: pil.kasir.map((k) => ({ nilai: String(k.id), label: k.name })),
          mode: Object.entries(MODE).map(([nilai, label]) => ({ nilai, label })),
          metode: pil.metode.map((m) => ({ nilai: String(m.id), label: m.name })),
          q: 'Nama menu atau paket',
        }}
      />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <RingkasLaporan
        isi={[
          { label: 'Qty terjual', nilai: d.jumlah.qty.toLocaleString('id-ID') },
          { label: 'Penjualan kotor', nilai: rupiah(d.jumlah.kotor) },
          { label: 'Potongan', nilai: rupiah(d.jumlah.potongan) },
          { label: 'Penjualan bersih', nilai: rupiah(d.jumlah.bersih) },
          ...(nilai ? [{ label: 'Margin', nilai: rupiah(d.jumlah.margin), catatan: `HPP ${rupiah(d.jumlah.hpp)}${d.jumlah.marginPersen === null ? '' : `, ${d.jumlah.marginPersen.toLocaleString('id-ID')}%`}` }] : []),
        ]}
      />
      <TabelLaporan tabel={tabelMenu(d, { nilai })} judul={`Rekap penjualan ${KELOMPOK_MENU[d.kelompok].toLowerCase()}`} kunci={(b) => b.kunci} kosong="Tidak ada menu terjual pada rentang dan saringan ini." />
      {lihatVoid(p) && d.void.n ? (
        <p className="redup kecil">
          {d.void.n} transaksi void ({rupiah(d.void.nilai)} sebelum potongan) tidak dihitung.
        </p>
      ) : null}
    </>
  )
}
