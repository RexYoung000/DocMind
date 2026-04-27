import type { Agent, ChatAgendaItem, ChatMessage, DiscussionMode } from '@/types'
import type { ChatEngineEventType, RoutedChatEvent } from './eventRouterV2'
import type { CapabilityProfile, ConflictLevel, InitiativeLevel, SpeakingPosture } from './strategyTypes'
import { inferCapabilityProfile } from './capabilityProfiler'

export type TurnIntent =
  | 'open'
  | 'support'
  | 'challenge'
  | 'evidence'
  | 'question'
  | 'synthesize'
  | 'progress'

export interface TurnPlannerStrategy {
  discussionMode?: DiscussionMode
  conflictLevel?: ConflictLevel
  initiativeLevel?: InitiativeLevel
  maxTurns?: number
}

export interface TurnPlannerInput {
  participants: Agent[]
  messages: ChatMessage[]
  events: RoutedChatEvent[]
  currentTopic?: ChatAgendaItem | null
  strategy?: TurnPlannerStrategy
  capabilityProfiles?: Record<string, CapabilityProfile>
}

export interface PlannedTurn {
  agent: Agent
  event: RoutedChatEvent
  intent: TurnIntent
  speakingPosture: SpeakingPosture
  focus: string
  priority: number
  reason: string
  capabilityProfile: CapabilityProfile
  wasPostureTranslated: boolean
}

type ResolvedTurnPlannerStrategy = Required<Omit<TurnPlannerStrategy, 'maxTurns'>> & {
  maxTurns?: number
}

const DEFAULT_STRATEGY: Required<Omit<TurnPlannerStrategy, 'maxTurns'>> = {
  discussionMode: 'free',
  conflictLevel: 'balanced',
  initiativeLevel: 'standard',
}

const PROFESSIONAL_POSTURES: SpeakingPosture[] = ['expert_judgment', 'summary_bridge']

export function planDiscussionTurns(input: TurnPlannerInput): PlannedTurn[] {
  const strategy = { ...DEFAULT_STRATEGY, ...input.strategy }
  const events = input.events.length > 0 ? input.events : [createFallbackEvent(input.currentTopic)]
  const maxTurns = resolveMaxTurns(strategy, events[0]?.type)
  const planned: PlannedTurn[] = []
  const usedAgentIds = new Set<string>()

  for (const event of events) {
    if (planned.length >= maxTurns) break

    const requestedPosture = requestedPostureForEvent(event.type, strategy)
    const intent = intentForEvent(event.type, strategy)
    const candidates = scoreAgents(input.participants, input, event, requestedPosture, strategy)

    for (const candidate of candidates) {
      if (planned.length >= maxTurns) break
      if (usedAgentIds.has(candidate.agent.id)) continue

      const profile = getCapabilityProfile(candidate.agent, input.capabilityProfiles)
      const posture = translatePosture(requestedPosture, profile)
      const wasPostureTranslated = posture !== requestedPosture

      planned.push({
        agent: candidate.agent,
        event,
        intent: intentForPosture(intent, posture, wasPostureTranslated),
        speakingPosture: posture,
        focus: buildFocus(event, input.currentTopic),
        priority: event.priority + candidate.score,
        reason: buildReason(candidate.agent, event, posture, wasPostureTranslated),
        capabilityProfile: profile,
        wasPostureTranslated,
      })
      usedAgentIds.add(candidate.agent.id)
    }
  }

  return planned.sort((a, b) => b.priority - a.priority).slice(0, maxTurns)
}

export function translatePosture(
  requestedPosture: SpeakingPosture,
  profile: CapabilityProfile,
): SpeakingPosture {
  if (profile.allowedPostures.includes(requestedPosture)) return requestedPosture
  if (PROFESSIONAL_POSTURES.includes(requestedPosture)) return profile.fallbackPosture
  return profile.allowedPostures[0] ?? profile.fallbackPosture
}

