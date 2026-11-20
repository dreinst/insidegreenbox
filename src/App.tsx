import { lazy, Suspense, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { BEANS, DRINKS, MILK, type Drink, type Level, type Serve } from './data'
import { discountOf, findMember, fmt, getStore, imgSrc, menuDrinks, menuFoods, nextTier, priceK, tierOf, update, useStore, waDigits, type Item, type Member as MemberRec, type Store } from './store'

// Admin dimuat terpisah supaya pengunjung biasa tidak ikut mengunduhnya.
const Admin = lazy(() => import('./Admin'))

// Animasi masuk: tiap .reveal dapat kelas .in saat terlihat. Dijalankan ulang tiap ganti halaman.
function useReveal(key: string) {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { threshold: 0.15 })
    document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [key])
}

const S = 'currentColor'
const Arrow = () => <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke={S} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
const Wa = () => <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" stroke={S} strokeWidth="1.8" strokeLinejoin="round" /><path d="M8.8 8.2c.2-.4.5-.4.8-.4h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.9 1.5 1.9 2.6 2.4.3.1.4.1.6-.1l.6-.7c.2-.2.3-.2.6-.1l1.6.8c.3.1.4.2.4.4 0 .5-.2 1.2-.6 1.5-.5.4-1.2.6-2 .4-1.4-.3-3-1.2-4.3-2.6-1.2-1.3-1.9-2.6-2.1-3.7-.1-.8.2-1.5.6-1.9Z" fill={S} /></svg>
const Pin = () => <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" stroke={S} strokeWidth="1.8" /><circle cx="12" cy="9.5" r="2.5" stroke={S} strokeWidth="1.8" /></svg>
const Clock = () => <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke={S} strokeWidth="1.8" /><path d="M12 7.5V12l3 2" stroke={S} strokeWidth="1.8" strokeLinecap="round" /></svg>
const Ig = () => <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke={S} strokeWidth="1.8" /><circle cx="12" cy="12" r="4" stroke={S} strokeWidth="1.8" /><circle cx="17.2" cy="6.8" r="1.1" fill={S} /></svg>
const Tt = () => <svg viewBox="0 0 24 24" fill="none"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" stroke={S} strokeWidth="1.8" strokeLinecap="round" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" stroke={S} strokeWidth="1.8" strokeLinecap="round" /></svg>
const Search = () => <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke={S} strokeWidth="1.8" /><path d="m16 16 4 4" stroke={S} strokeWidth="1.8" strokeLinecap="round" /></svg>
const Hot = () => <svg viewBox="0 0 24 24" fill="none" aria-label="panas"><path d="M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-4Z" fill={S} /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16" stroke={S} strokeWidth="1.8" /><path d="M9 3.5c-1 1 1 2 0 3.5M13 3.5c-1 1 1 2 0 3.5" stroke={S} strokeWidth="1.6" strokeLinecap="round" /></svg>
const Ice = () => <svg viewBox="0 0 24 24" fill="none" aria-label="dingin"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" stroke={S} strokeWidth="2.4" strokeLinecap="round" /></svg>
const Th = () => <svg viewBox="0 0 24 24" fill="none"><path d="M19 8.5C18 5.2 15.6 3.5 12.2 3.5 7.6 3.5 5 6.8 5 12s2.6 8.5 7.2 8.5c3.6 0 6.3-2 6.3-5 0-2.6-2.2-4.2-5.6-4.2-2.4 0-4 1-4 2.7 0 1.5 1.2 2.5 3 2.5 2.3 0 3.6-1.6 3.6-4.5 0-2.4-1.2-3.8-3.3-3.8-1.3 0-2.3.5-2.9 1.4" stroke={S} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
const Burger = () => <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke={S} strokeWidth="2" strokeLinecap="round" /></svg>
const RtdBadge = ({ c = '#272924' }: { c?: string }) => (
  <svg className="rtdb" viewBox="0 0 60 86" fill="none" aria-hidden="true"><path d="M6 30h48v34L42 80H18L6 64V30Z" stroke={c} strokeWidth="4" /><path d="M4 4h16l10 12L40 4h16L38 24l18 20H40L30 32 20 44H4l18-20L4 4Z" fill={c} /><text x="30" y="68" textAnchor="middle" fontFamily="Bricolage Grotesque" fontWeight="700" fontSize="13" fill={c} letterSpacing="1">RTD</text></svg>
)

const Sq = () => <i className="sq" />
const Token = ({ l, s = 24 }: { l: Level; s?: number }) => <i className={`token ${l}`} style={{ '--t': `${s}px` } as CSSProperties}>{l}</i>
// Label harga gantungan kunci: ring, sambungan, lalu pelat harga. --s = skala dari desain.
const Key = ({ p, old, tone = '', s = 1 }: { p: string; old?: string; tone?: string; s?: number }) => (
  <span className={`key ${tone}`} style={{ '--s': s } as CSSProperties}>{old && <s>{old}</s>}<i /><u /><b>{p}</b></span>
)
const Ghost = ({ children, style }: { children: ReactNode; style: CSSProperties }) => <div className="ghost" style={style} aria-hidden="true">{children}</div>
const Eyebrow = ({ children, color }: { children: ReactNode; color?: string }) => <div className="eyebrow" style={{ color }}><Sq />{children}</div>
const Tex = ({ k, o }: { k: string; o?: number }) => <div className={`tex ${k}`} style={o === undefined ? undefined : { opacity: o }} />

