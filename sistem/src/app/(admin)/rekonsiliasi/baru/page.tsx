import '@/app/(admin)/kas.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { usulanBaru } from '@/lib/rekonsiliasi'
import { namaRekening } from '@/lib/rekening'
import { buatRekonsiliasiAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat rekonsiliasi bank' }

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

export default async function RekonsiliasiBaru({ searchParams }: { searchParams: Promise<{ rekening?: string }> }) {
  await wajibIzin('kas.rekonsiliasi', 'T')
  const s = await searchParams
  const rekening = await db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })
  const pilih = rekening.find((r) => String(r.id) === s.rekening) ?? rekening[0]
  const u = pilih ? await usulanBaru(db, pilih.id) : null
  return (
    <>
      <KepalaHalaman judul="Buat rekonsiliasi bank" keterangan="Satu rekonsiliasi untuk satu rekening dan satu periode. Mutasi yang sudah diimpor di periode itu langsung dimuat." jejak={{ href: '/rekonsiliasi', label: 'Rekonsiliasi Bank' }} />
      {rekening.length > 1 ? (
        <nav className="tab" aria-label="Rekening">
          {rekening.map((r) => (
            <Link key={r.id} href={`/rekonsiliasi/baru?rekening=${r.id}`} className={r.id === pilih?.id ? 'aktif' : undefined} aria-current={r.id === pilih?.id ? 'page' : undefined}>
              {namaRekening(r)}
            </Link>
          ))}
        </nav>
      ) : null}
      <section className="kartu">
        {pilih && u ? (
          <>
            <p className="catatan">
              {u.akhir
                ? `Rekonsiliasi terakhir ${u.akhir.no} sampai ${formatTanggal(u.akhir.periodTo)} dengan saldo akhir ${formatRupiah(u.akhir.stmtClosing)}. Periode baru dimulai sehari sesudahnya dan saldo awalnya mengikuti saldo akhir itu.`
                : 'Ini rekonsiliasi pertama rekening ini. Isi saldo awal sesuai rekening koran pada awal periode. Jurnal bank sebelum tanggal awal dianggap sudah termasuk saldo awal itu, kecuali dicocokkan dengan mutasi di periode ini.'}
            </p>
            <FormMaster
              key={pilih.id}
              aksi={buatRekonsiliasiAksi}
              medan={[
                { jenis: 'pilih', nama: 'bankAccountId', label: 'Rekening', awal: String(pilih.id), pilihan: [{ nilai: String(pilih.id), label: namaRekening(pilih) }], wajib: true },
                { jenis: 'tanggal', nama: 'periodFrom', label: 'Dari tanggal', awal: iso(u.dari), wajib: true },
                { jenis: 'tanggal', nama: 'periodTo', label: 'Sampai tanggal', awal: iso(u.sampai), wajib: true },
                ...(u.terkunciAwal
                  ? []
                  : [{ jenis: 'angka' as const, nama: 'stmtOpening', label: 'Saldo awal rekening koran (Rp)', awal: u.saldoAwal?.toString() ?? '', inputMode: 'numeric' as const, wajib: true }]),
                { jenis: 'angka', nama: 'stmtClosing', label: 'Saldo akhir rekening koran (Rp)', inputMode: 'numeric', bantuan: 'Boleh kosong: diambil dari saldo baris mutasi terakhir di periode itu.' },
                { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
              ]}
              tombol="Buat rekonsiliasi"
            />
          </>
        ) : (
          <p className="kosong">Belum ada rekening aktif. Tambahkan di Rekening Bank dulu.</p>
        )}
      </section>
    </>
  )
}
