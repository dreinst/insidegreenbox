import type { Metadata } from 'next'
import Link from 'next/link'
import { KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { isOwner, punyaIzin } from '@/lib/izin-inti'
import { SAKLAR, SAKLAR_TERKUNCI_OWNER, setaraOwner } from '@/lib/katalog'
import { simpanSaklarAksi } from './aksi'
import { FormSaklar } from './form'

export const metadata: Metadata = { title: 'Saklar Fitur' }

const SATUAN = new Map(SAKLAR.map((s) => [s.kode, s.satuan]))

export default async function HalamanSaklar({ searchParams }: { searchParams: Promise<{ peran?: string; pesan?: string }> }) {
  const p = await wajibIzin('atur.saklar', 'L')
  const { peran: dipilih, pesan } = await searchParams
  const semuaPeran = await db.role.findMany({ orderBy: [{ isSystem: 'desc' }, { id: 'asc' }] })
  const r = semuaPeran.find((x) => x.id === Number(dipilih)) ?? semuaPeran[0]
  const [saklar, nilai] = await Promise.all([db.featureSwitch.findMany({ orderBy: { sort: 'asc' } }), db.roleFeatureSwitch.findMany({ where: { roleId: r.id } })])
  const peta = new Map(nilai.map((v) => [v.featureSwitchId, v]))
  const bisaUbah = punyaIzin(p.izin, 'atur.saklar', 'U') && (isOwner(p) || (!setaraOwner(r.code) && r.id !== p.peran.id))
  const baris = saklar.map((s) => {
    const v = peta.get(s.id)
    return {
      kode: s.code,
      nama: s.name,
      keterangan: s.description,
      satuan: s.hasLimit ? SATUAN.get(s.code) : undefined,
      nyala: !!v?.enabled,
      batas: v?.limitValue === null || v?.limitValue === undefined ? '' : String(v.limitValue),
      kunci: setaraOwner(r.code) && SAKLAR_TERKUNCI_OWNER.includes(s.code),
    }
  })
  const nyala = baris.filter((b) => b.nyala).length

  return (
    <>
      <KepalaHalaman judul="Saklar Fitur" keterangan="Saklar menyalakan atau mematikan kemampuan tertentu per peran, di luar izin per menu." />
      <PesanFlash kode={pesan} />
      <nav className="tab" aria-label="Pilih peran">
        {semuaPeran.map((x) => (
          <Link key={x.id} href={`/saklar?peran=${x.id}`} className={x.id === r.id ? 'aktif' : undefined} aria-current={x.id === r.id ? 'page' : undefined}>
            {x.name}
          </Link>
        ))}
      </nav>
      <section className="kartu" aria-labelledby="j-saklar">
        <div className="kartu-kepala">
          <h2 id="j-saklar">Saklar peran {r.name}</h2>
          <span className="redup">
            {nyala} dari {baris.length} menyala
          </span>
        </div>
        {!bisaUbah && punyaIzin(p.izin, 'atur.saklar', 'U') ? (
          <p className="redup">{r.id === p.peran.id ? 'Saklar peranmu sendiri hanya bisa diubah Owner atau Superadmin.' : `Saklar peran ${r.name} hanya bisa diubah Owner atau Superadmin.`}</p>
        ) : null}
        <FormSaklar key={r.id} aksi={simpanSaklarAksi.bind(null, r.id)} baris={baris} bisaUbah={bisaUbah} />
      </section>
    </>
  )
}
