import { useState, type FormEvent } from 'react'
import type { Ingredient, MoveType } from '../store'
import { fmt } from '../store'
import { Ask, ICON, Rp, Sel, Title, Txt, uid, useA, when } from './kit'
import { Stats, Tabel, rp } from './umum'
import { catat, sesuaikan, simpanOpname } from './aksi'

const JENIS: Record<MoveType, string> = { awal: 'Stok awal', beli: 'Pembelian', pakai: 'Pemakaian dari penjualan', sesuai: 'Penyesuaian', buang: 'Terbuang', opname: 'Opname', batal: 'Pengembalian dari void' }
const state = (i: Ingredient) => i.stock <= 0 ? 'Habis' : i.stock <= i.min ? 'Menipis' : 'Aman'
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`

export default function StokPage() {
  const { st, me, commit, ok } = useA()
  const atur = ok('stok.atur')
  const [tab, setTab] = useState<'daftar' | 'kartu' | 'opname'>('daftar')
  const [kartu, setKartu] = useState(st.ings[0]?.id ?? '')
  const patch = (id: string, p: Partial<Ingredient>) => commit(s => ({ ...s, ings: s.ings.map(i => i.id === id ? { ...i, ...p } : i) }))
  const low = st.ings.filter(i => i.stock <= i.min)
  const nilai = st.ings.reduce((a, i) => a + Math.round(i.stock * i.avg), 0)
  const tabs: [typeof tab, string][] = [['daftar', 'Daftar bahan'], ['kartu', 'Kartu stok'], ...(atur ? [['opname', 'Stock opname'] as [typeof tab, string]] : [])]

  return (<>
    <Title t="Stok" sub="Bahan baku, peringatan stok menipis, kartu stok, dan opname." />
    <p className="info sample" role="note">Data contoh: bahan, takaran, dan harga di halaman ini perkiraan untuk demo, bukan angka kafe yang sebenarnya.</p>
    <Stats rows={[['Bahan', st.ings.length], ['Menipis atau habis', low.length, low.length ? low.slice(0, 3).map(i => i.name).join(', ') + (low.length > 3 ? ', dan lainnya' : '') : 'Semua aman'], ['Nilai stok', rp(nilai), 'stok x harga rata-rata']]} />
    <div className="a-bar"><div className="pills" role="group" aria-label="Bagian stok">{tabs.map(([k, t]) => (
      <button key={k} type="button" className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{t}</button>
    ))}</div></div>

    {tab === 'daftar' && <>
      <div className="card tbl"><table>
        <thead><tr><th>Bahan</th><th>Satuan</th><th className="r">Stok</th><th>Minimum</th><th className="r">Harga rata-rata</th><th className="r">Nilai</th><th>Status</th><th /></tr></thead>
        <tbody>{st.ings.map(i => (
          <tr key={i.id}>
            <td className="c-nama">{i.name}</td><td className="mut">{i.unit}</td>
            <td className="r"><b>{fmt(i.stock)}</b></td>
            <td>{atur ? <Rp v={i.min} set={min => patch(i.id, { min })} label={`Stok minimum ${i.name}`} unit={i.unit} cls="sm" zero /> : fmt(i.min)}</td>
            <td className="r nowrap">{rp(i.avg)}<small className="mut u">/{i.unit}</small></td>
            <td className="r nowrap">{rp(Math.round(i.stock * i.avg))}</td>
            <td><span className={`badge ${state(i) === 'Aman' ? 'good' : state(i) === 'Habis' ? 'bad' : 'warnb'}`}>{state(i)}</span></td>
            <td className="c-edit"><button type="button" className="lnk" onClick={() => { setKartu(i.id); setTab('kartu') }} aria-label={`Kartu stok ${i.name}`}>Kartu</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      {atur && <Penyesuaian />}
      {atur && <Baru />}
    </>}

    {tab === 'kartu' && <Kartu id={kartu} set={setKartu} />}
    {tab === 'opname' && atur && <Opname by={me.name} />}
  </>)

  function Baru() {
    const [nama, setNama] = useState(''), [sat, setSat] = useState('gram'), [min, setMin] = useState(0), [harga, setHarga] = useState(0)
    const submit = (e: FormEvent) => {
      e.preventDefault()
      const id = uid('b')
      if (commit(s => catat({ ...s, ings: [...s.ings, { id, name: nama.trim(), unit: sat.trim() || 'pcs', stock: 0, min, avg: harga }] }, me.name, `Tambah bahan ${nama.trim()}`))) { setNama(''); setMin(0); setHarga(0) }
    }
    return (
      <form className="card apanel stack" onSubmit={submit} aria-labelledby="h-bb">
        <h2 id="h-bb" className="aph">Tambah bahan</h2>
        <div className="fgrid g4">
          <Txt label="Nama bahan" v={nama} set={setNama} required maxLength={40} />
          <Txt label="Satuan" v={sat} set={setSat} required maxLength={8} placeholder="gram, ml, pcs" />
          <div className="field"><span>Stok minimum</span><Rp v={min} set={setMin} label="Stok minimum" unit={sat || 'satuan'} zero /></div>
          <div className="field"><span>Harga per satuan</span><Rp v={harga} set={setHarga} label="Harga per satuan" zero /></div>
        </div>
        <p className="mut small">Stok awal 0. Isi lewat pembelian, penyesuaian, atau opname.</p>
        <div className="a-act"><button className="btn btn-line" disabled={!nama.trim()}>{ICON.plus}Tambah bahan</button></div>
      </form>
    )
  }

  function Penyesuaian() {
    const [ing, setIng] = useState(st.ings[0]?.id ?? '')
    const [jenis, setJenis] = useState<'tambah' | 'kurang' | 'buang'>('kurang')
    const [qty, setQty] = useState(0)
    const [alasan, setAlasan] = useState('')
    const cur = st.ings.find(i => i.id === ing)
    const submit = (e: FormEvent) => {
      e.preventDefault()
      const d = jenis === 'tambah' ? qty : -qty
      if (commit(s => sesuaikan(s, ing, d, jenis === 'buang' ? 'buang' : 'sesuai', me.name, alasan.trim()))) { setQty(0); setAlasan('') }
    }
    return (
      <form className="card apanel stack" onSubmit={submit} aria-labelledby="h-adj">
        <h2 id="h-adj" className="aph">Penyesuaian manual</h2>
        <div className="fgrid g4">
          <label className="field"><span>Bahan</span><Sel label="Bahan" v={ing} set={setIng} opts={st.ings.map(i => [i.id, i.name])} /></label>
          <label className="field"><span>Jenis</span><Sel label="Jenis penyesuaian" v={jenis} set={v => setJenis(v as typeof jenis)} opts={[['kurang', 'Koreksi kurang'], ['tambah', 'Koreksi tambah'], ['buang', 'Terbuang atau rusak']]} /></label>
          <div className="field"><span>Jumlah</span><Rp v={qty} set={setQty} label="Jumlah penyesuaian" unit={cur?.unit ?? ''} /></div>
          <Txt label="Alasan" v={alasan} set={setAlasan} required maxLength={80} placeholder="Wajib diisi" />
        </div>
        <div className="a-act"><button className="btn btn-line" disabled={!qty || alasan.trim().length < 3}>{ICON.check}Simpan penyesuaian</button></div>
      </form>
    )
  }
}

function Kartu({ id, set }: { id: string; set: (s: string) => void }) {
  const { st } = useA()
  const ing = st.ings.find(i => i.id === id) ?? st.ings[0]
  const rows = st.moves.filter(m => m.ing === ing?.id).sort((a, b) => b.at - a.at)
  return (<>
    <div className="a-bar"><label className="field ksel"><span>Bahan</span><Sel label="Pilih bahan" v={ing?.id ?? ''} set={set} opts={st.ings.map(i => [i.id, i.name])} /></label>
      {ing && <p className="mut">Stok sekarang <b>{fmt(ing.stock)} {ing.unit}</b></p>}</div>
    <Tabel title={`Kartu stok ${ing?.name ?? ''}`} file={`kartu-stok-${ing?.id ?? 'bahan'}.csv`} empty="Belum ada mutasi."
      cols={[{ h: 'Waktu' }, { h: 'Jenis' }, { h: `Jumlah (${ing?.unit ?? ''})` }, { h: 'Saldo', num: true }, { h: 'Oleh' }, { h: 'Keterangan' }]}
      rows={rows.map(m => [when(m.at), JENIS[m.type], signed(m.qty), m.bal, m.by, m.note])} />
  </>)
}

function Opname({ by }: { by: string }) {
  const { st, commit } = useA()
  const [fisik, setFisik] = useState<Record<string, string>>({})
  const num = (id: string) => fisik[id] === undefined || fisik[id] === '' ? undefined : +fisik[id]
  const beda = st.ings.filter(i => num(i.id) !== undefined && num(i.id) !== i.stock)
  const simpan = () => {
    const f: Record<string, number> = {}
    for (const i of st.ings) { const n = num(i.id); if (n !== undefined) f[i.id] = n }
    if (commit(s => simpanOpname(s, f, by))) setFisik({})
  }
  return (
    <section className="card apanel stack" aria-labelledby="h-op">
      <h2 id="h-op" className="aph">Stock opname</h2>
      <p className="mut">Isi stok hasil hitung fisik. Bahan yang dikosongkan tidak diubah. Selisihnya masuk kartu stok sebagai mutasi opname.</p>
      <div className="tbl flat"><table>
        <thead><tr><th>Bahan</th><th className="r">Stok sistem</th><th>Stok fisik</th><th className="r">Selisih</th></tr></thead>
        <tbody>{st.ings.map(i => {
          const n = num(i.id)
          return (
            <tr key={i.id}>
              <td className="c-nama">{i.name}</td><td className="r">{fmt(i.stock)} <small className="mut u">{i.unit}</small></td>
              <td><span className="inp sm"><input inputMode="numeric" aria-label={`Stok fisik ${i.name}`} value={fisik[i.id] ?? ''} onChange={e => setFisik(f => ({ ...f, [i.id]: e.target.value.replace(/\D/g, '').slice(0, 9) }))} /></span></td>
              <td className={`r${n !== undefined && n !== i.stock ? (n < i.stock ? ' neg' : ' pos') : ''}`}>{n === undefined ? '' : n === i.stock ? 'Sama' : signed(n - i.stock)}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
      <div className="a-act"><Ask label={`Simpan opname (${beda.length} bahan berubah)`} ask="Stok sistem diganti dengan stok fisik. Lanjut?" yes={simpan} cls="btn btn-green" disabled={!beda.length} /></div>
    </section>
  )
}
