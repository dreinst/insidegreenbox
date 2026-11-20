import type { Metadata } from 'next'
import Link from 'next/link'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarPengguna, type SaringPengguna } from '@/lib/pengguna'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Pengguna' }

export default async function DaftarPengguna({ searchParams }: { searchParams: Promise<SaringPengguna> }) {
  const p = await wajibIzin('atur.pengguna', 'L')
  const s = await searchParams
  const [hasil, peran] = await Promise.all([daftarPengguna(db, s), db.role.findMany({ orderBy: { id: 'asc' } })])
  const disaring = !!(s.q || s.peran || s.status)
  return (
    <>
      <KepalaHalaman judul="Pengguna" keterangan="Akun yang bisa masuk ke admin. Pengguna tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'atur.pengguna', 'T') ? (
          <Link href="/pengguna/baru" className="btn">
            Tambah pengguna
          </Link>
        ) : null}
      </KepalaHalaman>

      <form className="saring" method="get" role="search" aria-label="Saring pengguna">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama atau nama pengguna" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-peran">Peran</label>
          <select id="s-peran" name="peran" defaultValue={s.peran ?? ''}>
            <option value="">Semua peran</option>
            {peran.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/pengguna">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Nama pengguna</th>
                <th scope="col">Peran</th>
                <th scope="col">Status</th>
                <th scope="col">Masuk terakhir</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nama">
                    <Link href={`/pengguna/${u.id}`} className="tebal">
                      {u.name}
                    </Link>
                    {u.id === p.id ? <small className="redup"> (kamu)</small> : null}
                  </td>
                  <td data-label="Nama pengguna">{u.username}</td>
                  <td data-label="Peran">{u.role.name}</td>
                  <td data-label="Status">
                    <Lencana aktif={u.active} />
                  </td>
                  <td data-label="Masuk terakhir">{formatWaktu(u.lastLoginAt)}</td>
                  <td className="sel-aksi">
                    <Link href={`/pengguna/${u.id}`}>{punyaIzin(p.izin, 'atur.pengguna', 'U') ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada pengguna yang cocok dengan saringan.' : 'Belum ada pengguna.'}</p>
      )}
      <Halaman {...hasil} dasar="/pengguna" query={s} />
    </>
  )
}
