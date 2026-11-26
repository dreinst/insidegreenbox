import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { buatFakturAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Catat faktur pembelian' }

export default async function FakturBaru({ searchParams }: { searchParams: Promise<{ pemasok?: string }> }) {
  await wajibIzin('beli.faktur', 'T')
  const [pemasok, { pemasok: awal }] = await Promise.all([pilihanPemasok(db), searchParams])
  return (
    <>
      <KepalaHalaman judul="Catat faktur pembelian" keterangan="Isi data faktur dari pemasok, lalu tarik baris dari penerimaan barang di layar berikutnya." jejak={{ href: '/faktur', label: 'Faktur Pembelian' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatFakturAksi}
          medan={[
            { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: awal ?? '', pilihan: [{ nilai: '', label: 'Pilih pemasok' }, ...pemasok.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
            { jenis: 'teks', nama: 'supplierInvoiceNo', label: 'Nomor faktur pemasok', wajib: true, maxLength: 40 },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal faktur', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'tanggal', nama: 'dueDate', label: 'Jatuh tempo', bantuan: 'Kosong berarti tanggal faktur ditambah termin pemasok.' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf faktur"
        />
      </section>
    </>
  )
}
