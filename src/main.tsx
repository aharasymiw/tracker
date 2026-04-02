import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply theme immediately to avoid flash
;(function applyStoredTheme() {
  try {
    // We can't read from IndexedDB synchronously, so use localStorage as a fast cache
    const theme = localStorage.getItem('trellis-theme') ?? 'system'
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  } catch {}
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
