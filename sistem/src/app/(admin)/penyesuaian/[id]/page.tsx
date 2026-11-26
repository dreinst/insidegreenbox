import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, type Medan } from '@/components/form-master'
import { LencanaStatus, PesanStok, formatTanggal, isoTanggal } from '@/components/stok'
import { PanelTindakan } from '@/components/stok-dok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { pilihanAlasan } from '@/lib/stok/alasan'
import { formatHarga, formatNilai, formatQty, keRupiah, des } from '@/lib/stok/angka'
import { KAIT_PENYESUAIAN, muatPenyesuaian, ARAH } from '@/lib/stok/penyesuaian'
import { tombolStatus } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { pilihanProduk } from '@/lib/stok/produk'
import { hapusBarisPenyesuaianAksi, hapusPenyesuaianAksi, statusPenyesuaianAksi, tambahBarisPenyesuaianAksi, ubahKepalaPenyesuaianAksi } from '../aksi'

export const metadata: Metadata = { title: 'Penyesuaian Stok' }

export default async function RincianPenyesuaian({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.penyesuaian', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPenyesuaian(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await db.$transaction((tx) => KAIT_PENYESUAIAN.butuhSetuju(tx, d))
  const t = tombolStatus(p, 'stock_adjustment', d.status, butuhSetuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const arah = (['tambah', 'kurang'] as const).filter((a) => saklarNyala(p, a === 'tambah' ? 'stok.sesuai_tambah' : 'stok.sesuai_kurang'))
  const [lokasi, produk, alasan] = t.ubah ? await Promise.all([pilihanLokasi(db), pilihanProduk(db), pilihanAlasan(db, 'sesuai')]) : [[], [], []]
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  const nilaiBaris = (b: (typeof d.stockAdjustmentLines)[number]) => keRupiah(des(b.qty).times(des(b.unitCost))) * (b.direction === 'kurang' ? -1n : 1n)
  const medanBaris: Medan[] = [
    { jenis: 'pilih', nama: 'productId', label: 'Produk', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...produk.map((x) => ({ nilai: String(x.id), label: `${x.name} (${x.baseUnit.symbol})` }))], wajib: true, lebar: true },
    { jenis: 'pilih', nama: 'direction', label: 'Arah', awal: arah[0], pilihan: arah.map((a) => ({ nilai: a, label: ARAH[a] })), wajib: true },
    { jenis: 'angka', nama: 'qty', label: 'Qty (satuan dasar)', inputMode: 'decimal', wajib: true, placeholder: '250', bantuan: 'Pakai koma untuk desimal, misalnya 12,5.' },
    { jenis: 'pilih', nama: 'reasonId', label: 'Alasan', pilihan: [{ nilai: '', label: 'Pilih alasan' }, ...alasan.map((a) => ({ nilai: String(a.id), label: a.name }))], wajib: true },
    ...(arah.includes('tambah')
      ? [{ jenis: 'angka' as const, nama: 'unitCost', label: 'Harga satuan (tambah saja)', inputMode: 'decimal' as const, placeholder: 'Kosong = harga rata-rata', bantuan: 'Per satuan dasar. Baris kurang selalu memakai harga rata-rata.' }]
      : []),
  ]
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Penyesuaian stok · ${d.location.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/penyesuaian', label: 'Penyesuaian Stok' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPenyesuaianAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
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
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelTindakan
          p={p}
          jenis="stock_adjustment"
          d={d}
          butuhSetuju={butuhSetuju}
          catatan={butuhSetuju && d.status === 'Draft' ? 'Ada baris tambah, jadi dokumen ini perlu diajukan dan disetujui Owner sebelum diposting.' : undefined}
          aksi={{
            ajukan: statusPenyesuaianAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusPenyesuaianAksi.bind(null, d.id, 'kembalikan'),
            posting: statusPenyesuaianAksi.bind(null, d.id, 'posting'),
            batal: statusPenyesuaianAksi.bind(null, d.id, 'batal'),
            hapus: hapusPenyesuaianAksi.bind(null, d.id),
          }}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Baris penyesuaian</h2>
        {d.stockAdjustmentLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col">Arah</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  <th scope="col">Alasan</th>
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
                  <th scope="col">
                    <span className="sr">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.stockAdjustmentLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Produk">
                      <span className="tebal">{b.product.name}</span>
                      <small className="redup blok">{b.product.code}</small>
                    </td>
                    <td data-label="Arah">
                      <span className={`lencana ${b.direction}`}>{ARAH[b.direction as keyof typeof ARAH] ?? b.direction}</span>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(b.qty)} {b.product.baseUnit.symbol}
                    </td>
                    <td data-label="Alasan">{b.reason.name}</td>
                    {lihatNilai ? (
                      <>
                        <td data-label="Harga" className="angka">
                          {sudahGerak || des(b.unitCost).gt(0) ? formatHarga(b.unitCost) : 'rata-rata saat posting'}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {sudahGerak || des(b.unitCost).gt(0) ? formatNilai(nilaiBaris(b)) : '-'}
                        </td>
                      </>
                    ) : null}
                    <td className="sel-aksi">
                      {t.ubah ? <TombolAksi aksi={hapusBarisPenyesuaianAksi.bind(null, d.id, b.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${b.product.name}?`} /> : null}
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
          arah.length ? (
            <>
              <h3>Tambah baris</h3>
              <FormMaster aksi={tambahBarisPenyesuaianAksi.bind(null, d.id)} medan={medanBaris} tombol="Tambah baris" kelasTombol="btn sekunder" />
            </>
          ) : (
            <p className="catatan">Kamu tidak punya saklar penyesuaian tambah maupun kurang, jadi tidak bisa menambah baris.</p>
          )
        ) : null}
        {sudahGerak && punyaIzin(p.izin, 'stok.saldo', 'L') ? (
          <p className="redup kecil">
            Gerak stok dokumen ini bisa dilihat di <Link href={`/stok/kartu?produk=${d.stockAdjustmentLines[0]?.productId ?? ''}&lokasi=${d.locationId}`}>kartu stok</Link>.
          </p>
        ) : null}
      </section>
    </>
  )
}
