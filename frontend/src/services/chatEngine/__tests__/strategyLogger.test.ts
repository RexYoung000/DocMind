import { describe, expect, it } from 'vitest'
import { createStrategyLogEntry, serializeStrategyLog } from '../strategyLogger'
import type { RoutedChatEvent } from '../eventRouterV2'

function makeEvent(): RoutedChatEvent {
  return {
    id: 'event-1',
    type: 'evidence_request',
    priority: 1,
    createdAt: 1,
    reason: 'User asked for evidence.',
    payload: { content: 'Where is the quote?' },
  }
}

describe('strategy logging', () => {
  it('records why an agent was selected and whether posture changed', () => {
    const entry = createStrategyLogEntry({
      roomId: 'room-1',
      agentId: 'student-1',
      selectedAgentName: 'Student Voice',
      event: makeEvent(),
      requestedPosture: 'expert_judgment',
      finalPosture: 'experience_feedback',
      wasPostureTranslated: true,
      outputWasRewritten: true,
      topicSwitchReason: 'current topic reached evidence grounding',
      timestamp: '2026-04-27T00:00:00.000Z',
    })

    expect(entry.eventType).toBe('evidence_request')
    expect(entry.wasPostureTranslated).toBe(true)
    expect(entry.outputWasRewritten).toBe(true)
    expect(entry.topicSwitchReason).toContain('evidence grounding')
  })

  it('redacts API keys and truncates long context before serialization', () => {
    const entry = createStrategyLogEntry({
      roomId: 'room-1',
      contextSummary: `apiKey=secret123456 ${'long document text '.repeat(80)}`,
      usedContext: ['Authorization: Bearer abc.def.ghi', 'safe context'],
    })
    const serialized = serializeStrategyLog(entry)

    expect(serialized).not.toContain('secret123456')
    expect(serialized).not.toContain('abc.def.ghi')
    expect(serialized).toContain('[redacted]')
    expect(JSON.parse(serialized).contextSummary.length).toBeLessThanOrEqual(603)
  })
})
