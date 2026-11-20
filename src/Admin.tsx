import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { BEANS, type Level } from './data'
import {
  CATS, FOOD_CATS, ROLE_NAME, can, currentUser, discountOf, findMember, fmt, imgSrc, nextTier, readPhoto, reset, slug, tierOf, update, useStore,
  type Action, type EarlySet, type History as Hist, type Info, type Item, type Mat, type Member, type Role, type Store, type Tier, type User,
} from './store'
import { A, Ask, Bare, ICON, Rp, Sel, Title, Toggle, Txt, day, uid, useA, when, type Ctx } from './admin/kit'
import { catat } from './admin/aksi'
import { dayKey } from './admin/hitung'
import { rp } from './admin/umum'
import KasirPage from './admin/Kasir'
import LaporanPage from './admin/Laporan'
import PembelianPage from './admin/Pembelian'
import ResepPage from './admin/Resep'
import ShiftPage from './admin/Shift'
import StokPage from './admin/Stok'
import TransaksiPage from './admin/Transaksi'
import './admin.css'

// Admin: ringkasan, produk, harga massal, promo, member, lokasi dan jam, pengaturan.
// Semua data lewat store.ts. Menu dan rute disaring menurut role akun yang masuk.
const FULL = 'Penyimpanan browser penuh, jadi perubahan terakhir belum tersimpan. Hapus foto yang tidak dipakai atau ganti dengan yang lebih kecil, lalu coba lagi.'
const CAT = Object.fromEntries(CATS)
const FILTERS: [string, string[]][] = [
  ['Semua', []], ['Kopi', ['espresso', 'filter', 'cloud']], ['Non-coffee', ['noncoffee', 'tea', 'refresh']],
  ['RTD', ['rtd']], ['Makanan', ['main']], ['Snack dan dessert', ['snack', 'dessert']],
]
const LEVELS: [Level, string][] = [['A', 'Paling rendah'], ['B', 'Rendah'], ['C', 'Sedang'], ['D', 'Lebih tinggi']]
const MATS: [Mat, string][] = [['steel', 'Baja'], ['concrete', 'Beton'], ['ply', 'Plywood'], ['green', 'Kotak hijau']]
const PHOTO_TYPES = 'image/png,image/webp,image/jpeg'



// Menu dikelompokkan: [ikon, nama, rute, hak akses yang dibutuhkan]. Rute '' = Ringkasan, terbuka untuk semua role.
type NavItem = [keyof typeof ICON, string, string, Action | null]
const GROUPS: [string, NavItem[]][] = [
  ['Kasir', [['till', 'Kasir', 'kasir', 'kasir'], ['receipt', 'Transaksi', 'transaksi', 'transaksi.lihat'], ['clock', 'Shift', 'shift', 'shift']]],
  ['Back office', [
    ['home', 'Ringkasan', '', null], ['box', 'Produk', 'produk', 'produk.edit'], ['tag', 'Harga massal', 'harga', 'harga.massal'],
    ['grid', 'Promo', 'promo', 'promo'], ['people', 'Member', 'member', 'member.catat'], ['layers', 'Stok', 'stok', 'stok.lihat'],
    ['book', 'Resep', 'resep', 'resep'], ['truck', 'Pembelian', 'pembelian', 'pembelian'], ['chart', 'Laporan', 'laporan', 'laporan'],
  ]],
  ['Sistem', [['store', 'Lokasi dan jam', 'lokasi', 'info'], ['gear', 'Pengaturan', 'pengaturan', 'pengaturan']]],
]
const NAV = GROUPS.flatMap(g => g[1])
const NEED: Record<string, Action> = { ...Object.fromEntries(NAV.filter(n => n[3]).map(n => [n[2], n[3] as Action])), edit: 'produk.edit', baru: 'produk.tambah' }

const Token = ({ l, s = 24 }: { l: Level; s?: number }) => <i className={`token ${l}`} style={{ ['--t' as string]: `${s}px` }}>{l}</i>
const Thumb = ({ img, mat, cover }: { img?: string; mat: Mat; cover: boolean }) => !img ? <div className="thumb none" />
  : <div className={`thumb slot ${mat}${cover ? ' cover' : ''}`}><img src={imgSrc(img)} alt="" /></div>
const PhotoPick = ({ onPick, label = 'Ganti foto' }: { onPick: (f: File) => void; label?: string }) => (
  <label className="mini file">{ICON.upload}{label}
    <input type="file" accept={PHOTO_TYPES} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} /></label>
)

/* ---------- Masuk ---------- */
function Login({ st, commit, warn }: { st: Store; commit: Ctx['commit']; warn: string }) {
  const users = st.users.filter(u => u.on)
  return (
    <div className="adm login">
      <div className="tex noise" />
      <div className="card login-card">
        <a className="logo" href="#/"><i />greenbox</a>
        <h1 className="disp fx">Masuk admin</h1>
        <p className="mut">Pilih akun yang mau dipakai. Ini versi demo tanpa kata sandi, jadi siapa pun yang membuka halaman ini bisa memilih akun.</p>
        {warn && <p className="warn" role="alert">{warn}</p>}
        <ul className="accs" aria-label="Akun aktif">{users.map(u => (
          <li key={u.id}><button type="button" aria-label={`Masuk sebagai ${u.name}, ${ROLE_NAME[u.role]}`} onClick={() => commit(s => ({ ...s, session: u.id }))}>
            <span className="av">{u.name.slice(0, 1).toUpperCase()}</span>
            <span className="who"><b>{u.name}</b><small>{ROLE_NAME[u.role]}</small></span>
            <span className="go" aria-hidden="true">Masuk</span>
          </button></li>
        ))}</ul>
        {!users.length && <p className="mut">Tidak ada akun aktif.</p>}
        <a className="mut aback" href="#/">Kembali ke website</a>
      </div>
    </div>
  )
}

