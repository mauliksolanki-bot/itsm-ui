import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import './ApplicationServersPage.css'

const PAGE_SIZES = [25, 50, 100]
const COLUMN_FILTERS = [
  { field: 'name', label: 'CI Name' },
  { field: 'class', label: 'Class', choices: ['Server', 'Application', 'Database', 'Network Device', 'Storage', 'Virtual Machine', 'Cloud Resource', 'Endpoint', 'Software', 'Business Service', 'Application Service', 'API', 'Middleware'] },
  { field: 'type', label: 'Type', choices: ['Application Server', 'Database Server', 'Web Application', 'Mobile Application', 'Desktop Application', 'API', 'Microservice', 'Batch Application', 'Router', 'Switch', 'Firewall', 'Load Balancer', 'Storage', 'Virtual Machine', 'Cloud Resource', 'Endpoint', 'Software', 'Business Service', 'Application Service', 'Middleware', 'Other'] },
  { field: 'environment', label: 'Environment', choices: ['Development', 'QA', 'UAT', 'Staging', 'Production', 'DR'] },
  { field: 'status', label: 'Status', choices: ['Planned', 'Ordered', 'Installed', 'Operational', 'Maintenance', 'Retired', 'Disposed'] },
  { field: 'criticality', label: 'Criticality', choices: ['Critical', 'High', 'Medium', 'Low'] },
  { field: 'service', label: 'Business Service' },
  { field: 'owner', label: 'Owner' },
  { field: 'supportGroup', label: 'Support Group' },
  { field: 'created', label: 'Created', date: true },
  { field: 'health', label: 'Health', choices: ['Critical', 'Warning', 'Healthy'], health: true },
]

function CIColumnFilterIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" /></svg>
}

