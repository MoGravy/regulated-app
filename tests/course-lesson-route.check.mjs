import assert from 'node:assert/strict'
import { courseLessonId, courseLessonSearch } from '../src/lib/courseLessonRoute.js'

const lessons = [{ id: 'lesson-a' }, { id: 'lesson-b' }]
assert.equal(courseLessonId(lessons, '?lesson=lesson-b'), 'lesson-b')
assert.equal(courseLessonId(lessons, ''), 'lesson-a')
assert.equal(courseLessonId(lessons, '?lesson=other-course-lesson'), 'lesson-a')
assert.equal(courseLessonId([], '?lesson=lesson-b'), null)
assert.equal(courseLessonId([{ id: 'replacement' }], '?lesson=lesson-b'), 'replacement')
const original = new URLSearchParams('look=night&lesson=lesson-a')
const next = courseLessonSearch(original, 'lesson-b')
assert.equal(next.get('look'), 'night')
assert.equal(next.get('lesson'), 'lesson-b')
assert.equal(original.get('lesson'), 'lesson-a')
assert.equal(courseLessonId(lessons, original), 'lesson-a')
assert.equal(courseLessonId(lessons, next), 'lesson-b')
assert.equal(courseLessonId(lessons, '?lesson=lesson%2Db'), 'lesson-b')
console.log('PASS: exact available lesson routing, fallback, history inputs and retained theme query')
