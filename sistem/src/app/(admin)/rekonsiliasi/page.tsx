import '@/app/(admin)/kas.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanRekon } from '@/components/rekonsiliasi'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { daftarRekonsiliasi, mutasiTerbuka } from '@/lib/rekonsiliasi'
import { namaRekening } from '@/lib/rekening'

export const metadata: Metadata = { title: 'Rekonsiliasi Bank' }

type Saring = { rekening?: string; status?: string; hal?: string; pesan?: string; batch?: string }

export default async function DaftarRekonsiliasi({ searchParams }: { searchParams: Promise<Saring> }) {
  const p = await wajibIzin('kas.rekonsiliasi', 'L')
  const s = await searchParams
  const [hasil, rekening, terbuka] = await Promise.all([daftarRekonsiliasi(db, s), db.bankAccount.findMany({ orderBy: { id: 'asc' } }), mutasiTerbuka(db)])
  const nama = new Map(rekening.map((r) => [r.id, namaRekening(r)]))
  // Ringkasan impor dibaca dari audit, bukan dari isi query.
  const impor = s.pesan === 'impor' && s.batch ? await db.auditLog.findFirst({ where: { action: 'mutasi.impor', docId: s.batch.slice(0, 60), userId: p.id } }) : null
  const isiImpor = impor?.afterJson as { baru?: number; sudahAda?: number; terkunci?: number; bukanMutasi?: number } | null
  const bolehT = punyaIzin(p.izin, 'kas.rekonsiliasi', 'T')
  return (
    <>
      <KepalaHalaman judul="Rekonsiliasi Bank" keterangan="Mencocokkan mutasi rekening koran dengan jurnal bank per rekening per periode. Impor mutasi dari CSV, cocokkan, lalu posting bila selisihnya 0.">
        {bolehT ? (
          <div className="deret-tombol">
            <Link href="/rekonsiliasi/impor" className="btn">
              Impor mutasi
            </Link>
            <Link href="/rekonsiliasi/baru" className="btn sekunder">
              Buat rekonsiliasi
            </Link>
          </div>
        ) : null}
      </KepalaHalaman>
      <PesanRekon kode={s.pesan} />
      {isiImpor ? (
        <p className="rk-hasil" role="status">
          Impor selesai: {isiImpor.baru ?? 0} baris baru, {isiImpor.sudahAda ?? 0} sudah pernah diimpor (dilewati), {isiImpor.terkunci ?? 0} di periode yang sudah direkonsiliasi, {isiImpor.bukanMutasi ?? 0} baris bukan mutasi.
        </p>
      ) : null}
      {terbuka.length ? (
        <section className="kartu" aria-labelledby="j-terbuka">
          <h2 id="j-terbuka">Mutasi yang belum masuk rekonsiliasi</h2>
          <ul className="rk-cek">
            {terbuka.map((t) => (
              <li key={t.bankAccountId}>
                <span>
                  {nama.get(t.bankAccountId)}: {t.jumlah} baris, {formatTanggal(t.dari)} sampai {formatTanggal(t.sampai)}.{' '}
                  {bolehT ? <Link href={`/rekonsiliasi/baru?rekening=${t.bankAccountId}`}>Buat rekonsiliasi</Link> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form className="saring" method="get" role="search" aria-label="Saring rekonsiliasi">
        <div className="kolom">
          <label htmlFor="s-rekening">Rekening</label>
          <select id="s-rekening" name="rekening" defaultValue={s.rekening ?? ''}>
            <option value="">Semua rekening</option>
            {rekening.map((r) => (
              <option key={r.id} value={r.id}>
                {namaRekening(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {['Draft', 'Diposting', 'Batal'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {s.rekening || s.status ? <Link href="/rekonsiliasi">Hapus saringan</Link> : null}
        </div>
      </form>
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Rekening</th>
                <th scope="col">Periode</th>
                <th scope="col" className="angka">
                  Saldo awal
                </th>
                <th scope="col" className="angka">
                  Saldo akhir
                </th>
                <th scope="col" className="angka">
                  Selisih
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((r) => (
                <tr key={r.id}>
                  <td data-label="Nomor">
                    <Link href={`/rekonsiliasi/${r.id}`} className="tebal">
                      {r.no}
                    </Link>
                  </td>
                  <td data-label="Rekening">{namaRekening(r.bankAccount)}</td>
                  <td data-label="Periode">
                    {formatTanggal(r.periodFrom)} sampai {formatTanggal(r.periodTo)}
                  </td>
                  <td data-label="Saldo awal" className="angka">
                    {formatRupiah(r.stmtOpening)}
                  </td>
                  <td data-label="Saldo akhir" className="angka">
                    {formatRupiah(r.stmtClosing)}
                  </td>
                  <td data-label="Selisih" className="angka">
                    {r.status === 'Batal' ? '-' : formatRupiah(r.diff)}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada rekonsiliasi.</p>
      )}
      <Halaman {...hasil} dasar="/rekonsiliasi" query={s} />
    </>
  )
}
