export function courseLessonId(lessons, search) {
  const requested = new URLSearchParams(search).get('lesson')
  return lessons.find(lesson => lesson.id === requested)?.id || lessons[0]?.id || null
}

export function courseLessonSearch(search, lessonId) {
  const params = new URLSearchParams(search)
  params.set('lesson', lessonId)
  return params
}
