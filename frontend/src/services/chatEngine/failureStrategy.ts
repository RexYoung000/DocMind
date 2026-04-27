import type { Agent } from '@/types'
import type { CapabilityProfile } from './strategyTypes'

export type FailureRecoveryAction =
  | 'retry_same_agent'
  | 'switch_agent'
  | 'summarize_stage'
  | 'preserve_user_message'

export interface AgentFailureState {
  agentId: string
  failedAttempts: number
  lastError?: string
}

export interface FailureRecoveryInput {
  failedAgent: Agent
  participants: Agent[]
  failureState: AgentFailureState
  capabilityProfiles?: Record<string, CapabilityProfile>
  maxRetriesPerAgent?: number
}

export interface FailureRecoveryPlan {
  action: FailureRecoveryAction
  retryAgent?: Agent
  preserveUserMessage: boolean
  reason: string
}

export function planFailureRecovery(input: FailureRecoveryInput): FailureRecoveryPlan {
  const maxRetries = input.maxRetriesPerAgent ?? 1

  if (input.failureState.failedAttempts <= maxRetries) {
    return {
      action: 'retry_same_agent',
      retryAgent: input.failedAgent,
      preserveUserMessage: true,
      reason: 'The current agent has retry budget remaining.',
    }
  }

  const replacement = findReplacementAgent(input)
  if (replacement) {
    return {
      action: 'switch_agent',
      retryAgent: replacement,
      preserveUserMessage: true,
      reason: 'The current agent failed repeatedly; switch to a compatible participant.',
    }
  }

  return {
    action: 'summarize_stage',
    preserveUserMessage: true,
    reason: 'No compatible replacement is available; preserve the user message and generate a stage summary.',
  }
}

export function shouldPreserveUserMessage(plan: FailureRecoveryPlan): boolean {
  return plan.preserveUserMessage || plan.action === 'preserve_user_message'
}

function findReplacementAgent(input: FailureRecoveryInput): Agent | undefined {
  const failedProfile = input.capabilityProfiles?.[input.failedAgent.id]
  const candidates = input.participants.filter((agent) => agent.id !== input.failedAgent.id)

  if (!failedProfile) {
    return candidates[0]
  }

  return candidates.find((agent) => {
    const profile = input.capabilityProfiles?.[agent.id]
    if (!profile) return false
    return profile.identityType === failedProfile.identityType || profile.knowledgeLevel === failedProfile.knowledgeLevel
  }) ?? candidates[0]
}
