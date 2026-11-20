import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_METODE, daftarMetode, type JenisMetode, type SaringMetode } from '@/lib/metode-bayar'

export const metadata: Metadata = { title: 'Metode Bayar' }

export default async function DaftarMetode({ searchParams }: { searchParams: Promise<SaringMetode & { pesan?: string }> }) {
  const p = await wajibIzin('akun.metode_bayar', 'L')
  const s = await searchParams
  const hasil = await daftarMetode(db, s)
  const disaring = !!(s.q || s.jenis || s.status)
  const bolehUbah = punyaIzin(p.izin, 'akun.metode_bayar', 'U')
  return (
    <>
      <KepalaHalaman judul="Metode Bayar" keterangan="Cara pelanggan membayar di kasir. Metode tidak dihapus, cukup dinonaktifkan. Akun kliring dan setoran menyusul bersama akuntansi.">
        {punyaIzin(p.izin, 'akun.metode_bayar', 'T') ? (
          <Link href="/metode-bayar/baru" className="btn">
            Tambah metode
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring metode bayar">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama metode" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-jenis">Jenis</label>
          <select id="s-jenis" name="jenis" defaultValue={s.jenis ?? ''}>
            <option value="">Semua jenis</option>
            {Object.entries(JENIS_METODE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
          {disaring ? <Link href="/metode-bayar">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Jenis</th>
                <th scope="col" className="angka">
                  MDR
                </th>
                <th scope="col">Buka laci</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((m) => (
                <tr key={m.id}>
                  <td data-label="Nama">
                    <Link href={`/metode-bayar/${m.id}`} className="tebal">
                      {m.name}
                    </Link>
                  </td>
                  <td data-label="Jenis">{JENIS_METODE[m.kind as JenisMetode] ?? m.kind}</td>
                  <td data-label="MDR" className="angka">
                    {m.mdrPct.toString().replace('.', ',')}%
                  </td>
                  <td data-label="Buka laci">{m.openDrawer ? 'Ya' : 'Tidak'}</td>
                  <td data-label="Status">
                    <Lencana aktif={m.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/metode-bayar/${m.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada metode yang cocok dengan saringan.' : 'Belum ada metode bayar.'}</p>
      )}
      <Halaman {...hasil} dasar="/metode-bayar" query={s} />
    </>
  )
}
