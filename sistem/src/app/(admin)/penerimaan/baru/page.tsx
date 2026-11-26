import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pesananTerbuka } from '@/lib/beli/pesanan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPenerimaanAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Terima barang' }

export default async function PenerimaanBaru({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  await wajibIzin('beli.penerimaan', 'T')
  const { po } = await searchParams
  const [lokasi, pesanan] = await Promise.all([pilihanLokasi(db), pesananTerbuka(db)])
  const pilih = pesanan.find((x) => String(x.id) === po)
  return (
    <>
      <KepalaHalaman judul="Terima barang" keterangan="Pilih pesanan yang Disetujui. Draf berisi sisa qty tiap barang dengan harga pesanan; ubah qty sesuai barang yang benar-benar tiba." jejak={{ href: '/penerimaan', label: 'Penerimaan Barang' }} />
      <section className="kartu">
        {pesanan.length ? (
          <FormMaster
            aksi={buatPenerimaanAksi}
            medan={[
              { jenis: 'pilih', nama: 'purchaseOrderId', label: 'Pesanan pembelian', awal: pilih ? String(pilih.id) : '', pilihan: [{ nilai: '', label: 'Pilih pesanan' }, ...pesanan.map((x) => ({ nilai: String(x.id), label: `${x.no} · ${x.supplier.name}` }))], wajib: true, lebar: true },
              { jenis: 'pilih', nama: 'locationId', label: 'Lokasi terima', awal: String(pilih?.locationId ?? lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal terima', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'teks', nama: 'deliveryNoteNo', label: 'Nomor surat jalan', maxLength: 40 },
              { jenis: 'angka', nama: 'extraCost', label: 'Biaya tambahan dari pemasok (Rp)', placeholder: '0', bantuan: 'Ongkos kirim yang akan ditagih di faktur pemasok ini. Dibagi ke barang menurut nilainya.' },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
            ]}
            tombol="Buat draf penerimaan"
          />
        ) : (
          <p className="kosong">
            Belum ada pesanan yang Disetujui. <Link href="/pesanan">Buka Pesanan Pembelian</Link>.
          </p>
        )}
      </section>
    </>
  )
}
