import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, ErrorBox, Spinner } from './common'
import { reportSummary } from '../lib/api'
import { daysAgo, downloadCsv, isoDate, locationsOf, num, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

/**
 * Reports read from a server-side aggregate (report_summary). The database
 * groups by local calendar day and sums over every matching order — no row
 * cap, no UTC slicing — so the totals are exact. Each returned row is already
 * one day+station line; the client only formats and sums the handful of lines.
 *
 *   loaded   — left the yard (loaded now, or already delivered)
 *   on_way   — loaded but the station has not signed for it yet (subset of loaded)
 *   received — the station signed for it
 */
import { ALL_STATUSES } from '../lib/workflow'
const PERIODS = ['pToday', 'p7', 'p30', 'p90', 'allTime']
const STATUS_CHOICES = ALL_STATUSES

export function Reports({ t, lang, role, profile, stations, refreshKey }) {
  const [period, setPeriod] = useState('p30')
  const [stationId, setStationId] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')

  // A station reports on its own completed work; everyone else on the network.
  const isStation = role === 'station'

  const range = useCallback(() => {
    const tomorrow = new Date(Date.now() + 86400000)
    if (period === 'pToday') return [startOfDay(new Date()), tomorrow]
    if (period === 'p7') return [daysAgo(6), tomorrow]
    if (period === 'p30') return [daysAgo(29), tomorrow]
    if (period === 'p90') return [daysAgo(89), tomorrow]
    return [undefined, undefined]
  }, [period])

  const load = useCallback(async () => {
    setState('loading')
    setProblem('')
    const [fromDate, toDate] = range()
    try {
      const data = await reportSummary({
        fromDate,
        toDate,
        stationId: stationId || undefined,
        // A station's report is its completed work only.
        status: isStation ? 'delivered' : status || undefined,
      })
      setRows(data)
      setState('ready')
    } catch (e) {
      setProblem(translateError(e, t))
      setState('error')
    }
  }, [range, stationId, status, isStation, t])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // The RPC already returns one line per day+station. When a location is
  // selected the office keeps only its stations; the station filter narrows
  // further. (Location is a client-side narrow because the RPC keys on station.)
  const stationLocation = useMemo(() => {
    const m = {}
    for (const s of stations) m[s.id] = (s.location || '').trim()
    return m
  }, [stations])

  const lines = useMemo(() => {
    let out = rows.map((r) => ({
      day: r.day,
      station: lang === 'ku' ? r.station_name_ku : r.station_name_en,
      code: r.station_code,
      station_id: r.station_id,
      orders: isStation ? Number(r.delivered_orders) : Number(r.orders),
      loaded: Number(r.loaded),
      onWay: Number(r.on_way),
      received: Number(r.received),
    }))
    if (location) out = out.filter((l) => stationLocation[l.station_id] === location)
    return out
  }, [rows, lang, isStation, location, stationLocation])

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          orders: acc.orders + l.orders,
          loaded: acc.loaded + l.loaded,
          onWay: acc.onWay + l.onWay,
          received: acc.received + l.received,
        }),
        { orders: 0, loaded: 0, onWay: 0, received: 0 },
      ),
    [lines],
  )

  const exportCsv = () => {
    const header = isStation
      ? ['date', 'orders', 'received']
      : ['date', 'station', 'orders', 'loaded', 'on_way', 'received']
    const body = lines.map((l) =>
      isStation
        ? [l.day, l.orders, l.received]
        : [l.day, `${l.station} (${l.code})`, l.orders, l.loaded, l.onWay, l.received],
    )
    downloadCsv(`report-${isoDate(new Date())}.csv`, [header, ...body])
  }

  const locations = locationsOf(stations)
  const stationChoices = location
    ? stations.filter((s) => (s.location || '').trim() === location)
    : stations

  const fmtDay = (day) => {
    const d = new Date(day + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  return (
    <>
      <div className="toolbar">
        <div className="per">
          {PERIODS.map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t[p]}
            </button>
          ))}
        </div>
        {!isStation && (
          <div className="fsel">
            {locations.length > 0 && (
              <select
                className="inp"
                value={location}
                aria-label={t.location}
                onChange={(e) => {
                  setLocation(e.target.value)
                  setStationId('')
                }}
              >
                <option value="">{t.allLocations}</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            )}
            <select
              className="inp"
              value={stationId}
              aria-label={t.station}
              onChange={(e) => setStationId(e.target.value)}
            >
              <option value="">{t.allStations}</option>
              {stationChoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {lang === 'ku' ? s.name_ku : s.name_en}
                </option>
              ))}
            </select>

            <select
              className="inp"
              value={status}
              aria-label={t.fAll}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t.allStatuses}</option>
              {STATUS_CHOICES.map((st) => (
                <option key={st} value={st}>{t['st_' + st]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ErrorBox onRetry={load} retryLabel={t.retry}>
        {state === 'error' ? problem || t.checkNet : ''}
      </ErrorBox>

      {state === 'loading' ? (
        <Spinner label={t.loadingData} />
      ) : lines.length === 0 ? (
        <Empty title={t.noReport} msg={t.noReportP} />
      ) : (
        <>
          <div className="kpis">
            {isStation ? (
              <>
                <div className="kpi k-dlv">
                  <span className="kl">{t.receivedWord}</span>
                  <span className="kv">{num(totals.received)}</span>
                  <span className="ku">{t.litreShort}</span>
                </div>
                <div className="kpi">
                  <span className="kl">{t.completedOrders}</span>
                  <span className="kv">{num(totals.orders)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="kpi k-lod">
                  <span className="kl">{t.loadedWord}</span>
                  <span className="kv">{num(totals.loaded)}</span>
                  <span className="ku">{t.litreShort}</span>
                </div>
                <div className="kpi k-way">
                  <span className="kl">{t.onWayWord}</span>
                  <span className="kv">{num(totals.onWay)}</span>
                  <span className="ku">{t.litreShort}</span>
                </div>
                <div className="kpi k-dlv">
                  <span className="kl">{t.receivedWord}</span>
                  <span className="kv">{num(totals.received)}</span>
                  <span className="ku">{t.litreShort}</span>
                </div>
              </>
            )}
          </div>

          <div className="tablewrap">
            <table className="rtable">
              <thead>
                <tr>
                  <th>{isStation ? t.dateWord : t.whenWhere}</th>
                  {isStation && <th className="n">{t.ordersCol}</th>}
                  {!isStation && <th className="n">{t.loadedWord}</th>}
                  {!isStation && <th className="n">{t.onWayShort}</th>}
                  <th className="n">{t.receivedWord}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    {isStation ? (
                      <td className="d">{fmtDay(l.day)}</td>
                    ) : (
                      <td className="where">
                        <span className="st">{l.station}</span>
                        <span className="sc">
                          {fmtDay(l.day)} · {l.code} · {l.orders} {t.ordersCol.toLowerCase()}
                        </span>
                      </td>
                    )}
                    {isStation && <td className="n">{l.orders}</td>}
                    {!isStation && <td className="n">{num(l.loaded)}</td>}
                    {!isStation && <td className="n way">{l.onWay ? num(l.onWay) : '—'}</td>}
                    <td className="n dlv">{l.received ? num(l.received) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="d">{t.totalWord}</td>
                  {isStation && <td className="n">{totals.orders}</td>}
                  {!isStation && <td className="n">{num(totals.loaded)}</td>}
                  {!isStation && <td className="n">{num(totals.onWay)}</td>}
                  <td className="n">{num(totals.received)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button className="btn btn-ghost more" onClick={exportCsv}>
            {t.exportCsv}
          </button>
        </>
      )}
    </>
  )
}
