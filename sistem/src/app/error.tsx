'use client'
// Halaman galat untuk halaman di luar panel admin, misalnya /masuk (audit C-5).
import Link from 'next/link'
import { PesanGalat } from '@/components/galat'

export default function Galat({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="masuk">
      <div className="masuk-kartu">
        <PesanGalat error={error} idJudul="j-galat" />
        <div className="deret-tombol">
          <button type="button" className="btn" onClick={() => retry()}>
            Coba lagi
          </button>
          <Link href="/" className="btn sekunder">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </main>
  )
}
