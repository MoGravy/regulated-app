import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { authHeaders, supabase } from '../lib/supabase'
import { courseCopy } from '../config/courseCopy'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function CourseFrame({ title, backTo, children }) {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="status-bar">
        <button className="btn-ghost" onClick={() => navigate(backTo)}>Back</button>
        <a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a>
      </div>
      <main className="page-content-wide" style={{ paddingTop: 8, paddingBottom: 120 }}>
        <h1 style={{ margin: '0 0 20px', font: '300 32px/38px var(--font-display)' }}>{title}</h1>
        {children}
      </main>
    </div>
  )
}

function SignInPrompt() {
  const navigate = useNavigate()
  return <>
    <p>{courseCopy.signInPrompt}</p>
    <button className="btn-primary btn-lg" onClick={() => navigate('/signin')}>Sign in</button>
  </>
}

export default function Courses() {
  const navigate = useNavigate()
  const { authUser, authReady } = useApp()
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
  }, [authReady, authUser?.id])

  const status = !authReady ? 'loading' : !authUser ? 'sign_in'
    : result.userId === authUser.id ? result.status : 'loading'

  return <CourseFrame title={courseCopy.pageTitle} backTo="/">
    {status === 'loading' && <p role="status">{courseCopy.loading}</p>}
    {status === 'sign_in' && <SignInPrompt />}
    {status === 'error' && <p role="alert">{courseCopy.error}</p>}
    {status === 'ready' && result.rows.length === 0 && <p>{courseCopy.emptyCourses}</p>}
    {status === 'ready' && result.rows.map(course => (
      <button key={course.id} className="card" onClick={() => navigate(`/courses/${course.id}`)}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 10 }}>
        <span style={{ font: '400 21px/28px var(--font-display)' }}>{course.title}</span>
      </button>
    ))}
    <div className="divider" />
    <p>{courseCopy.catalogNote}</p>
    <a className="btn-ghost" href="https://www.matthewtweediehypnosis.com.au/hypnosis-audio/"
      target="_blank" rel="noopener noreferrer">{courseCopy.browseCatalog}</a>
  </CourseFrame>
}

