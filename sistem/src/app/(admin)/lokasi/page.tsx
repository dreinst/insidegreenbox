import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_LOKASI, daftarLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Lokasi' }

export default async function DaftarLokasi({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.lokasi', 'L')
  const { pesan } = await searchParams
  const baris = await daftarLokasi(db)
  const bolehUbah = punyaIzin(p.izin, 'atur.lokasi', 'U')
  return (
    <>
      <KepalaHalaman judul="Lokasi" keterangan="Tempat stok disimpan. Head Office dan Outlet adalah lokasi bawaan. Lokasi tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'atur.lokasi', 'T') ? (
          <Link href="/lokasi/baru" className="btn">
            Tambah lokasi
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Jenis</th>
                <th scope="col">Stok minus</th>
                <th scope="col" className="angka">
                  Produk berstok
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((l) => (
                <tr key={l.id}>
                  <td data-label="Kode">
                    <code>{l.code}</code>
                  </td>
                  <td data-label="Nama">
                    <Link href={`/lokasi/${l.id}`} className="tebal">
                      {l.name}
                    </Link>
                  </td>
                  <td data-label="Jenis">{JENIS_LOKASI[l.kind as keyof typeof JENIS_LOKASI] ?? l.kind}</td>
                  <td data-label="Stok minus">{l.allowNegativeStock ? 'Boleh' : 'Ditolak'}</td>
                  <td data-label="Produk berstok" className="angka">
                    {l._count.stockBalances}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={l.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/lokasi/${l.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada lokasi. Jalankan seed untuk membuat lokasi bawaan.</p>
      )}
    </>
  )
}
