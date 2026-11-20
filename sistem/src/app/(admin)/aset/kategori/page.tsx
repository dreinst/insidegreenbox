import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAset } from '@/components/aset'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { daftarKategoriAset } from '@/lib/aset/kategori'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { tambahKategoriAsetAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Kategori aset' }

export default async function KategoriAset({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('aset.daftar', 'L')
  const { pesan } = await searchParams
  const baris = await daftarKategoriAset(db)
  const bolehUbah = punyaIzin(p.izin, 'aset.daftar', 'U')
  const lihatPeta = punyaIzin(p.izin, 'akun.coa', 'L')
  return (
    <>
      <KepalaHalaman judul="Kategori aset" keterangan="Kategori memberi umur manfaat bawaan. Akun aset, akumulasi, dan beban penyusutan per kategori diatur di Akun, tab Pemetaan; kosong berarti ikut akun bawaan." />
      <PesanAset kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Kode</th>
                <th scope="col" className="angka">
                  Umur bawaan
                </th>
                <th scope="col" className="angka">
                  Jumlah aset
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nama">
                    <Link href={`/aset/kategori/${c.id}`} className="tebal">
                      {c.name}
                    </Link>
                  </td>
                  <td data-label="Kode">
                    <code>{c.code}</code>
                  </td>
                  <td data-label="Umur bawaan" className="angka">
                    {c.usefulMonths} bulan
                  </td>
                  <td data-label="Jumlah aset" className="angka">
                    {c._count.fixedAssets}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={c.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/aset/kategori/${c.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada kategori aset.</p>
      )}
      {lihatPeta ? (
        <p className="as-catatan">
          <Link href="/akun/pemetaan">Buka pemetaan akun per kategori</Link>
        </p>
      ) : null}
      {punyaIzin(p.izin, 'aset.daftar', 'T') ? (
        <section className="kartu jarak-atas-kartu" aria-labelledby="j-baru">
          <h2 id="j-baru">Tambah kategori</h2>
          <FormMaster
            aksi={tambahKategoriAsetAksi}
            medan={[
              { jenis: 'teks', nama: 'code', label: 'Kode', wajib: true, maxLength: 20, placeholder: 'MESIN' },
              { jenis: 'teks', nama: 'name', label: 'Nama kategori', wajib: true, maxLength: 60, placeholder: 'Mesin kopi' },
              { jenis: 'angka', nama: 'usefulMonths', label: 'Umur manfaat bawaan (bulan)', wajib: true, inputMode: 'numeric', placeholder: '48' },
              { jenis: 'area', nama: 'note', label: 'Catatan', maxLength: 300, lebar: true },
            ]}
            tombol="Simpan kategori"
          />
        </section>
      ) : null}
    </>
  )
}
