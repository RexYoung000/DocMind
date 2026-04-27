import type { ChatRoomStrategy } from '@/types'
import type { RoutedChatEvent } from './eventRouterV2'
import type { SpeakingPosture } from './strategyTypes'

export interface StrategyLogInput {
  roomId: string
  agentId?: string
  selectedAgentName?: string
  event?: RoutedChatEvent
  strategy?: Partial<ChatRoomStrategy>
  contextSummary?: string
  usedContext?: string[]
  requestedPosture?: SpeakingPosture
  finalPosture?: SpeakingPosture
  wasPostureTranslated?: boolean
  outputWasRewritten?: boolean
  topicSwitchReason?: string
  timestamp?: string
}

export interface StrategyLogEntry extends Required<Pick<StrategyLogInput, 'roomId'>> {
  timestamp: string
  agentId?: string
  selectedAgentName?: string
  eventType?: string
  eventReason?: string
  strategy?: Partial<ChatRoomStrategy>
  contextSummary?: string
  usedContext?: string[]
  requestedPosture?: SpeakingPosture
  finalPosture?: SpeakingPosture
  wasPostureTranslated: boolean
  outputWasRewritten: boolean
  topicSwitchReason?: string
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /(api[_-]?key\s*[:=]\s*)[A-Za-z0-9_-]{8,}/gi,
  /(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._-]+/gi,
]

export function createStrategyLogEntry(input: StrategyLogInput): StrategyLogEntry {
  return sanitizeStrategyLogEntry({
    roomId: input.roomId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    agentId: input.agentId,
    selectedAgentName: input.selectedAgentName,
    eventType: input.event?.type,
    eventReason: input.event?.reason,
    strategy: input.strategy,
    contextSummary: input.contextSummary,
    usedContext: input.usedContext,
    requestedPosture: input.requestedPosture,
    finalPosture: input.finalPosture,
    wasPostureTranslated: Boolean(input.wasPostureTranslated),
    outputWasRewritten: Boolean(input.outputWasRewritten),
    topicSwitchReason: input.topicSwitchReason,
  })
}

export function sanitizeStrategyLogEntry(entry: StrategyLogEntry): StrategyLogEntry {
  return {
    ...entry,
    contextSummary: sanitizeLogText(entry.contextSummary),
    usedContext: entry.usedContext?.map((item) => sanitizeLogText(item)).filter(isPresent),
    eventReason: sanitizeLogText(entry.eventReason),
    topicSwitchReason: sanitizeLogText(entry.topicSwitchReason),
  }
}

export function serializeStrategyLog(entry: StrategyLogEntry): string {
  return JSON.stringify(sanitizeStrategyLogEntry(entry))
}

function sanitizeLogText(value?: string): string | undefined {
  if (!value) return undefined

  const redacted = SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (_match, prefix = '') => `${prefix}[redacted]`),
    value,
  )

  return redacted.length > 600 ? `${redacted.slice(0, 600)}...` : redacted
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value)
}
