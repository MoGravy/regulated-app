// Hard-coded sessions for testing — bypasses Supabase entirely.
// Replace with live Supabase data once the DB connection is confirmed working.

export const HARDCODED_SESSIONS = [
  {
    id: '7a875d14-f77e-47e9-8ff3-16d5db08d2e6',
    title: 'Deep Sleep Reset',
    duration: 20,
    category: 'Sleep',
    free: true,
    description: 'Nervous system reset for deep, restorative sleep. Wake up refreshed.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Deep%20Sleep%20Reset.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iY2FjMGI5ZC05ZDMwLTQ4ZWQtYTA4MC01ZDM3OGQ0ZDQyYzIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzZXNzaW9ucy9EZWVwIFNsZWVwIFJlc2V0Lm1wMyIsImlhdCI6MTc3Nzg4MTkwMiwiZXhwIjoyMTU2MzEzOTAyfQ.Ne8NCIzWD2sgsPlvH8ltDVFEob7W-ADwQX-hUgnyb3s',
  },
  {
    id: 'a8e6ed56-e87c-4ef6-8b77-ee6f125c4442',
    title: 'Stress Off Switch',
    duration: 16,
    category: 'Stress',
    free: true,
    description: 'Immediate downregulation for daily overwhelm. Fast-acting nervous system reset.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Stress%20Off%20Switch.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iY2FjMGI5ZC05ZDMwLTQ4ZWQtYTA4MC01ZDM3OGQ0ZDQyYzIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzZXNzaW9ucy9TdHJlc3MgT2ZmIFN3aXRjaC5tcDMiLCJpYXQiOjE3Nzc4ODE5MzksImV4cCI6MjE1NjMxMzkzOX0.ZA9AW0ayMUuJ0vC5aq8SFBsEQgBapKgKgKg95QlZNMQ',
  },
  {
    id: 'ca65ecd1-8ade-4a6e-915e-84810f8b26c0',
    title: 'Gut Brain Reset',
    duration: 18,
    category: 'Gut Health',
    free: true,
    description: 'Direct nervous system communication with your digestive system. Calm your gut naturally.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Gut%20Brain%20Reset.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iY2FjMGI5ZC05ZDMwLTQ4ZWQtYTA4MC01ZDM3OGQ0ZDQyYzIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzZXNzaW9ucy9HdXQgQnJhaW4gUmVzZXQubXAzIiwiaWF0IjoxNzc3ODgxOTE4LCJleHAiOjIxNTYzMTM5MTh9.2tCXoVWliDPJvujjA1ipSGwIesrOCWk_sml4tFb__Sg',
  },
  {
    id: 'e184e81c-8163-46eb-8a00-9ef74f727ab4',
    title: 'Daily Nervous System Reset',
    duration: 5,
    category: 'Daily',
    free: true,
    description: 'Your daily anchor. Free every morning. Refreshes daily.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Daily%20Regulation.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iY2FjMGI5ZC05ZDMwLTQ4ZWQtYTA4MC01ZDM3OGQ0ZDQyYzIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzZXNzaW9ucy9EYWlseSBSZWd1bGF0aW9uLm1wMyIsImlhdCI6MTc3Nzk0NzA0OSwiZXhwIjoyMTU2Mzc5MDQ5fQ.17ROc5yYVtBhOFrRHxhfVExi5RMiWTTygA_IWVRxPyw',
  },
]

// Keyed by id for fast lookup in SessionPlayer
export const HARDCODED_SESSIONS_BY_ID = Object.fromEntries(
  HARDCODED_SESSIONS.map(s => [s.id, s])
)
