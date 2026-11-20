import type { Metadata } from 'next'
import { PesanAkuntansi } from '@/components/akuntansi'
import { FormPemetaan, type KelompokFormPeta } from '@/components/akuntansi-form'
import { KepalaHalaman } from '@/components/umum'
import { daftarPemetaan, JENIS_AKUN, pilihanAkun, type BarisPeta } from '@/lib/akuntansi/akun'
import { KUNCI_PER_KODE } from '@/lib/akuntansi/pemetaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { simpanPemetaanAksi } from '../aksi'

export const metadata: Metadata = { title: 'Pemetaan Akun' }

export default async function PemetaanAkun({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.coa', 'L')
  const [{ pesan }, peta, akun] = await Promise.all([searchParams, daftarPemetaan(db), pilihanAkun(db)])
  const bolehUbah = punyaIzin(p.izin, 'akun.coa', 'U')
  const label = new Map(akun.map((a) => [a.id, `${a.code} ${a.name}`]))
  const namaAkun = new Map((await db.account.findMany({ select: { id: true, code: true, name: true } })).map((a) => [a.id, `${a.code} ${a.name}`]))
  const keForm = (b: BarisPeta) => ({
    kunci: b.kunci,
    nama: b.nama,
    keterangan: b.keterangan,
    akunId: b.akunId,
    wajib: b.umum,
    kosong: b.umum ? 'Pilih akun' : `Ikut bawaan (${KUNCI_PER_KODE.get(b.cadangan ?? '')?.nama ?? b.cadangan})`,
    pilihan: akun.filter((a) => b.jenis.includes(a.kind) || a.id === b.akunId).map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name}${b.jenis.length > 1 ? ` (${JENIS_AKUN[a.kind]})` : ''}` })),
  })
  const kelompok: KelompokFormPeta[] = [
    { judul: 'Akun bawaan transaksi', keterangan: 'Wajib terisi. Dokumen kasir, stok, produksi, setoran, dan pembelian memakai akun ini.', baris: peta.umum.map(keForm) },
    ...peta.kelompok.filter((k) => k.baris.length).map((k) => ({ judul: k.judul, keterangan: 'Kosongkan untuk memakai akun bawaan.', baris: k.baris.map(keForm) })),
  ]
  return (
    <>
      <KepalaHalaman
        judul="Pemetaan Akun"
        keterangan="Dokumen tidak pernah memilih akun sendiri. Setiap jurnal otomatis mengambil akunnya dari daftar ini, jadi Admin cukup mengisi dokumen tanpa perlu paham bagan akun."
      />
      <PesanAkuntansi kode={pesan} />
      <section className="kartu">
        {bolehUbah ? (
          <>
            <p className="catatan">Mengganti akun persediaan saat lokasi masih punya stok membuat saldo lama tertinggal di akun sebelumnya. Pindahkan saldonya lewat jurnal memorial bila perlu.</p>
            <FormPemetaan aksi={simpanPemetaanAksi} kelompok={kelompok} />
          </>
        ) : (
          kelompok.map((k) => (
            <div key={k.judul} className="peta-kelompok">
              <h3>{k.judul}</h3>
              {k.baris.map((b) => (
                <div key={b.kunci} className="peta-baris">
                  <span>
                    <b>{b.nama}</b>
                    <small>
                      <code>{b.kunci}</code>
                      {b.keterangan ? ` · ${b.keterangan}` : ''}
                    </small>
                  </span>
                  <span>{b.akunId ? (label.get(b.akunId) ?? namaAkun.get(b.akunId) ?? `#${b.akunId}`) : b.kosong}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </>
  )
}
