import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_PRODUK, type JenisProduk } from '@/lib/stok/produk'
import { statusKategoriProdukAksi, ubahKategoriProdukAksi } from '../../aksi'
import { pilihanJenis } from '../../medan'

export const metadata: Metadata = { title: 'Kategori produk' }

export default async function RincianKategoriProduk({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [c, { pesan }] = await Promise.all([db.productCategory.findUnique({ where: { id }, include: { _count: { select: { products: true } } } }), searchParams])
  if (!c) notFound()
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  return (
    <>
      <KepalaHalaman judul={c.name} keterangan={`${JENIS_PRODUK[c.kind as JenisProduk] ?? c.kind} · ${c._count.products} produk`} jejak={{ href: '/produk/kategori', label: 'Kategori produk' }}>
        <Lencana aktif={c.active} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data kategori</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahKategoriProdukAksi.bind(null, c.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama kategori', awal: c.name, wajib: true, maxLength: 60 },
                { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: c.kind, pilihan: pilihanJenis, wajib: true },
              ]}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{c.name}</dd>
              <dt>Jenis</dt>
              <dd>{JENIS_PRODUK[c.kind as JenisProduk] ?? c.kind}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <p>
            <Link href={`/produk?kategori=${c.id}`}>Lihat produk di kategori ini</Link>
          </p>
          {bolehUbah ? (
            c.active ? (
              <FormStatusMaster aksi={statusKategoriProdukAksi.bind(null, c.id, false)} aktif label="Nonaktifkan kategori" konfirmasi={`Nonaktifkan kategori ${c.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusKategoriProdukAksi.bind(null, c.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
        </section>
      </div>
    </>
  )
}
