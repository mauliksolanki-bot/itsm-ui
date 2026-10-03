import { notifyToast } from '../components/Toast.jsx'
import Loader from '../components/Loader.jsx'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import './ChangeRequestPage.css'

const tabs = ['Overview', 'Risk & Impact', 'CIs & Services', 'Implementation', 'Testing', 'Rollback', 'Schedule', 'Approvals', 'Tasks', 'Communications', 'PIR']
const tabTones = ['blue', 'violet', 'teal', 'indigo', 'green', 'rose', 'amber', 'cyan', 'orange', 'slate', 'purple']
const workflowStages = ['New', 'Assess', 'Authorize', 'Scheduled', 'Implement', 'Review', 'Closed', 'Canceled']
const approvalResetFields = ['requestedByUserId', 'changeOwnerUserId', 'changeType', 'category', 'subcategory', 'shortDescription', 'description', 'businessJustification', 'priority', 'impact', 'probability', 'urgency', 'changeModel', 'configurationItems', 'affectedServices', 'environments', 'location', 'vendorInvolved', 'businessImpact', 'userImpact', 'serviceImpact', 'expectedDowntime', 'implementationPlan', 'testingRequired', 'testPlan', 'validationSteps', 'successCriteria', 'rollbackRequired', 'rollbackTrigger', 'rollbackSteps', 'rollbackOwner', 'rollbackDuration', 'plannedStart', 'plannedEnd', 'maintenanceWindow', 'timezone']
const subcategories = {
  Application: ['Production Deployment', 'Application Upgrade', 'Configuration Change', 'Bug Fix', 'Feature Release', 'API Change', 'Application Migration'],
  Database: ['Database Upgrade', 'Schema Change', 'Data Migration', 'Configuration Change', 'Performance Tuning', 'Backup/Restore'],
  Network: ['Firewall Change', 'Router Change', 'Switch Change', 'DNS Change', 'Load Balancer', 'VPN', 'Network Migration'],
  Cloud: ['EC2 Change', 'Security Group', 'Load Balancer', 'IAM', 'S3', 'RDS', 'Auto Scaling', 'Cloud Migration'],
}
const initial = { changeType: 'NORMAL', category: '', subcategory: '', shortDescription: '', description: '', businessJustification: '', priority: 'P3', impact: 'MEDIUM', probability: 'POSSIBLE', urgency: 'MEDIUM', changeModel: '', changeOwnerUserId: '', assignedGroupId: '', assignedAgentId: '', configurationItems: [], affectedServices: [], environments: [], location: '', vendorInvolved: '', businessImpact: 'MEDIUM', userImpact: 'FEW_USERS', serviceImpact: 'DEGRADED_SERVICE', expectedDowntime: 'NO_DOWNTIME', implementationPlan: '', testingRequired: true, testPlan: '', validationSteps: '', successCriteria: '', rollbackRequired: false, rollbackTrigger: '', rollbackSteps: '', rollbackOwner: '', rollbackDuration: '', plannedStart: '', plannedEnd: '', maintenanceWindow: '', timezone: 'Asia/Kolkata', tasks: [], communicationPlan: '', attachments: [], workNotes: '', implementationSuccessful: null, actualDowntime: '', issuesEncountered: '', rollbackPerformed: null, outcomeAchieved: null, lessonsLearned: '', failureReason: '', rootCause: '', correctiveAction: '', relatedIncident: '', relatedProblem: '' }
const nice = (v = '') => String(v).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())
const approvalStatusLabel = (status) => status === 'NOT_REQUIRED' ? 'No Longer Required' : status === 'PRE_APPROVED' ? 'Pre-approved' : status === 'NOT_SUBMITTED' || status === 'AFTER_SUBMISSION' ? 'After submission' : nice(status || 'Pending')
const approvalStatusTone = (status) => status === 'APPROVED' || status === 'PRE_APPROVED' ? 'is-approved' : status === 'REJECTED' ? 'is-rejected' : status === 'PENDING' ? 'is-pending' : 'is-neutral'
const auditMessageTone = (entry) => {
  const message = String(entry?.details || '').toUpperCase()
  if (entry?.eventType === 'APPROVAL') {
    if (message.includes('REJECTED')) return 'is-rejected'
    if (message.includes('CHANGES_REQUESTED') || message.includes('RETURNED')) return 'is-attention'
    if (message.includes('APPROVED') && !message.includes('RESET')) return 'is-approved'
    return 'is-workflow'
  }
  if (entry?.eventType === 'CREATED') return 'is-created'
  if (entry?.eventType === 'ASSIGNMENT') return 'is-assignment'
  return 'is-activity'
}

async function body(response) {
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || 'Unable to complete this action.')
  return result
}

function ChangeTabIcon({ tab }) {
  const icon = {
    Overview: <><path d="M8 5h11M8 10h11M8 15h7"/><path d="M4.5 5h.01M4.5 10h.01M4.5 15h.01"/><path d="M4 19h16"/></>,
    'Risk & Impact': <><path d="m12 3 9 16H3l9-16Z"/><path d="M12 9v4M12 16h.01"/></>,
    'CIs & Services': <><rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></>,
    Implementation: <><path d="m14.5 6.5 3-3a5 5 0 0 1-6.8 6.8l-7 7a2 2 0 0 0 2.8 2.8l7-7a5 5 0 0 1 6.8-6.8l-3 3-2.8-.8-.8-2.8Z"/></>,
    Testing: <><path d="M9 3h6M10 3v6l-5.5 9.2A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M8 15h8M10 18h4"/></>,
    Rollback: <><path d="M4 9V4m0 5h5"/><path d="M5 8a8 8 0 1 1-1 6"/><path d="m9 12 2 2 4-4"/></>,
    Schedule: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M4 9h16M8 13h3M8 17h3M14 13h3"/></>,
    Approvals: <><path d="M7 3.5h10a2 2 0 0 1 2 2v15H5v-15a2 2 0 0 1 2-2Z"/><path d="m8.5 12 2.2 2.2 4.8-5M8.5 17h7"/></>,
    Tasks: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m7 9 1.5 1.5L11 8M13.5 9H17M7 15h3M13.5 15H17"/></>,
    Communications: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 14.3-4Z"/><path d="M8.5 10h7M8.5 13.5h5"/></>,
    PIR: <><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/><circle cx="18" cy="7" r="1.5"/></>,
  }[tab]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
}

function LinkedSubtaskRows({ tasks = [] }) {
  return tasks.map((task, index) => {
    const text = String(task || '')
    const separator = text.indexOf(' · ')
    const number = separator >= 0 ? text.slice(0, separator) : `Task ${String(index + 1).padStart(2, '0')}`
    const description = separator >= 0 ? text.slice(separator + 3) : text
    return <li className="change-subtask-linked-item" key={`${number}-${index}`}>
      <span className="change-subtask-number">{number}</span>
      <div><strong>{description || 'Implementation task'}</strong><small>Child task linked to this change</small></div>
      <span className="change-subtask-status change-subtask-linked-status">Linked</span>
    </li>
  })
}

