import { cn } from '@/lib/utils'
import type { DiffResult } from '@/types'

interface DiffViewerProps {
  result: DiffResult
  className?: string
}

export function DiffViewer({ result, className }: DiffViewerProps) {
  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-white', className)}>
      <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">
          Diff 对比结果
        </span>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200" />
            新增 {result.stats.additions}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200" />
            删除 {result.stats.deletions}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />
            修改 {result.stats.modifications}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-100" />
            未变 {result.stats.equalLines}
          </span>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto p-4 font-mono text-sm leading-relaxed">
        {result.points.map((point, index) => {
          const key = `${index}-${point.type}`
          if (point.type === 'add') {
            return (
              <div
                key={key}
                className="bg-emerald-50 text-emerald-900 px-2 py-0.5 border-l-[3px] border-emerald-400"
              >
                <span className="mr-1.5 text-xs text-emerald-500 select-none">+</span>
                {point.text}
              </div>
            )
          }

          if (point.type === 'delete') {
            return (
              <div
                key={key}
                className="bg-red-50 text-red-900 px-2 py-0.5 line-through decoration-red-400 border-l-[3px] border-red-400"
              >
                <span className="mr-1.5 text-xs text-red-400 select-none">-</span>
                {point.text}
              </div>
            )
          }

          if (point.type === 'modify') {
            return (
              <div key={key} className="space-y-1 border-l-[3px] border-amber-400 bg-amber-50 px-2 py-1 text-amber-950">
                <div className="line-through decoration-red-400">
                  <span className="mr-1.5 text-xs text-red-400 select-none">-</span>
                  {point.oldText || point.text}
                </div>
                <div>
                  <span className="mr-1.5 text-xs text-emerald-500 select-none">+</span>
                  {point.newText || point.text}
                </div>
              </div>
            )
          }

          if (!point.text.trim()) {
            return <div key={key} className="px-2 py-0.5 text-gray-300">{' '}</div>
          }

          return (
            <div key={key} className="px-2 py-0.5 text-gray-700">
              <span className="mr-1.5 text-xs text-gray-300 select-none">{' '}</span>
              {point.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
