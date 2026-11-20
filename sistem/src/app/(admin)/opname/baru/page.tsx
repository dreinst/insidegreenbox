import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { pilihanKategori } from '@/lib/stok/produk'
import { buatOpnameAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat stock opname' }

export default async function OpnameBaru() {
  await wajibIzin('stok.opname', 'T')
  const [lokasi, kategori] = await Promise.all([pilihanLokasi(db), pilihanKategori(db)])
  return (
    <>
      <KepalaHalaman
        judul="Buat stock opname"
        keterangan="Semua produk aktif di lokasi (atau di kategori terpilih) masuk ke lembar hitung dengan qty sistem saat ini."
        jejak={{ href: '/opname', label: 'Stock Opname' }}
      />
      <section className="kartu">
        <FormMaster
          aksi={buatOpnameAksi}
          medan={[
            { jenis: 'pilih', nama: 'locationId', label: 'Lokasi', awal: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
            { jenis: 'pilih', nama: 'categoryId', label: 'Kategori', awal: '', pilihan: [{ nilai: '', label: 'Semua kategori' }, ...kategori.map((c) => ({ nilai: String(c.id), label: c.name }))] },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat lembar hitung"
        />
      </section>
    </>
  )
}
