import { describe, expect, it } from 'vitest'
import type { Agent, ChatAgendaItem, ChatMessage, Document, ReviewSummary } from '@/types'
import { assembleLayeredContext } from '../contextAssembler'
import { inferCapabilityProfile } from '../capabilityProfiler'
import { buildAgentMemoryMap } from '../memoryTracker'
import { buildTurnMessageMetadata } from '../messageMetadata'
import { createStrategyLogEntry } from '../strategyLogger'
import { guardAgainstRepetition } from '../repetitionGuard'
import { routeChatEvents } from '../eventRouterV2'
import { planDiscussionTurns } from '../turnPlanner'
import { validateAndAdaptResponse } from '../responseValidator'
import { formatAgentMemoryForContext, createIdentitySafeFallbackReply } from '../runtimeGuards'
import type { ChatRoomStrategy } from '../strategyTypes'

function makeAgent(overrides: Partial<Agent> & Pick<Agent, 'id' | 'name' | 'category'>): Agent {
  return {
    owner_id: 'user-1',
    tagline: 'Test agent',
    personality: { directness: 3, strictness: 3, humor: 1, empathy: 3 },
    expertise: ['rubric', 'assessment', '课堂'],
    behavior: { style: 'natural' },
    system_prompt: 'Stay in role.',
    source: 'custom',
    is_public: false,
    usage_count: 0,
    color: 'indigo',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    room_id: 'room-1',
    sender_type: 'user',
    sender_id: 'user-1',
    sender_name: 'User',
    content: 'hello',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

const strategy: ChatRoomStrategy = {
  discussionMode: 'moderated',
  contextDepth: 'deep',
  initiativeLevel: 'high',
  conflictLevel: 'balanced',
  roomTone: 'teaching-seminar',
  feedbackLevel: 'full',
  citationPolicy: 'optional',
  identityBoundary: 'standard',
}

const topic: ChatAgendaItem = {
  id: 'topic-1',
  text: 'assessment rubric evidence',
  source: 'document',
  priority: 3,
  status: 'active',
}

const document: Document = {
  id: 'doc-1',
  owner_id: 'user-1',
  title: 'Lesson Plan',
  file_name: 'lesson.txt',
  file_type: 'txt',
  file_size: 100,
  summary: 'The lesson uses a rubric to evaluate group discussion.',
  structured_content: {
    sections: [
      { title: 'Rubric evidence', content: 'Rubric evidence should be visible in every checkpoint.' },
      { title: 'Warm up', content: 'Students review vocabulary before discussion.' },
    ],
  },
  status: 'ready',
  review_count: 1,
  created_at: '2026-04-27T00:00:00.000Z',
}

const reviewSummary: ReviewSummary = {
  overview: 'The plan is promising but needs clearer evidence.',
  strengths: ['Clear topic'],
  pain_points: ['Assessment criteria are vague.'],
  consensus: ['Agents agree checkpoints need evidence.'],
  controversies: [],
  top_suggestions: [
    {
      id: 's1',
      content: 'Add a visible rubric before group work.',
      priority: 'high',
      adopted: false,
      source_agent: 'Teacher',
      evidence: 'The rubric is not visible in the activity section.',
    },
  ],
}

describe('chat room strategy runtime flow', () => {
  it('routes evidence requests through planning, context, metadata, repetition guard, and logging', () => {
    const teacher = makeAgent({
      id: 'teacher-1',
      name: 'Teacher',
      category: 'teacher',
      personality: { directness: 4, strictness: 5, humor: 1, empathy: 3 },
      expertise: ['assessment rubric', '课堂证据'],
    })
    const student = makeAgent({
      id: 'student-1',
      name: 'Student',
      category: 'student',
      personality: { directness: 2, strictness: 1, humor: 1, empathy: 5 },
      expertise: ['学习体验'],
    })
    const participants = [student, teacher]
    const priorTeacherMessage = makeMessage({
      id: 'm-teacher-1',
      sender_type: 'agent',
      sender_id: teacher.id,
      sender_name: teacher.name,
      sender_color: teacher.color,
      content: 'I support keeping the group discussion because it makes student thinking visible.',
    })
    const userEvidenceRequest = makeMessage({
      id: 'm-user-1',
      content: '请回到文档，给出 assessment rubric 的原文依据。',
      attachment: { documentId: document.id, title: document.title, fileType: 'txt' },
    })
    const messages = [priorTeacherMessage, userEvidenceRequest]
    const capabilityProfiles = Object.fromEntries(
      participants.map((agent) => [agent.id, inferCapabilityProfile(agent)]),
    )

    const events = routeChatEvents({ messages, participants, currentTopic: topic })
    const turns = planDiscussionTurns({
      participants,
      messages,
      events,
      currentTopic: topic,
      capabilityProfiles,
      strategy,
    })

    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['document_attached', 'evidence_request']))
    expect(turns[0]?.agent.id).toBe(teacher.id)
    expect(turns[0]?.speakingPosture).toBe('expert_judgment')

    const memoryMap = buildAgentMemoryMap(messages)
    const context = assembleLayeredContext({
      contextDepth: strategy.contextDepth,
      roomTopic: 'Lesson review',
      roomTone: strategy.roomTone,
      currentTopic: topic.text,
      documents: [document],
      reviewSummary,
      recentMessages: messages,
      agentMemory: formatAgentMemoryForContext(memoryMap[teacher.id]),
    })

    expect(context.sections.some((section) => section.type === 'document-excerpt')).toBe(true)
    expect(context.promptText).toContain('Rubric evidence should be visible')
    expect(context.promptText).toContain('Assessment criteria are vague')
    expect(context.promptText).toContain('当前立场：支持')

    const metadata = buildTurnMessageMetadata({
      intent: turns[0]!.intent === 'progress' ? 'open' : turns[0]!.intent,
      event: turns[0]!.event,
      speakingPosture: turns[0]!.speakingPosture,
    })
    const repetition = guardAgainstRepetition({
      agentId: teacher.id,
      candidateContent: 'The rubric evidence should be visible in every checkpoint, so I would add it before group work starts.',
      recentMessages: messages,
      evidenceRefs: metadata.citations?.map((citation) => citation.title || citation.source),
    })
    const logEntry = createStrategyLogEntry({
      roomId: 'room-1',
      agentId: teacher.id,
      selectedAgentName: teacher.name,
      event: turns[0]!.event,
      strategy,
      usedContext: context.sections.map((section) => section.type),
      requestedPosture: turns[0]!.speakingPosture,
      finalPosture: turns[0]!.speakingPosture,
    })

    expect(metadata.contextSource).toBe('document')
    expect(metadata.citations?.[0]?.title).toBe(document.title)
    expect(repetition.shouldSpeak).toBe(true)
    expect(logEntry.eventType).toBe('document_attached')
    expect(logEntry.usedContext).toContain('agent-memory')
  })

  it('translates a student mention away from expert judgment and supplies a safe fallback when needed', () => {
    const student = makeAgent({ id: 'student-1', name: 'Student', category: 'student' })
    const messages = [
      makeMessage({
        id: 'm-user-student',
        content: '@Student 请判断这个教研案是否符合课程标准，并给专业可行性结论。',
        target_agent_id: student.id,
      }),
    ]
    const profile = inferCapabilityProfile(student)
    const events = routeChatEvents({ messages, participants: [student], currentTopic: topic })
    const turns = planDiscussionTurns({
      participants: [student],
      messages,
      events,
      currentTopic: topic,
      capabilityProfiles: { [student.id]: profile },
      strategy,
    })
    const validation = validateAndAdaptResponse({
      content: '这个教研案不符合课程标准，教学目标达成度不足，专业上不可行。',
      profile,
      requestedPosture: turns[0]!.speakingPosture,
      topic: topic.text,
      agentName: student.name,
    })
    const fallback = createIdentitySafeFallbackReply({
      agent: student,
      profile,
      focus: topic.text,
      requestedPosture: 'expert_judgment',
      violations: validation.violations,
    })

    expect(turns[0]?.wasPostureTranslated).toBe(true)
    expect(turns[0]?.speakingPosture).toBe('experience_feedback')
    expect(validation.needsRewrite).toBe(true)
    expect(fallback).toContain('学生体验')
    expect(fallback).not.toContain('课程标准')
  })

  it('blocks a generated turn that only repeats an existing agent point', () => {
    const prior = makeMessage({
      id: 'm-repeat',
      sender_type: 'agent',
      sender_id: 'teacher-1',
      sender_name: 'Teacher',
      content: 'The lesson needs a shorter warm-up because discussion already uses most of the time.',
    })

    const result = guardAgainstRepetition({
      agentId: 'teacher-1',
      candidateContent: 'The lesson needs a shorter warm-up because discussion already uses most of the time.',
      recentMessages: [prior],
    })

    expect(result.action).toBe('skip')
    expect(result.shouldSpeak).toBe(false)
    expect(result.matchedMessageId).toBe('m-repeat')
  })
})
