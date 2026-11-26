import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { JENIS_PROMO, NAMA_STATUS_PROMO, daftarPromo, nilaiPromoTeks, statusPromo, type JenisPromo, type SaringPromo } from '@/lib/promo'

export const metadata: Metadata = { title: 'Promo' }

const tanggal = (d: Date | null) => (d ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', dateStyle: 'medium' }).format(d) : null)

export default async function DaftarPromo({ searchParams }: { searchParams: Promise<SaringPromo & { pesan?: string }> }) {
  const p = await wajibIzin('menu.promo', 'L')
  const s = await searchParams
  const hasil = await daftarPromo(db, s)
  const disaring = !!(s.q || s.status)
  const bolehUbah = punyaIzin(p.izin, 'menu.promo', 'U')
  return (
    <>
      <KepalaHalaman judul="Promo" keterangan="Diskon dan hadiah dengan masa berlaku. Promo tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'menu.promo', 'T') ? (
          <Link href="/promo/baru" className="btn">
            Tambah promo
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring promo">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama promo" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="berlaku">Berlaku sekarang</option>
            <option value="belum">Belum mulai</option>
            <option value="berakhir">Sudah berakhir</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/promo">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Promo</th>
                <th scope="col">Jenis</th>
                <th scope="col">Nilai</th>
                <th scope="col">Masa berlaku</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((x) => {
                const st = NAMA_STATUS_PROMO[statusPromo(x)]
                return (
                  <tr key={x.id}>
                    <td data-label="Promo">
                      <Link href={`/promo/${x.id}`} className="tebal">
                        {x.name}
                      </Link>
                      {x.minSpend > 0n ? <small className="redup"> min. {formatRupiah(x.minSpend)}</small> : null}
                    </td>
                    <td data-label="Jenis">{JENIS_PROMO[x.kind as JenisPromo] ?? x.kind}</td>
                    <td data-label="Nilai">{nilaiPromoTeks(x)}</td>
                    <td data-label="Masa berlaku">{x.startsOn || x.endsOn ? `${tanggal(x.startsOn) ?? 'Sejak awal'} sampai ${tanggal(x.endsOn) ?? 'tanpa batas'}` : 'Tanpa batas waktu'}</td>
                    <td data-label="Status">
                      <span className={`lencana ${st.warna}`}>{st.teks}</span>
                    </td>
                    <td className="sel-aksi">
                      <Link href={`/promo/${x.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada promo yang cocok dengan saringan.' : 'Belum ada promo.'}</p>
      )}
      <Halaman {...hasil} dasar="/promo" query={s} />
    </>
  )
}
