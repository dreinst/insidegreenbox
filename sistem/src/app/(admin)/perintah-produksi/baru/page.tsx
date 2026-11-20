import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { pilihanBomAssembly } from '@/lib/produksi/resep'
import { formatQty } from '@/lib/stok/angka'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatPerintahAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat perintah produksi' }

export default async function PerintahBaru() {
  const p = await wajibIzin('produksi.perintah', 'T')
  const [bom, lokasi] = await Promise.all([pilihanBomAssembly(db), pilihanLokasi(db)])
  const awalLokasi = String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? '')
  return (
    <>
      <KepalaHalaman judul="Buat perintah produksi" keterangan="Baris bahan disalin dari BOM dikali qty rencana. Perubahan BOM sesudahnya tidak mengubah perintah ini." jejak={{ href: '/perintah-produksi', label: 'Perintah Produksi' }} />
      <section className="kartu">
        {bom.length ? (
          <FormMaster
            aksi={buatPerintahAksi}
            medan={[
              { jenis: 'pilih', nama: 'bomId', label: 'BOM assembly', pilihan: [{ nilai: '', label: 'Pilih BOM' }, ...bom.map((b) => ({ nilai: String(b.id), label: `${b.name} (${formatQty(b.outputQty)} ${b.product!.baseUnit.symbol} per batch)` }))], wajib: true, lebar: true },
              { jenis: 'angka', nama: 'plannedQty', label: 'Qty rencana (satuan dasar hasil)', inputMode: 'decimal', wajib: true, placeholder: '5000' },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'pilih', nama: 'materialLocationId', label: 'Lokasi bahan', awal: awalLokasi, pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'pilih', nama: 'outputLocationId', label: 'Lokasi hasil', awal: awalLokasi, pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
            ]}
            tombol="Buat draf"
          />
        ) : (
          <p className="kosong">
            Belum ada BOM assembly aktif yang punya bahan.{' '}
            {punyaIzin(p.izin, 'stok.resep', 'T') ? <Link href="/resep/baru?jenis=assembly">Buat BOM assembly dulu</Link> : 'Minta pemegang menu Resep dan BOM membuatnya.'}
          </p>
        )}
      </section>
    </>
  )
}
