import {
  DEFAULT_CHAT_ROOM_STRATEGY,
  type ChatRoomStrategy,
} from '@/types'

export { DEFAULT_CHAT_ROOM_STRATEGY } from '@/types'
export type {
  ChatRoomStrategy,
  CitationPolicy,
  ConflictLevel,
  ContextDepth,
  FeedbackLevel,
  IdentityBoundaryLevel,
  InitiativeLevel,
  RoomTone,
} from '@/types'

export function normalizeChatRoomStrategy(
  strategy?: Partial<ChatRoomStrategy>,
  discussionMode?: ChatRoomStrategy['discussionMode'],
): ChatRoomStrategy {
  return {
    ...DEFAULT_CHAT_ROOM_STRATEGY,
    ...strategy,
    discussionMode: strategy?.discussionMode || discussionMode || DEFAULT_CHAT_ROOM_STRATEGY.discussionMode,
  }
}

export type IdentityType =
  | 'expert'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'observer'
  | 'technical'
  | 'product'
  | 'creative'

export type KnowledgeLevel =
  | 'expert'
  | 'practitioner'
  | 'layperson'
  | 'experiential'

export type SpeakingPosture =
  | 'expert_judgment'
  | 'experience_feedback'
  | 'clarifying_question'
  | 'risk_signal'
  | 'summary_bridge'

export type EvidenceStyle =
  | 'professional'
  | 'classroom'
  | 'personal'
  | 'questioning'
  | 'implementation'
  | 'product'
  | 'creative'

export interface CapabilityProfile {
  identityType: IdentityType
  knowledgeLevel: KnowledgeLevel
  allowedPostures: SpeakingPosture[]
  forbiddenClaims: string[]
  preferredEvidenceStyle: EvidenceStyle
  fallbackPosture: Extract<
    SpeakingPosture,
    'experience_feedback' | 'clarifying_question' | 'risk_signal'
  >
  confidence: number
  sourceSignals: string[]
  boundaryNotes: string[]
}

export type AgentTurnIntent =
  | 'open'
  | 'support'
  | 'challenge'
  | 'evidence'
  | 'question'
  | 'synthesize'

export type AgentStance =
  | 'supporting'
  | 'opposing'
  | 'neutral'
  | 'summarizing'

export interface AgentRuntimeState {
  agentId: string
  lastSpokeAt?: string
  lastIntent?: AgentTurnIntent
  stance: AgentStance
  topicEngagement: number
  unresolvedClaims: string[]
  supportedAgentIds?: string[]
  opposedAgentIds?: string[]
}

export type ChatEngineEventType =
  | 'user_mention'
  | 'document_attached'
  | 'evidence_request'
  | 'confusion_detected'
  | 'collision_detected'
  | 'idle_timeout'
  | 'topic_done'
  | 'user_message'
  | 'agent_response'

export interface ChatEngineEventBase {
  type: ChatEngineEventType
  roomId: string
  timestamp: number
  priority: number
}

export interface UserMentionEvent extends ChatEngineEventBase {
  type: 'user_mention'
  payload: {
    content: string
    targetAgentId: string
    senderId?: string
  }
}

export interface DocumentAttachedEvent extends ChatEngineEventBase {
  type: 'document_attached'
  payload: {
    documentId: string
    title?: string
    contentPreview?: string
  }
}

export interface EvidenceRequestEvent extends ChatEngineEventBase {
  type: 'evidence_request'
  payload: {
    content: string
    topicId?: string
    requestedSource?: 'document' | 'review' | 'chat' | 'any'
  }
}

export interface ConfusionDetectedEvent extends ChatEngineEventBase {
  type: 'confusion_detected'
  payload: {
    content: string
    topicId?: string
  }
}

export interface CollisionDetectedEvent extends ChatEngineEventBase {
  type: 'collision_detected'
  payload: {
    topic: string
    agentIds: string[]
    claims: string[]
  }
}

export interface IdleTimeoutEvent extends ChatEngineEventBase {
  type: 'idle_timeout'
  payload: {
    idleDurationMs: number
  }
}

export interface TopicDoneEvent extends ChatEngineEventBase {
  type: 'topic_done'
  payload: {
    topicId: string
    summary?: string
  }
}

export interface UserMessageEngineEvent extends ChatEngineEventBase {
  type: 'user_message'
  payload: {
    content: string
    senderId?: string
    targetAgentId?: string
  }
}

export interface AgentResponseEngineEvent extends ChatEngineEventBase {
  type: 'agent_response'
  payload: {
    agentId: string
    content: string
    posture?: SpeakingPosture
  }
}

export type ChatEngineEvent =
  | UserMentionEvent
  | DocumentAttachedEvent
  | EvidenceRequestEvent
  | ConfusionDetectedEvent
  | CollisionDetectedEvent
  | IdleTimeoutEvent
  | TopicDoneEvent
  | UserMessageEngineEvent
  | AgentResponseEngineEvent

export type TopicLifecycleState =
  | 'opened'
  | 'exploring'
  | 'conflicting'
  | 'grounding'
  | 'closing'
  | 'done'

export type MessageIntent = '补充' | '反驳' | '追问' | '证据' | '总结'

export type ContextSource = '文档' | '评审结论' | '聊天历史' | '角色经验'

export type EvidenceLevel = 'quote' | 'review' | 'user' | 'inference' | 'experience'
