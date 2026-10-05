import { notifyToast } from '../components/Toast.jsx'
import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import './TicketPage.css'

const TYPES = [{ key: 'ALL', label: 'All Tickets' }, { key: 'INC', label: 'Incidents' }, { key: 'REQ', label: 'Service Requests' }, { key: 'CHG', label: 'Changes' }]
const nice = (value = '') => value === 'AWAITING_USER_RESPONSE' ? 'Awaiting for User Response' : String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (part) => part.toUpperCase())

async function api(response) {
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || 'Unable to load tickets. Please try again.')
  return result
}

function slaText(seconds) {
  if (seconds == null) return '—'
  if (seconds < 0) return `Breached · ${slaDuration(Math.abs(seconds))}`
  return `${slaDuration(seconds)} left`
}
function slaDuration(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return days ? `${days}d ${String(hours).padStart(2, '0')}h` : `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`
}
function displayDate(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
function ticketKey(ticket) { return `${ticket.type}:${ticket.id}` }

function TicketFilterIcon({ toolbar = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{toolbar ? <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="18" r="1.5"/></> : <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>}</svg>
}

function TicketColumnFilter({ label, value = '', choices, inputType = 'text', onApply, onClear }) {
  const [draft, setDraft] = useState(value)
  return <details className={`ticket-column-filter${value ? ' is-filtered' : ''}`} onToggle={(event) => { if (event.currentTarget.open) setDraft(value) }}>
    <summary aria-label={`Filter ${label}`} title={`Filter ${label}`}><TicketFilterIcon /></summary>
    <div className="ticket-column-filter-popover"><strong>Filter {label}</strong>
      <label><span>Value</span>{choices ? <select value={draft} onChange={(event) => setDraft(event.target.value)}><option value="">Choose a value</option>{choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select> : <input type={inputType} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} onKeyDown={(event) => { if (event.key === 'Enter' && draft.trim()) { onApply(draft.trim()); event.currentTarget.closest('details').open = false } }} />}</label>
      <div className="ticket-column-filter-actions"><button type="button" onClick={(event) => { onClear(); setDraft(''); event.currentTarget.closest('details').open = false }}>Clear</button><button type="button" disabled={!draft.trim()} onClick={(event) => { onApply(draft.trim()); event.currentTarget.closest('details').open = false }}>Filter</button></div>
    </div>
  </details>
}

export default function TicketPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ticketId = searchParams.get('ticketId') || ''
  const routeType = searchParams.get('ticketType') || 'ALL'
  const initialType = routeType === 'INCIDENT' ? 'INC' : routeType === 'SERVICE_REQUEST' ? 'REQ' : routeType === 'CHANGE' ? 'CHG' : routeType
  const [data, setData] = useState({ content: [], counts: {}, statuses: [], groups: [], totalElements: 0, totalPages: 0, page: 0, size: 25 })
  const [type, setType] = useState(initialType)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [assignedGroup, setAssignedGroup] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [updatedFrom, setUpdatedFrom] = useState('')
  const [updatedTo, setUpdatedTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const currentRows = data.content || []

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), size: String(size), type })
      if (ticketId) params.set('ticketId', ticketId)
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      if (assignedGroup) params.set('assignedGroup', assignedGroup)
      if (assignedTo.trim()) params.set('assignedTo', assignedTo.trim())
      if (requestedBy.trim()) params.set('requestedBy', requestedBy.trim())
      if (search.trim()) params.set('search', search.trim())
      if (createdFrom) params.set('createdFrom', createdFrom)
      if (createdTo) params.set('createdTo', createdTo)
      if (updatedFrom) params.set('updatedFrom', updatedFrom)
      if (updatedTo) params.set('updatedTo', updatedTo)
      setLoading(true); setError('')
      fetch(`/api/tickets?${params}`, { credentials: 'include', signal: controller.signal }).then(api).then(setData).catch((reason) => { if (reason.name !== 'AbortError') { setError(reason.message); notifyToast(reason.message, 'error', 'Tickets unavailable') } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [page, size, type, ticketId, status, priority, assignedGroup, assignedTo, requestedBy, createdFrom, createdTo, updatedFrom, updatedTo, search])

  useEffect(() => {
    if (!ticketId || !data.content?.length) return
    const target = data.content.find((ticket) => String(ticket.id) === String(ticketId))
    if (target) setExpanded(ticketKey(target))
  }, [data.content, ticketId])

  function resetFilters() { setStatus(''); setPriority(''); setAssignedGroup(''); setAssignedTo(''); setRequestedBy(''); setCreatedFrom(''); setCreatedTo(''); setUpdatedFrom(''); setUpdatedTo(''); setSearch(''); setPage(0) }
  function workspace(typeCode) { navigate(typeCode === 'INC' ? '/service-catalog/incident' : typeCode === 'REQ' ? '/service-catalog/service-request' : '/service-catalog/change-request') }
  function openTicket(ticket) { navigate(`/my-tickets/${ticket.type}/${ticket.id}`) }

  return <section className="ticket-page">
    <header className="ticket-page-hero"><div><span className="ticket-eyebrow">WORKSPACE / SERVICE OPERATIONS</span><h1>My Tickets</h1><p>A single view of incidents, service requests, and planned changes.</p></div><span className="ticket-record-count"><strong>{data.totalElements}</strong> {data.totalElements === 1 ? 'record' : 'records'}</span></header>
    {error && <div className="ticket-alert" role="alert">{error}</div>}
    <section className="ticket-register" aria-label="Ticket register">
      <div className="ticket-table-wrap"><table className="ticket-table"><thead><tr><th><div className="ticket-th-content"><span>Number</span><TicketColumnFilter label="Number" value={search} onApply={(value) => { setSearch(value); setPage(0) }} onClear={() => { setSearch(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Type</span><TicketColumnFilter label="Type" value={type === 'ALL' ? '' : type} choices={TYPES.filter((item) => item.key !== 'ALL').map((item) => ({ value: item.key, label: item.label }))} onApply={(value) => { setType(value); setPage(0) }} onClear={() => { setType('ALL'); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Subject</span><TicketColumnFilter label="Subject" value={search} onApply={(value) => { setSearch(value); setPage(0) }} onClear={() => { setSearch(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Priority</span><TicketColumnFilter label="Priority" value={priority} choices={['P1', 'P2', 'P3', 'P4'].map((item) => ({ value: item, label: `${item} · ${{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[item]}` }))} onApply={(value) => { setPriority(value); setPage(0) }} onClear={() => { setPriority(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Status</span><TicketColumnFilter label="Status" value={status} choices={data.statuses.map((item) => ({ value: item, label: nice(item) }))} onApply={(value) => { setStatus(value); setPage(0) }} onClear={() => { setStatus(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Assigned Group</span><TicketColumnFilter label="Assigned group" value={assignedGroup} choices={data.groups.map((group) => ({ value: group.groupName, label: group.groupName }))} onApply={(value) => { setAssignedGroup(value); setPage(0) }} onClear={() => { setAssignedGroup(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Assigned To</span><TicketColumnFilter label="Assigned to" value={assignedTo} onApply={(value) => { setAssignedTo(value); setPage(0) }} onClear={() => { setAssignedTo(''); setPage(0) }}/></div></th><th>SLA / Schedule</th><th><div className="ticket-th-content"><span>Updated</span><TicketColumnFilter label="Updated" value={updatedFrom && updatedFrom === updatedTo ? updatedFrom : ''} inputType="date" onApply={(value) => { setUpdatedFrom(value); setUpdatedTo(value); setPage(0) }} onClear={() => { setUpdatedFrom(''); setUpdatedTo(''); setPage(0) }}/></div></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="9"><div className="ticket-table-state"><span className="ticket-spinner" />Loading tickets…</div></td></tr> : currentRows.length === 0 ? <tr><td colSpan="9"><div className="ticket-table-state ticket-table-empty">No tickets match these filters.</div></td></tr> : currentRows.map((ticket) => <Fragment key={ticketKey(ticket)}><tr className={`ticket-row ticket-row-clickable ticket-row-${ticket.typeCode.toLowerCase()}`} onClick={() => openTicket(ticket)}><td><button className="ticket-number ticket-number-link" type="button" onClick={(event) => { event.stopPropagation(); openTicket(ticket) }}>{ticket.number}</button></td><td><span className={`ticket-type ticket-type-${ticket.typeCode.toLowerCase()}`}>{ticket.typeCode}</span></td><td className="ticket-subject" title={ticket.subject}>{ticket.subject}</td><td><span className={`ticket-priority ticket-priority-${String(ticket.priority).toLowerCase()}`}><b>{ticket.priority}</b><small>{{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[ticket.priority] || ''}</small></span></td><td><span className={`ticket-status ticket-status-${ticket.status.toLowerCase()}`}>{nice(ticket.status)}</span></td><td>{ticket.assignedGroup || <span className="ticket-muted">Unassigned</span>}</td><td>{ticket.assignedTo || (ticket.type === 'CHANGE' ? '—' : <span className="ticket-muted">Unassigned</span>)}</td><td>{ticket.type === 'CHANGE' ? ticket.plannedStart ? <span className="ticket-schedule">◷ {new Date(ticket.plannedStart).toLocaleString()}</span> : 'Not scheduled' : <span className={ticket.slaRemainingSeconds < 0 ? 'ticket-sla-breached' : ticket.slaRemainingSeconds < 3600 ? 'ticket-sla-warning' : 'ticket-sla'}>{ticket.slaRemainingSeconds < 0 && '⚠ '}{slaText(ticket.slaRemainingSeconds)}</span>}</td><td className="ticket-date">{displayDate(ticket.updatedAt)}</td></tr>
          {expanded === ticketKey(ticket) && <tr className="ticket-expanded-row" key={`${ticketKey(ticket)}-detail`}><td colSpan="9"><div className="ticket-expanded"><div><small>Requested by</small><strong>{ticket.requestedBy || '—'}</strong></div><div><small>Created</small><strong>{displayDate(ticket.createdAt)}</strong></div><div><small>Updated</small><strong>{displayDate(ticket.updatedAt)}</strong></div>{ticket.plannedStart && <div><small>Planned start</small><strong>{displayDate(ticket.plannedStart)}</strong></div>}<button type="button" onClick={() => workspace(ticket.typeCode)}>Open {ticket.typeCode} workspace →</button></div></td></tr>}
        </Fragment>)}</tbody></table></div>
      <footer className="ticket-pagination"><span>Showing {data.totalElements ? page * size + 1 : 0}–{Math.min((page + 1) * size, data.totalElements)} of {data.totalElements}</span><div><label>Rows <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><button type="button" disabled={page <= 0 || loading} onClick={() => setPage((p) => p - 1)}>‹</button><span>Page {data.totalPages ? page + 1 : 0} of {data.totalPages}</span><button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>›</button></div></footer>
    </section>
  </section>
}
