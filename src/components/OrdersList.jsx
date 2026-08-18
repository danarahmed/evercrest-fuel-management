import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrderRow } from './OrderRow'
import { OrderDetail } from './OrderDetail'
import { Empty, ErrorBox, Spinner } from './common'
import { fetchOrders } from '../lib/api'
import { num, OPEN_STATUSES } from '../lib/util'
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
  const [productId, setProductId] = useState('')
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

  const statuses = useMemo(() => {
    if (scope.statuses) return scope.statuses
    if (status === 'open') return OPEN_STATUSES
    if (status) return [status]
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
          productId: productId || undefined,
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
    [statuses, stationId, productId, scope.actorId, term, t],
  )

  useEffect(() => {
    load(0, false)
  }, [load, refreshKey])

  const busy = state === 'loading'
  const filtered = Boolean(status || stationId || productId || term)
  const shown = rows.length
  const hasMore = shown < total

  const clear = () => {
    setStatus('')
    setStationId('')
    setProductId('')
    setSearch('')
    setTerm('')
  }

  const chips = scope.statuses
    ? []
    : ['open', 'pending', 'approved', 'loaded', 'delivered', 'rejected', 'cancelled']

  return (
    <>
      {showFilters && (
        <div className="toolbar">
          <div className="search">
            <input
              className="inp"
              type="search"
              value={search}
              placeholder={t.searchPh}
              aria-label={t.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {(stations.length > 1 || products.length > 1) && (
            <div className="fsel">
              {role !== 'station' && stations.length > 1 && (
                <select
                  value={stationId}
                  aria-label={t.station}
                  onChange={(e) => setStationId(e.target.value)}
                >
                  <option value="">{t.allStations}</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {lang === 'ku' ? s.name_ku : s.name_en}
                    </option>
                  ))}
                </select>
              )}
              {products.length > 1 && (
                <select
                  value={productId}
                  aria-label={t.fuel}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">{t.allFuels}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === 'ku' ? p.name_ku : p.name_en}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {chips.length > 0 && (
            <div className="pills">
              <button className="pill" aria-pressed={status === ''} onClick={() => setStatus('')}>
                {t.fAll}
              </button>
              {chips.map((s) => (
                <button
                  key={s}
                  className="pill"
                  aria-pressed={status === s}
                  onClick={() => setStatus(status === s ? '' : s)}
                >
                  {s === 'open' ? t.fOpen : t['st_' + s]}
                </button>
              ))}
            </div>
          )}
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

      {rows.length > 0 && (
        <div className="olist">
          {rows.map((o) => (
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
      )}

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
