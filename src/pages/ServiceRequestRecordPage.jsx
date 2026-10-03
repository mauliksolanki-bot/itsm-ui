import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { notifyToast } from '../components/Toast.jsx'
import Loader from '../components/Loader.jsx'
import './ServiceRequestRecordPage.css'

const STAFF_ROLES = ['SERVICE_DESK_AGENT', 'TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN']
const APPROVER_ROLES = ['TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN']
const NEXT_STATUSES = {
  NEW: ['ASSIGNED'], APPROVED: ['ASSIGNED'], ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_USER', 'PENDING_VENDOR', 'FULFILLED'],
  PENDING_USER: ['IN_PROGRESS'], PENDING_VENDOR: ['IN_PROGRESS'], FULFILLED: ['COMPLETED'], COMPLETED: ['CLOSED'],
}
const STATUS_LABELS = {
  NEW: 'New', PENDING_APPROVAL: 'Pending Approval', APPROVED: 'Approved', REJECTED: 'Rejected', ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress', PENDING_USER: 'Pending User', PENDING_VENDOR: 'Pending Vendor', FULFILLED: 'Fulfilled',
  COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}

async function readApi(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load or save this request.')
  return body
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function plainText(value = '') {
  return new DOMParser().parseFromString(value, 'text/html').body.textContent.trim()
}

function fieldName(value) {
  return value.replaceAll(/([A-Z])/g, ' $1').replaceAll(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function stageFor(status) {
  if (['PENDING_APPROVAL'].includes(status)) return 'Approval'
  if (['NEW', 'APPROVED', 'ASSIGNED'].includes(status)) return 'Request fulfillment'
  if (['IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR'].includes(status)) return 'Fulfillment'
  return 'Completed'
}

function ServiceRequestRecordPage({ requestId, user }) {
  const navigate = useNavigate()
  const roles = user?.roles || []
  const isStaff = roles.some((role) => STAFF_ROLES.includes(role))
  const canApproveRole = roles.some((role) => APPROVER_ROLES.includes(role))
  const [record, setRecord] = useState(null)
  const [groups, setGroups] = useState([])
  const [catalogServices, setCatalogServices] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [itemOptions, setItemOptions] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [requestedForQuery, setRequestedForQuery] = useState('')
  const [requestedForResults, setRequestedForResults] = useState([])
  const [requestedForLoading, setRequestedForLoading] = useState(false)
  const [selectedRequestedFor, setSelectedRequestedFor] = useState(null)
  const [requestedForOpen, setRequestedForOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [workNote, setWorkNote] = useState('')

  const isParticipant = Boolean(record && (String(record.requestedByUserId) === String(user?.userId)
    || String(record.requestedForUserId) === String(user?.userId)))
  const isTerminal = ['CLOSED', 'CANCELLED', 'REJECTED'].includes(record?.status)
  const canEditUserFields = Boolean(record && !isTerminal && (isStaff || (isParticipant && ['NEW', 'PENDING_APPROVAL'].includes(record.status))))
  const canEditRequester = Boolean(record && !isTerminal && isParticipant && ['NEW', 'PENDING_APPROVAL'].includes(record.status))
  const canComment = Boolean(record && !isTerminal && (isStaff || isParticipant))
  const canApprove = Boolean(record && record.approvalStatus === 'PENDING' && !isParticipant
    && (canApproveRole || String(record.pendingApproverUserId) === String(user?.userId)))
  const selectedGroup = useMemo(() => groups.find((group) => String(group.groupId) === String(draft?.assignedGroupId || '')), [groups, draft?.assignedGroupId])
  const selectedService = useMemo(() => catalogServices.find((service) => String(service.serviceId) === String(draft?.serviceId || '')), [catalogServices, draft?.serviceId])
  const nextStatuses = NEXT_STATUSES[record?.status] || []

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      fetch(`/api/service-requests/${requestId}`, { credentials: 'include', signal: controller.signal }).then(readApi),
      fetch('/api/service-requests/options', { credentials: 'include', signal: controller.signal }).then(readApi),
      isStaff ? fetch('/api/tickets/assignment-options', { credentials: 'include', signal: controller.signal }).then(readApi) : Promise.resolve([]),
    ]).then(([loaded, options, assignmentGroups]) => {
      setRecord(loaded)
      setGroups(assignmentGroups || [])
      setCatalogServices(options?.services || [])
      const requestedFor = { userId: loaded.requestedForUserId, username: loaded.requestedForUsername, displayName: loaded.requestedFor }
      setSelectedRequestedFor(requestedFor)
      setRequestedForQuery(loaded.requestedFor || '')
      setDraft({
        shortDescription: loaded.shortDescription || '', description: plainText(loaded.description || ''),
        details: { ...(loaded.details || {}) }, expectedCompletionDate: loaded.expectedCompletionDate || '',
        impact: loaded.impact || 'MEDIUM', urgency: loaded.urgency || 'MEDIUM', status: loaded.status || '',
        assignedGroupId: loaded.assignedGroupId || '', assignedAgentId: loaded.assignedAgentId || '',
        requestedForUserId: loaded.requestedForUserId || '', serviceId: loaded.serviceId || '',
        categoryName: loaded.category || '', catalogItemId: loaded.catalogItemId || '',
      })
      setError('')
    }).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requestId, isStaff])

  useEffect(() => {
    if (!draft?.serviceId) { setCategoryOptions([]); setCategoriesLoading(false); return undefined }
    const controller = new AbortController()
    setCategoryOptions([])
    setItemOptions([])
    setCategoriesLoading(true)
    fetch(`/api/service-requests/services/${draft.serviceId}/categories`, { credentials: 'include', signal: controller.signal })
      .then(readApi).then(setCategoryOptions)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setCategoriesLoading(false) })
    return () => controller.abort()
  }, [draft?.serviceId])

  useEffect(() => {
    if (!draft?.serviceId || !draft?.categoryName) { setItemOptions([]); setItemsLoading(false); return undefined }
    const controller = new AbortController()
    setItemOptions([])
    setItemsLoading(true)
    fetch(`/api/service-requests/services/${draft.serviceId}/categories/${encodeURIComponent(draft.categoryName)}/items`, { credentials: 'include', signal: controller.signal })
      .then(readApi).then(setItemOptions)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setItemsLoading(false) })
    return () => controller.abort()
  }, [draft?.serviceId, draft?.categoryName])

  useEffect(() => {
    const query = requestedForQuery.trim()
    if (!canEditRequester || query.length < 3 || (selectedRequestedFor && query.toLocaleLowerCase() === selectedRequestedFor.displayName?.toLocaleLowerCase())) {
      setRequestedForResults([])
      setRequestedForLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRequestedForLoading(true)
      fetch(`/api/service-requests/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
        .then(readApi).then(setRequestedForResults).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
        .finally(() => { if (!controller.signal.aborted) setRequestedForLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [requestedForQuery, selectedRequestedFor, canEditRequester])

  function change(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setDirty(true)
    setError('')
  }

  function changeVariable(key, value) {
    setDraft((current) => ({ ...current, details: { ...current.details, [key]: value } }))
    setDirty(true)
    setError('')
  }

  function selectRequestedFor(person) {
    setSelectedRequestedFor(person)
    setRequestedForQuery(person.displayName)
    setRequestedForResults([])
    setRequestedForOpen(false)
    setDraft((current) => ({ ...current, requestedForUserId: person.userId }))
    setDirty(true)
  }

  function selectCategory(categoryName) {
    setItemOptions([])
    setDraft((current) => ({ ...current, categoryName, catalogItemId: '', details: {} }))
    setDirty(true)
  }

  function itemDetails(item) {
    if (item?.catalogCode === 'HARDWARE_LAPTOP') return { laptopType: 'Standard', operatingSystem: 'Windows 11', ram: '16 GB', storage: '512 GB SSD' }
    if (item?.catalogCode?.startsWith('SOFTWARE_')) return { licenseType: 'Standard', version: 'Latest', businessPurpose: '' }
    if (['ACCESS_MANAGEMENT', 'CLOUD_SERVICES'].includes(selectedService?.serviceCode)) return { targetSystem: '', accessLevel: '', businessJustification: '' }
    return {}
  }

  function selectCatalogItem(itemId) {
    const item = itemOptions.find((entry) => String(entry.catalogItemId) === String(itemId))
    setDraft((current) => ({ ...current, catalogItemId: itemId, details: itemDetails(item) }))
    setDirty(true)
  }

  async function patch(path, payload) {
    return readApi(await fetch(`/api/service-requests/${requestId}${path}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }))
  }

  async function save(event) {
    event?.preventDefault()
    if (!record || !draft || saving) return
    const text = draft.description.trim()
    if (draft.shortDescription.trim().length < 5 || draft.shortDescription.trim().length > 160) {
      setError('Short description must contain 5 to 160 characters.')
      return
    }
    if (text.length < 10 || text.length > 5000) {
      setError('Description must contain 10 to 5,000 characters.')
      return
    }
    if (draft.expectedCompletionDate && draft.expectedCompletionDate < new Date().toISOString().slice(0, 10)) {
      setError('Expected completion date cannot be in the past.')
      return
    }
    if (canEditRequester && !draft.requestedForUserId) {
      setError('Choose a Requested For user from the search results.')
      return
    }
    if (canEditRequester && !draft.catalogItemId) {
      setError('Choose an item for the selected category.')
      return
    }
    setSaving(true)
    setError('')
    let latest = record
    try {
      latest = await patch('', {
        requestedForUserId: canEditRequester && draft.requestedForUserId ? Number(draft.requestedForUserId) : null,
        catalogItemId: canEditRequester && draft.catalogItemId ? Number(draft.catalogItemId) : null,
        shortDescription: draft.shortDescription, description: draft.description, details: draft.details,
        expectedCompletionDate: draft.expectedCompletionDate || null,
        impact: isStaff ? draft.impact : null, urgency: isStaff ? draft.urgency : null,
        comment: comment.trim() || null, workNote: isStaff ? workNote.trim() || null : null,
      })
      if (isStaff && (String(draft.assignedGroupId) !== String(latest.assignedGroupId || '')
          || String(draft.assignedAgentId) !== String(latest.assignedAgentId || ''))) {
        latest = await patch('/assignment', {
          assignedGroupId: draft.assignedGroupId ? Number(draft.assignedGroupId) : null,
          assignedAgentId: draft.assignedAgentId ? Number(draft.assignedAgentId) : null,
        })
      }
      if (isStaff && draft.status && draft.status !== latest.status) latest = await patch('/status', { status: draft.status })
      setRecord(latest)
      setDraft((current) => ({ ...current, status: latest.status, assignedGroupId: latest.assignedGroupId || '', assignedAgentId: latest.assignedAgentId || '', requestedForUserId: latest.requestedForUserId, serviceId: latest.serviceId, categoryName: latest.category, catalogItemId: latest.catalogItemId, details: { ...(latest.details || {}) } }))
      setSelectedRequestedFor({ userId: latest.requestedForUserId, username: latest.requestedForUsername, displayName: latest.requestedFor })
      setRequestedForQuery(latest.requestedFor)
      setRequestedForResults([])
      setComment('')
      setWorkNote('')
      setDirty(false)
      notifyToast(`${latest.requestNumber} was saved successfully.`, 'success', 'Request updated')
    } catch (reason) {
      setRecord(latest)
      setError(reason.message)
      notifyToast(reason.message, 'error', 'Request update failed')
    } finally { setSaving(false) }
  }

  async function decideApproval(approved) {
    if (!approved) {
      const reason = window.prompt('Enter a reason for rejecting this request:')
      if (!reason?.trim()) return
      await performApproval({ approved: false, rejectionReason: reason.trim(), comments: reason.trim() })
      return
    }
    await performApproval({ approved: true, comments: 'Approved' })
  }

  async function performApproval(payload) {
    setSaving(true)
    try {
      const updated = await patch('/approval', payload)
      setRecord(updated)
      setDraft((current) => ({ ...current, status: updated.status }))
      notifyToast(`${updated.requestNumber} approval was updated.`, 'success', 'Approval saved')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Approval failed') }
    finally { setSaving(false) }
  }

  if (loading) return <section className="sr-record-shell"><Loader variant="inline" title="Loading requested item" subtitle="Getting the latest request details." /></section>
  if (error && !record) return <section className="sr-record-shell"><div className="sr-record-toolbar"><button type="button" onClick={() => navigate('/service-catalog/service-request')}>‹ Back to requests</button></div><p className="sr-record-error" role="alert">{error}</p></section>
  if (!record || !draft) return null

  const field = (label, value, editable = false, control = null) => <label className={`sr-record-field${editable ? ' sr-field-editable' : ' sr-field-readonly'}`} key={label}><span>{label}</span>{control || <input disabled value={value || '—'} title={value || '—'} />}</label>
  const statusChoices = nextStatuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)

  return <section className="sr-record-shell" aria-labelledby="sr-record-title">
    <header className="sr-record-toolbar">
      <div className="sr-record-heading"><button type="button" className="sr-back-button" onClick={() => navigate('/service-catalog/service-request')} aria-label="Back to requests">‹</button><span className="sr-record-menu" aria-hidden="true">☰</span><div><strong id="sr-record-title">Requested Item</strong><small>{record.requestNumber}</small></div></div>
      <div className="sr-toolbar-actions"><span className={`sr-state-pill sr-state-${record.status.toLowerCase()}`}>{STATUS_LABELS[record.status] || record.status}</span><button type="button" onClick={save} disabled={saving || (!dirty && !comment.trim() && !workNote.trim())}>{saving ? 'Saving…' : 'Update'}</button></div>
    </header>

    {error && <p className="sr-record-error" role="alert">{error}</p>}
    <form className="sr-record-form" onSubmit={save}>
      <div className="sr-record-columns">
        <div className="sr-record-column">
          {field('Number', record.requestNumber)}
          {field('Service', record.service)}
          {field('Category', record.category, canEditRequester, canEditRequester ? <select value={draft.categoryName} disabled={categoriesLoading} onChange={(event) => selectCategory(event.target.value)}><option value="">{categoriesLoading ? 'Loading categories…' : 'Choose category'}</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select> : null)}
          {field('Item', record.itemName, canEditRequester, canEditRequester ? <select value={draft.catalogItemId} disabled={!draft.categoryName || itemsLoading} onChange={(event) => selectCatalogItem(event.target.value)}><option value="">{!draft.categoryName ? 'Choose category first' : itemsLoading ? 'Loading items…' : 'Choose item'}</option>{itemOptions.map((item) => <option key={item.catalogItemId} value={item.catalogItemId}>{item.itemName}</option>)}</select> : null)}
          {field('Requested For', `${record.requestedFor} (${record.requestedForUsername})`, canEditRequester, canEditRequester ? <div className="sr-user-search"><div className="sr-user-search-input"><input role="combobox" aria-autocomplete="list" aria-expanded={requestedForOpen && requestedForQuery.trim().length >= 3} aria-controls="sr-requested-for-options" autoComplete="off" placeholder="Search name, employee ID, or username" value={requestedForQuery} onFocus={() => { if (requestedForQuery.trim().length >= 3) setRequestedForOpen(true) }} onBlur={() => window.setTimeout(() => setRequestedForOpen(false), 150)} onChange={(event) => { const value = event.target.value; setRequestedForQuery(value); setSelectedRequestedFor(null); setRequestedForResults([]); setDraft((current) => ({ ...current, requestedForUserId: '' })); setRequestedForOpen(true); setDirty(true) }} />{requestedForLoading && <span className="sr-user-spinner" />}</div>{requestedForOpen && requestedForQuery.trim().length >= 3 && <ul id="sr-requested-for-options" className="sr-user-results" role="listbox">{requestedForResults.map((person) => <li key={person.userId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectRequestedFor(person)}><strong>{person.displayName}</strong><small>{person.employeeId || 'No employee ID'} · {person.username}</small></button></li>)}{!requestedForLoading && requestedForResults.length === 0 && <li className="sr-user-empty">No active users found.</li>}</ul>}{canEditRequester && !requestedForQuery.trim().length && <small className="sr-user-hint">Type at least 3 characters to search.</small>}</div> : null)}
          {field('Assignment group', record.assignedGroup, isStaff, isStaff ? <select value={draft.assignedGroupId} onChange={(event) => { setDraft((current) => ({ ...current, assignedGroupId: event.target.value, assignedAgentId: '' })); setDirty(true) }}><option value="">No group</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</select> : null)}
          {field('Due date', formatDate(record.dueDate))}
          {field('Catalog item', record.itemDescription || record.itemName)}
          {field('Parent', '—')}
        </div>
        <div className="sr-record-column">
          {field('Opened', formatDate(record.createdAt))}
          {field('Opened by', `${record.requestedBy} (${record.requestedByUsername})`)}
          {field('Stage', stageFor(record.status))}
          {field('State', STATUS_LABELS[record.status], isStaff && nextStatuses.length > 0, isStaff && nextStatuses.length > 0 ? <select value={draft.status} onChange={(event) => change('status', event.target.value)}><option value={record.status}>{STATUS_LABELS[record.status]}</option>{statusChoices}</select> : null)}
          {field('Request', `${record.service} · ${record.requestType.replaceAll('_', ' ')}`)}
          {field('Assigned to', record.assignedAgent, isStaff, isStaff ? <input disabled value={draft.assignedGroupId ? selectedGroup?.agents?.find((agent) => String(agent.userId) === String(draft.assignedAgentId))?.displayName || 'Automatically assigned when saved' : 'No group selected'} /> : null)}
          {field('Quantity', '1')}
          {field('Estimated delivery', draft.expectedCompletionDate || '—', canEditUserFields, canEditUserFields ? <input type="date" min={new Date().toISOString().slice(0, 10)} value={draft.expectedCompletionDate} onChange={(event) => change('expectedCompletionDate', event.target.value)} /> : null)}
          {field('Approval status', record.approvalStatus.replaceAll('_', ' '))}
          {record.approvalStatus === 'PENDING' && field('Pending approval for', record.pendingApprover || 'IT approval queue')}
          {field('Priority', record.priority)}
        </div>
      </div>

      {field('Short description', draft.shortDescription, canEditUserFields, canEditUserFields ? <input maxLength={160} value={draft.shortDescription} onChange={(event) => change('shortDescription', event.target.value)} /> : null)}
      {field('Description', draft.description, canEditUserFields, canEditUserFields ? <textarea rows={4} value={draft.description} onChange={(event) => change('description', event.target.value)} /> : <textarea rows={4} disabled value={plainText(record.description)} />)}

      <section className="sr-variables-section">
        <header><span className="sr-section-mark">▤</span><div><h2>Variables</h2><p>Request details and requester information</p></div></header>
        <div className="sr-variables-grid">
          <div className="sr-variable-group-title">Requester Details</div>
          <div className="sr-variable-row"><span>Requested By</span><input disabled value={record.requestedBy} /></div>
          <div className="sr-variable-row"><span>Requested For</span><input disabled value={record.requestedFor} /></div>
          <div className="sr-variable-group-title">{record.itemName} details</div>
          {Object.keys(draft.details || {}).length ? Object.entries(draft.details).map(([key, value]) => <div className="sr-variable-row" key={key}><span>{fieldName(key)}</span><input disabled={!canEditUserFields} value={value || ''} onChange={(event) => changeVariable(key, event.target.value)} /></div>) : <p className="sr-no-variables">No additional catalog variables were submitted.</p>}
          <div className="sr-variable-row"><span>Impact</span>{isStaff ? <select value={draft.impact} onChange={(event) => change('impact', event.target.value)}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select> : <input disabled value={draft.impact} />}</div>
          <div className="sr-variable-row"><span>Urgency</span>{isStaff ? <select value={draft.urgency} onChange={(event) => change('urgency', event.target.value)}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select> : <input disabled value={draft.urgency} />}</div>
        </div>
      </section>

      {record.attachments?.length > 0 && <section className="sr-attachments"><h2>Attachments</h2>{record.attachments.map((attachment) => <a key={attachment.attachmentId} href={`/api/service-requests/${requestId}/attachments/${attachment.attachmentId}`} onClick={async (event) => { event.preventDefault(); try { const response = await fetch(event.currentTarget.href, { credentials: 'include' }); if (!response.ok) throw new Error('Could not download the attachment.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = attachment.fileName; link.click(); URL.revokeObjectURL(url) } catch (reason) { setError(reason.message) } }}>{attachment.fileName} · {Math.ceil(attachment.fileSize / 1024)} KB</a>)}</section>}

      {canApprove && <section className="sr-approval-panel"><strong>Approval required</strong><span>Approval status: {record.approvalStatus.replaceAll('_', ' ')}</span><div><button type="button" disabled={saving} onClick={() => decideApproval(true)}>Approve</button><button type="button" className="sr-reject-button" disabled={saving} onClick={() => decideApproval(false)}>Reject</button></div></section>}

      <section className="sr-activity-section"><header><h2>Notes</h2><span>Latest updates first</span></header>
        {canComment && <label className="sr-note-input"><span>Additional comments</span><textarea rows={3} maxLength={2000} value={comment} onChange={(event) => { setComment(event.target.value); setDirty(true) }} placeholder="Add a comment visible to the requester and IT…" /></label>}
        {isStaff && <label className="sr-note-input"><span>Work notes <small>Internal · IT staff only</small></span><textarea rows={3} maxLength={4000} value={workNote} onChange={(event) => { setWorkNote(event.target.value); setDirty(true) }} placeholder="Add an internal fulfillment note…" /></label>}
        {[...(record.activity || [])].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).map((entry) => <article className="sr-activity-item" key={entry.activityId}><small>{entry.type === 'WORK_NOTE' ? 'Internal note' : 'Comment'} · {entry.author} · {formatDate(entry.createdAt)}</small><p>{entry.text}</p></article>)}
        {!record.activity?.length && <p className="sr-no-variables">No comments or work notes yet.</p>}
      </section>

      <footer className="sr-record-footer"><span>Last updated {formatDate(record.updatedAt)}</span></footer>
    </form>
  </section>
}

export default ServiceRequestRecordPage
