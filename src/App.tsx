import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { BEANS, DRINKS, FOODS, MAPS, MILK, TOTAL, WA, type Level, type Serve } from './data'

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

const Arrow = () => <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
const Hot = () => <svg viewBox="0 0 24 24" fill="none" aria-label="panas"><path d="M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-4Z" fill="currentColor" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16" stroke="currentColor" strokeWidth="1.8" /></svg>
const Ice = () => <svg viewBox="0 0 24 24" fill="none" aria-label="dingin"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
const Sq = () => <i className="sq" />
const Token = ({ l }: { l: Level }) => <i className={`token ${l}`}>{l}</i>
const Key = ({ p, old, tone = '' }: { p: string; old?: string; tone?: string }) => <span className={`key ${tone}`} data-p={p}>{old && <s>{old}</s>}</span>
const Ghost = ({ children, style }: { children: ReactNode; style: CSSProperties }) => <div className="ghost" style={style} aria-hidden="true">{children}</div>
const Eyebrow = ({ children, color }: { children: ReactNode; color?: string }) => <div className="eyebrow" style={{ color }}><Sq />{children}</div>

function Header({ page }: { page: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header className={open ? 'menu-open' : ''}>
      <a className="logo" href="#/"><i />greenbox</a>
      <nav onClick={() => setOpen(false)}>
        <a href="#/menu" aria-current={page === 'menu' ? 'page' : undefined}>Menu</a>
        <a href="#/inside">Inside</a><a href="#/feed">Event</a><a href="#/lokasi">Lokasi</a>
      </nav>
      <a className="btn btn-ink" href={WA} style={{ height: 48, fontSize: 14 }}>Reservasi</a>
      <button className="btn btn-paper menu-toggle" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </header>
  )
}

const Footer = () => (
  <footer><div className="wrap">
    <div><a className="logo" href="#/"><i />greenbox</a><p className="hand" style={{ marginTop: 12, fontSize: 24, color: '#7FE07B' }}>where everyday things feel easier</p></div>
    <small>© 2026 Greenbox · Jl. Nusakambangan 42, Malang</small>
  </div></footer>
)

type Prod = { name: string; line: string; img: string; mat: string; drink?: boolean; meta: ReactNode; price: string }
const PRODS: Prod[] = [
  { name: 'Coffee Cloud', line: 'Kopi susu di bawah, awan di atas.', img: 'p-coffee-cloud', mat: 'boxgreen', drink: true, meta: <span className="lv"><Token l="D" />Level D</span>, price: '38 K' },
  { name: 'Easy-Nasgor', line: 'Nasi goreng mentega plus telur. Beres.', img: 'c-easy-nasgor', mat: 'steel', meta: <span className="chip">±640 kcal</span>, price: '35 K' },
  { name: 'Beef-Sando', line: 'Roast beef, roti, plus fries.', img: 'c-beef-sando', mat: 'ply', meta: <span className="chip">±413 kcal</span>, price: '53 K' },
  { name: 'Oolong Cloud', line: 'Teh oolong dingin, awan yang sama.', img: 'p-oolong-cloud', mat: 'concrete', drink: true, meta: <span className="lv"><Token l="D" />Level D</span>, price: '38 K' },
]

const SETS = [
  ['c-set-nasgor', 'Easy-Nasgor', '+ Iced Shaken Honey Lemon Tea', '63 K', '40 K'],
  ['c-set-salad', 'Salad Pan-seared Chicken', '+ Iced Black', '65 K', '50 K'],
  ['c-set-beef', 'Beef-Sando', '+ Iced Shaken Mixed Berries Tea', '80 K', '60 K'],
]

const FEED = [
  ['ig01', 'Halloween night', -3, 'p/DfFN9F_JgEk/'], ['ig06', 'Cloud series', 2, ''], ['ig18', 'Coffee parfait', -1.5, ''],
  ['ig05', 'WFC Kuy!', 2.5, 'p/DeqEWlQtWEV/'], ['ig26', 'Mont Blanc', -2, ''],
] as const

const Ticker = ({ items }: { items: string[] }) => {
  const row = <div>{items.map(t => <span key={t} style={{ display: 'contents' }}>{t} <b /></span>)}</div>
  return <div className="ticker" aria-hidden="true">{row}{row}</div>
}

