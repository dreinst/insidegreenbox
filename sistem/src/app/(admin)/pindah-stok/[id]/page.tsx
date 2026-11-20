import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, PesanStok, formatTanggal, isoTanggal } from '@/components/stok'
import { PanelTindakan } from '@/components/stok-dok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { des, formatHarga, formatNilai, formatQty, keRupiah } from '@/lib/stok/angka'
import { tombolStatus } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { muatPindah } from '@/lib/stok/pindah'
import { pilihanProduk } from '@/lib/stok/produk'
import { hapusBarisPindahAksi, hapusPindahAksi, statusPindahAksi, tambahBarisPindahAksi, ubahKepalaPindahAksi } from '../aksi'

export const metadata: Metadata = { title: 'Pindah Stok' }

export default async function RincianPindah({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.pindah', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPindah(db, id), searchParams])
  if (!d) notFound()
  const t = tombolStatus(p, 'stock_transfer', d.status, false, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const [lokasi, produk] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanProduk(db)]) : [[], []]
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const pilihanLok = lokasi.map((l) => ({ nilai: String(l.id), label: l.name }))
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pindah stok · ${d.fromLocation.name} ke ${d.toLocation.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/pindah-stok', label: 'Pindah Stok' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPindahAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'fromLocationId', label: 'Dari lokasi', awal: String(d.fromLocationId), pilihan: pilihanLok, wajib: true },
                { jenis: 'pilih', nama: 'toLocationId', label: 'Ke lokasi', awal: String(d.toLocationId), pilihan: pilihanLok, wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoTanggal(d.date), wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Dari</dt>
              <dd>{d.fromLocation.name}</dd>
              <dt>Ke</dt>
              <dd>{d.toLocation.name}</dd>
              <dt>Tanggal</dt>
              <dd>{formatTanggal(d.date)}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelTindakan
          p={p}
          jenis="stock_transfer"
          d={d}
          butuhSetuju={false}
          aksi={{
            ajukan: statusPindahAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusPindahAksi.bind(null, d.id, 'kembalikan'),
            posting: statusPindahAksi.bind(null, d.id, 'posting'),
            batal: statusPindahAksi.bind(null, d.id, 'batal'),
            hapus: hapusPindahAksi.bind(null, d.id),
          }}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Barang yang dipindah</h2>
        {d.stockTransferLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  {lihatNilai && sudahGerak ? (
                    <>
                      <th scope="col" className="angka">
                        Harga satuan
                      </th>
                      <th scope="col" className="angka">
                        Nilai
                      </th>
                    </>
                  ) : null}
                  <th scope="col">
                    <span className="sr">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.stockTransferLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.product.baseUnit.symbol}
                    </td>
                    {lihatNilai && sudahGerak ? (
                      <>
                        <td data-label="Harga" className="angka">
                          {formatHarga(b.unitCost)}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {formatNilai(keRupiah(des(b.qty).times(des(b.unitCost))))}
                        </td>
                      </>
                    ) : null}
                    <td className="sel-aksi">
                      {t.ubah ? <TombolAksi aksi={hapusBarisPindahAksi.bind(null, d.id, b.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} /> : null}
                    </td>
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
            <h3>Tambah baris</h3>
            <FormMaster
              aksi={tambahBarisPindahAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'productId', label: 'Produk', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...produk.map((x) => ({ nilai: String(x.id), label: `${x.name} (${x.baseUnit.symbol})` }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'qty', label: 'Qty (satuan dasar)', inputMode: 'decimal', wajib: true, placeholder: '500', bantuan: 'Pakai koma untuk desimal, misalnya 12,5.' },
              ]}
              tombol="Tambah baris"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>
    </>
  )
}
