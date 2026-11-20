import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanProduksi } from '@/components/produksi'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { JENIS_RESEP, daftarResep, hppResep, menuTanpaResep, type SaringResep } from '@/lib/produksi/resep'
import { formatHarga, formatNilai, formatQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Resep dan BOM' }

// Menu tanpa resep yang langsung tampil; sisanya di balik tombol supaya daftar resep tidak terdorong jauh ke bawah.
const TAMPIL_AWAL = 8

export default async function DaftarResep({ searchParams }: { searchParams: Promise<SaringResep & { pesan?: string }> }) {
  const p = await wajibIzin('stok.resep', 'L')
  const s = await searchParams
  const lokasi = await pilihanLokasi(db)
  const idLokasi = s.lokasi && /^\d+$/.test(s.lokasi) ? Number(s.lokasi) : (lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? null)
  const [hasil, semuaTanpa] = await Promise.all([daftarResep(db, s), menuTanpaResep(db)])
  // Yang paling sering terjual paling atas, karena dampaknya ke HPP dan stok paling besar.
  const tanpa = [...semuaTanpa].sort((a, b) => b.terjual - a.terjual || a.name.localeCompare(b.name, 'id'))
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const hpp = lihatNilai ? await hppResep(db, hasil.baris, idLokasi) : new Map()
  const bolehTambah = punyaIzin(p.izin, 'stok.resep', 'T')
  const disaring = !!(s.q || s.jenis || s.status || s.lokasi)
  const namaLokasi = lokasi.find((l) => l.id === idLokasi)?.name ?? '-'
  const chip = (m: (typeof tanpa)[number]) => (
    <li key={m.id}>
      <span>
        <b>{m.name}</b> <small>{m.sebab}, terjual {m.terjual}</small>
      </span>
      {bolehTambah && m.sebab === 'belum ada resep' ? (
        <Link href={`/resep/baru?jenis=menu&menu=${m.id}`} aria-label={`Buat resep ${m.name}`}>
          Buat resep
        </Link>
      ) : m.bom ? (
        <Link href={`/resep/${m.bom.id}`} aria-label={`Buka resep ${m.name}`}>
          Buka
        </Link>
      ) : null}
    </li>
  )
  return (
    <>
      <KepalaHalaman judul="Resep dan BOM" keterangan="Resep menu memotong bahan saat menu terjual. BOM assembly mengolah bahan menjadi produk setengah jadi lewat dokumen produksi.">
        {bolehTambah ? (
          <>
            <Link href="/resep/baru?jenis=menu" className="btn">
              Buat resep menu
            </Link>
            <Link href="/resep/baru?jenis=assembly" className="btn sekunder">
              Buat BOM assembly
            </Link>
          </>
        ) : null}
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      {tanpa.length ? (
        <section className="tanpa-resep" aria-labelledby="j-tanpa">
          <h2 id="j-tanpa">Menu tanpa resep: {tanpa.length}</h2>
          <p>Penjualan menu ini tidak memotong stok bahan dan HPP-nya dicatat Rp 0. Angka terjual dihitung 30 hari terakhir, termasuk sebagai bagian paket.</p>
          <ul>{tanpa.slice(0, TAMPIL_AWAL).map(chip)}</ul>
          {tanpa.length > TAMPIL_AWAL ? (
            <details className="tanpa-resep-lagi">
              <summary>Tampilkan {tanpa.length - TAMPIL_AWAL} menu lainnya</summary>
              <ul>{tanpa.slice(TAMPIL_AWAL).map(chip)}</ul>
            </details>
          ) : null}
        </section>
      ) : null}
      <form className="saring" method="get" role="search" aria-label="Saring resep">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama, kode, atau menu" maxLength={60} />
        </div>
        <div className="kolom">
          <label htmlFor="s-jenis">Jenis</label>
          <select id="s-jenis" name="jenis" defaultValue={s.jenis ?? ''}>
            <option value="">Semua jenis</option>
            <option value="menu">{JENIS_RESEP.menu}</option>
            <option value="assembly">{JENIS_RESEP.assembly}</option>
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        {lihatNilai ? (
          <div className="kolom">
            <label htmlFor="s-lokasi">HPP menurut lokasi</label>
            <select id="s-lokasi" name="lokasi" defaultValue={idLokasi ? String(idLokasi) : ''}>
              {lokasi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/resep">Hapus saringan</Link> : null}
        </div>
      </form>
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Resep</th>
                <th scope="col">Jenis</th>
                <th scope="col">Untuk</th>
                <th scope="col" className="angka">
                  Bahan
                </th>
                {lihatNilai ? (
                  <>
                    <th scope="col" className="angka">
                      HPP di {namaLokasi}
                    </th>
                    <th scope="col" className="angka">
                      Margin
                    </th>
                  </>
                ) : null}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((r) => {
                const h = hpp.get(r.id)
                const menu = r.menuItems[0]
                const margin = h && menu && r.kind === 'menu' ? menu.price - h.total : null
                return (
                  <tr key={r.id}>
                    <td data-label="Resep">
                      <Link href={`/resep/${r.id}`} className="tebal">
                        {r.name}
                      </Link>
                      <small className="redup blok">
                        {r.code} · versi {r.version}
                      </small>
                    </td>
                    <td data-label="Jenis">{JENIS_RESEP[r.kind as keyof typeof JENIS_RESEP] ?? r.kind}</td>
                    <td data-label="Untuk">
                      {r.kind === 'menu' ? (menu?.name ?? '-') : r.product ? `${formatQty(r.outputQty)} ${r.product.baseUnit.symbol} ${r.product.name}` : '-'}
                    </td>
                    <td data-label="Bahan" className="angka">
                      {r.bomLines.length}
                    </td>
                    {lihatNilai ? (
                      <>
                        <td data-label="HPP" className="angka">
                          {h ? (r.kind === 'menu' ? formatNilai(h.total) : `${formatNilai(h.total)} per batch`) : '-'}
                          {h && r.kind === 'assembly' && r.product ? (
                            <small className="redup blok">
                              {formatHarga(h.perSatuan)} per {r.product.baseUnit.symbol}
                            </small>
                          ) : null}
                        </td>
                        <td data-label="Margin" className="angka">
                          {margin !== null && menu ? `${formatRupiah(margin)} (${menu.price > 0n ? ((Number(margin) / Number(menu.price)) * 100).toFixed(1).replace('.', ',') : '0'}%)` : '-'}
                        </td>
                      </>
                    ) : null}
                    <td data-label="Status">
                      <Lencana aktif={r.active} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada resep yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/resep" query={s} />
    </>
  )
}
