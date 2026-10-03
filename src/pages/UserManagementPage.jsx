import { notifyToast } from '../components/Toast.jsx'
import Loader from '../components/Loader.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import './UserManagementPage.css'

const STEPS = ['Basic information', 'Organization', 'Role & groups', 'Account & security', 'Review']
const EMPTY_FORM = {
  firstName: '', lastName: '', employeeId: '', email: '', phone: '', username: '', departmentId: '', teamId: '', designationId: '',
  managerId: '', locationId: '', employmentType: 'FULL_TIME', costCenterId: '', roleId: '', groupIds: [], primaryGroupId: '',
  password: '', status: 'ACTIVE', mfaRequired: false, mustChangePassword: true,
}
const dateText = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const nice = (value = '') => String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (part) => part.toUpperCase())

async function readApi(response) {
  const value = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(value?.message || 'The request could not be completed.')
  return value
}

function userCode(id) { return `USR-${String(id).padStart(5, '0')}` }

export default function UserManagementPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const detailMatch = path.match(/\/administration\/users\/(\d+)(?:\/edit)?$/)
  const userId = detailMatch ? Number(detailMatch[1]) : null
  const isCreate = path.endsWith('/new')
  const isEdit = Boolean(userId && location.pathname.endsWith('/edit'))
  const [options, setOptions] = useState({ roles: [], groups: [], departments: [], locations: [], managers: [], teams: [], designations: [], costCenters: [], managerMappings: [] })
  const [rows, setRows] = useState([])
  const [detail, setDetail] = useState(null)
  const [ticketData, setTicketData] = useState(null)
  const [tab, setTab] = useState('ROLES')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [columnFilters, setColumnFilters] = useState({})
  const [page, setPage] = useState(0)
  const [pageInfo, setPageInfo] = useState({ totalElements: 0, totalPages: 0, size: 25 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [lockOpen, setLockOpen] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const role = useMemo(() => options.roles.find((item) => String(item.id) === String(form.roleId)), [options.roles, form.roleId])
  const employeeIdPreview = role?.employeePrefix ? `${role.employeePrefix}-${String(role.nextEmployeeNumber).padStart(2, '0')}` : ''
  const activeGroupChoices = options.groups.filter((group) => form.groupIds.includes(group.id))
  const departmentTeams = options.teams.filter((team) => String(team.departmentId) === String(form.departmentId))
  const eligibleManagerDesignationIds = options.managerMappings.filter((mapping) => String(mapping.employeeDesignationId) === String(form.designationId)).map((mapping) => String(mapping.managerDesignationId))
  const eligibleManagers = options.managers.filter((manager) => eligibleManagerDesignationIds.includes(String(manager.designationId)) && manager.id !== userId)
  const designationCostCenters = options.costCenters.filter((center) => center.designationIds?.some((id) => String(id) === String(form.designationId)))
  const listMode = !isCreate && !userId

  useEffect(() => {
    let active = true
    fetch(`/api/users/options?includePeople=${!listMode}`, { credentials: 'include' }).then(readApi).then((data) => { if (active) setOptions(data) }).catch((reason) => { if (active) { setError(reason.message); notifyToast(reason.message, 'error', 'User options unavailable') } })
    return () => { active = false }
  }, [listMode])

  useEffect(() => {
    if (listMode) return
    if (isCreate) { setDetail(null); setForm(EMPTY_FORM); setStep(0); setError(''); setSuccess(''); return }
    if (!userId) return
    let active = true
    setLoading(true); setError(''); setSuccess(''); setTemporaryPassword('')
    fetch(`/api/users/${userId}`, { credentials: 'include' }).then(readApi).then((data) => { if (active) setDetail(data) }).catch((reason) => { if (active) { setError(reason.message); notifyToast(reason.message, 'error', 'Could not load user') } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isCreate, listMode, userId])

  useEffect(() => {
    if (!isCreate) return
    const firstName = form.firstName.trim(), lastName = form.lastName.trim()
    if (!firstName || !lastName) { setForm((current) => current.email ? { ...current, email: '' } : current); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ firstName, lastName })
      fetch(`/api/users/email-suggestion?${params}`, { credentials: 'include', signal: controller.signal })
        .then(readApi).then((result) => setForm((current) => ({ ...current, email: result.email })))
        .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    }, 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [form.firstName, form.lastName, isCreate])

  useEffect(() => {
    if (!isEdit || !detail || !options.roles.length) return
    setForm({
      ...EMPTY_FORM,
      firstName: detail.firstName || '', lastName: detail.lastName || '', employeeId: detail.employeeId || '', email: detail.email || '', phone: detail.phone || '', username: detail.username || '',
      departmentId: detail.departmentId ? String(detail.departmentId) : '', teamId: detail.teamId ? String(detail.teamId) : '', designationId: detail.designationId ? String(detail.designationId) : '', managerId: detail.managerId ? String(detail.managerId) : '',
      locationId: detail.locationId ? String(detail.locationId) : '', employmentType: detail.employmentType || 'FULL_TIME', costCenterId: detail.costCenterId ? String(detail.costCenterId) : '',
      roleId: detail.roles?.[0]?.id ? String(detail.roles[0].id) : '', groupIds: detail.groups?.map((group) => group.id) || [], primaryGroupId: detail.primaryGroupId ? String(detail.primaryGroupId) : '',
      status: detail.active ? 'ACTIVE' : 'INACTIVE', mfaRequired: detail.mfaRequired, mustChangePassword: detail.mustChangePassword,
    })
    setStep(isEdit && location.state?.initialStep === 2 ? 2 : 0)
  }, [detail?.id, isEdit, options.roles, location.state?.initialStep])

  useEffect(() => {
    if (!listMode) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), size: String(pageInfo.size) })
      Object.entries(columnFilters).forEach(([key, filter]) => {
        params.set(`${key}.operator`, filter.operator)
        params.set(`${key}.value`, filter.value || '')
      })
      setLoading(true); setError('')
      fetch(`/api/users?${params}`, { credentials: 'include', signal: controller.signal }).then(readApi).then((data) => { setRows(data.content || []); setPageInfo((current) => ({ ...current, ...data })) }).catch((reason) => { if (reason.name !== 'AbortError') { setError(reason.message); notifyToast(reason.message, 'error', 'Users unavailable') } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 0)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [columnFilters, listMode, page, pageInfo.size])

  useEffect(() => {
    if (tab !== 'TICKETS' || !userId) return
    let active = true
    fetch(`/api/users/${userId}/tickets`, { credentials: 'include' }).then(readApi).then((data) => { if (active) setTicketData(data) }).catch((reason) => { if (active) { setError(reason.message); notifyToast(reason.message, 'error', 'User tickets unavailable') } })
    return () => { active = false }
  }, [tab, userId])

  function update(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'departmentId') {
        const team = options.teams.find((item) => String(item.id) === String(current.teamId))
        if (!team || String(team.departmentId) !== String(value)) next.teamId = ''
      }
      if (field === 'designationId') {
        const centers = options.costCenters.filter((item) => item.designationIds?.some((id) => String(id) === String(value)))
        if (!centers.some((item) => String(item.id) === String(current.costCenterId))) next.costCenterId = centers.length === 1 ? String(centers[0].id) : ''
        const allowedManagerTitles = options.managerMappings.filter((item) => String(item.employeeDesignationId) === String(value)).map((item) => String(item.managerDesignationId))
        const manager = options.managers.find((item) => String(item.id) === String(current.managerId))
        if (!manager || !allowedManagerTitles.includes(String(manager.designationId))) next.managerId = ''
      }
      return next
    })
  }

  function validateStep() {
    if (step === 0) {
      if (![form.firstName, form.lastName, form.email].every((value) => value.trim())) return 'Complete the required personal details. Wait for the email suggestion if it is still loading.'
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.'
      if (!isEdit && form.password.length < 12) return 'Temporary password must contain at least 12 characters.'
    }
    if (step === 1 && (!form.departmentId || !form.designationId || !form.costCenterId)) return 'Select a department, designation, and a cost center configured for that designation.'
    if (step === 2 && (!form.roleId || !form.groupIds.length || !form.primaryGroupId)) return 'Select a role, at least one group, and a primary group.'
    if (step === 3 && !['ACTIVE', 'INACTIVE'].includes(form.status)) return 'Choose an account status.'
    return ''
  }

  function nextStep(event) { event?.preventDefault(); const issue = validateStep(); if (issue) { setError(issue); return } setError(''); setStep((current) => Math.min(4, current + 1)) }
  function toggleGroup(id) {
    setForm((current) => {
      const groupIds = current.groupIds.includes(id) ? current.groupIds.filter((value) => value !== id) : [...current.groupIds, id]
      return { ...current, groupIds, primaryGroupId: groupIds.includes(Number(current.primaryGroupId)) ? current.primaryGroupId : groupIds.length ? String(groupIds[0]) : '' }
    })
  }

  function payload() {
    return {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
      departmentId: form.departmentId ? Number(form.departmentId) : null, teamId: form.teamId ? Number(form.teamId) : null, designationId: form.designationId ? Number(form.designationId) : null,
      managerId: form.managerId ? Number(form.managerId) : null, locationId: form.locationId ? Number(form.locationId) : null, employmentType: form.employmentType || null, costCenterId: form.costCenterId ? Number(form.costCenterId) : null,
      roleId: Number(form.roleId), groupIds: form.groupIds.map(Number), primaryGroupId: Number(form.primaryGroupId), status: form.status, mfaRequired: false,
      ...(!isEdit ? { password: form.password } : {}),
      ...(!isEdit ? { mustChangePassword: form.mustChangePassword } : {}),
      ...(isEdit ? { employeeId: form.employeeId.trim() } : {}),
    }
  }

  async function submitUser(event) {
    event.preventDefault(); setError('')
    if (!isEdit) {
      let issue = ''
      if (![form.firstName, form.lastName, form.email].every((value) => value.trim()) || !/^\S+@\S+\.\S+$/.test(form.email)) issue = 'Enter a first name, last name, and valid email address.'
      else if (form.password.length < 12) issue = 'Temporary password must contain at least 12 characters.'
      else if (!form.departmentId || !form.designationId || !form.costCenterId) issue = 'Select a department, designation, and cost center.'
      else if (!form.roleId || !form.groupIds.length || !form.primaryGroupId) issue = 'Select a role, at least one group, and a primary group.'
      if (issue) { setError(issue); return }
    }
    setSaving(true)
    try {
      const endpoint = isEdit ? `/api/users/${userId}` : '/api/users'
      const result = await readApi(await fetch(endpoint, { method: isEdit ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) }))
      notifyToast(isEdit ? 'User details and access were saved.' : 'The user account was created successfully.', 'success', isEdit ? 'User updated' : 'User created')
      navigate(`/administration/users/${result.id}`, { replace: true })
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', isEdit ? 'User update failed' : 'User creation failed') } finally { setSaving(false) }
  }

  async function submitDeactivate(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await readApi(await fetch(`/api/users/${userId}/deactivate`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: deactivateReason }) }))
      setDetail(result); setDeactivateOpen(false); setDeactivateReason(''); setSuccess('User account deactivated. Existing tickets and history are retained.'); notifyToast('The user account was deactivated.', 'success', 'Account deactivated')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Could not deactivate user') } finally { setSaving(false) }
  }

  async function resetPassword() {
    setSaving(true); setError(''); setTemporaryPassword('')
    try { const result = await readApi(await fetch(`/api/users/${userId}/reset-password`, { method: 'POST', credentials: 'include' })); setTemporaryPassword(result.temporaryPassword); setSuccess(result.message); setDetail((current) => ({ ...current, mustChangePassword: true })); notifyToast('A temporary password was generated. Copy it from the account page and share it securely.', 'success', 'Password reset') }
    catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Password reset failed') } finally { setSaving(false) }
  }

  async function lockAccount(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await readApi(await fetch(`/api/users/${userId}/lock`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: lockReason }) }))
      setDetail(result); setLockOpen(false); setLockReason(''); setSuccess('Account locked. Active sessions were revoked.'); notifyToast('Account locked and active sessions revoked.', 'success', 'Account locked')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Could not lock account') } finally { setSaving(false) }
  }

  async function manageAccount(action, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return
    setSaving(true); setError('')
    try {
      const result = await readApi(await fetch(`/api/users/${userId}/${action}`, { method: 'POST', credentials: 'include' }))
      setDetail(result)
      const message = action === 'unlock' ? 'Account unlocked.' : 'Password change required at the next sign-in. Active sessions were revoked.'
      setSuccess(message); notifyToast(message, 'success', action === 'unlock' ? 'Account unlocked' : 'Password update required')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Account action failed') } finally { setSaving(false) }
  }

  async function saveProfile(draft) {
    setSaving(true); setError(''); setSuccess('')
    try {
      const result = await readApi(await fetch(`/api/users/${userId}/profile`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: draft.firstName.trim(), lastName: draft.lastName.trim(),
          email: draft.email.trim(), phone: draft.phone.trim() || null,
        }),
      }))
      setDetail(result); setSuccess('User details saved successfully.'); notifyToast('User profile details were saved.', 'success', 'Profile updated')
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Profile update failed'); throw reason } finally { setSaving(false) }
  }

  async function saveGroupAssignments(groupIds, primaryGroupId) {
    setSaving(true); setError(''); setSuccess('')
    try {
      const result = await readApi(await fetch(`/api/users/${userId}/groups`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: groupIds.map(Number), primaryGroupId: Number(primaryGroupId) }),
      }))
      setDetail(result); setSuccess('User group assignments saved successfully.'); notifyToast('Group assignments were saved.', 'success', 'Groups updated')
      return result
    } catch (reason) { setError(reason.message); notifyToast(reason.message, 'error', 'Group update failed'); throw reason } finally { setSaving(false) }
  }

  async function copyTemporaryPassword() {
    try { await navigator.clipboard.writeText(temporaryPassword); notifyToast('Temporary password copied to the clipboard.', 'success', 'Copied') }
    catch { notifyToast('Clipboard access is unavailable. Select and copy the temporary password manually.', 'warning', 'Could not copy password') }
  }

  if (listMode) return <UsersList rows={rows} options={options} columnFilters={columnFilters} setColumnFilters={setColumnFilters} page={page} setPage={setPage} pageInfo={pageInfo} loading={loading} error={error} onCreate={() => navigate('/administration/users/new')} onOpen={(id) => navigate(`/administration/users/${id}`)} />
  if (isCreate) return <CreateUserRecordForm options={options} form={form} update={update} role={role} employeeIdPreview={employeeIdPreview} departmentTeams={departmentTeams} eligibleManagers={eligibleManagers} designationCostCenters={designationCostCenters} activeGroupChoices={activeGroupChoices} error={error} saving={saving} showPassword={showPassword} setShowPassword={setShowPassword} toggleGroup={toggleGroup} submitUser={submitUser} onCancel={() => navigate('/administration/users')} />
  if (isEdit) return <UserWizard isEdit userId={userId} detail={detail} loading={loading} options={options} form={form} update={update} role={role} employeeIdPreview={employeeIdPreview} departmentTeams={departmentTeams} eligibleManagers={eligibleManagers} designationCostCenters={designationCostCenters} activeGroupChoices={activeGroupChoices} step={step} setStep={setStep} error={error} saving={saving} showPassword={showPassword} setShowPassword={setShowPassword} toggleGroup={toggleGroup} validateStep={validateStep} nextStep={nextStep} submitUser={submitUser} onCancel={() => navigate(`/administration/users/${userId}`)} />
  return <UserDetailView detail={detail} ticketData={ticketData} groupOptions={options.groups} tab={tab} setTab={setTab} loading={loading} error={error} success={success} temporaryPassword={temporaryPassword} saving={saving} deactivateOpen={deactivateOpen} setDeactivateOpen={setDeactivateOpen} deactivateReason={deactivateReason} setDeactivateReason={setDeactivateReason} submitDeactivate={submitDeactivate} lockOpen={lockOpen} setLockOpen={setLockOpen} lockReason={lockReason} setLockReason={setLockReason} submitLock={lockAccount} onManageAccount={manageAccount} onEdit={() => navigate(`/administration/users/${userId}/edit`)} onSaveGroups={saveGroupAssignments} onSaveProfile={saveProfile} onBack={() => navigate('/administration/users')} onResetPassword={resetPassword} onCopy={copyTemporaryPassword} />
}

