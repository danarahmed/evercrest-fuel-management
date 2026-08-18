import { useEffect, useState } from 'react'
import { Sheet, StatusChip, Rail } from './common'
import { fetchEvents, signedManifestUrl } from '../lib/api'
import { num, orderNo, stamp, dueDate } from '../lib/util'
import { allowedActions } from './OrderRow'

/** One labelled fact. Skipped entirely when there is nothing to show. */
function Fact({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/**
 * Everything about one order, on demand.
 *
 * The list stays scannable because all of this — timeline, truck, manifest,
 * notes, secondary actions — is behind a tap instead of stacked on every row.
 */
export function OrderDetail({ order, t, lang, role, onClose, onAct }) {
  const [events, setEvents] = useState(null)
  const [problem, setProblem] = useState('')

  const station = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuel = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const can = allowedActions(role, order.status)

  useEffect(() => {
    let stale = false
    fetchEvents(order.id)
      .then((rows) => { if (!stale) setEvents(rows) })
      .catch(() => { if (!stale) setEvents([]) })
    return () => { stale = true }
  }, [order.id])

  const openManifest = async () => {
    setProblem('')
    const tab = window.open('', '_blank', 'noopener,noreferrer')
    try {
      const url = await signedManifestUrl(order.manifest_path)
      if (tab) tab.location = url
      else window.location.assign(url)
    } catch {
      tab?.close()
      setProblem(t.manifestFail)
    }
  }

  const unit = order.product_unit

  return (
    <Sheet title={`#${orderNo(order.order_no)} · ${station}`} onClose={onClose}>
      <div className="d-head">
        <div className="d-qty">
          <b>{num(order.quantity)}</b>
          <span>{unit}</span>
        </div>
        <div className="d-fuel">{fuel}</div>
        <StatusChip status={order.status} t={t} />
      </div>

      <Rail status={order.status} t={t} />

      <dl className="facts">
        <Fact label={t.station} value={`${station} · ${order.station_code}`} />
        <Fact label={t.neededFor} value={dueDate(order.needed_date, t)} />
        <Fact label={t.reqBy} value={`${order.created_by_name || '—'} · ${stamp(order.created_at)}`} />
        {order.note && <Fact label={t.noteWord} value={order.note} />}

        {order.decided_at && (
          <Fact
            label={t.decidedBy}
            value={`${order.decided_by_name || '—'} · ${stamp(order.decided_at)}`}
          />
        )}
        {order.decision_note && <Fact label={t.reason} value={order.decision_note} />}

        {order.loaded_at && (
          <>
            <Fact label={t.loadedBy} value={`${order.loaded_by_name || '—'} · ${stamp(order.loaded_at)}`} />
            <Fact label={t.loadedQty} value={order.loaded_quantity != null ? `${num(order.loaded_quantity)} ${unit}` : ''} />
            <Fact label={t.truckNo} value={order.truck_no} />
            <Fact label={t.driver} value={order.driver_name} />
          </>
        )}

        {order.delivered_at && (
          <>
            <Fact label={t.receivedBy} value={`${order.delivered_by_name || '—'} · ${stamp(order.delivered_at)}`} />
            <Fact label={t.receivedQty} value={order.received_quantity != null ? `${num(order.received_quantity)} ${unit}` : ''} />
            <Fact label={t.manifestNo} value={order.manifest_no} />
          </>
        )}
      </dl>

      {problem && <div className="err" role="alert"><span>{problem}</span></div>}

      {events?.length > 0 && (
        <>
          <div className="sect"><h3>{t.history}</h3><div className="rule" /></div>
          <div className="trail">
            {events.map((ev) => (
              <div className="trail-i" key={ev.id}>
                <span className="t">{stamp(ev.created_at)}</span>
                <span>
                  {t['st_' + ev.to_status]} · {ev.actor_name || '—'}
                  {ev.note ? ' · ' + ev.note : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="acts">
        {can.approve && (
          <button className="btn btn-go" onClick={() => onAct('approve', order)}>{t.approve}</button>
        )}
        {can.reject && (
          <button className="btn btn-no" onClick={() => onAct('reject', order)}>{t.reject}</button>
        )}
        {can.load && (
          <button className="btn btn-load" onClick={() => onAct('load', order)}>{t.markLoaded}</button>
        )}
        {can.deliver && (
          <button className="btn btn-done" onClick={() => onAct('deliver', order)}>{t.confirmDelivery}</button>
        )}
        {can.cancel && (
          <button className="btn btn-ghost btn-sm" onClick={() => onAct('cancel', order)}>{t.cancelOrder}</button>
        )}
        {order.manifest_path && (
          <button className="btn btn-ghost btn-sm" onClick={openManifest}>{t.viewManifest}</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>{t.close}</button>
      </div>
    </Sheet>
  )
}
