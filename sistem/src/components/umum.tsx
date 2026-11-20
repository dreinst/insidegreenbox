// Komponen server kecil yang dipakai banyak halaman.
import Link from 'next/link'

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  sandi: 'Sandi baru tersimpan dan sesi lama pengguna ini dicabut.',
  aktif: 'Sudah diaktifkan.',
  nonaktif: 'Sudah dinonaktifkan dan sesinya dicabut.',
  // tahap 3B
  pin: 'PIN tersimpan. Sesi lain pengguna ini dicabut.',
  'pin-hapus': 'PIN dihapus. Pengguna ini tidak bisa lagi masuk dengan PIN.',
  'shift-buka': 'Shift dibuka. Selamat bekerja.',
  'shift-kas': 'Kas laci tercatat.',
  'shift-tutup': 'Shift ditutup.',
  'shift-setuju': 'Selisih kas disetujui dan shift ditutup.',
  void: 'Transaksi sudah di-void.',
}

export function PesanFlash({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

export function KepalaHalaman({ judul, keterangan, children, jejak }: { judul: string; keterangan?: string; children?: React.ReactNode; jejak?: { href: string; label: string } }) {
  return (
    <div className="kepala">
      <div>
        {jejak ? (
          <Link href={jejak.href} className="jejak-balik">
            ← {jejak.label}
          </Link>
        ) : null}
        <h1>{judul}</h1>
        {keterangan ? <p className="redup">{keterangan}</p> : null}
      </div>
      {children ? <div className="kepala-aksi">{children}</div> : null}
    </div>
  )
}

export function Lencana({ aktif, teksAktif = 'Aktif', teksMati = 'Nonaktif' }: { aktif: boolean; teksAktif?: string; teksMati?: string }) {
  return <span className={`lencana ${aktif ? 'hijau' : 'abu'}`}>{aktif ? teksAktif : teksMati}</span>
}

export function Halaman({ hal, jumlahHal, total, dasar, query }: { hal: number; jumlahHal: number; total: number; dasar: string; query: Record<string, string | undefined> }) {
  if (jumlahHal <= 1) return <p className="redup kecil">{total} baris</p>
  const ke = (h: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v && k !== 'hal') q.set(k, v)
    if (h > 1) q.set('hal', String(h))
    const s = q.toString()
    return s ? `${dasar}?${s}` : dasar
  }
  return (
    <nav className="halaman" aria-label="Halaman">
      <span className="redup kecil">
        {total} baris, halaman {hal} dari {jumlahHal}
      </span>
      {hal > 1 ? <Link href={ke(hal - 1)}>Sebelumnya</Link> : null}
      {hal < jumlahHal ? <Link href={ke(hal + 1)}>Berikutnya</Link> : null}
    </nav>
  )
}