/* ---------- Ringkasan ---------- */
function Ringkasan() {
  const { st, me, commit, ok } = useA()
  const on = st.items.filter(i => i.on).length
  const disc = st.members.filter(m => m.discount).length
  const promoOn = (st.promo.earlyOn ? 1 : 0) + (st.promo.dailyOn ? 1 : 0)
  const promoNames = [st.promo.earlyOn && 'Early set', st.promo.dailyOn && 'Daily step'].filter(Boolean).join(', ')
  const stats = [
    ['Produk tayang', `${on}/${st.items.length}`, on === st.items.length ? 'Semua tayang' : `${st.items.length - on} habis`],
    ['Member', st.members.length, ''], ['Potongan aktif', disc, `dari ${st.members.length} member`], ['Promo aktif', promoOn, promoNames || 'Tidak ada'],
  ]
  const todaySales = st.sales.filter(x => x.status === 'ok' && dayKey(x.at) === dayKey(Date.now()))
  const low = st.ings.filter(i => i.stock <= i.min)
  const ops: [string, string | number, string][] = [
    ['Penjualan hari ini', rp(todaySales.reduce((a, x) => a + x.total, 0)), 'total yang diterima'], ['Transaksi hari ini', todaySales.length, ''],
    ['Bahan menipis', low.length, low.length ? low.slice(0, 2).map(i => i.name).join(', ') + (low.length > 2 ? ` +${low.length - 2}` : '') : 'Semua aman'],
  ]
  const hist = [...st.history].reverse().slice(0, 6)
  const recent = [...st.members].sort((a, b) => b.joined - a.joined).slice(0, 5)
  const undo = (h: Hist) => commit(s => ({
    ...s,
    items: s.items.map(i => i.id in h.prices ? { ...i, price: h.prices[i.id] } : i),
    history: [...s.history, { at: Date.now(), by: me.name, label: `Kembalikan: ${h.label}`, prices: Object.fromEntries(s.items.filter(i => i.id in h.prices).map(i => [i.id, i.price])) }],
  }))
  const short: [string, string, string, Action][] = [
    ['#/admin/kasir', 'Kasir', 'Buat pesanan dan terima bayar', 'kasir'], ['#/admin/laporan', 'Laporan', 'Penjualan, HPP, dan laba kotor', 'laporan'],
    ['#/admin/baru', 'Tambah produk', 'Menu baru lengkap dengan foto', 'produk.tambah'], ['#/admin/produk', 'Atur produk', 'Harga dan status tayang', 'produk.edit'],
    ['#/admin/harga', 'Harga massal', 'Naik atau turun satu kategori', 'harga.massal'], ['#/admin/promo', 'Promo', 'Early set dan Daily step', 'promo'],
    ['#/admin/member', 'Member', 'Catat kunjungan, atur potongan', 'member.catat'], ['#/admin/lokasi', 'Lokasi dan jam', 'Alamat, jam buka, tautan', 'info'],
  ]
  return (<>
    <Title t="Ringkasan" sub={`Halo, ${me.name}. Ini keadaan Greenbox sekarang.`} />
    {ok('transaksi.lihat') && <div className="stats ops">{ops.map(([a, b, c]) => <div key={a} className="card stat"><p>{a}</p><b>{b}</b><small>{c}</small></div>)}</div>}
    <div className="stats">{stats.map(([a, b, c]) => <div key={a} className="card stat"><p>{a}</p><b>{b}</b><small>{c}</small></div>)}</div>
    <div className="duo">
      <section className="card apanel" aria-labelledby="h-hist">
        <h2 id="h-hist" className="aph">Perubahan harga terakhir</h2>
        {!hist.length ? <p className="empty">Belum ada perubahan harga massal.</p> : (
          <ul className="lst">{hist.map(h => (
            <li key={h.at}>
              <div className="grow"><b>{h.label}</b><small>{when(h.at)} oleh {h.by}, {Object.keys(h.prices).length} produk</small></div>
              {ok('harga.massal') && <button type="button" className="mini" onClick={() => undo(h)} aria-label={`Kembalikan harga: ${h.label}`}>Kembalikan</button>}
            </li>
          ))}</ul>
        )}
      </section>
      <section className="card apanel" aria-labelledby="h-mem">
        <h2 id="h-mem" className="aph">Member terbaru</h2>
        {!recent.length ? <p className="empty">Belum ada member.</p> : (
          <ul className="lst">{recent.map(m => (
            <li key={m.id}><div className="grow"><b>{m.name}</b><small>Gabung {day(m.joined)}</small></div><span className={`mtier m${tierIdx(st.tiers, m)}`}>{tierOf(m, st.tiers).name}</span></li>
          ))}</ul>
        )}
      </section>
    </div>
    <h2 className="aph sec">Pintasan</h2>
    <div className="short">{short.filter(s => ok(s[3])).map(([href, t, d]) => <a key={href} className="card" href={href}><b>{t}</b><small>{d}</small></a>)}</div>
  </>)
}
const tierIdx = (tiers: Tier[], m: Member) => Math.min(3, [...tiers].sort((a, b) => a.min - b.min).findIndex(t => t.id === tierOf(m, tiers).id))

