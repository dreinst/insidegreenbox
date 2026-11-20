import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PesanJual } from '@/components/b2b'
import { LencanaBayar, PanelBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { muatTerima, piutangTerbuka } from '@/lib/b2b/penerimaan'
import { pilihanPelanggan } from '@/lib/b2b/umum'
import { tombolBeli } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { simpanAlokasiTerimaAksi, ubahKepalaTerimaAksi } from '../../_jual/aksi'
import { aksiPanelJual, isoHari, jejak } from '../../_jual/panel'

export const metadata: Metadata = { title: 'Penerimaan Pelanggan' }

const NAMA_JENIS = { faktur: 'Faktur penjualan', retur: 'Nota kredit retur (pengurang)' } as const

export default async function RincianTerima({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('b2b.penerimaan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatTerima(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'customer_payment', d.status, false, d.submittedBy)
  const [pelanggan, rekening, terbuka] = t.ubah
    ? await Promise.all([pilihanPelanggan(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), piutangTerbuka(db, d.customerId)])
    : [[], [], []]
  const rek = d.bankAccountId ? await db.bankAccount.findUnique({ where: { id: d.bankAccountId } }) : null
  const alok = new Map(d.customerPaymentAllocs.map((a) => [a.salesInvoiceId ? `f${a.salesInvoiceId}` : `r${a.salesReturnId}`, a.amount]))
  // Draf baru tanpa alokasi: bawaan dilunasi penuh untuk tiap faktur dan semua nota kredit dipakai.
  const bawaanPenuh = alok.size === 0
  const tagihan = d.customerPaymentAllocs.filter((a) => a.salesInvoiceId).reduce((n, a) => n + a.amount, 0n)
  const kredit = d.customerPaymentAllocs.filter((a) => a.salesReturnId).reduce((n, a) => n + a.amount, 0n)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Penerimaan pelanggan · ${d.customer.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/terima-pelanggan', label: 'Penerimaan Pelanggan' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanJual kode={pesan} />
      <Ringkas
        label="Ringkasan penerimaan"
        isi={[
          ['Faktur dilunasi', formatRupiah(tagihan)],
          ['Nota kredit dipakai', formatRupiah(kredit)],
          ['Uang masuk', formatRupiah(d.amount)],
          ['Ke', rek ? namaRekening(rek) : 'Kas'],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaTerimaAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'customerId', label: 'Pelanggan', awal: String(d.customerId), pilihan: pelanggan.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal terima', awal: isoHari(d.date), wajib: true },
                { jenis: 'pilih', nama: 'tujuan', label: 'Diterima di', awal: d.bankAccountId ? String(d.bankAccountId) : 'kas', pilihan: [{ nilai: 'kas', label: 'Kas' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))], wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pelanggan</dt>
              <dd>
                <TautanDok p={p} menu="b2b.pelanggan" href={`/pelanggan/${d.customerId}`} teks={d.customer.name} />
              </dd>
              <dt>Diterima di</dt>
              <dd>{rek ? namaRekening(rek) : 'Kas'}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelBeli
          p={p}
          jenis="customer_payment"
          d={jejak(d)}
          butuhSetuju={false}
          aksi={aksiPanelJual('customer_payment', d.id)}
          catatan={d.status === 'Draft' || d.status === 'Diajukan' ? 'Posting sesudah uang benar-benar diterima. Status bayar faktur diperbarui saat itu.' : undefined}
          konfirmasiPosting={`Posting ${d.no}? Uang ${formatRupiah(d.amount)} dicatat masuk dan status bayar faktur diperbarui.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-alokasi">
        <h2 id="j-alokasi">Alokasi</h2>
        {t.ubah ? (
          terbuka.length ? (
            <FormIsianBaris
              aksi={simpanAlokasiTerimaAksi.bind(null, d.id)}
              judulKolom="Dokumen"
              kolom={[
                { kunci: 'tanggal', label: 'Tanggal' },
                { kunci: 'tempo', label: 'Jatuh tempo' },
                { kunci: 'total', label: 'Nilai', angka: true },
                { kunci: 'sisa', label: 'Sisa', angka: true },
              ]}
              isian={[{ awalan: 'terima', label: 'Dilunasi atau dipakai', inputMode: 'numeric', placeholder: '0' }]}
              baris={terbuka.map((x) => ({
                id: x.kunci,
                judul: x.no,
                kecil: `${NAMA_JENIS[x.jenis]}${x.ref ? ` · ${x.ref}` : ''}`,
                sel: { tanggal: formatTanggal(x.date), tempo: formatTanggal(x.dueDate), total: formatRupiah(x.total), sisa: formatRupiah(x.sisa) },
                nilai: { terima: alok.has(x.kunci) ? alok.get(x.kunci)!.toString() : bawaanPenuh ? x.sisa.toString() : '' },
              }))}
              tombol="Simpan alokasi"
              catatan="Uang masuk = faktur yang dilunasi dikurangi nota kredit yang dipakai. Kosongkan atau isi 0 untuk faktur yang belum dibayar sekarang."
            />
          ) : (
            <p className="kosong">{d.customer.name} tidak punya faktur yang belum lunas.</p>
          )
        ) : d.customerPaymentAllocs.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Dokumen</th>
                  <th scope="col">Jenis</th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                  <th scope="col">Status bayar sekarang</th>
                </tr>
              </thead>
              <tbody>
                {d.customerPaymentAllocs.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Dokumen">
                      {a.salesInvoice ? (
                        <TautanDok p={p} menu="b2b.faktur" href={`/faktur-jual/${a.salesInvoice.id}`} teks={a.salesInvoice.no} />
                      ) : (
                        <TautanDok p={p} menu="b2b.retur" href={`/retur-jual/${a.salesReturn!.id}`} teks={a.salesReturn!.no} />
                      )}
                    </td>
                    <td data-label="Jenis">{a.salesInvoice ? 'Faktur penjualan' : 'Nota kredit (pengurang)'}</td>
                    <td data-label="Jumlah" className="angka">
                      {a.salesReturnId ? `-${formatRupiah(a.amount)}` : formatRupiah(a.amount)}
                    </td>
                    <td data-label="Status bayar">{a.salesInvoice ? <LencanaBayar s={a.salesInvoice.payStatus} /> : `sisa ${formatRupiah(a.salesReturn!.total - a.salesReturn!.creditUsed)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada alokasi.</p>
        )}
      </section>
    </>
  )
}
