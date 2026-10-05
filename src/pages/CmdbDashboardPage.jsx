import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './CmdbDashboardPage.css'
import './CmdbDashboardCharts.css'

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

const chartColors = ['#3f98bd', '#35a48f', '#8a72c4', '#e4a34c', '#de6d72', '#5b82bf', '#80aa62', '#bd78a8', '#48a7ae', '#788796', '#c18553', '#6887a8', '#5a9b78']

function PieChart({ items, toFilter }) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  let angle = -90
  const slices = items.map((item, index) => {
    const start = angle
    angle += total ? item.count / total * 360 : 0
    const startRadians = start * Math.PI / 180
    const endRadians = angle * Math.PI / 180
    const largeArc = angle - start > 180 ? 1 : 0
    const path = total
      ? `M 100 100 L ${100 + 82 * Math.cos(startRadians)} ${100 + 82 * Math.sin(startRadians)} A 82 82 0 ${largeArc} 1 ${100 + 82 * Math.cos(endRadians)} ${100 + 82 * Math.sin(endRadians)} Z`
      : ''
    return { ...item, path, fullCircle: items.length === 1, color: chartColors[index % chartColors.length] }
  })

  return <section className="cmdb-panel cmdb-chart-panel cmdb-pie-panel">
    <header className="cmdb-panel-heading"><div><h2>CIs by class</h2><p>Configuration item distribution</p></div><span className="cmdb-panel-mark" aria-hidden="true">◔</span></header>
    {total ? <div className="cmdb-pie-content">
      <svg className="cmdb-pie-svg" viewBox="0 0 200 200" role="img" aria-label={`Pie chart showing ${total} configuration items across ${items.length} classes`}>
        <title>Configuration items by class</title>
        {slices.map((slice) => slice.fullCircle
          ? <circle key={slice.label} cx="100" cy="100" r="82" fill={slice.color}><title>{slice.label}: {slice.count} (100%)</title></circle>
          : <path key={slice.label} d={slice.path} fill={slice.color}><title>{slice.label}: {slice.count} ({Math.round(slice.count / total * 100)}%)</title></path>)}
      </svg>
      <div className="cmdb-pie-legend">{slices.map((slice) => <Link key={slice.label} to={toFilter(slice)} className="cmdb-pie-legend-item"><i style={{ background: slice.color }} /><span title={slice.label}>{slice.label}</span><strong>{slice.count}</strong></Link>)}</div>
    </div> : <p className="cmdb-empty-chart">No CI class data available.</p>}
  </section>
}

function LineChart({ items }) {
  const width = 600
  const height = 225
  const left = 38
  const right = 14
  const top = 15
  const bottom = 38
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const maximum = Math.max(1, ...items.map((item) => item.count))
  const points = items.map((item, index) => ({
    ...item,
    x: left + (items.length > 1 ? index / (items.length - 1) : 0.5) * chartWidth,
    y: top + chartHeight - item.count / maximum * chartHeight,
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = Math.ceil(maximum * (3 - index) / 3)
    const y = top + chartHeight * index / 3
    return { value, y }
  })

  return <section className="cmdb-panel cmdb-chart-panel cmdb-line-panel">
    <header className="cmdb-panel-heading"><div><h2>CI creation trend</h2><p>New configuration items created each month · last 12 months</p></div><span className="cmdb-panel-mark" aria-hidden="true">⌁</span></header>
    {items.some((item) => item.count > 0) ? <div className="cmdb-line-chart-wrap"><svg className="cmdb-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of configuration items created per month">
      <title>Monthly CI creation trend</title>
      {grid.map((line, index) => <g key={`${line.y}-${index}`}><line x1={left} x2={width - right} y1={line.y} y2={line.y} className="cmdb-chart-gridline"/><text x={left - 9} y={line.y + 3} textAnchor="end" className="cmdb-chart-axis-label">{line.value}</text></g>)}
      <path d={path} className="cmdb-line-path" />
      {points.map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="3.5" className="cmdb-line-point"><title>{point.label}: {point.count} new CIs</title></circle><text x={point.x} y={height - 12} textAnchor="middle" className="cmdb-chart-axis-label">{point.label}</text></g>)}
    </svg></div> : <p className="cmdb-empty-chart">No CI creation history is available for this period.</p>}
  </section>
}