type Mat = 'steel' | 'concrete' | 'ply' | 'green'
// Slot material: minuman menyembul keluar dari atas, makanan dipotong tepi slot.
// img boleh kosong (produk belum punya foto): slot material tetap tampil.
const DrinkSlot = ({ img, alt, m, cls = '' }: { img?: string; alt: string; m: Mat; cls?: string }) => (
  <div className={`slot ${m} ${cls}`}><i className="shade" />{img && <img className="drink" src={imgSrc(img)} alt={alt} />}</div>
)
const FoodSlot = ({ img, alt, m, cls = '' }: { img?: string; alt: string; m: Mat; cls?: string }) => (
  <div className={`slot food ${m} ${cls}`}>{img && <img src={imgSrc(img)} alt={alt} />}<i className="shade" /></div>
)

// Produk tayang berdasarkan nama (untuk elemen yang menulis harga langsung di desain).
const live = (items: Item[], name: string) => items.find(i => i.name === name && i.on)
const DRINK_IDS = new Set(DRINKS.map(g => g.id))
const countOf = (groups: { items: unknown[] }[]) => groups.reduce((n, g) => n + g.items.length, 0)

function Header({ page }: { page: string }) {
  const { info } = useStore()
  const [open, setOpen] = useState(false)
  // Header menempel di atas layar; setelah discroll dapat latar supaya tetap terbaca di atas konten.
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(scrollY > 10)
    on(); addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  const link = (href: string, label: string, id: string) => <a href={href} aria-current={page === id ? 'page' : undefined}>{label}</a>
  return (
    <div className="hbar"><div className={`hfix${solid ? ' solid' : ''}`}>
    <header className={`wrap${open ? ' menu-open' : ''}`}>
      <a className="logo" href="#/"><i />greenbox</a>
      <nav onClick={() => setOpen(false)}>
        {link('#/menu', 'Menu', 'menu')}{link('#/inside', 'Inside', 'inside')}{link('#/feed', 'Event', 'feed')}{link('#/lokasi', 'Lokasi', 'lokasi')}{link('#/member', 'Member', 'member')}
      </nav>
      <a className="btn btn-ink head-cta" href={info.wa}><Wa />Reservasi</a>
      <button className="btn btn-paper menu-toggle" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(!open)}><Burger /></button>
    </header>
    </div></div>
  )
}

const Footer = () => (
  <footer><div className="wrap">
    <div><a className="logo" href="#/"><i />greenbox</a><p className="hand">where everyday things feel easier</p></div>
    <div className="links"><span>Kebijakan privasi</span><span>Pengaturan cookie</span><span>© 2026 Greenbox</span></div>
  </div></footer>
)

const Sticker = ({ cls, children }: { cls: string; children: ReactNode }) => <div className={`sticker ${cls}`}><div>{children}</div></div>

const Ticker = ({ items, cls }: { items: string[]; cls: string }) => {
  const row = <div>{items.map((t, i) => <span key={i}>{t}<b /></span>)}</div>
  return <div className={`ticker ${cls}`} aria-hidden="true">{row}{row}</div>
}

const Lv = ({ l }: { l: Level }) => <span className="lv"><Token l={l} s={26} />Level {l}</span>
const Kcal = ({ k }: { k: string }) => <span className="chip">{k}<span className="d">{'\u00a0'}kcal</span></span>

type Prod = { id: string; name: string; line: string; img?: string; mat: Mat; drink: boolean; meta: ReactNode; price: string }
const favProds = (items: Item[]): Prod[] => items.filter(i => i.on && i.fav).map(i => ({
  id: i.id, name: i.name, line: i.line, img: i.img, mat: i.mat, drink: DRINK_IDS.has(i.cat), price: priceK(i.price),
  meta: i.level && DRINK_IDS.has(i.cat) ? <Lv l={i.level} /> : i.kcal ? <Kcal k={i.kcal} /> : <span />,
}))

// Versi pendek untuk mobile: nama dan pasangan dipangkas seperlunya.
const shortName = (n: string) => n.replace('Pan-seared Chicken', 'Pan-seared')
const shortPair = (p: string) => p.replace(/^Iced Shaken /, '')
const Short = ({ full, short }: { full: string; short: string }) => full === short ? <>{full}</> : <><span className="d">{full}</span><span className="m">{short}</span></>

const FEED = [
  ['ig01', 'Halloween night', -3, 'p/DfFN9F_JgEk/', 'Halloween'], ['ig06', 'Cloud series', 2, '', 'Cloud series'], ['ig18', 'Coffee parfait', -1.5, '', 'Parfait'],
  ['ig05', 'WFC Kuy!', 2.5, 'p/DeqEWlQtWEV/', 'WFC Kuy!'], ['ig26', 'Mont Blanc', -2, '', 'Mont Blanc'],
] as const

