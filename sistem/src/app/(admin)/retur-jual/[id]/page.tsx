import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PesanJual } from '@/components/b2b'
import { PanelBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { barisAsalReturJual, muatReturJual } from '@/lib/b2b/retur'
import { tombolBeli } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatQty, isianQty } from '@/lib/stok/angka'
import { simpanBarisReturJualAksi, ubahKepalaReturJualAksi } from '../../_jual/aksi'
import { aksiPanelJual, isoHari, jejak } from '../../_jual/panel'

export const metadata: Metadata = { title: 'Retur Penjualan' }

export default async function RincianReturJual({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('b2b.retur', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatReturJual(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'sales_return', d.status, false, d.submittedBy)
  const asal = t.ubah ? await barisAsalReturJual(db, d.salesInvoiceId) : []
  const qtyRetur = new Map(d.salesReturnLines.map((b) => [b.salesInvoiceLineId, b.qty]))
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Retur penjualan · ${d.customer.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/retur-jual', label: 'Retur Penjualan' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanJual kode={pesan} />
      <Ringkas
        label="Ringkasan retur"
        isi={[
          ['Nota kredit', formatRupiah(d.total)],
          ...(sudahGerak ? ([['Sudah dipakai penerimaan', formatRupiah(d.creditUsed)]] as [string, string][]) : []),
          ...(sudahGerak && lihatNilai ? ([['HPP kembali ke stok', formatRupiah(d.value)]] as [string, string][]) : []),
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          <dl className="rincian">
            <dt>Faktur asal</dt>
            <dd>
              <TautanDok p={p} menu="b2b.faktur" href={`/faktur-jual/${d.salesInvoice.id}`} teks={d.salesInvoice.no} />
            </dd>
            <dt>Pelanggan</dt>
            <dd>{d.customer.name}</dd>
            <dt>Lokasi masuk</dt>
            <dd>{d.location.name}</dd>
            {!t.ubah ? (
              <>
                <dt>Alasan</dt>
                <dd>{d.reason}</dd>
              </>
            ) : null}
          </dl>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaReturJualAksi.bind(null, d.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal retur', awal: isoHari(d.date), wajib: true },
                { jenis: 'area', nama: 'reason', label: 'Alasan retur', awal: d.reason, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : null}
        </section>
        <PanelBeli p={p} jenis="sales_return" d={jejak(d)} butuhSetuju={false} aksi={aksiPanelJual('sales_return', d.id)} konfirmasiPosting={`Posting ${d.no}? Barang masuk lagi ke ${d.location.name} dengan HPP asal dan nota kredit dibuat.`} />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang diretur</h2>
        {t.ubah ? (
          asal.length ? (
            <FormIsianBaris
              aksi={simpanBarisReturJualAksi.bind(null, d.id)}
              kolom={[
                { kunci: 'faktur', label: 'Difakturkan', angka: true },
                { kunci: 'retur', label: 'Sudah diretur', angka: true },
                { kunci: 'sisa', label: 'Bisa diretur', angka: true },
                { kunci: 'harga', label: 'Harga', angka: true },
              ]}
              isian={[{ awalan: 'qty', label: 'Qty retur', placeholder: '0' }]}
              baris={asal.map((a) => ({
                id: String(a.id),
                judul: a.product.name,
                kecil: a.product.code,
                sel: {
                  faktur: `${formatQty(a.qty)} ${a.unit.symbol}`,
                  retur: `${formatQty(a.qtyReturned)} ${a.unit.symbol}`,
                  sisa: `${formatQty(a.sisa)} ${a.unit.symbol}`,
                  harga: formatRupiah(a.price),
                },
                nilai: { qty: qtyRetur.has(a.id) ? isianQty(qtyRetur.get(a.id)) : '' },
                mati: a.sisa.gt(0) ? undefined : ['qty'],
              }))}
              tombol="Simpan qty retur"
              catatan="Nota kredit = qty retur x harga faktur. Barang kembali ke stok dengan HPP asal faktur."
            />
          ) : (
            <p className="kosong">Faktur asal tidak punya barang yang bisa diretur.</p>
          )
        ) : d.salesReturnLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty retur
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col" className="angka">
                    Nota kredit
                  </th>
                  {sudahGerak && lihatNilai ? (
                    <th scope="col" className="angka">
                      HPP kembali
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {d.salesReturnLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty retur" className="angka">
                      {formatQty(b.qty)} {b.salesInvoiceLine.unit.symbol}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Nota kredit" className="angka">
                      {formatRupiah(b.lineTotal)}
                    </td>
                    {sudahGerak && lihatNilai ? (
                      <td data-label="HPP kembali" className="angka">
                        {formatRupiah(b.value)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
      </section>

      {d.customerPaymentAllocs.length ? (
        <section className="kartu" aria-labelledby="j-pakai">
          <h2 id="j-pakai">Dipakai di penerimaan</h2>
          <ul className="bl-turunan">
            {d.customerPaymentAllocs.map((a) => (
              <li key={a.id}>
                <TautanDok p={p} menu="b2b.penerimaan" href={`/terima-pelanggan/${a.customerPayment.id}`} teks={a.customerPayment.no} /> {formatRupiah(a.amount)} <LencanaStatus status={a.customerPayment.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
