import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { BERLAKU_ALASAN } from '@/lib/stok/alasan'
import { statusAlasanAksi, ubahAlasanAksi } from '../aksi'

export const metadata: Metadata = { title: 'Alasan penyesuaian' }

export default async function RincianAlasan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.alasan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [a, { pesan }] = await Promise.all([db.stockReason.findUnique({ where: { id } }), searchParams])
  if (!a) notFound()
  const bolehUbah = punyaIzin(p.izin, 'stok.alasan', 'U') && !a.code
  const berlaku = BERLAKU_ALASAN[a.appliesTo as keyof typeof BERLAKU_ALASAN] ?? a.appliesTo
  return (
    <>
      <KepalaHalaman judul={a.name} keterangan={a.code ? 'Alasan sistem untuk saldo awal. Tidak bisa diubah atau dinonaktifkan.' : `Berlaku untuk ${berlaku.toLowerCase()}`} jejak={{ href: '/alasan-stok', label: 'Alasan penyesuaian' }}>
        <Lencana aktif={a.active} />
      </KepalaHalaman>
      <PesanStok kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data alasan</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahAlasanAksi.bind(null, a.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama alasan', awal: a.name, wajib: true, maxLength: 60 },
                { jenis: 'pilih', nama: 'appliesTo', label: 'Berlaku untuk', awal: a.appliesTo, pilihan: Object.entries(BERLAKU_ALASAN).map(([nilai, label]) => ({ nilai, label })), wajib: true },
              ]}
              tombol="Simpan perubahan"
            />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{a.name}</dd>
              <dt>Berlaku untuk</dt>
              <dd>{berlaku}</dd>
            </dl>
          )}
        </section>
        {bolehUbah ? (
          <section className="kartu" aria-labelledby="j-status">
            <h2 id="j-status">Status</h2>
            {a.active ? (
              <FormStatusMaster aksi={statusAlasanAksi.bind(null, a.id, false)} aktif label="Nonaktifkan alasan" konfirmasi={`Nonaktifkan alasan ${a.name}?`} />
            ) : (
              <FormStatusMaster aksi={statusAlasanAksi.bind(null, a.id, true)} aktif={false} label="Aktifkan lagi" />
            )}
          </section>
        ) : null}
      </div>
    </>
  )
}
