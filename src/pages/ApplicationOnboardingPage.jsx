import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import { notifyToast } from '../components/Toast.jsx'
import './ServiceRequestPage.css'
import './ApplicationOnboardingPage.css'

const CI_CLASSES = ['Server', 'Application', 'Database', 'Network Device', 'Storage', 'Virtual Machine', 'Cloud Resource', 'Endpoint', 'Software', 'Business Service', 'Application Service', 'API', 'Middleware']
const CI_TYPES = ['Application Server', 'Database Server', 'Web Application', 'Mobile Application', 'Desktop Application', 'API', 'Microservice', 'Batch Application', 'Router', 'Switch', 'Firewall', 'Load Balancer', 'Storage', 'Virtual Machine', 'Cloud Resource', 'Endpoint', 'Software', 'Business Service', 'Application Service', 'Middleware', 'Other']
const STATUSES = ['Planned', 'Ordered', 'Installed', 'Operational', 'Maintenance', 'Retired', 'Disposed']
const ENVIRONMENTS = ['Development', 'QA', 'UAT', 'Staging', 'Production', 'DR']
const CRITICALITIES = ['Critical', 'High', 'Medium', 'Low']
const LIFECYCLE_STATUSES = ['Planning', 'Procurement', 'Implementation', 'Production', 'Maintenance', 'Retirement', 'Retired', 'Disposed']
const TECHNOLOGIES = ['Java', 'Spring Boot', 'React', 'Angular', 'Next.js', 'Node.js', 'Python', '.NET']
const VENDORS = ['Amazon Web Services', 'Cisco', 'Dell', 'Google Cloud', 'HPE', 'Microsoft', 'Oracle', 'Other']
const DATA_CENTERS = ['North America Data Center', 'South America Data Center', 'Mumbai Data Center', 'Hyderabad Data Center', 'Global Data Center', 'Malaysia Data Center', 'Hong Kong Data Center', 'Dubai Data Center', 'China Data Center']
const REGIONS = ['North America', 'South America', 'Europe', 'Asia Pacific', 'Middle East', 'Global']
const CLOUD_PROVIDERS = ['AWS', 'Microsoft Azure', 'Google Cloud', 'Oracle Cloud']
const TABS = ['Basic Information', 'Ownership', 'Location', 'Technical', 'Lifecycle', 'Relationships', 'Monitoring', 'Security', 'Financial', 'Notes']
const INITIAL_BASE = { ciName: '', ciClass: '', ciType: '', status: '', environment: '', criticality: '', description: '', businessOwner: null, technicalOwner: null, supportGroup: null }
const INITIAL_DETAILS = { relationships: [], customAttributes: {} }

async function responseBody(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to complete this request. Please try again.')
  return body
}

function CIField({ label, value, onChange, type = 'text', options = [], placeholder = '', error, wide = false, rows = 3, disabled = false, required = false, hint = '' }) {
  return <label className={`ci-field${wide ? ' ci-field-wide' : ''}`}>
    <span>{label}{required && <> <b>*</b></>}</span>
    {type === 'textarea' ? <textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} />
      : type === 'select' ? <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} disabled={disabled}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => { const item = typeof option === 'string' ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option> })}</select>
        : <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} disabled={disabled} />}
    {hint && <small>{hint}</small>}
    {error && <small className="request-field-error" role="alert">{error}</small>}
  </label>
}

