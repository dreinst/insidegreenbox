import { useState } from 'react'
import { CATS, fmt } from '../store'
import { hppOf, margin, type Rec } from './hitung'
import { avgMap, catat } from './aksi'
import { ICON, Rp, Sel, Title, useA } from './kit'
import { Stats, rp } from './umum'

const CAT = Object.fromEntries(CATS)

export default function ResepPage() {
  const { st, me, commit } = useA()
  const [sel, setSel] = useState(st.items.find(i => st.recipes[i.id])?.id ?? st.items[0]?.id ?? '')
  const [q, setQ] = useState('')
  const avg = avgMap(st)
  const item = st.items.find(i => i.id === sel)
  const rec = st.recipes[sel] ?? []
  const unit = (id: string) => st.ings.find(i => i.id === id)?.unit ?? ''
  const withRec = st.items.filter(i => st.recipes[i.id]?.length)
  const needle = q.trim().toLowerCase()
  const rows = st.items.filter(i => i.name.toLowerCase().includes(needle))
  const hppSel = hppOf(rec, avg)
  const mg = item ? margin(item.price, hppSel) : { rp: 0, pct: 0 }

  const setRec = (next: Rec[], what: string) => commit(s => {
    const recipes = { ...s.recipes }
    if (next.length) recipes[sel] = next; else delete recipes[sel]
    return catat({ ...s, recipes }, me.name, `${what} resep ${item?.name ?? sel}`)
  })
  const upd = (i: number, p: Partial<Rec>) => commit(s => ({ ...s, recipes: { ...s.recipes, [sel]: (s.recipes[sel] ?? []).map((r, k) => k === i ? { ...r, ...p } : r) } }))
  const used = new Set(rec.map(r => r.ing))
  const free = st.ings.find(i => !used.has(i.id))

  return (<>
    <Title t="Resep" sub="Takaran bahan per porsi. Dari sini HPP dan margin dihitung, dan stok berkurang saat produk terjual." />
    <p className="info sample" role="note">Data contoh: takaran dan harga bahan perkiraan untuk demo. Sesuaikan dengan resep kafe sebelum dipakai.</p>
    <Stats rows={[['Produk', st.items.length], ['Punya resep', withRec.length, 'memotong stok saat terjual'], ['Tanpa resep', st.items.length - withRec.length, 'tidak memotong stok']]} />
    <div className="resep">
      <div className="card tbl">
        <div className="a-bar tight pad"><b>Produk</b><label className="inp find">{ICON.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk" aria-label="Cari produk" /></label></div>
        <table>
          <thead><tr><th>Produk</th><th className="r">Harga</th><th className="r">HPP</th><th className="r">Margin</th><th /></tr></thead>
          <tbody>{rows.map(i => {
            const has = !!st.recipes[i.id]?.length
            const h = hppOf(st.recipes[i.id] ?? [], avg)
            return (
              <tr key={i.id} className={i.id === sel ? 'cur' : ''}>
                <td className="c-nama">{i.name}<small className="mut">{CAT[i.cat]}</small></td>
                <td className="r nowrap">{rp(i.price)}</td>
                <td className="r nowrap">{has ? rp(h) : <span className="badge warnb">Tanpa resep</span>}</td>
                <td className="r nowrap">{has ? `${fmt(margin(i.price, h).pct)}%` : '-'}</td>
                <td className="c-edit"><button type="button" className="lnk" aria-label={`Atur resep ${i.name}`} onClick={() => setSel(i.id)}>Atur</button></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>

      {item && (
        <section className="card apanel stack redit" aria-labelledby="h-re">
          <div><h2 id="h-re" className="aph">{item.name}</h2><p className="mut">{CAT[item.cat]}, harga jual {rp(item.price)}</p></div>
          {!rec.length && <p className="info">Produk ini belum punya resep, jadi penjualannya tidak memotong stok.</p>}
          <ul className="rlines">{rec.map((r, i) => (
            <li key={r.ing}>
              <Sel label={`Bahan baris ${i + 1}`} v={r.ing} set={ing => upd(i, { ing })} opts={st.ings.filter(x => x.id === r.ing || !used.has(x.id)).map(x => [x.id, x.name])} />
              <Rp v={r.qty} set={qty => upd(i, { qty })} label={`Takaran ${st.ings.find(x => x.id === r.ing)?.name}`} unit={unit(r.ing)} cls="sm" />
              <span className="cost nowrap">{rp(Math.round(r.qty * (avg[r.ing] ?? 0)))}</span>
              <button type="button" className="mini danger" aria-label={`Hapus bahan baris ${i + 1}`} onClick={() => setRec(rec.filter((_, k) => k !== i), 'Ubah')}>{ICON.x}</button>
            </li>
          ))}</ul>
          <div><button type="button" className="btn btn-line" disabled={!free} onClick={() => free && setRec([...rec, { ing: free.id, qty: 1 }], 'Ubah')}>{ICON.plus}Tambah bahan</button></div>
          <dl className="sum">
            <div><dt>HPP per porsi</dt><dd>{rp(hppSel)}</dd></div>
            <div><dt>Harga jual</dt><dd>{rp(item.price)}</dd></div>
            <div className="gt"><dt>Margin</dt><dd>{rp(mg.rp)} ({fmt(mg.pct)}%)</dd></div>
          </dl>
        </section>
      )}
    </div>
  </>)
}
