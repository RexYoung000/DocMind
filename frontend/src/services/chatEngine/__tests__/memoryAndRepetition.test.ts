import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types'
import { buildAgentMemoryMap, extractAgentMemory, updateAgentMemory } from '../memoryTracker'
import { guardAgainstRepetition } from '../repetitionGuard'

function agentMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-agent',
    room_id: 'room-1',
    sender_type: 'agent',
    sender_id: 'agent-1',
    sender_name: 'Agent',
    content: 'hello',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('agent memory tracking', () => {
  it('lets an agent read its own previous stance in the next round', () => {
    const memory = extractAgentMemory(
      [
        agentMessage({
          id: 'm1',
          sender_id: 'teacher-1',
          content: 'I support @student-1 on keeping the warm-up. The activity gives students a concrete entry point.',
        }),
      ],
      'teacher-1',
    )

    expect(memory.stance).toBe('supporting')
    expect(memory.lastIntent).toBe('support')
    expect(memory.supportedAgentIds).toContain('student-1')
    expect(memory.claims.some((claim) => claim.text.includes('concrete entry point'))).toBe(true)
  })

  it('does not casually reverse stance when a later message adds no new opposition', () => {
    const firstRound = extractAgentMemory(
      [
        agentMessage({
          id: 'm1',
          sender_id: 'teacher-1',
          content: 'I support keeping the peer discussion because it makes the lesson more observable.',
        }),
      ],
      'teacher-1',
    )

    const nextRound = updateAgentMemory(firstRound, [
      agentMessage({
        id: 'm2',
        sender_id: 'teacher-1',
        content: 'The timing risk needs monitoring.',
      }),
    ])

    expect(nextRound.stance).toBe('supporting')
    expect(nextRound.lastIntent).toBe('open')
    expect(nextRound.claims.map((claim) => claim.text)).toContain('The timing risk needs monitoring.')
  })

  it('builds isolated memories for each agent from the same message stream', () => {
    const memories = buildAgentMemoryMap([
      agentMessage({
        id: 'm1',
        sender_id: 'teacher-1',
        content: 'I support @student-1 because the example is clear.',
      }),
      agentMessage({
        id: 'm2',
        sender_id: 'student-1',
        content: 'Why is the example enough for slower learners?',
      }),
    ])

    expect(memories['teacher-1'].stance).toBe('supporting')
    expect(memories['student-1'].lastIntent).toBe('question')
    expect(memories['student-1'].unresolvedQuestions[0]).toContain('slower learners')
  })
})

describe('repetition guard', () => {
  const priorPoint = agentMessage({
    id: 'prior-1',
    sender_id: 'teacher-1',
    content: 'The lesson needs a shorter warm-up because the discussion block already uses most of the time.',
  })

  it('prevents a highly similar point from being repeated', () => {
    const result = guardAgainstRepetition({
      agentId: 'teacher-1',
      candidateContent: 'The lesson needs a shorter warm-up because the discussion block already uses most of the time.',
      recentMessages: [priorPoint],
    })

    expect(result.action).toBe('skip')
    expect(result.shouldSpeak).toBe(false)
    expect(result.matchedMessageId).toBe('prior-1')
    expect(result.similarity).toBeGreaterThan(0.9)
  })

  it('turns repeated content into a follow-up question when the candidate asks one', () => {
    const result = guardAgainstRepetition({
      agentId: 'student-1',
      candidateContent: 'The lesson needs a shorter warm-up, but how much time should the discussion block keep?',
      recentMessages: [priorPoint],
      similarityThreshold: 0.45,
    })

    expect(result.action).toBe('question')
    expect(result.shouldSpeak).toBe(true)
  })

  it('allows a repeated point when it adds evidence refs instead of restating only', () => {
    const result = guardAgainstRepetition({
      agentId: 'analyst-1',
      candidateContent: 'The lesson needs a shorter warm-up because the discussion block already uses most of the time.',
      recentMessages: [priorPoint],
      evidenceRefs: ['quote:Timing table'],
    })

    expect(result.action).toBe('evidence')
    expect(result.shouldSpeak).toBe(true)
  })

  it('can redirect repeated content into synthesis', () => {
    const result = guardAgainstRepetition({
      agentId: 'analyst-1',
      candidateContent: 'Overall, the lesson needs a shorter warm-up because the discussion block already uses most of the time.',
      recentMessages: [priorPoint],
      similarityThreshold: 0.6,
    })

    expect(result.action).toBe('summarize')
    expect(result.shouldSpeak).toBe(true)
  })
})
