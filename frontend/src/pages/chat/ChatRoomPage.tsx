import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  UserPlus,
  FileText,
  MessageCircle,
  X,
  Trash2,
  Reply,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  Search,
  BookmarkIcon,
} from 'lucide-react'
import { TypingIndicator } from '@/components/ui/TypingIndicator'
import { SlashCommandMenu } from '@/components/chat/SlashCommandMenu'
import { ChatToolbar } from '@/components/chat/ChatToolbar'
import { DocumentPicker } from '@/components/chat/DocumentPicker'
import { EmojiReactionBar } from '@/components/chat/EmojiReactionBar'
import { ChatRoomStatusBar } from '@/components/chat/ChatRoomStatusBar'
import { ChatSearchPanel } from '@/components/chat/ChatSearchPanel'
import { BookmarkPanel } from '@/components/chat/BookmarkPanel'
import { exportBookmarksAsMarkdown } from '@/components/chat/bookmarkExport'
import { DiscussionSummaryCard } from '@/components/chat/DiscussionSummaryCard'
import { cn } from '@/lib/utils'
import { AGENT_COLORS, useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useAuthStore } from '@/stores/authStore'
import { chatCompletion } from '@/services/llmService'
import {
  assembleLayeredContext,
  buildAgentMemoryMap,
  buildCapabilityInstruction,
  buildFeedbackDisplay,
  buildDiscussionArtifact,
  buildRepetitionRecoveryInstruction,
  buildTurnMessageMetadata,
  createIdentitySafeFallbackReply,
  createStrategyLogEntry,
  detectCollisions,
  evaluateTriggers,
  formatAgentMemoryForContext,
  getFeedbackSteps,
  getEventPromptSuffix,
  getMessageMetadataBadges,
  guardAgainstRepetition,
  inferCapabilityProfile,
  normalizeChatRoomStrategy,
  planFailureRecovery,
  planDiscussionTurns,
  resolveChatControlAction,
  routeChatEvents,
  validateAndAdaptResponse,
  TopicPool,
} from '@/services/chatEngine'
import type {
  AgentFailureState,
  CapabilityProfile,
  ChatControlActionId,
  FeedbackStep,
  MetadataBadgeTone,
  RoutedChatEvent,
  SpeakingPosture,
  StrategyLogEntry,
  StrategyLogInput,
  TurnIntent,
} from '@/services/chatEngine'
import { isModelConfigValid, useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createId } from '@/utils/id'
import type { ChatMessage, ChatMessageAttachment, Agent, DiscussionMode, Document, Review, ChatAgendaItem, DiscussionState, ChatRoomStrategy, Suggestion } from '@/types'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_PARTICIPANTS: Agent[] = []
const EMPTY_AGENDA: ChatAgendaItem[] = []
const MAX_RECENT_MESSAGES = 12

type DiscussionTurnIntent = 'open' | 'challenge' | 'support' | 'question' | 'evidence' | 'synthesize'

type DiscussionTurn = {
  agent: Agent
  intent: DiscussionTurnIntent
  targetAgent?: Agent
  focus: string
  event?: RoutedChatEvent
  speakingPosture?: SpeakingPosture
  capabilityProfile?: CapabilityProfile
  wasPostureTranslated?: boolean
  reason?: string
}

type AgentMessageMetadata = Pick<ChatMessage, 'intent' | 'respondingTo' | 'contextSource' | 'evidenceLevel' | 'citations'>

type LlmChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type AgentReplyResult = {
  text: string
  failed: boolean
  error?: string
  usedContext?: string[]
  contextSummary?: string
  finalPosture?: SpeakingPosture
  wasPostureTranslated?: boolean
  outputWasRewritten?: boolean
}

function randomDelay(min: number, max: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))
}

function requestChatCompletion(messages: LlmChatMessage[], signal?: AbortSignal): Promise<AgentReplyResult> {
  return new Promise<AgentReplyResult>((resolve) => {
    let fullText = ''
    let settled = false
    const finish = (result: AgentReplyResult) => {
      if (settled) return
      settled = true
      resolve({ ...result, text: result.text.trim() })
    }

    chatCompletion(
      messages,
      {
        onChunk: (chunk) => {
          fullText += chunk
        },
        onDone: (text) => finish({ text: text || fullText, failed: false }),
        onError: (error) => finish({
          text: fullText,
          failed: fullText.trim().length === 0,
          error: error.message,
        }),
      },
      signal,
    ).catch((error: unknown) => {
      finish({
        text: fullText,
        failed: fullText.trim().length === 0,
        error: error instanceof Error ? error.message : 'LLM request failed',
      })
    })
  })
}

function buildChatSystemPrompt(
  agent: Agent,
  docContext: string,
  otherAgents: Agent[],
  mode: DiscussionMode,
  strategy: ChatRoomStrategy | undefined,
  capabilityInstruction: string,
) {
  const teammates = otherAgents.length > 0
    ? `\n群里还有：${otherAgents.map((item) => `${item.name}（${item.tagline}）`).join('、')}。你可以直接回应他们的观点或点名互动。`
    : ''

  const modeGuide = mode === 'debate'
    ? `
当前是辩论模式：
- 不要每个人都给一份完整评审，要像真实教研会一样接话、反驳、追问。
- 如果不同意，请点名回应上一位角色，说清楚“我不同意哪一点”和“为什么”。
- 允许保留分歧，但必须落到教案、课堂环节、学生理解或评价方式上。`
    : mode === 'moderated'
      ? `
当前是引导式讨论：
- 每次只推进一个具体问题，不要铺开成报告。
- 可以赞同、补充、追问，也可以温和指出分歧。
- 需要有人阶段性收束，把共识和待确认点说清楚。`
      : `
当前是自由讨论：
- 像群聊一样自然发言，优先回应别人刚说过的话。
- 不要重复别人的句式和结论。`

  const toneGuide = getRoomToneGuide(strategy?.roomTone)
  const citationGuide = getCitationGuide(strategy?.citationPolicy)
  const boundaryGuide = capabilityInstruction
    ? `\n身份与能力边界：\n${capabilityInstruction}`
    : ''

  return `${agent.system_prompt}
你必须使用简体中文回复。
${teammates}
${modeGuide}
${toneGuide}
${citationGuide}
${boundaryGuide}
${docContext}

记住：
1. 你正在一个教研讨论群里发言，语气要像真实群聊，不要像写长报告。
2. 回答控制在 2-4 句，优先回应别人已经说过的话。
3. 不要泛泛而谈，要尽量落到教学设计、课堂执行、学生理解、评价反馈这些具体点上。
4. 如果群里已经有文档或评审结论，就基于内容说话，不要再问“有没有文档”。`
}

function getRoomToneGuide(tone?: ChatRoomStrategy['roomTone']) {
  switch (tone) {
    case 'brainstorm':
      return '\n聊天室气质：头脑风暴。允许提出新角度，但每次只贡献一个清晰想法。'
    case 'teaching-seminar':
      return '\n聊天室气质：教学研讨。优先围绕课堂实施、学生理解和可观察证据发言。'
    case 'product-review':
      return '\n聊天室气质：产品评审。优先围绕用户价值、流程阻力、风险和优先级发言。'
    case 'review-meeting':
    default:
      return '\n聊天室气质：专业评审会。观点要短、准、可追问，避免空泛表态。'
  }
}

function getCitationGuide(policy?: ChatRoomStrategy['citationPolicy']) {
  switch (policy) {
    case 'required':
      return '\n引用策略：涉及文档、评审或数据判断时必须给出具体依据；没有依据就明确说需要补证据。'
    case 'none':
      return '\n引用策略：不强制展示引用，但仍要让理由具体可检查。'
    case 'optional':
    default:
      return '\n引用策略：可引用但不强制。用户追问依据时，优先回到原文、评审结论或具体例子。'
  }
}

function uniqueDocuments(documents: Array<Document | null | undefined>) {
  const seen = new Set<string>()
  const result: Document[] = []

  for (const document of documents) {
    if (!document || seen.has(document.id)) continue
    seen.add(document.id)
    result.push(document)
  }

  return result
}

function buildDocumentSnippet(document: Document, length = 420) {
  const source = document.summary || document.raw_content || ''
  return source.replace(/\s+/g, ' ').trim().slice(0, length)
}

function buildAttachmentContext(document: Document) {
  return `【附带文档】${document.title}\n${buildDocumentSnippet(document, 300)}`
}

