import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LencanaBayar, PanelBeli, PesanBeli, Ringkas, TautanDok } from '@/components/beli'
import { FormIsianBaris } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { peringatanKasMinus } from '@/lib/akuntansi/kas-minus'
import { tombolBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { muatPembayaran, tagihanTerbuka } from '@/lib/beli/pembayaran'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { simpanAlokasiAksi, ubahKepalaPembayaranAksi } from '../../_beli/aksi'
import { aksiPanel, isoHari, jejak } from '../../_beli/panel'

export const metadata: Metadata = { title: 'Pembayaran Pembelian' }

const NAMA_JENIS = { faktur: 'Faktur', langsung: 'Pembelian langsung kredit', retur: 'Nota debit retur (pengurang)' } as const

export default async function RincianPembayaran({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('beli.pembayaran', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatPembayaran(db, id), searchParams])
  if (!d) notFound()
  const t = tombolBeli(p, 'purchase_payment', d.status, true, d.submittedBy)
  const [pemasok, rekening, terbuka] = t.ubah
    ? await Promise.all([pilihanPemasok(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), tagihanTerbuka(db, d.supplierId)])
    : [[], [], []]
  const rek = d.bankAccountId ? await db.bankAccount.findUnique({ where: { id: d.bankAccountId } }) : null
  const alok = new Map(
    d.purchasePaymentAllocs.map((a) => [a.purchaseInvoiceId ? `f${a.purchaseInvoiceId}` : a.directPurchaseId ? `b${a.directPurchaseId}` : `r${a.purchaseReturnId}`, a.amount]),
  )
  // Draf baru tanpa alokasi: bawaan dibayar penuh untuk tiap tagihan dan semua nota debit dipakai.
  const bawaanPenuh = alok.size === 0
  const tagihan = d.purchasePaymentAllocs.filter((a) => !a.purchaseReturnId).reduce((n, a) => n + a.amount, 0n)
  const nota = d.purchasePaymentAllocs.filter((a) => a.purchaseReturnId).reduce((n, a) => n + a.amount, 0n)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pembayaran pembelian · ${d.supplier.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/pembayaran', label: 'Pembayaran Pembelian' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanBeli kode={pesan} />
      <Ringkas
        label="Ringkasan pembayaran"
        isi={[
          ['Tagihan dibayar', formatRupiah(tagihan)],
          ['Nota debit dipakai', formatRupiah(nota)],
          ['Uang keluar', formatRupiah(d.amount)],
          ['Dari', rek ? namaRekening(rek) : 'Kas'],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaPembayaranAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: String(d.supplierId), pilihan: pemasok.map((x) => ({ nilai: String(x.id), label: x.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal bayar', awal: isoHari(d.date), wajib: true },
                { jenis: 'pilih', nama: 'sumber', label: 'Dibayar dari', awal: d.bankAccountId ? String(d.bankAccountId) : 'kas', pilihan: [{ nilai: 'kas', label: 'Kas' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))], wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Pemasok</dt>
              <dd>
                <TautanDok p={p} menu="beli.pemasok" href={`/pemasok/${d.supplierId}`} teks={d.supplier.name} />
              </dd>
              <dt>Dibayar dari</dt>
              <dd>{rek ? namaRekening(rek) : 'Kas'}</dd>
              <dt>Rekening pemasok</dt>
              <dd>{d.supplier.bankName || d.supplier.bankAccountNo ? `${d.supplier.bankName} ${d.supplier.bankAccountNo}` : '-'}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelBeli
          p={p}
          jenis="purchase_payment"
          d={jejak(d)}
          butuhSetuju
          aksi={aksiPanel('purchase_payment', d.id)}
          peringatan={['Draft', 'Diajukan', 'Disetujui'].includes(d.status) ? await peringatanKasMinus(db, d.bankAccountId, d.amount) : null}
          catatan={d.status === 'Disetujui' ? 'Sudah disetujui. Tekan Posting sesudah uang benar-benar keluar.' : d.status === 'Draft' ? 'Semua pembayaran pembelian diajukan dulu lalu disetujui Owner sebelum diposting.' : undefined}
          konfirmasiPosting={`Posting ${d.no}? Uang ${formatRupiah(d.amount)} dicatat keluar dan status bayar tagihan diperbarui.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-alokasi">
        <h2 id="j-alokasi">Alokasi</h2>
        {t.ubah ? (
          terbuka.length ? (
            <FormIsianBaris
              aksi={simpanAlokasiAksi.bind(null, d.id)}
              judulKolom="Dokumen"
              kolom={[
                { kunci: 'tanggal', label: 'Tanggal' },
                { kunci: 'tempo', label: 'Jatuh tempo' },
                { kunci: 'total', label: 'Nilai', angka: true },
                { kunci: 'sisa', label: 'Sisa', angka: true },
              ]}
              isian={[{ awalan: 'bayar', label: 'Dibayar atau dipakai', inputMode: 'numeric', placeholder: '0' }]}
              baris={terbuka.map((x) => ({
                id: x.kunci,
                judul: x.no,
                kecil: `${NAMA_JENIS[x.jenis]}${x.ref ? ` · ${x.ref}` : ''}`,
                sel: { tanggal: formatTanggal(x.date), tempo: formatTanggal(x.dueDate), total: formatRupiah(x.total), sisa: formatRupiah(x.sisa) },
                nilai: { bayar: alok.has(x.kunci) ? alok.get(x.kunci)!.toString() : bawaanPenuh ? x.sisa.toString() : '' },
              }))}
              tombol="Simpan alokasi"
              catatan="Uang keluar = tagihan yang dibayar dikurangi nota debit yang dipakai. Kosongkan atau isi 0 untuk tagihan yang tidak dibayar sekarang."
            />
          ) : (
            <p className="kosong">{d.supplier.name} tidak punya tagihan yang belum lunas.</p>
          )
        ) : d.purchasePaymentAllocs.length ? (
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
                {d.purchasePaymentAllocs.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Dokumen">
                      {a.purchaseInvoice ? (
                        <TautanDok p={p} menu="beli.faktur" href={`/faktur/${a.purchaseInvoice.id}`} teks={a.purchaseInvoice.no} />
                      ) : a.directPurchase ? (
                        <TautanDok p={p} menu="beli.langsung" href={`/beli-langsung/${a.directPurchase.id}`} teks={a.directPurchase.no} />
                      ) : (
                        <TautanDok p={p} menu="beli.retur" href={`/retur-beli/${a.purchaseReturn!.id}`} teks={a.purchaseReturn!.no} />
                      )}
                    </td>
                    <td data-label="Jenis">{a.purchaseInvoice ? 'Faktur' : a.directPurchase ? 'Pembelian langsung' : 'Nota debit (pengurang)'}</td>
                    <td data-label="Jumlah" className="angka">
                      {a.purchaseReturnId ? `-${formatRupiah(a.amount)}` : formatRupiah(a.amount)}
                    </td>
                    <td data-label="Status bayar">
                      {a.purchaseInvoice ? <LencanaBayar s={a.purchaseInvoice.payStatus} /> : a.directPurchase ? <LencanaBayar s={a.directPurchase.payStatus} /> : `sisa ${formatRupiah(a.purchaseReturn!.debitNoteAmount - a.purchaseReturn!.debitNoteUsed)}`}
                    </td>
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
