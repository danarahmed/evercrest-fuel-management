/** Thousands-separated number, or '' for empty values. */
export const num = (v) =>
  v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-US')

/** #0042 style order numbers. */
export const orderNo = (n) => String(n ?? '').padStart(4, '0')

/** yyyy-mm-dd in local time (not UTC — toISOString would shift the day). */
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export const daysAgo = (n) => startOfDay(new Date(Date.now() - n * 86400000))

/** "14:05" for today, "03 Mar 14:05" otherwise. */
export function stamp(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + time
}

/** "Today" / "Tomorrow" / "03 Mar" for a yyyy-mm-dd date column. */
export function dueDate(value, t) {
  if (!value) return ''
  const d = new Date(value + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  const diff = Math.round((d - startOfDay(new Date())) / 86400000)
  if (diff === 0) return t.today
  if (diff === 1) return t.tomorrow
  if (diff === -1) return t.yesterday
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/**
 * Escape a CSV cell.
 *
 * Beyond normal quoting this neutralises spreadsheet formula injection: Excel
 * and Sheets execute a cell that starts with = + - @ (or a leading tab /
 * carriage return) even when the value is quoted, so a note like
 * `=HYPERLINK(...)` would run on the accountant's machine. Prefixing an
 * apostrophe makes it inert and still readable.
 */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

export function downloadCsv(filename, rows) {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  // BOM so Excel reads UTF-8 (Kurdish names) correctly.
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Human-readable message for anything thrown by supabase-js. */
export function errText(error, fallback) {
  if (!error) return fallback
  const m = error.message || error.error_description || ''
  if (/Failed to fetch|NetworkError|network/i.test(m)) return fallback
  return m || fallback
}

export const OPEN_STATUSES = ['pending', 'approved', 'loaded']
export const DONE_STATUSES = ['delivered', 'rejected', 'cancelled']

/** Day bucket label for grouping a list by date. */
export function dayLabel(value, t) {
  const d = startOfDay(new Date(value))
  const today = startOfDay(new Date())
  const diff = Math.round((today - d) / 86400000)
  if (diff === 0) return t.today
  if (diff === 1) return t.yesterday
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