function buildRoomContext(
  primaryDocument: Document | null,
  attachedDocuments: Document[],
  review: Review | null | undefined,
  topicTags: string[] | undefined,
) {
  const sections: string[] = []

  if (primaryDocument) {
    sections.push(`\n\n【当前主文档】${primaryDocument.title}`)
    sections.push(buildDocumentSnippet(primaryDocument, 2600))
  }

  if (attachedDocuments.length > 0) {
    sections.push('\n\n【最近消息里附带的文档】')
    sections.push(...attachedDocuments.map((document, index) => `${index + 1}. ${document.title}：${buildDocumentSnippet(document, 260)}`))
  }

  if (review?.summary) {
    const summaryBits = [
      review.summary.overview ? `总体诊断：${review.summary.overview}` : '',
      review.summary.pain_points?.length ? `关键痛点：${review.summary.pain_points.join('；')}` : '',
      review.summary.consensus?.length ? `已有共识：${review.summary.consensus.join('；')}` : '',
      review.summary.top_suggestions?.length
        ? `优先建议：${review.summary.top_suggestions.slice(0, 3).map((item) => item.title || item.content).join('；')}`
        : '',
    ].filter(Boolean)

    if (summaryBits.length > 0) {
      sections.push('\n\n【关联评审结论】')
      sections.push(...summaryBits)
    }
  }

  if (topicTags?.length) {
    sections.push(`\n\n【建议优先推进的话题】${topicTags.join('；')}`)
  }

  return sections.join('\n')
}

function buildMessageContent(message: ChatMessage, documentMap: Map<string, Document>) {
  if (!message.attachment) {
    return message.content
  }

  const attachment = documentMap.get(message.attachment.documentId)
  if (!attachment) {
    return `${message.content}\n\n【附带文档】${message.attachment.title}`
  }

  return `${message.content}\n\n${buildAttachmentContext(attachment)}`
}

function buildRecentContextMessages(messages: ChatMessage[], documentMap: Map<string, Document>) {
  return messages.slice(-MAX_RECENT_MESSAGES).map((message) => ({
    role: (message.sender_type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content:
      message.sender_type === 'agent' && message.sender_id !== 'system'
        ? `[${message.sender_name}]: ${buildMessageContent(message, documentMap)}`
        : buildMessageContent(message, documentMap),
  }))
}

function mergeUniqueMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message)
    }
  }
  return Array.from(byId.values())
}

function buildContextSummary(usedContext: string[]) {
  return usedContext.length > 0
    ? `Used layered context: ${usedContext.join(', ')}`
    : 'No layered context sections were available.'
}

function citationRefs(metadata: AgentMessageMetadata): string[] {
  return (metadata.citations ?? []).map((citation) =>
    [citation.source, citation.documentId, citation.section, citation.title, citation.text]
      .filter(Boolean)
      .join(':')
  )
}

function persistStrategyLogEntry(entry: StrategyLogEntry) {
  if (typeof window === 'undefined') return

  try {
    const key = `chat-strategy-log:${entry.roomId}`
    const previous = JSON.parse(window.localStorage.getItem(key) || '[]') as StrategyLogEntry[]
    window.localStorage.setItem(key, JSON.stringify([...previous, entry].slice(-120)))
    window.dispatchEvent(new CustomEvent('chat-strategy-log', { detail: entry }))
  } catch {
    // Strategy logs are diagnostic only; storage failures should never block chat.
  }
}

function createVirtualUserMessage(content: string): ChatMessage {
  return {
    id: `virtual-${createId()}`,
    room_id: 'virtual',
    sender_type: 'user',
    sender_id: 'virtual-user',
    sender_name: '用户',
    content,
    created_at: new Date().toISOString(),
  }
}

function buildAgendaFromContext(
  roomTopic: string,
  primaryDocument: Document | null,
  review: Review | null | undefined,
  topicTags: string[] | undefined,
) {
  const topicPool = new TopicPool()
  if (primaryDocument) topicPool.loadFromDocument(primaryDocument)
  if (review) topicPool.loadFromReview(review)
  topicTags?.forEach((tag) => topicPool.addTopic(tag, 'user', 3))

  const seededTopics = topicPool.getAll().slice(0, 6)
  if (seededTopics.length === 0) {
    return [
      {
        id: `agenda-${createId()}`,
        text: roomTopic,
        source: 'user' as const,
        priority: 1,
        status: 'active' as const,
      },
    ] satisfies ChatAgendaItem[]
  }

  return seededTopics.map((topic, index) => ({
    id: topic.id,
    text: topic.text,
    source: topic.source,
    priority: topic.priority,
    status: index === 0 ? 'active' : 'pending',
  })) satisfies ChatAgendaItem[]
}

function getAgentTopicFit(agent: Agent, topicText: string) {
  const text = topicText.toLowerCase()
  const focusHit = agent.focusDimension && text.includes(agent.focusDimension.toLowerCase()) ? 2.4 : 0
  const expertiseHit = agent.expertise.reduce((score, item) => score + (text.includes(item.toLowerCase()) ? 0.9 : 0), 0)
  const categoryBonus = agent.category === 'student' && /学生|理解|梯度|难点|练习|听懂/.test(topicText)
    ? 1.3
    : agent.category === 'parent' && /效果|负担|作业|成长|评价/.test(topicText)
      ? 1.1
      : agent.category === 'teacher'
        ? 0.4
        : 0

  return focusHit + expertiseHit + categoryBonus
}

function getRecentSpeakerPenalty(agent: Agent, recentMessages: ChatMessage[]) {
  const lastIndex = [...recentMessages].reverse().findIndex((message) => message.sender_id === agent.id)
  if (lastIndex === 0) return -4
  if (lastIndex === 1) return -1.6
  if (lastIndex === 2) return -0.8
  return 0
}

function pickBestAgent(
  participants: Agent[],
  recentMessages: ChatMessage[],
  topicText: string,
  excludedIds: string[] = [],
  prefer?: (agent: Agent) => number,
) {
  return participants
    .filter((agent) => !excludedIds.includes(agent.id))
    .map((agent) => ({
      agent,
      score:
        getAgentTopicFit(agent, topicText) +
        getRecentSpeakerPenalty(agent, recentMessages) +
        (prefer?.(agent) || 0) +
        Math.random() * 0.3,
    }))
    .sort((left, right) => right.score - left.score)[0]?.agent
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.sender_type === 'user')
}

function inferUserIntent(message?: ChatMessage): DiscussionTurnIntent | null {
  const content = message?.content || ''
  if (!content) return null
  if (/[？?]|为什么|怎么|如何|能不能|是不是|要不要/.test(content)) return 'question'
  if (/不同意|不对|但是|可是|我觉得|我担心|有问题|不合理/.test(content)) return 'challenge'
  if (/总结|归纳|收束|结论|共识|下一步/.test(content)) return 'synthesize'
  if (/依据|证据|原文|文档|哪里|具体|举例/.test(content)) return 'evidence'
  return 'open'
}

function buildRoundFocus(recentMessages: ChatMessage[], topic?: ChatAgendaItem | null) {
  const latestUserMessage = getLatestUserMessage(recentMessages)
  const userFocus = latestUserMessage?.content.replace(/\s+/g, ' ').trim()
  const topicFocus = topic?.text || ''

  if (userFocus && topicFocus && !userFocus.includes(topicFocus)) {
    return `用户刚才说：“${userFocus}”。当前议题：“${topicFocus}”。`
  }

  return userFocus || topicFocus || recentMessages[recentMessages.length - 1]?.content || '当前问题'
}

function getUserAlignmentBonus(agent: Agent, userMessage?: ChatMessage) {
  const content = userMessage?.content || ''
  if (!content) return 0
  const targetMention = content.includes(`@${agent.name}`) || content.includes(agent.name)
  const focusBonus = getAgentTopicFit(agent, content)
  const categoryBonus = agent.category === 'student' && /学生|听不懂|卡住|练习|课堂感受/.test(content)
    ? 1.6
    : agent.category === 'parent' && /家长|孩子|压力|作业|效果|负担/.test(content)
      ? 1.4
      : agent.category === 'teacher' && /教案|教学|课程|目标|重点|难点|梯度/.test(content)
        ? 0.7
        : 0

  return (targetMention ? 6 : 0) + focusBonus + categoryBonus
}

function getIntentLabel(intent: DiscussionTurnIntent) {
  switch (intent) {
    case 'open': return '先抛出明确判断'
    case 'challenge': return '提出不同意见'
    case 'support': return '补充或支持'
    case 'question': return '追问关键细节'
    case 'evidence': return '引用材料举证'
    case 'synthesize': return '收束共识分歧'
  }
}

