import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { perintahBerjalan } from '@/lib/produksi/perintah'
import { des, formatQty, isianQty } from '@/lib/stok/angka'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatHasilAksi } from '../aksi'

export const metadata: Metadata = { title: 'Catat hasil produksi' }

export default async function HasilBaru({ searchParams }: { searchParams: Promise<{ perintah?: string }> }) {
  await wajibIzin('produksi.hasil', 'T')
  const s = await searchParams
  const [perintah, lokasi] = await Promise.all([perintahBerjalan(db), pilihanLokasi(db)])
  const pilih = perintah.find((x) => String(x.id) === s.perintah)
  const sisa = pilih ? des(pilih.plannedQty).minus(des(pilih.producedQty)) : null
  return (
    <>
      <KepalaHalaman judul="Catat hasil produksi" keterangan="Qty dalam satuan dasar produk hasil. Nilainya diambil dari barang dalam proses perintah saat Diposting." jejak={{ href: '/hasil-produksi', label: 'Hasil Produksi' }} />
      <section className="kartu">
        {perintah.length ? (
          <FormMaster
            aksi={buatHasilAksi}
            medan={[
              {
                jenis: 'pilih',
                nama: 'productionOrderId',
                label: 'Perintah produksi',
                awal: pilih ? String(pilih.id) : '',
                pilihan: [
                  { nilai: '', label: 'Pilih perintah' },
                  ...perintah.map((x) => ({ nilai: String(x.id), label: `${x.no} · ${x.bom.product?.name ?? x.bom.name}, ${formatQty(x.producedQty)} dari ${formatQty(x.plannedQty)} ${x.bom.product?.baseUnit.symbol ?? ''}` })),
                ],
                wajib: true,
                lebar: true,
              },
              { jenis: 'angka', nama: 'qty', label: 'Qty hasil', awal: sisa && sisa.gt(0) ? isianQty(sisa) : '', inputMode: 'decimal', wajib: true },
              { jenis: 'angka', nama: 'wasteQty', label: 'Qty susut', inputMode: 'decimal', placeholder: '0', bantuan: 'Catatan saja, tidak menggerakkan stok.' },
              { jenis: 'pilih', nama: 'locationId', label: 'Lokasi hasil', awal: String(pilih?.outputLocationId ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
            ]}
            tombol="Buat draf"
          />
        ) : (
          <p className="kosong">
            Belum ada perintah produksi yang Disetujui. <Link href="/perintah-produksi">Buka Perintah Produksi</Link>
          </p>
        )}
      </section>
    </>
  )
}
