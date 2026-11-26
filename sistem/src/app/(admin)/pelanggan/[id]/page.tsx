import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanJual } from '@/components/b2b'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { hargaPelanggan } from '@/lib/b2b/pelanggan'
import { piutangPelanggan } from '@/lib/b2b/piutang'
import { pilihanBarangJual } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { hapusHargaPelangganAksi, simpanHargaPelangganAksi, statusPelangganAksi, ubahPelangganAksi } from '../../_jual/aksi'
import { medanPelanggan } from '../medan'

export const metadata: Metadata = { title: 'Pelanggan' }

export default async function RincianPelanggan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('b2b.pelanggan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [c, { pesan }] = await Promise.all([db.customer.findUnique({ where: { id } }), searchParams])
  if (!c) notFound()
  const bolehUbah = punyaIzin(p.izin, 'b2b.pelanggan', 'U')
  const [harga, pesanan, piutang, barang] = await Promise.all([
    hargaPelanggan(db, id),
    db.salesOrder.count({ where: { customerId: id, status: 'Disetujui' } }),
    punyaIzin(p.izin, 'kas.piutang', 'L') ? piutangPelanggan(db, { pelanggan: String(id) }) : null,
    bolehUbah ? pilihanBarangJual(db) : [],
  ])
  const saldo = piutang?.perPelanggan[0]
  return (
    <>
      <KepalaHalaman judul={c.name} keterangan={`${c.code}${c.category ? ` · ${c.category}` : ''}${c.paymentDays ? ` · termin ${c.paymentDays} hari` : ' · tunai'}`} jejak={{ href: '/pelanggan', label: 'Pelanggan' }}>
        <Lencana aktif={c.active} />
      </KepalaHalaman>
      <PesanJual kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data pelanggan</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahPelangganAksi.bind(null, c.id)} medan={medanPelanggan(c)} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Kontak</dt>
              <dd>{[c.contact, c.phone].filter(Boolean).join(' · ') || '-'}</dd>
              <dt>Alamat kirim</dt>
              <dd>{c.address || '-'}</dd>
              <dt>NPWP</dt>
              <dd>{c.npwp || '-'}</dd>
              <dt>Catatan</dt>
              <dd>{c.note || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-ringkas">
          <h2 id="j-ringkas">Ringkasan</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={c.active} />
            </dd>
            <dt>Pesanan terbuka</dt>
            <dd>{punyaIzin(p.izin, 'b2b.pesanan', 'L') ? <Link href={`/pesanan-jual?pelanggan=${c.id}&status=Disetujui`}>{pesanan} pesanan</Link> : pesanan}</dd>
            {piutang ? (
              <>
                <dt>Saldo piutang</dt>
                <dd>
                  <Link href={`/piutang?pelanggan=${c.id}`}>{formatRupiah(saldo?.saldo ?? 0n)}</Link>
                </dd>
                <dt>Sudah jatuh tempo</dt>
                <dd>{formatRupiah(saldo?.jatuhTempo ?? 0n)}</dd>
              </>
            ) : null}
          </dl>
          {bolehUbah ? (
            c.active ? (
              <FormStatusMaster aksi={statusPelangganAksi.bind(null, c.id, false)} aktif label="Nonaktifkan pelanggan" konfirmasi={`Nonaktifkan ${c.name}? Pelanggan ini tidak bisa dipilih untuk dokumen baru.`} />
            ) : (
              <FormStatusMaster aksi={statusPelangganAksi.bind(null, c.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=customer&dok=${c.id}`}>Lihat jejak audit pelanggan ini</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-harga">
        <h2 id="j-harga">Harga khusus</h2>
        <p className="redup kecil">
          Harga bawaan di pesanan dan faktur penjualan pelanggan ini. Produk tanpa harga khusus diisi harganya di dokumen.
          {saklarNyala(p, 'b2b.ubah_harga') ? ' Kamu boleh mengubah harga di dokumen.' : ' Harga di dokumen harus sama dengan harga khusus karena kamu tidak punya saklar Ubah harga jual B2B.'}
        </p>
        {harga.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col">Satuan</th>
                  <th scope="col" className="angka">
                    Harga
                  </th>
                  {bolehUbah ? <th scope="col">Tindakan</th> : null}
                </tr>
              </thead>
              <tbody>
                {harga.map((h) => (
                  <tr key={h.id}>
                    <td data-label="Produk">
                      <span className="tebal">{h.product.name}</span>
                      <small className="redup blok">{h.product.code}</small>
                    </td>
                    <td data-label="Satuan">{h.unit.symbol}</td>
                    <td data-label="Harga" className="angka">
                      {formatRupiah(h.price)}
                    </td>
                    {bolehUbah ? (
                      <td data-label="Tindakan">
                        <TombolAksi aksi={hapusHargaPelangganAksi.bind(null, c.id, h.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus harga khusus ${h.product.name} per ${h.unit.symbol}?`} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada harga khusus.</p>
        )}
        {bolehUbah ? (
          <div className="jb-harga-baru">
            <h3>Tambah atau ganti harga</h3>
            <FormMaster
              aksi={simpanHargaPelangganAksi.bind(null, c.id)}
              medan={[
                { jenis: 'pilih', nama: 'item', label: 'Produk dan satuan', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...barang.map((x) => ({ nilai: x.nilai, label: x.label }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'price', label: 'Harga per satuan (Rp)', wajib: true, placeholder: '25000', bantuan: 'Rupiah bulat. Harga yang sudah ada untuk produk dan satuan yang sama diganti.' },
              ]}
              tombol="Simpan harga"
              kelasTombol="btn sekunder"
            />
          </div>
        ) : null}
      </section>
    </>
  )
}
