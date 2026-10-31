import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { authHeaders, supabase } from '../lib/supabase'
import { apiUrl } from '../lib/apiUrl'
import { courseCopy, dapGuide, dapGuideSteps } from '../config/courseCopy'
import { carePushCopy } from '../config/carePushCopy'
import { courseLessonId, courseLessonSearch } from '../lib/courseLessonRoute'
import { dapPurchaseCopy } from '../config/dapPurchaseCopy'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getMediaUrl(mediaId, download = false) {
  const headers = await authHeaders()
  if (!headers.Authorization) throw new Error('Sign in required')
  const data = { mediaId, ...(download ? { download: true } : {}) }
  const native = Capacitor.isNativePlatform()
  const url = apiUrl('/api/get-course-media-url')
  const response = native
    ? await CapacitorHttp.post({ url, headers: { 'Content-Type': 'application/json', ...headers },
      data, responseType: 'json', disableRedirects: true, connectTimeout: 15000, readTimeout: 15000 })
    : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data) })
  if (response.status < 200 || response.status >= 300) throw new Error(`Media request failed: ${response.status}`)
  const result = native ? response.data : await response.json()
  if (typeof result?.url !== 'string' || !result.url) throw new Error('Media URL missing')
  return result
}

export function CourseFrame({ title, backTo, children }) {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="status-bar">
        <button className="btn-ghost" onClick={() => navigate(backTo)}>Back</button>
        <a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a>
      </div>
      <main className="page-content-wide course-content" style={{ paddingTop: 8, paddingBottom: 120 }}>
        <h1 style={{ margin: '0 0 20px', font: '300 32px/38px var(--font-display)' }}>{title}</h1>
        {children}
      </main>
    </div>
  )
}

function SignInPrompt() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return <>
    <p>{courseCopy.signInPrompt}</p>
    <button className="btn-primary btn-lg" onClick={() => navigate(`/signin?next=${encodeURIComponent(pathname)}`)}>Sign in</button>
  </>
}

function LessonText({ text }) {
  if (!/(^|\n)## /.test(text)) return <p className="course-legacy-copy">{text}</p>
  const blocks = text.trim().split(/\n\s*\n/)
  return <div className="course-lesson-copy">{blocks.map((block, index) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length === 1 && lines[0].startsWith('## ')) {
      return <h3 key={index}>{lines[0].slice(3)}</h3>
    }
    if (lines.every(line => line.startsWith('- '))) {
      return <ul key={index}>{lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>
    }
    return <p key={index}>{lines.map((line, item) => <Fragment key={item}>
      {item > 0 && <br />}
      {/^https?:\/\/\S+$/.test(line)
        ? <a href={line} target="_blank" rel="noopener noreferrer">{line}</a>
        : line}
    </Fragment>)}</p>
  })}</div>
}

export default function Courses() {
  const navigate = useNavigate()
  const { authUser, authReady } = useApp()
  const [reloadVersion, setReloadVersion] = useState(0)
  const [result, setResult] = useState({ status: 'loading', rows: [], userId: null })

  useEffect(() => {
    if (!authReady) return
    if (!authUser) {
      setResult({ status: 'sign_in', rows: [], userId: null })
      return
    }
    let active = true
    setResult({ status: 'loading', rows: [], userId: authUser.id })
    supabase.from('courses').select('id,title').order('title')
      .then(({ data, error }) => {
        if (!active) return
        setResult(error
          ? { status: 'error', rows: [], userId: authUser.id }
          : { status: 'ready', rows: data || [], userId: authUser.id })
      })
      .catch(() => { if (active) setResult({ status: 'error', rows: [], userId: authUser.id }) })
    return () => { active = false }
  }, [authReady, authUser?.id, reloadVersion])

  const status = !authReady ? 'loading' : !authUser ? 'sign_in'
    : result.userId === authUser.id ? result.status : 'loading'
  const native = !!window.Capacitor?.isNativePlatform?.()

  return <CourseFrame title={courseCopy.pageTitle} backTo="/">
    {!native && authReady && (!authUser || (status === 'ready' && !result.rows.some(course => course.id === '0a02caf8-5050-571c-9a70-e2bcda2253a3'))) && (
      <Link className="card" to="/dap" aria-label={dapPurchaseCopy.title}
        style={{ display: 'block', color: 'var(--ink)', textDecoration: 'none', marginBottom: 20 }}>
        <span style={{ display: 'block', font: '400 21px/28px var(--font-display)' }}>{dapPurchaseCopy.title}</span>
        <span style={{ display: 'block', marginTop: 8, color: 'var(--ink-muted)' }}>{dapPurchaseCopy.price}</span>
      </Link>
    )}
    {status === 'loading' && <p role="status">{courseCopy.loading}</p>}
    {status === 'sign_in' && <SignInPrompt />}
    {status === 'error' && <>
      <p role="alert">{courseCopy.error}</p>
      <button className="btn-primary" onClick={() => setReloadVersion(value => value + 1)}>{carePushCopy.refresh}</button>
    </>}
    {status === 'ready' && result.rows.length === 0 && <p>{courseCopy.emptyCourses}</p>}
    {status === 'ready' && result.rows.map(course => (
      <button key={course.id} className="card" onClick={() => navigate(`/courses/${course.id}`)}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 10 }}>
        <span style={{ font: '400 21px/28px var(--font-display)' }}>{course.title}</span>
      </button>
    ))}
    {/* Store builds never point to purchases outside Play or the App Store. */}
    {!native && <>
      <div className="divider" />
      <p>{courseCopy.catalogNote}</p>
      <a className="btn-ghost" href="https://www.matthewtweediehypnosis.com.au/hypnosis-audio/"
        target="_blank" rel="noopener noreferrer">{courseCopy.browseCatalog}</a>
    </>}
  </CourseFrame>
}

