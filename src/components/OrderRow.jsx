import { num, orderNo, dueDate } from '../lib/util'

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
 * The quantity leads, because that is the fact anyone actually scans for — the
 * station name led before and every row in a station's own list said the same
 * thing. Order number, station and date drop to a quieter second line, and the
 * status colour carries across the dot, the pill and the left edge so a list
 * can be read by colour alone.
 */
export function OrderRow({ order, t, lang, role, onOpen, onAct }) {
  const station = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuel = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const action = primaryAction(role, order.status)

  return (
    <div className={'orow s-' + order.status + (action ? ' needs-me' : '')}>
      <button
        className="orow-main"
        onClick={() => onOpen(order)}
        aria-label={`${t.details} #${orderNo(order.order_no)}`}
      >
        <span className="orow-body">
          <span className="orow-top">
            <span className="orow-qty">
              <b>{num(order.quantity)}</b>
              <i>{order.product_unit}</i>
            </span>
            <span className="orow-fuel">{fuel}</span>
            <span className={'sdot d-' + order.status} aria-hidden="true" />
            <span className="orow-status">{t['st_' + order.status]}</span>
          </span>
          <span className="orow-sub">
            <span className="orow-no">#{orderNo(order.order_no)}</span>
            <span className="dot-sep">·</span>
            <span className="orow-station">{station}</span>
            <span className="dot-sep">·</span>
            <span>{dueDate(order.needed_date, t)}</span>
          </span>
        </span>
      </button>

      {action && (
        <button className={'orow-act a-' + action.tone} onClick={() => onAct(action.key, order)}>
          {t[LABEL[action.key]]}
        </button>
      )}
    </div>
  )
}
