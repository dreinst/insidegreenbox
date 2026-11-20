import type { Metadata } from 'next'
import '@/app/(admin)/b2b.css'
import '@/components/kasir.css'
import { PesanBeli } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { urlFoto } from '@/lib/foto'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarCabang } from '@/lib/profil'
import { ubahProfilAksi } from './aksi'

export const metadata: Metadata = { title: 'Profil Usaha' }

const persen = (d: { toString(): string }) => `${Number(d.toString()).toLocaleString('id-ID')}%`

export default async function ProfilUsaha({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.lokasi', 'L')
  const [cabang, { pesan }] = await Promise.all([daftarCabang(db), searchParams])
  const bolehUbah = punyaIzin(p.izin, 'atur.lokasi', 'U')
  return (
    <>
      <KepalaHalaman judul="Profil Usaha" keterangan="Data cabang untuk kasir, struk, dan laporan. Persen pajak dan service berlaku untuk transaksi kasir berikutnya; transaksi lama tetap memakai persen saat dijual." />
      <PesanBeli kode={pesan} />
      {cabang.map((b) => {
        const logo = urlFoto(b.receiptLogo)
        return (
          <div key={b.id} className="kisi jb-cabang">
            <section className="kartu" aria-labelledby={`j-cabang-${b.id}`}>
              <h2 id={`j-cabang-${b.id}`}>
                {b.name} <small className="redup">({b.code})</small>
              </h2>
              <p className="redup kecil">Lokasi di cabang ini: {b.locations.map((l) => l.name).join(', ') || '-'}</p>
              {bolehUbah ? (
                <FormMaster
                  aksi={ubahProfilAksi.bind(null, b.id)}
                  medan={[
                    { jenis: 'teks', nama: 'name', label: 'Nama usaha', awal: b.name, wajib: true, maxLength: 80 },
                    { jenis: 'teks', nama: 'npwp', label: 'NPWP', awal: b.npwp, maxLength: 30, inputMode: 'numeric', placeholder: '01.234.567.8-901.000' },
                    { jenis: 'teks', nama: 'phone', label: 'Telepon', awal: b.phone, maxLength: 30, inputMode: 'tel' },
                    { jenis: 'area', nama: 'address', label: 'Alamat', awal: b.address, maxLength: 200, lebar: true },
                    { jenis: 'teks', nama: 'taxPct', label: 'Pajak PB1 (%)', awal: Number(b.taxPct.toString()).toString().replace('.', ','), wajib: true, inputMode: 'decimal', bantuan: 'Contoh 10 atau 0 bila tanpa pajak. Paling besar 25.' },
                    { jenis: 'teks', nama: 'servicePct', label: 'Service (%)', awal: Number(b.servicePct.toString()).toString().replace('.', ','), wajib: true, inputMode: 'decimal', bantuan: 'Contoh 5 atau 0. Paling besar 25.' },
                    { jenis: 'teks', nama: 'receiptHeader', label: 'Kepala struk', awal: b.receiptHeader, maxLength: 80, lebar: true, bantuan: 'Baris judul di atas struk. Kosong berarti nama usaha.' },
                    { jenis: 'area', nama: 'receiptFooter', label: 'Kaki struk', awal: b.receiptFooter, maxLength: 200, lebar: true, bantuan: 'Kalimat di bawah struk. Kosong berarti "Terima kasih sudah mampir."' },
                    {
                      jenis: 'foto',
                      nama: 'receiptLogo',
                      label: 'Logo struk',
                      awal: b.receiptLogo ?? '',
                      foto: [],
                      urlAwal: logo,
                      lebar: true,
                      bantuan: 'Unggah WebP, PNG, atau JPG paling besar 2 MB. Pilih Tanpa foto untuk menghapus logo.',
                    },
                  ]}
                  tombol="Simpan profil"
                />
              ) : (
                <dl className="rincian">
                  <dt>NPWP</dt>
                  <dd>{b.npwp || '-'}</dd>
                  <dt>Telepon</dt>
                  <dd>{b.phone || '-'}</dd>
                  <dt>Alamat</dt>
                  <dd>{b.address || '-'}</dd>
                  <dt>Pajak PB1</dt>
                  <dd>{persen(b.taxPct)}</dd>
                  <dt>Service</dt>
                  <dd>{persen(b.servicePct)}</dd>
                  <dt>Kepala struk</dt>
                  <dd>{b.receiptHeader || '-'}</dd>
                  <dt>Kaki struk</dt>
                  <dd>{b.receiptFooter || '-'}</dd>
                </dl>
              )}
            </section>
            <section className="kartu" aria-labelledby={`j-contoh-${b.id}`}>
              <h2 id={`j-contoh-${b.id}`}>Contoh struk</h2>
              <div className="struk jb-contoh-struk">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="struk-logo" src={logo} alt={`Logo ${b.name}`} />
                ) : null}
                <p className="struk-judul">{b.receiptHeader || b.name}</p>
                {b.address ? <p className="struk-tengah">{b.address}</p> : null}
                {b.phone ? <p className="struk-tengah">Telp. {b.phone}</p> : null}
                {b.npwp ? <p className="struk-tengah">NPWP {b.npwp}</p> : null}
                <hr />
                <dl className="struk-dl">
                  <div>
                    <dt>Service {persen(b.servicePct)}</dt>
                    <dd>sesudah potongan</dd>
                  </div>
                  <div>
                    <dt>Pajak {persen(b.taxPct)}</dt>
                    <dd>harga + service</dd>
                  </div>
                </dl>
                <hr />
                <p className="struk-tengah">{b.receiptFooter || 'Terima kasih sudah mampir.'}</p>
              </div>
            </section>
          </div>
        )
      })}
    </>
  )
}
