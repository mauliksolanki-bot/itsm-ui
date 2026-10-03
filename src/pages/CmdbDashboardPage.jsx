import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './CmdbDashboardPage.css'

const PERIODS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All records' },
]

async function responseBody(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load CMDB records.')
  return body
}

function readDetails(record) {
  try { return record.ciDetailsJson ? JSON.parse(record.ciDetailsJson) : {} } catch { return {} }
}

function relationServices(record, records) {
  const details = readDetails(record)
  return (details.relationships || []).map((relationship) => {
    const target = relationship.relatedCi
    if (!target) return null
    if (target.applicationCategory === 'Business Service' || target.applicationCategory === 'Application Service') return target.applicationName
    const match = records.find((item) => item.applicationNumber === target.applicationNumber || item.applicationName === target.applicationName)
    return ['Business Service', 'Application Service'].includes(match?.applicationCategory) ? match.applicationName : null
  }).filter(Boolean)
}

function recordDate(record) { return record.createdAt ? new Date(record.createdAt) : null }
function isOperational(record) { return record.status?.toLowerCase() === 'operational' }
function ciLink(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  return `/application-server/app-servers${query.size ? `?${query}` : ''}`
}

function MetricCard({ label, value, detail, tone, to }) {
  return <Link className={`cmdb-metric cmdb-metric-${tone}`} to={to}>
    <span className="cmdb-metric-label">{label}</span>
    <strong>{value}</strong>
    <span className="cmdb-metric-detail">{detail}<span aria-hidden="true">↗</span></span>
  </Link>
}

function BarList({ title, description, items, toFilter, emptyText }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  return <section className="cmdb-panel cmdb-chart-panel">
    <header className="cmdb-panel-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="cmdb-panel-mark" aria-hidden="true">▤</span></header>
    {items.length ? <div className="cmdb-bar-list">{items.map((item) => <Link key={item.label} className="cmdb-bar-row" to={toFilter(item)}>
      <span className="cmdb-bar-label" title={item.label}>{item.label}</span><span className="cmdb-bar-track"><i style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} /></span><strong>{item.count}</strong>
    </Link>)}</div> : <p className="cmdb-empty-chart">{emptyText}</p>}
  </section>
}

