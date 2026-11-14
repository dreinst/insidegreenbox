// Bagian yang dipakai bersama halaman kasir dan back office: format uang, tabel dengan unduh CSV, struk.
import type { ReactNode } from 'react'
import { fmt, type Info, type Sale } from '../store'
import { csv, type Method } from './hitung'
import { ICON, when } from './kit'

export const rp = (n: number) => `${n < 0 ? '-' : ''}Rp ${fmt(Math.abs(n))}`
export const METODE: Record<Method, string> = { tunai: 'Tunai', qris: 'QRIS', debit: 'Debit' }
export const MODE = { dinein: 'Dine in', takeaway: 'Take away' }
export const METHODS: Method[] = ['tunai', 'qris', 'debit']

/** Unduh baris sebagai berkas CSV (dengan BOM supaya Excel membaca huruf dengan benar). */
export function unduh(name: string, rows: (string | number)[][]) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv(rows)], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export type Col = { h: string; num?: boolean; money?: boolean }
type Cell = string | number
/** Tabel dalam kartu. Kolom money tampil sebagai rupiah, num rata kanan. file = nama CSV; kalau diisi muncul tombol unduh. */
export function Tabel({ title, note, cols, rows, file, empty = 'Belum ada data.', foot }: {
  title: string; note?: string; cols: Col[]; rows: Cell[][]; file?: string; empty?: string; foot?: Cell[]
}) {
  const show = (c: Col, v: Cell) => c.money && typeof v === 'number' ? rp(v) : c.num && typeof v === 'number' ? fmt(v) : v
  const head = cols.map(c => c.h)
  return (
    <section className="card apanel stack lap" aria-label={title}>
      <div className="aph-row">
        <div><h2 className="aph">{title}</h2>{note && <p className="mut">{note}</p>}</div>
        {file && <button type="button" className="mini" disabled={!rows.length} onClick={() => unduh(file, [head, ...rows, ...(foot ? [foot] : [])])} aria-label={`Unduh CSV ${title}`}>{ICON.download}CSV</button>}
      </div>
      {!rows.length ? <p className="empty">{empty}</p> : (
        <div className="tbl flat"><table>
          <thead><tr>{cols.map(c => <th key={c.h} className={c.num || c.money ? 'r' : ''}>{c.h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cols[j].num || cols[j].money ? 'r' : ''}>{show(cols[j], v)}</td>)}</tr>)}</tbody>
          {foot && <tfoot><tr>{foot.map((v, j) => <td key={j} className={cols[j].num || cols[j].money ? 'r' : ''}>{show(cols[j], v)}</td>)}</tr></tfoot>}
        </table></div>
      )}
    </section>
  )
}

export const Stats = ({ rows }: { rows: [string, ReactNode, string?][] }) => (
  <div className="stats flow ops">{rows.map(([a, b, c]) => <div key={a} className="card stat"><p>{a}</p><b>{b}</b><small>{c ?? ''}</small></div>)}</div>
)

/** Struk sederhana dalam jendela di atas halaman. children = tombol atau formulir tambahan (tidak ikut tercetak). */
export function Struk({ sale, info, onClose, children, closeLabel = 'Tutup' }: { sale: Sale; info: Info; onClose: () => void; children?: ReactNode; closeLabel?: string }) {
  const void_ = sale.status === 'void'
  return (
    <div className="struk-ov" role="dialog" aria-modal="true" aria-label={`Struk ${sale.no}`}>
      <div className="struk-box">
        <div className={`struk${void_ ? ' is-void' : ''}`}>
          <h2 className="disp">greenbox</h2>
          <p className="sc">{info.address}, {info.area}</p>
          <hr />
          <dl className="sm">
            <div><dt>No.</dt><dd>{sale.no}</dd></div>
            <div><dt>Waktu</dt><dd>{when(sale.at)}</dd></div>
            <div><dt>Kasir</dt><dd>{sale.by}</dd></div>
            <div><dt>Mode</dt><dd>{MODE[sale.mode]}{sale.table ? `, meja ${sale.table}` : ''}</dd></div>
            {sale.member && <div><dt>Member</dt><dd>{sale.member.name}</dd></div>}
          </dl>
          <hr />
          <ul className="sl">{sale.lines.map(l => (
            <li key={l.key}><span>{l.qty} x {l.name}{l.note && <small>{l.note}</small>}</span><b>{fmt(l.price * l.qty)}</b></li>
          ))}</ul>
          <hr />
          <dl className="sm tot">
            <div><dt>Subtotal</dt><dd>{fmt(sale.sub)}</dd></div>
            {sale.disc > 0 && <div><dt>Potongan member {sale.member?.pct}%</dt><dd>-{fmt(sale.disc)}</dd></div>}
            {sale.svc > 0 && <div><dt>Service</dt><dd>{fmt(sale.svc)}</dd></div>}
            {sale.tax > 0 && <div><dt>Pajak</dt><dd>{fmt(sale.tax)}</dd></div>}
            <div className="gt"><dt>Total</dt><dd>{fmt(sale.total)}</dd></div>
            <div><dt>{METODE[sale.method]}</dt><dd>{fmt(sale.paid)}</dd></div>
            {sale.method === 'tunai' && <div><dt>Kembali</dt><dd>{fmt(sale.change)}</dd></div>}
          </dl>
          {void_ && <p className="stamp">VOID{sale.voidReason ? `: ${sale.voidReason}` : ''}</p>}
          <p className="sc">Terima kasih sudah mampir.</p>
        </div>
        <div className="struk-act no-print">
          {children}
          <div className="a-act">
            <button type="button" className="btn btn-line" onClick={() => window.print()}>{ICON.print}Cetak struk</button>
            <button type="button" className="btn btn-green" onClick={onClose} autoFocus>{closeLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
