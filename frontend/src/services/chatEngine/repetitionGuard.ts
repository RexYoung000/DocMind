import type { ChatMessage } from '@/types'

export type RepetitionAction = 'allow' | 'skip' | 'question' | 'evidence' | 'summarize'

export interface RepetitionGuardInput {
  agentId: string
  candidateContent: string
  recentMessages: ChatMessage[]
  evidenceRefs?: string[]
  similarityThreshold?: number
}

export interface RepetitionGuardResult {
  action: RepetitionAction
  shouldSpeak: boolean
  similarity: number
  matchedMessageId?: string
  reason: string
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.72
const QUESTION_HINTS = [/\?/, /？/, /\b(why|how|what|whether|could|should)\b/i, /为什么|如何|是否|能否/]
const EVIDENCE_HINTS = [/\b(evidence|quote|source|data|study|according\s+to)\b/i, /证据|引用|来源|数据|根据/]
const SUMMARY_HINTS = [/\b(summary|summarize|recap|synthesize|overall)\b/i, /总结|归纳|综合/]

export function guardAgainstRepetition(input: RepetitionGuardInput): RepetitionGuardResult {
  const threshold = input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD
  const candidateTokens = tokenize(input.candidateContent)
  let bestMatch: { message: ChatMessage; similarity: number } | undefined

  for (const message of input.recentMessages) {
    if (message.sender_type !== 'agent') continue
    const similarity = jaccardSimilarity(candidateTokens, tokenize(message.content))
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { message, similarity }
    }
  }

  const similarity = bestMatch?.similarity ?? 0
  if (!bestMatch || similarity < threshold) {
    return {
      action: 'allow',
      shouldSpeak: true,
      similarity,
      reason: 'Candidate adds a distinct enough point.',
    }
  }

  const action = chooseRepeatedAction(input, bestMatch.message)

  return {
    action,
    shouldSpeak: action !== 'skip',
    similarity,
    matchedMessageId: bestMatch.message.id,
    reason: reasonForAction(action),
  }
}

export function suggestNonRepeatedMove(input: RepetitionGuardInput): Exclude<RepetitionAction, 'allow'> {
  const result = guardAgainstRepetition(input)
  return result.action === 'allow' ? 'skip' : result.action
}

export function contentSimilarity(left: string, right: string): number {
  return jaccardSimilarity(tokenize(left), tokenize(right))
}

function chooseRepeatedAction(input: RepetitionGuardInput, matchedMessage: ChatMessage): Exclude<RepetitionAction, 'allow'> {
  if (input.agentId === matchedMessage.sender_id) return 'skip'
  if (hasEvidence(input.candidateContent, input.evidenceRefs)) return 'evidence'
  if (matchesAny(input.candidateContent, QUESTION_HINTS)) return 'question'
  if (matchesAny(input.candidateContent, SUMMARY_HINTS)) return 'summarize'
  return 'skip'
}

function hasEvidence(content: string, evidenceRefs?: string[]): boolean {
  return Boolean(evidenceRefs?.length) || matchesAny(content, EVIDENCE_HINTS)
}

function reasonForAction(action: Exclude<RepetitionAction, 'allow'>): string {
  switch (action) {
    case 'question':
      return 'The point is already covered; ask a narrowing follow-up instead.'
    case 'evidence':
      return 'The point is similar, but new evidence can make the turn useful.'
    case 'summarize':
      return 'The point repeats prior views; synthesize them instead of restating.'
    case 'skip':
      return 'The candidate is too similar to an existing point and adds no new move.'
  }
}

function tokenize(content: string): Set<string> {
  const normalized = content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  if (!normalized) return new Set()

  return new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length > 1)
      .filter((token) => !STOP_WORDS.has(token)),
  )
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1
  if (left.size === 0 || right.size === 0) return 0

  let intersection = 0
  for (const token of left) {
    if (right.has(token)) intersection += 1
  }

  return intersection / (left.size + right.size - intersection)
}

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'that',
  'this',
  'with',
  'from',
  'have',
  'will',
  'should',
  'could',
  'because',
  'about',
  'into',
  'there',
  'their',
  '我们',
  '这个',
  '需要',
])
