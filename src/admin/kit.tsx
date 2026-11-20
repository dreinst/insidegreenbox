import { createContext, useContext, useState, type ReactNode } from 'react'
import { fmt, type Action, type Store, type User } from '../store'

// Komponen dasar admin: ikon, kolom isian, judul, konfirmasi. Dipakai Admin.tsx dan semua halaman di src/admin/.

export const when = (t: number) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const day = (t: number) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
export const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

// Konteks: data, akun yang masuk, dan cara menyimpan. commit() mengembalikan false kalau penyimpanan browser penuh.
export type Ctx = { st: Store; me: User; commit: (fn: (s: Store) => Store) => boolean; flag: (ok: boolean) => boolean; ok: (a: Action) => boolean }
export const A = createContext<Ctx>(null as unknown as Ctx)
export const useA = () => useContext(A)

export const Ic = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>
export const S = { stroke: 'currentColor', strokeWidth: 1.8 }
export const R = { stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
export const ICON = {
  home: <Ic><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" {...S} strokeLinejoin="round" /></Ic>,
  box: <Ic><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" {...S} strokeLinejoin="round" /><path d="M4 7.5 12 11l8-3.5M12 11v9" {...S} /></Ic>,
  tag: <Ic><path d="M3.5 12.5V4.5h8l9 9-8 8-9-9Z" {...S} strokeLinejoin="round" /><circle cx="8" cy="9" r="1.5" fill="currentColor" /></Ic>,
  grid: <Ic><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...S} /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...S} /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...S} /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...S} /></Ic>,
  people: <Ic><circle cx="9" cy="8.5" r="3.2" {...S} /><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" {...S} strokeLinecap="round" /><circle cx="17" cy="9.5" r="2.4" {...S} /><path d="M17.5 14.2c2.3.2 3.7 2 3.7 4.3" {...S} strokeLinecap="round" /></Ic>,
  store: <Ic><path d="M4 9.5V20h16V9.5M3 9.5 5 4h14l2 5.5H3Z" {...S} strokeLinejoin="round" /><path d="M10 20v-5h4v5" {...S} /></Ic>,
  gear: <Ic><circle cx="12" cy="12" r="3" {...S} /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...S} strokeLinecap="round" /></Ic>,
  plus: <Ic><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></Ic>,
  search: <Ic><circle cx="11" cy="11" r="6.5" {...S} /><path d="m16 16 4 4" {...S} strokeLinecap="round" /></Ic>,
  check: <Ic><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></Ic>,
  down: <Ic><path d="m6 9 6 6 6-6" {...R} /></Ic>,
  up: <Ic><path d="M12 19V6M6 11l6-6 6 6" {...R} /></Ic>,
  arrowDown: <Ic><path d="M12 5v14M6 13l6 6 6-6" {...R} /></Ic>,
  upload: <Ic><path d="M12 16V4M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 15v4h16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></Ic>,
  hot: <Ic><path d="M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-4Z" fill="currentColor" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16" {...S} /><path d="M9 3.5c-1 1 1 2 0 3.5M13 3.5c-1 1 1 2 0 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></Ic>,
  ice: <Ic><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></Ic>,
  x: <Ic><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></Ic>,
  minus: <Ic><path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></Ic>,
  till: <Ic><rect x="4" y="9" width="16" height="10" rx="2" {...S} /><path d="M7 9V5h10v4M8 14h3M14 14h2" {...S} strokeLinecap="round" /></Ic>,
  receipt: <Ic><path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17Z" {...S} strokeLinejoin="round" /><path d="M9 8h6M9 12h6" {...S} strokeLinecap="round" /></Ic>,
  clock: <Ic><circle cx="12" cy="12" r="8" {...S} /><path d="M12 7.5V12l3 2" {...S} strokeLinecap="round" strokeLinejoin="round" /></Ic>,
  layers: <Ic><path d="m12 4 8 4-8 4-8-4 8-4Z" {...S} strokeLinejoin="round" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" {...S} strokeLinejoin="round" /></Ic>,
  book: <Ic><path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3v-12Z" {...S} strokeLinejoin="round" /><path d="M8 8.5h7M8 12h5" {...S} strokeLinecap="round" /></Ic>,
  truck: <Ic><path d="M3 6.5h11v10H3zM14 10h4l3 3v3.5h-7" {...S} strokeLinejoin="round" /><circle cx="7.5" cy="17.5" r="1.8" fill="var(--ink)" {...S} /><circle cx="17" cy="17.5" r="1.8" fill="var(--ink)" {...S} /></Ic>,
  chart: <Ic><path d="M4 20V4M4 20h16" {...S} strokeLinecap="round" /><path d="M8 16v-4M12 16V8M16 16v-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></Ic>,
  print: <Ic><path d="M7 9V4h10v5M7 17H4.5V9h15v8H17" {...S} strokeLinejoin="round" /><path d="M7 14h10v6H7z" {...S} strokeLinejoin="round" /></Ic>,
  download: <Ic><path d="M12 4v11M7 11l5 5 5-5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Ic>,
}