function Home() {
  return (<>
    <section className="hero">
      <div className="tex beton" /><div className="tex noise" />
      <Ghost style={{ left: -30, bottom: -70 }}>inside</Ghost>
      <div className="wrap">
        <Header page="home" />
        <div className="hero-grid">
          <div className="reveal">
            <Eyebrow>Klojen, Malang · sejak 2026</Eyebrow>
            <h1 className="disp">Everyday things, made easier<i /></h1>
            <p className="lead">Kopi, makanan, dan ruang untuk duduk lama. Buka tiap hari, 07.00 sampai 22.00.</p>
            <div className="actions">
              <a className="btn btn-green" href="#/menu">Lihat menu <Arrow /></a>
              <a className="btn btn-paper" href={MAPS}>Jl. Nusakambangan 42</a>
            </div>
          </div>
          <div className="box reveal">
            <p className="hand note">something soft<br />landed on top</p>
            <div className="back" />
            <div className="front"><span className="emboss">GREEN BOX</span></div>
            <img className="cup a" src="/img/p-oolong-cloud.webp" alt="Oolong Cloud" />
            <img className="cup b" src="/img/p-coffee-cloud.webp" alt="Coffee Cloud" />
            <div className="sticker"><div><small><b>BARU</b></small><div className="disp" style={{ fontSize: 20 }}>Cloud<br />Series</div><span className="tag" style={{ background: '#272924', border: 0, marginTop: 6 }}>38 K</span></div></div>
          </div>
        </div>
      </div>
    </section>

    <Ticker items={['Inside the box', 'Nutrition level di tiap menu', 'Early set till 12PM', 'Ramah WFC', 'RTD ready when you are']} />

    <section>
      <div className="tex noise" />
      <Ghost style={{ right: -40, top: 10 }}>menu</Ghost>
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>Menu</Eyebrow><h2 className="disp">Yang sering dipesan</h2></div><a className="btn btn-ink" href="#/menu">Lihat {TOTAL} menu</a></div>
        <div className="grid4">
          {PRODS.map(p => (
            <article key={p.name} className="card prod reveal">
              <div className={`slot ${p.mat} ${p.drink ? '' : 'food'}`}><img className={p.drink ? 'drink' : ''} src={`/img/${p.img}.webp`} alt={p.name} /></div>
              <h3>{p.name}</h3><p>{p.line}</p>
              <div className="row">{p.meta}<Key p={p.price} /></div>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="dark">
      <Ghost style={{ right: -20, bottom: -80, color: 'rgba(255,255,255,.035)' }}>A B C D</Ghost>
      <div className="wrap nut">
        <div className="reveal">
          <Eyebrow color="#7FE07B">Nutrition level</Eyebrow>
          <h2 className="disp">Tahu isinya, baru minum.</h2>
          <p style={{ marginTop: 22, fontSize: 18, lineHeight: 1.6, color: '#C3C6BE' }}>Tiap minuman di menu punya label A sampai D untuk kadar gulanya. Makanan kami tulis kalorinya. Jadi milihnya gampang.</p>
          <p className="hand" style={{ marginTop: 22, fontSize: 26, color: '#7FE07B' }}>pertama di kedai kopi Malang</p>
        </div>
        <div className="tiles">
          {([['A', 'Gula paling rendah', 'Espresso, Long Black, Pour Over'], ['C', 'Gula sedang', 'Latte, Cappuccino, RTD Coffee'], ['D', 'Gula lebih tinggi', 'Cloud Series, Matcha Latte']] as const).map(([l, h, e]) => (
            <div key={l} className="tile reveal"><Token l={l} /><h4>{h}</h4><p>{e}</p></div>
          ))}
          <div className="tile receipt reveal">
            <b className="muted" style={{ fontSize: 12, letterSpacing: '.2em' }}>STRUK MAKAN</b>
            <div style={{ borderTop: '2px dashed var(--line)', paddingTop: 12 }}><span>Easy-Nasgor</span><b>±640</b></div>
            <div><span>Pad Kra Pao</span><b>±312</b></div><div><span>Soft-Panna</span><b>±218</b></div>
            <h4 style={{ borderTop: '2px dashed var(--line)', paddingTop: 12 }}>kcal di tiap piring</h4>
          </div>
        </div>
      </div>
    </section>

    <section className="early">
      <div className="wrap">
        <div className="reveal">
          <Eyebrow color="var(--navy)">07.00 sampai 12.00</Eyebrow>
          <h2 className="disp">Early set</h2>
          <span className="tag" style={{ height: 40, fontSize: 16, marginTop: 16, transform: 'rotate(-3deg)' }}>TILL 12PM</span>
          <p style={{ marginTop: 24, fontSize: 18, lineHeight: 1.55 }}>Makanan dan minuman berpasangan dengan harga pagi.</p>
          <p className="hand" style={{ marginTop: 18, fontSize: 26, color: 'var(--navy)' }}>your morning, made easier</p>
        </div>
        <div className="tickets">
          {SETS.map(([img, n, d, o, p]) => (
            <article key={n} className="card ticket reveal">
              <div className="slot food steel" style={{ height: 210 }}><img src={`/img/${img}.webp`} alt={`${n} ${d}`} /></div>
              <hr /><h3>{n}</h3><p className="muted">{d}</p>
              <div className="row" style={{ justifyContent: 'flex-end' }}><Key p={p} old={o} tone="navy" /></div>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="daily">
      <div className="tex" />
      <div className="wrap reveal">
        <Eyebrow color="var(--butter)">Daily step · 07.00 sampai 12.00</Eyebrow>
        <div className="big" style={{ marginTop: 22 }}>2.000</div>
        <div className="disp" style={{ fontSize: 'clamp(28px,4vw,46px)' }}>langkah</div>
        <div className="bar"><i /></div>
        <p style={{ margin: '30px auto 0', maxWidth: 600, fontSize: 20, lineHeight: 1.55, color: '#D5D8D0' }}>Tunjukkan hitungan langkahmu di kasir sebelum jam 12. Panna Cotta-nya gratis.</p>
      </div>
      <div className="sticker"><div><small><b>GRATIS</b></small><div className="disp" style={{ fontSize: 20 }}>Panna<br />Cotta</div></div></div>
    </section>

    <section className="rtd">
      <Ghost style={{ right: -30, bottom: -90, color: 'rgba(255,255,255,.1)' }}>ready</Ghost>
      <div className="wrap">
        <div className="reveal">
          <div className="eyebrow">Ready to drink</div>
          <h2 className="disp">RTD, ready when you are.</h2>
          <p style={{ marginTop: 18, fontSize: 19, lineHeight: 1.55 }}>Kopi dan cold-pressed dalam kaleng. Ambil dari kulkas, bawa ke mana saja.</p>
          <div className="rows">
            {[['Classic', 'Kopi susu, pecan praline', '40 K'], ['Fruity', 'Espresso fruity, susu segar', '40 K'], ['Decaf', 'Decaf espresso, sorghum sugar', '40 K'], ['Sunset Soother', 'Semangka, citrus, stroberi', '38 K'], ['Sunrise Booster', 'Cold-pressed segar', '38 K']].map(([n, d, p]) => (
              <div key={n}><span><b>{n}</b> · {d}</span><Key p={p} tone="ink" /></div>
            ))}
          </div>
        </div>
        <div className="fridge reveal"><img src="/img/p-rtd-decaf.webp" alt="RTD Decaf" /><img src="/img/p-rtd-sunset.webp" alt="RTD Sunset Soother" /></div>
      </div>
    </section>

    <section className="inside" id="inside">
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>Inside</Eyebrow><h2 className="disp">Inside the box</h2></div><p style={{ maxWidth: 440, fontSize: 19, lineHeight: 1.55 }}>Some spaces are made to be looked at. Ours are made to be used. Duduk sebentar atau seharian.</p></div>
        <div className="photos">
          <div className="pola reveal" style={{ rotate: '-2deg' }}><img src="/img/ig30.webp" alt="Dinding plywood dengan kotak hijau di dalam Greenbox" /></div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
              <div className="pola reveal" style={{ rotate: '2.5deg' }}><img src="/img/ig19.webp" alt="Sofa hijau" /></div>
              <div className="pola reveal" style={{ rotate: '-1.5deg' }}><img src="/img/ig17.webp" alt="Pengunjung bekerja di meja" /></div>
            </div>
            <div className="card info reveal" id="lokasi">
              <div style={{ padding: '26px 28px' }}>
                <b className="muted" style={{ fontSize: 12, letterSpacing: '.2em' }}>SATU KOTAK, TIAP HARI.</b>
                <h3 className="disp" style={{ fontSize: 28, marginTop: 6 }}>greenbox</h3>
                <p style={{ marginTop: 10 }}>Jl. Nusakambangan No. 42, Kasin, Klojen, Malang</p>
                <p style={{ marginTop: 6, fontWeight: 700, color: '#14800F' }}>07.00 sampai 22.00 (last order)</p>
                <div className="chips"><span className="chip">Ramah WFC</span><span className="chip">Ruang artwork</span><span className="chip">Mushola</span></div>
              </div>
              <div><a className="btn btn-green" href={WA} style={{ height: 48, fontSize: 14 }}>Reservasi</a><a href={MAPS} style={{ fontWeight: 700 }}>Peta</a></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="feed">
      <div className="tex noise" />
      <div className="wrap">
        <div className="head reveal"><div><Eyebrow>@inside.greenbox</Eyebrow><h2 className="disp">Yang lewat di feed</h2></div><a className="btn btn-ink" href="https://www.instagram.com/inside.greenbox/" style={{ height: 46, fontSize: 13 }}>Instagram</a></div>
        <div className="feed">
          {FEED.map(([img, t, r, path]) => (
            <a key={img} className="pola reveal" style={{ rotate: `${r}deg` }} href={`https://www.instagram.com/${path || 'inside.greenbox/'}`}>
              <img src={`/img/${img}.webp`} alt={t} /><span className="tag">{t}</span>
            </a>
          ))}
        </div>
      </div>
    </section>

    <section className="cta">
      <Ghost style={{ left: -20, bottom: -70 }}>reservasi</Ghost>
      <div className="wrap">
        <div className="reveal">
          <h2 className="disp">Get your key to stay inside.</h2>
          <p style={{ marginTop: 28, maxWidth: 600, fontSize: 21, lineHeight: 1.55 }}>Reservasi meja atau tanya menu lewat WhatsApp. Satu nomor resmi: 0819-3786-6638.</p>
          <a className="btn btn-ink" href={WA} style={{ marginTop: 34, height: 62, fontSize: 17 }}>Chat 0819-3786-6638</a>
        </div>
        <div className="keychain" aria-hidden="true"><div><span className="emboss">GREEN<br />BOX</span></div></div>
      </div>
    </section>
    <Footer />
  </>)
}

const ServeIcon = ({ s }: { s: Serve }) => <span className="ic">{s !== 'ice' && <Hot />}{s !== 'hot' && <Ice />}</span>

function Menu() {
  const groups = [...DRINKS, ...FOODS]
  const panel = (id: string, title: string, note: string, color: string, body: ReactNode) => (
    <div key={id} id={id} className="card panel reveal">
      <h2><i className="bean" style={{ width: 16, height: 16, background: color }} />{title}<span className="hand muted" style={{ marginLeft: 'auto', fontSize: 20, fontFamily: 'Covered By Your Grace', fontWeight: 400 }}>{note}</span></h2>
      {body}
    </div>
  )
  const drinks = (g: typeof DRINKS[number]) => panel(g.id, g.title, g.note, g.color, g.items.map((it, i) => (
    <div key={it.name} className="item">
      <span>{String(i + 1).padStart(2, '0')}</span><b>{it.name}</b>
      {it.beans && <span style={{ display: 'flex', gap: 4 }}>{[...it.beans].map(c => <i key={c} className="bean" style={{ background: BEANS[c][1] }} title={BEANS[c][0]} />)}</span>}
      <Token l={it.level} /><ServeIcon s={it.serve} /><span className="price">{it.price}</span>
    </div>
  )))
  const foods = (g: typeof FOODS[number]) => panel(g.id, g.title, g.note, g.color, g.items.map((it, i) => (
    <div key={it.name} className="item">
      <span>{String(i + 1).padStart(2, '0')}</span><b>{it.name}{it.desc && <small>{it.desc}</small>}</b>
      <span className="chip">{it.kcal}</span><span className="price">{it.price}</span>
    </div>
  )))
  const milk = panel('milk', 'Milk option', 'tambahan', '#D9C6A4', MILK.map(([n, p]) => <div key={n} className="item"><span /><b>{n}</b><span className="price">{p}</span></div>))
  const [esp, filt, cloud, rtd, non, tea, ref] = DRINKS.map(drinks)
  return (<>
    <section className="hero" style={{ minHeight: 0, paddingBottom: 40 }}>
      <div className="tex beton" /><div className="tex noise" />
      <Ghost style={{ right: -40, top: 140 }}>menu</Ghost>
      <div className="wrap">
        <Header page="menu" />
        <div className="head reveal" style={{ marginTop: 40 }}>
          <div><Eyebrow>Menu · September 2026</Eyebrow><h1 className="disp" style={{ fontSize: 'clamp(48px,8vw,110px)', marginTop: 18 }}>{TOTAL} menu,<br />semua jelas.</h1>
            <p className="lead" style={{ fontSize: 19 }}>Minuman berlabel nutrition level, makanan berlabel kalori. Harga dalam ribu rupiah.</p></div>
          <div className="sticker" style={{ width: 210, height: 130, background: 'linear-gradient(160deg,#2D55B0,var(--navy) 60%)', borderColor: 'var(--navy-lo)', color: '#fff' }}><span className="disp" style={{ fontSize: 26 }}>Make it<br />easier</span></div>
        </div>
        <div className="card legend reveal">
          <b>BIJI KOPI</b>{Object.values(BEANS).map(([n, c]) => <span key={n}><i className="bean" style={{ background: c }} />{n}</span>)}
          <b>NUTRITION LEVEL</b>{([['A', 'Gula paling rendah'], ['C', 'Sedang'], ['D', 'Lebih tinggi']] as const).map(([l, t]) => <span key={l}><Token l={l} />{t}</span>)}
          <span className="ic" style={{ width: 'auto' }}><Hot /> Panas</span><span className="ic" style={{ width: 'auto' }}><Ice /> Dingin</span>
        </div>
        <nav className="tabs" aria-label="Kategori menu" style={{ display: 'flex', position: 'static', boxShadow: 'inset 0 3px 6px rgba(0,0,0,.18)' }}>
          {groups.map(g => <a key={g.id} href={`#/menu/${g.id}`}>{g.title} <small className="muted">{g.items.length}</small></a>)}
        </nav>
      </div>
    </section>
    <section style={{ background: 'var(--paper2)', paddingTop: 56 }}>
      <div className="wrap">
        <div className="cols">
          <div>{esp}{filt}{non}{tea}{ref}</div>
          <div>{cloud}{milk}{rtd}</div>
        </div>
        <div className="head reveal" style={{ marginTop: 100 }}><div><Eyebrow>Dapur</Eyebrow><h2 className="disp" style={{ fontSize: 'clamp(48px,7vw,88px)' }}>Food</h2></div><p className="hand" style={{ fontSize: 26 }}>angka kalori untuk satu porsi</p></div>
        <div className="grid4" style={{ marginBottom: 40 }}>
          {[['c-easy-nasgor', 'Easy-Nasgor', '35 K', 'steel'], ['c-beef-sando', 'Beef-Sando', '53 K', 'ply'], ['c-pad-kra-pao', 'Pad Kra Pao', '35,5 K', 'concrete'], ['c-fries', 'Potato Fries', '20 K', 'boxgreen']].map(([img, n, p, m]) => (
            <article key={n} className="card prod reveal" style={{ marginTop: 0 }}>
              <div className={`slot food ${m}`}><img src={`/img/${img}.webp`} alt={n} /></div>
              <div className="row"><h3 style={{ marginTop: 0 }}>{n}</h3><Key p={p} /></div>
            </article>
          ))}
        </div>
        <div className="cols">{FOODS.map(foods)}</div>
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
  const [, page = '', anchor = ''] = hash.split('/')
  const isMenu = page === 'menu'
  useReveal(isMenu ? 'menu' : 'home')
  useEffect(() => {
    const id = isMenu ? anchor : page
    if (id) document.getElementById(id)?.scrollIntoView()
    else scrollTo(0, 0)
  }, [hash, isMenu, anchor, page])
  return isMenu ? <Menu /> : <Home />
}
