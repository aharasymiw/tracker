import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import { Onboarding } from '@/components/auth/Onboarding'
import { LockScreen } from '@/components/auth/LockScreen'
import LogPage from '@/pages/LogPage'
import JournalPage from '@/pages/JournalPage'
import GoalsPage from '@/pages/GoalsPage'
import SettingsPage from '@/pages/SettingsPage'

const InsightsPage = lazy(() => import('@/pages/InsightsPage'))

function AppRoutes() {
  const { vaultState } = useAuth()

  if (vaultState === 'none') return <Onboarding />
  if (vaultState === 'locked') return <LockScreen />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<LogPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route
          path="/insights"
          element={
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  Loading…
                </div>
              }
            >
              <InsightsPage />
            </Suspense>
          }
        />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
