import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusRekeningAksi, ubahRekeningAksi } from '../aksi'
import { medanRekening } from '../medan'

export const metadata: Metadata = { title: 'Rekening Bank' }

export default async function RincianRekening({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kas.rekening', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [r, { pesan }] = await Promise.all([db.bankAccount.findUnique({ where: { id }, include: { _count: { select: { posSettlements: true } } } }), searchParams])
  if (!r) notFound()
  const bolehUbah = punyaIzin(p.izin, 'kas.rekening', 'U')
  return (
    <>
      <KepalaHalaman judul={`${r.bankName} ${r.accountNo}`} keterangan={`a.n. ${r.holderName}`} jejak={{ href: '/rekening', label: 'Rekening Bank' }}>
        <Lencana aktif={r.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data rekening</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahRekeningAksi.bind(null, r.id)} medan={medanRekening(r)} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Bank</dt>
              <dd>{r.bankName}</dd>
              <dt>Nomor</dt>
              <dd>{r.accountNo}</dd>
              <dt>Atas nama</dt>
              <dd>{r.holderName}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={r.active} />
            </dd>
            <dt>Dipakai setoran</dt>
            <dd>
              {r._count.posSettlements}
              {r._count.posSettlements && punyaIzin(p.izin, 'kasir.setoran', 'L') ? (
                <>
                  {' · '}
                  <Link href="/setoran">Lihat setoran</Link>
                </>
              ) : null}
            </dd>
          </dl>
          {bolehUbah ? (
            r.active ? (
              <FormStatusMaster aksi={statusRekeningAksi.bind(null, r.id, false)} aktif label="Nonaktifkan rekening" konfirmasi={`Nonaktifkan ${r.bankName} ${r.accountNo}? Rekening ini tidak bisa dipilih untuk setoran baru.`} />
            ) : (
              <FormStatusMaster aksi={statusRekeningAksi.bind(null, r.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=bank_account&dok=${r.id}`}>Lihat jejak audit rekening ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
