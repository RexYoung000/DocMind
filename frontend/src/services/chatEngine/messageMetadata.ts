import type {
  ChatMessage,
  ChatMessageCitation,
  ChatMessageContextSource,
  ChatMessageEvidenceLevel,
  ChatMessageIntent,
  ChatMessageRespondingTo,
} from '@/types'
import type { RoutedChatEvent } from './eventRouterV2'
import type { SpeakingPosture } from './strategyTypes'

export type MetadataBadgeTone = 'neutral' | 'document' | 'review' | 'experience' | 'warning'

export interface MessageMetadataInput {
  intent: ChatMessageIntent
  event?: RoutedChatEvent
  speakingPosture?: SpeakingPosture
  respondingTo?: ChatMessageRespondingTo
}

export interface MessageMetadataBadge {
  key: string
  label: string
  tone: MetadataBadgeTone
}

export function buildTurnMessageMetadata(input: MessageMetadataInput): Pick<
  ChatMessage,
  'intent' | 'respondingTo' | 'contextSource' | 'evidenceLevel' | 'citations'
> {
  const contextSource = inferContextSource(input.event, input.speakingPosture)
  const evidenceLevel = inferEvidenceLevel(input.event, input.speakingPosture)
  const citations = buildEventCitations(input.event, contextSource)

  return {
    intent: input.intent,
    respondingTo: input.respondingTo,
    contextSource,
    evidenceLevel,
    citations: citations.length > 0 ? citations : undefined,
  }
}

export function getMessageMetadataBadges(message: ChatMessage): MessageMetadataBadge[] {
  const badges: MessageMetadataBadge[] = []

  if (message.intent) {
    badges.push({
      key: 'intent',
      label: intentLabel(message.intent),
      tone: message.intent === 'challenge' ? 'warning' : 'neutral',
    })
  }

  if (message.respondingTo?.label) {
    badges.push({
      key: 'respondingTo',
      label: `回应 ${message.respondingTo.label}`,
      tone: 'neutral',
    })
  }

  if (message.contextSource) {
    badges.push({
      key: 'contextSource',
      label: contextSourceLabel(message.contextSource),
      tone: contextSourceTone(message.contextSource),
    })
  }

  if (message.evidenceLevel) {
    badges.push({
      key: 'evidenceLevel',
      label: evidenceLevelLabel(message.evidenceLevel),
      tone: evidenceLevelTone(message.evidenceLevel),
    })
  }

  if (message.citations?.length) {
    badges.push({
      key: 'citations',
      label: `${message.citations.length} 个来源`,
      tone: 'document',
    })
  }

  return badges
}

export function inferContextSource(
  event?: RoutedChatEvent,
  speakingPosture?: SpeakingPosture,
): ChatMessageContextSource {
  if (speakingPosture === 'experience_feedback' || speakingPosture === 'risk_signal') {
    return 'agent_experience'
  }

  switch (event?.type) {
    case 'document_attached':
    case 'evidence_request':
      return 'document'
    case 'topic_progression':
      return 'review'
    case 'collision_detected':
    case 'confusion_detected':
    case 'user_mention':
    case 'idle_followup':
    default:
      return 'chat_history'
  }
}

export function inferEvidenceLevel(
  event?: RoutedChatEvent,
  speakingPosture?: SpeakingPosture,
): ChatMessageEvidenceLevel {
  if (speakingPosture === 'experience_feedback' || speakingPosture === 'risk_signal') {
    return 'experience'
  }

  switch (event?.type) {
    case 'evidence_request':
      return 'review'
    case 'user_mention':
    case 'confusion_detected':
      return 'user'
    case 'document_attached':
    case 'collision_detected':
    case 'topic_progression':
    case 'idle_followup':
    default:
      return 'inference'
  }
}

function buildEventCitations(
  event: RoutedChatEvent | undefined,
  contextSource: ChatMessageContextSource,
): ChatMessageCitation[] {
  if (!event || event.type !== 'document_attached' || !event.payload.attachmentTitle) {
    return []
  }

  return [
    {
      source: contextSource,
      title: event.payload.attachmentTitle,
    },
  ]
}

function intentLabel(intent: ChatMessageIntent): string {
  switch (intent) {
    case 'open':
      return '开场判断'
    case 'support':
      return '补充支持'
    case 'challenge':
      return '提出反驳'
    case 'evidence':
      return '证据回应'
    case 'question':
      return '追问澄清'
    case 'synthesize':
      return '阶段总结'
    case 'progress':
      return '推进议题'
  }
}

function contextSourceLabel(source: ChatMessageContextSource): string {
  switch (source) {
    case 'document':
      return '基于文档'
    case 'review':
      return '基于评审'
    case 'chat_history':
      return '基于上下文'
    case 'agent_memory':
      return '基于立场记忆'
    case 'agent_experience':
      return '角色体验'
  }
}

function evidenceLevelLabel(level: ChatMessageEvidenceLevel): string {
  switch (level) {
    case 'quote':
      return '原文引用'
    case 'review':
      return '评审依据'
    case 'user':
      return '用户描述'
    case 'inference':
      return '角色推断'
    case 'experience':
      return '经验反馈'
  }
}

function contextSourceTone(source: ChatMessageContextSource): MetadataBadgeTone {
  if (source === 'document') return 'document'
  if (source === 'review') return 'review'
  if (source === 'agent_experience') return 'experience'
  return 'neutral'
}

function evidenceLevelTone(level: ChatMessageEvidenceLevel): MetadataBadgeTone {
  if (level === 'quote') return 'document'
  if (level === 'review') return 'review'
  if (level === 'experience') return 'experience'
  if (level === 'user') return 'neutral'
  return 'warning'
}
