import { notifyToast } from '../components/Toast.jsx'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import './TicketPage.css'

const TYPES = [{ key: 'ALL', label: 'All Tickets' }, { key: 'INC', label: 'Incidents' }, { key: 'REQ', label: 'Service Requests' }, { key: 'CHG', label: 'Changes' }]
const nice = (value = '') => value === 'AWAITING_USER_RESPONSE' ? 'Awaiting for User Response' : String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (part) => part.toUpperCase())
const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

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

export default function TicketPage({ user }) {
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
  const [notice, setNotice] = useState('')
  const [selection, setSelection] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [assignGroup, setAssignGroup] = useState('')
  const [assignAgent, setAssignAgent] = useState('')
  const [assignmentGroups, setAssignmentGroups] = useState([])
  const [assignmentOptionsLoading, setAssignmentOptionsLoading] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const roles = user?.roles || []
  const canAssign = roles.some((role) => ['SERVICE_DESK_AGENT', 'TEAM_LEAD', 'IT_MANAGER', 'CHANGE_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role))
  const selected = useMemo(() => Object.values(selection), [selection])
  const selectedTypes = [...new Set(selected.map((ticket) => ticket.type))]
  const currentRows = data.content || []
  const pageAllSelected = currentRows.length > 0 && currentRows.every((ticket) => Boolean(selection[ticketKey(ticket)]))
  const allowedStatuses = selectedTypes.length === 1 && selectedTypes[0] === 'INCIDENT'
    ? ['ASSIGNED', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']
    : selectedTypes.length === 1 && selectedTypes[0] === 'SERVICE_REQUEST'
      ? ['ASSIGNED', 'IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR', 'FULFILLED', 'COMPLETED', 'CLOSED', 'CANCELLED'] : []
  const activeGroup = assignmentGroups.find((group) => String(group.groupId) === String(assignGroup))

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
  }, [page, size, type, ticketId, status, priority, assignedGroup, assignedTo, requestedBy, createdFrom, createdTo, updatedFrom, updatedTo, search, refreshKey])

  useEffect(() => {
    if (!ticketId || !data.content?.length) return
    const target = data.content.find((ticket) => String(ticket.id) === String(ticketId))
    if (target) setExpanded(ticketKey(target))
  }, [data.content, ticketId])

  function resetFilters() { setStatus(''); setPriority(''); setAssignedGroup(''); setAssignedTo(''); setRequestedBy(''); setCreatedFrom(''); setCreatedTo(''); setUpdatedFrom(''); setUpdatedTo(''); setSearch(''); setPage(0); setSelection({}) }
  function toggleTicket(ticket) { const key = ticketKey(ticket); setSelection((old) => { const next = { ...old }; if (next[key]) delete next[key]; else next[key] = ticket; return next }) }
  function togglePage() { setSelection((old) => { const next = { ...old }; if (pageAllSelected) currentRows.forEach((ticket) => delete next[ticketKey(ticket)]); else currentRows.forEach((ticket) => { next[ticketKey(ticket)] = ticket }); return next }) }
  function exportRows(rows) {
    if (!rows.length) return
    const columns = ['Number', 'Type', 'Subject', 'Priority', 'Status', 'Requested By', 'Assigned Group', 'Assigned To', 'SLA Remaining', 'Created', 'Updated']
    const lines = [columns.map(escapeCsv).join(','), ...rows.map((row) => [row.number, row.typeCode, row.subject, row.priority, nice(row.status), row.requestedBy, row.assignedGroup, row.assignedTo, slaText(row.slaRemainingSeconds), displayDate(row.createdAt), displayDate(row.updatedAt)].map(escapeCsv).join(','))]
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })); link.download = 'itsm-tickets.csv'; link.click(); URL.revokeObjectURL(link.href); notifyToast(`${rows.length} ticket${rows.length === 1 ? '' : 's'} exported to CSV.`, 'success', 'Export ready')
  }
  async function openAssignmentDialog() {
    setAssignmentOptionsLoading(true)
    try {
      const groups = await api(await fetch('/api/tickets/assignment-options', { credentials: 'include' }))
      setAssignmentGroups(groups)
      setAssignOpen(true)
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Assignment options unavailable') }
    finally { setAssignmentOptionsLoading(false) }
  }
  async function assignSelected(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const result = await api(await fetch('/api/tickets/bulk/assignment', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets: selected.map(({ id, type }) => ({ id, type })), assignedGroupId: assignGroup ? Number(assignGroup) : null, assignedAgentId: assignAgent ? Number(assignAgent) : null }) }))
      setNotice(`${result.updated} ${result.updated === 1 ? 'ticket was' : 'tickets were'} assigned.`); notifyToast(`${result.updated} ${result.updated === 1 ? 'ticket was' : 'tickets were'} assigned successfully.`, 'success', 'Tickets assigned'); setSelection({}); setAssignOpen(false); setAssignGroup(''); setAssignAgent(''); setRefreshKey((value) => value + 1)
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Bulk assignment failed') } finally { setSaving(false) }
  }
  async function updateStatuses(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const result = await api(await fetch('/api/tickets/bulk/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets: selected.map(({ id, type }) => ({ id, type })), status: bulkStatus }) }))
      setNotice(`${result.updated} ${result.updated === 1 ? 'ticket status was' : 'ticket statuses were'} updated.`); notifyToast(`${result.updated} ${result.updated === 1 ? 'ticket status was' : 'ticket statuses were'} updated successfully.`, 'success', 'Statuses updated'); setSelection({}); setStatusOpen(false); setBulkStatus(''); setRefreshKey((value) => value + 1)
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Bulk status update failed') } finally { setSaving(false) }
  }
  function workspace(typeCode) { navigate(typeCode === 'INC' ? '/service-catalog/incident' : typeCode === 'REQ' ? '/service-catalog/service-request' : '/service-catalog/change-request') }
  function openTicket(ticket) { navigate(`/my-tickets/${ticket.type}/${ticket.id}`) }

  return <section className="ticket-page">
    <header className="ticket-page-hero"><div><span className="ticket-eyebrow">WORKSPACE / SERVICE OPERATIONS</span><h1>My Tickets</h1><p>A single view of incidents, service requests, and planned changes.</p></div><span className="ticket-record-count"><strong>{data.totalElements}</strong> {data.totalElements === 1 ? 'record' : 'records'}</span></header>
    {error && <div className="ticket-alert" role="alert">{error}</div>}{notice && <div className="ticket-notice" role="status">{notice}</div>}
    <section className="ticket-register" aria-label="Ticket register">
      {selected.length > 0 && <div className="ticket-bulk-bar"><div><strong>{selected.length} selected</strong><small>{selectedTypes.length === 1 ? selectedTypes[0].replace('_', ' ').toLowerCase() : 'multiple ticket types'}</small></div>
        {canAssign && <button type="button" onClick={openAssignmentDialog} disabled={assignmentOptionsLoading}>{assignmentOptionsLoading ? 'Loading groups…' : '♙ Assign'}</button>}
        <button type="button" disabled={!allowedStatuses.length || !canAssign} title={selectedTypes.includes('CHANGE') ? 'Change workflow actions are handled one change at a time.' : !canAssign ? 'IT staff permission is required.' : ''} onClick={() => setStatusOpen(true)}>↻ Change Status</button>
        <button type="button" disabled title="Priority is calculated from impact, urgency, or the service catalog policy.">Change Priority</button>
        <button type="button" onClick={() => exportRows(selected)}>↓ Export</button>
        <button type="button" className="ticket-clear-selection" onClick={() => setSelection({})}>Clear selection</button>
      </div>}
      <div className="ticket-table-wrap"><table className="ticket-table"><thead><tr><th className="ticket-check-col"><input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select all tickets on this page" /></th><th><div className="ticket-th-content"><span>Number</span><TicketColumnFilter label="Number" value={search} onApply={(value) => { setSearch(value); setPage(0) }} onClear={() => { setSearch(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Type</span><TicketColumnFilter label="Type" value={type === 'ALL' ? '' : type} choices={TYPES.filter((item) => item.key !== 'ALL').map((item) => ({ value: item.key, label: item.label }))} onApply={(value) => { setType(value); setPage(0) }} onClear={() => { setType('ALL'); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Subject</span><TicketColumnFilter label="Subject" value={search} onApply={(value) => { setSearch(value); setPage(0) }} onClear={() => { setSearch(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Priority</span><TicketColumnFilter label="Priority" value={priority} choices={['P1', 'P2', 'P3', 'P4'].map((item) => ({ value: item, label: `${item} · ${{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[item]}` }))} onApply={(value) => { setPriority(value); setPage(0) }} onClear={() => { setPriority(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Status</span><TicketColumnFilter label="Status" value={status} choices={data.statuses.map((item) => ({ value: item, label: nice(item) }))} onApply={(value) => { setStatus(value); setPage(0) }} onClear={() => { setStatus(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Assigned Group</span><TicketColumnFilter label="Assigned group" value={assignedGroup} choices={data.groups.map((group) => ({ value: group.groupName, label: group.groupName }))} onApply={(value) => { setAssignedGroup(value); setPage(0) }} onClear={() => { setAssignedGroup(''); setPage(0) }}/></div></th><th><div className="ticket-th-content"><span>Assigned To</span><TicketColumnFilter label="Assigned to" value={assignedTo} onApply={(value) => { setAssignedTo(value); setPage(0) }} onClear={() => { setAssignedTo(''); setPage(0) }}/></div></th><th>SLA / Schedule</th><th><div className="ticket-th-content"><span>Updated</span><TicketColumnFilter label="Updated" value={updatedFrom && updatedFrom === updatedTo ? updatedFrom : ''} inputType="date" onApply={(value) => { setUpdatedFrom(value); setUpdatedTo(value); setPage(0) }} onClear={() => { setUpdatedFrom(''); setUpdatedTo(''); setPage(0) }}/></div></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="10"><div className="ticket-table-state"><span className="ticket-spinner" />Loading tickets…</div></td></tr> : currentRows.length === 0 ? <tr><td colSpan="10"><div className="ticket-table-state ticket-table-empty">No tickets match these filters.</div></td></tr> : currentRows.map((ticket) => <Fragment key={ticketKey(ticket)}><tr className={`ticket-row ticket-row-clickable ticket-row-${ticket.typeCode.toLowerCase()}${selection[ticketKey(ticket)] ? ' ticket-row-selected' : ''}`} onClick={() => openTicket(ticket)}><td className="ticket-check-col" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={Boolean(selection[ticketKey(ticket)])} onChange={() => toggleTicket(ticket)} aria-label={`Select ${ticket.number}`} /></td><td><button className="ticket-number ticket-number-link" type="button" onClick={(event) => { event.stopPropagation(); openTicket(ticket) }}>{ticket.number}</button></td><td><span className={`ticket-type ticket-type-${ticket.typeCode.toLowerCase()}`}>{ticket.typeCode}</span></td><td className="ticket-subject" title={ticket.subject}>{ticket.subject}</td><td><span className={`ticket-priority ticket-priority-${String(ticket.priority).toLowerCase()}`}><b>{ticket.priority}</b><small>{{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[ticket.priority] || ''}</small></span></td><td><span className={`ticket-status ticket-status-${ticket.status.toLowerCase()}`}>{nice(ticket.status)}</span></td><td>{ticket.assignedGroup || <span className="ticket-muted">Unassigned</span>}</td><td>{ticket.assignedTo || (ticket.type === 'CHANGE' ? '—' : <span className="ticket-muted">Unassigned</span>)}</td><td>{ticket.type === 'CHANGE' ? ticket.plannedStart ? <span className="ticket-schedule">◷ {new Date(ticket.plannedStart).toLocaleString()}</span> : 'Not scheduled' : <span className={ticket.slaRemainingSeconds < 0 ? 'ticket-sla-breached' : ticket.slaRemainingSeconds < 3600 ? 'ticket-sla-warning' : 'ticket-sla'}>{ticket.slaRemainingSeconds < 0 && '⚠ '}{slaText(ticket.slaRemainingSeconds)}</span>}</td><td className="ticket-date">{displayDate(ticket.updatedAt)}</td></tr>
          {expanded === ticketKey(ticket) && <tr className="ticket-expanded-row" key={`${ticketKey(ticket)}-detail`}><td colSpan="10"><div className="ticket-expanded"><div><small>Requested by</small><strong>{ticket.requestedBy || '—'}</strong></div><div><small>Created</small><strong>{displayDate(ticket.createdAt)}</strong></div><div><small>Updated</small><strong>{displayDate(ticket.updatedAt)}</strong></div>{ticket.plannedStart && <div><small>Planned start</small><strong>{displayDate(ticket.plannedStart)}</strong></div>}<button type="button" onClick={() => workspace(ticket.typeCode)}>Open {ticket.typeCode} workspace →</button></div></td></tr>}
        </Fragment>)}</tbody></table></div>
      <footer className="ticket-pagination"><span>Showing {data.totalElements ? page * size + 1 : 0}–{Math.min((page + 1) * size, data.totalElements)} of {data.totalElements}</span><div><label>Rows <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><button type="button" disabled={page <= 0 || loading} onClick={() => setPage((p) => p - 1)}>‹</button><span>Page {data.totalPages ? page + 1 : 0} of {data.totalPages}</span><button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>›</button></div></footer>
    </section>
    {assignOpen && <div className="ticket-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAssignOpen(false) }}><form className="ticket-modal" onSubmit={assignSelected}><button className="ticket-modal-close" type="button" aria-label="Close" onClick={() => setAssignOpen(false)}>×</button><p className="ticket-modal-eyebrow">BULK ACTION · {selected.length} TICKETS</p><h2>Assign selected tickets</h2><label><span>Assigned group</span><select value={assignGroup} onChange={(e) => { setAssignGroup(e.target.value); setAssignAgent('') }}><option value="">Unassigned</option>{assignmentGroups.map((group) => <option value={group.groupId} key={group.groupId}>{group.groupName}</option>)}</select></label><label><span>Assigned to</span><select value={assignAgent} onChange={(e) => setAssignAgent(e.target.value)} disabled={!assignGroup}><option value="">Unassigned</option>{(activeGroup?.agents || []).map((agent) => <option value={agent.userId} key={agent.userId}>{agent.displayName}</option>)}</select></label><div className="ticket-modal-footer"><button className="ticket-modal-cancel" type="button" onClick={() => setAssignOpen(false)}>Cancel</button><button disabled={saving}>{saving ? 'Assigning…' : 'Assign'}</button></div></form></div>}
    {statusOpen && <div className="ticket-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setStatusOpen(false) }}><form className="ticket-modal" onSubmit={updateStatuses}><button className="ticket-modal-close" type="button" aria-label="Close" onClick={() => setStatusOpen(false)}>×</button><p className="ticket-modal-eyebrow">BULK ACTION · {selected.length} TICKETS</p><h2>Change status</h2><p className="ticket-modal-copy">Only incidents and service requests can be updated here. Change approvals and implementation remain individual actions.</p><label><span>New status</span><select value={bulkStatus} required onChange={(e) => setBulkStatus(e.target.value)}><option value="">Choose a permitted status</option>{allowedStatuses.map((item) => <option value={item} key={item}>{nice(item)}</option>)}</select></label><div className="ticket-modal-footer"><button className="ticket-modal-cancel" type="button" onClick={() => setStatusOpen(false)}>Cancel</button><button disabled={saving || !bulkStatus}>{saving ? 'Updating…' : 'Update status'}</button></div></form></div>}
  </section>
}
