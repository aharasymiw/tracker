import { useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface LogConfirmProps {
  onDismiss: () => void
}

export function LogConfirm({ onDismiss }: LogConfirmProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 1500)
    navigator.vibrate?.([50, 30, 100])
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 animate-[confirm-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]">
        <CheckCircle2 className="text-primary" size={72} strokeWidth={1.5} />
        <p className="font-serif text-xl text-foreground">Logged!</p>
      </div>
    </div>
  )
}
