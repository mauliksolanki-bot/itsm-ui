import { notifyToast } from './Toast.jsx'
import { useEffect, useRef, useState } from 'react'
import './NotificationBell.css'

function relativeTime(value) {
  if (!value) return 'Just now'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  const days = Math.floor(seconds / 86400)
  return days < 7 ? `${days} day${days === 1 ? '' : 's'} ago` : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function tone(type = '') {
  if (type.includes('BREACHED') || type.includes('REJECTED') || type.includes('FAILED')) return 'danger'
  if (type.includes('APPROVAL') || type.includes('WARNING')) return 'warning'
  if (type.includes('ASSIGNED')) return 'assigned'
  return 'updated'
}

async function readResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load notifications.')
  return body
}

export default function NotificationBell({ onOpenTicket }) {
  const root = useRef(null)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unreadCount: 0, notifications: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const result = await readResponse(await fetch('/api/notifications', { credentials: 'include' }))
      setData({ unreadCount: result?.unreadCount || 0, notifications: result?.notifications || [] })
      setError('')
    } catch (reason) {
      setError(reason.message)
      if (open) notifyToast(reason.message, 'error', 'Notifications unavailable')
    }
  }

  useEffect(() => { refresh(); const timer = setInterval(refresh, 60000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!open) return undefined
    setLoading(true)
    refresh().finally(() => setLoading(false))
    return undefined
  }, [open])
  useEffect(() => {
    if (!open) return undefined
    function closeOutside(event) { if (root.current && !root.current.contains(event.target)) setOpen(false) }
    function closeEscape(event) { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])

  async function openNotification(item) {
    try {
      if (!item.read) {
        await readResponse(await fetch(`/api/notifications/${item.id}/read`, { method: 'POST', credentials: 'include' }))
        setData((current) => ({ ...current, unreadCount: Math.max(0, current.unreadCount - 1), notifications: current.notifications.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry) }))
      }
      setOpen(false)
      onOpenTicket(item)
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Could not open notification') }
  }

  async function markAllRead() {
    try {
      await readResponse(await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' }))
      setData((current) => ({ unreadCount: 0, notifications: current.notifications.map((item) => ({ ...item, read: true })) }))
      setError('')
      notifyToast('All notifications have been marked as read.', 'success', 'Notifications updated')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Could not update notifications') }
  }

  return <div className="notification-root" ref={root}>
    <button className={`notification-bell${open ? ' notification-bell-open' : ''}`} type="button" aria-label={`Notifications${data.unreadCount ? `, ${data.unreadCount} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {data.unreadCount > 0 && <span className="notification-count">{data.unreadCount > 99 ? '99+' : data.unreadCount}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Notifications">
      <header className="notification-panel-header"><div><h2>Notifications</h2><p>{data.unreadCount ? `${data.unreadCount} unread` : 'You’re all caught up'}</p></div><button type="button" onClick={markAllRead} disabled={!data.unreadCount}>Mark all read</button></header>
      {error && <p className="notification-error" role="alert">{error}</p>}
      <div className="notification-list" aria-live="polite">
        {loading && !data.notifications.length ? <div className="notification-state">Loading notifications…</div>
          : data.notifications.length ? data.notifications.map((item) => <button key={item.id} type="button" className={`notification-item${item.read ? ' notification-item-read' : ''}`} onClick={() => openNotification(item)}>
            <span className={`notification-indicator notification-indicator-${tone(item.type)}`} aria-hidden="true"><span /></span>
            <span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{relativeTime(item.createdAt)}</small></span>
            {!item.read && <span className="notification-unread-dot" aria-label="Unread" />}
          </button>)
            : <div className="notification-state"><span className="notification-empty-icon">✓</span><strong>No notifications yet</strong><span>Updates about your tickets will appear here.</span></div>}
      </div>
    </section>}
  </div>
}
