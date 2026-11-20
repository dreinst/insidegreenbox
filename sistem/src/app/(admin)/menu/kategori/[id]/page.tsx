import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusKategoriAksi, ubahKategoriAksi } from '../../aksi'

export const metadata: Metadata = { title: 'Kategori menu' }

export default async function RincianKategori({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [c, { pesan }] = await Promise.all([db.menuCategory.findUnique({ where: { id }, include: { _count: { select: { items: true } } } }), searchParams])
  if (!c) notFound()
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul={c.name} keterangan={`Kode ${c.code} · ${c._count.items} menu`} jejak={{ href: '/menu/kategori', label: 'Kategori' }}>
        <Lencana aktif={c.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data kategori</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahKategoriAksi.bind(null, c.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama kategori', awal: c.name, wajib: true, maxLength: 40 },
                { jenis: 'angka', nama: 'sort', label: 'Urutan', awal: String(c.sort), bantuan: 'Angka kecil tampil lebih dulu.' },
              ]}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{c.name}</dd>
              <dt>Urutan</dt>
              <dd>{c.sort}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <p>
            <Link href={`/menu?kategori=${c.code}`}>Lihat {c._count.items} menu di kategori ini</Link>
          </p>
          {bolehUbah ? (
            c.active ? (
              <FormStatusMaster aksi={statusKategoriAksi.bind(null, c.id, false)} aktif label="Nonaktifkan kategori" konfirmasi={`Nonaktifkan kategori ${c.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusKategoriAksi.bind(null, c.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
        </section>
      </div>
    </>
  )
}