function UsersFilterIcon({ type }) {
  const paths = {
    role: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.4-3.6 2.6-5.5 6.5-5.5s6.1 1.9 6.5 5.5"/></>,
    group: <><circle cx="9" cy="8" r="2.5"/><path d="M3.5 19c.3-3 2.1-4.6 5.5-4.6M16 6.2a2.5 2.5 0 010 4.9M15 14.7c3.3.1 5.1 1.6 5.5 4.3"/></>,
    department: <><path d="M4 20V5l8-2v17M12 8h8v12M2.5 20h19"/><path d="M7 8h2M7 11h2M7 14h2M15 11h2M15 14h2M15 17h2"/></>,
    status: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>,
    filter: <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="18" r="1.5"/></>,
    columnFilter: <><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>
}

function UserColumnFilter({ field, label, filter, choices = [], onApply, onClear }) {
  const defaultOperator = ['role', 'group', 'department', 'status'].includes(field) ? 'EQUALS' : 'CONTAINS'
  const [operator, setOperator] = useState(filter?.operator || defaultOperator)
  const [value, setValue] = useState(filter?.value || '')
  const noValue = operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY'
  const operators = field === 'lastLogin'
    ? [['EQUALS', 'On'], ['NOT_EQUALS', 'Not on'], ['BEFORE', 'Before'], ['AFTER', 'After'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
    : choices.length
      ? [['EQUALS', 'Equal'], ['NOT_EQUALS', 'Not equal'], ...(field === 'status' ? [] : [['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']])]
    : [['CONTAINS', 'Contains'], ['EQUALS', 'Equal'], ['NOT_EQUALS', 'Not equal'], ['STARTS_WITH', 'Starts with'], ['ENDS_WITH', 'Ends with'], ['IS_EMPTY', 'Is empty'], ['IS_NOT_EMPTY', 'Is not empty']]
  return <details className={`users-column-filter${filter ? ' is-filtered' : ''}`} onToggle={(event) => {
    if (event.currentTarget.open) { setOperator(filter?.operator || defaultOperator); setValue(filter?.value || '') }
  }}>
    <summary aria-label={`Filter ${label}`} title={`Filter ${label}`}><UsersFilterIcon type="columnFilter"/></summary>
    <div className="users-column-filter-popover">
      <strong>Filter {label}</strong>
      <label className="users-column-filter-control"><span>Condition</span><select value={operator} onChange={(event) => setOperator(event.target.value)}>{operators.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
      {!noValue && <label className="users-column-filter-control"><span>Value</span>{choices.length ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose a value</option>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select> : <input type={field === 'lastLogin' ? 'date' : 'text'} autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder={field === 'lastLogin' ? undefined : `Enter ${label.toLowerCase()}`} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false } }}/>}</label>}
      <div className="users-column-filter-actions"><button type="button" className="users-column-clear" onClick={(event) => { onClear(); event.currentTarget.closest('details').open = false }}>Clear</button><button type="button" className="users-column-apply" disabled={!noValue && !value.trim()} onClick={(event) => { onApply({ operator, value: value.trim() }); event.currentTarget.closest('details').open = false }}>Filter</button></div>
    </div>
  </details>
}

function UsersList({ rows, options, columnFilters, setColumnFilters, page, setPage, pageInfo, loading, error, onCreate, onOpen }) {
  const filterLabels = { userId: 'User ID', name: 'Name', email: 'Email', role: 'Role', group: 'Primary group', department: 'Department', status: 'Status', lastLogin: 'Last Login' }
  const operatorLabels = { CONTAINS: 'contains', EQUALS: 'is', NOT_EQUALS: 'is not', STARTS_WITH: 'starts with', ENDS_WITH: 'ends with', BEFORE: 'before', AFTER: 'after', IS_EMPTY: 'is empty', IS_NOT_EMPTY: 'is not empty' }
  const activeFilters = Object.entries(columnFilters).map(([key, filter]) => ({ key, label: `${filterLabels[key]} ${operatorLabels[filter.operator] || ''}${filter.operator.startsWith('IS_') ? '' : ` ${filter.value}`}` }))
  const setColumnFilter = (key, filter) => { setColumnFilters((current) => ({ ...current, [key]: filter })); setPage(0) }
  const clearColumnFilter = (key) => { setColumnFilters((current) => { const next = { ...current }; delete next[key]; return next }); setPage(0) }
  const clearAllColumnFilters = () => { setColumnFilters({}); setPage(0) }
  const choicesFor = (items, valueKey = 'name', labelKey = 'name') => items.map((item) => ({ value: String(item[valueKey]), label: item[labelKey] }))
  return <section className="users-page">
    <header className="users-hero users-directory-hero"><div><span className="users-kicker">ADMINISTRATION / ACCESS CONTROL</span><h1>Users</h1><p>Manage application identities, roles, and support group access.</p></div><button className="users-primary-button" onClick={onCreate}>＋ Create user</button></header>
    {error && <div className="users-alert" role="alert">{error}</div>}
    <section className="users-register">
      {activeFilters.length > 0 && <div className="users-active-filters"><span>Filtered by</span>{activeFilters.map((filter) => <button type="button" key={filter.key} onClick={() => clearColumnFilter(filter.key)}>{filter.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="users-clear-all-columns" onClick={clearAllColumnFilters}>Clear all</button></div>}
      <div className="users-table-wrap"><table className="users-table"><thead><tr>
        <th><div className="users-th-content"><span>User ID</span><UserColumnFilter field="userId" label="User ID" filter={columnFilters.userId} onApply={(value) => setColumnFilter('userId', value)} onClear={() => clearColumnFilter('userId')}/></div></th>
        <th><div className="users-th-content"><span>Name</span><UserColumnFilter field="name" label="Name" filter={columnFilters.name} onApply={(value) => setColumnFilter('name', value)} onClear={() => clearColumnFilter('name')}/></div></th>
        <th><div className="users-th-content"><span>Email</span><UserColumnFilter field="email" label="Email" filter={columnFilters.email} onApply={(value) => setColumnFilter('email', value)} onClear={() => clearColumnFilter('email')}/></div></th>
        <th><div className="users-th-content"><span>Role</span><UserColumnFilter field="role" label="Role" filter={columnFilters.role} choices={choicesFor(options.roles)} onApply={(value) => setColumnFilter('role', value)} onClear={() => clearColumnFilter('role')}/></div></th>
        <th><div className="users-th-content"><span>Primary Group</span><UserColumnFilter field="group" label="Primary group" filter={columnFilters.group} choices={choicesFor(options.groups)} onApply={(value) => setColumnFilter('group', value)} onClear={() => clearColumnFilter('group')}/></div></th>
        <th><div className="users-th-content"><span>Status</span><UserColumnFilter field="status" label="Status" filter={columnFilters.status} choices={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} onApply={(value) => setColumnFilter('status', value)} onClear={() => clearColumnFilter('status')}/></div></th>
        <th><div className="users-th-content"><span>Last Login</span><UserColumnFilter field="lastLogin" label="Last login" filter={columnFilters.lastLogin} onApply={(value) => setColumnFilter('lastLogin', value)} onClear={() => clearColumnFilter('lastLogin')}/></div></th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="8"><div className="users-state"><span className="users-spinner" />Loading users…</div></td></tr> : rows.length ? rows.map((user) => <tr key={user.id} onClick={() => onOpen(user.id)} className="users-data-row"><td><strong className="users-code">{user.userCode}</strong></td><td><div className="users-person-cell"><span><strong className="users-name">{user.displayName}</strong><small className="users-subtext">{user.employeeId || 'Employee ID not set'}</small></span></div></td><td><span className="users-email-cell">{user.email || '—'}</span></td><td><div className="users-role-list">{user.roles?.length ? user.roles.slice(0, 2).map((role) => <span className="users-role-pill" key={role}>{role}</span>) : '—'}{user.roles?.length > 2 && <span className="users-role-extra">+{user.roles.length - 2}</span>}</div></td><td>{user.primaryGroup || <span className="users-cell-muted">Unassigned</span>}</td><td><span className={`users-status ${user.active ? 'is-active' : 'is-inactive'}`}>{user.active ? 'Active' : 'Inactive'}</span></td><td><span className="users-last-login">{dateText(user.lastLoginAt)}</span></td><td><button className="users-view-button" onClick={(event) => { event.stopPropagation(); onOpen(user.id) }}>View profile <span aria-hidden="true">↗</span></button></td></tr>) : <tr><td colSpan="8"><div className="users-state">No users match these filters.</div></td></tr>}
      </tbody></table></div>
      <footer className="users-pagination"><span>Showing {pageInfo.totalElements ? page * pageInfo.size + 1 : 0}–{Math.min((page + 1) * pageInfo.size, pageInfo.totalElements)} of {pageInfo.totalElements} users</span><div><button disabled={page <= 0 || loading} onClick={() => setPage((value) => value - 1)}>‹</button><span>Page {pageInfo.totalPages ? page + 1 : 0} of {pageInfo.totalPages}</span><button disabled={page + 1 >= pageInfo.totalPages || loading} onClick={() => setPage((value) => value + 1)}>›</button></div></footer>
    </section>
  </section>
}

function CreateUserRecordForm({ options, form, update, role, employeeIdPreview, departmentTeams, eligibleManagers, designationCostCenters, activeGroupChoices, error, saving, showPassword, setShowPassword, toggleGroup, submitUser, onCancel }) {
  const roleOptions = options.roles.map((item) => ({ value: item.id, label: item.name }))
  const departmentOptions = options.departments.map((item) => ({ value: item.id, label: item.name }))
  const teamOptions = departmentTeams.map((item) => ({ value: item.id, label: item.name }))
  const designationOptions = options.designations.map((item) => ({ value: item.id, label: item.name }))
  const managerOptions = eligibleManagers.map((item) => ({ value: item.id, label: `${item.name} · ${options.designations.find((entry) => String(entry.id) === String(item.designationId))?.name || 'Manager'}` }))
  const locationOptions = options.locations.map((item) => ({ value: item.id, label: item.name }))
  const costCenterOptions = designationCostCenters.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))
  const selectedRole = roleOptions.some((item) => String(item.value) === String(form.roleId))
  function choosePrimaryGroup(groupId) {
    if (!form.groupIds.includes(groupId)) toggleGroup(groupId)
    update('primaryGroupId', String(groupId))
  }
  return <section className="users-page">
    {error && <div className="users-alert" role="alert">{error}</div>}
    <header className="user-record-toolbar user-create-toolbar">
      <div className="user-record-heading"><span className="user-record-menu" aria-hidden="true">▣</span><div><strong>Create User</strong><small>New record [Default view]</small></div></div>
      <div className="user-record-actions"><button type="button" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" form="create-user-record" disabled={saving || !selectedRole || !form.groupIds.length || !form.primaryGroupId}>{saving ? 'Creating…' : 'Create user'}</button></div>
    </header>
    <form id="create-user-record" className="user-record-form user-create-record-form" onSubmit={submitUser} noValidate>
      <div className="user-record-columns">
        <div className="user-record-column">
          <RecordField label="User ID" value={employeeIdPreview ? employeeIdPreview.toLowerCase() : ''} placeholder="Generated from role" />
          <RecordField label="First name" value={form.firstName} editable required onChange={(value) => update('firstName', value)} />
          <RecordField label="Last name" value={form.lastName} editable required onChange={(value) => update('lastName', value)} />
          <RecordField label="Title" value={form.designationId} options={designationOptions} placeholder="Select designation" editable required onChange={(value) => update('designationId', value)} />
          <RecordField label="Department" value={form.departmentId} options={departmentOptions} placeholder="Select department" editable required onChange={(value) => update('departmentId', value)} />
          <label className="user-record-field"><span>Temporary password *</span><span className="create-password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="12" required value={form.password} onChange={(event) => update('password', event.target.value)} /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
          <RecordField label="Team" value={form.teamId} options={teamOptions} placeholder={form.departmentId ? 'Select team' : 'Select department first'} editable={Boolean(form.departmentId)} onChange={(value) => update('teamId', value)} />
          <RecordField label="Manager" value={form.managerId} options={managerOptions} placeholder={form.designationId ? 'No manager selected' : 'Select designation first'} editable={Boolean(form.designationId)} onChange={(value) => update('managerId', value)} />
          <RecordField label="Location" value={form.locationId} options={locationOptions} placeholder="Select location" editable onChange={(value) => update('locationId', value)} />
          <RecordField label="Cost center" value={form.costCenterId} options={costCenterOptions} placeholder={form.designationId ? 'Select cost center' : 'Select designation first'} editable={Boolean(form.designationId)} required onChange={(value) => update('costCenterId', value)} />
        </div>
        <div className="user-record-column">
          <RecordField label="Employee ID" value={employeeIdPreview} placeholder="Generated from role" />
          <RecordField label="Email" value={form.email} placeholder="Enter name to generate email" editable={false} required type="email" />
          <RecordField label="Business phone" value={form.phone} placeholder="Optional" editable type="tel" onChange={(value) => update('phone', value)} />
          <RecordField label="Employment type" value={form.employmentType} options={[{ value: 'FULL_TIME', label: 'Full time' }, { value: 'PART_TIME', label: 'Part time' }, { value: 'CONTRACTOR', label: 'Contractor' }, { value: 'TEMPORARY', label: 'Temporary' }, { value: 'INTERN', label: 'Intern' }]} editable onChange={(value) => update('employmentType', value)} />
          <RecordField label="Primary role" value={form.roleId} options={roleOptions} placeholder="Select role" editable required onChange={(value) => update('roleId', value)} />
          <RecordField label="Account status" value={form.status} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} editable onChange={(value) => update('status', value)} />
          <RecordField label="Password needs reset" value={String(form.mustChangePassword)} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} editable required onChange={(value) => update('mustChangePassword', value === 'true')} />
        </div>
      </div>
      <div className="user-create-form-notes">
        <div className="user-create-auto-note"><span>✦</span><div><strong>Automatic account details</strong><small>Email is suggested from the name. User ID and Employee ID are generated from the selected role.</small></div></div>
        {role && <div className="user-create-role-note"><strong>{role.name}</strong><small>{role.description}</small></div>}
      </div>
      <section className="user-create-groups"><div className="user-create-section-title"><span>02</span><div><strong>Role &amp; support groups</strong><small>Choose at least one group and designate the primary group</small></div></div>
        <div className="user-create-group-grid">{options.groups.map((group, index) => {
          const selected = form.groupIds.includes(group.id)
          const primary = String(form.primaryGroupId) === String(group.id)
          const checkboxId = `create-user-group-${group.id}`
          return <div className={`user-create-group${selected ? ' selected' : ''}${primary ? ' primary' : ''}`} key={group.id}>
            <input id={checkboxId} type="checkbox" checked={selected} onChange={() => toggleGroup(group.id)} />
            <span className={`group-color group-color-${index % 5}`}>{group.code?.slice(0, 2)}</span>
            <span className="user-create-group-info"><label htmlFor={checkboxId}><strong>{group.name}</strong><small>{group.code}</small></label></span>
            <button type="button" className="user-create-primary-star" aria-label={primary ? `${group.name} is the primary group` : `Set ${group.name} as primary group`} aria-pressed={primary} title={primary ? 'Primary group' : 'Set as primary group'} onClick={() => choosePrimaryGroup(group.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.62l-5.1 2.68.97-5.68-4.12-4.02 5.7-.83L12 3.6Z" /></svg>
            </button>
          </div>
        })}</div>
      </section>
    </form>
  </section>
}

function UserWizard({ isEdit, userId, detail, loading, options, form, update, role, employeeIdPreview, departmentTeams, eligibleManagers, designationCostCenters, activeGroupChoices, step, setStep, error, saving, showPassword, setShowPassword, toggleGroup, validateStep, nextStep, submitUser, onCancel }) {
  if (loading) return <Loader variant="inline" title="Loading user profile" subtitle="Getting the latest account details." />
  return <section className="users-page">
    <button className="users-back-link" type="button" onClick={onCancel}>← {isEdit ? 'Back to user profile' : 'Back to users'}</button>
    <header className="users-hero users-hero-compact"><div><span className="users-kicker">USER MANAGEMENT / {isEdit ? 'EDIT ACCOUNT' : 'NEW ACCOUNT'}</span><h1>{isEdit ? `Edit ${detail?.displayName || 'user'}` : 'Create new user'}</h1><p>{isEdit ? 'Update profile, organization, and access assignments.' : 'Set up identity, organization, role, groups, and account security.'}</p></div></header>
    <div className="user-wizard-card">
      <nav className="user-stepper" aria-label="User setup steps">{STEPS.map((label, index) => <button type="button" className={index === step ? 'active' : index < step ? 'complete' : ''} key={label} onClick={() => { if (index < step) setStep(index) }}><span>{index < step ? '✓' : index + 1}</span><small>{label}</small></button>)}</nav>
      {error && <div className="users-alert" role="alert">{error}</div>}
      <form onSubmit={step === 4 || (isEdit && step === 2) ? submitUser : nextStep}>
        {step === 0 && <div className="wizard-section"><div className="wizard-section-heading"><span className="wizard-section-icon icon-blue">01</span><div><h2>Basic information</h2><p>Use the user’s business identity details.</p></div></div><div className="user-form-grid">
          <Field label="First name *"><input autoComplete="given-name" value={form.firstName} onChange={(event) => update('firstName', event.target.value)} /></Field>
          <Field label="Last name *"><input autoComplete="family-name" value={form.lastName} onChange={(event) => update('lastName', event.target.value)} /></Field>
          <Field label="Employee ID"><input value={isEdit ? form.employeeId : employeeIdPreview || 'Generated after role selection'} readOnly /></Field>
          <Field label="Email address *" hint={isEdit ? 'Email address must be unique.' : 'Suggested from the name; the application checks uniqueness automatically.'}><input type="email" autoComplete="email" value={form.email} readOnly={!isEdit} onChange={(event) => update('email', event.target.value)} placeholder="Auto-filled from first and last name" /></Field>
          <Field label="Phone number"><input type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="Optional" /></Field>
          <Field label="Username" hint="Generated from the employee ID after role selection."><input autoComplete="username" value={isEdit ? form.username : employeeIdPreview.toLowerCase()} readOnly /></Field>
          {isEdit && <p className="field-hint full-span">Username and Employee ID are locked after creation.</p>}
          {!isEdit && <Field label="Temporary password *" hint="At least 12 characters. It is stored as a secure hash."><div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Hide' : 'Show'}</button></div></Field>}
        </div></div>}
        {step === 1 && <div className="wizard-section"><div className="wizard-section-heading"><span className="wizard-section-icon icon-teal">02</span><div><h2>Organization</h2><p>Connect the account to a department and reporting line.</p></div></div><div className="user-form-grid">
          <Field label="Department *"><select value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)}><option value="">Select department</option>{options.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Team"><select value={form.teamId} onChange={(event) => update('teamId', event.target.value)} disabled={!form.departmentId}><option value="">Select team</option>{departmentTeams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Designation *"><select value={form.designationId} onChange={(event) => update('designationId', event.target.value)}><option value="">Select designation</option>{options.designations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Manager"><select value={form.managerId} onChange={(event) => update('managerId', event.target.value)} disabled={!form.designationId}><option value="">No manager selected</option>{eligibleManagers.map((item) => <option value={item.id} key={item.id}>{item.name} · {options.designations.find((designation) => String(designation.id) === String(item.designationId))?.name}</option>)}</select><small>Managers are filtered by the reporting rules for this designation.</small></Field>
          <Field label="Location"><select value={form.locationId} onChange={(event) => update('locationId', event.target.value)}><option value="">Select location</option>{options.locations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Employment type"><select value={form.employmentType} onChange={(event) => update('employmentType', event.target.value)}><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACTOR">Contractor</option><option value="TEMPORARY">Temporary</option><option value="INTERN">Intern</option></select></Field>
          <Field label="Cost center *"><select value={form.costCenterId} onChange={(event) => update('costCenterId', event.target.value)} disabled={!form.designationId}><option value="">Select cost center</option>{designationCostCenters.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select><small>Available cost centers are configured for the selected designation.</small></Field>
        </div></div>}
        {step === 2 && <div className="wizard-section edit-user-access-section">
          <div className="user-create-section-title"><span>03</span><div><strong>Role &amp; support groups</strong><small>Update the user’s role, assigned groups, and primary group</small></div></div>
          <div className="edit-user-role-row"><RecordField label="Primary role" value={form.roleId} options={options.roles.map((item) => ({ value: item.id, label: item.name }))} placeholder="Select role" editable required onChange={(value) => update('roleId', value)} />{role && <div className="user-create-role-note"><strong>{role.name}</strong><small>{role.description}</small></div>}</div>
          <section className="user-create-groups edit-user-groups"><div className="user-create-section-title"><span>04</span><div><strong>Assigned groups</strong><small>Select one or more groups and designate the primary group</small></div></div>
            <div className="user-create-group-grid">{options.groups.map((group, index) => <label className={`user-create-group${form.groupIds.includes(group.id) ? ' selected' : ''}`} key={group.id}><input type="checkbox" checked={form.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} /><span className={`group-color group-color-${index % 5}`}>{group.code?.slice(0, 2)}</span><span><strong>{group.name}</strong><small>{group.code}</small></span></label>)}</div>
            <div className="user-create-primary-group"><RecordField label="Primary group" value={form.primaryGroupId} options={activeGroupChoices.map((group) => ({ value: group.id, label: group.name }))} placeholder="Choose primary group" editable={activeGroupChoices.length > 0} required onChange={(value) => update('primaryGroupId', value)} /></div>
          </section>
          <div className="primary-group-note">The primary group must be one of the groups selected above.</div>
        </div>}
        {step === 3 && <div className="wizard-section"><div className="wizard-section-heading"><span className="wizard-section-icon icon-amber">04</span><div><h2>Account & security</h2><p>Choose account status and first-login password handling.</p></div></div><div className="user-form-grid">
          <Field label="Account status *"><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
          <Field label="Authentication"><input value="Local authentication" readOnly /></Field>
          <label className="security-choice"><input type="checkbox" checked={form.mustChangePassword} onChange={(event) => update('mustChangePassword', event.target.checked)} /><span><strong>Require password change at first login</strong><small>The temporary password cannot be used for other pages until changed.</small></span></label>
          <div className="security-choice disabled"><span className="security-lock">MFA</span><span><strong>MFA is not configured</strong><small>Multi-factor authentication will be available after its provider is set up.</small></span></div>
        </div></div>}
        {step === 4 && <div className="wizard-section"><div className="wizard-section-heading"><span className="wizard-section-icon icon-green">05</span><div><h2>Review & {isEdit ? 'save' : 'create'}</h2><p>Check the account details before you continue.</p></div></div><div className="review-grid">
          <ReviewSection title="Basic information"><Review label="Name" value={`${form.firstName} ${form.lastName}`} /><Review label="Employee ID" value={isEdit ? form.employeeId : employeeIdPreview} /><Review label="Email" value={form.email} /><Review label="Username" value={isEdit ? form.username : employeeIdPreview.toLowerCase()} /></ReviewSection>
          <ReviewSection title="Organization"><Review label="Department" value={options.departments.find((item) => String(item.id) === String(form.departmentId))?.name} /><Review label="Team" value={options.teams.find((item) => String(item.id) === String(form.teamId))?.name} /><Review label="Designation" value={options.designations.find((item) => String(item.id) === String(form.designationId))?.name} /><Review label="Manager" value={options.managers.find((item) => String(item.id) === String(form.managerId))?.name} /><Review label="Location" value={options.locations.find((item) => String(item.id) === String(form.locationId))?.name} /><Review label="Employment" value={nice(form.employmentType)} /><Review label="Cost center" value={options.costCenters.find((item) => String(item.id) === String(form.costCenterId))?.code} /></ReviewSection>
          <ReviewSection title="Access"><Review label="Role" value={role?.name} /><Review label="Groups" value={activeGroupChoices.map((item) => item.name).join(', ')} /><Review label="Primary group" value={activeGroupChoices.find((item) => String(item.id) === String(form.primaryGroupId))?.name} /></ReviewSection>
          <ReviewSection title="Account"><Review label="Status" value={nice(form.status)} /><Review label="Authentication" value="Local" /><Review label="First login" value={form.mustChangePassword ? 'Password change required' : 'No forced change'} /><Review label="MFA" value="Not configured" /></ReviewSection>
        </div></div>}
        <footer className="wizard-actions"><button className="users-secondary-button" type="button" onClick={step === 0 ? onCancel : () => setStep((current) => current - 1)}>{step === 0 ? 'Cancel' : '← Back'}</button><span>{isEdit && step === 2 ? 'Role & group assignments' : `Step ${step + 1} of 5`}</span>{step < 4 && !(isEdit && step === 2) ? <button className="users-primary-button" type="submit">Next →</button> : <button className="users-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}</button>}</footer>
      </form>
    </div>
  </section>
}

function UserDetailView({ detail, ticketData, groupOptions, tab, setTab, loading, error, success, temporaryPassword, saving, deactivateOpen, setDeactivateOpen, deactivateReason, setDeactivateReason, submitDeactivate, lockOpen, setLockOpen, lockReason, setLockReason, submitLock, onManageAccount, onEdit, onSaveGroups, onSaveProfile, onBack, onResetPassword, onCopy }) {
  const [editing, setEditing] = useState(true)
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [editingGroups, setEditingGroups] = useState(false)
  const [groupDraft, setGroupDraft] = useState([])
  const [primaryGroupDraft, setPrimaryGroupDraft] = useState('')
  const [groupError, setGroupError] = useState('')
  useEffect(() => {
    if (detail) setProfileDraft({ firstName: detail.firstName || '', lastName: detail.lastName || '', email: detail.email || '', phone: detail.phone || '' })
  }, [detail])
  async function saveInline() {
    if (!profileDraft.firstName.trim() || !profileDraft.lastName.trim() || !/^\S+@\S+\.\S+$/.test(profileDraft.email.trim())) return
    try { await onSaveProfile(profileDraft); setEditing(false) } catch { /* The parent displays the server validation message. */ }
  }
  function openGroupEditor() {
    const selected = (detail.groups || []).map((group) => String(group.id))
    setGroupDraft(selected)
    setPrimaryGroupDraft(String(detail.primaryGroupId || detail.groups?.find((group) => group.primary)?.id || selected[0] || ''))
    setGroupError('')
    setEditingGroups(true)
  }
  function toggleGroupDraft(groupId) {
    const id = String(groupId)
    const next = groupDraft.includes(id) ? groupDraft.filter((item) => item !== id) : [...groupDraft, id]
    setGroupDraft(next)
    if (!next.includes(primaryGroupDraft)) setPrimaryGroupDraft(next[0] || '')
  }
  async function saveGroupDraft() {
    if (!groupDraft.length) { setGroupError('Select at least one support group.'); return }
    if (!groupDraft.includes(primaryGroupDraft)) { setGroupError('Choose a primary group from the selected groups.'); return }
    setGroupError('')
    try { await onSaveGroups(groupDraft, primaryGroupDraft); setEditingGroups(false) }
    catch (reason) { setGroupError(reason.message) }
  }
  const tabs = [['ROLES', 'Roles'], ['GROUPS', `Groups (${detail?.groups?.length || 0})`], ['DELEGATES', 'Delegates'], ['SUBSCRIPTIONS', 'Subscriptions'], ['MANAGE_SUBSCRIPTIONS', 'Manage Subscriptions'], ['PERMISSIONS', 'Permissions'], ['TICKETS', 'Tickets'], ['SECURITY', 'Security'], ['ACTIVITY', 'Activity / audit'], ['ASSETS', 'Assets']]
  if (loading) return <Loader variant="inline" title="Loading user profile" subtitle="Getting the latest account details." />
  if (!detail) return <section className="users-page"><button className="users-back-link" onClick={onBack}>← Back to users</button>{error && <div className="users-alert">{error}</div>}</section>
  const activeTickets = ticketData?.tickets || []
  return <section className="users-page user-detail-page">
    <header className="user-record-toolbar user-detail-toolbar"><div className="user-record-heading"><button type="button" onClick={onBack} aria-label="Back to users">‹</button><span className="user-detail-avatar">{(detail.displayName || '?').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div><span className="user-detail-kicker">USER PROFILE</span><strong>{detail.displayName}</strong><small>{detail.username}{detail.department ? ` · ${detail.department}` : ''}</small></div></div><div className="user-record-actions">{editingGroups ? <><button type="button" onClick={() => { setEditingGroups(false); setGroupError('') }} disabled={saving}>Cancel</button><button type="button" onClick={saveGroupDraft} disabled={saving || !groupDraft.length || !groupDraft.includes(primaryGroupDraft)}>{saving ? 'Saving…' : 'Save groups'}</button></> : editing ? <><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="button" onClick={saveInline} disabled={saving || !profileDraft.firstName.trim() || !profileDraft.lastName.trim() || !/^\S+@\S+\.\S+$/.test(profileDraft.email.trim())}>{saving ? 'Saving…' : 'Save changes'}</button></> : <button type="button" onClick={() => setEditing(true)}>Edit profile</button>}{detail.active && <button type="button" className="user-record-delete" onClick={() => setDeactivateOpen(true)}>Deactivate</button>}<button type="button" disabled={saving || !detail.active} onClick={onResetPassword}>{saving ? 'Working…' : 'Reset password'}</button></div></header>
    {error && <div className="users-alert" role="alert">{error}</div>}{success && <div className="users-success" role="status">{success}</div>}
    {temporaryPassword && <div className="temporary-password"><div><span>Temporary password</span><code>{temporaryPassword}</code><small>Copy and securely provide it to the user. This value is shown once.</small></div><button onClick={onCopy}>Copy password</button></div>}
    <section className="user-detail-form">
      <div className="user-detail-section"><header><span className="user-detail-section-marker"/><div><h2>Basic Information</h2><p>Profile and organization details for this account.</p></div></header><div className="user-detail-fields">
        <UserDetailField label="User ID" value={detail.username} />
        <UserDetailField label="Email" value={editing ? profileDraft.email : detail.email} editable={editing} required onChange={(value) => setProfileDraft((current) => ({ ...current, email: value }))} type="email" />
        <UserDetailField label="First name" value={editing ? profileDraft.firstName : detail.firstName} editable={editing} required onChange={(value) => setProfileDraft((current) => ({ ...current, firstName: value }))} />
        <UserDetailField label="Title" value={detail.designation} />
        <UserDetailField label="Last name" value={editing ? profileDraft.lastName : detail.lastName} editable={editing} required onChange={(value) => setProfileDraft((current) => ({ ...current, lastName: value }))} />
        <UserDetailField label="Department" value={detail.department} />
        <UserDetailField label="Business phone" value={editing ? profileDraft.phone : detail.phone} editable={editing} onChange={(value) => setProfileDraft((current) => ({ ...current, phone: value }))} type="tel" />
      </div></div>
      <div className="user-detail-section"><header><span className="user-detail-section-marker"/><div><h2>Account &amp; Security</h2><p>Current access state and password controls.</p></div><button type="button" className="user-detail-collapse-toggle" aria-expanded={accountSecurityOpen} aria-controls="user-account-security-details" onClick={() => setAccountSecurityOpen((open) => !open)}><span>{accountSecurityOpen ? 'Hide details' : 'Show details'}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></button></header>{accountSecurityOpen && <div className="user-detail-fields user-detail-security-fields" id="user-account-security-details">
        <UserDetailField label="Account status" value={detail.active ? 'Active' : 'Inactive'} />
        <UserDetailField label="Password" value="Managed securely" />
        <UserDetailStatus label="Password needs reset" value={detail.mustChangePassword ? 'Required at next sign in' : 'No'} tone={detail.mustChangePassword ? 'warning' : 'good'} />
        <UserDetailStatus label="Locked out" value={detail.locked ? 'Locked' : 'No'} tone={detail.locked ? 'warning' : 'good'} />
      </div>}</div>
      <div className="user-detail-section"><header><span className="user-detail-section-marker"/><div><h2>Preferences</h2><p>Display and contact preferences for the account.</p></div><button type="button" className="user-detail-collapse-toggle" aria-expanded={preferencesOpen} aria-controls="user-preferences-details" onClick={() => setPreferencesOpen((open) => !open)}><span>{preferencesOpen ? 'Hide details' : 'Show details'}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></button></header>{preferencesOpen && <div className="user-detail-fields" id="user-preferences-details">
        <UserDetailField label="Language" value="Not configured" />
        <UserDetailField label="Calendar integration" value="Not configured" />
        <UserDetailField label="Time zone" value="System default" />
        <UserDetailField label="Date format" value="System default" />
        <UserDetailField label="Mobile phone" value="Not set" />
        <UserDetailField label="Photo" value="Not set" />
      </div>}</div>
      <div className="user-detail-section"><header><span className="user-detail-section-marker"/><div><h2>Roles</h2><p>{detail.roles?.length || 0} assigned</p></div><button type="button" className="user-detail-collapse-toggle" aria-expanded={rolesOpen} aria-controls="user-roles-details" onClick={() => setRolesOpen((open) => !open)}><span>{rolesOpen ? 'Hide details' : 'Show details'}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></button></header>{rolesOpen && <div className="user-detail-assignment-list" id="user-roles-details">{detail.roles?.length ? detail.roles.map((role) => <span className="user-detail-assignment-chip" key={role.id}>{role.name}</span>) : <p className="user-detail-empty">No roles are assigned to this user.</p>}</div>}</div>
      <div className="user-detail-section"><header><span className="user-detail-section-marker"/><div><h2>Groups</h2><p>{detail.groups?.length || 0} assigned{detail.groups?.some((group) => group.primary) ? ` · Primary: ${detail.groups.find((group) => group.primary).name}` : ''}</p></div><button type="button" className="user-detail-collapse-toggle" aria-expanded={groupsOpen} aria-controls="user-groups-details" onClick={() => setGroupsOpen((open) => !open)}><span>{groupsOpen ? 'Hide details' : 'Show details'}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></button></header>{groupsOpen && <div className="user-detail-assignment-list" id="user-groups-details">{detail.groups?.length ? detail.groups.map((group) => <span className="user-detail-assignment-chip user-detail-group-chip" key={group.id}><strong>{group.name}</strong><small>{group.code}{group.primary ? ' · Primary group' : ''}</small></span>) : <p className="user-detail-empty">No groups are assigned to this user.</p>}</div>}</div>
    </section>
    <section className="user-related-links"><h2>Related Links</h2><button type="button" onClick={() => setTab('SUBSCRIPTIONS')}>View Subscriptions</button><button type="button" disabled={saving || !detail.active} onClick={onResetPassword}>Reset a password</button><button type="button" onClick={onEdit}>Edit full profile, role &amp; groups</button></section>
    <div className="user-record-tabs" role="tablist">{tabs.map(([key, label]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}>{label}</button>)}</div>
    {tab === 'ROLES' && <section className="user-record-list"><header><strong>☷ &nbsp; Roles</strong><button type="button" onClick={onEdit}>Edit…</button><label>Go to<select disabled><option>Role</option></select></label><input aria-label="Search roles" placeholder="Search" disabled /></header><div className="user-record-table-wrap"><table><thead><tr><th>Role</th><th>State</th><th>Inherited</th><th>Inheritance Count</th></tr></thead><tbody>{detail.roles?.map((item) => <tr key={item.id}><td><span className="record-info-icon">i</span><strong>{item.name}</strong></td><td><span className="record-active-link">Active</span></td><td>false</td><td>0</td></tr>)}{!detail.roles?.length && <tr><td colSpan="4">No roles are assigned.</td></tr>}</tbody></table></div></section>}
    {tab === 'GROUPS' && <section className="user-record-list"><header><strong>☷ &nbsp; Groups</strong><button type="button" onClick={openGroupEditor} disabled={editingGroups}>{editingGroups ? 'Editing' : 'Edit…'}</button><label>Go to<select disabled><option>Group</option></select></label><input aria-label="Search groups" placeholder="Search" disabled /></header><div className="user-record-table-wrap"><table><thead><tr><th>Group</th><th>Group ID</th><th>Primary</th><th>State</th></tr></thead><tbody>{detail.groups?.map((group) => <tr key={group.id}><td><span className="record-info-icon">i</span><strong>{group.name}</strong></td><td>{group.code}</td><td>{group.primary ? 'true' : 'false'}</td><td><span className="record-active-link">Active</span></td></tr>)}{!detail.groups?.length && <tr><td colSpan="4">No groups are assigned.</td></tr>}</tbody></table></div>{editingGroups && <section className="user-profile-group-editor"><div className="user-create-section-title"><span>✎</span><div><strong>Edit group membership</strong><small>Update groups assigned to {detail.displayName} and choose their primary group</small></div></div>{groupError && <div className="users-alert group-editor-alert" role="alert">{groupError}</div>}<div className="user-create-group-grid">{groupOptions.map((group, index) => <label className={`user-create-group${groupDraft.includes(String(group.id)) ? ' selected' : ''}`} key={group.id}><input type="checkbox" checked={groupDraft.includes(String(group.id))} onChange={() => toggleGroupDraft(group.id)} /><span className={`group-color group-color-${index % 5}`}>{group.code?.slice(0, 2)}</span><span><strong>{group.name}</strong><small>{group.code}</small></span></label>)}</div>{!groupOptions.length && <div className="users-state">Loading available support groups…</div>}<div className="user-create-primary-group"><RecordField label="Primary group" value={primaryGroupDraft} options={groupOptions.filter((group) => groupDraft.includes(String(group.id))).map((group) => ({ value: group.id, label: group.name }))} placeholder="Choose primary group" editable={groupDraft.length > 0} required onChange={setPrimaryGroupDraft} /></div></section>}</section>}
    {['DELEGATES', 'SUBSCRIPTIONS', 'MANAGE_SUBSCRIPTIONS'].includes(tab) && <section className="user-record-list user-record-empty"><h2>{tabs.find(([key]) => key === tab)?.[1]}</h2><p>This feature is not configured for this account yet.</p></section>}
    {tab === 'PERMISSIONS' && <section className="user-info-card permissions-card"><div className="info-card-heading"><span className="info-card-icon icon-violet">P</span><div><h2>Calculated permissions</h2><p>Permissions come from the assigned role. They are not individually overridden here.</p></div></div><div className="permission-pills">{detail.permissions?.map((permission) => <span key={permission}><b>✓</b>{nice(permission)}</span>)}</div><div className="permission-source">Permission source: <strong>Role → {detail.roles?.[0]?.name || 'None assigned'}</strong></div></section>}
    {tab === 'TICKETS' && <section className="user-info-card user-tickets-card"><div className="info-card-heading"><span className="info-card-icon icon-blue">T</span><div><h2>Assigned tickets</h2><p>Work currently assigned directly to this user.</p></div><span className="ticket-assigned-count">{ticketData?.tickets?.length ?? '—'} total</span></div><div className="mini-status-counts">{Object.entries(ticketData?.statusCounts || {}).map(([status, count]) => <span key={status}><b>{count}</b>{nice(status)}</span>)}</div><div className="users-table-wrap"><table className="users-table user-ticket-table"><thead><tr><th>Number</th><th>Type</th><th>Subject</th><th>Priority</th><th>Status</th><th>Group</th><th>Created</th><th>Updated</th></tr></thead><tbody>{activeTickets.map((ticket) => <tr key={`${ticket.type}:${ticket.id}`}><td><strong className="users-code">{ticket.number}</strong></td><td>{nice(ticket.type)}</td><td>{ticket.subject}</td><td>{ticket.priority}</td><td><span className="users-status is-active">{nice(ticket.status)}</span></td><td>{ticket.assignedGroup || '—'}</td><td>{dateText(ticket.createdAt)}</td><td>{dateText(ticket.updatedAt)}</td></tr>)}{ticketData && !activeTickets.length && <tr><td colSpan="8"><div className="users-state">No tickets are assigned directly to this user.</div></td></tr>}</tbody></table></div></section>}
    {tab === 'SECURITY' && <div className="user-detail-grid"><InfoCard title="Security" tone="amber"><Info label="Authentication" value="Local authentication" /><Info label="Account access" value={detail.locked ? 'Locked' : detail.active ? 'Enabled' : 'Inactive'} /><Info label="Lock reason" value={detail.lockReason} /><Info label="MFA" value={detail.mfaRequired ? 'Required (provider unavailable)' : 'Not required'} /><Info label="Password status" value={detail.mustChangePassword ? 'Change required at next login' : 'Active'} /><Info label="Last password change" value={dateText(detail.passwordChangedAt)} /><Info label="Last login" value={dateText(detail.lastLoginAt)} /></InfoCard><InfoCard title="Session controls" tone="blue"><p className="security-card-copy">Password resets revoke active sessions. Account locks block sign-in until an administrator unlocks the account.</p><div className="security-actions"><button className="users-secondary-button" disabled={saving || !detail.active} onClick={onResetPassword}>Reset password</button>{detail.locked ? <button className="users-secondary-button" disabled={saving} onClick={() => onManageAccount('unlock')}>Unlock account</button> : <button className="users-danger-button" disabled={saving || !detail.active} onClick={() => setLockOpen(true)}>Lock account</button>}{!detail.mustChangePassword && <button className="users-secondary-button" disabled={saving || !detail.active || detail.locked} onClick={() => onManageAccount('force-password-change', 'Require this user to change their password at the next sign-in?')}>Force password change</button>}</div></InfoCard></div>}
    {tab === 'ACTIVITY' && <section className="user-info-card"><div className="info-card-heading"><span className="info-card-icon icon-teal">A</span><div><h2>Activity & audit</h2><p>Account changes and sign-in events are recorded here.</p></div></div><div className="user-audit-list">{detail.activity?.map((item) => <article key={item.id}><span className={`audit-mark audit-${item.event.toLowerCase()}`} /><div><strong>{nice(item.event)}</strong><p>{item.details}</p><small>{item.actor} · {dateText(item.createdAt)}</small></div></article>)}{!detail.activity?.length && <div className="users-state">No audit activity recorded.</div>}</div></section>}
    {tab === 'ASSETS' && <div className="user-info-card assets-placeholder"><span className="assets-placeholder-mark">A</span><h2>Asset register is not configured yet</h2><p>Assigned devices will appear here when the Asset Management module is available.</p></div>}
    {deactivateOpen && <div className="user-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeactivateOpen(false) }}><form className="user-modal" onSubmit={submitDeactivate}><button className="modal-close" type="button" onClick={() => setDeactivateOpen(false)}>×</button><span className="users-kicker">ACCOUNT STATUS</span><h2>Deactivate {detail.displayName}?</h2><p>Existing tickets and audit history remain. Active assignments must be reassigned or closed first.</p><label>Reason *<textarea minLength="5" maxLength="500" required value={deactivateReason} onChange={(event) => setDeactivateReason(event.target.value)} /></label><footer><button className="users-secondary-button" type="button" onClick={() => setDeactivateOpen(false)}>Cancel</button><button className="users-danger-button" disabled={saving || deactivateReason.trim().length < 5}>{saving ? 'Deactivating…' : 'Deactivate user'}</button></footer></form></div>}
    {lockOpen && <div className="user-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLockOpen(false) }}><form className="user-modal" onSubmit={submitLock}><button className="modal-close" type="button" onClick={() => setLockOpen(false)}>×</button><span className="users-kicker">SECURITY CONTROL</span><h2>Lock {detail.displayName}?</h2><p>The user will be blocked from signing in and all active sessions will end. You can unlock the account later.</p><label>Reason *<textarea minLength="5" maxLength="500" required value={lockReason} onChange={(event) => setLockReason(event.target.value)} /></label><footer><button className="users-secondary-button" type="button" onClick={() => setLockOpen(false)}>Cancel</button><button className="users-danger-button" disabled={saving || lockReason.trim().length < 5}>{saving ? 'Locking…' : 'Lock account'}</button></footer></form></div>}
  </section>
}

function Field({ label, hint, children }) { return <label className="user-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label> }
function RecordField({ label, value = '', placeholder = '', select = false, options = null, editable = false, required = false, type = 'text', onChange }) {
  const isSelect = select || Boolean(options)
  return <label className="user-record-field"><span>{label}{required && editable ? ' *' : ''}</span>{isSelect ? <select disabled={!editable} required={required && editable} value={value || ''} onChange={(event) => onChange?.(event.target.value)}><option value="">{placeholder}</option>{(options || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <input type={type} disabled={!editable} required={required && editable} value={value || ''} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />}</label>
}
function UserDetailField({ label, value = '', editable = false, required = false, type = 'text', onChange }) {
  return <label className="user-detail-field"><span>{label}{required && editable && <b> *</b>}</span><input type={type} value={value || ''} readOnly={!editable} required={required && editable} onChange={(event) => onChange?.(event.target.value)} /></label>
}
function UserDetailStatus({ label, value, tone = 'good' }) {
  return <div className="user-detail-status"><span>{label}</span><strong className={`user-detail-status-pill is-${tone}`}>{value}</strong></div>
}
function RecordCheckbox({ label, checked, editable = false, onChange }) {
  return <label className="user-record-checkbox"><span>{label}</span><input type="checkbox" checked={checked} disabled={!editable} readOnly={!editable} onChange={(event) => onChange?.(event.target.checked)} /></label>
}
function ReviewSection({ title, children }) { return <section className="review-section"><h3>{title}</h3>{children}</section> }
function Review({ label, value }) { return <div className="review-row"><span>{label}</span><strong>{value || '—'}</strong></div> }
function InfoCard({ title, tone, children }) { return <section className="user-info-card"><div className="info-card-heading"><span className={`info-card-icon icon-${tone}`}>{title.slice(0, 1)}</span><div><h2>{title}</h2></div></div><div className="info-list">{children}</div></section> }
function Info({ label, value }) { return <div className="info-row"><span>{label}</span><strong>{value || '—'}</strong></div> }
