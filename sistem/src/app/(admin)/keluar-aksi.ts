'use server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { keluar } from '@/lib/masuk'
import { hapusCookieSesi, konteksPermintaan, penggunaSaatIni } from '@/lib/sesi'

// Mencabut sesi di database, menghapus cookie, dan mencatat audit keluar.
export async function keluarAksi() {
  const p = await penggunaSaatIni()
  if (p) await keluar(db, p, await konteksPermintaan(p))
  await hapusCookieSesi()
  redirect('/masuk?pesan=keluar')
}
