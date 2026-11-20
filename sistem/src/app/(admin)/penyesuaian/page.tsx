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
import { daftarPenyesuaian } from '@/lib/stok/penyesuaian'

export const metadata: Metadata = { title: 'Penyesuaian Stok' }

export default async function DaftarPenyesuaian({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('stok.penyesuaian', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarPenyesuaian(db, s), pilihanLokasi(db)])
  return (
    <>
      <KepalaHalaman judul="Penyesuaian Stok" keterangan="Stok bertambah atau berkurang di luar pembelian dan penjualan, misalnya rusak atau tumpah. Stok bergerak saat Diposting.">
        {punyaIzin(p.izin, 'stok.penyesuaian', 'T') ? (
          <Link href="/penyesuaian/baru" className="btn">
            Buat penyesuaian
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanStok kode={s.pesan} />
      <SaringDokumen s={s} jalur="/penyesuaian" lokasi={lokasi} label="Saring penyesuaian stok" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Lokasi</th>
                <th scope="col" className="angka">
                  Baris
                </th>
                <th scope="col">Catatan</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/penyesuaian/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Lokasi">{d.location.name}</td>
                  <td data-label="Baris" className="angka">
                    {d._count.stockAdjustmentLines}
                  </td>
                  <td data-label="Catatan" className="ringkasan">
                    {d.note || '-'}
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
        <p className="kosong">Belum ada penyesuaian stok yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/penyesuaian" query={s} />
    </>
  )
}
