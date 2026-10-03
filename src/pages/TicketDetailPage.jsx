import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import Loader from '../components/Loader.jsx'
import './TicketDetailPage.css'

const LABELS = {
  incident: 'Incident',
  service_request: 'Service Request',
  change: 'Change Request',
}
const excludedFields = new Set(['incidentId', 'requestId', 'changeId', 'ticketNumber', 'requestNumber', 'changeNumber', 'categoryId', 'subcategoryId', 'assignedGroupId', 'assignedAgentId', 'activity', 'attachments', 'history', 'approvals'])
const label = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (part) => part.toUpperCase())

async function readApi(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load this ticket.')
  return body
}

function formatValue(key, value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : Object.values(entry).filter(Boolean).join(' · ')).join(', ') || '—'
  if (typeof value === 'object') return Object.entries(value).map(([name, content]) => `${label(name)}: ${content}`).join(' · ')
  if (/At$|Date$|Start$|End$|Until$/.test(key) && !Number.isNaN(Date.parse(value))) return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  return String(value).replaceAll('_', ' ')
}

const INCIDENT_NEXT = { NEW: ['ASSIGNED'], ASSIGNED: ['IN_PROGRESS'], IN_PROGRESS: ['AWAITING_USER_RESPONSE'], PENDING: ['RESOLVED'], RESOLVED: ['CLOSED'] }
const REQUEST_NEXT = { NEW: ['ASSIGNED', 'CANCELLED'], APPROVED: ['ASSIGNED', 'CANCELLED'], ASSIGNED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['PENDING_USER', 'PENDING_VENDOR', 'FULFILLED', 'CANCELLED'], PENDING_USER: ['IN_PROGRESS', 'CANCELLED'], PENDING_VENDOR: ['IN_PROGRESS', 'CANCELLED'], FULFILLED: ['COMPLETED'], COMPLETED: ['CLOSED'] }
const CHANGE_NEXT = { ASSESSMENT: ['PENDING_APPROVAL', 'CANCELLED'], APPROVED: ['SCHEDULED', 'CANCELLED'], SCHEDULED: ['IMPLEMENTATION', 'CANCELLED'], IMPLEMENTATION: ['VALIDATION', 'FAILED', 'ROLLBACK'], VALIDATION: ['COMPLETED', 'FAILED', 'ROLLBACK'], COMPLETED: ['CLOSED'], FAILED: ['ROLLBACK'], ROLLBACK: ['CLOSED'] }
const STAFF_ROLES = ['SERVICE_DESK_AGENT', 'TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN']
const CHANGE_STAFF_ROLES = ['CHANGE_MANAGER', 'TEAM_LEAD', 'IT_MANAGER', 'CAB_MEMBER', 'ADMIN', 'SUPER_ADMIN']
const APPROVER_ROLES = ['TEAM_LEAD', 'IT_MANAGER', 'CAB_MEMBER', 'CHANGE_MANAGER', 'ADMIN', 'SUPER_ADMIN']
const REQUEST_APPROVER_ROLES = ['TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN']
const IMPACT_URGENCY_VALUES = ['HIGH', 'MEDIUM', 'LOW']

function incidentPriority(impact, urgency) {
  if (impact === 'HIGH' && urgency === 'HIGH') return 'P1'
  if ((impact === 'HIGH' && urgency === 'MEDIUM') || (impact === 'MEDIUM' && urgency === 'HIGH')) return 'P2'
  if (impact === 'LOW' && urgency === 'LOW') return 'P4'
  return 'P3'
}