/* ---------- Produk ---------- */
function Produk() {
  const { st, commit, ok } = useA()
  const items = st.items
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const patch = (id: string, p: Partial<Item>) => commit(s => ({ ...s, items: s.items.map(i => i.id === id ? { ...i, ...p } : i) }))
  const inTab = (i: Item, t: number) => !FILTERS[t][1].length || FILTERS[t][1].includes(i.cat)
  const rows = items.filter(i => inTab(i, tab) && i.name.toLowerCase().includes(q.trim().toLowerCase()))
  const n = items.length
  const off = items.filter(i => !i.on).length
  const lab = items.filter(i => i.level || i.kcal).length
  const foto = items.filter(i => i.img).length
  const stats = [
    ['Total produk', n, ''], ['Tayang', n - off, off ? `${off} habis hari ini` : ''],
    ['Label nutrisi', `${lab}/${n}`, lab === n ? 'Lengkap' : `${n - lab} belum`], ['Punya foto', `${foto}/${n}`, foto === n ? 'Lengkap' : `${n - foto} belum`],
  ]
  return (<>
    <Title t="Produk" sub="Ubah harga dan status langsung di tabel. Perubahan tampil di website setelah disimpan."
      right={ok('produk.tambah') ? <a className="btn btn-green" href="#/admin/baru">{ICON.plus}Tambah produk</a> : undefined} />
    <div className="stats">{stats.map(([a, b, c]) => <div key={a} className="card stat"><p>{a}</p><b>{b}</b><small>{c}</small></div>)}</div>
    <div className="a-bar">
      <div className="pills">{FILTERS.map(([t], i) => (
        <button key={t} type="button" className={i === tab ? 'on' : ''} aria-pressed={i === tab} onClick={() => setTab(i)}>{t} {items.filter(it => inTab(it, i)).length}</button>
      ))}</div>
      <label className="inp find">{ICON.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk" aria-label="Cari produk" /></label>
    </div>
    <div className="card tbl"><table>
      <thead><tr><th>Foto</th><th>Nama</th><th>Kategori</th><th>Label</th><th>Harga</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(it => (
        <tr key={it.id} className={it.on ? '' : 'off'}>
          <td className="c-foto"><Thumb img={it.img} mat={it.mat} cover={FOOD_CATS.includes(it.cat)} /></td>
          <td className="c-nama">{it.name}</td>
          <td className="mut">{CAT[it.cat]}</td>
          <td>{it.level ? <span className="lab"><Token l={it.level} />Level {it.level}</span> : it.kcal ? <span className="lab mut">{it.kcal} kcal</span> : null}</td>
          <td><Rp v={it.price} set={price => patch(it.id, { price })} label={`Harga ${it.name}`} cls="sm" /></td>
          <td><span className="st"><Toggle on={it.on} set={on => patch(it.id, { on })} label={`${it.name} tayang`} />{it.on ? 'Tayang' : 'Habis'}</span></td>
          <td className="c-edit"><a href={`#/admin/edit/${it.id}`} aria-label={`Edit ${it.name}`}>Edit</a></td>
        </tr>
      ))}</tbody>
    </table>{!rows.length && <p className="empty">Tidak ada produk yang cocok.</p>}</div>
  </>)
}

function Edit({ item }: { item?: Item }) {
  const { commit, ok } = useA()
  const [d, setD] = useState<Item>(item ?? { id: '', name: '', cat: 'espresso', price: 0, line: '', mat: 'steel', on: true, fav: false, level: 'A', serve: 'hot' })
  const [err, setErr] = useState('')
  const set = (p: Partial<Item>) => setD(o => ({ ...o, ...p }))
  const food = FOOD_CATS.includes(d.cat)
  const title = item ? 'Edit produk' : 'Tambah produk'
  const hot = !food && d.serve !== 'ice'
  const ice = !food && d.serve !== 'hot'
  // Panas dan dingin bisa dua-duanya, tapi minimal satu harus tetap terpilih.
  const serve = (k: 'hot' | 'ice') => {
    const h = k === 'hot' ? !hot : hot, c = k === 'ice' ? !ice : ice
    if (h || c) set({ serve: h && c ? 'both' : h ? 'hot' : 'ice' })
  }
  const bean = (c: string) => set({ beans: d.beans?.includes(c) ? d.beans.replace(c, '') : (d.beans ?? '') + c })
  const pick = (f: File) => readPhoto(f).then(img => { setErr(''); set({ img }) }, () => setErr('Foto ini tidak bisa dibaca. Coba berkas PNG atau WebP lain.'))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const done = food ? { ...d, level: undefined, serve: undefined, beans: undefined } : { ...d, kcal: undefined, desc: undefined, level: d.level ?? 'A', serve: d.serve ?? 'ice' }
    const saved = commit(s => {
      if (done.id) return { ...s, items: s.items.map(i => i.id === done.id ? done : i) }
      let id = slug(done.name) || 'produk'
      while (s.items.some(i => i.id === id)) id += '-2'
      return { ...s, items: [...s.items, { ...done, id }] }
    })
    if (saved) location.hash = '#/admin/produk'
  }
  const remove = () => { if (commit(s => ({ ...s, items: s.items.filter(i => i.id !== d.id), recipes: Object.fromEntries(Object.entries(s.recipes).filter(([k]) => k !== d.id)) }))) location.hash = '#/admin/produk' }
  return (
    <form onSubmit={submit}>
      <p className="crumb"><a href="#/admin/produk">Produk</a> / <b>{d.name || title}</b></p>
      <Title t={title} sub="Isi yang perlu saja. Kolom bertanda bintang wajib." />
      <div className="edit">
        <div className="card form">
          <label className="field s2"><span>Nama *</span><span className="inp"><input required value={d.name} onChange={e => set({ name: e.target.value })} /></span></label>
          <label className="field"><span>Kategori *</span><span className="inp sel"><select value={d.cat} onChange={e => set({ cat: e.target.value })}>{CATS.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>{ICON.down}</span></label>
          <label className="field s3"><span>Satu kalimat di kartu</span><span className="inp"><input maxLength={60} value={d.line} onChange={e => set({ line: e.target.value })} /><small>{d.line.length}/60</small></span></label>
          {food && <label className="field s3"><span>Deskripsi (tampil di menu makanan)</span><span className="inp area"><textarea rows={2} maxLength={160} value={d.desc ?? ''} onChange={e => set({ desc: e.target.value })} /></span></label>}
          <div className="field"><span>Harga *</span><Rp v={d.price} set={price => set({ price })} label="Harga" cls="bold" required /></div>
          <label className="field"><span>Kalori</span><span className="inp"><input disabled={!food} placeholder="Khusus makanan" value={food ? d.kcal ?? '' : ''} onChange={e => set({ kcal: e.target.value })} /></span></label>
          <div className="field"><span>Penyajian</span><div className={`well serve${food ? ' dim' : ''}`}>
            <button type="button" disabled={food} aria-pressed={hot} onClick={() => serve('hot')}>{ICON.hot}Panas</button>
            <button type="button" disabled={food} aria-pressed={ice} onClick={() => serve('ice')}>{ICON.ice}Dingin</button>
          </div></div>
          <div className="field s3"><span>Nutrition level *</span><div className={`well lvl${food ? ' dim' : ''}`}>{LEVELS.map(([l, t]) => (
            <button key={l} type="button" disabled={food} aria-pressed={!food && d.level === l} onClick={() => set({ level: l })}><Token l={l} s={22} />{t}</button>
          ))}</div></div>
          <div className="field s3"><span>Biji kopi</span><div className="beanrow">
            {Object.entries(BEANS).map(([c, [n, color]]) => (
              <button key={c} type="button" disabled={food} aria-pressed={!food && !!d.beans?.includes(c)} onClick={() => bean(c)}><i style={{ background: color }} />{n}</button>
            ))}
            {(food || !d.beans) && <small>Tidak dipakai di {CAT[d.cat]}</small>}
          </div></div>
          <div className="s3 togs">
            <span><Toggle on={d.on} set={on => set({ on })} label="Tayang di website" />Tayang di website</span>
            <span><Toggle on={d.fav} set={fav => set({ fav })} label={'Masuk "Yang sering dipesan"'} />Masuk "Yang sering dipesan"</span>
          </div>
        </div>
        <div className="card fotocard">
          <div className="field"><span>Foto produk</span></div>
          <div className={`slot ${d.mat}${food ? ' food' : ''} big`}>
            {d.img && food && <img src={imgSrc(d.img)} alt={d.name} />}<i className="shade" />{d.img && !food && <img className="drink" src={imgSrc(d.img)} alt={d.name} />}
          </div>
          <label className="upl">{ICON.upload}<span><b>Ganti foto</b><br />PNG tanpa latar</span>
            <input type="file" accept="image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} /></label>
          {err && <p className="warn" role="alert">{err}</p>}
          <div className="field mat"><span>Material kotak</span></div>
          <div className="mats">{MATS.map(([m, n]) => (
            <button key={m} type="button" aria-pressed={d.mat === m} onClick={() => set({ mat: m })}><span className={`slot ${m}`}><i className="shade" /></span>{n}</button>
          ))}</div>
        </div>
      </div>
      <div className="a-act">
        {item && ok('produk.hapus') && <div className="push"><Ask label="Hapus produk" ask={`Hapus ${item.name} dari menu? Ini tidak bisa dibatalkan.`} yes={remove} cls="btn btn-line" /></div>}
        <a className="btn btn-line" href="#/admin/produk">Batal</a><button className="btn btn-green">{ICON.check}Simpan perubahan</button>
      </div>
    </form>
  )
}

