import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaProgres, PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { nilaiBaris, sisaQty, tombolBeli } from '@/lib/beli/dokumen'
import { batasTerima, muatPenerimaan } from '@/lib/beli/penerimaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { des, formatHarga, formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { simpanBarisPenerimaanAksi, ubahKepalaPenerimaanAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Penerimaan Barang' }

export default async function RincianPenerimaan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.penerimaan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPenerimaan(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'goods_receipt', d.status, false, d.submittedBy)
  const lokasi = t.ubah ? await pilihanLokasi(db) : []
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const subtotal = d.goodsReceiptLines.reduce((n, b) => n + nilaiBaris(b.qty, b.price), 0n)
  const faktur = [...new Map(d.purchaseInvoiceLines.map((x) => [x.purchaseInvoice.id, x.purchaseInvoice])).values()]
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Penerimaan barang · ${d.supplier.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/penerimaan', label: 'Penerimaan Barang' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <Ringkas
        label="Ringkasan penerimaan"
        isi={[
          ['Nilai barang', formatRupiah(subtotal)],
          ['Biaya tambahan', formatRupiah(d.extraCost)],
          ['Total', formatRupiah(subtotal + d.extraCost)],
          ['Progres faktur', d.status === 'Diposting' ? d.invoiceProgress : '-'],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          <dl className="rincian">
            <dt>Pesanan</dt>
            <dd>
              <TautanDok p={p} menu="beli.pesanan" href={`/pesanan/${d.purchaseOrderId}`} teks={d.purchaseOrder.no} />
            </dd>
            <dt>Pemasok</dt>
            <dd>{d.supplier.name}</dd>
            {!t.ubah ? (
              <>
                <dt>Lokasi</dt>
                <dd>{d.location.name}</dd>
                <dt>Surat jalan</dt>
                <dd>{d.deliveryNoteNo || '-'}</dd>
                <dt>Catatan</dt>
                <dd>{d.note || '-'}</dd>
              </>
            ) : null}
            {d.status === 'Diposting' ? (
              <>
                <dt>Progres faktur</dt>
                <dd>
                  <LencanaProgres p={d.invoiceProgress} />
                </dd>
              </>
            ) : null}
          </dl>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPenerimaanAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi terima', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal terima', awal: isoHari(d.date), wajib: true },
                { jenis: 'teks', nama: 'deliveryNoteNo', label: 'Nomor surat jalan', awal: d.deliveryNoteNo, maxLength: 40 },
                { jenis: 'angka', nama: 'extraCost', label: 'Biaya tambahan (Rp)', awal: d.extraCost ? d.extraCost.toString() : '', placeholder: '0' },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : null}
        </section>
        <PanelBeli
          p={p}
          jenis="goods_receipt"
          d={jejak(d)}
          butuhSetuju={false}
          aksi={aksiPanel('goods_receipt', d.id)}
          konfirmasiPosting={`Posting ${d.no}? Stok bertambah dan harga rata-rata dihitung ulang.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang diterima</h2>
        {t.ubah && d.goodsReceiptLines.length ? (
          <FormIsianBaris
            aksi={simpanBarisPenerimaanAksi.bind(null, d.id)}
            kolom={[
              { kunci: 'pesan', label: 'Dipesan', angka: true },
              { kunci: 'sudah', label: 'Sudah diterima', angka: true },
              { kunci: 'batas', label: 'Paling banyak', angka: true },
            ]}
            isian={[
              { awalan: 'qty', label: 'Qty terima' },
              { awalan: 'price', label: 'Harga per satuan', inputMode: 'numeric' },
            ]}
            baris={d.goodsReceiptLines.map((b) => ({
              id: String(b.id),
              judul: b.product.name,
              kecil: `${b.unit.symbol} · 1 ${b.unit.symbol} = ${formatQty(b.factor)} ${b.product.baseUnit.symbol}`,
              sel: {
                pesan: `${formatQty(b.purchaseOrderLine.qty)} ${b.unit.symbol}`,
                sudah: `${formatQty(b.purchaseOrderLine.qtyReceived)} ${b.unit.symbol}`,
                batas: `${formatQty(batasTerima(b.purchaseOrderLine, b.product.receiptTolPct))} ${b.unit.symbol}`,
              },
              nilai: { qty: isianQty(b.qty), price: b.price.toString() },
              mati: b.purchaseOrderLine.isFree || !saklarNyala(p, 'beli.ubah_harga_po') ? ['price'] : undefined,
            }))}
            tombol="Simpan qty terima"
            catatan="Qty 0 atau kosong menghapus barisnya dari penerimaan ini; sisanya tetap terbuka di pesanan."
          />
        ) : d.goodsReceiptLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty terima
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  {lihatNilai && sudahGerak ? (
                    <>
                      <th scope="col" className="angka">
                        Harga per satuan dasar
                      </th>
                      <th scope="col" className="angka">
                        Nilai persediaan
                      </th>
                    </>
                  ) : null}
                  <th scope="col" className="angka">
                    Difakturkan
                  </th>
                  <th scope="col" className="angka">
                    Diretur
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.goodsReceiptLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">
                        {formatQty(des(b.qty).times(des(b.factor)))} {b.product.baseUnit.symbol}
                      </small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.unit.symbol}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    {lihatNilai && sudahGerak ? (
                      <>
                        <td data-label="Per satuan dasar" className="angka">
                          {formatHarga(b.unitCost)}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {formatRupiah(b.value)}
                        </td>
                      </>
                    ) : null}
                    <td data-label="Difakturkan" className="angka">
                      {formatQty(b.qtyInvoiced)} {b.unit.symbol}
                    </td>
                    <td data-label="Diretur" className="angka">
                      {formatQty(b.qtyReturned)} {b.unit.symbol}
                      {des(b.qtyRetUninv).gt(0) ? <small className="redup blok">{formatQty(b.qtyRetUninv)} sebelum faktur</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Tidak ada baris. Semua barang pesanan sudah diterima.</p>
        )}
        {sudahGerak && punyaIzin(p.izin, 'stok.saldo', 'L') && d.goodsReceiptLines[0] ? (
          <p className="redup kecil">
            Gerak stok dokumen ini ada di <Link href={`/stok/kartu?produk=${d.goodsReceiptLines[0].productId}&lokasi=${d.locationId}`}>kartu stok</Link>.
          </p>
        ) : null}
        {d.status === 'Diposting' && sisaQty(d.goodsReceiptLines.reduce((n, b) => n.plus(des(b.qty)), des(0)), d.goodsReceiptLines.reduce((n, b) => n.plus(des(b.qtyReturned)), des(0))).gt(0) && punyaIzin(p.izin, 'beli.retur', 'T') ? (
          <p>
            <Link href={`/retur-beli/baru?sumber=gr:${d.id}`}>Buat retur dari penerimaan ini</Link>
          </p>
        ) : null}
      </section>

      {faktur.length || d.purchaseReturns.length ? (
        <section className="kartu" aria-labelledby="j-turunan">
          <h2 id="j-turunan">Dokumen terkait</h2>
          <ul className="bl-turunan">
            {faktur.map((f) => (
              <li key={`f${f.id}`}>
                Faktur <TautanDok p={p} menu="beli.faktur" href={`/faktur/${f.id}`} teks={f.no} /> <LencanaStatus status={f.status} />
              </li>
            ))}
            {d.purchaseReturns.map((r) => (
              <li key={`r${r.id}`}>
                Retur <TautanDok p={p} menu="beli.retur" href={`/retur-beli/${r.id}`} teks={r.no} /> <LencanaStatus status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
