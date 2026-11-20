'use client'
// Tab antarhalaman dalam satu modul. Tab aktif ditentukan dari alamat: yang paling panjang cocok dengan awal alamat.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type ItemTab = { href: string; label: string }

export function TabModul({ item, label }: { item: ItemTab[]; label: string }) {
  const jalur = usePathname()
  const cocok = item.filter((t) => jalur === t.href || jalur.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]
  return (
    <nav className="tab" aria-label={label}>
      {item.map((t) => (
        <Link key={t.href} href={t.href} className={cocok?.href === t.href ? 'aktif' : undefined} aria-current={cocok?.href === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
