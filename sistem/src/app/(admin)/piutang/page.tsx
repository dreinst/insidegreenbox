import type { Metadata } from 'next'
import Link from 'next/link'
import { Ringkas, TautanDok } from '@/components/beli'
import { formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { cocokkanPiutang } from '@/lib/akuntansi/bentuk-ulang-b2b'
import { piutangPelanggan, type SaringPiutang } from '@/lib/b2b/piutang'
import { pilihanPelanggan } from '@/lib/b2b/umum'
import { DOK_BELI } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatNilai as formatRupiah } from '@/lib/stok/angka'

export const metadata: Metadata = { title: 'Piutang Pelanggan' }

const MENU_JENIS: Record<string, string> = { Faktur: DOK_BELI.sales_invoice.menu, 'Nota kredit': DOK_BELI.sales_return.menu }

export default async function PiutangPelanggan({ searchParams }: { searchParams: Promise<SaringPiutang> }) {
  const p = await wajibIzin('kas.piutang', 'L')
  const s = await searchParams
  const [h, pelanggan] = await Promise.all([piutangPelanggan(db, s), pilihanPelanggan(db)])
  const q = s.pelanggan && /^\d+$/.test(s.pelanggan) ? `?pelanggan=${s.pelanggan}` : ''
  // tahap 6B: pencocokan dengan Piutang Usaha di buku besar, hanya untuk pemegang Buku Besar dan tanpa saringan.
  const buku = !q && punyaIzin(p.izin, 'akun.buku_besar', 'L') ? await cocokkanPiutang(db) : null
  const akunPiutang = buku ? await db.accountMapping.findUnique({ where: { key: 'piutang_usaha' }, select: { accountId: true } }) : null
  return (
    <>
      <KepalaHalaman judul="Piutang Pelanggan" keterangan="Sisa faktur penjualan yang belum lunas, dikurangi nota kredit retur yang belum terpakai. Umur dihitung dari jatuh tempo sampai hari ini.">
        <a href={`/piutang/unduh${q}`} className="btn sekunder" download>
          Unduh CSV
        </a>
      </KepalaHalaman>
      <form className="saring" method="get" role="search" aria-label="Saring piutang pelanggan">
        <div className="kolom">
          <label htmlFor="s-pelanggan">Pelanggan</label>
          <select id="s-pelanggan" name="pelanggan" defaultValue={s.pelanggan ?? ''}>
            <option value="">Semua pelanggan</option>
            {pelanggan.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {q ? <Link href="/piutang">Hapus saringan</Link> : null}
        </div>
      </form>
      <Ringkas
        label="Ringkasan piutang"
        isi={[
          ['Saldo piutang', formatRupiah(h.total), h.total < 0n],
          ...h.umur.map((u) => [u.kelompok, u.sisa < 0n ? `-${formatRupiah(-u.sisa)}` : formatRupiah(u.sisa)] as [string, string]),
          ['Nota kredit belum terpakai', formatRupiah(h.kredit)],
        ]}
      />
      {buku ? (
        <p className={`pesan ${buku.cocok ? 'sukses' : 'galat'}`} role="status" data-cocok-piutang={buku.cocok ? 'ya' : 'tidak'}>
          Piutang Usaha di buku besar {formatRupiah(buku.buku)}
          {buku.cocok ? ', sama dengan saldo halaman ini.' : `, berbeda ${formatRupiah(buku.buku - buku.halaman)} dari saldo halaman ini. Jalankan npm run jurnal:bentuk-ulang untuk dokumen lama.`}{' '}
          {akunPiutang ? <Link href={`/buku-besar?akun=${akunPiutang.accountId}`}>Buka buku besar</Link> : null}
        </p>
      ) : null}

      <section className="kartu" aria-labelledby="j-pelanggan">
        <h2 id="j-pelanggan">Saldo per pelanggan</h2>
        {h.perPelanggan.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Pelanggan</th>
                  <th scope="col" className="angka">
                    Faktur
                  </th>
                  <th scope="col" className="angka">
                    Nota kredit
                  </th>
                  <th scope="col" className="angka">
                    Saldo
                  </th>
                  <th scope="col" className="angka">
                    Lewat jatuh tempo
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.perPelanggan.map((x) => (
                  <tr key={x.customerId}>
                    <td data-label="Pelanggan">
                      <Link href={`/piutang?pelanggan=${x.customerId}`} className="tebal">
                        {x.pelanggan}
                      </Link>
                      <small className="redup blok">{x.dokumen} dokumen</small>
                    </td>
                    <td data-label="Faktur" className="angka">
                      {formatRupiah(x.tagihan)}
                    </td>
                    <td data-label="Nota kredit" className="angka">
                      {x.kredit ? `-${formatRupiah(x.kredit)}` : formatRupiah(0)}
                    </td>
                    <td data-label="Saldo" className="angka tebal">
                      {formatRupiah(x.saldo)}
                    </td>
                    <td data-label="Lewat tempo" className="angka">
                      {formatRupiah(x.jatuhTempo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Tidak ada piutang pelanggan.</p>
        )}
      </section>

      <section className="kartu" aria-labelledby="j-dok">
        <h2 id="j-dok">Dokumen belum lunas</h2>
        {h.dokumen.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Dokumen</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Jatuh tempo</th>
                  <th scope="col" className="angka">
                    Total
                  </th>
                  <th scope="col" className="angka">
                    Diterima
                  </th>
                  <th scope="col" className="angka">
                    Sisa
                  </th>
                  <th scope="col">Umur</th>
                </tr>
              </thead>
              <tbody>
                {h.dokumen.map((x) => (
                  <tr key={`${x.jalur}${x.id}`}>
                    <td data-label="Dokumen">
                      <TautanDok p={p} menu={MENU_JENIS[x.jenis]} href={`${x.jalur}/${x.id}`} teks={x.no} />
                      <small className="redup blok">
                        {x.jenis}
                        {x.ref ? ` · ${x.ref}` : ''}
                      </small>
                    </td>
                    <td data-label="Pelanggan">{x.pelanggan}</td>
                    <td data-label="Jatuh tempo">{x.dueDate ? formatTanggal(x.dueDate) : '-'}</td>
                    <td data-label="Total" className="angka">
                      {formatRupiah(x.total)}
                    </td>
                    <td data-label="Diterima" className="angka">
                      {formatRupiah(x.dibayar)}
                    </td>
                    <td data-label="Sisa" className="angka tebal">
                      {formatRupiah(x.sisa)}
                    </td>
                    <td data-label="Umur">{x.umur === null ? '-' : x.umur > 0 ? `${x.umur} hari lewat (${x.kelompok})` : x.kelompok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Semua faktur pelanggan sudah lunas.</p>
        )}
        {punyaIzin(p.izin, 'b2b.penerimaan', 'T') && h.dokumen.length ? (
          <p>
            <Link href={`/terima-pelanggan/baru${q}`}>Catat penerimaan</Link>
          </p>
        ) : null}
      </section>
    </>
  )
}
