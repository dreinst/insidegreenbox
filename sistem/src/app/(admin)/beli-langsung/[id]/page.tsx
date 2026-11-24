import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaBayar, PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { peringatanKasMinus } from '@/lib/akuntansi/kas-minus'
import { aturanBeli, pilihanBarang, sisaQty, tombolBeli } from '@/lib/beli/dokumen'
import { CARA_BAYAR, butuhSetujuLangsung, muatLangsung, totalLangsung } from '@/lib/beli/langsung'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { formatHarga, formatQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusBarisLangsungAksi, tambahBarisLangsungAksi, ubahKepalaLangsungAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'
import { medanLangsung } from '../medan'

export const metadata: Metadata = { title: 'Pembelian Langsung' }

export default async function RincianLangsung({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.langsung', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatLangsung(db, id), searchParams])
  if (!d) notFound()
  const belumPosting = d.status === 'Draft' || d.status === 'Diajukan'
  const [butuhSetuju, aturan, total] = await Promise.all([butuhSetujuLangsung(db, d), aturanBeli(db, 'direct_purchase'), totalLangsung(db, d.id)])
  const t = tombolBeli(p, 'direct_purchase', d.status, butuhSetuju, d.submittedBy)
  // Saldo kas atau bank yang akan minus hanya diperingatkan (KONTRAK 11 butir 133).
  const peringatan = belumPosting && d.payMode === 'tunai' ? await peringatanKasMinus(db, d.bankAccountId, total) : null
  const catatan =
    belumPosting && butuhSetuju
      ? `Pembelian tunai ${formatRupiah(total)} di atas batas ${aturan?.minAmount !== null && aturan?.minAmount !== undefined ? formatRupiah(aturan.minAmount) : 'persetujuan'}, jadi wajib diajukan dan disetujui Owner sebelum diposting.`
      : undefined
  const [lokasi, pemasok, rekening, barang] = t.ubah
    ? await Promise.all([pilihanLokasi(db), pilihanPemasok(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), pilihanBarang(db)])
    : [[], [], [], []]
  const rek = d.bankAccountId ? await db.bankAccount.findUnique({ where: { id: d.bankAccountId } }) : null
  const cara = (['tunai', 'kredit'] as const).filter((c) => c === d.payMode || saklarNyala(p, c === 'tunai' ? 'beli.langsung_tunai' : 'beli.langsung_kredit')).map((c) => ({ nilai: c, label: CARA_BAYAR[c] }))
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const kredit = d.payMode === 'kredit'
  const barangBaris = d.directPurchaseLines.filter((b) => b.product)
  const bisaRetur = d.status === 'Diposting' && barangBaris.some((b) => sisaQty(b.qty, b.qtyReturned).gt(0)) && punyaIzin(p.izin, 'beli.retur', 'T')
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pembelian langsung ${CARA_BAYAR[d.payMode as keyof typeof CARA_BAYAR]?.toLowerCase() ?? d.payMode} · ${d.supplier.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/beli-langsung', label: 'Pembelian Langsung' }}>
        <LencanaStatus status={d.status} />
        {d.status === 'Diposting' ? <LencanaBayar s={d.payStatus} /> : null}
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <Ringkas
        label="Ringkasan pembelian"
        isi={[
          ['Barang dan biaya', formatRupiah(d.subtotal)],
          ['Biaya tambahan', formatRupiah(d.extraCost)],
          ['Total', formatRupiah(d.total)],
          ...(kredit ? ([['Sisa hutang', formatRupiah(d.status === 'Diposting' ? d.total - d.paidAmount : 0n)]] as [string, string][]) : []),
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaLangsungAksi.bind(null, d.id)}
              medan={medanLangsung(
                {
                  supplierId: String(d.supplierId),
                  locationId: String(d.locationId),
                  date: isoHari(d.date),
                  payMode: d.payMode,
                  sumber: d.bankAccountId ? String(d.bankAccountId) : 'kas',
                  supplierInvoiceNo: d.supplierInvoiceNo,
                  dueDate: isoHari(d.dueDate),
                  extraCost: d.extraCost ? d.extraCost.toString() : '',
                  note: d.note,
                },
                pemasok.map((x) => ({ nilai: String(x.id), label: x.name })),
                lokasi.map((l) => ({ nilai: String(l.id), label: l.name })),
                rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) })),
                cara,
              )}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pemasok</dt>
              <dd>
                <TautanDok p={p} menu="beli.pemasok" href={`/pemasok/${d.supplierId}`} teks={d.supplier.name} />
              </dd>
              <dt>Lokasi</dt>
              <dd>{d.location.name}</dd>
              <dt>Cara bayar</dt>
              <dd>{kredit ? `Kredit, jatuh tempo ${formatTanggal(d.dueDate)}` : `Tunai dari ${rek ? namaRekening(rek) : 'kas'}`}</dd>
              <dt>Nota pemasok</dt>
              <dd>{d.supplierInvoiceNo || '-'}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelBeli
          p={p}
          jenis="direct_purchase"
          d={jejak(d)}
          butuhSetuju={butuhSetuju}
          aksi={aksiPanel('direct_purchase', d.id)}
          catatan={catatan}
          peringatan={peringatan}
          konfirmasiPosting={`Posting ${d.no}? Stok bertambah${kredit ? ' dan hutang tercatat' : ' dan pembayaran tunai tercatat'}.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang dan biaya</h2>
        {d.directPurchaseLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Barang atau biaya</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                  {sudahGerak && lihatNilai ? (
                    <th scope="col" className="angka">
                      Nilai persediaan
                    </th>
                  ) : null}
                  <th scope="col">
                    <span className="sr">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.directPurchaseLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Baris">
                      <span className="tebal">{b.product?.name ?? b.description}</span>
                      <small className="redup blok">{b.product ? b.product.code : 'Hanya biaya, tidak distok'}</small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {b.product ? `${formatQty(b.qty)} ${b.unit?.symbol ?? b.product.baseUnit.symbol}` : '-'}
                    </td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(b.price)}
                    </td>
                    <td data-label="Jumlah" className="angka">
                      {formatRupiah(b.lineTotal)}
                    </td>
                    {sudahGerak && lihatNilai ? (
                      <td data-label="Nilai" className="angka">
                        {b.product ? (
                          <>
                            {formatRupiah(b.value)}
                            <small className="redup blok">
                              {formatHarga(b.unitCost)} per {b.product.baseUnit.symbol}
                            </small>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                    ) : null}
                    <td className="sel-aksi">{t.ubah ? <TombolAksi aksi={hapusBarisLangsungAksi.bind(null, d.id, b.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi="Hapus baris ini?" /> : null}</td>
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
              aksi={tambahBarisLangsungAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'item', label: 'Produk dan satuan', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...barang.map((x) => ({ nilai: x.nilai, label: x.label }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Qty', inputMode: 'decimal', wajib: true, placeholder: '1000' },
                { jenis: 'angka', nama: 'price', label: 'Harga per satuan (Rp)', placeholder: 'Kosong = harga terakhir', bantuan: saklarNyala(p, 'beli.ubah_harga_langsung') ? undefined : 'Berbeda lebih dari batas persen dari harga terakhir butuh saklar Ubah harga pembelian langsung.' },
              ]}
              tombol="Tambah barang"
              kelasTombol="btn sekunder"
            />
            {saklarNyala(p, 'beli.langsung_biaya') ? (
              <>
                <h3>Tambah biaya yang tidak distok</h3>
                <FormMaster
                  aksi={tambahBarisLangsungAksi.bind(null, d.id)}
                  medan={[
                    { jenis: 'teks', nama: 'description', label: 'Keterangan', wajib: true, maxLength: 120, placeholder: 'Gas elpiji' },
                    { jenis: 'angka', nama: 'amount', label: 'Jumlah (Rp)', wajib: true, placeholder: '25000' },
                  ]}
                  tombol="Tambah biaya"
                  kelasTombol="btn sekunder"
                />
              </>
            ) : null}
          </>
        ) : null}
        {sudahGerak && punyaIzin(p.izin, 'stok.saldo', 'L') && barangBaris[0] ? (
          <p className="redup kecil">
            Gerak stok dokumen ini ada di <Link href={`/stok/kartu?produk=${barangBaris[0].productId}&lokasi=${d.locationId}`}>kartu stok</Link>.
          </p>
        ) : null}
        {bisaRetur ? (
          <p>
            <Link href={`/retur-beli/baru?sumber=bl:${d.id}`}>Buat retur dari pembelian ini</Link>
          </p>
        ) : null}
      </section>

      {d.purchaseReturns.length || d.purchasePaymentAllocs.length ? (
        <section className="kartu" aria-labelledby="j-turunan">
          <h2 id="j-turunan">Dokumen terkait</h2>
          <ul className="bl-turunan">
            {d.purchaseReturns.map((r) => (
              <li key={`r${r.id}`}>
                Retur <TautanDok p={p} menu="beli.retur" href={`/retur-beli/${r.id}`} teks={r.no} /> <LencanaStatus status={r.status} />
              </li>
            ))}
            {d.purchasePaymentAllocs.map((a) => (
              <li key={`b${a.id}`}>
                Pembayaran <TautanDok p={p} menu="beli.pembayaran" href={`/pembayaran/${a.purchasePayment.id}`} teks={a.purchasePayment.no} /> {formatRupiah(a.amount)} <LencanaStatus status={a.purchasePayment.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
