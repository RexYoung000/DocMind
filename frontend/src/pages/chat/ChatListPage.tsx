import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle, Clock, Users, ArrowRight, Plus, X, Check, MoreHorizontal, Trash2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_COLORS } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createId } from '@/utils/id'
import { formatTimeAgo } from '@/utils/format'
import { DEFAULT_CHAT_ROOM_STRATEGY } from '@/types'
import type { ChatRoom, DiscussionMode, ContextDepth, InitiativeLevel, ConflictLevel, RoomTone, FeedbackLevel } from '@/types'

const CONTEXT_DEPTH_OPTIONS: Array<{ value: ContextDepth; label: string }> = [
  { value: 'fast', label: '快速' },
  { value: 'deep', label: '深度' },
  { value: 'long-document', label: '长文档' },
]

const INITIATIVE_OPTIONS: Array<{ value: InitiativeLevel; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高' },
]

const CONFLICT_OPTIONS: Array<{ value: ConflictLevel; label: string }> = [
  { value: 'soft', label: '温和' },
  { value: 'balanced', label: '平衡' },
  { value: 'intense', label: '激烈' },
]

const ROOM_TONE_OPTIONS: Array<{ value: RoomTone; label: string }> = [
  { value: 'review-meeting', label: '专业评审会' },
  { value: 'brainstorm', label: '热烈头脑风暴' },
  { value: 'teaching-seminar', label: '教学研讨课堂' },
  { value: 'product-review', label: '产品评审会' },
]

const FEEDBACK_OPTIONS: Array<{ value: FeedbackLevel; label: string }> = [
  { value: 'simple', label: '简洁' },
  { value: 'full', label: '完整' },
]

