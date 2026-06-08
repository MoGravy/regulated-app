import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const src = readFileSync('src/config/credentials.js', 'utf8')
const m = src.match(/SUPABASE_ANON_KEY\s*=\s*"(.+?)"/)
const key = m?.[1] || ''
if (!key || key.includes('...')) throw new Error('credentials.js does not contain a real SUPABASE_ANON_KEY')
const supabaseUrl = 'https://aynyvirtzioyeshauith.supabase.co'
const supabase = createClient(supabaseUrl, key)

async function listBucket(name) {
  const { data, error } = await supabase.storage.from(name).list()
  console.log('===', name, '===')
  if (error) {
    console.error('LIST ERROR', error.message)
    return
  }
  console.log(data?.length || 0)
  for (const item of (data || [])) {
    console.log(item.name)
  }
}

await listBucket('sessions')
await listBucket('audio')
