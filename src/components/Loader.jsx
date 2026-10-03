import ItsmLogo from './ItsmLogo.jsx'

export default function Loader({ variant = 'fullscreen', title = 'Preparing your workspace', subtitle = 'Secure service management, all in one place.' }) {
  const content = <div className="loader-content">
    <div className="loader-mark-wrap">
      <ItsmLogo compact />
      <span className="loader-ring" aria-hidden="true" />
    </div>
    <p className="loader-title">{title}</p>
    {subtitle && <p className="loader-subtitle">{subtitle}</p>}
    <div className="loader-track" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><span /></div>
  </div>

  if (variant === 'inline') return <div className="app-loader-inline" role="status" aria-live="polite">{content}</div>
  return <main className="loader-screen" aria-label="Loading ITSM">{content}</main>
}
