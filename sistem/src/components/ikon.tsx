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
  // tahap 3B
  kasir: (
    <>
      <rect x="3" y="11" width="18" height="9" rx="2" />
      <path d="M7 11V5h10v6M10 8h4M7 15.5h2M11 15.5h2M15 15.5h2" />
    </>
  ),
  shift: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  transaksi: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  pin: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3M12 14.5v2.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // tahap 3A
  hidangan: (
    <>
      <path d="M5 9h12v6a5 5 0 01-5 5h-2a5 5 0 01-5-5V9zM17 11h1.5a2.5 2.5 0 010 5H17" />
      <path d="M8 3.5c0 1.5 1 1.5 1 3M12 3.5c0 1.5 1 1.5 1 3" />
    </>
  ),
  promo: (
    <>
      <path d="M3 12.5V4h8.5L21 13.5 13.5 21 3 12.5z" />
      <circle cx="8" cy="8.5" r="1.4" />
    </>
  ),
  member: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M17.5 12v3M20 12v2" />
    </>
  ),
  bayar: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  // tahap 4A
  produk: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  stok: (
    <>
      <rect x="3" y="13" width="8" height="7" rx="1" />
      <rect x="13" y="13" width="8" height="7" rx="1" />
      <rect x="8" y="4" width="8" height="7" rx="1" />
    </>
  ),
  penyesuaian: (
    <>
      <path d="M5 4v16M12 4v16M19 4v16" />
      <circle cx="5" cy="15" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="19" cy="13" r="2" />
    </>
  ),
  opname: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v3H9zM9 11l2 2 4-4M9 17h6" />
    </>
  ),
  pindah: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  alasan: (
    <>
      <path d="M4 5h16v11H9l-5 4V5z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  lokasi: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  // tahap 5A
  setoran: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="2" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M12 3v3M9.5 4.5L12 2l2.5 2.5" />
    </>
  ),
  laporan: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  rekening: (
    <>
      <path d="M3 9.5L12 4l9 5.5M4.5 9.5h15M4 20h16" />
      <path d="M6.5 11.5v6M10 11.5v6M14 11.5v6M17.5 11.5v6" />
    </>
  ),
  // tahap 4B: resep dan produksi.
  resep: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  perintah: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2.8h6V4M8.5 11l2 2 4-4M9 17h6" />
    </>
  ),
  pengeluaran: (
    <>
      <path d="M4 14h8v6H4zM12 17h8" />
      <path d="M8 14V4M5 7l3-3 3 3M17 14l3 3-3 3" />
    </>
  ),
  hasil: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  cepat: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  // tahap 5B: akuntansi.
  akun: (
    <>
      <circle cx="6" cy="5" r="2" />
      <path d="M6 7v12h4M6 12h4" />
      <rect x="11" y="9.5" width="9" height="5" rx="1.5" />
      <rect x="11" y="16.5" width="9" height="5" rx="1.5" />
    </>
  ),
  jurnal: (
    <>
      <path d="M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2z" />
      <path d="M5 19a2 2 0 012-2h12M9 7h6M9 11h6" />
    </>
  ),
  bukubesar: (
    <>
      <path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" />
      <path d="M12 6v13.5" />
    </>
  ),
  neraca: (
    <>
      <path d="M12 3v18M7 21h10M4 7h16" />
      <path d="M4 7l-2.5 6a3 3 0 005 0zM20 7l-2.5 6a3 3 0 005 0z" />
    </>
  ),
  periode: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <rect x="9.5" y="13.5" width="5" height="4.5" rx="1" />
      <path d="M10.5 13.5v-1a1.5 1.5 0 013 0v1" />
    </>
  ),
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
