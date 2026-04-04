import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'

export function AutoLockSync() {
  const { setAutoLockConfig } = useAuth()
  const { settings } = useData()

  useEffect(() => {
    setAutoLockConfig(settings.autoLockMinutes, settings.stayLoggedIn)
  }, [settings.autoLockMinutes, settings.stayLoggedIn, setAutoLockConfig])

  return null
}