/* ---------- Harga massal ---------- */
function Massal() {
  const { st, me, commit } = useA()
  const items = st.items
  const [cat, setCat] = useState('espresso')
  const [naik, setNaik] = useState(true)
  const [persen, setPersen] = useState(false)
  const [val, setVal] = useState(2000)
  const [round, setRound] = useState(500)
  const next = (old: number) => {
    const x = old + (naik ? 1 : -1) * (persen ? old * val / 100 : val)
    return Math.max(0, round ? Math.round(x / round) * round : Math.round(x))
  }
  const rows = items.filter(i => i.cat === cat).map(i => ({ ...i, baru: next(i.price) }))
  const changed = rows.filter(r => r.baru !== r.price)
  const apply = () => {
    const prices = Object.fromEntries(changed.map(r => [r.id, r.baru]))
    const label = `${CAT[cat]} ${naik ? 'naik' : 'turun'} ${persen ? `${val}%` : `Rp ${fmt(val)}`}`
    const saved = commit(s => ({
      ...s,
      items: s.items.map(i => i.id in prices ? { ...i, price: prices[i.id] } : i),
      history: [...s.history, { at: Date.now(), by: me.name, label, prices: Object.fromEntries(s.items.filter(i => i.id in prices).map(i => [i.id, i.price])) }],
    }))
    if (saved) setVal(0)
  }
  const opt = (on: boolean, set: () => void, label: ReactNode) => <button type="button" className="opt" aria-pressed={on} onClick={set}>{label}</button>
  return (<>
    <Title t="Harga massal" sub="Naikkan atau turunkan harga satu kategori sekaligus. Cek dulu daftarnya sebelum diterapkan." />
    <div className="massal">
      <div className="card ctrl">
        <div className="field"><span>1. Kategori</span><div className="cats">{CATS.map(([id, t]) => (
          <button key={id} type="button" aria-pressed={cat === id} onClick={() => setCat(id)}>{cat === id && ICON.check}{t}</button>
        ))}</div></div>
        <div className="field"><span>2. Perubahan</span><div className="opts">
          {opt(naik, () => setNaik(true), <>{ICON.up}Naik</>)}{opt(!naik, () => setNaik(false), 'Turun')}
          {opt(!persen, () => { setPersen(false); setVal(2000) }, 'Rupiah')}{opt(persen, () => { setPersen(true); setVal(5) }, 'Persen')}
        </div></div>
        <div className="field"><span>3. Nilai</span><Rp v={val} set={setVal} label="Nilai perubahan" cls="xl" unit={persen ? '%' : 'Rp'} /></div>
        <label className="field"><span>Pembulatan</span><span className="inp sel"><select value={round} onChange={e => setRound(+e.target.value)}>
          <option value={0}>Tanpa pembulatan</option><option value={500}>Ke Rp 500 terdekat</option><option value={1000}>Ke Rp 1.000 terdekat</option>
        </select>{ICON.arrowDown}</span></label>
        <p className="info" role="status">{changed.length} produk berubah. Harga lama disimpan di riwayat dan bisa dikembalikan.</p>
        <button type="button" className="btn btn-green" disabled={!changed.length} onClick={apply}>{ICON.check}Terapkan harga baru</button>
      </div>
      <div className="card tbl prev">
        <div className="prev-h"><b>Pratinjau · {CAT[cat]}</b><span>{rows.length} produk</span></div>
        <table>
          <thead><tr><th>Produk</th><th>Harga lama</th><th>Harga baru</th><th>Selisih</th></tr></thead>
          <tbody>{rows.map(r => {
            const diff = r.baru - r.price
            return (<tr key={r.id}><td className="c-nama">{r.name}</td><td className="mut">Rp {fmt(r.price)}</td><td className="new">Rp {fmt(r.baru)}</td>
              <td>{diff !== 0 && <span className={`diff${diff < 0 ? ' min' : ''}`}>{diff > 0 ? '+' : '-'} Rp {fmt(Math.abs(diff))}</span>}</td></tr>)
          })}</tbody>
        </table>
      </div>
    </div>
  </>)
}

