import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { tombolBeli } from '@/lib/beli/dokumen'
import { CARA_SELESAI, barisAsalRetur, muatRetur } from '@/lib/beli/retur'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatHarga, formatQty, isianQty } from '@/lib/stok/angka'
import { simpanBarisReturAksi, ubahKepalaReturAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Retur Pembelian' }

export default async function RincianRetur({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.retur', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatRetur(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'purchase_return', d.status, false, d.submittedBy)
  const asal = t.ubah ? await barisAsalRetur(db, d) : []
  const qtyRetur = new Map(d.purchaseReturnLines.map((b) => [b.goodsReceiptLineId ?? b.directPurchaseLineId, b.qty]))
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const asalDok = d.goodsReceipt
    ? { menu: 'beli.penerimaan', href: `/penerimaan/${d.goodsReceipt.id}`, no: d.goodsReceipt.no, jenis: 'Penerimaan barang' }
    : { menu: 'beli.langsung', href: `/beli-langsung/${d.directPurchase!.id}`, no: d.directPurchase!.no, jenis: 'Pembelian langsung' }
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Retur pembelian · ${d.supplier.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/retur-beli', label: 'Retur Pembelian' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      {sudahGerak ? (
        <Ringkas
          label="Ringkasan retur"
          isi={[
            ...(lihatNilai ? [['Nilai persediaan keluar', formatRupiah(d.subtotal)] as [string, string]] : []),
            ['Nota debit', formatRupiah(d.debitNoteAmount)],
            ['Sudah dipakai pembayaran', formatRupiah(d.debitNoteUsed)],
          ]}
        />
      ) : null}
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          <dl className="rincian">
            <dt>Asal</dt>
            <dd>
              {asalDok.jenis} <TautanDok p={p} menu={asalDok.menu} href={asalDok.href} teks={asalDok.no} />
            </dd>
            <dt>Pemasok</dt>
            <dd>{d.supplier.name}</dd>
            <dt>Lokasi</dt>
            <dd>{d.location.name}</dd>
            {!t.ubah ? (
              <>
                <dt>Penyelesaian</dt>
                <dd>{CARA_SELESAI[d.settleMode as keyof typeof CARA_SELESAI] ?? d.settleMode}</dd>
                <dt>Alasan</dt>
                <dd>{d.reason}</dd>
              </>
            ) : null}
          </dl>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaReturAksi.bind(null, d.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal retur', awal: isoHari(d.date), wajib: true },
                {
                  jenis: 'pilih',
                  nama: 'settleMode',
                  label: 'Penyelesaian',
                  awal: d.settleMode,
                  pilihan: Object.entries(CARA_SELESAI)
                    .filter(([v]) => d.goodsReceiptId || v === 'potong')
                    .map(([nilai, label]) => ({ nilai, label })),
                  wajib: true,
                },
                { jenis: 'area', nama: 'reason', label: 'Alasan retur', awal: d.reason, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : null}
        </section>
        <PanelBeli p={p} jenis="purchase_return" d={jejak(d)} butuhSetuju={false} aksi={aksiPanel('purchase_return', d.id)} konfirmasiPosting={`Posting ${d.no}? Stok keluar dari ${d.location.name}.`} />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang diretur</h2>
        {t.ubah ? (
          asal.length ? (
            <FormIsianBaris
              aksi={simpanBarisReturAksi.bind(null, d.id)}
              kolom={[
                { kunci: 'terima', label: 'Diterima', angka: true },
                { kunci: 'faktur', label: 'Difakturkan', angka: true },
                { kunci: 'retur', label: 'Sudah diretur', angka: true },
                { kunci: 'sisa', label: 'Bisa diretur', angka: true },
              ]}
              isian={[{ awalan: 'qty', label: 'Qty retur', placeholder: '0' }]}
              baris={asal.map((a) => ({
                id: String(a.id),
                judul: a.produk.name,
                kecil: a.produk.code,
                sel: {
                  terima: `${formatQty(a.qty)} ${a.satuan}`,
                  faktur: d.goodsReceiptId ? `${formatQty(a.difakturkan)} ${a.satuan}` : 'langsung',
                  retur: `${formatQty(a.diretur)} ${a.satuan}`,
                  sisa: `${formatQty(a.sisa)} ${a.satuan}`,
                },
                nilai: { qty: qtyRetur.has(a.id) ? isianQty(qtyRetur.get(a.id)) : '' },
                mati: a.sisa.gt(0) ? undefined : ['qty'],
              }))}
              tombol="Simpan qty retur"
              catatan="Qty diambil dulu dari bagian yang belum difakturkan; sisanya dari bagian yang sudah difakturkan dan menjadi nota debit."
            />
          ) : (
            <p className="kosong">Dokumen asal tidak punya barang yang bisa diretur.</p>
          )
        ) : d.purchaseReturnLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty retur
                  </th>
                  {sudahGerak ? (
                    <>
                      <th scope="col" className="angka">
                        Sebelum faktur
                      </th>
                      <th scope="col" className="angka">
                        Sesudah faktur
                      </th>
                      {lihatNilai ? (
                        <th scope="col" className="angka">
                          Nilai keluar
                        </th>
                      ) : null}
                      <th scope="col" className="angka">
                        Nota debit
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {d.purchaseReturnLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      {sudahGerak && lihatNilai ? <small className="redup blok">{formatHarga(b.unitCost)} per {b.product.baseUnit.symbol}</small> : null}
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)}
                    </td>
                    {sudahGerak ? (
                      <>
                        <td data-label="Sebelum faktur" className="angka">
                          {formatQty(b.qtyUninvoiced)}
                        </td>
                        <td data-label="Sesudah faktur" className="angka">
                          {formatQty(b.qtyInvoiced)}
                        </td>
                        {lihatNilai ? (
                          <td data-label="Nilai" className="angka">
                            {formatRupiah(b.value)}
                          </td>
                        ) : null}
                        <td data-label="Nota debit" className="angka">
                          {formatRupiah(b.debitNote)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {sudahGerak && punyaIzin(p.izin, 'stok.saldo', 'L') && d.purchaseReturnLines[0] ? (
          <p className="redup kecil">
            Gerak stok dokumen ini ada di <Link href={`/stok/kartu?produk=${d.purchaseReturnLines[0].productId}&lokasi=${d.locationId}`}>kartu stok</Link>.
          </p>
        ) : null}
      </section>

      {d.purchasePaymentAllocs.length ? (
        <section className="kartu" aria-labelledby="j-bayar">
          <h2 id="j-bayar">Dipakai di pembayaran</h2>
          <ul className="bl-turunan">
            {d.purchasePaymentAllocs.map((a) => (
              <li key={a.id}>
                <TautanDok p={p} menu="beli.pembayaran" href={`/pembayaran/${a.purchasePayment.id}`} teks={a.purchasePayment.no} /> {formatRupiah(a.amount)} <LencanaStatus status={a.purchasePayment.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
