import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPesananAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Buat pesanan pembelian' }

export default async function PesananBaru() {
  await wajibIzin('beli.pesanan', 'T')
  const [lokasi, pemasok] = await Promise.all([pilihanLokasi(db), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Buat pesanan pembelian" keterangan="Draf dibuat dulu dengan nomornya, lalu baris barang ditambahkan. Untuk memesan dari permintaan, buka permintaannya lalu pilih Buat pesanan." jejak={{ href: '/pesanan', label: 'Pesanan Pembelian' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPesananAksi}
          medan={[
            { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', pilihan: [{ nilai: '', label: 'Pilih pemasok' }, ...pemasok.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
            { jenis: 'pilih', nama: 'locationId', label: 'Lokasi terima', awal: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'tanggal', nama: 'expectedDate', label: 'Perkiraan tiba', bantuan: 'Boleh kosong.' },
            { jenis: 'area', nama: 'note', label: 'Catatan untuk pemasok', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