function CIColumnFilter({ field, label, filter, choices = [], date = false, health = false, onApply, onClear }) {
  const defaultOperator = choices.length || health ? 'EQUALS' : 'CONTAINS'
  const [operator, setOperator] = useState(filter?.operator || defaultOperator)
  const [value, setValue] = useState(filter?.value || '')
  const noValue = operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY'
  const operators = date
    ? [['EQUALS', 'On'], ['NOT_EQUALS', 'Not on'], ['BEFORE', 'Before'], ['AFTER', 'After'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
    : health
      ? [['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not']]
      : choices.length
        ? [['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
        : [['CONTAINS', 'Contains'], ['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['STARTS_WITH', 'Starts with'], ['ENDS_WITH', 'Ends with'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
  return <details className={`ci-column-filter${filter ? ' is-filtered' : ''}`} onToggle={(event) => {
    if (event.currentTarget.open) { setOperator(filter?.operator || defaultOperator); setValue(filter?.value || '') }
  }}>
    <summary title={`Filter ${label}`} aria-label={`Filter ${label}`}><CIColumnFilterIcon /></summary>
    <div className="ci-column-filter-popover">
      <strong>Filter {label}</strong>
      <label><span>Condition</span><select value={operator} onChange={(event) => setOperator(event.target.value)}>{operators.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
      {!noValue && <label><span>Value</span>{choices.length ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose a value</option>{choices.map((choice) => <option value={choice} key={choice}>{choice}</option>)}</select> : <input type={date ? 'date' : 'text'} autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false } }} />}</label>}
      <div className="ci-column-filter-actions"><button type="button" className="ci-column-clear" onClick={(event) => { onClear(); event.currentTarget.closest('details').open = false }}>Clear</button><button type="button" className="ci-column-apply" disabled={!noValue && !value.trim()} onClick={(event) => { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false }}>Filter</button></div>
    </div>
  </details>
}

async function responseBody(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.message || 'Unable to load configuration items.')
    error.status = response.status
    throw error
  }
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
  const hasRelationship = Number(record.relationshipCount || 0) > 0 || (details.relationships || []).some((relation) => relation.relatedCi)
  if (!record.description?.trim() || missingIdentity || !hasRelationship) return { label: 'Warning', tone: 'warning' }
  return { label: 'Healthy', tone: 'healthy' }
}

function typeTone(type = '') {
  const value = type.toLowerCase()
  if (/database/.test(value)) return 'database'
  if (/server|virtual machine|cloud resource/.test(value)) return 'infrastructure'
  if (/business service|application service/.test(value)) return 'service'
  if (/web application|mobile application|desktop application/.test(value)) return 'application'
  if (/router|switch|firewall|load balancer/.test(value)) return 'network'
  if (/storage/.test(value)) return 'storage'
  if (/endpoint/.test(value)) return 'endpoint'
  if (/api|microservice|middleware|batch application/.test(value)) return 'integration'
  return 'general'
}

function downloadCsv(records, filename = 'configuration-items.csv', allRecords = records) {
  const columns = ['CI ID', 'CI Name', 'CI Class', 'CI Type', 'Environment', 'Status', 'Criticality', 'Business Service', 'Owner', 'Support Group', 'Created']
  const values = records.map((record) => [record.applicationNumber, record.applicationName, record.applicationCategory, record.applicationType, record.environment, record.status, record.businessCriticality, serviceNamesFor(record, allRecords).join('; '), record.applicationOwner?.displayName || '', record.managedByGroup?.groupName || '', dateFor(record)?.toISOString() || ''])
  const csv = [columns, ...values].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export default function ApplicationServersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOwnerOnly = user?.roles?.includes('CI_OWNER') && !user?.roles?.includes('SUPER_ADMIN')
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [columnFilters, setColumnFilters] = useState({})
  const [pagination, setPagination] = useState({ totalElements: 0, totalPages: 0, totalCis: 0, operationalCis: 0, criticalCis: 0, retiredCis: 0 })

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page - 1), size: String(pageSize) })
    for (const key of ['class', 'environment', 'status', 'criticality', 'service', 'quality']) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    Object.entries(columnFilters).forEach(([key, filter]) => {
      if (key === 'health') params.set('quality', filter.value.toLowerCase())
      else {
        params.set(`${key}.operator`, filter.operator)
        params.set(`${key}.value`, filter.value || '')
      }
    })
    setLoading(true)
    fetch(`/api/application-onboarding/page?${params}`, { credentials: 'include', signal: controller.signal })
      .then(responseBody).then((result) => {
        setRows(Array.isArray(result.content) ? result.content : [])
        setPagination(result)
        setLoadError('')
        if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setLoadError(error.status === 401
          ? 'The CI Data API rejected this request (401). Refresh the page; if the error persists, sign out and sign back in.'
          : error.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, pageSize, searchParams, columnFilters])

  const total = pagination.totalCis || 0
  const operational = pagination.operationalCis || 0
  const critical = pagination.criticalCis || 0
  const retired = pagination.retiredCis || 0
  const inactive = total - operational
  const pageCount = Math.max(1, pagination.totalPages || 0)
  const currentPage = Math.min(page, pageCount)
  const pageRows = rows
  const firstRow = pagination.totalElements ? (currentPage - 1) * pageSize + 1 : 0
  const lastRow = Math.min(currentPage * pageSize, pagination.totalElements || 0)

  useEffect(() => { setPage(1) }, [searchParams, columnFilters])

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  function setStatus(status) { updateFilter('status', status) }
  function resetFilters() { setSearchParams({}, { replace: true }); setColumnFilters({}) }
  function applyColumnFilter(field, filter) { setColumnFilters((current) => ({ ...current, [field]: filter })); setPage(1) }
  function clearColumnFilter(field) { setColumnFilters((current) => { const next = { ...current }; delete next[field]; return next }); setPage(1) }
  function openRecord(record) { navigate(`/cmdb/newci?edit=${record.onboardingId}`) }
  function summaryCard(label, value, tone, click) { return <button type="button" className={`ci-summary-card ci-summary-${tone}`} onClick={click}><span>{label}</span><strong>{value.toLocaleString()}</strong></button> }

  async function exportAll() {
    try {
      const exportParams = new URLSearchParams(searchParams)
      Object.entries(columnFilters).forEach(([key, filter]) => {
        if (key === 'health') exportParams.set('quality', filter.value.toLowerCase())
        else { exportParams.set(`${key}.operator`, filter.operator); exportParams.set(`${key}.value`, filter.value || '') }
      })
      for (const key of ['page', 'size']) exportParams.delete(key)
      exportParams.set('size', '100')
      let exportPage = 0
      const records = []
      let totalPages = 1
      while (exportPage < totalPages) {
        exportParams.set('page', String(exportPage))
        const result = await responseBody(await fetch(`/api/application-onboarding/page?${exportParams}`, { credentials: 'include' }))
        records.push(...(result.content || []))
        totalPages = result.totalPages || 0
        exportPage += 1
      }
      downloadCsv(records, 'configuration-items.csv', records)
    } catch (error) {
      setLoadError(error.status === 401
        ? 'The CI Data export request was rejected (401). Refresh the page; if the error persists, sign out and sign back in.'
        : error.message)
    }
  }

  return <section className="configuration-items-page" aria-labelledby="ci-grid-title">
    <header className="ci-page-heading"><div><h1 id="ci-grid-title">{isOwnerOnly ? 'My Configuration Items' : 'Configuration Items'}</h1><p>{isOwnerOnly ? 'Configuration items assigned to you as owner.' : 'Complete inventory of configuration items managed in the CMDB.'}</p></div><div className="ci-page-actions"><button type="button" className="ci-secondary-button" onClick={exportAll} disabled={!pagination.totalElements}>↓ Export</button>{!isOwnerOnly && <Link className="ci-primary-button" to="/cmdb/newci">＋ Create CI</Link>}</div></header>

    <section className="ci-summary-cards" aria-label="CI summary">
      {summaryCard('Total CIs', total, 'total', resetFilters)}
      {summaryCard('Operational', operational, 'active', () => setStatus('Operational'))}
      {summaryCard('Inactive', inactive, 'inactive', () => setStatus('non-operational'))}
      {summaryCard('Critical', critical, 'critical', () => updateFilter('criticality', 'Critical'))}
      {summaryCard('Retired', retired, 'retired', () => setStatus('Retired'))}
    </section>

    <section className="ci-inventory-panel" aria-label="Configuration item inventory">
      <div className="ci-table-caption"><strong>{(pagination.totalElements || 0).toLocaleString()} Configuration Items</strong><span>{Object.keys(columnFilters).length || ['class', 'environment', 'status', 'criticality', 'service', 'quality'].some((key) => searchParams.has(key)) ? 'Filters applied' : 'All configuration items'}</span></div>
      <div className="ci-table-wrap"><table className="ci-inventory-table"><thead><tr>{COLUMN_FILTERS.slice(0, 2).map((column) => <th key={column.field}><div className="ci-th-content"><span>{column.label}</span><CIColumnFilter {...column} filter={columnFilters[column.field]} onApply={(filter) => applyColumnFilter(column.field, filter)} onClear={() => clearColumnFilter(column.field)} /></div></th>)}<th>Relationships</th>{COLUMN_FILTERS.slice(2).map((column) => <th key={column.field}><div className="ci-th-content"><span>{column.label}</span><CIColumnFilter {...column} filter={columnFilters[column.field]} onApply={(filter) => applyColumnFilter(column.field, filter)} onClear={() => clearColumnFilter(column.field)} /></div></th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan="12"><div className="ci-grid-state"><span className="ci-grid-spinner"/>Loading configuration items…</div></td></tr>
          : loadError ? <tr><td colSpan="12"><div className="ci-grid-state ci-grid-error" role="alert">{loadError}</div></td></tr>
            : pageRows.length ? pageRows.map((record) => { const services = serviceNamesFor(record, rows); const health = healthFor(record); return <tr key={record.onboardingId} className="ci-inventory-row" onClick={() => openRecord(record)}>
              <td className="ci-name-cell"><Link to={`/cmdb/newci?edit=${record.onboardingId}`} onClick={(event) => event.stopPropagation()}><strong>{record.applicationName || '—'}</strong><small>{record.applicationNumber || record.applicationCode || 'CI number unavailable'}</small></Link></td>
              <td>{record.applicationCategory || '—'}</td><td><Link className="ci-relationship-count" to={`/cmdb/newci?edit=${record.onboardingId}&tab=Relationships`} onClick={(event) => event.stopPropagation()} aria-label={`${record.relationshipCount || 0} relationships for ${record.applicationName}`}>{record.relationshipCount || 0}</Link></td><td><span className={`ci-type-pill ci-type-${typeTone(record.applicationType)}`}>{record.applicationType || '—'}</span></td><td>{record.environment || '—'}</td>
              <td><span className={`ci-status-pill ci-status-${(record.status || '').toLowerCase().replaceAll(' ', '-')}`}>{record.status || '—'}</span></td><td><span className={`ci-criticality ci-criticality-${(record.businessCriticality || '').toLowerCase()}`}>{record.businessCriticality || '—'}</span></td>
              <td className="ci-service-cell" title={services.join(', ')}>{services.length ? services.join(', ') : '—'}</td><td>{record.applicationOwner?.displayName || '—'}</td><td>{record.managedByGroup?.groupName || '—'}</td><td>{dateFor(record)?.toLocaleDateString() || '—'}</td>
              <td><span className={`ci-health-pill ci-health-${health.tone}`}><i/>{health.label}</span></td>
            </tr>}) : <tr><td colSpan="12"><div className="ci-grid-state">{pagination.totalElements ? 'No configuration items match these filters.' : 'No configuration items have been created yet.'}</div></td></tr>}
      </tbody></table></div>

      <footer className="ci-pagination"><label>Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>Showing {firstRow}–{lastRow} of {(pagination.totalElements || 0).toLocaleString()}</span><div className="ci-page-controls"><button type="button" aria-label="Previous page" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>‹</button><span>Page {currentPage} of {pageCount}</span><button type="button" aria-label="Next page" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount}>›</button></div></footer>
    </section>
  </section>
}
