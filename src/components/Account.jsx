import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Sheet, ErrorBox, Ok, PasswordInput } from './common'

export function Account({ t, profile, onClose }) {
  const [pw, setPw] = useState('')
  const [repeat, setRepeat] = useState('')
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    setProblem('')
    if (pw.length < 6) return setProblem(t.pwShort)
    if (pw !== repeat) return setProblem(t.pwMismatch)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setProblem(error.message)
    setDone(true)
    setPw('')
    setRepeat('')
    setTimeout(onClose, 1400)
  }

  return (
    <Sheet title={t.tabAccount} lede={`${profile.full_name} · ${t['r_' + profile.role]}`} onClose={onClose}>
      <ErrorBox>{problem}</ErrorBox>
      <Ok>{done ? t.pwChanged : ''}</Ok>

      <div className="field">
        <label htmlFor="ac-pw">{t.newPw}</label>
        <PasswordInput id="ac-pw" value={pw} onChange={setPw} autoComplete="new-password" t={t} />
        <p className="hint block">{t.changePwHint}</p>
      </div>

      <div className="field">
        <label htmlFor="ac-pw2">{t.pwRepeat}</label>
        <PasswordInput id="ac-pw2" value={repeat} onChange={setRepeat} autoComplete="new-password" t={t} />
      </div>

      <div className="acts">
        <button className="btn btn-ghost" onClick={onClose}>{t.close}</button>
        <button className="btn btn-go" disabled={busy || pw.length < 6} onClick={save}>
          {busy ? t.saving : t.save}
        </button>
      </div>
    </Sheet>
  )
}
