import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LencanaBayar, PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { aturanBeli, tombolBeli } from '@/lib/beli/dokumen'
import { JENIS_BARIS_FAKTUR, butuhSetujuFaktur, muatFaktur, penerimaanBelumDifakturkan, persenSelisih, sisaFaktur } from '@/lib/beli/faktur'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatQty, isianQty } from '@/lib/stok/angka'
import { hapusBarisFakturAksi, simpanBarisFakturAksi, tambahBiayaFakturAksi, tarikPenerimaanAksi, ubahKepalaFakturAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Faktur Pembelian' }

export default async function RincianFaktur({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.faktur', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }, aturan] = await Promise.all([muatFaktur(db, id), searchParams, aturanBeli(db, 'purchase_invoice')])
  if (!d) notFound()
  const [butuhSetuju, sel] = await Promise.all([butuhSetujuFaktur(db, d.id), persenSelisih(db, d.id)])
  const t = tombolBeli(p, 'purchase_invoice', d.status, butuhSetuju, d.submittedBy)
  const [pemasok, terbuka] = t.ubah ? await Promise.all([pilihanPemasok(db), penerimaanBelumDifakturkan(db, d.supplierId)]) : [[], []]
  const bolehUbahHarga = saklarNyala(p, 'beli.ubah_harga_faktur')
  const persen = `${sel.persen.toFixed(1).replace('.', ',')}%`
  const catatan =
    d.status === 'Draft' || d.status === 'Diajukan'
      ? butuhSetuju
        ? `Selisih harga ${persen} dari nilai penerimaan, di atas batas ${aturan?.minPct?.toString() ?? '-'}%. Faktur ini perlu diajukan dan disetujui Owner.`
        : sel.beda
          ? `Selisih harga ${persen} dari nilai penerimaan, masih di bawah batas persetujuan.`
          : undefined
      : undefined
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Faktur pembelian · ${d.supplier.name} · nomor pemasok ${d.supplierInvoiceNo}`} jejak={{ href: '/faktur', label: 'Faktur Pembelian' }}>
        <LencanaStatus status={d.status} />
        {d.status === 'Diposting' ? <LencanaBayar s={d.payStatus} /> : null}
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <Ringkas
        label="Ringkasan faktur"
        isi={[
          ['Total faktur', formatRupiah(d.total)],
          ['Nilai penerimaan', formatRupiah(sel.terima)],
          ['Selisih harga', `${formatRupiah(d.priceDiff)} (${persen})`, d.priceDiff < 0n],
          ['Dibayar', formatRupiah(d.paidAmount)],
          ['Sisa', formatRupiah(d.status === 'Diposting' ? d.total - d.paidAmount : 0n)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaFakturAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: String(d.supplierId), pilihan: pemasok.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'teks', nama: 'supplierInvoiceNo', label: 'Nomor faktur pemasok', awal: d.supplierInvoiceNo, wajib: true, maxLength: 40 },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal faktur', awal: isoHari(d.date), wajib: true },
                { jenis: 'tanggal', nama: 'dueDate', label: 'Jatuh tempo', awal: isoHari(d.dueDate) },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pemasok</dt>
              <dd>
                <TautanDok p={p} menu="beli.pemasok" href={`/pemasok/${d.supplierId}`} teks={d.supplier.name} />
              </dd>
              <dt>Tanggal</dt>
              <dd>{formatTanggal(d.date)}</dd>
              <dt>Jatuh tempo</dt>
              <dd>{formatTanggal(d.dueDate)}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelBeli
          p={p}
          jenis="purchase_invoice"
          d={jejak(d)}
          butuhSetuju={butuhSetuju}
          aksi={aksiPanel('purchase_invoice', d.id)}
          catatan={catatan}
          konfirmasiPosting={`Posting ${d.no}? Hutang ke ${d.supplier.name} sebesar ${formatRupiah(d.total)} tercatat.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Baris faktur</h2>
        {t.ubah && d.purchaseInvoiceLines.length ? (
          <>
            <FormIsianBaris
              aksi={simpanBarisFakturAksi.bind(null, d.id)}
              judulKolom="Barang atau biaya"
              kolom={[
                { kunci: 'asal', label: 'Penerimaan' },
                { kunci: 'terima', label: 'Harga terima', angka: true },
                { kunci: 'sisa', label: 'Belum difakturkan', angka: true },
                { kunci: 'jumlah', label: 'Jumlah', angka: true },
              ]}
              isian={[
                { awalan: 'qty', label: 'Qty faktur' },
                { awalan: 'price', label: 'Harga faktur', inputMode: 'numeric' },
              ]}
              baris={d.purchaseInvoiceLines.map((b) => {
                const g = b.goodsReceiptLine
                return {
                  id: String(b.id),
                  judul: g ? g.product.name : b.description,
                  kecil: JENIS_BARIS_FAKTUR[b.kind as keyof typeof JENIS_BARIS_FAKTUR] ?? b.kind,
                  sel: {
                    asal: b.goodsReceipt?.no ?? '-',
                    terima: g ? formatRupiah(g.price) : b.kind === 'biaya_terima' ? formatRupiah(b.goodsReceipt!.extraCost) : '-',
                    sisa: g ? `${formatQty(sisaFaktur(g))} ${g.unit.symbol}` : '-',
                    jumlah: formatRupiah(b.lineTotal),
                  },
                  nilai: { qty: b.kind === 'barang' ? isianQty(b.qty) : '1', price: b.price.toString() },
                  mati: b.kind !== 'barang' ? ['qty', ...(b.kind === 'biaya_terima' && !bolehUbahHarga ? ['price'] : [])] : bolehUbahHarga ? undefined : ['qty', 'price'],
                }
              })}
              tombol="Simpan qty dan harga"
              catatan={bolehUbahHarga ? 'Harga atau qty yang berbeda dari penerimaan dicatat sebagai selisih harga. Qty hanya boleh lebih kecil.' : 'Qty dan harga mengikuti penerimaan karena kamu tidak punya saklar Ubah harga faktur.'}
            />
            <details className="bl-lipat">
            <summary>Hapus baris</summary>
            <ul className="bl-turunan" aria-label="Hapus baris">
              {d.purchaseInvoiceLines.map((b) => (
                <li key={b.id}>
                  <TombolAksi aksi={hapusBarisFakturAksi.bind(null, d.id, b.id)} label={`Hapus ${b.goodsReceiptLine?.product.name ?? b.description}${b.goodsReceipt ? ` (${b.goodsReceipt.no})` : ''}`} kelas="btn kecil sekunder" konfirmasi="Hapus baris ini dari faktur?" />
                </li>
              ))}
            </ul>
          </details>
          </>
        ) : d.purchaseInvoiceLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Barang atau biaya</th>
                  <th scope="col">Penerimaan</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                  <th scope="col" className="angka">
                    Selisih harga
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.purchaseInvoiceLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Baris">
                      <span className="tebal">{b.goodsReceiptLine?.product.name ?? b.description}</span>
                      <small className="redup blok">{JENIS_BARIS_FAKTUR[b.kind as keyof typeof JENIS_BARIS_FAKTUR] ?? b.kind}</small>
                    </td>
                    <td data-label="Penerimaan">{b.goodsReceipt ? <TautanDok p={p} menu="beli.penerimaan" href={`/penerimaan/${b.goodsReceipt.id}`} teks={b.goodsReceipt.no} /> : '-'}</td>
                    <td data-label="Qty" className="angka">
                      {b.goodsReceiptLine ? `${formatQty(b.qty)} ${b.goodsReceiptLine.unit.symbol}` : '-'}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Jumlah" className="angka">
                      {formatRupiah(b.lineTotal)}
                    </td>
                    <td data-label="Selisih" className="angka">
                      {formatRupiah(b.priceDiff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris. Tarik dari penerimaan barang di bawah.</p>
        )}
        {t.ubah ? (
          <>
            <h3>Ambil dari penerimaan</h3>
            {terbuka.length ? (
              <FormMaster
                aksi={tarikPenerimaanAksi.bind(null, d.id)}
                medan={[
                  {
                    jenis: 'pilih',
                    nama: 'goodsReceiptId',
                    label: 'Penerimaan Diposting yang belum difakturkan',
                    pilihan: [{ nilai: '', label: 'Pilih penerimaan' }, ...terbuka.map((g) => ({ nilai: String(g.id), label: `${g.no} · ${formatTanggal(g.date)} · ${g.goodsReceiptLines.length} barang` }))],
                    wajib: true,
                    lebar: true,
                    bantuan: 'Semua baris yang belum difakturkan ikut tertarik dengan qty sisa dan harga terima, beserta biaya tambahannya.',
                  },
                ]}
                tombol="Tarik ke faktur"
                kelasTombol="btn sekunder"
              />
            ) : (
              <p className="redup kecil">Tidak ada penerimaan {d.supplier.name} yang menunggu faktur.</p>
            )}
            <h3>Tambah baris jasa atau biaya</h3>
            <FormMaster
              aksi={tambahBiayaFakturAksi.bind(null, d.id)}
              medan={[
                { jenis: 'teks', nama: 'description', label: 'Keterangan', wajib: true, maxLength: 120, placeholder: 'Servis mesin kopi' },
                { jenis: 'angka', nama: 'amount', label: 'Jumlah (Rp)', wajib: true, placeholder: '150000' },
              ]}
              tombol="Tambah baris biaya"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>

      {d.purchasePaymentAllocs.length ? (
        <section className="kartu" aria-labelledby="j-bayar">
          <h2 id="j-bayar">Pembayaran</h2>
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
