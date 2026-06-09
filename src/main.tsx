import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from '@/lib/theme'

// Apply the stored theme before React renders to avoid a flash. The synchronous
// localStorage cache stands in for the encrypted preference, which can't be read
// until the vault is unlocked. From here on, useThemeSync keeps it in step.
applyTheme(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
