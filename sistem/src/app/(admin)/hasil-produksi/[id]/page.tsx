import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster } from '@/components/form-master'
import { PesanProduksi, Progres } from '@/components/produksi'
import { LencanaStatus, formatTanggal, isoTanggal } from '@/components/stok'
import { PanelTindakan } from '@/components/stok-dok'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { LEBIH_HASIL_PERSEN, muatHasil, nilaiHasil } from '@/lib/produksi/hasil'
import { des, formatHarga, formatNilai, formatQty, isianQty } from '@/lib/stok/angka'
import { aturanSetuju, tombolStatus } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusHasilAksi, statusHasilAksi, ubahKepalaHasilAksi } from '../aksi'

export const metadata: Metadata = { title: 'Hasil Produksi' }

export default async function RincianHasil({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('produksi.hasil', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatHasil(db, id), searchParams])
  if (!d) notFound()
  const butuhSetuju = await aturanSetuju(db, 'production_result')
  const t = tombolStatus(p, 'production_result', d.status, butuhSetuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const lokasi = t.ubah ? await pilihanLokasi(db) : []
  const po = d.productionOrder
  const produk = po.bom.product
  const sat = produk?.baseUnit.symbol ?? ''
  const sudahGerak = d.status === 'Diposting' || (d.status === 'Batal' && d.postedAt !== null)
  // Perkiraan nilai bila diposting sekarang, dari nilai dalam proses perintah saat ini.
  const kira = !sudahGerak && po.status === 'Disetujui' ? nilaiHasil(po.wipValue, des(d.qty), des(po.producedQty), des(po.plannedQty)) : null
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Hasil produksi · ${produk?.name ?? po.bom.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/hasil-produksi', label: 'Hasil Produksi' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanProduksi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data hasil</h2>
          <dl className="rincian">
            <dt>Perintah produksi</dt>
            <dd>
              <Link href={`/perintah-produksi/${po.id}`}>{po.no}</Link> ({po.status})
            </dd>
            <dt>Progres perintah</dt>
            <dd>
              {formatQty(po.producedQty)} dari {formatQty(po.plannedQty)} {sat}
              <Progres nilai={po.producedQty} dari={po.plannedQty} />
            </dd>
            {lihatNilai ? (
              <>
                <dt>Nilai dalam proses</dt>
                <dd>{formatNilai(po.wipValue)}</dd>
              </>
            ) : null}
          </dl>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaHasilAksi.bind(null, d.id)}
              medan={[
                { jenis: 'angka', nama: 'qty', label: `Qty hasil (${sat})`, awal: isianQty(d.qty), inputMode: 'decimal', wajib: true },
                { jenis: 'angka', nama: 'wasteQty', label: `Qty susut (${sat})`, awal: isianQty(d.wasteQty), inputMode: 'decimal' },
                { jenis: 'pilih', nama: 'locationId', label: 'Lokasi hasil', awal: String(d.locationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoTanggal(d.date), wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan draf"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Qty hasil</dt>
              <dd>
                {formatQty(d.qty)} {sat} {produk?.name}
              </dd>
              <dt>Qty susut</dt>
              <dd>
                {formatQty(d.wasteQty)} {sat}
              </dd>
              <dt>Lokasi hasil</dt>
              <dd>{d.location.name}</dd>
              {lihatNilai && sudahGerak ? (
                <>
                  <dt>Nilai masuk</dt>
                  <dd>
                    {formatNilai(d.value)} ({formatHarga(d.unitCost)} per {sat})
                  </dd>
                </>
              ) : null}
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
          {lihatNilai && kira ? (
            <p className="catatan">
              Bila diposting sekarang, nilai masuk sekitar {formatNilai(kira.nilai)}
              {kira.terakhir ? ' (seluruh sisa nilai dalam proses, dan perintah menjadi Selesai)' : ''}.
            </p>
          ) : null}
        </section>
        <PanelTindakan
          p={p}
          jenis="production_result"
          d={d}
          butuhSetuju={butuhSetuju}
          catatan={d.status === 'Draft' ? `Hasil kumulatif boleh melebihi rencana sampai ${LEBIH_HASIL_PERSEN}%; lebih dari itu butuh izin Setujui.` : undefined}
          aksi={{
            ajukan: statusHasilAksi.bind(null, d.id, 'ajukan'),
            kembalikan: statusHasilAksi.bind(null, d.id, 'kembalikan'),
            posting: statusHasilAksi.bind(null, d.id, 'posting'),
            batal: statusHasilAksi.bind(null, d.id, 'batal'),
            hapus: hapusHasilAksi.bind(null, d.id),
          }}
        />
      </div>
      {sudahGerak && produk && punyaIzin(p.izin, 'stok.saldo', 'L') ? (
        <p className="redup kecil">
          Gerak stok dokumen ini bisa dilihat di <Link href={`/stok/kartu?produk=${produk.id}&lokasi=${d.locationId}`}>kartu stok</Link>.
        </p>
      ) : null}
    </>
  )
}