/* ---------- Promo ---------- */
function Promo() {
  const { st, commit } = useA()
  const p = st.promo
  const [err, setErr] = useState('')
  const setP = (x: Partial<typeof p>) => commit(s => ({ ...s, promo: { ...s.promo, ...x } }))
  const setSet = (id: string, x: Partial<EarlySet>) => setP({ sets: p.sets.map(e => e.id === id ? { ...e, ...x } : e) })
  const add = () => setP({ sets: [...p.sets, { id: uid('s'), img: '', name: 'Set baru', pair: '', old: 0, price: 0, on: false }] })
  const pick = (id: string, f: File) => readPhoto(f).then(img => { setErr(''); setSet(id, { img }) }, () => setErr('Foto ini tidak bisa dibaca. Coba berkas gambar lain.'))
  return (<>
    <Title t="Promo" sub="Early set dan Daily step. Perubahan langsung tampil di website." />
    <section className="card apanel stack" aria-labelledby="h-early">
      <div className="aph-row">
        <div><h2 id="h-early" className="aph">Early set</h2><p className="mut">Paket makanan dan minuman dengan harga set.</p></div>
        <span className="tl"><Toggle on={p.earlyOn} set={earlyOn => setP({ earlyOn })} label="Early set aktif" />{p.earlyOn ? 'Aktif' : 'Mati'}</span>
      </div>
      {err && <p className="warn" role="alert">{err}</p>}
      <ul className="sets">{p.sets.map(e => (
        <li key={e.id} className={`setrow${e.on ? '' : ' offrow'}`}>
          <Thumb img={e.img} mat="steel" cover />
          <Txt label="Nama set" v={e.name} set={name => setSet(e.id, { name })} />
          <Txt label="Pasangan minuman" v={e.pair} set={pair => setSet(e.id, { pair })} />
          <div className="field"><span>Harga lama</span><Rp v={e.old} set={old => setSet(e.id, { old })} label={`Harga lama ${e.name}`} /></div>
          <div className="field"><span>Harga set</span><Rp v={e.price} set={price => setSet(e.id, { price })} label={`Harga set ${e.name}`} cls="bold" /></div>
          <div className="setact">
            <span className="tl"><Toggle on={e.on} set={on => setSet(e.id, { on })} label={`${e.name} aktif`} />{e.on ? 'Tayang' : 'Disembunyikan'}</span>
            <PhotoPick onPick={f => pick(e.id, f)} />
            <Ask label="Hapus set" ask={`Hapus ${e.name}?`} yes={() => setP({ sets: p.sets.filter(x => x.id !== e.id) })} />
          </div>
        </li>
      ))}</ul>
      {!p.sets.length && <p className="empty">Belum ada set.</p>}
      <button type="button" className="btn btn-line" onClick={add}>{ICON.plus}Tambah set</button>
    </section>
    <section className="card apanel stack" aria-labelledby="h-daily">
      <div className="aph-row">
        <div><h2 id="h-daily" className="aph">Daily step</h2><p className="mut">Hadiah kalau pengunjung mencapai target langkah hari itu.</p></div>
        <span className="tl"><Toggle on={p.dailyOn} set={dailyOn => setP({ dailyOn })} label="Daily step aktif" />{p.dailyOn ? 'Aktif' : 'Mati'}</span>
      </div>
      <div className="fgrid">
        <div className="field"><span>Target langkah</span><Rp v={p.dailySteps} set={dailySteps => setP({ dailySteps })} label="Target langkah" unit="Langkah" cls="bold" /></div>
        <Txt label="Hadiah" v={p.dailyGift} set={dailyGift => setP({ dailyGift })} />
      </div>
    </section>
  </>)
}

/* ---------- Member ---------- */
function MemberForm({ member, done }: { member?: Member; done?: () => void }) {
  const { st, commit } = useA()
  const [name, setName] = useState(member?.name ?? '')
  const [wa, setWa] = useState(member?.wa ?? '')
  const [note, setNote] = useState(member?.note ?? '')
  const [visits, setVisits] = useState(member?.visits ?? 0)
  const [err, setErr] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const num = wa.trim()
    if (num.replace(/\D/g, '').length < 9) return setErr('Nomor WhatsApp terlalu pendek. Isi lengkap dengan kode area atau 08.')
    const dup = findMember(st, num)
    if (dup && dup.id !== member?.id) return setErr(`Nomor ini sudah terdaftar atas nama ${dup.name}.`)
    setErr('')
    const ok = member
      ? commit(s => ({ ...s, members: s.members.map(m => m.id === member.id ? { ...m, name: name.trim(), wa: num, note: note.trim(), visits } : m) }))
      : commit(s => ({ ...s, members: [...s.members, { id: uid('m'), name: name.trim(), wa: num, visits: 0, discount: true, joined: Date.now(), note: note.trim() }] }))
    if (!ok) return
    if (member) done?.()
    else { setName(''); setWa(''); setNote('') }
  }
  return (
    <form className="card apanel stack" onSubmit={submit} aria-labelledby="h-mf">
      <h2 id="h-mf" className="aph">{member ? `Edit ${member.name}` : 'Tambah member'}</h2>
      <div className="fgrid g3">
        <Txt label="Nama" v={name} set={setName} required maxLength={60} />
        <Txt label="Nomor WhatsApp" v={wa} set={setWa} required type="tel" placeholder="0812 3456 7890" maxLength={20} />
        {member && <div className="field"><span>Kunjungan</span><Rp v={visits} set={setVisits} label="Jumlah kunjungan" unit="kali" zero /></div>}
        <Txt label="Catatan" v={note} set={setNote} cls={member ? 's3' : ''} maxLength={120} />
      </div>
      {err && <p className="warn" role="alert">{err}</p>}
      <div className="a-act">
        {member && <button type="button" className="btn btn-line" onClick={done}>Batal</button>}
        <button className="btn btn-green">{ICON.check}{member ? 'Simpan perubahan' : 'Tambah member'}</button>
      </div>
    </form>
  )
}