function ChangeRequestPage({ user, changeId = null }) {
  const isEditing = Boolean(changeId)
  const [options, setOptions] = useState(null)
  const [records, setRecords] = useState([])
  const [savedChange, setSavedChange] = useState(null)
  const [originalEditForm, setOriginalEditForm] = useState(null)
  const currentPerson = user?.userId ? { userId: user.userId, displayName: user.displayName || user.username, username: user.username, employeeId: user.employeeId } : null
  const [form, setForm] = useState({ ...initial, requestedByUserId: user?.userId ? String(user.userId) : '', changeOwnerUserId: user?.userId ? String(user.userId) : '' })
  const [personQueries, setPersonQueries] = useState({ requestedBy: currentPerson?.displayName || '', changeOwner: currentPerson?.displayName || '', assignedTo: '' })
  const [selectedPeople, setSelectedPeople] = useState({ requestedBy: currentPerson, changeOwner: currentPerson, assignedTo: null })
  const [peopleResults, setPeopleResults] = useState({ requestedBy: [], changeOwner: [], assignedTo: [] })
  const [peopleLoading, setPeopleLoading] = useState({ requestedBy: false, changeOwner: false, assignedTo: false })
  const [peopleOpen, setPeopleOpen] = useState({ requestedBy: false, changeOwner: false, assignedTo: false })
  const [numberPreview, setNumberPreview] = useState('')
  const [implementationTasks, setImplementationTasks] = useState([])
  const [subtaskDraft, setSubtaskDraft] = useState({ shortDescription: '', priority: 'P3', assignedGroupId: '', plannedStart: '', plannedEnd: '', dependencies: '', workNotes: '' })
  const [subtaskError, setSubtaskError] = useState('')
  const [tab, setTab] = useState('Overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [approvalResetWarning, setApprovalResetWarning] = useState(false)
  const [activeApproval, setActiveApproval] = useState(null)
  const [approvalView, setApprovalView] = useState('Approvers')
  const [approvalStateFilter, setApprovalStateFilter] = useState('ALL')
  const [approvalSearch, setApprovalSearch] = useState('')
  const [expandedApprovalGroups, setExpandedApprovalGroups] = useState([])
  const [auditTrailOpen, setAuditTrailOpen] = useState(false)
  const [auditTrailTab, setAuditTrailTab] = useState('activity')
  const [taskInput, setTaskInput] = useState('')
  const [configurationSearch, setConfigurationSearch] = useState('')
  const [configurationResults, setConfigurationResults] = useState([])
  const [configurationOptionsByNumber, setConfigurationOptionsByNumber] = useState({})
  const [configurationLoading, setConfigurationLoading] = useState(false)
  const [configurationSearchOpen, setConfigurationSearchOpen] = useState(false)
  const [uploadFiles, setUploadFiles] = useState([])
  const fileInputRef = useRef(null)
  const subtaskDescriptionRef = useRef(null)
  const subtaskListRef = useRef(null)
  const approvalResetConfirmedRef = useRef(false)

  useEffect(() => {
    if (!activeApproval && !approvalResetWarning && !auditTrailOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || approvalSaving || saving) return
      if (activeApproval) closeApprovalDialog()
      if (approvalResetWarning) closeApprovalResetWarning()
      if (auditTrailOpen) setAuditTrailOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activeApproval, approvalResetWarning, auditTrailOpen, approvalSaving, saving])

  useEffect(() => {
    if (!auditTrailOpen) return undefined
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
    }
  }, [auditTrailOpen])

  function closeApprovalDialog() {
    setActiveApproval(null)
    setApprovalComment('')
  }

  function closeApprovalResetWarning() {
    approvalResetConfirmedRef.current = false
    setApprovalResetWarning(false)
  }

  const risk = useMemo(() => {
    const i = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[form.impact] || 1
    const p = { RARE: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, ALMOST_CERTAIN: 5 }[form.probability] || 1
    const score = i * p
    return score >= 16 ? 'CRITICAL' : score >= 9 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW'
  }, [form.impact, form.probability])
  const conflicts = useMemo(() => records.filter((record) => record.changeId !== savedChange?.changeId && record.plannedStart && record.plannedEnd && form.plannedStart && form.plannedEnd && record.status !== 'CANCELLED' && record.status !== 'CLOSED' && new Date(form.plannedStart) < new Date(record.plannedEnd) && new Date(form.plannedEnd) > new Date(record.plannedStart) && form.configurationItems.some((ci) => record.configurationItems?.includes(ci))), [records, savedChange, form.plannedStart, form.plannedEnd, form.configurationItems])

  async function reload() {
    const [loadedOptions, loadedRecords] = await Promise.all([
      fetch('/api/change-requests/options', { credentials: 'include' }).then(body),
      fetch('/api/change-requests', { credentials: 'include' }).then(body),
    ])
    setOptions(loadedOptions)
    setRecords(loadedRecords)
  }
  useEffect(() => {
    let mounted = true
    const requests = [
      fetch('/api/change-requests/options', { credentials: 'include' }).then(body),
      fetch('/api/change-requests', { credentials: 'include' }).then(body),
    ]
    if (isEditing) requests.push(fetch(`/api/change-requests/${changeId}`, { credentials: 'include' }).then(body))
    else requests.push(fetch('/api/change-requests/next-number', { credentials: 'include' }).then(body), fetch('/api/change-requests/draft', { credentials: 'include' }).then(body))
    Promise.all(requests).then(([loadedOptions, loadedRecords, detail, savedDraft]) => {
      if (!mounted) return
      setOptions(loadedOptions); setRecords(loadedRecords)
      if (isEditing) {
        setSavedChange(detail)
        setNumberPreview(detail.changeNumber)
        const loadedForm = { ...initial, ...detail, requestedByUserId: String(detail.requestedByUserId || ''), changeOwnerUserId: String(detail.changeOwnerUserId || ''), assignedGroupId: detail.assignedGroupId ? String(detail.assignedGroupId) : '', assignedAgentId: detail.assignedAgentId ? String(detail.assignedAgentId) : '', plannedStart: detail.plannedStart || '', plannedEnd: detail.plannedEnd || '' }
        setForm(loadedForm)
        setOriginalEditForm(loadedForm)
        setPersonQueries({ requestedBy: detail.requestedBy || '', changeOwner: detail.changeOwner || '', assignedTo: detail.assignedAgent || '' })
        setSelectedPeople({ requestedBy: detail.requestedByUserId ? { userId: detail.requestedByUserId, displayName: detail.requestedBy } : null, changeOwner: detail.changeOwnerUserId ? { userId: detail.changeOwnerUserId, displayName: detail.changeOwner } : null, assignedTo: detail.assignedAgentId ? { userId: detail.assignedAgentId, displayName: detail.assignedAgent } : null })
      } else {
        setNumberPreview(detail.ticketNumber)
        if (savedDraft?.draftData) {
          const saved = savedDraft.draftData
          setForm({ ...initial, ...(saved.form || {}) }); setImplementationTasks(Array.isArray(saved.implementationTasks) ? saved.implementationTasks : [])
          setSubtaskDraft({ shortDescription: '', priority: 'P3', assignedGroupId: '', plannedStart: '', plannedEnd: '', dependencies: '', workNotes: '', ...(saved.subtaskDraft || {}) })
          setPersonQueries({ requestedBy: currentPerson?.displayName || '', changeOwner: currentPerson?.displayName || '', assignedTo: '', ...(saved.personQueries || {}) })
          setSelectedPeople({ requestedBy: currentPerson, changeOwner: currentPerson, assignedTo: null, ...(saved.selectedPeople || {}) })
          if (tabs.includes(savedDraft.currentStep)) setTab(savedDraft.currentStep)
          notifyToast('Your saved change request draft has been restored.', 'info', 'Draft restored')
        }
      }
    }).catch((e) => { if (mounted) { setError(e.message); notifyToast(e.message, 'error', 'Change request unavailable') } }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [changeId])

  const roles = user?.roles || []
  const canManageChange = roles.some((role) => ['CHANGE_MANAGER', 'TEAM_LEAD', 'IT_MANAGER', 'CAB_MEMBER', 'ADMIN', 'SUPER_ADMIN'].includes(role))
  const participantEditWindow = savedChange && ['ASSESSMENT', 'PENDING_APPROVAL'].includes(savedChange.status) && savedChange.approvalStatus === 'PENDING'
  const participantFields = new Set(['category', 'subcategory', 'shortDescription', 'description', 'businessJustification', 'impact', 'probability', 'urgency'])
  const canSupportEdit = roles.includes('SERVICE_DESK_AGENT')
  const participantCanEdit = Boolean(participantEditWindow && (String(savedChange?.requestedByUserId || '') === String(user?.userId || '') || String(savedChange?.changeOwnerUserId || '') === String(user?.userId || '')))
  const hasEditableFields = !isEditing || canManageChange || canSupportEdit || participantCanEdit
  const canEditField = (key) => !isEditing || canManageChange || (canSupportEdit && !['requestedByUserId', 'changeOwnerUserId', 'changeType', 'category', 'subcategory', 'assignedGroupId'].includes(key)) || Boolean(participantCanEdit && participantFields.has(key))
  const canEditConfigurationItems = !isEditing || canManageChange || canSupportEdit
  useEffect(() => {
    const query = configurationSearch.trim()
    if (query.length < 3 || !canEditConfigurationItems) {
      setConfigurationResults([])
      setConfigurationLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setConfigurationLoading(true)
      fetch('/api/application-onboarding/configuration-items/search?q=' + encodeURIComponent(query), { credentials: 'include', signal: controller.signal })
        .then(body)
        .then((results) => {
          setConfigurationResults(results)
          setConfigurationOptionsByNumber((current) => ({ ...current, ...Object.fromEntries(results.map((item) => [item.applicationNumber, item])) }))
        })
        .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
        .finally(() => { if (!controller.signal.aborted) setConfigurationLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [configurationSearch, canEditConfigurationItems])
  useEffect(() => {
    const missingNumbers = form.configurationItems.filter((number) => !configurationOptionsByNumber[number])
    if (!missingNumbers.length) return undefined
    const controller = new AbortController()
    Promise.all(missingNumbers.map((number) => fetch(`/api/application-onboarding/configuration-items/search?q=${encodeURIComponent(number)}`, { credentials: 'include', signal: controller.signal }).then(body)))
      .then((resultSets) => {
        const items = resultSets.flat().filter((item) => missingNumbers.includes(item.applicationNumber))
        if (items.length) setConfigurationOptionsByNumber((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.applicationNumber, item])) }))
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [form.configurationItems, configurationOptionsByNumber])
  const approvalSensitiveFieldsChanged = Boolean(isEditing && originalEditForm && approvalResetFields.some((key) => {
    const before = originalEditForm[key]
    const after = form[key]
    if (Array.isArray(before) || Array.isArray(after)) return JSON.stringify([...(before || [])].sort()) !== JSON.stringify([...(after || [])].sort())
    return before !== after
  }) || (isEditing && implementationTasks.length > 0))
  const approvalResetRequired = approvalSensitiveFieldsChanged && (originalEditForm?.changeType !== 'STANDARD' || form.changeType !== 'STANDARD')
  const approvalHeaderStatus = isEditing ? (savedChange?.approvalStatus || 'PENDING') : 'AFTER_SUBMISSION'
  const lifecycleStageByStatus = { ASSESSMENT: 1, PENDING_APPROVAL: 2, APPROVED: 2, SCHEDULED: 3, IMPLEMENTATION: 4, VALIDATION: 5, COMPLETED: 6, CLOSED: 6, CANCELLED: 7, REJECTED: 2, FAILED: 4, ROLLBACK: 4 }
  const activeLifecycleStage = isEditing ? (lifecycleStageByStatus[savedChange?.status] ?? 1) : 0

  useEffect(() => {
    const controllers = []
    const timers = []
    for (const key of ['requestedBy', 'changeOwner', 'assignedTo']) {
      const query = (personQueries[key] || '').trim()
      const selected = selectedPeople[key]
      if ((key === 'assignedTo' && !form.assignedGroupId) || query.length < 3 || (selected && query.toLocaleLowerCase() === selected.displayName?.toLocaleLowerCase())) {
        setPeopleResults((old) => ({ ...old, [key]: [] }))
        setPeopleLoading((old) => ({ ...old, [key]: false }))
        continue
      }
      const controller = new AbortController()
      controllers.push(controller)
      timers.push(window.setTimeout(() => {
        setPeopleLoading((old) => ({ ...old, [key]: true }))
        const endpoint = key === 'assignedTo'
          ? `/api/change-requests/groups/${encodeURIComponent(form.assignedGroupId)}/members/search?q=${encodeURIComponent(query)}`
          : `/api/service-requests/users/search?q=${encodeURIComponent(query)}`
        fetch(endpoint, { credentials: 'include', signal: controller.signal })
          .then(body)
          .then((results) => setPeopleResults((old) => ({ ...old, [key]: results })))
          .catch((error) => { if (error.name !== 'AbortError') setError(error.message) })
          .finally(() => { if (!controller.signal.aborted) setPeopleLoading((old) => ({ ...old, [key]: false })) })
      }, 250))
    }
    return () => { timers.forEach(window.clearTimeout); controllers.forEach((controller) => controller.abort()) }
  }, [personQueries, selectedPeople, form.assignedGroupId])

  function clearFieldError(key) { setFieldErrors((current) => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next }) }
  function set(field, value) { setForm((current) => ({ ...current, [field]: value })); clearFieldError(field); setError(''); setSuccess('') }
  function searchPerson(key, value, idKey = `${key}UserId`) {
    setPersonQueries((old) => ({ ...old, [key]: value }))
    setSelectedPeople((old) => ({ ...old, [key]: null }))
    setPeopleOpen((old) => ({ ...old, [key]: true }))
    setPeopleResults((old) => ({ ...old, [key]: [] }))
    setForm((current) => ({ ...current, [idKey]: '' }))
    clearFieldError(idKey)
  }
  function selectPerson(key, person, idKey = `${key}UserId`) {
    setSelectedPeople((old) => ({ ...old, [key]: person }))
    setPersonQueries((old) => ({ ...old, [key]: person.displayName }))
    setPeopleResults((old) => ({ ...old, [key]: [] }))
    setPeopleOpen((old) => ({ ...old, [key]: false }))
    setForm((current) => ({ ...current, [idKey]: String(person.userId) }))
    clearFieldError(idKey)
    setError('')
  }
  function changeAssignmentGroup(groupId) {
    setForm((current) => ({ ...current, assignedGroupId: groupId, assignedAgentId: '' }))
    clearFieldError('assignedGroupId'); clearFieldError('assignedAgentId')
    setPersonQueries((current) => ({ ...current, assignedTo: '' }))
    setSelectedPeople((current) => ({ ...current, assignedTo: null }))
    setPeopleResults((current) => ({ ...current, assignedTo: [] }))
    setPeopleOpen((current) => ({ ...current, assignedTo: false }))
    setError(''); setSuccess('')
  }
  function moveTab(direction) {
    const nextIndex = Math.min(tabs.length - 1, Math.max(0, tabs.indexOf(tab) + direction))
    if (direction > 0 && !validateNavigation(tabs[nextIndex])) return
    setError('')
    setTab(tabs[nextIndex])
    document.querySelector('.change-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function fieldValidationErrors(step) {
    const errors = {}
    switch (step) {
      case 'Overview':
        if (!form.requestedByUserId) errors.requestedByUserId = 'Choose a requested by user.'
        if (!['STANDARD', 'NORMAL', 'EMERGENCY'].includes(form.changeType)) errors.changeType = 'Choose a change type.'
        if (!form.changeOwnerUserId) errors.changeOwnerUserId = 'Choose a change owner.'
        if (!form.category) errors.category = 'Choose a category.'
        if (!form.assignedGroupId) errors.assignedGroupId = 'Choose an assignment group.'
        if (!form.assignedAgentId) errors.assignedAgentId = 'Choose an assignee from the selected assignment group.'
        if (!['P1', 'P2', 'P3', 'P4'].includes(form.priority)) errors.priority = 'Choose a priority.'
        if ((!form.location || !(options?.locations || []).includes(form.location)) && (!isEditing || canEditField('location'))) errors.location = 'Choose a valid location.'
        if (form.vendorInvolved !== true && form.vendorInvolved !== false) errors.vendorInvolved = 'Choose whether a vendor is involved.'
        if (form.shortDescription.trim().length < 5) errors.shortDescription = 'Enter a short description of at least 5 characters.'
        if (form.description.replace(/<[^>]*>/g, '').trim().length < 10) errors.description = 'Describe the change in at least 10 characters.'
        if (form.changeType !== 'STANDARD' && form.businessJustification.trim().length < 10) errors.businessJustification = 'Add a business justification of at least 10 characters.'
        break
      case 'Risk & Impact':
        if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(form.impact)) errors.impact = 'Choose a risk impact.'
        if (!['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'].includes(form.probability)) errors.probability = 'Choose a probability.'
        break
      case 'CIs & Services':
        if (!form.configurationItems.length && (!isEditing || canEditField('configurationItems'))) errors.configurationItems = 'Select at least one onboarded application or server.'
        if (!form.environments.length) errors.environments = 'Select at least one affected environment.'
        break
      case 'Implementation':
        if (!form.implementationPlan.trim()) errors.implementationPlan = 'Enter an implementation plan.'
        break
      case 'Testing':
        if (form.testingRequired && form.testPlan.trim().length < 10) errors.testPlan = 'Enter a test plan of at least 10 characters.'
        if (form.testingRequired && form.validationSteps.trim().length < 10) errors.validationSteps = 'Enter validation steps of at least 10 characters.'
        if (form.testingRequired && form.successCriteria.trim().length < 10) errors.successCriteria = 'Enter success criteria of at least 10 characters.'
        break
      case 'Rollback':
        if (form.rollbackRequired && !form.rollbackDuration.trim()) errors.rollbackDuration = 'Enter the estimated rollback duration.'
        if (form.rollbackRequired && !form.rollbackOwner.trim()) errors.rollbackOwner = 'Enter the rollback owner.'
        if (form.rollbackRequired && form.rollbackTrigger.trim().length < 10) errors.rollbackTrigger = 'Enter a rollback trigger of at least 10 characters.'
        if ((form.rollbackRequired || form.environments.includes('Production')) && form.rollbackSteps.trim().length < 10) errors.rollbackSteps = 'Enter rollback steps of at least 10 characters.'
        if (form.environments.includes('Production') && !form.rollbackRequired) errors.rollbackRequired = 'Production changes require a rollback plan.'
        break
      case 'Schedule':
        if (form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) <= new Date(form.plannedStart)) errors.plannedEnd = 'Planned end must be after planned start.'
        break
      default:
        break
    }
    return errors
  }
  function validateTab(step) {
    switch (step) {
      case 'Overview':
        if (!form.requestedByUserId) return 'Select a requested by user.'
        if (!['STANDARD', 'NORMAL', 'EMERGENCY'].includes(form.changeType)) return 'Choose a change type.'
        if (!form.changeOwnerUserId) return 'Select a change owner.'
        if (!form.category) return 'Choose a category.'
        if (!form.assignedGroupId) return 'Choose an assignment group.'
        if (!form.assignedAgentId) return 'Choose an assignee from the selected assignment group.'
        if (!['P1', 'P2', 'P3', 'P4'].includes(form.priority)) return 'Choose a priority.'
        if ((!form.location || !(options?.locations || []).includes(form.location)) && (!isEditing || canEditField('location'))) return 'Choose a valid location.'
        if (form.vendorInvolved !== true && form.vendorInvolved !== false) return 'Choose whether a vendor is involved.'
        if (form.shortDescription.trim().length < 5) return 'Enter a short description of at least 5 characters.'
        if (form.description.replace(/<[^>]*>/g, '').trim().length < 10) return 'Describe the change in at least 10 characters.'
        if (form.changeType !== 'STANDARD' && form.businessJustification.trim().length < 10) return 'Add a business justification of at least 10 characters for Normal or Emergency changes.'
        return ''
      case 'Risk & Impact':
        if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(form.impact)) return 'Choose a risk impact.'
        if (!['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'].includes(form.probability)) return 'Choose a probability.'
        return ''
      case 'CIs & Services':
        if (!form.configurationItems.length && (!isEditing || canEditField('configurationItems'))) return 'Select at least one onboarded application or server.'
        return form.environments.length ? '' : 'Select at least one affected environment.'
      case 'Implementation':
        return form.implementationPlan.trim().length ? '' : 'Enter an implementation plan.'
      case 'Testing':
        return form.testingRequired && (form.testPlan.trim().length < 10 || form.validationSteps.trim().length < 10 || form.successCriteria.trim().length < 10)
          ? 'When testing is required, provide a test plan, validation steps, and success criteria of at least 10 characters each.' : ''
      case 'Rollback':
        if (form.rollbackRequired && (!form.rollbackDuration.trim() || !form.rollbackOwner.trim() || form.rollbackTrigger.trim().length < 10 || form.rollbackSteps.trim().length < 10)) return 'When rollback is required, provide the estimated duration, rollback owner, trigger, and steps. Trigger and steps must be at least 10 characters.'
        if (form.environments.includes('Production') && (!form.rollbackRequired || form.rollbackSteps.trim().length < 10)) return 'Production changes require a rollback plan with steps of at least 10 characters.'
        return ''
      case 'Schedule':
        if (form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) <= new Date(form.plannedStart)) return 'Planned end must be after planned start.'
        return ''
      default: return ''
    }
  }
  function validateNavigation(target) {
    const targetIndex = tabs.indexOf(target)
    if (targetIndex <= tabs.indexOf(tab)) { setError(''); setFieldErrors({}); return true }
    for (let index = 0; index < targetIndex; index += 1) {
      const problem = validateTab(tabs[index])
      if (problem) {
        setTab(tabs[index])
        setFieldErrors(fieldValidationErrors(tabs[index]))
        setError(`${tabs[index]}: ${problem}`)
        document.querySelector('.change-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return false
      }
    }
    setFieldErrors({})
    setError('')
    return true
  }
  function selectTab(target) {
    if (validateNavigation(target)) {
      setTab(target)
      document.querySelector('.change-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  function toggle(field, value) { setForm((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] })); clearFieldError(field) }
  function selectConfigurationItem(item) {
    if (!form.configurationItems.includes(item.applicationNumber)) toggle('configurationItems', item.applicationNumber)
    setConfigurationOptionsByNumber((current) => ({ ...current, [item.applicationNumber]: item }))
    setConfigurationSearch('')
    setConfigurationResults([])
    setConfigurationSearchOpen(false)
    clearFieldError('configurationItems')
    setError('')
  }
  function addTask() {
    const title = subtaskDraft.shortDescription.trim()
    if (!title) { const message = 'Enter a short description for the implementation subtask.'; setSubtaskError(message); notifyToast(message, 'error', 'Description required'); subtaskDescriptionRef.current?.focus(); return }
    if (title.length > 160) { const message = 'Subtask descriptions can be up to 160 characters.'; setSubtaskError(message); notifyToast(message, 'error', 'Description too long'); subtaskDescriptionRef.current?.focus(); return }
    if (subtaskDraft.plannedStart && subtaskDraft.plannedEnd && new Date(subtaskDraft.plannedEnd) <= new Date(subtaskDraft.plannedStart)) { const message = 'The subtask end must be after its planned start.'; setSubtaskError(message); notifyToast(message, 'error', 'Check task schedule'); return }
    setImplementationTasks((old) => [...old, { ...subtaskDraft, shortDescription: title, assignedGroupId: subtaskDraft.assignedGroupId || form.assignedGroupId }])
    setSubtaskDraft({ shortDescription: '', priority: 'P3', assignedGroupId: form.assignedGroupId || '', plannedStart: '', plannedEnd: '', dependencies: '', workNotes: '' })
    setSubtaskError('')
    notifyToast('Implementation subtask added. It will be created under the change request when you submit it.', 'success', 'Subtask added')
    window.setTimeout(() => subtaskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  function removeTask(index) { setImplementationTasks((old) => old.filter((_, itemIndex) => itemIndex !== index)); notifyToast('Implementation subtask removed from this draft.', 'info', 'Subtask removed') }
  async function saveDraft(step = tab, showConfirmation = true) {
    setDraftSaving(true)
    setError('')
    try {
      const draftData = { form, implementationTasks, subtaskDraft, personQueries, selectedPeople }
      const saved = await body(await fetch('/api/change-requests/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftData, currentStep: step }) }))
      if (showConfirmation) notifyToast(uploadFiles.length ? 'Draft saved. Reattach your files before final submission.' : 'Your progress has been saved as a draft.', 'success', 'Draft saved')
      return Boolean(saved?.draftId)
    } catch (e) {
      setError(e.message)
      notifyToast(e.message, 'error', 'Draft could not be saved')
      return false
    } finally { setDraftSaving(false) }
  }
  async function nextTab() {
    const nextIndex = Math.min(tabs.length - 1, tabs.indexOf(tab) + 1)
    if (nextIndex === tabs.indexOf(tab)) return
    if (!validateNavigation(tabs[nextIndex])) return
    if (isEditing) moveTab(1)
    else if (await saveDraft(tabs[nextIndex], false)) moveTab(1)
  }
  async function decideApproval(approvalId, decision) {
    if (decision !== 'APPROVED' && approvalComment.trim().length < 5) {
      const message = 'Add at least 5 characters explaining the decision.'
      setError(message); notifyToast(message, 'error', 'Approval comment required'); return
    }
    setApprovalSaving(true); setError('')
    try {
      const updated = await body(await fetch(`/api/change-requests/${changeId}/approval`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalId, decision, comments: approvalComment.trim() }) }))
      setSavedChange(updated); setApprovalComment('')
      setActiveApproval(null)
      const label = decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'returned for changes'
      setSuccess(`${updated.changeNumber} was ${label}.`); notifyToast(`${updated.changeNumber} was ${label}.`, 'success', 'Approval recorded')
    } catch (e) { setError(e.message); notifyToast(e.message, 'error', 'Approval action failed') }
    finally { setApprovalSaving(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (tabs.indexOf(tab) !== tabs.length - 1) { nextTab(); return }
    const invalidStep = tabs.find((step) => validateTab(step))
    if (invalidStep) {
      const problem = validateTab(invalidStep)
      setTab(invalidStep); setFieldErrors(fieldValidationErrors(invalidStep)); setError(`${invalidStep}: ${problem}`)
      document.querySelector('.change-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setFieldErrors({})
    if (isEditing && approvalResetRequired && !approvalResetConfirmedRef.current) { setApprovalResetWarning(true); return }
    approvalResetConfirmedRef.current = false
    setSaving(true); setError(''); setSuccess('')
    try {
      const editableForm = Object.fromEntries(Object.keys(initial).map((key) => [key, form[key]]))
      const payload = { ...editableForm, requestedByUserId: Number(form.requestedByUserId), changeOwnerUserId: Number(form.changeOwnerUserId), assignedGroupId: form.assignedGroupId ? Number(form.assignedGroupId) : null, assignedAgentId: form.assignedAgentId ? Number(form.assignedAgentId) : null, tasks: implementationTasks.map((task) => task.shortDescription), implementationTasks: implementationTasks.map((task) => ({ ...task, assignedGroupId: task.assignedGroupId ? Number(task.assignedGroupId) : null, plannedStart: task.plannedStart || null, plannedEnd: task.plannedEnd || null })), plannedStart: form.plannedStart || null, plannedEnd: form.plannedEnd || null, attachments: [] }
      const data = new FormData(); data.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' })); uploadFiles.forEach((file) => data.append('attachments', file))
      const created = await body(await fetch(isEditing ? `/api/change-requests/${changeId}` : '/api/change-requests', { method: isEditing ? 'PUT' : 'POST', credentials: 'include', body: data }))
      if (isEditing) {
        const updatedForm = { ...initial, ...created, requestedByUserId: String(created.requestedByUserId || ''), changeOwnerUserId: String(created.changeOwnerUserId || ''), assignedGroupId: created.assignedGroupId ? String(created.assignedGroupId) : '', assignedAgentId: created.assignedAgentId ? String(created.assignedAgentId) : '', plannedStart: created.plannedStart || '', plannedEnd: created.plannedEnd || '' }
        setSavedChange(created); setForm(updatedForm); setOriginalEditForm(updatedForm); setPersonQueries((old) => ({ ...old, assignedTo: created.assignedAgent || '' })); setSelectedPeople((old) => ({ ...old, assignedTo: created.assignedAgentId ? { userId: created.assignedAgentId, displayName: created.assignedAgent } : null })); setImplementationTasks([]); setApprovalResetWarning(false); setSuccess(`${created.changeNumber} was updated successfully.`); notifyToast(`Change ${created.changeNumber} was updated successfully.`, 'success', 'Change updated'); setUploadFiles([]); return
      }
      await fetch('/api/change-requests/draft', { method: 'DELETE', credentials: 'include' }).catch(() => {})
      await reload(); fetch('/api/change-requests/next-number', { credentials: 'include' }).then(body).then((number) => setNumberPreview(number.ticketNumber)).catch(() => {}); setSuccess(`${created.changeNumber} was created successfully.`); notifyToast(`Change ${created.changeNumber} was created successfully.`, 'success', 'Change created'); setForm({ ...initial, requestedByUserId: user?.userId ? String(user.userId) : '', changeOwnerUserId: user?.userId ? String(user.userId) : '' }); setImplementationTasks([]); setSubtaskDraft({ shortDescription: '', priority: 'P3', assignedGroupId: '', plannedStart: '', plannedEnd: '', dependencies: '', workNotes: '' }); setPersonQueries({ requestedBy: currentPerson?.displayName || '', changeOwner: currentPerson?.displayName || '', assignedTo: '' }); setSelectedPeople({ requestedBy: currentPerson, changeOwner: currentPerson, assignedTo: null }); setUploadFiles([]); setTab('Overview'); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setError(e.message); notifyToast(e.message, 'error', isEditing ? 'Change update failed' : 'Change creation failed') } finally { setSaving(false) }
  }
  const field = (label, key, { required = false, type = 'text', options: values, placeholder = '', wide = false, readOnly = false, className = '' } = {}) => { const locked = readOnly || !canEditField(key); const message = fieldErrors[key]; return <label className={`change-field${wide ? ' change-field-wide' : ''}${className ? ` ${className}` : ''}`} key={key}><span>{label}{required && <b> *</b>}</span>{values ? <select required={required} aria-invalid={Boolean(message)} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={locked}><option value="">Select…</option>{values.map((item) => <option key={item.value ?? item} value={item.value ?? item} disabled={item.disabled}>{item.label ?? nice(item)}</option>)}</select> : type === 'textarea' ? <textarea required={required} aria-invalid={Boolean(message)} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} rows={4} readOnly={locked} /> : <input required={required} aria-invalid={Boolean(message)} type={type} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} readOnly={locked} />}{message && <small className="change-field-error" role="alert">{message}</small>}</label> }
  const area = (label, key, required = false, note = '') => <label className="change-field change-field-wide"><span>{label}{required && <b> *</b>}</span><textarea aria-invalid={Boolean(fieldErrors[key])} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} rows={5} placeholder={note} readOnly={!canEditField(key)} />{fieldErrors[key] && <small className="change-field-error" role="alert">{fieldErrors[key]}</small>}</label>
  const checks = (label, key, values) => <fieldset className={`change-checkset${key === 'environments' ? ' change-environment-set' : ''}`} aria-invalid={Boolean(fieldErrors[key])}><legend>{label} *</legend><div>{values.map((value) => <label key={value}><input type="checkbox" checked={form[key].includes(value)} onChange={() => toggle(key, value)} disabled={!canEditField(key)} /><span>{value}</span></label>)}</div>{fieldErrors[key] && <small className="change-field-error" role="alert">{fieldErrors[key]}</small>}</fieldset>
  const personField = (label, key) => <label className="change-field change-person-field"><span>{label}<b> *</b></span><div className="change-person-search"><div className="change-person-input-wrap"><input role="combobox" aria-autocomplete="list" aria-expanded={Boolean(peopleOpen[key] && personQueries[key]?.trim().length >= 3)} aria-controls={`change-${key}-results`} autoComplete="off" value={personQueries[key] || ''} placeholder="Search name, employee ID, or username" aria-invalid={Boolean(fieldErrors[`${key}UserId`])} readOnly={!canEditField(`${key}UserId`)} onFocus={() => setPeopleOpen((old) => ({ ...old, [key]: true }))} onBlur={() => window.setTimeout(() => setPeopleOpen((old) => ({ ...old, [key]: false })), 150)} onChange={(event) => searchPerson(key, event.target.value)} />{peopleLoading[key] && <span className="change-person-spinner" aria-label="Searching users" />}</div>{peopleOpen[key] && canEditField(`${key}UserId`) && personQueries[key]?.trim().length >= 3 && <ul id={`change-${key}-results`} className="change-person-results" role="listbox">{(peopleResults[key] || []).map((person) => <li key={person.userId}><button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectPerson(key, person)}><strong>{person.displayName}</strong><small>{person.employeeId || 'No employee ID'} · {person.username}</small></button></li>)}{!peopleLoading[key] && !peopleResults[key]?.length && <li className="change-person-empty">No active users found.</li>}</ul>}{!form[`${key}UserId`] && personQueries[key]?.trim().length < 3 && <small className="change-person-hint">Enter at least 3 characters to search.</small>}{fieldErrors[`${key}UserId`] && <small className="change-field-error" role="alert">{fieldErrors[`${key}UserId`]}</small>}</div></label>
  const assignedToField = () => <label className="change-field change-person-field"><span>Assigned to<b> *</b></span><div className="change-person-search"><div className="change-person-input-wrap"><input role="combobox" aria-autocomplete="list" aria-expanded={Boolean(peopleOpen.assignedTo && personQueries.assignedTo?.trim().length >= 3)} aria-controls="change-assignedTo-results" autoComplete="off" value={personQueries.assignedTo || ''} placeholder={!form.assignedGroupId ? 'Select an assignment group first' : 'Search active group members'} aria-invalid={Boolean(fieldErrors.assignedAgentId)} disabled={!form.assignedGroupId || (isEditing && !canManageChange)} onFocus={() => setPeopleOpen((old) => ({ ...old, assignedTo: true }))} onBlur={() => window.setTimeout(() => setPeopleOpen((old) => ({ ...old, assignedTo: false })), 150)} onChange={(event) => searchPerson('assignedTo', event.target.value, 'assignedAgentId')} />{peopleLoading.assignedTo && <span className="change-person-spinner" aria-label="Searching group members" />}</div>{peopleOpen.assignedTo && form.assignedGroupId && !(isEditing && !canManageChange) && personQueries.assignedTo?.trim().length >= 3 && <ul id="change-assignedTo-results" className="change-person-results" role="listbox">{(peopleResults.assignedTo || []).map((person) => <li key={person.userId}><button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => selectPerson('assignedTo', person, 'assignedAgentId')}><strong>{person.displayName}</strong><small>{person.employeeId || 'No employee ID'} · {person.username}</small></button></li>)}{!peopleLoading.assignedTo && !peopleResults.assignedTo?.length && <li className="change-person-empty">No active members found in this group.</li>}</ul>}{fieldErrors.assignedAgentId && <small className="change-field-error" role="alert">{fieldErrors.assignedAgentId}</small>}</div></label>

  function renderTab() {
    switch (tab) {
      case 'Overview': return <div className="change-grid change-overview-grid">
        <div className="change-overview-column">
          <label className="change-field"><span>Number</span><input value={numberPreview || 'Loading number…'} readOnly /></label>
          <label className="change-field"><span>State</span><input value={nice(savedChange?.status || 'ASSESSMENT')} readOnly /></label>
          {personField('Change owner', 'changeOwner')}
          {field('Subcategory', 'subcategory', { options: subcategories[form.category] || [] })}
          {assignedToField()}
          {field('Change model', 'changeModel', { placeholder: 'Application Deployment' })}
          <label className="change-field"><span>Vendor involved<b> *</b></span><select required aria-invalid={Boolean(fieldErrors.vendorInvolved)} value={form.vendorInvolved === '' || form.vendorInvolved == null ? '' : String(form.vendorInvolved)} disabled={!canEditField('vendorInvolved')} onChange={(e) => set('vendorInvolved', e.target.value === '' ? '' : e.target.value === 'true')}><option value="">Select…</option><option value="false">No</option><option value="true">Yes</option></select>{fieldErrors.vendorInvolved && <small className="change-field-error" role="alert">{fieldErrors.vendorInvolved}</small>}</label>
        </div>
        <div className="change-overview-column">
          {personField('Requested by', 'requestedBy')}
          {field('Change type', 'changeType', { required: true, options: [{ value: 'STANDARD', label: 'Standard' }, { value: 'NORMAL', label: 'Normal' }, { value: 'EMERGENCY', label: 'Emergency' }] })}
          {field('Category', 'category', { required: true, options: options?.categories || [] })}
          <label className="change-field"><span>Assignment group<b> *</b></span><select required aria-invalid={Boolean(fieldErrors.assignedGroupId)} value={form.assignedGroupId} disabled={isEditing && !canManageChange || !isEditing && !canEditField('assignedGroupId')} onChange={(event) => changeAssignmentGroup(event.target.value)}><option value="">Select…</option>{(options?.groups || []).map((group) => <option key={group.groupId} value={String(group.groupId)}>{group.groupName}</option>)}</select>{fieldErrors.assignedGroupId && <small className="change-field-error" role="alert">{fieldErrors.assignedGroupId}</small>}</label>
          {field('Priority', 'priority', { required: true, options: ['P1', 'P2', 'P3', 'P4'] })}
          {field('Location', 'location', { required: true, options: [...(options?.locations || []), ...(form.location && !(options?.locations || []).includes(form.location) ? [{ value: form.location, label: `${form.location} (choose a configured location)`, disabled: true }] : [])] })}
        </div>
        {field('Short description', 'shortDescription', { required: true, placeholder: 'e.g. Deploy HRMS v3.5', wide: true, className: 'change-overview-short-description' })}
        {area('Description', 'description', true, 'Describe the proposed technical change.')}
        {area('Business justification', 'businessJustification', form.changeType !== 'STANDARD', 'Explain the business need and expected benefit.')}
      </div>
      case 'Risk & Impact': return <div className="change-grid">
        {field('Risk impact', 'impact', { required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })}{field('Probability', 'probability', { required: true, options: ['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'] })}
        {field('Urgency', 'urgency', { options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })}{field('Business impact', 'businessImpact', { options: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })}
        {field('User impact', 'userImpact', { options: ['NONE', 'FEW_USERS', 'DEPARTMENT', 'MULTIPLE_DEPARTMENTS', 'ENTIRE_ORGANIZATION', 'EXTERNAL_CUSTOMERS'] })}
        {field('Service impact', 'serviceImpact', { options: ['NO_IMPACT', 'DEGRADED_SERVICE', 'PARTIAL_OUTAGE', 'COMPLETE_OUTAGE'] })}
        {field('Expected downtime', 'expectedDowntime', { options: ['NO_DOWNTIME', 'UNDER_15_MINUTES', '15_30_MINUTES', '30_60_MINUTES', '1_2_HOURS', 'OVER_2_HOURS'] })}
      </div>
      case 'CIs & Services': return <div className="change-grid">
        {checks('Environments', 'environments', options?.environments || ['Development', 'QA', 'UAT', 'Staging', 'Production', 'DR'])}
        <label className="change-field change-ci-picker"><span>Add Configuration Item<b> *</b></span><div className="change-person-search">
          <div className="change-person-input-wrap"><input role="combobox" aria-autocomplete="list" aria-expanded={Boolean(configurationSearchOpen && configurationSearch.trim().length >= 3)} aria-controls="change-configuration-item-results" autoComplete="off" value={configurationSearch} placeholder="Search by application name or code" aria-invalid={Boolean(fieldErrors.configurationItems)} readOnly={!canEditField('configurationItems')} onFocus={() => setConfigurationSearchOpen(true)} onBlur={() => window.setTimeout(() => setConfigurationSearchOpen(false), 150)} onChange={(event) => { setConfigurationSearch(event.target.value); setConfigurationSearchOpen(true) }} />{configurationLoading && <span className="change-person-spinner" aria-label="Searching applications and servers" />}</div>
          {configurationSearchOpen && canEditField('configurationItems') && configurationSearch.trim().length >= 3 && <ul id="change-configuration-item-results" className="change-person-results" role="listbox">{configurationResults.map((item) => <li key={item.applicationNumber}><button type="button" role="option" aria-selected={form.configurationItems.includes(item.applicationNumber)} disabled={form.configurationItems.includes(item.applicationNumber)} onMouseDown={(event) => event.preventDefault()} onClick={() => selectConfigurationItem(item)}><strong>{item.applicationName}</strong><small>{item.applicationNumber} · {item.applicationCode} · {item.applicationType} · {item.environment} · {item.status}</small></button></li>)}{!configurationLoading && !configurationResults.length && <li className="change-person-empty">No onboarded applications or servers found.</li>}</ul>}
          {form.configurationItems.length > 0 && <div className="change-token-row change-ci-selected">{form.configurationItems.map((ci) => { const item = configurationOptionsByNumber[ci]; const label = item ? `${item.applicationName} · ${item.applicationCode} · ${item.applicationNumber}` : ci; return canEditField('configurationItems') ? <button type="button" key={ci} onClick={() => toggle('configurationItems', ci)} aria-label={`Remove ${label}`}>{label} ×</button> : <span key={ci}>{label}</span> })}</div>}
          {fieldErrors.configurationItems && <small className="change-field-error" role="alert">{fieldErrors.configurationItems}</small>}
        </div></label>
        <label className="change-field"><span>Add affected service</span><input disabled={!canEditField('affectedServices')} value={taskInput.startsWith('svc:') ? taskInput.slice(4) : ''} onChange={(e) => setTaskInput(`svc:${e.target.value}`)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = taskInput.slice(4).trim(); if (v) toggle('affectedServices', v); setTaskInput('') } }} placeholder="HRMS" /></label>
        <div className="change-token-row change-field-wide">{form.affectedServices.map((s) => canEditField('affectedServices') ? <button type="button" key={s} onClick={() => toggle('affectedServices', s)}>{s} ×</button> : <span key={s}>{s}</span>)}</div>
      </div>
      case 'Implementation': return <div className="change-grid">{area('Implementation plan', 'implementationPlan', true, 'List the planned implementation steps and owners.')}
        {isEditing && savedChange?.tasks?.length > 0 && <div className="change-subtask-list change-field-wide"><header><strong>Implementation subtasks</strong><span>{savedChange.tasks.length} linked</span></header><ol className="change-subtask-linked-list"><LinkedSubtaskRows tasks={savedChange.tasks} /></ol></div>}
        {!isEditing && <>
        <fieldset className="change-subtask-composer change-field-wide"><legend>Add implementation task</legend><p>Each task is created as a child record under this change request when you submit it.</p>
          <div className="change-subtask-fields">
            <label className="change-field change-subtask-wide"><span>Short description <b>*</b></span><input ref={subtaskDescriptionRef} maxLength={160} aria-invalid={Boolean(subtaskError)} value={subtaskDraft.shortDescription} onChange={(event) => { setSubtaskDraft((old) => ({ ...old, shortDescription: event.target.value })); setSubtaskError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTask() } }} placeholder="e.g. Take database backup" />{subtaskError && <small className="change-subtask-error" role="alert">{subtaskError}</small>}</label>
            <label className="change-field"><span>Assignment group</span><select value={subtaskDraft.assignedGroupId} onChange={(event) => setSubtaskDraft((old) => ({ ...old, assignedGroupId: event.target.value }))}><option value="">Use change assignment group</option>{(options?.groups || []).map((group) => <option key={group.groupId} value={String(group.groupId)}>{group.groupName}</option>)}</select></label>
            <label className="change-field"><span>Priority</span><select value={subtaskDraft.priority} onChange={(event) => setSubtaskDraft((old) => ({ ...old, priority: event.target.value }))}>{['P1', 'P2', 'P3', 'P4'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label className="change-field"><span>Planned start</span><input type="datetime-local" value={subtaskDraft.plannedStart} onChange={(event) => setSubtaskDraft((old) => ({ ...old, plannedStart: event.target.value }))} /></label>
            <label className="change-field"><span>Planned end</span><input type="datetime-local" value={subtaskDraft.plannedEnd} onChange={(event) => setSubtaskDraft((old) => ({ ...old, plannedEnd: event.target.value }))} /></label>
            <label className="change-field change-subtask-wide"><span>Dependencies</span><input value={subtaskDraft.dependencies} onChange={(event) => setSubtaskDraft((old) => ({ ...old, dependencies: event.target.value }))} placeholder="Optional prerequisite tasks" /></label>
          </div>
          <button className="change-add-subtask" type="button" onClick={addTask}>＋ Add implementation task</button>
        </fieldset>
        <section ref={subtaskListRef} className="change-subtask-list change-field-wide"><header><strong>Implementation subtasks</strong><span>{implementationTasks.length} added</span></header>{implementationTasks.length ? <ol>{implementationTasks.map((task, index) => <li key={`${task.shortDescription}-${index}`}><span className="change-subtask-number">Draft {String(index + 1).padStart(2, '0')}</span><div><strong>{task.shortDescription}</strong><small>{(options?.groups || []).find((group) => String(group.groupId) === String(task.assignedGroupId || form.assignedGroupId))?.groupName || 'Change assignment group'} · {task.priority} · {task.plannedStart ? new Date(task.plannedStart).toLocaleString() : 'Not scheduled'}</small></div><span className="change-subtask-status">Pending</span><button type="button" onClick={() => removeTask(index)}>Remove</button></li>)}</ol> : <p>No implementation subtasks added yet.</p>}</section>
        </>}
      </div>
      case 'Testing': return <div className="change-grid"><label className="change-field"><span>Testing required</span><select value={String(form.testingRequired)} disabled={!canEditField('testingRequired')} onChange={(e) => set('testingRequired', e.target.value === 'true')}><option value="true">Yes</option><option value="false">No</option></select></label>{area('Test plan', 'testPlan', form.testingRequired, 'Document test cases and expected results.')}{area('Validation steps', 'validationSteps', form.testingRequired, 'How will the service be verified after implementation?')}{area('Success criteria', 'successCriteria', form.testingRequired, 'What confirms the change succeeded?')}</div>
      case 'Rollback': return <div className="change-grid"><label className="change-field"><span>Rollback required</span><select value={String(form.rollbackRequired)} disabled={!canEditField('rollbackRequired')} onChange={(e) => set('rollbackRequired', e.target.value === 'true')}><option value="false">No</option><option value="true">Yes</option></select></label>{field('Rollback owner', 'rollbackOwner', { required: form.rollbackRequired })}{field('Estimated rollback duration', 'rollbackDuration', { required: form.rollbackRequired, placeholder: '30 minutes' })}{area('Rollback trigger', 'rollbackTrigger', form.rollbackRequired, 'Conditions that require a rollback.')}{area('Rollback steps', 'rollbackSteps', form.rollbackRequired || form.environments.includes('Production'), 'Describe how to restore the previous state.')}</div>
      case 'Schedule': return <div className="change-grid">{field('Planned start', 'plannedStart', { type: 'datetime-local' })}{field('Planned end', 'plannedEnd', { type: 'datetime-local' })}{field('Maintenance window', 'maintenanceWindow', { options: ['Business hours', 'After business hours', 'Weekend', 'Public holiday', 'Emergency window'] })}{field('Timezone', 'timezone', { options: ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London'] })}{field('Expected downtime', 'expectedDowntime', { options: ['NO_DOWNTIME', 'UNDER_15_MINUTES', '15_30_MINUTES', '30_60_MINUTES', '1_2_HOURS', 'OVER_2_HOURS'] })}{conflicts.length > 0 && <div className="change-conflict change-field-wide"><strong>Potential schedule conflict</strong><span>{conflicts.map((item) => `${item.changeNumber} · ${item.shortDescription}`).join(' | ')} affects a selected configuration item during this window.</span></div>}</div>
      case 'Approvals': {
        const standard = form.changeType === 'STANDARD'
        const emergency = form.changeType === 'EMERGENCY'
        const approvalRows = savedChange?.approvals || []
        const approvalStatus = savedChange?.approvalStatus || (standard ? 'PRE_APPROVED' : 'NOT_SUBMITTED')
        const currentUserId = String(user?.userId || '')
        const visibleApprovals = approvalRows.filter((approval) => {
          const mineOnly = approvalView === 'My approvals'
          if (mineOnly && String(approval.approverUserId || '') !== currentUserId) return false
          if (approvalStateFilter !== 'ALL' && approval.status !== approvalStateFilter) return false
          const query = approvalSearch.trim().toLowerCase()
          if (!query) return true
          return [approval.approver, approval.approverUsername, approval.employeeId, approval.approverEmail,
            approval.approvalGroupName, approval.comments, approval.status].some((value) => String(value || '').toLowerCase().includes(query))
        })
        const approvalStateLabel = (status) => status === 'NOT_REQUIRED' ? 'No Longer Required' : status === 'PRE_APPROVED' ? 'Approved' : nice(status || 'Pending')
        const approvalStateTone = (status) => status === 'APPROVED' || status === 'PRE_APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : status === 'PENDING' ? 'pending' : 'neutral'
        const approvalDate = (value) => value ? new Date(value).toLocaleString() : '—'
        return <div className="change-approval-workspace change-approval-list-view">
          {!isEditing ? <section className="change-approval-pending-info"><span className="approval-info-icon">ⓘ</span><div><strong>{standard ? 'No approval required' : emergency ? 'Emergency Change Approvers' : 'Change Advisory Board (CAB)'}</strong><p>{standard ? 'This standard change is pre-approved.' : 'Approval members and group decisions will appear here after final submission.'}</p></div><span className="change-approval-state-pill">After submission</span></section>
            : standard && approvalRows.length === 0 ? <section className="change-approval-pending-info"><span className="approval-info-icon">✓</span><div><strong>Pre-approved change</strong><p>This standard change does not require group approval.</p></div><span className="change-approval-state-pill is-approved">Pre-approved</span></section>
            : <>
              <div className="change-approval-list-toolbar">
                <label className="change-approval-view-select"><span className="sr-only">Approval view</span><select value={approvalView} onChange={(event) => setApprovalView(event.target.value)}><option>Approvers</option><option>My approvals</option></select></label>
                <label><span>State</span><select value={approvalStateFilter} onChange={(event) => setApprovalStateFilter(event.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="WAITING">Waiting</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="NOT_REQUIRED">No Longer Required</option></select></label>
                <label className="change-approval-search"><span>Search</span><input value={approvalSearch} onChange={(event) => setApprovalSearch(event.target.value)} placeholder="Approver, group, comment" /></label>
                <span className="change-approval-row-count">{visibleApprovals.length} of {approvalRows.length}</span>
              </div>
              <div className="change-approval-table-wrap"><table className="change-approval-table"><thead><tr><th className="approval-state-col">State</th><th>Approver</th><th>Assignment group</th><th>Comments</th><th>Created</th><th className="approval-actions-col">Actions</th></tr></thead>
                <tbody>{visibleApprovals.map((approval, index) => {
                  const mine = approval.approverActive !== false && approval.approverUserId != null && String(approval.approverUserId) === currentUserId && approval.status === 'PENDING'
                  const firstGroupRow = visibleApprovals.findIndex((row) => row.approvalType === approval.approvalType) === index
                  const groupIsExpanded = expandedApprovalGroups.includes(approval.approvalType)
                  const activeGroupMembers = [...new Map(approvalRows.filter((row) => row.approvalType === approval.approvalType && row.approverUserId != null && row.approverActive !== false).map((row) => [String(row.approverUserId), row])).values()]
                  const memberName = approval.approver || 'Unassigned approver'
                  const initials = memberName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
                  return <Fragment key={`${approval.approvalId}-${approval.approverUserId || index}`}>
                    <tr>
                      <td><span className={`approval-table-state is-${approvalStateTone(approval.status)}`}><i />{approvalStateLabel(approval.status)}</span></td>
                      <td><div className="approval-table-person"><span className="approval-table-avatar">{initials}</span><span><strong>{memberName}</strong><small>{[approval.employeeId, approval.approverEmail || approval.approverUsername, approval.approverRoles?.join(', ')].filter(Boolean).join(' · ') || 'Group approver'}</small></span></div></td>
                      <td><span className="approval-table-group">{approval.approvalGroupName || (approval.approvalType === 'EMERGENCY' ? 'Emergency Change Approvers' : 'Change Advisory Board (CAB)')}</span></td>
                      <td className="approval-table-comment">{approval.comments || <span className="approval-empty-value">—</span>}</td>
                      <td className="approval-table-date">{approvalDate(approval.createdAt)}</td>
                      <td><div className="approval-table-action-cell">
                        {mine && <button type="button" className="approval-decision-icon" aria-label={`Add a decision and review ${memberName}'s approval`} title="Add decision" onClick={() => { setApprovalComment(''); setActiveApproval({ approvalId: approval.approvalId, memberName, groupName: approval.approvalGroupName || 'Change approval' }) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 14.3-4Z"/><path d="M8.5 11.5h7M8.5 14.5h4"/></svg></button>}
                        {firstGroupRow && <button type="button" className="approval-group-members-toggle" aria-expanded={groupIsExpanded} onClick={() => setExpandedApprovalGroups((current) => current.includes(approval.approvalType) ? current.filter((type) => type !== approval.approvalType) : [...current, approval.approvalType])}>{groupIsExpanded ? 'Hide members' : 'View members'} <span className={`approval-members-chevron${groupIsExpanded ? ' is-expanded' : ''}`} aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="m4 6 4 4 4-4" /></svg></span></button>}
                        {!mine && !firstGroupRow && <span className="approval-empty-value">—</span>}
                      </div></td>
                    </tr>
                    {firstGroupRow && groupIsExpanded && <tr className="approval-group-members-row" key={`members-${approval.approvalType}`}><td colSpan="6"><section className="approval-group-members-panel">{activeGroupMembers.length ? <table><thead><tr><th>Member</th><th>Employee ID</th><th>Email</th><th>Approval status</th></tr></thead><tbody>{activeGroupMembers.map((member) => <tr key={member.approverUserId}><td>{member.approver || 'Approver'}</td><td>{member.employeeId || '—'}</td><td>{member.approverEmail || '—'}</td><td><span className={`approval-table-state is-${approvalStateTone(member.status)}`}><i />{approvalStateLabel(member.status)}</span></td></tr>)}</tbody></table> : <p>No active approvers are currently assigned to this approval group.</p>}</section></td></tr>}
                  </Fragment>
                })}{visibleApprovals.length === 0 && <tr><td colSpan="6" className="approval-table-empty">No approval records match these filters.</td></tr>}</tbody>
              </table></div>
              {approvalRows.length === 0 && <p className="change-approval-no-members">No approvers are configured for this group yet. Ask an administrator to assign members to the required approval role.</p>}
            </>}
        </div>
      }
      case 'Tasks': return <div className="change-explainer"><h3>Change subtasks</h3><p>Implementation tasks are linked to this change request as child records. Add and manage their details in the Implementation section.</p><div className="change-subtask-list"><header><strong>Implementation subtasks</strong><span>{isEditing ? (savedChange?.tasks?.length || 0) : implementationTasks.length} {isEditing ? 'linked' : 'added'}</span></header>{isEditing ? savedChange?.tasks?.length ? <ol className="change-subtask-linked-list"><LinkedSubtaskRows tasks={savedChange.tasks} /></ol> : <p>No implementation subtasks have been added.</p> : implementationTasks.length ? <ol>{implementationTasks.map((task, index) => <li key={`${task.shortDescription}-${index}`}><span className="change-subtask-number">Draft {String(index + 1).padStart(2, '0')}</span><div><strong>{task.shortDescription}</strong><small>{task.priority} · {task.plannedStart ? new Date(task.plannedStart).toLocaleString() : 'Not scheduled'}</small></div><span className="change-subtask-status">Pending</span></li>)}</ol> : <p>No implementation subtasks added yet.</p>}</div></div>
      case 'Communications': return <div className="change-communication-layout">
        <section className="change-communication-card">
          <header className="change-communication-card-header"><span className="change-communication-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 14.3-4Z"/><path d="M8.5 10h7M8.5 13.5h5"/></svg></span><div><span className="change-communication-kicker">STAKEHOLDER PLANNING</span><h4>Communication plan</h4><p>Define who needs to know, what they need to know, and when updates should be sent.</p></div><span className="change-communication-stage">Change coordination</span></header>
          <label className="change-field change-communication-plan"><span>Plan details <small>Include audiences, channels, timing, and message ownership.</small></span><textarea value={form.communicationPlan ?? ''} onChange={(event) => set('communicationPlan', event.target.value)} rows={6} placeholder="Example: Notify the service desk and affected users 24 hours before implementation. Send a completion update after validation." readOnly={!canEditField('communicationPlan')} /></label>
        </section>
        {isEditing && savedChange?.attachments?.length > 0 && <section className="change-communication-card change-communication-files"><header className="change-communication-section-heading"><span className="change-communication-file-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 15h8M8 18h5"/></svg></span><div><h4>Current attachments</h4><p>Files already linked to this change request.</p></div><span className="change-communication-count">{savedChange.attachments.length} {savedChange.attachments.length === 1 ? 'file' : 'files'}</span></header><ul>{savedChange.attachments.map((file) => <li key={file.attachmentId}><span className="change-communication-file-type">{file.fileName.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}</span><a href={`/api/change-requests/${changeId}/attachments/${file.attachmentId}`} target="_blank" rel="noreferrer">{file.fileName}</a><small>{Math.ceil(file.size / 1024)} KB</small><span className="change-communication-download" aria-hidden="true">↓</span></li>)}</ul></section>}
        {(!isEditing || canEditField('communicationPlan')) && <section className="change-communication-card change-communication-upload"><header className="change-communication-section-heading"><span className="change-communication-file-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></span><div><h4>Supporting attachments</h4><p>Add change plans, stakeholder notices, or supporting documents.</p></div><span className="change-communication-count">{uploadFiles.length}/5 selected</span></header>
          <div className="change-communication-dropzone"><span className="change-communication-upload-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></span><div><strong>Attach files to this change</strong><small>PDF, PNG, JPG, TXT, CSV, DOCX, or XLSX · up to 5 MB each</small></div><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadFiles.length >= 5}>Browse files</button><input className="change-communication-file-input" ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={(event) => { const allowed = Array.from(event.target.files || []); event.target.value = ''; const accepted = allowed.filter((file) => file.size <= 5 * 1024 * 1024 && /\.(pdf|png|jpg|jpeg|txt|csv|docx|xlsx)$/i.test(file.name)); setUploadFiles((old) => [...old, ...accepted].slice(0, 5)); if (accepted.length !== allowed.length) setError('Use PDF, PNG, JPG, TXT, CSV, DOCX, or XLSX files up to 5 MB each.') }} /></div>
          {uploadFiles.length > 0 && <ul className="change-communication-selected-files">{uploadFiles.map((file, index) => <li key={`${file.name}-${index}`}><span className="change-communication-file-type">{file.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}</span><span className="change-communication-selected-name"><strong>{file.name}</strong><small>{Math.max(1, Math.ceil(file.size / 1024))} KB · Ready to upload</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setUploadFiles((old) => old.filter((_, fileIndex) => fileIndex !== index))}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button></li>)}</ul>}
        </section>}
        <aside className="change-communication-guidance"><span aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></span><p><strong>Production change guidance</strong>Coordinate updates with the business owner, technical team, service desk, affected users, and vendor when applicable.</p></aside>
      </div>
      case 'PIR': return <div className="change-grid change-pir-grid"><label className="change-field"><span>Implementation successful?</span><select value={form.implementationSuccessful ?? ''} onChange={(e) => set('implementationSuccessful', e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not completed</option><option value="true">Yes</option><option value="false">No</option></select></label><label className="change-field"><span>Rollback performed?</span><select value={form.rollbackPerformed ?? ''} onChange={(e) => set('rollbackPerformed', e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not reviewed</option><option value="true">Yes</option><option value="false">No</option></select></label><label className="change-field"><span>Expected outcome achieved?</span><select value={form.outcomeAchieved ?? ''} onChange={(e) => set('outcomeAchieved', e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not reviewed</option><option value="true">Yes</option><option value="false">No</option></select></label>{area('Actual downtime', 'actualDowntime')}{area('Issues encountered', 'issuesEncountered')}{area('Lessons learned', 'lessonsLearned')}{area('Failure reason', 'failureReason')}{area('Root cause', 'rootCause')}{area('Corrective action', 'correctiveAction')}{field('Related incident', 'relatedIncident')}{field('Related problem', 'relatedProblem')}</div>
      default: return null
    }
  }

  if (loading) return <section className="change-page"><Loader variant="inline" title="Loading change workspace" subtitle="Getting the latest change records." /></section>
  return <section className="change-page">
    {error && <div className="change-alert" role="alert">{error}</div>}{success && <div className="change-alert change-success" role="status">{success}</div>}
    <form id="change-request-form" className="change-form" onSubmit={submit} noValidate>
      <div className="change-form-heading"><div className="change-form-heading-copy"><div><h2>{isEditing ? `${savedChange?.changeNumber || `CHG-${changeId}`} - ${form.shortDescription || savedChange?.shortDescription || 'Change request'}` : 'Submit a change'}</h2>{!isEditing && <p>Complete each section. Risk is calculated automatically from impact and probability.</p>}</div></div><div className="change-form-heading-meta"><div className="change-selected-environments" aria-label="Selected environments"><div>{form.environments?.length ? form.environments.map((environment) => <span className="change-environment-chip" key={environment}>{environment}</span>) : <span className="change-environment-empty">None selected</span>}</div></div><span className={`change-risk-pill risk-${risk.toLowerCase()}`}>Risk · {risk}</span><button type="button" className="change-audit-trigger" aria-label="Open audit trail" title="Audit trail" aria-haspopup="dialog" onClick={() => { setAuditTrailTab('activity'); setAuditTrailOpen(true) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v15H4z"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h3M8 16.5h5M15 13l1.2 1.2L18.5 12"/></svg></button></div></div>
      <nav className="change-lifecycle" aria-label="Change request lifecycle">{workflowStages.map((stage, index) => <div key={stage} className={`change-lifecycle-stage${index === activeLifecycleStage ? ' active' : index < activeLifecycleStage ? ' complete' : ''}`}><span>{stage}</span></div>)}</nav>
      <nav className="change-tabs" aria-label="Change request sections" onWheel={(event) => { const element = event.currentTarget; if (element.scrollWidth > element.clientWidth) { const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY; if (delta) { event.preventDefault(); element.scrollLeft += delta } } }}>{tabs.map((item, index) => <button type="button" className={`change-tab-${tabTones[index]}${tab === item ? ' active' : ''}`} key={item} onClick={() => selectTab(item)}><span className="change-tab-icon" aria-hidden="true"><ChangeTabIcon tab={item} /></span>{item}</button>)}</nav>
      <div className={`change-tab-content change-panel-${tabTones[tabs.indexOf(tab)]}`}><section className="change-ci-section"><div className={`change-tab-title-row${tab === 'Approvals' ? ' change-approvals-title-row' : ''}`}><span className="change-ci-section-marker"/><div className="change-ci-section-heading"><h3>{tab === 'Approvals' ? <>Approvals <span className="change-approval-heading-number">- {savedChange?.changeNumber || numberPreview || (changeId ? `CHG-${changeId}` : 'New change')}</span></> : tab}</h3><p>{tab === 'Overview' ? 'Core information, ownership, and assignment for this change.' : `Provide ${tab.toLowerCase()} details for this change request.`}</p></div>{tab === 'Risk & Impact' && <div className={`change-risk-summary change-risk-summary-compact risk-${risk.toLowerCase()}`}><span className="change-risk-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 9 16H3l9-16Z"/><path d="M12 9v4M12 16h.01"/></svg></span><div className="change-risk-copy"><span>Calculated risk</span><small>Based on impact and probability</small></div><strong>{risk}</strong></div>}{tab === 'Approvals' && <span className={`change-approval-state-pill change-approval-header-status ${approvalStatusTone(approvalHeaderStatus)}`}>{approvalStatusLabel(approvalHeaderStatus)}</span>}</div><div className="change-ci-section-body">{renderTab()}</div></section>
        <footer className="change-form-footer"><span>{!isEditing && `Step ${tabs.indexOf(tab) + 1} of ${tabs.length} · Progress saves as a draft when you continue. The number is created on final submission.`}</span><div className="change-step-nav-actions"><button type="button" className="change-previous-button" disabled={tabs.indexOf(tab) === 0 || saving || draftSaving} onClick={() => moveTab(-1)}>Previous</button>{!isEditing && <button type="button" className="change-save-draft-button" disabled={saving || draftSaving} onClick={() => saveDraft(tab, true)}>{draftSaving ? 'Saving draft…' : 'Save as draft'}</button>}{tabs.indexOf(tab) === tabs.length - 1 ? <button type="submit" disabled={saving || draftSaving || !hasEditableFields}>{saving ? (isEditing ? 'Saving…' : 'Submitting…') : isEditing ? 'Save Changes' : 'Submit Change Request'}</button> : <button type="button" className="change-next-button" disabled={saving || draftSaving} onClick={nextTab}>{draftSaving ? 'Saving…' : 'Next'}</button>}</div></footer>
      </div>
    </form>
    {auditTrailOpen && <div className="approval-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditTrailOpen(false) }}>
      <section className="approval-decision-dialog change-audit-dialog" role="dialog" aria-modal="true" aria-labelledby="change-audit-title">
        <header className="approval-dialog-header"><span className="approval-dialog-mark change-audit-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5h16v15H4z"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h3M8 16.5h5M15 13l1.2 1.2L18.5 12"/></svg></span><div><p>RECORD ACTIVITY</p><h2 id="change-audit-title">Audit trail</h2></div><button type="button" className="approval-dialog-close" aria-label="Close audit trail" onClick={() => setAuditTrailOpen(false)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        <div className="approval-dialog-content change-audit-content"><div className="change-audit-summary"><span><strong>{savedChange?.changeNumber || 'New change request'}</strong><small>{savedChange?.shortDescription || form.shortDescription || 'Audit entries are recorded after submission.'}</small></span><b>{savedChange?.history?.length || 0} {savedChange?.history?.length === 1 ? 'entry' : 'entries'}</b></div>
          <div className="change-audit-tabs" role="tablist" aria-label="Audit trail sections"><button type="button" role="tab" aria-selected={auditTrailTab === 'activity'} className={auditTrailTab === 'activity' ? 'active' : ''} onClick={() => setAuditTrailTab('activity')}>Audit activity<span>{savedChange?.history?.length || 0}</span></button><button type="button" role="tab" aria-selected={auditTrailTab === 'approvals'} className={auditTrailTab === 'approvals' ? 'active' : ''} onClick={() => setAuditTrailTab('approvals')}>Approval history<span>{savedChange?.history?.filter((entry) => entry.eventType === 'APPROVAL').length || 0}</span></button></div>
          {(() => { const auditEntries = savedChange?.history || []; const visibleEntries = (auditTrailTab === 'approvals' ? auditEntries.filter((entry) => entry.eventType === 'APPROVAL') : auditEntries).slice().reverse(); return visibleEntries.length ? <ol className="change-audit-timeline">{visibleEntries.map((entry, index) => <li key={entry.historyId || `${entry.eventType}-${entry.changedAt}-${index}`}><span className={`change-audit-event-icon${entry.eventType === 'APPROVAL' ? ' is-approval' : ''}`} aria-hidden="true"><svg viewBox="0 0 20 20">{entry.eventType === 'APPROVAL' ? <><path d="m4 10 4 4 8-8"/><circle cx="10" cy="10" r="8"/></> : <path d="M4 4h12v12H4zM7 7h6M7 10h6M7 13h3"/>}</svg></span><div><div className="change-audit-event-heading"><strong className={`change-audit-type change-audit-type-${String(entry.eventType || 'update').toLowerCase().replaceAll('_', '-')}`}>{nice(entry.eventType || 'Update')}</strong><time>{entry.changedAt ? new Date(entry.changedAt).toLocaleString() : '—'}</time></div><p className={`change-audit-message ${auditMessageTone(entry)}`}>{entry.details || 'Change request updated.'}</p><small><span>By</span> <b>{entry.changedBy || 'System'}</b></small></div></li>)}</ol> : <div className="change-audit-empty"><span aria-hidden="true">{auditTrailTab === 'approvals' ? '✓' : '◷'}</span><strong>{auditTrailTab === 'approvals' ? 'No approval history yet' : 'No audit activity yet'}</strong><p>{auditTrailTab === 'approvals' ? 'Approval decisions and workflow resets will be recorded here.' : 'Changes and workflow actions will appear here after this request is submitted.'}</p></div> })()}
        </div>
      </section>
    </div>}
    {activeApproval && <div className="approval-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !approvalSaving) closeApprovalDialog() }}>
      <section className="approval-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="approval-dialog-title" aria-describedby="approval-dialog-description">
        <header className="approval-dialog-header"><span className="approval-dialog-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 14.3-4Z"/><path d="M8.5 11.5h7M8.5 14.5h4"/></svg></span><div><p>CHANGE APPROVAL</p><h2 id="approval-dialog-title">Record your decision</h2></div><button type="button" className="approval-dialog-close" aria-label="Close decision dialog" disabled={approvalSaving} onClick={closeApprovalDialog}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        <div className="approval-dialog-content"><div className="approval-dialog-context"><span className="approval-dialog-context-icon" aria-hidden="true">✓</span><span><strong>{activeApproval.memberName}</strong><small>{activeApproval.groupName} · {savedChange?.changeNumber || 'Change request'}</small></span><span className="approval-dialog-pending">Pending</span></div><p id="approval-dialog-description">Add a comment to document your reasoning. A comment is required when rejecting an approval.</p><label className="approval-dialog-label" htmlFor="approval-decision-comment">Decision comment <span>Required for rejection</span></label><textarea id="approval-decision-comment" maxLength={2000} value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} placeholder="Explain your decision for the approval history…" rows={5} autoFocus /><div className="approval-dialog-meta"><span>Comments are visible in the request history.</span><span>{approvalComment.length}/2000</span></div></div>
        <footer className="approval-dialog-footer"><button type="button" className="approval-dialog-cancel" disabled={approvalSaving} onClick={closeApprovalDialog}>Cancel</button><div><button type="button" className="approval-dialog-reject" disabled={approvalSaving} onClick={() => decideApproval(activeApproval.approvalId, 'REJECTED')}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg>{approvalSaving ? 'Saving…' : 'Reject'}</button><button type="button" className="approval-dialog-approve" disabled={approvalSaving} onClick={() => decideApproval(activeApproval.approvalId, 'APPROVED')}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 3 3 6-6.5"/></svg>{approvalSaving ? 'Saving…' : 'Approve'}</button></div></footer>
      </section>
    </div>}
    {approvalResetWarning && <div className="approval-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeApprovalResetWarning() }}>
      <section className="approval-decision-dialog approval-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="approval-reset-title" aria-describedby="approval-reset-description">
        <header className="approval-dialog-header"><span className="approval-dialog-mark approval-reset-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 21 19H3l9-16Z"/><path d="M12 9v4M12 16h.01"/></svg></span><div><p>APPROVAL WORKFLOW UPDATE</p><h2 id="approval-reset-title">Restart approvals?</h2></div><button type="button" className="approval-dialog-close" aria-label="Keep editing" onClick={closeApprovalResetWarning}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        <div className="approval-dialog-content"><div className="approval-reset-notice"><span aria-hidden="true">↻</span><strong>Your changes affect an approval-required section.</strong></div><p id="approval-reset-description">Saving these changes will clear the existing approval decisions and restart the approval workflow from its first required group. Approvers will need to review the updated request again.</p></div>
        <footer className="approval-dialog-footer"><button type="button" className="approval-dialog-cancel" disabled={saving} onClick={closeApprovalResetWarning}>Keep editing</button><div><button type="button" className="approval-reset-confirm" disabled={saving} onClick={() => { approvalResetConfirmedRef.current = true; setApprovalResetWarning(false); document.getElementById('change-request-form')?.requestSubmit() }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4m0 5h5"/><path d="M5 8a8 8 0 1 1-1 6"/></svg>{saving ? 'Saving…' : 'Save & reset approvals'}</button></div></footer>
      </section>
    </div>}

  </section>
}

export default ChangeRequestPage
