import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { buatAnggaranAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Buat anggaran' }

export default async function AnggaranBaru() {
  await wajibIzin('anggaran.anggaran', 'T')
  return (
    <>
      <KepalaHalaman judul="Buat anggaran" keterangan="Draf anggaran satu tahun. Akun dan angka per bulan diisi di layar berikutnya." jejak={{ href: '/anggaran', label: 'Anggaran' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatAnggaranAksi}
          medan={[
            { jenis: 'teks', nama: 'name', label: 'Nama anggaran', wajib: true, maxLength: 80, placeholder: 'Anggaran operasional' },
            { jenis: 'angka', nama: 'year', label: 'Tahun', awal: hariIni().toISOString().slice(0, 4), wajib: true, inputMode: 'numeric' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf anggaran"
        />
      </section>
    </>
  )
}
