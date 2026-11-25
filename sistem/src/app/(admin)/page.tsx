import type { Metadata } from 'next'
import Link from 'next/link'
import { KepalaHalaman } from '@/components/umum'
import { NAMA_PERISTIWA } from '@/lib/audit'
import { db } from '@/lib/db'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { lihatSemua } from '@/lib/jejak'
import { JENIS_MENUNGGU, bolehLihatMenunggu, hitungMenunggu } from '@/lib/menunggu'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Beranda' }

export default async function Beranda() {
  const p = await wajibMasuk()
  const bolehPengguna = punyaIzin(p.izin, 'atur.pengguna', 'L')
  const bolehAudit = punyaIzin(p.izin, 'atur.audit', 'L')
  const semua = lihatSemua(p)
  const bolehMenunggu = bolehLihatMenunggu(p)

  const [peran, hitung, aktivitas, riwayatMasuk, menunggu] = await Promise.all([
    bolehPengguna ? db.role.findMany({ orderBy: { id: 'asc' } }) : [],
    bolehPengguna ? db.appUser.groupBy({ by: ['roleId', 'active'], _count: { _all: true } }) : [],
    bolehAudit
      ? db.auditLog.findMany({ where: semua ? {} : { userId: p.id }, orderBy: { id: 'desc' }, take: 8, include: { user: { select: { name: true } } } })
      : [],
    db.auditLog.findMany({ where: { userId: p.id, action: { in: ['masuk.berhasil', 'masuk.gagal', 'masuk.terkunci'] } }, orderBy: { id: 'desc' }, take: 5 }),
    bolehMenunggu ? hitungMenunggu(db, p) : null,
  ])
  // Jenis dokumen yang sedang menunggu, urut sesuai daftar antrean (KONTRAK 11 butir 158).
  const perJenis = menunggu ? JENIS_MENUNGGU.filter((j) => menunggu.perJenis.get(j.kunci)).map((j) => ({ kunci: j.kunci, nama: j.nama, n: menunggu.perJenis.get(j.kunci)! })) : []
  const jumlah = (roleId: number, aktif: boolean) => hitung.find((h) => h.roleId === roleId && h.active === aktif)?._count._all ?? 0
  const totalAktif = hitung.filter((h) => h.active).reduce((n, h) => n + h._count._all, 0)

  return (
    <>
      <KepalaHalaman judul={`Halo, ${p.name}`} keterangan={`Kamu masuk sebagai ${p.peran.name}.`} />
      <div className="kisi">
        {menunggu ? (
          <section className="kartu" aria-labelledby="judul-menunggu">
            <div className="kartu-kepala">
              <h2 id="judul-menunggu">Menunggu persetujuan</h2>
              <Link href="/menunggu-persetujuan">Buka daftar</Link>
            </div>
            <p className="angka-besar">{menunggu.bisa}</p>
            <p className="redup">{menunggu.bisa ? 'dokumen menunggu tindakanmu' : 'Tidak ada dokumen yang menunggu tindakanmu.'}</p>
            {perJenis.length ? (
              <ul className="daftar-angka">
                {perJenis.map((j) => (
                  <li key={j.kunci}>
                    <Link href={`/menunggu-persetujuan?jenis=${encodeURIComponent(j.kunci)}`}>{j.nama}</Link>
                    <span>
                      <b>{j.n}</b>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {bolehPengguna ? (
          <section className="kartu" aria-labelledby="judul-pengguna">
            <div className="kartu-kepala">
              <h2 id="judul-pengguna">Pengguna aktif</h2>
              <Link href="/pengguna">Lihat semua</Link>
            </div>
            <p className="angka-besar">{totalAktif}</p>
            <ul className="daftar-angka">
              {peran.map((r) => (
                <li key={r.id}>
                  <Link href={`/pengguna?peran=${r.id}&status=aktif`}>{r.name}</Link>
                  <span>
                    <b>{jumlah(r.id, true)}</b> aktif
                    {jumlah(r.id, false) ? <small className="redup"> · {jumlah(r.id, false)} nonaktif</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="kartu" aria-labelledby="judul-masuk">
          <div className="kartu-kepala">
            <h2 id="judul-masuk">Riwayat masuk akunmu</h2>
          </div>
          {riwayatMasuk.length ? (
            <ul className="daftar-waktu">
              {riwayatMasuk.map((a) => (
                <li key={a.id}>
                  <span className={`titik ${a.action === 'masuk.berhasil' ? 'hijau' : 'merah'}`} aria-hidden="true" />
                  <span>
                    {NAMA_PERISTIWA[a.action] ?? a.action}
                    <small className="redup">
                      {formatWaktu(a.at)} · IP {a.ip}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="redup">Belum ada catatan masuk.</p>
          )}
        </section>

        {bolehAudit ? (
          <section className="kartu lebar" aria-labelledby="judul-aktivitas">
            <div className="kartu-kepala">
              <h2 id="judul-aktivitas">{semua ? 'Aktivitas terakhir' : 'Aktivitas terakhirmu'}</h2>
              <Link href="/audit">Buka jejak audit</Link>
            </div>
            {aktivitas.length ? (
              <ul className="daftar-waktu">
                {aktivitas.map((a) => (
                  <li key={a.id}>
                    <span className="titik" aria-hidden="true" />
                    <span>
                      <Link href={`/audit/${a.id}`}>{a.summary || NAMA_PERISTIWA[a.action] || a.action}</Link>
                      <small className="redup">
                        {formatWaktu(a.at)} · {a.user?.name ?? a.actorName}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="redup">Belum ada aktivitas.</p>
            )}
          </section>
        ) : null}
      </div>
    </>
  )
}
