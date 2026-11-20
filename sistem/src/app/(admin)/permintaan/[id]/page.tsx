import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaProgres, PanelBeli, PesanBeli } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { pilihanBarang, tombolBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { KAIT_PERMINTAAN, muatPermintaan } from '@/lib/beli/permintaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { des, formatQty } from '@/lib/stok/angka'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusBarisPermintaanAksi, pesanDariPermintaanAksi, tambahBarisPermintaanAksi, ubahKepalaPermintaanAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Permintaan Pembelian' }

export default async function RincianPermintaan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.permintaan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPermintaan(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await db.$transaction((tx) => KAIT_PERMINTAAN.butuhSetuju(tx, d))
  const t = tombolBeli(p, 'purchase_request', d.status, butuhSetuju, d.submittedBy)
  const [lokasi, barang] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanBarang(db)]) : [[], []]
  const adaSisa = d.purchaseRequestLines.some((b) => des(b.qty).gt(des(b.qtyOrdered)))
  const bolehPesan = d.status === 'Disetujui' && adaSisa && punyaIzin(p.izin, 'beli.pesanan', 'T')
  const pemasok = bolehPesan ? await pilihanPemasok(db) : []
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Permintaan pembelian · ${d.location.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/permintaan', label: 'Permintaan Pembelian' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPermintaanAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi tujuan', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoHari(d.date), wajib: true },
                { jenis: 'tanggal', nama: 'requiredDate', label: 'Tanggal dibutuhkan', awal: isoHari(d.requiredDate) },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Lokasi</dt>
              <dd>{d.location.name}</dd>
              <dt>Dibutuhkan</dt>
              <dd>{formatTanggal(d.requiredDate)}</dd>
              <dt>Progres pesan</dt>
              <dd>
                <LencanaProgres p={d.orderProgress} />
              </dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
              {d.closeReason ? (
                <>
                  <dt>Alasan tutup sisa</dt>
                  <dd>{d.closeReason}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
        <PanelBeli p={p} jenis="purchase_request" d={jejak(d)} butuhSetuju={butuhSetuju} aksi={aksiPanel('purchase_request', d.id)} />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang yang diminta</h2>
        {d.purchaseRequestLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  <th scope="col" className="angka">
                    Sudah dipesan
                  </th>
                  <th scope="col">Pesanan</th>
                  <th scope="col">Catatan</th>
                  <th scope="col">
                    <span className="sr">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.purchaseRequestLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.unit.symbol}
                    </td>
                    <td data-label="Dipesan" className="angka">
                      {formatQty(b.qtyOrdered)} {b.unit.symbol}
                    </td>
                    <td data-label="Pesanan">
                      {b.purchaseOrderLines.length
                        ? b.purchaseOrderLines.map((x, i) => (
                            <span key={x.id}>
                              {i ? ', ' : ''}
                              {punyaIzin(p.izin, 'beli.pesanan', 'L') ? <Link href={`/pesanan/${x.purchaseOrder.id}`}>{x.purchaseOrder.no}</Link> : x.purchaseOrder.no} ({x.purchaseOrder.status})
                            </span>
                          ))
                        : '-'}
                    </td>
                    <td data-label="Catatan">{b.note || '-'}</td>
                    <td className="sel-aksi">{t.ubah ? <TombolAksi aksi={hapusBarisPermintaanAksi.bind(null, d.id, b.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {t.ubah ? (
          <>
            <h3>Tambah barang</h3>
            <FormMaster
              aksi={tambahBarisPermintaanAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'item', label: 'Produk dan satuan', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...barang.map((x) => ({ nilai: x.nilai, label: x.label }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Qty', inputMode: 'decimal', wajib: true, placeholder: '2', bantuan: 'Dalam satuan yang dipilih. Pakai koma untuk desimal.' },
                { jenis: 'teks', nama: 'lineNote', label: 'Catatan baris', maxLength: 120 },
              ]}
              tombol="Tambah baris"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
        {bolehPesan ? (
          <details className="bl-lipat" open>
            <summary>Buat pesanan dari permintaan ini</summary>
            <p className="redup kecil">Sisa qty tiap baris menjadi baris pesanan dengan harga terakhir produk. Harga dan qty bisa diubah di draf pesanan.</p>
            <FormMaster
              aksi={pesanDariPermintaanAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', pilihan: [{ nilai: '', label: 'Pilih pemasok' }, ...pemasok.map((x) => ({ nilai: String(x.id), label: x.name }))], wajib: true },
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi terima', awal: String(d.locationId), pilihan: [{ nilai: String(d.locationId), label: d.location.name }], wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal pesanan', awal: hariIni().toISOString().slice(0, 10), wajib: true },
              ]}
              tombol="Buat draf pesanan"
            />
          </details>
        ) : null}
      </section>
    </>
  )
}
