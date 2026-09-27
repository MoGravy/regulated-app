import { readFile } from 'node:fs/promises'
import { unreviewedSessionIds } from '../src/content/reviewedCopy.js'

if (!process.argv[2]) throw new Error('Provide a local session catalogue JSON path')
const rows = JSON.parse(await readFile(process.argv[2], 'utf8'))
if (!Array.isArray(rows)) throw new Error('Expected a session array')
const ids = unreviewedSessionIds(rows)
console.log(JSON.stringify({ unreviewedSessionIds: ids }, null, 2))
process.exitCode = ids.length ? 1 : 0
