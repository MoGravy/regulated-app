import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { startNativeAuth } from './lib/nativeAuth'
import './index.css'

void startNativeAuth().catch(() => console.error('[native auth] setup failed'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
