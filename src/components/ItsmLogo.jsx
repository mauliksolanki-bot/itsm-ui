import { Link } from 'react-router'

export default function ItsmLogo({ light = false, compact = false }) {
  return (
    <Link className={`itsm-logo${light ? ' itsm-logo-light' : ''}${compact ? ' itsm-logo-compact' : ''}`} to="/" aria-label="ITSM home">
      <svg className="itsm-logo-mark" viewBox="0 0 44 44" role="img" aria-label="">
        <rect x="1" y="1" width="42" height="42" rx="13" fill="currentColor" opacity=".12" />
        <path d="M13 12.5h18M22 12.5v19M13 31.5h18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="31" cy="12.5" r="3" fill="currentColor" />
        <circle cx="13" cy="31.5" r="3" fill="currentColor" />
      </svg>
      <span className="itsm-logo-word">ITSM</span>
      {!compact && <span className="itsm-logo-divider" aria-hidden="true" />}
      {!compact && <span className="itsm-logo-caption">Service Management</span>}
    </Link>
  )
}
