import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBox, Ok, Sheet, Empty, PasswordInput, Spinner } from './common'
import { rpc, write } from '../lib/api'
import { translateError } from './ActionSheet'

const SETUP_TABS = ['users', 'stations', 'fuels']

export function Setup({ t, lang, stations, products, reload, meId }) {
  const [tab, setTab] = useState('users')
  return (
    <>
      <div className="subtabs">
        {SETUP_TABS.map((key) => (
          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {t['tab' + key[0].toUpperCase() + key.slice(1)]}
          </button>
        ))}
      </div>
      {tab === 'users' && <Users t={t} lang={lang} stations={stations} reload={reload} meId={meId} />}
      {tab === 'stations' && <Stations t={t} lang={lang} stations={stations} reload={reload} />}
      {tab === 'fuels' && <Fuels t={t} lang={lang} products={products} reload={reload} />}
    </>
  )
}

const BLANK_USER = { username: '', password: '', full_name: '', role: 'station', station_id: '', phone: '' }

function Users({ t, lang, stations, reload, meId }) {
  const [users, setUsers] = useState([])
  const [state, setState] = useState('loading')
  const [form, setForm] = useState(BLANK_USER)
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(null)
  const [newPw, setNewPw] = useState('')
  const [confirming, setConfirming] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

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

  const create = async () => {
    if (busy) return
    setProblem('')
    setDone('')
    if (!form.username.trim()) return setProblem(t.username)
    if (form.password.length < 6) return setProblem(t.pwShort)
    if (form.role === 'station' && !form.station_id) return setProblem(t.noStationFirst)
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
      await list()
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (u) => {
    setProblem('')
    try {
      await write(supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id))
      await list()
    } catch (e) {
      setProblem(translateError(e, t))
    }
  }

  const remove = async (u) => {
    setProblem('')
    setConfirming(null)
    try {
      await rpc('admin_delete_user', { p_user: u.id })
      await list()
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
    }
  }

  const savePassword = async () => {
    setProblem('')
    if (newPw.length < 6) return setProblem(t.pwShort)
    try {
      await rpc('admin_set_password', { p_user: resetting.id, p_password: newPw })
      setResetting(null)
      setNewPw('')
      setDone(t.pwChanged)
    } catch (e) {
      setProblem(translateError(e, t))
    }
  }

  const stationName = (id) => {
    const s = stations.find((x) => x.id === id)
    return s ? (lang === 'ku' ? s.name_ku : s.name_en) : ''
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
                onClick={() => setForm((f) => ({ ...f, role: r }))}
              >
                {t['r_' + r]}
              </button>
            ))}
          </div>
        </div>

        {form.role === 'station' && (
          <div className="field">
            <label htmlFor="u-station">{t.station}</label>
            {stations.length ? (
              <select id="u-station" className="inp" value={form.station_id} onChange={set('station_id')}>
                <option value="">—</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{lang === 'ku' ? s.name_ku : s.name_en}</option>
                ))}
              </select>
            ) : (
              <div className="err">{t.noStationFirst}</div>
            )}
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

      <div className="panel">
        <h2>{t.tabUsers}</h2>
        {state === 'loading' && <Spinner label={t.loadingData} />}
        {users.map((u) => (
          <div className="lrow" key={u.id}>
            <div className="grow">
              <b>{u.full_name}</b>
              <small>
                {u.username} · {t['r_' + u.role]}
                {u.station_id ? ' · ' + stationName(u.station_id) : ''}
              </small>
            </div>
            <span className={'tag ' + (u.is_active ? 'on' : 'off')}>
              {u.is_active ? t.active : t.off}
            </span>
            {u.id === meId ? (
              <span className="tag on">{t.you}</span>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(u)}>
                  {u.is_active ? t.turnOff : t.turnOn}
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
            <button className="btn btn-go" disabled={newPw.length < 6} onClick={savePassword}>{t.save}</button>
          </div>
        </Sheet>
      )}

      {confirming && (
        <Sheet title={t.delete} lede={confirming.full_name} onClose={() => setConfirming(null)}>
          <p className="lede">{t.reallyDelete}</p>
          <div className="acts">
            <button className="btn btn-ghost" onClick={() => setConfirming(null)}>{t.cancel}</button>
            <button className="btn btn-no" onClick={() => remove(confirming)}>{t.delete}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

const BLANK_STATION = { code: '', name_en: '', name_ku: '', location: '', phone: '' }

function Stations({ t, lang, stations, reload }) {
  const [form, setForm] = useState(BLANK_STATION)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const add = async () => {
    if (busy) return
    setProblem('')
    if (!form.code.trim() || !form.name_en.trim()) return setProblem(t.code + ' + ' + t.nameEn)
    setBusy(true)
    try {
      await write(
        supabase.from('stations').insert({
          code: form.code.trim().toUpperCase(),
          name_en: form.name_en.trim(),
          name_ku: form.name_ku.trim() || form.name_en.trim(),
          location: form.location.trim() || null,
          phone: form.phone.trim() || null,
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
    setProblem('')
    try {
      await write(supabase.from('stations').update({ is_active: !s.is_active }).eq('id', s.id))
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
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
            <label htmlFor="s-phone">{t.phone}</label>
            <input id="s-phone" className="inp" type="tel" value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-en">{t.nameEn}</label>
          <input id="s-en" className="inp" value={form.name_en} onChange={set('name_en')} />
        </div>
        <div className="field">
          <label htmlFor="s-ku">{t.nameKu}</label>
          <input id="s-ku" className="inp" value={form.name_ku} onChange={set('name_ku')} />
        </div>
        <div className="field">
          <label htmlFor="s-loc">{t.location}</label>
          <input id="s-loc" className="inp" value={form.location} onChange={set('location')} />
        </div>
        <button className="btn btn-go wide" disabled={busy} onClick={add}>
          {busy ? t.saving : t.addStation}
        </button>
      </div>

      <div className="panel">
        <h2>{t.tabStations}</h2>
        {!stations.length && <Empty title={t.emptyStations} msg={t.emptyStationsP} />}
        {stations.map((s) => (
          <div className="lrow" key={s.id}>
            <div className="grow">
              <b>{lang === 'ku' ? s.name_ku : s.name_en}</b>
              <small>
                {s.code}
                {s.location ? ' · ' + s.location : ''}
                {s.phone ? ' · ' + s.phone : ''}
              </small>
            </div>
            <span className={'tag ' + (s.is_active ? 'on' : 'off')}>
              {s.is_active ? t.active : t.off}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>
              {s.is_active ? t.turnOff : t.turnOn}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

function Fuels({ t, lang, products, reload }) {
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

  const toggle = async (p) => {
    setProblem('')
    try {
      await write(supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id))
      reload()
    } catch (e) {
      setProblem(translateError(e, t))
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
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>
              {p.is_active ? t.turnOff : t.turnOn}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
