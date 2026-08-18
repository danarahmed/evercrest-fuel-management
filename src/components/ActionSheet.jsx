import { useState } from 'react'
import { Sheet, ErrorBox } from './common'
import {
  rpc,
  markLoadedWithManifest,
  confirmDeliveryWithManifest,
  MAX_MANIFEST_BYTES,
  ALLOWED_MANIFEST_TYPES,
} from '../lib/api'
import { num, orderNo } from '../lib/util'

const MAX_QUANTITY = 1_000_000

export function ActionSheet({ act, order, t, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState('')
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    note: '',
    qty: act === 'load' ? order.quantity : (order.loaded_quantity ?? order.quantity),
    truck: '',
    driver: '',
    manifestNo: '',
  })

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const titles = {
    approve: t.approve,
    reject: t.reject,
    load: t.markLoaded,
    deliver: t.confirmDelivery,
    cancel: t.cancelOrder,
  }

  const needsQty = act === 'load' || act === 'deliver'
  const qtyValue = Number(form.qty)
  const qtyBad = needsQty && (!Number.isFinite(qtyValue) || qtyValue <= 0)
  const qtyHuge = needsQty && qtyValue > MAX_QUANTITY

  const pickFile = (e) => {
    const chosen = e.target.files?.[0] || null
    setProblem('')
    if (!chosen) return setFile(null)
    if (chosen.size > MAX_MANIFEST_BYTES) {
      setFile(null)
      e.target.value = ''
      return setProblem(t.fileTooBig)
    }
    if (chosen.type && !ALLOWED_MANIFEST_TYPES.includes(chosen.type)) {
      setFile(null)
      e.target.value = ''
      return setProblem(t.uploadFailed)
    }
    setFile(chosen)
  }

  const submit = async () => {
    if (busy) return
    setProblem('')
    if (qtyBad) return setProblem(t.qtyPositive)
    if (qtyHuge) return setProblem(t.qtyTooBig)
    if (act === 'deliver' && !file) return setProblem(t.manifestNeeded)
    if (act === 'load' && !file) return setProblem(t.loadManifestNeeded)

    setBusy(true)
    try {
      if (act === 'approve' || act === 'reject') {
        await rpc('decide_order', {
          p_order: order.id,
          p_approve: act === 'approve',
          p_note: form.note,
        })
      } else if (act === 'load') {
        if (file) setUploading(true)
        await markLoadedWithManifest({
          order,
          file,
          quantity: qtyValue,
          truck: form.truck,
          driver: form.driver,
          note: form.note,
          manifestNo: form.manifestNo,
        })
      } else if (act === 'cancel') {
        await rpc('cancel_order', { p_order: order.id, p_note: form.note })
      } else if (act === 'deliver') {
        setUploading(true)
        await confirmDeliveryWithManifest({
          order,
          file,
          received: qtyValue,
          manifestNo: form.manifestNo,
          note: form.note,
        })
      }
      onDone()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setUploading(false)
      setBusy(false)
    }
  }

  const lede = `#${orderNo(order.order_no)} · ${num(order.quantity)} ${order.product_unit}`
  const blocked =
    busy ||
    (act === 'reject' && !form.note.trim()) ||
    (act === 'deliver' && !file) ||
    (act === 'load' && !file) ||
    qtyBad

  return (
    <Sheet title={titles[act]} lede={lede} onClose={onClose}>
      <ErrorBox>{problem}</ErrorBox>

      {needsQty && (
        <div className="field">
          <label htmlFor="act-qty">{act === 'load' ? t.loadedQty : t.receivedQty}</label>
          <input
            id="act-qty"
            className="inp num"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.qty}
            onChange={set('qty')}
          />
        </div>
      )}

      {(act === 'deliver' || act === 'load') && (
        <>
          <div className="field">
            <label htmlFor="act-file">
              {act === 'load' ? t.attachLoadManifest : t.attachManifest}
            </label>
            <input
              id="act-file"
              className="inp"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              capture="environment"
              onChange={pickFile}
            />
          </div>
          <div className="field">
            <label htmlFor="act-mno">
              {act === 'load' ? t.loadManifestNo : t.manifestNo}{' '}
              <span className="hint">· {t.optional}</span>
            </label>
            <input id="act-mno" className="inp" value={form.manifestNo} onChange={set('manifestNo')} />
          </div>
        </>
      )}

      {act === 'load' && (
        <div className="row">
          <div className="field">
            <label htmlFor="act-truck">
              {t.truckNo} <span className="hint">· {t.optional}</span>
            </label>
            <input id="act-truck" className="inp" value={form.truck} onChange={set('truck')} />
          </div>
          <div className="field">
            <label htmlFor="act-driver">
              {t.driver} <span className="hint">· {t.optional}</span>
            </label>
            <input id="act-driver" className="inp" value={form.driver} onChange={set('driver')} />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="act-note">
          {act === 'reject' ? t.reason : t.note}
          {act !== 'reject' && <span className="hint"> · {t.optional}</span>}
        </label>
        <textarea
          id="act-note"
          className="inp"
          value={form.note}
          onChange={set('note')}
          placeholder={act === 'reject' ? t.reasonReq : ''}
        />
      </div>

      <div className="acts">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          {t.cancel}
        </button>
        <button
          className={
            'btn ' +
            (act === 'reject' || act === 'cancel'
              ? 'btn-no'
              : act === 'load'
                ? 'btn-load'
                : act === 'deliver'
                  ? 'btn-done'
                  : 'btn-go')
          }
          disabled={blocked}
          onClick={submit}
        >
          {uploading ? t.uploading : busy ? t.saving : t.confirm}
        </button>
      </div>
    </Sheet>
  )
}

/** Map the handful of sentinel errors from the API layer onto real wording. */
export function translateError(e, t) {
  const m = e?.message || ''
  if (m === 'manifest-size') return t.fileTooBig
  if (m === 'manifest-type' || m === 'upload-failed') return t.uploadFailed
  if (m === 'load-failed' || m === 'rpc-failed' || m === 'write-failed') return t.genericErr
  if (m === 'manifest-failed') return t.manifestFail
  return m || t.genericErr
}
