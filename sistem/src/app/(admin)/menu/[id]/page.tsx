import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { Foto, PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { daftarFotoSitus } from '@/lib/foto'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatWaktu } from '@/lib/waktu'
import { statusMenuAksi, ubahMenuAksi } from '../aksi'
import { medanMenu } from '../medan'

export const metadata: Metadata = { title: 'Menu' }

export default async function RincianMenu({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [m, { pesan }, foto] = await Promise.all([db.menuItem.findUnique({ where: { id }, include: { categoryRef: true } }), searchParams, daftarFotoSitus()])
  if (!m) notFound()
  const [kategori, harga] = await Promise.all([
    db.menuCategory.findMany({ where: { OR: [{ active: true }, { code: m.category }] }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
    db.menuPriceHistory.findMany({ where: { menuItemId: id }, include: { batch: true }, orderBy: { id: 'desc' }, take: 8 }),
  ])
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul={m.name} keterangan={`${m.categoryRef.name} · ${formatRupiah(m.price)}`} jejak={{ href: '/menu', label: 'Menu' }}>
        <Lencana aktif={m.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />

      <div className="kisi">
        <section className="kartu lebar" aria-labelledby="j-data">
          <h2 id="j-data">Data menu</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahMenuAksi.bind(null, m.id)}
              medan={medanMenu(
                kategori.map((c) => ({ nilai: c.code, label: c.active ? c.name : `${c.name} (nonaktif)` })),
                foto,
                { name: m.name, category: m.category, price: String(m.price), description: m.description, kcal: m.kcal === null ? '' : String(m.kcal), featured: m.featured, image: m.image },
              )}
              tombol="Simpan perubahan"
            />
          ) : (
            <div className="sel-foto">
              <Foto image={m.image} nama={m.name} ukuran={96} />
              <dl className="rincian">
                <dt>Nama</dt>
                <dd>{m.name}</dd>
                <dt>Kategori</dt>
                <dd>{m.categoryRef.name}</dd>
                <dt>Harga</dt>
                <dd>{formatRupiah(m.price)}</dd>
                <dt>Kalori</dt>
                <dd>{m.kcal ? `±${m.kcal} kkal` : '-'}</dd>
                <dt>Deskripsi</dt>
                <dd>{m.description || '-'}</dd>
              </dl>
            </div>
          )}
        </section>

        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={m.active} />
            </dd>
            <dt>Unggulan</dt>
            <dd>{m.featured ? 'Ya' : 'Tidak'}</dd>
            <dt>Dibuat</dt>
            <dd>{formatWaktu(m.createdAt)}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(m.updatedAt)}</dd>
          </dl>
          {bolehUbah ? (
            m.active ? (
              <FormStatusMaster aksi={statusMenuAksi.bind(null, m.id, false)} aktif label="Nonaktifkan menu" konfirmasi={`Nonaktifkan ${m.name}? Menu tidak muncul lagi di kasir.`} />
            ) : (
              <FormStatusMaster aksi={statusMenuAksi.bind(null, m.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=menu_item&dok=${m.id}`}>Lihat jejak audit menu ini</Link>
            </p>
          ) : null}
        </section>

        <section className="kartu" aria-labelledby="j-harga">
          <h2 id="j-harga">Riwayat harga</h2>
          {harga.length ? (
            <ul className="daftar-angka">
              {harga.map((h) => (
                <li key={h.id}>
                  <span>
                    {formatRupiah(h.oldPrice)} ke {formatRupiah(h.newPrice)}
                    <br />
                    <small className="redup">
                      {formatWaktu(h.batch.createdAt)} · {h.batch.label}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="redup">Harga belum pernah diubah sejak menu dibuat.</p>
          )}
        </section>
      </div>
    </>
  )
}
