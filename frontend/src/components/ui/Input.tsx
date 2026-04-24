import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border bg-white/92 px-4 py-2.5 text-sm text-gray-800 shadow-sm outline-none transition-all duration-200 placeholder:text-gray-400 focus:-translate-y-px focus:ring-2 focus:ring-primary-500/20',
        error
          ? 'border-red-300 focus:border-red-500'
          : 'border-gray-200 focus:border-primary-400 hover:border-primary-200',
        className
      )}
      {...props}
    />
  )
)

Input.displayName = 'Input'
