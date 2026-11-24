import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaProgres, PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { nilaiBaris, pilihanBarang, sisaQty, tombolBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { barisPermintaanTerbuka } from '@/lib/beli/permintaan'
import { butuhSetujuPesanan, muatPesanan } from '@/lib/beli/pesanan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusBarisPesananAksi, simpanBarisPesananAksi, tambahBarisPesananAksi, ubahKepalaPesananAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Pesanan Pembelian' }

export default async function RincianPesanan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.pesanan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPesanan(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await butuhSetujuPesanan(db, d.total)
  const t = tombolBeli(p, 'purchase_order', d.status, butuhSetuju, d.submittedBy, { bolehTutup: saklarNyala(p, 'beli.tutup_po') })
  const [lokasi, pemasok, barang, prTerbuka] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanPemasok(db), pilihanBarang(db), barisPermintaanTerbuka(db)]) : [[], [], [], []]
  const catatan = d.status === 'Draft' && butuhSetuju ? 'Semua pesanan pembelian perlu diajukan dan disetujui Owner. Admin hanya bisa mengajukan.' : undefined
  const bolehTerima = d.status === 'Disetujui' && punyaIzin(p.izin, 'beli.penerimaan', 'T')
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pesanan pembelian · ${d.supplier.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/pesanan', label: 'Pesanan Pembelian' }}>
        <LencanaStatus status={d.status} />
        {bolehTerima ? (
          <Link href={`/penerimaan/baru?po=${d.id}`} className="btn">
            Terima barang
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <Ringkas
        label="Ringkasan pesanan"
        isi={[
          ['Total', formatRupiah(d.total)],
          ['Baris', String(d.purchaseOrderLines.length)],
          ['Progres terima', d.receiveProgress],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPesananAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: String(d.supplierId), pilihan: pemasok.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi terima', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoHari(d.date), wajib: true },
                { jenis: 'tanggal', nama: 'expectedDate', label: 'Perkiraan tiba', awal: isoHari(d.expectedDate) },
                { jenis: 'area', nama: 'note', label: 'Catatan untuk pemasok', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pemasok</dt>
              <dd>{punyaIzin(p.izin, 'beli.pemasok', 'L') ? <Link href={`/pemasok/${d.supplierId}`}>{d.supplier.name}</Link> : d.supplier.name}</dd>
              <dt>Lokasi terima</dt>
              <dd>{d.location.name}</dd>
              <dt>Perkiraan tiba</dt>
              <dd>{formatTanggal(d.expectedDate)}</dd>
              <dt>Progres terima</dt>
              <dd>
                <LencanaProgres p={d.receiveProgress} />
              </dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
              {d.closeReason ? (
                <>
                  <dt>Alasan selesai</dt>
                  <dd>{d.closeReason}</dd>
                </>
              ) : null}
              {d.legacyNo ? (
                <>
                  <dt>Nomor admin lama</dt>
                  <dd>{d.legacyNo}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
        <PanelBeli p={p} jenis="purchase_order" d={jejak(d)} selesai={{ at: d.closedAt, alasan: d.closeReason }} butuhSetuju={butuhSetuju} aksi={aksiPanel('purchase_order', d.id)} catatan={catatan} bolehTutup={saklarNyala(p, 'beli.tutup_po')} />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang dipesan</h2>
        {t.ubah && d.purchaseOrderLines.length ? (
          <FormIsianBaris
            aksi={simpanBarisPesananAksi.bind(null, d.id)}
            kolom={[
              { kunci: 'satuan', label: 'Satuan' },
              { kunci: 'pr', label: 'Permintaan' },
              { kunci: 'jumlah', label: 'Jumlah', angka: true },
            ]}
            isian={[
              { awalan: 'qty', label: 'Qty' },
              { awalan: 'price', label: 'Harga per satuan', inputMode: 'numeric' },
            ]}
            baris={d.purchaseOrderLines.map((b) => ({
              id: String(b.id),
              judul: b.product.name,
              kecil: b.isFree ? 'Barang bonus (harga 0)' : b.product.code,
              sel: { satuan: b.unit.symbol, pr: b.purchaseRequestLine?.purchaseRequest.no ?? '-', jumlah: formatRupiah(b.isFree ? 0n : nilaiBaris(b.qty, b.price)) },
              nilai: { qty: isianQty(b.qty), price: b.price.toString() },
              mati: b.isFree ? ['price'] : undefined,
            }))}
            tombol="Simpan qty dan harga"
            catatan={saklarNyala(p, 'beli.ubah_harga_po') ? 'Harga bawaan adalah harga terakhir produk.' : 'Harga harus sama dengan harga terakhir produk karena kamu tidak punya saklar Ubah harga pesanan.'}
          />
        ) : d.purchaseOrderLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty pesan
                  </th>
                  <th scope="col" className="angka">
                    Diterima
                  </th>
                  <th scope="col" className="angka">
                    Sisa
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col">Permintaan</th>
                </tr>
              </thead>
              <tbody>
                {d.purchaseOrderLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.isFree ? 'Barang bonus' : b.product.code}</small>
                    </td>
                    <td data-label="Qty pesan" className="angka">
                      {formatQty(b.qty)} {b.unit.symbol}
                    </td>
                    <td data-label="Diterima" className="angka">
                      {formatQty(b.qtyReceived)} {b.unit.symbol}
                    </td>
                    <td data-label="Sisa" className="angka">
                      {formatQty(sisaQty(b.qty, b.qtyReceived))} {b.unit.symbol}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Permintaan">
                      {b.purchaseRequestLine ? <TautanDok p={p} menu="beli.permintaan" href={`/permintaan/${b.purchaseRequestLine.purchaseRequest.id}`} teks={b.purchaseRequestLine.purchaseRequest.no} /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {t.ubah && d.purchaseOrderLines.length ? (
          <details className="bl-lipat">
            <summary>Hapus baris</summary>
            <ul className="bl-turunan" aria-label="Hapus baris">
            {d.purchaseOrderLines.map((b) => (
              <li key={b.id}>
                <TombolAksi aksi={hapusBarisPesananAksi.bind(null, d.id, b.id)} label={`Hapus ${b.product.name}`} kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} />
              </li>
            ))}
          </ul>
          </details>
        ) : null}
        {t.ubah ? (
          <>
            <h3>Tambah barang</h3>
            <FormMaster
              aksi={tambahBarisPesananAksi.bind(null, d.id)}
              medan={[
                ...(prTerbuka.length
                  ? [
                      {
                        jenis: 'pilih' as const,
                        nama: 'prLineId',
                        label: 'Dari permintaan',
                        pilihan: [
                          { nilai: '', label: saklarNyala(p, 'beli.po_tanpa_pr') ? 'Tanpa permintaan' : 'Pilih baris permintaan' },
                          ...prTerbuka.map((b) => ({ nilai: String(b.id), label: `${b.purchaseRequest.no} · ${b.product.name} · sisa ${formatQty(sisaQty(b.qty, b.qtyOrdered))} ${b.unit.symbol}` })),
                        ],
                        lebar: true,
                        bantuan: 'Bila dipilih, produk, satuan, dan qty bawaan diambil dari permintaan.',
                      },
                    ]
                  : []),
                { jenis: 'pilih', nama: 'item', label: 'Produk dan satuan', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...barang.map((x) => ({ nilai: x.nilai, label: x.label }))], lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Qty', inputMode: 'decimal', placeholder: '2', bantuan: 'Dalam satuan yang dipilih.' },
                { jenis: 'angka', nama: 'price', label: 'Harga per satuan (Rp)', placeholder: 'Kosong = harga terakhir', bantuan: 'Harga bersih tanpa PPN.' },
                { jenis: 'centang', nama: 'isFree', label: 'Barang bonus (harga 0)' },
              ]}
              tombol="Tambah baris"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>

      {d.goodsReceipts.length ? (
        <section className="kartu" aria-labelledby="j-terima">
          <h2 id="j-terima">Penerimaan barang</h2>
          <ul className="bl-turunan">
            {d.goodsReceipts.map((g) => (
              <li key={g.id}>
                <TautanDok p={p} menu="beli.penerimaan" href={`/penerimaan/${g.id}`} teks={g.no} /> <LencanaStatus status={g.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
