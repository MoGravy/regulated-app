import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase } from '../lib/supabase'
import { careCopy } from '../config/careCopy'
import { carePushCopy } from '../config/carePushCopy'
import CareAlerts from '../components/CareAlerts'
import CareConnect from '../components/CareConnect'
import { carePushRequest } from '../lib/carePush'

function SupportFrame({ children }) {
  const navigate = useNavigate()
  return <div className="page">
    <div className="status-bar">
      <button className="btn-ghost" onClick={() => navigate('/')}>Back</button>
      <a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a>
    </div>
    <main className="page-content-wide" style={{ paddingTop: 8, paddingBottom: 120 }}>
      <h1 style={{ margin: '0 0 20px', font: '300 32px/38px var(--font-display)' }}>{careCopy.pageTitle}</h1>
      {children}
    </main>
  </div>
}

function SupportSpace({ link, userId }) {
  const isPractitioner = userId === link.practitioner_id
  const otherName = isPractitioner ? link.client_label : link.practitioner_label
  const [section, setSection] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [entries, setEntries] = useState([])
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState({})
  const [messageText, setMessageText] = useState('')

  const loadTasks = useCallback(async () => {
    const { data: taskRows, error: taskError } = await supabase.from('care_tasks')
      .select('id,title,instructions,created_at')
      .eq('client_id', link.client_id).eq('practitioner_id', link.practitioner_id)
      .order('created_at', { ascending: false })
    if (taskError) throw taskError
    const ids = (taskRows || []).map(row => row.id)
    const result = ids.length
      ? await supabase.from('care_task_entries').select('id,task_id,entry_type,body,created_at')
          .in('task_id', ids).order('created_at')
      : { data: [], error: null }
    if (result.error) throw result.error
    setTasks(taskRows || [])
    setEntries(result.data || [])
  }, [link.client_id, link.practitioner_id])

  const loadMessages = useCallback(async () => {
    // ponytail: load the full thread for now; paginate when conversations grow.
    const { data, error: readError } = await supabase.from('care_messages')
      .select('id,sender_id,body,created_at')
      .eq('client_id', link.client_id).eq('practitioner_id', link.practitioner_id)
      .order('created_at')
    if (readError) throw readError
    setMessages(data || [])
  }, [link.client_id, link.practitioner_id])

  useEffect(() => {
    Promise.all([loadTasks(), loadMessages()])
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
    const poll = setInterval(() => {
      Promise.all([loadTasks(), loadMessages()])
        .then(() => { setStatus('ready'); setError(false) })
        .catch(() => setError(true))
      carePushRequest('dispatch').catch(() => {})
    }, 15000)
    return () => clearInterval(poll)
  }, [loadTasks, loadMessages])

  async function assignTask(event) {
    event.preventDefault()
    if (!taskTitle.trim() || saving) return
    setSaving(true)
    setError(false)
    try {
      const { error: writeError } = await supabase.from('care_tasks').insert({
        client_id: link.client_id, practitioner_id: link.practitioner_id,
        title: taskTitle.trim(), instructions: instructions.trim(),
      })
      if (writeError) throw writeError
      await carePushRequest('dispatch').catch(() => {})
      setTaskTitle('')
      setInstructions('')
      await loadTasks()
    } catch { setError(true) }
    finally { setSaving(false) }
  }

  async function addEntry(taskId, entryType) {
    if (saving || (entryType === 'note' && !notes[taskId]?.trim())) return
    setSaving(true)
    setError(false)
    try {
      const { error: writeError } = await supabase.from('care_task_entries').insert({
        task_id: taskId, entry_type: entryType,
        body: entryType === 'note' ? notes[taskId].trim() : '',
      })
      if (writeError) throw writeError
      setNotes(current => ({ ...current, [taskId]: '' }))
      await loadTasks()
    } catch { setError(true) }
    finally { setSaving(false) }
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!messageText.trim() || saving) return
    setSaving(true)
    setError(false)
    try {
      const { error: writeError } = await supabase.from('care_messages').insert({
        client_id: link.client_id, practitioner_id: link.practitioner_id,
        sender_id: userId, body: messageText.trim(),
      })
      if (writeError) throw writeError
      setMessageText('')
      await carePushRequest('dispatch').catch(() => {})
      await loadMessages()
    } catch { setError(true) }
    finally { setSaving(false) }
  }

  return <>
    <h2 style={{ font: '400 22px/28px var(--font-display)' }}>{otherName}</h2>
    <button className="btn-ghost" disabled={saving} onClick={() => {
      setError(false)
      Promise.all([loadTasks(), loadMessages()])
        .then(() => setStatus('ready')).catch(() => setError(true))
    }}>{carePushCopy.refresh}</button>
    <div role="tablist" aria-label={careCopy.pageTitle} className="segmented" style={{ margin: '18px 0' }}>
      {['tasks', 'messages'].map(value => <button key={value} className="segmented-item" role="tab"
        id={`care-${value}-tab`} aria-controls={`care-${value}-panel`}
        aria-selected={section === value} onClick={() => setSection(value)}>
        {value === 'tasks' ? careCopy.tasksTitle : careCopy.messagesTitle}
      </button>)}
    </div>
    {status === 'loading' && <p role="status">{careCopy.loading}</p>}
    {status === 'error' && <p role="alert">{careCopy.error}</p>}
    {error && <p role="alert">{careCopy.error}</p>}
    {status === 'ready' && section === 'tasks' && <div role="tabpanel" id="care-tasks-panel" aria-labelledby="care-tasks-tab">
      {isPractitioner && <form onSubmit={assignTask} className="card" style={{ marginBottom: 18 }}>
        <h3>{careCopy.assignTitle}</h3>
        <label htmlFor="care-task-title">{careCopy.taskTitleLabel}</label>
        <input id="care-task-title" value={taskTitle} onChange={event => setTaskTitle(event.target.value)}
          maxLength={160} required style={{ display: 'block', width: '100%', margin: '8px 0 16px' }} />
        <label htmlFor="care-task-instructions">{careCopy.taskInstructionsLabel}</label>
        <textarea id="care-task-instructions" value={instructions}
          onChange={event => setInstructions(event.target.value)} maxLength={4000}
          style={{ display: 'block', width: '100%', minHeight: 90, margin: '8px 0 16px' }} />
        <button className="btn-primary" type="submit" disabled={saving}>{careCopy.assignButton}</button>
      </form>}
      {tasks.length === 0 && <p>{careCopy.emptyTasks}</p>}
      {tasks.map(task => {
        const taskEntries = entries.filter(entry => entry.task_id === task.id)
        const complete = taskEntries.some(entry => entry.entry_type === 'complete')
        return <article key={task.id} className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{task.title}</h3>
          {task.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{task.instructions}</p>}
          {complete && <p role="status">{careCopy.completionLabel}</p>}
          {taskEntries.filter(entry => entry.entry_type === 'note').map(entry =>
            <p key={entry.id} style={{ whiteSpace: 'pre-wrap', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <small>{new Date(entry.created_at).toLocaleString()}</small><br />{entry.body}
            </p>)}
          {!isPractitioner && <>
            <label htmlFor={`note-${task.id}`}>{careCopy.noteLabel}</label>
            <textarea id={`note-${task.id}`} value={notes[task.id] || ''}
              onChange={event => setNotes(current => ({ ...current, [task.id]: event.target.value }))}
              maxLength={5000} style={{ display: 'block', width: '100%', minHeight: 80, margin: '8px 0' }} />
            <button className="btn-ghost" onClick={() => addEntry(task.id, 'note')} disabled={saving || !notes[task.id]?.trim()}>
              {careCopy.saveNote}
            </button>
            {!complete && <button className="btn-ghost" onClick={() => addEntry(task.id, 'complete')} disabled={saving}>
              {careCopy.completeTask}
            </button>}
          </>}
        </article>
      })}
    </div>}
    {status === 'ready' && section === 'messages' && <div role="tabpanel" id="care-messages-panel" aria-labelledby="care-messages-tab">
      <p style={{ fontSize: 14 }}>{careCopy.urgentNotice}</p>
      {messages.length === 0 && <p>{careCopy.emptyMessages}</p>}
      {messages.map(message => <div key={message.id} className="card"
        style={{ margin: '10px 0', maxWidth: '90%', marginLeft: message.sender_id === userId ? 'auto' : 0 }}>
        <small>{message.sender_id === userId ? 'You' : otherName} · {new Date(message.created_at).toLocaleString()}</small>
        <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{message.body}</p>
      </div>)}
      <form onSubmit={sendMessage} style={{ marginTop: 18 }}>
        <label htmlFor="care-message">{careCopy.messageLabel}</label>
        <textarea id="care-message" value={messageText} onChange={event => setMessageText(event.target.value)}
          maxLength={5000} required style={{ display: 'block', width: '100%', minHeight: 90, margin: '8px 0 14px' }} />
        <button className="btn-primary" type="submit" disabled={saving}>{careCopy.sendMessage}</button>
      </form>
    </div>}
  </>
}

export default function Care() {
  const navigate = useNavigate()
  const { authUser, authReady } = useApp()
  const [result, setResult] = useState({ status: 'loading', rows: [], userId: null })
  const [selectedPair, setSelectedPair] = useState(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (!authReady) return
    if (!authUser) {
      setResult({ status: 'sign_in', rows: [], userId: null })
      return
    }
    let active = true
    setResult({ status: 'loading', rows: [], userId: authUser.id })
    supabase.from('care_links').select('client_id,practitioner_id,client_label,practitioner_label')
      .order('created_at').then(({ data, error }) => {
        if (!active) return
        setResult(error
          ? { status: 'error', rows: [], userId: authUser.id }
          : { status: 'ready', rows: data || [], userId: authUser.id })
      }).catch(() => {
        if (active) setResult({ status: 'error', rows: [], userId: authUser.id })
      })
    return () => { active = false }
  }, [authReady, authUser?.id, reloadVersion])

  const status = !authReady ? 'loading' : !authUser ? 'sign_in'
    : result.userId === authUser.id ? result.status : 'loading'
  const pairKey = link => `${link.client_id}:${link.practitioner_id}`
  const selected = result.rows.find(link => pairKey(link) === selectedPair) || result.rows[0]

  return <SupportFrame>
    {status === 'loading' && <p role="status">{careCopy.loading}</p>}
    {status === 'sign_in' && <>
      <p>{careCopy.signInPrompt}</p>
      <button className="btn-primary btn-lg" onClick={() => navigate('/signin')}>Sign in</button>
    </>}
    {status === 'error' && <p role="alert">{careCopy.error}</p>}
    {status === 'ready' && <CareAlerts key={authUser.id} userId={authUser.id} />}
    {status === 'ready' && <CareConnect key={`connect-${authUser.id}`} userId={authUser.id}
      onConnected={() => setReloadVersion(value => value + 1)} />}
    {status === 'ready' && result.rows.length === 0 && <p>{carePushCopy.emptySpace}</p>}
    {status === 'ready' && result.rows.length > 1 && <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
      {result.rows.map(link => <button key={pairKey(link)} className="btn-ghost"
        aria-current={selected === link ? 'true' : undefined}
        onClick={() => setSelectedPair(pairKey(link))}>
        {authUser.id === link.practitioner_id ? link.client_label : link.practitioner_label}
      </button>)}
    </div>}
    {status === 'ready' && selected && <SupportSpace key={pairKey(selected)} link={selected} userId={authUser.id} />}
  </SupportFrame>
}