function MemberPage() {
  const { st, commit, ok } = useA()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const patch = (id: string, p: Partial<Member>) => commit(s => ({ ...s, members: s.members.map(m => m.id === id ? { ...m, ...p } : m) }))
  const tiers = st.tiers
  const needle = q.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const rows = st.members.filter(m => !needle || m.name.toLowerCase().includes(needle) || (digits.length > 1 && m.wa.replace(/\D/g, '').includes(digits)))
  const editing = st.members.find(m => m.id === edit)
  const stats: [string, number, string][] = [
    ['Total member', st.members.length, ''], ['Potongan aktif', st.members.filter(m => m.discount).length, `dari ${st.members.length} member`],
    ...[...tiers].sort((a, b) => a.min - b.min).map((t): [string, number, string] => [t.name, st.members.filter(m => tierOf(m, tiers).id === t.id).length, `Potongan ${t.pct}%`]),
  ]
  return (<>
    <Title t="Member" sub="Catat kunjungan di kasir, atur potongan, dan tambah member baru." />
    <div className="stats flow">{stats.map(([a, b, c]) => <div key={a} className="card stat"><p>{a}</p><b>{b}</b><small>{c}</small></div>)}</div>
    <div className="a-bar"><span className="mut">{rows.length} dari {st.members.length} member</span>
      <label className="inp find">{ICON.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau nomor" aria-label="Cari member berdasarkan nama atau nomor" /></label>
    </div>
    <div className="card tbl"><table>
      <thead><tr><th>Nama</th><th>WhatsApp</th><th>Tingkat</th><th>Kunjungan</th><th>Potongan</th><th>Catatan</th><th /></tr></thead>
      <tbody>{rows.map(m => {
        const nt = nextTier(m, tiers)
        return (
          <tr key={m.id}>
            <td className="c-nama">{m.name}</td>
            <td className="nowrap">{m.wa}</td>
            <td><span className={`mtier m${tierIdx(tiers, m)}`}>{tierOf(m, tiers).name}</span></td>
            <td><div className="visit"><span><b>{m.visits}</b>{nt && <small>{nt.min - m.visits} lagi ke {nt.name}</small>}</span>
              <button type="button" className="mini" onClick={() => patch(m.id, { visits: m.visits + 1 })} aria-label={`Catat kunjungan ${m.name}`}>+1</button></div></td>
            <td><span className="st"><Toggle on={m.discount} set={discount => patch(m.id, { discount })} label={`Potongan ${m.name}`} disabled={!ok('member.atur')} />{discountOf(m, tiers)}%</span></td>
            <td className="anote">{m.note || <span className="mut">-</span>}</td>
            <td className="c-edit">{ok('member.atur') && <span className="acts">
              <button type="button" className="lnk" onClick={() => { setEdit(m.id); scrollTo(0, document.body.scrollHeight) }} aria-label={`Edit ${m.name}`}>Edit</button>
              <Ask label="Hapus" ask={`Hapus ${m.name}?`} yes={() => commit(s => ({ ...s, members: s.members.filter(x => x.id !== m.id) }))} />
            </span>}</td>
          </tr>
        )
      })}</tbody>
    </table>{!rows.length && <p className="empty">Tidak ada member yang cocok.</p>}</div>
    {editing ? <MemberForm key={editing.id} member={editing} done={() => setEdit(null)} /> : ok('member.catat') && <MemberForm />}
  </>)
}

/* ---------- Lokasi dan jam ---------- */
function Lokasi() {
  const { st, commit } = useA()
  const [d, setD] = useState<Info>(st.info)
  const [saved, setSaved] = useState(false)
  const [nf, setNf] = useState('')
  const dirty = JSON.stringify(d) !== JSON.stringify(st.info)
  const set = (p: Partial<Info>) => { setD(o => ({ ...o, ...p })); setSaved(false) }
  const addF = () => { const f = nf.trim(); if (f && !d.facilities.includes(f)) set({ facilities: [...d.facilities, f] }); setNf('') }
  const submit = (e: FormEvent) => { e.preventDefault(); if (commit(s => ({ ...s, info: d }))) setSaved(true) }
  return (
    <form onSubmit={submit}>
      <Title t="Lokasi dan jam" sub="Alamat, jam buka, dan tautan yang tampil di website." />
      <section className="card apanel stack" aria-labelledby="h-lok">
        <h2 id="h-lok" className="aph">Alamat dan jam</h2>
        <div className="fgrid">
          <Txt label="Alamat" v={d.address} set={address => set({ address })} cls="full" required />
          <Txt label="Area" v={d.area} set={area => set({ area })} required />
          <div className="fgrid two">
            <Txt label="Jam buka" v={d.open} set={open => set({ open })} placeholder="07.00" maxLength={5} required />
            <Txt label="Jam tutup" v={d.close} set={close => set({ close })} placeholder="22.00" maxLength={5} required />
          </div>
          <Txt label="Tautan peta" v={d.maps} set={maps => set({ maps })} type="url" cls="full" />
        </div>
      </section>
      <section className="card apanel stack" aria-labelledby="h-kon">
        <h2 id="h-kon" className="aph">Kontak dan media sosial</h2>
        <div className="fgrid">
          <Txt label="Nomor WhatsApp (tampilan)" v={d.waNumber} set={waNumber => set({ waNumber })} type="tel" />
          <Txt label="Tautan wa.me" v={d.wa} set={wa => set({ wa })} type="url" />
          <Txt label="Instagram" v={d.instagram} set={instagram => set({ instagram })} type="url" />
          <Txt label="TikTok" v={d.tiktok} set={tiktok => set({ tiktok })} type="url" />
          <Txt label="Threads" v={d.threads} set={threads => set({ threads })} type="url" />
        </div>
      </section>
      <section className="card apanel stack" aria-labelledby="h-fas">
        <h2 id="h-fas" className="aph">Fasilitas</h2>
        <ul className="achips" aria-label="Daftar fasilitas">{d.facilities.map(f => (
          <li key={f} className="achip">{f}<button type="button" onClick={() => set({ facilities: d.facilities.filter(x => x !== f) })} aria-label={`Hapus fasilitas ${f}`}>{ICON.x}</button></li>
        ))}</ul>
        <div className="addrow">
          <Bare label="Fasilitas baru" v={nf} set={setNf} placeholder="Contoh: Colokan di tiap meja" maxLength={40} />
          <button type="button" className="btn btn-line" onClick={addF} disabled={!nf.trim()}>{ICON.plus}Tambah</button>
        </div>
      </section>
      <div className="a-act">{saved && !dirty && <p className="saved" role="status">Tersimpan.</p>}
        <button className="btn btn-green" disabled={!dirty}>{ICON.check}Simpan perubahan</button></div>
    </form>
  )
}

/* ---------- Pengaturan ---------- */
const RIGHTS: [string, Action][] = [
  ['Ubah harga dan status produk', 'produk.edit'], ['Tambah produk', 'produk.tambah'], ['Hapus produk', 'produk.hapus'], ['Harga massal', 'harga.massal'],
  ['Promo', 'promo'], ['Catat kunjungan dan tambah member', 'member.catat'], ['Atur potongan, edit, dan hapus member', 'member.atur'],
  ['Buka shift dan pakai kasir', 'kasir'], ['Lihat transaksi', 'transaksi.lihat'], ['Void transaksi', 'transaksi.void'], ['Lihat stok', 'stok.lihat'], ['Atur stok dan opname', 'stok.atur'],
  ['Resep dan HPP', 'resep'], ['Pembelian dan pemasok', 'pembelian'], ['Laporan dan log aktivitas', 'laporan'],
  ['Lokasi dan jam', 'info'], ['Skema member dan aturan', 'pengaturan'], ['Kelola pengguna', 'pengguna'], ['Reset data demo', 'reset'],
]
const ROLES: Role[] = ['superadmin', 'owner', 'admin']

function Pengaturan() {
  const { st, me, commit, flag, ok } = useA()
  const tiers = st.tiers
  const setTier = (id: string, p: Partial<Tier>) => commit(s => ({ ...s, tiers: s.tiers.map(t => t.id === id ? { ...t, ...p } : t) }))
  const addTier = () => commit(s => ({ ...s, tiers: [...s.tiers, { id: uid('t'), name: 'Tingkat baru', min: Math.max(0, ...s.tiers.map(t => t.min)) + 10, pct: 0, perk: '' }] }))
  const setUser = (id: string, p: Partial<User>) => commit(s => ({ ...s, users: s.users.map(u => u.id === id ? { ...u, ...p } : u) }))
  const isSuper = me.role === 'superadmin'
  const allowed: Role[] = isSuper ? ROLES : ['owner', 'admin']
  const [nn, setNn] = useState('')
  const [nr, setNr] = useState<Role>('admin')
  const addUser = (e: FormEvent) => {
    e.preventDefault()
    if (commit(s => ({ ...s, users: [...s.users, { id: uid('u'), name: nn.trim(), role: allowed.includes(nr) ? nr : 'admin', on: true }] }))) { setNn(''); setNr('admin') }
  }
  return (<>
    <Title t="Pengaturan" sub="Skema member, akun pengguna, dan data demo." />
    {ok('pengaturan') && <section className="card apanel stack" aria-labelledby="h-skema">
      <h2 id="h-skema" className="aph">Skema member</h2>
      <p className="mut">Tingkat member dihitung dari jumlah kunjungan. Yang berlaku adalah tingkat tertinggi yang syaratnya terpenuhi.</p>
      <div className="trows">
        <div className="trow head" aria-hidden="true"><span>Nama</span><span>Minimal kunjungan</span><span>Potongan</span><span>Keterangan</span><span /></div>
        {tiers.map(t => (
          <div key={t.id} className="trow">
            <Bare label={`Nama tingkat ${t.name}`} v={t.name} set={name => setTier(t.id, { name })} maxLength={30} />
            <Rp v={t.min} set={min => setTier(t.id, { min })} label={`Minimal kunjungan ${t.name}`} unit="kali" zero />
            <Rp v={t.pct} set={pct => setTier(t.id, { pct: Math.min(100, pct) })} label={`Persen potongan ${t.name}`} unit="%" zero />
            <Bare label={`Keterangan ${t.name}`} v={t.perk} set={perk => setTier(t.id, { perk })} maxLength={80} />
            <Ask label="Hapus" ask={`Hapus ${t.name}?`} yes={() => commit(s => ({ ...s, tiers: s.tiers.filter(x => x.id !== t.id) }))} disabled={tiers.length < 2} />
          </div>
        ))}
      </div>
      {!tiers.some(t => t.min === 0) && <p className="info" role="status">Belum ada tingkat dengan minimal 0 kunjungan. Member baru akan dihitung di tingkat pertama dalam daftar.</p>}
      <button type="button" className="btn btn-line" onClick={addTier}>{ICON.plus}Tambah tingkat</button>
      <label className="field"><span>Aturan member (tampil di website)</span><span className="inp area"><textarea rows={3} maxLength={300} value={st.memberRule} onChange={e => commit(s => ({ ...s, memberRule: e.target.value }))} /></span></label>
    </section>}

    {ok('pengaturan') && <section className="card apanel stack" aria-labelledby="h-fee">
      <h2 id="h-fee" className="aph">Pajak dan service</h2>
      <p className="mut">Dipakai di kasir. Service dihitung dari harga setelah potongan, pajak dari harga setelah potongan ditambah service. Bawaan 0 persen.</p>
      <div className="fgrid">
        <div className="field"><span>Service</span><Rp v={st.fees.svc} set={svc => commit(s => catat({ ...s, fees: { ...s.fees, svc: Math.min(100, svc) } }, me.name, `Ubah service menjadi ${Math.min(100, svc)}%`))} label="Persen service" unit="%" zero /></div>
        <div className="field"><span>Pajak</span><Rp v={st.fees.tax} set={tax => commit(s => catat({ ...s, fees: { ...s.fees, tax: Math.min(100, tax) } }, me.name, `Ubah pajak menjadi ${Math.min(100, tax)}%`))} label="Persen pajak" unit="%" zero /></div>
      </div>
    </section>}

    {ok('pengguna') && <section className="card apanel stack" aria-labelledby="h-user">
      <h2 id="h-user" className="aph">Pengguna dan role</h2>
      <div className="trows">
        <div className="trow urow head" aria-hidden="true"><span>Nama</span><span>Role</span><span>Aktif</span><span /></div>
        {st.users.map(u => {
          const self = u.id === me.id, locked = !isSuper && u.role === 'superadmin'
          const opts = (allowed.includes(u.role) ? allowed : [u.role, ...allowed]).map((r): [string, string] => [r, ROLE_NAME[r]])
          return (
            <div key={u.id} className="trow urow">
              <Bare label={`Nama akun ${u.name}`} v={u.name} set={name => setUser(u.id, { name })} disabled={locked} maxLength={30} />
              <Sel label={`Role ${u.name}`} v={u.role} set={r => setUser(u.id, { role: r as Role })} opts={opts} disabled={locked || self} />
              <span className="st"><Toggle on={u.on} set={on => setUser(u.id, { on })} label={`${u.name} aktif`} disabled={locked || self} />{u.on ? 'Aktif' : 'Nonaktif'}</span>
              <span className="acts">{self ? <small className="mut">Akun kamu</small> : locked ? <small className="mut">Hanya superadmin</small>
                : <Ask label="Hapus" ask={`Hapus akun ${u.name}?`} yes={() => commit(s => ({ ...s, users: s.users.filter(x => x.id !== u.id) }))} />}</span>
            </div>
          )
        })}
      </div>
      <form className="addrow" onSubmit={addUser}>
        <Bare label="Nama akun baru" v={nn} set={setNn} placeholder="Nama akun baru" maxLength={30} />
        <Sel label="Role akun baru" v={nr} set={r => setNr(r as Role)} opts={allowed.map(r => [r, ROLE_NAME[r]])} />
        <button className="btn btn-line" disabled={!nn.trim()}>{ICON.plus}Tambah akun</button>
      </form>
      <div className="tbl matrix"><table>
        <caption>Hak akses tiap role</caption>
        <thead><tr><th>Aksi</th>{ROLES.map(r => <th key={r}>{ROLE_NAME[r]}</th>)}</tr></thead>
        <tbody>{RIGHTS.map(([t, a]) => <tr key={a}><td>{t}</td>{ROLES.map(r => <td key={r} className={can(r, a) ? 'cyes' : 'cno'}>{can(r, a) ? 'Ya' : 'Tidak'}</td>)}</tr>)}</tbody>
      </table></div>
    </section>}

    {ok('reset') && <section className="card apanel stack" aria-labelledby="h-reset">
      <h2 id="h-reset" className="aph">Reset data demo</h2>
      <p className="mut">Produk, member, promo, info, dan akun kembali ke data awal. Foto yang diunggah ikut hilang. Kamu tetap masuk.</p>
      <div><Ask label="Reset data demo" ask="Semua data kembali ke awal. Lanjut?" yes={() => flag(reset())} cls="btn btn-line" /></div>
    </section>}
  </>)
}

/* ---------- Kerangka ---------- */
export default function Admin({ view, arg }: { view: string; arg: string }) {
  const st = useStore()
  const [warn, setWarn] = useState('')
  const flag = (ok: boolean) => { setWarn(ok ? '' : FULL); return ok }
  const commit = (fn: (s: Store) => Store) => flag(update(fn))
  useEffect(() => { scrollTo(0, 0) }, [view, arg])
  const me = currentUser(st)
  if (!me) return <Login st={st} commit={commit} warn={warn} />

  const ok = (a: Action) => can(me.role, a)
  const item = st.items.find(i => i.id === arg)
  // Rute yang tidak dikenal atau tidak boleh diakses role ini jatuh ke Ringkasan.
  const v = view === '' || (NEED[view] && ok(NEED[view])) ? view : ''
  const page = v === 'edit' && !item ? 'produk' : v
  const active = page === 'edit' || page === 'baru' ? 'produk' : page
  return (
    <A.Provider value={{ st, me, commit, flag, ok }}>
      <div className="adm">
        <aside className="adm-side">
          <div>
            <a className="logo" href="#/admin"><i />greenbox</a>
            <p className="adm-sub">ADMIN</p>
            <nav aria-label="Menu admin">{GROUPS.map(([g, items]) => {
              const vis = items.filter(n => !n[3] || ok(n[3]))
              return vis.length ? (
                <div key={g} className="adm-grp" role="group" aria-label={g}>
                  <p className="adm-gl" aria-hidden="true">{g}</p>
                  {vis.map(([ic, t, r]) => (
                    <a key={t} href={r ? `#/admin/${r}` : '#/admin'} className={r === active ? 'on' : ''} aria-current={r === active ? 'page' : undefined}>{ICON[ic]}{t}</a>
                  ))}
                </div>
              ) : null
            })}</nav>
          </div>
          <div className="adm-user"><span aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
            <div><b>{me.name}</b><small>{ROLE_NAME[me.role]}</small>
              <button type="button" onClick={() => { commit(s => ({ ...s, session: null })); location.hash = '#/admin' }}>Keluar</button></div></div>
        </aside>
        <main className="adm-main">
          <div className="tex noise" />
          <div className={`adm-in${page === 'kasir' ? ' wide' : ''}`}>
            {warn && <div className="warn" role="alert">{warn}<button type="button" onClick={() => setWarn('')}>Tutup</button></div>}
            {page === 'produk' ? <Produk />
              : page === 'baru' || page === 'edit' ? <Edit key={page + arg} item={page === 'edit' ? item : undefined} />
                : page === 'harga' ? <Massal />
                  : page === 'promo' ? <Promo />
                    : page === 'member' ? <MemberPage />
                      : page === 'lokasi' ? <Lokasi />
                        : page === 'pengaturan' ? <Pengaturan />
                          : page === 'kasir' ? <KasirPage />
                            : page === 'transaksi' ? <TransaksiPage />
                              : page === 'shift' ? <ShiftPage />
                                : page === 'stok' ? <StokPage />
                                  : page === 'resep' ? <ResepPage />
                                    : page === 'pembelian' ? <PembelianPage />
                                      : page === 'laporan' ? <LaporanPage />
                                        : <Ringkasan />}
          </div>
        </main>
      </div>
    </A.Provider>
  )
}
