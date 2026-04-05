import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'
import { saveSessionKey, clearSessionKey } from '@/lib/db'

export function AutoLockSync() {
  const { setAutoLockConfig, masterKey, vaultState } = useAuth()
  const { settings } = useData()
  const prevStayLoggedIn = useRef(settings.stayLoggedIn)

  useEffect(() => {
    setAutoLockConfig(settings.autoLockMinutes, settings.stayLoggedIn)
  }, [settings.autoLockMinutes, settings.stayLoggedIn, setAutoLockConfig])

  useEffect(() => {
    const wasStayLoggedIn = prevStayLoggedIn.current
    prevStayLoggedIn.current = settings.stayLoggedIn

    if (vaultState !== 'unlocked' || !masterKey) return

    if (settings.stayLoggedIn && !wasStayLoggedIn) {
      saveSessionKey(masterKey)
    } else if (!settings.stayLoggedIn && wasStayLoggedIn) {
      clearSessionKey()
    }
  }, [settings.stayLoggedIn, masterKey, vaultState])

  return null
}
