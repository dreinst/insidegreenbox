import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_METODE, type JenisMetode } from '@/lib/metode-bayar'
import { statusMetodeAksi, ubahMetodeAksi } from '../aksi'
import { medanMetode } from '../medan'

export const metadata: Metadata = { title: 'Metode Bayar' }

export default async function RincianMetode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.metode_bayar', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [m, { pesan }] = await Promise.all([db.paymentMethod.findUnique({ where: { id } }), searchParams])
  if (!m) notFound()
  const bolehUbah = punyaIzin(p.izin, 'akun.metode_bayar', 'U')
  const mdr = `${m.mdrPct.toString().replace('.', ',')}%`
  return (
    <>
      <KepalaHalaman judul={m.name} keterangan={`${JENIS_METODE[m.kind as JenisMetode] ?? m.kind} · MDR ${mdr}`} jejak={{ href: '/metode-bayar', label: 'Metode Bayar' }}>
        <Lencana aktif={m.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data metode</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahMetodeAksi.bind(null, m.id)} medan={medanMetode({ name: m.name, kind: m.kind, mdrPct: m.mdrPct.toString().replace('.', ','), openDrawer: m.openDrawer })} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{m.name}</dd>
              <dt>Jenis</dt>
              <dd>{JENIS_METODE[m.kind as JenisMetode] ?? m.kind}</dd>
              <dt>MDR</dt>
              <dd>{mdr}</dd>
              <dt>Buka laci</dt>
              <dd>{m.openDrawer ? 'Ya' : 'Tidak'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={m.active} />
            </dd>
          </dl>
          {bolehUbah ? (
            m.active ? (
              <FormStatusMaster aksi={statusMetodeAksi.bind(null, m.id, false)} aktif label="Nonaktifkan metode" konfirmasi={`Nonaktifkan ${m.name}? Kasir tidak bisa memilihnya lagi.`} />
            ) : (
              <FormStatusMaster aksi={statusMetodeAksi.bind(null, m.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=payment_method&dok=${m.id}`}>Lihat jejak audit metode ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