export function Course() {
  const { courseId } = useParams()
  const { authUser, authReady } = useApp()
  const [result, setResult] = useState({ status: 'loading', course: null, lessons: [], done: [], userId: null })
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [playback, setPlayback] = useState(null)
  const [download, setDownload] = useState(null)
  const mediaRequest = useRef(0)
  const downloadRequest = useRef(0)
  const articleRef = useRef(null)

  useEffect(() => {
    mediaRequest.current += 1
    downloadRequest.current += 1
    setPlayback(null)
    setDownload(null)
    return () => {
      mediaRequest.current += 1
      downloadRequest.current += 1
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
    setSelectedId(null)
    Promise.all([
      supabase.from('courses').select('id,title').eq('id', courseId).maybeSingle(),
      supabase.from('course_lessons').select('id,section,title,body_text,position').eq('course_id', courseId).order('position'),
      supabase.from('course_progress').select('lesson_id').eq('user_id', authUser.id),
    ]).then(async ([course, lessons, progress]) => {
      if (!active) return
      if (course.error || lessons.error || progress.error) {
        setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
      } else if (!course.data) {
        setResult({ status: 'unavailable', course: null, lessons: [], done: [], userId: authUser.id })
      } else {
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
            done: (progress.data || []).map(row => row.lesson_id), userId: authUser.id })
          setSelectedId(lessonRows[0]?.id || null)
        }
      }
    }).catch(() => {
      if (active) setResult({ status: 'error', course: null, lessons: [], done: [], userId: authUser.id })
    })
    return () => { active = false }
  }, [authReady, authUser?.id, courseId])

  const selected = result.lessons.find(lesson => lesson.id === selectedId)
  const completed = selected && result.done.includes(selected.id)
  const selectedMedia = (result.media || []).filter(media => media.lesson_id === selectedId)
  const activePlayback = playback?.userId === authUser?.id ? playback : null

  const activeDownload = download?.userId === authUser?.id ? download : null

  async function openMedia(media, save = false) {
    const requestRef = save ? downloadRequest : mediaRequest
    const request = ++requestRef.current
    const setStatus = save ? setDownload : setPlayback
    setStatus({ mediaId: media.id, userId: authUser.id, status: 'loading' })
    try {
      const headers = await authHeaders()
      if (!headers.Authorization) throw new Error('Sign in required')
      const response = await fetch('/api/get-course-media-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mediaId: media.id, ...(save ? { download: true } : {}) }),
      })
      if (!response.ok) throw new Error(`Media request failed: ${response.status}`)
      const { url } = await response.json()
      if (!url) throw new Error('Media URL missing')
      if (request !== requestRef.current) return
      setStatus({ mediaId: media.id, userId: authUser.id, status: 'ready', url })
      if (save || media.kind === 'file') window.location.assign(url)
    } catch {
      if (request === requestRef.current) {
        setStatus({ mediaId: media.id, userId: authUser.id, status: 'error' })
      }
    }
  }

  async function completeLesson() {
    if (!authUser || !selected || saving || completed) return
    setSaving(true)
    setSaveError(false)
    try {
      const { error } = await supabase.from('course_progress').insert({ user_id: authUser.id, lesson_id: selected.id })
      if (error && error.code !== '23505') setSaveError(true)
      else setResult(current => ({ ...current, done: [...current.done, selected.id] }))
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const status = !authReady ? 'loading' : !authUser ? 'sign_in'
    : result.userId === authUser.id ? result.status : 'loading'

  return <CourseFrame title={status === 'ready' ? result.course.title : courseCopy.pageTitle} backTo="/courses">
    {status === 'loading' && <p role="status">{courseCopy.loading}</p>}
    {status === 'sign_in' && <SignInPrompt />}
    {status === 'error' && <p role="alert">{courseCopy.error}</p>}
    {status === 'unavailable' && <p>{courseCopy.courseUnavailable}</p>}
    {status === 'ready' && <>
      <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        {result.lessons.map((lesson, index) => <Fragment key={lesson.id}>
          {lesson.section && lesson.section !== result.lessons[index - 1]?.section &&
            <h2 className="t-section" style={{ margin: index ? '16px 0 0' : 0 }}>{lesson.section}</h2>}
          <button className="card" onClick={() => {
            mediaRequest.current += 1
            downloadRequest.current += 1
            setPlayback(null)
            setDownload(null)
            setSelectedId(lesson.id)
            setSaveError(false)
            requestAnimationFrame(() => articleRef.current?.scrollIntoView({ block: 'start' }))
          }}
            aria-current={lesson.id === selectedId ? 'true' : undefined}
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
            {lesson.title}
          </button>
        </Fragment>)}
      </div>
      {selected && <article ref={articleRef}>
        <h2 style={{ font: '400 24px/30px var(--font-display)' }}>{selected.title}</h2>
        {selected.body_text && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selected.body_text}</p>}
        {selectedMedia.map(media => <div key={media.id} style={{ margin: '18px 0' }}>
          <button className="btn-ghost" onClick={() => openMedia(media)}>
            {media.kind === 'audio' ? courseCopy.playAudio
              : media.kind === 'video' ? courseCopy.playVideo : courseCopy.downloadFile}: {media.title}
          </button>
          {media.kind === 'audio' && <button className="btn-ghost" onClick={() => openMedia(media, true)}
            disabled={activeDownload?.mediaId === media.id && activeDownload.status === 'loading'}>
            {courseCopy.downloadFile}: {media.title}
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
            <audio controls preload="none" src={activePlayback.url} aria-label={media.title} style={{ width: '100%' }} />}
          {activePlayback?.mediaId === media.id && activePlayback.status === 'ready' && media.kind === 'video' &&
            <video controls playsInline preload="metadata" src={activePlayback.url}
              aria-label={media.title} style={{ width: '100%', maxWidth: 720 }} />}
        </div>)}
        {completed
          ? <p role="status">{courseCopy.lessonCompleted}</p>
          : <button className="btn-primary btn-lg" onClick={completeLesson} disabled={saving}>
              {courseCopy.markComplete}
            </button>}
        {saveError && <p role="alert">{courseCopy.error}</p>}
      </article>}
    </>}
  </CourseFrame>
}
