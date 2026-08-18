import { useCallback, useEffect, useState } from 'react'
import { Empty, ErrorBox, Spinner } from './common'
import { fetchOrders } from '../lib/api'
import { daysAgo, downloadCsv, isoDate, num, orderNo, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

const REPORT_CAP = 2000

/** Reports live on their own tab now, so the daily order screens stay simple. */
export function Reports({ t, lang, role, stations, products, refreshKey }) {
  const [period, setPeriod] = useState('p30')
  const [from, setFrom] = useState(isoDate(daysAgo(29)))
  const [to, setTo] = useState(isoDate(new Date()))
  const [stationId, setStationId] = useState('')
  const [productId, setProductId] = useState('')

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')

  const range = useCallback(() => {
    const tomorrow = new Date(Date.now() + 86400000)
    if (period === 'pToday') return [startOfDay(new Date()), tomorrow]
    if (period === 'p7') return [daysAgo(6), tomorrow]
    if (period === 'p30') return [daysAgo(29), tomorrow]
    if (period === 'p90') return [daysAgo(89), tomorrow]
    if (period === 'allTime') return [undefined, undefined]
    return [
      startOfDay(new Date(from + 'T00:00:00')),
      new Date(new Date(to + 'T00:00:00').getTime() + 86400000),
    ]
  }, [period, from, to])

  const load = useCallback(async () => {
    setState('loading')
    setProblem('')
    const [fromDate, toDate] = range()
    try {
      const { rows: got, count } = await fetchOrders({
        fromDate,
        toDate,
        stationId: stationId || undefined,
        productId: productId || undefined,
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
  }, [range, stationId, productId, t])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const loadedOf = (o) =>
    ['loaded', 'delivered'].includes(o.status) ? Number(o.loaded_quantity ?? o.quantity) : 0
  const receivedOf = (o) =>
    o.status === 'delivered' ? Number(o.received_quantity ?? o.loaded_quantity ?? o.quantity) : 0

  const sum = (fn) => rows.reduce((acc, o) => acc + (Number(fn(o)) || 0), 0)
  const requested = sum((o) => o.quantity)
  const loaded = sum(loadedOf)
  const received = sum(receivedOf)

  const byStatus = {}
  for (const o of rows) byStatus[o.status] = (byStatus[o.status] || 0) + 1

  const groupBy = (key, label) => {
    const map = new Map()
    for (const o of rows) {
      const k = o[key]
      const entry = map.get(k) || { name: label(o), litres: 0, n: 0 }
      entry.litres += loadedOf(o)
      entry.n += 1
      map.set(k, entry)
    }
    return [...map.values()].sort((a, b) => b.litres - a.litres).slice(0, 8)
  }

  const byFuel = groupBy('product_id', (o) => (lang === 'ku' ? o.product_name_ku : o.product_name_en))
  const byStation = groupBy('station_id', (o) =>
    lang === 'ku' ? o.station_name_ku : o.station_name_en,
  )

  const exportCsv = () => {
    const header = [
      'no', 'status', 'station', 'fuel', 'requested', 'loaded', 'received',
      'truck', 'driver', 'manifest_no', 'created', 'loaded_at', 'delivered_at',
    ]
    const body = rows.map((o) => [
      orderNo(o.order_no), o.status, o.station_name_en, o.product_name_en,
      o.quantity, o.loaded_quantity ?? '', o.received_quantity ?? '',
      o.truck_no ?? '', o.driver_name ?? '', o.manifest_no ?? '',
      o.created_at, o.loaded_at ?? '', o.delivered_at ?? '',
    ])
    downloadCsv(`orders-${isoDate(new Date())}.csv`, [header, ...body])
  }

  const Bars = ({ title, data }) => {
    if (!data.length) return null
    const top = Math.max(...data.map((d) => d.litres), 1)
    return (
      <>
        <div className="sect">
          <h3>{title}</h3>
          <div className="rule" />
        </div>
        <div className="panel">
          <div className="bars">
            {data.map((d, i) => (
              <div className="bar-row" key={i}>
                <div className="bar-top">
                  <span className="nm">{d.name}</span>
                  <span className="vl">{num(d.litres)}</span>
                  <span className="ct">· {d.n}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: (d.litres / top) * 100 + '%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="toolbar">
        <div className="per">
          {['pToday', 'p7', 'p30', 'p90', 'allTime'].map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t[p]}
            </button>
          ))}
        </div>

        <div className="per">
          <button aria-pressed={period === 'pCustom'} onClick={() => setPeriod('pCustom')}>
            {t.pCustom}
          </button>
        </div>

        {period === 'pCustom' && (
          <div className="fsel">
            <input
              type="date" value={from} max={to} aria-label={t.from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date" value={to} min={from} max={isoDate(new Date())} aria-label={t.to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        )}

        <div className="fsel">
          {role !== 'station' && (
            <select value={stationId} aria-label={t.station} onChange={(e) => setStationId(e.target.value)}>
              <option value="">{t.allStations}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{lang === 'ku' ? s.name_ku : s.name_en}</option>
              ))}
            </select>
          )}
          <select value={productId} aria-label={t.fuel} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t.allFuels}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{lang === 'ku' ? p.name_ku : p.name_en}</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBox onRetry={load} retryLabel={t.retry}>
        {state === 'error' ? problem || t.checkNet : ''}
      </ErrorBox>

      {state === 'loading' ? (
        <Spinner label={t.loadingData} />
      ) : rows.length === 0 ? (
        <Empty title={t.noneInRange} msg={t.noneInRangeP} />
      ) : (
        <>
          <div className="stats">
            <div className="stat req">
              <div className="k">{t.sRequested}</div>
              <div className="v">{num(requested)}</div>
              <div className="u">{rows.length} {t.ordersWord}</div>
            </div>
            <div className="stat lod">
              <div className="k">{t.sLoaded}</div>
              <div className="v">{num(loaded)}</div>
              <div className="u">L</div>
            </div>
            <div className="stat dlv">
              <div className="k">{t.sDelivered}</div>
              <div className="v">{num(received)}</div>
              <div className="u">L</div>
            </div>
          </div>

          <div className="pills">
            {Object.keys(byStatus).map((s) => (
              <span key={s} className="pill static">
                {t['st_' + s]} <b>{byStatus[s]}</b>
              </span>
            ))}
            <button className="pill pill-go" onClick={exportCsv}>{t.exportCsv}</button>
          </div>

          {total > rows.length && <div className="notice">{t.moreExist}</div>}

          <Bars title={t.byFuel} data={byFuel} />
          {role !== 'station' && <Bars title={t.byStation} data={byStation} />}
        </>
      )}
    </>
  )
}
