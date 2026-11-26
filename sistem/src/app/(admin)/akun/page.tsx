import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAkuntansi } from '@/components/akuntansi'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { JENIS_AKUN, pohonAkun, URUT_JENIS, type SaringAkun } from '@/lib/akuntansi/akun'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Bagan Akun' }

export default async function BaganAkun({ searchParams }: { searchParams: Promise<SaringAkun & { pesan?: string }> }) {
  const p = await wajibIzin('akun.coa', 'L')
  const s = await searchParams
  const akun = await pohonAkun(db, s)
  const disaring = !!(s.q || s.jenis || s.status)
  const bolehUbah = punyaIzin(p.izin, 'akun.coa', 'U')
  return (
    <>
      <KepalaHalaman judul="Bagan Akun" keterangan="Daftar akun berpohon. Akun induk hanya mengelompokkan; jurnal selalu masuk ke akun transaksi. Akun tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'akun.coa', 'T') ? (
          <Link href="/akun/baru" className="btn">
            Tambah akun
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanAkuntansi kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring akun">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Kode atau nama" maxLength={40} />
        </div>
        <div className="kolom">
          <label htmlFor="s-jenis">Jenis</label>
          <select id="s-jenis" name="jenis" defaultValue={s.jenis ?? ''}>
            <option value="">Semua jenis</option>
            {URUT_JENIS.map((k) => (
              <option key={k} value={k}>
                {JENIS_AKUN[k]}
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
          {disaring ? <Link href="/akun">Hapus saringan</Link> : null}
        </div>
      </form>

      {akun.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama akun</th>
                <th scope="col">Jenis</th>
                <th scope="col">Tipe</th>
                <th scope="col">Pemetaan</th>
                <th scope="col" className="angka">
                  Baris jurnal
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {akun.map((a) => (
                <tr key={a.id} className={[a.isPostable ? '' : 'ak-induk', a.active ? '' : 'ak-nonaktif'].filter(Boolean).join(' ') || undefined}>
                  <td data-label="Kode" className="ak-kode">
                    <Link href={`/akun/${a.id}`} className="tebal">
                      {a.code}
                    </Link>
                  </td>
                  <td data-label="Nama">
                    {/* CSP melarang atribut style, jadi jorok anak memakai kelas per tingkat. */}
                    <span className={`ak-nama ak-t${disaring ? 0 : Math.min(a.tingkat, 5)}`}>
                      {a.name}
                    </span>
                  </td>
                  <td data-label="Jenis">{JENIS_AKUN[a.kind]}</td>
                  <td data-label="Tipe">{a.isPostable ? (a.isCashBank ? 'Kas atau bank' : 'Transaksi') : 'Induk'}</td>
                  <td data-label="Pemetaan">
                    {a.peta.length ? (
                      <span className="ak-kunci">
                        {a.peta.map((k) => (
                          <code key={k}>{k}</code>
                        ))}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td data-label="Baris jurnal" className="angka">
                    {a.isPostable ? a.jurnal.toLocaleString('id-ID') : '-'}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={a.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/akun/${a.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada akun yang cocok dengan saringan.' : 'Belum ada akun.'}</p>
      )}
      <p className="redup kecil">{akun.length} akun</p>
    </>
  )
}
