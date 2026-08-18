import { csvCell, isoDate, num, orderNo } from '../src/lib/util.js'

let pass = 0, fail = 0
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n     got :', JSON.stringify(got), '\n     want:', JSON.stringify(want)) }
}

console.log('CSV formula injection:')
eq('=cmd neutralised',      csvCell('=cmd|calc'),        `"'=cmd|calc"`)
eq('+ neutralised',         csvCell('+1+1'),             `"'+1+1"`)
eq('- neutralised',         csvCell('-2+3'),             `"'-2+3"`)
eq('@ neutralised',         csvCell('@SUM(A1)'),         `"'@SUM(A1)"`)
eq('tab neutralised',       csvCell('\t=1'),             `"'\t=1"`)
eq('quotes doubled',        csvCell('say "hi"'),         '"say ""hi"""')
eq('plain text untouched',  csvCell('Erbil North'),      '"Erbil North"')
eq('null -> empty',         csvCell(null),               '""')
eq('number untouched',      csvCell(5000),               '"5000"')

console.log('\nLocal-date handling (isoDate must not shift the day via UTC):')
const d = new Date(2026, 0, 1, 0, 30)   // 1 Jan 2026 00:30 local
eq('isoDate keeps local day', isoDate(d), '2026-01-01')

console.log('\nFormatting:')
eq('num groups',   num(1071000), '1,071,000')
eq('num empty',    num(null), '')
eq('num zero',     num(0), '0')
eq('orderNo pads', orderNo(42), '0042')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
