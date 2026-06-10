import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://aynyvirtzioyeshauith.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5bnl2aXJ0emlveWVzaGF1aXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjEzODcsImV4cCI6MjA5MzMzNzM4N30.q1hfzEtVylk2_1a3hdc1gRZ9jZNLB4YKdK77A9mqHBM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

console.log('\n=== TEST 1: getAllSessions() as written (order by sort_order) ===')
{
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('FULL ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log(`✓ Returned ${data.length} rows`)
    data.forEach(r => console.log(` - ${r.id} | ${r.title} | audio_url: ${r.audio_url?.slice(0, 60)}…`))
  }
}

console.log('\n=== TEST 2: plain SELECT * with no ordering ===')
{
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
  if (error) {
    console.error('FULL ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log(`✓ Returned ${data.length} rows`)
    data.forEach(r => console.log(` - id: ${r.id}\n   title: ${r.title}\n   audio_url: ${r.audio_url?.slice(0, 80)}`))
  }
}

console.log('\n=== TEST 3: check actual column names (select id only to see what exists) ===')
{
  const { data, error } = await supabase
    .from('sessions')
    .select('id, title, free, audio_url')
    .limit(5)
  if (error) {
    console.error('FULL ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log(`✓ id/title/free/audio_url columns exist, ${data.length} rows:`)
    data.forEach(r => console.log(` - [${r.free ? 'free' : 'premium'}] ${r.id} | ${r.title}`))
  }
}

console.log('\n=== TEST 4: try ordering by created_at instead ===')
{
  const { data, error } = await supabase
    .from('sessions')
    .select('id, title')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('FULL ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log(`✓ order by created_at works — ${data.length} rows`)
  }
}
