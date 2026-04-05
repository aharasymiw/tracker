import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'

export function AutoLockSync() {
  const { setAutoLockMinutes } = useAuth()
  const { settings } = useData()

  useEffect(() => {
    setAutoLockMinutes(settings.autoLockMinutes)
  }, [settings.autoLockMinutes, setAutoLockMinutes])

  return null
}
