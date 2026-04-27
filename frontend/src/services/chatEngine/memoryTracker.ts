import type { ChatMessage } from '@/types'
import type { AgentStance, AgentTurnIntent } from './strategyTypes'

export interface AgentMemoryClaim {
  text: string
  messageId: string
  evidenceRefs: string[]
}

export interface AgentDiscussionMemory {
  agentId: string
  stance: AgentStance
  claims: AgentMemoryClaim[]
  supportedAgentIds: string[]
  opposedAgentIds: string[]
  unresolvedQuestions: string[]
  lastIntent?: AgentTurnIntent
  lastMessageId?: string
  lastUpdatedAt?: string
}

export interface UpdateAgentMemoryOptions {
  existing?: AgentDiscussionMemory
  maxClaims?: number
  maxQuestions?: number
}

const DEFAULT_MAX_CLAIMS = 8
const DEFAULT_MAX_QUESTIONS = 6

const SUPPORT_PATTERNS = [
  /\b(i\s+agree|agree\s+with|support|building\s+on|same\s+view|makes\s+sense)\b/i,
  /我(同意|支持|赞成)|赞同|这个观点成立/,
]

const OPPOSE_PATTERNS = [
  /\b(i\s+disagree|disagree\s+with|oppose|challenge|push\s+back|not\s+convinced)\b/i,
  /我(不同意|反对)|不赞成|需要反驳|这个观点不成立/,
]

const SUMMARIZE_PATTERNS = [
  /\b(to\s+summarize|in\s+summary|overall|synthesize|recap)\b/i,
  /总结|归纳|综合来看/,
]

const EVIDENCE_PATTERNS = [
  /\b(evidence|quote|source|data|study|because|according\s+to|for\s+example)\b/i,
  /证据|引用|来源|数据显示|根据|例如|比如/,
]

const QUESTION_PATTERNS = [/\?/, /？/, /\b(why|how|what|could|should|whether)\b/i, /为什么|如何|是否|能否|请问/]

export function createEmptyAgentMemory(agentId: string): AgentDiscussionMemory {
  return {
    agentId,
    stance: 'neutral',
    claims: [],
    supportedAgentIds: [],
    opposedAgentIds: [],
    unresolvedQuestions: [],
  }
}

export function extractAgentMemory(
  messages: ChatMessage[],
  agentId: string,
  options: UpdateAgentMemoryOptions = {},
): AgentDiscussionMemory {
  return updateAgentMemory(createEmptyAgentMemory(agentId), messages, options)
}

export function updateAgentMemory(
  memory: AgentDiscussionMemory,
  messages: ChatMessage[],
  options: UpdateAgentMemoryOptions = {},
): AgentDiscussionMemory {
  const maxClaims = options.maxClaims ?? DEFAULT_MAX_CLAIMS
  const maxQuestions = options.maxQuestions ?? DEFAULT_MAX_QUESTIONS
  const base = options.existing ?? memory
  const next: AgentDiscussionMemory = {
    ...base,
    agentId: memory.agentId,
    claims: [...base.claims],
    supportedAgentIds: [...base.supportedAgentIds],
    opposedAgentIds: [...base.opposedAgentIds],
    unresolvedQuestions: [...base.unresolvedQuestions],
  }

  for (const message of messages) {
    if (message.sender_type !== 'agent' || message.sender_id !== memory.agentId) continue

    const intent = inferMessageIntent(message.content)
    const stance = inferMessageStance(message.content, next.stance)
    const evidenceRefs = extractEvidenceRefs(message)
    const claims = extractClaims(message.content)
    const questions = extractQuestions(message.content)

    for (const claim of claims) {
      appendUniqueClaim(next.claims, {
        text: claim,
        messageId: message.id,
        evidenceRefs,
      })
    }

    for (const question of questions) {
      appendUniqueText(next.unresolvedQuestions, question)
    }

    const { supportedAgentIds, opposedAgentIds } = extractReferencedAgentIds(message.content)
    for (const id of supportedAgentIds) appendUniqueText(next.supportedAgentIds, id)
    for (const id of opposedAgentIds) appendUniqueText(next.opposedAgentIds, id)

    next.stance = stance
    next.lastIntent = intent
    next.lastMessageId = message.id
    next.lastUpdatedAt = message.created_at
  }

  next.claims = next.claims.slice(-maxClaims)
  next.unresolvedQuestions = next.unresolvedQuestions.slice(-maxQuestions)

  return next
}

