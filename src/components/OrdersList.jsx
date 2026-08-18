import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrderRow } from './OrderRow'
import { OrderDetail } from './OrderDetail'
import { Empty, ErrorBox, Spinner } from './common'
import { fetchOrders } from '../lib/api'
import { num, dayLabel, locationsOf, OPEN_STATUSES, DONE_STATUSES } from '../lib/util'
import { translateError } from './ActionSheet'

/**
 * The one list every screen is built from.
 *
 * `scope` decides what the list is about:
 *   { actorId }            → my orders, every role
 *   { statuses: [...] }    → a work queue
 *   {}                     → the whole board
 *
 * Filters live on top of that and are applied server side, so a station with
 * three years of history still gets a fast first page. The old build pulled a
 * fixed 400 or 2000 rows and quietly dropped everything past that.
 */
export function OrdersList({
  t,
  lang,
  role,
  scope,
  stations,
  products,
  refreshKey,
  onAct,
  empty,
  showFilters = true,
}) {
  const [status, setStatus] = useState('')
  const [stationId, setStationId] = useState('')
  const [location, setLocation] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [state, setState] = useState('loading') // loading | ready | error | more
  const [problem, setProblem] = useState('')
  const [detail, setDetail] = useState(null)

  const live = useRef(0)

  // Debounce typing so we are not firing a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // Three buckets is what people actually think in: everything, still moving,
  // finished. The eight individual statuses are still visible on each row and
  // in the detail sheet — they just are not eight filter buttons any more.
  const statuses = useMemo(() => {
    if (scope.statuses) return scope.statuses
    if (status === 'open') return OPEN_STATUSES
    if (status === 'done') return DONE_STATUSES
    return null
  }, [scope.statuses, status])

  const load = useCallback(
    async (nextPage, append) => {
      const ticket = ++live.current
      setState(append ? 'more' : 'loading')
      setProblem('')
      try {
        const { rows: got, count } = await fetchOrders({
          statuses,
          stationId: stationId || undefined,
          location: location || undefined,
          actorId: scope.actorId,
          search: term,
          page: nextPage,
        })
        if (ticket !== live.current) return // a newer request won
        setRows((prev) => (append ? [...prev, ...got] : got))
        setTotal(count)
        setPage(nextPage)
        setState('ready')
      } catch (e) {
        if (ticket !== live.current) return
        setProblem(translateError(e, t))
        setState('error')
      }
    },
    [statuses, stationId, location, scope.actorId, term, t],
  )

  useEffect(() => {
    load(0, false)
  }, [load, refreshKey])

  const busy = state === 'loading'
  const filtered = Boolean(status || stationId || location || term)
  const shown = rows.length
  const hasMore = shown < total

  const clear = () => {
    setStatus('')
    setStationId('')
    setLocation('')
    setSearch('')
    setTerm('')
  }

  // Picking a location narrows the station list to that location, so the two
  // dropdowns cannot be set to a combination that returns nothing.
  const locations = locationsOf(stations)
  const stationChoices = location
    ? stations.filter((s2) => (s2.location || '').trim() === location)
    : stations

  // Rows arrive newest-first, so a simple run-length grouping keeps order.
  const groups = useMemo(() => {
    const out = []
    for (const o of rows) {
      const label = dayLabel(o.created_at, t)
      if (out.length && out[out.length - 1][0] === label) out[out.length - 1][1].push(o)
      else out.push([label, [o]])
    }
    return out
  }, [rows, t])

  return (
    <>
      {showFilters && (
        <div className="toolbar">
          <div className="seg3">
            {[['', t.fAll], ['open', t.fOpen], ['done', t.fDone]].map(([key, label]) => (
              <button key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>

          <div className="tools2">
            <input
              className="inp search"
              type="search"
              value={search}
              placeholder={t.searchPh}
              aria-label={t.search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {role !== 'station' && locations.length > 1 && (
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
            {role !== 'station' && stationChoices.length > 1 && (
              <select
                className="inp"
                value={stationId}
                aria-label={t.station}
                onChange={(e) => setStationId(e.target.value)}
              >
                <option value="">{t.allStations}</option>
                {stationChoices.map((s2) => (
                  <option key={s2.id} value={s2.id}>
                    {lang === 'ku' ? s2.name_ku : s2.name_en}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="countbar">
        <span>
          {num(shown)} {t.ofWord} {num(total)} {t.ordersWord}
        </span>
        {filtered && (
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            {t.clear}
          </button>
        )}
      </div>

      <ErrorBox onRetry={() => load(0, false)} retryLabel={t.retry}>
        {state === 'error' ? problem || t.checkNet : ''}
      </ErrorBox>

      {busy && <Spinner label={t.loadingData} />}

      {!busy && state !== 'error' && rows.length === 0 && (
        <Empty
          title={filtered ? t.noResults : empty?.title || t.emptyMine}
          msg={filtered ? t.noResultsP : empty?.msg || t.emptyMineP}
        />
      )}

      {groups.map(([label, items]) => (
        <div className="daygroup" key={label}>
          <div className="dayhead">{label}</div>
          <div className="olist">
            {items.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                t={t}
                lang={lang}
                role={role}
                onOpen={setDetail}
                onAct={onAct}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore && state !== 'error' && (
        <button
          className="btn btn-ghost more"
          disabled={state === 'more'}
          onClick={() => load(page + 1, true)}
        >
          {state === 'more' ? t.loadingData : `${t.loadMore} (${num(total - shown)})`}
        </button>
      )}

      {detail && (
        <OrderDetail
          order={detail}
          t={t}
          lang={lang}
          role={role}
          onClose={() => setDetail(null)}
          onAct={(a, o) => {
            setDetail(null)
            onAct(a, o)
          }}
        />
      )}
    </>
  )
}
