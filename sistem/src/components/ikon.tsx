// Ikon garis sederhana, tanpa paket tambahan.
const JALUR: Record<string, React.ReactNode> = {
  beranda: <path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" />,
  pengguna: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
    </>
  ),
  peran: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  saklar: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="16.5" cy="12" r="3" />
    </>
  ),
  audit: (
    <>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4M10 12h6M10 16h6M4 7v14" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  tutup: <path d="M6 6l12 12M18 6L6 18" />,
  keluar: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
}

export function Ikon({ nama }: { nama: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ikon">
      {JALUR[nama]}
    </svg>
  )
}
