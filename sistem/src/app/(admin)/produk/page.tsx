import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanStok } from '@/components/stok'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatQty } from '@/lib/stok/angka'
import { JENIS_PRODUK, daftarProduk, pilihanKategori, type JenisProduk, type SaringProduk } from '@/lib/stok/produk'

export const metadata: Metadata = { title: 'Produk dan Satuan' }

export default async function DaftarProduk({ searchParams }: { searchParams: Promise<SaringProduk & { pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const s = await searchParams
  const [hasil, kategori] = await Promise.all([daftarProduk(db, s), pilihanKategori(db)])
  const disaring = !!(s.q || s.jenis || s.kategori || s.status)
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  return (
    <>
      <KepalaHalaman judul="Produk dan Satuan" keterangan="Bahan baku, barang setengah jadi, dan barang jadi yang stoknya dicatat. Produk tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'stok.produk', 'T') ? (
          <Link href="/produk/baru" className="btn">
            Tambah produk
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanStok kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring produk">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Kode atau nama" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-jenis">Jenis</label>
          <select id="s-jenis" name="jenis" defaultValue={s.jenis ?? ''}>
            <option value="">Semua jenis</option>
            {Object.entries(JENIS_PRODUK).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-kategori">Kategori</label>
          <select id="s-kategori" name="kategori" defaultValue={s.kategori ?? ''}>
            <option value="">Semua kategori</option>
            {kategori.map((c) => (
              <option key={c.id} value={c.id}>
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
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/produk">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Jenis</th>
                <th scope="col">Kategori</th>
                <th scope="col">Satuan</th>
                <th scope="col" className="angka">
                  Stok minimum
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((b) => (
                <tr key={b.id}>
                  <td data-label="Kode">
                    <code>{b.code}</code>
                  </td>
                  <td data-label="Nama">
                    <Link href={`/produk/${b.id}`} className="tebal">
                      {b.name}
                    </Link>
                  </td>
                  <td data-label="Jenis">{JENIS_PRODUK[b.kind as JenisProduk] ?? b.kind}</td>
                  <td data-label="Kategori">{b.category?.name ?? '-'}</td>
                  <td data-label="Satuan">{b.baseUnit.symbol}</td>
                  <td data-label="Stok minimum" className="angka">
                    {formatQty(b.minStock)}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={b.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/produk/${b.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada produk yang cocok dengan saringan.' : 'Belum ada produk. Tambahkan produk atau jalankan npm run impor:stok.'}</p>
      )}
      <Halaman {...hasil} dasar="/produk" query={s} />
    </>
  )
}
