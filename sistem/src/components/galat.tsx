'use client'
// Isi bersama halaman galat (error.tsx dan global-error.tsx, audit C-5). Pesan server tidak ditampilkan di produksi;
// kodenya (digest) dipakai untuk mencari catatan di log server.
import { useEffect } from 'react'

export function PesanGalat({ error, idJudul }: { error: unknown; idJudul: string }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  const kode = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null
  return (
    <>
      <h1 id={idJudul}>Halaman ini gagal dimuat</h1>
      <p className="redup">Terjadi galat saat memproses permintaanmu. Isian yang belum tersimpan mungkin hilang. Tekan Coba lagi, atau kembali ke Beranda.</p>
      <p className="redup">Kalau galat muncul sesudah mengunggah berkas, kemungkinan berkasnya terlalu besar. Foto dan bukti setor paling besar 2 MB.</p>
      {kode ? <p className="redup kecil">Kode galat untuk pengelola sistem: {kode}</p> : null}
    </>
  )
}
