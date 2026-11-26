import type { Metadata } from 'next'
import Link from 'next/link'
import { Ringkas, TautanDok } from '@/components/beli'
import { formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { DOK_BELI } from '@/lib/beli/dokumen'
import { hutangPemasok, type SaringHutang } from '@/lib/beli/hutang'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatNilai as formatRupiah } from '@/lib/stok/angka'

export const metadata: Metadata = { title: 'Hutang Pemasok' }

const MENU_JENIS: Record<string, string> = { Faktur: DOK_BELI.purchase_invoice.menu, 'Pembelian langsung': DOK_BELI.direct_purchase.menu, 'Nota debit': DOK_BELI.purchase_return.menu }

export default async function HutangPemasok({ searchParams }: { searchParams: Promise<SaringHutang> }) {
  const p = await wajibIzin('kas.hutang', 'L')
  const s = await searchParams
  const [h, pemasok] = await Promise.all([hutangPemasok(db, s), pilihanPemasok(db)])
  const q = s.pemasok && /^\d+$/.test(s.pemasok) ? `?pemasok=${s.pemasok}` : ''
  return (
    <>
      <KepalaHalaman judul="Hutang Pemasok" keterangan="Sisa faktur dan pembelian kredit yang belum lunas, dikurangi nota debit retur yang belum terpakai. Barang yang sudah diterima tapi belum difakturkan ditampilkan terpisah dan belum dihitung sebagai hutang.">
        <a href={`/hutang/unduh${q}`} className="btn sekunder" download>
          Unduh CSV
        </a>
      </KepalaHalaman>
      <form className="saring" method="get" role="search" aria-label="Saring hutang pemasok">
        <div className="kolom">
          <label htmlFor="s-pemasok">Pemasok</label>
          <select id="s-pemasok" name="pemasok" defaultValue={s.pemasok ?? ''}>
            <option value="">Semua pemasok</option>
            {pemasok.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {q ? <Link href="/hutang">Hapus saringan</Link> : null}
        </div>
      </form>
      <Ringkas
        label="Ringkasan hutang"
        isi={[
          ['Saldo hutang', formatRupiah(h.total), h.total < 0n],
          ...h.umur.map((u) => [u.kelompok, u.sisa < 0n ? `-${formatRupiah(-u.sisa)}` : formatRupiah(u.sisa)] as [string, string]),
          ['Diterima belum difakturkan', formatRupiah(h.belumFaktur)],
        ]}
      />

      <section className="kartu" aria-labelledby="j-pemasok">
        <h2 id="j-pemasok">Saldo per pemasok</h2>
        {h.perPemasok.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Pemasok</th>
                  <th scope="col" className="angka">
                    Tagihan
                  </th>
                  <th scope="col" className="angka">
                    Nota debit
                  </th>
                  <th scope="col" className="angka">
                    Saldo
                  </th>
                  <th scope="col" className="angka">
                    Lewat jatuh tempo
                  </th>
                  <th scope="col" className="angka">
                    Belum difakturkan
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.perPemasok.map((x) => (
                  <tr key={x.supplierId}>
                    <td data-label="Pemasok">
                      <Link href={`/hutang?pemasok=${x.supplierId}`} className="tebal">
                        {x.pemasok}
                      </Link>
                      <small className="redup blok">{x.dokumen} dokumen</small>
                    </td>
                    <td data-label="Tagihan" className="angka">
                      {formatRupiah(x.tagihan)}
                    </td>
                    <td data-label="Nota debit" className="angka">
                      {x.nota ? `-${formatRupiah(x.nota)}` : formatRupiah(0)}
                    </td>
                    <td data-label="Saldo" className="angka tebal">
                      {formatRupiah(x.saldo)}
                    </td>
                    <td data-label="Lewat tempo" className="angka">
                      {formatRupiah(x.jatuhTempo)}
                    </td>
                    <td data-label="Belum faktur" className="angka">
                      {formatRupiah(x.belumFaktur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Tidak ada hutang pemasok.</p>
        )}
      </section>

      <section className="kartu" aria-labelledby="j-dok">
        <h2 id="j-dok">Dokumen belum lunas</h2>
        {h.dokumen.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Dokumen</th>
                  <th scope="col">Pemasok</th>
                  <th scope="col">Jatuh tempo</th>
                  <th scope="col" className="angka">
                    Total
                  </th>
                  <th scope="col" className="angka">
                    Dibayar
                  </th>
                  <th scope="col" className="angka">
                    Sisa
                  </th>
                  <th scope="col">Umur</th>
                </tr>
              </thead>
              <tbody>
                {h.dokumen.map((x) => (
                  <tr key={`${x.jalur}${x.id}`}>
                    <td data-label="Dokumen">
                      <TautanDok p={p} menu={MENU_JENIS[x.jenis]} href={`${x.jalur}/${x.id}`} teks={x.no} />
                      <small className="redup blok">
                        {x.jenis}
                        {x.ref ? ` · ${x.ref}` : ''}
                      </small>
                    </td>
                    <td data-label="Pemasok">{x.pemasok}</td>
                    <td data-label="Jatuh tempo">{x.dueDate ? formatTanggal(x.dueDate) : '-'}</td>
                    <td data-label="Total" className="angka">
                      {formatRupiah(x.total)}
                    </td>
                    <td data-label="Dibayar" className="angka">
                      {formatRupiah(x.dibayar)}
                    </td>
                    <td data-label="Sisa" className="angka tebal">
                      {formatRupiah(x.sisa)}
                    </td>
                    <td data-label="Umur">{x.umur === null ? '-' : x.umur > 0 ? `${x.umur} hari lewat (${x.kelompok})` : x.kelompok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Semua tagihan pemasok sudah lunas.</p>
        )}
        {punyaIzin(p.izin, 'beli.pembayaran', 'T') && h.dokumen.length ? (
          <p>
            <Link href={`/pembayaran/baru${q}`}>Buat pembayaran</Link>
          </p>
        ) : null}
      </section>
    </>
  )
}
