import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, ErrorBox, Skeleton } from './common'
import { OrderRow } from './OrderRow'
import { OrderDetail } from './OrderDetail'
import { dashboardMetrics, fetchOrders } from '../lib/api'
import { daysAgo, num, startOfDay } from '../lib/util'
import { translateError } from './ActionSheet'

const PERIODS = ['pToday', 'p7', 'p30', 'p90', 'allTime']

// The statuses each role is responsible for acting on, for the attention queue.
const ATTENTION = {
  station: ['dispatched', 'changes_requested', 'draft'],
  manager: ['pending_approval', 'disputed'],
  storage: ['approved', 'preparing'],
  admin: ['pending_approval', 'disputed'],
}

// KPI card layout per role: [metricKey, i18nLabel, tone].
const COUNT_KPIS = {
  station: [['open_orders', 'kpiOpenOrders', 'brand'], ['pending', 'kpiAwaitingApproval', 'amber'], ['dispatched', 'kpiDispatched', 'sky'], ['delivered_today', 'kpiDeliveredToday', 'go']],
  manager: [['pending', 'kpiAwaitingApproval', 'amber'], ['overdue', 'kpiOverdue', 'flag'], ['dispatched', 'kpiDispatched', 'sky'], ['delivered_today', 'kpiDeliveredToday', 'go']],
  storage: [['approved', 'kpiToPrepare', 'amber'], ['dispatched', 'kpiDispatched', 'sky'], ['overdue', 'kpiOverdue', 'flag'], ['delivered_today', 'kpiDeliveredToday', 'go']],
  admin: [['open_orders', 'kpiOpenOrders', 'brand'], ['pending', 'kpiAwaitingApproval', 'amber'], ['overdue', 'kpiOverdue', 'flag'], ['disputed', 'kpiDisputed', 'flag']],
}
const VOLUME_KPIS = {
  station: [['requested_l', 'kpiRequestedL'], ['received_l', 'kpiReceivedL']],
  manager: [['approved_l', 'kpiApprovedL'], ['received_l', 'kpiReceivedL'], ['variance_l', 'kpiVarianceL']],
  storage: [['dispatched_l', 'kpiDispatchedL'], ['received_l', 'kpiReceivedL']],
  admin: [['requested_l', 'kpiRequestedL'], ['dispatched_l', 'kpiDispatchedL'], ['received_l', 'kpiReceivedL'], ['variance_l', 'kpiVarianceL']],
}

export function Dashboard({ t, lang, role, profile, refreshKey, onAct }) {
  const [period, setPeriod] = useState('p30')
  const [m, setM] = useState(null)
  const [queue, setQueue] = useState(null)
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')
  const [detail, setDetail] = useState(null)

  const range = useCallback(() => {
    const tomorrow = new Date(Date.now() + 86400000)
    if (period === 'pToday') return [startOfDay(new Date()), tomorrow]
    if (period === 'p7') return [daysAgo(6), tomorrow]
    if (period === 'p30') return [daysAgo(29), tomorrow]
    if (period === 'p90') return [daysAgo(89), tomorrow]
    return [undefined, undefined]
  }, [period])

  const load = useCallback(async () => {
    setState('loading'); setProblem('')
    const [fromDate, toDate] = range()
    try {
      const [metrics, q] = await Promise.all([
        dashboardMetrics({ fromDate, toDate }),
        fetchOrders({ statuses: ATTENTION[role] || [], page: 0, pageSize: 6 }),
      ])
      setM(metrics); setQueue(q.rows); setState('ready')
    } catch (e) { setProblem(translateError(e, t)); setState('error') }
  }, [range, role, t])

  useEffect(() => { load() }, [load, refreshKey])

  const counts = COUNT_KPIS[role] || COUNT_KPIS.admin
  const volumes = VOLUME_KPIS[role] || VOLUME_KPIS.admin
  const showTimes = role === 'manager' || role === 'admin'

  const hrs = (v) => (v == null ? '—' : num(v) + t.hoursShort)

  const openDetail = (o) => setDetail(o)
  const act = (a, o) => { setDetail(null); onAct(a, o) }

  return (
    <>
      <div className="phead">
        <h1>{t.tabDashboard}</h1>
        <p>{profile.full_name} · {t['r_' + role]} — {t.dashHello}</p>
      </div>

      <div className="toolbar" style={{ padding: '10px 12px' }}>
        <div className="per" style={{ marginBottom: 0 }}>
          {PERIODS.map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t[p]}</button>
          ))}
        </div>
      </div>

      <ErrorBox onRetry={load} retryLabel={t.retry}>{state === 'error' ? problem || t.checkNet : ''}</ErrorBox>

      {state === 'loading' ? (
        <Skeleton rows={3} />
      ) : m ? (
        <>
          <div className="kgrid">
            {counts.map(([k, label, tone]) => (
              <div className={'kcard t-' + tone} key={k}>
                <span className="kl">{t[label]}</span>
                <span className="kv">{num(Number(m[k] || 0))}</span>
              </div>
            ))}
          </div>

          <div className="kgrid">
            {volumes.map(([k, label]) => (
              <div className="kcard" key={k}>
                <span className="kl">{t[label]}</span>
                <span className="kv">{num(Number(m[k] || 0))}</span>
                <span className="ks">{t.litreShort}</span>
              </div>
            ))}
            {showTimes && (
              <>
                <div className="kcard"><span className="kl">{t.kpiAvgApproval}</span><span className="kv">{hrs(m.avg_approval_hours)}</span></div>
                {role === 'admin' && <div className="kcard"><span className="kl">{t.kpiAvgFulfil}</span><span className="kv">{hrs(m.avg_fulfillment_hours)}</span></div>}
              </>
            )}
          </div>

          <div className="sect"><h3>{t.dashNeedsYou}</h3><div className="rule" /></div>
          {queue && queue.length > 0 ? (
            <div className="olist">
              {queue.map((o) => (
                <OrderRow key={o.id} order={o} t={t} lang={lang} role={role} onOpen={openDetail} onAct={act} />
              ))}
            </div>
          ) : (
            <Empty title={t.dashAllClear} msg={t.dashAllClearP} />
          )}
        </>
      ) : null}

      {detail && (
        <OrderDetail order={detail} t={t} lang={lang} role={role} onClose={() => setDetail(null)} onAct={act} />
      )}
    </>
  )
}
