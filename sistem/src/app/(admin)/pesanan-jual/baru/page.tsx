import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanPelanggan } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPesananJualAksi } from '../../_jual/aksi'

export const metadata: Metadata = { title: 'Buat pesanan penjualan' }

export default async function PesananJualBaru({ searchParams }: { searchParams: Promise<{ pelanggan?: string }> }) {
  await wajibIzin('b2b.pesanan', 'T')
  const [lokasi, pelanggan, s] = await Promise.all([pilihanLokasi(db), pilihanPelanggan(db), searchParams])
  return (
    <>
      <KepalaHalaman judul="Buat pesanan penjualan" keterangan="Draf dibuat dulu dengan nomornya, lalu baris barang ditambahkan. Harga bawaan diambil dari harga khusus pelanggan." jejak={{ href: '/pesanan-jual', label: 'Pesanan Penjualan' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPesananJualAksi}
          medan={[
            { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: s.pelanggan ?? '', pilihan: [{ nilai: '', label: 'Pilih pelanggan' }, ...pelanggan.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
            { jenis: 'pilih', nama: 'locationId', label: 'Lokasi kirim', awal: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true, bantuan: 'Stok keluar dari lokasi ini saat faktur diposting.' },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'tanggal', nama: 'requiredDate', label: 'Tanggal kirim', bantuan: 'Boleh kosong.' },
            { jenis: 'teks', nama: 'customerRef', label: 'Nomor PO pelanggan', maxLength: 40, bantuan: 'Boleh kosong.' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
