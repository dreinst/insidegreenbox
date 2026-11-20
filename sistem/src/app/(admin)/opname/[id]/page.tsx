import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LencanaStatus, PesanStok, formatTanggal } from '@/components/stok'
import { PanelTindakan } from '@/components/stok-dok'
import { FormHitungan } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { pilihanAlasan } from '@/lib/stok/alasan'
import { des, formatNilai, formatQty, isianQty, keRupiah } from '@/lib/stok/angka'
import { aturanSetuju, tombolStatus } from '@/lib/stok/dokumen'
import { gerakSesudahBeku, muatOpname, selisihBaris } from '@/lib/stok/opname'
import { formatWaktu } from '@/lib/waktu'
import { hapusOpnameAksi, simpanHitunganAksi, statusOpnameAksi } from '../aksi'

export const metadata: Metadata = { title: 'Stock Opname' }

export default async function RincianOpname({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.opname', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatOpname(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await aturanSetuju(db, 'stock_opname')
  const t = tombolStatus(p, 'stock_opname', d.status, butuhSetuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const [sesudah, alasan] = await Promise.all([gerakSesudahBeku(db, d.locationId, d.frozenAt, d.id), t.ubah ? pilihanAlasan(db, 'opname') : Promise.resolve([])])
  const dihitung = d.stockOpnameLines.filter((b) => b.countedQty !== null)
  const berselisih = dihitung.filter((b) => !selisihBaris(b).isZero())
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Stock opname · ${d.location.name}${d.category ? ` · ${d.category.name}` : ''} · ${formatTanggal(d.date)}`} jejak={{ href: '/opname', label: 'Stock Opname' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          <dl className="rincian">
            <dt>Lokasi</dt>
            <dd>{d.location.name}</dd>
            <dt>Kategori</dt>
            <dd>{d.category?.name ?? 'Semua kategori'}</dd>
            <dt>Tanggal</dt>
            <dd>{formatTanggal(d.date)}</dd>
            <dt>Qty sistem dibekukan</dt>
            <dd>{formatWaktu(d.frozenAt)}</dd>
            <dt>Catatan</dt>
            <dd>{d.note || '-'}</dd>
          </dl>
          <dl className="ringkas-stok">
            <div>
              <dt>Produk</dt>
              <dd>{d.stockOpnameLines.length}</dd>
            </div>
            <div>
              <dt>Sudah dihitung</dt>
              <dd>{dihitung.length}</dd>
            </div>
            <div>
              <dt>Berselisih</dt>
              <dd>{berselisih.length}</dd>
            </div>
          </dl>
        </section>
        <PanelTindakan
          p={p}
          jenis="stock_opname"
          d={d}
          butuhSetuju={butuhSetuju}
          catatan={
            d.status === 'Draft'
              ? 'Isi qty fisik, simpan, lalu ajukan. Selisih dihitung dari qty sistem yang dibekukan, jadi penjualan sesudah pembekuan tetap terhitung.'
              : d.status === 'Diajukan'
                ? 'Menunggu Owner menekan Setujui dan posting.'
                : undefined
          }
          aksi={{
            ajukan: statusOpnameAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusOpnameAksi.bind(null, d.id, 'kembalikan'),
            posting: statusOpnameAksi.bind(null, d.id, 'posting'),
            batal: statusOpnameAksi.bind(null, d.id, 'batal'),
            hapus: hapusOpnameAksi.bind(null, d.id),
          }}
        />
      </div>

      <section aria-labelledby="j-hitung">
        <h2 id="j-hitung">Lembar hitung</h2>
        {t.ubah ? (
          <FormHitungan
            aksi={simpanHitunganAksi.bind(null, d.id)}
            alasan={alasan.map((a) => ({ nilai: String(a.id), label: a.name }))}
            baris={d.stockOpnameLines.map((b) => ({
              id: b.id,
              kode: b.product.code,
              nama: b.product.name,
              satuan: b.product.baseUnit.symbol,
              sistem: formatQty(b.systemQty),
              sesudah: formatQty(sesudah.get(b.productId) ?? 0),
              hitung: isianQty(b.countedQty),
              alasan: b.reasonId ? String(b.reasonId) : '',
            }))}
          />
        ) : (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty sistem
                  </th>
                  <th scope="col" className="angka">
                    Qty fisik
                  </th>
                  <th scope="col" className="angka">
                    Selisih
                  </th>
                  <th scope="col">Alasan</th>
                  {lihatNilai && sudahGerak ? (
                    <th scope="col" className="angka">
                      Nilai selisih
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {d.stockOpnameLines.map((b) => {
                  const sel = selisihBaris(b)
                  return (
                    <tr key={b.id}>
                      <td data-label="Produk">
                        <span className="tebal">{b.product.name}</span>
                        <small className="redup blok">{b.product.code}</small>
                      </td>
                      <td data-label="Qty sistem" className="angka">
                        {formatQty(b.systemQty)} {b.product.baseUnit.symbol}
                      </td>
                      <td data-label="Qty fisik" className="angka">
                        {b.countedQty === null ? 'belum dihitung' : formatQty(b.countedQty)}
                      </td>
                      <td data-label="Selisih" className={`angka ${sel.isPos() ? 'masuk' : sel.isNeg() ? 'keluar' : ''}`}>
                        {b.countedQty === null ? '-' : `${sel.isPos() ? '+' : ''}${formatQty(sel)}`}
                      </td>
                      <td data-label="Alasan">{b.reason?.name ?? '-'}</td>
                      {lihatNilai && sudahGerak ? (
                        <td data-label="Nilai selisih" className="angka">
                          {sel.isZero() ? '-' : formatNilai(keRupiah(sel.times(des(b.unitCost))))}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
