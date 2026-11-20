import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { KepalaHalaman, Lencana, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { muatIzin, punyaIzin } from '@/lib/izin-inti'
import { bolehAturPinUntuk, bolehMasukPin } from '@/lib/pin'
import { formatWaktu } from '@/lib/waktu'
import { aturPinAksi, hapusPinAksi } from '../aksi'
import { FormHapusPin, FormPin } from '../form'

export const metadata: Metadata = { title: 'PIN Kasir' }

export default async function RincianPin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kasir.pin', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [u, { pesan }] = await Promise.all([db.appUser.findUnique({ where: { id }, include: { role: true } }), searchParams])
  if (!u || !u.active || !(await bolehAturPinUntuk(db, p, u))) notFound()
  const masukPin = bolehMasukPin(u.role.code, await muatIzin(db, u.roleId))
  const bolehUbah = punyaIzin(p.izin, 'kasir.pin', 'U')
  return (
    <>
      <KepalaHalaman judul={`PIN ${u.name}`} keterangan={`${u.role.name} · ${u.username}`} jejak={{ href: '/pin', label: 'PIN Kasir' }}>
        <Lencana aktif={!!u.pinHash} teksAktif="PIN terpasang" teksMati="Belum ada PIN" />
      </KepalaHalaman>
      <PesanFlash kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-pin">
          <h2 id="j-pin">{u.pinHash ? 'Ganti PIN' : 'Pasang PIN'}</h2>
          <p className="redup">
            {masukPin
              ? 'Dengan PIN ini ia bisa masuk ke layar kasir tanpa sandi. '
              : `Peran ${u.role.name} tetap masuk dengan sandi. PIN ini hanya dipakai untuk menyetujui void di layar kasir. `}
            Sesudah disimpan, sesi lain pengguna ini dicabut.
          </p>
          {bolehUbah ? <FormPin aksi={aturPinAksi.bind(null, u.id)} ada={!!u.pinHash} /> : <p className="redup">Kamu hanya bisa melihat status PIN.</p>}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>PIN</dt>
            <dd>{u.pinHash ? 'Terpasang' : 'Belum ada'}</dd>
            <dt>Masuk dengan PIN</dt>
            <dd>{masukPin ? 'Boleh' : 'Tidak, wajib sandi'}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(u.updatedAt)}</dd>
          </dl>
          {bolehUbah && u.pinHash ? <FormHapusPin aksi={hapusPinAksi.bind(null, u.id)} nama={u.name} /> : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?aksi=pengguna.pin&dok=${u.id}`}>Lihat riwayat PIN di jejak audit</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
