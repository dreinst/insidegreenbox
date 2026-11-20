import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PesanAset } from '@/components/aset'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusKategoriAsetAksi, ubahKategoriAsetAksi } from '../../../_aset/aksi'

export const metadata: Metadata = { title: 'Kategori aset' }

export default async function RincianKategoriAset({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('aset.daftar', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [c, { pesan }] = await Promise.all([db.assetCategory.findUnique({ where: { id }, include: { _count: { select: { fixedAssets: true } } } }), searchParams])
  if (!c) notFound()
  const bolehUbah = punyaIzin(p.izin, 'aset.daftar', 'U')
  return (
    <>
      <KepalaHalaman judul={c.name} keterangan={`Kategori aset · ${c._count.fixedAssets} aset`} jejak={{ href: '/aset/kategori', label: 'Kategori aset' }}>
        <Lencana aktif={c.active} />
      </KepalaHalaman>
      <PesanAset kode={pesan} />
      <section className="kartu">
        {bolehUbah ? (
          <FormMaster
            aksi={ubahKategoriAsetAksi.bind(null, c.id)}
            medan={[
              { jenis: 'teks', nama: 'code', label: 'Kode', awal: c.code, wajib: true, maxLength: 20 },
              { jenis: 'teks', nama: 'name', label: 'Nama kategori', awal: c.name, wajib: true, maxLength: 60 },
              { jenis: 'angka', nama: 'usefulMonths', label: 'Umur manfaat bawaan (bulan)', awal: String(c.usefulMonths), wajib: true, inputMode: 'numeric', bantuan: 'Dipakai aset baru. Aset yang sudah ada tetap memakai umurnya sendiri.' },
              { jenis: 'area', nama: 'note', label: 'Catatan', awal: c.note, maxLength: 300, lebar: true },
            ]}
            tombol="Simpan kategori"
          />
        ) : (
          <dl className="rincian">
            <dt>Kode</dt>
            <dd>
              <code>{c.code}</code>
            </dd>
            <dt>Umur manfaat bawaan</dt>
            <dd>{c.usefulMonths} bulan</dd>
            <dt>Catatan</dt>
            <dd>{c.note || '-'}</dd>
          </dl>
        )}
      </section>
      {bolehUbah ? (
        <section className="kartu">
          <FormStatusMaster aksi={statusKategoriAsetAksi.bind(null, c.id, !c.active)} aktif={c.active} label={c.active ? 'Nonaktifkan kategori' : 'Aktifkan kategori'} konfirmasi={c.active ? `Nonaktifkan ${c.name}? Aset yang sudah ada tidak berubah.` : undefined} />
        </section>
      ) : null}
    </>
  )
}
