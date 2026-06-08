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
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Deep%20Sleep%20Reset.mp3?token=eyJraW...yb3s',
  },
  {
    id: 'a8e6ed56-e87c-4ef6-8b77-ee6f125c4442',
    title: 'Stress Off Switch',
    duration: 16,
    category: 'Stress',
    free: true,
    description: 'Immediate downregulation for daily overwhelm. Fast-acting nervous system reset.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Stress%20Off%20Switch.mp3?token=eyJraW...ZNMQ',
  },
  {
    id: 'ca65ecd1-8ade-4a6e-915e-84810f8b26c0',
    title: 'Gut Brain Reset',
    duration: 18,
    category: 'Gut Health',
    free: true,
    description: 'Direct nervous system communication with your digestive system. Calm your gut naturally.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Gut%20Brain%20Reset.mp3?token=eyJraW...__Sg',
  },
  {
    id: 'e184e81c-8163-46eb-8a00-9ef74f727ab4',
    title: 'Daily Nervous System Reset',
    duration: 5,
    category: 'Daily',
    free: true,
    description: 'Your daily anchor. Free every morning. Refreshes daily.',
    audio_url: 'https://aynyvirtzioyeshauith.supabase.co/storage/v1/object/sign/sessions/Daily%20Regulation.mp3?token=eyJraW...xPyw',
  },
  // Premium sessions — audio files need mastering by Matthew first
  {
    id: 'p001-anxiety-release',
    title: 'Anxiety Release',
    duration: 20,
    category: 'Anxiety',
    free: false,
    description: 'Dissolve the root patterns driving chronic anxiety and hypervigilance.',
    audio_url: null,
  },
  {
    id: 'p002-deep-focus',
    title: 'Deep Focus',
    duration: 15,
    category: 'Focus',
    free: false,
    description: 'Neurological priming for peak mental performance and sustained focus.',
    audio_url: null,
  },
  {
    id: 'p003-confidence',
    title: 'Unshakeable Confidence',
    duration: 24,
    category: 'Confidence',
    free: false,
    description: 'Reprogram limiting beliefs around your worth, capability, and identity.',
    audio_url: null,
  },
  {
    id: 'p004-grief',
    title: 'Grief Processing',
    duration: 28,
    category: 'Grief',
    free: false,
    description: 'A safe, guided space to process loss and begin moving through grief.',
    audio_url: null,
  },
  {
    id: 'p005-panic',
    title: 'Panic Attack Protocol',
    duration: 10,
    category: 'Anxiety',
    free: false,
    description: 'Rapid response for acute panic. Brings you back to baseline fast.',
    audio_url: null,
  },
  {
    id: 'p006-morning',
    title: 'Morning Activation',
    duration: 14,
    category: 'Reset',
    free: false,
    description: 'Start each day from a place of groundedness and regulated energy.',
    audio_url: null,
  },
  {
    id: 'p007-relationship',
    title: 'Relationship Patterns',
    duration: 26,
    category: 'Confidence',
    free: false,
    description: 'Identify and dissolve the nervous system patterns driving relationship struggles.',
    audio_url: null,
  },
]

// Keyed by id for fast lookup in SessionPlayer
export const HARDCODED_SESSIONS_BY_ID = Object.fromEntries(
  HARDCODED_SESSIONS.map(s => [s.id, s])
)
