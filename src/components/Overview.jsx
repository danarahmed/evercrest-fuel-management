import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, ErrorBox, Spinner } from './common'
import { dashboardMetrics, reportSummary } from '../lib/api'
import { daysAgo, num, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

/**
 * Admin overview — a single bird's-eye snapshot of the whole network for a
 * period. Every number is server-computed (dashboard_metrics for the totals,
 * report_summary for the per-station breakdown), so the counts and litres are
 * exact over the entire matching set, not a sampled page.
 */
const PERIODS = ['pToday', 'p7', 'p30', 'p90', 'allTime']

const STATUS_ORDER = ['pending', 'approved', 'loaded', 'delivered', 'rejected', 'cancelled']
const STATUS_COLOR = {
  pending: 'var(--amber)',
  approved: 'var(--brand-ink)',
  loaded: 'var(--sky)',
  delivered: 'var(--go)',
  rejected: 'var(--flag)',
  cancelled: 'var(--slate)',
}

export function Overview({ t, lang, stations, refreshKey }) {
  const [period, setPeriod] = useState('p30')
  const [metrics, setMetrics] = useState(null)
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')

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
      const [m, r] = await Promise.all([
        dashboardMetrics({ fromDate, toDate }),
        reportSummary({ fromDate, toDate }),
      ])
      setMetrics(m)
      setRows(r)
      setState('ready')
    } catch (e) {
      setProblem(translateError(e, t))
      setState('error')
    }
  }, [range, t])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Coerce every count/liter to a plain number once, so the render is arithmetic.
  const m = useMemo(() => {
    const g = (k) => Number(metrics?.[k] || 0)
    const counts = {
      pending: g('pending'),
      approved: g('approved'),
      loaded: g('loaded'),
      delivered: g('delivered'),
      rejected: g('rejected'),
      cancelled: g('cancelled'),
    }
    const open = counts.pending + counts.approved + counts.loaded
    const total = open + counts.delivered + counts.rejected + counts.cancelled
    return {
      counts,
      open,
      total,
      requested: g('requested_l'),
      loaded_l: g('loaded_l'),
      on_way: g('on_way_l'),
      received: g('received_l'),
    }
  }, [metrics])

  // Per-station rollup for the period, summed across the day lines the RPC returns.
  const byStation = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const cur = map.get(r.station_id) || {
        id: r.station_id,
        name: lang === 'ku' ? r.station_name_ku : r.station_name_en,
        code: r.station_code,
        orders: 0,
        loaded: 0,
        onWay: 0,
        received: 0,
      }
      cur.orders += Number(r.orders)
      cur.loaded += Number(r.loaded)
      cur.onWay += Number(r.on_way)
      cur.received += Number(r.received)
      map.set(r.station_id, cur)
    }
    return [...map.values()].sort((a, b) => b.received - a.received || b.loaded - a.loaded)
  }, [rows, lang])

  const maxCount = Math.max(1, ...STATUS_ORDER.map((s) => m.counts[s]))
  const volume = [
    { key: 'rl_requested', v: m.requested, color: 'var(--ink3)' },
    { key: 'loadedWord', v: m.loaded_l, color: 'var(--sky)' },
    { key: 'onWayWord', v: m.on_way, color: 'var(--amber)' },
    { key: 'receivedWord', v: m.received, color: 'var(--go)' },
  ]
  const maxVol = Math.max(1, ...volume.map((x) => x.v))

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
        <p className="hint block" style={{ margin: 0 }}>{t.ovSnapshot}</p>
      </div>

      <ErrorBox onRetry={load} retryLabel={t.retry}>
        {state === 'error' ? problem || t.checkNet : ''}
      </ErrorBox>

      {state === 'loading' ? (
        <Spinner label={t.loadingData} />
      ) : m.total === 0 ? (
        <Empty title={t.noneInRange} msg={t.noneInRangeP} />
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="kl">{t.summaryOpen}</span>
              <span className="kv">{num(m.open)}</span>
            </div>
            <div className="kpi k-lod">
              <span className="kl">{t.onWayWord}</span>
              <span className="kv">{num(m.counts.loaded)}</span>
            </div>
            <div className="kpi k-dlv">
              <span className="kl">{t.st_delivered}</span>
              <span className="kv">{num(m.counts.delivered)}</span>
            </div>
          </div>

          <div className="sect">
            <h3>{t.ovStatusTitle}</h3>
            <div className="rule" />
          </div>
          <div className="panel">
            <div className="bars">
              {STATUS_ORDER.map((s) => (
                <div className="bar-row" key={s}>
                  <div className="bar-top">
                    <span className="nm">{t['st_' + s]}</span>
                    <span className="vl">{num(m.counts[s])}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(m.counts[s] / maxCount) * 100}%`,
                        background: STATUS_COLOR[s],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sect">
            <h3>{t.ovVolumeTitle}</h3>
            <div className="rule" />
          </div>
          <div className="panel">
            <div className="bars">
              {volume.map((x) => (
                <div className="bar-row" key={x.key}>
                  <div className="bar-top">
                    <span className="nm">{t[x.key]}</span>
                    <span className="vl">{num(x.v)} {t.litreShort}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(x.v / maxVol) * 100}%`, background: x.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {byStation.length > 0 && (
            <>
              <div className="sect">
                <h3>{t.byStation}</h3>
                <div className="rule" />
              </div>
              <div className="tablewrap">
                <table className="rtable">
                  <thead>
                    <tr>
                      <th>{t.station}</th>
                      <th className="n">{t.loadedWord}</th>
                      <th className="n">{t.onWayShort}</th>
                      <th className="n">{t.receivedWord}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStation.map((s) => (
                      <tr key={s.id}>
                        <td className="where">
                          <span className="st">{s.name}</span>
                          <span className="sc">{s.code} · {s.orders} {t.ordersCol.toLowerCase()}</span>
                        </td>
                        <td className="n">{s.loaded ? num(s.loaded) : '—'}</td>
                        <td className="n way">{s.onWay ? num(s.onWay) : '—'}</td>
                        <td className="n dlv">{s.received ? num(s.received) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
