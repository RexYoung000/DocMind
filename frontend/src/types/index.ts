export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  created_at: string
}

export interface Document {
  id: string
  owner_id: string
  title: string
  file_name: string
  file_type: 'pdf' | 'doc' | 'docx' | 'md' | 'txt'
  file_size: number
  raw_content?: string
  structured_content?: Record<string, unknown>
  keywords?: string[]
  summary?: string
  word_count?: number
  doc_metadata?: DocumentMetadata
  status: 'uploading' | 'parsing' | 'ready' | 'error'
  review_count: number
  created_at: string
  updated_at?: string
}

export type AgentColor = 'indigo' | 'violet' | 'pink' | 'orange' | 'teal' | 'sky' | 'slate' | 'green' | 'rose' | 'amber' | 'emerald' | 'cyan'

export type ReviewDimension = '逻辑结构' | '内容深度' | '表达清晰' | '论据充分' | '创新性' | '实用性'

export const REVIEW_DIMENSIONS: ReviewDimension[] = ['逻辑结构', '内容深度', '表达清晰', '论据充分', '创新性', '实用性']

export type TeachingDimension = '课程设计' | '知识链' | '教学目标' | '课程重点' | '课程难点' | '学习梯度'

export const TEACHING_DIMENSIONS: TeachingDimension[] = ['课程设计', '知识链', '教学目标', '课程重点', '课程难点', '学习梯度']

export interface DocumentMetadata {
  category?: string
  author?: string
  topic?: string
  abstract?: string
  keyPoints?: string[]
  sections?: { title: string; content: string }[]
  wordCount?: number
}

export interface AgentPersonality {
  directness: number
  strictness: number
  humor: number
  empathy: number
}

export interface Agent {
  id: string
  owner_id: string
  template_id?: string
  name: string
  avatar?: string
  tagline: string
  personality: AgentPersonality
  expertise: string[]
  behavior: {
    style: string
    catchphrase?: string
  }
  system_prompt: string
  source: 'custom' | 'template' | 'community'
  is_public: boolean
  usage_count: number
  color: AgentColor
  category?: AgentCategory
  focusDimension?: ReviewDimension
  creation_history?: { role: 'ai' | 'user'; content: string }[]
  last_used_at?: string
  created_at: string
}

export type AgentCategory = 'analyst' | 'engineer' | 'creative' | 'teacher' | 'student' | 'parent'

export interface AgentTemplate {
  id: string
  name: string
  avatar?: string
  tagline: string
  tags: string[]
  description: string
  category: AgentCategory
  focusDimension?: ReviewDimension
  personality: AgentPersonality
  expertise: string[]
  behavior: {
    style: string
    catchphrase?: string
  }
  color: AgentColor
}

export interface Review {
  id: string
  document_id: string
  owner_id: string
  overall_score?: number
  agent_reviews?: AgentReview[]
  summary?: ReviewSummary
  status: 'in_progress' | 'completed'
  created_at: string
  document?: Document
  agents?: Agent[]
}

export interface AgentReview {
  agent_id: string
  agent_name: string
  agent_color: AgentColor
  score: number
  opinion: string
  status?: 'completed' | 'failed'
  error_message?: string
  dimensions: { name: string; score: number; comment?: string; evidence?: string }[]
  suggestions: Suggestion[]
  highlights?: string[]
}

export interface Suggestion {
  id: string
  title?: string
  content: string
  priority: 'high' | 'medium' | 'low'
  adopted: boolean
  source_agent: string
  evidence?: string
  expected_effect?: string
}

export interface ReviewSummary {
  overview?: string
  strengths?: string[]
  pain_points?: string[]
  consensus: string[]
  controversies: Controversy[]
  top_suggestions: Suggestion[]
}

export interface Controversy {
  topic: string
  opinions: { agent_name: string; agent_color: AgentColor; stance: string }[]
}

export type DiscussionMode = 'free' | 'moderated' | 'debate'
export type DiscussionState = 'idle' | 'kickoff' | 'discussing' | 'summarizing' | 'closed'

export type ContextDepth = 'fast' | 'deep' | 'long-document'
export type InitiativeLevel = 'low' | 'standard' | 'high'
export type ConflictLevel = 'soft' | 'balanced' | 'intense'
export type RoomTone = 'review-meeting' | 'brainstorm' | 'teaching-seminar' | 'product-review'
export type FeedbackLevel = 'simple' | 'full'
export type CitationPolicy = 'optional' | 'required' | 'none'
export type IdentityBoundaryLevel = 'standard' | 'relaxed' | 'off'

