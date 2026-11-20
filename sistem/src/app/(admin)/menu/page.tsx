import type { Metadata } from 'next'
import Link from 'next/link'
import { Foto } from '@/components/master'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { daftarMenu, type SaringMenu } from '@/lib/menu'

export const metadata: Metadata = { title: 'Menu dan Harga' }

export default async function DaftarMenu({ searchParams }: { searchParams: Promise<SaringMenu> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const s = await searchParams
  const [hasil, kategori] = await Promise.all([daftarMenu(db, s), db.menuCategory.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] })])
  const disaring = !!(s.q || s.kategori || s.status || s.unggulan)
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul="Menu dan Harga" keterangan="Menu yang dijual di kasir dan di situs. Menu tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'menu.menu', 'T') ? (
          <Link href="/menu/baru" className="btn">
            Tambah menu
          </Link>
        ) : null}
      </KepalaHalaman>

      <form className="saring" method="get" role="search" aria-label="Saring menu">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama menu" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-kategori">Kategori</label>
          <select id="s-kategori" name="kategori" defaultValue={s.kategori ?? ''}>
            <option value="">Semua kategori</option>
            {kategori.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
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
        <div className="kolom">
          <label htmlFor="s-unggulan">Unggulan</label>
          <select id="s-unggulan" name="unggulan" defaultValue={s.unggulan ?? ''}>
            <option value="">Semua menu</option>
            <option value="ya">Hanya unggulan</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/menu">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Menu</th>
                <th scope="col">Kategori</th>
                <th scope="col" className="angka">
                  Harga
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((m) => (
                <tr key={m.id}>
                  <td data-label="Menu">
                    <span className="sel-foto">
                      <Foto image={m.image} nama={m.name} />
                      <span>
                        <Link href={`/menu/${m.id}`} className="tebal">
                          {m.name}
                        </Link>
                        {m.kcal ? <small className="redup"> ±{m.kcal} kkal</small> : null}
                      </span>
                    </span>
                  </td>
                  <td data-label="Kategori">{m.categoryRef.name}</td>
                  <td data-label="Harga" className="angka">
                    {formatRupiah(m.price)}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={m.active} /> {m.featured ? <span className="lencana kuning">Unggulan</span> : null}
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/menu/${m.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada menu yang cocok dengan saringan.' : 'Belum ada menu. Tambahkan lewat tombol di atas atau jalankan npm run impor:menu.'}</p>
      )}
      <Halaman {...hasil} dasar="/menu" query={s} />
    </>
  )
}
