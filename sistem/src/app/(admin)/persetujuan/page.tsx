import type { Metadata } from 'next'
import { KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { bolehUbahAturan, daftarAturan } from '@/lib/persetujuan'
import { formatWaktu } from '@/lib/waktu'
import { simpanAturanAksi } from './aksi'
import { FormAturan, type BarisForm } from './form'

export const metadata: Metadata = { title: 'Aturan Persetujuan' }

// Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 156): hanya Owner yang mengubah aturan persetujuan.
export default async function HalamanPersetujuan({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('atur.persetujuan', 'L')
  const [aturan, { pesan }] = await Promise.all([daftarAturan(db), searchParams])
  const bisaUbah = bolehUbahAturan(p)
  const baris: BarisForm[] = aturan.map((a) => ({
    docType: a.docType,
    nama: a.info?.nama ?? a.docType,
    keterangan: a.info?.keterangan ?? '',
    batas: a.info?.batas,
    tetap: a.info?.tetap,
    dikenal: !!a.info,
    wajib: a.wajib,
    nominal: a.nominal === null ? '' : Number(a.nominal).toLocaleString('id-ID'),
    persen: a.persen === null ? '' : String(Number(a.persen)).replace('.', ','),
    diubah: a.updatedBy ? `diubah ${a.updatedBy}, ${formatWaktu(a.updatedAt)}` : '',
  }))
  const wajib = aturan.filter((a) => a.wajib).length

  return (
    <>
      <KepalaHalaman judul="Aturan Persetujuan" keterangan="Jenis dokumen yang wajib diajukan lalu disetujui pemegang izin Setujui sebelum berlaku, beserta batas nilainya." />
      <PesanFlash kode={pesan} />
      <section className="kartu" aria-labelledby="j-aturan">
        <div className="kartu-kepala">
          <h2 id="j-aturan">Aturan per jenis dokumen</h2>
          <span className="redup">
            {wajib} dari {aturan.length} wajib disetujui
          </span>
        </div>
        <p className="redup">
          Saklar menyala berarti dokumen jenis itu wajib disetujui. Batas kosong berarti semua nilai. Mematikan persetujuan tidak menghapus batasnya. Perubahan langsung berlaku untuk dokumen yang diproses sesudahnya, termasuk dokumen yang sedang Draft atau Diajukan.
        </p>
        {!bisaUbah && punyaIzin(p.izin, 'atur.persetujuan', 'U') ? <p className="redup">Aturan persetujuan hanya bisa diubah pengguna berperan Owner.</p> : null}
        {baris.length ? <FormAturan aksi={simpanAturanAksi} baris={baris} bisaUbah={bisaUbah} /> : <p className="kosong">Belum ada aturan persetujuan.</p>}
      </section>
    </>
  )
}
