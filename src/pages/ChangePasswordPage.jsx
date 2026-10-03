import { notifyToast } from '../components/Toast.jsx'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import ItsmLogo from '../components/ItsmLogo.jsx'
import './ChangePasswordPage.css'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, completePasswordChange, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 12) return setError('Use at least 12 characters for your new password.')
    if (newPassword !== confirmPassword) return setError('The new password and confirmation do not match.')
    setSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.message || 'Unable to update the password.')
      completePasswordChange()
      notifyToast('Your password has been updated.', 'success', 'Password updated')
      navigate('/dashboard', { replace: true })
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Password update failed') } finally { setSaving(false) }
  }

  return <main className="password-change-page">
    <section className="password-change-card">
      <div className="password-change-brand"><ItsmLogo /></div>
      <span className="password-change-icon" aria-hidden="true">✦</span>
      <p className="password-change-eyebrow">ACCOUNT SECURITY</p>
      <h1>Set a new password</h1>
      <p className="password-change-intro">Welcome, {user?.displayName || user?.username}. For your security, choose a new password before continuing to ITSM.</p>
      <form onSubmit={submit}>
        <label>Temporary password<input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="12" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>Use at least 12 characters.</small></label>
        <label>Confirm new password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="12" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        <label className="password-change-toggle"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show passwords</label>
        {error && <div role="alert" className="password-change-error">{error}</div>}
        <button className="password-change-submit" disabled={saving}>{saving ? 'Updating password…' : 'Update password'}</button>
      </form>
      <button className="password-change-signout" type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }) }}>Sign out instead</button>
    </section>
  </main>
}