function buildDiscussionTurns(
  participants: Agent[],
  recentMessages: ChatMessage[],
  mode: DiscussionMode,
  topic: ChatAgendaItem | null | undefined,
  strategy?: ChatRoomStrategy,
  targetAgent?: Agent,
  capabilityProfiles?: Record<string, CapabilityProfile>,
) {
  const routedEvents = routeChatEvents({
    messages: recentMessages,
    participants,
    currentTopic: topic || null,
  })

  const plannedTurns = planDiscussionTurns({
    participants,
    messages: recentMessages,
    events: routedEvents,
    currentTopic: topic || null,
    capabilityProfiles,
    strategy: {
      discussionMode: mode,
      conflictLevel: strategy?.conflictLevel || (mode === 'debate' ? 'intense' : 'balanced'),
      initiativeLevel: strategy?.initiativeLevel || (mode === 'free' ? 'standard' : 'high'),
    },
  })

  if (plannedTurns.length > 0) {
    return plannedTurns.map((turn) => ({
      agent: turn.agent,
      intent: mapPlannedIntent(turn.intent, turn.wasPostureTranslated),
      targetAgent: turn.event.targetAgentId
        ? participants.find((agent) => agent.id === turn.event.targetAgentId)
        : targetAgent,
      focus: turn.focus,
      event: turn.event,
      speakingPosture: turn.speakingPosture,
      capabilityProfile: turn.capabilityProfile,
      wasPostureTranslated: turn.wasPostureTranslated,
      reason: turn.reason,
    })) satisfies DiscussionTurn[]
  }

  const latestUserMessage = getLatestUserMessage(recentMessages)
  const userIntent = inferUserIntent(latestUserMessage)
  const topicText = buildRoundFocus(recentMessages, topic)
  if (targetAgent) {
    return [{ agent: targetAgent, intent: userIntent || 'open', focus: topicText }] satisfies DiscussionTurn[]
  }

  const collisions = detectCollisions(recentMessages, participants, 8)
  const turns: DiscussionTurn[] = []
  const usedIds: string[] = []

  const opener = pickBestAgent(
    participants,
    recentMessages,
    topicText,
    usedIds,
    (agent) => getUserAlignmentBonus(agent, latestUserMessage)
  )
  if (opener) {
    turns.push({ agent: opener, intent: userIntent || 'open', focus: topicText })
    usedIds.push(opener.id)
  }

  if (mode === 'debate') {
    const collision = collisions[0]
    const shouldChallengeUser = userIntent === 'challenge' || userIntent === 'question'
    const challenger = collision?.agentB.id !== opener?.id
      ? collision?.agentB
      : pickBestAgent(
          participants,
          recentMessages,
          topicText,
          usedIds,
          (agent) =>
            agent.personality.directness * 0.25 +
            agent.personality.strictness * 0.22 +
            getUserAlignmentBonus(agent, latestUserMessage) * 0.35
        )
    if (challenger) {
      turns.push({ agent: challenger, intent: shouldChallengeUser ? 'challenge' : 'question', targetAgent: opener, focus: collision?.topic || topicText })
      usedIds.push(challenger.id)
    }

    const synthesizer = pickBestAgent(
      participants,
      recentMessages,
      topicText,
      usedIds,
      (agent) => agent.personality.empathy * 0.24 - agent.personality.directness * 0.08 + getUserAlignmentBonus(agent, latestUserMessage) * 0.12
    )
    if (synthesizer) {
      turns.push({ agent: synthesizer, intent: 'synthesize', focus: topicText })
    }

    return turns.slice(0, 3)
  }

  const secondIntent: DiscussionTurnIntent = userIntent === 'question'
    ? 'evidence'
    : mode === 'moderated'
      ? 'question'
      : 'support'
  const second = pickBestAgent(
    participants,
    recentMessages,
    topicText,
    usedIds,
    (agent) =>
      (secondIntent === 'question' ? agent.personality.directness * 0.15 + agent.personality.empathy * 0.12 : agent.personality.empathy * 0.16) +
      getUserAlignmentBonus(agent, latestUserMessage) * 0.25
  )
  if (second) {
    turns.push({ agent: second, intent: secondIntent, targetAgent: opener, focus: topicText })
  }

  return turns.slice(0, mode === 'free' ? 2 : 3)
}

function mapPlannedIntent(intent: TurnIntent, translated: boolean): DiscussionTurnIntent {
  if (translated && intent === 'support') return 'support'

  switch (intent) {
    case 'challenge':
      return 'challenge'
    case 'evidence':
      return 'evidence'
    case 'question':
      return 'question'
    case 'synthesize':
      return 'synthesize'
    case 'support':
      return 'support'
    case 'open':
    case 'progress':
      return 'open'
  }
}

function buildTurnInstruction(turn: DiscussionTurn, index: number, mode: DiscussionMode) {
  const target = turn.targetAgent ? `请直接回应 ${turn.targetAgent.name} 刚才的观点。` : ''
  const sharedRules = [
    `本轮你的任务：${getIntentLabel(turn.intent)}。`,
    `讨论焦点：“${turn.focus.slice(0, 80)}”。`,
    target,
    '不要重新完整评审全文，不要复述背景，不要输出报告格式。',
    '像真实教研群发言：2-4句，有态度，有具体理由。',
  ]

  const intentRule = (() => {
    switch (turn.intent) {
      case 'open':
        return index === 0
          ? '先抛出一个鲜明判断，再给一个最具体的理由。'
          : '接住前面的话，换一个角度补充，不要重复。'
      case 'challenge':
        return '必须明确说出你不同意或担心哪一点，并给出替代判断。可以点名，但不要吵架。'
      case 'support':
        return '先说你赞同哪一点，再补一个别人没说到的证据或课堂后果。'
      case 'question':
        return '提出一个会推动讨论继续往下走的问题，问题后面补一句你为什么问。'
      case 'evidence':
        return '尽量引用文档、评审结论或课堂环节作为证据，不要空泛。'
      case 'synthesize':
        return mode === 'debate'
          ? '请收束当前分歧：哪一点已有共识，哪一点还需要继续争。最后给一个下一步动作。'
          : '请把刚才的观点压成一句共识和一个待确认问题。'
    }
  })()

  return [...sharedRules, intentRule].filter(Boolean).join('\n')
}

function getMetadataBadgeClass(tone: MetadataBadgeTone) {
  switch (tone) {
    case 'document':
      return 'border-blue-100 bg-blue-50 text-blue-700'
    case 'review':
      return 'border-violet-100 bg-violet-50 text-violet-700'
    case 'experience':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-100 bg-amber-50 text-amber-700'
    case 'neutral':
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600'
  }
}

