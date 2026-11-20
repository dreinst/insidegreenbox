'use client'
// Sidebar dan header. Di layar sempit sidebar menjadi laci yang dibuka tombol Menu.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { keluarAksi } from '@/app/(admin)/keluar-aksi'
import type { ItemSidebar } from '@/lib/katalog'
import { Ikon } from './ikon'
import { Logo } from './logo'

type Prop = { item: ItemSidebar[]; nama: string; username: string; peran: string; children: React.ReactNode }

const aktif = (jalur: string, href: string) => (href === '/' ? jalur === '/' : jalur === href || jalur.startsWith(href + '/'))

export function Kerangka({ item, nama, username, peran, children }: Prop) {
  const jalur = usePathname()
  const [buka, setBuka] = useState(false)
  const [jalurBuka, setJalurBuka] = useState(jalur)
  const laci = useRef<HTMLElement>(null)
  const tombol = useRef<HTMLButtonElement>(null)

  // Laci tertutup sendiri saat pindah halaman.
  if (jalurBuka !== jalur) {
    setJalurBuka(jalur)
    setBuka(false)
  }

  useEffect(() => {
    if (!buka) return
    laci.current?.querySelector<HTMLElement>('a, button')?.focus()
    const tombolAwal = tombol.current
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuka(false)
    }
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('keydown', esc)
      tombolAwal?.focus()
    }
  }, [buka])

  return (
    <div className={`kerangka${buka ? ' laci-buka' : ''}`}>
      <a href="#isi" className="lompat">
        Lompat ke isi
      </a>
      <aside className="samping" id="laci" ref={laci} aria-label="Menu utama">
        <div className="samping-atas">
          <Link href="/" className="samping-logo" onClick={() => setBuka(false)}>
            <Logo />
          </Link>
          <button type="button" className="tutup-laci" onClick={() => setBuka(false)} aria-label="Tutup menu">
            <Ikon nama="tutup" />
          </button>
        </div>
        <nav>
          {item.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={aktif(jalur, i.href) ? 'aktif' : undefined}
              aria-current={aktif(jalur, i.href) ? 'page' : undefined}
              onClick={() => setBuka(false)}
            >
              <Ikon nama={i.ikon} />
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="tirai" onClick={() => setBuka(false)} aria-hidden="true" />
      <div className="utama">
        <header className="atas">
          <button type="button" ref={tombol} className="tombol-menu" onClick={() => setBuka(true)} aria-expanded={buka} aria-controls="laci">
            <Ikon nama="menu" />
            <span>Menu</span>
          </button>
          <span className="atas-logo">
            <Logo kecil />
          </span>
          <div className="akun">
            <span className="akun-inisial" aria-hidden="true">
              {nama.slice(0, 1).toUpperCase()}
            </span>
            <span className="akun-nama">
              <b>{nama}</b>
              <small>
                {peran} · {username}
              </small>
            </span>
            <form action={keluarAksi}>
              <button type="submit" className="btn kecil sekunder">
                <Ikon nama="keluar" />
                Keluar
              </button>
            </form>
          </div>
        </header>
        <main className="isi" id="isi" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
