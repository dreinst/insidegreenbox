import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Unbounded } from 'next/font/google'
import './globals.css'

// Huruf situs Greenbox, di-host sendiri oleh next/font sehingga tidak ada permintaan ke Google saat dipakai.
const teks = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-teks', display: 'swap' })
const judul = Unbounded({ subsets: ['latin'], weight: ['700', '800'], variable: '--f-judul', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Admin Greenbox', template: '%s | Admin Greenbox' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#272924' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${teks.variable} ${judul.variable}`}>
      <body>{children}</body>
    </html>
  )
}
