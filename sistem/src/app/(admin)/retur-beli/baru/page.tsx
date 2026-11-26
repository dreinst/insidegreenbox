import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { CARA_SELESAI, pilihanAsalRetur } from '@/lib/beli/retur'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { buatReturAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Buat retur pembelian' }

export default async function ReturBaru({ searchParams }: { searchParams: Promise<{ sumber?: string }> }) {
  await wajibIzin('beli.retur', 'T')
  const [asal, { sumber }] = await Promise.all([pilihanAsalRetur(db), searchParams])
  return (
    <>
      <KepalaHalaman judul="Buat retur pembelian" keterangan="Pilih dokumen asal, lalu isi qty yang dikembalikan di layar berikutnya." jejak={{ href: '/retur-beli', label: 'Retur Pembelian' }} />
      <section className="kartu">
        {asal.length ? (
          <FormMaster
            aksi={buatReturAksi}
            medan={[
              { jenis: 'pilih', nama: 'sumber', label: 'Dokumen asal', awal: asal.some((a) => a.nilai === sumber) ? sumber : '', pilihan: [{ nilai: '', label: 'Pilih penerimaan atau pembelian langsung' }, ...asal], wajib: true, lebar: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal retur', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              {
                jenis: 'pilih',
                nama: 'settleMode',
                label: 'Penyelesaian',
                awal: 'potong',
                pilihan: Object.entries(CARA_SELESAI).map(([nilai, label]) => ({ nilai, label })),
                wajib: true,
                bantuan: 'Minta ganti barang membuka lagi sisa pesanan supaya penggantinya bisa diterima. Hanya untuk retur dari penerimaan.',
              },
              { jenis: 'area', nama: 'reason', label: 'Alasan retur', maxLength: 300, lebar: true },
            ]}
            tombol="Buat draf retur"
          />
        ) : (
          <p className="kosong">Belum ada penerimaan atau pembelian langsung Diposting yang bisa diretur.</p>
        )}
      </section>
    </>
  )
}
