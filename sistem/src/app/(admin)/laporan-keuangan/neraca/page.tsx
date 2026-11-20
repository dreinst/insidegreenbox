import type { Metadata } from 'next'
import { SaringBulan, StatusSeimbang, TabelKeuangan, rp } from '@/components/akuntansi'
import { RingkasLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { cocokkanPersediaan, neraca } from '@/lib/akuntansi/laporan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Neraca' }

export default async function Neraca({ searchParams }: { searchParams: Promise<{ sampai?: string }> }) {
  const p = await wajibIzin('laporan.keuangan', 'L')
  const d = await neraca(db, await searchParams)
  const stok = await cocokkanPersediaan(db, d.per)
  const bb = punyaIzin(p.izin, 'akun.buku_besar', 'L')
  return (
    <>
      <KepalaHalaman
        judul="Neraca"
        keterangan={`Posisi aset, kewajiban, dan ekuitas per ${d.per}. Laba tahun berjalan dan laba tahun-tahun sebelumnya dihitung dari jurnal dan tampil di akun Laba Tahun Berjalan dan Laba Ditahan.`}
      />
      <SaringBulan dasar="/laporan-keuangan" jenis="neraca" dari={d.rentang.sampai} sampai={d.rentang.sampai} satu />
      <StatusSeimbang
        seimbang={d.seimbang}
        teksOk={`Seimbang: aset ${rp(d.ringkas.aset)} sama dengan kewajiban dan ekuitas.`}
        teksSalah={`Tidak seimbang: selisih aset dengan kewajiban dan ekuitas ${rp(d.selisih)}.`}
      />
      <RingkasLaporan
        isi={[
          { label: 'Aset', nilai: rp(d.ringkas.aset) },
          { label: 'Kewajiban', nilai: rp(d.ringkas.kewajiban) },
          { label: 'Ekuitas', nilai: rp(d.ringkas.ekuitas), catatan: `Laba tahun berjalan ${rp(d.ringkas.labaBerjalan)}` },
          {
            label: 'Persediaan buku lawan stok',
            nilai: stok.cocok ? 'Cocok' : `Selisih ${rp(stok.buku - stok.stok)}`,
            catatan: `Buku ${rp(stok.buku)}, kartu stok ${rp(stok.stok)}`,
          },
        ]}
      />
      <TabelKeuangan baris={d.baris} judul={`Neraca per ${d.per}`} tautan={bb ? (id) => `/buku-besar?akun=${id}&sampai=${d.per}` : undefined} />
    </>
  )
}
