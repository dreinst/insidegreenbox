import type { Metadata } from 'next'
import Link from 'next/link'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { NAMA_ENTITAS, NAMA_PERISTIWA } from '@/lib/audit'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { cariAudit, lihatSemua, type SaringAudit } from '@/lib/jejak'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Jejak Audit' }

export default async function JejakAudit({ searchParams }: { searchParams: Promise<SaringAudit> }) {
  const p = await wajibIzin('atur.audit', 'L')
  const s = await searchParams
  const semua = lihatSemua(p)
  const [hasil, pengguna] = await Promise.all([cariAudit(db, p, s), semua ? db.appUser.findMany({ select: { id: true, name: true, username: true }, orderBy: { name: 'asc' } }) : []])
  const disaring = !!(s.dari || s.sampai || s.aktor || s.aksi || s.entitas || s.dok)
  return (
    <>
      <KepalaHalaman
        judul="Jejak Audit"
        keterangan={semua ? 'Semua perubahan, login, dan penolakan akses. Catatan ini tidak bisa diubah atau dihapus.' : 'Aktivitasmu sendiri. Catatan ini tidak bisa diubah atau dihapus.'}
      />
      <form className="saring" method="get" role="search" aria-label="Saring jejak audit">
        <div className="kolom">
          <label htmlFor="a-dari">Dari tanggal</label>
          <input id="a-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="a-sampai">Sampai tanggal</label>
          <input id="a-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
        </div>
        {semua ? (
          <div className="kolom">
            <label htmlFor="a-aktor">Aktor</label>
            <select id="a-aktor" name="aktor" defaultValue={s.aktor ?? ''}>
              <option value="">Semua aktor</option>
              {pengguna.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.username})
                </option>
              ))}
              <option value="0">Tanpa akun (nama tak dikenal, seed)</option>
            </select>
          </div>
        ) : null}
        <div className="kolom">
          <label htmlFor="a-aksi">Aksi</label>
          <select id="a-aksi" name="aksi" defaultValue={s.aksi ?? ''}>
            <option value="">Semua aksi</option>
            {Object.entries(NAMA_PERISTIWA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="a-entitas">Entitas</label>
          <select id="a-entitas" name="entitas" defaultValue={s.entitas ?? ''}>
            <option value="">Semua entitas</option>
            {Object.entries(NAMA_ENTITAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {s.dok ? <input type="hidden" name="dok" value={s.dok} /> : null}
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/audit">Hapus saringan</Link> : null}
        </div>
      </form>
      {s.dok ? (
        <p className="redup">
          Hanya catatan untuk {NAMA_ENTITAS[s.entitas ?? ''] ?? 'data'} nomor {s.dok}.
        </p>
      ) : null}

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Waktu</th>
                <th scope="col">Aktor</th>
                <th scope="col">Aksi</th>
                <th scope="col">Ringkasan</th>
                <th scope="col">
                  <span className="sr">Rincian</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((a) => (
                <tr key={a.id}>
                  <td data-label="Waktu" className="nowrap">
                    {formatWaktu(a.at)}
                  </td>
                  <td data-label="Aktor">{a.user?.name ?? a.actorName}</td>
                  <td data-label="Aksi">
                    <span className={`lencana ${a.action.startsWith('masuk.gagal') || a.action.endsWith('terkunci') || a.action === 'izin.ditolak' ? 'merah' : 'abu'}`}>
                      {NAMA_PERISTIWA[a.action] ?? a.action}
                    </span>
                  </td>
                  <td data-label="Ringkasan" className="ringkasan">
                    {a.summary}
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/audit/${a.id}`} aria-label={`Rincian catatan ${a.id}`}>
                      Rincian
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada catatan yang cocok dengan saringan.' : 'Belum ada catatan.'}</p>
      )}
      <Halaman {...hasil} dasar="/audit" query={s} />
    </>
  )
}
