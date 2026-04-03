import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'

export function AutoLockSync() {
  const { setAutoLockConfig } = useAuth()
  const { settings } = useData()

  useEffect(() => {
    setAutoLockConfig(settings.autoLockMinutes, settings.stayLoggedIn)
  }, [settings.autoLockMinutes, settings.stayLoggedIn, setAutoLockConfig])

  return null
}
