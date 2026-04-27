import type { FeedbackLevel } from './strategyTypes'
import type { RoutedChatEvent } from './eventRouterV2'

export type FeedbackStep =
  | 'agent_typing'
  | 'planning_turn'
  | 'reading_document'
  | 'locating_relevant_passage'
  | 'responding_with_context'
  | 'searching_evidence'
  | 'checking_context_source'
  | 'responding_with_evidence'
  | 'reviewing_conflict'
  | 'forming_challenge'
  | 'responding_to_agent'
  | 'summarizing_topic'
  | 'switching_topic'

export function getFeedbackSteps(event: RoutedChatEvent, feedbackLevel: FeedbackLevel): FeedbackStep[] {
  if (feedbackLevel === 'simple') return ['agent_typing']

  switch (event.type) {
    case 'document_attached':
      return ['reading_document', 'locating_relevant_passage', 'responding_with_context']
    case 'evidence_request':
      return ['searching_evidence', 'checking_context_source', 'responding_with_evidence']
    case 'collision_detected':
      return ['reviewing_conflict', 'forming_challenge', 'responding_to_agent']
    case 'topic_progression':
      return ['summarizing_topic', 'switching_topic']
    default:
      return ['planning_turn', 'agent_typing']
  }
}