function ComboChart({ items }) {
  const width = 600
  const height = 260
  const left = 38
  const right = 16
  const top = 16
  const bottom = 52
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maximum = Math.max(1, ...items.map((item) => item.count))
  const step = items.length ? plotWidth / items.length : plotWidth
  const barWidth = Math.min(38, step * 0.48)
  const points = items.map((item, index) => ({
    ...item,
    x: left + index * step + step / 2,
    y: top + plotHeight - item.critical / maximum * plotHeight,
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const grid = Array.from({ length: 4 }, (_, index) => ({
    value: Math.ceil(maximum * (3 - index) / 3),
    y: top + plotHeight * index / 3,
  }))

  return <section className="cmdb-panel cmdb-chart-panel cmdb-combo-panel">
    <header className="cmdb-panel-heading"><div><h2>Environment & critical CIs</h2><p>Total CIs by environment with critical items highlighted</p></div><span className="cmdb-panel-mark" aria-hidden="true">▥</span></header>
    {items.length ? <>
      <div className="cmdb-chart-legend"><span><i className="cmdb-legend-bar"/>Total CIs</span><span><i className="cmdb-legend-line"/>Critical CIs</span></div>
      <div className="cmdb-combo-chart-wrap"><svg className="cmdb-combo-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Combo chart comparing total and critical configuration items by environment">
        <title>Total and critical CIs by environment</title>
        {grid.map((line, index) => <g key={`${line.y}-${index}`}><line x1={left} x2={width - right} y1={line.y} y2={line.y} className="cmdb-chart-gridline"/><text x={left - 9} y={line.y + 3} textAnchor="end" className="cmdb-chart-axis-label">{line.value}</text></g>)}
        {items.map((item, index) => {
          const x = left + index * step + (step - barWidth) / 2
          const barHeight = item.count / maximum * plotHeight
          return <g key={item.label}><rect x={x} y={top + plotHeight - barHeight} width={barWidth} height={barHeight} rx="4" className="cmdb-combo-bar"><title>{item.label}: {item.count} total CIs</title></rect><text x={left + index * step + step / 2} y={height - 27} textAnchor="middle" className="cmdb-chart-category-label">{item.label}</text></g>
        })}
        <path d={path} className="cmdb-combo-line" />
        {points.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="4" className="cmdb-combo-point"><title>{point.label}: {point.critical} critical CIs</title></circle>)}
      </svg></div>
    </> : <p className="cmdb-empty-chart">No environment data available.</p>}
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
  const environmentChart = useMemo(() => byEnvironment.map((item) => ({
    ...item,
    critical: filteredRecords.filter((record) => (record.environment || 'Unassigned') === item.label && record.businessCriticality?.toLowerCase() === 'critical').length,
  })), [byEnvironment, filteredRecords])
  const monthlyTrend = useMemo(() => {
    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0, 0, 0, 0)
    const months = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11 + index, 1)
      return { start, next: new Date(start.getFullYear(), start.getMonth() + 1, 1), label: start.toLocaleDateString([], { month: 'short' }), count: 0 }
    })
    filteredRecords.forEach((record) => {
      const created = recordDate(record)
      const month = months.find((item) => created && created >= item.start && created < item.next)
      if (month) month.count += 1
    })
    return months
  }, [filteredRecords])
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
    const missingRelations = filteredRecords.filter((record) => !(Number(record.relationshipCount || 0) > 0) && !(readDetails(record).relationships || []).some((relation) => relation.relatedCi)).length
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
      <div><h1 id="cmdb-dashboard-title">CMDB Dashboard</h1><p>Operational visibility across your configuration items and service estate.</p></div>
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
        <PieChart items={byClass} toFilter={(item) => viewCis({ class: item.label })} />
        <LineChart items={monthlyTrend} />
        <ComboChart items={environmentChart} />
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
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}
