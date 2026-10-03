import { notifyToast } from '../components/Toast.jsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import './TicketPoolPage.css'

const nice = (value = '') => String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (part) => part.toUpperCase())
const dateText = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

async function readApi(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load the ticket pool.')
  return body
}

function remaining(seconds) {
  if (seconds == null) return '—'
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  return seconds < 0 ? `Breached · ${hours}h ${minutes}m` : `${hours}h ${minutes}m left`
}

export default function TicketPoolPage({ queue }) {
  const navigate = useNavigate()
  const [scope, setScope] = useState('GROUP')
  const [data, setData] = useState({ tickets: [], refreshedAt: null })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(0)

  const load = useCallback(async (quiet = false, signal) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ queue, scope })
      const result = await readApi(await fetch(`/api/ticket-pool?${params}`, { credentials: 'include', signal }))
      setData(result)
      setLastRefresh(Date.now())
    } catch (reason) {
      if (reason.name !== 'AbortError') { setError(reason.message); notifyToast(reason.message, 'error', 'Ticket pool unavailable') }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [queue, scope])

  useEffect(() => {
    const controller = new AbortController()
    load(false, controller.signal)
    const timer = window.setInterval(() => load(true), 20000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [load])

  const tickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data.tickets || []
    return (data.tickets || []).filter((ticket) => [ticket.number, ticket.subject, ticket.typeCode, ticket.status, ticket.priority, ticket.requestedBy, ticket.assignedGroup, ticket.assignedTo].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [data.tickets, search])

  const isChangePool = queue === 'CHANGES'
  const title = isChangePool ? 'Change Request Pool' : 'Tickets Pool'
  const detailPath = isChangePool ? '/ticket-master/change-request-pool' : '/ticket-master/tickets-pool'

  function openTicket(ticket) {
    navigate(`${detailPath}/${ticket.type}/${ticket.id}`)
  }

  return <section className="pool-page">
    <header className={`pool-hero${isChangePool ? ' pool-hero-change' : ''}`}>
      <div className="pool-hero-copy"><span className="pool-eyebrow">SERVICE OPERATIONS · TEAM WORK QUEUE</span><h1>{title}</h1><p>{isChangePool ? 'Review changes assigned to your support groups or directly to you.' : 'Work incidents and service requests routed to your support groups or directly to you.'}</p></div>
      <div className="pool-hero-stat"><span className="pool-hero-symbol">{isChangePool ? '↗' : '▤'}</span><div><strong>{tickets.length}</strong><small>{scope === 'GROUP' ? 'in this group queue' : 'assigned to you'}</small></div></div>
    </header>

    {error && <div className="pool-alert" role="alert"><span>!</span><div><strong>Could not refresh this queue</strong><p>{error}</p></div><button type="button" onClick={() => load()}>Try again</button></div>}

    <section className="pool-board" aria-label={title}>
      <div className="pool-toolbar">
        <div className="pool-tabs" role="tablist" aria-label="Assignment scope">
          <button type="button" role="tab" aria-selected={scope === 'GROUP'} className={scope === 'GROUP' ? 'active' : ''} onClick={() => setScope('GROUP')}><span className="pool-tab-icon pool-tab-icon-group">◎</span><span><b>My Groups</b><small>Tickets assigned to my groups</small></span></button>
          <button type="button" role="tab" aria-selected={scope === 'MINE'} className={scope === 'MINE' ? 'active' : ''} onClick={() => setScope('MINE')}><span className="pool-tab-icon pool-tab-icon-mine">♙</span><span><b>Assigned to Me</b><small>Tickets assigned directly to me</small></span></button>
        </div>
        <div className="pool-tools"><label className="pool-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, subject, assignee…" /></label><button type="button" className="pool-refresh" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh queue">{refreshing ? '↻' : '⟳'} <span>Refresh</span></button></div>
      </div>

      <div className="pool-list-meta"><div><strong>{scope === 'GROUP' ? 'Group queue' : 'Your assignments'}</strong><span>{loading ? 'Loading latest tickets…' : `${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`}</span></div><small>{lastRefresh ? `Updated ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(lastRefresh)} · refreshes every 20 seconds` : 'Refreshing automatically'}</small></div>

      <div className="pool-table-wrap"><table className="pool-table"><thead><tr><th>Ticket</th><th>Type</th><th>Priority</th><th>Status</th><th>Requested by</th><th>Assigned group</th><th>Assigned to</th><th>{isChangePool ? 'Planned start' : 'SLA target'}</th><th>Last updated</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="9"><div className="pool-state"><span className="pool-spinner" />Loading your queue…</div></td></tr> : tickets.length === 0 ? <tr><td colSpan="9"><div className="pool-state pool-empty"><span className="pool-empty-icon">✓</span><strong>{search ? 'No matching tickets' : scope === 'GROUP' ? 'Your group queue is clear' : 'Nothing is assigned directly to you'}</strong><p>{search ? 'Try a different search.' : 'New assignments will appear here automatically.'}</p></div></td></tr> : tickets.map((ticket) => <tr key={`${ticket.type}:${ticket.id}`} tabIndex="0" onClick={() => openTicket(ticket)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTicket(ticket) } }} aria-label={`Open ${ticket.number}: ${ticket.subject}`}>
          <td><button className="pool-ticket-number" type="button" onClick={(event) => { event.stopPropagation(); openTicket(ticket) }}>{ticket.number}<span aria-hidden="true">↗</span></button><small className="pool-subject">{ticket.subject}</small></td>
          <td><span className={`pool-type pool-type-${ticket.typeCode.toLowerCase()}`}>{ticket.typeCode}</span></td>
          <td><span className={`pool-priority pool-priority-${String(ticket.priority).toLowerCase()}`}><b>{ticket.priority}</b><small>{{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[ticket.priority] || ''}</small></span></td>
          <td><span className={`pool-status pool-status-${String(ticket.status).toLowerCase()}`}>{nice(ticket.status)}</span></td>
          <td>{ticket.requestedBy || '—'}</td><td>{ticket.assignedGroup || <span className="pool-muted">Unassigned</span>}</td><td>{ticket.assignedTo || <span className="pool-muted">Unassigned</span>}</td>
          <td>{isChangePool ? dateText(ticket.plannedStart) : <span className={ticket.slaRemainingSeconds < 0 ? 'pool-sla pool-sla-breached' : ticket.slaRemainingSeconds < 3600 ? 'pool-sla pool-sla-warning' : 'pool-sla'}>{remaining(ticket.slaRemainingSeconds)}</span>}</td><td className="pool-updated">{dateText(ticket.updatedAt)}</td>
        </tr>)}</tbody></table></div>
      <footer className="pool-footer"><span>Tickets are scoped to your active support group memberships and assignments.</span><span>Live refresh · 20 sec</span></footer>
    </section>
  </section>
}
