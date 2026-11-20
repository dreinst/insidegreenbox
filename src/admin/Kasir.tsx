import { useMemo, useState } from 'react'
import { CATS, discountOf, findMember, fmt, tierOf, type Sale } from '../store'
import { kembalian, totals, usage, type Method } from './hitung'
import { bayar, recipeOf, shiftOpen, stockMap, type Keranjang } from './aksi'
import { Bare, ICON, Rp, Title, useA } from './kit'
import { METHODS, METODE, Struk, rp } from './umum'

type Tile = { kind: 'item' | 'set'; id: string; name: string; sub: string; price: number; cat: string }

export default function KasirPage() {
  const { st, me, commit } = useA()
  const shift = shiftOpen(st, me.id)
  const [mode, setMode] = useState<'dinein' | 'takeaway'>('dinein')
  const [table, setTable] = useState('')
  const [cat, setCat] = useState('semua')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<Keranjang[]>([])
  const [wa, setWa] = useState('')
  const [memberId, setMemberId] = useState('')
  const [waMsg, setWaMsg] = useState('')
  const [method, setMethod] = useState<Method>('tunai')
  const [paid, setPaid] = useState(0)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Sale | null>(null)

  const member = st.members.find(m => m.id === memberId)
  const mPct = member ? discountOf(member, st.tiers) : 0
  const sets = st.promo.earlyOn ? st.promo.sets.filter(e => e.on) : []
  const tiles: Tile[] = useMemo(() => [
    ...sets.map((e): Tile => ({ kind: 'set', id: e.id, name: e.name, sub: `+ ${e.pair}`, price: e.price, cat: 'set' })),
    ...st.items.filter(i => i.on).map((i): Tile => ({ kind: 'item', id: i.id, name: i.name, sub: '', price: i.price, cat: i.cat })),
  ], [st.items, st.promo.earlyOn, st.promo.sets]) // eslint-disable-line react-hooks/exhaustive-deps
  const info = (k: Keranjang) => tiles.find(t => t.kind === k.kind && t.id === k.id)

  // Pemakaian bahan oleh isi keranjang, dipakai untuk menandai menu yang bahannya tidak cukup lagi.
  const stock = stockMap(st)
  const used: Record<string, number> = {}
  for (const u of usage(cart.map(l => ({ qty: l.qty, recipe: recipeOf(st, l.kind, l.id) })))) used[u.ing] = u.qty
  const lack = (kind: 'item' | 'set', id: string) => {
    const r = recipeOf(st, kind, id).find(x => x.qty + (used[x.ing] ?? 0) > (stock[x.ing] ?? 0))
    return r ? st.ings.find(i => i.id === r.ing)?.name ?? r.ing : ''
  }

  const rows = cart.map(l => ({ price: info(l)?.price ?? 0, qty: l.qty, reg: l.kind === 'item' }))
  const t = totals(rows, mPct, st.fees)
  const canPay = !!shift && cart.length > 0 && (mode === 'takeaway' || table.trim() !== '') && (method !== 'tunai' || paid >= t.total)

  const needle = q.trim().toLowerCase()
  const shown = tiles.filter(x => (cat === 'semua' || x.cat === cat) && x.name.toLowerCase().includes(needle))
  const usedCats = CATS.filter(([id]) => st.items.some(i => i.on && i.cat === id))

  const add = (x: Tile) => { setErr(''); setCart(c => c.some(l => l.kind === x.kind && l.id === x.id) ? c.map(l => l.kind === x.kind && l.id === x.id ? { ...l, qty: l.qty + 1 } : l) : [...c, { kind: x.kind, id: x.id, qty: 1, note: '' }]) }
  const step = (k: Keranjang, d: number) => setCart(c => c.map(l => l === k ? { ...l, qty: l.qty + d } : l).filter(l => l.qty > 0))
  const note = (k: Keranjang, v: string) => setCart(c => c.map(l => l === k ? { ...l, note: v } : l))
  const find = () => {
    const m = findMember(st, wa)
    if (!m) { setMemberId(''); setWaMsg('Nomor ini belum terdaftar sebagai member.'); return }
    setMemberId(m.id); setWaMsg('')
  }
  const reset = () => { setCart([]); setTable(''); setWa(''); setMemberId(''); setWaMsg(''); setPaid(0); setMethod('tunai'); setErr('') }
  const pay = () => {
    if (!shift || !canPay) return
    const out: { sale?: Sale; msg: string } = { msg: '' }
    const saved = commit(s => {
      const r = bayar(s, { by: me, shift: shift.id, mode, table: table.trim(), lines: cart, member, memberPct: mPct, method, paid })
      if ('err' in r) { out.msg = r.err; return s }
      out.sale = r.sale
      return r.s
    })
    if (out.sale && saved) { setDone(out.sale); reset() } else if (out.msg) setErr(out.msg)
  }

  if (!shift) return (<>
    <Title t="Kasir" sub="Buat pesanan dan terima pembayaran." cls="sm" />
    <section className="card apanel stack gate" aria-labelledby="h-gate">
      <h2 id="h-gate" className="aph">Buka shift dulu</h2>
      <p className="mut">Transaksi hanya bisa dibuat saat ada shift terbuka atas nama {me.name}. Isi modal kas awal di halaman Shift.</p>
      <div><a className="btn btn-green" href="#/admin/shift">{ICON.till}Ke halaman Shift</a></div>
    </section>
  </>)

  const quick = [...new Set([t.total, Math.ceil(t.total / 50000) * 50000, Math.ceil(t.total / 100000) * 100000])].filter(n => n >= t.total && n > 0)
  return (<>
    <Title t="Kasir" sub={`Shift ${me.name}. Pilih menu, lalu bayar.`} cls="sm" />
    <div className="kasir">
      <div className="kmenu">
        <div className="a-bar tight">
          <div className="pills" role="group" aria-label="Mode penjualan">
            <button type="button" className={mode === 'dinein' ? 'on' : ''} aria-pressed={mode === 'dinein'} onClick={() => setMode('dinein')}>Dine in</button>
            <button type="button" className={mode === 'takeaway' ? 'on' : ''} aria-pressed={mode === 'takeaway'} onClick={() => setMode('takeaway')}>Take away</button>
          </div>
          {mode === 'dinein' && <label className="inp mini-in"><span className="unit">Meja</span><input aria-label="Nomor meja" inputMode="text" maxLength={4} value={table} onChange={e => setTable(e.target.value)} placeholder="No." /></label>}
          <label className="inp find">{ICON.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari menu" aria-label="Cari menu" /></label>
        </div>
        <div className="pills cats-bar" role="group" aria-label="Kategori menu">
          <button type="button" className={cat === 'semua' ? 'on' : ''} aria-pressed={cat === 'semua'} onClick={() => setCat('semua')}>Semua</button>
          {sets.length > 0 && <button type="button" className={cat === 'set' ? 'on' : ''} aria-pressed={cat === 'set'} onClick={() => setCat('set')}>Early set</button>}
          {usedCats.map(([id, n]) => <button key={id} type="button" className={cat === id ? 'on' : ''} aria-pressed={cat === id} onClick={() => setCat(id)}>{n}</button>)}
        </div>
        <ul className="mtiles">{shown.map(x => {
          const lk = lack(x.kind, x.id)
          const n = cart.find(l => l.kind === x.kind && l.id === x.id)?.qty ?? 0
          return (
            <li key={x.kind + x.id}>
              <button type="button" className={`mtile${x.kind === 'set' ? ' set' : ''}${lk ? ' out' : ''}`} disabled={!!lk} onClick={() => add(x)} aria-label={`${x.name}, ${rp(x.price)}${lk ? `, bahan habis: ${lk}` : ''}`}>
                {x.kind === 'set' && <i className="etag">Early set</i>}
                <b>{x.name}</b>
                {x.sub && <small>{x.sub}</small>}
                <span className="pr">{rp(x.price)}</span>
                {lk && <em>Bahan habis: {lk}</em>}
                {n > 0 && <span className="qty-b" aria-hidden="true">{n}</span>}
              </button>
            </li>
          )
        })}</ul>
        {!shown.length && <p className="empty">Tidak ada menu yang cocok.</p>}
      </div>

      <aside className="card kcart" aria-label="Keranjang">
        <h2 className="aph">Pesanan {mode === 'dinein' ? (table ? `meja ${table}` : 'dine in') : 'take away'}</h2>
        <ul className="clines">{cart.map(l => {
          const x = info(l)
          return (
            <li key={l.kind + l.id}>
              <div className="cl-top"><b>{x?.name ?? l.id}</b><span>{rp((x?.price ?? 0) * l.qty)}</span></div>
              {l.kind === 'set' && <small className="mut">Early set, tanpa potongan member</small>}
              <div className="cl-bot">
                <span className="stepper">
                  <button type="button" aria-label={`Kurangi ${x?.name}`} onClick={() => step(l, -1)}>{ICON.minus}</button>
                  <output aria-label={`Jumlah ${x?.name}`}>{l.qty}</output>
                  <button type="button" aria-label={`Tambah ${x?.name}`} disabled={!!lack(l.kind, l.id)} onClick={() => step(l, 1)}>{ICON.plus}</button>
                </span>
                <Bare label={`Catatan ${x?.name}`} v={l.note} set={v => note(l, v)} placeholder="Catatan" maxLength={40} cls="sm-in" />
              </div>
            </li>
          )
        })}</ul>
        {!cart.length && <p className="empty">Belum ada item. Ketuk menu di kiri.</p>}

        <div className="kmember">
          {member ? (
            <p className="mrow"><span><b>{member.name}</b><small>{tierOf(member, st.tiers).name}, potongan {mPct}%</small></span>
              <button type="button" className="mini" onClick={() => { setMemberId(''); setWa('') }}>Lepas</button></p>
          ) : (
            <div className="addrow">
              <label className="inp"><input aria-label="Nomor WhatsApp member" type="tel" inputMode="tel" placeholder="WhatsApp member" value={wa} onChange={e => setWa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') find() }} /></label>
              <button type="button" className="btn btn-line" disabled={wa.replace(/\D/g, '').length < 5} onClick={find}>Cari</button>
            </div>
          )}
          {waMsg && <p className="warn" role="alert">{waMsg}</p>}
        </div>

        <dl className="sum">
          <div><dt>Subtotal</dt><dd>{rp(t.sub)}</dd></div>
          {t.disc > 0 && <div><dt>Potongan member {mPct}%</dt><dd>-{rp(t.disc)}</dd></div>}
          {st.fees.svc > 0 && <div><dt>Service {st.fees.svc}%</dt><dd>{rp(t.svc)}</dd></div>}
          {st.fees.tax > 0 && <div><dt>Pajak {st.fees.tax}%</dt><dd>{rp(t.tax)}</dd></div>}
          <div className="gt"><dt>Total</dt><dd>{rp(t.total)}</dd></div>
        </dl>

        <div className="pills" role="group" aria-label="Metode bayar">{METHODS.map(k => (
          <button key={k} type="button" className={method === k ? 'on' : ''} aria-pressed={method === k} onClick={() => setMethod(k)}>{METODE[k]}</button>
        ))}</div>
        {method === 'tunai' && (
          <div className="cash">
            <div className="field"><span>Uang diterima</span><Rp v={paid} set={setPaid} label="Uang diterima" cls="bold" /></div>
            <div className="quick">{quick.map(n => <button key={n} type="button" className="mini" onClick={() => setPaid(n)}>{n === t.total ? 'Uang pas' : fmt(n)}</button>)}</div>
            <p className="chg">Kembalian <b>{rp(kembalian(t.total, paid))}</b>{paid > 0 && paid < t.total && <em> (kurang {rp(t.total - paid)})</em>}</p>
          </div>
        )}
        {err && <p className="warn" role="alert">{err}</p>}
        {mode === 'dinein' && !table.trim() && cart.length > 0 && <p className="mut small">Isi nomor meja untuk dine in.</p>}
        <button type="button" className="btn btn-green pay" disabled={!canPay} onClick={pay}>{ICON.check}Bayar {cart.length ? rp(t.total) : ''}</button>
        {cart.length > 0 && <button type="button" className="lnk clear" onClick={reset}>Kosongkan pesanan</button>}
      </aside>
    </div>
    {done && <Struk sale={done} info={st.info} onClose={() => setDone(null)} closeLabel="Transaksi baru" />}
  </>)
}
