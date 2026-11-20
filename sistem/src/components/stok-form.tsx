'use client'
// Formulir kecil modul persediaan tahap 4A: tombol status, pembatalan dengan alasan, dan isian hitungan opname.
import { useActionState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

// Satu tombol yang menjalankan satu aksi server, dengan konfirmasi opsional.
export function TombolAksi({ aksi, label, kelas = 'btn', konfirmasi }: { aksi: Aksi; label: string; kelas?: string; konfirmasi?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form tombol-aksi">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas={kelas} konfirmasi={konfirmasi}>
        {label}
      </TombolKirim>
    </form>
  )
}

// Pembatalan dokumen. Untuk dokumen Diposting alasan wajib dan stok dibalik.
// tahap 5B: labelAlasan untuk pemakaian di luar pembatalan (misalnya membuka lagi periode).
export function FormBatal({ aksi, wajibAlasan, label, konfirmasi, labelAlasan }: { aksi: Aksi; wajibAlasan: boolean; label: string; konfirmasi: string; labelAlasan?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const salah = galatKolom(hasil, 'alasan')
  return (
    <form action={kirim} key={hasil.n} className="form form-batal" noValidate>
      <PesanHasil hasil={hasil} />
      <div className={`kolom${salah ? ' salah' : ''}`}>
        <label htmlFor="k-alasan">{labelAlasan ?? (wajibAlasan ? 'Alasan pembatalan' : 'Alasan pembatalan (boleh kosong)')}</label>
        <textarea id="k-alasan" name="alasan" rows={2} maxLength={300} defaultValue={nilaiAwal(hasil, 'alasan')} aria-invalid={salah ? true : undefined} aria-describedby={salah ? 'k-alasan-g' : undefined} />
        {salah ? (
          <small id="k-alasan-g" className="galat-kolom">
            {salah}
          </small>
        ) : null}
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn bahaya" konfirmasi={konfirmasi}>
          {label}
        </TombolKirim>
      </div>
    </form>
  )
}

export type BarisHitung = {
  id: number
  kode: string
  nama: string
  satuan: string
  sistem: string
  sesudah: string
  hitung: string
  alasan: string
}

// Isian hitungan fisik opname. Nama kolom hitung_<id> dan alasan_<id> dibaca modul opname.
export function FormHitungan({ aksi, baris, alasan }: { aksi: Aksi; baris: BarisHitung[]; alasan: { nilai: string; label: string }[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kartu tanpa-isi">
        <table className="tabel tabel-hitung">
          <thead>
            <tr>
              <th scope="col">Produk</th>
              <th scope="col" className="angka">
                Qty sistem
              </th>
              <th scope="col" className="angka">
                Gerak sesudah beku
              </th>
              <th scope="col">Qty fisik</th>
              <th scope="col">Alasan selisih</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const g = galatKolom(hasil, `hitung_${b.id}`)
              return (
                <tr key={b.id}>
                  <td data-label="Produk">
                    <span className="tebal">{b.nama}</span>
                    <small className="redup blok">{b.kode}</small>
                  </td>
                  <td data-label="Qty sistem" className="angka">
                    {b.sistem} {b.satuan}
                  </td>
                  <td data-label="Sesudah beku" className="angka">
                    {b.sesudah}
                  </td>
                  <td data-label="Qty fisik">
                    <div className={`kolom${g ? ' salah' : ''}`}>
                      <label htmlFor={`k-hitung_${b.id}`} className="sr">
                        Qty fisik {b.nama}
                      </label>
                      <input id={`k-hitung_${b.id}`} name={`hitung_${b.id}`} inputMode="decimal" autoComplete="off" defaultValue={nilaiAwal(hasil, `hitung_${b.id}`, b.hitung)} aria-invalid={g ? true : undefined} />
                      {g ? <small className="galat-kolom">{g}</small> : null}
                    </div>
                  </td>
                  <td data-label="Alasan">
                    <div className="kolom">
                      <label htmlFor={`k-alasan_${b.id}`} className="sr">
                        Alasan selisih {b.nama}
                      </label>
                      <select id={`k-alasan_${b.id}`} name={`alasan_${b.id}`} defaultValue={nilaiAwal(hasil, `alasan_${b.id}`, b.alasan)}>
                        <option value="">Tanpa alasan</option>
                        {alasan.map((a) => (
                          <option key={a.nilai} value={a.nilai}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="tombol-baris">
        <TombolKirim>Simpan hitungan</TombolKirim>
      </div>
    </form>
  )
}
