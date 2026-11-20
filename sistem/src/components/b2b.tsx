// Bagian bersama layar penjualan B2B tahap 6A (server): pesan sesudah aksi dan saringan daftar dokumen. Panel status,
// ringkasan, dan lencana memakai komponen pembelian (beli.tsx). Gayanya di b2b.css.
import '@/app/(admin)/b2b.css'
import Link from 'next/link'
import type { DocStatus } from '@/generated/prisma/client'
import type { SaringJual } from '@/lib/b2b/umum'
import { PesanBeli } from './beli'

const PESAN_JUAL: Record<string, string> = {
  harga: 'Harga khusus tersimpan.',
  harga_hapus: 'Harga khusus dihapus.',
  alokasi: 'Alokasi penerimaan tersimpan.',
}

export function PesanJual({ kode }: { kode?: string }) {
  if (kode && PESAN_JUAL[kode])
    return (
      <p className="pesan sukses" role="status">
        {PESAN_JUAL[kode]}
      </p>
    )
  return <PesanBeli kode={kode} />
}

export function SaringDaftarJual({
  s,
  jalur,
  pelanggan,
  label,
  status,
  contoh,
  tambahan,
}: {
  s: SaringJual & Record<string, string | undefined>
  jalur: string
  pelanggan: { id: number; name: string }[]
  label: string
  status: DocStatus[]
  contoh: string
  tambahan?: { nama: string; label: string; pilihan: [string, string][] }
}) {
  const disaring = !!(s.q || s.status || s.pelanggan || s.dari || s.sampai || (tambahan && s[tambahan.nama]))
  return (
    <form className="saring" method="get" role="search" aria-label={label}>
      <div className="kolom">
        <label htmlFor="s-q">Nomor</label>
        <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder={contoh} maxLength={30} />
      </div>
      <div className="kolom">
        <label htmlFor="s-status">Status</label>
        <select id="s-status" name="status" defaultValue={s.status ?? ''}>
          <option value="">Semua status</option>
          {status.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div className="kolom">
        <label htmlFor="s-pelanggan">Pelanggan</label>
        <select id="s-pelanggan" name="pelanggan" defaultValue={s.pelanggan ?? ''}>
          <option value="">Semua pelanggan</option>
          {pelanggan.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {tambahan ? (
        <div className="kolom">
          <label htmlFor={`s-${tambahan.nama}`}>{tambahan.label}</label>
          <select id={`s-${tambahan.nama}`} name={tambahan.nama} defaultValue={s[tambahan.nama] ?? ''}>
            <option value="">Semua</option>
            {tambahan.pilihan.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="kolom">
        <label htmlFor="s-dari">Dari tanggal</label>
        <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
      </div>
      <div className="kolom">
        <label htmlFor="s-sampai">Sampai tanggal</label>
        <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
      </div>
      <div className="saring-tombol">
        <button type="submit" className="btn sekunder">
          Saring
        </button>
        {disaring ? <Link href={jalur}>Hapus saringan</Link> : null}
      </div>
    </form>
  )
}
