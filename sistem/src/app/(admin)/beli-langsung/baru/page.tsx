import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { CARA_BAYAR } from '@/lib/beli/langsung'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saklarNyala } from '@/lib/izin-inti'
import { namaRekening } from '@/lib/rekening'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { buatLangsungAksi } from '../../_beli/aksi'
import { medanLangsung } from '../medan'

export const metadata: Metadata = { title: 'Catat pembelian langsung' }

export default async function LangsungBaru() {
  const p = await wajibIzin('beli.langsung', 'T')
  const [lokasi, pemasok, rekening] = await Promise.all([pilihanLokasi(db), pilihanPemasok(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })])
  const cara = (['tunai', 'kredit'] as const).filter((c) => saklarNyala(p, c === 'tunai' ? 'beli.langsung_tunai' : 'beli.langsung_kredit')).map((c) => ({ nilai: c, label: CARA_BAYAR[c] }))
  return (
    <>
      <KepalaHalaman judul="Catat pembelian langsung" keterangan="Draf dibuat dulu dengan nomornya, lalu barang dan biaya ditambahkan di layar berikutnya." jejak={{ href: '/beli-langsung', label: 'Pembelian Langsung' }} />
      <section className="kartu">
        {cara.length ? (
          <FormMaster
            aksi={buatLangsungAksi}
            medan={medanLangsung(
              { locationId: String(lokasi.find((l) => l.code === 'OUTLET')?.id ?? lokasi[0]?.id ?? ''), date: hariIni().toISOString().slice(0, 10) },
              pemasok.map((x) => ({ nilai: String(x.id), label: x.name })),
              lokasi.map((l) => ({ nilai: String(l.id), label: l.name })),
              rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) })),
              cara,
            )}
            tombol="Buat draf"
          />
        ) : (
          <p className="kosong">Kamu tidak punya saklar pembelian langsung tunai maupun kredit.</p>
        )}
      </section>
    </>
  )
}