export const Toggle = ({ on, set, label, disabled }: { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button type="button" className={`tog${on ? '' : ' off'}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => set(!on)}><i /></button>
)
// Kolom angka: tampil dengan titik ribuan, yang disimpan angka biasa. zero = tampilkan 0 (bukan kosong).
export const Rp = ({ v, set, label, cls = '', unit = 'Rp', required, zero }: { v: number; set: (n: number) => void; label: string; cls?: string; unit?: string; required?: boolean; zero?: boolean }) => (
  <label className={`inp ${cls}`}><span className="unit">{unit}</span>
    <input inputMode="numeric" required={required} aria-label={label} value={v || zero ? fmt(v) : ''} onChange={e => set(+e.target.value.replace(/\D/g, '').slice(0, 9))} /></label>
)
export const Txt = ({ label, v, set, cls = '', ...r }: { label: string; v: string; set: (s: string) => void; cls?: string; placeholder?: string; maxLength?: number; required?: boolean; type?: string; disabled?: boolean }) => (
  <label className={`field ${cls}`}><span>{label}{r.required ? ' *' : ''}</span><span className="inp"><input {...r} value={v} onChange={e => set(e.target.value)} /></span></label>
)
// Kolom isian tanpa label tampak (dipakai di baris tabel; label ada di aria-label dan judul kolom).
export const Bare = ({ label, v, set, cls = '', ...r }: { label: string; v: string; set: (s: string) => void; cls?: string; placeholder?: string; maxLength?: number; disabled?: boolean }) => (
  <span className={`inp ${cls}`}><input aria-label={label} {...r} value={v} onChange={e => set(e.target.value)} /></span>
)
export const Sel = ({ label, v, set, opts, disabled, cls = '' }: { label: string; v: string; set: (s: string) => void; opts: [string, string][]; disabled?: boolean; cls?: string }) => (
  <span className={`inp sel ${cls}`}><select aria-label={label} value={v} disabled={disabled} onChange={e => set(e.target.value)}>{opts.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>{ICON.down}</span>
)
export const Title = ({ t, sub, right, cls = '' }: { t: string; sub: string; right?: ReactNode; cls?: string }) => (
  <div className={`a-title ${cls}`}><div><h1 className="disp fx">{t}</h1><p>{sub}</p></div>{right}</div>
)

// Tombol dua langkah untuk aksi yang menghapus: konfirmasi muncul di tempat, bukan lewat window.confirm.
export function Ask({ label, ask, yes, cls = 'mini danger', disabled }: { label: string; ask: string; yes: () => void; cls?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className={cls} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
  return (
    <span className="ask" role="group" aria-label="Konfirmasi">{ask}
      <button type="button" className="mini danger solid" onClick={() => { setOpen(false); yes() }}>Ya, lanjut</button>
      <button type="button" className="mini" onClick={() => setOpen(false)}>Batal</button>
    </span>
  )
}
