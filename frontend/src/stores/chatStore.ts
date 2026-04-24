import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ChatRoom,
  ChatMessage,
  ChatPoll,
  Bookmark,
  DiscussionSummary,
  Agent,
  MessageStatus,
  DiscussionState,
  ChatAgendaItem,
} from '@/types'
import { useActivityStore } from './activityStore'

interface ChatState {
  rooms: ChatRoom[]
  messages: Record<string, ChatMessage[]>
  bookmarks: Bookmark[]
  polls: ChatPoll[]
  summaries: DiscussionSummary[]

  createRoom: (room: ChatRoom) => void
  closeRoom: (id: string) => void
  removeRoom: (id: string) => void
  getRoom: (id: string) => ChatRoom | undefined

  addMessage: (roomId: string, message: ChatMessage) => void
  updateMessageStatus: (roomId: string, messageId: string, status: MessageStatus) => void
  getMessages: (roomId: string) => ChatMessage[]

  addParticipant: (roomId: string, agent: Agent) => void

  addReaction: (roomId: string, messageId: string, emoji: string, isUser: boolean, agentId?: string) => void
  removeReaction: (roomId: string, messageId: string, emoji: string, isUser: boolean, agentId?: string) => void

  addBookmark: (bookmark: Bookmark) => void
  removeBookmark: (bookmarkId: string) => void

  createPoll: (poll: ChatPoll) => void
  castVote: (pollId: string, optionId: string, voterId: string) => void

  addSummary: (summary: DiscussionSummary) => void

  updateDiscussionState: (roomId: string, state: DiscussionState) => void
  setAgenda: (roomId: string, agenda: ChatAgendaItem[], currentTopicId?: string) => void
  activateAgendaTopic: (roomId: string, topicId: string) => void
  completeAgendaTopic: (roomId: string, topicId: string, nextTopicId?: string) => void
}

