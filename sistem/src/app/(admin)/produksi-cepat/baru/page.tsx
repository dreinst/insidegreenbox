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
import { buatCepatAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat produksi cepat' }

export default async function CepatBaru() {
  const p = await wajibIzin('produksi.cepat', 'T')
  const [bom, lokasi] = await Promise.all([pilihanBomAssembly(db), pilihanLokasi(db)])
  const awalLokasi = String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? '')
  return (
    <>
      <KepalaHalaman judul="Buat produksi cepat" keterangan="Bahan disusun dari BOM dikali jumlah batch. Qty aktual tiap bahan bisa diubah di layar berikutnya sebelum diposting." jejak={{ href: '/produksi-cepat', label: 'Produksi Cepat' }} />
      <section className="kartu">
        {bom.length ? (
          <FormMaster
            aksi={buatCepatAksi}
            medan={[
              { jenis: 'pilih', nama: 'bomId', label: 'BOM assembly', pilihan: [{ nilai: '', label: 'Pilih BOM' }, ...bom.map((b) => ({ nilai: String(b.id), label: `${b.name} (${formatQty(b.outputQty)} ${b.product!.baseUnit.symbol} per batch)` }))], wajib: true, lebar: true },
              { jenis: 'angka', nama: 'qty', label: 'Jumlah batch', inputMode: 'decimal', wajib: true, placeholder: '1', bantuan: 'Boleh pecahan, misalnya 0,5.' },
              { jenis: 'angka', nama: 'outputQty', label: 'Qty hasil (satuan dasar)', inputMode: 'decimal', placeholder: 'Kosong = hasil BOM × batch', bantuan: 'Isi bila hasil nyata berbeda dari BOM.' },
              { jenis: 'pilih', nama: 'fromLocationId', label: 'Lokasi bahan', awal: awalLokasi, pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'pilih', nama: 'toLocationId', label: 'Lokasi hasil', awal: awalLokasi, pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
              { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true, bantuan: 'Wajib diisi bila qty aktual bahan menyimpang dari toleransi BOM.' },
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
