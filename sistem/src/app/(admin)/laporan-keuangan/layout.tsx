import { TabModul } from '@/components/tab-modul'

// Tiga laporan keuangan memakai izin Lihat laporan.keuangan (RANCANGAN 8.2, Owner). Cek izin tetap di tiap halaman.
export default function LayoutLaporanKeuangan({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TabModul
        label="Laporan keuangan"
        item={[
          { href: '/laporan-keuangan', label: 'Neraca Saldo' },
          { href: '/laporan-keuangan/laba-rugi', label: 'Laba Rugi' },
          { href: '/laporan-keuangan/neraca', label: 'Neraca' },
        ]}
      />
      {children}
    </>
  )
}
