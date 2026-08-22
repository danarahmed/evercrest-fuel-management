/**
 * The order state machine, in one place.
 *
 * This mirrors the database exactly (see the SECURITY DEFINER transition
 * functions). The server is the real authority — every rule here is also
 * enforced in Postgres — but keeping a faithful copy on the client lets the UI
 * show only the actions a role may actually take, and lets the tests assert the
 * matrix without a database.
 */

export const STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending_approval',
  CHANGES: 'changes_requested',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  PREPARING: 'preparing',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
  DISPUTED: 'disputed',
  CANCELLED: 'cancelled',
}

// Display order and grouping.
export const ALL_STATUSES = [
  'draft', 'pending_approval', 'changes_requested', 'approved',
  'preparing', 'dispatched', 'delivered', 'disputed', 'rejected', 'cancelled',
]

// "Open" = still moving through the pipeline; "done" = closed.
export const OPEN_STATUSES = ['pending_approval', 'changes_requested', 'approved', 'preparing', 'dispatched', 'disputed']
export const DONE_STATUSES = ['delivered', 'rejected', 'cancelled']

// Which colour family a status wears (maps to CSS c-<key> / d-<key>).
export const STATUS_TONE = {
  draft: 'slate',
  pending_approval: 'amber',
  changes_requested: 'amber',
  approved: 'brand',
  preparing: 'sky',
  dispatched: 'sky',
  delivered: 'go',
  disputed: 'flag',
  rejected: 'flag',
  cancelled: 'slate',
}

export const PRIORITIES = ['normal', 'urgent', 'emergency']

// The five-stage happy path shown in the progress tracker. Rejected/cancelled/
// disputed are off-rail and rendered as an end-state instead.
export const RAIL = ['pending_approval', 'approved', 'preparing', 'dispatched', 'delivered']

/**
 * Every action a role may take on an order in a given status.
 * Keys match the transition RPCs. This is the single source of truth for
 * client-side gating (OrderRow, OrderDetail, ActionSheet) and the tests.
 */
export function allowedActions(role, status) {
  const A = {}
  const is = (...s) => s.includes(status)

  if (role === 'station' || role === 'admin') {
    if (is('draft', 'changes_requested')) { A.edit = true; A.submit = true }
    if (is('dispatched')) A.deliver = true
  }
  if (role === 'manager' || role === 'admin') {
    if (is('pending_approval')) { A.approve = true; A.return = true; A.reject = true }
    if (is('disputed')) A.resolve = true
  }
  if (role === 'storage' || role === 'admin') {
    if (is('approved')) A.prepare = true
    if (is('preparing')) A.dispatch = true
  }
  // Cancellation eligibility differs by role.
  if (role === 'station') {
    if (is('draft', 'pending_approval', 'changes_requested')) A.cancel = true
  } else if (role === 'manager' || role === 'admin') {
    if (is('draft', 'pending_approval', 'changes_requested', 'approved', 'preparing')) A.cancel = true
  }
  return A
}

// The one action a queue row leads with, and the button tone it wears.
const PRIMARY = {
  submit: { key: 'submit', tone: 'go' },
  approve: { key: 'approve', tone: 'go' },
  prepare: { key: 'prepare', tone: 'load' },
  dispatch: { key: 'dispatch', tone: 'load' },
  deliver: { key: 'deliver', tone: 'done' },
  resolve: { key: 'resolve', tone: 'go' },
}
const PRIMARY_BY_STATUS = {
  draft: 'submit',
  changes_requested: 'submit',
  pending_approval: 'approve',
  approved: 'prepare',
  preparing: 'dispatch',
  dispatched: 'deliver',
  disputed: 'resolve',
}

export function primaryAction(role, status) {
  const key = PRIMARY_BY_STATUS[status]
  if (!key) return null
  const allowed = allowedActions(role, status)
  if (!allowed[key]) return null
  return PRIMARY[key]
}

/** i18n key for a status label. */
export const statusKey = (status) => 'st_' + status
/** i18n key for a priority label. */
export const priorityKey = (p) => 'pr_' + p

/** The role that must act next on an open order (for the "responsible" column). */
export const NEXT_ROLE = {
  pending_approval: 'manager',
  changes_requested: 'station',
  approved: 'storage',
  preparing: 'storage',
  dispatched: 'station',
  disputed: 'manager',
  draft: 'station',
}
