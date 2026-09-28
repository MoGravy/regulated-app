import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_SECONDS = 3600

export async function handleCourseMediaRequest(req, res, client) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const mediaId = req.body?.mediaId
  const download = req.body?.download
  if (download !== undefined && typeof download !== 'boolean') {
    return res.status(400).json({ error: 'Invalid download option' })
  }
  if (typeof mediaId !== 'string' || !UUID.test(mediaId)) {
    return res.status(400).json({ error: 'Invalid media ID' })
  }

  const authorization = req.headers?.authorization || ''
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) {
    return res.status(401).json({ error: 'Sign in required' })
  }

  try {
    const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7))
    if (authError || !auth?.user?.id) return res.status(401).json({ error: 'Sign in required' })

    const { data: media, error: mediaError } = await client.from('course_media')
      .select('id,lesson_id,kind,storage_path,published').eq('id', mediaId).maybeSingle()
    if (mediaError) throw mediaError
    if (!media?.published) return res.status(404).json({ error: 'Media unavailable' })

    const { data: lesson, error: lessonError } = await client.from('course_lessons')
      .select('id,course_id,published').eq('id', media.lesson_id).maybeSingle()
    if (lessonError) throw lessonError
    if (!lesson?.published) return res.status(404).json({ error: 'Media unavailable' })

    const { data: course, error: courseError } = await client.from('courses')
      .select('id,published').eq('id', lesson.course_id).maybeSingle()
    if (courseError) throw courseError
    if (!course?.published) return res.status(404).json({ error: 'Media unavailable' })

    const { data: grants, error: grantError } = await client.from('course_grants')
      .select('course_id').eq('course_id', course.id).eq('user_id', auth.user.id)
      .is('revoked_at', null).limit(1)
    if (grantError) throw grantError
    if (!grants?.length) return res.status(404).json({ error: 'Media unavailable' })

    // A bad import must never sign an object belonging to a different lesson.
    const prefix = `${course.id}/${lesson.id}/${media.id}/`
    if (typeof media.storage_path !== 'string' ||
        !media.storage_path.startsWith(prefix) ||
        media.storage_path.includes('..') ||
        /[?#\\]/.test(media.storage_path)) {
      return res.status(500).json({ error: 'Media is misconfigured' })
    }

    const { data: signed, error: signError } = await client.storage
      .from('course-media').createSignedUrl(media.storage_path, TTL_SECONDS,
        media.kind === 'file' || (media.kind === 'audio' && download) ? { download: true } : undefined)
    if (signError || !signed?.signedUrl) throw signError || new Error('No signed URL')

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ url: signed.signedUrl })
  } catch (error) {
    console.error('[get-course-media-url] request failed:', error?.message || 'unknown error')
    return res.status(500).json({ error: 'Media could not be loaded' })
  }
}

export default function handler(req, res) {
  return handleCourseMediaRequest(req, res, supabase)
}
