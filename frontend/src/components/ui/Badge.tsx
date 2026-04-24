import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-[0.01em]',
  {
    variants: {
      variant: {
        default: 'border-gray-200 bg-gray-100/80 text-gray-600',
        primary: 'border-primary-200 bg-primary-50 text-primary-600',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-600',
        warning: 'border-amber-200 bg-amber-50 text-amber-600',
        danger: 'border-red-200 bg-red-50 text-red-600',
        info: 'border-blue-200 bg-blue-50 text-blue-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
