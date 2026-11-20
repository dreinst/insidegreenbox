import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormPromo, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { JENIS_PROMO, NAMA_STATUS_PROMO, nilaiPromoTeks, statusPromo, type JenisPromo } from '@/lib/promo'
import { formatWaktu } from '@/lib/waktu'
import { statusPromoAksi, ubahPromoAksi } from '../aksi'

export const metadata: Metadata = { title: 'Promo' }

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

export default async function RincianPromo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.promo', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [x, { pesan }] = await Promise.all([db.promo.findUnique({ where: { id }, include: { giftItem: true } }), searchParams])
  if (!x) notFound()
  const menu = await db.menuItem.findMany({ where: { OR: [{ active: true }, ...(x.giftItemId ? [{ id: x.giftItemId }] : [])] }, orderBy: [{ categoryRef: { sort: 'asc' } }, { sort: 'asc' }] })
  const bolehUbah = punyaIzin(p.izin, 'menu.promo', 'U')
  const st = NAMA_STATUS_PROMO[statusPromo(x)]
  return (
    <>
      <KepalaHalaman judul={x.name} keterangan={`${JENIS_PROMO[x.kind as JenisPromo] ?? x.kind} · ${nilaiPromoTeks(x)}`} jejak={{ href: '/promo', label: 'Promo' }}>
        <span className={`lencana ${st.warna}`}>{st.teks}</span>
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu lebar" aria-labelledby="j-data">
          <h2 id="j-data">Data promo</h2>
          {bolehUbah ? (
            <FormPromo
              aksi={ubahPromoAksi.bind(null, x.id)}
              awal={{
                name: x.name,
                kind: x.kind,
                percent: x.percent?.toString().replace('.', ',') ?? '',
                amount: x.amount ? String(x.amount) : '',
                giftItemId: x.giftItemId ? String(x.giftItemId) : '',
                minSpend: x.minSpend > 0n ? String(x.minSpend) : '',
                startsOn: iso(x.startsOn),
                endsOn: iso(x.endsOn),
                condition: x.condition,
              }}
              hadiah={[{ nilai: '', label: 'Pilih menu hadiah' }, ...menu.map((m) => ({ nilai: String(m.id), label: m.active ? m.name : `${m.name} (nonaktif)` }))]}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Jenis</dt>
              <dd>{JENIS_PROMO[x.kind as JenisPromo] ?? x.kind}</dd>
              <dt>Nilai</dt>
              <dd>{nilaiPromoTeks(x)}</dd>
              <dt>Belanja minimal</dt>
              <dd>{x.minSpend > 0n ? formatRupiah(x.minSpend) : 'Tanpa minimal'}</dd>
              <dt>Masa berlaku</dt>
              <dd>{x.startsOn || x.endsOn ? `${iso(x.startsOn) || 'sejak awal'} sampai ${iso(x.endsOn) || 'tanpa batas'}` : 'Tanpa batas waktu'}</dd>
              <dt>Syarat</dt>
              <dd>{x.condition || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <span className={`lencana ${st.warna}`}>{st.teks}</span>
            </dd>
            <dt>Dibuat</dt>
            <dd>{formatWaktu(x.createdAt)}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(x.updatedAt)}</dd>
          </dl>
          {bolehUbah ? (
            x.active ? (
              <FormStatusMaster aksi={statusPromoAksi.bind(null, x.id, false)} aktif label="Nonaktifkan promo" konfirmasi={`Nonaktifkan promo ${x.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusPromoAksi.bind(null, x.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=promo&dok=${x.id}`}>Lihat jejak audit promo ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
