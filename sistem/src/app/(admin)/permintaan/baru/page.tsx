import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPermintaanAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Buat permintaan pembelian' }

export default async function PermintaanBaru() {
  await wajibIzin('beli.permintaan', 'T')
  const lokasi = await pilihanLokasi(db)
  return (
    <>
      <KepalaHalaman judul="Buat permintaan pembelian" keterangan="Draf dibuat dulu dengan nomornya, lalu baris barang ditambahkan di layar berikutnya." jejak={{ href: '/permintaan', label: 'Permintaan Pembelian' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPermintaanAksi}
          medan={[
            { jenis: 'pilih', nama: 'locationId', label: 'Lokasi tujuan', awal: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'tanggal', nama: 'requiredDate', label: 'Tanggal dibutuhkan', bantuan: 'Boleh kosong.' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
