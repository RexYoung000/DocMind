import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types'
import {
  buildTurnMessageMetadata,
  getMessageMetadataBadges,
  inferContextSource,
  inferEvidenceLevel,
} from '../messageMetadata'
import type { RoutedChatEvent } from '../eventRouterV2'

function makeEvent(type: RoutedChatEvent['type'], overrides: Partial<RoutedChatEvent> = {}): RoutedChatEvent {
  return {
    id: `event-${type}`,
    type,
    priority: 1,
    createdAt: 1,
    reason: 'test event',
    payload: {},
    ...overrides,
  }
}

function makeAgentMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    room_id: 'room-1',
    sender_type: 'agent',
    sender_id: 'agent-1',
    sender_name: 'Agent',
    sender_color: 'indigo',
    content: 'hello',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('message metadata', () => {
  it('marks translated student-style turns as experience feedback', () => {
    const metadata = buildTurnMessageMetadata({
      intent: 'support',
      speakingPosture: 'experience_feedback',
    })

    expect(metadata.contextSource).toBe('agent_experience')
    expect(metadata.evidenceLevel).toBe('experience')
  })

  it('marks evidence turns as document or review grounded metadata', () => {
    const metadata = buildTurnMessageMetadata({
      intent: 'evidence',
      event: makeEvent('evidence_request'),
      speakingPosture: 'expert_judgment',
    })

    expect(metadata.contextSource).toBe('document')
    expect(metadata.evidenceLevel).toBe('review')
  })

  it('keeps responding target labels for UI chips', () => {
    const metadata = buildTurnMessageMetadata({
      intent: 'challenge',
      event: makeEvent('collision_detected'),
      respondingTo: { agentId: 'teacher-1', label: 'Teaching Researcher' },
    })
    const badges = getMessageMetadataBadges(makeAgentMessage(metadata))

    expect(metadata.respondingTo?.agentId).toBe('teacher-1')
    expect(badges.some((badge) => badge.key === 'respondingTo')).toBe(true)
    expect(badges.some((badge) => badge.tone === 'warning')).toBe(true)
  })

  it('normalizes document attachment citations into message metadata', () => {
    const metadata = buildTurnMessageMetadata({
      intent: 'evidence',
      event: makeEvent('document_attached', {
        payload: { attachmentTitle: 'Lesson Plan' },
      }),
    })

    expect(metadata.citations).toEqual([{ source: 'document', title: 'Lesson Plan' }])
    expect(getMessageMetadataBadges(makeAgentMessage(metadata)).some((badge) => badge.key === 'citations')).toBe(true)
  })

  it('returns no badges for old messages without metadata', () => {
    expect(getMessageMetadataBadges(makeAgentMessage({}))).toEqual([])
  })

  it('exposes context and evidence inference helpers', () => {
    expect(inferContextSource(makeEvent('topic_progression'))).toBe('review')
    expect(inferEvidenceLevel(makeEvent('confusion_detected'))).toBe('user')
  })
})
