import { notifyToast } from '../components/Toast.jsx'
import { useEffect, useMemo, useState } from 'react'

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'docx', 'xlsx'])

function calculatePriority(impact, urgency) {
  if (impact === 'HIGH') {
    if (urgency === 'HIGH') return 'P1'
    if (urgency === 'MEDIUM') return 'P2'
    return 'P3'
  }
  if (impact === 'MEDIUM') return urgency === 'HIGH' ? 'P2' : 'P3'
  return urgency === 'LOW' ? 'P4' : 'P3'
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readApiResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.message || 'Unable to complete your request. Please try again.')
    error.fieldErrors = body?.fieldErrors || {}
    throw error
  }
  return body
}

function FieldError({ children }) {
  return children ? <span className="incident-field-error" role="alert">{children}</span> : null
}

function RecordField({ label, value, readOnly = false, status = false, priority = null }) {
  return <label className="incident-create-field"><span>{label}</span><input disabled value={value || ''} className={status ? 'incident-create-state-value' : priority ? `incident-create-priority-value incident-create-priority-${priority.toLowerCase()}` : ''} /></label>
}

function IncidentPage({ user }) {
  const [options, setOptions] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [files, setFiles] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [createdTicket, setCreatedTicket] = useState('')
  const [createdIncident, setCreatedIncident] = useState(null)
  const [ticketNumberPreview, setTicketNumberPreview] = useState('')
  const [subcategories, setSubcategories] = useState([])
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false)
  const [callerQuery, setCallerQuery] = useState(user?.displayName || user?.username || '')
  const [callerResults, setCallerResults] = useState([])
  const [callerSearchLoading, setCallerSearchLoading] = useState(false)
  const [callerSearchError, setCallerSearchError] = useState('')
  const [callerSearchOpen, setCallerSearchOpen] = useState(false)
  const [selectedCaller, setSelectedCaller] = useState(user?.userId ? {
    userId: user.userId, username: user.username, employeeId: user.employeeId, displayName: user.displayName || user.username,
  } : null)
  const [form, setForm] = useState({
    title: '', description: '', requesterUserId: user?.userId ? String(user.userId) : '', department: '', location: '', categoryId: '', subcategoryId: '', contactType: 'SELF_CREATED',
    impact: 'MEDIUM', urgency: 'MEDIUM',
    comment: '', workNote: '',
  })

  const roles = user?.roles || []
  const canManage = roles.some((role) => ['SERVICE_DESK_AGENT', 'TEAM_LEAD', 'IT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role))
  const categories = options?.categories || []
  const selectedCategory = categories.find((category) => String(category.categoryId) === String(form.categoryId))
  const priority = useMemo(() => calculatePriority(form.impact, form.urgency), [form.impact, form.urgency])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/incidents/options', { credentials: 'include' }).then(readApiResponse),
      fetch('/api/incidents/next-number', { credentials: 'include' }).then(readApiResponse),
    ]).then(([loadedOptions, number]) => {
      if (!active) return
      setOptions(loadedOptions)
      setTicketNumberPreview(number.ticketNumber)
    }).catch((error) => {
      if (active) { setFormError(error.message); notifyToast(error.message, 'error', 'Incidents unavailable') }
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!form.categoryId) { setSubcategories([]); setSubcategoriesLoading(false); return undefined }
    const controller = new AbortController()
    setSubcategories([]); setSubcategoriesLoading(true)
    fetch(`/api/incidents/categories/${form.categoryId}/subcategories`, { credentials: 'include', signal: controller.signal })
      .then(readApiResponse)
      .then((result) => setSubcategories(result))
      .catch((error) => { if (error.name !== 'AbortError') { setFieldErrors((current) => ({ ...current, subcategoryId: error.message })); notifyToast(error.message, 'error', 'Subcategories unavailable') } })
      .finally(() => { if (!controller.signal.aborted) setSubcategoriesLoading(false) })
    return () => controller.abort()
  }, [form.categoryId])

  useEffect(() => {
    const query = callerQuery.trim()
    if (selectedCaller && query.toLocaleLowerCase() === selectedCaller.displayName?.toLocaleLowerCase()) {
      setCallerResults([]); setCallerSearchError(''); setCallerSearchLoading(false)
      return undefined
    }
    if (query.length < 3) { setCallerResults([]); setCallerSearchError(''); setCallerSearchLoading(false); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setCallerSearchLoading(true)
      fetch(`/api/service-requests/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
        .then(readApiResponse)
        .then((results) => { setCallerResults(results); setCallerSearchError('') })
        .catch((error) => { if (error.name !== 'AbortError') setCallerSearchError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setCallerSearchLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [callerQuery, selectedCaller])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value, ...(name === 'categoryId' ? { subcategoryId: '' } : {}) }))
    setCreatedIncident(null)
    setCreatedTicket('')
    setFieldErrors((current) => ({ ...current, [name]: '', ...(name === 'categoryId' ? { subcategoryId: '' } : {}) }))
    setFormError('')
  }

  function searchCaller(value) {
    setCallerQuery(value); setSelectedCaller(null); setCallerSearchOpen(true); setCallerSearchError('')
    setForm((current) => ({ ...current, requesterUserId: '' }))
    setFieldErrors((current) => ({ ...current, requesterUserId: '' }))
    setCreatedIncident(null); setCreatedTicket('')
  }

  function chooseCaller(entry) {
    setSelectedCaller(entry); setCallerQuery(entry.displayName); setCallerResults([]); setCallerSearchOpen(false)
    setForm((current) => ({ ...current, requesterUserId: String(entry.userId) }))
    setFieldErrors((current) => ({ ...current, requesterUserId: '' }))
    setCreatedIncident(null); setCreatedTicket('')
  }

  function validateForm() {
    const errors = {}
    if (form.title.trim().length < 5) errors.title = 'Enter a title with at least 5 characters.'
    else if (form.title.trim().length > 160) errors.title = 'Title must be 160 characters or fewer.'
    if (form.description.trim().length < 15) errors.description = 'Describe the issue in at least 15 characters.'
    else if (form.description.trim().length > 5000) errors.description = 'Description must be 5,000 characters or fewer.'
    if (!form.requesterUserId || !selectedCaller) errors.requesterUserId = 'Choose the caller from the user search results.'
    if (form.department.trim().length < 2) errors.department = 'Enter your department.'
    else if (form.department.trim().length > 120) errors.department = 'Department must be 120 characters or fewer.'
    if (!form.location) errors.location = 'Choose a location.'
    if (!form.categoryId) errors.categoryId = 'Choose a category.'
    if (!form.subcategoryId) errors.subcategoryId = 'Choose a subcategory.'
    if (!form.impact) errors.impact = 'Choose the business impact.'
    if (!form.urgency) errors.urgency = 'Choose the urgency.'
    if (form.comment.trim().length > 2000) errors.comment = 'Comment must be 2,000 characters or fewer.'
    if (form.workNote.trim().length > 4000) errors.workNote = 'Work notes must be 4,000 characters or fewer.'
    if (!canManage && form.workNote.trim()) errors.workNote = 'Only service desk staff can add internal work notes.'
    if (fieldErrors.attachments) errors.attachments = fieldErrors.attachments
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleFileSelection(event) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    const errors = []
    const accepted = []
    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension)) errors.push(`${file.name}: use PDF, PNG, JPG, TXT, CSV, DOCX, or XLSX.`)
      else if (file.size > MAX_FILE_SIZE) errors.push(`${file.name}: files must be 5 MB or smaller.`)
      else accepted.push(file)
    }
    if (files.length + accepted.length > MAX_ATTACHMENTS) errors.push('Attach no more than five files.')
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - files.length)
    setFiles((current) => [...current, ...accepted.slice(0, remainingSlots)])
    setFieldErrors((current) => ({ ...current, attachments: errors.join(' ') }))
  }

  async function submitIncident(event) {
    event.preventDefault()
    setCreatedTicket('')
    setCreatedIncident(null)
    setFormError('')
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        requesterUserId: Number(form.requesterUserId),
        department: form.department.trim(),
        categoryId: Number(form.categoryId),
        subcategoryId: Number(form.subcategoryId),
        comment: form.comment.trim() || null,
        workNote: form.workNote.trim() || null,
      }
      const body = new FormData()
      body.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
      files.forEach((file) => body.append('attachments', file))
      const response = await fetch('/api/incidents', { method: 'POST', credentials: 'include', body })
      const incident = await readApiResponse(response)
      setCreatedTicket(incident.ticketNumber)
      notifyToast(`Incident ${incident.ticketNumber} was created successfully.`, 'success', 'Incident created')
      setCreatedIncident(incident)
      setForm({ title: '', description: '', requesterUserId: user?.userId ? String(user.userId) : '', department: '', location: '', categoryId: '', subcategoryId: '', contactType: 'SELF_CREATED', impact: 'MEDIUM', urgency: 'MEDIUM', comment: '', workNote: '' })
      setCallerQuery(user?.displayName || user?.username || '')
      setSelectedCaller(user?.userId ? { userId: user.userId, username: user.username, employeeId: user.employeeId, displayName: user.displayName || user.username } : null)
      fetch('/api/incidents/next-number', { credentials: 'include' }).then(readApiResponse).then((number) => setTicketNumberPreview(number.ticketNumber)).catch(() => {})
      setFiles([])
      setFieldErrors({})
    } catch (error) {
      setFieldErrors(error.fieldErrors || {})
      setFormError(error.message)
      notifyToast(error.message, 'error', 'Incident creation failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="incident-page incident-create-page" aria-labelledby="incident-page-title">
      <header className="incident-create-toolbar">
        <div className="incident-create-record-title"><span className="incident-create-menu">☰</span><div><strong id="incident-page-title">Incident</strong><small>New record [Default view]</small></div></div>
        <div className="incident-create-toolbar-actions"><button type="submit" form="incident-create-form" disabled={isSubmitting || isLoading}>{isSubmitting ? 'Submitting…' : 'Submit'}</button><button type="button" disabled title="A new incident cannot be resolved before it is created">Resolve Incident</button></div>
      </header>

      {createdTicket && <div className="incident-success" role="status"><span className="incident-success-check">✓</span><span><strong>Incident created</strong><small>{createdTicket} has been saved.</small></span></div>}
      {formError && !createdTicket && <div className="incident-form-alert" role="alert"><strong>We couldn’t submit this incident.</strong><span>{formError}</span></div>}

      <form id="incident-create-form" className="incident-create-record-form" onSubmit={submitIncident} noValidate>
        <div className="incident-create-columns">
          <div className="incident-create-column">
            <RecordField label="Number" value={createdIncident?.ticketNumber || ticketNumberPreview || 'Loading number…'} readOnly />
            <label className="incident-create-field"><span>Caller <b>*</b></span><div className="request-user-search"><div className="request-user-input-wrap"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={callerSearchOpen && callerQuery.trim().length >= 3} aria-controls="incident-caller-results" value={callerQuery} autoComplete="off" placeholder="Name, employee ID, or username" onChange={(event) => searchCaller(event.target.value)} onFocus={() => { if (callerQuery.trim().length >= 3) setCallerSearchOpen(true) }} onBlur={() => setTimeout(() => setCallerSearchOpen(false), 150)} aria-invalid={Boolean(fieldErrors.requesterUserId)} />{callerSearchLoading && <span className="request-user-search-spinner" aria-label="Searching users" />}</div>{callerSearchOpen && callerQuery.trim().length >= 3 && <ul className="request-user-results" id="incident-caller-results" role="listbox">{callerResults.map((entry) => <li key={entry.userId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCaller(entry)}><strong>{entry.displayName}</strong><small>{entry.employeeId || 'No employee ID'} · {entry.username}</small></button></li>)}{!callerSearchLoading && callerResults.length === 0 && !callerSearchError && <li className="request-user-no-results">No active users found.</li>}</ul>}{!selectedCaller && callerQuery.trim().length < 3 && <small className="request-user-hint">Enter at least 3 characters to search.</small>}{callerSearchError && <span className="incident-field-error" role="alert">{callerSearchError}</span>}<FieldError>{fieldErrors.requesterUserId}</FieldError></div></label>
            <label className="incident-create-field"><span>Location <b>*</b></span><select name="location" value={form.location} onChange={updateField} aria-invalid={Boolean(fieldErrors.location)} disabled={isLoading}><option value="">Select a location</option>{(options?.locations || []).map((location) => <option value={location} key={location}>{location}</option>)}</select><FieldError>{fieldErrors.location}</FieldError></label>
            <label className="incident-create-field"><span>Category <b>*</b></span><select name="categoryId" value={form.categoryId} onChange={updateField} aria-invalid={Boolean(fieldErrors.categoryId)} disabled={isLoading || !categories.length}><option value="">{isLoading ? 'Loading categories…' : '— None —'}</option>{categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.categoryName}</option>)}</select><FieldError>{fieldErrors.categoryId}</FieldError></label>
            <label className="incident-create-field"><span>Subcategory <b>*</b></span><select name="subcategoryId" value={form.subcategoryId} onChange={updateField} aria-invalid={Boolean(fieldErrors.subcategoryId)} disabled={!selectedCategory || subcategoriesLoading}><option value="">{!selectedCategory ? 'Select category first' : subcategoriesLoading ? 'Loading subcategories…' : '— None —'}</option>{subcategories.map((subcategory) => <option value={subcategory.subcategoryId} key={subcategory.subcategoryId}>{subcategory.subcategoryName}</option>)}</select><FieldError>{fieldErrors.subcategoryId}</FieldError></label>
            <label className="incident-create-field"><span>Impact <b>*</b></span><select name="impact" value={form.impact} onChange={updateField} aria-invalid={Boolean(fieldErrors.impact)}><option value="HIGH">1 - High</option><option value="MEDIUM">2 - Medium</option><option value="LOW">3 - Low</option></select><FieldError>{fieldErrors.impact}</FieldError></label>
            <label className="incident-create-field"><span>Urgency <b>*</b></span><select name="urgency" value={form.urgency} onChange={updateField} aria-invalid={Boolean(fieldErrors.urgency)}><option value="HIGH">1 - High</option><option value="MEDIUM">2 - Medium</option><option value="LOW">3 - Low</option></select><FieldError>{fieldErrors.urgency}</FieldError></label>
            <RecordField label="Priority" value={`${priority} - ${priority === 'P1' ? 'Critical' : priority === 'P2' ? 'High' : priority === 'P3' ? 'Moderate' : 'Low'}`} readOnly priority={priority} />
            <label className="incident-create-field"><span>Department <b>*</b></span><input name="department" value={form.department} onChange={updateField} maxLength={120} placeholder="Enter department" aria-invalid={Boolean(fieldErrors.department)} /><FieldError>{fieldErrors.department}</FieldError></label>
          </div>
          <div className="incident-create-column">
            {createdIncident && <RecordField label="Opened" value={formatDate(createdIncident.createdAt)} readOnly />}
            <RecordField label="Opened by" value={user?.displayName || user?.username || 'Signed-in user'} readOnly />
            <label className="incident-create-field"><span>Contact type</span><select name="contactType" value={form.contactType} onChange={updateField}><option value="SELF_CREATED">Self Created</option><option value="ON_CALL">On Call</option><option value="SUPPORT_TEAM">Through Support Team</option></select></label>
            <RecordField label="State" value="New" readOnly status />
            <RecordField label="Assignment group" value={createdIncident?.assignedGroup || 'Automation Field'} readOnly />
            <RecordField label="Assigned to" value={createdIncident?.assignedAgent || 'Automation Field'} readOnly />
            {createdIncident && <RecordField label="Due date" value={formatDate(createdIncident.dueDate)} readOnly />}
          </div>
        </div>
        <label className="incident-create-wide-field"><span>Short description <b>*</b></span><div className="incident-create-input-with-actions"><input name="title" value={form.title} onChange={updateField} maxLength={160} placeholder="Briefly describe the issue" aria-invalid={Boolean(fieldErrors.title)} /><button type="button" title="Suggestion">✦</button></div><small><FieldError>{fieldErrors.title}</FieldError>{form.title.length}/160</small></label>
        <label className="incident-create-wide-field"><span>Description <b>*</b></span><textarea name="description" value={form.description} onChange={updateField} maxLength={5000} rows={3} placeholder="What were you trying to do? What happened? Include any error message and steps already tried." aria-invalid={Boolean(fieldErrors.description)} /><small><FieldError>{fieldErrors.description}</FieldError>{form.description.length}/5,000</small></label>
        <label className="incident-create-wide-field"><span>Additional comments <small>(Customer visible)</small></span><textarea name="comment" value={form.comment} onChange={updateField} maxLength={2000} rows={3} placeholder="Add a comment visible to the requester and support team…" aria-invalid={Boolean(fieldErrors.comment)} /><small><FieldError>{fieldErrors.comment}</FieldError>{form.comment.length}/2,000</small></label>
        {canManage && <label className="incident-create-wide-field incident-create-work-notes"><span>Work notes <small>(Internal)</small></span><textarea name="workNote" value={form.workNote} onChange={updateField} maxLength={4000} rows={3} placeholder="Internal notes, visible only to support staff…" aria-invalid={Boolean(fieldErrors.workNote)} /><small><FieldError>{fieldErrors.workNote}</FieldError>{form.workNote.length}/4,000</small></label>}
        <label className="incident-create-active"><span>Active</span><input type="checkbox" checked disabled readOnly /><small>New incidents are active automatically.</small></label>
        <div className="incident-create-wide-field"><span>Attachments <small>(Optional · up to 5 files)</small></span><label className="incident-upload-zone"><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={handleFileSelection} disabled={files.length >= MAX_ATTACHMENTS} /><span className="incident-upload-icon" aria-hidden="true">↑</span><span><strong>Choose files to upload</strong><small>PDF, PNG, JPG, TXT, CSV, DOCX or XLSX · 5 MB each</small></span></label><FieldError>{fieldErrors.attachments}</FieldError>{files.length > 0 && <ul className="incident-file-list">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}`}><span className="incident-file-type">{file.name.split('.').pop()?.toUpperCase()}</span><span className="incident-file-name"><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); setFieldErrors((current) => ({ ...current, attachments: '' })) }}>Remove</button></li>)}</ul>}</div>
        <div className="incident-create-footer"><span>Fields marked <b>*</b> are required.</span><button type="submit" disabled={isSubmitting || isLoading}>{isSubmitting ? 'Submitting…' : 'Submit'}</button></div>
      </form>

    </section>
  )
}

export default IncidentPage
