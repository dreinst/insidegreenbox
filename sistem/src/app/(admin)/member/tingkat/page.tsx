import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarTingkat } from '@/lib/member'

export const metadata: Metadata = { title: 'Tingkat Greenbox Key' }

export default async function DaftarTingkat({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.tingkat', 'L')
  const { pesan } = await searchParams
  const baris = await daftarTingkat(db)
  const bolehUbah = punyaIzin(p.izin, 'menu.tingkat', 'U')
  return (
    <>
      <KepalaHalaman judul="Tingkat Greenbox Key" keterangan="Tingkat member naik sendiri menurut jumlah kunjungan. Tingkat tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'menu.tingkat', 'T') ? (
          <Link href="/member/tingkat/baru" className="btn">
            Tambah tingkat
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Tingkat</th>
                <th scope="col" className="angka">
                  Syarat kunjungan
                </th>
                <th scope="col" className="angka">
                  Potongan
                </th>
                <th scope="col" className="angka">
                  Member
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((t) => (
                <tr key={t.id}>
                  <td data-label="Tingkat">
                    <Link href={`/member/tingkat/${t.id}`} className="tebal">
                      {t.name}
                    </Link>
                    {t.perk ? <small className="redup"> {t.perk}</small> : null}
                  </td>
                  <td data-label="Syarat kunjungan" className="angka">
                    {t.minVisits}
                  </td>
                  <td data-label="Potongan" className="angka">
                    {t.discountPct.toString().replace('.', ',')}%
                  </td>
                  <td data-label="Member" className="angka">
                    {t._count.members}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={t.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/member/tingkat/${t.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada tingkat. Tambahkan lewat tombol di atas atau jalankan npm run impor:menu.</p>
      )}
    </>
  )
}
