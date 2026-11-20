import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { namaRekening } from '@/lib/rekening'
import { hariIni } from '@/lib/stok/dokumen'
import { buatPembayaranAksi } from '../../_beli/aksi'

export const metadata: Metadata = { title: 'Buat pembayaran pembelian' }

export default async function PembayaranBaru({ searchParams }: { searchParams: Promise<{ pemasok?: string }> }) {
  await wajibIzin('beli.pembayaran', 'T')
  const [pemasok, rekening, { pemasok: awal }] = await Promise.all([pilihanPemasok(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), searchParams])
  return (
    <>
      <KepalaHalaman judul="Buat pembayaran pembelian" keterangan="Pilih pemasok dan sumber dana. Tagihan yang dibayar dipilih di layar berikutnya." jejak={{ href: '/pembayaran', label: 'Pembayaran Pembelian' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatPembayaranAksi}
          medan={[
            { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: awal ?? '', pilihan: [{ nilai: '', label: 'Pilih pemasok' }, ...pemasok.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal bayar', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'pilih', nama: 'sumber', label: 'Dibayar dari', awal: rekening[0] ? String(rekening[0].id) : 'kas', pilihan: [{ nilai: 'kas', label: 'Kas' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))], wajib: true },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf pembayaran"
        />
      </section>
    </>
  )
}
