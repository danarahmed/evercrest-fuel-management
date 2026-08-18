import { useState } from 'react'
import { StatusChip, Rail } from './common'
import { fetchEvents, signedManifestUrl } from '../lib/api'
import { num, orderNo, stamp, dueDate } from '../lib/util'

/** Which buttons a role may see on an order in a given state. */
export function allowedActions(role, status) {
  return {
    decide: (role === 'manager' || role === 'admin') && status === 'pending',
    load: (role === 'storage' || role === 'admin') && status === 'approved',
    deliver: (role === 'station' || role === 'admin') && status === 'loaded',
    cancel:
      (role === 'station' && status === 'pending') ||
      ((role === 'admin' || role === 'manager') && ['pending', 'approved'].includes(status)),
  }
}

export function OrderCard({ order, t, lang, role, onAct }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const stationName = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuelName = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const can = allowedActions(role, order.status)

  const toggleHistory = async () => {
    const next = !open
    setOpen(next)
    if (!next || events) return
    setBusy(true)
    setProblem('')
    try {
      setEvents(await fetchEvents(order.id))
    } catch {
      setProblem(t.genericErr)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const openManifest = async () => {
    setProblem('')
    // Open synchronously so mobile Safari does not treat this as a popup.
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

  return (
    <article className={'ticket t-' + order.status}>
      <div className="spine" />
      <div className="ticket-body">
        <div className="t-head">
          <span className="t-no">#{orderNo(order.order_no)}</span>
          <div className="t-title">
            <div className="t-station">{stationName}</div>
            <div className="t-sub">
              {order.station_code} · {t.neededFor} {dueDate(order.needed_date, t)}
            </div>
          </div>
          <StatusChip status={order.status} t={t} />
        </div>

        <div className="qty">
          <b>{num(order.quantity)}</b>
          <span>{order.product_unit}</span>
          <span className="fuel">{fuelName}</span>
        </div>

        <Rail status={order.status} t={t} />

        <div className="meta">
          {t.reqBy} {order.created_by_name || '—'} · {stamp(order.created_at)}
        </div>

        {order.note && <div className="note">{order.note}</div>}

        {order.status === 'rejected' && order.decision_note && (
          <div className="note">
            <b>{t.reason}:</b> {order.decision_note}
          </div>
        )}

        {order.status === 'loaded' && (order.truck_no || order.driver_name) && (
          <div className="note">
            {order.truck_no && (
              <>
                <b>{t.truckNo}:</b> {order.truck_no}{' '}
              </>
            )}
            {order.driver_name && <>· {order.driver_name}</>}
          </div>
        )}

        {order.status === 'delivered' && (
          <div className="note">
            <b>{t.deliveredOn}:</b> {stamp(order.delivered_at)}
            {order.received_quantity != null && <> · {num(order.received_quantity)} {order.product_unit}</>}
            {order.manifest_no && <> · {t.manifestNo} {order.manifest_no}</>}
          </div>
        )}

        {problem && <div className="err inline" role="alert">{problem}</div>}

        {open && (
          <div className="trail">
            {busy && <span className="t">{t.loadingData}</span>}
            {events?.map((ev) => (
              <div className="trail-i" key={ev.id}>
                <span className="t">{stamp(ev.created_at)}</span>
                <span>
                  {t['st_' + ev.to_status]} · {ev.actor_name || '—'}
                  {ev.note ? ' · ' + ev.note : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="acts">
          {can.decide && (
            <>
              <button className="btn btn-go" onClick={() => onAct('approve', order)}>
                {t.approve}
              </button>
              <button className="btn btn-no" onClick={() => onAct('reject', order)}>
                {t.reject}
              </button>
            </>
          )}
          {can.load && (
            <button className="btn btn-load" onClick={() => onAct('load', order)}>
              {t.markLoaded}
            </button>
          )}
          {can.deliver && (
            <button className="btn btn-done" onClick={() => onAct('deliver', order)}>
              {t.confirmDelivery}
            </button>
          )}
          {can.cancel && (
            <button className="btn btn-ghost btn-sm" onClick={() => onAct('cancel', order)}>
              {t.cancelOrder}
            </button>
          )}
          {order.manifest_path && (
            <button className="btn btn-ghost btn-sm" onClick={openManifest}>
              {t.viewManifest}
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleHistory}
            aria-expanded={open}
          >
            {t.history}
          </button>
        </div>
      </div>
    </article>
  )
}
