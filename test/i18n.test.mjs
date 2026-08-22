// The dictionary must stay in lockstep across languages, and must have a label
// for every status and priority the UI can render.
import { DICT } from '../src/lib/i18n.js'
import { ALL_STATUSES, PRIORITIES } from '../src/lib/workflow.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name) } }

const en = Object.keys(DICT.en)
const ku = Object.keys(DICT.ku)
ok('en and ku have the same number of keys', en.length === ku.length)
ok('no key missing from ku', en.every((k) => k in DICT.ku))
ok('no extra key in ku', ku.every((k) => k in DICT.en))

for (const lang of ['en', 'ku']) {
  for (const s of ALL_STATUSES) ok(`${lang} has st_${s}`, !!DICT[lang]['st_' + s])
  for (const p of PRIORITIES) ok(`${lang} has pr_${p}`, !!DICT[lang]['pr_' + p])
  for (const kind of ['submitted', 'approved', 'returned', 'rejected', 'preparing', 'dispatched', 'delivered', 'disputed', 'resolved', 'cancelled']) {
    ok(`${lang} has notif_${kind}`, !!DICT[lang]['notif_' + kind])
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
