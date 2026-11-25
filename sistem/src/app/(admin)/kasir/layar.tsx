'use client'
// Layar kasir (tahap 3B). Keranjang hidup di state klien, jadi tetap utuh saat aksi mengembalikan galat.
// Angka di layar hanya pratinjau; harga, potongan, pajak, service, dan pembagian bayar dihitung ulang di server.
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'
import { bagiBayar, hitungKeranjang, kenaPotonganMember, labelPromo, rupiah, sisaTunaiBulat, type JenisBaris, type PromoKasir } from '@/lib/hitung-kasir'
import type { HasilCariMember } from './aksi'

type Kategori = { code: string; name: string }
type Menu = { id: number; name: string; category: string; price: number }
type Paket = { id: number; name: string; price: number; normalPrice: number; minuman: string }
type Metode = { id: number; name: string; tunai: boolean }
// Ubin dan baris keranjang dikenali lewat kunci "menu:<id>" atau "paket:<id>" (admin lama: kind + id).
type Ubin = { kunci: string; jenis: JenisBaris; id: number; name: string; sub: string; price: number; normal?: number; kelompok: string }
type Baris = { kunci: string; jenis: JenisBaris; id: number; qty: number; catatan: string }
type Bayar = { kunci: number; metodeId: number; jumlah: string }
type Member = Extract<HasilCariMember, { ok: true }>['member']

// Kelompok paket di pilihan kategori. Diawali tanda yang tidak mungkin ada di kode kategori.
const KELOMPOK_PAKET = '*paket'

