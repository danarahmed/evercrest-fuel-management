import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { DICT, loadLang, saveLang } from './lib/i18n'
import { fetchReference, countOrders, fetchSettings, getOrder } from './lib/api'
import { SignIn, Inactive } from './components/Auth'
import { OrdersList } from './components/OrdersList'
import { NewOrder } from './components/NewOrder'
import { Reports } from './components/Reports'
import { Dashboard } from './components/Dashboard'
import { Users, NewUser, StationList, Fuels, Settings, AuditLog } from './components/Admin'
import { Account } from './components/Account'
import { ActionSheet } from './components/ActionSheet'
import { OrderDetail } from './components/OrderDetail'
import { Notifications } from './components/Notifications'
import { Empty, Spinner } from './components/common'
import { Mark } from './components/Logo'

// Tabs per role — each role only ever sees what it can act on.
const NAV = {
  station: ['dashboard', 'new', 'mine', 'reports'],
  manager: ['dashboard', 'queue', 'board', 'reports'],
  storage: ['dashboard', 'toprepare', 'awaiting', 'board', 'reports'],
  admin: ['dashboard', 'board', 'reports', 'users', 'stations', 'fuels', 'settings', 'audit'],
}

const TAB_LABEL = {
  dashboard: 'tabDashboard',
  new: 'tabNew',
  mine: 'myActivity',
  queue: 'tabAwaiting',
  toprepare: 'tabReady',
  awaiting: 'tabAwaitConfirm',
  board: 'tabAll',
  reports: 'tabReports',
  users: 'tabUsers',
  stations: 'tabStations',
  fuels: 'tabFuelTypes',
  settings: 'tabSettings',
  audit: 'tabAudit',
}

// Statuses behind each queue tab (drives both the list scope and the badge).
const QUEUE_STATUS = {
  queue: ['pending_approval'],
  toprepare: ['approved', 'preparing'],
  awaiting: ['dispatched'],
}

