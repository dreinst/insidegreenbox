// Saringan bersama daftar dokumen persediaan (tahap 4A).
import Link from 'next/link'
import type { SaringDok } from '@/lib/stok/dokumen'

export function SaringDokumen({ s, jalur, lokasi, label }: { s: SaringDok; jalur: string; lokasi: { id: number; name: string }[]; label: string }) {
  const disaring = !!(s.q || s.status || s.lokasi || s.dari || s.sampai)
  return (
    <form className="saring" method="get" role="search" aria-label={label}>
      <div className="kolom">
        <label htmlFor="s-q">Nomor</label>
        <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="PS-2611" maxLength={30} />
      </div>
      <div className="kolom">
        <label htmlFor="s-status">Status</label>
        <select id="s-status" name="status" defaultValue={s.status ?? ''}>
          <option value="">Semua status</option>
          <option value="Draft">Draft</option>
          <option value="Diajukan">Diajukan</option>
          <option value="Diposting">Diposting</option>
          <option value="Batal">Batal</option>
        </select>
      </div>
      <div className="kolom">
        <label htmlFor="s-lokasi">Lokasi</label>
        <select id="s-lokasi" name="lokasi" defaultValue={s.lokasi ?? ''}>
          <option value="">Semua lokasi</option>
          {lokasi.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
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
