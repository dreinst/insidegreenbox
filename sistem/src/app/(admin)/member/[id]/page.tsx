import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatWa, potonganMember } from '@/lib/member'
import { formatWaktu } from '@/lib/waktu'
import { statusMemberAksi, ubahMemberAksi } from '../aksi'
import { medanMember } from '../medan'

export const metadata: Metadata = { title: 'Member' }

export default async function RincianMember({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.member', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [m, { pesan }] = await Promise.all([db.member.findUnique({ where: { id }, include: { tier: true } }), searchParams])
  if (!m) notFound()
  const berikut = await db.memberTier.findFirst({ where: { active: true, minVisits: { gt: m.visits } }, orderBy: { minVisits: 'asc' } })
  const bolehUbah = punyaIzin(p.izin, 'menu.member', 'U')
  const potongan = potonganMember(m)
  return (
    <>
      <KepalaHalaman judul={m.name} keterangan={`${formatWa(m.wa)} · ${m.tier?.name ?? 'Belum ada tingkat'}`} jejak={{ href: '/member', label: 'Member' }}>
        <Lencana aktif={m.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu lebar" aria-labelledby="j-data">
          <h2 id="j-data">Data member</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahMemberAksi.bind(null, m.id)}
              medan={medanMember({ name: m.name, wa: m.wa, visits: String(m.visits), discountOn: m.discountOn, note: m.note })}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{m.name}</dd>
              <dt>WhatsApp</dt>
              <dd>{formatWa(m.wa)}</dd>
              <dt>Kunjungan</dt>
              <dd>{m.visits}</dd>
              <dt>Catatan</dt>
              <dd>{m.note || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-tingkat">
          <h2 id="j-tingkat">Tingkat dan potongan</h2>
          <dl className="rincian">
            <dt>Tingkat</dt>
            <dd>{m.tier?.name ?? '-'}</dd>
            <dt>Potongan berlaku</dt>
            <dd>{potongan ? `${String(potongan).replace('.', ',')}%` : m.discountOn ? 'Tidak ada (member nonaktif atau belum punya tingkat)' : 'Dimatikan untuk member ini'}</dd>
            <dt>Berikutnya</dt>
            <dd>{berikut ? `${berikut.name} setelah ${berikut.minVisits} kunjungan (${berikut.minVisits - m.visits} lagi)` : 'Sudah di tingkat tertinggi'}</dd>
          </dl>
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={m.active} />
            </dd>
            <dt>Bergabung</dt>
            <dd>{formatWaktu(m.joinedAt)}</dd>
            <dt>Diubah</dt>
            <dd>{formatWaktu(m.updatedAt)}</dd>
          </dl>
          {bolehUbah ? (
            m.active ? (
              <FormStatusMaster aksi={statusMemberAksi.bind(null, m.id, false)} aktif label="Nonaktifkan member" konfirmasi={`Nonaktifkan ${m.name}? Potongan member tidak berlaku lagi.`} />
            ) : (
              <FormStatusMaster aksi={statusMemberAksi.bind(null, m.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=member&dok=${m.id}`}>Lihat jejak audit member ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
