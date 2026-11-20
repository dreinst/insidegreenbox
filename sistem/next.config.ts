import type { NextConfig } from 'next'

// Header yang sama untuk semua jawaban, termasuk berkas statis. CSP (dengan nonce) dan HSTS dipasang di src/proxy.ts
// karena nilainya ditentukan saat permintaan masuk.
const headerTetap = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Repo induk punya package-lock sendiri (situs Vite), jadi akar app ditetapkan ke folder ini.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // forbidden() dan forbidden.tsx untuk layar "Akses ditolak" berstatus 403.
  experimental: { authInterrupts: true },
  async headers() {
    return [{ source: '/:path*', headers: headerTetap }]
  },
}

export default nextConfig
