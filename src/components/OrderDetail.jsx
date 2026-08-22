import { useEffect, useState } from 'react'
import { Sheet, StatusChip, Rail, PriorityBadge } from './common'
import { fetchEvents, signedManifestUrl } from '../lib/api'
import { num, stamp, dueDate } from '../lib/util'
import { allowedActions, NEXT_ROLE } from '../lib/workflow'

function Fact({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return <div className="fact"><dt>{label}</dt><dd>{value}</dd></div>
}

/** "3h" / "2d" since a timestamp, for time-in-stage. */
function since(ts, t) {
  if (!ts) return ''
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 0) return ''
  const h = Math.floor(ms / 3600000)
  if (h < 1) return '<1' + t.hoursShort
  if (h < 48) return h + t.hoursShort
  return Math.floor(h / 24) + 'd'
}

export function OrderDetail({ order, t, lang, role, onClose, onAct }) {
  const [events, setEvents] = useState(null)
  const [problem, setProblem] = useState('')

  const station = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuel = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const can = allowedActions(role, order.status)
  const unit = order.product_unit
  const open = !['delivered', 'rejected', 'cancelled'].includes(order.status)

  useEffect(() => {
    let stale = false
    fetchEvents(order.id).then((r) => !stale && setEvents(r)).catch(() => !stale && setEvents([]))
    return () => { stale = true }
  }, [order.id])

  const openManifest = async (path) => {
    setProblem('')
    const tab = window.open('', '_blank', 'noopener,noreferrer')
    try {
      const url = await signedManifestUrl(path)
      if (tab) tab.location = url; else window.location.assign(url)
    } catch { tab?.close(); setProblem(t.manifestFail) }
  }

  // Quantity comparison cells that actually have a value.
  const qcells = []
  qcells.push({ l: t.requestedWord, v: order.quantity })
  if (order.approved_quantity != null) qcells.push({ l: t.approvedWord, v: order.approved_quantity })
  if (order.loaded_quantity != null) qcells.push({ l: t.dispatchedWord, v: order.loaded_quantity })
  if (order.received_quantity != null) {
    const vary = Number(order.received_quantity) !== Number(order.loaded_quantity)
    qcells.push({ l: t.receivedWord, v: order.received_quantity, cls: vary ? 'vary' : 'good' })
  }

  const nextRole = NEXT_ROLE[order.status]

  return (
    <Sheet title={`${order.order_ref || '#' + order.order_no} · ${station}`} onClose={onClose}>
      <div className="d-head">
        <div className="d-qty"><b>{num(order.effective_quantity ?? order.quantity)}</b><span>{unit}</span></div>
        <div className="d-fuel">{fuel}</div>
        <PriorityBadge priority={order.priority} t={t} />
        <StatusChip status={order.status} t={t} />
      </div>

      <Rail status={order.status} t={t} />

      {open && (
        <div className="countbar" style={{ marginTop: 2 }}>
          <span>{t.responsibleTeam}: <b>{nextRole ? t['r_' + nextRole] : '—'}</b></span>
          <span style={{ flex: 'none' }}>{t.timeInStage}: {since(order.last_event_at || order.created_at, t)}</span>
        </div>
      )}

      {qcells.length > 1 && (
        <div className="qcmp">
          {qcells.map((c, i) => (
            <div className={'qc ' + (c.cls || '')} key={i}>
              <span className="l">{c.l}</span><span className="v">{num(c.v)} {unit}</span>
            </div>
          ))}
        </div>
      )}

      {order.status === 'disputed' && order.discrepancy_reason && (
        <div className="railcap end-flag" style={{ display: 'block' }}>
          {t.discrepancyWord}: {order.discrepancy_reason}
        </div>
      )}
      {order.resolution_note && (
        <div className="railcap end-slate" style={{ display: 'block', background: 'var(--go-tint)', color: 'var(--go)' }}>
          {t.resolutionWord}: {order.resolution_note}
        </div>
      )}

      <dl className="facts">
        <Fact label={t.station} value={`${station} · ${order.station_code}`} />
        {order.station_location && <Fact label={t.location} value={order.station_location} />}
        <Fact label={t.requiredDate} value={dueDate(order.needed_date, t)} />
        {order.approved_date && order.approved_date !== order.needed_date && <Fact label={t.approvedDate} value={dueDate(order.approved_date, t)} />}
        <Fact label={t.reqBy} value={`${order.created_by_name || '—'} · ${stamp(order.created_at)}`} />
        {order.note && <Fact label={t.noteWord} value={order.note} />}

        {order.decided_at && <>
          <Fact label={t.decidedBy} value={`${order.decided_by_name || '—'} · ${stamp(order.decided_at)}`} />
          {order.decision_note && <Fact label={t.reason} value={order.decision_note} />}
        </>}

        {order.prepared_at && <Fact label={t.actPrepare} value={`${order.prepared_by_name || '—'} · ${stamp(order.prepared_at)}`} />}

        {order.loaded_at && <>
          <Fact label={t.dispatchedWord} value={`${order.loaded_by_name || '—'} · ${stamp(order.loaded_at)}`} />
          <Fact label={t.truckNo} value={order.truck_no} />
          <Fact label={t.driver} value={order.driver_name} />
          <Fact label={t.dispatchRef} value={order.dispatch_reference} />
          <Fact label={t.loadManifestNo} value={order.load_manifest_no} />
          {order.load_note && <Fact label={t.noteWord} value={order.load_note} />}
        </>}

        {order.delivered_at && <>
          <Fact label={t.receivedBy} value={`${order.delivered_by_name || '—'} · ${stamp(order.delivered_at)}`} />
          <Fact label={t.receiverName} value={order.receiver_name} />
          <Fact label={t.manifestNo} value={order.manifest_no} />
          {order.delivery_note && <Fact label={t.noteWord} value={order.delivery_note} />}
        </>}
      </dl>

      {problem && <div className="err" role="alert"><span>{problem}</span></div>}

      {events?.length > 0 && <>
        <div className="sect"><h3>{t.history}</h3><div className="rule" /></div>
        <div className="tl">
          {events.map((ev) => (
            <div className="tl-i" key={ev.id}>
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-b">
                <div className="tl-h">{t['st_' + ev.to_status] || ev.to_status}</div>
                <div className="tl-m">{ev.actor_name || '—'} · {stamp(ev.created_at)}</div>
                {ev.old_value && ev.new_value && (
                  <div className="tl-chg"><s>{ev.old_value}</s> → <b>{ev.new_value}</b></div>
                )}
                {ev.reason && <div className="tl-r">{ev.reason}</div>}
              </div>
            </div>
          ))}
        </div>
      </>}

      <div className="acts">
        {can.edit && <button className="btn btn-go" onClick={() => onAct('edit', order)}>{t.actEdit}</button>}
        {can.submit && <button className="btn btn-go" onClick={() => onAct('submit', order)}>{t.actSubmit}</button>}
        {can.approve && <button className="btn btn-go" onClick={() => onAct('approve', order)}>{t.actApprove}</button>}
        {can.return && <button className="btn" onClick={() => onAct('return', order)}>{t.actReturn}</button>}
        {can.reject && <button className="btn btn-no" onClick={() => onAct('reject', order)}>{t.actReject}</button>}
        {can.prepare && <button className="btn btn-load" onClick={() => onAct('prepare', order)}>{t.actPrepare}</button>}
        {can.dispatch && <button className="btn btn-load" onClick={() => onAct('dispatch', order)}>{t.actDispatch}</button>}
        {can.deliver && <button className="btn btn-done" onClick={() => onAct('deliver', order)}>{t.confirmDelivery}</button>}
        {can.resolve && <button className="btn btn-go" onClick={() => onAct('resolve', order)}>{t.resolveDispute}</button>}
        {can.cancel && <button className="btn btn-ghost btn-sm" onClick={() => onAct('cancel', order)}>{t.cancelOrder}</button>}
        {order.load_manifest_path && <button className="btn btn-ghost btn-sm" onClick={() => openManifest(order.load_manifest_path)}>{t.viewLoadManifest}</button>}
        {order.manifest_path && <button className="btn btn-ghost btn-sm" onClick={() => openManifest(order.manifest_path)}>{t.viewManifest}</button>}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>{t.close}</button>
      </div>
    </Sheet>
  )
}
