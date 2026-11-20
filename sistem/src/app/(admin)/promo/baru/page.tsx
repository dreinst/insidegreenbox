import type { Metadata } from 'next'
import { FormPromo } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { tambahPromoAksi } from '../aksi'

export const metadata: Metadata = { title: 'Tambah promo' }

export default async function PromoBaru() {
  await wajibIzin('menu.promo', 'T')
  const menu = await db.menuItem.findMany({ where: { active: true }, orderBy: [{ categoryRef: { sort: 'asc' } }, { sort: 'asc' }] })
  return (
    <>
      <KepalaHalaman judul="Tambah promo" keterangan="Promo baru langsung aktif. Atur tanggal mulai dan berakhir bila promonya musiman." jejak={{ href: '/promo', label: 'Promo' }} />
      <PesanMaster />
      <section className="kartu">
        <FormPromo aksi={tambahPromoAksi} awal={{ kind: 'persen' }} hadiah={[{ nilai: '', label: 'Pilih menu hadiah' }, ...menu.map((m) => ({ nilai: String(m.id), label: m.name }))]} tombol="Simpan promo" />
      </section>
    </>
  )
}
