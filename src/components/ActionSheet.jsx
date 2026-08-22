import { useState } from 'react'
import { Sheet, ErrorBox } from './common'
import {
  submitOrder, approveOrder, returnOrder, rejectOrder, markPreparing,
  markDispatched, confirmDelivery, resolveDispute, cancelOrder,
  MAX_MANIFEST_BYTES, ALLOWED_MANIFEST_TYPES,
} from '../lib/api'
import { num, isoDate } from '../lib/util'

const MAX_QUANTITY = 1_000_000

// Per-action configuration: title, button tone, and whether a reason is required.
const CFG = {
  submit:  { title: 'submitForApproval', tone: 'btn-go',   reason: false },
  approve: { title: 'editApprove',       tone: 'btn-go',   reason: false },
  return:  { title: 'returnForChanges',  tone: 'btn-no',   reason: true  },
  reject:  { title: 'actReject',         tone: 'btn-no',   reason: true  },
  prepare: { title: 'actPrepare',        tone: 'btn-load', reason: false },
  dispatch:{ title: 'actDispatch',       tone: 'btn-load', reason: false },
  deliver: { title: 'confirmDelivery',   tone: 'btn-done', reason: false },
  resolve: { title: 'resolveDispute',    tone: 'btn-go',   reason: false },
  cancel:  { title: 'markCancelled',     tone: 'btn-no',   reason: true  },
}

