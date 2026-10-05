import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { notifyToast } from '../components/Toast.jsx'
import './ApplicationServersPage.css'
import './ApplicationOnboardingPage.css'
import './CmdbRelationshipsPage.css'


async function readResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load CI relationships.')
  return body
}

function asCiOption(ci) {
  if (!ci) return null
  return { ...ci, onboardingId: ci.onboardingId ?? ci.id, applicationNumber: ci.applicationNumber ?? ci.number,
    applicationName: ci.applicationName ?? ci.name, applicationCategory: ci.applicationCategory ?? ci.ciClass }
}

function ConfigurationItemPicker({ label, selected, onSelect, required = false, disabled = false }) {
  const [query, setQuery] = useState(selected?.applicationName || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (selected) setQuery(selected.applicationName || '') }, [selected?.onboardingId, selected?.applicationName])
  useEffect(() => {
    const term = query.trim()
    if (term.length < 3 || selected?.applicationName === term) { setResults([]); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/application-onboarding/configuration-items/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: controller.signal })
        .then(readResponse).then(setResults).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, selected?.applicationName])
  return <div className={`ci-field ci-search-field cmdb-relation-picker${open && query.trim().length >= 3 ? ' ci-search-field-open' : ''}`}>
    <label><span>{label}{required && <> <b>*</b></>}</span><div className="ci-search-control"><input type="search" role="combobox" aria-autocomplete="list" aria-expanded={!disabled && open && query.trim().length >= 3} autoComplete="off" disabled={disabled} placeholder="Search CI name, ID, hostname, or IP" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); onSelect(null); setError('') }} onFocus={() => { if (query.trim().length >= 3) setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} />{loading && <i className="ci-search-spinner" aria-label="Searching configuration items" />}</div></label>
    {open && query.trim().length >= 3 && <ul className="ci-search-results" role="listbox">{results.map((ci) => <li key={ci.onboardingId}><button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(ci); setQuery(ci.applicationName); setOpen(false); setResults([]) }}><strong>{ci.applicationName}</strong><small>{ci.applicationNumber} · {ci.applicationCategory} · {ci.environment} · {ci.status}</small></button></li>)}{!loading && results.length === 0 && <li className="ci-search-empty">No matching configuration items.</li>}</ul>}
    {error && <small className="request-field-error">{error}</small>}
    {selected && <div className="cmdb-relation-selected"><b>{selected.applicationNumber}</b><span>{selected.applicationCategory} · {selected.environment} · {selected.status}</span></div>}
  </div>
}