function getFeedbackToneClass(tone: 'neutral' | 'document' | 'evidence' | 'conflict' | 'summary') {
  switch (tone) {
    case 'document':
      return 'border-blue-100 bg-blue-50 text-blue-700'
    case 'evidence':
      return 'border-cyan-100 bg-cyan-50 text-cyan-700'
    case 'conflict':
      return 'border-amber-100 bg-amber-50 text-amber-700'
    case 'summary':
      return 'border-violet-100 bg-violet-50 text-violet-700'
    case 'neutral':
    default:
      return 'border-gray-200 bg-white text-gray-600'
  }
}

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const room = useChatStore((state) => state.rooms.find((item) => item.id === id))
  const messagesMap = useChatStore((state) => state.messages)
  const messages = messagesMap[id || ''] || EMPTY_MESSAGES
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessageStatus = useChatStore((state) => state.updateMessageStatus)
  const addParticipant = useChatStore((state) => state.addParticipant)
  const closeRoom = useChatStore((state) => state.closeRoom)
  const removeRoom = useChatStore((state) => state.removeRoom)
  const updateDiscussionState = useChatStore((state) => state.updateDiscussionState)
  const setAgenda = useChatStore((state) => state.setAgenda)
  const activateAgendaTopic = useChatStore((state) => state.activateAgendaTopic)
  const completeAgendaTopic = useChatStore((state) => state.completeAgendaTopic)
  const addBookmarkFn = useChatStore((state) => state.addBookmark)
  const removeBookmarkFn = useChatStore((state) => state.removeBookmark)
  const addReaction = useChatStore((state) => state.addReaction)
  const removeReaction = useChatStore((state) => state.removeReaction)
  const bookmarks = useChatStore((state) => state.bookmarks).filter((item) => item.roomId === id)
  const summaries = useChatStore((state) => state.summaries).filter((item) => item.roomId === id)
  const addSummary = useChatStore((state) => state.addSummary)
  const allAgents = useAgentStore((state) => state.agents)
  const allDocuments = useDocumentStore((state) => state.documents)
  const review = useReviewStore((state) => state.reviews.find((item) => item.id === room?.review_id))
  const config = useSettingsStore((state) => state.currentConfig)
  const hasValidConfig = isModelConfigValid(config)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [typingAgentIds, setTypingAgentIds] = useState<string[]>([])
  const [activeFeedbackSteps, setActiveFeedbackSteps] = useState<FeedbackStep[]>([])
  const [showDoc, setShowDoc] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [filteredAgentId, setFilteredAgentId] = useState<string | null>(null)
  const [pendingAttachment, setPendingAttachment] = useState<ChatMessageAttachment | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const kickoffSeedRef = useRef<string | null>(null)
  const failureStateRef = useRef<Record<string, AgentFailureState>>({})
  const strategyLogRef = useRef<StrategyLogEntry[]>([])

  const participants = room?.participants ?? EMPTY_PARTICIPANTS
  const roomStrategy = useMemo(
    () => (room ? normalizeChatRoomStrategy(room.strategy, room.discussionMode) : undefined),
    [room]
  )
  const discussionMode: DiscussionMode = roomStrategy?.discussionMode || (review ? 'moderated' : 'free')
  const discussionState: DiscussionState = room?.discussionState || (room?.status === 'closed' ? 'closed' : 'idle')
  const agenda = room?.pendingTopics ?? EMPTY_AGENDA
  const currentTopic = agenda.find((topic) => topic.id === room?.currentTopicId) || agenda.find((topic) => topic.status === 'active') || null
  const remainingTopics = agenda.filter((topic) => topic.status === 'pending').length
  const feedbackDisplay = useMemo(() => buildFeedbackDisplay(activeFeedbackSteps), [activeFeedbackSteps])
  const documentMap = useMemo(() => new Map(allDocuments.map((document) => [document.id, document])), [allDocuments])
  const doc = useMemo(() => room?.document_id ? documentMap.get(room.document_id) || null : null, [documentMap, room])
  const capabilityProfiles = useMemo(
    () => Object.fromEntries(participants.map((agent) => [agent.id, inferCapabilityProfile(agent)])) as Record<string, CapabilityProfile>,
    [participants]
  )
  const attachedDocuments = useMemo(() => {
    const recentAttachments = messages
      .slice(-8)
      .map((message) => (message.attachment ? documentMap.get(message.attachment.documentId) : undefined))
    return uniqueDocuments(recentAttachments)
  }, [documentMap, messages])
  const validFilteredAgentId = useMemo(
    () => participants.some((participant) => participant.id === filteredAgentId) ? filteredAgentId : null,
    [filteredAgentId, participants]
  )
  const activeFilterAgent = useMemo(
    () => participants.find((participant) => participant.id === validFilteredAgentId) || null,
    [validFilteredAgentId, participants]
  )
  const visibleMessages = useMemo(() => {
    if (!validFilteredAgentId) return messages
    return messages.filter((message) => (
      message.sender_type !== 'agent' ||
      !message.sender_color ||
      message.sender_id === validFilteredAgentId
    ))
  }, [messages, validFilteredAgentId])
  const reviewSuggestions = useMemo(() => {
    const collected = [
      ...(review?.summary?.top_suggestions || []),
      ...(review?.agent_reviews || []).flatMap((agentReview) => agentReview.suggestions || []),
    ]
    const seen = new Set<string>()
    return collected.filter((suggestion) => {
      const key = `${suggestion.title || ''}-${suggestion.content}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 8)
  }, [review])

  const recordStrategyLog = useCallback(
    (input: Omit<StrategyLogInput, 'roomId'>) => {
      if (!id) return
      const entry = createStrategyLogEntry({ roomId: id, ...input })
      strategyLogRef.current = [...strategyLogRef.current, entry].slice(-120)
      persistStrategyLogEntry(entry)
    },
    [id]
  )

  useEffect(() => {
    if (!id || !room) return
    if ((room.pendingTopics || []).length > 0) return

    const agendaItems = buildAgendaFromContext(room.topic, doc, review, room.topicTags)
    setAgenda(id, agendaItems, agendaItems[0]?.id)
  }, [doc, id, review, room, setAgenda])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const getEventInstruction = useCallback((agent: Agent, recentMessages: ChatMessage[]) => {
    const event = evaluateTriggers(recentMessages, agent)
      .sort((left, right) => right.probability - left.probability)[0]
    return event ? getEventPromptSuffix(event) : ''
  }, [])

  const getAgentReply = useCallback(
    async (
      agent: Agent,
      recentMessages: ChatMessage[],
      signal?: AbortSignal,
      extraInstruction?: string,
      requestedPosture?: SpeakingPosture,
    ): Promise<AgentReplyResult> => {
      const otherAgents = participants.filter((item) => item.id !== agent.id)
      const profile = capabilityProfiles[agent.id] ?? inferCapabilityProfile(agent)
      const supplementalDocuments = attachedDocuments.filter((document) => document.id !== doc?.id)
      const contextDocuments = uniqueDocuments([doc, ...supplementalDocuments])
      const memoryMap = buildAgentMemoryMap(mergeUniqueMessages(messages, recentMessages))
      const assembledContext = assembleLayeredContext({
        contextDepth: roomStrategy?.contextDepth || 'deep',
        roomTopic: room?.topic,
        roomTone: roomStrategy?.roomTone,
        currentTopic: currentTopic?.text,
        documents: contextDocuments,
        reviewSummary: review?.summary,
        recentMessages,
        agentMemory: formatAgentMemoryForContext(memoryMap[agent.id]),
      })
      const usedContext = assembledContext.sections.map((section) => `${section.type}:${section.title}`)
      const legacyContext = buildRoomContext(doc, supplementalDocuments, review, room?.topicTags)
      const contextPrompt = assembledContext.promptText || legacyContext
      const capabilityInstruction = roomStrategy?.identityBoundary === 'off'
        ? ''
        : buildCapabilityInstruction(profile)
      const systemPrompt = buildChatSystemPrompt(agent, contextPrompt, otherAgents, discussionMode, roomStrategy, capabilityInstruction)
      const historyMessages = buildRecentContextMessages(recentMessages, documentMap)
      const finalMessages = extraInstruction
        ? [...historyMessages, { role: 'user' as const, content: extraInstruction }]
        : historyMessages

      const initial = await requestChatCompletion([{ role: 'system', content: systemPrompt }, ...finalMessages], signal)
      let text = initial.text
      let outputWasRewritten = false
      let finalPosture = requestedPosture
      let wasPostureTranslated = false

      if (text && roomStrategy?.identityBoundary !== 'off') {
        const validation = validateAndAdaptResponse({
          content: text,
          profile,
          requestedPosture,
          topic: currentTopic?.text || room?.topic,
          agentName: agent.name,
        })
        finalPosture = validation.recommendedPosture
        wasPostureTranslated = validation.recommendedPosture !== requestedPosture

        if (validation.needsRewrite && validation.rewriteInstruction) {
          const rewrite = await requestChatCompletion(
            [
              {
                role: 'system',
                content: [
                  validation.rewriteInstruction,
                  '只输出重写后的聊天室发言，不要解释规则，不要保留越权判断。',
                ].join('\n'),
              },
              { role: 'user', content: `原回复：\n${text}` },
            ],
            signal,
          )
          const rewriteValidation = rewrite.text
            ? validateAndAdaptResponse({
                content: rewrite.text,
                profile,
                requestedPosture: validation.recommendedPosture,
                topic: currentTopic?.text || room?.topic,
                agentName: agent.name,
              })
            : validation

          if (rewrite.text && !rewriteValidation.needsRewrite) {
            text = rewrite.text
            finalPosture = rewriteValidation.recommendedPosture
            outputWasRewritten = true
          } else {
            text = createIdentitySafeFallbackReply({
              agent,
              profile,
              focus: currentTopic?.text || room?.topic,
              requestedPosture,
              violations: rewriteValidation.violations,
            })
            outputWasRewritten = true
            finalPosture = validation.recommendedPosture
          }
        }
      }

      return {
        ...initial,
        text,
        usedContext,
        contextSummary: buildContextSummary(usedContext),
        finalPosture,
        wasPostureTranslated,
        outputWasRewritten,
      }
    },
    [
      attachedDocuments,
      capabilityProfiles,
      currentTopic?.text,
      discussionMode,
      doc,
      documentMap,
      messages,
      participants,
      review,
      room?.topic,
      room?.topicTags,
      roomStrategy,
    ]
  )

  const addAgentMsg = useCallback(
    (
      agent: Agent,
      content: string,
      metadata?: Pick<ChatMessage, 'intent' | 'respondingTo' | 'contextSource' | 'evidenceLevel' | 'citations'>,
    ) => {
      if (!id) return

      addMessage(id, {
        id: createId(),
        room_id: id,
        sender_type: 'agent',
        sender_id: agent.id,
        sender_name: agent.name,
        sender_color: agent.color,
        content,
        ...metadata,
        created_at: new Date().toISOString(),
      })

      if (user?.name && content.includes(`@${user.name}`)) {
        toast('info', `${agent.name} 提到了你`)
      }
    },
    [addMessage, id, user]
  )

  const runDiscussionRound = useCallback(async (recentMessages: ChatMessage[], targetAgent?: Agent, topic?: ChatAgendaItem | null) => {
      if (!participants.length) return

      if (id) {
        updateDiscussionState(id, 'discussing')
        if (topic?.id) {
          activateAgendaTopic(id, topic.id)
        }
      }

      const turns = buildDiscussionTurns(participants, recentMessages, discussionMode, topic, roomStrategy, targetAgent, capabilityProfiles)
      const conversation = [...recentMessages]
      let responsesAdded = 0
      let skippedForRepetition = 0

      for (let index = 0; index < turns.length; index += 1) {
        const turn = turns[index]
        let agent = turn.agent
        if (abortRef.current?.signal.aborted) break

        const instructionParts = [
          buildTurnInstruction(turn, index, discussionMode),
          getEventInstruction(agent, conversation),
        ].filter(Boolean)

        const feedbackSteps = turn.event
          ? getFeedbackSteps(turn.event, roomStrategy?.feedbackLevel || 'simple')
          : ['agent_typing' as FeedbackStep]
        const respondingTo = turn.targetAgent && turn.targetAgent.id !== agent.id
          ? { agentId: turn.targetAgent.id, label: turn.targetAgent.name }
          : undefined

        setActiveFeedbackSteps(feedbackSteps)
        setTypingAgentIds([agent.id])
        if (index > 0) {
          await randomDelay(650, 1400)
        }

        let replyResult = await getAgentReply(
          agent,
          conversation,
          abortRef.current?.signal,
          instructionParts.length > 0 ? instructionParts.join('\n') : undefined,
          turn.speakingPosture,
        )

        if (replyResult.failed || !replyResult.text) {
          const currentFailure = failureStateRef.current[agent.id] ?? { agentId: agent.id, failedAttempts: 0 }
          const failureState: AgentFailureState = {
            agentId: agent.id,
            failedAttempts: currentFailure.failedAttempts + 1,
            lastError: replyResult.error,
          }
          failureStateRef.current = { ...failureStateRef.current, [agent.id]: failureState }
          const recoveryPlan = planFailureRecovery({
            failedAgent: agent,
            participants,
            failureState,
            capabilityProfiles,
          })

          recordStrategyLog({
            agentId: agent.id,
            selectedAgentName: agent.name,
            event: turn.event,
            strategy: roomStrategy,
            contextSummary: recoveryPlan.reason,
            usedContext: replyResult.usedContext,
            requestedPosture: turn.speakingPosture,
            finalPosture: replyResult.finalPosture,
            wasPostureTranslated: Boolean(turn.wasPostureTranslated || replyResult.wasPostureTranslated),
            outputWasRewritten: Boolean(replyResult.outputWasRewritten),
          })

          if (recoveryPlan.retryAgent && recoveryPlan.action !== 'summarize_stage') {
            agent = recoveryPlan.retryAgent
            setTypingAgentIds([agent.id])
            replyResult = await getAgentReply(
              agent,
              conversation,
              abortRef.current?.signal,
              [
                instructionParts.join('\n'),
                recoveryPlan.action === 'switch_agent'
                  ? `上一位角色生成失败，请你接上当前讨论，不要提到技术错误。${recoveryPlan.reason}`
                  : `刚才生成失败，请直接给出一条更短、更具体的回复。${recoveryPlan.reason}`,
              ].filter(Boolean).join('\n'),
              turn.speakingPosture,
            )
          }
        } else {
          failureStateRef.current = {
            ...failureStateRef.current,
            [agent.id]: { agentId: agent.id, failedAttempts: 0 },
          }
        }

        setTypingAgentIds([])
        setActiveFeedbackSteps([])
        if (!replyResult.text || abortRef.current?.signal.aborted) continue

        const messageMetadata = buildTurnMessageMetadata({
          intent: turn.intent,
          event: turn.event,
          speakingPosture: replyResult.finalPosture || turn.speakingPosture,
          respondingTo,
        })
        const repetition = guardAgainstRepetition({
          agentId: agent.id,
          candidateContent: replyResult.text,
          recentMessages: conversation,
          evidenceRefs: citationRefs(messageMetadata),
        })
        if (!repetition.shouldSpeak) {
          skippedForRepetition += 1
          recordStrategyLog({
            agentId: agent.id,
            selectedAgentName: agent.name,
            event: turn.event,
            strategy: roomStrategy,
            contextSummary: `${repetition.reason} Matched message: ${repetition.matchedMessageId || 'unknown'}.`,
            usedContext: replyResult.usedContext,
            requestedPosture: turn.speakingPosture,
            finalPosture: replyResult.finalPosture,
            wasPostureTranslated: Boolean(turn.wasPostureTranslated || replyResult.wasPostureTranslated),
            outputWasRewritten: Boolean(replyResult.outputWasRewritten),
          })
          continue
        }

        addAgentMsg(agent, replyResult.text, messageMetadata)
        responsesAdded += 1
        recordStrategyLog({
          agentId: agent.id,
          selectedAgentName: agent.name,
          event: turn.event,
          strategy: roomStrategy,
          contextSummary: replyResult.contextSummary,
          usedContext: replyResult.usedContext,
          requestedPosture: turn.speakingPosture,
          finalPosture: replyResult.finalPosture,
          wasPostureTranslated: Boolean(turn.wasPostureTranslated || replyResult.wasPostureTranslated),
          outputWasRewritten: Boolean(replyResult.outputWasRewritten),
        })
        conversation.push({
          id: `virtual-agent-${agent.id}-${createId()}`,
          room_id: id || 'virtual',
          sender_type: 'agent',
          sender_id: agent.id,
          sender_name: agent.name,
          sender_color: agent.color,
          content: replyResult.text,
          ...messageMetadata,
          created_at: new Date().toISOString(),
        })
      }

      if (responsesAdded === 0 && !abortRef.current?.signal.aborted) {
        const fallbackAgent = targetAgent || turns[0]?.agent || participants[0]
        if (!fallbackAgent) return

        setActiveFeedbackSteps(['agent_typing'])
        setTypingAgentIds([fallbackAgent.id])
        const fallbackReply = await getAgentReply(
          fallbackAgent,
          conversation,
          abortRef.current?.signal,
          [
            '请直接回应用户或当前最后一条消息。',
            skippedForRepetition > 0 ? buildRepetitionRecoveryInstruction('skip') : '',
            buildTurnInstruction({ agent: fallbackAgent, intent: inferUserIntent(getLatestUserMessage(conversation)) || 'open', focus: buildRoundFocus(conversation, topic) }, 0, discussionMode),
          ].filter(Boolean).join('\n'),
        )
        setTypingAgentIds([])
        setActiveFeedbackSteps([])

        if (!fallbackReply.text || abortRef.current?.signal.aborted) return

        const fallbackMetadata = buildTurnMessageMetadata({
          intent: inferUserIntent(getLatestUserMessage(conversation)) || 'open',
          speakingPosture: fallbackReply.finalPosture,
        })
        const fallbackRepetition = guardAgainstRepetition({
          agentId: fallbackAgent.id,
          candidateContent: fallbackReply.text,
          recentMessages: conversation,
          evidenceRefs: citationRefs(fallbackMetadata),
        })
        if (!fallbackRepetition.shouldSpeak) return

        addAgentMsg(fallbackAgent, fallbackReply.text, fallbackMetadata)
        recordStrategyLog({
          agentId: fallbackAgent.id,
          selectedAgentName: fallbackAgent.name,
          strategy: roomStrategy,
          contextSummary: fallbackReply.contextSummary,
          usedContext: fallbackReply.usedContext,
          finalPosture: fallbackReply.finalPosture,
          wasPostureTranslated: Boolean(fallbackReply.wasPostureTranslated),
          outputWasRewritten: Boolean(fallbackReply.outputWasRewritten),
        })
      }

      if (id && topic?.id) {
        const nextTopic = agenda.find((item) => item.status === 'pending' && item.id !== topic.id)
        completeAgendaTopic(id, topic.id, nextTopic?.id)
        updateDiscussionState(id, nextTopic ? 'discussing' : 'summarizing')
      }
  }, [
    activateAgendaTopic,
    addAgentMsg,
    agenda,
    capabilityProfiles,
    completeAgendaTopic,
    discussionMode,
    getAgentReply,
    getEventInstruction,
    id,
    participants,
    recordStrategyLog,
    roomStrategy,
    updateDiscussionState,
  ])

  useEffect(() => {
    if (!id || !room || !hasValidConfig) return
    if (participants.length === 0) return

    const agentMessages = messages.filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
    if (agentMessages.length > 0 || loading) return

    const activeTopic = currentTopic || agenda.find((topic) => topic.status === 'active') || null
    const kickoffKey = `${id}:${activeTopic?.id || 'room'}`
    if (kickoffSeedRef.current === kickoffKey) return

    kickoffSeedRef.current = kickoffKey
    const timer = window.setTimeout(() => {
      if (abortRef.current?.signal.aborted) return
      const seedText = activeTopic?.text || room.topic
      void runDiscussionRound(
        [
          createVirtualUserMessage(
            doc
              ? `请围绕“${seedText}”直接开始讨论，结合文档《${doc.title}》和评审结论给出明确判断。`
              : `请围绕“${seedText}”直接开始讨论，像真实教研群一样先抛出一个具体判断。`
          ),
        ],
        undefined,
        activeTopic,
      )
    }, 900)

    return () => window.clearTimeout(timer)
  }, [agenda, currentTopic, doc, hasValidConfig, id, loading, messages, participants.length, room, runDiscussionRound])

  const parseTargetAgent = useCallback((text: string) => {
    const match = text.match(/^@(\S+)\s+/)
    if (!match) {
      return { targetAgent: undefined, cleanText: text }
    }

    const targetAgent = participants.find((item) => item.name === match[1])
    return { targetAgent, cleanText: text.slice(match[0].length) }
  }, [participants])

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!id) return
      const targetMessage = messages.find((message) => message.id === messageId)
      const existing = targetMessage?.reactions?.find((reaction) => reaction.emoji === emoji)

      if (existing?.userReacted) {
        removeReaction(id, messageId, emoji, true)
        return
      }

      addReaction(id, messageId, emoji, true)
    },
    [addReaction, id, messages, removeReaction]
  )

  const handleGenerateSummary = useCallback(async () => {
    if (!id || !hasValidConfig) {
      toast('error', '请先配置 API Key')
      return
    }

    updateDiscussionState(id, 'summarizing')
    setSummaryLoading(true)
    const agentMessages = messages.filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
    const digest = agentMessages.slice(-20).map((message) => `[${message.sender_name}]: ${message.content}`).join('\n')

    try {
      let fullText = ''
      await new Promise<string>((resolve) => {
        chatCompletion(
          [
            {
              role: 'system',
              content:
                '你是一个教研群聊总结助手。请根据以下记录生成结构化 JSON：{"keyPoints":["..."],"agreements":["..."],"disagreements":["..."],"actionItems":["..."]}。每个数组 1-5 条，只输出 JSON。',
            },
            { role: 'user', content: `以下是聊天记录：\n\n${digest}` },
          ],
          {
            onChunk: (chunk) => {
              fullText += chunk
            },
            onDone: (text) => resolve(text),
            onError: () => resolve(fullText),
          },
        ).catch(() => resolve(fullText))
      })

      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        addSummary({
          id: createId(),
          roomId: id,
          keyPoints: parsed.keyPoints || [],
          agreements: parsed.agreements || [],
          disagreements: parsed.disagreements || [],
          actionItems: parsed.actionItems || [],
          generatedAt: new Date().toISOString(),
        })
      } else {
        const artifact = buildDiscussionArtifact(messages)
        addSummary({
          id: createId(),
          roomId: id,
          keyPoints: artifact.consensus,
          agreements: artifact.adoptedIdeas,
          disagreements: artifact.disagreements,
          actionItems: artifact.actionItems,
          generatedAt: artifact.generatedAt,
        })
      }
    } catch {
      const artifact = buildDiscussionArtifact(messages)
      addSummary({
        id: createId(),
        roomId: id,
        keyPoints: artifact.consensus,
        agreements: artifact.adoptedIdeas,
        disagreements: artifact.disagreements,
        actionItems: artifact.actionItems,
        generatedAt: artifact.generatedAt,
      })
      toast('info', '已用本地讨论纪要兜底')
    }

    setSummaryLoading(false)
    updateDiscussionState(id, room?.status === 'closed' ? 'closed' : 'idle')
  }, [addSummary, hasValidConfig, id, messages, room?.status, updateDiscussionState])

  const handleControlAction = async (actionId: ChatControlActionId) => {
    if (!id || !hasValidConfig) {
      toast('error', '请先配置 API Key')
      return
    }

    const action = resolveChatControlAction(actionId, participants)

    if (action.forceSummary) {
      setShowSummary(true)
      await handleGenerateSummary()
      return
    }

    if (participants.length === 0) {
      toast('info', '请先邀请角色加入聊天室')
      return
    }

    if (action.targetRole && !action.targetAgent) {
      toast('info', '当前聊天室没有匹配的角色')
      return
    }

    setLoading(true)
    try {
      await runDiscussionRound(
        [createVirtualUserMessage(action.instruction)],
        action.targetAgent,
        currentTopic,
      )
    } finally {
      setTypingAgentIds([])
      setActiveFeedbackSteps([])
      setLoading(false)
    }
  }

  const handleExportBookmarks = useCallback(() => {
    if (!room) return
    const markdown = exportBookmarksAsMarkdown(bookmarks, messages, room.topic)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `收藏-${room.topic}.md`
    link.click()
    URL.revokeObjectURL(url)
    toast('success', '收藏已导出')
  }, [bookmarks, messages, room])

  const handleJumpToMessage = useCallback((messageId: string) => {
    const element = scrollRef.current?.querySelector(`[data-msg-id="${messageId}"]`)
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.add('ring-2', 'ring-primary-400')
    setTimeout(() => element.classList.remove('ring-2', 'ring-primary-400'), 2000)
  }, [])

  const handleDocAttach = useCallback((document: { id: string; title: string; file_type: string }) => {
    setPendingAttachment({
      documentId: document.id,
      title: document.title,
      fileType: document.file_type,
    })
    setShowDocPicker(false)
    inputRef.current?.focus()
  }, [])

  const handleFollowUp = useCallback((message: ChatMessage) => {
    const quotedContent = message.content.replace(/\s+/g, ' ').trim().slice(0, 120)
    setReplyTo(message)
    setInput(`@${message.sender_name} 针对${message.sender_name}的观点：“${quotedContent}”\n\n我想追问：`)
    inputRef.current?.focus()
  }, [])

  const handleQuoteSuggestion = useCallback((suggestion: Suggestion) => {
    const suggestionText = suggestion.title
      ? `${suggestion.title}：${suggestion.content}`
      : suggestion.content
    setInput(`引用评审建议：“${suggestionText}”\n\n请围绕这条建议展开讨论。`)
    setReplyTo(null)
    inputRef.current?.focus()
  }, [])

  const handleSlashCommand = useCallback(
    (command: { id: string }) => {
      setSlashQuery(null)
      setInput('')

      switch (command.id) {
        case 'quote': {
          const lastAgentMessage = [...messages].reverse().find((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
          if (lastAgentMessage) setReplyTo(lastAgentMessage)
          else toast('info', '没有可引用的消息')
          break
        }
        case 'doc':
          setShowDocPicker(true)
          break
        case 'vote':
          toast('info', '投票功能开发中')
          break
        case 'summary':
          setShowSummary(true)
          handleGenerateSummary()
          break
        case 'collect': {
          const lastMessage = [...messages].reverse().find((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
          if (lastMessage && id) {
            addBookmarkFn({ id: createId(), roomId: id, messageId: lastMessage.id, createdAt: new Date().toISOString() })
            toast('success', '已收藏最近一条消息')
          } else {
            toast('info', '没有可收藏的消息')
          }
          break
        }
        case 'event':
          toast('info', '角色事件触发已接入自动策略，无需手动触发')
          break
      }

      inputRef.current?.focus()
    },
    [addBookmarkFn, handleGenerateSummary, id, messages]
  )

  const handleSend = useCallback(async () => {
    if ((!input.trim() && !pendingAttachment) || loading || !id) return

    const rawText = input.trim()
    const normalizedText = rawText || '我附上了一份文档，请先阅读并结合内容继续讨论。'
    const { targetAgent, cleanText } = parseTargetAgent(normalizedText)
    const promptText = targetAgent ? cleanText : normalizedText
    const pendingDocument = pendingAttachment ? documentMap.get(pendingAttachment.documentId) : undefined
    const enrichedPrompt = pendingDocument
      ? `${promptText}\n\n${buildAttachmentContext(pendingDocument)}`
      : promptText

    setInput('')
    setSlashQuery(null)

    const messageId = createId()
    const userMessage: ChatMessage = {
      id: messageId,
      room_id: id,
      sender_type: 'user',
      sender_id: user?.id || '',
      sender_name: user?.name || '我',
      content: normalizedText,
      target_agent_id: targetAgent?.id,
      reply_to: replyTo?.id,
      replyToMessage: replyTo ? { senderName: replyTo.sender_name, content: replyTo.content } : undefined,
      attachment: pendingAttachment || undefined,
      status: 'sending',
      created_at: new Date().toISOString(),
    }

    addMessage(id, userMessage)
    setReplyTo(null)
    setPendingAttachment(null)
    updateMessageStatus(id, messageId, 'sent')

    if (!hasValidConfig) {
      addMessage(id, {
        id: createId(),
        room_id: id,
        sender_type: 'agent',
        sender_id: 'system',
        sender_name: '系统',
        content: '请先到设置页面配置有效的 API Key，角色才能继续发言。',
        created_at: new Date().toISOString(),
      })
      return
    }

    setLoading(true)
    updateDiscussionState(id, 'discussing')
    const controller = new AbortController()
    abortRef.current = controller

    const recentConversation: ChatMessage[] = [
      ...messages.slice(-MAX_RECENT_MESSAGES + 1),
      {
        ...userMessage,
        content: enrichedPrompt,
      },
    ]

    try {
      await runDiscussionRound(recentConversation, targetAgent, currentTopic)
      updateMessageStatus(id, messageId, 'delivered')
    } catch {
      updateMessageStatus(id, messageId, 'failed')
      toast('error', '消息发送后，角色回复失败')
    } finally {
      setTypingAgentIds([])
      setActiveFeedbackSteps([])
      setLoading(false)
    }
  }, [
    addMessage,
    currentTopic,
    documentMap,
    hasValidConfig,
    id,
    input,
    loading,
    messages,
    parseTargetAgent,
    pendingAttachment,
    replyTo,
    runDiscussionRound,
    updateDiscussionState,
    updateMessageStatus,
    user,
  ])

  const handleInvite = useCallback(
    async (agent: Agent) => {
      if (!id) return

      addParticipant(id, agent)
      setShowInvite(false)
      toast('success', `已邀请「${agent.name}」加入聊天室`)

      addMessage(id, {
        id: createId(),
        room_id: id,
        sender_type: 'agent',
        sender_id: 'system',
        sender_name: '系统',
        content: `${agent.avatar || ''} ${agent.name} 加入了聊天室`,
        created_at: new Date().toISOString(),
      })

      if (!hasValidConfig) return

      setLoading(true)
      const controller = new AbortController()
      abortRef.current = controller

      await randomDelay(600, 1400)
      const recentConversation = messages.slice(-6)
      const introPrompt = doc
        ? `你刚加入一个围绕《${doc.title}》的教研讨论群。请先自然打个招呼，然后结合现有讨论补上一条你最想推进的观点。`
        : `你刚加入一个讨论群，主题是“${room?.topic || '自由讨论'}”。请先自然打个招呼，再补上你的观点。`

      const reply = await getAgentReply(
        agent,
        [...recentConversation, createVirtualUserMessage(introPrompt)],
        controller.signal,
        getEventInstruction(agent, recentConversation),
      )

      if (reply.text && !controller.signal.aborted) {
        addAgentMsg(agent, reply.text)
        recordStrategyLog({
          agentId: agent.id,
          selectedAgentName: agent.name,
          strategy: roomStrategy,
          contextSummary: reply.contextSummary,
          usedContext: reply.usedContext,
          finalPosture: reply.finalPosture,
          wasPostureTranslated: Boolean(reply.wasPostureTranslated),
          outputWasRewritten: Boolean(reply.outputWasRewritten),
        })
      }

      setTypingAgentIds([])
      setLoading(false)
    },
    [addAgentMsg, addMessage, addParticipant, doc, getAgentReply, getEventInstruction, hasValidConfig, id, messages, recordStrategyLog, room?.topic, roomStrategy]
  )

  const availableToInvite = allAgents.filter((agent) => !participants.some((item) => item.id === agent.id))
  const hasDocumentPanel = Boolean(showDoc && doc)

  if (!room) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/chat" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
          <ArrowLeft className="h-4 w-4" /> 返回聊天室列表
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <MessageCircle className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-500">聊天室不存在</p>
          <Link to="/chat" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 no-underline">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col animate-slide-up" style={{ height: 'calc(100vh - 112px)' }}>
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <Link to="/chat" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
          <ArrowLeft className="h-4 w-4" /> 返回聊天室列表
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
            title="搜索聊天记录"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowBookmarks(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
            title="收藏观点"
          >
            <BookmarkIcon className="h-3.5 w-3.5" />
            {bookmarks.length > 0 ? <span className="text-[10px] text-primary-600">{bookmarks.length}</span> : null}
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" /> 邀请角色
          </button>
          {room.status === 'active' ? (
            <button
              onClick={() => setConfirmClose(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              关闭聊天室
            </button>
          ) : null}
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <Trash2 className="h-3 w-3" /> 删除
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="确认删除聊天室？"
        description={`确定要删除「${room.topic}」吗？所有消息记录都会被永久删除。`}
        confirmText="删除"
        variant="danger"
        onConfirm={() => {
          removeRoom(id!)
          navigate('/chat')
          toast('success', '聊天室已删除')
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="关闭聊天室？"
        description="关闭后角色将不再主动回复，但历史消息会保留。"
        confirmText="关闭"
        onConfirm={() => {
          closeRoom(id!)
          setConfirmClose(false)
          toast('info', '聊天室已关闭')
        }}
        onCancel={() => setConfirmClose(false)}
      />

      {showInvite ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl animate-slide-up" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">邀请角色</h3>
              <button onClick={() => setShowInvite(false)} className="border-0 bg-transparent text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {availableToInvite.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">没有更多可邀请的角色</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {availableToInvite.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleInvite(agent)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm" style={{ backgroundColor: `${AGENT_COLORS[agent.color]}15` }}>
                      {agent.avatar || agent.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                      <p className="text-xs text-gray-500">{agent.tagline}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 gap-4',
          hasDocumentPanel ? 'lg:grid-cols-[300px_minmax(0,1fr)]' : 'lg:grid-cols-1',
        )}
      >
        {showDoc && doc ? (
          <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
            <div className="flex min-h-0 max-h-[38%] flex-col rounded-2xl border border-gray-200 bg-white/90 shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <FileText className="h-4 w-4 text-primary-500" /> 文档预览
              </h3>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-gray-800">{doc.title}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="rounded-xl bg-gray-50 p-3 text-xs leading-6 text-gray-600">
                  {buildDocumentSnippet(doc, 900)}...
                </div>
              </div>
            </div>

            {review?.summary ? (
              <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">评审焦点</h3>
                <div className="space-y-2 text-xs text-gray-600">
                  {(review.summary.pain_points || review.summary.consensus || []).slice(0, 4).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {agenda.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">讨论议程</h3>
                <div className="space-y-2">
                  {agenda.slice(0, 5).map((topic) => (
                    <div
                      key={topic.id}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs leading-5 transition-colors',
                        topic.status === 'active'
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : topic.status === 'done'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{topic.text}</span>
                        <span className="shrink-0">
                          {topic.status === 'active' ? '进行中' : topic.status === 'done' ? '已完成' : '待讨论'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">参与者</h3>
              <div className="space-y-2">
                {participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ backgroundColor: `${AGENT_COLORS[participant.color]}15` }}>
                      {participant.avatar || participant.name[0]}
                    </div>
                    <span className="text-sm text-gray-700">{participant.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        ) : null}

        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-950">{room.topic}</h2>
              <p className="text-xs text-gray-500">
                {messages.length} 条消息 · {participants.length} 位角色 · {discussionMode === 'debate' ? '辩论模式' : discussionMode === 'moderated' ? '引导模式' : '自由模式'}
              </p>
            </div>
            <button onClick={() => setShowDoc((prev) => !prev)} className="border-0 bg-transparent text-gray-400 hover:text-gray-600 cursor-pointer lg:hidden">
              <FileText className="h-4 w-4" />
            </button>
          </div>

          <ChatRoomStatusBar
            messages={messages}
            participants={participants}
            discussionMode={discussionMode}
            discussionState={discussionState}
            currentTopic={currentTopic}
            remainingTopics={remainingTopics}
            isActive={room.status === 'active' && !loading}
          />

          {participants.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-100 px-6 py-2.5">
              <span className="shrink-0 text-xs font-medium text-gray-500">消息筛选</span>
              <button
                onClick={() => setFilteredAgentId(null)}
                aria-pressed={!validFilteredAgentId}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                  !validFilteredAgentId
                    ? 'border-primary-200 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                全部
              </button>
              {participants.map((participant) => {
                const active = validFilteredAgentId === participant.id
                return (
                  <button
                    key={participant.id}
                    onClick={() => setFilteredAgentId((current) => current === participant.id ? null : participant.id)}
                    aria-pressed={active}
                    aria-label={`筛选 ${participant.name}`}
                    title={`筛选 ${participant.name}`}
                    className={cn(
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary-200 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                      style={{ backgroundColor: `${AGENT_COLORS[participant.color]}18`, color: AGENT_COLORS[participant.color] }}
                    >
                      {participant.avatar || participant.name[0]}
                    </span>
                    <span className="max-w-24 truncate">{participant.name}</span>
                  </button>
                )
              })}
              {activeFilterAgent ? (
                <span className="shrink-0 text-xs text-gray-400">仅显示 {activeFilterAgent.name} 的发言</span>
              ) : null}
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-white to-gray-50/60 px-6 py-5">
            {visibleMessages.length === 0 ? (
              <div className="mx-auto mt-10 max-w-sm rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                当前筛选下暂无消息
              </div>
            ) : visibleMessages.map((message) => {
              const replyQuote = message.replyToMessage ? (
                <div className="mb-1.5 rounded-md border-l-2 border-gray-300 bg-gray-100 px-3 py-1.5 text-xs dark:border-gray-500 dark:bg-gray-700/50">
                  <span className="font-medium text-gray-600 dark:text-gray-300">{message.replyToMessage.senderName}</span>
                  <p className="mt-0.5 truncate text-gray-500 dark:text-gray-400">{message.replyToMessage.content.slice(0, 80)}</p>
                </div>
              ) : null

              const attachmentCard = message.attachment ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                  <FileText className="h-4 w-4 shrink-0 text-primary-500" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{message.attachment.title}</p>
                    <p className="text-[10px] text-gray-400">{message.attachment.fileType.toUpperCase()}</p>
                  </div>
                </div>
              ) : null

              const statusIcon = message.sender_type === 'user' && message.status ? (
                <span className="ml-1 inline-flex items-center">
                  {message.status === 'sending' ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> : null}
                  {message.status === 'sent' ? <Check className="h-3 w-3 text-gray-400" /> : null}
                  {message.status === 'delivered' ? <CheckCheck className="h-3 w-3 text-primary-500" /> : null}
                  {message.status === 'failed' ? <AlertCircle className="h-3 w-3 text-red-500" /> : null}
                </span>
              ) : null
              const metadataBadges = message.sender_type === 'agent' && message.sender_color
                ? getMessageMetadataBadges(message)
                : []

              if (message.sender_type === 'user') {
                return (
                  <div key={message.id} data-msg-id={message.id} className="flex justify-end transition-all">
                    <div className="max-w-[68%]">
                      {replyQuote}
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-primary-600 px-4 py-2.5 text-sm leading-7 text-white shadow-sm">
                        {message.content}
                        {attachmentCard}
                      </div>
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        <span className="text-[10px] text-gray-400">
                          {new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {statusIcon}
                      </div>
                    </div>
                  </div>
                )
              }

              if (!message.sender_color) {
                return (
                  <div key={message.id} data-msg-id={message.id} className="mx-auto max-w-xl rounded-full border border-primary-100 bg-primary-50 px-4 py-2 text-center text-xs text-primary-700 transition-all whitespace-pre-wrap">
                    {message.content}
                  </div>
                )
              }

              return (
                <div key={message.id} data-msg-id={message.id} className="group flex justify-start transition-all">
                  <div className="max-w-[78%]">
                    <div className="mb-1 flex items-center gap-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{ backgroundColor: `${AGENT_COLORS[message.sender_color]}15` }}>
                        {participants.find((participant) => participant.id === message.sender_id)?.avatar || message.sender_name[0]}
                      </div>
                      <span className="text-xs font-medium" style={{ color: AGENT_COLORS[message.sender_color] }}>
                        {message.sender_name}
                      </span>
                      <span className="ml-1 text-xs text-gray-400">
                        {new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => handleFollowUp(message)}
                        className="ml-1 border-0 bg-transparent p-0 text-gray-400 opacity-0 transition-opacity hover:text-primary-500 group-hover:opacity-100 cursor-pointer"
                        title={`追问 ${message.sender_name}`}
                        aria-label={`追问 ${message.sender_name}`}
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {metadataBadges.length > 0 ? (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {metadataBadges.map((badge) => (
                          <span
                            key={badge.key}
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              getMetadataBadgeClass(badge.tone)
                            )}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {replyQuote}

                    <div
                      className="whitespace-pre-wrap rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-7 text-gray-800 shadow-sm"
                      style={{ backgroundColor: `${AGENT_COLORS[message.sender_color]}06`, borderColor: `${AGENT_COLORS[message.sender_color]}22` }}
                    >
                      {message.content}
                      {attachmentCard}
                    </div>

                    <EmojiReactionBar reactions={message.reactions} onReact={(emoji) => handleReaction(message.id, emoji)} />
                  </div>
                </div>
              )
            })}

            {loading ? (
              <TypingIndicator
                agents={typingAgentIds.length > 0 ? participants.filter((participant) => typingAgentIds.includes(participant.id)) : participants.slice(0, 1)}
              />
            ) : null}

            {loading && feedbackDisplay.length > 0 ? (
              <div className="ml-10 flex max-w-[78%] flex-wrap gap-1.5">
                {feedbackDisplay.map((item) => (
                  <span
                    key={item.step}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
                      getFeedbackToneClass(item.tone),
                      item.active ? 'shadow-sm ring-1 ring-current/10' : 'opacity-70'
                    )}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
            {room.status === 'closed' ? (
              <p className="text-center text-sm text-gray-500">此聊天室已关闭</p>
            ) : (
              <div className="relative">
                {slashQuery !== null ? (
                  <SlashCommandMenu query={slashQuery} onSelect={handleSlashCommand} onClose={() => setSlashQuery(null)} />
                ) : null}

                {mentionQuery !== null ? (
                  (() => {
                    const filtered = participants.filter((participant) =>
                      !mentionQuery || participant.name.toLowerCase().includes(mentionQuery.toLowerCase())
                    )

                    if (filtered.length === 0) return null

                    return (
                      <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        {filtered.map((participant) => (
                          <button
                            key={participant.id}
                            onClick={() => {
                              const atIndex = input.lastIndexOf('@')
                              const before = input.slice(0, atIndex)
                              setInput(`${before}@${participant.name} `)
                              setMentionQuery(null)
                              inputRef.current?.focus()
                            }}
                            className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{ backgroundColor: `${AGENT_COLORS[participant.color]}15` }}>
                              {participant.avatar || participant.name[0]}
                            </div>
                            {participant.name}
                          </button>
                        ))}
                      </div>
                    )
                  })()
                ) : null}

                {replyTo ? (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary-500 bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <Reply className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{replyTo.sender_name}</span>
                      <p className="truncate text-xs text-gray-500">{replyTo.content.slice(0, 60)}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="border-0 bg-transparent p-0 text-gray-400 hover:text-gray-600 cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                {pendingAttachment ? (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-800 dark:bg-primary-900/20">
                    <FileText className="h-4 w-4 shrink-0 text-primary-500" />
                    <span className="flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-200">{pendingAttachment.title}</span>
                    <button onClick={() => setPendingAttachment(null)} className="border-0 bg-transparent p-0 text-gray-400 hover:text-gray-600 cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                <ChatToolbar
                  onQuote={() => {
                    const lastMessage = [...messages].reverse().find((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
                    if (lastMessage) setReplyTo(lastMessage)
                    else toast('info', '没有可引用的消息')
                  }}
                  onDoc={() => setShowDocPicker(true)}
                  onVote={() => toast('info', '投票功能开发中')}
                  onSummary={() => {
                    setShowSummary(true)
                    handleGenerateSummary()
                  }}
                  onBookmark={() => {
                    const lastMessage = [...messages].reverse().find((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
                    if (lastMessage && id) {
                      addBookmarkFn({ id: createId(), roomId: id, messageId: lastMessage.id, createdAt: new Date().toISOString() })
                      toast('success', '已收藏最近一条消息')
                    }
                  }}
                  suggestions={reviewSuggestions}
                  onSuggestionQuote={handleQuoteSuggestion}
                  onControl={handleControlAction}
                  disabled={loading}
                />

                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm focus-within:border-primary-300 focus-within:ring-4 focus-within:ring-primary-100">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => {
                      const value = event.target.value
                      setInput(value)

                      if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
                        setSlashQuery(value.slice(1))
                      } else {
                        setSlashQuery(null)
                      }

                      const atIndex = value.lastIndexOf('@')
                      if (atIndex >= 0 && (atIndex === 0 || value[atIndex - 1] === ' ')) {
                        const query = value.slice(atIndex + 1)
                        if (!query.includes(' ')) {
                          setMentionQuery(query)
                        } else {
                          setMentionQuery(null)
                        }
                      } else {
                        setMentionQuery(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setMentionQuery(null)
                        setSlashQuery(null)
                        return
                      }

                      if (event.key === 'Enter' && !event.shiftKey && mentionQuery === null && slashQuery === null) {
                        handleSend()
                      }
                    }}
                    placeholder="输入消息... 可用 @ 提及角色，或 / 快捷命令"
                    className="flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none"
                    disabled={loading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && !pendingAttachment) || loading}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {showSearch ? (
            <ChatSearchPanel messages={messages} participants={participants} onClose={() => setShowSearch(false)} onJumpToMessage={handleJumpToMessage} />
          ) : null}

          {showBookmarks ? (
            <BookmarkPanel
              bookmarks={bookmarks}
              messages={messages}
              onRemove={(bookmarkId) => removeBookmarkFn(bookmarkId)}
              onExport={handleExportBookmarks}
              onClose={() => setShowBookmarks(false)}
            />
          ) : null}

          {showSummary ? (
            <DiscussionSummaryCard
              summary={summaries[summaries.length - 1] || null}
              loading={summaryLoading}
              onGenerate={handleGenerateSummary}
              onClose={() => setShowSummary(false)}
            />
          ) : null}
        </main>
      </div>

      {showDocPicker ? (
        <DocumentPicker documents={allDocuments} onSelect={handleDocAttach} onClose={() => setShowDocPicker(false)} />
      ) : null}
    </div>
  )
}
