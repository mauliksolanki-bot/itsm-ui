import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import './ApplicationServersPage.css'

const PAGE_SIZES = [25, 50, 100]
const CI_CLASSES = ['Server', 'Application', 'Database', 'Network Device', 'Storage', 'Virtual Machine', 'Cloud Resource', 'Endpoint', 'Software', 'Business Service', 'Application Service', 'API', 'Middleware']
const ENVIRONMENTS = ['Production', 'UAT', 'QA', 'Development', 'Staging', 'DR']
const STATUSES = ['Planned', 'Ordered', 'Installed', 'Operational', 'Maintenance', 'Retired', 'Disposed']
const CRITICALITIES = ['Critical', 'High', 'Medium', 'Low']
const LIFECYCLE = ['Planning', 'Procurement', 'Implementation', 'Production', 'Maintenance', 'Retirement', 'Retired', 'Disposed']

async function responseBody(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load configuration items.')
  return body
}

function detailsFor(record) { try { return record.ciDetailsJson ? JSON.parse(record.ciDetailsJson) : {} } catch { return {} } }
function dateFor(record) { return record.createdAt ? new Date(record.createdAt) : null }
function serviceNamesFor(record, allRecords = []) {
  return (detailsFor(record).relationships || []).map((relation) => {
    const target = relation.relatedCi
    if (!target) return null
    if (['Business Service', 'Application Service'].includes(target.applicationCategory)) return target.applicationName
    const matched = allRecords.find((item) => item.applicationNumber === target.applicationNumber || item.applicationName === target.applicationName)
    return ['Business Service', 'Application Service'].includes(matched?.applicationCategory) ? matched.applicationName : null
  }).filter(Boolean)
}

function healthFor(record) {
  const details = detailsFor(record)
  if (!record.applicationOwner || !record.managedByGroup) return { label: 'Critical', tone: 'critical' }
  const needsIdentity = ['Server', 'Database', 'Network Device'].includes(record.applicationCategory)
  const missingIdentity = needsIdentity && !details.hostname && !details.assetTag && !details.serialNumber
  const hasRelationship = (details.relationships || []).some((relation) => relation.relatedCi)
  if (!record.description?.trim() || missingIdentity || !hasRelationship) return { label: 'Warning', tone: 'warning' }
  return { label: 'Healthy', tone: 'healthy' }
}

