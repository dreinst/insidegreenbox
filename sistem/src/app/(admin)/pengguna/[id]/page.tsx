import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { KepalaHalaman, Lencana, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { isOwner, punyaIzin } from '@/lib/izin-inti'
import { setaraOwner } from '@/lib/katalog'
import { peranBolehDiberi, peranTercakup } from '@/lib/pengguna'
import { formatWaktu } from '@/lib/waktu'
import { sandiPenggunaAksi, statusPenggunaAksi, ubahPenggunaAksi } from '../aksi'
import { FormSandi, FormStatus, FormUbahPengguna } from '../form'

export const metadata: Metadata = { title: 'Pengguna' }

export default async function RincianPengguna({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.pengguna', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [u, { pesan }] = await Promise.all([db.appUser.findUnique({ where: { id }, include: { role: true } }), searchParams])
  if (!u) notFound()
  const [peran, sesiAktif, tercakup] = await Promise.all([
    peranBolehDiberi(db, p, u.roleId),
    db.userSession.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    peranTercakup(db, p, u.role),
  ])
  // Pengguna berperan lebih kuat dari kamu (Owner, atau peran dengan izin yang tidak kamu miliki) hanya dibaca (temuan audit A-2).
  const bolehUbah = punyaIzin(p.izin, 'atur.pengguna', 'U') && (!setaraOwner(u.role.code) || isOwner(p)) && tercakup
  const diriSendiri = u.id === p.id
  const pilihan = peran.map((r) => ({ nilai: String(r.id), label: r.active ? r.name : `${r.name} (nonaktif)` }))

  return (
    <>
      <KepalaHalaman judul={u.name} keterangan={`${u.role.name} · ${u.username}`} jejak={{ href: '/pengguna', label: 'Pengguna' }}>
        <Lencana aktif={u.active} />
      </KepalaHalaman>
      <PesanFlash kode={pesan} />

      <div className="kisi">
        <section className="kartu lebar" aria-labelledby="j-data">
          <h2 id="j-data">Data pengguna</h2>
          {bolehUbah ? (
            <FormUbahPengguna
              aksi={ubahPenggunaAksi.bind(null, u.id)}
              peran={pilihan}
              awal={{ name: u.name, username: u.username, roleId: String(u.roleId) }}
              kunciPeran={diriSendiri ? 'Peranmu sendiri tidak bisa kamu ganti.' : undefined}
            />
          ) : (
            <dl className="rincian">
              {punyaIzin(p.izin, 'atur.pengguna', 'U') && !tercakup ? (
                <>
                  <dt>Ubah</dt>
                  <dd className="redup">Peran {u.role.name} punya izin atau saklar yang tidak kamu miliki, jadi pengguna ini hanya bisa diubah Owner atau Superadmin.</dd>
                </>
              ) : null}
              <dt>Nama</dt>
              <dd>{u.name}</dd>
              <dt>Nama pengguna</dt>
              <dd>{u.username}</dd>
              <dt>Peran</dt>
              <dd>{u.role.name}</dd>
            </dl>
          )}
        </section>

        {bolehUbah ? (
          <section className="kartu" aria-labelledby="j-sandi">
            <h2 id="j-sandi">Atur ulang sandi</h2>
            <p className="redup">Sesudah disimpan, semua sesi pengguna ini {diriSendiri ? 'di perangkat lain ' : ''}dicabut dan ia harus masuk lagi dengan sandi baru.</p>
            <FormSandi aksi={sandiPenggunaAksi.bind(null, u.id)} />
          </section>
        ) : null}

        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status akun</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={u.active} />
            </dd>
            <dt>Masuk terakhir</dt>
            <dd>{formatWaktu(u.lastLoginAt)}</dd>
            <dt>Sesi aktif</dt>
            <dd>{sesiAktif}</dd>
            <dt>Dibuat</dt>
            <dd>{formatWaktu(u.createdAt)}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(u.updatedAt)}</dd>
          </dl>
          {bolehUbah && !diriSendiri ? (
            u.active ? (
              <FormStatus
                aksi={statusPenggunaAksi.bind(null, u.id, false)}
                aktif
                label="Nonaktifkan pengguna"
                konfirmasi={`Nonaktifkan ${u.name}? Ia langsung keluar dari semua perangkat.`}
              />
            ) : (
              <FormStatus aksi={statusPenggunaAksi.bind(null, u.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : diriSendiri ? (
            <p className="redup kecil">Kamu tidak bisa menonaktifkan akunmu sendiri.</p>
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=app_user&dok=${u.id}`}>Lihat jejak audit pengguna ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
