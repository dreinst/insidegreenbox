// Pesan tetap layar Rekonsiliasi Bank (tahap 5C). Teks diambil dari daftar ini, bukan dari query (KONTRAK 6).
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import '@/app/(admin)/beli.css'
import '@/app/(admin)/kas.css'

const PESAN: Record<string, string> = {
  impor: 'Mutasi diimpor.',
  draf: 'Rekonsiliasi dibuat dan mutasi periodenya dimuat.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  cocok: 'Mutasi dicocokkan.',
  lepas: 'Pencocokan dilepas.',
  saran: 'Saran pencocokan diterapkan.',
  saran_kosong: 'Tidak ada saran yang bisa diterapkan.',
  kas: 'Transaksi kas dibuat dari baris mutasi, diposting, dan langsung dicocokkan.',
  muat: 'Mutasi baru di periode ini dimuat.',
  mutasi_hapus: 'Baris mutasi dihapus.',
  posting: 'Rekonsiliasi Diposting. Baris jurnal yang dicocokkan kini terkunci dari pembatalan.',
  batal: 'Rekonsiliasi dibatalkan.',
  batal_posting: 'Rekonsiliasi dibatalkan. Pencocokan dilepas dan kunci baris jurnal dibuka.',
  dihapus: 'Draf rekonsiliasi dihapus.',
}

export function PesanRekon({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}
