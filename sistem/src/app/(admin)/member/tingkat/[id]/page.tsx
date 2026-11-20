import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusTingkatAksi, ubahTingkatAksi } from '../../aksi'
import { medanTingkat } from '../../medan'

export const metadata: Metadata = { title: 'Tingkat Greenbox Key' }

export default async function RincianTingkat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.tingkat', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [t, { pesan }] = await Promise.all([db.memberTier.findUnique({ where: { id }, include: { _count: { select: { members: true } } } }), searchParams])
  if (!t) notFound()
  const bolehUbah = punyaIzin(p.izin, 'menu.tingkat', 'U')
  return (
    <>
      <KepalaHalaman judul={t.name} keterangan={`Syarat ${t.minVisits} kunjungan · potongan ${t.discountPct.toString().replace('.', ',')}% · ${t._count.members} member`} jejak={{ href: '/member/tingkat', label: 'Tingkat' }}>
        <Lencana aktif={t.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data tingkat</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahTingkatAksi.bind(null, t.id)} medan={medanTingkat({ name: t.name, minVisits: String(t.minVisits), discountPct: t.discountPct.toString().replace('.', ','), perk: t.perk })} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{t.name}</dd>
              <dt>Syarat kunjungan</dt>
              <dd>{t.minVisits}</dd>
              <dt>Potongan</dt>
              <dd>{t.discountPct.toString().replace('.', ',')}%</dd>
              <dt>Keterangan</dt>
              <dd>{t.perk || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <p>
            <Link href={`/member?tingkat=${t.id}`}>Lihat {t._count.members} member di tingkat ini</Link>
          </p>
          {bolehUbah ? (
            t.active ? (
              <FormStatusMaster aksi={statusTingkatAksi.bind(null, t.id, false)} aktif label="Nonaktifkan tingkat" konfirmasi={`Nonaktifkan tingkat ${t.name}? Member di tingkat ini turun ke tingkat di bawahnya.`} />
            ) : (
              <FormStatusMaster aksi={statusTingkatAksi.bind(null, t.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
        </section>
      </div>
    </>
  )
}
