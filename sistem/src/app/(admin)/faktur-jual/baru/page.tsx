import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pesananJualTerbuka } from '@/lib/b2b/pesanan'
import { pilihanPelanggan } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatFakturJualAksi } from '../../_jual/aksi'

export const metadata: Metadata = { title: 'Buat faktur penjualan' }

export default async function FakturJualBaru({ searchParams }: { searchParams: Promise<{ so?: string; pelanggan?: string }> }) {
  await wajibIzin('b2b.faktur', 'T')
  const [lokasi, pelanggan, terbuka, s] = await Promise.all([pilihanLokasi(db), pilihanPelanggan(db), pesananJualTerbuka(db), searchParams])
  const so = terbuka.find((x) => String(x.id) === s.so)
  return (
    <>
      <KepalaHalaman
        judul="Buat faktur penjualan"
        keterangan="Pilih pesanan penjualan untuk menarik sisa barisnya, atau pilih pelanggan saja lalu tambahkan baris langsung. Tidak ada surat jalan terpisah: barang keluar saat faktur diposting."
        jejak={{ href: '/faktur-jual', label: 'Faktur Penjualan' }}
      />
      <section className="kartu">
        <FormMaster
          aksi={buatFakturJualAksi}
          medan={[
            {
              jenis: 'pilih',
              nama: 'salesOrderId',
              label: 'Dari pesanan penjualan',
              awal: so ? String(so.id) : '',
              pilihan: [{ nilai: '', label: 'Tanpa pesanan' }, ...terbuka.map((x) => ({ nilai: String(x.id), label: `${x.no} · ${x.customer.name}` }))],
              lebar: true,
              bantuan: 'Bila dipilih, pelanggan dan baris diambil dari pesanan.',
            },
            { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: so ? String(so.customerId) : (s.pelanggan ?? ''), pilihan: [{ nilai: '', label: 'Pilih pelanggan' }, ...pelanggan.map((x) => ({ nilai: String(x.id), label: x.name }))], bantuan: 'Wajib bila tanpa pesanan.' },
            { jenis: 'pilih', nama: 'locationId', label: 'Lokasi kirim', awal: String(so?.locationId ?? lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true, bantuan: 'Stok keluar dari lokasi ini.' },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal faktur', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'tanggal', nama: 'dueDate', label: 'Jatuh tempo', bantuan: 'Kosong = tanggal faktur + termin pelanggan.' },
            { jenis: 'teks', nama: 'customerRef', label: 'Nomor PO pelanggan', maxLength: 40, bantuan: 'Kosong = rujukan pesanan.' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
