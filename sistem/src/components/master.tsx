// Komponen tampilan bersama modul master tahap 3A. Gayanya di master.css (diimpor di sini, jadi ikut tiap halaman yang memakainya).
import '@/app/(admin)/master.css'
import { urlFoto } from '@/lib/foto'

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Sudah diaktifkan.',
  nonaktif: 'Sudah dinonaktifkan.',
  harga: 'Harga baru sudah berlaku dan tercatat di riwayat harga.',
}

export function PesanMaster({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

export function Foto({ image, nama, ukuran = 44 }: { image: string | null | undefined; nama: string; ukuran?: number }) {
  const url = urlFoto(image)
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={nama} className={`foto-mini foto-${ukuran}`} width={ukuran} height={ukuran} loading="lazy" />
  ) : (
    <span className={`foto-mini kosong-foto foto-${ukuran}`} aria-hidden="true" />
  )
}

export const LencanaKuning = ({ children }: { children: React.ReactNode }) => <span className="lencana kuning">{children}</span>
