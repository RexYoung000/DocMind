export { detectCollisions } from './collisionDetector'
export type { Collision } from './collisionDetector'

export { TopicPool } from './topicPool'
export type { Topic } from './topicPool'

export { evaluateTriggers, getEventPromptSuffix } from './eventTriggers'

export { createEvent } from './events'
export type {
  ChatEvent,
  ChatEventType,
  UserMessageEvent,
  AgentResponseEvent,
  IdleEvent,
  RoleCollisionEvent,
  TopicTriggerEvent,
} from './events'

export { routeChatEvents, getEventPriority } from './eventRouterV2'
export type {
  CollisionSignal,
  EventRouterInput,
  RoutedChatEvent,
} from './eventRouterV2'

export { planDiscussionTurns, translatePosture } from './turnPlanner'
export type {
  PlannedTurn,
  TurnIntent,
  TurnPlannerInput,
  TurnPlannerStrategy,
} from './turnPlanner'

export { stateFromAgendaStatus, suggestTopicLifecycleTransition } from './topicLifecycle'
export type {
  TopicLifecycleInput,
  TopicLifecycleSuggestion,
} from './topicLifecycle'

export { getFeedbackSteps } from './feedbackController'
export type { FeedbackStep } from './feedbackController'

export { buildFeedbackDisplay, getFeedbackStatusText } from './feedbackPresenter'
export type {
  FeedbackDisplayItem,
  FeedbackTone,
} from './feedbackPresenter'

export {
  buildTurnMessageMetadata,
  getMessageMetadataBadges,
  inferContextSource,
  inferEvidenceLevel,
} from './messageMetadata'
export type {
  MessageMetadataBadge,
  MessageMetadataInput,
  MetadataBadgeTone,
} from './messageMetadata'

export { CHAT_CONTROL_ACTIONS, resolveChatControlAction } from './controlActions'
export type {
  ChatControlActionDefinition,
  ChatControlActionId,
  ResolvedChatControlAction,
} from './controlActions'

export { buildDiscussionArtifact, exportDiscussionArtifactAsMarkdown } from './artifactBuilder'
export type { ChatDiscussionArtifact } from './artifactBuilder'

export { planFailureRecovery, shouldPreserveUserMessage } from './failureStrategy'
export type {
  AgentFailureState,
  FailureRecoveryAction,
  FailureRecoveryInput,
  FailureRecoveryPlan,
} from './failureStrategy'

export { createStrategyLogEntry, sanitizeStrategyLogEntry, serializeStrategyLog } from './strategyLogger'
export type {
  StrategyLogEntry,
  StrategyLogInput,
} from './strategyLogger'

export { assembleLayeredContext, selectRelevantDocumentExcerpts } from './contextAssembler'
export type {
  AssembleContextInput,
  AssembledContext,
  ContextSection,
  ContextSectionType,
} from './contextAssembler'

export {
  buildAgentMemoryMap,
  createEmptyAgentMemory,
  extractAgentMemory,
  inferMessageIntent,
  inferMessageStance,
  updateAgentMemory,
} from './memoryTracker'
export type {
  AgentDiscussionMemory,
  AgentMemoryClaim,
  UpdateAgentMemoryOptions,
} from './memoryTracker'

export {
  contentSimilarity,
  guardAgainstRepetition,
  suggestNonRepeatedMove,
} from './repetitionGuard'
export type {
  RepetitionAction,
  RepetitionGuardInput,
  RepetitionGuardResult,
} from './repetitionGuard'

export {
  buildRepetitionRecoveryInstruction,
  createIdentitySafeFallbackReply,
  formatAgentMemoryForContext,
} from './runtimeGuards'

export {
  classifyEvidence,
  isEvidenceRequest,
  rankEvidenceForRequest,
} from './evidenceClassifier'
export type {
  EvidenceCandidate,
  EvidenceClassificationInput,
  EvidenceClassificationResult,
  RankedEvidenceCandidate,
} from './evidenceClassifier'

export {
  DEFAULT_CHAT_ROOM_STRATEGY,
  normalizeChatRoomStrategy,
} from './strategyTypes'
export type {
  AgentRuntimeState,
  AgentStance,
  AgentTurnIntent,
  CapabilityProfile,
  ChatEngineEvent,
  ChatEngineEventType,
  ChatRoomStrategy,
  CitationPolicy,
  ConflictLevel,
  ContextDepth,
  ContextSource,
  EvidenceLevel,
  EvidenceStyle,
  FeedbackLevel,
  IdentityBoundaryLevel,
  IdentityType,
  InitiativeLevel,
  KnowledgeLevel,
  MessageIntent,
  RoomTone,
  SpeakingPosture,
  TopicLifecycleState,
} from './strategyTypes'

export {
  buildCapabilityInstruction,
  inferCapabilityProfile,
  isPostureAllowed,
  resolveAllowedPosture,
} from './capabilityProfiler'
export type { CapabilityAgentInput } from './capabilityProfiler'

export { validateAndAdaptResponse } from './responseValidator'
export type {
  ResponseValidationInput,
  ResponseValidationResult,
  ResponseViolation,
} from './responseValidator'
