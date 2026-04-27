import { describe, expect, it } from 'vitest'
import { getFeedbackSteps } from '../feedbackController'
import { buildFeedbackDisplay, getFeedbackStatusText } from '../feedbackPresenter'
import type { RoutedChatEvent } from '../eventRouterV2'

function makeEvent(type: RoutedChatEvent['type']): RoutedChatEvent {
  return {
    id: `event-${type}`,
    type,
    priority: 1,
    createdAt: 1,
    reason: 'test event',
    payload: {},
  }
}

describe('feedback presentation', () => {
  it('keeps simple feedback to lightweight typing only', () => {
    const steps = getFeedbackSteps(makeEvent('document_attached'), 'simple')
    const display = buildFeedbackDisplay(steps)

    expect(display).toHaveLength(1)
    expect(display[0]).toMatchObject({
      step: 'agent_typing',
      tone: 'neutral',
      active: true,
    })
  })

  it('shows document handling as a full ordered process', () => {
    const steps = getFeedbackSteps(makeEvent('document_attached'), 'full')
    const display = buildFeedbackDisplay(steps)

    expect(display.map((item) => item.step)).toEqual([
      'reading_document',
      'locating_relevant_passage',
      'responding_with_context',
    ])
    expect(display.every((item) => item.tone === 'document')).toBe(true)
    expect(display.at(-1)?.active).toBe(true)
  })

  it('shows evidence, conflict, and topic progression with stable tones', () => {
    expect(buildFeedbackDisplay(getFeedbackSteps(makeEvent('evidence_request'), 'full')).map((item) => item.tone)).toEqual([
      'evidence',
      'evidence',
      'evidence',
    ])
    expect(buildFeedbackDisplay(getFeedbackSteps(makeEvent('collision_detected'), 'full')).map((item) => item.tone)).toEqual([
      'conflict',
      'conflict',
      'conflict',
    ])
    expect(buildFeedbackDisplay(getFeedbackSteps(makeEvent('topic_progression'), 'full')).map((item) => item.tone)).toEqual([
      'summary',
      'summary',
    ])
  })

  it('exposes the active status label for compact UI surfaces', () => {
    expect(getFeedbackStatusText(['planning_turn', 'agent_typing'])).toBeTruthy()
  })
})
