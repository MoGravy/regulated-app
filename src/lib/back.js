// Back through history when there is any; otherwise to a sane screen. A blind
// navigate(-1) after a reload or a deep link does nothing, and the user is stuck.
export const goBack = (navigate, fallback = '/') =>
  window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback)
