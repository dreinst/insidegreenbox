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
import { statusPaketAksi, ubahPaketAksi } from '../../aksi'
import { medanPaket } from '../../medan'

export const metadata: Metadata = { title: 'Paket set' }

export default async function RincianPaket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [x, { pesan }, foto] = await Promise.all([db.menuSet.findUnique({ where: { id }, include: { mainItem: true, drinkItem: true } }), searchParams, daftarFotoSitus()])
  if (!x) notFound()
  const menu = await db.menuItem.findMany({ where: { OR: [{ active: true }, { id: x.mainItemId }, { id: x.drinkItemId }] }, orderBy: [{ categoryRef: { sort: 'asc' } }, { sort: 'asc' }] })
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul={x.name} keterangan={`${x.mainItem.name} + ${x.drinkItem.name} · ${formatRupiah(x.price)}`} jejak={{ href: '/menu/paket', label: 'Paket set' }}>
        <Lencana aktif={x.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu lebar" aria-labelledby="j-data">
          <h2 id="j-data">Data paket</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahPaketAksi.bind(null, x.id)}
              medan={medanPaket(
                menu.map((m) => ({ nilai: String(m.id), label: m.active ? m.name : `${m.name} (nonaktif)` })),
                foto,
                { name: x.name, mainItemId: String(x.mainItemId), drinkItemId: String(x.drinkItemId), normalPrice: String(x.normalPrice), price: String(x.price), image: x.image },
              )}
              tombol="Simpan perubahan"
            />
          ) : (
            <div className="sel-foto">
              <Foto image={x.image} nama={x.name} ukuran={96} />
              <dl className="rincian">
                <dt>Menu utama</dt>
                <dd>{x.mainItem.name}</dd>
                <dt>Minuman</dt>
                <dd>{x.drinkItem.name}</dd>
                <dt>Harga normal</dt>
                <dd>{formatRupiah(x.normalPrice)}</dd>
                <dt>Harga paket</dt>
                <dd>{formatRupiah(x.price)}</dd>
              </dl>
            </div>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={x.active} />
            </dd>
            <dt>Dibuat</dt>
            <dd>{formatWaktu(x.createdAt)}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(x.updatedAt)}</dd>
          </dl>
          {bolehUbah ? (
            x.active ? (
              <FormStatusMaster aksi={statusPaketAksi.bind(null, x.id, false)} aktif label="Nonaktifkan paket" konfirmasi={`Nonaktifkan paket ${x.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusPaketAksi.bind(null, x.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=menu_set&dok=${x.id}`}>Lihat jejak audit paket ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
