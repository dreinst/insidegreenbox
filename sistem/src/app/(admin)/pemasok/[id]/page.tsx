import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanBeli } from '@/components/beli'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { hutangPemasok } from '@/lib/beli/hutang'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { statusPemasokAksi, ubahPemasokAksi } from '../../_beli/aksi'
import { medanPemasok } from '../medan'

export const metadata: Metadata = { title: 'Pemasok' }

export default async function RincianPemasok({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.pemasok', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [s, { pesan }] = await Promise.all([db.supplier.findUnique({ where: { id } }), searchParams])
  if (!s) notFound()
  const [pesanan, hutang] = await Promise.all([
    db.purchaseOrder.count({ where: { supplierId: id, status: 'Disetujui' } }),
    punyaIzin(p.izin, 'kas.hutang', 'L') ? hutangPemasok(db, { pemasok: String(id) }) : null,
  ])
  const saldo = hutang?.perPemasok[0]
  const bolehUbah = punyaIzin(p.izin, 'beli.pemasok', 'U')
  return (
    <>
      <KepalaHalaman judul={s.name} keterangan={`${s.code}${s.creditDays ? ` · termin ${s.creditDays} hari` : ' · tunai'}`} jejak={{ href: '/pemasok', label: 'Pemasok' }}>
        <Lencana aktif={s.active} />
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data pemasok</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahPemasokAksi.bind(null, s.id)} medan={medanPemasok(s)} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Kontak</dt>
              <dd>{[s.contact, s.phone].filter(Boolean).join(' · ') || '-'}</dd>
              <dt>Alamat</dt>
              <dd>{s.address || '-'}</dd>
              <dt>Rekening</dt>
              <dd>{s.bankName || s.bankAccountNo ? `${s.bankName} ${s.bankAccountNo}` : '-'}</dd>
              <dt>NPWP</dt>
              <dd>{s.npwp || '-'}</dd>
              <dt>Catatan</dt>
              <dd>{s.note || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Ringkasan</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={s.active} />
            </dd>
            <dt>Pesanan terbuka</dt>
            <dd>{punyaIzin(p.izin, 'beli.pesanan', 'L') ? <Link href={`/pesanan?pemasok=${s.id}&status=Disetujui`}>{pesanan} pesanan</Link> : pesanan}</dd>
            {hutang ? (
              <>
                <dt>Saldo hutang</dt>
                <dd>
                  <Link href={`/hutang?pemasok=${s.id}`}>{formatRupiah(saldo?.saldo ?? 0n)}</Link>
                </dd>
                <dt>Diterima belum difakturkan</dt>
                <dd>{formatRupiah(saldo?.belumFaktur ?? 0n)}</dd>
              </>
            ) : null}
          </dl>
          {bolehUbah ? (
            s.active ? (
              <FormStatusMaster aksi={statusPemasokAksi.bind(null, s.id, false)} aktif label="Nonaktifkan pemasok" konfirmasi={`Nonaktifkan ${s.name}? Pemasok ini tidak bisa dipilih untuk dokumen baru.`} />
            ) : (
              <FormStatusMaster aksi={statusPemasokAksi.bind(null, s.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=supplier&dok=${s.id}`}>Lihat jejak audit pemasok ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
