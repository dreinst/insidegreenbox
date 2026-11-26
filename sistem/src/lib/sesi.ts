import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import type { Konteks } from './audit'
import { db } from './db'
import type { Pengguna } from './izin-inti'
import { muatPengguna } from './masuk'
import { NAMA_COOKIE, bacaToken, buatToken, httpsAktif } from './sesi-token'

// Sekali per permintaan render (cache React). Di aksi server, cache tidak berlaku sehingga tiap panggilan membaca ulang.
export const penggunaSaatIni = cache(async (): Promise<Pengguna | null> => {
  const sesiId = await bacaToken((await cookies()).get(NAMA_COOKIE)?.value)
  if (!sesiId) return null
  return muatPengguna(db, sesiId)
})

// IP hanya dipercaya dari header proxy balik bila TRUST_PROXY=1 (KONTRAK 7).
export function ipDari(h: Headers) {
  if (process.env.TRUST_PROXY !== '1') return 'tidak-diketahui'
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]
  return ip?.trim().slice(0, 100) || 'tidak-diketahui'
}

export async function konteksPermintaan(p: Pick<Pengguna, 'id' | 'username'> | null, namaAktor?: string): Promise<Konteks> {
  const h = await headers()
  return { userId: p?.id ?? null, actorName: p?.username ?? namaAktor ?? 'tamu', ip: ipDari(h), userAgent: (h.get('user-agent') ?? '').slice(0, 300) }
}

export async function pasangCookieSesi(sesiId: string, kedaluwarsa: Date) {
  ;(await cookies()).set(NAMA_COOKIE, await buatToken(sesiId, kedaluwarsa), {
    httpOnly: true,
    sameSite: 'lax',
    secure: httpsAktif(),
    path: '/',
    expires: kedaluwarsa,
  })
}

export async function hapusCookieSesi() {
  ;(await cookies()).delete(NAMA_COOKIE)
}
