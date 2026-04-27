import type { Agent, ChatAgendaItem, ChatMessage } from '@/types'

export type ChatEngineEventType =
  | 'user_mention'
  | 'document_attached'
  | 'evidence_request'
  | 'confusion_detected'
  | 'collision_detected'
  | 'topic_progression'
  | 'idle_followup'

export interface CollisionSignal {
  agentAId: string
  agentBId: string
  topic?: string
  confidence?: number
}

export interface RoutedChatEvent {
  id: string
  type: ChatEngineEventType
  priority: number
  createdAt: number
  reason: string
  sourceMessageId?: string
  targetAgentId?: string
  topicId?: string
  payload: {
    content?: string
    topic?: string
    idleDurationMs?: number
    collision?: CollisionSignal
    attachmentTitle?: string
  }
}

export interface EventRouterInput {
  messages: ChatMessage[]
  participants: Agent[]
  currentTopic?: ChatAgendaItem | null
  agenda?: ChatAgendaItem[]
  idleDurationMs?: number
  idleThresholdMs?: number
  now?: number
  collisionSignals?: CollisionSignal[]
}

const EVENT_PRIORITY: Record<ChatEngineEventType, number> = {
  user_mention: 700,
  document_attached: 650,
  evidence_request: 600,
  confusion_detected: 550,
  collision_detected: 500,
  topic_progression: 350,
  idle_followup: 200,
}

const EVIDENCE_PATTERNS = [
  /依据|证据|原文|引用|出处|哪[里儿]|具体|例子|举例|来源|佐证/u,
  /\b(evidence|quote|citation|source|where|example|proof)\b/i,
]

const CONFUSION_PATTERNS = [
  /不懂|没懂|什么意思|为什么|怎么做|怎么理解|解释一下|看不明白|困惑|能不能说清楚/u,
  /\b(why|how|confused|unclear|explain|what do you mean)\b/i,
]

const OPPOSITION_PATTERNS = [
  /不同意|不赞同|反对|相反|但是|然而|未必|不一定|有问题|漏洞|质疑/u,
  /\b(disagree|challenge|however|but|opposite|not necessarily|flaw)\b/i,
]

export function routeChatEvents(input: EventRouterInput): RoutedChatEvent[] {
  const now = input.now ?? Date.now()
  const latestUserMessage = getLatestUserMessage(input.messages)
  const events: RoutedChatEvent[] = []

  if (latestUserMessage) {
    const mentionTarget = findMentionTarget(latestUserMessage, input.participants)
    if (mentionTarget) {
      events.push(createEvent('user_mention', now, {
        reason: `User addressed ${mentionTarget.name}.`,
        sourceMessageId: latestUserMessage.id,
        targetAgentId: mentionTarget.id,
        topicId: input.currentTopic?.id,
        content: latestUserMessage.content,
      }))
    }

    if (latestUserMessage.attachment) {
      events.push(createEvent('document_attached', now, {
        reason: 'User attached a document for the room to consider.',
        sourceMessageId: latestUserMessage.id,
        targetAgentId: mentionTarget?.id,
        topicId: input.currentTopic?.id,
        content: latestUserMessage.content,
        attachmentTitle: latestUserMessage.attachment.title,
      }))
    }

    if (matchesAny(latestUserMessage.content, EVIDENCE_PATTERNS)) {
      events.push(createEvent('evidence_request', now, {
        reason: 'User asked for evidence, original text, examples, or a source.',
        sourceMessageId: latestUserMessage.id,
        targetAgentId: mentionTarget?.id,
        topicId: input.currentTopic?.id,
        content: latestUserMessage.content,
      }))
    }

    if (matchesAny(latestUserMessage.content, CONFUSION_PATTERNS)) {
      events.push(createEvent('confusion_detected', now, {
        reason: 'User appears to need clarification or a simpler explanation.',
        sourceMessageId: latestUserMessage.id,
        targetAgentId: mentionTarget?.id,
        topicId: input.currentTopic?.id,
        content: latestUserMessage.content,
      }))
    }
  }

  for (const collision of collectCollisionSignals(input)) {
    events.push(createEvent('collision_detected', now, {
      reason: 'Recent agent messages contain conflicting positions.',
      targetAgentId: collision.agentBId,
      topicId: input.currentTopic?.id,
      topic: collision.topic ?? input.currentTopic?.text,
      collision,
    }))
  }

  if (shouldProgressTopic(input)) {
    events.push(createEvent('topic_progression', now, {
      reason: 'The current topic has enough discussion to move toward a next step.',
      topicId: input.currentTopic?.id,
      topic: getNextTopic(input)?.text ?? input.currentTopic?.text,
    }))
  }

  const idleThresholdMs = input.idleThresholdMs ?? 30000
  if ((input.idleDurationMs ?? 0) >= idleThresholdMs) {
    events.push(createEvent('idle_followup', now, {
      reason: 'The room has been idle long enough to need a natural follow-up.',
      topicId: input.currentTopic?.id,
      topic: input.currentTopic?.text,
      idleDurationMs: input.idleDurationMs,
    }))
  }

  return dedupeEvents(events).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

export function getEventPriority(type: ChatEngineEventType): number {
  return EVENT_PRIORITY[type]
}

function createEvent(
  type: ChatEngineEventType,
  now: number,
  options: {
    reason: string
    sourceMessageId?: string
    targetAgentId?: string
    topicId?: string
    content?: string
    topic?: string
    idleDurationMs?: number
    collision?: CollisionSignal
    attachmentTitle?: string
  },
): RoutedChatEvent {
  const scopedId = [
    type,
    options.sourceMessageId,
    options.targetAgentId,
    options.topicId,
    options.collision?.agentAId,
    options.collision?.agentBId,
  ].filter(Boolean).join(':')

  return {
    id: scopedId || `${type}:${now}`,
    type,
    priority: EVENT_PRIORITY[type],
    createdAt: now,
    reason: options.reason,
    sourceMessageId: options.sourceMessageId,
    targetAgentId: options.targetAgentId,
    topicId: options.topicId,
    payload: {
      content: options.content,
      topic: options.topic,
      idleDurationMs: options.idleDurationMs,
      collision: options.collision,
      attachmentTitle: options.attachmentTitle,
    },
  }
}

function getLatestUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.sender_type === 'user')
}