export default function ChatListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reviewId = searchParams.get('review')
  const { user } = useAuthStore()
  const rooms = useChatStore((s) => s.rooms)
  const allMessages = useChatStore((s) => s.messages)
  const createRoom = useChatStore((s) => s.createRoom)
  const addMessage = useChatStore((s) => s.addMessage)
  const closeRoom = useChatStore((s) => s.closeRoom)
  const removeRoom = useChatStore((s) => s.removeRoom)
  const allReviews = useReviewStore((s) => s.reviews)
  const review = useMemo(() => reviewId ? allReviews.find((r) => r.id === reviewId) : null, [allReviews, reviewId])
  const agents = useAgentStore((s) => s.agents)
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'closed'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [discussionMode, setDiscussionMode] = useState<DiscussionMode>('free')
  const [contextDepth, setContextDepth] = useState<ContextDepth>(DEFAULT_CHAT_ROOM_STRATEGY.contextDepth)
  const [initiativeLevel, setInitiativeLevel] = useState<InitiativeLevel>(DEFAULT_CHAT_ROOM_STRATEGY.initiativeLevel)
  const [conflictLevel, setConflictLevel] = useState<ConflictLevel>(DEFAULT_CHAT_ROOM_STRATEGY.conflictLevel)
  const [roomTone, setRoomTone] = useState<RoomTone>(DEFAULT_CHAT_ROOM_STRATEGY.roomTone)
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>(DEFAULT_CHAT_ROOM_STRATEGY.feedbackLevel)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatRoom | null>(null)
  const handledReviewRef = useRef<string | null>(null)

  useEffect(() => {
    if (!reviewId || !review || review.status !== 'completed') return
    if (handledReviewRef.current === reviewId) return
    handledReviewRef.current = reviewId

    const existingRoom = rooms.find((r) => r.review_id === reviewId)
    if (existingRoom) {
      navigate(`/chat/${existingRoom.id}`, { replace: true })
      return
    }

    const participants = review.agents || []
    const room: ChatRoom = {
      id: createId(),
      document_id: review.document_id,
      review_id: reviewId,
      owner_id: user?.id || '',
      topic: `关于《${review.document?.title || '文档'}》的评审讨论`,
      status: 'active',
      participants,
      discussionMode: 'moderated',
      strategy: {
        ...DEFAULT_CHAT_ROOM_STRATEGY,
        discussionMode: 'moderated',
      },
      discussionState: 'idle',
      topicTags: [
        ...(review.summary?.pain_points || []),
        ...(review.summary?.top_suggestions?.map((item) => item.title || item.content) || []),
      ].slice(0, 5),
      created_at: new Date().toISOString(),
    }
    createRoom(room)
    addMessage(room.id, {
      id: createId(),
      room_id: room.id,
      sender_type: 'agent',
      sender_id: 'system',
      sender_name: '系统',
      content: `讨论群已建好，${participants.map((a) => `${a.avatar || ''} ${a.name}`).join('、')} 已加入。\n角色们正在阅读文档，稍后会自动发起讨论。你也可以随时 @某人 提问。`,
      created_at: new Date().toISOString(),
    })
    navigate(`/chat/${room.id}`, { replace: true })
  }, [reviewId, review, rooms, user, navigate, createRoom, addMessage])

  // Click-outside to close menu
  useEffect(() => {
    if (!menuOpenId) return
    const handler = () => setMenuOpenId(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const filteredRooms = useMemo(
    () => rooms.filter((r) => activeTab === 'all' ? true : r.status === activeTab),
    [rooms, activeTab]
  )

  const openCreateModal = () => {
    if (agents.length === 0) {
      toast('info', '请先添加角色才能创建聊天室')
      return
    }
    setNewTopic('')
    setSelectedAgentIds([])
    setDiscussionMode('free')
    setContextDepth(DEFAULT_CHAT_ROOM_STRATEGY.contextDepth)
    setInitiativeLevel(DEFAULT_CHAT_ROOM_STRATEGY.initiativeLevel)
    setConflictLevel(DEFAULT_CHAT_ROOM_STRATEGY.conflictLevel)
    setRoomTone(DEFAULT_CHAT_ROOM_STRATEGY.roomTone)
    setFeedbackLevel(DEFAULT_CHAT_ROOM_STRATEGY.feedbackLevel)
    setShowCreateModal(true)
  }

  const toggleAgentSelect = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleCreateRoom = () => {
    if (selectedAgentIds.length === 0) {
      toast('info', '请至少选择一个角色')
      return
    }
    const participants = agents.filter((a) => selectedAgentIds.includes(a.id))
    const topic = newTopic.trim() || '自由讨论'
    const modeLabel = discussionMode === 'debate' ? '辩论' : discussionMode === 'moderated' ? '引导' : '自由'
    const strategy = {
      ...DEFAULT_CHAT_ROOM_STRATEGY,
      discussionMode,
      contextDepth,
      initiativeLevel,
      conflictLevel,
      roomTone,
      feedbackLevel,
    }
    const room: ChatRoom = {
      id: createId(),
      document_id: '',
      owner_id: user?.id || '',
      topic,
      status: 'active',
      participants,
      discussionMode,
      strategy,
      discussionState: 'idle',
      created_at: new Date().toISOString(),
    }
    createRoom(room)
    addMessage(room.id, {
      id: createId(),
      room_id: room.id,
      sender_type: 'agent',
      sender_id: 'system',
      sender_name: '系统',
      content: `讨论群已建好（${modeLabel}讨论模式）。${participants.map((a) => `${a.avatar || ''} ${a.name}`).join('、')} 已加入，大家正在热身中...`,
      created_at: new Date().toISOString(),
    })
    setShowCreateModal(false)
    navigate(`/chat/${room.id}`)
  }

  const handleCloseRoom = (room: ChatRoom) => {
    closeRoom(room.id)
    toast('info', `已关闭「${room.topic}」`)
    setMenuOpenId(null)
  }

  const handleDeleteRoom = (room: ChatRoom) => {
    removeRoom(room.id)
    toast('success', `已删除聊天室「${room.topic}」`)
    setDeleteTarget(null)
    setMenuOpenId(null)
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">聊天室</h1>
          <p className="text-sm text-gray-500 mt-1">与 AI 角色深度辩论，碰撞出更好的想法</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors cursor-pointer border-0"
        >
          <Plus className="h-4 w-4" />
          新建聊天室
        </button>
      </div>

      <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
        {[
          { key: 'all' as const, label: `全部 (${rooms.length})` },
          { key: 'active' as const, label: '活跃中' },
          { key: 'closed' as const, label: '已结束' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer border-0',
              activeTab === tab.key ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 bg-transparent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredRooms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {rooms.length === 0 ? '还没有聊天室' : '没有匹配的聊天室'}
          </p>
          <p className="text-sm text-gray-400 mt-1">完成评审后可以创建聊天室与角色深入讨论</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/reviews" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 no-underline">
              查看评审
            </Link>
            <button
              onClick={openCreateModal}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0"
            >
              新建聊天室
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRooms.map((room) => {
            const roomMessages = allMessages[room.id] || []
            const lastMsg = roomMessages[roomMessages.length - 1]
            const lastTime = lastMsg ? lastMsg.created_at : room.created_at
            return (
              <div
                key={room.id}
                className="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md group"
              >
                <Link to={`/chat/${room.id}`} className="absolute inset-0 z-0" />
                <div className="relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{room.topic}</h3>
                        {room.discussionMode && room.discussionMode !== 'free' && (
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            room.discussionMode === 'debate' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          )}>
                            {room.discussionMode === 'debate' ? '辩论' : '引导'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {roomMessages.length} 条消息
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        room.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      )}>
                        {room.status === 'active' ? '活跃中' : '已结束'}
                      </span>
                      <div className="relative">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(menuOpenId === room.id ? null : room.id) }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer transition-opacity p-1 rounded-md hover:bg-gray-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuOpenId === room.id && (
                          <div
                            className="absolute right-0 top-7 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-20"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {room.status === 'active' && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCloseRoom(room) }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer border-0 bg-transparent"
                              >
                                <XCircle className="h-3.5 w-3.5" /> 关闭聊天室
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(room); setMenuOpenId(null) }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer border-0 bg-transparent"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> 删除聊天室
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {room.participants.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <div className="flex -space-x-1">
                        {room.participants.map((p) => (
                          <div
                            key={p.id}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-xs border-2 border-white"
                            style={{ backgroundColor: AGENT_COLORS[p.color] + '25' }}
                            title={p.name}
                          >
                            {p.avatar || p.name[0]}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">
                        {room.participants.map((p) => p.name).join('、')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 truncate max-w-md">
                      {lastMsg ? `${lastMsg.sender_name}: ${lastMsg.content.slice(0, 60)}` : '暂无消息'}
                    </p>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(lastTime)}
                      </span>
                      <span className="flex items-center text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        进入 <ArrowRight className="h-3 w-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除聊天室"
        description={deleteTarget ? `确定要删除「${deleteTarget.topic}」吗？所有消息记录将被永久删除，此操作不可撤销。` : ''}
        confirmText="删除"
        variant="danger"
        onConfirm={() => deleteTarget && handleDeleteRoom(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl animate-slide-up mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">新建聊天室</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">讨论主题</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="例如：关于方案可行性的讨论"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">讨论模式</label>
                <div className="flex gap-2">
                  {([
                    { value: 'free' as DiscussionMode, label: '💬 自由讨论', desc: '自然发言' },
                    { value: 'moderated' as DiscussionMode, label: '📋 引导式', desc: '围绕主题' },
                    { value: 'debate' as DiscussionMode, label: '⚔️ 辩论', desc: '观点对抗' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDiscussionMode(opt.value)}
                      className={cn(
                        'flex-1 rounded-lg border p-2 text-center text-xs transition-colors cursor-pointer',
                        discussionMode === opt.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">上下文深度</label>
                  <select
                    value={contextDepth}
                    onChange={(event) => setContextDepth(event.target.value as ContextDepth)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  >
                    {CONTEXT_DEPTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">产品气质</label>
                  <select
                    value={roomTone}
                    onChange={(event) => setRoomTone(event.target.value as RoomTone)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  >
                    {ROOM_TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">主动性</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {INITIATIVE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setInitiativeLevel(option.value)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-xs font-medium transition-colors cursor-pointer',
                          initiativeLevel === option.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">冲突强度</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CONFLICT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setConflictLevel(option.value)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-xs font-medium transition-colors cursor-pointer',
                          conflictLevel === option.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">过程反馈</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FEEDBACK_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setFeedbackLevel(option.value)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-xs font-medium transition-colors cursor-pointer',
                          feedbackLevel === option.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  原文引用可用但不强制；身份边界默认按角色能力自动约束。
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  选择参与的角色 ({selectedAgentIds.length}/{agents.length})
                </label>
                <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-lg border border-gray-200 p-2">
                  {agents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.id)
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgentSelect(agent.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors cursor-pointer',
                          isSelected ? 'border-primary-500 bg-primary-50' : 'border-transparent hover:bg-gray-50'
                        )}
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm shrink-0"
                          style={{ backgroundColor: AGENT_COLORS[agent.color] + '15', boxShadow: isSelected ? `0 0 0 2px ${AGENT_COLORS[agent.color]}` : 'none' }}
                        >
                          {agent.avatar || agent.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                          <p className="text-xs text-gray-500 truncate">{agent.tagline}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={selectedAgentIds.length === 0}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-0"
              >
                创建 ({selectedAgentIds.length} 位角色)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
