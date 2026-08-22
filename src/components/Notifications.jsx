import { useCallback, useEffect, useState } from 'react'
import { Sheet, Empty, ErrorBox } from './common'
import { fetchNotifications, unreadCount, markNotificationRead, markAllRead } from '../lib/api'
import { orderNo, stamp } from '../lib/util'
import { pushSupported, pushPermission, isPushSubscribed, enablePush, disablePush } from '../lib/push'

/**
 * In-app notification bell. Shows the unread count in the header; the panel
 * lists recent updates, each linking straight to its order and marking itself
 * read when opened.
 */
export function Notifications({ t, refreshKey, onOpenOrder }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [pushState, setPushState] = useState('off') // off | on | denied | unsupported | busy
  const [pushErr, setPushErr] = useState('')

  const refreshCount = useCallback(() => {
    unreadCount().then(setUnread).catch(() => {})
  }, [])

  useEffect(() => { refreshCount() }, [refreshCount, refreshKey])

  const syncPush = useCallback(async () => {
    if (!pushSupported()) return setPushState('unsupported')
    if (pushPermission() === 'denied') return setPushState('denied')
    setPushState((await isPushSubscribed()) ? 'on' : 'off')
  }, [])

  const load = useCallback(() => {
    fetchNotifications().then(setItems).catch(() => setItems([]))
  }, [])

  const openPanel = () => { setOpen(true); setPushErr(''); load(); syncPush() }

  const turnOnPush = async () => {
    setPushErr(''); setPushState('busy')
    try { await enablePush(); setPushState('on') }
    catch (e) {
      if (e?.message === 'denied') { setPushState('denied') }
      else { setPushState('off'); setPushErr(t.genericErr) }
    }
  }
  const turnOffPush = async () => { await disablePush(); setPushState('off') }

  const handleClick = async (n) => {
    setOpen(false)
    if (!n.is_read) {
      markNotificationRead(n.id).then(refreshCount).catch(() => {})
    }
    if (n.order_id) onOpenOrder(n.order_id)
  }

  const allRead = async () => {
    await markAllRead().catch(() => {})
    setItems((xs) => xs.map((x) => ({ ...x, is_read: true })))
    refreshCount()
  }

  return (
    <>
      <button className="bell" onClick={openPanel} aria-label={t.notifications}>
        🔔{unread > 0 && <span className="nb">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <Sheet title={t.notifications} onClose={() => setOpen(false)}>
          {pushState !== 'unsupported' && (
            <div className="pushbox">
              {pushState === 'on' ? (
                <div className="tog" style={{ borderBottom: 0, padding: '2px 0' }}>
                  <span className="tl2">🔔 {t.pushOnMsg}</span>
                  <button className="btn btn-ghost btn-sm" onClick={turnOffPush}>{t.turnOffPush}</button>
                </div>
              ) : pushState === 'denied' ? (
                <p className="hint block" style={{ margin: 0 }}>{t.pushDeniedMsg}</p>
              ) : (
                <>
                  <button className="btn btn-go wide" disabled={pushState === 'busy'} onClick={turnOnPush}>
                    {pushState === 'busy' ? t.pushWorking : '🔔 ' + t.enablePush}
                  </button>
                  <p className="hint block">{t.pushIosHint}</p>
                </>
              )}
              <ErrorBox>{pushErr}</ErrorBox>
            </div>
          )}
          {items.length === 0 ? (
            <Empty title={t.noNotifications} msg={t.noNotificationsP} />
          ) : (
            <>
              <div className="acts" style={{ marginTop: 0, marginBottom: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={allRead}>{t.markAllRead}</button>
              </div>
              <div className="nlist">
                {items.map((n) => (
                  <button key={n.id} className={'nitem' + (n.is_read ? '' : ' unread')} onClick={() => handleClick(n)}>
                    <span className="nd" aria-hidden="true" />
                    <span className="nb2">
                      <span className="nt">{t['notif_' + n.kind] || n.kind}</span>
                      <span className="nm">#{orderNo(n.order_no)} · {stamp(n.created_at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  )
}