export default function CmdbDashboardPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('all')
  const [filters, setFilters] = useState({ ciClass: '', environment: '', status: '', service: '', owner: '' })
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const loadRecords = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await fetch('/api/application-onboarding', { credentials: 'include' }).then(responseBody)
      setRecords(Array.isArray(data) ? data : [])
      setError('')
      setLastRefreshed(new Date())
    } catch (failure) { setError(failure.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { loadRecords(); }, [loadRecords])

  const services = useMemo(() => [...new Set(records.filter((record) => ['Business Service', 'Application Service'].includes(record.applicationCategory)).map((record) => record.applicationName))].sort(), [records])
  const owners = useMemo(() => [...new Map(records.filter((record) => record.applicationOwner).map((record) => [record.applicationOwner.userId, record.applicationOwner.displayName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [records])
  const filteredRecords = useMemo(() => {
    const cutoff = period === 'all' ? null : Date.now() - Number(period) * 86400000
    return records.filter((record) => {
      const inPeriod = cutoff === null || (recordDate(record)?.getTime() ?? 0) >= cutoff
      const matchService = !filters.service || relationServices(record, records).includes(filters.service) || record.applicationName === filters.service
      return inPeriod && (!filters.ciClass || record.applicationCategory === filters.ciClass) && (!filters.environment || record.environment === filters.environment) && (!filters.status || record.status === filters.status) && matchService && (!filters.owner || String(record.applicationOwner?.userId || '') === filters.owner)
    })
  }, [records, period, filters])

  const total = filteredRecords.length
  const active = filteredRecords.filter(isOperational).length
  const inactive = total - active
  const critical = filteredRecords.filter((record) => record.businessCriticality?.toLowerCase() === 'critical').length
  const completeness = total ? Math.round(filteredRecords.filter((record) => record.applicationOwner && record.managedByGroup && record.description?.trim()).length / total * 100) : 0

  const byClass = useMemo(() => aggregate(filteredRecords, (record) => record.applicationCategory || 'Unclassified'), [filteredRecords])
  const byEnvironment = useMemo(() => aggregate(filteredRecords, (record) => record.environment || 'Unassigned'), [filteredRecords])
  const byService = useMemo(() => {
    const counts = new Map()
    filteredRecords.forEach((record) => {
      const linked = relationServices(record, records)
      ;(linked.length ? linked : ['No linked business service']).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1))
    })
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  }, [filteredRecords, records])

  const healthItems = useMemo(() => {
    const missingOwners = filteredRecords.filter((record) => !record.applicationOwner).length
    const missingRelations = filteredRecords.filter((record) => !(readDetails(record).relationships || []).some((relation) => relation.relatedCi)).length
    const duplicateNames = new Set([...new Set(filteredRecords.map((record) => record.applicationName?.trim().toLowerCase()).filter(Boolean))].filter((name) => filteredRecords.filter((record) => record.applicationName?.trim().toLowerCase() === name).length > 1))
    const identityGaps = filteredRecords.filter((record) => ['Server', 'Database', 'Network Device'].includes(record.applicationCategory)).filter((record) => { const detail = readDetails(record); return !detail.hostname && !detail.assetTag && !detail.serialNumber }).length
    return [
      { label: 'Missing owners', count: missingOwners, quality: 'owner-empty' },
      { label: 'Missing relationships', count: missingRelations, quality: 'relationships-empty' },
      { label: 'Possible duplicate names', count: duplicateNames.size, quality: 'duplicate-name' },
      { label: 'Infrastructure IDs missing', count: identityGaps, quality: 'identity-empty' },
    ]
  }, [filteredRecords])

  const recentRecords = useMemo(() => [...filteredRecords].sort((a, b) => (recordDate(b)?.getTime() ?? 0) - (recordDate(a)?.getTime() ?? 0)).slice(0, 6), [filteredRecords])

  function updateFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  function clearFilters() { setFilters({ ciClass: '', environment: '', status: '', service: '', owner: '' }); setPeriod('all') }
  const currentListFilters = { class: filters.ciClass, environment: filters.environment, status: filters.status, service: filters.service, owner: filters.owner, days: period === 'all' ? '' : period }
  function viewCis(selection = {}) { return ciLink({ ...currentListFilters, ...selection }) }
  function exportCsv() {
    const columns = ['CI ID', 'CI name', 'CI class', 'CI type', 'Environment', 'Status', 'Criticality', 'Owner']
    const rows = filteredRecords.map((record) => [record.applicationNumber, record.applicationName, record.applicationCategory, record.applicationType, record.environment, record.status, record.businessCriticality, record.applicationOwner?.displayName || ''])
    const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cmdb-configuration-items.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return <section className="cmdb-dashboard" aria-labelledby="cmdb-dashboard-title">
    <header className="cmdb-dashboard-heading">
      <div><span className="cmdb-eyebrow">CONFIGURATION MANAGEMENT</span><h1 id="cmdb-dashboard-title">CMDB Dashboard</h1><p>Operational visibility across your configuration items and service estate.</p></div>
      <div className="cmdb-header-actions"><span className="cmdb-refreshed">{lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live CMDB data'}</span><button type="button" onClick={() => loadRecords(true)} disabled={refreshing} aria-label="Refresh dashboard">{refreshing ? 'Refreshing…' : '↻ Refresh'}</button><button type="button" onClick={exportCsv} disabled={!filteredRecords.length}>↓ Export</button></div>
    </header>

    <section className="cmdb-filter-panel" aria-label="Dashboard filters">
      <div className="cmdb-filter-title"><div><strong>Dashboard filters</strong><span>Refine the CMDB metrics and charts</span></div><button type="button" onClick={clearFilters}>Reset</button></div>
      <div className="cmdb-filter-grid">
        <label>Time period<select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>CI class<select value={filters.ciClass} onChange={(event) => updateFilter('ciClass', event.target.value)}><option value="">All classes</option>{[...new Set(records.map((record) => record.applicationCategory).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Environment<select value={filters.environment} onChange={(event) => updateFilter('environment', event.target.value)}><option value="">All environments</option>{[...new Set(records.map((record) => record.environment).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{[...new Set(records.map((record) => record.status).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Business service<select value={filters.service} onChange={(event) => updateFilter('service', event.target.value)}><option value="">All services</option>{services.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Owner<select value={filters.owner} onChange={(event) => updateFilter('owner', event.target.value)}><option value="">All owners</option>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </section>

    {error && <div className="cmdb-error" role="alert"><span>{error}</span><button type="button" onClick={() => loadRecords()}>Retry</button></div>}
    {loading && !records.length ? <div className="cmdb-loading" role="status"><span className="cmdb-spinner" />Loading CMDB dashboard…</div> : <>
      <section className="cmdb-metrics" aria-label="Configuration item summary">
        <MetricCard label="Total CIs" value={total.toLocaleString()} detail="Configuration items" tone="blue" to={viewCis()} />
        <MetricCard label="Operational CIs" value={active.toLocaleString()} detail={`${total ? Math.round(active / total * 100) : 0}% of current view`} tone="green" to={viewCis({ status: 'Operational' })} />
        <MetricCard label="Other statuses" value={inactive.toLocaleString()} detail="Needs review or lifecycle action" tone="amber" to={viewCis({ status: 'non-operational' })} />
        <MetricCard label="Critical CIs" value={critical.toLocaleString()} detail="Marked critical" tone="rose" to={viewCis({ criticality: 'Critical' })} />
        <Link className="cmdb-metric cmdb-metric-health" to={viewCis({ quality: 'incomplete' })}><span className="cmdb-metric-label">Record completeness</span><strong>{completeness}%</strong><span className="cmdb-metric-detail">Owner, group, and description present<span aria-hidden="true">↗</span></span><span className="cmdb-health-track"><i style={{ width: `${completeness}%` }} /></span></Link>
      </section>

      <div className="cmdb-analytics-grid">
        <BarList title="CIs by class" description="Configuration item distribution" items={byClass} toFilter={(item) => viewCis({ class: item.label })} emptyText="No CI class data for these filters." />
        <BarList title="CIs by environment" description="Where your estate is deployed" items={byEnvironment} toFilter={(item) => viewCis({ environment: item.label })} emptyText="No environment data for these filters." />
        <BarList title="CIs by business service" description="Items linked to business services" items={byService} toFilter={(item) => item.label === 'No linked business service' ? viewCis({ quality: 'relationships-empty' }) : viewCis({ service: item.label })} emptyText="No business service data for these filters." />
        <section className="cmdb-panel cmdb-health-panel">
          <header className="cmdb-panel-heading"><div><h2>CMDB health</h2><p>Data quality checks for this view</p></div><span className="cmdb-health-score">{healthItems.reduce((sum, item) => sum + item.count, 0)} <small>findings</small></span></header>
          <div className="cmdb-health-list">{healthItems.map((item) => <Link to={viewCis({ quality: item.quality })} className="cmdb-health-row" key={item.quality}><span className="cmdb-health-indicator" aria-hidden="true">!</span><span>{item.label}</span><strong>{item.count}</strong><span className="cmdb-health-arrow" aria-hidden="true">→</span></Link>)}</div>
          <div className="cmdb-completeness-note"><span className="cmdb-completeness-dot" /> Completeness is based on required ownership and description fields.</div>
        </section>
      </div>

      <section className="cmdb-panel cmdb-recent-panel">
        <header className="cmdb-panel-heading"><div><h2>Recently added CIs</h2><p>Latest configuration items registered in the CMDB</p></div><Link to={viewCis()}>View all <span aria-hidden="true">→</span></Link></header>
        <div className="cmdb-recent-table-wrap"><table className="cmdb-recent-table"><thead><tr><th>CI name</th><th>CI class</th><th>Environment</th><th>Status</th><th>Owner</th><th>Created</th></tr></thead><tbody>
          {recentRecords.length ? recentRecords.map((record) => <tr key={record.onboardingId} onClick={() => navigate(`/application-server/on-boarding?edit=${record.onboardingId}`)}><td><span className="cmdb-recent-id">{record.applicationNumber}</span><strong>{record.applicationName}</strong></td><td>{record.applicationCategory || '—'}</td><td>{record.environment || '—'}</td><td><span className={`cmdb-status-pill cmdb-status-${(record.status || '').toLowerCase().replaceAll(' ', '-')}`}>{record.status || '—'}</span></td><td>{record.applicationOwner?.displayName || '—'}</td><td>{recordDate(record)?.toLocaleDateString() || '—'}</td></tr>) : <tr><td colSpan="6" className="cmdb-table-empty">{error ? 'CMDB records are unavailable.' : 'No configuration items match these filters.'}</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </section>
}

function aggregate(records, getLabel) {
  const counts = new Map()
  records.forEach((record) => { const label = getLabel(record); counts.set(label, (counts.get(label) || 0) + 1) })
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 7)
}
