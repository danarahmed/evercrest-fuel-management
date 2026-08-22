import { supabase } from './supabase'

// VAPID public key — safe to ship to the browser. The matching private key
// lives only in the server-side push function.
const VAPID_PUBLIC = 'BB2EC4KQfyPsZHSBfnHtaLYe0sYBgRZ731ZqCu4F0ffMQuPwtRiT-b-xe25gzlvcN7uf6M7RSDTvtBou65y1s7k'

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window

/** 'unsupported' | 'default' | 'granted' | 'denied' */
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported')

function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Register the service worker (no permission prompt) so click-through works. */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    return !!(await reg.pushManager.getSubscription())
  } catch { return false }
}

/** Ask permission, subscribe this device, and store the subscription. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW())
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
    })
  }
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
  })
  if (error) throw new Error('save-failed')
  return true
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && (await reg.pushManager.getSubscription())
    if (sub) {
      await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
      await sub.unsubscribe()
    }
  } catch { /* best effort */ }
  return true
}
