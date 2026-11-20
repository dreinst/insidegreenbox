import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanJual } from '@/components/b2b'
import { LencanaProgres, PanelBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { butuhSetujuPesananJual, muatPesananJual } from '@/lib/b2b/pesanan'
import { pilihanBarangJual, pilihanPelanggan } from '@/lib/b2b/umum'
import { nilaiBaris, sisaQty, tombolBeli } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusBarisPesananJualAksi, simpanBarisPesananJualAksi, tambahBarisPesananJualAksi, ubahKepalaPesananJualAksi } from '../../_jual/aksi'
import { aksiPanelJual, isoHari, jejak } from '../../_jual/panel'

export const metadata: Metadata = { title: 'Pesanan Penjualan' }

export default async function RincianPesananJual({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('b2b.pesanan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPesananJual(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await butuhSetujuPesananJual(db, d.total)
  const t = tombolBeli(p, 'sales_order', d.status, butuhSetuju, d.submittedBy)
  const [lokasi, pelanggan, barang] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanPelanggan(db), pilihanBarangJual(db)]) : [[], [], []]
  const bolehFaktur = d.status === 'Disetujui' && punyaIzin(p.izin, 'b2b.faktur', 'T')
  const catatan = d.status === 'Draft' && !butuhSetuju ? 'Pesanan tanpa aturan persetujuan cukup dikonfirmasi dengan Setujui sekarang.' : undefined
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pesanan penjualan · ${d.customer.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/pesanan-jual', label: 'Pesanan Penjualan' }}>
        <LencanaStatus status={d.status} />
        {bolehFaktur ? (
          <Link href={`/faktur-jual/baru?so=${d.id}`} className="btn">
            Buat faktur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={pesan} />
      <Ringkas
        label="Ringkasan pesanan"
        isi={[
          ['Total', formatRupiah(d.total)],
          ['Baris', String(d.salesOrderLines.length)],
          ['Progres faktur', d.invoiceProgress],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPesananJualAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: String(d.customerId), pilihan: pelanggan.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi kirim', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoHari(d.date), wajib: true },
                { jenis: 'tanggal', nama: 'requiredDate', label: 'Tanggal kirim', awal: isoHari(d.requiredDate) },
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
              <dt>Lokasi kirim</dt>
              <dd>{d.location.name}</dd>
              <dt>Tanggal kirim</dt>
              <dd>{formatTanggal(d.requiredDate)}</dd>
              <dt>Nomor PO pelanggan</dt>
              <dd>{d.customerRef || '-'}</dd>
              <dt>Progres faktur</dt>
              <dd>
                <LencanaProgres p={d.invoiceProgress} />
              </dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
              {d.closeReason ? (
                <>
                  <dt>Alasan selesai</dt>
                  <dd>{d.closeReason}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
        <PanelBeli p={p} jenis="sales_order" d={jejak(d)} selesai={{ at: d.closedAt, alasan: d.closeReason }} butuhSetuju={butuhSetuju} aksi={aksiPanelJual('sales_order', d.id)} catatan={catatan} />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang dipesan</h2>
        {t.ubah && d.salesOrderLines.length ? (
          <FormIsianBaris
            aksi={simpanBarisPesananJualAksi.bind(null, d.id)}
            kolom={[
              { kunci: 'satuan', label: 'Satuan' },
              { kunci: 'jumlah', label: 'Jumlah', angka: true },
            ]}
            isian={[
              { awalan: 'qty', label: 'Qty' },
              { awalan: 'price', label: 'Harga per satuan', inputMode: 'numeric' },
            ]}
            baris={d.salesOrderLines.map((b) => ({
              id: String(b.id),
              judul: b.product.name,
              kecil: b.product.code,
              sel: { satuan: b.unit.symbol, jumlah: formatRupiah(nilaiBaris(b.qty, b.price)) },
              nilai: { qty: isianQty(b.qty), price: b.price.toString() },
            }))}
            tombol="Simpan qty dan harga"
            catatan={saklarNyala(p, 'b2b.ubah_harga') ? 'Harga bawaan adalah harga khusus pelanggan.' : 'Harga produk yang punya harga khusus harus sama dengan harga itu karena kamu tidak punya saklar Ubah harga jual B2B.'}
          />
        ) : d.salesOrderLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty pesan
                  </th>
                  <th scope="col" className="angka">
                    Difakturkan
                  </th>
                  <th scope="col" className="angka">
                    Sisa
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.salesOrderLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty pesan" className="angka">
                      {formatQty(b.qty)} {b.unit.symbol}
                    </td>
                    <td data-label="Difakturkan" className="angka">
                      {formatQty(b.qtyInvoiced)} {b.unit.symbol}
                    </td>
                    <td data-label="Sisa" className="angka">
                      {formatQty(sisaQty(b.qty, b.qtyInvoiced))} {b.unit.symbol}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Jumlah" className="angka">
                      {formatRupiah(nilaiBaris(b.qty, b.price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {t.ubah && d.salesOrderLines.length ? (
          <details className="bl-lipat">
            <summary>Hapus baris</summary>
            <ul className="bl-turunan" aria-label="Hapus baris">
              {d.salesOrderLines.map((b) => (
                <li key={b.id}>
                  <TombolAksi aksi={hapusBarisPesananJualAksi.bind(null, d.id, b.id)} label={`Hapus ${b.product.name}`} kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {t.ubah ? (
          <>
            <h3>Tambah barang</h3>
            <FormMaster
              aksi={tambahBarisPesananJualAksi.bind(null, d.id)}
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

      {d.salesInvoices.length ? (
        <section className="kartu" aria-labelledby="j-faktur">
          <h2 id="j-faktur">Faktur penjualan</h2>
          <ul className="bl-turunan">
            {d.salesInvoices.map((g) => (
              <li key={g.id}>
                <TautanDok p={p} menu="b2b.faktur" href={`/faktur-jual/${g.id}`} teks={g.no} /> <LencanaStatus status={g.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
