import { useState } from 'react'
import { batalkan } from './aksi'
import { dayKey, dayStart, parseDay } from './hitung'
import { Ask, Title, Txt, useA, when } from './kit'
import { METODE, MODE, Stats, Struk, rp } from './umum'

export default function TransaksiPage() {
  const { st, me, commit, ok } = useA()
  const now = Date.now()
  const [from, setFrom] = useState(dayKey(dayStart(now) - 6 * 86400000))
  const [to, setTo] = useState(dayKey(now))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('')
  const [reason, setReason] = useState('')

  const a = parseDay(from), b = parseDay(to) + 86400000
  const needle = q.trim().toLowerCase()
  const rows = [...st.sales].filter(s => s.at >= a && s.at < b && s.no.toLowerCase().includes(needle)).sort((x, y) => y.at - x.at)
  const good = rows.filter(s => s.status === 'ok')
  const cur = st.sales.find(s => s.id === sel)
  const canVoid = ok('transaksi.void')

  const doVoid = () => {
    if (cur && commit(s => batalkan(s, cur.id, me.name, reason.trim()))) { setReason(''); setSel('') }
  }

  return (<>
    <Title t="Transaksi" sub="Daftar penjualan, struk, dan void." />
    <Stats rows={[['Transaksi', good.length, `${rows.length - good.length} void`], ['Penjualan', rp(good.reduce((x, s) => x + s.total, 0)), 'total yang diterima']]} />
    <div className="a-bar filt">
      <label className="field"><span>Dari</span><span className="inp"><input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} /></span></label>
      <label className="field"><span>Sampai</span><span className="inp"><input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} /></span></label>
      <label className="field grow"><span>Nomor transaksi</span><span className="inp"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Contoh: GB261114" /></span></label>
    </div>
    <div className="card tbl"><table>
      <thead><tr><th>Nomor</th><th>Waktu</th><th>Kasir</th><th>Mode</th><th className="r">Total</th><th>Bayar</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(s => (
        <tr key={s.id} className={s.status === 'void' ? 'off' : ''}>
          <td className="c-nama nowrap">{s.no}</td>
          <td className="nowrap">{when(s.at)}</td>
          <td>{s.by}</td>
          <td className="nowrap">{MODE[s.mode]}{s.table ? ` ${s.table}` : ''}</td>
          <td className="r nowrap">{rp(s.total)}</td>
          <td>{METODE[s.method]}</td>
          <td><span className={`badge ${s.status === 'void' ? 'bad' : 'good'}`}>{s.status === 'void' ? 'Void' : 'Selesai'}</span></td>
          <td className="c-edit"><button type="button" className="lnk" onClick={() => { setSel(s.id); setReason('') }} aria-label={`Lihat struk ${s.no}`}>Lihat</button></td>
        </tr>
      ))}</tbody>
    </table>{!rows.length && <p className="empty">Tidak ada transaksi pada rentang ini.</p>}</div>

    {cur && (
      <Struk sale={cur} info={st.info} onClose={() => setSel('')}>
        {cur.status === 'ok' && (canVoid ? (
          <div className="voidbox">
            <Txt label="Alasan void" v={reason} set={setReason} maxLength={80} placeholder="Wajib diisi" />
            <Ask label="Void transaksi" ask="Stok dan kunjungan member dikembalikan. Lanjut?" yes={doVoid} disabled={reason.trim().length < 3} />
          </div>
        ) : <p className="mut small">Void hanya bisa dilakukan Owner atau Superadmin.</p>)}
        {cur.status === 'void' && <p className="mut small">Void oleh {cur.voidBy} pada {cur.voidAt ? when(cur.voidAt) : '-'}.</p>}
      </Struk>
    )}
  </>)
}
