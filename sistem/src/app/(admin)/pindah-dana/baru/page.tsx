import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { pilihanDana } from '@/lib/kas'
import { hariIni } from '@/lib/stok/dokumen'
import { buatPindahAksi } from '../../kas/aksi'

export const metadata: Metadata = { title: 'Buat pindah dana' }

export default async function PindahBaru() {
  await wajibIzin('kas.pindah', 'T')
  const dana = await pilihanDana(db)
  return (
    <>
      <KepalaHalaman judul="Buat pindah dana" keterangan="Pilih asal dan tujuan dana beserta jumlahnya." jejak={{ href: '/pindah-dana', label: 'Pindah Dana' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPindahAksi}
          medan={[
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'pilih', nama: 'sumber', label: 'Dari', awal: 'kas', pilihan: dana, wajib: true },
            { jenis: 'pilih', nama: 'tujuan', label: 'Ke', awal: dana[1]?.nilai ?? '', pilihan: [{ nilai: '', label: 'Pilih tujuan' }, ...dana], wajib: true },
            { jenis: 'angka', nama: 'amount', label: 'Jumlah (Rp)', inputMode: 'numeric', wajib: true, placeholder: '0' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf pindah dana"
        />
      </section>
    </>
  )
}
