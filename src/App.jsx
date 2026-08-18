import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { DICT, loadLang, saveLang } from './lib/i18n'
import { fetchReference, countOrders } from './lib/api'
import { SignIn, Inactive } from './components/Auth'
import { OrdersList } from './components/OrdersList'
import { NewOrder } from './components/NewOrder'
import { Reports } from './components/Reports'
import { Users, NewUser, StationList, Fuels } from './components/Admin'
import { Account } from './components/Account'
import { ActionSheet } from './components/ActionSheet'
import { Empty, Spinner } from './components/common'
import { Mark } from './components/Logo'

/**
 * Tabs per role.
 *
 * The office roles work from queues and the report, so a personal "my orders"
 * list was just a fourth way to look at the same board. Only the station keeps
 * it, because for them it is not a filter — it is how they follow their own
 * requests from pending through to delivered.
 */
const NAV = {
  station: ['new', 'mine', 'reports'],
  manager: ['queue', 'board', 'reports'],
  storage: ['toload', 'transit', 'board', 'reports'],
  admin: ['new', 'reports', 'users', 'newuser', 'fuels'],
}

const TAB_LABEL = {
  mine: 'myActivity',
  new: 'tabNew',
  queue: 'tabQueue',
  toload: 'tabLoad',
  transit: 'tabTransit',
  board: 'tabAll',
  reports: 'tabReports',
  users: 'tabUsers',
  newuser: 'tabAddNew',
  fuels: 'tabSetup',
}

const QUEUE_STATUS = { queue: ['pending'], toload: ['approved'], transit: ['loaded'] }

export function App() {
  const [lang, setLang] = useState(loadLang)
  const t = DICT[lang]

  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [stations, setStations] = useState([])
  const [products, setProducts] = useState([])
  const [boot, setBoot] = useState('loading') // loading | ready | error
  const [tab, setTab] = useState('')
  const [action, setAction] = useState(null)
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
      setBoot('ready')
    } catch {
      if (!alive.current) return
      setBoot('error')
    }
  }, [session])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setBoot('loading')
      return
    }
    loadReference()
  }, [session, loadReference])

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), [])

  // Live updates. A single action writes the order row plus event rows, so the
  // events arrive in a burst; debounce them into one quiet refresh rather than
  // several full refetches, which would otherwise thrash the list on screen.
  useEffect(() => {
    if (!session) return
    let timer
    const bump = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setRefreshKey((n) => n + 1), 400)
    }
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, bump)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [session])

  const role = profile?.role
  const tabs = useMemo(() => NAV[role] || [], [role])
  const current = tabs.includes(tab) ? tab : tabs[0]

  // Badge counts for the queue tabs.
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

  if (boot === 'loading') {
    return <div className="auth"><Spinner label={t.loadingData} /></div>
  }

  if (boot === 'error' || !profile) {
    return (
      <div className="auth">
        <div className="auth-card">
          <Empty title={t.loadFailed} msg={t.checkNet} />
          <button className="btn btn-go wide" onClick={loadReference}>{t.retry}</button>
          <div className="center">
            <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().catch(() => {})}>
              {t.signOut}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile.is_active) return <Inactive t={t} />

  const activeStations = stations.filter((s) => s.is_active)
  const activeProducts = products.filter((p) => p.is_active)

  const onAct = (a, order) => setAction({ a, order })

  const listFor = (key) => {
    // "My orders" for a station means every order for that station — including
    // one an admin placed on their behalf — not only the ones this account
    // personally touched. RLS already limits a station to its own station, so
    // scoping by station_id is both correct and safe. Other roles that ever get
    // a "mine" tab fall back to orders they acted on.
    const mineScope =
      role === 'station' && profile.station_id
        ? { stationId: profile.station_id }
        : { actorId: profile.id }
    const scope = key === 'mine' ? mineScope : QUEUE_STATUS[key] ? { statuses: QUEUE_STATUS[key] } : {}
    const empties = {
      mine: { title: t.emptyMine, msg: t.emptyMineP },
      queue: { title: t.emptyQueue, msg: t.emptyQueueP },
      toload: { title: t.emptyLoad, msg: t.emptyLoadP },
      transit: { title: t.emptyTransit, msg: t.emptyTransitP },
      board: { title: t.emptyAll, msg: t.emptyAllP },
    }
    return (
      <OrdersList
        key={key}
        t={t}
        lang={lang}
        role={role}
        scope={scope}
        stations={activeStations}
        products={activeProducts}
        refreshKey={refreshKey}
        onAct={onAct}
        empty={empties[key]}
        showFilters={key !== 'queue' && key !== 'toload' && key !== 'transit'}
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
          <button className="tbtn mono" onClick={() => setLang(lang === 'ku' ? 'en' : 'ku')}>
            {lang === 'ku' ? 'EN' : 'KU'}
          </button>
          <button className="tbtn" onClick={() => setShowAccount(true)} aria-label={t.tabAccount}>
            {t.tabAccount}
          </button>
          <button className="tbtn" onClick={() => supabase.auth.signOut().catch(() => {})}>{t.signOut}</button>
        </div>
      </header>

      <nav className="tabs">
        <div className="tabs-in">
          {tabs.map((key) => (
            <button
              key={key}
              className="tab"
              aria-selected={current === key}
              onClick={() => setTab(key)}
            >
              {t[TAB_LABEL[key]]}
              {badges[key] ? <span className="cnt">{badges[key]}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        {current === 'new' && (
          <NewOrder
            t={t} lang={lang} products={activeProducts} stations={activeStations}
            profile={profile} onDone={refresh}
          />
        )}
        {current === 'users' && (
          <Users t={t} lang={lang} stations={stations} reload={loadReference} meId={profile.id} />
        )}
        {current === 'newuser' && (
          <NewUser t={t} lang={lang} stations={stations} reload={loadReference} />
        )}
        {current === 'fuels' && (
          <>
            <StationList t={t} reload={loadReference} />
            <Fuels t={t} lang={lang} products={products} reload={loadReference} />
          </>
        )}
        {current === 'reports' && (
          <Reports
            t={t} lang={lang} role={role} profile={profile}
            stations={activeStations} refreshKey={refreshKey}
          />
        )}
        {['mine', 'board', 'queue', 'toload', 'transit'].includes(current) && listFor(current)}
      </main>

      {action && (
        <ActionSheet
          act={action.a}
          order={action.order}
          t={t}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); refresh() }}
        />
      )}

      {showAccount && <Account t={t} profile={profile} onClose={() => setShowAccount(false)} />}
    </>
  )
}
