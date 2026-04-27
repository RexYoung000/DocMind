import type { ChatMessage } from '@/types'
import { contentSimilarity } from './repetitionGuard'

export interface ChatDiscussionArtifact {
  consensus: string[]
  disagreements: string[]
  actionItems: string[]
  openQuestions: string[]
  adoptedIdeas: string[]
  generatedAt: string
}

export function buildDiscussionArtifact(messages: ChatMessage[], now = new Date().toISOString()): ChatDiscussionArtifact {
  const agentMessages = messages.filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system')

  return {
    consensus: dedupeStatements(agentMessages.flatMap((message) => extractByPatterns(message.content, CONSENSUS_PATTERNS))),
    disagreements: dedupeStatements(agentMessages.flatMap((message) => extractByPatterns(message.content, DISAGREEMENT_PATTERNS))),
    actionItems: dedupeStatements(agentMessages.flatMap((message) => extractByPatterns(message.content, ACTION_PATTERNS))),
    openQuestions: dedupeStatements(messages.flatMap((message) => extractQuestions(message.content))),
    adoptedIdeas: dedupeStatements(agentMessages.flatMap((message) => extractByPatterns(message.content, ADOPTED_PATTERNS))),
    generatedAt: now,
  }
}

export function exportDiscussionArtifactAsMarkdown(artifact: ChatDiscussionArtifact): string {
  return [
    '# 聊天室讨论纪要',
    '',
    formatSection('当前共识', artifact.consensus),
    formatSection('关键分歧', artifact.disagreements),
    formatSection('可执行建议', artifact.actionItems),
    formatSection('待验证问题', artifact.openQuestions),
    formatSection('被采纳观点', artifact.adoptedIdeas),
  ].filter(Boolean).join('\n')
}

function formatSection(title: string, items: string[]) {
  if (items.length === 0) return `## ${title}\n- 暂无`
  return `## ${title}\n${items.map((item) => `- ${item}`).join('\n')}`
}

function extractByPatterns(content: string, patterns: RegExp[]): string[] {
  return splitSentences(content).filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
}

function extractQuestions(content: string): string[] {
  return splitSentences(content).filter((sentence) => /\?|？|为什么|如何|是否|能否|待验证|需要确认/i.test(sentence))
}

function dedupeStatements(items: string[], maxItems = 6): string[] {
  const normalizedItems = items
    .map(cleanStatement)
    .filter((item) => item.length >= 4)

  const result: string[] = []
  for (const item of normalizedItems) {
    if (result.some((existing) => contentSimilarity(existing, item) > 0.72)) continue
    result.push(item)
    if (result.length >= maxItems) break
  }

  return result
}

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?。！？])\s+|[\n\r]+/)
    .map(cleanStatement)
    .filter(Boolean)
}

function cleanStatement(value: string): string {
  return value.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim()
}

const CONSENSUS_PATTERNS = [
  /\b(agree|consensus|we can keep|shared view)\b/i,
  /共识|一致认为|可以保留|同意|赞同/,
]

const DISAGREEMENT_PATTERNS = [
  /\b(disagree|however|but|concern|risk|conflict|not convinced)\b/i,
  /分歧|不同意|但是|担心|风险|争议|反对/,
]

const ACTION_PATTERNS = [
  /\b(should|need to|action|next step|recommend|add|remove|trim|adjust)\b/i,
  /建议|应该|需要|下一步|补充|删除|压缩|调整|增加/,
]

const ADOPTED_PATTERNS = [
  /\b(adopt|accepted|take this|use this)\b/i,
  /采纳|接受|采用|保留这个|按这个/,
]
