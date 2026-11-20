import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanProduksi } from '@/components/produksi'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { JENIS_RESEP, hppResep, muatResep } from '@/lib/produksi/resep'
import { formatHarga, formatNilai, formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { pilihanProduk } from '@/lib/stok/produk'
import { formatWaktu } from '@/lib/waktu'
import { hapusBahanAksi, simpanBahanAksi, statusResepAksi, ubahResepAksi } from '../aksi'

export const metadata: Metadata = { title: 'Resep dan BOM' }

export default async function RincianResep({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string; lokasi?: string }> }) {
  const p = await wajibIzin('stok.resep', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [r, s, lokasi] = await Promise.all([muatResep(db, id), searchParams, pilihanLokasi(db)])
  if (!r) notFound()
  const ubah = punyaIzin(p.izin, 'stok.resep', 'U')
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const idLokasi = s.lokasi && /^\d+$/.test(s.lokasi) ? Number(s.lokasi) : (lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? null)
  const hpp = lihatNilai ? (await hppResep(db, [r], idLokasi)).get(r.id)! : null
  const produk = ubah ? (await pilihanProduk(db)).filter((x) => x.id !== r.productId) : []
  const menu = r.menuItems[0]
  const assembly = r.kind === 'assembly'
  const satuanHasil = r.product?.baseUnit.symbol ?? 'porsi'
  return (
    <>
      <KepalaHalaman judul={r.name} keterangan={`${JENIS_RESEP[r.kind as keyof typeof JENIS_RESEP] ?? r.kind} · ${r.code} · versi ${r.version}`} jejak={{ href: '/resep', label: 'Resep dan BOM' }}>
        <Lencana aktif={r.active} />
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      {!r.active ? <p className="catatan">Resep ini nonaktif. {assembly ? 'BOM ini tidak bisa dipakai dokumen produksi baru.' : 'Penjualan menunya tidak memotong stok dan ber-HPP Rp 0.'}</p> : null}
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data resep</h2>
          <dl className="rincian">
            <dt>{assembly ? 'Produk hasil' : 'Menu'}</dt>
            <dd>
              {assembly ? (r.product ? `${r.product.name} (${r.product.code})` : '-') : menu ? `${menu.name}${menu.active ? '' : ' (menu nonaktif)'}, harga ${formatRupiah(menu.price)}` : 'Menu sudah memakai resep lain'}
            </dd>
            {assembly ? (
              <>
                <dt>Qty hasil per batch</dt>
                <dd>
                  {formatQty(r.outputQty)} {satuanHasil}
                </dd>
                <dt>Biaya tambahan per batch</dt>
                <dd>{formatNilai(r.extraCost)}</dd>
              </>
            ) : null}
            <dt>Terakhir diubah</dt>
            <dd>{formatWaktu(r.updatedAt)}</dd>
          </dl>
          {ubah ? (
            <FormMaster
              aksi={ubahResepAksi.bind(null, r.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama', awal: r.name, wajib: true, maxLength: 80, lebar: !assembly },
                ...(assembly
                  ? [
                      { jenis: 'angka' as const, nama: 'outputQty', label: `Qty hasil per batch (${satuanHasil})`, awal: isianQty(r.outputQty), inputMode: 'decimal' as const, wajib: true },
                      { jenis: 'angka' as const, nama: 'extraCost', label: 'Biaya tambahan per batch (Rp)', awal: String(r.extraCost) },
                    ]
                  : []),
              ]}
              tombol="Simpan"
              kelasTombol="btn sekunder"
            />
          ) : null}
          {ubah ? (
            <div className="lipat-batal">
              {r.active ? (
                <FormStatusMaster aksi={statusResepAksi.bind(null, r.id, false)} aktif label="Nonaktifkan resep" konfirmasi={`Nonaktifkan ${r.name}? ${assembly ? 'BOM ini tidak bisa dipakai dokumen produksi baru.' : 'Penjualan menunya tidak memotong stok lagi.'}`} />
              ) : (
                <FormStatusMaster aksi={statusResepAksi.bind(null, r.id, true)} aktif={false} label="Aktifkan lagi" />
              )}
            </div>
          ) : null}
        </section>
        <section className="kartu" aria-labelledby="j-hpp">
          <h2 id="j-hpp">HPP {assembly ? 'per batch' : 'per porsi'}</h2>
          {hpp ? (
            <>
              <p className="angka-besar-kecil">{formatNilai(hpp.total)}</p>
              {assembly ? (
                <p className="redup">
                  {formatHarga(hpp.perSatuan)} per {satuanHasil} hasil
                </p>
              ) : menu ? (
                <p className="redup">
                  Margin {formatRupiah(menu.price - hpp.total)} dari harga {formatRupiah(menu.price)}
                </p>
              ) : null}
              <form className="saring" method="get" aria-label="Lokasi harga HPP">
                <div className="kolom">
                  <label htmlFor="s-lokasi">Harga rata-rata di lokasi</label>
                  <select id="s-lokasi" name="lokasi" defaultValue={idLokasi ? String(idLokasi) : ''}>
                    {lokasi.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="saring-tombol">
                  <button type="submit" className="btn sekunder">
                    Hitung
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="redup">Kamu tidak punya saklar Lihat nilai persediaan, jadi HPP tidak ditampilkan.</p>
          )}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-bahan">
        <h2 id="j-bahan">Bahan {assembly ? 'per batch' : 'per porsi'}</h2>
        {r.bomLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Bahan</th>
                  <th scope="col" className="angka">
                    Qty
                  </th>
                  {assembly ? (
                    <th scope="col" className="angka">
                      Toleransi
                    </th>
                  ) : null}
                  {hpp ? (
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
                {r.bomLines.map((l, i) => (
                  <tr key={l.id}>
                    <td data-label="Bahan">
                      <span className="tebal">{l.product.name}</span>
                      <small className="redup blok">
                        {l.product.code}
                        {l.product.active ? '' : ' · nonaktif'}
                      </small>
                    </td>
                    <td data-label="Qty" className="angka">
                      {formatQty(l.qty)} {l.product.baseUnit.symbol}
                    </td>
                    {assembly ? (
                      <td data-label="Toleransi" className="angka">
                        {formatQty(l.tolPct)}%
                      </td>
                    ) : null}
                    {hpp ? (
                      <>
                        <td data-label="Harga" className="angka">
                          {formatHarga(hpp.rinci[i].harga)}
                        </td>
                        <td data-label="Nilai" className="angka">
                          {formatNilai(hpp.rinci[i].nilai)}
                        </td>
                      </>
                    ) : null}
                    <td className="sel-aksi">
                      {ubah ? <TombolAksi aksi={hapusBahanAksi.bind(null, r.id, l.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus ${l.product.name} dari resep?`} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada bahan. {assembly ? 'BOM tanpa bahan tidak bisa dipakai produksi.' : 'Menu ini dianggap tanpa resep sampai bahannya diisi.'}</p>
        )}
        {hpp && assembly && r.extraCost > 0n ? <p className="redup kecil">Ditambah biaya tambahan {formatNilai(r.extraCost)} per batch, sudah termasuk di HPP.</p> : null}
        {ubah ? (
          <>
            <h3>Tambah atau ubah bahan</h3>
            <p className="redup kecil">Memilih bahan yang sudah ada di resep mengganti qty-nya. Qty dalam satuan dasar bahan.</p>
            <FormMaster
              aksi={simpanBahanAksi.bind(null, r.id)}
              medan={[
                { jenis: 'pilih', nama: 'productId', label: 'Bahan', pilihan: [{ nilai: '', label: 'Pilih bahan' }, ...produk.map((x) => ({ nilai: String(x.id), label: `${x.name} (${x.baseUnit.symbol})` }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'qty', label: `Qty per ${assembly ? 'batch' : 'porsi'}`, inputMode: 'decimal', wajib: true, placeholder: '18', bantuan: 'Pakai koma untuk desimal, misalnya 12,5.' },
                ...(assembly ? [{ jenis: 'angka' as const, nama: 'tolPct', label: 'Toleransi (%)', inputMode: 'decimal' as const, placeholder: '0', bantuan: 'Batas selisih qty keluar dari kebutuhan.' }] : []),
              ]}
              tombol="Simpan bahan"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
        {punyaIzin(p.izin, 'atur.audit', 'L') ? (
          <p className="tautan-baris">
            <Link href={`/audit?entitas=bom&dok=${r.id}`}>Lihat jejak audit resep ini</Link>
          </p>
        ) : null}
      </section>
    </>
  )
}
