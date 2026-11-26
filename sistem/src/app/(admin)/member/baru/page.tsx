import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { bolehAturTingkat } from '@/lib/member'
import { tambahMemberAksi } from '../aksi'
import { medanMember } from '../medan'

export const metadata: Metadata = { title: 'Tambah member' }

export default async function MemberBaru() {
  const p = await wajibIzin('menu.member', 'T')
  const aturTingkat = bolehAturTingkat(p)
  return (
    <>
      <KepalaHalaman judul="Tambah member" keterangan="Nomor WhatsApp dipakai kasir untuk mencari member, jadi tiap nomor hanya boleh satu member." jejak={{ href: '/member', label: 'Member' }} />
      <PesanMaster />
      <section className="kartu">
        {aturTingkat ? null : <p className="redup">Member baru mulai dari 0 kunjungan. Tingkat dan potongannya naik otomatis dari transaksi kasir.</p>}
        <FormMaster aksi={tambahMemberAksi} medan={medanMember({ discountOn: true }, aturTingkat)} tombol="Simpan member" />
      </section>
    </>
  )
}
