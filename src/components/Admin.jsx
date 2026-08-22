import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBox, Ok, Sheet, Empty, PasswordInput, Spinner } from './common'
import { rpc, write, fetchSettings, saveSettings, fetchAuditLog } from '../lib/api'
import { stamp } from '../lib/util'
import { translateError } from './ActionSheet'

// Filter order is by privilege; the create form below keeps its own order.
const ROLES = ['admin', 'manager', 'storage', 'station']

const BLANK_STATION = { code: '', name_en: '', name_ku: '', location: '' }

const BLANK_USER = { username: '', password: '', full_name: '', role: 'station', station_id: '', phone: '' }

/**
 * Existing accounts: who exists, what they may do, and whether they are on.
 *
 * Creating an account lives on its own tab — the everyday job here is finding
 * someone and changing their role or switching them off, and a long create
 * form underneath only got in the way of that.
 */
export function Users({ t, lang, stations, reload, meId }) {
  const [users, setUsers] = useState([])
  const [roleFilter, setRoleFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const [resetting, setResetting] = useState(null)
  const [newPw, setNewPw] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ role: 'station', station_id: '', is_active: true })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const list = useCallback(async () => {
    setState('loading')
    try {
      setUsers((await rpc('admin_list_users')) || [])
      setState('ready')
    } catch (e) {
      setProblem(translateError(e, t))
      setState('error')
    }
  }, [t])

  useEffect(() => {
    list()
  }, [list])

  const openEdit = (u) => {
    setProblem('')
    setDone('')
    setDraft({ role: u.role, station_id: u.station_id || '', is_active: u.is_active })
    setEditing(u)
  }

  const saveEdit = async () => {
    if (saving) return
    setProblem('')
    if (draft.role === 'station' && !draft.station_id) return setProblem(t.pickStation)
    setSaving(true)
    try {
      await write(
        supabase
          .from('profiles')
          .update({
            role: draft.role,
            // a station account is the only one tied to a station; clearing it
            // otherwise stops a stale link deciding what they can see
            station_id: draft.role === 'station' ? draft.station_id : null,
            is_active: draft.is_active,
          })
          .eq('id', editing.id),
      )
      setEditing(null)
      setDone(t.savedOk)
      await list()
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u) => {
    if (removing) return
    setRemoving(true)
    setProblem('')
    try {
      await rpc('admin_delete_user', { p_user: u.id })
      setConfirming(null)
      await list()
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setRemoving(false)
    }
  }

  const savePassword = async () => {
    if (savingPw) return
    setProblem('')
    if (newPw.length < 6) return setProblem(t.pwShort)
    setSavingPw(true)
    try {
      await rpc('admin_set_password', { p_user: resetting.id, p_password: newPw })
      setResetting(null)
      setNewPw('')
      setDone(t.pwChanged)
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setSavingPw(false)
    }
  }

  const stationName = (id) => {
    const s = stations.find((x) => x.id === id)
    return s ? (lang === 'ku' ? s.name_ku : s.name_en) : ''
  }

  // Counts come from the whole list, so they keep telling you how many of each
  // role exist while you are looking at just one of them.
  const roleCounts = ROLES.reduce(
    (acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }),
    {},
  )

  const term = userSearch.trim().toLowerCase()
  const shown = users.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!term ||
        (u.full_name || '').toLowerCase().includes(term) ||
        (u.username || '').toLowerCase().includes(term)),
  )

  return (
    <>
      <div className="toolbar">
        <div className="rolebar">
          <button aria-pressed={roleFilter === ''} onClick={() => setRoleFilter('')}>
            {t.fAll} <b>{users.length}</b>
          </button>
          {ROLES.map((r) => (
            <button key={r} aria-pressed={roleFilter === r} onClick={() => setRoleFilter(r)}>
              {t['r_' + r]} <b>{roleCounts[r]}</b>
            </button>
          ))}
        </div>

        <input
          className="inp search"
          type="search"
          value={userSearch}
          placeholder={t.searchPh}
          aria-label={t.search}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>

      <ErrorBox>{problem}</ErrorBox>
      <Ok>{done}</Ok>

      <div className="panel">
        {state === 'loading' && <Spinner label={t.loadingData} />}
        {state !== 'loading' && shown.length === 0 && (
          <Empty title={t.noResults} msg={t.noResultsP} />
        )}
        {shown.map((u) => (
          <div className="lrow" key={u.id}>
            <div className="grow">
              <b>{u.full_name}</b>
              <small>
                {u.username} · {t['r_' + u.role]}
                {u.role === 'station' && u.station_id ? ' · ' + stationName(u.station_id) : ''}
              </small>
            </div>
            <span className={'tag ' + (u.is_active ? 'on' : 'off')}>
              {u.is_active ? t.active : t.off}
            </span>
            {u.id === meId ? (
              <span className="tag on">{t.you}</span>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                  {t.editUser}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>
                  {t.resetPw}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(u)}>
                  {t.delete}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <Sheet title={t.editUserTitle} lede={editing.full_name} onClose={() => setEditing(null)}>
          <ErrorBox>{problem}</ErrorBox>

          <div className="field">
            <label>{t.role}</label>
            <div className="seg">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={draft.role === r}
                  onClick={() => setDraft((d) => ({ ...d, role: r }))}
                >
                  {t['r_' + r]}
                </button>
              ))}
            </div>
          </div>

          {draft.role === 'station' && (
            <div className="field">
              <label htmlFor="e-station">{t.station}</label>
              <select
                id="e-station"
                className="inp"
                value={draft.station_id}
                onChange={(e) => setDraft((d) => ({ ...d, station_id: e.target.value }))}
              >
                <option value="">—</option>
                {stations.map((s2) => (
                  <option key={s2.id} value={s2.id}>
                    {lang === 'ku' ? s2.name_ku : s2.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label>{t.accountActive}</label>
            <div className="seg">
              <button
                type="button"
                aria-pressed={draft.is_active}
                onClick={() => setDraft((d) => ({ ...d, is_active: true }))}
              >
                {t.active}
              </button>
              <button
                type="button"
                aria-pressed={!draft.is_active}
                onClick={() => setDraft((d) => ({ ...d, is_active: false }))}
              >
                {t.off}
              </button>
            </div>
          </div>

          <div className="acts">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>{t.cancel}</button>
            <button className="btn btn-go" disabled={saving} onClick={saveEdit}>
              {saving ? t.saving : t.save}
            </button>
          </div>
        </Sheet>
      )}

      {resetting && (
        <Sheet title={t.resetPw} lede={resetting.full_name} onClose={() => setResetting(null)}>
          <ErrorBox>{problem}</ErrorBox>
          <div className="field">
            <label htmlFor="u-newpw">{t.newPw}</label>
            <PasswordInput id="u-newpw" value={newPw} onChange={setNewPw} autoComplete="new-password" t={t} />
            <p className="hint block">{t.changePwHint}</p>
          </div>
          <div className="acts">
            <button className="btn btn-ghost" onClick={() => setResetting(null)}>{t.cancel}</button>
            <button className="btn btn-go" disabled={savingPw || newPw.length < 6} onClick={savePassword}>{savingPw ? t.saving : t.save}</button>
          </div>
        </Sheet>
      )}

      {confirming && (
        <Sheet title={t.delete} lede={confirming.full_name} onClose={() => setConfirming(null)}>
          <p className="lede">{t.reallyDelete}</p>
          <div className="acts">
            <button className="btn btn-ghost" onClick={() => setConfirming(null)}>{t.cancel}</button>
            <button className="btn btn-no" disabled={removing} onClick={() => remove(confirming)}>{removing ? t.saving : t.delete}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

/**
 * Creating an account.
 *
 * A station account is tied to a station, so that one dropdown is here.
 * Creating and retiring stations lives on Setup — this screen adds a person.
 */
export function NewUser({ t, lang, stations, reload }) {
  const [form, setForm] = useState(BLANK_USER)
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const create = async () => {
    if (busy) return
    setProblem('')
    setDone('')
    if (!form.username.trim()) return setProblem(t.username)
    if (form.password.length < 6) return setProblem(t.pwShort)

    if (form.role === 'station' && !form.station_id) return setProblem(t.pickStation)

    setBusy(true)
    try {
      await rpc('admin_create_user', {
        p_username: form.username,
        p_password: form.password,
        p_full_name: form.full_name || form.username,
        p_role: form.role,
        p_station: form.role === 'station' ? form.station_id : null,
        p_phone: form.phone || null,
      })
      setDone(t.userCreated)
      setForm(BLANK_USER)
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <div className="panel">
      <h2>{t.addUser}</h2>
      <ErrorBox>{problem}</ErrorBox>
      <Ok>{done}</Ok>

      <div className="row">
        <div className="field">
          <label htmlFor="u-name">{t.username}</label>
          <input
            id="u-name" className="inp" value={form.username}
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
            onChange={set('username')}
          />
        </div>
        <div className="field">
          <label htmlFor="u-pw">{t.password}</label>
          <PasswordInput
            id="u-pw" value={form.password} autoComplete="new-password" t={t}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          />
        </div>
      </div>
      <p className="hint block">{t.credsHint}</p>

      <div className="field">
        <label htmlFor="u-full">{t.fullName}</label>
        <input id="u-full" className="inp" value={form.full_name} onChange={set('full_name')} />
      </div>

      <div className="field">
        <label>{t.role}</label>
        <div className="seg">
          {['station', 'manager', 'storage', 'admin'].map((r) => (
            <button
              key={r} type="button" aria-pressed={form.role === r}
              onClick={() => setForm((f) => ({ ...f, role: r, station_id: '' }))}
            >
              {t['r_' + r]}
            </button>
          ))}
        </div>
      </div>

      {form.role === 'station' && (
        <div className="field">
          <label htmlFor="u-station">{t.station}</label>
          <select id="u-station" className="inp" value={form.station_id} onChange={set('station_id')}>
            <option value="">—</option>
            {stations.map((s2) => (
              <option key={s2.id} value={s2.id}>{lang === 'ku' ? s2.name_ku : s2.name_en}</option>
            ))}
          </select>
          {!stations.length && <p className="hint block">{t.noStationFirst}</p>}
        </div>
      )}

      <div className="field">
        <label htmlFor="u-phone">{t.phone}</label>
        <input id="u-phone" className="inp" type="tel" value={form.phone} onChange={set('phone')} />
      </div>

      <button className="btn btn-go wide" disabled={busy} onClick={create}>
        {busy ? t.saving : t.addUser}
      </button>
    </div>

    </>
  )
}

/**
 * Stations: create one, see the rest, take one out of service. Stations are
 * never deleted (orders and accounts reference them historically) — they are
 * deactivated instead, which hides them from new orders but keeps history.
 */
export function StationList({ t, lang, stations = [], reload }) {
  const [problem, setProblem] = useState('')
  const [form, setForm] = useState(BLANK_STATION)
  const [busy, setBusy] = useState(false)
  const [toggling, setToggling] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const add = async () => {
    if (busy) return
    setProblem('')
    if (!form.code.trim() || !form.name_en.trim()) return setProblem(t.code + ' + ' + t.nameEn)
    if (!form.location.trim()) return setProblem(t.locationReq)
    setBusy(true)
    try {
      await write(
        supabase.from('stations').insert({
          code: form.code.trim().toUpperCase(),
          name_en: form.name_en.trim(),
          name_ku: form.name_ku.trim() || form.name_en.trim(),
          location: form.location.trim(),
          phone: form.phone?.trim() || null,
        }),
      )
      setForm(BLANK_STATION)
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (s) => {
    if (toggling) return
    setToggling(s.id)
    setProblem('')
    try {
      await write(supabase.from('stations').update({ is_active: !s.is_active }).eq('id', s.id))
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setToggling(null)
    }
  }

  return (
    <>
      <div className="panel">
        <h2>{t.addStation}</h2>
        <ErrorBox>{problem}</ErrorBox>

        <div className="row">
          <div className="field">
            <label htmlFor="s-code">{t.code}</label>
            <input id="s-code" className="inp" value={form.code} placeholder="ST-01" onChange={set('code')} />
          </div>
          <div className="field">
            <label htmlFor="s-loc">{t.location}</label>
            <input id="s-loc" className="inp" value={form.location} onChange={set('location')} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="s-en">{t.nameEn}</label>
            <input id="s-en" className="inp" value={form.name_en} onChange={set('name_en')} />
          </div>
          <div className="field">
            <label htmlFor="s-ku">{t.nameKu}</label>
            <input id="s-ku" className="inp" value={form.name_ku} onChange={set('name_ku')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-phone">{t.contactWord} <span className="hint">· {t.optional}</span></label>
          <input id="s-phone" className="inp" type="tel" value={form.phone || ''} onChange={set('phone')} />
        </div>
        <button className="btn btn-go wide" disabled={busy} onClick={add}>
          {busy ? t.saving : t.addStation}
        </button>
      </div>

      {stations.length > 0 && (
        <div className="panel">
          <h2>{t.tabStations}</h2>
          {stations.map((s) => (
            <div className="lrow" key={s.id}>
              <div className="grow">
                <b>{lang === 'ku' ? s.name_ku : s.name_en}</b>
                <small>{s.code} · {s.location}</small>
              </div>
              <span className={'tag ' + (s.is_active ? 'on' : 'off')}>{s.is_active ? t.active : t.off}</span>
              <button className="btn btn-ghost btn-sm" disabled={toggling === s.id} onClick={() => toggle(s)}>
                {s.is_active ? t.turnOff : t.turnOn}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Workflow settings — the toggles that make certain fields required, etc. */
export function Settings({ t }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSettings().then((d) => { setData(d); setState('ready') }).catch((e) => { setProblem(translateError(e, t)); setState('error') })
  }, [t])

  const toggle = (key) => setData((d) => ({ ...d, [key]: !d[key] }))
  const save = async () => {
    if (busy) return
    setBusy(true); setProblem(''); setDone('')
    try { await saveSettings(data); setDone(t.savedOk) } catch (e) { setProblem(translateError(e, t)) } finally { setBusy(false) }
  }

  if (state === 'loading') return <div className="panel"><Spinner label={t.loadingData} /></div>

  const Toggle = ({ k, label }) => (
    <div className="tog">
      <span className="tl2">{label}</span>
      <button className="switch" role="switch" aria-checked={!!data[k]} aria-label={label} onClick={() => toggle(k)} />
    </div>
  )

  return (
    <div className="panel">
      <h2>{t.settingsTitle}</h2>
      <ErrorBox>{problem}</ErrorBox>
      <Ok>{done}</Ok>
      {data && (
        <>
          <Toggle k="require_dispatch_reference" label={t.settingRequireDispatch} />
          <Toggle k="require_receiver_name" label={t.settingRequireReceiver} />
          <Toggle k="allow_past_needed_date" label={t.settingAllowPast} />
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="set-max">{t.settingMaxQty}</label>
            <input id="set-max" className="inp num" type="number" min="1" value={data.max_order_quantity ?? ''}
              onChange={(e) => setData((d) => ({ ...d, max_order_quantity: Number(e.target.value) || 0 }))} />
          </div>
          <button className="btn btn-go wide" disabled={busy} onClick={save}>{busy ? t.saving : t.save}</button>
        </>
      )}
    </div>
  )
}

/** System-wide audit log — every recorded order action, newest first. */
export function AuditLog({ t, onOpenOrder }) {
  const [rows, setRows] = useState(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    fetchAuditLog(120).then(setRows).catch((e) => { setProblem(translateError(e, t)); setRows([]) })
  }, [t])

  if (rows === null) return <div className="panel"><Spinner label={t.loadingData} /></div>

  return (
    <div className="panel">
      <h2>{t.auditLog}</h2>
      <ErrorBox>{problem}</ErrorBox>
      {rows.length === 0 ? (
        <Empty title={t.auditEmpty} msg={t.auditEmptyP} />
      ) : (
        <div className="tl">
          {rows.map((ev) => (
            <button key={ev.id} className="tl-i" style={{ width: '100%', background: 'transparent', border: 0, textAlign: 'start', cursor: 'pointer' }}
              onClick={() => ev.order_id && onOpenOrder(ev.order_id)}>
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-b">
                <div className="tl-h">{t['st_' + ev.to_status] || ev.event_type || ev.to_status}</div>
                <div className="tl-m">{ev.actor_name || '—'} · {stamp(ev.created_at)}</div>
                {ev.old_value && ev.new_value && <div className="tl-chg"><s>{ev.old_value}</s> → <b>{ev.new_value}</b></div>}
                {ev.reason && <div className="tl-r">{ev.reason}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Fuels({ t, lang, products, reload }) {
  const [form, setForm] = useState({ name_en: '', name_ku: '', unit: 'L' })
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const add = async () => {
    if (busy) return
    setProblem('')
    if (!form.name_en.trim()) return setProblem(t.nameEn)
    setBusy(true)
    try {
      // Append after the current highest sort_order rather than using the row
      // count, which repeated itself as soon as anything was removed.
      const next = products.reduce((max, p) => Math.max(max, p.sort_order ?? 0), 0) + 1
      await write(
        supabase.from('products').insert({
          name_en: form.name_en.trim(),
          name_ku: form.name_ku.trim() || form.name_en.trim(),
          unit: form.unit.trim() || 'L',
          sort_order: next,
        }),
      )
      setForm({ name_en: '', name_ku: '', unit: 'L' })
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setBusy(false)
    }
  }

  const [toggling, setToggling] = useState(null)
  const toggle = async (p) => {
    if (toggling) return
    setToggling(p.id)
    setProblem('')
    try {
      await write(supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id))
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setToggling(null)
    }
  }

  return (
    <>
      <div className="panel">
        <h2>{t.addFuel}</h2>
        <ErrorBox>{problem}</ErrorBox>
        <div className="field">
          <label htmlFor="f-en">{t.nameEn}</label>
          <input id="f-en" className="inp" value={form.name_en} onChange={set('name_en')} />
        </div>
        <div className="field">
          <label htmlFor="f-ku">{t.nameKu}</label>
          <input id="f-ku" className="inp" value={form.name_ku} onChange={set('name_ku')} />
        </div>
        <div className="field">
          <label htmlFor="f-unit">{t.unit}</label>
          <input id="f-unit" className="inp" value={form.unit} onChange={set('unit')} />
        </div>
        <button className="btn btn-go wide" disabled={busy} onClick={add}>
          {busy ? t.saving : t.addFuel}
        </button>
      </div>

      <div className="panel">
        <h2>{t.tabFuels}</h2>
        {products.map((p) => (
          <div className="lrow" key={p.id}>
            <div className="grow">
              <b>{lang === 'ku' ? p.name_ku : p.name_en}</b>
              <small>{p.unit}</small>
            </div>
            <span className={'tag ' + (p.is_active ? 'on' : 'off')}>
              {p.is_active ? t.active : t.off}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={toggling === p.id}
              onClick={() => toggle(p)}
            >
              {p.is_active ? t.turnOff : t.turnOn}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