function downloadCsv(records, filename = 'configuration-items.csv', allRecords = records) {
  const columns = ['CI ID', 'CI Name', 'CI Class', 'CI Type', 'Environment', 'Status', 'Criticality', 'Business Service', 'Owner', 'Support Group', 'Created']
  const values = records.map((record) => [record.applicationNumber, record.applicationName, record.applicationCategory, record.applicationType, record.environment, record.status, record.businessCriticality, serviceNamesFor(record, allRecords).join('; '), record.applicationOwner?.displayName || '', record.managedByGroup?.groupName || '', dateFor(record)?.toISOString() || ''])
  const csv = [columns, ...values].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return <label className="ci-grid-filter">{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{options.map((option) => { const item = typeof option === 'string' ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option> })}</select></label>
}

export default function ApplicationServersPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState([])
  const [moreFilters, setMoreFilters] = useState(false)
  const [locations, setLocations] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/application-onboarding', { credentials: 'include', signal: controller.signal })
      .then(responseBody).then((records) => { setRows(Array.isArray(records) ? records : []); setLoadError('') })
      .catch((error) => { if (error.name !== 'AbortError') setLoadError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    fetch('/api/locations', { credentials: 'include', signal: controller.signal }).then(responseBody).then((data) => setLocations(Array.isArray(data) ? data : [])).catch(() => {})
    return () => controller.abort()
  }, [])

  const values = useMemo(() => {
    const unique = (getValue) => [...new Set(rows.map(getValue).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
    return {
      classes: unique((record) => record.applicationCategory), environments: unique((record) => record.environment), statuses: unique((record) => record.status),
      criticalities: unique((record) => record.businessCriticality), services: unique((record) => ['Business Service', 'Application Service'].includes(record.applicationCategory) ? record.applicationName : null),
      owners: [...new Map(rows.filter((record) => record.applicationOwner).map((record) => [String(record.applicationOwner.userId), record.applicationOwner.displayName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
      groups: unique((record) => record.managedByGroup?.groupName), departments: unique((record) => detailsFor(record).department), vendors: unique((record) => detailsFor(record).vendor || detailsFor(record).financialVendor),
      lifecycle: unique((record) => detailsFor(record).lifecycleStatus),
    }
  }, [rows])

  const filters = useMemo(() => Object.fromEntries(['class', 'environment', 'status', 'criticality', 'service', 'owner', 'location', 'supportGroup', 'department', 'vendor', 'lifecycle', 'quality', 'days'].map((key) => [key, searchParams.get(key) || ''])), [searchParams])

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const cutoff = filters.days && Number.isFinite(Number(filters.days)) ? Date.now() - Number(filters.days) * 86400000 : null
    const duplicateNames = new Set(rows.map((record) => record.applicationName?.trim().toLowerCase()).filter((name, index, names) => name && names.indexOf(name) !== index))
    return rows.filter((record) => {
      const detail = detailsFor(record)
      const searchValues = [record.applicationNumber, record.applicationName, record.applicationCode, record.applicationType, record.applicationCategory, record.status, record.environment, record.businessCriticality, record.managedByGroup?.groupName, record.applicationOwner?.displayName, record.technicalOwner?.displayName, detail.hostname, detail.ipAddress, detail.serialNumber, detail.assetTag, detail.macAddress, detail.dnsName]
      const textMatches = !term || searchValues.some((value) => String(value || '').toLocaleLowerCase().includes(term))
      const statusMatches = !filters.status || (filters.status === 'non-operational' ? record.status?.toLowerCase() !== 'operational' : record.status === filters.status)
      const serviceMatches = !filters.service || serviceNamesFor(record, rows).includes(filters.service) || record.applicationName === filters.service
      const ownerMatches = !filters.owner || (filters.owner === 'empty' ? !record.applicationOwner : String(record.applicationOwner?.userId || '') === filters.owner)
      const detailLocation = String(detail.locationId || detail.location || '')
      const selectedLocation = locations.find((item) => String(item.id) === filters.location)?.name || filters.location
      const qualityMatches = !filters.quality
        || (filters.quality === 'incomplete' && (!record.applicationOwner || !record.managedByGroup || !record.description?.trim()))
        || (filters.quality === 'healthy' && healthFor(record).tone === 'healthy')
        || (filters.quality === 'warning' && healthFor(record).tone === 'warning')
        || (filters.quality === 'critical' && healthFor(record).tone === 'critical')
        || (filters.quality === 'owner-empty' && !record.applicationOwner)
        || (filters.quality === 'relationships-empty' && !(detail.relationships || []).some((relation) => relation.relatedCi))
        || (filters.quality === 'duplicate-name' && duplicateNames.has(record.applicationName?.trim().toLowerCase()))
        || (filters.quality === 'identity-empty' && ['Server', 'Database', 'Network Device'].includes(record.applicationCategory) && !detail.hostname && !detail.assetTag && !detail.serialNumber)
      const dateMatches = cutoff === null || (dateFor(record)?.getTime() ?? 0) >= cutoff
      return textMatches && (!filters.class || record.applicationCategory === filters.class) && (!filters.environment || record.environment === filters.environment) && statusMatches && (!filters.criticality || record.businessCriticality === filters.criticality) && serviceMatches && ownerMatches && (!filters.location || detailLocation === filters.location || detailLocation === selectedLocation) && (!filters.supportGroup || record.managedByGroup?.groupName === filters.supportGroup) && (!filters.department || detail.department === filters.department) && (!filters.vendor || (detail.vendor || detail.financialVendor) === filters.vendor) && (!filters.lifecycle || detail.lifecycleStatus === filters.lifecycle) && qualityMatches && dateMatches
    })
  }, [rows, search, filters, locations])

  const total = rows.length
  const operational = rows.filter((record) => record.status?.toLowerCase() === 'operational').length
  const critical = rows.filter((record) => record.businessCriticality?.toLowerCase() === 'critical').length
  const retired = rows.filter((record) => ['Retired', 'Disposed'].includes(record.status)).length
  const inactive = total - operational
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedRows = visibleRows.filter((record) => selected.includes(record.onboardingId))
  const firstRow = visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0
  const lastRow = Math.min(currentPage * pageSize, visibleRows.length)

  useEffect(() => { setPage(1); setSelected([]) }, [search, searchParams])

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  function setStatus(status) { updateFilter('status', status) }
  function resetFilters() { setSearch(''); setSearchParams({}, { replace: true }) }
  function toggleRow(id) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function togglePage() { setSelected((current) => pageRows.every((record) => current.includes(record.onboardingId)) ? current.filter((id) => !pageRows.some((record) => record.onboardingId === id)) : [...new Set([...current, ...pageRows.map((record) => record.onboardingId)])]) }
  function openRecord(record) { navigate(`/application-server/on-boarding?edit=${record.onboardingId}`) }
  function summaryCard(label, value, tone, click) { return <button type="button" className={`ci-summary-card ci-summary-${tone}`} onClick={click}><span>{label}</span><strong>{value.toLocaleString()}</strong></button> }

  return <section className="configuration-items-page" aria-labelledby="ci-grid-title">
    <div className="ci-page-breadcrumb"><Link to="/application-server/cmdb-dashboard">CMDB</Link><span>/</span><Link to="/application-server/cmdb-dashboard">Dashboard</Link><span>/</span><strong>Configuration Items</strong></div>
    <header className="ci-page-heading"><div><span className="ci-page-eyebrow">CMDB · CONFIGURATION MANAGEMENT</span><h1 id="ci-grid-title">Configuration Items</h1><p>Complete inventory of configuration items managed in the CMDB.</p></div><div className="ci-page-actions"><button type="button" className="ci-secondary-button" onClick={() => downloadCsv(visibleRows, 'configuration-items.csv', rows)} disabled={!visibleRows.length}>↓ Export</button><Link className="ci-primary-button" to="/application-server/on-boarding">＋ Create CI</Link></div></header>

    <section className="ci-summary-cards" aria-label="CI summary">
      {summaryCard('Total CIs', total, 'total', resetFilters)}
      {summaryCard('Operational', operational, 'active', () => setStatus('Operational'))}
      {summaryCard('Inactive', inactive, 'inactive', () => setStatus('non-operational'))}
      {summaryCard('Critical', critical, 'critical', () => updateFilter('criticality', 'Critical'))}
      {summaryCard('Retired', retired, 'retired', () => setStatus('Retired'))}
    </section>

    <section className="ci-inventory-panel" aria-label="Configuration item inventory">
      <div className="ci-inventory-toolbar">
        <label className="ci-inventory-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search CI name, CI ID, hostname, IP, serial number…" aria-label="Search configuration items" /><kbd>⌕</kbd></label>
        <div className="ci-toolbar-actions"><span>{visibleRows.length.toLocaleString()} CIs</span><button type="button" onClick={() => downloadCsv(selectedRows.length ? selectedRows : visibleRows, selectedRows.length ? 'selected-configuration-items.csv' : 'configuration-items.csv', rows)} disabled={!visibleRows.length}>Export{selectedRows.length ? ` selected (${selectedRows.length})` : ''}</button></div>
      </div>
      <div className="ci-filter-grid">
        <FilterSelect label="CI Class" value={filters.class} onChange={(value) => updateFilter('class', value)} options={CI_CLASSES} allLabel="All classes" />
        <FilterSelect label="Environment" value={filters.environment} onChange={(value) => updateFilter('environment', value)} options={ENVIRONMENTS} allLabel="All environments" />
        <FilterSelect label="Status" value={filters.status === 'non-operational' ? 'non-operational' : filters.status} onChange={(value) => updateFilter('status', value)} options={[...STATUSES, { value: 'non-operational', label: 'Non-operational' }]} allLabel="All statuses" />
        <FilterSelect label="Criticality" value={filters.criticality} onChange={(value) => updateFilter('criticality', value)} options={CRITICALITIES} allLabel="All criticality" />
        <FilterSelect label="Business Service" value={filters.service} onChange={(value) => updateFilter('service', value)} options={values.services} allLabel="All services" />
        <FilterSelect label="Owner" value={filters.owner} onChange={(value) => updateFilter('owner', value)} options={[{ value: 'empty', label: 'No owner' }, ...values.owners]} allLabel="All owners" />
        <button className="ci-more-filters-button" type="button" aria-expanded={moreFilters} onClick={() => setMoreFilters((open) => !open)}>{moreFilters ? '− Fewer filters' : '+ More filters'}</button>
        {moreFilters && <div className="ci-more-filter-fields">
          <FilterSelect label="Location" value={filters.location} onChange={(value) => updateFilter('location', value)} options={locations.map((item) => ({ value: String(item.id), label: item.name }))} allLabel="All locations" />
          <FilterSelect label="Support Group" value={filters.supportGroup} onChange={(value) => updateFilter('supportGroup', value)} options={values.groups} allLabel="All groups" />
          <FilterSelect label="Department" value={filters.department} onChange={(value) => updateFilter('department', value)} options={values.departments} allLabel="All departments" />
          <FilterSelect label="Vendor" value={filters.vendor} onChange={(value) => updateFilter('vendor', value)} options={values.vendors} allLabel="All vendors" />
          <FilterSelect label="Lifecycle" value={filters.lifecycle} onChange={(value) => updateFilter('lifecycle', value)} options={LIFECYCLE} allLabel="All lifecycle states" />
          <FilterSelect label="CI Health" value={filters.quality} onChange={(value) => updateFilter('quality', value)} options={[{ value: 'healthy', label: 'Healthy' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }, { value: 'incomplete', label: 'Incomplete record' }, { value: 'relationships-empty', label: 'No relationships' }, { value: 'identity-empty', label: 'Missing infrastructure ID' }, { value: 'duplicate-name', label: 'Possible duplicate name' }]} allLabel="All health checks" />
          <FilterSelect label="Created" value={filters.days} onChange={(value) => updateFilter('days', value)} options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} allLabel="Any time" />
        </div>}
        <button type="button" className="ci-reset-filters" onClick={resetFilters}>Reset filters</button>
      </div>

      {selectedRows.length > 0 && <div className="ci-selection-bar"><span><strong>{selectedRows.length}</strong> {selectedRows.length === 1 ? 'CI selected' : 'CIs selected'}</span><div><button type="button" onClick={() => downloadCsv(selectedRows, 'selected-configuration-items.csv')}>Export selected</button><button type="button" onClick={() => setSelected([])}>Clear selection</button></div></div>}

      <div className="ci-table-caption"><strong>{visibleRows.length.toLocaleString()} Configuration Items</strong><span>{filters.class || filters.environment || filters.status || filters.criticality || filters.service || filters.owner ? 'Filters applied' : 'All configuration items'}</span></div>
      <div className="ci-table-wrap"><table className="ci-inventory-table"><thead><tr><th className="ci-checkbox-cell"><input type="checkbox" aria-label="Select current page" checked={pageRows.length > 0 && pageRows.every((record) => selected.includes(record.onboardingId))} onChange={togglePage} /></th><th>CI Name</th><th>Class</th><th>Type</th><th>Environment</th><th>Status</th><th>Criticality</th><th>Business Service</th><th>Owner</th><th>Support Group</th><th>Created</th><th>Health</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="13"><div className="ci-grid-state"><span className="ci-grid-spinner"/>Loading configuration items…</div></td></tr>
          : loadError ? <tr><td colSpan="13"><div className="ci-grid-state ci-grid-error" role="alert">{loadError}</div></td></tr>
            : pageRows.length ? pageRows.map((record) => { const detail = detailsFor(record); const services = serviceNamesFor(record, rows); const health = healthFor(record); return <tr key={record.onboardingId} className="ci-inventory-row" onClick={() => openRecord(record)}>
              <td className="ci-checkbox-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${record.applicationName}`} checked={selected.includes(record.onboardingId)} onChange={() => toggleRow(record.onboardingId)} /></td>
              <td className="ci-name-cell"><Link to={`/application-server/on-boarding?edit=${record.onboardingId}`} onClick={(event) => event.stopPropagation()}><strong>{record.applicationName || '—'}</strong><small>{record.applicationNumber || record.applicationCode || 'CI number unavailable'}</small></Link></td>
              <td>{record.applicationCategory || '—'}</td><td><span className="ci-type-pill">{record.applicationType || '—'}</span></td><td>{record.environment || '—'}</td>
              <td><span className={`ci-status-pill ci-status-${(record.status || '').toLowerCase().replaceAll(' ', '-')}`}>{record.status || '—'}</span></td><td><span className={`ci-criticality ci-criticality-${(record.businessCriticality || '').toLowerCase()}`}>{record.businessCriticality || '—'}</span></td>
              <td className="ci-service-cell" title={services.join(', ')}>{services.length ? services.join(', ') : '—'}</td><td>{record.applicationOwner?.displayName || '—'}</td><td>{record.managedByGroup?.groupName || '—'}</td><td>{dateFor(record)?.toLocaleDateString() || '—'}</td>
              <td><span className={`ci-health-pill ci-health-${health.tone}`}><i/>{health.label}</span></td><td onClick={(event) => event.stopPropagation()}><button type="button" className="ci-row-edit" aria-label={`Edit ${record.applicationName}`} title="Edit CI" onClick={() => openRecord(record)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M4 20l4.1-.8L19 8.3a2.1 2.1 0 0 0-3-3L5.1 16.2 4 20Z"/></svg></button></td>
            </tr>}) : <tr><td colSpan="13"><div className="ci-grid-state">{rows.length ? 'No configuration items match these filters.' : 'No configuration items have been created yet.'}</div></td></tr>}
      </tbody></table></div>

      <footer className="ci-pagination"><label>Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>Showing {firstRow}–{lastRow} of {visibleRows.length.toLocaleString()}</span><div className="ci-page-controls"><button type="button" aria-label="Previous page" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>‹</button><span>Page {currentPage} of {pageCount}</span><button type="button" aria-label="Next page" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount}>›</button></div></footer>
    </section>
  </section>
}
