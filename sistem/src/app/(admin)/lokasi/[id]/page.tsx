import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_LOKASI } from '@/lib/stok/lokasi'
import { statusLokasiAksi, ubahLokasiAksi } from '../aksi'
import { medanLokasi } from '../medan'

export const metadata: Metadata = { title: 'Lokasi' }

export default async function RincianLokasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.lokasi', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [l, { pesan }] = await Promise.all([db.location.findUnique({ where: { id }, include: { branch: true } }), searchParams])
  if (!l) notFound()
  const bolehUbah = punyaIzin(p.izin, 'atur.lokasi', 'U')
  const jenis = JENIS_LOKASI[l.kind as keyof typeof JENIS_LOKASI] ?? l.kind
  return (
    <>
      <KepalaHalaman judul={l.name} keterangan={`${l.code} · ${jenis} · cabang ${l.branch.name}`} jejak={{ href: '/lokasi', label: 'Lokasi' }}>
        <Lencana aktif={l.active} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data lokasi</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahLokasiAksi.bind(null, l.id)} medan={medanLokasi({ code: l.code, name: l.name, kind: l.kind, allowNegativeStock: l.allowNegativeStock })} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Kode</dt>
              <dd>
                <code>{l.code}</code>
              </dd>
              <dt>Jenis</dt>
              <dd>{jenis}</dd>
              <dt>Stok minus</dt>
              <dd>{l.allowNegativeStock ? 'Boleh' : 'Ditolak'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          {punyaIzin(p.izin, 'stok.saldo', 'L') ? (
            <p>
              <Link href={`/stok?lokasi=${l.id}`}>Lihat posisi stok di lokasi ini</Link>
            </p>
          ) : null}
          {bolehUbah ? (
            l.active ? (
              <FormStatusMaster aksi={statusLokasiAksi.bind(null, l.id, false)} aktif label="Nonaktifkan lokasi" konfirmasi={`Nonaktifkan ${l.name}? Lokasi harus kosong dulu.`} />
            ) : (
              <FormStatusMaster aksi={statusLokasiAksi.bind(null, l.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=location&dok=${l.id}`}>Lihat jejak audit lokasi ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
