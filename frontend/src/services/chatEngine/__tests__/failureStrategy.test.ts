import { describe, expect, it } from 'vitest'
import type { Agent } from '@/types'
import { planFailureRecovery, shouldPreserveUserMessage } from '../failureStrategy'
import type { CapabilityProfile } from '../strategyTypes'

function makeAgent(overrides: Partial<Agent> & Pick<Agent, 'id' | 'name'>): Agent {
  return {
    owner_id: 'user-1',
    tagline: 'Test participant',
    personality: { directness: 3, strictness: 3, humor: 2, empathy: 3 },
    expertise: [],
    behavior: { style: 'Test style' },
    system_prompt: 'Stay in role.',
    source: 'custom',
    is_public: false,
    usage_count: 0,
    color: 'indigo',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

function profile(identityType: CapabilityProfile['identityType']): CapabilityProfile {
  return {
    identityType,
    knowledgeLevel: identityType === 'student' ? 'experiential' : 'expert',
    allowedPostures: ['experience_feedback', 'clarifying_question'],
    forbiddenClaims: [],
    preferredEvidenceStyle: 'professional',
    fallbackPosture: 'clarifying_question',
    confidence: 0.8,
    sourceSignals: [],
    boundaryNotes: [],
  }
}

describe('failure recovery planning', () => {
  it('retries the same agent while retry budget remains', () => {
    const agent = makeAgent({ id: 'teacher-1', name: 'Teacher' })
    const plan = planFailureRecovery({
      failedAgent: agent,
      participants: [agent],
      failureState: { agentId: agent.id, failedAttempts: 1 },
      maxRetriesPerAgent: 1,
    })

    expect(plan.action).toBe('retry_same_agent')
    expect(plan.retryAgent?.id).toBe('teacher-1')
    expect(shouldPreserveUserMessage(plan)).toBe(true)
  })

  it('switches to a compatible agent after repeated failure', () => {
    const failed = makeAgent({ id: 'teacher-1', name: 'Teacher' })
    const replacement = makeAgent({ id: 'teacher-2', name: 'Backup Teacher' })
    const plan = planFailureRecovery({
      failedAgent: failed,
      participants: [failed, replacement],
      failureState: { agentId: failed.id, failedAttempts: 2 },
      maxRetriesPerAgent: 1,
      capabilityProfiles: {
        [failed.id]: profile('teacher'),
        [replacement.id]: profile('teacher'),
      },
    })

    expect(plan.action).toBe('switch_agent')
    expect(plan.retryAgent?.id).toBe('teacher-2')
  })

  it('falls back to stage summary when no replacement exists', () => {
    const failed = makeAgent({ id: 'teacher-1', name: 'Teacher' })
    const plan = planFailureRecovery({
      failedAgent: failed,
      participants: [failed],
      failureState: { agentId: failed.id, failedAttempts: 3 },
      maxRetriesPerAgent: 1,
    })

    expect(plan.action).toBe('summarize_stage')
    expect(plan.preserveUserMessage).toBe(true)
  })
})
