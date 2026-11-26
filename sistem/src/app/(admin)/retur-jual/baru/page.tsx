import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { fakturBisaDiretur } from '@/lib/b2b/faktur'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { buatReturJualAksi } from '../../_jual/aksi'

export const metadata: Metadata = { title: 'Buat retur penjualan' }

export default async function ReturJualBaru({ searchParams }: { searchParams: Promise<{ faktur?: string }> }) {
  await wajibIzin('b2b.retur', 'T')
  const [faktur, s] = await Promise.all([fakturBisaDiretur(db), searchParams])
  return (
    <>
      <KepalaHalaman judul="Buat retur penjualan" keterangan="Pilih faktur penjualan yang barangnya dikembalikan pelanggan. Qty per barang diisi di layar berikutnya." jejak={{ href: '/retur-jual', label: 'Retur Penjualan' }} />
      <section className="kartu">
        {faktur.length ? (
          <FormMaster
            aksi={buatReturJualAksi}
            medan={[
              { jenis: 'pilih', nama: 'salesInvoiceId', label: 'Faktur asal', awal: s.faktur ?? '', pilihan: [{ nilai: '', label: 'Pilih faktur' }, ...faktur.map((f) => ({ nilai: String(f.id), label: `${f.no} · ${f.customer.name}` }))], wajib: true, lebar: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal retur', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'area', nama: 'reason', label: 'Alasan retur', maxLength: 300, lebar: true, bantuan: 'Minimal 5 huruf, misalnya kemasan rusak saat dikirim.' },
            ]}
            tombol="Buat draf retur"
          />
        ) : (
          <p className="kosong">Belum ada faktur penjualan Diposting yang barangnya bisa diretur.</p>
        )}
      </section>
    </>
  )
}
