import Link from 'next/link'

export default function TidakDitemukan() {
  return (
    <main className="masuk">
      <div className="masuk-kartu">
        <h1>Halaman tidak ditemukan</h1>
        <p className="redup">Alamat ini tidak ada atau datanya sudah tidak tersedia.</p>
        <Link href="/" className="btn">
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  )
}
