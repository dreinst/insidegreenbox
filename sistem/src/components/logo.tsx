// Tanda Greenbox: kotak hijau berhuruf G, mengikuti logo situs.
export function Logo({ kecil }: { kecil?: boolean }) {
  return (
    <span className={`logo${kecil ? ' kecil' : ''}`}>
      <span className="logo-kotak" aria-hidden="true">
        G
      </span>
      <span className="logo-teks">
        Greenbox<small>admin</small>
      </span>
    </span>
  )
}
