#!/usr/bin/env node
// Turns a private course manifest into SQL for review: node scripts/import-course.mjs course.json > import.sql
// Rows are created hidden and re-imports never change what is published.
// Keep real manifests outside this repository; it is public.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const SLUG = /^[a-z0-9-]+$/
const KINDS = ['audio', 'video', 'file']

// Stable ids keep lesson progress attached to the same lesson across re-imports.
export function stableId(name) {
  const h = createHash('sha1').update(`regulated-course:${name}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

function text(value, label, { max = 200, allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.includes('\0') || value.length > max ||
      (!allowEmpty && !value.trim())) {
    throw new Error(`${label} must be text of at most ${max} characters`)
  }
  return value
}

function unique(keys, label) {
  if (new Set(keys).size !== keys.length) throw new Error(`${label} keys must be unique`)
}

export function parseManifest(manifest) {
  const slug = manifest?.course?.slug
  if (!SLUG.test(slug || '')) throw new Error('course.slug must use a-z, 0-9 and dashes')
  const courseId = stableId(slug)
  if (!Array.isArray(manifest.lessons) || !manifest.lessons.length) throw new Error('lessons must be a non-empty list')
  unique(manifest.lessons.map(lesson => lesson?.key), 'Lesson')
  const lessons = manifest.lessons.map((lesson, index) => {
    const key = lesson?.key
    if (!SLUG.test(key || '')) throw new Error(`Lesson ${index + 1} key must use a-z, 0-9 and dashes`)
    const id = stableId(`${slug}/${key}`)
    const media = lesson.media || []
    if (!Array.isArray(media)) throw new Error(`Lesson ${key} media must be a list`)
    unique(media.map(item => item?.key), `Lesson ${key} media`)
    return {
      id, position: index + 1,
      section: text(lesson.section ?? '', `Lesson ${key} section`, { allowEmpty: true }),
      title: text(lesson.title, `Lesson ${key} title`),
      bodyText: text(lesson.body_text ?? '', `Lesson ${key} body_text`, { max: 100_000, allowEmpty: true }),
      media: media.map((item, mediaIndex) => {
        if (!SLUG.test(item?.key || '')) throw new Error(`Lesson ${key} media ${mediaIndex + 1} key must use a-z, 0-9 and dashes`)
        if (!KINDS.includes(item.kind)) throw new Error(`Lesson ${key} media ${item.key} kind must be audio, video or file`)
        const file = basename(text(item.file, `Lesson ${key} media ${item.key} file`))
        if (!/^[A-Za-z0-9._-]+$/.test(file)) throw new Error(`Lesson ${key} media ${item.key} file name must use letters, digits, dot, dash or underscore`)
        const mediaId = stableId(`${slug}/${key}/${item.key}`)
        return { id: mediaId, position: mediaIndex + 1, kind: item.kind,
          title: text(item.title, `Lesson ${key} media ${item.key} title`),
          storagePath: `${courseId}/${id}/${mediaId}/${file}` }
      }),
    }
  })
  return { id: courseId, slug, title: text(manifest.course.title, 'course.title'), lessons }
}

const q = value => `'${String(value).replaceAll("'", "''")}'`

export function buildImportSql(manifest) {
  const course = parseManifest(manifest)
  const lessons = course.lessons.map(l =>
    `  (${q(l.id)}, ${q(course.id)}, ${l.position}, ${q(l.section)}, ${q(l.title)}, ${q(l.bodyText)})`)
  const media = course.lessons.flatMap(l => l.media.map(m =>
    `  (${q(m.id)}, ${q(l.id)}, ${m.position}, ${q(m.kind)}, ${q(m.title)}, ${q(m.storagePath)})`))
  return [
    `-- Import of course ${course.slug}: ${course.lessons.length} lessons, ${media.length} media items. New rows stay hidden.`,
    'begin;',
    `do $$ begin
  if exists (select 1 from public.courses where slug = ${q(course.slug)} and id <> ${q(course.id)}) then
    raise exception 'A different course already uses slug ${course.slug}';
  end if;
end $$;`,
    `insert into public.courses (id, slug, title) values (${q(course.id)}, ${q(course.slug)}, ${q(course.title)})
on conflict (id) do update set title = excluded.title;`,
    `insert into public.course_lessons (id, course_id, position, section, title, body_text) values
${lessons.join(',\n')}
on conflict (id) do update set position = excluded.position, section = excluded.section,
  title = excluded.title, body_text = excluded.body_text;`,
    ...(media.length ? [`insert into public.course_media (id, lesson_id, position, kind, title, storage_path) values
${media.join(',\n')}
on conflict (id) do update set position = excluded.position, kind = excluded.kind,
  title = excluded.title, storage_path = excluded.storage_path;`] : []),
    'commit;',
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [path] = process.argv.slice(2)
    if (!path) throw new Error('Usage: node scripts/import-course.mjs course.json > import.sql')
    process.stdout.write(buildImportSql(JSON.parse(readFileSync(path, 'utf8'))))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
