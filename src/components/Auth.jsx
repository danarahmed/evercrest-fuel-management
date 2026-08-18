import { useState } from 'react'
import { supabase, usernameToEmail } from '../lib/supabase'
import { ErrorBox, PasswordInput } from './common'
import { Wordmark, Mark } from './Logo'

export function SignIn({ t, lang, setLang }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const submit = async (e) => {
    e?.preventDefault()
    if (busy || !username || !password) return
    setBusy(true)
    setProblem('')
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setBusy(false)
    // Deliberately the same message for a bad name and a bad password, so the
    // form cannot be used to find out which accounts exist.
    if (error) setProblem(/network|fetch/i.test(error.message) ? t.checkNet : t.badLogin)
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Wordmark tagline={`${t.appName} · ${t.appSub}`} />

        <div className="panel">
          <ErrorBox>{problem}</ErrorBox>

          <div className="field">
            <label htmlFor="si-user">{t.username}</label>
            <input
              id="si-user"
              className="inp"
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck="false"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="si-pw">{t.password}</label>
            <PasswordInput
              id="si-pw"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              t={t}
            />
          </div>

          <button className="btn btn-go wide" type="submit" disabled={busy || !username || !password}>
            {busy ? t.signingIn : t.signIn}
          </button>
        </div>

        <div className="center">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setLang(lang === 'ku' ? 'en' : 'ku')}
          >
            {lang === 'ku' ? 'English' : 'کوردی'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Inactive({ t }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="mark">
          <Mark size={64} />
          <b>{t.inactive}</b>
          <span>{t.inactiveMsg}</span>
        </div>
        <button className="btn btn-ghost wide" onClick={() => supabase.auth.signOut().catch(() => {})}>
          {t.signOut}
        </button>
      </div>
    </div>
  )
}
