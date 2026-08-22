import { useEffect, useState } from 'react'
import { Empty, ErrorBox, Ok, Sheet } from './common'
import { saveOrder, submitOrder } from '../lib/api'
import { isoDate, num } from '../lib/util'
import { PRIORITIES } from '../lib/workflow'
import { translateError } from './ActionSheet'

const QUICK_PICKS = [5000, 10000, 15000, 20000, 30000]

/**
 * Create a new order, or edit a draft / returned order. Stations save a draft
 * or submit for approval; a summary is shown before the order actually goes in.
 */
export function NewOrder({ t, lang, products, stations, profile, settings = {}, editOrder = null, onDone, onCancelEdit }) {
  const today = isoDate(new Date())
  const isAdmin = profile.role === 'admin'
  const editing = !!editOrder
  const maxQty = Number(settings.max_order_quantity) || 1_000_000
  const allowPast = settings.allow_past_needed_date === true

  const [productId, setProductId] = useState(editOrder?.product_id || '')
  const [quantity, setQuantity] = useState(editOrder ? String(editOrder.quantity) : '')
  const [priority, setPriority] = useState(editOrder?.priority || 'normal')
  const [needed, setNeeded] = useState(editOrder?.needed_date || today)
  const [note, setNote] = useState(editOrder?.note || '')
  const [stationId, setStationId] = useState(editOrder?.station_id || profile.station_id || '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (editing) return
    setProductId((cur) => (cur && products.some((p) => p.id === cur) ? cur : products[0]?.id ?? ''))
  }, [products, editing])
  useEffect(() => {
    if (!isAdmin || editing) return
    setStationId((cur) => (cur && stations.some((s) => s.id === cur) ? cur : stations[0]?.id ?? ''))
  }, [isAdmin, stations, editing])

  const qty = Number(quantity)
  const validate = () => {
    if (!productId) return t.pickFuel
    if (!Number.isFinite(qty) || qty <= 0) return t.qtyPositive
    if (qty > maxQty) return t.qtyTooBig
    if (!allowPast && needed < isoDate(new Date())) return t.datePast
    if (isAdmin && !stationId) return t.noStationFirst
    return ''
  }

  const persist = async () => {
    return saveOrder({
      id: editOrder?.id ?? null,
      productId, quantity: qty, neededDate: needed, priority, note,
      stationId: isAdmin ? stationId : null,
      version: editOrder?.version ?? null,
    })
  }

  const doSaveDraft = async () => {
    if (busy) return
    const err = validate()
    if (err) return setProblem(err)
    setProblem(''); setBusy(true)
    try {
      await persist()
      setOkMsg(t.draftSaved)
      onDone({ closeEdit: editing })
    } catch (e) { setProblem(translateError(e, t)) } finally { setBusy(false) }
  }

  const doSubmit = async () => {
    if (busy) return
    setProblem(''); setBusy(true)
    try {
      const id = await persist()
      await submitOrder(id, null) // just saved by us; skip the extra version gate
      setConfirm(false)
      setOkMsg(editing ? t.changesSaved : t.orderSubmitted)
      if (!editing) { setQuantity(''); setNote(''); setNeeded(today); setPriority('normal') }
      onDone({ closeEdit: editing })
    } catch (e) { setConfirm(false); setProblem(translateError(e, t)) } finally { setBusy(false) }
  }

  const openConfirm = () => {
    const err = validate()
    if (err) return setProblem(err)
    setProblem(''); setConfirm(true)
  }

  if (!products.length && !editing) {
    return <div className="panel"><h2>{t.tabNew}</h2><Empty title={t.noFuel} msg={t.noFuelP} /></div>
  }

  const fuelName = (p) => (lang === 'ku' ? p.name_ku : p.name_en)
  const chosenFuel = products.find((p) => p.id === productId)
  const chosenStation = stations.find((s) => s.id === stationId)

  return (
    <div className="panel">
      <div className="phead" style={{ margin: '0 0 12px' }}>
        <h1 style={{ fontSize: 17 }}>{editing ? t.actEdit + ' · ' + (editOrder.order_ref || '') : t.newOrderCta}</h1>
        <p>{editing ? t.reviewBeforeSubmit : t.appSub}</p>
      </div>

      <ErrorBox>{problem}</ErrorBox>
      <Ok>{okMsg}</Ok>

      {isAdmin && !editing && (
        <div className="field">
          <label htmlFor="no-station">{t.station}</label>
          <select id="no-station" className="inp" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            {stations.map((s) => <option key={s.id} value={s.id}>{fuelName(s)}</option>)}
          </select>
        </div>
      )}

      <div className="field">
        <label>{t.fuel} <span className="req" aria-hidden="true">*</span></label>
        <div className="seg">
          {products.map((p) => (
            <button key={p.id} type="button" aria-pressed={productId === p.id} onClick={() => setProductId(p.id)}>{fuelName(p)}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="no-qty">{t.quantity} · {t.litres} <span className="req" aria-hidden="true">*</span></label>
        <input id="no-qty" className="inp num" type="number" inputMode="numeric" min="1" step="any" value={quantity} placeholder="0" onChange={(e) => setQuantity(e.target.value)} />
        <div className="picks">
          {QUICK_PICKS.map((v) => (
            <button key={v} type="button" className="pick" onClick={() => setQuantity(String(v))}>{num(v)}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t.priorityWord}</label>
        <div className="segp">
          {PRIORITIES.map((p) => (
            <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}>{t['pr_' + p]}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="no-date">{t.requiredDate} <span className="req" aria-hidden="true">*</span></label>
        <input id="no-date" className="inp" type="date" value={needed} min={allowPast ? undefined : today} onChange={(e) => setNeeded(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="no-note">{t.note} <span className="hint">· {t.optional}</span></label>
        <textarea id="no-note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="acts">
        {editing && <button className="btn btn-ghost" onClick={onCancelEdit} disabled={busy}>{t.cancel}</button>}
        <button className="btn" onClick={doSaveDraft} disabled={busy}>{t.saveDraft}</button>
        <button className="btn btn-go" onClick={openConfirm} disabled={busy}>{t.submitForApproval}</button>
      </div>

      {confirm && (
        <Sheet title={t.orderSummary} lede={t.reviewBeforeSubmit} onClose={() => setConfirm(false)}>
          <dl className="facts">
            {chosenStation && <div className="fact"><dt>{t.station}</dt><dd>{fuelName(chosenStation)}</dd></div>}
            <div className="fact"><dt>{t.fuel}</dt><dd>{chosenFuel ? fuelName(chosenFuel) : ''}</dd></div>
            <div className="fact"><dt>{t.quantity}</dt><dd>{num(qty)} {chosenFuel?.unit || t.litres}</dd></div>
            <div className="fact"><dt>{t.priorityWord}</dt><dd>{t['pr_' + priority]}</dd></div>
            <div className="fact"><dt>{t.requiredDate}</dt><dd>{needed}</dd></div>
            {note.trim() && <div className="fact"><dt>{t.note}</dt><dd>{note}</dd></div>}
          </dl>
          <div className="acts">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)} disabled={busy}>{t.cancel}</button>
            <button className="btn btn-go" onClick={doSubmit} disabled={busy}>{busy ? t.placing : t.submitForApproval}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
