import { useEffect, useState } from 'react'
import { Empty, ErrorBox, Ok } from './common'
import { rpc } from '../lib/api'
import { isoDate, num } from '../lib/util'
import { translateError } from './ActionSheet'

const QUICK_PICKS = [5000, 10000, 15000, 20000, 30000]
const MAX_QUANTITY = 1_000_000

export function NewOrder({ t, lang, products, stations, profile, onDone }) {
  const today = isoDate(new Date())
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [needed, setNeeded] = useState(today)
  const [note, setNote] = useState('')
  const [stationId, setStationId] = useState(profile.station_id || '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [sent, setSent] = useState(false)

  const isAdmin = profile.role === 'admin'

  // Keep the selection valid as reference data arrives or changes.
  useEffect(() => {
    setProductId((current) =>
      current && products.some((p) => p.id === current) ? current : (products[0]?.id ?? ''),
    )
  }, [products])

  useEffect(() => {
    if (!isAdmin) return
    setStationId((current) =>
      current && stations.some((s) => s.id === current) ? current : (stations[0]?.id ?? ''),
    )
  }, [isAdmin, stations])

  const submit = async () => {
    if (busy) return
    setProblem('')
    const qty = Number(quantity)
    if (!productId) return setProblem(t.pickFuel)
    if (!Number.isFinite(qty) || qty <= 0) return setProblem(t.qtyPositive)
    if (qty > MAX_QUANTITY) return setProblem(t.qtyTooBig)
    if (needed < today) return setProblem(t.datePast)
    if (isAdmin && !stationId) return setProblem(t.noStationFirst)

    setBusy(true)
    try {
      await rpc('place_order', {
        p_product: productId,
        p_quantity: qty,
        p_needed_date: needed,
        p_note: note,
        p_station: isAdmin ? stationId : null,
      })
      setQuantity('')
      setNote('')
      setNeeded(today)
      setSent(true)
      setTimeout(() => setSent(false), 4000)
      onDone()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setBusy(false)
    }
  }

  // Reachable when every fuel type has been switched off. The message used to
  // be the "add a station first" one, which meant nothing to a station user.
  if (!products.length) {
    return (
      <div className="panel">
        <h2>{t.tabNew}</h2>
        <Empty title={t.noFuel} msg={t.noFuelP} />
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>{t.tabNew}</h2>

      <ErrorBox>{problem}</ErrorBox>
      <Ok>{sent ? t.orderPlaced : ''}</Ok>

      {isAdmin && (
        <div className="field">
          <label htmlFor="no-station">{t.station}</label>
          <select
            id="no-station"
            className="inp"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === 'ku' ? s.name_ku : s.name_en}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>{t.fuel}</label>
        <div className="seg">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={productId === p.id}
              onClick={() => setProductId(p.id)}
            >
              {lang === 'ku' ? p.name_ku : p.name_en}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="no-qty">
          {t.quantity} · {t.litres}
        </label>
        <input
          id="no-qty"
          className="inp num"
          type="number"
          inputMode="numeric"
          min="1"
          step="any"
          value={quantity}
          placeholder="0"
          onChange={(e) => setQuantity(e.target.value)}
        />
        <div className="picks">
          {QUICK_PICKS.map((v) => (
            <button key={v} type="button" className="pick" onClick={() => setQuantity(String(v))}>
              {num(v)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="no-date">{t.neededFor}</label>
        <input
          id="no-date"
          className="inp"
          type="date"
          value={needed}
          min={today}
          onChange={(e) => setNeeded(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="no-note">
          {t.note} <span className="hint">· {t.optional}</span>
        </label>
        <textarea id="no-note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <button className="btn btn-go wide" disabled={busy} onClick={submit}>
        {busy ? t.placing : t.placeOrder}
      </button>
    </div>
  )
}
