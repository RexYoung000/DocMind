import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
  {
    variants: {
      variant: {
        primary: 'border-primary-600 bg-primary-600 text-white shadow-sm hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-md',
        secondary: 'border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50 hover:text-gray-900',
        danger: 'border-red-600 bg-red-600 text-white shadow-sm hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-md',
        'danger-outline': 'border-red-200 bg-white/90 text-red-600 shadow-sm hover:-translate-y-0.5 hover:bg-red-50',
        ghost: 'border-transparent bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-5 py-3 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)

Button.displayName = 'Button'
