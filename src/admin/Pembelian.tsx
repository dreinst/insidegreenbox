import { useState, type FormEvent } from 'react'
import type { PO, POLine } from '../store'
import { Ask, ICON, Rp, Sel, Title, Txt, uid, useA, when } from './kit'
import { Stats, Tabel, rp } from './umum'
import { catat, terimaPO } from './aksi'

const STATUS = { draf: 'Draf', dipesan: 'Dipesan', diterima: 'Diterima' }
const total = (p: { lines: POLine[] }) => p.lines.reduce((a, l) => a + l.qty * l.price, 0)

export default function PembelianPage() {
  const { st, me, commit } = useA()
  const [tab, setTab] = useState<'po' | 'pemasok'>('po')
  const [edit, setEdit] = useState<PO | null>(null)
  const [view, setView] = useState('')
  const sup = (id: string) => st.suppliers.find(s => s.id === id)?.name ?? '-'
  const ing = (id: string) => st.ings.find(i => i.id === id)
  const list = [...st.pos].sort((a, b) => b.created - a.created)
  const open = st.pos.filter(p => p.status === 'dipesan')
  const viewed = st.pos.find(p => p.id === view)

  const baru = () => {
    if (!st.suppliers.length) return
    setView('')
    setEdit({ id: '', no: '', supplier: st.suppliers[0].id, status: 'draf', created: Date.now(), by: me.name, note: '', lines: [] })
  }
  const pesan = (id: string) => commit(s => catat({ ...s, pos: s.pos.map(p => p.id === id ? { ...p, status: 'dipesan', ordered: Date.now() } : p) }, me.name, `Pesan ${s.pos.find(p => p.id === id)?.no}`))
  const hapus = (id: string) => commit(s => catat({ ...s, pos: s.pos.filter(p => p.id !== id) }, me.name, `Hapus draf ${s.pos.find(p => p.id === id)?.no}`))

  return (<>
    <Title t="Pembelian" sub="Pemasok dan purchase order. Barang yang diterima menambah stok dan menghitung ulang harga rata-rata."
      right={tab === 'po' && !edit ? <button type="button" className="btn btn-green" onClick={baru} disabled={!st.suppliers.length}>{ICON.plus}Buat PO</button> : undefined} />
    <Stats rows={[['PO', st.pos.length], ['Menunggu barang', open.length, open.length ? rp(open.reduce((a, p) => a + total(p), 0)) : ''], ['Pemasok', st.suppliers.length]]} />
    <div className="a-bar"><div className="pills" role="group" aria-label="Bagian pembelian">
      <button type="button" className={tab === 'po' ? 'on' : ''} aria-pressed={tab === 'po'} onClick={() => setTab('po')}>Purchase order</button>
      <button type="button" className={tab === 'pemasok' ? 'on' : ''} aria-pressed={tab === 'pemasok'} onClick={() => setTab('pemasok')}>Pemasok</button>
    </div></div>

    {tab === 'po' && edit && <Editor key={edit.id || 'baru'} po={edit} done={() => setEdit(null)} />}
    {tab === 'po' && !edit && <>
      <div className="card tbl"><table>
        <thead><tr><th>Nomor</th><th>Pemasok</th><th>Dibuat</th><th className="r">Bahan</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
        <tbody>{list.map(p => (
          <tr key={p.id}>
            <td className="c-nama">{p.no}</td><td>{sup(p.supplier)}</td><td className="nowrap">{when(p.created)}</td>
            <td className="r">{p.lines.length}</td><td className="r nowrap">{rp(total(p))}</td>
            <td><span className={`badge ${p.status === 'diterima' ? 'good' : p.status === 'dipesan' ? 'warnb' : ''}`}>{STATUS[p.status]}</span></td>
            <td className="c-edit"><span className="acts">
              <button type="button" className="lnk" onClick={() => setView(view === p.id ? '' : p.id)} aria-label={`Rincian ${p.no}`}>Rincian</button>
              {p.status === 'draf' && <button type="button" className="lnk" onClick={() => setEdit(p)} aria-label={`Ubah ${p.no}`}>Ubah</button>}
              {p.status === 'draf' && p.lines.length > 0 && <button type="button" className="mini" onClick={() => pesan(p.id)}>Pesan</button>}
              {p.status === 'dipesan' && <Ask label="Terima barang" ask={`Stok ${p.lines.length} bahan bertambah. Lanjut?`} yes={() => commit(s => terimaPO(s, p.id, me.name))} cls="mini" />}
              {p.status === 'draf' && <Ask label="Hapus" ask={`Hapus ${p.no}?`} yes={() => hapus(p.id)} />}
            </span></td>
          </tr>
        ))}</tbody>
      </table>{!list.length && <p className="empty">Belum ada purchase order.</p>}</div>
      {viewed && (
        <Tabel title={`Rincian ${viewed.no}`} note={`${sup(viewed.supplier)}${viewed.note ? `. ${viewed.note}` : ''}${viewed.received ? `. Diterima ${when(viewed.received)}` : ''}`}
          cols={[{ h: 'Bahan' }, { h: 'Jumlah', num: true }, { h: 'Satuan' }, { h: 'Harga satuan', money: true }, { h: 'Subtotal', money: true }]}
          rows={viewed.lines.map(l => [ing(l.ing)?.name ?? l.ing, l.qty, ing(l.ing)?.unit ?? '', l.price, l.qty * l.price])} foot={['Total', '', '', '', total(viewed)]} />
      )}
    </>}

    {tab === 'pemasok' && <Pemasok />}
  </>)

  function Editor({ po, done }: { po: PO; done: () => void }) {
    const [d, setD] = useState<PO>(po)
    const used = new Set(d.lines.map(l => l.ing))
    const free = st.ings.find(i => !used.has(i.id))
    const setLine = (i: number, p: Partial<POLine>) => setD(o => ({ ...o, lines: o.lines.map((l, k) => k === i ? { ...l, ...p } : l) }))
    const save = (order: boolean) => {
      const lines = d.lines.filter(l => l.qty > 0)
      const next: PO = { ...d, lines, status: order ? 'dipesan' : 'draf', ordered: order ? Date.now() : undefined }
      const saved = commit(s => {
        if (po.id) return catat({ ...s, pos: s.pos.map(p => p.id === po.id ? next : p) }, me.name, `${order ? 'Pesan' : 'Simpan draf'} ${po.no}`)
        const no = `PO-${String(s.pos.length + 1).padStart(3, '0')}`
        return catat({ ...s, pos: [...s.pos, { ...next, id: uid('po'), no }] }, me.name, `${order ? 'Buat dan pesan' : 'Buat draf'} ${no}`)
      })
      if (saved) done()
    }
    return (
      <form className="card apanel stack" aria-labelledby="h-po" onSubmit={(e: FormEvent) => { e.preventDefault(); save(false) }}>
        <h2 id="h-po" className="aph">{po.no ? `Ubah ${po.no}` : 'Purchase order baru'}</h2>
        <div className="fgrid">
          <label className="field"><span>Pemasok</span><Sel label="Pemasok" v={d.supplier} set={supplier => setD(o => ({ ...o, supplier }))} opts={st.suppliers.map(s => [s.id, s.name])} /></label>
          <Txt label="Catatan" v={d.note} set={note => setD(o => ({ ...o, note }))} maxLength={80} />
        </div>
        <ul className="rlines po">{d.lines.map((l, i) => (
          <li key={l.ing}>
            <Sel label={`Bahan baris ${i + 1}`} v={l.ing} set={v => setLine(i, { ing: v, price: ing(v)?.avg ?? 0 })} opts={st.ings.filter(x => x.id === l.ing || !used.has(x.id)).map(x => [x.id, x.name])} />
            <Rp v={l.qty} set={qty => setLine(i, { qty })} label={`Jumlah baris ${i + 1}`} unit={ing(l.ing)?.unit ?? ''} cls="sm" />
            <Rp v={l.price} set={price => setLine(i, { price })} label={`Harga satuan baris ${i + 1}`} cls="sm" zero />
            <span className="cost nowrap">{rp(l.qty * l.price)}</span>
            <button type="button" className="mini danger" aria-label={`Hapus baris ${i + 1}`} onClick={() => setD(o => ({ ...o, lines: o.lines.filter((_, k) => k !== i) }))}>{ICON.x}</button>
          </li>
        ))}</ul>
        <div><button type="button" className="btn btn-line" disabled={!free} onClick={() => free && setD(o => ({ ...o, lines: [...o.lines, { ing: free.id, qty: 0, price: free.avg }] }))}>{ICON.plus}Tambah bahan</button></div>
        <p className="info" role="status">Total {rp(total(d))}. Harga satuan awalnya diisi dari harga rata-rata sekarang, ubah sesuai nota pemasok.</p>
        <div className="a-act">
          <button type="button" className="btn btn-line" onClick={done}>Batal</button>
          <button className="btn btn-line">Simpan draf</button>
          <button type="button" className="btn btn-green" disabled={!d.lines.some(l => l.qty > 0)} onClick={() => save(true)}>{ICON.check}Simpan dan pesan</button>
        </div>
      </form>
    )
  }

  function Pemasok() {
    const [nama, setNama] = useState(''), [kon, setKon] = useState(''), [cat, setCat] = useState('')
    const patch = (id: string, p: Partial<{ name: string; contact: string; note: string }>) => commit(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, ...p } : x) }))
    const add = (e: FormEvent) => {
      e.preventDefault()
      if (commit(s => ({ ...s, suppliers: [...s.suppliers, { id: uid('sp'), name: nama.trim(), contact: kon.trim(), note: cat.trim() }] }))) { setNama(''); setKon(''); setCat('') }
    }
    return (<>
      <section className="card apanel stack" aria-labelledby="h-sp">
        <h2 id="h-sp" className="aph">Pemasok</h2>
        <div className="trows">
          <div className="trow sup head" aria-hidden="true"><span>Nama</span><span>Kontak</span><span>Catatan</span><span /></div>
          {st.suppliers.map(sp => {
            const pakai = st.pos.some(p => p.supplier === sp.id)
            return (
              <div key={sp.id} className="trow sup">
                <span className="inp"><input aria-label={`Nama pemasok ${sp.name}`} value={sp.name} maxLength={50} onChange={e => patch(sp.id, { name: e.target.value })} /></span>
                <span className="inp"><input aria-label={`Kontak ${sp.name}`} value={sp.contact} maxLength={30} onChange={e => patch(sp.id, { contact: e.target.value })} /></span>
                <span className="inp"><input aria-label={`Catatan ${sp.name}`} value={sp.note} maxLength={80} onChange={e => patch(sp.id, { note: e.target.value })} /></span>
                {pakai ? <small className="mut">Dipakai PO</small> : <Ask label="Hapus" ask={`Hapus ${sp.name}?`} yes={() => commit(s => ({ ...s, suppliers: s.suppliers.filter(x => x.id !== sp.id) }))} />}
              </div>
            )
          })}
        </div>
      </section>
      <form className="card apanel stack" onSubmit={add} aria-labelledby="h-sp2">
        <h2 id="h-sp2" className="aph">Tambah pemasok</h2>
        <div className="fgrid g3"><Txt label="Nama" v={nama} set={setNama} required maxLength={50} /><Txt label="Kontak" v={kon} set={setKon} maxLength={30} /><Txt label="Catatan" v={cat} set={setCat} maxLength={80} /></div>
        <div className="a-act"><button className="btn btn-line" disabled={!nama.trim()}>{ICON.plus}Tambah pemasok</button></div>
      </form>
    </>)
  }
}

