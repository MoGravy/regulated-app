import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { schemaInspectionSql } from './deletion-preflight.mjs'

export const migrationPath = new URL('../migrations/021_deletion_progress_rpc.sql', import.meta.url)
export function progressRpcMigration() {
  const controls = JSON.parse(readFileSync(new URL('./deletion-progress-schema.json', import.meta.url))).objects
  return readFileSync(new URL('./deletion-progress-rpc.sql', import.meta.url), 'utf8')
    .replace('/* TRUSTED_CONTROLS_JSON */', JSON.stringify(controls))
    .replace('/* SCHEMA_INSPECTION_SQL */', schemaInspectionSql.trim())
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(migrationPath, progressRpcMigration())
}
