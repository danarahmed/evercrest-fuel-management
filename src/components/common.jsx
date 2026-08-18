import { useEffect, useRef, useState } from 'react'

export function StatusChip({ status, t }) {
  return <span className={'chip c-' + status}>{t['st_' + status]}</span>
}

const RAIL = ['pending', 'approved', 'loaded', 'delivered']

export function Rail({ status, t }) {
  const labels = [t.rl_requested, t.rl_approved, t.rl_loaded, t.rl_delivered]
  const at = RAIL.indexOf(status)
  if (at < 0) return null
  return (
    <div className="rail" aria-hidden="true">
      {labels.map((label, i) => (
        <div key={i} className={'rail-step' + (i <= at ? ' done' : '') + (i < at ? ' fill' : '')}>
          <div className="dot" />
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

/**
 * Bottom sheet / dialog.
 *
 * The old build only closed on a backdrop click: no Escape, no focus handling,
 * and the page behind kept scrolling. All three are fixed here.
 */
export function Sheet({ title, lede, children, onClose }) {
  const panel = useRef(null)
  // Keep the latest onClose reachable without making the mount effect depend on
  // its identity. The parent re-renders on every realtime event and passes a
  // fresh onClose each time; if the effect below re-ran on that, it would
  // re-grab focus and re-lock scroll mid-typing. It must run exactly once.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const focusable = panel.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)

    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('input, textarea, select, button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement) previous.focus()
    }
    // Intentionally empty: set up once on open, tear down once on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <h3>{title}</h3>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, msg, action }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {msg && <p>{msg}</p>}
      {action}
    </div>
  )
}

export function ErrorBox({ children, onRetry, retryLabel }) {
  if (!children) return null
  return (
    <div className="err" role="alert">
      <span>{children}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export function Ok({ children }) {
  if (!children) return null
  return (
    <div className="ok" role="status">
      {children}
    </div>
  )
}

export function Spinner({ label }) {
  return (
    <div className="loading" role="status">
      <span className="spin" aria-hidden="true" />
      {label}
    </div>
  )
}

/** Text input with a show/hide toggle, so passwords are masked by default. */
export function PasswordInput({ value, onChange, id, autoComplete, t }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="pw">
      <input
        id={id}
        className="inp"
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="pw-eye" onClick={() => setShown(!shown)}>
        {shown ? t.hidePw : t.showPw}
      </button>
    </div>
  )
}
