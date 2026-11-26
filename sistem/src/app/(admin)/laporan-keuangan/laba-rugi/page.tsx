import type { Metadata } from 'next'
import { SaringBulan, TabelKeuangan, rp } from '@/components/akuntansi'
import { RingkasLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { labaRugi } from '@/lib/akuntansi/laporan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Laba Rugi' }

export default async function LabaRugi({ searchParams }: { searchParams: Promise<{ dari?: string; sampai?: string }> }) {
  const p = await wajibIzin('laporan.keuangan', 'L')
  const d = await labaRugi(db, await searchParams)
  const bb = punyaIzin(p.izin, 'akun.buku_besar', 'L')
  return (
    <>
      <KepalaHalaman judul="Laba Rugi" keterangan={`Pendapatan, harga pokok penjualan, dan beban untuk ${d.rentang.judul}. Potongan penjualan mengurangi pendapatan; selisih harga beli dan selisih persediaan masuk ke HPP.`} />
      <SaringBulan dasar="/laporan-keuangan" jenis="laba-rugi" dari={d.rentang.dari} sampai={d.rentang.sampai} />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <RingkasLaporan
        isi={[
          { label: 'Pendapatan', nilai: rp(d.ringkas.pendapatan) },
          { label: 'Laba kotor', nilai: rp(d.ringkas.labaKotor), catatan: `HPP ${rp(d.ringkas.hpp)}` },
          { label: 'Beban', nilai: rp(d.ringkas.beban) },
          { label: 'Laba bersih', nilai: rp(d.ringkas.bersih) },
        ]}
      />
      <TabelKeuangan baris={d.baris} judul={`Laba rugi ${d.rentang.judul}`} persen tautan={bb ? (id) => `/buku-besar?akun=${id}&dari=${d.rentang.awal}&sampai=${d.rentang.akhir}` : undefined} />
    </>
  )
}
