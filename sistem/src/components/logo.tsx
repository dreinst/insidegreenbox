// Tanda Greenbox: kotak hijau berhuruf G, mengikuti logo situs.
export function Logo({ kecil }: { kecil?: boolean }) {
  return (
    <span className={`logo${kecil ? ' kecil' : ''}`}>
      <span className="logo-kotak" aria-hidden="true">
        G
      </span>
      {/* KONTRAK 11 butir 162: tanpa sublabel peran; nama halaman ada di kaki sidebar. */}
      <span className="logo-teks">Greenbox</span>
    </span>
  )
}