export function buildAgentMemoryMap(messages: ChatMessage[]): Record<string, AgentDiscussionMemory> {
  const memories: Record<string, AgentDiscussionMemory> = {}

  for (const message of messages) {
    if (message.sender_type !== 'agent') continue
    const current = memories[message.sender_id] ?? createEmptyAgentMemory(message.sender_id)
    memories[message.sender_id] = updateAgentMemory(current, [message])
  }

  return memories
}

export function inferMessageIntent(content: string): AgentTurnIntent {
  if (matchesAny(content, QUESTION_PATTERNS)) return 'question'
  if (matchesAny(content, EVIDENCE_PATTERNS)) return 'evidence'
  if (matchesAny(content, SUMMARIZE_PATTERNS)) return 'synthesize'
  if (matchesAny(content, OPPOSE_PATTERNS)) return 'challenge'
  if (matchesAny(content, SUPPORT_PATTERNS)) return 'support'
  return 'open'
}

export function inferMessageStance(content: string, previous: AgentStance = 'neutral'): AgentStance {
  if (matchesAny(content, SUMMARIZE_PATTERNS)) return 'summarizing'
  if (matchesAny(content, OPPOSE_PATTERNS)) return 'opposing'
  if (matchesAny(content, SUPPORT_PATTERNS)) return 'supporting'
  return previous
}

function extractClaims(content: string): string[] {
  return splitSentences(content)
    .filter((sentence) => {
      if (matchesAny(sentence, QUESTION_PATTERNS)) return false
      return sentence.length >= 12
    })
    .slice(0, 3)
}

function extractQuestions(content: string): string[] {
  return splitSentences(content).filter((sentence) => matchesAny(sentence, QUESTION_PATTERNS))
}

function extractEvidenceRefs(message: ChatMessage): string[] {
  const refs: string[] = []

  if (message.attachment?.documentId) refs.push(`document:${message.attachment.documentId}`)
  for (const quote of message.quotes ?? []) refs.push(`quote:${quote.section}`)

  return refs
}

function extractReferencedAgentIds(content: string): Pick<AgentDiscussionMemory, 'supportedAgentIds' | 'opposedAgentIds'> {
  const supportedAgentIds: string[] = []
  const opposedAgentIds: string[] = []
  const referencePattern = /(?:support|agree\s+with|同意|支持|赞成|oppose|disagree\s+with|反对|不同意)\s+@?([a-zA-Z0-9_-]+)/gi
  let match = referencePattern.exec(content)

  while (match) {
    const fullMatch = match[0]
    const agentId = match[1]
    if (matchesAny(fullMatch, SUPPORT_PATTERNS)) appendUniqueText(supportedAgentIds, agentId)
    if (matchesAny(fullMatch, OPPOSE_PATTERNS)) appendUniqueText(opposedAgentIds, agentId)
    match = referencePattern.exec(content)
  }

  return { supportedAgentIds, opposedAgentIds }
}

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?。！？])\s+|[\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

function appendUniqueClaim(claims: AgentMemoryClaim[], claim: AgentMemoryClaim): void {
  const normalized = normalizeText(claim.text)
  if (claims.some((existing) => normalizeText(existing.text) === normalized)) return
  claims.push(claim)
}

function appendUniqueText(items: string[], item: string): void {
  const normalized = normalizeText(item)
  if (!normalized || items.some((existing) => normalizeText(existing) === normalized)) return
  items.push(item)
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