const LEVELS = [['A', 'Gula paling rendah', 'Espresso, Long Black, Pour Over'], ['C', 'Gula sedang', 'Latte, Cappuccino, RTD Coffee'], ['D', 'Gula lebih tinggi', 'Cloud Series, Matcha Latte']] as const
// [nama tampil, keterangan, nama produk di store]
const RTDS = [['Classic', 'Kopi susu, pecan praline', 'RTD Classic'], ['Fruity', 'Espresso fruity, susu segar', 'RTD Fruity'], ['Decaf', 'Decaf espresso, sorghum sugar', 'RTD Decaf'], ['Sunset Soother', 'Semangka, citrus, stroberi', 'Sunset Soother'], ['Sunrise Booster', 'Cold-pressed segar', 'Sunrise Booster']]

const Pola = ({ img, alt, r, cls = '' }: { img: string; alt: string; r: number; cls?: string }) => (
  <div className={`pola reveal ${cls}`} style={{ '--r': `${r}deg` } as CSSProperties}><span className="tape" /><img src={imgSrc(img)} alt={alt} /></div>
)

// Bagian member "Greenbox Key". Tingkat, aturan, dan daftar member semuanya dari store.
type Msg = { ok: boolean; text: ReactNode } | null
const TONES = ['ink', '', 'butter']
const digitsOf = (v: string) => v.replace(/\D/g, '')
const validWa = (v: string) => { const n = digitsOf(v).length; return n >= 9 && n <= 14 }