function scoreAgents(
  participants: Agent[],
  input: TurnPlannerInput,
  event: RoutedChatEvent,
  requestedPosture: SpeakingPosture,
  strategy: ResolvedTurnPlannerStrategy,
): Array<{ agent: Agent; score: number }> {
  return participants
    .map((agent) => {
      const profile = getCapabilityProfile(agent, input.capabilityProfiles)
      const recentPenalty = recentSpeakingPenalty(agent.id, input.messages)
      const topicScore = topicAffinity(agent, input.currentTopic)
      const personalityScore = personalityFit(agent, event.type, requestedPosture, strategy)
      const targetScore = event.targetAgentId === agent.id ? 140 : 0
      const capabilityScore = profile.allowedPostures.includes(requestedPosture) ? 35 : 12

      return {
        agent,
        score: targetScore + topicScore + personalityScore + capabilityScore - recentPenalty,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function getCapabilityProfile(
  agent: Agent,
  profiles?: Record<string, CapabilityProfile>,
): CapabilityProfile {
  return profiles?.[agent.id] ?? inferCapabilityProfile(agent)
}

function requestedPostureForEvent(
  eventType: ChatEngineEventType,
  strategy: ResolvedTurnPlannerStrategy,
): SpeakingPosture {
  switch (eventType) {
    case 'evidence_request':
    case 'document_attached':
      return 'expert_judgment'
    case 'confusion_detected':
      return 'clarifying_question'
    case 'collision_detected':
      return strategy.conflictLevel === 'soft' ? 'clarifying_question' : 'expert_judgment'
    case 'topic_progression':
      return 'summary_bridge'
    case 'user_mention':
      return 'expert_judgment'
    case 'idle_followup':
      return strategy.initiativeLevel === 'high' ? 'risk_signal' : 'clarifying_question'
  }
}

function intentForEvent(eventType: ChatEngineEventType, strategy: ResolvedTurnPlannerStrategy): TurnIntent {
  switch (eventType) {
    case 'evidence_request':
    case 'document_attached':
      return 'evidence'
    case 'confusion_detected':
      return 'question'
    case 'collision_detected':
      return strategy.conflictLevel === 'soft' ? 'question' : 'challenge'
    case 'topic_progression':
      return 'synthesize'
    case 'user_mention':
      return 'open'
    case 'idle_followup':
      return 'progress'
  }
}

function intentForPosture(intent: TurnIntent, posture: SpeakingPosture, translated: boolean): TurnIntent {
  if (!translated) return intent
  if (posture === 'experience_feedback') return 'support'
  if (posture === 'clarifying_question') return 'question'
  if (posture === 'risk_signal') return 'challenge'
  return intent
}

function resolveMaxTurns(strategy: ResolvedTurnPlannerStrategy, firstEventType?: ChatEngineEventType): number {
  if (strategy.maxTurns && strategy.maxTurns > 0) return strategy.maxTurns
  if (firstEventType === 'user_mention') return 1
  if (strategy.discussionMode === 'debate' || strategy.conflictLevel === 'intense') return 3
  if (strategy.initiativeLevel === 'low') return 1
  return strategy.initiativeLevel === 'high' ? 3 : 2
}

function recentSpeakingPenalty(agentId: string, messages: ChatMessage[]): number {
  const lastAgentMessages = messages
    .filter((message) => message.sender_type === 'agent' && message.sender_id !== 'system')
    .slice(-4)

  const lastIndex = [...lastAgentMessages].reverse().findIndex((message) => message.sender_id === agentId)
  if (lastIndex === -1) return 0
  return 45 - Math.min(lastIndex * 10, 30)
}

function topicAffinity(agent: Agent, topic?: ChatAgendaItem | null): number {
  if (!topic) return 0
  const topicText = topic.text.toLowerCase()
  const expertiseHit = agent.expertise.some((item) => topicText.includes(item.toLowerCase()))
  const focusHit = agent.focusDimension ? topicText.includes(agent.focusDimension.toLowerCase()) : false
  const categoryHit = agent.category ? topicText.includes(agent.category.toLowerCase()) : false
  return (expertiseHit ? 30 : 0) + (focusHit ? 35 : 0) + (categoryHit ? 15 : 0)
}

function personalityFit(
  agent: Agent,
  eventType: ChatEngineEventType,
  requestedPosture: SpeakingPosture,
  strategy: ResolvedTurnPlannerStrategy,
): number {
  const { directness, strictness, empathy, humor } = agent.personality
  let score = 0

  if (eventType === 'collision_detected') {
    score += directness * (strategy.conflictLevel === 'intense' ? 1.4 : 0.9)
    score += strictness * 0.8
  }
  if (eventType === 'confusion_detected' || requestedPosture === 'clarifying_question') {
    score += empathy * 1.1
  }
  if (eventType === 'evidence_request' || requestedPosture === 'expert_judgment') {
    score += strictness
  }
  if (strategy.initiativeLevel === 'high') {
    score += directness * 0.4 + humor * 0.2
  }

  return score
}

function buildFocus(event: RoutedChatEvent, topic?: ChatAgendaItem | null): string {
  return event.payload.content ?? event.payload.topic ?? topic?.text ?? 'Continue the room discussion.'
}

function buildReason(
  agent: Agent,
  event: RoutedChatEvent,
  posture: SpeakingPosture,
  translated: boolean,
): string {
  const translatedText = translated ? ' The requested professional stance was translated into a role-safe posture.' : ''
  return `${agent.name} selected for ${event.type} using ${posture}.${translatedText}`
}

function createFallbackEvent(topic?: ChatAgendaItem | null): RoutedChatEvent {
  return {
    id: `idle_followup:${topic?.id ?? 'default'}`,
    type: 'idle_followup',
    priority: 200,
    createdAt: Date.now(),
    reason: 'No explicit event was provided, so the planner created a natural follow-up.',
    topicId: topic?.id,
    payload: {
      topic: topic?.text,
    },
  }
}
