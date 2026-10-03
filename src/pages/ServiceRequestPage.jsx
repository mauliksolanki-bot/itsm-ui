import { notifyToast } from '../components/Toast.jsx'
import { useEffect, useState } from 'react'
import ServiceRequestRecordPage from './ServiceRequestRecordPage.jsx'
import './ServiceRequestPage.css'

const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ACCEPTED_FILES = new Set(['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'docx', 'xlsx'])
const TYPE_LABELS = {
  NEW_REQUEST: 'New Request', MODIFICATION: 'Modification', RENEWAL: 'Renewal', REPLACEMENT: 'Replacement',
  UPGRADE: 'Upgrade', DOWNGRADE: 'Downgrade', DECOMMISSION: 'Decommission', INFORMATION_REQUEST: 'Information Request',
}
const STATUS_LABELS = {
  NEW: 'New', PENDING_APPROVAL: 'Pending Approval', APPROVED: 'Approved', REJECTED: 'Rejected', ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress', PENDING_USER: 'Pending User', PENDING_VENDOR: 'Pending Vendor', FULFILLED: 'Fulfilled',
  COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}
const NEXT_STATUSES = {
  NEW: ['ASSIGNED'], APPROVED: ['ASSIGNED'], ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_USER', 'PENDING_VENDOR', 'FULFILLED'],
  PENDING_USER: ['IN_PROGRESS'], PENDING_VENDOR: ['IN_PROGRESS'], FULFILLED: ['COMPLETED'], COMPLETED: ['CLOSED'],
}

async function responseBody(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.message || 'Unable to complete this request. Please try again.')
    error.fieldErrors = body?.fieldErrors || {}
    throw error
  }
  return body
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function FieldError({ children }) {
  return children ? <span className="request-field-error" role="alert">{children}</span> : null
}

function RequestPriority({ value }) {
  return <span className={`incident-priority incident-priority-${String(value || 'P3').toLowerCase()}`}>{value || 'P3'}</span>
}

function priorityLabel(value) {
  return `${value} - ${{ P1: 'Critical', P2: 'High', P3: 'Moderate', P4: 'Low' }[value] || 'Moderate'}`
}

function ServiceIcon({ code }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const icons = {
    HARDWARE: <><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M8 20h8m-4-4v4" /></>,
    SOFTWARE: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 8h17M8 13l-2 2 2 2m8-4 2 2-2 2m-3-5-2 6" /></>,
    ACCESS_MANAGEMENT: <><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2" /></>,
    NETWORK: <><circle cx="12" cy="5" r="2.2" /><circle cx="5.5" cy="18" r="2.2" /><circle cx="18.5" cy="18" r="2.2" /><path d="m10.8 7-4.1 8.8m6.5-8.8 4.1 8.8M7.7 18h8.6" /></>,
    EMAIL_COLLABORATION: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    ACCOUNT_IDENTITY: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.5-3.2 3.2-5 7-5s6.5 1.8 7 5" /></>,
    CLOUD_SERVICES: <><path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 9.2 4.4 4.4 0 0 0 7 18Z" /></>,
    APPLICATION_SERVICES: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    SECURITY: <><path d="M12 3 19 6v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    TELEPHONY: <><path d="M6.2 4.5h3l1.5 4-2 1.7a15 15 0 0 0 5.1 5.1l1.7-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 6.7a2 2 0 0 1 2-2.2Z" /></>,
    OTHER: <><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
  }
  return <svg {...common}>{icons[code] || icons.OTHER}</svg>
}

function derivedPriority(impact, urgency) {
  if (impact === 'HIGH' && urgency === 'HIGH') return 'P1'
  if ((impact === 'HIGH' && urgency === 'MEDIUM') || (impact === 'MEDIUM' && urgency === 'HIGH')) return 'P2'
  if (impact === 'LOW' && urgency === 'LOW') return 'P4'
  return 'P3'
}

function moreUrgentPriority(left, right) {
  return Number(String(left || 'P3').slice(1)) < Number(String(right || 'P3').slice(1)) ? left : right
}

function ServiceRequestCatalogPage({ user }) {
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [pageError, setPageError] = useState('')
  const [createdNumber, setCreatedNumber] = useState('')
  const [numberPreview, setNumberPreview] = useState('')
  const [categories, setCategories] = useState([])
  const [catalogItems, setCatalogItems] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [requestedForQuery, setRequestedForQuery] = useState(user?.displayName || user?.username || '')
  const [requestedForResults, setRequestedForResults] = useState([])
  const [requestedForSearchLoading, setRequestedForSearchLoading] = useState(false)
  const [requestedForSearchError, setRequestedForSearchError] = useState('')
  const [requestedForSearchOpen, setRequestedForSearchOpen] = useState(false)
  const [selectedRequestedFor, setSelectedRequestedFor] = useState(user?.userId ? {
    userId: user.userId, username: user.username, employeeId: user.employeeId,
    displayName: user.displayName || user.username, managerName: user.managerName,
  } : null)
  const [form, setForm] = useState({
    requestedForUserId: user?.userId ? String(user.userId) : '',
    serviceId: '', categoryName: '', catalogItemId: '', requestType: 'NEW_REQUEST',
    shortDescription: '', description: '', impact: 'MEDIUM', urgency: 'MEDIUM',
    assignedGroupId: '', assignedAgentId: '', expectedCompletionDate: '',
    details: {}, comment: '', workNote: '',
  })

  const roles = user?.roles || []
  const canManage = roles.some((role) => ['SERVICE_DESK_AGENT', 'TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role))
  const services = options?.services || []
  const service = services.find((entry) => String(entry.serviceId) === String(form.serviceId))
  const item = catalogItems.find((entry) => String(entry.catalogItemId) === String(form.catalogItemId))
  const requestedForUser = selectedRequestedFor
  const requestPriority = item ? moreUrgentPriority(item.defaultPriority, derivedPriority(form.impact, form.urgency)) : 'P3'

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetch('/api/service-requests/options', { credentials: 'include' }).then(responseBody),
      fetch('/api/service-requests/next-number', { credentials: 'include' }).then(responseBody),
    ]).then(([loadedOptions, number]) => {
      if (!mounted) return
      setOptions(loadedOptions)
      setNumberPreview(number.ticketNumber)
    }).catch((error) => { if (mounted) { setPageError(error.message); notifyToast(error.message, 'error', 'Service requests unavailable') } })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!form.serviceId) { setCategories([]); setCategoriesLoading(false); return undefined }
    const controller = new AbortController()
    setCategories([])
    setCatalogItems([])
    setCategoriesLoading(true)
    fetch(`/api/service-requests/services/${form.serviceId}/categories`, { credentials: 'include', signal: controller.signal })
      .then(responseBody)
      .then(setCategories)
      .catch((error) => { if (error.name !== 'AbortError') { setErrors((current) => ({ ...current, categoryName: error.message })); notifyToast(error.message, 'error', 'Categories unavailable') } })
      .finally(() => { if (!controller.signal.aborted) setCategoriesLoading(false) })
    return () => controller.abort()
  }, [form.serviceId])

  useEffect(() => {
    if (!form.serviceId || !form.categoryName) { setCatalogItems([]); setItemsLoading(false); return undefined }
    const controller = new AbortController()
    setCatalogItems([])
    setItemsLoading(true)
    fetch(`/api/service-requests/services/${form.serviceId}/categories/${encodeURIComponent(form.categoryName)}/items`, { credentials: 'include', signal: controller.signal })
      .then(responseBody)
      .then(setCatalogItems)
      .catch((error) => { if (error.name !== 'AbortError') { setErrors((current) => ({ ...current, catalogItemId: error.message })); notifyToast(error.message, 'error', 'Catalog items unavailable') } })
      .finally(() => { if (!controller.signal.aborted) setItemsLoading(false) })
    return () => controller.abort()
  }, [form.serviceId, form.categoryName])

  useEffect(() => {
    const query = requestedForQuery.trim()
    if (selectedRequestedFor && query.toLocaleLowerCase() === selectedRequestedFor.displayName?.toLocaleLowerCase()) {
      setRequestedForResults([])
      setRequestedForSearchError('')
      setRequestedForSearchLoading(false)
      return undefined
    }
    if (query.length < 3) {
      setRequestedForResults([])
      setRequestedForSearchError('')
      setRequestedForSearchLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setRequestedForSearchLoading(true)
      fetch(`/api/service-requests/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
        .then(responseBody)
        .then((results) => { setRequestedForResults(results); setRequestedForSearchError('') })
        .catch((error) => { if (error.name !== 'AbortError') setRequestedForSearchError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setRequestedForSearchLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [requestedForQuery, selectedRequestedFor])

  function change(field, value) {
    setCreatedNumber('')
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setPageError('')
  }

  function searchRequestedFor(value) {
    setRequestedForQuery(value)
    setSelectedRequestedFor(null)
    setRequestedForSearchOpen(true)
    setRequestedForSearchError('')
    setForm((current) => ({ ...current, requestedForUserId: '' }))
    setErrors((current) => ({ ...current, requestedForUserId: '' }))
  }

  function selectRequestedFor(entry) {
    setSelectedRequestedFor(entry)
    setRequestedForQuery(entry.displayName)
    setRequestedForResults([])
    setRequestedForSearchOpen(false)
    setForm((current) => ({ ...current, requestedForUserId: String(entry.userId) }))
    setErrors((current) => ({ ...current, requestedForUserId: '' }))
  }

  function chooseService(serviceId) {
    setCreatedNumber('')
    setForm((current) => ({ ...current, serviceId: String(serviceId || ''), categoryName: '', catalogItemId: '', details: {}, shortDescription: '' }))
    setErrors({})
  }

  function chooseCategory(categoryName) {
    setCreatedNumber('')
    setForm((current) => ({ ...current, categoryName, catalogItemId: '', details: {}, shortDescription: '' }))
    setErrors((current) => ({ ...current, categoryName: '', catalogItemId: '' }))
  }

  function chooseItem(catalogItemId) {
    const nextItem = catalogItems.find((entry) => String(entry.catalogItemId) === String(catalogItemId))
    setCreatedNumber('')
    setForm((current) => ({ ...current, catalogItemId: String(catalogItemId || ''), shortDescription: nextItem ? `Request ${nextItem.itemName}` : '', details: {} }))
    setErrors((current) => ({ ...current, catalogItemId: '' }))
  }

  function validate() {
    const next = {}
    if (!form.requestedForUserId) next.requestedForUserId = 'Choose who needs this service.'
    if (!form.serviceId) next.serviceId = 'Choose a service.'
    if (!form.categoryName) next.categoryName = 'Choose a category.'
    if (!form.catalogItemId) next.catalogItemId = 'Choose a catalog item.'
    if (!form.requestType) next.requestType = 'Choose a request type.'
    if (form.shortDescription.trim().length < 5) next.shortDescription = 'Enter at least 5 characters.'
    else if (form.shortDescription.trim().length > 160) next.shortDescription = 'Use 160 characters or fewer.'
    const descriptionText = form.description.trim()
    if (descriptionText.length < 10) next.description = 'Describe the requirement in at least 10 characters.'
    else if (descriptionText.length > 5000) next.description = 'Use 5,000 characters or fewer.'
    if (form.comment.trim().length > 2000) next.comment = 'Use 2,000 characters or fewer.'
    if (form.workNote.trim().length > 4000) next.workNote = 'Use 4,000 characters or fewer.'
    if (!canManage && form.workNote.trim()) next.workNote = 'Only IT staff can add internal work notes.'
    if (files.length > (options?.maxAttachmentCount || MAX_FILES)) next.attachments = 'Remove files so there are no more than five.'
    for (const file of files) {
      if (file.size > (options?.maxAttachmentBytes || MAX_FILE_SIZE)) next.attachments = `${file.name} is larger than 5 MB.`
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function selectFiles(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    const allowed = []
    const problems = []
    for (const file of selected) {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!ACCEPTED_FILES.has(extension)) problems.push(`${file.name}: use PDF, PNG, JPG, TXT, CSV, DOCX, or XLSX.`)
      else if (file.size > MAX_FILE_SIZE) problems.push(`${file.name}: maximum size is 5 MB.`)
      else allowed.push(file)
    }
    setFiles((current) => [...current, ...allowed].slice(0, MAX_FILES))
    setErrors((current) => ({ ...current, attachments: problems.join(' ') || (files.length + allowed.length > MAX_FILES ? 'Attach no more than five files.' : '') }))
  }

  async function submit(event) {
    event.preventDefault()
    setCreatedNumber('')
    if (!validate()) return
    setSubmitting(true)
    setPageError('')
    try {
      const payload = {
        requestedForUserId: Number(form.requestedForUserId), serviceId: Number(form.serviceId),
        catalogItemId: Number(form.catalogItemId), requestType: form.requestType,
        shortDescription: form.shortDescription.trim(), description: form.description.trim(),
        impact: form.impact, urgency: form.urgency,
        expectedCompletionDate: form.expectedCompletionDate || null, details: form.details,
        comment: form.comment.trim() || null, workNote: canManage ? form.workNote.trim() || null : null,
      }
      const body = new FormData()
      body.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
      files.forEach((file) => body.append('attachments', file))
      const created = await responseBody(await fetch('/api/service-requests', { method: 'POST', credentials: 'include', body }))
      setCreatedNumber(created.requestNumber)
      notifyToast(`Request ${created.requestNumber} was submitted successfully.`, 'success', 'Request submitted')
      setForm({ requestedForUserId: user?.userId ? String(user.userId) : '', serviceId: '', categoryName: '', catalogItemId: '', requestType: 'NEW_REQUEST', shortDescription: '', description: '', impact: 'MEDIUM', urgency: 'MEDIUM', assignedGroupId: '', assignedAgentId: '', expectedCompletionDate: '', details: {}, comment: '', workNote: '' })
      setSelectedRequestedFor(user?.userId ? { userId: user.userId, username: user.username, employeeId: user.employeeId, displayName: user.displayName || user.username, managerName: user.managerName } : null)
      setRequestedForQuery(user?.displayName || user?.username || '')
      setRequestedForResults([])
      setFiles([])
      setErrors({})
      fetch('/api/service-requests/next-number', { credentials: 'include' }).then(responseBody).then((number) => setNumberPreview(number.ticketNumber)).catch(() => {})
    } catch (error) {
      setErrors(error.fieldErrors || {})
      setPageError(error.message)
      notifyToast(error.message, 'error', 'Request submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="service-request-page service-request-record-page" aria-labelledby="service-request-title">
      {createdNumber && <div className="request-alert request-success" role="status"><strong>Request submitted</strong><span>{createdNumber} has been saved.</span></div>}
      {pageError && <div className="request-alert" role="alert"><strong>We couldn’t submit this request.</strong><span>{pageError}</span></div>}

      <header className="request-record-toolbar">
        <div className="request-record-heading"><span className="request-record-menu" aria-hidden="true">☰</span><div><strong id="service-request-title">Service Request</strong><small>New record [Default view]</small></div></div>
        <button type="submit" form="service-request-create-form" disabled={submitting || loading}>{submitting ? 'Submitting…' : 'Submit'}</button>
      </header>

      <form id="service-request-create-form" className="service-request-form request-record-form" onSubmit={submit} noValidate>
        <section className="request-ci-section"><header className="request-ci-section-heading"><span className="request-ci-section-marker"/><div><h2>Request Information</h2><p>Choose the requester, service, and fulfillment details.</p></div></header><div className="request-record-columns">
          <div className="request-record-column">
            <div className="request-field"><span>Number</span><div className="request-auto-value request-record-readonly">{numberPreview || 'Loading number…'}</div></div>
            <label className="request-field request-for-field"><span>Requested for <b>*</b></span><div className="request-user-search"><div className="request-user-input-wrap"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={requestedForSearchOpen && requestedForQuery.trim().length >= 3} aria-controls="requested-for-results" value={requestedForQuery} autoComplete="off" placeholder="Name, employee ID, or username" onChange={(event) => searchRequestedFor(event.target.value)} onFocus={() => { if (requestedForQuery.trim().length >= 3) setRequestedForSearchOpen(true) }} onBlur={() => setTimeout(() => setRequestedForSearchOpen(false), 150)} aria-invalid={Boolean(errors.requestedForUserId)} />{requestedForSearchLoading && <span className="request-user-search-spinner" aria-label="Searching users" />}</div>{requestedForSearchOpen && requestedForQuery.trim().length >= 3 && <ul className="request-user-results" id="requested-for-results" role="listbox">{requestedForResults.map((entry) => <li key={entry.userId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectRequestedFor(entry)}><strong>{entry.displayName}</strong><small>{entry.employeeId || 'No employee ID'} · {entry.username}</small></button></li>)}{!requestedForSearchLoading && requestedForResults.length === 0 && !requestedForSearchError && <li className="request-user-no-results">No active users found.</li>}</ul>}{!selectedRequestedFor && requestedForQuery.trim().length < 3 && <small className="request-user-hint">Enter at least 3 characters to search.</small>}{requestedForSearchError && <span className="request-field-error" role="alert">{requestedForSearchError}</span>}<FieldError>{errors.requestedForUserId}</FieldError></div></label>
            <label className="request-field"><span>Service <b>*</b></span><select value={form.serviceId} onChange={(event) => chooseService(event.target.value)} aria-invalid={Boolean(errors.serviceId)}><option value="">Select a service</option>{services.map((entry) => <option value={entry.serviceId} key={entry.serviceId}>{entry.serviceName}</option>)}</select><FieldError>{errors.serviceId}</FieldError></label>
            <label className="request-field"><span>Category <b>*</b></span><select value={form.categoryName} onChange={(event) => chooseCategory(event.target.value)} disabled={!service || categoriesLoading} aria-invalid={Boolean(errors.categoryName)}><option value="">{!service ? 'Choose a service first' : categoriesLoading ? 'Loading categories…' : 'Select a category'}</option>{categories.map((entry) => <option value={entry} key={entry}>{entry}</option>)}</select><FieldError>{errors.categoryName}</FieldError></label>
            <label className="request-field"><span>Item <b>*</b></span><select value={form.catalogItemId} onChange={(event) => chooseItem(event.target.value)} disabled={!form.categoryName || itemsLoading} aria-invalid={Boolean(errors.catalogItemId)}><option value="">{!form.categoryName ? 'Choose a category first' : itemsLoading ? 'Loading items…' : 'Select a catalog item'}</option>{catalogItems.map((entry) => <option value={entry.catalogItemId} key={entry.catalogItemId}>{entry.itemName}</option>)}</select><FieldError>{errors.catalogItemId}</FieldError></label>
            <label className="request-field"><span>Request type <b>*</b></span><select value={form.requestType} onChange={(event) => change('requestType', event.target.value)}>{(options?.requestTypes || Object.keys(TYPE_LABELS)).map((type) => <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>)}</select><FieldError>{errors.requestType}</FieldError></label>
          </div>
          <div className="request-record-column">
            <div className="request-field"><span>Requested by</span><div className="request-auto-value request-record-readonly">{user?.displayName || user?.username}</div></div>
            <div className="request-field"><span>Opened</span><div className="request-auto-value request-record-readonly">Set when submitted</div></div>
            <div className="request-field"><span>Assignment group</span><div className="request-auto-value request-record-readonly">{item?.assignedGroupName || 'Auto-assigned from catalog'}</div></div>
            <div className="request-field"><span>Assigned to</span><div className="request-auto-value request-record-readonly">Automation Field</div></div>
            <div className="request-field"><span>State</span><div className="request-auto-value request-record-readonly">{item?.approvalRequired ? 'Pending Approval' : 'New'}</div></div>
            <div className="request-field"><span>Priority</span><div className="request-auto-value request-record-readonly">{priorityLabel(requestPriority)}</div></div>
          </div>
        </div></section>

        <section className="request-ci-section"><header className="request-ci-section-heading"><span className="request-ci-section-marker"/><div><h2>Request Details</h2><p>Summarize the request and provide the information needed to fulfill it.</p></div></header><div className="request-ci-details-grid">
          <label className="request-field request-record-short-description"><span>Short description <b>*</b></span><input value={form.shortDescription} maxLength={160} placeholder="e.g. Request VPN access for a new project" onChange={(event) => change('shortDescription', event.target.value)} aria-invalid={Boolean(errors.shortDescription)} /><FieldError>{errors.shortDescription}</FieldError></label>
          <label className="request-field request-record-description"><span>Description <b>*</b></span><div><textarea className="request-plain-description" value={form.description} maxLength={5000} rows={5} placeholder="Describe the requirement, business purpose, and any constraints." onChange={(event) => change('description', event.target.value)} aria-invalid={Boolean(errors.description)} /><small className="request-counter">{form.description.length}/5,000</small><FieldError>{errors.description}</FieldError></div></label>
        </div></section>

        <section className="request-notes-section"><header><span className="request-variables-mark">✎</span><div><h2>Notes and attachments</h2><p>Provide context for the fulfillment team.</p></div></header><div className="request-fields-grid">
          <label className="request-field request-field-wide"><span>Comments <small>Visible to the requester and IT</small></span><textarea value={form.comment} maxLength={2000} rows={3} onChange={(event) => change('comment', event.target.value)} placeholder="Additional information…" /><FieldError>{errors.comment}</FieldError></label>
          {canManage && <label className="request-field request-field-wide"><span>Work notes <small>Internal · visible only to IT staff</small></span><textarea value={form.workNote} maxLength={4000} rows={3} onChange={(event) => change('workNote', event.target.value)} placeholder="Internal fulfillment notes…" /><FieldError>{errors.workNote}</FieldError></label>}
          <div className="request-field request-field-wide"><span>Attachments <small>Up to 5 files, 5 MB each</small></span><label className="request-upload"><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={selectFiles} /><strong>Choose supporting files</strong><small>PDF, PNG, JPG, TXT, CSV, DOCX or XLSX</small></label><FieldError>{errors.attachments}</FieldError>{files.length > 0 && <ul className="request-file-list">{files.map((file, index) => <li key={file.name + '-' + file.lastModified}><span>{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button></li>)}</ul>}</div>
        </div></section>
      </form>
    </section>
  )
}

function ServiceRequestPage({ user, requestId }) {
  return requestId ? <ServiceRequestRecordPage requestId={requestId} user={user} /> : <ServiceRequestCatalogPage user={user} />
}

export default ServiceRequestPage
