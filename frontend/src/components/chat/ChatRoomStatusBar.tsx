import { Circle, Target, Zap } from 'lucide-react'
import type { ChatAgendaItem, ChatMessage, Agent, DiscussionMode, DiscussionState } from '@/types'

interface Props {
  messages: ChatMessage[]
  participants: Agent[]
  discussionMode?: DiscussionMode
  discussionState?: DiscussionState
  currentTopic?: ChatAgendaItem | null
  remainingTopics?: number
  isActive: boolean
}

const MODE_LABELS: Record<DiscussionMode, string> = {
  free: '自由讨论',
  moderated: '引导讨论',
  debate: '辩论模式',
}

const STATE_LABELS: Record<DiscussionState, string> = {
  idle: '待开始',
  kickoff: '开场中',
  discussing: '讨论中',
  summarizing: '收束中',
  closed: '已关闭',
}

export function ChatRoomStatusBar({
  messages,
  participants,
  discussionMode,
  discussionState,
  currentTopic,
  remainingTopics = 0,
  isActive,
}: Props) {
  const agentCount = participants.length
  const messageCount = messages.length

  return (
    <div className="border-b border-gray-200 bg-white px-5 py-3 text-xs text-gray-700">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {discussionMode ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold text-gray-900">
              <Zap className="h-3 w-3 text-primary-600" />
              {MODE_LABELS[discussionMode]}
            </span>
          ) : null}

          {currentTopic ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 font-semibold text-primary-800 sm:max-w-[min(50vw,720px)]">
              <Target className="h-3 w-3 shrink-0 text-primary-700" />
              <span className="truncate">当前：{currentTopic.text}</span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-600">
          <span>{messageCount} 条</span>
          <span>·</span>
          <span>{agentCount} 位角色</span>
          {remainingTopics > 0 ? <span>· 剩余 {remainingTopics}</span> : null}

          {isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              <Circle className="h-2 w-2 fill-current" />
              {discussionState ? STATE_LABELS[discussionState] : '进行中'}
            </span>
          ) : discussionState ? (
            <span>{STATE_LABELS[discussionState]}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
