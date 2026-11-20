import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanJual } from '@/components/b2b'
import { LencanaBayar, PanelBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { muatFakturJual, sisaPesanan } from '@/lib/b2b/faktur'
import { pilihanBarangJual, pilihanPelanggan } from '@/lib/b2b/umum'
import { tombolBeli } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusBarisFakturJualAksi, simpanBarisFakturJualAksi, tambahBarisFakturJualAksi, ubahKepalaFakturJualAksi } from '../../_jual/aksi'
import { aksiPanelJual, isoHari, jejak } from '../../_jual/panel'

export const metadata: Metadata = { title: 'Faktur Penjualan' }

export default async function RincianFakturJual({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('b2b.faktur', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatFakturJual(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'sales_invoice', d.status, false, d.submittedBy)
  const [lokasi, pelanggan, barang] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanPelanggan(db), d.salesOrderId ? [] : pilihanBarangJual(db)]) : [[], [], []]
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const diposting = d.status === 'Diposting'
  const retur = d.salesReturns.filter((r) => r.status === 'Diposting').reduce((n, r) => n + r.total, 0n)
  const bolehRetur = diposting && punyaIzin(p.izin, 'b2b.retur', 'T') && d.salesInvoiceLines.some((b) => b.qtyReturned.lt(b.qty))
  const bolehTerima = diposting && d.payStatus !== 'Lunas' && punyaIzin(p.izin, 'b2b.penerimaan', 'T')
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Faktur penjualan · ${d.customer.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/faktur-jual', label: 'Faktur Penjualan' }}>
        <LencanaStatus status={d.status} />
        {diposting ? <LencanaBayar s={d.payStatus} /> : null}
        {bolehTerima ? (
          <Link href={`/terima-pelanggan/baru?pelanggan=${d.customerId}`} className="btn">
            Catat penerimaan
          </Link>
        ) : null}
        {bolehRetur ? (
          <Link href={`/retur-jual/baru?faktur=${d.id}`} className="btn sekunder">
            Buat retur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={pesan} />
      <Ringkas
        label="Ringkasan faktur"
        isi={[
          ['Total faktur', formatRupiah(d.total)],
          ...(lihatNilai && diposting ? ([['HPP', formatRupiah(d.hpp)]] as [string, string][]) : []),
          ['Diterima', formatRupiah(d.paidAmount)],
          ['Sisa piutang', formatRupiah(diposting ? d.total - d.paidAmount : 0n)],
          ...(retur ? ([['Nota kredit retur', formatRupiah(retur)]] as [string, string][]) : []),
          ['Jatuh tempo', formatTanggal(d.dueDate)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaFakturJualAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: String(d.customerId), pilihan: pelanggan.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi kirim', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal faktur', awal: isoHari(d.date), wajib: true },
                { jenis: 'tanggal', nama: 'dueDate', label: 'Jatuh tempo', awal: isoHari(d.dueDate), bantuan: 'Kosong = tanggal faktur + termin pelanggan.' },
                { jenis: 'teks', nama: 'customerRef', label: 'Nomor PO pelanggan', awal: d.customerRef, maxLength: 40 },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pelanggan</dt>
              <dd>{punyaIzin(p.izin, 'b2b.pelanggan', 'L') ? <Link href={`/pelanggan/${d.customerId}`}>{d.customer.name}</Link> : d.customer.name}</dd>
              <dt>Pesanan</dt>
              <dd>{d.salesOrder ? <TautanDok p={p} menu="b2b.pesanan" href={`/pesanan-jual/${d.salesOrder.id}`} teks={d.salesOrder.no} /> : 'Tanpa pesanan'}</dd>
              <dt>Lokasi kirim</dt>
              <dd>{d.location.name}</dd>
              <dt>Nomor PO pelanggan</dt>
              <dd>{d.customerRef || '-'}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelBeli
          p={p}
          jenis="sales_invoice"
          d={jejak(d)}
          butuhSetuju={false}
          aksi={aksiPanelJual('sales_invoice', d.id)}
          catatan={d.status === 'Draft' || d.status === 'Diajukan' ? 'Saat diposting, barang keluar dari lokasi kirim dan faktur menjadi piutang pelanggan.' : undefined}
          konfirmasiPosting={`Posting ${d.no}? Barang keluar dari ${d.location.name} dan faktur tidak bisa diubah lagi.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang dikirim dan ditagih</h2>
        {t.ubah && d.salesInvoiceLines.length ? (
          <FormIsianBaris
            aksi={simpanBarisFakturJualAksi.bind(null, d.id)}
            kolom={[
              { kunci: 'satuan', label: 'Satuan' },
              { kunci: 'sisa', label: 'Sisa pesanan', angka: true },
              { kunci: 'jumlah', label: 'Jumlah', angka: true },
            ]}
            isian={[
              { awalan: 'qty', label: 'Qty' },
              { awalan: 'price', label: 'Harga per satuan', inputMode: 'numeric' },
            ]}
            baris={d.salesInvoiceLines.map((b) => ({
              id: String(b.id),
              judul: b.product.name,
              kecil: b.product.code,
              sel: { satuan: b.unit.symbol, sisa: b.salesOrderLine ? `${formatQty(sisaPesanan(b.salesOrderLine))} ${b.unit.symbol}` : '-', jumlah: formatRupiah(b.lineTotal) },
              nilai: { qty: isianQty(b.qty), price: b.price.toString() },
            }))}
            tombol="Simpan qty dan harga"
            catatan={d.salesOrderId ? 'Qty tidak boleh melebihi sisa pesanan. Faktur sebagian boleh; sisanya bisa difakturkan di faktur berikutnya.' : undefined}
          />
        ) : d.salesInvoiceLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                  {lihatNilai && diposting ? (
                    <th scope="col" className="angka">
                      HPP
                    </th>
                  ) : null}
                  <th scope="col" className="angka">
                    Diretur
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.salesInvoiceLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.unit.symbol}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Jumlah" className="angka">
                      {formatRupiah(b.lineTotal)}
                    </td>
                    {lihatNilai && diposting ? (
                      <td data-label="HPP" className="angka">
                        {formatRupiah(b.value)}
                      </td>
                    ) : null}
                    <td data-label="Diretur" className="angka">
                      {b.qtyReturned.gt(0) ? `${formatQty(b.qtyReturned)} ${b.unit.symbol}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {t.ubah && d.salesInvoiceLines.length ? (
          <details className="bl-lipat">
            <summary>Hapus baris</summary>
            <ul className="bl-turunan" aria-label="Hapus baris">
              {d.salesInvoiceLines.map((b) => (
                <li key={b.id}>
                  <TombolAksi aksi={hapusBarisFakturJualAksi.bind(null, d.id, b.id)} label={`Hapus ${b.product.name}`} kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {t.ubah && !d.salesOrderId ? (
          <>
            <h3>Tambah barang</h3>
            <FormMaster
              aksi={tambahBarisFakturJualAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'item', label: 'Produk dan satuan', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...barang.map((x) => ({ nilai: x.nilai, label: x.label }))], lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Qty', inputMode: 'decimal', placeholder: '2', bantuan: 'Dalam satuan yang dipilih.' },
                { jenis: 'angka', nama: 'price', label: 'Harga per satuan (Rp)', placeholder: 'Kosong = harga khusus', bantuan: 'Harga bersih tanpa PPN.' },
              ]}
              tombol="Tambah baris"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>

      {d.customerPaymentAllocs.length || d.salesReturns.length ? (
        <section className="kartu" aria-labelledby="j-turunan">
          <h2 id="j-turunan">Penerimaan dan retur</h2>
          <ul className="bl-turunan">
            {d.customerPaymentAllocs.map((a) => (
              <li key={a.id}>
                <TautanDok p={p} menu="b2b.penerimaan" href={`/terima-pelanggan/${a.customerPayment.id}`} teks={a.customerPayment.no} /> {formatRupiah(a.amount)} <LencanaStatus status={a.customerPayment.status} />
              </li>
            ))}
            {d.salesReturns.map((r) => (
              <li key={r.id}>
                <TautanDok p={p} menu="b2b.retur" href={`/retur-jual/${r.id}`} teks={r.no} /> <LencanaStatus status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
