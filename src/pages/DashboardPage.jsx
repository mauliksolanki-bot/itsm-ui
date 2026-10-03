import { notifyToast } from '../components/Toast.jsx'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router'
import ItsmLogo from '../components/ItsmLogo.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import IncidentPage from './IncidentPage.jsx'
import ServiceRequestPage from './ServiceRequestPage.jsx'
import ChangeRequestPage from './ChangeRequestPage.jsx'
import TicketPage from './TicketPage.jsx'
import TicketPoolPage from './TicketPoolPage.jsx'
import TicketDetailPage from './TicketDetailPage.jsx'
import UserManagementPage from './UserManagementPage.jsx'
import ApprovalInboxPage from './ApprovalInboxPage.jsx'
import ApplicationOnboardingPage from './ApplicationOnboardingPage.jsx'
import ApplicationServersPage from './ApplicationServersPage.jsx'
import CmdbDashboardPage from './CmdbDashboardPage.jsx'

const modules = [
  { icon: 'T', title: 'My tickets', description: 'Create a ticket and follow its progress.', tone: 'blue' },
  { icon: 'S', title: 'Service catalog', description: 'Find the services and access you need.', tone: 'teal' },
  { icon: 'K', title: 'Knowledge base', description: 'Explore guides and helpful answers.', tone: 'amber' },
]

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'IT'
}

