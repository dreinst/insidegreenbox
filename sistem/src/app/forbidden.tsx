import Link from 'next/link'

export default function AksesDitolak() {
  return (
    <main className="masuk">
      <div className="masuk-kartu">
        <h1>Akses ditolak</h1>
        <p className="redup">Peranmu tidak punya izin membuka halaman ini. Kalau kamu butuh aksesnya, minta Owner mengatur izin peranmu.</p>
        <Link href="/" className="btn">
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  )
}
