import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAkuntansi, rp } from '@/components/akuntansi'
import { formatTanggal, LencanaStatus } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { pilihanAkun } from '@/lib/akuntansi/akun'
import { namaSumber, tautanSumber } from '@/lib/akuntansi/dokumen'
import { sumberJurnal } from '@/lib/akuntansi/laporan'
import { daftarJurnal, STATUS_JURNAL, type SaringJurnal } from '@/lib/akuntansi/memorial'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Jurnal Umum' }

export default async function JurnalUmum({ searchParams }: { searchParams: Promise<SaringJurnal & { pesan?: string }> }) {
  const p = await wajibIzin('akun.jurnal', 'L')
  const s = await searchParams
  const [hasil, sumber, akun] = await Promise.all([daftarJurnal(db, s), sumberJurnal(db), pilihanAkun(db)])
  const disaring = !!(s.dari || s.sampai || s.sumber || s.status || s.akun || s.q)
  return (
    <>
      <KepalaHalaman judul="Jurnal Umum" keterangan="Semua jurnal: yang dibentuk otomatis dari dokumen dan jurnal memorial yang dibuat manual. Jurnal yang sudah Diposting tidak bisa diubah; koreksinya lewat pembatalan atau jurnal baru.">
        {punyaIzin(p.izin, 'akun.jurnal', 'T') ? (
          <Link href="/jurnal/baru" className="btn">
            Buat jurnal memorial
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanAkuntansi kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring jurnal">
        <div className="kolom">
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sumber">Sumber</label>
          <select id="s-sumber" name="sumber" defaultValue={s.sumber ?? ''}>
            <option value="">Semua sumber</option>
            {sumber.map((x) => (
              <option key={x} value={x}>
                {namaSumber(x)}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {STATUS_JURNAL.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
            <option value="balik">Jurnal balik</option>
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-akun">Akun</label>
          <select id="s-akun" name="akun" defaultValue={s.akun ?? ''}>
            <option value="">Semua akun</option>
            {akun.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nomor jurnal, dokumen, atau keterangan" maxLength={40} />
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/jurnal">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Sumber</th>
                <th scope="col">Keterangan</th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((j) => {
                const href = j.sourceType === 'memorial' ? null : tautanSumber(j.sourceType, j.sourceId, j.docNo)
                return (
                  <tr key={j.id}>
                    <td data-label="Nomor" className="nowrap">
                      <Link href={`/jurnal/${j.id}`} className="tebal">
                        {j.no}
                      </Link>
                    </td>
                    <td data-label="Tanggal" className="nowrap">
                      {formatTanggal(j.date)}
                    </td>
                    <td data-label="Sumber">
                      {namaSumber(j.sourceType)}
                      {j.sourceType !== 'memorial' && j.docNo ? <small className="redup blok">{href ? <Link href={href}>{j.docNo}</Link> : j.docNo}</small> : null}
                    </td>
                    <td data-label="Keterangan" className="pecah">
                      {j.memo || '-'}
                      {j.reversalOf ? <small className="redup blok">Balik dari {j.reversalOf.no}</small> : null}
                    </td>
                    <td data-label="Total" className="angka">
                      {rp(j.total)}
                    </td>
                    <td data-label="Status">
                      <LencanaStatus status={j.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada jurnal yang cocok dengan saringan.' : 'Belum ada jurnal.'}</p>
      )}
      <Halaman {...hasil} dasar="/jurnal" query={s} />
    </>
  )
}
