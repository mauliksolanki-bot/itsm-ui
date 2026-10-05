import { useCallback, useEffect, useMemo, useState } from 'react'
import './CmdbAdministrationPage.css'

const tabs = [
  ['classes', 'CI Classes', '▦'], ['attributes', 'CI Attributes', '≡'],
  ['relationships', 'Relationship Types', '⇄'], ['choices', 'Choice Lists', '☷'], ['settings', 'CMDB Settings', '⚙'],
]
const emptyClass = { name: '', code: '', parentClassId: '', description: '', icon: '', active: true }
const emptyAttribute = { label: '', name: '', dataType: 'TEXT', choiceListId: '', required: false, active: true, displayOrder: 0, helpText: '' }
const emptyRelationship = { name: '', reverseName: '', sourceClasses: '*', targetClasses: '*', description: '', active: true }
const emptyList = { name: '', code: '', description: '', active: true }
const emptyChoice = { value: '', label: '', displayOrder: 0, active: true }
const dataTypes = ['TEXT', 'TEXT_AREA', 'NUMBER', 'DECIMAL', 'DATE', 'DATETIME', 'BOOLEAN', 'EMAIL', 'URL', 'IP_ADDRESS', 'DROPDOWN', 'MULTI_SELECT', 'USER_REFERENCE', 'CI_REFERENCE']

