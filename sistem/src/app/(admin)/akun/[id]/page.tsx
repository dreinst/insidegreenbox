import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanAkuntansi, rp } from '@/components/akuntansi'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { ambilAkun, JENIS_AKUN, normalDebit, pilihanInduk } from '@/lib/akuntansi/akun'
import { KUNCI_PER_KODE } from '@/lib/akuntansi/pemetaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { statusAkunAksi, ubahAkunAksi } from '../aksi'
import { medanAkun } from '../medan'

export const metadata: Metadata = { title: 'Akun' }

export default async function RincianAkun({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.coa', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [a, { pesan }] = await Promise.all([ambilAkun(db, id), searchParams])
  if (!a) notFound()
  const bolehUbah = punyaIzin(p.izin, 'akun.coa', 'U')
  const induk = bolehUbah ? (await pilihanInduk(db)).filter((x) => x.id !== a.id) : []
  const saldo = normalDebit(a.kind) ? a.debit - a.kredit : a.kredit - a.debit
  return (
    <>
      <KepalaHalaman judul={`${a.code} ${a.name}`} keterangan={`${JENIS_AKUN[a.kind]} · ${a.isPostable ? 'akun transaksi' : 'akun induk'}${a.parent ? ` · induk ${a.parent.code} ${a.parent.name}` : ''}`} jejak={{ href: '/akun', label: 'Bagan Akun' }}>
        <Lencana aktif={a.active} />
      </KepalaHalaman>
      <PesanAkuntansi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data akun</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahAkunAksi.bind(null, a.id)} medan={medanAkun(a, induk)} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Kode</dt>
              <dd>{a.code}</dd>
              <dt>Nama</dt>
              <dd>{a.name}</dd>
              <dt>Jenis</dt>
              <dd>{JENIS_AKUN[a.kind]}</dd>
              <dt>Keterangan</dt>
              <dd>{a.note || '-'}</dd>
            </dl>
          )}
          {a._count.journalLines ? <p className="catatan">Akun ini sudah punya {a._count.journalLines} baris jurnal, jadi jenisnya tidak bisa diubah lagi.</p> : null}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Saldo dan pemakaian</h2>
          <dl className="rincian">
            {a.isPostable ? (
              <>
                <dt>Saldo</dt>
                <dd className="tebal">{rp(saldo)}</dd>
                <dt>Total debit</dt>
                <dd>{rp(a.debit)}</dd>
                <dt>Total kredit</dt>
                <dd>{rp(a.kredit)}</dd>
              </>
            ) : (
              <>
                <dt>Akun anak</dt>
                <dd>{a._count.children}</dd>
              </>
            )}
            <dt>Pemetaan</dt>
            <dd>{a.accountMappings.length ? a.accountMappings.map((m) => KUNCI_PER_KODE.get(m.key)?.nama ?? m.key).join(', ') : '-'}</dd>
          </dl>
          {punyaIzin(p.izin, 'akun.buku_besar', 'L') ? (
            <p>
              <Link href={`/buku-besar?akun=${a.id}`}>Buka buku besar akun ini</Link>
            </p>
          ) : null}
          {bolehUbah ? (
            a.active ? (
              <FormStatusMaster aksi={statusAkunAksi.bind(null, a.id, false)} aktif label="Nonaktifkan akun" konfirmasi={`Nonaktifkan ${a.code} ${a.name}? Akun nonaktif tidak bisa dijurnal.`} />
            ) : (
              <FormStatusMaster aksi={statusAkunAksi.bind(null, a.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=account&dok=${a.id}`}>Lihat jejak audit akun ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
