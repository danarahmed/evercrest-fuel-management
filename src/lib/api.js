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
    const parts = [`truck_no.ilike.${like}`, `driver_name.ilike.${like}`, `manifest_no.ilike.${like}`]
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

export async function fetchReference() {
  const [me, stations, products] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', (await supabase.auth.getUser()).data.user?.id).single(),
    supabase.from('stations').select('*').order('code'),
    supabase.from('products').select('*').order('sort_order'),
  ])
  if (me.error) throw new Error(errText(me.error, 'profile-failed'))
  return {
    profile: me.data,
    stations: stations.data || [],
    products: products.data || [],
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
export async function confirmDeliveryWithManifest({ order, file, received, manifestNo, note }) {
  const type = file.type
  if (!ALLOWED_MANIFEST_TYPES.includes(type)) throw new Error('manifest-type')
  if (file.size > MAX_MANIFEST_BYTES) throw new Error('manifest-size')

  const ext = EXT_BY_TYPE[type]
  const path = `${order.station_id}/${order.id}-${Date.now()}.${ext}`

  const up = await supabase.storage.from('manifests').upload(path, file, {
    contentType: type,
    upsert: false,
  })
  if (up.error) throw new Error(errText(up.error, 'upload-failed'))

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
