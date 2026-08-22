import { num, orderNo, dueDate } from '../lib/util'
import { primaryAction } from '../lib/workflow'
import { PriorityBadge } from './common'

// Short labels for the one action on the row; full wording lives in the sheet.
const LABEL = {
  submit: 'actSubmit', approve: 'actApprove', prepare: 'actPrepare',
  dispatch: 'actDispatch', deliver: 'actDeliver', resolve: 'actResolve',
}

/**
 * One order, one line. The quantity leads (the fact people scan for); the human
 * order reference, station and required date sit on a quieter second line, and
 * the status colour carries across the dot, the label and the left edge so a
 * list reads by colour and by text together.
 */
export function OrderRow({ order, t, lang, role, onOpen, onAct }) {
  const station = lang === 'ku' ? order.station_name_ku : order.station_name_en
  const fuel = lang === 'ku' ? order.product_name_ku : order.product_name_en
  const action = primaryAction(role, order.status)
  const qty = order.effective_quantity ?? order.quantity

  return (
    <div className={'orow s-' + order.status + (action ? ' needs-me' : '')}>
      <button
        className="orow-main"
        onClick={() => onOpen(order)}
        aria-label={`${t.details} ${order.order_ref || '#' + orderNo(order.order_no)}`}
      >
        <span className="orow-body">
          <span className="orow-top">
            <span className="orow-qty">
              <b>{num(qty)}</b>
              <i>{order.product_unit}</i>
            </span>
            <span className="orow-fuel">{fuel}</span>
            <PriorityBadge priority={order.priority} t={t} />
            <span className={'sdot d-' + order.status} aria-hidden="true" />
            <span className="orow-status">{t['st_' + order.status]}</span>
          </span>
          <span className="orow-sub">
            <span className="orow-no">{order.order_ref || '#' + orderNo(order.order_no)}</span>
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
