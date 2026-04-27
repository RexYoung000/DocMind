import type { ChatAgendaItem, ChatMessage } from '@/types'
import type { RoutedChatEvent } from './eventRouterV2'

export type TopicLifecycleState =
  | 'opened'
  | 'exploring'
  | 'conflicting'
  | 'grounding'
  | 'closing'
  | 'done'

export interface TopicLifecycleInput {
  topic: ChatAgendaItem
  state?: TopicLifecycleState
  messages: ChatMessage[]
  events?: RoutedChatEvent[]
  now?: number
  minExplorationMessages?: number
  minGroundingMessages?: number
}

export interface TopicLifecycleSuggestion {
  currentState: TopicLifecycleState
  suggestedState: TopicLifecycleState
  shouldAdvance: boolean
  reason: string
  nextAction:
    | 'open_topic'
    | 'explore_views'
    | 'invite_challenge'
    | 'seek_evidence'
    | 'summarize_topic'
    | 'mark_done'
}

const DEFAULT_MIN_EXPLORATION_MESSAGES = 3
const DEFAULT_MIN_GROUNDING_MESSAGES = 2

export function suggestTopicLifecycleTransition(input: TopicLifecycleInput): TopicLifecycleSuggestion {
  const currentState = input.state ?? stateFromAgendaStatus(input.topic)
  const topicMessages = getTopicMessages(input)
  const agentMessages = topicMessages.filter((message) => message.sender_type === 'agent')
  const events = input.events ?? []
  const hasCollision = events.some((event) => event.type === 'collision_detected')
  const needsEvidence = events.some((event) => event.type === 'evidence_request' || event.type === 'document_attached')
  const hasProgression = events.some((event) => event.type === 'topic_progression')
  const minExploration = input.minExplorationMessages ?? DEFAULT_MIN_EXPLORATION_MESSAGES
  const minGrounding = input.minGroundingMessages ?? DEFAULT_MIN_GROUNDING_MESSAGES

  if (input.topic.status === 'done' || currentState === 'done') {
    return buildSuggestion(currentState, 'done', true, 'Topic is already marked done.', 'mark_done')
  }

  if (needsEvidence && currentState !== 'grounding' && currentState !== 'closing') {
    return buildSuggestion(currentState, 'grounding', true, 'The room needs evidence or document grounding.', 'seek_evidence')
  }

  if (hasCollision && currentState !== 'conflicting' && currentState !== 'grounding') {
    return buildSuggestion(currentState, 'conflicting', true, 'A collision event indicates the topic should handle disagreement.', 'invite_challenge')
  }

  switch (currentState) {
    case 'opened':
      if (agentMessages.length > 0) {
        return buildSuggestion(currentState, 'exploring', true, 'At least one agent has responded to the opened topic.', 'explore_views')
      }
      return buildSuggestion(currentState, 'opened', false, 'The topic still needs an opening response.', 'open_topic')

    case 'exploring':
      if (hasProgression || agentMessages.length >= minExploration) {
        return buildSuggestion(currentState, 'closing', true, 'The topic has enough exploratory messages to start closing.', 'summarize_topic')
      }
      return buildSuggestion(currentState, 'exploring', false, 'The topic still needs more perspectives.', 'explore_views')

    case 'conflicting':
      if (needsEvidence) {
        return buildSuggestion(currentState, 'grounding', true, 'The conflict should be grounded in evidence before closing.', 'seek_evidence')
      }
      if (agentMessages.length >= minExploration + 2) {
        return buildSuggestion(currentState, 'closing', true, 'The conflict has enough discussion to synthesize.', 'summarize_topic')
      }
      return buildSuggestion(currentState, 'conflicting', false, 'The disagreement needs another role-safe response.', 'invite_challenge')

    case 'grounding':
      if (agentMessages.length >= minGrounding && !needsEvidence) {
        return buildSuggestion(currentState, 'closing', true, 'Grounding has enough responses to summarize.', 'summarize_topic')
      }
      if (agentMessages.length >= minGrounding + 1) {
        return buildSuggestion(currentState, 'closing', true, 'Grounding has produced enough material even though evidence demand remains active.', 'summarize_topic')
      }
      return buildSuggestion(currentState, 'grounding', false, 'The topic still needs evidence or document-specific grounding.', 'seek_evidence')

    case 'closing':
      if (hasProgression || agentMessages.length >= minExploration + minGrounding) {
        return buildSuggestion(currentState, 'done', true, 'The topic has been summarized and can be marked done.', 'mark_done')
      }
      return buildSuggestion(currentState, 'closing', false, 'The topic needs a concise summary before it is done.', 'summarize_topic')
  }
}

export function stateFromAgendaStatus(topic: ChatAgendaItem): TopicLifecycleState {
  if (topic.status === 'done') return 'done'
  if (topic.status === 'active') return 'opened'
  return 'opened'
}

function getTopicMessages(input: TopicLifecycleInput): ChatMessage[] {
  const marker = input.topic.text.slice(0, 12)
  if (!marker) return input.messages
  const matched = input.messages.filter((message) => message.content.includes(marker))
  return matched.length > 0 ? matched : input.messages.slice(-8)
}

function buildSuggestion(
  currentState: TopicLifecycleState,
  suggestedState: TopicLifecycleState,
  shouldAdvance: boolean,
  reason: string,
  nextAction: TopicLifecycleSuggestion['nextAction'],
): TopicLifecycleSuggestion {
  return {
    currentState,
    suggestedState,
    shouldAdvance,
    reason,
    nextAction,
  }
}