function MultiSelectField({ label, values = [], onChange, options }) {
  function toggle(option) { onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]) }
  return <fieldset className="ci-field ci-multi-field"><legend>{label}</legend><div className="ci-choice-list">{options.map((option) => <label className={`ci-choice${values.includes(option) ? ' ci-choice-selected' : ''}`} key={option}><input type="checkbox" checked={values.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div></fieldset>
}

function ToggleField({ label, value, onChange }) {
  return <label className="ci-toggle-field"><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span className="ci-toggle-track" aria-hidden="true" /></label>
}

function ConfiguredAttributeField({ attribute, value, error, onChange }) {
  const options = (attribute.choices || []).map((choice) => ({ value: choice.value, label: choice.label }))
  if (attribute.dataType === 'MULTI_SELECT') return <MultiSelectField label={`${attribute.label}${attribute.required ? ' *' : ''}`} values={Array.isArray(value) ? value : []} options={options.map((option) => option.value)} onChange={onChange} />
  if (attribute.dataType === 'DROPDOWN') return <CIField label={attribute.label} type="select" options={options} value={value || ''} onChange={onChange} required={attribute.required} error={error} />
  const type = ({ NUMBER: 'number', DECIMAL: 'number', DATE: 'date', DATETIME: 'datetime-local', EMAIL: 'email', URL: 'url', TEXT_AREA: 'textarea' })[attribute.dataType] || 'text'
  if (attribute.dataType === 'BOOLEAN') return <CIField label={attribute.label} type="select" options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} value={value ?? ''} onChange={onChange} required={attribute.required} error={error} />
  return <CIField label={attribute.label} type={type} value={value ?? ''} onChange={onChange} required={attribute.required} error={error} hint={attribute.helpText || ''} wide={attribute.dataType === 'TEXT_AREA'} />
}

function UserSearchField({ label, kind = 'owners', required = false, value, onSelect, error }) {
  const [query, setQuery] = useState(value?.displayName || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 3) { setResults([]); setLoading(false); setSearchError(''); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/application-onboarding/${kind}/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: controller.signal })
        .then(responseBody).then(setResults)
        .catch((failure) => { if (failure.name !== 'AbortError') setSearchError(failure.message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [kind, query])

  function changeQuery(next) { setQuery(next); setOpen(true); onSelect(null) }
  function choose(user) { onSelect(user); setQuery(user.displayName); setOpen(false); setResults([]); setSearchError('') }

  return <div className={`ci-field ci-search-field${open && query.trim().length >= 3 ? ' ci-search-field-open' : ''}`}>
    <label><span>{label}{required && <> <b>*</b></>}</span><div className="ci-search-control"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={open && query.trim().length >= 3} value={query} autoComplete="off" placeholder="Name, employee ID, or username" onChange={(event) => changeQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 3) setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-invalid={Boolean(error)} />{loading && <i className="ci-search-spinner" aria-label="Searching users" />}{open && query.trim().length >= 3 && <ul className="ci-search-results" role="listbox">{results.map((entry) => <li key={entry.userId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)}><strong>{entry.displayName}</strong><small>{entry.employeeId || 'No employee ID'} · {entry.username}</small></button></li>)}{!loading && results.length === 0 && !searchError && <li className="ci-search-empty">No matching active users.</li>}</ul>}</div></label>
    {(error || searchError) && <small className="request-field-error" role="alert">{error || searchError}</small>}
  </div>
}

function GroupSearchField({ value, onSelect, error }) {
  const [query, setQuery] = useState(value?.groupName || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [searchError, setSearchError] = useState('')
  useEffect(() => {
    const term = query.trim()
    if (term.length < 3) { setResults([]); setLoading(false); setSearchError(''); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => { setLoading(true); fetch(`/api/application-onboarding/groups/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: controller.signal }).then(responseBody).then(setResults).catch((failure) => { if (failure.name !== 'AbortError') setSearchError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) }) }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])
  function changeQuery(next) { setQuery(next); setOpen(true); onSelect(null) }
  function choose(group) { onSelect(group); setQuery(group.groupName); setOpen(false); setResults([]); setSearchError('') }
  return <div className="ci-field ci-search-field">
    <label><span>Support Group <b>*</b></span><div className="ci-search-control"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={open && query.trim().length >= 3} value={query} autoComplete="off" placeholder="Search support groups" onChange={(event) => changeQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 3) setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-invalid={Boolean(error)} />{loading && <i className="ci-search-spinner" aria-label="Searching support groups" />}</div></label>
    {open && query.trim().length >= 3 && <ul className="ci-search-results" role="listbox">{results.map((group) => <li key={group.groupId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(group)}><strong>{group.groupName}</strong><small>{group.groupCode}</small></button></li>)}{!loading && results.length === 0 && !searchError && <li className="ci-search-empty">No active support groups.</li>}</ul>}
    {(error || searchError) && <small className="request-field-error" role="alert">{error || searchError}</small>}
  </div>
}

function CIReferenceSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value?.applicationName || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const term = query.trim()
    if (term.length < 3) { setResults([]); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => { setLoading(true); fetch(`/api/application-onboarding/configuration-items/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: controller.signal }).then(responseBody).then(setResults).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false) }) }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])
  return <div className="ci-field ci-search-field ci-reference-field">
    <label><span>Related CI</span><div className="ci-search-control"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={open && query.trim().length >= 3} value={query} placeholder="Search by CI ID or name" autoComplete="off" onChange={(event) => { setQuery(event.target.value); setOpen(true); onSelect(null) }} onFocus={() => { if (query.trim().length >= 3) setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} />{loading && <i className="ci-search-spinner" aria-label="Searching CIs" />}</div></label>
    {open && query.trim().length >= 3 && <ul className="ci-search-results" role="listbox">{results.map((ci) => <li key={ci.applicationNumber}><button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(ci); setQuery(ci.applicationName); setOpen(false) }}><strong>{ci.applicationName}</strong><small>{ci.applicationNumber} · {ci.applicationCode}</small></button></li>)}{!loading && results.length === 0 && <li className="ci-search-empty">No matching configuration items.</li>}</ul>}
  </div>
}

