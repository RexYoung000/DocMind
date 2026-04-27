import type { ChatMessage, ContextDepth, Document, ReviewSummary, RoomTone } from '@/types'

export type ContextSectionType =
  | 'room'
  | 'topic'
  | 'document-summary'
  | 'document-excerpt'
  | 'review'
  | 'recent-messages'
  | 'agent-memory'

export interface ContextSection {
  id: string
  type: ContextSectionType
  title: string
  content: string
  sourceId?: string
  score?: number
}

export interface AssembleContextInput {
  contextDepth: ContextDepth
  roomTopic?: string
  roomTone?: RoomTone
  currentTopic?: string
  documents?: Array<Pick<Document, 'id' | 'title' | 'summary' | 'raw_content' | 'structured_content'>>
  reviewSummary?: ReviewSummary
  recentMessages?: ChatMessage[]
  agentMemory?: string[]
}

export interface AssembledContext {
  depth: ContextDepth
  sections: ContextSection[]
  promptText: string
}

interface DocumentExcerpt {
  documentId: string
  title: string
  heading?: string
  content: string
  score: number
}

const DEPTH_LIMITS: Record<
  ContextDepth,
  {
    summaryChars: number
    messageCount: number
    messageChars: number
    memoryCount: number
    memoryChars: number
    reviewItems: number
    excerptCount: number
    excerptChars: number
  }
> = {
  fast: {
    summaryChars: 180,
    messageCount: 3,
    messageChars: 140,
    memoryCount: 2,
    memoryChars: 120,
    reviewItems: 0,
    excerptCount: 0,
    excerptChars: 0,
  },
  deep: {
    summaryChars: 360,
    messageCount: 8,
    messageChars: 240,
    memoryCount: 5,
    memoryChars: 180,
    reviewItems: 4,
    excerptCount: 4,
    excerptChars: 520,
  },
  'long-document': {
    summaryChars: 220,
    messageCount: 6,
    messageChars: 200,
    memoryCount: 4,
    memoryChars: 160,
    reviewItems: 3,
    excerptCount: 6,
    excerptChars: 620,
  },
}

export function assembleLayeredContext(input: AssembleContextInput): AssembledContext {
  const limits = DEPTH_LIMITS[input.contextDepth]
  const sections: ContextSection[] = []

  addSection(sections, 'room', 'Room framing', formatRoomFraming(input.roomTopic, input.roomTone))
  addSection(sections, 'topic', 'Current topic', cleanText(input.currentTopic))

  for (const document of input.documents ?? []) {
    const summary = cleanText(document.summary)
    const fallbackSummary = input.contextDepth === 'fast'
      ? ''
      : summarizeFromDocumentContent(document, limits.summaryChars)
    addSection(sections, 'document-summary', `Document summary: ${document.title}`, truncateText(summary || fallbackSummary, limits.summaryChars), document.id)
  }

  if (input.contextDepth !== 'fast') {
    const excerpts = selectRelevantDocumentExcerpts(
      input.documents ?? [],
      input.currentTopic || input.roomTopic || '',
      limits.excerptCount,
      limits.excerptChars,
    )

    sections.push(...excerpts)
  }

  if (input.contextDepth !== 'fast') {
    addSection(sections, 'review', 'Review pain points and suggestions', formatReviewSummary(input.reviewSummary, limits.reviewItems))
  }

  addSection(sections, 'recent-messages', 'Recent messages', formatRecentMessages(input.recentMessages ?? [], limits.messageCount, limits.messageChars))
  addSection(sections, 'agent-memory', 'Agent memory', formatAgentMemory(input.agentMemory ?? [], limits.memoryCount, limits.memoryChars))

  return {
    depth: input.contextDepth,
    sections,
    promptText: sections.map(formatPromptSection).join('\n\n'),
  }
}

