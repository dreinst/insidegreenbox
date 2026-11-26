import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatHarga, formatNilai, formatQty, isianQty } from '@/lib/stok/angka'
import { JENIS_PRODUK, pilihanKategori, pilihanSatuan, type JenisProduk } from '@/lib/stok/produk'
import { hapusKonversiAksi, simpanKonversiAksi, statusProdukAksi, ubahProdukAksi } from '../aksi'
import { medanProduk } from '../medan'

export const metadata: Metadata = { title: 'Produk' }

export default async function RincianProduk({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [b, { pesan }, satuan, kategori] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        baseUnit: true,
        category: true,
        productUnits: { include: { unit: true }, orderBy: { unitId: 'asc' } },
        stockBalances: { include: { location: true }, orderBy: { locationId: 'asc' } },
      },
    }),
    searchParams,
    pilihanSatuan(db),
    pilihanKategori(db),
  ])
  if (!b) notFound()
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const lihatKartu = punyaIzin(p.izin, 'stok.saldo', 'L')
  const satuanLain = satuan.filter((u) => u.id !== b.baseUnitId)
  return (
    <>
      <KepalaHalaman judul={b.name} keterangan={`${b.code} · ${JENIS_PRODUK[b.kind as JenisProduk] ?? b.kind} · satuan dasar ${b.baseUnit.name}`} jejak={{ href: '/produk', label: 'Produk dan Satuan' }}>
        <Lencana aktif={b.active} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data produk</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahProdukAksi.bind(null, b.id)}
              medan={medanProduk(satuan.some((u) => u.id === b.baseUnitId) ? satuan : [...satuan, b.baseUnit], kategori, {
                code: b.code,
                name: b.name,
                kind: b.kind,
                categoryId: b.categoryId ? String(b.categoryId) : '',
                baseUnitId: String(b.baseUnitId),
                minStock: isianQty(b.minStock),
                purchasable: b.purchasable,
              })}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Kode</dt>
              <dd>
                <code>{b.code}</code>
              </dd>
              <dt>Jenis</dt>
              <dd>{JENIS_PRODUK[b.kind as JenisProduk] ?? b.kind}</dd>
              <dt>Kategori</dt>
              <dd>{b.category?.name ?? '-'}</dd>
              <dt>Satuan dasar</dt>
              <dd>
                {b.baseUnit.name} ({b.baseUnit.symbol})
              </dd>
              <dt>Stok minimum</dt>
              <dd>
                {formatQty(b.minStock)} {b.baseUnit.symbol}
              </dd>
              <dt>Bisa dibeli</dt>
              <dd>{b.purchasable ? 'Ya' : 'Tidak'}</dd>
            </dl>
          )}
        </section>

        <section className="kartu" aria-labelledby="j-stok">
          <h2 id="j-stok">Stok per lokasi</h2>
          {b.stockBalances.length ? (
            <ul className="daftar-angka">
              {b.stockBalances.map((s) => (
                <li key={s.locationId}>
                  <span>
                    {lihatKartu ? <Link href={`/stok/kartu?produk=${b.id}&lokasi=${s.locationId}`}>{s.location.name}</Link> : s.location.name}
                  </span>
                  <span className="angka">
                    <b>
                      {formatQty(s.qty)} {b.baseUnit.symbol}
                    </b>
                    {lihatNilai ? <small className="redup blok">{`${formatNilai(s.value)} · rata-rata ${formatHarga(s.avgCost)}`}</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="redup">Belum ada gerak stok.</p>
          )}
          {lihatNilai ? <p className="redup kecil">{`Harga rata-rata gabungan ${formatHarga(b.avgCost)} per ${b.baseUnit.symbol}, harga beli terakhir ${formatHarga(b.lastCost)}.`}</p> : null}
          {lihatKartu ? (
            <p>
              <Link href={`/stok/kartu?produk=${b.id}`}>Buka kartu stok</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-konversi">
        <h2 id="j-konversi">Konversi satuan</h2>
        <p className="redup">Satuan beli dan satuan lain dihitung ke satuan dasar ({b.baseUnit.symbol}) saat masuk stok.</p>
        {b.productUnits.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Satuan</th>
                  <th scope="col" className="angka">
                    Isi
                  </th>
                  <th scope="col">Dipakai beli</th>
                  <th scope="col">
                    <span className="sr">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.productUnits.map((u) => (
                  <tr key={u.unitId}>
                    <td data-label="Satuan">{u.unit.name}</td>
                    <td data-label="Isi" className="angka">
                      1 {u.unit.symbol} = {formatQty(u.factorToBase)} {b.baseUnit.symbol}
                    </td>
                    <td data-label="Dipakai beli">{u.isDefault ? 'Ya, bawaan' : u.isPurchase ? 'Ya' : 'Tidak'}</td>
                    <td className="sel-aksi">
                      {bolehUbah ? <TombolAksi aksi={hapusKonversiAksi.bind(null, b.id, u.unitId)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus konversi ${u.unit.name}?`} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada konversi. Produk hanya memakai satuan dasar.</p>
        )}
        {bolehUbah && satuanLain.length ? (
          <>
            <h3>Tambah atau ubah konversi</h3>
            <FormMaster
              aksi={simpanKonversiAksi.bind(null, b.id)}
              medan={[
                { jenis: 'pilih', nama: 'unitId', label: 'Satuan', pilihan: [{ nilai: '', label: 'Pilih satuan' }, ...satuanLain.map((u) => ({ nilai: String(u.id), label: `${u.name} (${u.symbol})` }))], wajib: true },
                { jenis: 'angka', nama: 'factor', label: `Isi dalam ${b.baseUnit.symbol}`, inputMode: 'decimal', wajib: true, placeholder: '1000', bantuan: `Contoh: 1 kg = 1000 ${b.baseUnit.symbol}.` },
                { jenis: 'centang', nama: 'isPurchase', label: 'Dipakai untuk membeli' },
                { jenis: 'centang', nama: 'isDefault', label: 'Satuan beli bawaan' },
              ]}
              tombol="Simpan konversi"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>

      <section className="kartu" aria-labelledby="j-status">
        <h2 id="j-status">Status</h2>
        <dl className="rincian">
          <dt>Status</dt>
          <dd>
            <Lencana aktif={b.active} />
          </dd>
        </dl>
        {bolehUbah ? (
          b.active ? (
            <FormStatusMaster aksi={statusProdukAksi.bind(null, b.id, false)} aktif label="Nonaktifkan produk" konfirmasi={`Nonaktifkan ${b.name}? Produk tidak bisa dipakai di dokumen baru.`} />
          ) : (
            <FormStatusMaster aksi={statusProdukAksi.bind(null, b.id, true)} aktif={false} label="Aktifkan lagi" />
          )
        ) : null}
        {punyaIzin(p.izin, 'atur.audit', 'L') ? (
          <p>
            <Link href={`/audit?entitas=product&dok=${b.id}`}>Lihat jejak audit produk ini</Link>
          </p>
        ) : null}
      </section>
    </>
  )
}
