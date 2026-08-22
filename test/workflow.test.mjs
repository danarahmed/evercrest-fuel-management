// State-machine matrix: the permitted and — just as important — the prohibited
// role×status actions. This mirrors the database's SECURITY DEFINER functions.
import { allowedActions, primaryAction, OPEN_STATUSES, DONE_STATUSES, ALL_STATUSES } from '../src/lib/workflow.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name) } }
const can = (role, status, action) => !!allowedActions(role, status)[action]

console.log('Station:')
ok('station edits a draft', can('station', 'draft', 'edit'))
ok('station submits a draft', can('station', 'draft', 'submit'))
ok('station edits a returned order', can('station', 'changes_requested', 'edit'))
ok('station confirms a dispatched order', can('station', 'dispatched', 'deliver'))
ok('station cancels its pending order', can('station', 'pending_approval', 'cancel'))
ok('station CANNOT approve', !can('station', 'pending_approval', 'approve'))
ok('station CANNOT prepare', !can('station', 'approved', 'prepare'))
ok('station CANNOT cancel an approved order', !can('station', 'approved', 'cancel'))
ok('station CANNOT deliver an approved order', !can('station', 'approved', 'deliver'))

console.log('Manager:')
ok('manager approves a pending order', can('manager', 'pending_approval', 'approve'))
ok('manager returns a pending order', can('manager', 'pending_approval', 'return'))
ok('manager rejects a pending order', can('manager', 'pending_approval', 'reject'))
ok('manager resolves a dispute', can('manager', 'disputed', 'resolve'))
ok('manager CANNOT prepare', !can('manager', 'approved', 'prepare'))
ok('manager CANNOT dispatch', !can('manager', 'preparing', 'dispatch'))
ok('manager CANNOT approve an already-approved order', !can('manager', 'approved', 'approve'))

console.log('Storage:')
ok('storage prepares an approved order', can('storage', 'approved', 'prepare'))
ok('storage dispatches a preparing order', can('storage', 'preparing', 'dispatch'))
ok('storage CANNOT approve', !can('storage', 'pending_approval', 'approve'))
ok('storage CANNOT dispatch an approved order (must prepare first)', !can('storage', 'approved', 'dispatch'))
ok('storage CANNOT deliver', !can('storage', 'dispatched', 'deliver'))

console.log('Admin (superset):')
ok('admin approves', can('admin', 'pending_approval', 'approve'))
ok('admin prepares', can('admin', 'approved', 'prepare'))
ok('admin dispatches', can('admin', 'preparing', 'dispatch'))
ok('admin delivers', can('admin', 'dispatched', 'deliver'))
ok('admin resolves', can('admin', 'disputed', 'resolve'))

console.log('Closed states accept nothing:')
for (const s of ['delivered', 'rejected', 'cancelled']) {
  for (const role of ['station', 'manager', 'storage', 'admin']) {
    ok(`${role} has no action on ${s}`, Object.keys(allowedActions(role, s)).length === 0)
  }
}

console.log('Primary action per status:')
ok('draft → submit', primaryAction('station', 'draft')?.key === 'submit')
ok('pending → approve (manager)', primaryAction('manager', 'pending_approval')?.key === 'approve')
ok('approved → prepare (storage)', primaryAction('storage', 'approved')?.key === 'prepare')
ok('preparing → dispatch (storage)', primaryAction('storage', 'preparing')?.key === 'dispatch')
ok('dispatched → deliver (station)', primaryAction('station', 'dispatched')?.key === 'deliver')
ok('disputed → resolve (manager)', primaryAction('manager', 'disputed')?.key === 'resolve')
ok('station sees no primary on a pending order', primaryAction('station', 'pending_approval') === null)

console.log('Buckets:')
ok('10 statuses total', ALL_STATUSES.length === 10)
ok('open + done cover the moving/closed split', OPEN_STATUSES.length === 6 && DONE_STATUSES.length === 3)
ok('draft is neither open nor done', !OPEN_STATUSES.includes('draft') && !DONE_STATUSES.includes('draft'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