async function call(path, options = {}) {
  const response = await fetch(`/api/cmdb/admin${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || `Request failed (${response.status}).`)
  return body
}
const json = (method, value) => ({ method, body: JSON.stringify(value) })
const display = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const idOf = (item) => item?.id

function StatusBadge({ active }) { return <span className={`cmdb-admin-status${active ? ' is-active' : ''}`}><i />{active ? 'Active' : 'Inactive'}</span> }
function Toggle({ value, onChange, label = 'Active' }) { return <label className="cmdb-admin-toggle"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }
function Field({ label, children, wide = false }) { return <label className={`cmdb-admin-field${wide ? ' is-wide' : ''}`}><span>{label}</span>{children}</label> }
function TableState({ loading, error, empty }) { return <div className={`cmdb-admin-state${error ? ' has-error' : ''}`}>{loading ? <><i className="cmdb-admin-spinner" />Loading CMDB configuration…</> : error || empty}</div> }

export default function CmdbAdministrationPage() {
  const [tab, setTab] = useState('classes')
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [attributes, setAttributes] = useState([])
  const [relationshipTypes, setRelationshipTypes] = useState([])
  const [choiceLists, setChoiceLists] = useState([])
  const [settings, setSettings] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [classForm, setClassForm] = useState(emptyClass)
  const [attributeForm, setAttributeForm] = useState(emptyAttribute)
  const [relationshipForm, setRelationshipForm] = useState(emptyRelationship)
  const [listForm, setListForm] = useState(emptyList)
  const [choiceForm, setChoiceForm] = useState(emptyChoice)
  const [selectedListId, setSelectedListId] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingChoiceId, setEditingChoiceId] = useState(null)
  const [showEditor, setShowEditor] = useState(false)

  const refreshClasses = useCallback(async () => {
    const result = await call('/ci-classes')
    setClasses(result)
    if (result.length) setClassId((current) => current || String(result[0].id))
  }, [])
  const refreshAttributes = useCallback(async (id = classId) => { if (id) setAttributes(await call(`/ci-classes/${id}/attributes`)); else setAttributes([]) }, [classId])
  const refreshRelationships = useCallback(async () => setRelationshipTypes(await call('/relationship-types')), [])
  const refreshLists = useCallback(async () => {
    const result = await call('/choice-lists')
    setChoiceLists(result)
    if (result.length) setSelectedListId((current) => current || String(result[0].id))
  }, [])
  const refreshSettings = useCallback(async () => setSettings(await call('/settings')), [])

  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    try { await Promise.all([refreshClasses(), refreshRelationships(), refreshLists(), refreshSettings()]) }
    catch (cause) { setError(cause.message) }
    finally { setLoading(false) }
  }, [refreshClasses, refreshRelationships, refreshLists, refreshSettings])
  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { refreshAttributes().catch((cause) => setError(cause.message)) }, [classId, refreshAttributes])
  useEffect(() => { setQuery(''); setShowEditor(false); setEditingId(null); setEditingChoiceId(null); setError(''); setNotice('') }, [tab])

  const selectedList = choiceLists.find((item) => String(item.id) === String(selectedListId))
  const search = (rows, fields) => rows.filter((row) => fields.some((field) => String(row[field] ?? '').toLowerCase().includes(query.toLowerCase())))
  const visibleClasses = useMemo(() => search(classes, ['name', 'code', 'parentClass']), [classes, query])
  const visibleAttributes = useMemo(() => search(attributes, ['label', 'name', 'dataType']), [attributes, query])
  const visibleRelationships = useMemo(() => search(relationshipTypes, ['name', 'reverseName', 'sourceClasses', 'targetClasses']), [relationshipTypes, query])

  function startNew(which) {
    setError(''); setNotice(''); setEditingId(null); setShowEditor(true)
    if (which === 'classes') setClassForm(emptyClass)
    if (which === 'attributes') setAttributeForm(emptyAttribute)
    if (which === 'relationships') setRelationshipForm(emptyRelationship)
    if (which === 'choices') { setListForm(emptyList); setChoiceForm(emptyChoice); setEditingChoiceId(null) }
  }
  function startEdit(which, item) {
    setError(''); setNotice(''); setEditingId(item.id); setShowEditor(true)
    if (which === 'classes') setClassForm({ ...emptyClass, ...item, parentClassId: item.parentClassId || '' })
    if (which === 'attributes') setAttributeForm({ ...emptyAttribute, ...item })
    if (which === 'relationships') setRelationshipForm({ ...emptyRelationship, ...item })
    if (which === 'choices') { setListForm({ ...emptyList, ...item }); setSelectedListId(String(item.id)) }
  }
  async function submit(event, path, payload, refresh, method = editingId ? 'PUT' : 'POST', id = editingId, updatePath = null) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await call(method === 'PUT' && id ? (updatePath || `${path}/${id}`) : path, json(method, payload))
      await refresh(); setNotice('CMDB configuration saved.'); setShowEditor(false); setEditingId(null)
    } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  async function toggleStatus(path, item, refresh) {
    setError(''); setNotice('')
    try { await call(`${path}/${item.id}/status`, json('PATCH', { active: !item.active })); await refresh(); setNotice('Status updated.') }
    catch (cause) { setError(cause.message) }
  }
  async function saveSettings(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try { setSettings(await call('/settings', json('PUT', Object.fromEntries(settings.map((setting) => [setting.settingKey, setting.settingValue]))))); setNotice('CMDB settings saved.') }
    catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  function settingInput(setting) {
    const value = setting.settingValue ?? ''
    if (setting.settingType === 'BOOLEAN') return <select value={value} onChange={(event) => setSettings((current) => current.map((item) => item.settingKey === setting.settingKey ? { ...item, settingValue: event.target.value } : item))}><option value="true">Enabled</option><option value="false">Disabled</option></select>
    return <input type={setting.settingType === 'NUMBER' ? 'number' : 'text'} value={value} onChange={(event) => setSettings((current) => current.map((item) => item.settingKey === setting.settingKey ? { ...item, settingValue: event.target.value } : item))} />
  }

  return <section className="configuration-items-page cmdb-admin-page" aria-labelledby="cmdb-admin-title">
    <header className="ci-page-heading"><div><p className="ci-page-eyebrow">CMDB · CONFIGURATION MANAGEMENT</p><h1 id="cmdb-admin-title">CMDB Administration</h1><p>Manage CI classes, attributes, relationships, choice lists, and CMDB-wide rules.</p></div><div className="ci-page-actions"><button type="button" onClick={loadAll}>↻ Refresh</button></div></header>
    <section className="cmdb-admin-workspace">
      <nav className="cmdb-admin-tabs" aria-label="CMDB administration sections">{tabs.map(([id, title, icon]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><i>{icon}</i>{title}</button>)}</nav>
      <div className="cmdb-admin-content">
        {error && <div className="cmdb-admin-alert" role="alert">{error}</div>}{notice && <div className="cmdb-admin-notice" role="status">{notice}</div>}

        {tab === 'classes' && <>
          <div className="cmdb-admin-heading"><div><h2>CI Classes</h2><p>Organize configuration items into a reusable class hierarchy.</p></div><button className="ci-primary-button" type="button" onClick={() => startNew('classes')}>＋ Create Class</button></div>
          {showEditor && <form className="cmdb-admin-editor" onSubmit={(event) => submit(event, '/ci-classes', { ...classForm, parentClassId: classForm.parentClassId || null }, refreshClasses)}><h3>{editingId ? 'Edit CI Class' : 'Create CI Class'}</h3><div className="cmdb-admin-form-grid"><Field label="Class name *"><input required maxLength="100" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></Field><Field label="Class code *"><input required maxLength="50" value={classForm.code} onChange={(e) => setClassForm({ ...classForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} /></Field><Field label="Parent class"><select value={classForm.parentClassId} onChange={(e) => setClassForm({ ...classForm, parentClassId: e.target.value })}><option value="">No parent</option>{classes.filter((item) => String(item.id) !== String(editingId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Icon"><input maxLength="100" value={classForm.icon} onChange={(e) => setClassForm({ ...classForm, icon: e.target.value })} placeholder="Optional icon name" /></Field><Field label="Description" wide><textarea rows="2" value={classForm.description || ''} onChange={(e) => setClassForm({ ...classForm, description: e.target.value })} /></Field><Toggle value={classForm.active} onChange={(value) => setClassForm({ ...classForm, active: value })} /></div><div className="cmdb-admin-editor-actions"><button type="button" onClick={() => setShowEditor(false)}>Cancel</button><button className="ci-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save Class'}</button></div></form>}
          <div className="cmdb-admin-toolbar"><label className="cmdb-admin-search"><span>⌕</span><input placeholder="Search classes…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span>{classes.length} classes configured</span></div>
          {loading ? <TableState loading /> : <div className="cmdb-admin-table-wrap"><table className="cmdb-admin-table"><thead><tr><th>Class Name</th><th>Code</th><th>Parent</th><th>Configuration Items</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleClasses.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.description || 'CI class'}</small></td><td><code>{item.code}</code></td><td>{item.parentClass || '—'}</td><td>{Number(item.ciCount || 0).toLocaleString()}</td><td><StatusBadge active={item.active} /></td><td><button className="cmdb-admin-link" onClick={() => startEdit('classes', item)}>Edit</button><button className="cmdb-admin-link" onClick={() => toggleStatus('/ci-classes', item, refreshClasses)}>{item.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}{!visibleClasses.length && <tr><td colSpan="6"><TableState empty="No CI classes match your search." /></td></tr>}</tbody></table></div>}
        </>}

        {tab === 'attributes' && <>
          <div className="cmdb-admin-heading"><div><h2>CI Attributes</h2><p>Configure class-specific fields for CI records.</p></div><button className="ci-primary-button" type="button" disabled={!classId} onClick={() => startNew('attributes')}>＋ Add Attribute</button></div>
          <div className="cmdb-admin-class-picker"><Field label="Select CI class"><select value={classId} onChange={(e) => { setClassId(e.target.value); setShowEditor(false) }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><span>{attributes.length} attributes</span></div>
          {showEditor && <form className="cmdb-admin-editor" onSubmit={(event) => submit(event, editingId ? `/ci-attributes/${editingId}` : `/ci-classes/${classId}/attributes`, { ...attributeForm, classId: Number(classId), choiceListId: attributeForm.choiceListId || null }, () => refreshAttributes(classId), editingId ? 'PUT' : 'POST', editingId, editingId ? `/ci-attributes/${editingId}` : null)}><h3>{editingId ? 'Edit Attribute' : 'Add Attribute'}</h3><div className="cmdb-admin-form-grid"><Field label="Attribute label *"><input required maxLength="150" value={attributeForm.label} onChange={(e) => setAttributeForm({ ...attributeForm, label: e.target.value })} /></Field><Field label="Attribute name *"><input required maxLength="100" value={attributeForm.name} onChange={(e) => setAttributeForm({ ...attributeForm, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="e.g. operatingSystem" /></Field><Field label="Data type *"><select value={attributeForm.dataType} onChange={(e) => setAttributeForm({ ...attributeForm, dataType: e.target.value })}>{dataTypes.map((type) => <option key={type} value={type}>{display(type)}</option>)}</select></Field>{['DROPDOWN', 'MULTI_SELECT'].includes(attributeForm.dataType) && <Field label="Choice list *"><select required value={attributeForm.choiceListId || ''} onChange={(e) => setAttributeForm({ ...attributeForm, choiceListId: e.target.value })}><option value="">Select choice list</option>{choiceLists.filter((list) => list.active).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></Field>}<Field label="Display order"><input type="number" value={attributeForm.displayOrder} onChange={(e) => setAttributeForm({ ...attributeForm, displayOrder: Number(e.target.value) })} /></Field><Field label="Help text" wide><textarea rows="2" value={attributeForm.helpText || ''} onChange={(e) => setAttributeForm({ ...attributeForm, helpText: e.target.value })} /></Field><Toggle value={attributeForm.required} label="Required" onChange={(value) => setAttributeForm({ ...attributeForm, required: value })} /><Toggle value={attributeForm.active} onChange={(value) => setAttributeForm({ ...attributeForm, active: value })} /></div><div className="cmdb-admin-editor-actions"><button type="button" onClick={() => setShowEditor(false)}>Cancel</button><button className="ci-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save Attribute'}</button></div></form>}
          <div className="cmdb-admin-toolbar"><label className="cmdb-admin-search"><span>⌕</span><input placeholder="Search attributes…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span>Fields available for this CI class</span></div>
          {loading ? <TableState loading /> : <div className="cmdb-admin-table-wrap"><table className="cmdb-admin-table"><thead><tr><th>Attribute</th><th>Data Type</th><th>Required</th><th>Display Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleAttributes.map((item) => <tr key={item.id}><td><strong>{item.label}</strong><small>{item.name}{item.helpText ? ` · ${item.helpText}` : ''}</small></td><td>{display(item.dataType)}</td><td>{item.required ? 'Yes' : 'No'}</td><td>{item.displayOrder}</td><td><StatusBadge active={item.active} /></td><td><button className="cmdb-admin-link" onClick={() => startEdit('attributes', item)}>Edit</button><button className="cmdb-admin-link" onClick={() => toggleStatus('/ci-attributes', item, () => refreshAttributes(classId))}>{item.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}{!visibleAttributes.length && <tr><td colSpan="6"><TableState loading={loading} empty="No attributes are configured for this class." /></td></tr>}</tbody></table></div>}
        </>}

        {tab === 'relationships' && <>
          <div className="cmdb-admin-heading"><div><h2>Relationship Types</h2><p>Define how source and target configuration items may relate.</p></div><button className="ci-primary-button" type="button" onClick={() => startNew('relationships')}>＋ Create Type</button></div>
          {showEditor && <form className="cmdb-admin-editor" onSubmit={(event) => submit(event, '/relationship-types', relationshipForm, refreshRelationships)}><h3>{editingId ? 'Edit Relationship Type' : 'Create Relationship Type'}</h3><div className="cmdb-admin-form-grid"><Field label="Relationship name *"><input required maxLength="80" value={relationshipForm.name} onChange={(e) => setRelationshipForm({ ...relationshipForm, name: e.target.value })} /></Field><Field label="Reverse name *"><input required maxLength="80" value={relationshipForm.reverseName} onChange={(e) => setRelationshipForm({ ...relationshipForm, reverseName: e.target.value })} /></Field><Field label="Source classes *"><input required value={relationshipForm.sourceClasses} onChange={(e) => setRelationshipForm({ ...relationshipForm, sourceClasses: e.target.value })} placeholder="Class names separated by commas, or *" /></Field><Field label="Target classes *"><input required value={relationshipForm.targetClasses} onChange={(e) => setRelationshipForm({ ...relationshipForm, targetClasses: e.target.value })} placeholder="Class names separated by commas, or *" /></Field><Field label="Description" wide><textarea rows="2" value={relationshipForm.description || ''} onChange={(e) => setRelationshipForm({ ...relationshipForm, description: e.target.value })} /></Field><Toggle value={relationshipForm.active} onChange={(value) => setRelationshipForm({ ...relationshipForm, active: value })} /></div><div className="cmdb-admin-editor-actions"><button type="button" onClick={() => setShowEditor(false)}>Cancel</button><button className="ci-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save Type'}</button></div></form>}
          <div className="cmdb-admin-toolbar"><label className="cmdb-admin-search"><span>⌕</span><input placeholder="Search relationship types…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span>{relationshipTypes.length} relationship types</span></div>
          {loading ? <TableState loading /> : <div className="cmdb-admin-table-wrap"><table className="cmdb-admin-table"><thead><tr><th>Relationship</th><th>Reverse Label</th><th>Source Classes</th><th>Target Classes</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleRelationships.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.description || 'CI relationship'}</small></td><td>{item.reverseName}</td><td>{item.sourceClasses}</td><td>{item.targetClasses}</td><td><StatusBadge active={item.active} /></td><td><button className="cmdb-admin-link" onClick={() => startEdit('relationships', item)}>Edit</button><button className="cmdb-admin-link" onClick={() => toggleStatus('/relationship-types', item, refreshRelationships)}>{item.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}{!visibleRelationships.length && <tr><td colSpan="6"><TableState empty="No relationship types match your search." /></td></tr>}</tbody></table></div>}
        </>}

        {tab === 'choices' && <>
          <div className="cmdb-admin-heading"><div><h2>Choice Lists</h2><p>Maintain shared dropdown values used by CMDB forms.</p></div><button className="ci-primary-button" type="button" onClick={() => startNew('choices')}>＋ Create List</button></div>
          {showEditor && <form className="cmdb-admin-editor" onSubmit={(event) => submit(event, '/choice-lists', listForm, refreshLists)}><h3>{editingId ? 'Edit Choice List' : 'Create Choice List'}</h3><div className="cmdb-admin-form-grid"><Field label="List name *"><input required maxLength="100" value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} /></Field><Field label="List code *"><input required maxLength="80" value={listForm.code} onChange={(e) => setListForm({ ...listForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} /></Field><Field label="Description" wide><textarea rows="2" value={listForm.description || ''} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} /></Field><Toggle value={listForm.active} onChange={(value) => setListForm({ ...listForm, active: value })} /></div><div className="cmdb-admin-editor-actions"><button type="button" onClick={() => setShowEditor(false)}>Cancel</button><button className="ci-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save List'}</button></div></form>}
          <div className="cmdb-admin-choice-layout"><div className="cmdb-admin-list-column"><div className="cmdb-admin-toolbar"><label className="cmdb-admin-search"><span>⌕</span><input placeholder="Search choice lists…" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div><div className="cmdb-admin-list-cards">{choiceLists.filter((item) => [item.name, item.code].some((value) => String(value).toLowerCase().includes(query.toLowerCase()))).map((item) => <button key={item.id} type="button" className={String(item.id) === String(selectedListId) ? 'is-selected' : ''} onClick={() => { setSelectedListId(String(item.id)); setShowEditor(false); setEditingChoiceId(null) }}><span><strong>{item.name}</strong><small>{item.code}</small></span><em>{item.choices?.length || 0} values</em></button>)}</div></div>
            <div className="cmdb-admin-values-column">{selectedList ? <><div className="cmdb-admin-heading"><div><h3>{selectedList.name}</h3><p>{selectedList.description || selectedList.code}</p></div><div><button className="cmdb-admin-link" onClick={() => startEdit('choices', selectedList)}>Edit List</button><button className="cmdb-admin-link" onClick={() => toggleStatus('/choice-lists', selectedList, refreshLists)}>{selectedList.active ? 'Deactivate' : 'Activate'}</button></div></div>
              <form className="cmdb-admin-choice-form" onSubmit={(event) => submit(event, editingChoiceId ? `/choices/${editingChoiceId}?listId=${selectedList.id}` : `/choice-lists/${selectedList.id}/values`, choiceForm, refreshLists, editingChoiceId ? 'PUT' : 'POST', editingChoiceId, editingChoiceId ? `/choices/${editingChoiceId}?listId=${selectedList.id}` : null)}><Field label="Value *"><input required maxLength="100" value={choiceForm.value} onChange={(e) => setChoiceForm({ ...choiceForm, value: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '_') })} /></Field><Field label="Label *"><input required maxLength="150" value={choiceForm.label} onChange={(e) => setChoiceForm({ ...choiceForm, label: e.target.value })} /></Field><Field label="Order"><input type="number" value={choiceForm.displayOrder} onChange={(e) => setChoiceForm({ ...choiceForm, displayOrder: Number(e.target.value) })} /></Field><button className="ci-primary-button" disabled={saving}>{editingChoiceId ? 'Update value' : '＋ Add value'}</button>{editingChoiceId && <button type="button" onClick={() => { setEditingChoiceId(null); setChoiceForm(emptyChoice) }}>Cancel</button>}</form>
              <div className="cmdb-admin-table-wrap"><table className="cmdb-admin-table"><thead><tr><th>Value</th><th>Label</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(selectedList.choices || []).map((choice) => <tr key={choice.id}><td><code>{choice.value}</code></td><td>{choice.label}</td><td>{choice.displayOrder}</td><td><StatusBadge active={choice.active} /></td><td><button className="cmdb-admin-link" onClick={() => { setEditingChoiceId(choice.id); setChoiceForm({ ...emptyChoice, ...choice }) }}>Edit</button><button className="cmdb-admin-link" onClick={() => toggleStatus('/choices', choice, refreshLists)}>{choice.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div></> : <TableState empty="Choose a list to manage its values." />}</div>
          </div>
        </>}

        {tab === 'settings' && <>
          <div className="cmdb-admin-heading"><div><h2>CMDB Settings</h2><p>Set global rules for CI identification, health, and lifecycle.</p></div></div>
          {loading ? <TableState loading /> : <form onSubmit={saveSettings} className="cmdb-admin-settings-form"><div className="cmdb-admin-settings-grid">{settings.map((setting) => <Field key={setting.settingKey} label={display(setting.settingKey)}><span className="cmdb-admin-setting-description">{setting.description}</span>{settingInput(setting)}</Field>)}</div><div className="cmdb-admin-editor-actions"><span>Settings are applied across CMDB workflows.</span><button className="ci-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button></div></form>}
        </>}
      </div>
    </section>
  </section>
}
