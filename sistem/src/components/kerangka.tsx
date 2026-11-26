'use client'
// Sidebar dan header. Di layar sempit sidebar menjadi laci yang dibuka tombol Menu.
// tahap 4B: item sidebar dikelompokkan dengan judul grup, dan item aktif digulir ke dalam pandangan.
// KONTRAK 11 butir 162: grup berjudul memakai <details> dan <summary> sehingga bisa dilipat, juga tanpa JavaScript.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { keluarAksi } from '@/app/(admin)/keluar-aksi'
import { COOKIE_SAMPING, type GrupSidebar } from '@/lib/katalog'
import { Ikon } from './ikon'
import { Logo } from './logo'

type Prop = { grup: GrupSidebar[]; pilihanGrup: Record<string, boolean>; nama: string; username: string; peran: string; children: React.ReactNode }

const aktif = (jalur: string, href: string) => (href === '/' ? jalur === '/' : jalur === href || jalur.startsWith(href + '/'))

const idGrup = (judul: string) => `grup-${judul.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

// Grup terbuka bila berisi halaman aktif, atau bila pengguna pernah membukanya dan belum menutupnya lagi.
const hitungBukaGrup = (grup: GrupSidebar[], jalur: string, pilihan: Record<string, boolean>) =>
  Object.fromEntries(grup.flatMap((g) => (g.judul ? [[g.judul, g.item.some((i) => aktif(jalur, i.href)) || pilihan[g.judul] === true]] : [])))

export function Kerangka({ grup, pilihanGrup, nama, username, peran, children }: Prop) {
  const jalur = usePathname()
  const [buka, setBuka] = useState(false)
  const [jalurBuka, setJalurBuka] = useState(jalur)
  const [pilihan, setPilihan] = useState(pilihanGrup)
  // Salinan terbaru untuk ketukan beruntun sebelum React sempat merender ulang.
  const pilihanTerbaru = useRef(pilihanGrup)
  const [bukaGrup, setBukaGrup] = useState(() => hitungBukaGrup(grup, jalur, pilihanGrup))
  const laci = useRef<HTMLElement>(null)
  const tombol = useRef<HTMLButtonElement>(null)

  // Laci tertutup sendiri saat pindah halaman, dan grup halaman yang baru dibuka.
  if (jalurBuka !== jalur) {
    setJalurBuka(jalur)
    setBuka(false)
    setBukaGrup(hitungBukaGrup(grup, jalur, pilihan))
  }

  // Ketukan atau Enter dan Spasi di judul grup sampai ke sini sebagai klik. Lipatan bawaan peramban dicegah supaya hanya
  // React yang mengubah atribut open, lalu pilihan disimpan ke cookie. Tanpa JavaScript, details bekerja seperti biasa.
  const klikGrup = (judul: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const terbuka = !(e.currentTarget.parentElement as HTMLDetailsElement).open
    pilihanTerbaru.current = { ...pilihanTerbaru.current, [judul]: terbuka }
    setBukaGrup((b) => ({ ...b, [judul]: terbuka }))
    setPilihan(pilihanTerbaru.current)
    const aman = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${COOKIE_SAMPING}=${encodeURIComponent(JSON.stringify(pilihanTerbaru.current))}; path=/; max-age=31536000; samesite=lax${aman}`
  }

  // Bila peramban sendiri membuka grup (misalnya pencarian di halaman), state diikutkan tanpa menyimpan pilihan.
  const ikutGrup = (judul: string) => (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const terbuka = e.currentTarget.open
    setBukaGrup((b) => (b[judul] === terbuka ? b : { ...b, [judul]: terbuka }))
  }

  const tautan = (i: GrupSidebar['item'][number]) => (
    <Link
      key={i.href}
      href={i.href}
      className={aktif(jalur, i.href) ? 'aktif' : undefined}
      aria-current={aktif(jalur, i.href) ? 'page' : undefined}
      onClick={() => setBuka(false)}
    >
      <Ikon nama={i.ikon} />
      {i.label}
      {i.lencana ? (
        <span className="lencana-samping" title={`${i.lencana} dokumen menunggu tindakanmu`}>
          <span className="sr">, </span>
          {i.lencana > 99 ? '99+' : i.lencana}
          <span className="sr"> menunggu</span>
        </span>
      ) : null}
    </Link>
  )

  // Sidebar lebih tinggi dari layar, jadi item aktif digulir ke dalam pandangan sidebar saat halaman atau laci berganti.
  useEffect(() => {
    laci.current?.querySelector<HTMLElement>('nav a.aktif')?.scrollIntoView({ block: 'nearest' })
  }, [jalur, buka])

  useEffect(() => {
    if (!buka) return
    // Fokus tanpa menggulir supaya item aktif yang sudah digulir ke pandangan tetap terlihat.
    laci.current?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true })
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
          {grup.map((g) =>
            g.judul ? (
              <details key={g.judul} className="samping-grup samping-lipat" open={bukaGrup[g.judul]} onToggle={ikutGrup(g.judul)} aria-labelledby={idGrup(g.judul)}>
                <summary onClick={klikGrup(g.judul)}>
                  <span className="samping-judul" id={idGrup(g.judul)}>
                    {g.judul}
                  </span>
                  <span className="samping-jumlah">
                    <span className="sr">, </span>
                    {g.item.length}
                    <span className="sr"> menu</span>
                  </span>
                  <Ikon nama="lipat" />
                </summary>
                <div className="samping-isi">{g.item.map(tautan)}</div>
              </details>
            ) : (
              <div key="utama" className="samping-grup samping-utama">
                {g.item.map(tautan)}
              </div>
            ),
          )}
        </nav>
        <p className="samping-kaki">Greenbox Management Page</p>
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
