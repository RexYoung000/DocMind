import { FileText, MessageSquareQuote, BookmarkPlus, Sparkles, MoreHorizontal } from 'lucide-react'
import type { ChatControlActionId } from '@/services/chatEngine'

interface Props {
  onQuote: () => void
  onDoc: () => void
  onVote: () => void
  onSummary: () => void
  onBookmark: () => void
  onControl?: (actionId: ChatControlActionId) => void
  disabled?: boolean
}

export function ChatToolbar({ onQuote, onDoc, onVote, onSummary, onBookmark, onControl, disabled }: Props) {
  const primaryButtons = [
    { icon: <MessageSquareQuote className="h-3.5 w-3.5" />, label: '引用上一条', onClick: onQuote },
    { icon: <FileText className="h-3.5 w-3.5" />, label: '附加文档', onClick: onDoc },
    { icon: <Sparkles className="h-3.5 w-3.5" />, label: '生成总结', onClick: onSummary },
  ]

  const secondaryButtons = [
    { icon: <BookmarkPlus className="h-3.5 w-3.5" />, label: '收藏最近观点', onClick: onBookmark },
    { icon: <Sparkles className="h-3.5 w-3.5" />, label: '发起投票（即将支持）', onClick: onVote, disabled: true },
  ]

  const controlButtons: Array<{ label: string; actionId: ChatControlActionId }> = [
    { label: '更激烈一点', actionId: 'increase_conflict' },
    { label: '更温和一点', actionId: 'decrease_conflict' },
    { label: '回到文档证据', actionId: 'return_to_evidence' },
    { label: '学生视角', actionId: 'student_view' },
    { label: '专家判断', actionId: 'expert_judgment' },
    { label: '先总结当前结论', actionId: 'summarize_now' },
    { label: '少说废话', actionId: 'reduce_noise' },
    { label: '推进下一议题', actionId: 'advance_topic' },
  ]

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        {primaryButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            disabled={disabled}
            title={btn.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {btn.icon}
            <span className="hidden sm:inline">{btn.label}</span>
          </button>
        ))}
      </div>

      <details className="group relative">
        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 group-open:bg-gray-50">
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="absolute bottom-full right-0 z-20 mb-2 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {secondaryButtons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              disabled={disabled || btn.disabled}
              className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {btn.icon}
              {btn.label}
            </button>
          ))}

          {onControl ? (
            <div className="mt-1 border-t border-gray-100 pt-1">
              {controlButtons.map((btn) => (
                <button
                  key={btn.actionId}
                  onClick={() => onControl(btn.actionId)}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {btn.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  )
}