type Prop = {
  kategori: Kategori[]
  menu: Menu[]
  paket: Paket[]
  metode: Metode[]
  biaya: { pajak: number; service: number }
  // Promo yang berlaku hari ini (KONTRAK 11 butir 160). Server menghitung ulang saat simpan.
  promo: PromoKasir[]
  aksi: (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
  cariMember: (wa: string) => Promise<HasilCariMember>
}

const angka = (s: string) => Number(s.replace(/\D/g, '')) || 0
const ribuan = (n: number) => (n ? n.toLocaleString('id-ID') : '')

export function LayarKasir({ kategori: semuaKategori, menu, paket, metode, biaya, promo, aksi, cariMember }: Prop) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const [mode, setMode] = useState<'dinein' | 'takeaway'>('dinein')
  const [meja, setMeja] = useState('')
  const [kategori, setKategori] = useState('semua')
  const [cari, setCari] = useState('')
  const [keranjang, setKeranjang] = useState<Baris[]>([])
  const [wa, setWa] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [pesanMember, setPesanMember] = useState('')
  const [mencari, mulaiCari] = useTransition()
  const tunai = metode.find((m) => m.tunai)
  const [bayar, setBayar] = useState<Bayar[]>([{ kunci: 1, metodeId: (tunai ?? metode[0])?.id ?? 0, jumlah: '' }])

  // Bilah total di HP hanya tampil selama panel pesanan belum terlihat, supaya tidak menutupi tombol bayar.
  const panel = useRef<HTMLElement>(null)
  const [panelTampak, setPanelTampak] = useState(false)
  useEffect(() => {
    const el = panel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const o = new IntersectionObserver(([e]) => setPanelTampak(e.isIntersecting))
    o.observe(el)
    return () => o.disconnect()
  }, [])

  // Paket tampil lebih dulu seperti Early set di admin lama, lalu menu menurut urutan kategori dari server.
  const ubin = useMemo(() => {
    const namaKategori = new Map(semuaKategori.map((k) => [k.code, k.name]))
    return [
      ...paket.map((p): Ubin => ({ kunci: `paket:${p.id}`, jenis: 'paket', id: p.id, name: `Paket ${p.name}`, sub: `+ ${p.minuman}`, price: p.price, normal: p.normalPrice, kelompok: KELOMPOK_PAKET })),
      ...menu.map((m): Ubin => ({ kunci: `menu:${m.id}`, jenis: 'menu', id: m.id, name: m.name, sub: namaKategori.get(m.category) ?? m.category, price: m.price, kelompok: m.category })),
    ]
  }, [semuaKategori, menu, paket])
  const perKunci = useMemo(() => new Map(ubin.map((u) => [u.kunci, u])), [ubin])
  // Hanya kategori yang punya menu aktif yang dijadikan pilihan.
  const daftarKategori = useMemo(() => semuaKategori.filter((k) => menu.some((m) => m.category === k.code)), [semuaKategori, menu])
  const t = hitungKeranjang(
    keranjang.map((b) => ({ harga: perKunci.get(b.kunci)?.price ?? 0, qty: b.qty, jenis: b.jenis })),
    member?.persen ?? 0,
    biaya,
    promo,
  )
  const masukanBayar = bayar.map((b) => {
    const m = metode.find((x) => x.id === b.metodeId)
    return { metodeId: b.metodeId, jumlah: angka(b.jumlah), tunai: !!m?.tunai, nama: m?.name }
  })
  const bagi = keranjang.length ? bagiBayar(t.total, masukanBayar) : null
  const nonTunai = masukanBayar.filter((b) => !b.tunai).reduce((a, b) => a + b.jumlah, 0)
  // Bagian tunai dibulatkan ke Rp 500 (KONTRAK 11 butir 155). Sisa di bawah Rp 250 menjadi 0 dan ditolak bagiBayar,
  // jadi pembulatannya tidak ditampilkan.
  const tunaiBulat = sisaTunaiBulat(t.total, nonTunai, masukanBayar.some((b) => b.tunai))
  const sisaTunai = tunaiBulat.bulat
  const pembulatan = tunaiBulat.bulat > 0 ? tunaiBulat.pembulatan : 0
  const totalBayar = t.total + pembulatan
  const jumlahItem = keranjang.reduce((a, b) => a + b.qty, 0)

  const kata = cari.trim().toLowerCase()
  const tampil = ubin.filter((u) => (kategori === 'semua' || u.kelompok === kategori) && u.name.toLowerCase().includes(kata))
  const galatMeja = !hasil.ok ? hasil.galat?.meja : undefined

  const tambah = (u: Ubin) =>
    setKeranjang((k) => (k.some((b) => b.kunci === u.kunci) ? k.map((b) => (b.kunci === u.kunci ? { ...b, qty: Math.min(999, b.qty + 1) } : b)) : [...k, { kunci: u.kunci, jenis: u.jenis, id: u.id, qty: 1, catatan: '' }]))
  const ubahQty = (kunci: string, d: number) => setKeranjang((k) => k.map((b) => (b.kunci === kunci ? { ...b, qty: Math.min(999, b.qty + d) } : b)).filter((b) => b.qty > 0))
  const ubahCatatan = (kunci: string, v: string) => setKeranjang((k) => k.map((b) => (b.kunci === kunci ? { ...b, catatan: v } : b)))
  const ubahBayar = (kunci: number, ubah: Partial<Bayar>) => setBayar((s) => s.map((b) => (b.kunci === kunci ? { ...b, ...ubah } : b)))
  const kosongkan = () => {
    setKeranjang([])
    setMeja('')
    setMember(null)
    setWa('')
    setPesanMember('')
    setBayar([{ kunci: Date.now(), metodeId: (tunai ?? metode[0])?.id ?? 0, jumlah: '' }])
  }
  const cariWa = () =>
    mulaiCari(async () => {
      const r = await cariMember(wa)
      if (r.ok) {
        setMember(r.member)
        setPesanMember('')
      } else {
        setMember(null)
        setPesanMember(r.pesan)
      }
    })

  // Pilihan cepat uang tunai: uang pas, kelipatan 50 ribu dan 100 ribu berikutnya.
  const cepat = [...new Set([sisaTunai, Math.ceil(sisaTunai / 50000) * 50000, Math.ceil(sisaTunai / 100000) * 100000])].filter((n) => n >= sisaTunai && n > 0)
  const data = JSON.stringify({
    mode,
    meja: mode === 'dinein' ? meja.trim() : '',
    memberId: member?.id ?? null,
    baris: keranjang.map((b) => (b.jenis === 'paket' ? { menuSetId: b.id, qty: b.qty, catatan: b.catatan } : { menuItemId: b.id, qty: b.qty, catatan: b.catatan })),
    bayar: masukanBayar.map((b) => ({ metodeId: b.metodeId, jumlah: b.jumlah })),
    totalLayar: t.total,
    promoLayar: t.promo?.id ?? null,
  })

  return (
    <>
      <div className="layar-kasir">
        <section className="lk-menu" aria-label="Pilih menu">
          <div className="lk-alat">
            <div className="pil" role="group" aria-label="Mode penjualan">
              <button type="button" className={mode === 'dinein' ? 'aktif' : ''} aria-pressed={mode === 'dinein'} onClick={() => setMode('dinein')}>
                Dine in
              </button>
              <button type="button" className={mode === 'takeaway' ? 'aktif' : ''} aria-pressed={mode === 'takeaway'} onClick={() => setMode('takeaway')}>
                Take away
              </button>
            </div>
            {mode === 'dinein' ? (
              <label className={`lk-meja${galatMeja ? ' salah' : ''}`}>
                <span>Meja</span>
                <input id="k-meja" value={meja} onChange={(e) => setMeja(e.target.value)} maxLength={10} inputMode="text" placeholder="No." aria-invalid={galatMeja ? true : undefined} />
              </label>
            ) : null}
            <label className="lk-cari">
              <span className="sr">Cari menu</span>
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari menu" />
            </label>
          </div>
          <div className="pil gulir" role="group" aria-label="Kategori menu">
            {[{ code: 'semua', name: 'Semua' }, ...(paket.length ? [{ code: KELOMPOK_PAKET, name: 'Paket set' }] : []), ...daftarKategori].map((k) => (
              <button key={k.code} type="button" className={kategori === k.code ? 'aktif' : ''} aria-pressed={kategori === k.code} onClick={() => setKategori(k.code)}>
                {k.name}
              </button>
            ))}
          </div>
          {tampil.length ? (
            <ul className="lk-ubin">
              {tampil.map((m) => {
                const n = keranjang.find((b) => b.kunci === m.kunci)?.qty ?? 0
                return (
                  <li key={m.kunci}>
                    <button type="button" className={m.jenis === 'paket' ? 'paket' : undefined} onClick={() => tambah(m)} aria-label={`Tambah ${m.name}${m.jenis === 'paket' ? ` ${m.sub}` : ''}, ${rupiah(m.price)}${n ? `, sudah ${n}` : ''}`}>
                      <b>{m.name}</b>
                      <small>{m.sub}</small>
                      <span className="lk-harga">
                        {rupiah(m.price)}
                        {m.normal && m.normal > m.price ? <s>{rupiah(m.normal)}</s> : null}
                      </span>
                      {n ? (
                        <span className="lk-jumlah" aria-hidden="true">
                          {n}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="kosong">{ubin.length ? 'Tidak ada menu yang cocok.' : 'Belum ada menu aktif. Minta Owner atau Admin mengisi menu.'}</p>
          )}
        </section>

        <aside className="lk-keranjang kartu" id="keranjang" aria-labelledby="j-pesanan" tabIndex={-1} ref={panel}>
          <h2 id="j-pesanan">Pesanan {mode === 'dinein' ? (meja.trim() ? `meja ${meja.trim()}` : 'dine in') : 'take away'}</h2>
          <form action={kirim} className="form" noValidate>
            <PesanHasil hasil={hasil} />
            {galatMeja ? <p className="galat-kolom kecil">{galatMeja}</p> : null}
            {keranjang.length ? (
              <ul className="lk-baris">
                {keranjang.map((b) => {
                  const m = perKunci.get(b.kunci)
                  return (
                    <li key={b.kunci}>
                      <div className="lk-baris-atas">
                        <b>{m?.name ?? 'Menu tidak aktif'}</b>
                        <span>{rupiah((m?.price ?? 0) * b.qty)}</span>
                      </div>
                      {m && !kenaPotonganMember(b.jenis) ? (
                        <small className="lk-baris-ket">
                          {m.sub}
                          {t.discPromo ? ', tanpa potongan promo' : member?.persen ? ', tanpa potongan member' : ''}
                        </small>
                      ) : null}
                      <div className="lk-baris-bawah">
                        <span className="langkah">
                          <button type="button" onClick={() => ubahQty(b.kunci, -1)} aria-label={`Kurangi ${m?.name}`}>
                            −
                          </button>
                          <output aria-label={`Jumlah ${m?.name}`}>{b.qty}</output>
                          <button type="button" onClick={() => ubahQty(b.kunci, 1)} aria-label={`Tambah ${m?.name}`}>
                            +
                          </button>
                        </span>
                        <input className="lk-catatan" value={b.catatan} onChange={(e) => ubahCatatan(b.kunci, e.target.value)} maxLength={80} placeholder="Catatan" aria-label={`Catatan ${m?.name}`} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="redup">Belum ada item. Ketuk menu untuk menambah.</p>
            )}
            {t.hadiah ? (
              <p className="lk-hadiah">
                <b>Hadiah: {t.hadiah.nama}</b>
                <span>gratis</span>
              </p>
            ) : null}
            {promo.length ? (
              <div className="lk-promo" aria-live="polite">
                {t.promo ? (
                  <p>
                    <b>{labelPromo(t.promo)}</b> dipakai otomatis{t.promo.syarat ? `. Syarat: ${t.promo.syarat}` : ''}.
                  </p>
                ) : (
                  <p>
                    Promo hari ini:{' '}
                    {promo
                      .map((x) => `${labelPromo(x)}${x.minBelanja ? ` (belanja min ${rupiah(x.minBelanja)})` : ''}`)
                      .join(', ')}
                    .
                  </p>
                )}
                {t.alasan ? <p className="redup">{t.alasan}</p> : null}
              </div>
            ) : null}

            <div className="lk-member">
              {member ? (
                <p className="lk-member-pilih">
                  <span>
                    <b>{member.name}</b>
                    <small>
                      {member.tingkat || 'Member'}, potongan {member.persen.toLocaleString('id-ID')}%
                    </small>
                  </span>
                  <button type="button" className="btn kecil sekunder" onClick={() => setMember(null)}>
                    Lepas
                  </button>
                </p>
              ) : (
                <div className="lk-baris-cari">
                  <label htmlFor="k-wa" className="sr">
                    Nomor WhatsApp member
                  </label>
                  <input
                    id="k-wa"
                    type="tel"
                    inputMode="tel"
                    value={wa}
                    onChange={(e) => setWa(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        cariWa()
                      }
                    }}
                    placeholder="WhatsApp member (opsional)"
                    maxLength={30}
                  />
                  <button type="button" className="btn kecil sekunder" disabled={wa.replace(/\D/g, '').length < 5 || mencari} onClick={cariWa}>
                    {mencari ? 'Mencari...' : 'Cari'}
                  </button>
                </div>
              )}
              {pesanMember ? (
                <p className="galat-kolom kecil" role="alert">
                  {pesanMember}
                </p>
              ) : null}
            </div>

            <dl className="lk-jumlah-dl">
              <div>
                <dt>Subtotal</dt>
                <dd>{rupiah(t.sub)}</dd>
              </div>
              {t.discPromo > 0 && t.promo ? (
                <div>
                  <dt>Potongan {labelPromo(t.promo).replace(/^Promo /, 'promo ')}</dt>
                  <dd>-{rupiah(t.discPromo)}</dd>
                </div>
              ) : t.disc > 0 ? (
                <div>
                  <dt>Potongan member {t.pctMember.toLocaleString('id-ID')}%</dt>
                  <dd>-{rupiah(t.disc)}</dd>
                </div>
              ) : null}
              {biaya.service > 0 ? (
                <div>
                  <dt>Service {biaya.service.toLocaleString('id-ID')}%</dt>
                  <dd>{rupiah(t.svc)}</dd>
                </div>
              ) : null}
              {biaya.pajak > 0 ? (
                <div>
                  <dt>Pajak {biaya.pajak.toLocaleString('id-ID')}%</dt>
                  <dd>{rupiah(t.tax)}</dd>
                </div>
              ) : null}
              <div className={pembulatan ? undefined : 'lk-total'}>
                <dt>Total</dt>
                <dd>{rupiah(t.total)}</dd>
              </div>
              {pembulatan ? (
                <>
                  <div>
                    <dt>Pembulatan tunai</dt>
                    <dd>
                      {pembulatan > 0 ? '+' : '-'}
                      {rupiah(Math.abs(pembulatan))}
                    </dd>
                  </div>
                  <div className="lk-total">
                    <dt>Total bayar</dt>
                    <dd>{rupiah(totalBayar)}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            <fieldset className="lk-bayar">
              <legend>Pembayaran</legend>
              {bayar.map((b, i) => {
                const m = metode.find((x) => x.id === b.metodeId)
                return (
                  <div key={b.kunci} className="lk-bayar-baris">
                    <div className="lk-bayar-isi">
                      <label className="sr" htmlFor={`k-metode-${i}`}>
                        Metode bayar {i + 1}
                      </label>
                      <select
                        id={`k-metode-${i}`}
                        value={b.metodeId}
                        onChange={(e) => {
                          const baru = metode.find((x) => x.id === Number(e.target.value))
                          // Non tunai bawaannya sebesar sisa yang belum dibayar.
                          const sisa = Math.max(0, t.total - masukanBayar.filter((x, j) => j !== i && !x.tunai).reduce((a, x) => a + x.jumlah, 0))
                          ubahBayar(b.kunci, { metodeId: Number(e.target.value), jumlah: baru && !baru.tunai && !angka(b.jumlah) ? ribuan(sisa) : b.jumlah })
                        }}
                      >
                        {metode.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <label className="sr" htmlFor={`k-jumlah-${i}`}>
                        {m?.tunai ? 'Uang diterima' : `Jumlah ${m?.name ?? ''}`}
                      </label>
                      <span className="kolom-awalan">
                        <span aria-hidden="true">Rp</span>
                        <input
                          id={`k-jumlah-${i}`}
                          inputMode="numeric"
                          autoComplete="off"
                          value={b.jumlah}
                          maxLength={15}
                          onChange={(e) => ubahBayar(b.kunci, { jumlah: ribuan(angka(e.target.value)) })}
                          placeholder={m?.tunai ? 'Uang diterima' : 'Jumlah'}
                        />
                      </span>
                      {bayar.length > 1 ? (
                        <button type="button" className="lk-hapus" onClick={() => setBayar((s) => s.filter((x) => x.kunci !== b.kunci))} aria-label={`Hapus pembayaran ${m?.name ?? i + 1}`}>
                          ×
                        </button>
                      ) : null}
                    </div>
                    {m?.tunai && cepat.length ? (
                      <div className="lk-cepat">
                        {cepat.map((n) => (
                          <button key={n} type="button" className="btn kecil sekunder" onClick={() => ubahBayar(b.kunci, { jumlah: ribuan(n) })}>
                            {n === sisaTunai ? 'Uang pas' : ribuan(n)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {bayar.length < metode.length ? (
                <button
                  type="button"
                  className="tautan-tombol"
                  onClick={() => {
                    const dipakai = new Set(bayar.map((b) => b.metodeId))
                    const lain = metode.find((m) => !dipakai.has(m.id))
                    if (lain) setBayar((s) => [...s, { kunci: Date.now(), metodeId: lain.id, jumlah: lain.tunai ? '' : ribuan(Math.max(0, t.total - nonTunai)) }])
                  }}
                >
                  + Tambah metode bayar
                </button>
              ) : null}
            </fieldset>

            {bagi ? (
              bagi.ok ? (
                <p className="lk-kembali" role="status">
                  Kembalian <b>{rupiah(bagi.kembalian)}</b>
                </p>
              ) : (
                <p className="redup kecil" role="status">
                  {bagi.pesan}
                </p>
              )
            ) : null}

            <input type="hidden" name="data" value={data} />
            <div className="tombol-baris">
              <TombolKirim kelas="btn lebar lk-tombol-bayar">Bayar {keranjang.length ? rupiah(totalBayar) : ''}</TombolKirim>
              {keranjang.length ? (
                <button type="button" className="tautan-tombol" onClick={kosongkan}>
                  Kosongkan pesanan
                </button>
              ) : null}
            </div>
          </form>
        </aside>
      </div>
      {keranjang.length && !panelTampak ? (
        <div className="lk-bar-hp">
          <span>
            {jumlahItem} item · <b>{rupiah(totalBayar)}</b>
          </span>
          <a href="#keranjang" className="btn kecil">
            Ke pembayaran
          </a>
        </div>
      ) : null}
    </>
  )
}
