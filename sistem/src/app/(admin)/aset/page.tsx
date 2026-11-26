import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaAset, PesanAset } from '@/components/aset'
import { Ringkas } from '@/components/beli'
import { formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarAset, STATUS_ASET, type SaringAset } from '@/lib/aset/aset'
import { pilihanKategoriAset } from '@/lib/aset/kategori'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Aset Tetap' }

export default async function DaftarAset({ searchParams }: { searchParams: Promise<SaringAset & { pesan?: string }> }) {
  const p = await wajibIzin('aset.daftar', 'L')
  const s = await searchParams
  const [h, kategori] = await Promise.all([daftarAset(db, s), pilihanKategoriAset(db)])
  const disaring = !!(s.q || s.status || s.kategori)
  return (
    <>
      <KepalaHalaman judul="Aset Tetap" keterangan="Peralatan dan mesin yang disusutkan bulanan dengan garis lurus. Aset dibuat sebagai draf, lalu Owner menyetujui dan mengaktifkannya sehingga perolehannya dijurnal.">
        {punyaIzin(p.izin, 'aset.daftar', 'T') ? (
          <Link href="/aset/baru" className="btn">
            Tambah aset
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanAset kode={s.pesan} />
      <form className="saring" method="get" role="search" aria-label="Saring aset">
        <div className="kolom">
          <label htmlFor="s-q">Kode atau nama</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="AT-2611" maxLength={40} />
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {Object.entries(STATUS_ASET).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
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
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/aset">Hapus saringan</Link> : null}
        </div>
      </form>
      <Ringkas
        label="Ringkasan aset aktif"
        isi={[
          ['Nilai perolehan aset aktif', formatRupiah(h.aktif.cost)],
          ['Akumulasi penyusutan', formatRupiah(h.aktif.akumulasi)],
          ['Nilai buku', formatRupiah(h.aktif.buku)],
        ]}
      />
      {h.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Kategori</th>
                <th scope="col">Perolehan</th>
                <th scope="col" className="angka">
                  Nilai perolehan
                </th>
                <th scope="col" className="angka">
                  Nilai buku
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {h.baris.map((a) => (
                <tr key={a.id}>
                  <td data-label="Kode">
                    <Link href={`/aset/${a.id}`} className="tebal">
                      {a.code}
                    </Link>
                  </td>
                  <td data-label="Nama">
                    {a.name}
                    {a.location ? <small className="redup blok">{a.location.name}</small> : null}
                  </td>
                  <td data-label="Kategori">{a.category.name}</td>
                  <td data-label="Perolehan">
                    {formatTanggal(a.acquiredDate)}
                    <small className="redup blok">{a.usefulMonths} bulan</small>
                  </td>
                  <td data-label="Nilai perolehan" className="angka">
                    {formatRupiah(a.cost)}
                  </td>
                  <td data-label="Nilai buku" className="angka">
                    {a.status === 'aktif' ? formatRupiah(a.bookValue) : '-'}
                  </td>
                  <td data-label="Status">
                    <LencanaAset status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada aset yang cocok.' : kategori.length ? 'Belum ada aset.' : 'Belum ada aset. Buat kategori aset dulu di tab Kategori.'}</p>
      )}
      <Halaman {...h} dasar="/aset" query={s} />
    </>
  )
}
