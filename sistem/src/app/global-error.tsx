'use client'
// Galat di layout akar (audit C-5). Menggantikan seluruh dokumen, jadi html, body, dan gaya dimuat sendiri.
import './globals.css'
import { PesanGalat } from '@/components/galat'

export default function GalatGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body>
        <title>Terjadi galat | Greenbox Management Page</title>
        <main className="masuk">
          <div className="masuk-kartu">
            <PesanGalat error={error} idJudul="j-galat" />
            <div className="deret-tombol">
              <button type="button" className="btn" onClick={() => retry()}>
                Coba lagi
              </button>
              {/* Tautan biasa: layout akar gagal, jadi navigasi klien tidak bisa diandalkan. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn sekunder">
                Kembali ke Beranda
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
