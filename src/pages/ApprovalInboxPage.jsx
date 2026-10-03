import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import './ApprovalInboxPage.css'

const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

async function readResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Unable to load approvals.')
  return body
}

export default function ApprovalInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [search, setSearch] = useState('')

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

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => (typeFilter === 'ALL' || item.ticketType === typeFilter)
      && (!query || [item.ticketNumber, item.subject, item.requester, item.requestedFor, item.approvalGroup, item.approvalStep]
        .some((value) => value?.toLowerCase().includes(query))))
  }, [items, search, typeFilter])

  function openApproval(item) {
    if (item.ticketType === 'SERVICE_REQUEST') navigate(`/service-catalog/service-request/${item.ticketId}`)
    else navigate(`/my-tickets/CHANGE/${item.ticketId}`)
  }

  return <section className="approval-inbox">
    <header className="approval-inbox-hero">
      <div><p className="approval-inbox-eyebrow">WORKSPACE / REVIEW QUEUE</p><h1>Approvals</h1><p>Review requests waiting for your decision.</p></div>
      <span className="approval-inbox-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3.8h10a2 2 0 0 1 2 2v14.4H5V5.8a2 2 0 0 1 2-2Z"/><path d="m8.5 12 2.2 2.2 4.8-5M8.5 7.5h7"/></svg></span>
    </header>

    <section className="approval-inbox-register" aria-label="Approval register">
      <div className="approval-inbox-toolbar">
        <div className="approval-inbox-summary"><span className="approval-inbox-count">{visibleItems.length}</span><span><strong>Pending approvals</strong><small>Only items assigned to your approval role are shown.</small></span></div>
        <div className="approval-inbox-filters">
          <label>Record type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All approvals</option><option value="CHANGE">Change requests</option><option value="SERVICE_REQUEST">Service requests</option></select></label>
          <label className="approval-inbox-search">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Number, subject, requester…" /></label>
        </div>
      </div>

      {error ? <div className="approval-inbox-message approval-inbox-error" role="alert">{error}</div> : loading ? <div className="approval-inbox-message"><span className="approval-inbox-spinner" aria-hidden="true" />Loading approvals…</div> : visibleItems.length === 0 ? <div className="approval-inbox-empty"><span aria-hidden="true">✓</span><strong>Nothing is waiting for your approval</strong><p>New approval requests assigned to you will appear here.</p></div> :
        <div className="approval-inbox-table-wrap"><table className="approval-inbox-table"><thead><tr><th>Number</th><th>Type</th><th>Short description</th><th>Requested by</th><th>Approval group</th><th>Priority</th><th>Submitted</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
          {visibleItems.map((item) => <tr key={`${item.ticketType}-${item.ticketId}`} onClick={() => openApproval(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openApproval(item) }}>
            <td><button className="approval-inbox-number" type="button" onClick={(event) => { event.stopPropagation(); openApproval(item) }}>{item.ticketNumber}</button></td>
            <td><span className={`approval-inbox-type approval-inbox-type-${item.ticketType.toLowerCase()}`}>{item.ticketType === 'CHANGE' ? 'Change' : 'Service request'}</span></td>
            <td className="approval-inbox-subject"><strong>{item.subject || '—'}</strong><small>{item.approvalStep}</small></td>
            <td>{item.requester || '—'}{item.requestedFor && item.requestedFor !== item.requester && <small className="approval-inbox-secondary">For {item.requestedFor}</small>}</td>
            <td><span className="approval-inbox-group">{item.approvalGroup}</span></td>
            <td><span className={`approval-inbox-priority approval-inbox-priority-${(item.priority || '').toLowerCase()}`}>{item.priority || '—'}</span></td>
            <td className="approval-inbox-date">{formatDate(item.createdAt)}</td>
            <td><button className="approval-inbox-open" type="button" onClick={(event) => { event.stopPropagation(); openApproval(item) }}>Review <span aria-hidden="true">→</span></button></td>
          </tr>)}
        </tbody></table></div>}
      <footer className="approval-inbox-footer"><span>Showing {visibleItems.length} of {items.length} pending approvals</span><span>Approval decisions are recorded on the request</span></footer>
    </section>
  </section>
}
