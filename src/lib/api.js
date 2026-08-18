import { supabase } from './supabase'
import { errText } from './util'

export const PAGE_SIZE = 25
const ORDER_COLUMNS = '*'

/**
 * One page of the order board.
 *
 * Row level security already limits what a station can see; everything here is
 * narrowing on top of that. `count` comes back so the UI can say "25 of 340"
 * instead of silently cutting the list off, which is what the old build did.
 */
export async function fetchOrders({
  statuses,
  stationId,
  productId,
  location,
  actorId,
  search,
  fromDate,
  toDate,
  page = 0,
  pageSize = PAGE_SIZE,
} = {}) {
  let q = supabase
    .from('orders_view')
    .select(ORDER_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)

  if (statuses?.length) q = q.in('status', statuses)
  if (stationId) q = q.eq('station_id', stationId)
  if (productId) q = q.eq('product_id', productId)
  if (location) q = q.eq('station_location', location)
  if (fromDate) q = q.gte('created_at', fromDate.toISOString())
  if (toDate) q = q.lt('created_at', toDate.toISOString())

  // "Mine" means every order this account touched, in any role. The view
  // exposes those four ids as an `actors` array so this stays a single filter
  // that composes with the search below.
  if (actorId) q = q.contains('actors', [actorId])

  const term = String(search || '').trim()
  if (term) {
    const digits = term.replace(/^#/, '')
    const like = `%${escapeLike(term)}%`
    const parts = [
      `truck_no.ilike.${like}`,
      `driver_name.ilike.${like}`,
      `manifest_no.ilike.${like}`,
      `station_location.ilike.${like}`,
      `station_name_en.ilike.${like}`,
      `station_name_ku.ilike.${like}`,
    ]
    if (/^\d+$/.test(digits)) parts.push(`order_no.eq.${digits}`)
    q = q.or(parts.join(','))
  }

  const { data, error, count } = await q
  if (error) throw new Error(errText(error, 'load-failed'))
  return { rows: data || [], count: count ?? 0 }
}

/** PostgREST treats % and _ as wildcards and , as a filter separator. */
function escapeLike(s) {
  return s.replace(/[%_,()]/g, ' ')
}

/** Counts for the tab badges — a HEAD request per status, no rows shipped. */
export async function countOrders(filters = {}) {
  let q = supabase.from('orders_view').select('id', { count: 'exact', head: true })
  if (filters.statuses?.length) q = q.in('status', filters.statuses)
  if (filters.actorId) q = q.contains('actors', [filters.actorId])
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

/**
 * Load the profile, stations and fuel types the whole app is built on.
 *
 * `userId` comes from the session the caller already holds. The previous
 * version called auth.getUser() inline instead, which added a round-trip on
 * every load and opened a window right after sign-in where a parallel request
 * could go out before the token was attached — that produced a 401 on
 * /products, and because only the profile error was checked, the app carried
 * on with an empty fuel list and a New order form that could never be
 * submitted. Every one of the three now fails loudly, and a single retry
 * absorbs the transient case so nobody sees it.
 */
export async function fetchReference(userId) {
  const attempt = async () => {
    const [me, stations, products] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('stations').select('*').order('code'),
      supabase.from('products').select('*').order('sort_order'),
    ])
    const failed = me.error || stations.error || products.error
    if (failed) throw new Error(errText(failed, 'profile-failed'))
    return {
      profile: me.data,
      stations: stations.data || [],
      products: products.data || [],
    }
  }

  try {
    return await attempt()
  } catch {
    await new Promise((r) => setTimeout(r, 600))
    return attempt()
  }
}

export async function fetchEvents(orderId) {
  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at')
  if (error) throw new Error(errText(error, 'load-failed'))
  return data || []
}

export async function signedManifestUrl(path) {
  const { data, error } = await supabase.storage.from('manifests').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw new Error(errText(error, 'manifest-failed'))
  return data.signedUrl
}

/** Wrap an RPC so callers get a thrown Error instead of a silent {error} object. */
export async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw new Error(errText(error, 'rpc-failed'))
  return data
}

/** Wrap a table write the same way — the old build swallowed these entirely. */
export async function write(promise) {
  const { data, error } = await promise
  if (error) throw new Error(errText(error, 'write-failed'))
  return data
}

export const MAX_MANIFEST_BYTES = 15 * 1024 * 1024
export const ALLOWED_MANIFEST_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

/**
 * Upload a signed manifest, then record the delivery.
 *
 * The extension is derived from the sniffed MIME type rather than the file
 * name, so a "manifest.pdf.exe" cannot decide what lands in the bucket. If the
 * RPC afterwards fails we try to remove the object again rather than leaving an
 * orphan behind, which the previous version did on every failed confirm. The
 * delete is best effort: storage only allows it while the order is unconfirmed,
 * so a manifest attached to a real delivery can never be erased from the app.
 */
/**
 * Upload a manifest into the order's own station folder.
 *
 * The folder is what makes the document visible to the receiving station and
 * invisible to every other one, so the path is derived from the order rather
 * than from whoever is uploading.
 */
async function uploadManifest(order, file, prefix) {
  const type = file.type
  if (!ALLOWED_MANIFEST_TYPES.includes(type)) throw new Error('manifest-type')
  if (file.size > MAX_MANIFEST_BYTES) throw new Error('manifest-size')

  const path = `${order.station_id}/${prefix}${order.id}-${Date.now()}.${EXT_BY_TYPE[type]}`
  const up = await supabase.storage.from('manifests').upload(path, file, {
    contentType: type,
    upsert: false,
  })
  if (up.error) throw new Error(errText(up.error, 'upload-failed'))
  return path
}

/**
 * Mark an order loaded, optionally attaching the manifest the yard issued.
 *
 * The file goes into the receiving station's folder, so the station can open
 * it as soon as the truck is on the way.
 */
export async function markLoadedWithManifest({
  order, file, quantity, truck, driver, note, manifestNo,
}) {
  const path = file ? await uploadManifest(order, file, 'load-') : null
  try {
    await rpc('mark_loaded', {
      p_order: order.id,
      p_loaded_quantity: quantity,
      p_truck: truck,
      p_driver: driver,
      p_note: note,
      p_manifest_path: path,
      p_manifest_no: manifestNo,
    })
  } catch (e) {
    if (path) await supabase.storage.from('manifests').remove([path]).catch(() => {})
    throw e
  }
}

export async function confirmDeliveryWithManifest({ order, file, received, manifestNo, note }) {
  const path = await uploadManifest(order, file, '')

  try {
    await rpc('confirm_delivery', {
      p_order: order.id,
      p_manifest_path: path,
      p_received: received,
      p_manifest_no: manifestNo,
      p_note: note,
    })
  } catch (e) {
    await supabase.storage.from('manifests').remove([path]).catch(() => {})
    throw e
  }
}
