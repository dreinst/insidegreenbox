import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { JENIS_KELUAR } from '@/lib/produksi/pengeluaran'
import { perintahBerjalan } from '@/lib/produksi/perintah'
import { formatQty } from '@/lib/stok/angka'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPengeluaranAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat pengeluaran bahan' }

export default async function PengeluaranBaru({ searchParams }: { searchParams: Promise<{ perintah?: string; jenis?: string }> }) {
  await wajibIzin('produksi.pengeluaran', 'T')
  const s = await searchParams
  const [perintah, lokasi] = await Promise.all([perintahBerjalan(db), pilihanLokasi(db)])
  const pilih = perintah.find((x) => String(x.id) === s.perintah)
  return (
    <>
      <KepalaHalaman judul="Buat pengeluaran bahan" keterangan="Draf diisi otomatis dengan sisa kebutuhan bahan perintah. Untuk jenis kembali, isi qty yang dikembalikan di layar berikutnya." jejak={{ href: '/pengeluaran-bahan', label: 'Pengeluaran Bahan' }} />
      <section className="kartu">
        {perintah.length ? (
          <FormMaster
            aksi={buatPengeluaranAksi}
            medan={[
              {
                jenis: 'pilih',
                nama: 'productionOrderId',
                label: 'Perintah produksi',
                awal: pilih ? String(pilih.id) : '',
                pilihan: [{ nilai: '', label: 'Pilih perintah' }, ...perintah.map((x) => ({ nilai: String(x.id), label: `${x.no} · ${x.bom.product?.name ?? x.bom.name} ${formatQty(x.plannedQty)} ${x.bom.product?.baseUnit.symbol ?? ''}` }))],
                wajib: true,
                lebar: true,
              },
              { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: s.jenis === 'kembali' ? 'kembali' : 'keluar', pilihan: Object.entries(JENIS_KELUAR).map(([nilai, label]) => ({ nilai, label })), wajib: true },
              { jenis: 'pilih', nama: 'locationId', label: 'Lokasi bahan', awal: String(pilih?.materialLocationId ?? lokasi[0]?.id ?? ''), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
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
