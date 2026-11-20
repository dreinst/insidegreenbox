// Komponen tampilan halaman akuntansi tahap 5B (server). Gayanya di akuntansi.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import '@/app/(admin)/laporan/laporan.css'
import '@/app/(admin)/akuntansi.css'
import type { BarisLaporan } from '@/lib/akuntansi/laporan'

const PESAN: Record<string, string> = {
  dibuat: 'Akun baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Akun diaktifkan.',
  nonaktif: 'Akun dinonaktifkan.',
  pemetaan: 'Pemetaan akun tersimpan. Dokumen berikutnya memakai akun yang baru.',
  draf: 'Draf jurnal memorial dibuat. Tambahkan barisnya di bawah.',
  baris: 'Baris ditambahkan.',
  baris_hapus: 'Baris dihapus.',
  ajukan: 'Jurnal diajukan dan menunggu persetujuan.',
  kembalikan: 'Jurnal dikembalikan ke draf.',
  posting: 'Jurnal sudah Diposting dan masuk buku besar.',
  batal: 'Jurnal dibatalkan.',
  batal_posting: 'Jurnal dibatalkan. Jurnal balik bertanggal hari ini sudah dibuat.',
  dihapus: 'Draf jurnal dihapus.',
  tutup: 'Periode ditutup. Posting dan pembatalan bertanggal di bulan itu sekarang ditolak.',
  buka: 'Periode dibuka lagi.',
}

export function PesanAkuntansi({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

export const rp = (n: number | bigint) => {
  const v = Number(n)
  return `${v < 0 ? '-' : ''}Rp ${Math.abs(v).toLocaleString('id-ID')}`
}

// Tabel laporan keuangan (Laba Rugi dan Neraca): judul kelompok, baris akun, jumlah, dan hasil. Kolom persen opsional.
export function TabelKeuangan({ baris, judul, persen, tautan }: { baris: BarisLaporan[]; judul: string; persen?: boolean; tautan?: (id: number) => string | null }) {
  return (
    <div className="kartu tanpa-isi" role="region" aria-label={judul}>
      <table className="tabel lk-tabel">
        <caption className="sr">{judul}</caption>
        <thead>
          <tr>
            <th scope="col">Akun</th>
            <th scope="col" className="angka">
              Nilai
            </th>
            {persen ? (
              <th scope="col" className="angka">
                Persen pendapatan
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {baris.map((b, i) => {
            const href = b.id && tautan ? tautan(b.id) : null
            const nama = b.kode ? `${b.kode} ${b.nama}` : b.nama
            return (
              <tr key={`${i}-${b.nama}`} className={`lk-${b.jenis}`}>
                <td data-label={b.jenis === 'akun' ? 'Akun' : ''}>{href ? <a href={href}>{nama}</a> : nama}</td>
                <td data-label="Nilai" className="angka">
                  {b.nilai === null ? '' : rp(b.nilai)}
                </td>
                {persen ? (
                  <td data-label="Persen" className="angka">
                    {b.persen === null || b.persen === undefined ? '' : `${b.persen.toLocaleString('id-ID')}%`}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Saringan bulan untuk laporan keuangan. satu = hanya satu bulan (Neraca, per akhir bulan itu).
export function SaringBulan({ dasar, jenis, dari, sampai, satu, ekstra }: { dasar: string; jenis: string; dari: string; sampai: string; satu?: boolean; ekstra?: React.ReactNode }) {
  const q = new URLSearchParams({ jenis, ...(satu ? { sampai } : { dari, sampai }) })
  return (
    <form className="saring lap-saring" method="get" role="search" aria-label="Pilih periode">
      {satu ? null : (
        <div className="kolom">
          <label htmlFor="s-dari">Dari bulan</label>
          <input id="s-dari" name="dari" type="month" defaultValue={dari} />
        </div>
      )}
      <div className="kolom">
        <label htmlFor="s-sampai">{satu ? 'Per akhir bulan' : 'Sampai bulan'}</label>
        <input id="s-sampai" name="sampai" type="month" defaultValue={sampai} />
      </div>
      {ekstra}
      <div className="saring-tombol">
        <button type="submit" className="btn sekunder">
          Tampilkan
        </button>
        <a href={`${dasar}/unduh?${q.toString()}`} className="lap-unduh" download>
          Unduh CSV
        </a>
      </div>
    </form>
  )
}

export function StatusSeimbang({ seimbang, teksOk, teksSalah }: { seimbang: boolean; teksOk: string; teksSalah: string }) {
  return (
    <p className={`lk-status ${seimbang ? 'ok' : 'salah'}`} role="status">
      {seimbang ? teksOk : teksSalah}
    </p>
  )
}
