import { X, Download, Trash2 } from 'lucide-react'
import { AGENT_COLORS } from '@/stores/agentStore'
import type { Bookmark, ChatMessage } from '@/types'

interface Props {
  bookmarks: Bookmark[]
  messages: ChatMessage[]
  onRemove: (bookmarkId: string) => void
  onExport: () => void
  onClose: () => void
}

export function BookmarkPanel({ bookmarks, messages, onRemove, onExport, onClose }: Props) {
  const bookmarkedMessages = bookmarks
    .map((b) => {
      const msg = messages.find((m) => m.id === b.messageId)
      return msg ? { bookmark: b, message: msg } : null
    })
    .filter(Boolean) as { bookmark: Bookmark; message: ChatMessage }[]

  return (
    <div className="absolute inset-0 z-30 bg-white dark:bg-gray-800 flex flex-col rounded-xl">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">收藏的观点</h3>
        <div className="flex items-center gap-2">
          {bookmarkedMessages.length > 0 && (
            <button
              onClick={onExport}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-0 bg-transparent"
              title="导出为 Markdown"
            >
              <Download className="h-3.5 w-3.5" /> 导出
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {bookmarkedMessages.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">暂无收藏</div>
        ) : (
          bookmarkedMessages.map(({ bookmark, message }) => (
            <div key={bookmark.id} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: message.sender_color ? AGENT_COLORS[message.sender_color] : '#666' }}>
                  {message.sender_name}
                </span>
                <button
                  onClick={() => onRemove(bookmark.id)}
                  className="text-gray-300 hover:text-red-500 bg-transparent border-0 cursor-pointer p-0"
                  title="取消收藏"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{message.content}</p>
              {bookmark.note && (
                <p className="mt-1 text-[10px] text-gray-400 italic">{bookmark.note}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
