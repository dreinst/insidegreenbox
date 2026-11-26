import type { Metadata } from 'next'
import Link from 'next/link'
import { formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { formatHarga, formatNilai, formatQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { kartuStok, type SaringKartu } from '@/lib/stok/posisi'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Kartu stok' }

export default async function KartuStok({ searchParams }: { searchParams: Promise<SaringKartu> }) {
  const p = await wajibIzin('stok.saldo', 'L')
  const s = await searchParams
  const [kartu, lokasi, produk] = await Promise.all([
    kartuStok(db, s),
    pilihanLokasi(db),
    db.product.findMany({ where: { OR: [{ active: true }, { stockLedgers: { some: {} } }] }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
  ])
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const satuan = kartu?.produk.baseUnit.symbol ?? ''
  return (
    <>
      <KepalaHalaman judul="Kartu stok" keterangan="Semua gerak satu produk menurut urutan dicatat, dengan saldo sesudah tiap gerak per lokasi. Nomor dokumen membuka dokumen asalnya." />

      <form className="saring" method="get" role="search" aria-label="Pilih kartu stok">
        <div className="kolom">
          <label htmlFor="s-produk">Produk</label>
          <select id="s-produk" name="produk" defaultValue={s.produk ?? ''} required>
            <option value="">Pilih produk</option>
            {produk.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.code})
              </option>
            ))}
          </select>
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
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Tampilkan
          </button>
          {s.dari || s.sampai ? <Link href={`/stok/kartu?produk=${s.produk ?? ''}${s.lokasi ? `&lokasi=${s.lokasi}` : ''}`}>Hapus tanggal</Link> : null}
        </div>
      </form>

      {!kartu ? (
        <p className="kosong">Pilih produk untuk melihat kartu stoknya.</p>
      ) : (
        <>
          <dl className="ringkas-stok">
            <div>
              <dt>Produk</dt>
              <dd>
                {kartu.produk.name} ({kartu.produk.code})
              </dd>
            </div>
            {kartu.awal ? (
              <div>
                <dt>Saldo awal periode</dt>
                <dd>
                  {formatQty(kartu.awal.qty)} {satuan}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Gerak bersih</dt>
              <dd>
                {formatQty(kartu.gerakBersih)} {satuan}
              </dd>
            </div>
            {kartu.saldo ? (
              <div>
                <dt>Saldo sekarang</dt>
                <dd>
                  {formatQty(kartu.saldo.qty)} {satuan}
                  {lihatNilai ? ` · ${formatNilai(kartu.saldo.nilai)}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
          {kartu.baris.length ? (
            <div className="kartu tanpa-isi">
              <table className="tabel">
                <thead>
                  <tr>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Dokumen</th>
                    <th scope="col">Lokasi</th>
                    <th scope="col" className="angka">
                      Masuk atau keluar
                    </th>
                    <th scope="col" className="angka">
                      Saldo
                    </th>
                    {lihatNilai ? (
                      <>
                        <th scope="col" className="angka">
                          Harga satuan
                        </th>
                        <th scope="col" className="angka">
                          Nilai
                        </th>
                        <th scope="col" className="angka">
                          Saldo nilai
                        </th>
                      </>
                    ) : null}
                    <th scope="col">Oleh</th>
                  </tr>
                </thead>
                <tbody>
                  {kartu.baris.map((b) => {
                    const masuk = Number(b.qty) > 0
                    return (
                      <tr key={b.id} className={b.isReversal ? 'baris-balik' : undefined}>
                        <td data-label="Tanggal">
                          {formatTanggal(b.date)}
                          <small className="redup blok">{formatWaktu(b.at)}</small>
                        </td>
                        <td data-label="Dokumen">
                          {b.tautan.href ? (
                            <Link href={b.tautan.href} className="tebal">
                              {b.docNo || `#${b.docId}`}
                            </Link>
                          ) : (
                            <span className="tebal">{b.docNo || `#${b.docId}`}</span>
                          )}
                          <small className="redup blok">
                            {b.tautan.nama}
                            {b.isReversal ? ' · gerak balik' : ''}
                          </small>
                        </td>
                        <td data-label="Lokasi">{b.location.name}</td>
                        <td data-label="Gerak" className={`angka ${masuk ? 'gerak-masuk' : 'gerak-keluar'}`}>
                          {masuk ? '+' : ''}
                          {formatQty(b.qty)} {satuan}
                        </td>
                        <td data-label="Saldo" className="angka">
                          {formatQty(b.balanceQty)} {satuan}
                        </td>
                        {lihatNilai ? (
                          <>
                            <td data-label="Harga" className="angka">
                              {formatHarga(b.unitCost)}
                            </td>
                            <td data-label="Nilai" className="angka">
                              {formatNilai(b.value)}
                              {b.revalue !== 0n ? (
                                <small className="redup blok" title="Barang masuk menutup saldo minus. Bagian yang menutup minus dinilai dengan harga masuk, bedanya dijurnal ke HPP.">
                                  termasuk koreksi stok minus {formatNilai(b.revalue)}
                                </small>
                              ) : null}
                            </td>
                            <td data-label="Saldo nilai" className="angka">
                              {formatNilai(b.balanceValue)}
                            </td>
                          </>
                        ) : null}
                        <td data-label="Oleh">{b.oleh}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kosong">Belum ada gerak untuk saringan ini.</p>
          )}
          <Halaman {...kartu} dasar="/stok/kartu" query={s} />
        </>
      )}
    </>
  )
}
