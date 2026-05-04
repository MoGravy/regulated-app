import { useApp } from '../hooks/useApp'

export default function Toast() {
  const { toasts } = useApp()

  if (!toasts.length) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <span>✓</span>}
          {toast.type === 'error' && <span>✕</span>}
          {toast.type === 'info' && <span>ℹ</span>}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
