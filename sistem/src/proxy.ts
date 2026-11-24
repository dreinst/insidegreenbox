import { NextResponse, type NextRequest } from 'next/server'
import { NAMA_COOKIE, bacaToken, httpsAktif } from '@/lib/sesi-token'

// Proxy hanya memeriksa tanda tangan token untuk mengalihkan cepat ke /masuk, memasang nonce CSP, dan HSTS.
// Otorisasi sebenarnya (sesi di database, izin per menu) ada di halaman dan aksi server (src/lib/izin.ts).
export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const dev = process.env.NODE_ENV === 'development'
  const https = httpsAktif()
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Alat dev Next menyisipkan gaya tanpa nonce, jadi di dev saja gaya inline diizinkan.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')

  const jalur = req.nextUrl.pathname
  // Aksi server tanpa header Origin ditolak. Peramban selalu mengirim Origin pada POST, jadi yang ditolak hanya klien
  // buatan atau proxy yang membuang header itu; Origin asing sudah ditolak Next sendiri (audit C-13).
  if (req.method === 'POST' && req.headers.has('next-action') && !req.headers.get('origin')) {
    return new NextResponse('Permintaan ditolak: header Origin tidak ada.', { status: 403, headers: { 'Content-Security-Policy': csp, 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (jalur !== '/masuk' && !(await bacaToken(req.cookies.get(NAMA_COOKIE)?.value))) {
    const ke = new URL('/masuk', req.url)
    if (jalur !== '/') ke.searchParams.set('ke', jalur + req.nextUrl.search)
    const r = NextResponse.redirect(ke)
    r.headers.set('Content-Security-Policy', csp)
    return r
  }

  const reqHeaders = new Headers(req.headers)
  reqHeaders.set('x-nonce', nonce)
  reqHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  if (https) res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  return res
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/|favicon.ico|icon.svg|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
