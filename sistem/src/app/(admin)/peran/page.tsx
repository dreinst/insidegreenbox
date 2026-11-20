import type { Metadata } from 'next'
import Link from 'next/link'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Peran dan Izin' }

export default async function DaftarPeran() {
  const p = await wajibIzin('atur.peran', 'L')
  const peran = await db.role.findMany({ orderBy: [{ isSystem: 'desc' }, { id: 'asc' }], include: { _count: { select: { users: { where: { active: true } } } } } })
  return (
    <>
      <KepalaHalaman judul="Peran dan Izin" keterangan="Izin diatur per menu dengan enam aksi: Lihat, Tambah, Ubah, Hapus, Setujui, Posting.">
        {punyaIzin(p.izin, 'atur.peran', 'T') ? (
          <Link href="/peran/baru" className="btn">
            Tambah peran
          </Link>
        ) : null}
      </KepalaHalaman>
      <div className="kartu tanpa-isi">
        <table className="tabel">
          <thead>
            <tr>
              <th scope="col">Peran</th>
              <th scope="col">Kode</th>
              <th scope="col">Jenis</th>
              <th scope="col">Pengguna aktif</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr">Tindakan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {peran.map((r) => (
              <tr key={r.id}>
                <td data-label="Peran">
                  <Link href={`/peran/${r.id}`} className="tebal">
                    {r.name}
                  </Link>
                  {r.id === p.peran.id ? <small className="redup"> (peranmu)</small> : null}
                </td>
                <td data-label="Kode">
                  <code>{r.code}</code>
                </td>
                <td data-label="Jenis">{r.isSystem ? 'Sistem' : 'Tambahan'}</td>
                <td data-label="Pengguna aktif">{r._count.users}</td>
                <td data-label="Status">
                  <Lencana aktif={r.active} />
                </td>
                <td className="sel-aksi">
                  <Link href={`/peran/${r.id}`}>{punyaIzin(p.izin, 'atur.peran', 'U') ? 'Atur izin' : 'Lihat'}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
