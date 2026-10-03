import { useEffect, useRef, useState } from 'react'

const TITLES = { success: 'Saved successfully', error: 'Something went wrong', info: 'Information', warning: 'Please note' }
const ICONS = { success: '✓', error: '!', info: 'i', warning: '⚠' }

export function notifyToast(message, type = 'info', title) {
  if (typeof window === 'undefined' || !message) return
  window.dispatchEvent(new CustomEvent('itsm:toast', { detail: { message: String(message), type, title: title || TITLES[type] || TITLES.info } }))
}

export default function ToastHost() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    const display = (event) => {
      if (timer.current) window.clearTimeout(timer.current)
      setToast(event.detail)
      timer.current = window.setTimeout(() => setToast(null), event.detail.type === 'error' ? 7000 : 4500)
    }
    window.addEventListener('itsm:toast', display)
    return () => {
      window.removeEventListener('itsm:toast', display)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  if (!toast) return null
  return <div className={`global-toast global-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
    <span className="global-toast-icon" aria-hidden="true">{ICONS[toast.type] || ICONS.info}</span>
    <span className="global-toast-copy"><strong>{toast.title}</strong><span>{toast.message}</span></span>
    <button type="button" aria-label="Dismiss message" onClick={() => { setToast(null); if (timer.current) window.clearTimeout(timer.current) }}>×</button>
  </div>
}