export interface ChatRoomStrategy {
  discussionMode: DiscussionMode
  contextDepth: ContextDepth
  initiativeLevel: InitiativeLevel
  conflictLevel: ConflictLevel
  roomTone: RoomTone
  feedbackLevel: FeedbackLevel
  citationPolicy: CitationPolicy
  identityBoundary: IdentityBoundaryLevel
}

export const DEFAULT_CHAT_ROOM_STRATEGY: ChatRoomStrategy = {
  discussionMode: 'moderated',
  contextDepth: 'deep',
  initiativeLevel: 'standard',
  conflictLevel: 'balanced',
  roomTone: 'review-meeting',
  feedbackLevel: 'full',
  citationPolicy: 'optional',
  identityBoundary: 'standard',
}

export interface ChatAgendaItem {
  id: string
  text: string
  source: 'document' | 'review' | 'user'
  priority: number
  status: 'pending' | 'active' | 'done'
}

export interface ChatRoom {
  id: string
  document_id: string
  review_id?: string
  owner_id: string
  topic: string
  status: 'active' | 'closed'
  participants: Agent[]
  discussionMode?: DiscussionMode
  strategy?: ChatRoomStrategy
  discussionState?: DiscussionState
  currentTopicId?: string
  pendingTopics?: ChatAgendaItem[]
  topicTags?: string[]
  stats?: {
    messageCount: number
    lastActiveAt?: string
    bookmarkCount?: number
  }
  created_at: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed'
export type ChatMessageIntent = 'open' | 'support' | 'challenge' | 'evidence' | 'question' | 'synthesize' | 'progress'
export type ChatMessageContextSource = 'document' | 'review' | 'chat_history' | 'agent_memory' | 'agent_experience'
export type ChatMessageEvidenceLevel = 'quote' | 'review' | 'user' | 'inference' | 'experience'

export interface ChatMessageRespondingTo {
  agentId?: string
  messageId?: string
  label?: string
}

export interface ChatMessageCitation {
  source: ChatMessageContextSource
  title?: string
  text?: string
  documentId?: string
  section?: string
}

export interface ChatMessageReaction {
  emoji: string
  userReacted: boolean
  agentIds: string[]
}

export interface ChatMessageAttachment {
  documentId: string
  title: string
  fileType: string
}

export interface ChatMessage {
  id: string
  room_id: string
  sender_type: 'user' | 'agent'
  sender_id: string
  sender_name: string
  sender_color?: AgentColor
  content: string
  intent?: ChatMessageIntent
  respondingTo?: ChatMessageRespondingTo
  contextSource?: ChatMessageContextSource
  evidenceLevel?: ChatMessageEvidenceLevel
  citations?: ChatMessageCitation[]
  quotes?: { text: string; section: string }[]
  reply_to?: string
  replyToMessage?: { senderName: string; content: string }
  target_agent_id?: string
  attachment?: ChatMessageAttachment
  reactions?: ChatMessageReaction[]
  status?: MessageStatus
  created_at: string
}

export interface ChatPoll {
  id: string
  roomId: string
  question: string
  options: { id: string; text: string; voterIds: string[] }[]
  createdBy: string
  createdAt: string
  closedAt?: string
}

export interface Bookmark {
  id: string
  roomId: string
  messageId: string
  note?: string
  createdAt: string
}

export interface DiscussionSummary {
  id: string
  roomId: string
  keyPoints: string[]
  agreements: string[]
  disagreements: string[]
  actionItems: string[]
  generatedAt: string
}

export type RoleEventType = 'challenge' | 'support' | 'question' | 'tangent' | 'summarize' | 'escalate'

export interface RoleEvent {
  type: RoleEventType
  triggeredBy: string
  targetAgentId?: string
  content: string
  probability: number
}

export type ProviderMode = 'official' | 'third-party' | 'local'

export interface ModelConfig {
  providerMode: ProviderMode
  model: string
  apiKey: string
  baseUrl: string
  localEndpoint: string
  maxConcurrentReviews?: number
}

export interface SavedModelProfile {
  id: string
  name: string
  config: ModelConfig
  savedAt: string
}
