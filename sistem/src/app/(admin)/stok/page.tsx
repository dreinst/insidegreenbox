import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanStok } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { formatHarga, formatNilai, formatQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { daftarPosisi, type SaringPosisi } from '@/lib/stok/posisi'
import { pilihanKategori } from '@/lib/stok/produk'

export const metadata: Metadata = { title: 'Stok' }

export default async function PosisiStok({ searchParams }: { searchParams: Promise<SaringPosisi & { pesan?: string }> }) {
  const p = await wajibIzin('stok.saldo', 'L')
  const s = await searchParams
  const [hasil, lokasi, kategori] = await Promise.all([daftarPosisi(db, s), pilihanLokasi(db), pilihanKategori(db)])
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const disaring = !!(s.q || s.lokasi || s.kategori || s.bawah)
  return (
    <>
      <KepalaHalaman judul="Stok" keterangan="Posisi stok per lokasi dari kartu stok. Baris merah berada di bawah stok minimum." />
      <PesanStok kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring posisi stok">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Kode atau nama" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-lokasi">Lokasi</label>
          <select id="s-lokasi" name="lokasi" defaultValue={s.lokasi ?? ''}>
            <option value="">Semua lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
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
          <label htmlFor="s-bawah">Tampilkan</label>
          <select id="s-bawah" name="bawah" defaultValue={s.bawah ?? ''}>
            <option value="">Semua produk</option>
            <option value="1">Di bawah minimum</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/stok">Hapus saringan</Link> : null}
        </div>
      </form>

      <dl className="ringkas-stok">
        <div>
          <dt>Baris</dt>
          <dd>{hasil.total}</dd>
        </div>
        <div>
          <dt>Di bawah minimum</dt>
          <dd>{hasil.kurang}</dd>
        </div>
        {lihatNilai ? (
          <div>
            <dt>Nilai persediaan</dt>
            <dd>{formatNilai(hasil.nilai)}</dd>
          </div>
        ) : null}
      </dl>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Produk</th>
                <th scope="col">Lokasi</th>
                <th scope="col" className="angka">
                  Qty
                </th>
                <th scope="col" className="angka">
                  Minimum
                </th>
                {lihatNilai ? (
                  <>
                    <th scope="col" className="angka">
                      Harga rata-rata
                    </th>
                    <th scope="col" className="angka">
                      Nilai
                    </th>
                  </>
                ) : null}
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((b) => (
                <tr key={`${b.product_id}-${b.location_id}`} className={b.bawahMinimum ? 'kurang-min' : undefined}>
                  <td data-label="Produk">
                    <span className="tebal">{b.name}</span>
                    <small className="redup blok">
                      {b.code}
                      {b.active ? '' : ' · nonaktif'}
                    </small>
                  </td>
                  <td data-label="Lokasi">{b.location_name}</td>
                  <td data-label="Qty" className="angka">
                    <b>
                      {formatQty(b.qty)} {b.symbol}
                    </b>
                    {b.bawahMinimum ? <small className="blok keluar">di bawah minimum</small> : null}
                  </td>
                  <td data-label="Minimum" className="angka">
                    {formatQty(b.min_stock)}
                  </td>
                  {lihatNilai ? (
                    <>
                      <td data-label="Rata-rata" className="angka">
                        {formatHarga(b.avg_cost)}
                      </td>
                      <td data-label="Nilai" className="angka">
                        {formatNilai(b.value)}
                      </td>
                    </>
                  ) : null}
                  <td className="sel-aksi">
                    <Link href={`/stok/kartu?produk=${b.product_id}&lokasi=${b.location_id}`}>Kartu stok</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada stok yang cocok dengan saringan.' : 'Belum ada produk aktif.'}</p>
      )}
      <Halaman {...hasil} dasar="/stok" query={s} />
    </>
  )
}
