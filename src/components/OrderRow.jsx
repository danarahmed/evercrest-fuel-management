import { num, orderNo, dueDate } from '../lib/util'
import { StatusChip } from './common'

/** Which buttons a role may see on an order in a given state. */
export function allowedActions(role, status) {
  return {
    approve: (role === 'manager' || role === 'admin') && status === 'pending',
    reject: (role === 'manager' || role === 'admin') && status === 'pending',
    load: (role === 'storage' || role === 'admin') && status === 'approved',
    deliver: (role === 'station' || role === 'admin') && status === 'loaded',
    cancel:
      (role === 'station' && status === 'pending') ||
      ((role === 'admin' || role === 'manager') && ['pending', 'approved'].includes(status)),
  }
}

/** The single action worth putting on the row itself; the rest live in the sheet. */
export function primaryAction(role, status) {
  const can = allowedActions(role, status)
  if (can.approve) return { key: 'approve', tone: 'go' }
  if (can.load) return { key: 'load', tone: 'load' }
  if (can.deliver) return { key: 'deliver', tone: 'done' }
  return null
}

// Short labels: the row is narrow, and the full wording is on the button
// inside the detail sheet.
const LABEL = { approve: 'actApprove', load: 'actLoad', deliver: 'actDeliver' }

/**
 * One order, one line.
 *
 * The previous card was ~170 lines of markup tall — a progress rail, meta line,
 * notes and a row of buttons — so four orders filled a phone screen. Everything
 * except the headline facts and the one action you are likely to take now moved
 * into the detail sheet, which opens on tap.
 */
export function OrderRow({ order, t, lang, role, onOpen, onAct }) {
  const station = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuel = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const action = primaryAction(role, order.status)

  return (
    <div className={'orow s-' + order.status}>
      <button className="orow-main" onClick={() => onOpen(order)} aria-label={`${t.details} #${orderNo(order.order_no)}`}>
        <span className="orow-no">#{orderNo(order.order_no)}</span>
        <span className="orow-body">
          <span className="orow-top">
            <span className="orow-station">{station}</span>
            <StatusChip status={order.status} t={t} />
          </span>
          <span className="orow-facts">
            <b>{num(order.quantity)}</b>
            <span className="u">{order.product_unit}</span>
            <span className="dot-sep">·</span>
            <span>{fuel}</span>
            <span className="dot-sep">·</span>
            <span>{dueDate(order.needed_date, t)}</span>
          </span>
        </span>
      </button>

      {action && (
        <button
          className={'orow-act a-' + action.tone}
          onClick={() => onAct(action.key, order)}
        >
          {t[LABEL[action.key]]}
        </button>
      )}
    </div>
  )
}