function readableRole(role) {
  return role.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function SubmenuIcon({ code }) {
  const iconCode = code?.toUpperCase()
  const tone = iconCode === 'INCIDENT' ? 'incident'
    : iconCode === 'SERVICE_REQUEST' ? 'request'
      : ['CHANGE_REQUEST', 'CHANGE_REQUEST_POOL'].includes(iconCode) ? 'change'
        : iconCode === 'TICKETS_POOL' ? 'ticket'
          : iconCode === 'CMDB_DASHBOARD' ? 'cmdb-dashboard'
            : iconCode === 'APPLICATION_ONBOARDING' ? 'onboarding'
            : iconCode === 'APPLICATION_SERVERS' ? 'app-servers' : 'default'

  return (
    <span className={`nav-submenu-icon nav-submenu-icon-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconCode === 'INCIDENT' ? <><path d="M12 3.5 21 19H3L12 3.5Z" /><path d="M12 9v4.5M12 17h.01" /></>
          : iconCode === 'SERVICE_REQUEST' ? <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3" /><path d="M8 4V3h8v1" /></>
            : ['CHANGE_REQUEST', 'CHANGE_REQUEST_POOL'].includes(iconCode) ? <><path d="M20 7h-5a4 4 0 0 0-4 4v2a4 4 0 0 1-4 4H4" /><path d="m17 4 3 3-3 3M7 14l-3 3 3 3" /><path d="M4 7h2" /></>
              : iconCode === 'TICKETS_POOL' ? <><path d="M8 4.5h9.3a1.7 1.7 0 0 1 1.7 1.7v9.1" /><rect x="4.5" y="7.5" width="14.5" height="12.5" rx="2.2" /><path d="M8 11.5h7.5M8 14.5h7.5M8 17.5h4.5" /></>
                : iconCode === 'CMDB_DASHBOARD' ? <><path d="M4 19a8 8 0 1 1 16 0"/><path d="m12 13 4-4M7 19h10M12 5v1"/><circle cx="12" cy="13" r="1"/></>
                  : iconCode === 'APPLICATION_ONBOARDING' ? <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 9h6M9 13h2m1 2 1.5 1.5L18 13" /></>
                  : iconCode === 'APPLICATION_SERVERS' ? <><rect x="3.5" y="4" width="10" height="7" rx="1.5"/><path d="M6.5 7.5h.01M9 7.5h2M8.5 11v2.5"/><rect x="7.5" y="14" width="13" height="6.5" rx="1.5"/><path d="M10.5 17.25h.01M13 17.25h4.5"/><path d="M17 4h3.5v6.5H17zM18.5 6.2h.01M18.5 8.2h.01"/></>
              : <><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 12h8M8 15h5" /></>}
      </svg>
    </span>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [navigationMenus, setNavigationMenus] = useState([])
  const [navigationError, setNavigationError] = useState('')
  const [navigationLoaded, setNavigationLoaded] = useState(false)
  const [serviceCatalogOpen, setServiceCatalogOpen] = useState(() => location.pathname.startsWith('/service-catalog'))
  const [administrationOpen, setAdministrationOpen] = useState(() => location.pathname.startsWith('/administration'))
  const [ticketMasterOpen, setTicketMasterOpen] = useState(true)
  const [applicationServerOpen, setApplicationServerOpen] = useState(() => location.pathname.startsWith('/application-server'))
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'there'

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/navigation/menus', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.message || 'Unable to load navigation menus.')
        return body
      })
      .then((menus) => setNavigationMenus(Array.isArray(menus) ? menus : []))
      .catch((error) => {
        if (error.name !== 'AbortError') { setNavigationError(error.message); notifyToast(error.message, 'error', 'Navigation unavailable') }
      })
      .finally(() => { if (!controller.signal.aborted) setNavigationLoaded(true) })
    return () => controller.abort()
  }, [])

  const overviewMenu = navigationMenus.find((menu) => menu.menuCode === 'OVERVIEW')
  const myTicketsMenu = navigationMenus.find((menu) => menu.menuCode === 'MY_TICKETS')
  const serviceCatalog = navigationMenus.find((menu) => menu.menuCode === 'SERVICE_CATALOG')
  const administration = navigationMenus.find((menu) => menu.menuCode === 'ADMINISTRATION')
  const ticketMaster = navigationMenus.find((menu) => menu.menuCode === 'TICKET_MASTER')
  const approvalsMenu = navigationMenus.find((menu) => menu.menuCode === 'APPROVALS')
  const applicationServer = navigationMenus.find((menu) => menu.menuCode === 'APPLICATION_SERVER')
  const canAccessApprovals = Boolean(approvalsMenu)
  const catalogSubmenus = serviceCatalog?.submenus || []
  const adminSubmenus = administration?.submenus || []
  const ticketMasterSubmenus = ticketMaster?.submenus || []
  const applicationServerSubmenus = applicationServer?.submenus || []
  const allSubmenus = [...catalogSubmenus, ...adminSubmenus, ...ticketMasterSubmenus, ...applicationServerSubmenus]
  const activeSubmenu = allSubmenus.find((submenu) => location.pathname === submenu.routePath || location.pathname.startsWith(`${submenu.routePath}/`))
  const isServiceCatalogActive = catalogSubmenus.some((submenu) => location.pathname === submenu.routePath || location.pathname.startsWith(`${submenu.routePath}/`))
  const isApplicationServerActive = applicationServerSubmenus.some((submenu) => location.pathname === submenu.routePath || location.pathname.startsWith(`${submenu.routePath}/`))
  const ticketDetail = location.pathname.match(/^\/ticket-master\/(tickets-pool|change-request-pool)\/(INCIDENT|SERVICE_REQUEST|CHANGE)\/(\d+)$/)
  const myTicketDetail = location.pathname.match(/^\/my-tickets\/(INCIDENT|SERVICE_REQUEST|CHANGE)\/(\d+)$/)
  const myChangeDetail = location.pathname.match(/^\/my-tickets\/CHANGE\/(\d+)$/)
  const serviceRequestDetail = location.pathname.match(/^\/service-catalog\/service-request\/(\d+)$/)

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      const message = 'Could not reach the service to end this session. Please try again.'
      setSignOutError(message)
      notifyToast(message, 'error', 'Sign-out failed')
      setIsSigningOut(false)
    }
  }

  function openNotification(item) {
    const type = item.referenceType === 'INCIDENT' ? 'INC' : item.referenceType === 'SERVICE_REQUEST' ? 'REQ' : item.referenceType === 'CHANGE' ? 'CHG' : null
    if (item.referenceType === 'SERVICE_REQUEST' && item.referenceId) navigate(`/service-catalog/service-request/${item.referenceId}`)
    else if (type && item.referenceId) navigate(`/my-tickets?ticketType=${type}&ticketId=${item.referenceId}`)
    else navigate('/my-tickets')
  }

  return (
    <main className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand"><ItsmLogo compact /></div>
        <p className="nav-section-label">WORKSPACE</p>
        <nav className="dashboard-nav" aria-label="Main navigation">
          {overviewMenu && <NavLink className={({ isActive }) => `nav-item${isActive && !activeSubmenu ? ' nav-item-active' : ''}`} to={overviewMenu.routePath}><span className="nav-icon overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m3.5 10 8.5-6.5 8.5 6.5v9.2a1.3 1.3 0 0 1-1.3 1.3h-5.1v-6h-4.2v6H4.8a1.3 1.3 0 0 1-1.3-1.3z" /></svg></span><span>{overviewMenu.menuName}</span></NavLink>}
          {myTicketsMenu && <NavLink className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`} to={myTicketsMenu.routePath}><span className="nav-icon tickets-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M7 3.8h10a1.7 1.7 0 0 1 1.7 1.7v13a1.7 1.7 0 0 1-1.7 1.7H7a1.7 1.7 0 0 1-1.7-1.7v-13A1.7 1.7 0 0 1 7 3.8Z" /><path d="M9 8h6M9 12h6M9 16h4" /><path d="M8.5 3.8v2M15.5 3.8v2" /></svg></span><span>{myTicketsMenu.menuName}</span></NavLink>}
          {approvalsMenu && <NavLink className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`} to={approvalsMenu.routePath}><span className="nav-icon approvals-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M7 3.8h10a2 2 0 0 1 2 2v14.4H5V5.8a2 2 0 0 1 2-2Z"/><path d="m8.5 12 2.2 2.2 4.8-5M8.5 7.5h7"/></svg></span><span>{approvalsMenu.menuName}</span></NavLink>}
          {serviceCatalog && (
            <div className="nav-menu-group">
              <button className={`nav-item nav-catalog-toggle${isServiceCatalogActive ? ' nav-item-active' : ''}`} type="button" aria-expanded={serviceCatalogOpen} aria-controls="service-catalog-submenus" onClick={() => setServiceCatalogOpen((open) => !open)}>
                <span className="nav-icon">◈</span><span>{serviceCatalog.menuName}</span><span className={`nav-chevron${serviceCatalogOpen ? ' nav-chevron-open' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m7 10 5 5 5-5" /></svg></span>
              </button>
              {serviceCatalogOpen && (
                <div className="nav-submenu" id="service-catalog-submenus" aria-label={`${serviceCatalog.menuName} submenu`}>
                  {catalogSubmenus.map((submenu) => (
                    <NavLink className={({ isActive }) => `nav-submenu-item${isActive ? ' nav-submenu-item-active' : ''}`} to={submenu.routePath} key={submenu.submenuId}>
                      <SubmenuIcon code={submenu.submenuCode} />{submenu.submenuName}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
          {administration && (
            <div className="nav-menu-group">
              <button className={`nav-item nav-catalog-toggle${location.pathname.startsWith('/administration') ? ' nav-item-active' : ''}`} type="button" aria-expanded={administrationOpen} aria-controls="administration-submenus" onClick={() => setAdministrationOpen((open) => !open)}>
                <span className="nav-icon">⚙</span><span>{administration.menuName}</span><span className={`nav-chevron${administrationOpen ? ' nav-chevron-open' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m7 10 5 5 5-5" /></svg></span>
              </button>
              {administrationOpen && <div className="nav-submenu" id="administration-submenus" aria-label={`${administration.menuName} submenu`}>
                {adminSubmenus.map((submenu) => <NavLink className={({ isActive }) => `nav-submenu-item${isActive ? ' nav-submenu-item-active' : ''}`} to={submenu.routePath} key={submenu.submenuId}><span className="nav-submenu-icon nav-submenu-icon-users" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.4-3.7 2.7-5.6 6.5-5.6s6.1 1.9 6.5 5.6z" /></svg></span>{submenu.submenuName}</NavLink>)}
              </div>}
            </div>
          )}
          {ticketMaster && (
            <div className="nav-menu-group">
              <button className={`nav-item nav-catalog-toggle${location.pathname.startsWith('/ticket-master') ? ' nav-item-active' : ''}`} type="button" aria-expanded={ticketMasterOpen} aria-controls="ticket-master-submenus" onClick={() => setTicketMasterOpen((open) => !open)}>
                <span className="nav-icon">▤</span><span>{ticketMaster.menuName}</span><span className={`nav-chevron${ticketMasterOpen ? ' nav-chevron-open' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m7 10 5 5 5-5" /></svg></span>
              </button>
              {ticketMasterOpen && <div className="nav-submenu" id="ticket-master-submenus" aria-label={`${ticketMaster.menuName} submenu`}>
                {ticketMasterSubmenus.map((submenu) => <NavLink className={({ isActive }) => `nav-submenu-item${isActive ? ' nav-submenu-item-active' : ''}`} to={submenu.routePath} key={submenu.submenuId}><SubmenuIcon code={submenu.submenuCode} />{submenu.submenuName}</NavLink>)}
              </div>}
            </div>
          )}
          {applicationServer && (
            <div className="nav-menu-group">
              <button className={`nav-item nav-catalog-toggle${isApplicationServerActive ? ' nav-item-active' : ''}`} type="button" aria-expanded={applicationServerOpen} aria-controls="application-server-submenus" onClick={() => setApplicationServerOpen((open) => !open)}>
                <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="3.5" width="7" height="6.5" rx="1.6"/><rect x="14" y="3.5" width="7" height="6.5" rx="1.6"/><rect x="8.5" y="14" width="7" height="6.5" rx="1.6"/><path d="M6.5 10v1.5c0 1 .8 1.5 2 1.5h7c1.2 0 2-.5 2-1.5V10M12 13v1"/></svg></span><span>{applicationServer.menuName}</span><span className={`nav-chevron${applicationServerOpen ? ' nav-chevron-open' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m7 10 5 5 5-5" /></svg></span>
              </button>
              {applicationServerOpen && <div className="nav-submenu" id="application-server-submenus" aria-label={`${applicationServer.menuName} submenu`}>
                {applicationServerSubmenus.map((submenu) => <NavLink className={({ isActive }) => `nav-submenu-item${isActive ? ' nav-submenu-item-active' : ''}`} to={submenu.routePath} key={submenu.submenuId}><SubmenuIcon code={submenu.submenuCode} />{submenu.submenuName}</NavLink>)}
              </div>}
            </div>
          )}
          {!serviceCatalog && navigationError && <span className="nav-load-error" role="status">Service Catalog unavailable</span>}
          <button className="nav-item nav-item-muted" type="button" disabled><span className="nav-icon">⌕</span><span>Knowledge base</span><span className="nav-soon">Soon</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-org"><span className="org-avatar">{initials(user?.displayName || user?.username)}</span><span><strong>{user?.displayName || user?.username}</strong><small>Signed in as</small></span></div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{myTicketDetail ? ({ INCIDENT: 'Incident', SERVICE_REQUEST: 'Service request', CHANGE: 'Change request' }[myTicketDetail[1]]) : location.pathname.startsWith('/approvals') ? 'Approvals' : location.pathname.startsWith('/my-tickets') ? 'My tickets' : location.pathname.endsWith('/new') ? 'Create user' : location.pathname.endsWith('/edit') ? 'Edit user' : activeSubmenu?.submenuName || 'Overview'}</strong></div>
          <div className="topbar-account">
            <NotificationBell onOpenTicket={openNotification} />
            <button className="sign-out-button" type="button" onClick={handleSignOut} disabled={isSigningOut} aria-label={isSigningOut ? 'Signing out' : 'Sign out'} title={isSigningOut ? 'Signing out' : 'Sign out'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M10 12h10m-4-4 4 4-4 4"/></svg>
            </button>
          </div>
        </header>

          <div className={`dashboard-content${location.pathname.startsWith('/approvals') || location.pathname.startsWith('/my-tickets') || location.pathname.startsWith('/administration/users') || location.pathname.startsWith('/ticket-master') || location.pathname.startsWith('/application-server') || serviceRequestDetail || myChangeDetail ? ' dashboard-content-wide' : ''}${location.pathname === '/administration/users' ? ' dashboard-content-users' : ''}${serviceRequestDetail ? ' dashboard-content-request-record' : ''}${myChangeDetail || activeSubmenu?.submenuCode === 'CHANGE_REQUEST' ? ' dashboard-content-change-request' : ''}${location.pathname.startsWith('/application-server') && activeSubmenu?.submenuCode !== 'APPLICATION_SERVERS' ? ' dashboard-content-onboarding' : ''}${location.pathname === '/administration/users/new' ? ' dashboard-content-user-create' : ''}`}>
          {location.pathname.startsWith('/approvals') ? (canAccessApprovals ? <ApprovalInboxPage /> : navigationLoaded ? <Navigate to="/dashboard" replace /> : <div className="approval-access-check">Checking approval access…</div>) : location.pathname.startsWith('/application-server') ? (applicationServer ? activeSubmenu?.submenuCode === 'CMDB_DASHBOARD' ? <CmdbDashboardPage /> : activeSubmenu?.submenuCode === 'APPLICATION_SERVERS' ? <ApplicationServersPage /> : <ApplicationOnboardingPage /> : navigationLoaded ? <Navigate to="/dashboard" replace /> : <div className="approval-access-check">Checking access…</div>) : location.pathname.startsWith('/administration/users') ? <UserManagementPage /> : myChangeDetail ? <ChangeRequestPage user={user} changeId={myChangeDetail[1]} /> : myTicketDetail ? <TicketDetailPage queue="MY_TICKETS" type={myTicketDetail[1]} ticketId={myTicketDetail[2]} basePath="/my-tickets" user={user} /> : location.pathname === '/my-tickets' ? <TicketPage user={user} /> : ticketDetail ? <TicketDetailPage queue={ticketDetail[1] === 'tickets-pool' ? 'TICKETS' : 'CHANGES'} type={ticketDetail[2]} ticketId={ticketDetail[3]} basePath={`/ticket-master/${ticketDetail[1]}`} user={user} /> : serviceRequestDetail ? <ServiceRequestPage user={user} requestId={serviceRequestDetail[1]} /> : activeSubmenu?.submenuCode === 'TICKETS_POOL' ? <TicketPoolPage queue="TICKETS" /> : activeSubmenu?.submenuCode === 'CHANGE_REQUEST_POOL' ? <TicketPoolPage queue="CHANGES" /> : activeSubmenu?.submenuCode === 'INCIDENT' ? <IncidentPage user={user} /> : activeSubmenu?.submenuCode === 'SERVICE_REQUEST' ? <ServiceRequestPage user={user} /> : activeSubmenu?.submenuCode === 'CHANGE_REQUEST' ? <ChangeRequestPage user={user} /> : activeSubmenu ? (
            <section className="catalog-workspace" aria-labelledby="catalog-workspace-title">
              <div className="dashboard-welcome">
                <div>
                  <p className="dashboard-eyebrow">{serviceCatalog?.menuName?.toUpperCase()}</p>
                  <h1 id="catalog-workspace-title">{activeSubmenu.submenuName}</h1>
                  <p>This workspace is ready for the {activeSubmenu.submenuName.toLowerCase()} workflow.</p>
                </div>
                <div className="welcome-art" aria-hidden="true"><span className="welcome-art-orbit" /><span className="welcome-art-star">✦</span><span className="welcome-art-tile"><span>IT</span></span></div>
              </div>
              <div className="catalog-empty-state">
                <span className="catalog-empty-icon" aria-hidden="true">{activeSubmenu.submenuCode === 'INCIDENT' ? '!' : activeSubmenu.submenuCode === 'CHANGE_REQUEST' ? '↗' : '＋'}</span>
                <h2>{activeSubmenu.submenuName} management</h2>
                  <p>This workspace is configured and ready for its intake and management tools.</p>
              </div>
            </section>
          ) : <>
          <div className="dashboard-welcome">
            <div>
              <p className="dashboard-eyebrow">YOUR SERVICE WORKSPACE</p>
              <h1>Good to see you, {firstName}.</h1>
              <p>Your IT service workspace is ready. Choose a service area to get started.</p>
            </div>
            <div className="welcome-art" aria-hidden="true"><span className="welcome-art-orbit" /><span className="welcome-art-star">✦</span><span className="welcome-art-tile"><span>IT</span></span></div>
          </div>

          {signOutError && <p className="dashboard-error" role="alert">{signOutError}</p>}

          <section className="access-section" aria-labelledby="access-title">
            <div className="section-heading"><div><h2 id="access-title">Your workspace</h2><p>Quick access to the tools you’ll use most.</p></div><span className="section-count">{modules.length} areas</span></div>
            <div className="module-grid">
              {modules.map((module) => (
                <article className={`module-card${module.title === 'My tickets' ? ' module-card-clickable' : ''}`} key={module.title} onClick={module.title === 'My tickets' ? () => navigate('/my-tickets') : undefined} onKeyDown={module.title === 'My tickets' ? (event) => { if (event.key === 'Enter' || event.key === ' ') navigate('/my-tickets') } : undefined} role={module.title === 'My tickets' ? 'link' : undefined} tabIndex={module.title === 'My tickets' ? 0 : undefined}>
                  <div className={`module-icon module-icon-${module.tone}`}>{module.icon}</div>
                  <div className="module-card-copy"><h3>{module.title}</h3><p>{module.description}</p></div>
                  <span className="module-card-footer"><span className="module-status-dot" />{module.title === 'My tickets' ? 'Open ticket register' : 'Available in a future update'}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="account-section" aria-labelledby="account-title">
            <div className="section-heading"><div><h2 id="account-title">Your account</h2><p>Access assigned to your ITSM profile.</p></div></div>
            <div className="account-card">
              <div className="account-card-identity"><span className="account-card-avatar">{initials(user?.displayName || user?.username)}</span><span><strong>{user?.displayName || user?.username}</strong><small>{user?.email || user?.username}</small></span></div>
              <div className="role-list" aria-label="Assigned roles">
                {(user?.roles || []).length > 0 ? user.roles.map((role) => <span className="role-chip" key={role}>{readableRole(role)}</span>) : <span className="role-chip">No roles assigned</span>}
              </div>
            </div>
          </section>
          </>}

          <footer className="dashboard-footer"><span>ITSM · IT Service Management</span><span>Secure service workspace</span></footer>
        </div>
      </section>
    </main>
  )
}
