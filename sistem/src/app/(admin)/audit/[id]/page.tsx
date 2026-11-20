import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { KepalaHalaman } from '@/components/umum'
import { NAMA_ENTITAS, NAMA_PERISTIWA } from '@/lib/audit'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { ambilAudit, barisSelisih } from '@/lib/jejak'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Rincian jejak audit' }

export default async function RincianAudit({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibIzin('atur.audit', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const a = await ambilAudit(db, p, id)
  if (!a) notFound()
  const baris = barisSelisih(a.beforeJson, a.afterJson)
  return (
    <>
      <KepalaHalaman judul={NAMA_PERISTIWA[a.action] ?? a.action} keterangan={a.summary} jejak={{ href: '/audit', label: 'Jejak Audit' }} />
      <section className="kartu" aria-labelledby="j-rincian">
        <h2 id="j-rincian">Catatan nomor {a.id}</h2>
        <dl className="rincian">
          <dt>Waktu</dt>
          <dd>{formatWaktu(a.at)}</dd>
          <dt>Aktor</dt>
          <dd>{a.user ? `${a.user.name} (${a.user.username}, ${a.user.role.name})` : `${a.actorName} (tanpa akun)`}</dd>
          <dt>Aksi</dt>
          <dd>
            <code>{a.action}</code>
          </dd>
          <dt>Entitas</dt>
          <dd>{a.docType ? `${NAMA_ENTITAS[a.docType] ?? a.docType} nomor ${a.docId ?? '-'}` : '-'}</dd>
          <dt>IP</dt>
          <dd>{a.ip ?? '-'}</dd>
          <dt>Perangkat</dt>
          <dd className="pecah">{a.userAgent || '-'}</dd>
        </dl>
      </section>
      <section className="kartu tanpa-isi" aria-labelledby="j-selisih">
        <h2 id="j-selisih" className="kartu-judul-dalam">
          Sebelum dan sesudah
        </h2>
        {baris.length ? (
          <table className="tabel selisih">
            <thead>
              <tr>
                <th scope="col">Kolom</th>
                <th scope="col">Sebelum</th>
                <th scope="col">Sesudah</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.kunci} className={b.beda ? 'beda' : undefined}>
                  <td data-label="Kolom">
                    <code>{b.kunci}</code>
                  </td>
                  <td data-label="Sebelum" className="pecah">
                    {b.sebelum || <span className="redup">kosong</span>}
                  </td>
                  <td data-label="Sesudah" className="pecah">
                    {b.sesudah || <span className="redup">kosong</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="redup kartu-judul-dalam">Catatan ini tidak menyimpan data sebelum dan sesudah.</p>
        )}
      </section>
    </>
  )
}
