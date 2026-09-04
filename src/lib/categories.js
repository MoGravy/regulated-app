import { Moon, Lightning, Drop, Sun, Waves, Rocket, Shield, Repeat } from '@phosphor-icons/react'

// Single source of truth for category colour + icon.
// Colours are the eight category families from design/Regulated.dc.html (1a).
// Icons are the mapping named in the brief; Phosphor's real export names are
// Drop (not Droplet) and Waves (not Wave).
//
// Keys are lowercased category values as they appear in the sessions table.
// "Relief" exists in the live data but has no family in the design file, so it
// falls through to NEUTRAL — the quietest of the eight — rather than inventing
// a ninth hue. Same for any category added later.
const FAMILIES = {
  sleep:        { ink: '#3E4C66', icon: Moon,      label: 'Sleep' },
  stress:       { ink: '#3F5A55', icon: Lightning, label: 'Stress' },
  anxiety:      { ink: '#4B5A3F', icon: Waves,     label: 'Anxiety' },
  'gut health': { ink: '#6C5B34', icon: Drop,      label: 'Gut Health' },
  gut:          { ink: '#6C5B34', icon: Drop,      label: 'Gut' },
  confidence:   { ink: '#5C4A5E', icon: Shield,    label: 'Confidence' },
  habits:       { ink: '#34524F', icon: Repeat,    label: 'Habits' },
  motivation:   { ink: '#6A4B4E', icon: Rocket,    label: 'Motivation' },
  daily:        { ink: '#4E4C42', icon: Sun,       label: 'Daily' },
  reset:        { ink: '#4E4C42', icon: Sun,       label: 'Reset' },
}

const NEUTRAL = { ink: '#4E4C42', icon: null, label: '' }

export function categoryOf(category) {
  const fam = FAMILIES[String(category || '').toLowerCase()] || NEUTRAL
  return { ...fam, label: fam.label || category || '' }
}

// Chip fill at 10 percent, border at 22 percent, ink at full — design 1a.
export function tint(ink, alpha) {
  const n = parseInt(ink.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function chipStyle(category) {
  const { ink } = categoryOf(category)
  return { background: tint(ink, 0.1), border: `1px solid ${tint(ink, 0.22)}`, color: ink }
}

// Every category a session should appear under: its primary `category` first,
// then any `tags`. Case-insensitive dedupe, original casing preserved. Safe on
// rows with no tags, which includes every hardcoded fallback session.
export function categoriesOf(session) {
  const out = []
  const seen = new Set()
  for (const c of [session?.category, ...(session?.tags || [])]) {
    const v = String(c || '').trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}