export function Course() {
  const android = Capacitor.getPlatform() === 'android'
  const { courseId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { authUser, authReady } = useApp()
  const [reloadVersion, setReloadVersion] = useState(0)
  const [result, setResult] = useState({ status: 'loading', course: null, lessons: [], done: [], userId: null })
  const [saveState, setSaveState] = useState({})
  const [playback, setPlayback] = useState(null)
  const [download, setDownload] = useState(null)
  const [filePreviews, setFilePreviews] = useState({})
  const mediaRequest = useRef(0)
  const downloadRequest = useRef(0)
  const articleRef = useRef(null)
  const progressRequests = useRef(new Map())
  const accountScope = useRef('')
  accountScope.current = `${authUser?.id || ''}:${courseId}`

  useEffect(() => {
    mediaRequest.current += 1
    downloadRequest.current += 1
    setPlayback(null)
    setDownload(null)
    progressRequests.current.clear()
    setSaveState({})
    return () => {
      mediaRequest.current += 1
      downloadRequest.current += 1
      progressRequests.current.clear()
    }
  }, [authUser?.id, courseId])

  useEffect(() => {
    if (!authReady) return
    if (!authUser) {
      setResult({ status: 'sign_in', course: null, lessons: [], done: [], userId: null })
      return
    }
    if (!UUID.test(courseId)) {
      setResult({ status: 'unavailable', course: null, lessons: [], done: [], userId: authUser.id })
      return
    }
    let active = true
    setResult({ status: 'loading', course: null, lessons: [], done: [], userId: authUser.id })
    Promise.all([
      supabase.from('courses').select('id,title').eq('id', courseId).maybeSingle(),
      supabase.from('course_lessons').select('id,section,title,body_text,position').eq('course_id', courseId).order('position'),
      supabase.from('course_progress').select('lesson_id').eq('user_id', authUser.id),
      supabase.from('course_grants').select('source').eq('user_id', authUser.id)
        .eq('course_id', courseId).is('revoked_at', null).maybeSingle(),
    ]).then(async ([course, lessons, progress, grant]) => {
      if (!active) return
      if (course.error || lessons.error || progress.error || grant.error) {
        setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
      } else if (!course.data) {
        setResult({ status: 'unavailable', course: null, lessons: [], done: [], userId: authUser.id })
      } else {
        let grantSource = grant.data?.source
        if (courseId === '0a02caf8-5050-571c-9a70-e2bcda2253a3' && grantSource !== 'purchase') {
          const play = await supabase.from('play_course_reasons').select('status')
            .eq('user_id', authUser.id).eq('course_id', courseId).eq('status', 'owned').limit(1)
          if (!active) return
          const schemaNotReady = grant.data && ['42P01', 'PGRST205'].includes(play.error?.code)
          if (play.error && !schemaNotReady) {
            setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
            return
          }
          if (play.data?.length) grantSource = 'purchase'
        }
        const lessonRows = lessons.data || []
        const media = lessonRows.length
          ? await supabase.from('course_media').select('id,lesson_id,kind,title,position')
              .in('lesson_id', lessonRows.map(row => row.id)).order('position')
          : { data: [], error: null }
        if (!active) return
        if (media.error) {
          setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
        } else {
          setResult({ status: 'ready', course: course.data, lessons: lessonRows, media: media.data || [],
            done: (progress.data || []).map(row => row.lesson_id), userId: authUser.id,
            grantSource })
        }
      }
    }).catch(() => {
      if (active) setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
    })
    return () => { active = false }
  }, [authReady, authUser?.id, courseId, reloadVersion])

  const selectedId = courseLessonId(result.lessons, searchParams)
  const selected = result.lessons.find(lesson => lesson.id === selectedId)
  const completed = selected && result.done.includes(selected.id)
  const saving = saveState[selectedId] === 'saving'
  const saveError = saveState[selectedId] === 'error'
  const selectedMedia = (result.media || []).filter(media => media.lesson_id === selectedId)
  const activePlayback = playback?.userId === authUser?.id ? playback : null

  const activeDownload = download?.userId === authUser?.id ? download : null

  useEffect(() => {
    mediaRequest.current += 1
    downloadRequest.current += 1
    setPlayback(null)
    setDownload(null)
  }, [selectedId])

  useEffect(() => {
    const files = android ? [] : (result.media || []).filter(media => media.lesson_id === selectedId && media.kind === 'file')
    setFilePreviews(Object.fromEntries(files.map(media => [media.id, { status: 'loading' }])))
    if (!authUser || !files.length) return
    let active = true
    Promise.all(files.map(async media => {
      try {
        return [media.id, { status: 'ready', ...await getMediaUrl(media.id) }]
      } catch {
        return [media.id, { status: 'error' }]
      }
    })).then(rows => { if (active) setFilePreviews(Object.fromEntries(rows)) })
    return () => { active = false }
  }, [authUser?.id, selectedId, result.media, android])

  async function openMedia(media, save = false) {
    const requestRef = save ? downloadRequest : mediaRequest
    const request = ++requestRef.current
    const scope = accountScope.current
    const setStatus = save ? setDownload : setPlayback
    setStatus({ mediaId: media.id, userId: authUser.id, status: 'loading' })
    try {
      const { url } = await getMediaUrl(media.id, save)
      if (request !== requestRef.current || scope !== accountScope.current) return
      setStatus({ mediaId: media.id, userId: authUser.id, status: 'ready', url })
      if (save) window.location.assign(url)
    } catch {
      if (request === requestRef.current && scope === accountScope.current) {
        setStatus({ mediaId: media.id, userId: authUser.id, status: 'error' })
      }
    }
  }

  async function completeLesson() {
    if (!authUser || !selected || progressRequests.current.has(selected.id) || completed) return
    const request = {}
    const scope = accountScope.current
    const userId = authUser.id
    const lessonId = selected.id
    progressRequests.current.set(lessonId, request)
    const current = () => progressRequests.current.get(lessonId) === request && scope === accountScope.current
    const status = value => setSaveState(previous => ({ ...previous, [lessonId]: value }))
    status('saving')
    try {
      const { error } = await supabase.from('course_progress').insert({ user_id: userId, lesson_id: lessonId })
      if (!current()) return
      if (error && error.code !== '23505') status('error')
      else {
        status(null)
        setResult(value => value.userId === userId && value.course?.id === courseId
          ? { ...value, done: [...new Set([...value.done, lessonId])] } : value)
      }
    } catch {
      if (current()) status('error')
    } finally {
      if (current()) progressRequests.current.delete(lessonId)
    }
  }

  const status = !authReady ? 'loading' : !authUser ? 'sign_in'
    : result.userId === authUser.id ? result.status : 'loading'

  return <CourseFrame title={status === 'ready' ? result.course.title : courseCopy.pageTitle} backTo="/courses">
    {status === 'loading' && <p role="status">{courseCopy.loading}</p>}
    {status === 'sign_in' && <SignInPrompt />}
    {status === 'error' && <>
      <p role="alert">{courseCopy.error}</p>
      <button className="btn-primary" onClick={() => setReloadVersion(value => value + 1)}>{carePushCopy.refresh}</button>
    </>}
    {status === 'unavailable' && <p>{courseCopy.courseUnavailable}</p>}
    {status === 'ready' && <>
      {selected && <article ref={articleRef} className="course-active-lesson" tabIndex={-1} aria-labelledby="course-lesson-title">
        <h2 id="course-lesson-title" style={{ font: '400 24px/30px var(--font-display)' }}>{selected.title}</h2>
        {selected.id === dapGuide.lessonId
          ? <div className="course-guide">
              <p>{dapGuide.intro}</p>
              <ol>{dapGuideSteps(result.grantSource).map(step => <li key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>)}</ol>
            </div>
          : selected.body_text && <LessonText text={selected.body_text} />}
        {selectedMedia.map(media => <div key={media.id} className="course-media-item">
          {media.title !== selected.title && <p className="course-media-title">{media.title}</p>}
          {media.kind === 'file' && !android && filePreviews[media.id]?.isPdf &&
            <iframe className="course-pdf" src={filePreviews[media.id].url} title={media.title} />}
          {media.kind === 'file' && filePreviews[media.id]?.status === 'loading' &&
            <p role="status">{courseCopy.mediaLoading}</p>}
          {media.kind === 'file' && filePreviews[media.id]?.status === 'error' &&
            <p role="alert">{courseCopy.mediaError}</p>}
          <button className="btn-primary btn-lg" onClick={() => openMedia(media, media.kind === 'file')}
            aria-label={`${media.kind === 'audio' ? courseCopy.playAudio
              : media.kind === 'video' ? courseCopy.playVideo : courseCopy.downloadFile}: ${media.title}`}>
            <span aria-hidden="true">{media.kind === 'video' ? '▶' : media.kind === 'audio' ? '♫' : '↓'}</span>
            {media.kind === 'audio' ? courseCopy.playAudio
              : media.kind === 'video' ? courseCopy.playVideo : courseCopy.downloadFile}
          </button>
          {media.kind === 'audio' && <button className="btn-ghost" onClick={() => openMedia(media, true)}
            aria-label={`${courseCopy.downloadFile}: ${media.title}`}
            disabled={activeDownload?.mediaId === media.id && activeDownload.status === 'loading'}>
            {courseCopy.downloadFile}
          </button>}
          {activeDownload?.mediaId === media.id && activeDownload.status === 'loading' &&
            <p role="status">{courseCopy.mediaLoading}</p>}
          {activeDownload?.mediaId === media.id && activeDownload.status === 'error' &&
            <p role="alert">{courseCopy.mediaError}</p>}
          {activePlayback?.mediaId === media.id && activePlayback.status === 'loading' &&
            <p role="status">{courseCopy.mediaLoading}</p>}
          {activePlayback?.mediaId === media.id && activePlayback.status === 'error' &&
            <p role="alert">{courseCopy.mediaError}</p>}
          {activePlayback?.mediaId === media.id && activePlayback.status === 'ready' && media.kind === 'audio' &&
            <audio controls preload="none" src={activePlayback.url} aria-label={media.title} style={{ width: '100%' }}
              onError={() => setPlayback(current => current === activePlayback ? { ...current, status: 'error' } : current)} />}
          {activePlayback?.mediaId === media.id && activePlayback.status === 'ready' && media.kind === 'video' &&
            <video controls playsInline preload="metadata" src={activePlayback.url}
              aria-label={media.title} style={{ width: '100%', maxWidth: 720 }}
              onError={() => setPlayback(current => current === activePlayback ? { ...current, status: 'error' } : current)} />}
        </div>)}
        {completed
          ? <p role="status">{courseCopy.lessonCompleted}</p>
          : <button className={`btn-primary btn-lg${selectedMedia.length ? ' course-complete-action' : ''}`}
              onClick={completeLesson} disabled={saving}>
              {courseCopy.markComplete}
            </button>}
        {saveError && <p role="alert">{courseCopy.error}</p>}
      </article>}
      <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        {result.lessons.map((lesson, index) => <Fragment key={lesson.id}>
          {lesson.section && lesson.section !== result.lessons[index - 1]?.section &&
            <h2 className="t-section" style={{ margin: index ? '16px 0 0' : 0 }}>{lesson.section}</h2>}
          <button className="card course-lesson-link" onClick={() => {
            setSearchParams(courseLessonSearch(searchParams, lesson.id))
            requestAnimationFrame(() => {
              articleRef.current?.focus({ preventScroll: true })
              articleRef.current?.scrollIntoView({ block: 'start' })
            })
          }}
            aria-current={lesson.id === selectedId ? 'step' : undefined}
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
            {lesson.title}
          </button>
        </Fragment>)}
      </div>
    </>}
  </CourseFrame>
}
