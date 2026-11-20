import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { KepalaHalaman, Lencana, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hurufIzin, isOwner, punyaIzin } from '@/lib/izin-inti'
import { MENU_TERKUNCI_OWNER, grupMenu } from '@/lib/katalog'
import { izinPeranAksi, statusPeranAksi, ubahPeranAksi } from '../aksi'
import { FormMatriks, FormNamaPeran, FormStatusPeran } from '../form'

export const metadata: Metadata = { title: 'Peran dan Izin' }

export default async function RincianPeran({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.peran', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [r, { pesan }] = await Promise.all([db.role.findUnique({ where: { id }, include: { permissions: true, _count: { select: { users: true } } } }), searchParams])
  if (!r) notFound()
  const bolehUbah = punyaIzin(p.izin, 'atur.peran', 'U')
  const bolehUbahNama = bolehUbah && (r.code !== 'owner' || isOwner(p))
  const bolehMatriks = bolehUbahNama && (r.id !== p.peran.id || isOwner(p))
  const punya = new Map(r.permissions.map((x) => [x.menuCode, hurufIzin(x)]))
  const grup = grupMenu().map(([nama, menu]) => ({
    grup: nama,
    menu: menu.map((m) => ({ kode: m.kode, nama: m.nama, aksi: m.aksi, punya: punya.get(m.kode) ?? '', kunci: r.code === 'owner' && MENU_TERKUNCI_OWNER.includes(m.kode) })),
  }))

  return (
    <>
      <KepalaHalaman judul={r.name} keterangan={`Kode ${r.code} · ${r.isSystem ? 'peran sistem' : 'peran tambahan'} · ${r._count.users} pengguna`} jejak={{ href: '/peran', label: 'Peran dan Izin' }}>
        <Lencana aktif={r.active} />
      </KepalaHalaman>
      <PesanFlash kode={pesan === 'nonaktif-peran' ? undefined : pesan} />
      {pesan === 'nonaktif-peran' ? (
        <p className="pesan sukses" role="status">
          Peran dinonaktifkan. Penggunanya tidak bisa masuk sampai peran diaktifkan lagi.
        </p>
      ) : null}

      <div className="kisi">
        {bolehUbahNama ? (
          <section className="kartu" aria-labelledby="j-nama">
            <h2 id="j-nama">Nama peran</h2>
            <FormNamaPeran aksi={ubahPeranAksi.bind(null, r.id)} nama={r.name} />
          </section>
        ) : null}
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status peran</h2>
          <p>
            <Lencana aktif={r.active} />
          </p>
          {r.isSystem ? (
            <p className="redup kecil">Peran sistem selalu aktif.</p>
          ) : bolehUbah && r.id !== p.peran.id ? (
            r.active ? (
              <FormStatusPeran aksi={statusPeranAksi.bind(null, r.id, false)} aktif label="Nonaktifkan peran" />
            ) : (
              <FormStatusPeran aksi={statusPeranAksi.bind(null, r.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          <p>
            <Link href={`/pengguna?peran=${r.id}`}>Lihat pengguna berperan ini</Link>
            {punyaIzin(p.izin, 'atur.saklar', 'L') ? (
              <>
                {' · '}
                <Link href={`/saklar?peran=${r.id}`}>Saklar fitur peran ini</Link>
              </>
            ) : null}
          </p>
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-izin">
        <h2 id="j-izin">Izin per menu</h2>
        {r.code === 'owner' ? <p className="redup">Izin Pengguna, Peran dan izin, Saklar fitur, dan Jejak audit milik Owner dikunci supaya pengelolaan akun tidak hilang.</p> : null}
        {!bolehMatriks && bolehUbah ? <p className="redup">{r.id === p.peran.id ? 'Izin peranmu sendiri hanya bisa diubah Owner.' : 'Izin peran Owner hanya bisa diubah Owner.'}</p> : null}
        <FormMatriks aksi={izinPeranAksi.bind(null, r.id)} grup={grup} bisaUbah={bolehMatriks} />
      </section>
    </>
  )
}
