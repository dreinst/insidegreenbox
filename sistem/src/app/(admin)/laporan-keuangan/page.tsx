import type { Metadata } from 'next'
import { SaringBulan, StatusSeimbang, rp } from '@/components/akuntansi'
import { TabelLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { neracaSaldo } from '@/lib/akuntansi/laporan'
import { tabelNeracaSaldo } from '@/lib/akuntansi/laporan-kolom'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Neraca Saldo' }

export default async function NeracaSaldo({ searchParams }: { searchParams: Promise<{ dari?: string; sampai?: string; semua?: string }> }) {
  const p = await wajibIzin('laporan.keuangan', 'L')
  const s = await searchParams
  const d = await neracaSaldo(db, s)
  const t = tabelNeracaSaldo(d)
  // Tautan kode ke buku besar hanya untuk pemegang izin Buku Besar.
  if (!punyaIzin(p.izin, 'akun.buku_besar', 'L')) t.kolom[0] = { ...t.kolom[0], href: undefined }
  return (
    <>
      <KepalaHalaman judul="Neraca Saldo" keterangan={`Saldo awal, mutasi, dan saldo akhir setiap akun transaksi untuk ${d.rentang.judul}. Hanya jurnal yang sudah Diposting.`} />
      <SaringBulan
        dasar="/laporan-keuangan"
        jenis="neraca-saldo"
        dari={d.rentang.dari}
        sampai={d.rentang.sampai}
        ekstra={
          <div className="kolom">
            <label htmlFor="s-semua">Akun</label>
            <select id="s-semua" name="semua" defaultValue={s.semua ?? ''}>
              <option value="">Hanya yang bersaldo atau bermutasi</option>
              <option value="1">Semua akun transaksi</option>
            </select>
          </div>
        }
      />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <StatusSeimbang
        seimbang={d.seimbang}
        teksOk={`Seimbang: saldo akhir debit dan kredit sama-sama ${rp(d.jumlah.akhirD)}.`}
        teksSalah={`Tidak seimbang: saldo akhir debit ${rp(d.jumlah.akhirD)}, kredit ${rp(d.jumlah.akhirK)}.`}
      />
      <TabelLaporan tabel={t} judul={`Neraca saldo ${d.rentang.judul}`} kunci={(b) => String(b.id)} kosong="Belum ada jurnal pada periode ini." />
    </>
  )
}