function findMentionTarget(message: ChatMessage, participants: Agent[]): Agent | undefined {
  if (message.target_agent_id) {
    return participants.find((agent) => agent.id === message.target_agent_id)
  }

  const content = message.content.toLowerCase()
  return participants.find((agent) => {
    const name = agent.name.toLowerCase()
    return content.includes(`@${name}`) || content.includes(`@${agent.id.toLowerCase()}`)
  })
}

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

function collectCollisionSignals(input: EventRouterInput): CollisionSignal[] {
  if (input.collisionSignals?.length) {
    return input.collisionSignals.filter((signal) => (signal.confidence ?? 1) >= 0.45)
  }

  const recentAgentMessages = input.messages
    .filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
    .slice(-6)

  const collisions: CollisionSignal[] = []
  for (let index = 1; index < recentAgentMessages.length; index++) {
    const previous = recentAgentMessages[index - 1]
    const current = recentAgentMessages[index]
    if (!previous || !current || previous.sender_id === current.sender_id) continue
    if (!matchesAny(current.content, OPPOSITION_PATTERNS)) continue

    collisions.push({
      agentAId: previous.sender_id,
      agentBId: current.sender_id,
      topic: input.currentTopic?.text ?? previous.content.slice(0, 80),
      confidence: current.content.includes(previous.sender_name) ? 0.75 : 0.55,
    })
  }

  return collisions
}

function shouldProgressTopic(input: EventRouterInput): boolean {
  if (!input.currentTopic || input.currentTopic.status === 'done') return false

  const topicMessages = input.messages.filter((message) => {
    if (message.sender_id === 'system') return false
    return !input.currentTopic?.text || message.content.includes(input.currentTopic.text.slice(0, 12))
  })
  const recentAgentCount = input.messages
    .slice(-10)
    .filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system').length

  return recentAgentCount >= 4 || topicMessages.length >= 6
}

function getNextTopic(input: EventRouterInput): ChatAgendaItem | undefined {
  return input.agenda?.find((topic) => topic.status === 'pending')
}

function dedupeEvents(events: RoutedChatEvent[]): RoutedChatEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.type}:${event.sourceMessageId ?? ''}:${event.targetAgentId ?? ''}:${event.topicId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
