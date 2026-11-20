import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { BERLAKU_ALASAN, daftarAlasan } from '@/lib/stok/alasan'
import { tambahAlasanAksi } from './aksi'

export const metadata: Metadata = { title: 'Alasan penyesuaian' }

export default async function DaftarAlasan({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.alasan', 'L')
  const { pesan } = await searchParams
  const baris = await daftarAlasan(db)
  const bolehUbah = punyaIzin(p.izin, 'stok.alasan', 'U')
  return (
    <>
      <KepalaHalaman judul="Alasan penyesuaian" keterangan="Alasan yang dipilih di penyesuaian stok dan selisih opname. Akun lawan jurnal diisi bersama modul akuntansi." />
      <PesanStok kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Berlaku untuk</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((a) => (
                <tr key={a.id}>
                  <td data-label="Nama">
                    <Link href={`/alasan-stok/${a.id}`} className="tebal">
                      {a.name}
                    </Link>
                    {a.code ? <small className="redup blok">Alasan sistem, hanya untuk impor saldo awal</small> : null}
                  </td>
                  <td data-label="Berlaku untuk">{BERLAKU_ALASAN[a.appliesTo as keyof typeof BERLAKU_ALASAN] ?? a.appliesTo}</td>
                  <td data-label="Status">
                    <Lencana aktif={a.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/alasan-stok/${a.id}`}>{bolehUbah && !a.code ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada alasan. Jalankan seed untuk membuat alasan bawaan.</p>
      )}
      {punyaIzin(p.izin, 'stok.alasan', 'T') ? (
        <section className="kartu" aria-labelledby="j-baru">
          <h2 id="j-baru">Tambah alasan</h2>
          <FormMaster
            aksi={tambahAlasanAksi}
            medan={[
              { jenis: 'teks', nama: 'name', label: 'Nama alasan', wajib: true, maxLength: 60, placeholder: 'Sampel untuk pelanggan' },
              { jenis: 'pilih', nama: 'appliesTo', label: 'Berlaku untuk', awal: 'semua', pilihan: Object.entries(BERLAKU_ALASAN).map(([nilai, label]) => ({ nilai, label })), wajib: true },
            ]}
            tombol="Simpan alasan"
          />
        </section>
      ) : null}
    </>
  )
}
