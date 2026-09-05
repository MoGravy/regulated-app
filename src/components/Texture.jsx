import { tint } from '../lib/categories'

// Two soft organic masses at 8-16 percent of the category ink, blurred. Still
// unless `drift` is set, which breathes them over 12s (home hero only). Texture is the only decoration in the system — design 1a.
// Geometry per variant is lifted from the boards it appears on.
const VARIANTS = {
  card:   [{ w: 200, h: 150, right: -60, top: -50, a: 0.14, blur: 16, shape: 'blob-a' }],
  tile:   [{ w: 120, h: 100, right: -30, bottom: -34, a: 0.14, blur: 12, shape: 'blob-b' }],
  header: [
    { w: 300, h: 240, left: -40, top: 30, a: 0.20, blur: 28, shape: 'blob-a' },
    { w: 200, h: 170, right: -50, top: -40, a: 0.16, blur: 24, shape: 'blob-b' },
  ],
  quote:  [{ w: 170, h: 140, right: -50, bottom: -50, a: 0.12, blur: 16, shape: 'blob-b' }],
  page:   [{ w: 340, h: 280, right: -90, top: -60, a: 0.08, blur: 30, shape: 'blob-a' }],
}

export default function Texture({ ink, variant = 'card', drift = false }) {
  return (
    <>
      {VARIANTS[variant].map((b, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`blob ${b.shape}${drift ? ' blob-drift' : ''}`}
          style={{
            position: 'absolute',
            width: b.w,
            height: b.h,
            left: b.left,
            right: b.right,
            top: b.top,
            bottom: b.bottom,
            background: tint(ink, b.a),
            filter: `blur(${b.blur}px)`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}