function CISection({ title, description, children }) {
  return <section className="ci-section"><header><span className="ci-section-marker" aria-hidden="true" /><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header><div className="ci-fields-grid">{children}</div></section>
}

export default function ApplicationOnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const isOwnerOnly = Boolean(editId && user?.roles?.includes('CI_OWNER') && !user?.roles?.includes('SUPER_ADMIN'))
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') === 'Relationships' ? 'Relationships' : 'Basic Information')
  const [base, setBase] = useState(INITIAL_BASE)
  const [details, setDetails] = useState(INITIAL_DETAILS)
  const [errors, setErrors] = useState({})
  const [catalogs, setCatalogs] = useState({ departments: [], locations: [], costCenters: [] })
  const [configuredClasses, setConfiguredClasses] = useState(null)
  const [customAttributes, setCustomAttributes] = useState([])
  const [choiceCatalogs, setChoiceCatalogs] = useState([])
  const [pageError, setPageError] = useState('')
  const [created, setCreated] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingRecord, setLoadingRecord] = useState(Boolean(editId))
  const [recordLoaded, setRecordLoaded] = useState(!editId)
  const [recordNumber, setRecordNumber] = useState('')
  const [relationshipData, setRelationshipData] = useState({ outgoing: [], incoming: [] })
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const [relationshipError, setRelationshipError] = useState('')

  useEffect(() => {
    if (searchParams.get('tab') === 'Relationships') setActiveTab('Relationships')
  }, [searchParams])

  useEffect(() => {
    if (!editId || activeTab !== 'Relationships') return undefined
    const controller = new AbortController()
    setRelationshipLoading(true); setRelationshipError('')
    fetch(`/api/cmdb/configuration-items/${editId}/relationships`, { credentials: 'include', signal: controller.signal })
      .then(responseBody).then(setRelationshipData)
      .catch((failure) => { if (failure.name !== 'AbortError') setRelationshipError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setRelationshipLoading(false) })
    return () => controller.abort()
  }, [editId, activeTab])

  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([
      fetch('/api/departments', { credentials: 'include', signal: controller.signal }).then(responseBody),
      fetch('/api/locations', { credentials: 'include', signal: controller.signal }).then(responseBody),
      fetch('/api/users/options', { credentials: 'include', signal: controller.signal }).then(responseBody),
    ]).then(([departments, locations, options]) => setCatalogs({
      departments: departments.status === 'fulfilled' ? departments.value : [],
      locations: locations.status === 'fulfilled' ? locations.value : [],
      costCenters: options.status === 'fulfilled' ? options.value.costCenters || [] : [],
    }))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cmdb/configuration/ci-classes', { credentials: 'include', signal: controller.signal })
      .then(responseBody).then(setConfiguredClasses).catch((failure) => { if (failure.name !== 'AbortError') setConfiguredClasses(null) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cmdb/configuration/choice-lists', { credentials: 'include', signal: controller.signal })
      .then(responseBody).then(setChoiceCatalogs).catch((failure) => { if (failure.name !== 'AbortError') setChoiceCatalogs([]) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const classItem = configuredClasses.find((item) => item.name === base.ciClass)
    if (!classItem) { setCustomAttributes([]); return undefined }
    const controller = new AbortController()
    fetch(`/api/cmdb/configuration/ci-classes/${classItem.id}/attributes`, { credentials: 'include', signal: controller.signal })
      .then(responseBody).then(setCustomAttributes).catch((failure) => { if (failure.name !== 'AbortError') setCustomAttributes([]) })
    return () => controller.abort()
  }, [base.ciClass, configuredClasses])

  useEffect(() => {
    if (!editId) {
      setBase(INITIAL_BASE); setDetails(INITIAL_DETAILS); setErrors({}); setPageError(''); setCreated(null); setRecordNumber(''); setLoadingRecord(false); setRecordLoaded(true); setActiveTab('Basic Information')
      return undefined
    }
    const controller = new AbortController()
    setLoadingRecord(true); setRecordLoaded(false); setPageError('')
    fetch(`/api/application-onboarding/${editId}`, { credentials: 'include', signal: controller.signal })
      .then(responseBody)
      .then((record) => {
        let storedDetails = {}
        try { storedDetails = record.ciDetailsJson ? JSON.parse(record.ciDetailsJson) : {} } catch { storedDetails = {} }
        setBase({ ciName: record.applicationName || '', ciClass: record.applicationCategory || '', ciType: record.applicationType || '', status: record.status || '', environment: record.environment || '', criticality: record.businessCriticality || '', description: record.description || '', businessOwner: record.applicationOwner || null, technicalOwner: record.technicalOwner || null, supportGroup: record.managedByGroup || null })
        setDetails({ ...INITIAL_DETAILS, ...storedDetails,
          ...(record.applicationCategory === 'Application' ? { applicationVersion: storedDetails.applicationVersion || record.version || '' } : {}),
          ...(record.applicationCategory === 'Server' ? { osVersion: storedDetails.osVersion || record.version || '' } : {}),
          ...(record.applicationCategory === 'Database' ? { databaseVersion: storedDetails.databaseVersion || record.version || '' } : {}),
        })
        setRecordNumber(record.applicationNumber || '')
        setRecordLoaded(true)
      })
      .catch((error) => { if (error.name !== 'AbortError') setPageError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoadingRecord(false) })
    return () => controller.abort()
  }, [editId])

  function updateBase(key, value) { setBase((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })) }
  function updateDetail(key, value) { setDetails((current) => ({ ...current, [key]: value })) }
  function field(key, label, type = 'text', options = [], extra = {}) { return <CIField key={key} label={label} type={type} options={options} value={details[key] ?? ''} onChange={(value) => updateDetail(key, value)} {...extra} /> }
  function selectBase(key, label, options, errorKey = key) { return <CIField key={key} label={label} type="select" options={options} value={base[key]} onChange={(value) => updateBase(key, value)} required error={errors[errorKey]} /> }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!base.ciName.trim()) nextErrors.ciName = 'Enter a CI name.'
    if (!base.ciClass) nextErrors.ciClass = 'Select a CI class.'
    if (!base.ciType) nextErrors.ciType = 'Select a CI type.'
    if (!base.status) nextErrors.status = 'Select a status.'
    if (!base.environment) nextErrors.environment = 'Select an environment.'
    if (!base.criticality) nextErrors.criticality = 'Select criticality.'
    if (!base.businessOwner) nextErrors.businessOwner = 'Choose a business owner from the search results.'
    if (!base.supportGroup) nextErrors.supportGroup = 'Choose a support group from the search results.'
    customAttributes.filter((attribute) => attribute.required).forEach((attribute) => {
      const value = details.customAttributes?.[attribute.name]
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) nextErrors[`custom_${attribute.name}`] = `${attribute.label} is required.`
    })
    setErrors(nextErrors); setPageError('')
    if (Object.keys(nextErrors).length) {
      setActiveTab(Object.keys(nextErrors).some((key) => key.startsWith('custom_')) ? 'Technical' : ['ciName', 'ciClass', 'ciType', 'status', 'environment', 'criticality'].some((key) => nextErrors[key]) ? 'Basic Information' : 'Ownership')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        applicationName: base.ciName.trim(), applicationCode: recordNumber || null, applicationType: base.ciType,
        applicationCategory: base.ciClass, status: base.status, version: details.applicationVersion || details.osVersion || details.databaseVersion || null,
        environment: base.environment, businessCriticality: base.criticality, managedByGroupId: base.supportGroup.groupId,
        ownerUserId: base.businessOwner.userId, technicalOwnerUserId: base.technicalOwner?.userId || null,
        description: base.description.trim(), ciDetailsJson: JSON.stringify(details),
      }
      const record = await fetch(editId ? `/api/application-onboarding/${editId}` : '/api/application-onboarding', {
        method: editId ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(responseBody)
      if (editId) { notifyToast(`${record.applicationNumber} was updated.`, 'success', 'Changes saved'); navigate('/cmdb/cidata'); return }
      setCreated(record); setRecordNumber(record.applicationNumber); setErrors({})
      notifyToast(`${record.applicationNumber} has been created.`, 'success', 'CI created')
    } catch (failure) { setPageError(failure.message); notifyToast(failure.message, 'error', 'Create CI failed') }
    finally { setSubmitting(false) }
  }

  const selectedClass = base.ciClass
  const choiceValues = (code, fallback) => {
    const list = choiceCatalogs.find((item) => item.code === code)
    return list?.choices?.length ? list.choices.map((choice) => ({ value: choice.label, label: choice.label })) : fallback
  }
  const configuredClassNames = configuredClasses === null ? CI_CLASSES : configuredClasses.map((item) => item.name)
  const ciClassChoices = base.ciClass && !configuredClassNames.includes(base.ciClass) ? [...configuredClassNames, base.ciClass] : configuredClassNames
  const locationOptions = catalogs.locations.map((item) => ({ value: item.id, label: item.name }))
  const departmentOptions = catalogs.departments.map((item) => ({ value: item.id, label: item.name }))
  const costCenterOptions = catalogs.costCenters.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))
  const dataCenterOptions = [...new Set([...DATA_CENTERS, ...catalogs.locations.map((item) => item.name)])]
  const regionOptions = REGIONS

  return <section className="service-request-page application-onboarding-page ci-create-page" aria-labelledby="application-onboarding-title">
    {created && <div className="request-alert request-success" role="status"><strong>Configuration item created</strong><span>{created.applicationNumber} · {created.applicationName}</span></div>}
    {pageError && <div className="request-alert" role="alert"><strong>We couldn’t save this configuration item.</strong><span>{pageError}</span></div>}
    <header className="change-form-heading application-onboarding-header">
      <div className="change-form-heading-copy"><span className="change-form-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M4 9h16M8 5v14m4-7h4m-4 4h4"/></svg></span><div><h2 id="application-onboarding-title">{isOwnerOnly ? 'Configuration Item' : editId ? 'Edit Configuration Item' : 'Create Configuration Item'}</h2><p>{isOwnerOnly ? 'Details for a configuration item assigned to you.' : editId ? 'Update configuration item details' : 'Register a new item in the configuration database'}</p></div></div>
      <div className="change-form-heading-meta application-onboarding-toolbar-actions">{editId && <button type="button" className="application-onboarding-cancel" onClick={() => navigate('/cmdb/cidata')} disabled={submitting}>{isOwnerOnly ? 'Back to CI Data' : 'Cancel'}</button>}{!isOwnerOnly && <button type="submit" form="application-onboarding-form" disabled={submitting || loadingRecord}>{submitting ? 'Saving…' : editId ? 'Save Changes' : 'Create CI'}</button>}</div>
    </header>
    {loadingRecord || !recordLoaded ? <div className="application-onboarding-loading" role={pageError ? 'alert' : 'status'}>{pageError || 'Loading configuration item…'}</div> : <form id="application-onboarding-form" className="service-request-form request-record-form ci-record-form" onSubmit={submit} noValidate>
      <nav className="ci-tabs" aria-label="Configuration item sections" role="tablist">{TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'ci-tab ci-tab-active' : 'ci-tab'} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
      <fieldset className={isOwnerOnly ? 'ci-readonly-fields' : undefined} disabled={isOwnerOnly}>
      <div className="ci-tab-content" role="tabpanel" aria-label={activeTab}>
        {activeTab === 'Basic Information' && <CISection title="Basic Information" description="Identify the item, class, operational state, and business importance.">
          <CIField label="CI Name" value={base.ciName} onChange={(value) => updateBase('ciName', value)} placeholder="e.g. PAY-APP-01" required error={errors.ciName} />
          <CIField label="CI ID" value={recordNumber || 'Generated automatically'} disabled hint="Assigned when this configuration item is created." />
          {selectBase('ciClass', 'CI Class', ciClassChoices)}
          {selectBase('ciType', 'CI Type', CI_TYPES)}
          {selectBase('status', 'Status', choiceValues('CI_STATUS', STATUSES))}
          {selectBase('environment', 'Environment', choiceValues('ENVIRONMENT', ENVIRONMENTS))}
          {selectBase('criticality', 'Criticality', choiceValues('CRITICALITY', CRITICALITIES))}
          <CIField label="Description" type="textarea" value={base.description} onChange={(value) => updateBase('description', value)} placeholder="Describe this configuration item and its purpose." wide rows={4} />
        </CISection>}

        {activeTab === 'Ownership' && <CISection title="Ownership & Responsibility" description="Assign the business contact and team accountable for this CI.">
          <UserSearchField label="Business Owner" required value={base.businessOwner} error={errors.businessOwner} onSelect={(user) => updateBase('businessOwner', user)} />
          <UserSearchField label="Technical Owner" value={base.technicalOwner} onSelect={(user) => updateBase('technicalOwner', user)} />
          <UserSearchField label="Managed By" value={details.managedBy || null} onSelect={(user) => updateDetail('managedBy', user)} />
          <GroupSearchField value={base.supportGroup} error={errors.supportGroup} onSelect={(group) => updateBase('supportGroup', group)} />
          <CIField label="Department" type="select" options={departmentOptions} value={details.departmentId || ''} onChange={(value) => updateDetail('departmentId', value)} />
          <CIField label="Cost Center" type="select" options={costCenterOptions} value={details.costCenterId || ''} onChange={(value) => updateDetail('costCenterId', value)} />
          <CIField label="Vendor" type="select" options={VENDORS} value={details.vendor || ''} onChange={(value) => updateDetail('vendor', value)} />
        </CISection>}

        {activeTab === 'Location' && (selectedClass === 'Cloud Resource' ? <CISection title="Cloud Location" description="Cloud resources use provider and tenancy details instead of physical location fields.">
          <CIField label="Cloud Provider" type="select" options={CLOUD_PROVIDERS} value={details.cloudProvider || ''} onChange={(value) => updateDetail('cloudProvider', value)} />
          {field('cloudAccount', 'Cloud Account')}{field('region', 'Region', 'select', regionOptions)}{field('availabilityZone', 'Availability Zone')}
          {field('resourceGroup', 'Resource Group')}{field('subscriptionId', 'Subscription ID')}{field('vpcVnet', 'VPC / VNet')}{field('subnet', 'Subnet')}
        </CISection> : <CISection title="Location" description="Add the physical location for this configuration item when applicable.">
          <CIField label="Location" type="select" options={locationOptions} value={details.locationId || ''} onChange={(value) => updateDetail('locationId', value)} />
          <CIField label="Building" type="select" options={['Head Office', 'Primary Data Center', 'Secondary Data Center', 'Regional Office', 'Other']} value={details.building || ''} onChange={(value) => updateDetail('building', value)} />
          {field('floor', 'Floor')}{field('roomRack', 'Room / Rack')}
          <CIField label="Data Center" type="select" options={dataCenterOptions} value={details.dataCenter || ''} onChange={(value) => updateDetail('dataCenter', value)} />
          <CIField label="Region" type="select" options={regionOptions} value={details.region || ''} onChange={(value) => updateDetail('region', value)} />
        </CISection>)}

        {activeTab === 'Technical' && <>
          <CISection title="Identification Information" description="Record asset and network identifiers to make this CI easy to locate.">
            {field('assetTag', 'Asset Tag')}{field('serialNumber', 'Serial Number')}{field('hostname', 'Hostname')}{field('ipAddress', 'IP Address')}{field('macAddress', 'MAC Address')}{field('dnsName', 'DNS Name')}
            <CIField label="Manufacturer" type="select" options={VENDORS} value={details.manufacturer || ''} onChange={(value) => updateDetail('manufacturer', value)} />{field('model', 'Model')}
          </CISection>
          {selectedClass === 'Server' && <CISection title="Server Hardware" description="Server fields are shown because CI Class is set to Server.">
            {field('serverType', 'Server Type', 'select', choiceValues('SERVER_TYPE', ['Physical', 'Virtual', 'Cloud', 'Container Host']))}{field('operatingSystem', 'Operating System', 'select', choiceValues('OPERATING_SYSTEM', ['Windows Server', 'Linux', 'Unix', 'macOS', 'Other']))}{field('osVersion', 'OS Version')}{field('cpu', 'CPU')}{field('cpuCores', 'CPU Cores', 'number')}{field('ram', 'RAM', 'number')}{field('ramUnit', 'RAM Unit', 'select', ['MB', 'GB', 'TB'])}{field('storageCapacity', 'Storage Capacity', 'number')}{field('storageUnit', 'Storage Unit', 'select', ['GB', 'TB', 'PB'])}{field('architecture', 'Architecture', 'select', ['x86', 'x64', 'ARM', 'Other'])}
          </CISection>}
          {selectedClass === 'Application' && <CISection title="Application Details" description="Application-specific configuration and deployment details.">
            {field('applicationName', 'Application Name')}{field('applicationVersion', 'Application Version')}{field('applicationType', 'Application Type', 'select', choiceValues('APPLICATION_TYPE', ['Web Application', 'Mobile Application', 'Desktop Application', 'API', 'Microservice', 'Batch Application', 'Enterprise Application']))}<MultiSelectField label="Technology" values={details.technology || []} onChange={(value) => updateDetail('technology', value)} options={TECHNOLOGIES} />{field('applicationUrl', 'Application URL', 'url')}{field('repositoryUrl', 'Repository URL', 'url')}{field('businessFunction', 'Business Function', 'select', ['Finance', 'Human Resources', 'Operations', 'Sales', 'Customer Service', 'Security', 'Other'])}{field('businessCriticality', 'Business Criticality', 'select', choiceValues('CRITICALITY', CRITICALITIES))}{field('deploymentType', 'Deployment Type', 'select', ['On-premises', 'Cloud', 'Hybrid', 'Containerized'])}
          </CISection>}
          {selectedClass === 'Database' && <CISection title="Database Details" description="Database engine, host, and resilience settings.">
            {field('databaseType', 'Database Type', 'select', ['Oracle', 'MySQL', 'PostgreSQL', 'SQL Server', 'MongoDB', 'Redis', 'MariaDB'])}{field('databaseVersion', 'Database Version')}<CIReferenceSearch value={details.hostServer || null} onSelect={(value) => updateDetail('hostServer', value)} />{field('port', 'Port', 'number')}{field('databaseName', 'Database Name')}{field('instanceName', 'Instance Name')}{field('clusterName', 'Cluster Name')}{field('highAvailability', 'High Availability', 'select', ['Yes', 'No'])}{field('backupEnabled', 'Backup Enabled', 'select', ['Yes', 'No'])}{field('backupFrequency', 'Backup Frequency', 'select', ['Continuous', 'Hourly', 'Daily', 'Weekly', 'Monthly'])}
          </CISection>}
          {selectedClass === 'Network Device' && <CISection title="Network Device Details" description="Router, switch, firewall, and load balancer identifiers.">
            {field('deviceType', 'Device Type', 'select', ['Router', 'Switch', 'Firewall', 'Load Balancer', 'Wireless Access Point', 'Other'])}<CIField label="Manufacturer" type="select" options={VENDORS} value={details.manufacturer || ''} onChange={(value) => updateDetail('manufacturer', value)} />{field('model', 'Model')}{field('serialNumber', 'Serial Number')}{field('managementIp', 'Management IP')}{field('firmwareVersion', 'Firmware Version')}{field('macAddress', 'MAC Address')}{field('vlan', 'VLAN')}{field('portCount', 'Port Count', 'number')}<CIField label="Location" type="select" options={locationOptions} value={details.locationId || ''} onChange={(value) => updateDetail('locationId', value)} />
          </CISection>}
          {selectedClass === 'Cloud Resource' && <CISection title="Cloud Resource Details" description="Resource identifiers and cloud network configuration.">
            <CIField label="Cloud Provider" type="select" options={CLOUD_PROVIDERS} value={details.cloudProvider || ''} onChange={(value) => updateDetail('cloudProvider', value)} />{field('accountId', 'Account ID')}{field('resourceId', 'Resource ID')}{field('instanceType', 'Instance Type')}
          </CISection>}
          {customAttributes.length > 0 && <CISection title={`${selectedClass} Attributes`} description="Additional fields configured by your CMDB administrator.">
            {customAttributes.map((attribute) => <ConfiguredAttributeField key={attribute.id} attribute={attribute} value={details.customAttributes?.[attribute.name]} error={errors[`custom_${attribute.name}`]} onChange={(value) => { updateDetail('customAttributes', { ...(details.customAttributes || {}), [attribute.name]: value }); setErrors((current) => ({ ...current, [`custom_${attribute.name}`]: '' })) }} />)}
          </CISection>}
        </>}

        {activeTab === 'Lifecycle' && <CISection title="Lifecycle Information" description="Track acquisition, support, and retirement dates.">
          {field('installDate', 'Install Date', 'date')}{field('purchaseDate', 'Purchase Date', 'date')}{field('warrantyStart', 'Warranty Start', 'date')}{field('warrantyEnd', 'Warranty End', 'date')}{field('expectedRetirementDate', 'Expected Retirement Date', 'date')}{field('actualRetirementDate', 'Actual Retirement Date', 'date')}{field('lifecycleStatus', 'Lifecycle Status', 'select', choiceValues('LIFECYCLE_STATUS', LIFECYCLE_STATUSES))}{field('maintenanceStatus', 'Maintenance Status', 'select', ['In Maintenance', 'Scheduled', 'Due', 'Not Required'])}
        </CISection>}

        {activeTab === 'Relationships' && <CISection title="CI Relationships" description="Review this configuration item’s outgoing dependencies and incoming relationships.">
          {!editId ? <div className="ci-empty-relationships">Create the configuration item before connecting it to other CIs.</div> : <div className="ci-normalized-relationships">
            <div className="ci-relationship-actions"><span>{(relationshipData.outgoing || []).length + (relationshipData.incoming || []).length} relationships</span><button type="button" onClick={() => navigate(`/cmdb/relationships/new?sourceCi=${editId}`)} disabled={isOwnerOnly}>＋ Add relationship</button></div>
            {relationshipLoading && <div className="ci-empty-relationships">Loading CI relationships…</div>}
            {relationshipError && <div className="ci-empty-relationships" role="alert">{relationshipError}</div>}
            {!relationshipLoading && !relationshipError && ['outgoing', 'incoming'].map((direction) => <section className={`ci-relationship-direction ci-relationship-${direction}`} key={direction}>
              <h3><span>{direction === 'outgoing' ? 'Outgoing relationships' : 'Incoming relationships'}</span><b>{(relationshipData[direction] || []).length}</b></h3>
              {(relationshipData[direction] || []).length === 0 ? <div className="ci-empty-relationships">No {direction} relationships.</div> : <div className="ci-relationship-cards">{relationshipData[direction].map((relation) => <article className="ci-relationship-card" key={`${direction}-${relation.id}`}>
                <span className="ci-relationship-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="m8.3 11 7.3-3M8.3 13l7.3 3"/></svg></span>
                <div className="ci-relationship-card-main"><div className="ci-relationship-card-heading"><span className="ci-relationship-direction-label">{relation.relationship}</span><span className={`ci-relationship-status ci-relationship-status-${(relation.status || '').toLowerCase()}`}>{relation.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></div><strong>{relation.relatedCi.name}</strong><div className="ci-relationship-ci-meta"><span>{relation.relatedCi.number}</span><i/><span>{relation.relatedCi.ciClass}</span><i/><span>{relation.relatedCi.environment}</span><i/><span>{relation.relatedCi.status}</span></div>{relation.description && <p>{relation.description}</p>}</div>
                <a className="ci-relationship-view-link" href={`/cmdb/newci?edit=${relation.relatedCi.id}&tab=Relationships`} aria-label={`View ${relation.relatedCi.name}`}>View CI <span aria-hidden="true">↗</span></a>
              </article>)}</div>}
            </section>)}
          </div>}
        </CISection>}

        {activeTab === 'Monitoring' && <CISection title="Monitoring & Support" description="Capture monitoring and support coverage for this CI.">
          <ToggleField label="Monitoring Enabled" value={details.monitoringEnabled} onChange={(value) => updateDetail('monitoringEnabled', value)} />{field('monitoringTool', 'Monitoring Tool', 'select', ['Datadog', 'Dynatrace', 'New Relic', 'Prometheus', 'Splunk', 'Other'])}{field('monitoringId', 'Monitoring ID')}{field('alertGroup', 'Alert Group', 'select', ['Application Alerts', 'Database Alerts', 'Infrastructure Alerts', 'Network Alerts', 'Security Alerts'])}{field('supportHours', 'Support Hours', 'select', ['Business hours', '24 × 7', 'On-call'])}{field('sla', 'SLA', 'select', ['Critical', 'High', 'Standard', 'Best effort'])}{field('maintenanceWindow', 'Maintenance Window', 'select', ['Weekday', 'Weekend', 'Sunday', 'Scheduled by request'])}
        </CISection>}

        {activeTab === 'Security' && <CISection title="Security & Compliance" description="Record data handling and security controls.">
          {field('securityClassification', 'Security Classification', 'select', ['Public', 'Internal', 'Confidential', 'Restricted'])}{field('dataClassification', 'Data Classification', 'select', ['Public', 'Internal', 'Confidential', 'Restricted'])}{field('complianceRequired', 'Compliance Required', 'select', ['Yes', 'No'])}<MultiSelectField label="Compliance Type" values={details.complianceType || []} onChange={(value) => updateDetail('complianceType', value)} options={['ISO 27001', 'SOC 2', 'PCI DSS', 'HIPAA', 'GDPR', 'Other']} /><ToggleField label="Encryption Enabled" value={details.encryptionEnabled} onChange={(value) => updateDetail('encryptionEnabled', value)} /><ToggleField label="Vulnerability Scan Enabled" value={details.vulnerabilityScanEnabled} onChange={(value) => updateDetail('vulnerabilityScanEnabled', value)} />{field('lastSecurityReview', 'Last Security Review', 'date')}
        </CISection>}

        {activeTab === 'Financial' && <CISection title="Financial Information" description="Optional asset and contract cost details.">
          {field('purchaseCost', 'Purchase Cost', 'number')}{field('currency', 'Currency', 'select', ['USD', 'CAD', 'EUR', 'GBP', 'INR', 'JPY', 'SGD'])}{field('purchaseOrder', 'Purchase Order')}{field('financialVendor', 'Vendor', 'select', VENDORS)}{field('contract', 'Contract')}{field('licenseCost', 'License Cost', 'number')}{field('annualMaintenanceCost', 'Annual Maintenance Cost', 'number')}
        </CISection>}

        {activeTab === 'Notes' && <CISection title="Notes" description="Add context for technical and operational teams.">
          {field('additionalNotes', 'Additional Notes', 'textarea', [], { wide: true, rows: 5 })}{field('technicalNotes', 'Technical Notes', 'textarea', [], { wide: true, rows: 5 })}{field('operationalNotes', 'Operational Notes', 'textarea', [], { wide: true, rows: 5 })}
        </CISection>}
      </div>
      </fieldset>
      <footer className="ci-form-footer"><span>{isOwnerOnly ? 'Read-only view' : <><b>*</b> Required fields</>}</span><span>CI ID is assigned automatically.</span><div>{editId && <button type="button" className="ci-footer-secondary" onClick={() => navigate('/cmdb/cidata')} disabled={submitting}>{isOwnerOnly ? 'Back to CI Data' : 'Cancel'}</button>}{!isOwnerOnly && <button type="submit" disabled={submitting || loadingRecord}>{submitting ? 'Saving…' : editId ? 'Save Changes' : 'Create CI'}</button>}</div></footer>
    </form>}
  </section>
}
