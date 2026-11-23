import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { asetBisaDilepas } from '@/lib/aset/aset'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { hariIni } from '@/lib/stok/dokumen'
import { buatPelepasanAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Buat pelepasan aset' }

export default async function PelepasanBaru({ searchParams }: { searchParams: Promise<{ aset?: string }> }) {
  await wajibIzin('aset.penyusutan', 'T')
  const [aset, rekening, s] = await Promise.all([asetBisaDilepas(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), searchParams])
  return (
    <>
      <KepalaHalaman judul="Buat pelepasan aset" keterangan="Pilih aset aktif yang dijual atau dibuang. Isi hasil penjualan 0 bila aset dibuang. Laba atau rugi dihitung saat diposting." jejak={{ href: '/pelepasan-aset', label: 'Pelepasan Aset' }} />
      {aset.length ? (
        <section className="kartu">
          <FormMaster
            aksi={buatPelepasanAksi}
            medan={[
              { jenis: 'pilih', nama: 'fixedAssetId', label: 'Aset', awal: s.aset ?? '', pilihan: [{ nilai: '', label: 'Pilih aset' }, ...aset.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name} (buku ${formatRupiah(a.bookValue)})` }))], wajib: true, lebar: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal pelepasan', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'angka', nama: 'proceeds', label: 'Hasil penjualan (Rp)', inputMode: 'numeric', placeholder: '0', bantuan: 'Kosong atau 0 bila aset dibuang.' },
              { jenis: 'pilih', nama: 'tujuan', label: 'Uang diterima di', awal: 'kas', pilihan: [{ nilai: 'kas', label: 'Kas besar' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))] },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
            ]}
            tombol="Buat draf pelepasan"
          />
        </section>
      ) : (
        <p className="kosong">Tidak ada aset aktif yang bisa dilepas.</p>
      )}
    </>
  )
}