export function selectRelevantDocumentExcerpts(
  documents: Array<Pick<Document, 'id' | 'title' | 'raw_content' | 'structured_content'>>,
  topic: string,
  maxExcerpts = 4,
  maxCharsPerExcerpt = 520,
): ContextSection[] {
  const terms = tokenize(topic)
  const excerpts = documents
    .flatMap((document) => extractDocumentExcerptCandidates(document, maxCharsPerExcerpt))
    .map((excerpt) => ({
      ...excerpt,
      score: scoreText(excerpt.content, terms) + scoreText(excerpt.heading || '', terms) * 2,
    }))
    .filter((excerpt) => excerpt.content.length > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
  const relevantExcerpts = terms.length > 0 && excerpts.some((excerpt) => excerpt.score > 0)
    ? excerpts.filter((excerpt) => excerpt.score > 0)
    : excerpts

  return relevantExcerpts.slice(0, maxExcerpts).map((excerpt, index) => ({
    id: `document-excerpt-${excerpt.documentId}-${index + 1}`,
    type: 'document-excerpt',
    title: excerpt.heading ? `${excerpt.title}: ${excerpt.heading}` : `Document excerpt: ${excerpt.title}`,
    content: excerpt.content,
    sourceId: excerpt.documentId,
    score: excerpt.score,
  }))
}

function addSection(
  sections: ContextSection[],
  type: ContextSectionType,
  title: string,
  content?: string,
  sourceId?: string,
  score?: number,
) {
  const normalized = cleanText(content)
  if (!normalized) return

  sections.push({
    id: `${type}-${sections.length + 1}`,
    type,
    title,
    content: normalized,
    sourceId,
    score,
  })
}

function formatRoomFraming(roomTopic?: string, roomTone?: RoomTone) {
  const parts = [
    cleanText(roomTopic) ? `Room topic: ${cleanText(roomTopic)}` : '',
    roomTone ? `Room tone: ${roomTone}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

function formatReviewSummary(reviewSummary: ReviewSummary | undefined, maxItems: number) {
  if (!reviewSummary || maxItems <= 0) return ''

  const lines = [
    cleanText(reviewSummary.overview) ? `Overview: ${cleanText(reviewSummary.overview)}` : '',
    ...(reviewSummary.pain_points ?? []).slice(0, maxItems).map((item) => `Pain point: ${cleanText(item)}`),
    ...(reviewSummary.top_suggestions ?? []).slice(0, maxItems).map((suggestion) => {
      const evidence = cleanText(suggestion.evidence)
      return evidence ? `Suggestion: ${cleanText(suggestion.content)} Evidence: ${evidence}` : `Suggestion: ${cleanText(suggestion.content)}`
    }),
    ...(reviewSummary.consensus ?? []).slice(0, Math.max(1, Math.floor(maxItems / 2))).map((item) => `Consensus: ${cleanText(item)}`),
  ]

  return lines.filter(Boolean).join('\n')
}

function formatRecentMessages(messages: ChatMessage[], maxMessages: number, maxChars: number) {
  return messages
    .slice(-maxMessages)
    .map((message) => `${message.sender_name}: ${truncateText(message.content, maxChars)}`)
    .filter((line) => cleanText(line).length > 0)
    .join('\n')
}

function formatAgentMemory(memory: string[], maxItems: number, maxChars: number) {
  return memory
    .slice(-maxItems)
    .map((item) => `- ${truncateText(item, maxChars)}`)
    .filter((line) => cleanText(line).length > 2)
    .join('\n')
}

function formatPromptSection(section: ContextSection) {
  return `## ${section.title}\n${section.content}`
}

function summarizeFromDocumentContent(
  document: Pick<Document, 'raw_content' | 'structured_content'>,
  maxChars: number,
) {
  const structuredText = extractStructuredSections(document.structured_content)
    .slice(0, 2)
    .map((section) => section.content)
    .join(' ')

  return truncateText(structuredText || document.raw_content || '', maxChars)
}

function extractDocumentExcerptCandidates(
  document: Pick<Document, 'id' | 'title' | 'raw_content' | 'structured_content'>,
  maxCharsPerExcerpt: number,
): DocumentExcerpt[] {
  const structuredSections = extractStructuredSections(document.structured_content)
  const structuredExcerpts = structuredSections.map((section) => ({
    documentId: document.id,
    title: document.title,
    heading: section.title,
    content: truncateText(section.content, maxCharsPerExcerpt),
    score: 0,
  }))

  if (structuredExcerpts.length > 0) {
    return structuredExcerpts
  }

  return splitIntoChunks(document.raw_content || '', maxCharsPerExcerpt).map((chunk, index) => ({
    documentId: document.id,
    title: document.title,
    heading: `Part ${index + 1}`,
    content: chunk,
    score: 0,
  }))
}

function extractStructuredSections(structuredContent: Record<string, unknown> | undefined) {
  const sections = readSectionsArray(structuredContent?.sections)
    || readSectionsArray(structuredContent?.chapters)
    || readSectionsArray(structuredContent?.items)

  if (sections) return sections

  const rootContent = typeof structuredContent?.content === 'string' ? structuredContent.content : ''
  return rootContent ? [{ title: 'Content', content: rootContent }] : []
}

function readSectionsArray(value: unknown): Array<{ title?: string; content: string }> | undefined {
  if (!Array.isArray(value)) return undefined

  const sections: Array<{ title?: string; content: string }> = []

  value.forEach((item, index) => {
    if (typeof item === 'string') {
      sections.push({ title: `Section ${index + 1}`, content: item })
      return
    }

    if (!item || typeof item !== 'object') return

    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title : undefined
    const contentValue = record.content ?? record.text ?? record.body
    const content = typeof contentValue === 'string' ? contentValue : ''
    if (content) {
      sections.push(title ? { title, content } : { content })
    }
  })

  return sections.length > 0 ? sections : undefined
}

function splitIntoChunks(text: string, maxChars: number) {
  const normalized = cleanText(text)
  if (!normalized || maxChars <= 0) return []

  const targetChars = Math.min(maxChars, 320)
  return normalized
    .split(/\n+|(?<=[.!?。！？])\s+/)
    .map((paragraph) => truncateText(paragraph, targetChars))
    .filter(Boolean)
}

function scoreText(text: string, terms: string[]) {
  if (terms.length === 0) return 0

  const lowerText = text.toLowerCase()
  return terms.reduce((score, term) => score + countOccurrences(lowerText, term), 0)
}

function countOccurrences(text: string, term: string) {
  let count = 0
  let index = text.indexOf(term)

  while (index !== -1) {
    count += 1
    index = text.indexOf(term, index + term.length)
  }

  return count
}

function tokenize(text: string) {
  return Array.from(new Set(cleanText(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []))
    .filter((term) => term.length > 1)
}

function truncateText(text: string, maxChars: number) {
  const normalized = cleanText(text)
  if (maxChars <= 0 || normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`
}

function cleanText(text: string | undefined) {
  return (text || '').replace(/\s+/g, ' ').trim()
}
