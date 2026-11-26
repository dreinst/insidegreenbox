import type { Metadata } from 'next'
import Link from 'next/link'
import { rp } from '@/components/akuntansi'
import { RingkasLaporan } from '@/components/laporan'
import { formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { JENIS_AKUN } from '@/lib/akuntansi/akun'
import { namaSumber, tautanSumber } from '@/lib/akuntansi/dokumen'
import { bukuBesar, sumberJurnal } from '@/lib/akuntansi/laporan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Buku Besar' }

type Saring = { akun?: string; dari?: string; sampai?: string; sumber?: string; hal?: string }

export default async function BukuBesar({ searchParams }: { searchParams: Promise<Saring> }) {
  const p = await wajibIzin('akun.buku_besar', 'L')
  const s = await searchParams
  const [bb, akun, sumber] = await Promise.all([bukuBesar(db, s), db.account.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, isPostable: true } }), sumberJurnal(db)])
  akun.sort((a, b) => a.code.localeCompare(b.code, 'id', { numeric: true }))
  const lihatJurnal = punyaIzin(p.izin, 'akun.jurnal', 'L')
  const csv = new URLSearchParams({ jenis: 'buku-besar', ...(bb.akun ? { akun: String(bb.akun.id) } : {}), dari: bb.rentang.dari, sampai: bb.rentang.sampai, ...(s.sumber ? { sumber: s.sumber } : {}) })
  return (
    <>
      <KepalaHalaman judul="Buku Besar" keterangan="Mutasi satu akun dengan saldo awal, saldo berjalan, dan saldo akhir. Akun induk mencakup semua akun di bawahnya. Saldo ditulis menurut saldo normal akunnya." />
      <form className="saring lap-saring" method="get" role="search" aria-label="Saring buku besar">
        <div className="kolom">
          <label htmlFor="s-akun">Akun</label>
          <select id="s-akun" name="akun" defaultValue={bb.akun ? String(bb.akun.id) : ''} required>
            <option value="">Pilih akun</option>
            {akun.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
                {a.isPostable ? '' : ' (induk)'}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={bb.rentang.dari} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={bb.rentang.sampai} />
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
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Tampilkan
          </button>
          {bb.akun ? (
            <a href={`/laporan-keuangan/unduh?${csv.toString()}`} className="lap-unduh" download>
              Unduh CSV
            </a>
          ) : null}
        </div>
      </form>
      {bb.rentang.catatan ? <p className="lap-catatan">{bb.rentang.catatan}</p> : null}
      {!bb.akun ? (
        <p className="kosong">Pilih akun untuk melihat buku besarnya.</p>
      ) : (
        <>
          <h2 className="lap-judul">
            {bb.akun.code} {bb.akun.name} <small className="redup">({JENIS_AKUN[bb.akun.kind]}, saldo normal {bb.normalDebit ? 'debit' : 'kredit'})</small>
          </h2>
          <RingkasLaporan
            isi={[
              { label: 'Saldo awal', nilai: rp(bb.saldoAwal), catatan: `per ${bb.rentang.dari}` },
              { label: 'Debit', nilai: rp(bb.debit) },
              { label: 'Kredit', nilai: rp(bb.kredit) },
              { label: 'Saldo akhir', nilai: rp(bb.saldoAkhir), catatan: `per ${bb.rentang.sampai}${s.sumber ? ', hanya sumber terpilih' : ''}` },
            ]}
          />
          {bb.baris.length ? (
            <div className="kartu tanpa-isi lap-gulir" role="region" aria-label="Mutasi buku besar" tabIndex={0}>
              <table className="tabel lap-tabel">
                <thead>
                  <tr>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Jurnal</th>
                    <th scope="col">Sumber</th>
                    <th scope="col">Keterangan</th>
                    <th scope="col" className="angka">
                      Debit
                    </th>
                    <th scope="col" className="angka">
                      Kredit
                    </th>
                    <th scope="col" className="angka">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bb.baris.map((b) => {
                    const href = b.sumber === 'memorial' ? null : tautanSumber(b.sumber, b.sourceId, b.docNo)
                    return (
                      <tr key={b.lineId}>
                        <td data-label="Tanggal">{formatTanggal(new Date(`${b.tanggal}T00:00:00Z`))}</td>
                        <td data-label="Jurnal" className="tebal">
                          {lihatJurnal ? <Link href={`/jurnal/${b.jurnalId}`}>{b.no}</Link> : b.no}
                        </td>
                        <td data-label="Sumber">
                          {namaSumber(b.sumber)}
                          {b.sumber !== 'memorial' && b.docNo ? <small className="redup blok">{href ? <Link href={href}>{b.docNo}</Link> : b.docNo}</small> : null}
                        </td>
                        <td data-label="Keterangan" className="pecah">
                          {b.keterangan || '-'}
                        </td>
                        <td data-label="Debit" className="angka">
                          {b.debit ? rp(b.debit) : ''}
                        </td>
                        <td data-label="Kredit" className="angka">
                          {b.kredit ? rp(b.kredit) : ''}
                        </td>
                        <td data-label="Saldo" className="angka">
                          {rp(b.saldo)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kosong">Tidak ada mutasi akun ini pada rentang dan saringan ini.</p>
          )}
          <Halaman hal={bb.hal} jumlahHal={bb.jumlahHal} total={bb.total} dasar="/buku-besar" query={{ akun: String(bb.akun.id), dari: bb.rentang.dari, sampai: bb.rentang.sampai, sumber: s.sumber }} />
        </>
      )}
    </>
  )
}
