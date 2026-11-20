import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanPelanggan } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { namaRekening } from '@/lib/rekening'
import { hariIni } from '@/lib/stok/dokumen'
import { buatTerimaAksi } from '../../_jual/aksi'

export const metadata: Metadata = { title: 'Catat penerimaan pelanggan' }

export default async function TerimaBaru({ searchParams }: { searchParams: Promise<{ pelanggan?: string }> }) {
  await wajibIzin('b2b.penerimaan', 'T')
  const [pelanggan, rekening, { pelanggan: awal }] = await Promise.all([pilihanPelanggan(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), searchParams])
  return (
    <>
      <KepalaHalaman judul="Catat penerimaan pelanggan" keterangan="Pilih pelanggan dan tujuan dana. Faktur yang dilunasi dipilih di layar berikutnya." jejak={{ href: '/terima-pelanggan', label: 'Penerimaan Pelanggan' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatTerimaAksi}
          medan={[
            { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: awal ?? '', pilihan: [{ nilai: '', label: 'Pilih pelanggan' }, ...pelanggan.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal terima', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'pilih', nama: 'tujuan', label: 'Diterima di', awal: rekening[0] ? String(rekening[0].id) : 'kas', pilihan: [{ nilai: 'kas', label: 'Kas' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))], wajib: true },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf penerimaan"
        />
      </section>
    </>
  )
}
