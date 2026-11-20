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
import { KAIT_CEPAT, menyimpang, muatCepat } from '@/lib/produksi/cepat'
import { pilihanBomAssembly } from '@/lib/produksi/resep'
import { Desimal, des, formatHarga, formatNilai, formatQty, isianQty, keRupiah } from '@/lib/stok/angka'
import { tombolStatus } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusCepatAksi, statusCepatAksi, ubahKepalaCepatAksi, ubahQtyCepatAksi } from '../aksi'

export const metadata: Metadata = { title: 'Produksi Cepat' }

export default async function RincianCepat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('produksi.cepat', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatCepat(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await db.$transaction((tx) => KAIT_CEPAT.butuhSetuju(tx, { ...d, outputQty: des(d.outputQty) }))
  const t = tombolStatus(p, 'quick_production', d.status, butuhSetuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const [bom, lokasi] = t.ubah ? await Promise.all([pilihanBomAssembly(db), pilihanLokasi(db)]) : [[], []]
  const produk = d.bom.product
  const sat = produk?.baseUnit.symbol ?? ''
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const toleransi = new Map(d.bom.bomLines.map((l) => [l.productId, des(l.tolPct)]))
  const baris = d.quickProductionLines.map((b) => ({ ...b, systemQty: des(b.systemQty), qty: des(b.qty), tolPct: toleransi.get(b.productId) ?? new Desimal(0) }))
  const lewat = new Set(menyimpang(baris).map((b) => b.id))
  const nilaiBahan = d.value - d.extraCost
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Produksi cepat · ${produk?.name ?? d.bom.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/produksi-cepat', label: 'Produksi Cepat' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanProduksi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data produksi</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaCepatAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'bomId', label: 'BOM assembly', awal: String(d.bomId), pilihan: bom.map((b) => ({ nilai: String(b.id), label: b.name })), wajib: true, lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Jumlah batch', awal: isianQty(d.qty), inputMode: 'decimal', wajib: true, bantuan: 'Mengubah BOM atau batch menyusun ulang baris bahan.' },
                { jenis: 'angka', nama: 'outputQty', label: `Qty hasil (${sat})`, awal: isianQty(d.outputQty), inputMode: 'decimal' },
                { jenis: 'pilih', nama: 'fromLocationId', label: 'Lokasi bahan', awal: String(d.fromLocationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'pilih', nama: 'toLocationId', label: 'Lokasi hasil', awal: String(d.toLocationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoTanggal(d.date), wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan draf"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>BOM</dt>
              <dd>
                <Link href={`/resep/${d.bomId}`}>{d.bom.name}</Link> × {formatQty(d.qty)} batch
              </dd>
              <dt>Hasil</dt>
              <dd>
                {formatQty(d.outputQty)} {sat} {produk?.name}
              </dd>
              <dt>Lokasi</dt>
              <dd>
                bahan dari {d.fromLocation.name}, hasil ke {d.toLocation.name}
              </dd>
              {lihatNilai && sudahGerak ? (
                <>
                  <dt>Nilai bahan</dt>
                  <dd>{formatNilai(nilaiBahan)}</dd>
                  <dt>Biaya tambahan</dt>
                  <dd>{formatNilai(d.extraCost)}</dd>
                  <dt>Nilai hasil</dt>
                  <dd>
                    {formatNilai(d.value)} ({formatHarga(d.unitCost)} per {sat})
                  </dd>
                </>
              ) : null}
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelTindakan
          p={p}
          jenis="quick_production"
          d={d}
          butuhSetuju={butuhSetuju}
          catatan={
            d.status === 'Draft'
              ? lewat.size
                ? 'Ada qty aktual yang menyimpang dari toleransi BOM (baris kuning). Tulis alasannya di catatan sebelum posting.'
                : 'Saat Diposting, bahan keluar dengan harga rata-rata dan hasil masuk dengan nilai bahan ditambah biaya tambahan.'
              : undefined
          }
          aksi={{
            ajukan: statusCepatAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusCepatAksi.bind(null, d.id, 'kembalikan'),
            posting: statusCepatAksi.bind(null, d.id, 'posting'),
            batal: statusCepatAksi.bind(null, d.id, 'batal'),
            hapus: hapusCepatAksi.bind(null, d.id),
          }}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Bahan</h2>
        {t.ubah ? (
          <FormQty
            aksi={ubahQtyCepatAksi.bind(null, d.id)}
            kolom={['Qty sistem', 'Toleransi']}
            labelQty="Qty aktual"
            tombol="Simpan qty aktual"
            baris={baris.map((b) => ({
              id: b.id,
              nama: b.product.name,
              kode: b.product.code,
              satuan: b.product.baseUnit.symbol,
              sel: [`${formatQty(b.systemQty)} ${b.product.baseUnit.symbol}`, `${formatQty(b.tolPct)}%`],
              qty: isianQty(b.qty),
              tandai: lewat.has(b.id),
            }))}
          />
        ) : (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Bahan</th>
                  <th scope="col" className="angka">
                    Qty sistem
                  </th>
                  <th scope="col" className="angka">
                    Qty aktual
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
                  <tr key={b.id} className={lewat.has(b.id) ? 'menyimpang' : undefined}>
                    <td data-label="Bahan">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty sistem" className="angka">
                      {formatQty(b.systemQty)} {b.product.baseUnit.symbol}
                    </td>
                    <td data-label="Qty aktual" className="angka">
                      {formatQty(b.qty)} {b.product.baseUnit.symbol}
                    </td>
                    {lihatNilai ? (
                      <>
                        <td data-label="Harga" className="angka">
                          {sudahGerak && b.qty.gt(0) ? formatHarga(b.unitCost) : '-'}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {sudahGerak && b.qty.gt(0) ? formatNilai(keRupiah(b.qty.times(des(b.unitCost)))) : '-'}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sudahGerak && produk && punyaIzin(p.izin, 'stok.saldo', 'L') ? (
          <p className="redup kecil">
            Gerak stok hasil bisa dilihat di <Link href={`/stok/kartu?produk=${produk.id}&lokasi=${d.toLocationId}`}>kartu stok</Link>.
          </p>
        ) : null}
      </section>
    </>
  )
}
