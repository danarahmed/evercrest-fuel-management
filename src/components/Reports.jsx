import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, ErrorBox, Skeleton } from './common'
import { reportSummary } from '../lib/api'
import { ALL_STATUSES } from '../lib/workflow'
import { daysAgo, downloadCsv, isoDate, locationsOf, num, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

/**
 * Reports read a server-side aggregate (report_summary): exact sums over the
 * whole matching set, grouped by local calendar day — no row cap, no timezone
 * slicing. The client only formats and totals the handful of returned lines.
 *
 * The view is deliberately simple to read: a period (with a custom day range),
 * a few headline numbers, a day-by-day trend, and a per-station breakdown.
 */
const PERIODS = [
  ['pToday', 'pToday'], ['p7', 'p7'], ['p30', 'p30'], ['p90', 'p90'], ['allTime', 'allTime'], ['custom', 'customRange'],
]

export function Reports({ t, lang, role, profile, stations, refreshKey }) {
  const isStation = role === 'station'
  const today = isoDate(new Date())

  const [period, setPeriod] = useState('p30')
  const [from, setFrom] = useState(isoDate(daysAgo(29)))
  const [to, setTo] = useState(today)
  const [stationId, setStationId] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')

  const range = useCallback(() => {
    const tomorrow = new Date(Date.now() + 86400000)
    if (period === 'pToday') return [startOfDay(new Date()), tomorrow]
    if (period === 'p7') return [daysAgo(6), tomorrow]
    if (period === 'p30') return [daysAgo(29), tomorrow]
    if (period === 'p90') return [daysAgo(89), tomorrow]
    if (period === 'custom') {
      const f = from ? new Date(from + 'T00:00:00') : undefined
      const tEnd = to ? new Date(new Date(to + 'T00:00:00').getTime() + 86400000) : undefined
      return [f, tEnd]
    }
    return [undefined, undefined]
  }, [period, from, to])

  const load = useCallback(async () => {
    setState('loading'); setProblem('')
    const [fromDate, toDate] = range()
    try {
      const data = await reportSummary({
        fromDate, toDate,
        stationId: stationId || undefined,
        status: isStation ? 'delivered' : status || undefined,
      })
      setRows(data); setState('ready')
    } catch (e) { setProblem(translateError(e, t)); setState('error') }
  }, [range, stationId, status, isStation, t])

  useEffect(() => { load() }, [load, refreshKey])

  const stationLocation = useMemo(() => {
    const m = {}
    for (const s of stations) m[s.id] = (s.location || '').trim()
    return m
  }, [stations])

  const lines = useMemo(() => {
    let out = rows.map((r) => ({
      day: r.day,
      station: lang === 'ku' ? r.station_name_ku : r.station_name_en,
      code: r.station_code, station_id: r.station_id,
      orders: isStation ? Number(r.delivered_orders) : Number(r.orders),
      requested: Number(r.requested), loaded: Number(r.loaded),
      onWay: Number(r.on_way), received: Number(r.received),
    }))
    if (location) out = out.filter((l) => stationLocation[l.station_id] === location)
    return out
  }, [rows, lang, isStation, location, stationLocation])

  const totals = useMemo(() => lines.reduce((a, l) => ({
    orders: a.orders + l.orders, requested: a.requested + l.requested,
    loaded: a.loaded + l.loaded, onWay: a.onWay + l.onWay, received: a.received + l.received,
  }), { orders: 0, requested: 0, loaded: 0, onWay: 0, received: 0 }), [lines])

  const fulfil = totals.requested > 0 ? Math.round((totals.received / totals.requested) * 100) : 0

  // Volume-by-day trend (ascending), received per day.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.day, (m.get(l.day) || 0) + l.received)
    return [...m.entries()].map(([day, v]) => ({ day, v })).sort((a, b) => (a.day < b.day ? -1 : 1))
  }, [lines])
  const maxDay = Math.max(1, ...byDay.map((d) => d.v))

  // Per-station rollup.
  const byStation = useMemo(() => {
    const m = new Map()
    for (const l of lines) {
      const cur = m.get(l.station_id) || { id: l.station_id, name: l.station, code: l.code, orders: 0, requested: 0, loaded: 0, received: 0 }
      cur.orders += l.orders; cur.requested += l.requested; cur.loaded += l.loaded; cur.received += l.received
      m.set(l.station_id, cur)
    }
    return [...m.values()].sort((a, b) => b.received - a.received)
  }, [lines])

  const fmtDay = (day) => new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

  const exportCsv = () => {
    const header = isStation ? ['date', 'orders', 'received'] : ['date', 'station', 'orders', 'requested', 'dispatched', 'on_way', 'received']
    const body = lines.map((l) => isStation
      ? [l.day, l.orders, l.received]
      : [l.day, `${l.station} (${l.code})`, l.orders, l.requested, l.loaded, l.onWay, l.received])
    downloadCsv(`report-${today}.csv`, [header, ...body])
  }

  const locations = locationsOf(stations)
  const stationChoices = location ? stations.filter((s) => (s.location || '').trim() === location) : stations
  const activeFilters = (stationId ? 1 : 0) + (location ? 1 : 0) + (status ? 1 : 0)

  return (
    <>
      <div className="phead">
        <h1>{t.tabReports}</h1>
        <p>{t.basisNote}</p>
      </div>

      <div className="toolbar">
        <div className="per">
          {PERIODS.map(([p, label]) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t[label]}</button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="fsel" style={{ marginTop: 4 }}>
            <label className="drange"><span>{t.from}</span>
              <input className="inp" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="drange"><span>{t.to}</span>
              <input className="inp" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        {!isStation && (
          <>
            <button className="btn btn-ghost btn-sm filterbtn" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              {t.filtersWord}{activeFilters ? ` · ${activeFilters}` : ''} {showFilters ? '▲' : '▾'}
            </button>
            {showFilters && (
              <div className="fsel" style={{ marginTop: 8 }}>
                {locations.length > 0 && (
                  <select className="inp" value={location} aria-label={t.location}
                    onChange={(e) => { setLocation(e.target.value); setStationId('') }}>
                    <option value="">{t.allLocations}</option>
                    {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                )}
                <select className="inp" value={stationId} aria-label={t.station} onChange={(e) => setStationId(e.target.value)}>
                  <option value="">{t.allStations}</option>
                  {stationChoices.map((s) => <option key={s.id} value={s.id}>{lang === 'ku' ? s.name_ku : s.name_en}</option>)}
                </select>
                <select className="inp" value={status} aria-label={t.fAll} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">{t.allStatuses}</option>
                  {ALL_STATUSES.map((st) => <option key={st} value={st}>{t['st_' + st]}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      <ErrorBox onRetry={load} retryLabel={t.retry}>{state === 'error' ? problem || t.checkNet : ''}</ErrorBox>

      {state === 'loading' ? (
        <Skeleton rows={3} />
      ) : lines.length === 0 ? (
        <Empty title={t.noReport} msg={t.noReportP} />
      ) : (
        <>
          {/* headline numbers */}
          <div className="kgrid">
            <div className="kcard t-go"><span className="kl">{t.receivedWord}</span><span className="kv">{num(totals.received)}</span><span className="ks">{t.litreShort}</span></div>
            {isStation ? (
              <>
                <div className="kcard t-brand"><span className="kl">{t.completedOrders}</span><span className="kv">{num(totals.orders)}</span></div>
                <div className="kcard t-go"><span className="kl">{t.fulfilmentShort}</span><span className="kv">{fulfil}%</span></div>
              </>
            ) : (
              <>
                <div className="kcard t-sky"><span className="kl">{t.dispatchedWord}</span><span className="kv">{num(totals.loaded)}</span><span className="ks">{t.litreShort}</span></div>
                <div className="kcard t-amber"><span className="kl">{t.onWayWord}</span><span className="kv">{num(totals.onWay)}</span><span className="ks">{t.litreShort}</span></div>
                <div className="kcard"><span className="kl">{t.requestedWord}</span><span className="kv">{num(totals.requested)}</span><span className="ks">{t.litreShort}</span></div>
                <div className="kcard t-brand"><span className="kl">{t.ordersCol}</span><span className="kv">{num(totals.orders)}</span></div>
                <div className="kcard t-go"><span className="kl">{t.fulfilmentShort}</span><span className="kv">{fulfil}%</span></div>
              </>
            )}
          </div>

          {/* volume-by-day trend */}
          {byDay.length > 1 && (
            <>
              <div className="sect"><h3>{t.trendByDay}</h3><div className="rule" /></div>
              <div className="panel">
                <div className="bars">
                  {byDay.map((d) => (
                    <div className="bar-row" key={d.day}>
                      <div className="bar-top">
                        <span className="nm">{fmtDay(d.day)}</span>
                        <span className="vl">{num(d.v)} {t.litreShort}</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(d.v / maxDay) * 100}%`, background: 'var(--go)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* per-station breakdown */}
          {!isStation && byStation.length > 0 && (
            <>
              <div className="sect"><h3>{t.byStation}</h3><div className="rule" /></div>
              <div className="tablewrap">
                <table className="rtable">
                  <thead>
                    <tr>
                      <th>{t.station}</th>
                      <th className="n">{t.requestedWord}</th>
                      <th className="n">{t.dispatchedWord}</th>
                      <th className="n">{t.receivedWord}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStation.map((s) => (
                      <tr key={s.id}>
                        <td className="where"><span className="st">{s.name}</span><span className="sc">{s.code} · {s.orders} {t.ordersCol.toLowerCase()}</span></td>
                        <td className="n">{num(s.requested)}</td>
                        <td className="n">{s.loaded ? num(s.loaded) : '—'}</td>
                        <td className="n dlv">{s.received ? num(s.received) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="d">{t.totalWord}</td>
                      <td className="n">{num(totals.requested)}</td>
                      <td className="n">{num(totals.loaded)}</td>
                      <td className="n">{num(totals.received)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* per-day detail for a station's own report */}
          {isStation && (
            <div className="tablewrap">
              <table className="rtable">
                <thead><tr><th>{t.dateWord}</th><th className="n">{t.ordersCol}</th><th className="n">{t.receivedWord}</th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}><td className="d">{fmtDay(l.day)}</td><td className="n">{l.orders}</td><td className="n dlv">{l.received ? num(l.received) : '—'}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="d">{t.totalWord}</td><td className="n">{totals.orders}</td><td className="n">{num(totals.received)}</td></tr></tfoot>
              </table>
            </div>
          )}

          <button className="btn btn-ghost more" onClick={exportCsv}>{t.exportCsv}</button>
        </>
      )}
    </>
  )
}
