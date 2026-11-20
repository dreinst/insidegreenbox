import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JurnalDokumen, PesanAset } from '@/components/aset'
import { Ringkas } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal, isoTanggal } from '@/components/stok'
import { JejakStatus } from '@/components/stok-dok'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { hitungPelepasan, muatPelepasan } from '@/lib/aset/pelepasan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { formatNilai } from '@/lib/stok/angka'
import { batalPelepasanAksi, hapusPelepasanAksi, postingPelepasanAksi, ubahPelepasanAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Pelepasan Aset' }

export default async function RincianPelepasan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('aset.penyusutan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [x, { pesan }] = await Promise.all([muatPelepasan(db, id), searchParams])
  if (!x) notFound()
  const a = x.fixedAsset
  const iz = (h: 'T' | 'H' | 'P') => punyaIzin(p.izin, 'aset.penyusutan', h)
  const draf = x.status === 'Draft'
  // Draf: nilai dari angka aset saat ini; sesudah diposting: salinan saat posting.
  const nilai = draf ? hitungPelepasan(a, x.proceeds) : { buku: x.bookValue, labaRugi: x.gainLoss }
  const akum = draf ? a.accumDepreciation : x.accumDepreciation
  const rekening = draf && iz('T') ? await db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } }) : []
  const tujuan = x.bankAccountId ? await db.bankAccount.findUnique({ where: { id: x.bankAccountId } }) : null
  return (
    <>
      <KepalaHalaman judul={x.no} keterangan={`Pelepasan aset ${a.code} ${a.name} · ${formatTanggal(x.date)}`} jejak={{ href: '/pelepasan-aset', label: 'Pelepasan Aset' }}>
        <LencanaStatus status={x.status} />
      </KepalaHalaman>
      <PesanAset kode={pesan} />
      <Ringkas
        label="Perhitungan pelepasan"
        isi={[
          ['Nilai perolehan', formatRupiah(draf ? a.cost : x.cost)],
          ['Akumulasi penyusutan', formatRupiah(akum)],
          ['Nilai buku', formatRupiah(nilai.buku)],
          ['Hasil penjualan', formatRupiah(x.proceeds)],
          [nilai.labaRugi >= 0n ? 'Laba pelepasan' : 'Rugi pelepasan', formatNilai(nilai.labaRugi), nilai.labaRugi < 0n],
        ]}
      />
      {draf ? <p className="as-catatan">Angka di atas memakai akumulasi penyusutan saat ini dan dihitung ulang saat diposting.</p> : null}
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {draf && iz('T') ? (
            <FormMaster
              aksi={ubahPelepasanAksi.bind(null, x.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal pelepasan', awal: isoTanggal(x.date), wajib: true },
                { jenis: 'angka', nama: 'proceeds', label: 'Hasil penjualan (Rp)', awal: x.proceeds.toString(), inputMode: 'numeric' },
                { jenis: 'pilih', nama: 'tujuan', label: 'Uang diterima di', awal: x.bankAccountId ? String(x.bankAccountId) : 'kas', pilihan: [{ nilai: 'kas', label: 'Kas besar' }, ...rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))] },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: x.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan perubahan"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Aset</dt>
              <dd>{punyaIzin(p.izin, 'aset.daftar', 'L') ? <Link href={`/aset/${a.id}`}>{`${a.code} ${a.name}`}</Link> : `${a.code} ${a.name}`}</dd>
              <dt>Kategori</dt>
              <dd>{a.category.name}</dd>
              <dt>Uang diterima di</dt>
              <dd>{tujuan ? namaRekening(tujuan) : 'Kas besar'}</dd>
              <dt>Catatan</dt>
              <dd>{x.note || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status dan jurnal</h2>
          <JejakStatus d={x} />
          <JurnalDokumen p={p} docType="asset_disposal" docId={x.id} />
          <div className="as-tindakan">
            {draf && iz('P') ? <TombolAksi aksi={postingPelepasanAksi.bind(null, x.id)} label="Posting pelepasan" konfirmasi={`Posting ${x.no}? Aset ${a.code} menjadi Dilepas dan ${nilai.labaRugi >= 0n ? 'laba' : 'rugi'} ${formatRupiah(nilai.labaRugi < 0n ? -nilai.labaRugi : nilai.labaRugi)} dijurnal.`} /> : null}
            {draf && iz('H') ? <TombolAksi aksi={hapusPelepasanAksi.bind(null, x.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${x.no}?`} /> : null}
            {x.status === 'Diposting' && iz('P') && saklarNyala(p, 'dok.batal_posting') ? (
              <details>
                <summary>Batalkan pelepasan</summary>
                <FormBatal aksi={batalPelepasanAksi.bind(null, x.id)} wajibAlasan label="Batalkan pelepasan" konfirmasi={`Batalkan ${x.no}? Jurnalnya dibalik dan aset kembali Aktif.`} />
              </details>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
