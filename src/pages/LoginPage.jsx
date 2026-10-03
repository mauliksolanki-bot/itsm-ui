import { notifyToast } from '../components/Toast.jsx'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import ItsmLogo from '../components/ItsmLogo.jsx'

function EyeIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.1 9.5 6-.4.8-1.3 2-2.6 3.1M6.2 6.2C4.2 7.5 2.9 9.4 2.5 11c1 1.9 4.5 6 9.5 6 1 0 1.9-.2 2.8-.5" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.5" /></svg>
  )
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

export default function LoginPage() {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setNotice('')
    setIsSubmitting(true)
    const formData = new FormData(event.currentTarget)
    try {
      await login({
        username: formData.get('username'),
        password: formData.get('password'),
        rememberMe,
      })
      notifyToast('You are signed in to ITSM.', 'success', 'Welcome back')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setNotice(error.message)
      notifyToast(error.message, 'error', 'Sign-in failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-layout">
      <section className="brand-panel" aria-label="About ITSM">
        <div className="brand-panel-inner">
          <header className="brand-header">
            <ItsmLogo />
            <span className="secure-label"><span className="secure-dot" />Secure workspace</span>
          </header>

          <div className="brand-story">
            <p className="brand-eyebrow">IT SERVICE MANAGEMENT</p>
            <h1>Support that keeps <span>work moving forward.</span></h1>
            <p className="brand-description">Bring requests, incidents, and service teams together in one clear workspace.</p>
          </div>

          <div className="login-capabilities" aria-label="ITSM workspace capabilities">
            <article className="login-capability-card">
              <div className="login-capability-topline"><span className="login-capability-icon capability-incidents" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 21 19H3L12 3Z"/><path d="M12 9v4M12 16h.01"/></svg></span><small>P1 / TRIAGE</small></div>
              <strong>Incidents &amp; changes</strong>
              <p>Coordinate service recovery and planned work.</p>
            </article>
            <article className="login-capability-card">
              <div className="login-capability-topline"><span className="login-capability-icon capability-services" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg></span><small>SELF-SERVICE</small></div>
              <strong>Service catalog</strong>
              <p>Give teams one place to request support.</p>
            </article>
            <article className="login-capability-card">
              <div className="login-capability-topline"><span className="login-capability-icon capability-approvals" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3.5h8l4 4V20H7z"/><path d="M15 3.5V8h4M10 13l2 2 4-4"/></svg></span><small>AUTOMATED</small></div>
              <strong>Approvals &amp; tasks</strong>
              <p>Keep work clear, assigned, and moving.</p>
            </article>
          </div>
          <aside className="login-platform-note"><span className="login-platform-note-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/></svg></span><span><strong>One connected service workspace</strong><small>Service teams, requests, and change work together in one place.</small></span></aside>

          <footer className="brand-footer"><span>One workspace. Better service.</span><span className="brand-footer-mark" aria-hidden="true">✳</span></footer>
        </div>
        <div className="brand-orb brand-orb-one" aria-hidden="true" />
        <div className="brand-orb brand-orb-two" aria-hidden="true" />
        <div className="brand-grid" aria-hidden="true" />
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-topbar">
          <div className="login-gateway-brand"><span className="login-gateway-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/></svg></span><strong>ITSM GATEWAY</strong></div>
          <button className="help-link" type="button" onClick={() => { const message = 'Please contact your organization’s IT support team for sign-in assistance.'; setNotice(message); notifyToast(message, 'info', 'Sign-in help') }}>Need help? <span>Contact support</span></button>
        </div>

        <div className="login-content">
          <div className="login-heading">
            <span className="welcome-chip"><span className="welcome-chip-dot" /> SECURE PORTAL LOGIN</span>
            <h2 id="login-title">Sign in to ITSM</h2>
            <p>Enter your work account details to continue.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="username">Username</label>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.5 3-5.5 7-5.5s6.5 2 7 5.5" /></svg>
              <input id="username" name="username" type="text" placeholder="superadmin" autoComplete="username" required />
            </div>

            <div className="password-label-row">
              <label className="field-label" htmlFor="password">Password</label>
              <button className="text-button forgot-button" type="button" onClick={() => { const message = 'Password recovery will be available once your organization enables it.'; setNotice(message); notifyToast(message, 'info', 'Password recovery') }}>Forgot password?</button>
            </div>
            <div className="input-wrap">
              <svg className="input-icon lock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 118 0v3M12 14v3" /></svg>
              <input id="password" name="password" type={passwordVisible ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required />
              <button className="password-toggle" type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}><EyeIcon visible={passwordVisible} /></button>
            </div>

            <label className="remember-option">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span className="custom-checkbox" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8 3 3 6-6" /></svg></span>
              <span>Keep me signed in</span>
            </label>

            {notice && <p className="form-notice" role="status">{notice}</p>}

            <button className="sign-in-button" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
              {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : <span className="button-arrow"><ArrowIcon /></span>}
            </button>
          </form>

          <div className="login-divider"><span /> <span>ITSM WORKSPACE</span> <span /></div>
          <p className="security-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3z" /><path d="m9 12 2 2 4-4" /></svg> Your account is protected with secure access.</p>
        </div>

        <footer className="login-footer"><span>© {new Date().getFullYear()} ITSM</span><span>IT Service Management</span></footer>
      </section>
    </main>
  )
}
