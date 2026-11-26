import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaStatus, PesanStok, formatTanggal } from '@/components/stok'
import { SaringDokumen } from '@/components/stok-daftar'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import type { SaringDok } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { daftarOpname } from '@/lib/stok/opname'

export const metadata: Metadata = { title: 'Stock Opname' }

export default async function DaftarOpname({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('stok.opname', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarOpname(db, s), pilihanLokasi(db)])
  return (
    <>
      <KepalaHalaman judul="Stock Opname" keterangan="Hitung fisik stok. Qty sistem dibekukan saat draf dibuat, dan selisihnya menjadi gerak stok saat disetujui dan diposting.">
        {punyaIzin(p.izin, 'stok.opname', 'T') ? (
          <Link href="/opname/baru" className="btn">
            Buat opname
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanStok kode={s.pesan} />
      <SaringDokumen s={s} jalur="/opname" lokasi={lokasi} label="Saring stock opname" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Lokasi</th>
                <th scope="col">Kategori</th>
                <th scope="col" className="angka">
                  Produk
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/opname/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Lokasi">{d.location.name}</td>
                  <td data-label="Kategori">{d.category?.name ?? 'Semua'}</td>
                  <td data-label="Produk" className="angka">
                    {d._count.stockOpnameLines}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada stock opname yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/opname" query={s} />
    </>
  )
}
