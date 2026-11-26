'use client'
// Halaman galat untuk semua halaman admin (audit C-5). Sidebar tetap tampil karena batas galat ini ada di bawah layout
// (admin).
import Link from 'next/link'
import { PesanGalat } from '@/components/galat'

export default function GalatAdmin({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="kartu galat-halaman" aria-labelledby="j-galat">
      <PesanGalat error={error} idJudul="j-galat" />
      <div className="deret-tombol">
        <button type="button" className="btn" onClick={() => retry()}>
          Coba lagi
        </button>
        <Link href="/" className="btn sekunder">
          Kembali ke Beranda
        </Link>
      </div>
    </section>
  )
}
