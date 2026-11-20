// Token sesi di cookie (KONTRAK 7). Hanya berisi id sesi; keabsahan sesi tetap dicek ke database di setiap permintaan.
// Tidak mengimpor Next atau Prisma, jadi bisa dipakai proxy.
import { SignJWT, jwtVerify } from 'jose'

export const NAMA_COOKIE = 'gb_sesi'
export const UMUR_SESI_JAM = 12

function kunci() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET belum diisi atau kurang dari 32 karakter.')
  return new TextEncoder().encode(s)
}

export async function buatToken(sesiId: string, kedaluwarsa: Date) {
  return new SignJWT({ sid: sesiId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(kedaluwarsa.getTime() / 1000))
    .sign(kunci())
}

export async function bacaToken(token?: string | null): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, kunci(), { algorithms: ['HS256'] })
    return typeof payload.sid === 'string' ? payload.sid : null
  } catch {
    return null
  }
}

// HTTPS_AKTIF=1 atau 0 menimpa bawaan; tanpa itu mengikuti NODE_ENV=production.
export const httpsAktif = () => (process.env.HTTPS_AKTIF ? process.env.HTTPS_AKTIF === '1' : process.env.NODE_ENV === 'production')
