import { TabModul } from '@/components/tab-modul'

// Akun dan Pemetaan memakai satu kode menu (akun.coa, RANCANGAN 8.2), jadi kedua tab tampil untuk pemegang Lihat.
// Cek izin tetap di tiap halaman (KONTRAK 4.5).
export default function LayoutAkun({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TabModul
        label="Akun"
        item={[
          { href: '/akun', label: 'Bagan akun' },
          { href: '/akun/pemetaan', label: 'Pemetaan' },
        ]}
      />
      {children}
    </>
  )
}