export default function TicketDetailPage({ queue, type, ticketId, basePath, user }) {
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [groups, setGroups] = useState([])
  const [incidentOptions, setIncidentOptions] = useState({ categories: [] })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState(null)
  const [draft, setDraft] = useState(null)
  const [incidentTab, setIncidentTab] = useState('NOTES')
  const [workNoteDraft, setWorkNoteDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [postingActivity, setPostingActivity] = useState(false)
  const toastTimer = useRef(null)
  const formDirty = useRef(false)
  const apiType = type === 'INCIDENT' ? 'INCIDENT' : type === 'SERVICE_REQUEST' ? 'SERVICE_REQUEST' : 'CHANGE'
  const roles = user?.roles || []
  const canEditIncidentClassification = apiType === 'INCIDENT' && Boolean(ticket?.openedByUsername) && ticket.openedByUsername.toLowerCase() === String(user?.username || '').toLowerCase()
  const isIncidentRequester = apiType === 'INCIDENT' && Boolean(ticket?.requesterUsername) && ticket.requesterUsername.toLowerCase() === String(user?.username || '').toLowerCase()
  const canAssign = roles.some((role) => (apiType === 'CHANGE' ? CHANGE_STAFF_ROLES : STAFF_ROLES).includes(role))
  const canUpdateStatus = canAssign
  const canApprove = apiType === 'CHANGE'
    ? roles.some((role) => APPROVER_ROLES.includes(role))
    : apiType === 'SERVICE_REQUEST' && String(ticket?.requestedByUserId) !== String(user?.userId) && String(ticket?.requestedForUserId) !== String(user?.userId)
      && (roles.some((role) => REQUEST_APPROVER_ROLES.includes(role)) || String(ticket?.pendingApproverUserId) === String(user?.userId))

  const endpoint = apiType === 'INCIDENT' ? `/api/incidents/${ticketId}` : apiType === 'SERVICE_REQUEST' ? `/api/service-requests/${ticketId}` : `/api/change-requests/${ticketId}`

  function showToast(message, type = 'info') {
    if (!message) return
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    const title = ({ success: 'Saved successfully', error: 'Something went wrong', info: 'Information', warning: 'Please note' })[type] || 'Information'
    setToast({ message, type, title })
    toastTimer.current = window.setTimeout(() => setToast(null), type === 'error' ? 7000 : 4500)
  }

  useEffect(() => { if (error) showToast(error, 'error') }, [error])
  useEffect(() => { if (notice) showToast(notice, 'success') }, [notice])
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current) }, [])

  const load = useCallback(async (quiet = false, signal) => {
    if (quiet && formDirty.current) return
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await readApi(await fetch(endpoint, { credentials: 'include', signal }))
      setTicket(result)
      setDraft({ assignedGroupId: result.assignedGroupId ?? '', assignedAgentId: result.assignedAgentId ?? '', status: result.status ?? '', approvalStatus: result.approvalStatus ?? '', approvalComment: '', categoryId: result.categoryId ?? '', subcategoryId: result.subcategoryId ?? '', impact: result.impact ?? '', urgency: result.urgency ?? '' })
      formDirty.current = false
      setUpdatedAt(Date.now())
    } catch (reason) {
      if (reason.name !== 'AbortError') setError(reason.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [endpoint])

  useEffect(() => {
    const controller = new AbortController()
    load(false, controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, 15000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [load])

  useEffect(() => {
    if (!canAssign) return
    const controller = new AbortController()
    fetch('/api/tickets/assignment-options', { credentials: 'include', signal: controller.signal })
      .then(readApi).then(setGroups).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [canAssign])

  useEffect(() => {
    if (!canEditIncidentClassification) return
    const controller = new AbortController()
    fetch('/api/incidents/options', { credentials: 'include', signal: controller.signal })
      .then(readApi).then(setIncidentOptions)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [canEditIncidentClassification])

  const fields = useMemo(() => {
    if (!ticket) return []
    const entries = Object.entries(ticket).filter(([key, value]) => !excludedFields.has(key) && value != null && typeof value !== 'object' && value !== '')
    if (canAssign) {
      if (!entries.some(([key]) => key === 'assignedGroup')) entries.push(['assignedGroup', ticket.assignedGroup || ''])
      if (!entries.some(([key]) => key === 'assignedAgent')) entries.push(['assignedAgent', ticket.assignedAgent || ''])
    }
    return entries
  }, [ticket, canAssign])
  const extraLists = useMemo(() => ticket ? Object.entries(ticket).filter(([key, value]) => !excludedFields.has(key) && Array.isArray(value) && value.length && typeof value[0] === 'string') : [], [ticket])
  const timelines = useMemo(() => ticket ? Object.entries(ticket).filter(([key, value]) => ['activity', 'history', 'approvals'].includes(key) && Array.isArray(value) && value.length) : [], [ticket])
  const attachments = ticket?.attachments || []
  const number = ticket?.ticketNumber || ticket?.requestNumber || ticket?.changeNumber || ''
  const title = ticket?.title || ticket?.shortDescription || number
  const statusChoices = apiType === 'INCIDENT' ? INCIDENT_NEXT[ticket?.status] || [] : apiType === 'SERVICE_REQUEST' ? REQUEST_NEXT[ticket?.status] || [] : CHANGE_NEXT[ticket?.status] || []
  const statusLabel = (value) => apiType === 'INCIDENT' && value === 'AWAITING_USER_RESPONSE' ? 'Awaiting for User Response' : label(value || '')
  const selectedGroup = groups.find((group) => String(group.groupId) === String(draft?.assignedGroupId || ''))
  const selectedIncidentCategory = (incidentOptions.categories || []).find((category) => String(category.categoryId) === String(draft?.categoryId || ''))
  const incidentSubcategories = selectedIncidentCategory?.subcategories || []

  async function patchTicket(suffix, body) {
    return readApi(await fetch(`${endpoint}${suffix}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  }

  async function postIncidentActivities(event) {
    event.preventDefault()
    const activities = [
      ...(roles.some((role) => STAFF_ROLES.includes(role)) && workNoteDraft.trim() ? [{ type: 'WORK_NOTE', text: workNoteDraft.trim() }] : []),
      ...(commentDraft.trim() ? [{ type: 'COMMENT', text: commentDraft.trim() }] : []),
    ]
    if (!activities.length) return
    setPostingActivity(true); setError(''); setNotice(''); showToast('Posting your note to the incident activity.', 'info')
    try {
      let updated = ticket
      for (const activity of activities) {
        updated = await readApi(await fetch(`${endpoint}/activity`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activity) }))
      }
      setTicket(updated); setUpdatedAt(Date.now()); setWorkNoteDraft(''); setCommentDraft(''); setNotice(ticket.status === 'AWAITING_USER_RESPONSE' && isIncidentRequester ? 'Your response was sent. The incident is back In Progress.' : 'Notes posted successfully.')
    } catch (reason) { setError(reason.message) } finally { setPostingActivity(false) }
  }

  async function saveEdits(event) {
    event.preventDefault()
    if (!ticket || !draft || saving) return
    setSaving(true); setError(''); setNotice(''); showToast('Saving the ticket updates.', 'info')
    let updated = ticket
    try {
      if (canEditIncidentClassification && (
        String(draft.categoryId) !== String(ticket.categoryId ?? '')
        || String(draft.subcategoryId) !== String(ticket.subcategoryId ?? '')
        || draft.impact !== ticket.impact
        || draft.urgency !== ticket.urgency
      )) {
        updated = await patchTicket('', {
          categoryId: Number(draft.categoryId), subcategoryId: Number(draft.subcategoryId),
          impact: draft.impact, urgency: draft.urgency,
        })
      }
      if (canAssign && (String(draft.assignedGroupId) !== String(ticket.assignedGroupId ?? '') || String(draft.assignedAgentId) !== String(ticket.assignedAgentId ?? ''))) {
        updated = await patchTicket('/assignment', { assignedGroupId: draft.assignedGroupId ? Number(draft.assignedGroupId) : null, assignedAgentId: draft.assignedAgentId ? Number(draft.assignedAgentId) : null })
      }
      if (canUpdateStatus && draft.status !== updated.status) updated = await patchTicket('/status', { status: draft.status })
      if (canApprove && draft.approvalStatus && draft.approvalStatus !== updated.approvalStatus) {
        const rejected = draft.approvalStatus === 'REJECTED'
        if (rejected && draft.approvalComment.trim().length < 5) throw new Error('Add a rejection reason of at least 5 characters.')
        updated = apiType === 'CHANGE'
          ? await patchTicket('/approval', { decision: draft.approvalStatus, comments: draft.approvalComment.trim() })
          : await patchTicket('/approval', { approved: draft.approvalStatus === 'APPROVED', comments: draft.approvalComment.trim(), rejectionReason: rejected ? draft.approvalComment.trim() : null })
      }
      setTicket(updated)
      setDraft({ assignedGroupId: updated.assignedGroupId ?? '', assignedAgentId: updated.assignedAgentId ?? '', status: updated.status ?? '', approvalStatus: updated.approvalStatus ?? '', approvalComment: '', categoryId: updated.categoryId ?? '', subcategoryId: updated.subcategoryId ?? '', impact: updated.impact ?? '', urgency: updated.urgency ?? '' })
      setUpdatedAt(Date.now()); setNotice('Ticket details saved successfully.'); formDirty.current = false
    } catch (reason) {
      setTicket(updated)
      setDraft((current) => current ? { ...current, assignedGroupId: updated.assignedGroupId ?? current.assignedGroupId, assignedAgentId: updated.assignedAgentId ?? current.assignedAgentId, status: updated.status ?? current.status, approvalStatus: updated.approvalStatus ?? current.approvalStatus, categoryId: updated.categoryId ?? current.categoryId, subcategoryId: updated.subcategoryId ?? current.subcategoryId, impact: updated.impact ?? current.impact, urgency: updated.urgency ?? current.urgency } : current)
      setError(reason.message)
    } finally { setSaving(false) }
  }

  async function downloadAttachment(attachment) {
    const attachmentId = attachment.attachmentId
    setDownloading(attachmentId)
    setError('')
    try {
      const url = apiType === 'INCIDENT' ? `/api/incidents/${ticketId}/attachments/${attachmentId}` : apiType === 'SERVICE_REQUEST' ? `/api/service-requests/${ticketId}/attachments/${attachmentId}` : `/api/change-requests/${ticketId}/attachments/${attachmentId}`
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || 'Could not download this attachment.')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.fileName || 'attachment'
      link.click()
      URL.revokeObjectURL(objectUrl)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setDownloading(null)
    }
  }

  function renderIncidentLayout() {
    const isStaff = roles.some((role) => STAFF_ROLES.includes(role))
    const latestActivities = [...(ticket.activity || [])].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    const input = (caption, value, options = {}) => <label className={`incident-form-field${options.editable ? ' incident-form-editable' : ' incident-form-readonly'}${options.full ? ' incident-form-full' : ''}`} key={caption}><span>{caption}</span>{options.children || <input disabled value={value || '—'} title={value || '—'} />}</label>
    const statusEditor = canUpdateStatus && statusChoices.length > 0
      ? <select value={draft?.status || ticket.status} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, status: event.target.value })) }}><option value={ticket.status}>{statusLabel(ticket.status)}</option>{statusChoices.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
      : <input disabled value={statusLabel(ticket.status)} />
    const groupEditor = canAssign ? <select value={draft?.assignedGroupId || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, assignedGroupId: event.target.value, assignedAgentId: '' })) }}><option value="">Unassigned</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</select> : <input disabled value={ticket.assignedGroup || '—'} />
    const agentEditor = canAssign ? <select value={draft?.assignedAgentId || ''} disabled={!draft?.assignedGroupId} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, assignedAgentId: event.target.value })) }}><option value="">Unassigned</option>{(selectedGroup?.agents || []).map((agent) => <option key={agent.userId} value={agent.userId}>{agent.displayName}</option>)}</select> : <input disabled value={ticket.assignedAgent || '—'} />
    const categoryEditor = canEditIncidentClassification
      ? <select value={draft?.categoryId || ''} disabled={!incidentOptions.categories?.length} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, categoryId: event.target.value, subcategoryId: '' })) }}><option value="">Select category</option>{(incidentOptions.categories || []).map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select>
      : null
    const subcategoryEditor = canEditIncidentClassification
      ? <select value={draft?.subcategoryId || ''} disabled={!incidentSubcategories.length} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, subcategoryId: event.target.value })) }}><option value="">Select subcategory</option>{incidentSubcategories.map((subcategory) => <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>{subcategory.subcategoryName}</option>)}</select>
      : null
    const impactEditor = canEditIncidentClassification
      ? <select value={draft?.impact || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, impact: event.target.value })) }}>{IMPACT_URGENCY_VALUES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
      : null
    const urgencyEditor = canEditIncidentClassification
      ? <select value={draft?.urgency || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, urgency: event.target.value })) }}>{IMPACT_URGENCY_VALUES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
      : null
    const displayedPriority = canEditIncidentClassification ? incidentPriority(draft?.impact, draft?.urgency) : ticket.priority

    return <main className="ticket-detail-main incident-servicenow-main">
      <header className="incident-record-toolbar"><div className="incident-record-heading"><button type="button" onClick={() => navigate(basePath)} aria-label="Back to tickets">‹</button><span className="incident-toolbar-mark">☰</span><div><strong>Incident</strong><small>{number}</small></div></div><div className="incident-record-actions"><span className="incident-record-state">{statusLabel(ticket.status)}</span>{statusChoices.includes('RESOLVED') && <button type="button" className="incident-resolve-action" disabled={saving} onClick={() => { formDirty.current = true; setDraft((current) => ({ ...current, status: 'RESOLVED' })); window.setTimeout(() => document.getElementById('incident-details-form')?.requestSubmit(), 0) }}>Resolve</button>}<button type="submit" form="incident-details-form" disabled={saving || !formDirty.current}>{saving ? 'Updating…' : 'Update'}</button></div></header>
      <section className="ticket-detail-card incident-record-card">
        <form id="incident-details-form" className="ticket-detail-edit-form incident-record-form" onSubmit={saveEdits}>
          <div className="incident-form-columns">
            <div className="incident-form-column">
              {input('Number', number)}
              {input('Caller', ticket.requesterName)}
              {input('Category', ticket.category, { editable: canEditIncidentClassification, children: categoryEditor })}
              {input('Subcategory', ticket.subcategory, { editable: canEditIncidentClassification, children: subcategoryEditor })}
              {input('Business service', '—')}
              {input('Configuration item', '—')}
            </div>
            <div className="incident-form-column">
              {input('Contact type', label(ticket.contactType || '—'))}
              {input('State', '', { editable: canUpdateStatus && statusChoices.length > 0, children: statusEditor })}
              {input('Impact', label(ticket.impact || ''), { editable: canEditIncidentClassification, children: impactEditor })}
              {input('Urgency', label(ticket.urgency || ''), { editable: canEditIncidentClassification, children: urgencyEditor })}
              {input('Priority', displayedPriority, { disabled: true })}
              {input('Assignment group', ticket.assignedGroup, { editable: canAssign, children: groupEditor })}
              {input('Assigned to', ticket.assignedAgent, { editable: canAssign, children: agentEditor })}
            </div>
          </div>
          {input('Short description', ticket.title, { full: true })}
          <label className="incident-description-field"><span>Description</span><textarea disabled value={ticket.description || ''} rows="3" /></label>
          <div className="incident-form-footer"><button type="submit" disabled={saving || !formDirty.current}>{saving ? 'Updating…' : 'Save'}</button></div>
        </form>
      </section>
      {ticket.status === 'AWAITING_USER_RESPONSE' && isIncidentRequester && <div className="incident-response-prompt" role="status"><strong>Support is waiting for your response.</strong><span>Post a comment in Notes to respond. The incident will return to In Progress automatically.</span></div>}
      <button type="button" className="incident-related-search" disabled>Related Search Results <span>›</span></button>
      <section className="ticket-detail-card incident-notes-card">
        <nav className="incident-tabs" aria-label="Incident details">
          {[['NOTES', 'Notes'], ['RELATED', 'Related Records'], ['RESOLUTION', 'Resolution Information']].map(([tab, text]) => <button type="button" key={tab} className={incidentTab === tab ? 'active' : ''} onClick={() => setIncidentTab(tab)}>{text}{tab === 'NOTES' ? '*' : ''}</button>)}
        </nav>
        {incidentTab === 'NOTES' && <div className="incident-notes-content">
          <div className="incident-note-lists"><label><span>Watch list</span><input disabled value="Not configured" /></label><label><span>Work notes list</span><input disabled value={isStaff ? 'Staff only' : '—'} /></label></div>
          {isStaff && <label><span>Work notes</span><textarea value={workNoteDraft} maxLength={4000} onChange={(event) => setWorkNoteDraft(event.target.value)} placeholder="Work notes" rows="3" /></label>}
          <label><span>Additional comments <small>(Customer visible)</small></span><textarea value={commentDraft} maxLength={4000} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Additional comments (Customer visible)" rows="3" /></label>
          <div className="incident-note-footer"><span>{workNoteDraft.length + commentDraft.length}/4000</span><button type="button" disabled={postingActivity || (!workNoteDraft.trim() && !commentDraft.trim())} onClick={postIncidentActivities}>{postingActivity ? 'Posting…' : ticket.status === 'AWAITING_USER_RESPONSE' && isIncidentRequester && commentDraft.trim() ? 'Send response' : 'Post'}</button></div>
          {latestActivities.length > 0 && <div className="ticket-detail-timeline incident-activity-list">{latestActivities.map((item) => <article key={item.activityId}><span className="ticket-timeline-dot"/><div><strong>{item.type === 'WORK_NOTE' ? 'Work note' : 'Comment'} · {item.authorName}</strong><p>{item.text}</p><small>{formatValue('createdAt', item.createdAt)}</small></div></article>)}</div>}
        </div>}
        {incidentTab === 'RELATED' && <div className="incident-related-content">{attachments.length ? attachments.map((attachment) => <div className="ticket-attachment" key={attachment.attachmentId}><span className="ticket-attachment-icon">▧</span><span className="ticket-attachment-name"><strong>{attachment.fileName}</strong><small>{attachment.contentType || 'File'}</small></span><button type="button" onClick={() => downloadAttachment(attachment)} disabled={downloading === attachment.attachmentId}>{downloading === attachment.attachmentId ? '…' : '↓'}</button></div>) : <p className="ticket-detail-empty">No related records or attachments.</p>}</div>}
        {incidentTab === 'RESOLUTION' && <div className="ticket-detail-grid incident-resolution-grid">{[['Resolved', ticket.resolvedAt], ['Closed', ticket.closedAt], ['SLA target', `${ticket.slaTargetHours || '—'} hours`], ['Due date', ticket.dueDate]].filter(([, value]) => value).map(([caption, value]) => input(caption, formatValue(caption, value)))}</div>}
      </section>
    </main>
  }

  return <section className="ticket-detail-page">
    {toast && <div className={`ticket-toast ticket-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}><span className="ticket-toast-icon" aria-hidden="true">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '!' : toast.type === 'warning' ? '⚠' : 'i'}</span><span className="ticket-toast-copy"><strong>{toast.title}</strong><span>{toast.message}</span></span>{toast.type === 'error' && !ticket && <button type="button" className="ticket-toast-retry" onClick={() => load()}>Retry</button>}<button type="button" aria-label="Dismiss message" onClick={() => { setToast(null); if (toastTimer.current) window.clearTimeout(toastTimer.current) }}>×</button></div>}
    {apiType !== 'INCIDENT' && <button className="ticket-detail-back" type="button" onClick={() => navigate(basePath)}><span aria-hidden="true">←</span> Back to {queue === 'MY_TICKETS' ? 'My Tickets' : queue === 'CHANGES' ? 'Change Request Pool' : 'Tickets Pool'}</button>}
    {loading ? <Loader variant="inline" title="Loading ticket details" subtitle="Getting the latest ticket information." /> : ticket && <>
      {apiType === 'INCIDENT' ? renderIncidentLayout() : <>
      <header className={`ticket-detail-hero ticket-detail-hero-${apiType.toLowerCase()}`}>
        <div className="ticket-detail-title-area"><span className="ticket-detail-type">{LABELS[apiType.toLowerCase()]}</span><span className="ticket-detail-number">{number}</span><h1>{title}</h1><p>{ticket.description || 'No description provided.'}</p></div>
        <div className="ticket-detail-hero-side"><span className={`ticket-detail-status ticket-detail-status-${String(ticket.status || '').toLowerCase()}`}>{String(ticket.status || 'Unknown').replaceAll('_', ' ')}</span><span className={`ticket-detail-priority ticket-detail-priority-${String(ticket.priority || '').toLowerCase()}`}>{ticket.priority || '—'} priority</span><small>{refreshing ? 'Refreshing…' : updatedAt ? `Live · checked ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(updatedAt)}` : 'Live updates every 15 seconds'}</small><button type="button" onClick={() => load(true)} disabled={refreshing}>⟳ Refresh now</button></div>
      </header>

      <div className="ticket-detail-layout">
        <main className="ticket-detail-main">
          <section className="ticket-detail-card"><div className="ticket-detail-section-heading"><span className="ticket-detail-section-icon detail-icon-blue">▤</span><div><h2>Ticket information</h2><p>Update editable values here. Available fields depend on your access.</p></div></div>
            <form className="ticket-detail-edit-form" onSubmit={saveEdits}>
              <div className="ticket-detail-grid">{fields.map(([key, value]) => {
                const fieldTitle = <span>{label(key)}</span>
                if (key === 'assignedGroup' && canAssign) return <label className="ticket-detail-field ticket-editable-field" key={key}>{fieldTitle}<select value={draft?.assignedGroupId || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, assignedGroupId: event.target.value, assignedAgentId: '' })) }}><option value="">Unassigned</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</select></label>
                if (key === 'assignedAgent' && canAssign) return <label className="ticket-detail-field ticket-editable-field" key={key}>{fieldTitle}<select value={draft?.assignedAgentId || ''} disabled={!draft?.assignedGroupId} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, assignedAgentId: event.target.value })) }}><option value="">Unassigned</option>{(selectedGroup?.agents || []).map((agent) => <option key={agent.userId} value={agent.userId}>{agent.displayName}</option>)}</select></label>
                if (key === 'status' && canUpdateStatus && statusChoices.length > 0) return <label className="ticket-detail-field ticket-editable-field" key={key}>{fieldTitle}<select value={draft?.status || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, status: event.target.value })) }}><option value={ticket.status}>{label(ticket.status)}</option>{statusChoices.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
                if (key === 'approvalStatus' && canApprove && ticket.approvalStatus === 'PENDING') return <label className="ticket-detail-field ticket-editable-field" key={key}>{fieldTitle}<select value={draft?.approvalStatus || 'PENDING'} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, approvalStatus: event.target.value })) }}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>{apiType === 'CHANGE' && <option value="CHANGES_REQUESTED">Changes requested</option>}</select></label>
                return <label className="ticket-detail-field ticket-readonly-field" key={key}>{fieldTitle}<input type="text" value={formatValue(key, value)} disabled title={formatValue(key, value)} /></label>
              })}
              {canApprove && ticket.approvalStatus === 'PENDING' && draft?.approvalStatus !== 'PENDING' && <label className="ticket-detail-field ticket-editable-field ticket-approval-comment">Approval comments<textarea value={draft?.approvalComment || ''} onChange={(event) => { formDirty.current = true; setDraft((current) => ({ ...current, approvalComment: event.target.value })) }} placeholder="Add a decision note; a rejection reason is required." rows="2" /></label>}
              </div>
              {extraLists.map(([key, value]) => <div className="ticket-detail-list-field" key={key}><span>{label(key)}</span><div>{value.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>)}
              {(canAssign || statusChoices.length > 0 && canUpdateStatus || canApprove && ticket.approvalStatus === 'PENDING') && <div className="ticket-detail-form-actions"><button type="submit" disabled={saving || !formDirty.current}>{saving ? 'Saving…' : 'Save'}</button></div>}
            </form>
          </section>
          {ticket.details && Object.keys(ticket.details).length > 0 && <section className="ticket-detail-card"><div className="ticket-detail-section-heading"><span className="ticket-detail-section-icon detail-icon-teal">≡</span><div><h2>Request details</h2><p>Information supplied with the request.</p></div></div><div className="ticket-detail-grid">{Object.entries(ticket.details).map(([key, value]) => <div className="ticket-detail-field" key={key}><span>{label(key)}</span><strong>{formatValue(key, value)}</strong></div>)}</div></section>}
          {timelines.map(([key, items]) => <section className="ticket-detail-card" key={key}><div className="ticket-detail-section-heading"><span className="ticket-detail-section-icon detail-icon-violet">◷</span><div><h2>{label(key)}</h2><p>Ticket updates and workflow activity.</p></div></div><div className="ticket-detail-timeline">{items.map((item, index) => <article key={item.activityId || item.historyId || item.approvalId || index}><span className="ticket-timeline-dot"/><div><strong>{item.text || item.details || item.comments || item.eventType || item.type || item.status || label(key)}</strong><p>{[item.authorName || item.author || item.changedBy || item.approver, item.field, item.oldValue && `${item.oldValue} → ${item.newValue}`].filter(Boolean).join(' · ')}</p><small>{formatValue('createdAt', item.createdAt || item.changedAt || item.decidedAt)}</small></div></article>)}</div></section>)}
        </main>
        <aside className="ticket-detail-aside">
          <section className="ticket-detail-card ticket-detail-aside-card"><div className="ticket-detail-section-heading"><span className="ticket-detail-section-icon detail-icon-amber">⌁</span><div><h2>Attachments</h2><p>{attachments.length} {attachments.length === 1 ? 'file' : 'files'}</p></div></div>{attachments.length ? <div className="ticket-attachment-list">{attachments.map((attachment) => <div className="ticket-attachment" key={attachment.attachmentId}><span className="ticket-attachment-icon">▧</span><span className="ticket-attachment-name"><strong>{attachment.fileName}</strong><small>{attachment.contentType || 'File'} · {Math.max(1, Math.round((attachment.fileSize ?? attachment.size ?? 0) / 1024))} KB</small></span><button type="button" onClick={() => downloadAttachment(attachment)} disabled={downloading === attachment.attachmentId} aria-label={`Download ${attachment.fileName}`}>{downloading === attachment.attachmentId ? '…' : '↓'}</button></div>)}</div> : <p className="ticket-detail-empty">No files attached.</p>}</section>
          <section className="ticket-detail-card ticket-detail-aside-card"><div className="ticket-detail-section-heading"><span className="ticket-detail-section-icon detail-icon-green">✓</span><div><h2>Record timestamps</h2><p>Latest saved ticket activity.</p></div></div><div className="ticket-time-list">{[['Created', ticket.createdAt], ['Updated', ticket.updatedAt], ['Resolved', ticket.resolvedAt], ['Completed', ticket.completedAt], ['Closed', ticket.closedAt]].filter(([, value]) => value).map(([name, value]) => <div key={name}><span>{name}</span><strong>{formatValue(name, value)}</strong></div>)}</div></section>
        </aside>
      </div>
      </>}
    </>}
  </section>
}
