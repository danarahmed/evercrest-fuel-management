import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, ErrorBox, Spinner } from './common'
import { fetchOrders } from '../lib/api'
import { daysAgo, downloadCsv, isoDate, locationsOf, num, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

const REPORT_CAP = 2000

/**
 * The three numbers the office actually tracks, per order:
 *
 *   loaded   — left the yard at all (loaded now, or already delivered)
 *   onWay    — loaded but the station has not confirmed it yet
 *   received — the station signed for it
 *
 * onWay is deliberately a subset of loaded, not a separate stage: a truck that
 * has been loaded is on the way until it is received.
 */
const loadedOf = (o) =>
  ['loaded', 'delivered'].includes(o.status) ? Number(o.loaded_quantity ?? o.quantity) : 0
const onWayOf = (o) => (o.status === 'loaded' ? Number(o.loaded_quantity ?? o.quantity) : 0)
const receivedOf = (o) =>
  o.status === 'delivered' ? Number(o.received_quantity ?? o.loaded_quantity ?? o.quantity) : 0

const PERIODS = ['pToday', 'p7', 'p30', 'p90', 'allTime']
const STATUS_CHOICES = ['pending', 'approved', 'loaded', 'delivered', 'rejected', 'cancelled']

export function Reports({ t, lang, role, profile, stations, refreshKey }) {
  const [period, setPeriod] = useState('p30')
  const [stationId, setStationId] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
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
      const { rows: got, count } = await fetchOrders({
        fromDate,
        toDate,
        stationId: stationId || undefined,
        location: location || undefined,
        statuses: status ? [status] : undefined,
        page: 0,
        pageSize: REPORT_CAP,
      })
      setRows(got)
      setTotal(count)
      setState('ready')
    } catch (e) {
      setProblem(translateError(e, t))
      setState('error')
    }
  }, [range, stationId, location, status, t])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  /**
   * One line per day (and per station, when more than one is in view), so the
   * table reads the way a paper log would.
   */
  const lines = useMemo(() => {
    const map = new Map()
    for (const o of rows) {
      // A station only reports work it actually completed.
      if (isStation && o.status !== 'delivered') continue

      const day = String(o.created_at).slice(0, 10)
      const key = isStation ? day : `${day}|${o.station_id}`
      const entry = map.get(key) || {
        day,
        station: lang === 'ku' ? o.station_name_ku : o.station_name_en,
        code: o.station_code,
        orders: 0,
        loaded: 0,
        onWay: 0,
        received: 0,
      }
      entry.orders += 1
      entry.loaded += loadedOf(o)
      entry.onWay += onWayOf(o)
      entry.received += receivedOf(o)
      map.set(key, entry)
    }
    return [...map.values()].sort(
      (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.station.localeCompare(b.station)),
    )
  }, [rows, isStation, lang])

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

  // Location and station stack: choosing a location narrows the stations
  // offered, and both narrow on top of whatever period is selected.
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

          {total > rows.length && <div className="notice">{t.moreExist}</div>}

          <button className="btn btn-ghost more" onClick={exportCsv}>
            {t.exportCsv}
          </button>
        </>
      )}
    </>
  )
}
