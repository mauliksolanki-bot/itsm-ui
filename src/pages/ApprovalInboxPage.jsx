import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import './ApprovalInboxPage.css'

const PAGE_SIZE = 10
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

async function readResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load approvals.')
  return body
}

function ApprovalFilterIcon({ type = 'column' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{type === 'toolbar' ? <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="18" r="1.5"/></> : <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>}</svg>
}

function ApprovalColumnFilter({ field, label, filter, choices = [], onApply, onClear }) {
  const defaultOperator = choices.length ? 'EQUALS' : field === 'submitted' ? 'ON' : 'CONTAINS'
  const [operator, setOperator] = useState(filter?.operator || defaultOperator)
  const [value, setValue] = useState(filter?.value || '')
  const noValue = operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY'
  const operators = field === 'submitted'
    ? [['ON', 'On'], ['BEFORE', 'Before'], ['AFTER', 'After'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
    : choices.length
      ? [['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
      : [['CONTAINS', 'Contains'], ['EQUALS', 'Is'], ['NOT_EQUALS', 'Is not'], ['STARTS_WITH', 'Starts with'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]

  return <details className={`approval-column-filter${filter ? ' is-filtered' : ''}`} onToggle={(event) => {
    if (event.currentTarget.open) { setOperator(filter?.operator || defaultOperator); setValue(filter?.value || '') }
  }}>
    <summary aria-label={`Filter ${label}`} title={`Filter ${label}`}><ApprovalFilterIcon /></summary>
    <div className="approval-column-filter-popover">
      <strong>Filter {label}</strong>
      <label><span>Condition</span><select value={operator} onChange={(event) => setOperator(event.target.value)}>{operators.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
      {!noValue && <label><span>Value</span>{choices.length ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose a value</option>{choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select> : <input type={field === 'submitted' ? 'date' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} placeholder={field === 'submitted' ? undefined : `Enter ${label.toLowerCase()}`} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false } }} />}</label>}
      <div className="approval-column-filter-actions"><button type="button" onClick={(event) => { onClear(); event.currentTarget.closest('details').open = false }}>Clear</button><button type="button" disabled={!noValue && !value.trim()} onClick={(event) => { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false }}>Filter</button></div>
    </div>
  </details>
}

function matchesFilter(item, field, filter) {
  if (!filter) return true
  const raw = item[field]
  const actual = field === 'submitted' && raw ? new Date(raw).toISOString().slice(0, 10) : String(raw ?? '').toLowerCase()
  const expected = String(filter.value ?? '').toLowerCase()
  switch (filter.operator) {
    case 'EQUALS': return actual === expected
    case 'NOT_EQUALS': return actual !== expected
    case 'STARTS_WITH': return actual.startsWith(expected)
    case 'BEFORE': return actual && actual < expected
    case 'AFTER': return actual && actual > expected
    case 'ON': return actual === expected
    case 'IS_EMPTY': return !actual || actual === '—'
    case 'IS_NOT_EMPTY': return Boolean(actual) && actual !== '—'
    default: return actual.includes(expected)
  }
}

export default function ApprovalInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [groupFilter, setGroupFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [page, setPage] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/approvals', { credentials: 'include', signal: controller.signal })
      .then(readResponse)
      .then((data) => { setItems(Array.isArray(data) ? data : []); setError('') })
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const groups = useMemo(() => [...new Set(items.map((item) => item.approvalGroup).filter(Boolean))].sort(), [items])
  const priorities = useMemo(() => [...new Set(items.map((item) => item.priority).filter(Boolean))].sort(), [items])
  const filterChoices = (values) => values.map((value) => ({ value: value.toLowerCase(), label: value }))
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const searchable = [item.ticketNumber, item.ticketType === 'CHANGE' ? 'Change' : 'Service request', item.subject, item.requester, item.requestedFor, item.approvalGroup, item.approvalStep, item.priority]
      return (typeFilter === 'ALL' || item.ticketType === typeFilter)
        && (groupFilter === 'ALL' || item.approvalGroup === groupFilter)
        && (priorityFilter === 'ALL' || item.priority === priorityFilter)
        && (!query || searchable.some((value) => value?.toLowerCase().includes(query)))
        && matchesFilter(item, 'ticketNumber', columnFilters.number)
        && matchesFilter({ ...item, typeLabel: item.ticketType === 'CHANGE' ? 'Change' : 'Service request' }, 'typeLabel', columnFilters.type)
        && matchesFilter({ ...item, description: `${item.subject || ''} ${item.approvalStep || ''}` }, 'description', columnFilters.description)
        && matchesFilter(item, 'requester', columnFilters.requester)
        && matchesFilter(item, 'approvalGroup', columnFilters.group)
        && matchesFilter(item, 'priority', columnFilters.priority)
        && matchesFilter({ ...item, submitted: item.createdAt }, 'submitted', columnFilters.submitted)
    })
  }, [items, search, typeFilter, groupFilter, priorityFilter, columnFilters])

  const pageCount = Math.ceil(filteredItems.length / PAGE_SIZE)
  const visibleItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const activeFilterCount = [typeFilter !== 'ALL', groupFilter !== 'ALL', priorityFilter !== 'ALL'].filter(Boolean).length
    + Object.keys(columnFilters).length

  function setColumnFilter(key, filter) {
    setColumnFilters((current) => ({ ...current, [key]: filter }))
    setPage(0)
  }
  function clearColumnFilter(key) {
    setColumnFilters((current) => { const next = { ...current }; delete next[key]; return next })
    setPage(0)
  }
  function clearAllFilters() {
    setTypeFilter('ALL')
    setGroupFilter('ALL')
    setPriorityFilter('ALL')
    setColumnFilters({})
    setSearch('')
    setPage(0)
  }
  function openApproval(item) {
    if (item.ticketType === 'SERVICE_REQUEST') navigate(`/service-catalog/service-request/${item.ticketId}`)
    else navigate(`/my-tickets/CHANGE/${item.ticketId}`)
  }

  const filterLabels = { number: 'Number', type: 'Type', description: 'Description', requester: 'Requested by', group: 'Approval group', priority: 'Priority', submitted: 'Submitted' }
  const operatorLabels = { CONTAINS: 'contains', EQUALS: 'is', NOT_EQUALS: 'is not', STARTS_WITH: 'starts with', BEFORE: 'before', AFTER: 'after', ON: 'on', IS_EMPTY: 'is empty', IS_NOT_EMPTY: 'is not empty' }
  const activeColumnFilters = Object.entries(columnFilters).map(([key, filter]) => ({ key, label: `${filterLabels[key]} ${operatorLabels[filter.operator] || ''}${filter.operator.startsWith('IS_') ? '' : ` ${filter.value}`}` }))

  return <section className="approval-inbox">
    <header className="approval-inbox-hero">
      <div><span className="approval-inbox-eyebrow">WORKSPACE / REVIEW QUEUE</span><h1>Approvals</h1><p>Review requests waiting for your decision.</p></div>
      <span className="approval-inbox-record-count"><strong>{filteredItems.length}</strong> {filteredItems.length === 1 ? 'record' : 'records'}</span>
    </header>
    {error && <div className="approval-inbox-error" role="alert">{error}</div>}
    <section className="approval-inbox-register" aria-label="Approval register">
      <div className="approval-inbox-toolbar">
        <label className="approval-inbox-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><span className="sr-only">Search approvals</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search number, description, requester…" /></label>
        <details className="approval-smart-filters">
          <summary><ApprovalFilterIcon type="toolbar"/><span>Filters</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}<svg className="approval-filter-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary>
          <div className="approval-filter-panel">
            <label>Record type<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(0) }}><option value="ALL">All approvals</option><option value="CHANGE">Change requests</option><option value="SERVICE_REQUEST">Service requests</option></select></label>
            <label>Approval group<select value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); setPage(0) }}><option value="ALL">All groups</option>{groups.map((group) => <option value={group} key={group}>{group}</option>)}</select></label>
            <label>Priority<select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(0) }}><option value="ALL">All priorities</option>{priorities.map((priority) => <option value={priority} key={priority}>{priority}</option>)}</select></label>
            <div className="approval-filter-actions"><button type="button" onClick={clearAllFilters}>Reset</button><button type="button" onClick={(event) => { event.currentTarget.closest('details').open = false }}>Done</button></div>
          </div>
        </details>
        <span className="approval-toolbar-count"><strong>{filteredItems.length}</strong> approvals</span>
      </div>
      {activeColumnFilters.length > 0 && <div className="approval-active-filters"><span>Filtered by</span>{activeColumnFilters.map((filter) => <button type="button" key={filter.key} onClick={() => clearColumnFilter(filter.key)}>{filter.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="approval-clear-all" onClick={() => setColumnFilters({})}>Clear column filters</button></div>}
      <div className="approval-inbox-table-wrap"><table className="approval-inbox-table"><thead><tr>
        <th><div className="approval-th-content"><span>Number</span><ApprovalColumnFilter field="number" label="Number" filter={columnFilters.number} onApply={(value) => setColumnFilter('number', value)} onClear={() => clearColumnFilter('number')}/></div></th>
        <th><div className="approval-th-content"><span>Type</span><ApprovalColumnFilter field="type" label="Type" filter={columnFilters.type} choices={[{ value: 'change', label: 'Change' }, { value: 'service request', label: 'Service request' }]} onApply={(value) => setColumnFilter('type', value)} onClear={() => clearColumnFilter('type')}/></div></th>
        <th><div className="approval-th-content"><span>Description</span><ApprovalColumnFilter field="description" label="Description" filter={columnFilters.description} onApply={(value) => setColumnFilter('description', value)} onClear={() => clearColumnFilter('description')}/></div></th>
        <th><div className="approval-th-content"><span>Requested by</span><ApprovalColumnFilter field="requester" label="Requested by" filter={columnFilters.requester} onApply={(value) => setColumnFilter('requester', value)} onClear={() => clearColumnFilter('requester')}/></div></th>
        <th><div className="approval-th-content"><span>Approval group</span><ApprovalColumnFilter field="group" label="Approval group" filter={columnFilters.group} choices={filterChoices(groups)} onApply={(value) => setColumnFilter('group', value)} onClear={() => clearColumnFilter('group')}/></div></th>
        <th><div className="approval-th-content"><span>Priority</span><ApprovalColumnFilter field="priority" label="Priority" filter={columnFilters.priority} choices={filterChoices(priorities)} onApply={(value) => setColumnFilter('priority', value)} onClear={() => clearColumnFilter('priority')}/></div></th>
        <th><div className="approval-th-content"><span>Submitted</span><ApprovalColumnFilter field="submitted" label="Submitted" filter={columnFilters.submitted} onApply={(value) => setColumnFilter('submitted', value)} onClear={() => clearColumnFilter('submitted')}/></div></th>
        <th>Actions</th>
      </tr></thead><tbody>
        {loading ? <tr><td colSpan="8"><div className="approval-inbox-state"><span className="approval-inbox-spinner"/>Loading approvals…</div></td></tr>
          : visibleItems.length ? visibleItems.map((item) => <tr key={`${item.ticketType}-${item.ticketId}`} className="approval-data-row" onClick={() => openApproval(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openApproval(item) } }}>
            <td><strong className="approval-number">{item.ticketNumber}</strong></td>
            <td><span className={`approval-type approval-type-${item.ticketType.toLowerCase()}`}>{item.ticketType === 'CHANGE' ? 'Change' : 'Service request'}</span></td>
            <td className="approval-subject"><strong>{item.subject || '—'}</strong><small>{item.approvalStep}</small></td>
            <td><span className="approval-requester">{item.requester || '—'}</span>{item.requestedFor && item.requestedFor !== item.requester && <small className="approval-secondary">For {item.requestedFor}</small>}</td>
            <td><span className="approval-group">{item.approvalGroup || '—'}</span></td>
            <td><span className={`approval-priority approval-priority-${(item.priority || '').toLowerCase()}`}>{item.priority || '—'}</span></td>
            <td className="approval-date">{formatDate(item.createdAt)}</td>
            <td><button className="approval-open" type="button" onClick={(event) => { event.stopPropagation(); openApproval(item) }}>Review <span aria-hidden="true">↗</span></button></td>
          </tr>) : <tr><td colSpan="8"><div className="approval-inbox-state">Nothing is waiting for your approval.</div></td></tr>}
      </tbody></table></div>
      <footer className="approval-inbox-footer"><span>Showing {filteredItems.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} approvals</span><div><button type="button" aria-label="Previous page" disabled={page <= 0 || loading} onClick={() => setPage((current) => current - 1)}>‹</button><span>Page {pageCount ? page + 1 : 0} of {pageCount}</span><button type="button" aria-label="Next page" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>›</button></div></footer>
    </section>
  </section>
}
