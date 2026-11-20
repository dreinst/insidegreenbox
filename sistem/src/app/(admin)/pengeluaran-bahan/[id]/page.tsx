import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster } from '@/components/form-master'
import { PesanProduksi } from '@/components/produksi'
import { FormQty } from '@/components/produksi-form'
import { LencanaStatus, formatTanggal, isoTanggal } from '@/components/stok'
import { PanelTindakan } from '@/components/stok-dok'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { JENIS_KELUAR, KAIT_PENGELUARAN, muatPengeluaran } from '@/lib/produksi/pengeluaran'
import { batasKeluar, bersihKeluar } from '@/lib/produksi/perintah'
import { des, formatHarga, formatNilai, formatQty, isianQty, keRupiah } from '@/lib/stok/angka'
import { tombolStatus } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusPengeluaranAksi, statusPengeluaranAksi, ubahKepalaPengeluaranAksi, ubahQtyPengeluaranAksi } from '../aksi'

export const metadata: Metadata = { title: 'Pengeluaran Bahan' }

export default async function RincianPengeluaran({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('produksi.pengeluaran', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPengeluaran(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await db.$transaction((tx) => KAIT_PENGELUARAN.butuhSetuju(tx, d))
  const t = tombolStatus(p, 'material_issue', d.status, butuhSetuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const lokasi = t.ubah ? await pilihanLokasi(db) : []
  const keluar = d.kind === 'keluar'
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const baris = d.materialIssueLines.filter((b) => t.ubah || des(b.qty).gt(0))
  // Nilai dari ledger (gerak asal), sama dengan yang dipindah ke atau dari barang dalam proses.
  const nilaiLedger = sudahGerak ? ((await db.stockLedger.aggregate({ where: { docType: 'material_issue', docId: d.id, isReversal: false }, _sum: { value: true } }))._sum.value ?? 0n) : 0n
  const nilai = nilaiLedger < 0n ? -nilaiLedger : nilaiLedger
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`${JENIS_KELUAR[d.kind as keyof typeof JENIS_KELUAR] ?? d.kind} · ${d.location.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/pengeluaran-bahan', label: 'Pengeluaran Bahan' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanProduksi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          <dl className="rincian">
            <dt>Perintah produksi</dt>
            <dd>
              <Link href={`/perintah-produksi/${d.productionOrderId}`}>{d.productionOrder.no}</Link> · {d.productionOrder.bom.product?.name ?? d.productionOrder.bom.name}
            </dd>
            <dt>Jenis</dt>
            <dd>{JENIS_KELUAR[d.kind as keyof typeof JENIS_KELUAR] ?? d.kind}</dd>
          </dl>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPengeluaranAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi bahan', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoTanggal(d.date), wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Lokasi</dt>
              <dd>{d.location.name}</dd>
              <dt>Tanggal</dt>
              <dd>{formatTanggal(d.date)}</dd>
              {lihatNilai && sudahGerak ? (
                <>
                  <dt>Nilai {keluar ? 'ke proses' : 'kembali dari proses'}</dt>
                  <dd>{formatNilai(nilai)}</dd>
                </>
              ) : null}
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelTindakan
          p={p}
          jenis="material_issue"
          d={d}
          butuhSetuju={butuhSetuju}
          catatan={d.status === 'Draft' ? (keluar ? 'Saat Diposting, bahan keluar dari lokasi dengan harga rata-rata dan nilainya menjadi barang dalam proses perintah ini.' : 'Saat Diposting, bahan kembali ke lokasi dengan harga keluar terakhir perintah ini.') : undefined}
          aksi={{
            ajukan: statusPengeluaranAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusPengeluaranAksi.bind(null, d.id, 'kembalikan'),
            posting: statusPengeluaranAksi.bind(null, d.id, 'posting'),
            batal: statusPengeluaranAksi.bind(null, d.id, 'batal'),
            hapus: hapusPengeluaranAksi.bind(null, d.id),
          }}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Bahan</h2>
        {t.ubah ? (
          <>
            <p className="redup kecil">{keluar ? 'Qty bawaan adalah sisa kebutuhan. Isi 0 untuk bahan yang tidak dikeluarkan sekarang.' : 'Isi qty yang kembali dari proses. Tidak boleh melebihi qty bersih yang sudah keluar.'}</p>
            <FormQty
              aksi={ubahQtyPengeluaranAksi.bind(null, d.id)}
              kolom={keluar ? ['Kebutuhan', 'Batas', 'Sudah keluar'] : ['Kebutuhan', 'Bersih keluar']}
              labelQty={keluar ? 'Qty keluar' : 'Qty kembali'}
              tombol="Simpan qty"
              baris={baris.map((b) => {
                const l = b.productionOrderLine
                const sat = b.product.baseUnit.symbol
                return {
                  id: b.id,
                  nama: b.product.name,
                  kode: b.product.code,
                  satuan: sat,
                  sel: keluar ? [`${formatQty(l.requiredQty)} ${sat}`, formatQty(batasKeluar(l)), formatQty(bersihKeluar(l))] : [`${formatQty(l.requiredQty)} ${sat}`, formatQty(bersihKeluar(l))],
                  qty: isianQty(b.qty),
                }
              })}
            />
          </>
        ) : baris.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Bahan</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  {lihatNilai ? (
                    <>
                      <th scope="col" className="angka">
                        Harga satuan
                      </th>
                      <th scope="col" className="angka">
                        Nilai
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Bahan">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.product.baseUnit.symbol}
                    </td>
                    {lihatNilai ? (
                      <>
                        <td data-label="Harga" className="angka">
                          {sudahGerak ? formatHarga(b.unitCost) : 'saat posting'}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {sudahGerak ? formatNilai(keRupiah(des(b.qty).times(des(b.unitCost)))) : '-'}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Tidak ada bahan dengan qty.</p>
        )}
        {sudahGerak && punyaIzin(p.izin, 'stok.saldo', 'L') && baris[0] ? (
          <p className="redup kecil">
            Gerak stok dokumen ini bisa dilihat di <Link href={`/stok/kartu?produk=${baris[0].productId}&lokasi=${d.locationId}`}>kartu stok</Link>.
          </p>
        ) : null}
      </section>
    </>
  )
}
