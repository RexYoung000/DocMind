import type { Bookmark, ChatMessage } from '@/types'

export function exportBookmarksAsMarkdown(
  bookmarks: Bookmark[],
  messages: ChatMessage[],
  roomTopic: string,
): string {
  const lines = [`# 收藏观点 — ${roomTopic}`, '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, '']
  for (const bookmark of bookmarks) {
    const message = messages.find((item) => item.id === bookmark.messageId)
    if (!message) continue
    lines.push(`## ${message.sender_name}`)
    lines.push('')
    lines.push(message.content)
    if (bookmark.note) lines.push('', `*备注：${bookmark.note}*`)
    lines.push('', '---', '')
  }
  return lines.join('\n')
}
