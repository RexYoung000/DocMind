import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createId } from '@/utils/id'

interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

let addToastFn: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

// eslint-disable-next-line react-refresh/only-export-components
export function toast(type: ToastItem['type'], message: string) {
  addToastFn?.({ type, message })
}

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info }
const STYLES = {
  success: 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
  error: 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300',
  info: 'border-blue-200 bg-blue-50/95 text-blue-800 dark:border-blue-800 dark:bg-blue-950/70 dark:text-blue-300',
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = createId()
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000)
  }, [])

  useEffect(() => {
    addToastFn = add
    return () => { addToastFn = null }
  }, [add])

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[100] w-80 space-y-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className={cn(
              'dm-panel flex items-start gap-2 rounded-2xl px-4 py-3 shadow-lg animate-slide-up',
              STYLES[t.type]
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="flex-1 text-sm">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 bg-transparent border-0 cursor-pointer opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
