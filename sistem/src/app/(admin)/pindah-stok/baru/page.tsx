import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPindahAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat pindah stok' }

export default async function PindahBaru() {
  await wajibIzin('stok.pindah', 'T')
  const lokasi = await pilihanLokasi(db)
  const pilihan = lokasi.map((l) => ({ nilai: String(l.id), label: l.name }))
  return (
    <>
      <KepalaHalaman judul="Buat pindah stok" keterangan="Draf dibuat dulu dengan nomornya, lalu produk dan qty ditambahkan di layar berikutnya." jejak={{ href: '/pindah-stok', label: 'Pindah Stok' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPindahAksi}
          medan={[
            { jenis: 'pilih', nama: 'fromLocationId', label: 'Dari lokasi', awal: String(lokasi.find((l) => l.code === 'HO')?.id ?? lokasi[0]?.id ?? ''), pilihan, wajib: true },
            { jenis: 'pilih', nama: 'toLocationId', label: 'Ke lokasi', awal: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[1]?.id ?? ''), pilihan, wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