function RelationshipFormPage({ types, relationshipId, initialSourceId, onCancel, onSaved }) {
  const [source, setSource] = useState(null)
  const [target, setTarget] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingRecord, setLoadingRecord] = useState(Boolean(relationshipId))
  const [loadingSource, setLoadingSource] = useState(Boolean(initialSourceId))
  useEffect(() => {
    if (!relationshipId) { setFrom(new Date().toISOString().slice(0, 10)); return undefined }
    const controller = new AbortController()
    fetch(`/api/cmdb/relationships/${relationshipId}`, { credentials: 'include', signal: controller.signal }).then(readResponse).then((record) => {
      setSource(asCiOption(record.sourceCi)); setTarget(asCiOption(record.targetCi)); setTypeId(String(record.relationshipType.id))
      setStatus(record.status); setFrom(record.effectiveFrom || ''); setTo(record.effectiveTo || ''); setDescription(record.description || '')
    }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoadingRecord(false) })
    return () => controller.abort()
  }, [relationshipId])
  useEffect(() => {
    if (!initialSourceId || source || relationshipId) return
    fetch(`/api/application-onboarding/${initialSourceId}`, { credentials: 'include' }).then(readResponse).then((ci) => setSource(asCiOption(ci))).catch((failure) => setError(failure.message)).finally(() => setLoadingSource(false))
      .finally(() => setLoadingSource(false))
  }, [initialSourceId, relationshipId, source])
  const selectedType = types.find((type) => String(type.id) === typeId)
  async function submit(event) {
    event.preventDefault(); setError('')
    if (!source || !selectedType || !target) { setError('Select a source CI, relationship type, and target CI.'); return }
    if (source.onboardingId === target.onboardingId) { setError('A CI cannot be related to itself.'); return }
    setSaving(true)
    try {
      const body = { sourceCiId: source.onboardingId, relationshipTypeId: Number(typeId), targetCiId: target.onboardingId, status, effectiveFrom: from || null, effectiveTo: to || null, description }
      const response = await fetch(relationshipId ? `/api/cmdb/relationships/${relationshipId}` : '/api/cmdb/relationships', { method: relationshipId ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      await readResponse(response); notifyToast(relationshipId ? 'Relationship updated.' : 'Relationship created.', 'success'); onSaved()
    } catch (failure) { setError(failure.message) } finally { setSaving(false) }
  }
  return <div className="configuration-items-page cmdb-relationships-page cmdb-relationship-form-page">
    <header className="ci-page-heading"><div><h1>{relationshipId ? 'Edit CI Relationship' : 'Create CI Relationship'}</h1><p>Connect configuration items using a controlled relationship type.</p></div><div className="ci-page-actions"><button type="button" onClick={onCancel}>Cancel</button><button className="ci-primary-button" type="submit" form="cmdb-relationship-form" disabled={saving || loadingRecord || loadingSource}>{saving ? 'Saving…' : relationshipId ? 'Save Changes' : 'Create Relationship'}</button></div></header>
    {(error || loadingRecord || loadingSource) && <div className={error ? 'cmdb-relation-error' : 'cmdb-relation-loading'} role={error ? 'alert' : 'status'}>{error || (loadingRecord ? 'Loading CI relationship…' : 'Loading selected configuration item…')}</div>}
    <form id="cmdb-relationship-form" onSubmit={submit} className="service-request-form request-record-form ci-record-form cmdb-relation-form">
      <section className="ci-section"><header><span className="ci-section-marker" aria-hidden="true"/><div><h2>Relationship Details</h2><p>Select the source and target CIs and the controlled relationship type.</p></div></header><div className="ci-fields-grid cmdb-relation-form-grid"><ConfigurationItemPicker label="Source CI" selected={source} onSelect={setSource} required disabled={Boolean(relationshipId)} /><label className="ci-field"><span>Relationship type <b>*</b></span><select required value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="">Select relationship type</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>{selectedType && <small>{selectedType.description}</small>}</label><ConfigurationItemPicker label="Target CI" selected={target} onSelect={setTarget} required /><label className="ci-field"><span>Status <b>*</b></span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label></div></section>
      <section className="cmdb-relation-preview"><span className="cmdb-relation-preview-label">RELATIONSHIP PREVIEW</span><div className="cmdb-relation-preview-flow"><article><small>{source?.applicationNumber || 'SOURCE CI'}</small><strong>{source?.applicationName || 'Choose a source CI'}</strong><span>{source ? `${source.applicationCategory} · ${source.environment}` : 'Search the configuration item inventory'}</span></article><div className="cmdb-relation-arrow"><i /> <b>{selectedType?.name || 'Relationship'}</b><i /></div><article><small>{target?.applicationNumber || 'TARGET CI'}</small><strong>{target?.applicationName || 'Choose a target CI'}</strong><span>{target ? `${target.applicationCategory} · ${target.environment}` : 'Search the configuration item inventory'}</span></article></div>{selectedType && <p>Viewed from the target CI, this is shown as <b>{selectedType.reverseName}</b>.</p>}</section>
      <section className="ci-section"><header><span className="ci-section-marker" aria-hidden="true"/><div><h2>Effective Period & Description</h2><p>Define when the relationship applies and document its operational context.</p></div></header><div className="ci-fields-grid cmdb-relation-lifecycle"><label className="ci-field"><span>Effective from <b>*</b></span><input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="ci-field"><span>Effective to</span><input type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="ci-field ci-field-wide"><span>Description</span><textarea rows="4" maxLength="2000" placeholder="Describe the dependency or relationship context" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div></section>
      <footer className="ci-form-footer"><span>Relationship changes are saved to the CMDB relationship record.</span><div><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={saving || loadingRecord || loadingSource}>{saving ? 'Saving…' : relationshipId ? 'Save Changes' : 'Create Relationship'}</button></div></footer>
    </form>
  </div>
}

function RelationshipColumnFilter({ label, filter, choices = [], date = false, onApply, onClear }) {
  const defaultOperator = choices.length || date ? 'EQUALS' : 'CONTAINS'
  const [operator, setOperator] = useState(filter?.operator || defaultOperator)
  const [value, setValue] = useState(filter?.value || '')
  const noValue = operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY'
  const operators = date ? [['EQUALS', 'On'], ['NOT_EQUALS', 'Not on'], ['BEFORE', 'Before'], ['AFTER', 'After'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
    : choices.length ? [['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
      : [['CONTAINS', 'Contains'], ['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['STARTS_WITH', 'Starts with'], ['ENDS_WITH', 'Ends with'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
  return <details className={`ci-column-filter${filter ? ' is-filtered' : ''}`} onToggle={(event) => { if (event.currentTarget.open) { setOperator(filter?.operator || defaultOperator); setValue(filter?.value || '') } }}>
    <summary title={`Filter ${label}`} aria-label={`Filter ${label}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" /></svg></summary>
    <div className="ci-column-filter-popover"><strong>Filter {label}</strong><label><span>Condition</span><select value={operator} onChange={(event) => setOperator(event.target.value)}>{operators.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
      {!noValue && <label><span>Value</span>{choices.length ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose a value</option>{choices.map((choice) => <option value={choice} key={choice}>{choice === 'ACTIVE' ? 'Active' : choice === 'INACTIVE' ? 'Inactive' : choice}</option>)}</select> : <input type={date ? 'date' : 'text'} autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false } }} />}</label>}
      <div className="ci-column-filter-actions"><button type="button" className="ci-column-clear" onClick={(event) => { onClear(); event.currentTarget.closest('details').open = false }}>Clear</button><button type="button" className="ci-column-apply" disabled={!noValue && !value.trim()} onClick={(event) => { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false }}>Filter</button></div>
    </div>
  </details>
}

export default function CmdbRelationshipsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const formMatch = location.pathname.match(/^\/cmdb\/relationships\/(?:new|([0-9]+)\/edit)$/)
  const isForm = Boolean(formMatch)
  const relationshipId = formMatch?.[1] || null
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [rows, setRows] = useState([])
  const [types, setTypes] = useState([])
  const [meta, setMeta] = useState({ totalElements: 0, totalPages: 0, number: 0, size: 25 })
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    const params = new URLSearchParams({ page: String(page - 1), size: String(size) })
    Object.entries(filters).forEach(([key, filter]) => { params.set(`${key}.operator`, filter.operator); params.set(`${key}.value`, filter.value || '') })
    const controller = new AbortController(); setLoading(true); setError('')
    fetch(`/api/cmdb/relationships?${params}`, { credentials: 'include', signal: controller.signal }).then(readResponse).then((result) => { setRows(result.content || []); setMeta(result) }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, page, size])
  useEffect(() => { if (!isForm) reload() }, [reload, isForm])
  useEffect(() => { fetch('/api/cmdb/relationship-types', { credentials: 'include' }).then(readResponse).then(setTypes).catch((failure) => setError(failure.message)) }, [])
  function applyColumnFilter(key, filter) { setPage(1); setFilters((current) => ({ ...current, [key]: filter })) }
  function clearColumnFilter(key) { setPage(1); setFilters((current) => { const next = { ...current }; delete next[key]; return next }) }
  function reset() { setFilters({}); setPage(1) }
  async function toggleStatus(row) {
    try { await readResponse(await fetch(`/api/cmdb/relationships/${row.id}/status`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) })); notifyToast('Relationship status updated.', 'success'); reload() }
    catch (failure) { notifyToast(failure.message, 'error') }
  }
  if (isForm) return <RelationshipFormPage key={`${relationshipId || 'new'}-${query.get('sourceCi') || ''}`} types={types} relationshipId={relationshipId} initialSourceId={query.get('sourceCi')} onCancel={() => navigate('/cmdb/relationships')} onSaved={() => navigate('/cmdb/relationships')} />
  const gridColumns = [
    { field: 'source', label: 'Source CI' }, { field: 'type', label: 'Relationship' }, { field: 'target', label: 'Target CI' },
    { field: 'status', label: 'Status', choices: ['ACTIVE', 'INACTIVE'] }, { field: 'effectiveFrom', label: 'Effective From', date: true },
    { field: 'effectiveTo', label: 'Effective To', date: true }, { field: 'updated', label: 'Updated', date: true },
  ]
  return <div className="configuration-items-page cmdb-relationships-page">
    <header className="ci-page-heading"><div><h1>CI Relationships</h1><p>Manage dependencies and relationships between configuration items.</p></div><div className="ci-page-actions"><button className="ci-primary-button" type="button" onClick={() => navigate('/cmdb/relationships/new')}>＋ Add Relationship</button></div></header>
    <section className="ci-inventory-panel cmdb-relations-panel"><div className="ci-table-caption"><strong>{meta.totalElements.toLocaleString()} CI Relationships</strong><button className="ci-reset-filters" type="button" onClick={reset} disabled={!Object.keys(filters).length}>Reset filters</button></div>
      <div className="ci-table-wrap"><table className="ci-inventory-table cmdb-relationships-table"><thead><tr>{gridColumns.map((column) => <th key={column.field}><div className="ci-th-content"><span>{column.label}</span><RelationshipColumnFilter {...column} filter={filters[column.field]} onApply={(filter) => applyColumnFilter(column.field, filter)} onClear={() => clearColumnFilter(column.field)} /></div></th>)}</tr></thead><tbody>{loading ? <tr><td colSpan="7"><div className="ci-grid-state"><i className="ci-grid-spinner"/>Loading relationships…</div></td></tr> : error ? <tr><td colSpan="7"><div className="ci-grid-state ci-grid-error" role="alert">{error}</div></td></tr> : rows.length ? rows.map((row) => <tr key={row.id} className="ci-inventory-row" onClick={() => navigate(`/cmdb/relationships/${row.id}/edit`)}><td className="ci-name-cell"><Link to={`/cmdb/newci?edit=${row.sourceCi.id}&tab=Relationships`} onClick={(event) => event.stopPropagation()}><strong>{row.sourceCi.name}</strong><small>{row.sourceCi.number} · {row.sourceCi.ciClass} · {row.sourceCi.environment}</small></Link></td><td><span className="cmdb-relation-type-pill">{row.relationshipType.name}</span><small className="cmdb-relation-reverse">Reverse: {row.relationshipType.reverseName}</small></td><td className="ci-name-cell"><Link to={`/cmdb/newci?edit=${row.targetCi.id}&tab=Relationships`} onClick={(event) => event.stopPropagation()}><strong>{row.targetCi.name}</strong><small>{row.targetCi.number} · {row.targetCi.ciClass} · {row.targetCi.environment}</small></Link></td><td><button type="button" className={`cmdb-relation-status cmdb-relation-status-${row.status.toLowerCase()}`} onClick={(event) => { event.stopPropagation(); toggleStatus(row) }} title="Click to change status">{row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</button></td><td>{row.effectiveFrom || '—'}</td><td>{row.effectiveTo || 'Open'}</td><td>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td></tr>) : <tr><td colSpan="7"><div className="ci-grid-state">{meta.totalElements ? 'No CI relationships match these filters.' : 'No CI relationships have been created yet.'}</div></td></tr>}</tbody></table></div>
      <footer className="ci-pagination"><label>Rows per page<select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1) }}>{[25, 50, 100].map((count) => <option value={count} key={count}>{count}</option>)}</select></label><span>Showing {meta.totalElements ? (page - 1) * size + 1 : 0}–{Math.min(page * size, meta.totalElements)} of {meta.totalElements}</span><div className="ci-page-controls"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>‹</button><span>Page {meta.totalPages ? page : 0} of {meta.totalPages}</span><button type="button" disabled={page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>›</button></div></footer>
    </section>
  </div>
}
