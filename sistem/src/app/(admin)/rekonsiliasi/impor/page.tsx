import '@/app/(admin)/kas.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { Medan } from '@/components/form-master'
import { FormImpor } from '@/components/rekonsiliasi-form'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { CONTOH_FORMAT, isianPemetaan } from '@/lib/mutasi-csv'
import { namaRekening } from '@/lib/rekening'
import { imporMutasiAksi } from '../aksi'

export const metadata: Metadata = { title: 'Impor mutasi rekening' }

const KOLOM = (nama: string, label: string, awal: string, bantuan?: string): Medan => ({ jenis: 'angka', nama, label, awal, inputMode: 'numeric', placeholder: '-', bantuan })

export default async function ImporMutasi({ searchParams }: { searchParams: Promise<{ format?: string; rekening?: string }> }) {
  await wajibIzin('kas.rekonsiliasi', 'T')
  const s = await searchParams
  const kode = s.format === 'umum' ? 'umum' : 'klikbca'
  const contoh = CONTOH_FORMAT[kode]
  const awal = isianPemetaan({ ...contoh.pemetaan, tahun: contoh.pemetaan.formatTanggal === 'DM' ? new Date().getFullYear() : null })
  const rekening = await db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })
  const medan: Medan[] = [
    { jenis: 'pilih', nama: 'bankAccountId', label: 'Rekening', awal: s.rekening ?? (rekening[0] ? String(rekening[0].id) : ''), pilihan: rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) })), wajib: true },
    {
      jenis: 'pilih',
      nama: 'pemisah',
      label: 'Pemisah kolom',
      awal: awal.pemisah,
      pilihan: [
        { nilai: 'auto', label: 'Tebak otomatis' },
        { nilai: ',', label: 'Koma' },
        { nilai: ';', label: 'Titik koma' },
        { nilai: 'tab', label: 'Tab' },
      ],
    },
    { jenis: 'angka', nama: 'lewati', label: 'Baris awal yang dilewati', awal: awal.lewati, inputMode: 'numeric', bantuan: 'Baris judul di atas data. Baris yang tanggalnya tidak terbaca juga dilewati.' },
    KOLOM('kolTanggal', 'Kolom tanggal', awal.kolTanggal),
    {
      jenis: 'pilih',
      nama: 'formatTanggal',
      label: 'Format tanggal',
      awal: awal.formatTanggal,
      pilihan: [
        { nilai: 'otomatis', label: 'Otomatis (DD/MM/YYYY atau YYYY-MM-DD)' },
        { nilai: 'DMY', label: 'DD/MM/YYYY' },
        { nilai: 'YMD', label: 'YYYY-MM-DD' },
        { nilai: 'MDY', label: 'MM/DD/YYYY' },
        { nilai: 'DM', label: 'DD/MM tanpa tahun' },
      ],
    },
    { jenis: 'angka', nama: 'tahun', label: 'Tahun (untuk tanggal tanpa tahun)', awal: awal.tahun, inputMode: 'numeric', placeholder: '2026' },
    KOLOM('kolKet', 'Kolom keterangan', awal.kolKet),
    KOLOM('kolRef', 'Kolom referensi', awal.kolRef, 'Boleh kosong.'),
    {
      jenis: 'pilih',
      nama: 'mode',
      label: 'Cara membaca nominal',
      awal: awal.mode,
      pilihan: [
        { nilai: 'terpisah', label: 'Kolom debit dan kredit terpisah' },
        { nilai: 'tanda', label: 'Satu kolom jumlah dan kolom tanda DB/CR' },
        { nilai: 'bertanda', label: 'Satu kolom jumlah, minus berarti keluar' },
      ],
    },
    KOLOM('kolDebit', 'Kolom debit (uang keluar)', awal.kolDebit),
    KOLOM('kolKredit', 'Kolom kredit (uang masuk)', awal.kolKredit),
    KOLOM('kolJumlah', 'Kolom jumlah', awal.kolJumlah),
    KOLOM('kolTanda', 'Kolom tanda DB/CR', awal.kolTanda),
    KOLOM('kolSaldo', 'Kolom saldo', awal.kolSaldo, 'Boleh kosong.'),
    {
      jenis: 'pilih',
      nama: 'angka',
      label: 'Format angka',
      awal: awal.angka,
      pilihan: [
        { nilai: 'titik', label: '1,234,567.00 (desimal titik)' },
        { nilai: 'koma', label: '1.234.567,00 (desimal koma)' },
      ],
    },
  ]
  return (
    <>
      <KepalaHalaman judul="Impor mutasi rekening" keterangan="Unggah CSV rekening koran. Pilih contoh format bank, lalu sesuaikan nomor kolomnya bila perlu (kolom pertama = 1)." jejak={{ href: '/rekonsiliasi', label: 'Rekonsiliasi Bank' }} />
      <nav className="tab" aria-label="Contoh format">
        {(['klikbca', 'umum'] as const).map((f) => (
          <Link key={f} href={`/rekonsiliasi/impor?format=${f}${s.rekening ? `&rekening=${s.rekening}` : ''}`} aria-current={f === kode ? 'page' : undefined} className={f === kode ? 'aktif' : undefined}>
            {CONTOH_FORMAT[f].nama}
          </Link>
        ))}
      </nav>
      <section className="kartu">
        <p className="catatan">{contoh.keterangan}</p>
        {rekening.length ? (
          <FormImpor
            aksi={imporMutasiAksi}
            medan={medan}
            kelompok={[
              { judul: 'Pemetaan kolom', nama: ['pemisah', 'lewati', 'kolTanggal', 'formatTanggal', 'tahun', 'kolKet', 'kolRef', 'kolSaldo'] },
              { judul: 'Nominal', nama: ['mode', 'kolDebit', 'kolKredit', 'kolJumlah', 'kolTanda', 'angka'] },
            ]}
          />
        ) : (
          <p className="kosong">Belum ada rekening aktif. Tambahkan di Rekening Bank dulu.</p>
        )}
      </section>
    </>
  )
}
