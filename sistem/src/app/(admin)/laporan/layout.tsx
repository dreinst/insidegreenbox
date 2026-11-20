import { TabModul } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_LAPORAN } from '@/lib/laporan-kolom'

// Satu item sidebar Laporan dengan tab per laporan. Semua laporan tahap 5A memakai izin laporan.penjualan; tab
// laporan lain ditambah di sini bersama izinnya. Cek izin tetap di tiap halaman (KONTRAK 4.5).
export default async function LayoutLaporan({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  const tab = punyaIzin(p.izin, 'laporan.penjualan', 'L') ? Object.values(JENIS_LAPORAN).map((j) => ({ href: j.href, label: j.judul })) : []
  return (
    <>
      {tab.length ? <TabModul label="Jenis laporan" item={tab} /> : null}
      {children}
    </>
  )
}
