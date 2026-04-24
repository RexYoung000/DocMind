import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const isDanger = variant === 'danger'

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="dm-panel mx-4 w-full max-w-sm rounded-2xl p-6 shadow-xl animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
      >
        <div className="mb-4 flex items-start gap-3">
          {isDanger ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/60">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <h3 id="confirm-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
            <p id="confirm-desc" className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          </div>

          <button
            onClick={onCancel}
            className="shrink-0 rounded-md border-0 bg-transparent p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button ref={confirmRef} variant={isDanger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