export function App() {
  const [lang, setLang] = useState(loadLang)
  const t = DICT[lang]

  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [stations, setStations] = useState([])
  const [products, setProducts] = useState([])
  const [settings, setSettings] = useState({})
  const [boot, setBoot] = useState('loading')
  const [tab, setTab] = useState('')
  const [action, setAction] = useState(null)
  const [editOrder, setEditOrder] = useState(null)
  const [notifOrder, setNotifOrder] = useState(null)
  const [showAccount, setShowAccount] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [badges, setBadges] = useState({})

  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    document.documentElement.dir = t.dir
    document.documentElement.lang = lang
    saveLang(lang)
  }, [lang, t.dir])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadReference = useCallback(async () => {
    if (!session) return
    setBoot('loading')
    try {
      const ref = await fetchReference(session.user.id)
      if (!alive.current) return
      setProfile(ref.profile)
      setStations(ref.stations)
      setProducts(ref.products)
      fetchSettings().then((s) => alive.current && setSettings(s)).catch(() => {})
      setBoot('ready')
    } catch {
      if (!alive.current) return
      setBoot('error')
    }
  }, [session])

  useEffect(() => {
    if (!session) { setProfile(null); setBoot('loading'); return }
    loadReference()
  }, [session, loadReference])

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), [])

  // Live updates: order + notification changes both nudge a debounced refresh.
  useEffect(() => {
    if (!session) return
    let timer
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setRefreshKey((n) => n + 1), 400) }
    const channel = supabase
      .channel('fd-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, bump)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [session])

  const role = profile?.role
  const tabs = useMemo(() => NAV[role] || [], [role])
  const current = tabs.includes(tab) ? tab : tabs[0]

  useEffect(() => {
    if (!role) return
    let stale = false
    const wanted = tabs.filter((k) => QUEUE_STATUS[k])
    Promise.all(wanted.map((k) => countOrders({ statuses: QUEUE_STATUS[k] }))).then((counts) => {
      if (stale) return
      const next = {}
      wanted.forEach((k, i) => { next[k] = counts[i] })
      setBadges(next)
    })
    return () => { stale = true }
  }, [role, tabs, refreshKey])

  if (session === undefined) return null
  if (!session) return <SignIn t={t} lang={lang} setLang={setLang} />

  if (boot === 'loading') return <div className="auth"><Spinner label={t.loadingData} /></div>

  if (boot === 'error' || !profile) {
    return (
      <div className="auth">
        <div className="auth-card">
          <Empty title={t.loadFailed} msg={t.checkNet} />
          <button className="btn btn-go wide" onClick={loadReference}>{t.retry}</button>
          <div className="center">
            <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().catch(() => {})}>{t.signOut}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile.is_active) return <Inactive t={t} />

  const activeStations = stations.filter((s) => s.is_active)
  const activeProducts = products.filter((p) => p.is_active)

  // Central action router. "edit" jumps to the order form; everything else
  // opens the transition sheet.
  const onAct = (a, order) => {
    if (a === 'edit') { setEditOrder(order); setNotifOrder(null); setTab('new') }
    else setAction({ a, order })
  }

  const openOrderById = async (id) => {
    try { const o = await getOrder(id); setNotifOrder(o) } catch { /* ignore */ }
  }

  const listFor = (key) => {
    const mineScope = role === 'station' && profile.station_id
      ? { stationId: profile.station_id }
      : { actorId: profile.id }
    const scope = key === 'mine' ? mineScope : QUEUE_STATUS[key] ? { statuses: QUEUE_STATUS[key] } : {}
    const empties = {
      mine: { title: t.emptyMine, msg: t.emptyMineP },
      queue: { title: t.emptyQueue, msg: t.emptyQueueP },
      toprepare: { title: t.emptyLoad, msg: t.emptyLoadP },
      awaiting: { title: t.emptyTransit, msg: t.emptyTransitP },
      board: { title: t.emptyAll, msg: t.emptyAllP },
    }
    const isQueue = key === 'queue' || key === 'toprepare' || key === 'awaiting'
    return (
      <OrdersList
        key={key} t={t} lang={lang} role={role} scope={scope}
        stations={activeStations} products={activeProducts}
        refreshKey={refreshKey} onAct={onAct} empty={empties[key]}
        showFilters={!isQueue}
        firstAction={key === 'mine' && role === 'station' ? { label: t.newOrderCta, onClick: () => setTab('new') } : null}
      />
    )
  }

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="top-brand">
            <Mark size={36} />
            <div className="brand">
              <b>{t.appName}</b>
              <span>{profile.full_name} · {t['r_' + role]}</span>
            </div>
          </div>
          <Notifications t={t} refreshKey={refreshKey} onOpenOrder={openOrderById} />
          <button className="tbtn mono" onClick={() => setLang(lang === 'ku' ? 'en' : 'ku')}>{lang === 'ku' ? 'EN' : 'KU'}</button>
          <button className="tbtn" onClick={() => setShowAccount(true)} aria-label={t.tabAccount}>{t.tabAccount}</button>
          <button className="tbtn" onClick={() => supabase.auth.signOut().catch(() => {})}>{t.signOut}</button>
        </div>
      </header>

      <nav className="tabs">
        <div className="tabs-in">
          {tabs.map((key) => (
            <button key={key} className="tab" aria-selected={current === key} onClick={() => { setTab(key); if (key !== 'new') setEditOrder(null) }}>
              {t[TAB_LABEL[key]]}
              {badges[key] ? <span className="cnt">{badges[key]}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        {current === 'dashboard' && (
          <Dashboard t={t} lang={lang} role={role} profile={profile} refreshKey={refreshKey} onAct={onAct} />
        )}
        {current === 'new' && (
          <NewOrder
            t={t} lang={lang} products={activeProducts} stations={activeStations}
            profile={profile} settings={settings} editOrder={editOrder}
            onCancelEdit={() => setEditOrder(null)}
            onDone={(r) => { if (r?.closeEdit) setEditOrder(null); refresh() }}
          />
        )}
        {current === 'users' && (
          <>
            <Users t={t} lang={lang} stations={stations} reload={loadReference} meId={profile.id} />
            <NewUser t={t} lang={lang} stations={stations} reload={loadReference} />
          </>
        )}
        {current === 'stations' && <StationList t={t} lang={lang} stations={stations} reload={loadReference} />}
        {current === 'fuels' && <Fuels t={t} lang={lang} products={products} reload={loadReference} />}
        {current === 'settings' && <Settings t={t} />}
        {current === 'audit' && <AuditLog t={t} onOpenOrder={openOrderById} />}
        {current === 'reports' && (
          <Reports t={t} lang={lang} role={role} profile={profile} stations={activeStations} refreshKey={refreshKey} />
        )}
        {['mine', 'board', 'queue', 'toprepare', 'awaiting'].includes(current) && listFor(current)}
      </main>

      {action && (
        <ActionSheet
          act={action.a} order={action.order} t={t} settings={settings}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); refresh() }}
        />
      )}

      {notifOrder && (
        <OrderDetail
          order={notifOrder} t={t} lang={lang} role={role}
          onClose={() => setNotifOrder(null)} onAct={onAct}
        />
      )}

      {showAccount && <Account t={t} profile={profile} onClose={() => setShowAccount(false)} />}
    </>
  )
}
