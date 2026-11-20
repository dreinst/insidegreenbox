import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { pilihanDana } from '@/lib/kas'
import { hariIni } from '@/lib/stok/dokumen'
import { buatKasAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat kas masuk atau keluar' }

export default async function KasBaru({ searchParams }: { searchParams: Promise<{ jenis?: string }> }) {
  await wajibIzin('kas.transaksi', 'T')
  const [{ jenis }, dana] = await Promise.all([searchParams, pilihanDana(db)])
  const awal = jenis === 'masuk' ? 'masuk' : 'keluar'
  return (
    <>
      <KepalaHalaman judul={awal === 'masuk' ? 'Buat kas masuk' : 'Buat kas keluar'} keterangan="Isi kepala dokumen. Akun lawan dan jumlahnya diisi di layar berikutnya." jejak={{ href: '/kas', label: 'Kas Masuk dan Keluar' }} />
      <section className="kartu">
        <FormMaster
          aksi={buatKasAksi}
          medan={[
            { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal, pilihan: [{ nilai: 'keluar', label: 'Kas keluar (uang keluar)' }, { nilai: 'masuk', label: 'Kas masuk (uang masuk)' }], wajib: true },
            { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
            { jenis: 'pilih', nama: 'sumber', label: 'Kas atau rekening', awal: 'kas', pilihan: dana, wajib: true },
            { jenis: 'teks', nama: 'partyName', label: 'Dibayar ke atau diterima dari', maxLength: 80, bantuan: 'Boleh kosong, misalnya nama toko atau penyedia jasa.' },
            { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
          ]}
          tombol="Buat draf"
        />
      </section>
    </>
  )
}
