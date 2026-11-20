import { TabModul } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

// Layout hanya menyusun tab. Cek izin dilakukan tiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutMember({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, 'menu.member', 'L')) return <>{children}</>
  return (
    <>
      <TabModul
        label="Bagian member"
        item={[{ href: '/member', label: 'Member' }, ...(punyaIzin(p.izin, 'menu.tingkat', 'L') ? [{ href: '/member/tingkat', label: 'Tingkat Greenbox Key' }] : [])]}
      />
      {children}
    </>
  )
}
