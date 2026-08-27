// Google Analytics 4 — loads gtag.js and reports SPA page views.
// The entire module no-ops unless VITE_GA_MEASUREMENT_ID is baked in at
// build time (set GA_MEASUREMENT_ID in Vercel; vite.config.js maps it).

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let initialized = false

function ensureGtag() {
  if (!GA_ID) return false
  if (initialized) return true
  window.dataLayer = window.dataLayer || []
  window.gtag = function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  // send_page_view off: RouteTracker reports every route change instead,
  // so client-side navigations aren't invisible to GA
  window.gtag('config', GA_ID, { send_page_view: false })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(script)
  initialized = true
  return true
}

export function trackPageView(path) {
  if (!ensureGtag()) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

export function gaEvent(name, params = {}) {
  if (!ensureGtag()) return
  window.gtag('event', name, params)
}