export function ActionSheet({ act, order, t, settings = {}, onClose, onDone }) {
  const cfg = CFG[act] || CFG.cancel
  const version = order.version ?? null

  // Sensible default quantity per action.
  const baseQty =
    act === 'approve' ? (order.effective_quantity ?? order.quantity)
    : act === 'dispatch' ? (order.approved_quantity ?? order.quantity)
    : act === 'deliver' ? (order.loaded_quantity ?? order.approved_quantity ?? order.quantity)
    : ''

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState('')
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    qty: baseQty,
    date: act === 'approve' ? (order.approved_date || order.needed_date) : '',
    truck: '', driver: '', dispatchRef: '', receiver: '',
    manifestNo: '', note: '', reason: '', discrepancyReason: '',
    resolveComplete: true,
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const needsQty = act === 'approve' || act === 'dispatch' || act === 'deliver'
  const qtyValue = Number(form.qty)
  const qtyBad = needsQty && (!Number.isFinite(qtyValue) || qtyValue <= 0)
  const qtyHuge = needsQty && qtyValue > MAX_QUANTITY

  // Comparisons that drive conditional requirements.
  const approvedBase = Number(order.approved_quantity ?? order.quantity)
  const dispatchDiffers = act === 'dispatch' && Number.isFinite(qtyValue) && qtyValue !== approvedBase
  const loadedQty = Number(order.loaded_quantity)
  const deliverDiffers = act === 'deliver' && Number.isFinite(qtyValue) && qtyValue !== loadedQty
  const approveChanged =
    act === 'approve' &&
    (qtyValue !== Number(order.effective_quantity ?? order.quantity) || form.date !== (order.approved_date || order.needed_date))

  const reqDispatchRef = settings.require_dispatch_reference !== false
  const reqReceiver = settings.require_receiver_name !== false

  const pickFile = (e) => {
    const chosen = e.target.files?.[0] || null
    setProblem('')
    if (!chosen) return setFile(null)
    if (chosen.size > MAX_MANIFEST_BYTES) { setFile(null); e.target.value = ''; return setProblem(t.fileTooBig) }
    if (chosen.type && !ALLOWED_MANIFEST_TYPES.includes(chosen.type)) {
      setFile(null); e.target.value = ''; return setProblem(t.uploadFailed)
    }
    setFile(chosen)
  }

  const validate = () => {
    if (qtyBad) return t.qtyPositive
    if (qtyHuge) return t.qtyTooBig
    if (cfg.reason && !form.reason.trim()) return t.reasonReq
    if (act === 'approve' && approveChanged && !form.reason.trim()) return t.changeReasonReq
    if (act === 'dispatch') {
      if (!form.truck.trim() || !form.driver.trim()) return t.fillRequired
      if (reqDispatchRef && !form.dispatchRef.trim()) return t.fillRequired
      if (dispatchDiffers && !form.note.trim()) return t.explainDifference
    }
    if (act === 'deliver') {
      if (reqReceiver && !form.receiver.trim()) return t.fillRequired
      if (!file) return t.manifestNeeded
      if (deliverDiffers && !form.discrepancyReason.trim()) return t.explainDifference
    }
    if (act === 'resolve' && !form.note.trim()) return t.reasonReq
    return ''
  }

  const submit = async () => {
    if (busy) return
    const err = validate()
    if (err) return setProblem(err)
    setProblem('')
    setBusy(true)
    try {
      let outcome
      if (act === 'submit') await submitOrder(order.id, version)
      else if (act === 'approve') await approveOrder({ id: order.id, approvedQuantity: qtyValue, approvedDate: form.date, reason: form.reason || null, version })
      else if (act === 'return') await returnOrder({ id: order.id, reason: form.reason, version })
      else if (act === 'reject') await rejectOrder({ id: order.id, reason: form.reason, version })
      else if (act === 'prepare') await markPreparing({ id: order.id, note: form.note || null, version })
      else if (act === 'dispatch') {
        if (file) setUploading(true)
        await markDispatched({ order, file, quantity: qtyValue, truck: form.truck, driver: form.driver, dispatchRef: form.dispatchRef, note: form.note, manifestNo: form.manifestNo, version })
      } else if (act === 'deliver') {
        setUploading(true)
        outcome = await confirmDelivery({ order, file, received: qtyValue, receiver: form.receiver, note: form.note, manifestNo: form.manifestNo, discrepancyReason: deliverDiffers ? form.discrepancyReason : null, version })
      } else if (act === 'resolve') await resolveDispute({ id: order.id, complete: form.resolveComplete, note: form.note, version })
      else if (act === 'cancel') await cancelOrder({ id: order.id, reason: form.reason, version })
      onDone(outcome)
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setUploading(false)
      setBusy(false)
    }
  }

  const lede = `${order.order_ref || '#' + order.order_no} · ${num(order.quantity)} ${order.product_unit}`
  const unit = order.product_unit

  return (
    <Sheet title={t[cfg.title]} lede={lede} onClose={onClose}>
      <ErrorBox>{problem}</ErrorBox>

      {act === 'submit' && <p className="lede">{t.confirmSubmit}</p>}

      {act === 'approve' && (
        <div className="qcmp">
          <div className="qc"><span className="l">{t.requestedQty}</span><span className="v">{num(order.quantity)} {unit}</span></div>
          {approveChanged && <div className="qc vary"><span className="l">{t.approvedQty}</span><span className="v">{num(qtyValue)} {unit}</span></div>}
        </div>
      )}
      {act === 'dispatch' && (
        <div className="qcmp">
          <div className="qc"><span className="l">{t.approvedQty}</span><span className="v">{num(approvedBase)} {unit}</span></div>
          {dispatchDiffers && <div className="qc vary"><span className="l">{t.dispatchedQty}</span><span className="v">{num(qtyValue)} {unit}</span></div>}
        </div>
      )}
      {act === 'deliver' && (
        <div className="qcmp">
          <div className="qc"><span className="l">{t.dispatchedQty}</span><span className="v">{num(loadedQty)} {unit}</span></div>
          <div className={'qc ' + (deliverDiffers ? 'vary' : 'good')}><span className="l">{t.receivedQty}</span><span className="v">{num(qtyValue || 0)} {unit}</span></div>
        </div>
      )}

      {needsQty && (
        <div className="field">
          <label htmlFor="act-qty">{act === 'approve' ? t.approvedQty : act === 'dispatch' ? t.loadedQty : t.receivedQty}</label>
          <input id="act-qty" className="inp num" type="number" inputMode="decimal" min="0" step="any" value={form.qty} onChange={set('qty')} />
        </div>
      )}

      {act === 'approve' && (
        <div className="field">
          <label htmlFor="act-date">{t.approvedDate}</label>
          <input id="act-date" className="inp" type="date" value={form.date} onChange={set('date')} />
        </div>
      )}

      {act === 'dispatch' && (
        <>
          <div className="row">
            <div className="field">
              <label htmlFor="act-truck">{t.truckNo}</label>
              <input id="act-truck" className="inp" value={form.truck} onChange={set('truck')} placeholder="DHK 4471" />
            </div>
            <div className="field">
              <label htmlFor="act-driver">{t.driver}</label>
              <input id="act-driver" className="inp" value={form.driver} onChange={set('driver')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="act-ref">{t.dispatchRef}{!reqDispatchRef && <span className="hint"> · {t.optional}</span>}</label>
            <input id="act-ref" className="inp" value={form.dispatchRef} onChange={set('dispatchRef')} placeholder="DR-2026-001" />
          </div>
        </>
      )}

      {act === 'deliver' && (
        <div className="field">
          <label htmlFor="act-recv">{t.receiverName}{!reqReceiver && <span className="hint"> · {t.optional}</span>}</label>
          <input id="act-recv" className="inp" value={form.receiver} onChange={set('receiver')} />
        </div>
      )}

      {(act === 'dispatch' || act === 'deliver') && (
        <>
          <div className="field">
            <label htmlFor="act-file">
              {act === 'dispatch' ? t.attachLoadManifest : t.attachManifest}
              {act === 'dispatch' && <span className="hint"> · {t.optional}</span>}
            </label>
            <input id="act-file" className="inp" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" onChange={pickFile} />
          </div>
          <div className="field">
            <label htmlFor="act-mno">{act === 'dispatch' ? t.loadManifestNo : t.manifestNo} <span className="hint">· {t.optional}</span></label>
            <input id="act-mno" className="inp" value={form.manifestNo} onChange={set('manifestNo')} />
          </div>
        </>
      )}

      {act === 'deliver' && deliverDiffers && (
        <div className="field">
          <label htmlFor="act-disc">{t.discrepancyReason}</label>
          <textarea id="act-disc" className="inp" value={form.discrepancyReason} onChange={set('discrepancyReason')} placeholder={t.explainDifference} />
        </div>
      )}

      {act === 'resolve' && (
        <div className="field">
          <label>{t.resolveDispute}</label>
          <div className="segp">
            <button type="button" aria-pressed={form.resolveComplete} onClick={() => setForm((f) => ({ ...f, resolveComplete: true }))}>{t.markComplete}</button>
            <button type="button" aria-pressed={!form.resolveComplete} onClick={() => setForm((f) => ({ ...f, resolveComplete: false }))}>{t.markCancelled}</button>
          </div>
        </div>
      )}

      {/* reason / note field: label + requiredness depend on the action */}
      {(cfg.reason || act === 'approve' || act === 'prepare' || act === 'dispatch' || act === 'resolve') && (
        <div className="field">
          <label htmlFor="act-note">
            {cfg.reason ? t.reason : act === 'approve' ? t.explainChange : act === 'resolve' ? t.resolutionNote : t.note}
            {!cfg.reason && act !== 'resolve' && <span className="hint"> · {t.optional}</span>}
          </label>
          <textarea
            id="act-note" className="inp"
            value={cfg.reason ? form.reason : (act === 'resolve' ? form.note : (act === 'approve' ? form.reason : form.note))}
            onChange={cfg.reason || act === 'approve' ? set('reason') : set('note')}
            placeholder={cfg.reason ? t.reasonReq : ''}
          />
        </div>
      )}

      <div className="acts">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t.cancel}</button>
        <button className={'btn ' + cfg.tone} disabled={busy || qtyBad} onClick={submit}>
          {uploading ? t.uploading : busy ? t.saving : t.confirm}
        </button>
      </div>
    </Sheet>
  )
}

/** Map the handful of sentinel errors from the API layer onto real wording. */
export function translateError(e, t) {
  const m = e?.message || ''
  if (m === 'stale-order') return t.staleMsg
  if (m === 'manifest-size') return t.fileTooBig
  if (m === 'manifest-type' || m === 'upload-failed') return t.uploadFailed
  if (m === 'load-failed' || m === 'rpc-failed' || m === 'write-failed') return t.genericErr
  if (m === 'manifest-failed') return t.manifestFail
  return m || t.genericErr
}
