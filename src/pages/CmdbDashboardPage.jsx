import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './CmdbDashboardPage.css'

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
  return `/cmdb/cidata${query.size ? `?${query}` : ''}`
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

  const filteredRecords = records

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

  function viewCis(selection = {}) { return ciLink(selection) }
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

    {error && <div className="cmdb-error" role="alert"><span>{error}</span><button type="button" onClick={() => loadRecords()}>Retry</button></div>}
    {loading && !records.length ? <div className="cmdb-loading" role="status"><span className="cmdb-spinner" />Loading CMDB dashboard…</div> : <>
      <section className="cmdb-metrics" aria-label="Configuration item summary">
        <MetricCard label="Total CIs" value={total.toLocaleString()} detail="Configuration items" tone="blue" to={viewCis()} />
        <MetricCard label="Operational CIs" value={active.toLocaleString()} detail={`${total ? Math.round(active / total * 100) : 0}% of all CIs`} tone="green" to={viewCis({ status: 'Operational' })} />
        <MetricCard label="Other statuses" value={inactive.toLocaleString()} detail="Needs review or lifecycle action" tone="amber" to={viewCis({ status: 'non-operational' })} />
        <MetricCard label="Critical CIs" value={critical.toLocaleString()} detail="Marked critical" tone="rose" to={viewCis({ criticality: 'Critical' })} />
        <Link className="cmdb-metric cmdb-metric-health" to={viewCis({ quality: 'incomplete' })}><span className="cmdb-metric-label">Record completeness</span><strong>{completeness}%</strong><span className="cmdb-metric-detail">Owner, group, and description present<span aria-hidden="true">↗</span></span><span className="cmdb-health-track"><i style={{ width: `${completeness}%` }} /></span></Link>
      </section>

      <div className="cmdb-analytics-grid">
        <BarList title="CIs by class" description="Configuration item distribution" items={byClass} toFilter={(item) => viewCis({ class: item.label })} emptyText="No CI class data available." />
        <BarList title="CIs by environment" description="Where your estate is deployed" items={byEnvironment} toFilter={(item) => viewCis({ environment: item.label })} emptyText="No environment data available." />
        <BarList title="CIs by business service" description="Items linked to business services" items={byService} toFilter={(item) => item.label === 'No linked business service' ? viewCis({ quality: 'relationships-empty' }) : viewCis({ service: item.label })} emptyText="No business service data available." />
        <section className="cmdb-panel cmdb-health-panel">
          <header className="cmdb-panel-heading"><div><h2>CMDB health</h2><p>Data quality checks for your estate</p></div><span className="cmdb-health-score">{healthItems.reduce((sum, item) => sum + item.count, 0)} <small>findings</small></span></header>
          <div className="cmdb-health-list">{healthItems.map((item) => <Link to={viewCis({ quality: item.quality })} className="cmdb-health-row" key={item.quality}><span className="cmdb-health-indicator" aria-hidden="true">!</span><span>{item.label}</span><strong>{item.count}</strong><span className="cmdb-health-arrow" aria-hidden="true">→</span></Link>)}</div>
          <div className="cmdb-completeness-note"><span className="cmdb-completeness-dot" /> Completeness is based on required ownership and description fields.</div>
        </section>
      </div>

      <section className="cmdb-panel cmdb-recent-panel">
        <header className="cmdb-panel-heading"><div><h2>Recently added CIs</h2><p>Latest configuration items registered in the CMDB</p></div><Link to={viewCis()}>View all <span aria-hidden="true">→</span></Link></header>
        <div className="cmdb-recent-table-wrap"><table className="cmdb-recent-table"><thead><tr><th>CI name</th><th>CI class</th><th>Environment</th><th>Status</th><th>Owner</th><th>Created</th></tr></thead><tbody>
          {recentRecords.length ? recentRecords.map((record) => <tr key={record.onboardingId} onClick={() => navigate(`/cmdb/newci?edit=${record.onboardingId}`)}><td><span className="cmdb-recent-id">{record.applicationNumber}</span><strong>{record.applicationName}</strong></td><td>{record.applicationCategory || '—'}</td><td>{record.environment || '—'}</td><td><span className={`cmdb-status-pill cmdb-status-${(record.status || '').toLowerCase().replaceAll(' ', '-')}`}>{record.status || '—'}</span></td><td>{record.applicationOwner?.displayName || '—'}</td><td>{recordDate(record)?.toLocaleDateString() || '—'}</td></tr>) : <tr><td colSpan="6" className="cmdb-table-empty">{error ? 'CMDB records are unavailable.' : 'No configuration items available.'}</td></tr>}
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