function MemberSection({ st }: { st: Store }) {
  const tiers = [...st.tiers].sort((a, b) => a.min - b.min)
  const first = tiers[0]
  const [name, setName] = useState('')
  const [wa, setWa] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [checkWa, setCheckWa] = useState('')
  const [asked, setAsked] = useState<string | null>(null)

  const register = (e: FormEvent) => {
    e.preventDefault()
    const nm = name.trim().replace(/\s+/g, ' ')
    if (!nm) return setMsg({ ok: false, text: 'Isi namamu dulu ya.' })
    if (!validWa(wa)) return setMsg({ ok: false, text: 'Nomor WhatsApp harus 9 sampai 14 digit.' })
    const num = waDigits(wa)
    const ex = findMember(getStore(), num)
    if (ex) {
      const t = tierOf(ex, st.tiers)
      return setMsg({ ok: true, text: <>Nomor ini sudah terdaftar atas nama <b>{ex.name.split(' ')[0]}</b>. Posisimu di {t.name}, {ex.visits} kunjungan.</> })
    }
    const m: MemberRec = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: nm, wa: num, visits: 0, discount: true, joined: Date.now(), note: '' }
    if (!update(s => ({ ...s, members: [...s.members, m] }))) return setMsg({ ok: false, text: 'Pendaftaran belum tersimpan. Coba lagi, atau daftar lewat kasir.' })
    const t = tierOf(m, st.tiers)
    setMsg({ ok: true, text: <>Kuncimu sudah jadi, <b>{nm.split(' ')[0]}</b>. Kamu mulai di {t.name} dengan potongan {discountOf(m, st.tiers)}%.</> })
    setName(''); setWa('')
  }
  const check = (e: FormEvent) => { e.preventDefault(); setAsked(checkWa) }

  // Hasil cek dihitung dari store tiap render, jadi ikut berubah kalau kasir mencatat kunjungan.
  const found = asked !== null && validWa(asked) ? findMember(st, asked) : undefined
  let result: ReactNode = null
  if (asked !== null && !validWa(asked)) result = <p className="mnote">Nomor WhatsApp harus 9 sampai 14 digit.</p>
  else if (asked !== null && !found) result = <p className="mnote">Nomor ini belum terdaftar. Daftar dulu lewat formulir Daftar.</p>
  else if (found) {
    const t = tierOf(found, st.tiers), nx = nextTier(found, st.tiers), pct = discountOf(found, st.tiers)
    const prog = nx ? Math.min(1, Math.max(0, (found.visits - t.min) / (nx.min - t.min))) : 1
    result = (
      <div className="mres">
        <b className="lbl">KUNCI ATAS NAMA</b>
        <h4 className="disp">{found.name.split(' ')[0]}</h4>
        <div className="mstats">
          <div><small>Tingkat</small><b>{t.name}</b></div>
          <div><small>Kunjungan</small><b>{found.visits}</b></div>
          <div><small>Potongan</small><b>{found.discount ? `${pct}%` : 'Nonaktif'}</b></div>
        </div>
        {!found.discount && <p className="mnote">Potongan untuk nomor ini sedang tidak aktif. Tanyakan ke kasir ya, nanti dibantu.</p>}
        <div className="mbar" aria-hidden="true"><i style={{ transform: `scaleX(${prog})` }} /></div>
        <p className="mnext">{nx ? <>{nx.min - found.visits} kunjungan lagi menuju <b>{nx.name}</b> ({nx.pct}%).</> : 'Kamu sudah di tingkat tertinggi.'}</p>
      </div>
    )
  }

  return (
    <section className="member" id="member">
      <Tex k="noise" o={0.36} />
      <Ghost style={{ left: -20, top: -20, fontSize: 260 }}>member</Ghost>
      <div className="wrap">
        <div className="head reveal">
          <div><Eyebrow>Member</Eyebrow><h2 className="disp fx">Greenbox Key</h2></div>
          <p className="sub">Daftar pakai nomor WhatsApp. Kasir mencatat tiap kunjunganmu, dan makin sering mampir, makin besar potongannya.</p>
        </div>
        <div className="keys">
          {tiers.map((t, i) => (
            <article key={t.id} className={`card tier t${i % 3} reveal`}>
              <div className="tier-top"><b className="lbl">TINGKAT {String(i + 1).padStart(2, '0')}</b><span className="chip">{t.min === 0 ? 'Sejak daftar' : `${t.min} kunjungan`}</span></div>
              <h3 className="disp">{t.name}</h3>
              <p>{t.perk}</p>
              <div className="tier-key"><Key p={`${t.pct}%`} tone={TONES[i % 3]} s={1.15} /><small>potongan</small></div>
            </article>
          ))}
        </div>
        <p className="mrule reveal"><Sq /><span>{st.memberRule}</span></p>
        <div className="mgrid">
          <form className="card mcard reveal" onSubmit={register} noValidate>
            <b className="lbl">DAFTAR</b>
            <h3 className="disp">Ambil kuncimu</h3>
            {first && <p className="mdesc">Isi nama dan nomor WhatsApp. Kamu langsung mulai di {first.name} dengan potongan {first.pct}%.</p>}
            <div className="fld"><label htmlFor="mb-nama">Nama</label><input id="mb-nama" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Nama kamu" /></div>
            <div className="fld"><label htmlFor="mb-wa">Nomor WhatsApp</label><input id="mb-wa" value={wa} onChange={e => setWa(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" /></div>
            <button className="btn btn-green" type="submit">Daftar member<Arrow /></button>
            <div className={`mmsg${msg ? (msg.ok ? ' ok' : ' err') : ''}`} role="status">{msg?.text}</div>
            <p className="hand d">satu nomor, satu kunci</p>
          </form>
          <form className="card mcard mcheck reveal" onSubmit={check} noValidate>
            <b className="lbl">CEK KUNCI</b>
            <h3 className="disp">Sudah punya kunci?</h3>
            <p className="mdesc">Masukkan nomor WhatsApp yang kamu daftarkan untuk melihat tingkat dan potonganmu.</p>
            <div className="fld"><label htmlFor="mb-cek">Nomor WhatsApp</label><input id="mb-cek" value={checkWa} onChange={e => { setCheckWa(e.target.value); setAsked(null) }} inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" /></div>
            <button className="btn btn-paper" type="submit"><Search />Cek kunci</button>
            <div className="mout" role="status">{result}</div>
          </form>
        </div>
      </div>
    </section>
  )
}

function Home() {
  const st = useStore()
  const { items, promo, info } = st
  const total = countOf(menuDrinks(items)) + countOf(menuFoods(items))
  const favs = favProds(items)
  const cloudPrice = (live(items, 'Coffee Cloud') ?? live(items, 'Oolong Cloud'))?.price
  const sets = promo.earlyOn ? promo.sets.filter(x => x.on) : []
  const rtds = RTDS.flatMap(([n, d, name]) => { const it = live(items, name); return it ? [[n, d, priceK(it.price)]] : [] })
  const hours = `${info.open} sampai ${info.close}`
  const street = info.address.split(',')[0].replace(/\bNo\.?\s*/i, '')
  const gift = promo.dailyGift.trim().split(/\s+/)
  return (<>
    <section className="hero">
      <Tex k="beton" /><Tex k="noise" o={0.48} />
      <Ghost style={{ left: -30, bottom: -70, fontSize: 330 }}>inside</Ghost>
      <div className="wrap">
        <Header page="home" />
        <div className="hero-in">
          <div className="hero-text reveal">
            <Eyebrow>Klojen, Malang<span className="d"> · sejak 2026</span></Eyebrow>
            <h1 className="disp fx">Everyday things, made easier<i /></h1>
            <p className="lead">Kopi, makanan, dan ruang untuk duduk lama. Buka tiap hari, {hours}.</p>
            <div className="actions d">
              <a className="btn btn-green" href="#/menu">Lihat menu<Arrow /></a>
              <a className="btn btn-paper" href={info.maps}><Pin />{street}</a>
            </div>
          </div>
          <div className="box">
            <div className="back" />
            <div className="front"><span className="emboss">GREEN BOX</span></div>
            <img className="cup a" src="/img/p-oolong-cloud.webp" alt="Oolong Cloud" />
            <img className="cup b" src="/img/p-coffee-cloud.webp" alt="Coffee Cloud" />
            <div className="note">
              <p className="hand">something soft<br />landed on top</p>
              <svg className="d" viewBox="0 0 70 60" fill="none"><path d="M4 6c30 0 52 14 58 44" stroke="#272924" strokeWidth="2.6" strokeLinecap="round" /><path d="M52 42l10 12 6-14" stroke="#272924" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            {cloudPrice !== undefined && <Sticker cls="new"><small>BARU</small><b>Cloud<br />Series</b><em>{priceK(cloudPrice)}</em></Sticker>}
          </div>
        </div>
      </div>
    </section>
    <div className="m hero-btn"><a className="btn btn-green" href="#/menu">Lihat menu<Arrow /></a></div>

    <div className="bands">
      <Ticker cls="ink d" items={[`Buka tiap hari ${hours}`, sets.length > 0 && 'Early set till 12PM', 'Ramah WFC', promo.dailyOn && 'Daily step', 'Cloud series'].filter((x): x is string => !!x)} />
      <Ticker cls="green d" items={['Inside the box', 'Nutrition level di tiap menu', 'Everything feels easier', 'RTD ready when you are', 'Inside the box']} />
      <Ticker cls="green m" items={['Inside the box', 'Nutrition level', sets.length > 0 && 'Early set till 12PM', 'Ramah WFC'].filter((x): x is string => !!x)} />
    </div>

    {favs.length > 0 && <section className="fav">
      <Tex k="noise" o={0.48} />
      <Ghost style={{ right: -40, top: 10, fontSize: 240, color: 'rgba(39,41,36,.045)' }}>menu</Ghost>
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>Menu</Eyebrow><h2 className="disp fx">Yang sering dipesan</h2></div><a className="btn btn-ink d" href="#/menu">Lihat {total} menu<Arrow /></a></div>
        <div className={`grid4${favs.length < 4 ? ' few' : ''}`} style={{ '--n': favs.length } as CSSProperties}>
          {favs.map(p => (
            <article key={p.id} className="card prod reveal">
              {p.drink ? <DrinkSlot img={p.img} alt={p.name} m={p.mat} /> : <FoodSlot img={p.img} alt={p.name} m={p.mat} />}
              <h3>{p.name}</h3><p>{p.line}</p>
              <div className="row">{p.meta}<Key p={p.price} s={0.9} /></div>
            </article>
          ))}
        </div>
        <a className="btn btn-ink m full" href="#/menu" style={{ marginTop: 22 }}>Lihat {total} menu<Arrow /></a>
      </div>
    </section>}

    <section className="nutri">
      <div className="dark">
        <Ghost style={{ right: -20, bottom: -80, fontSize: 300, color: 'rgba(255,255,255,.035)' }}>A B C D</Ghost>
        <div className="nut">
          <div className="reveal">
            <Eyebrow color="#7FE07B">Nutrition level</Eyebrow>
            <h2 className="disp fx-dark">Tahu isinya, baru minum.</h2>
            <p className="sub d">Tiap minuman di menu punya label A sampai D untuk kadar gulanya. Makanan kami tulis kalorinya. Jadi milihnya gampang.</p>
            <p className="sub m">Tiap minuman punya label A sampai D untuk kadar gulanya. Makanan kami tulis kalorinya.</p>
            <p className="hand d">pertama di kedai kopi Malang</p>
          </div>
          <div className="tiles">
            {LEVELS.map(([l, h, e]) => (
              <div key={l} className="tile reveal"><Token l={l} s={78} /><div><h4>{h}</h4><p>{e}</p></div></div>
            ))}
            <div className="tile receipt reveal d">
              <b className="lbl">STRUK MAKAN</b>
              <div className="ln first"><span>Easy-Nasgor</span><b>±640</b></div>
              <div className="ln"><span>Pad Kra Pao</span><b>±312</b></div><div className="ln"><span>Soft-Panna</span><b>±218</b></div>
              <h4>kcal di tiap piring</h4>
            </div>
          </div>
          <p className="hand m">pertama di kedai kopi Malang</p>
        </div>
      </div>
    </section>

    {sets.length > 0 && <section className="early">
      <Tex k="noise" o={0.36} />
      <Ghost style={{ left: -20, bottom: -60, fontSize: 230, color: 'rgba(22,52,114,.05)' }}>morning</Ghost>
      <div className="wrap">
        <div className="early-text reveal">
          <Eyebrow>07.00 sampai 12.00</Eyebrow>
          <h2 className="disp fx-navy">Early set</h2>
          <span className="tag lg">TILL 12PM</span>
          <p className="sub">Makanan dan minuman berpasangan dengan harga pagi.</p>
          <p className="hand d">your morning, made easier</p>
        </div>
        <div className="tickets">
          {sets.map(x => (
            <article key={x.id} className="ticket reveal"><div className="card tk">
              <FoodSlot img={x.img} alt={`${x.name} + ${x.pair}`} m="steel" />
              <hr /><h3><Short full={x.name} short={shortName(x.name)} /></h3><p><Short full={`+ ${x.pair}`} short={`+ ${shortPair(x.pair)}`} /></p>
              <div className="row"><Key p={priceK(x.price)} old={priceK(x.old)} tone="navy" s={0.9} /></div>
            </div></article>
          ))}
        </div>
      </div>
    </section>}

    {promo.dailyOn && <section className="daily">
      <div className="tex photo" /><div className="tex vignette" />
      <div className="wrap reveal">
        <Eyebrow color="var(--butter)">Daily step<span className="d"> · 07.00 sampai 12.00</span></Eyebrow>
        <div className="big">{fmt(promo.dailySteps)}</div>
        <div className="disp steps">langkah</div>
        <div className="bar"><i /></div>
        <div className="ticks d"><span>0</span><span>{fmt(Math.round(promo.dailySteps / 2))}</span><span>{fmt(promo.dailySteps)} ✓</span></div>
        <p>Tunjukkan hitungan langkahmu di kasir sebelum jam 12. {promo.dailyGift}-nya gratis.</p>
      </div>
      <Sticker cls="free"><small>GRATIS</small><b>{gift.length > 1 ? <>{gift[0]}<br />{gift.slice(1).join(' ')}</> : gift[0]}</b></Sticker>
    </section>}

    {rtds.length > 0 && <section className="rtd">
      <Tex k="noise" o={0.6} />
      <Ghost style={{ right: -30, bottom: -90, fontSize: 300, color: 'rgba(255,255,255,.1)' }}>ready</Ghost>
      <div className="wrap">
        <div className="rtd-text reveal">
          <div className="badge"><RtdBadge /><div className="eyebrow">Ready to drink</div></div>
          <h2 className="disp fx-green">RTD, ready when you are.</h2>
          <p className="sub d">Kopi dan cold-pressed dalam kaleng. Ambil dari kulkas, bawa ke mana saja.</p>
        </div>
        <div className="fridge reveal">
          <i className="shelf" />
          {live(items, 'RTD Decaf') && <img className="decaf" src="/img/p-rtd-decaf.webp" alt="RTD Decaf" />}{live(items, 'Sunset Soother') && <img className="sunset" src="/img/p-rtd-sunset.webp" alt="RTD Sunset Soother" />}
          <p className="hand d">dingin dari kulkas</p>
        </div>
        <div className="rows">
          {rtds.map(([n, d, p]) => (
            <div key={n} className="reveal"><span><b>{n}</b><span className="d">{d}</span></span><Key p={p} tone="ink" s={0.8} /></div>
          ))}
        </div>
      </div>
    </section>}

    <section className="inside" id="inside">
      <Ghost style={{ right: -30, top: -30, fontSize: 250, color: 'rgba(255,255,255,.18)' }}>space</Ghost>
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>Inside</Eyebrow><h2 className="disp fx">Inside the box</h2></div>
          <p className="sub"><span className="d">Some spaces are made to be looked at. </span>Ours are made to be used. Duduk sebentar atau seharian.</p></div>
        <div className="photos">
          <Pola img="ig30" alt="Dinding plywood dengan kotak hijau di dalam Greenbox" r={-2} cls="main" />
          <div className="side">
            <div className="pair">
              <Pola img="ig19" alt="Sofa hijau" r={2.5} />
              <Pola img="ig17" alt="Pengunjung bekerja di meja" r={-1.5} />
            </div>
            <div className="card info reveal" id="lokasi">
              <div className="info-main">
                <b className="lbl">SATU KOTAK, TIAP HARI.</b>
                <h3 className="disp">greenbox</h3>
                <p><Pin /><span>{info.address}<span className="m">, {info.area}</span></span></p>
                <p className="hours"><Clock /><span>{hours}<span className="d"> (last order)</span></span></p>
                <div className="chips">{info.facilities.map(c => <span key={c}><Sq />{c}</span>)}</div>
              </div>
              <div className="info-act">
                <a className="btn btn-green" href={info.wa}><Wa />Reservasi</a>
                <a className="peta d" href={info.maps}><Pin />Peta</a>
                <a className="btn btn-line m" href={info.maps}><Pin />Peta</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="feedsec" id="feed">
      <Tex k="noise" o={0.48} />
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>@inside.greenbox</Eyebrow><h2 className="disp fx">Yang lewat di feed</h2></div>
          <div className="seg">
            <a className="btn btn-ink" href={info.instagram}><Ig />Instagram</a>
            <a className="btn" href={info.tiktok}><Tt />TikTok</a>
            <a className="btn" href={info.threads}><Th />Threads</a>
          </div>
        </div>
        <div className="feed">
          {FEED.map(([img, t, r, path, st]) => (
            <a key={img} className="pola reveal" style={{ '--r': `${r}deg` } as CSSProperties} href={path ? `https://www.instagram.com/${path}` : info.instagram}>
              <span className="tape" /><img src={imgSrc(img)} alt={t} /><span className="tag"><Short full={t} short={st} /></span>
            </a>
          ))}
        </div>
      </div>
    </section>

    <MemberSection st={st} />

    <section className="cta">
      <Tex k="noise" o={0.6} />
      <Ghost style={{ left: -20, bottom: -70, fontSize: 260, color: 'rgba(39,41,36,.06)' }}>reservasi</Ghost>
      <div className="wrap">
        <div className="reveal">
          <h2 className="disp fx">Get your key to stay inside.</h2>
          <p className="sub">Reservasi meja atau tanya menu lewat WhatsApp. Satu nomor resmi: {info.waNumber}.</p>
          <a className="btn btn-ink chat" href={info.wa}><Wa />Chat {info.waNumber}</a>
        </div>
        <div className="keychain" aria-hidden="true"><i className="ring" /><i className="link" /><div><span className="emboss">GREEN<br />BOX</span></div></div>
      </div>
    </section>
    <Footer />
  </>)
}

const ServeIcon = ({ s }: { s: Serve }) => <span className="ic">{s !== 'ice' && <Hot />}{s !== 'hot' && <Ice />}</span>
const Beans = ({ code }: { code: string }) => <span className="beans">{[...code].map(c => <i key={c} className="bean" style={{ background: BEANS[c][1] }} title={BEANS[c][0]} />)}</span>
const Price = ({ p }: { p: string }) => <span className="price">{p}</span>

// Kolom kiri baris menu: foto produk kalau ada, kalau belum ada tampil nomor urut.
const Pic = ({ it, n }: { it?: Item; n: number }) => it?.img
  ? <span className={`mpic slot ${it.mat}`}><img src={imgSrc(it.img)} alt="" /></span>
  : <span className="no">{String(n).padStart(2, '0')}</span>

const DrinkRows = ({ items, beans, by }: { items: Drink[]; beans: boolean; by: Record<string, Item> }) => <>{items.map((it, i) => (
  <div key={it.name} className="item">
    <Pic it={by[it.name]} n={i + 1} /><b>{it.name}</b>
    {beans && <Beans code={it.beans ?? ''} />}<Token l={it.level} /><ServeIcon s={it.serve} /><Price p={it.price} />
  </div>
))}</>

// Tab kategori: [nama, id kategori yang dihitung, anchor]. Tea juga memuat Refreshment.
const TABS = [['Espresso', ['espresso'], 'espresso'], ['Filter', ['filter'], 'filter'], ['Cloud', ['cloud'], 'cloud'], ['RTD', ['rtd'], 'rtd'], ['Non-coffee', ['noncoffee'], 'noncoffee'], ['Tea', ['tea', 'refresh'], 'tea'], ['Makanan', ['main'], 'main'], ['Snack', ['snack'], 'snack'], ['Dessert', ['dessert'], 'dessert']] as const
const MENU_MAT: Record<string, Mat> = { 'Coffee Cloud': 'steel', 'Oolong Cloud': 'concrete' }
// Empat foto makanan di halaman menu: [nama produk di store, nama tampil, posisi miring]
const FOOD_PHOTOS = [['Easy-Nasgor', 'Easy-Nasgor', -1], ['Beef-Sando', 'Beef-Sando', 1], ['Pad Kra Pao', 'Pad Kra Pao', -1], ['Real Potato Fries', 'Potato Fries', 1.2]] as const

function Menu({ anchor }: { anchor: string }) {
  const { items } = useStore()
  const dGroups = menuDrinks(items), fGroups = menuFoods(items)
  const by = Object.fromEntries(items.map(i => [i.name, i]))
  const total = countOf(dGroups) + countOf(fGroups)
  const catCount = (ids: readonly string[]) => items.filter(i => i.on && ids.includes(i.cat)).length
  const [q, setQ] = useState('')
  const has = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase())
  const panel = (id: string, title: string, note: string, color: string, body: ReactNode, n: number) => n > 0 && (
    <div key={id} id={id} className="card panel reveal">
      <div className="ph"><h2><i style={{ background: color }} />{title}</h2><span className="hand">{note}</span></div>
      {body}
    </div>
  )
  const D = Object.fromEntries(dGroups.map(g => [g.id, g]))
  const drinks = (id: string) => {
    const g = D[id]; const items = g.items.filter(it => has(it.name))
    return panel(g.id, g.title, g.note, g.color, <DrinkRows items={items} beans={!!g.items[0]?.beans} by={by} />, items.length)
  }
  const foods = (g: typeof fGroups[number]) => {
    const items = g.items.filter(it => has(it.name))
    return panel(g.id, g.title, g.note, g.color, items.map((it, i) => (
      <div key={it.name} className="item food">
        <Pic it={by[it.name]} n={i + 1} /><div className="fn"><b>{it.name}</b>{it.desc && <p>{it.desc}</p>}</div>
        {it.kcal && <span className="chip">{it.kcal}</span>}<Price p={it.price} />
      </div>
    )), items.length)
  }
  const milk = MILK.filter(([n]) => has(n))
  const cloudAll = items.filter(i => i.on && i.cat === 'cloud')
  const cloud = cloudAll.filter(i => has(i.name))
  const rtd = D.rtd.items.filter(it => has(it.name))
  const [main, snack, dessert] = fGroups
  const photos = FOOD_PHOTOS.flatMap(([name, label, r]) => { const it = live(items, name); return it ? [{ it, label, r }] : [] })
  return (<>
    <section className="hero mhero">
      <Tex k="beton" o={0.38} /><Tex k="noise" o={0.48} />
      <Ghost style={{ right: -40, top: 140, fontSize: 300 }}>menu</Ghost>
      <div className="wrap">
        <Header page="menu" />
        <div className="mhead reveal">
          <div><Eyebrow>Menu · September 2026</Eyebrow><h1 className="disp fx">{total} menu,<br />semua jelas.</h1>
            <p className="lead">Minuman berlabel nutrition level, makanan berlabel kalori. Harga dalam ribu rupiah.</p></div>
          <div className="navy-st"><span className="disp">Make it<br />easier</span></div>
        </div>
        <div className="card legend reveal">
          <b>BIJI KOPI</b><div>{Object.values(BEANS).map(([n, c]) => <span key={n}><i className="bean" style={{ background: c }} />{n}</span>)}</div>
          <i className="sep" />
          <b>NUTRITION LEVEL</b><div>{([['A', 'Gula paling rendah'], ['C', 'Sedang'], ['D', 'Lebih tinggi']] as const).map(([l, t]) => <span key={l}><Token l={l} />{t}</span>)}</div>
          <i className="sep" />
          <span><Hot />Panas</span><span><Ice />Dingin</span>
        </div>
        <div className="tabrow">
          <nav className="tabs" aria-label="Kategori menu">
            {[['Semua', total, ''], ...TABS.map(([n, ids, id]) => [n, catCount(ids), id] as const).filter(t => t[1] > 0)].map(([n, c, id]) => <a key={n} className={(anchor || '') === id ? 'on' : ''} href={id ? `#/menu/${id}` : '#/menu'}>{n}<small>{c}</small></a>)}
          </nav>
          <label className="search"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari menu" aria-label="Cari menu" /></label>
        </div>
      </div>
    </section>
    <section className="mbody">
      <Tex k="noise" o={0.3} />
      <div className="wrap">
        <div className="cols">
          <div>{drinks('espresso')}{drinks('filter')}{drinks('noncoffee')}{drinks('tea')}{drinks('refresh')}</div>
          <div>
            {cloud.length > 0 && <div id="cloud" className="cloudp reveal">
              <div className="ph"><h2 className="disp">Cloud series</h2><span className="hand">comfort beneath, soft above</span></div>
              <div className="pops">{cloud.map(it => (
                <div key={it.id} className="card pop"><DrinkSlot img={it.img} alt={it.name} m={MENU_MAT[it.name] ?? it.mat} /><div className="row"><b className="disp">{it.name}</b><Key p={priceK(it.price)} s={0.8} /></div></div>
              ))}</div>
              {cloudAll.length > 1 && cloudAll.every(i => i.level === 'D' && i.serve === 'ice') && <div className="note"><Token l="D" />Keduanya level D, disajikan dingin.</div>}
            </div>}
            {panel('milk', 'Milk option', 'tambahan', '#D9C6A4', milk.map(([n, p]) => <div key={n} className="item milk"><b>{n}</b><Price p={p} /></div>), milk.length)}
            {rtd.length > 0 && <div id="rtd" className="rtdp reveal">
              <div className="ph"><h2 className="disp"><RtdBadge c="#F4F5F1" />RTD</h2><span className="hand">kaleng 300 ml</span></div>
              <div className="mini-fridge"><i className="shelf" />{live(items, 'RTD Decaf') && <img className="decaf" src="/img/p-rtd-decaf.webp" alt="RTD Decaf" />}{live(items, 'Sunset Soother') && <img className="sunset" src="/img/p-rtd-sunset.webp" alt="RTD Sunset Soother" />}</div>
              <div style={{ marginTop: 8 }}><DrinkRows items={rtd} beans={false} by={by} /></div>
            </div>}
          </div>
        </div>
        <div className="head reveal foodhead"><div><Eyebrow>Dapur</Eyebrow><h2 className="disp fx">Food</h2></div><p className="hand">angka kalori untuk satu porsi</p></div>
        {photos.length > 0 && <div className="photos4">
          {photos.map(({ it, label, r }) => (
            <article key={it.id} className="card photo reveal" style={{ '--r': `${r}deg` } as CSSProperties}>
              <FoodSlot img={it.img} alt={label} m={it.mat} />
              <div className="row"><b className="disp">{label}</b><Key p={priceK(it.price)} s={0.8} /></div>
            </article>
          ))}
        </div>}
        <div className="cols" style={{ marginTop: 40 }}>
          <div>{foods(main)}</div>
          <div>{foods(snack)}{foods(dessert)}</div>
        </div>
      </div>
    </section>
    <Footer />
  </>)
}

export default function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  // #/menu dan #/menu/<kategori> ke halaman menu; selain itu beranda. Bagian kedua hash = id yang di-scroll.
  const [, page = '', anchor = '', arg = ''] = hash.split('/')
  const isMenu = page === 'menu'
  const isAdmin = page === 'admin'
  useReveal(isAdmin ? 'admin' : isMenu ? 'menu' : 'home')
  useEffect(() => {
    if (isAdmin) return
    const id = isMenu ? anchor : page
    if (id) document.getElementById(id)?.scrollIntoView()
    else scrollTo(0, 0)
  }, [hash, isMenu, isAdmin, anchor, page])
  if (isAdmin) return <Suspense fallback={null}><Admin view={anchor} arg={arg} /></Suspense>
  return isMenu ? <Menu anchor={anchor} /> : <Home />
}
