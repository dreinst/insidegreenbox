import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusSatuanAksi, ubahSatuanAksi } from '../../aksi'

export const metadata: Metadata = { title: 'Satuan' }

export default async function RincianSatuan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [u, { pesan }] = await Promise.all([db.unit.findUnique({ where: { id }, include: { _count: { select: { productsBase: true } } } }), searchParams])
  if (!u) notFound()
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  return (
    <>
      <KepalaHalaman judul={u.name} keterangan={`Simbol ${u.symbol} · satuan dasar ${u._count.productsBase} produk`} jejak={{ href: '/produk/satuan', label: 'Satuan' }}>
        <Lencana aktif={u.active} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data satuan</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahSatuanAksi.bind(null, u.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama satuan', awal: u.name, wajib: true, maxLength: 30 },
                { jenis: 'teks', nama: 'symbol', label: 'Simbol', awal: u.symbol, wajib: true, maxLength: 10 },
              ]}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{u.name}</dd>
              <dt>Simbol</dt>
              <dd>{u.symbol}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          {bolehUbah ? (
            u.active ? (
              <FormStatusMaster aksi={statusSatuanAksi.bind(null, u.id, false)} aktif label="Nonaktifkan satuan" konfirmasi={`Nonaktifkan satuan ${u.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusSatuanAksi.bind(null, u.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : (
            <Lencana aktif={u.active} />
          )}
        </section>
      </div>
    </>
  )
}
