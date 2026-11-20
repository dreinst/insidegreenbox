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
import { daftarPindah } from '@/lib/stok/pindah'

export const metadata: Metadata = { title: 'Pindah Stok' }

export default async function DaftarPindah({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('stok.pindah', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarPindah(db, s), pilihanLokasi(db)])
  return (
    <>
      <KepalaHalaman judul="Pindah Stok" keterangan="Memindahkan barang antar lokasi. Nilai ikut harga rata-rata lokasi asal, jadi total nilai persediaan tidak berubah.">
        {punyaIzin(p.izin, 'stok.pindah', 'T') ? (
          <Link href="/pindah-stok/baru" className="btn">
            Buat pindah stok
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanStok kode={s.pesan} />
      <SaringDokumen s={s} jalur="/pindah-stok" lokasi={lokasi} label="Saring pindah stok" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Dari</th>
                <th scope="col">Ke</th>
                <th scope="col" className="angka">
                  Baris
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/pindah-stok/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Dari">{d.fromLocation.name}</td>
                  <td data-label="Ke">{d.toLocation.name}</td>
                  <td data-label="Baris" className="angka">
                    {d._count.stockTransferLines}
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
        <p className="kosong">Belum ada pindah stok yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pindah-stok" query={s} />
    </>
  )
}
