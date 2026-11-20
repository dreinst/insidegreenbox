import type { Metadata } from 'next'
import { PesanAkuntansi } from '@/components/akuntansi'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tanggalIso } from '@/lib/waktu'
import { buatMemorialAksi } from '../aksi'

export const metadata: Metadata = { title: 'Jurnal memorial baru' }

export default async function MemorialBaru() {
  await wajibIzin('akun.jurnal', 'T')
  return (
    <>
      <KepalaHalaman
        judul="Jurnal memorial baru"
        keterangan="Untuk koreksi, saldo awal, atau transaksi yang tidak punya dokumen sendiri. Draf belum masuk buku besar sampai disetujui dan diposting."
        jejak={{ href: '/jurnal', label: 'Jurnal Umum' }}
      />
      <PesanAkuntansi />
      <section className="kartu">
        <FormMaster
          aksi={buatMemorialAksi}
          medan={[
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal jurnal', awal: tanggalIso(new Date()), wajib: true, bantuan: 'Tidak boleh lewat dari hari ini dan tidak di periode yang sudah ditutup.' },
            { jenis: 'area', nama: 'memo', label: 'Keterangan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
