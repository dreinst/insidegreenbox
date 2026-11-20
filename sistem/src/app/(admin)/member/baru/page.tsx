import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahMemberAksi } from '../aksi'
import { medanMember } from '../medan'

export const metadata: Metadata = { title: 'Tambah member' }

export default async function MemberBaru() {
  await wajibIzin('menu.member', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah member" keterangan="Nomor WhatsApp dipakai kasir untuk mencari member, jadi tiap nomor hanya boleh satu member." jejak={{ href: '/member', label: 'Member' }} />
      <PesanMaster />
      <section className="kartu">
        <FormMaster aksi={tambahMemberAksi} medan={medanMember({ discountOn: true })} tombol="Simpan member" />
      </section>
    </>
  )
}
