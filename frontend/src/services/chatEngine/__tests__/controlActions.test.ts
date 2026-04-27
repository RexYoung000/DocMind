import { describe, expect, it } from 'vitest'
import type { Agent } from '@/types'
import { CHAT_CONTROL_ACTIONS, resolveChatControlAction } from '../controlActions'

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

describe('chat control actions', () => {
  it('defines every expected real-time control', () => {
    expect(CHAT_CONTROL_ACTIONS.map((action) => action.id)).toEqual([
      'increase_conflict',
      'decrease_conflict',
      'return_to_evidence',
      'student_view',
      'expert_judgment',
      'summarize_now',
      'reduce_noise',
      'advance_topic',
    ])
  })

  it('maps intensity controls to explicit strategy patches', () => {
    expect(resolveChatControlAction('increase_conflict').strategyPatch).toMatchObject({ conflictLevel: 'intense' })
    expect(resolveChatControlAction('decrease_conflict').strategyPatch).toMatchObject({ conflictLevel: 'soft' })
    expect(resolveChatControlAction('reduce_noise').strategyPatch).toMatchObject({ initiativeLevel: 'low' })
  })

  it('maps evidence control to an evidence-seeking instruction', () => {
    const action = resolveChatControlAction('return_to_evidence')

    expect(action.instruction).toMatch(/证据|原文|依据/)
    expect(action.strategyPatch).toMatchObject({ contextDepth: 'deep' })
  })

  it('resolves student and expert target agents from participants', () => {
    const student = makeAgent({ id: 'student-1', name: 'Student Voice', category: 'student' })
    const teacher = makeAgent({
      id: 'teacher-1',
      name: 'Teaching Expert',
      category: 'teacher',
      expertise: ['lesson review'],
    })

    expect(resolveChatControlAction('student_view', [teacher, student]).targetAgent?.id).toBe('student-1')
    expect(resolveChatControlAction('expert_judgment', [student, teacher]).targetAgent?.id).toBe('teacher-1')
  })
})