function normalizeRoom(room: ChatRoom): ChatRoom {
  return {
    ...room,
    discussionState: room.status === 'closed' ? 'closed' : room.discussionState || 'idle',
    pendingTopics: room.pendingTopics || [],
    stats: {
      messageCount: room.stats?.messageCount || 0,
      bookmarkCount: room.stats?.bookmarkCount || 0,
      lastActiveAt: room.stats?.lastActiveAt || room.created_at,
    },
  }
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      rooms: [],
      messages: {},
      bookmarks: [],
      polls: [],
      summaries: [],

      createRoom: (room) => {
        const normalizedRoom = normalizeRoom(room)
        set((state) => ({
          rooms: [normalizedRoom, ...state.rooms],
          messages: { ...state.messages, [normalizedRoom.id]: [] },
        }))
        useActivityStore.getState().addActivity({
          type: 'chat',
          text: `创建了聊天室《${normalizedRoom.topic}》`,
        })
      },

      closeRoom: (id) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === id ? { ...room, status: 'closed', discussionState: 'closed' } : room
          ),
        }))
      },

      removeRoom: (id) => {
        set((state) => {
          const { [id]: _, ...restMessages } = state.messages
          return {
            rooms: state.rooms.filter((room) => room.id !== id),
            messages: restMessages,
          }
        })
      },

      getRoom: (id) => get().rooms.find((room) => room.id === id),

      addMessage: (roomId, message) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  stats: {
                    messageCount: (room.stats?.messageCount || 0) + 1,
                    bookmarkCount: room.stats?.bookmarkCount || 0,
                    lastActiveAt: message.created_at,
                  },
                }
              : room
          ),
          messages: {
            ...state.messages,
            [roomId]: [...(state.messages[roomId] || []), message],
          },
        }))
      },

      updateMessageStatus: (roomId, messageId, status) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [roomId]: (state.messages[roomId] || []).map((message) =>
              message.id === messageId ? { ...message, status } : message
            ),
          },
        }))
      },

      getMessages: (roomId) => get().messages[roomId] || [],

      addParticipant: (roomId, agent) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId && !room.participants.some((participant) => participant.id === agent.id)
              ? { ...room, participants: [...room.participants, agent] }
              : room
          ),
        }))
      },

      addReaction: (roomId, messageId, emoji, isUser, agentId) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [roomId]: (state.messages[roomId] || []).map((message) => {
              if (message.id !== messageId) return message
              const reactions = [...(message.reactions || [])]
              const existing = reactions.find((reaction) => reaction.emoji === emoji)

              if (existing) {
                if (isUser) existing.userReacted = true
                if (agentId && !existing.agentIds.includes(agentId)) existing.agentIds.push(agentId)
              } else {
                reactions.push({ emoji, userReacted: isUser, agentIds: agentId ? [agentId] : [] })
              }

              return { ...message, reactions }
            }),
          },
        }))
      },

      removeReaction: (roomId, messageId, emoji, isUser, agentId) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [roomId]: (state.messages[roomId] || []).map((message) => {
              if (message.id !== messageId) return message

              const reactions = (message.reactions || [])
                .map((reaction) => {
                  if (reaction.emoji !== emoji) return reaction
                  return {
                    ...reaction,
                    userReacted: isUser ? false : reaction.userReacted,
                    agentIds: agentId ? reaction.agentIds.filter((id) => id !== agentId) : reaction.agentIds,
                  }
                })
                .filter((reaction) => reaction.userReacted || reaction.agentIds.length > 0)

              return { ...message, reactions }
            }),
          },
        }))
      },

      addBookmark: (bookmark) => {
        set((state) => ({
          bookmarks: [...state.bookmarks, bookmark],
          rooms: state.rooms.map((room) =>
            room.id === bookmark.roomId
              ? {
                  ...room,
                  stats: {
                    messageCount: room.stats?.messageCount || 0,
                    lastActiveAt: room.stats?.lastActiveAt,
                    bookmarkCount: (room.stats?.bookmarkCount || 0) + 1,
                  },
                }
              : room
          ),
        }))
      },

      removeBookmark: (bookmarkId) => {
        const target = get().bookmarks.find((bookmark) => bookmark.id === bookmarkId)
        set((state) => ({
          bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
          rooms: !target
            ? state.rooms
            : state.rooms.map((room) =>
                room.id === target.roomId
                  ? {
                      ...room,
                      stats: {
                        messageCount: room.stats?.messageCount || 0,
                        lastActiveAt: room.stats?.lastActiveAt,
                        bookmarkCount: Math.max(0, (room.stats?.bookmarkCount || 0) - 1),
                      },
                    }
                  : room
              ),
        }))
      },

      createPoll: (poll) => {
        set((state) => ({ polls: [...state.polls, poll] }))
      },

      castVote: (pollId, optionId, voterId) => {
        set((state) => ({
          polls: state.polls.map((poll) => {
            if (poll.id !== pollId) return poll
            return {
              ...poll,
              options: poll.options.map((option) => {
                const withoutVoter = option.voterIds.filter((voter) => voter !== voterId)
                return option.id === optionId
                  ? { ...option, voterIds: [...withoutVoter, voterId] }
                  : { ...option, voterIds: withoutVoter }
              }),
            }
          }),
        }))
      },

      addSummary: (summary) => {
        set((state) => ({ summaries: [...state.summaries, summary] }))
      },

      updateDiscussionState: (roomId, discussionState) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId ? { ...room, discussionState } : room
          ),
        }))
      },

      setAgenda: (roomId, pendingTopics, currentTopicId) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  pendingTopics,
                  currentTopicId: currentTopicId || pendingTopics.find((topic) => topic.status === 'active')?.id,
                }
              : room
          ),
        }))
      },

      activateAgendaTopic: (roomId, topicId) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  currentTopicId: topicId,
                  pendingTopics: (room.pendingTopics || []).map((topic) => ({
                    ...topic,
                    status: topic.id === topicId ? 'active' : topic.status === 'active' ? 'pending' : topic.status,
                  })),
                }
              : room
          ),
        }))
      },

      completeAgendaTopic: (roomId, topicId, nextTopicId) => {
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  currentTopicId: nextTopicId,
                  pendingTopics: (room.pendingTopics || []).map((topic) => ({
                    ...topic,
                    status: topic.id === topicId ? 'done' : topic.id === nextTopicId ? 'active' : topic.status,
                  })),
                }
              : room
          ),
        }))
      },
    }),
    {
      name: 'docmind-chat',
      merge: (persisted, current) => {
        const typed = persisted as Partial<ChatState>
        return {
          ...current,
          ...typed,
          rooms: (typed.rooms || []).map((room) => normalizeRoom(room)),
        }
      },
    }
  )
)
