import { describe, expect, it } from 'vitest'
import type { Agent, ChatAgendaItem, ChatMessage } from '@/types'
import { inferCapabilityProfile } from '../capabilityProfiler'
import { validateAndAdaptResponse } from '../responseValidator'
import { routeChatEvents } from '../eventRouterV2'
import { planDiscussionTurns } from '../turnPlanner'
import { suggestTopicLifecycleTransition } from '../topicLifecycle'
import { getFeedbackSteps } from '../feedbackController'
import { DEFAULT_CHAT_ROOM_STRATEGY, normalizeChatRoomStrategy } from '../strategyTypes'

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

function userMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-user',
    room_id: 'room-1',
    sender_type: 'user',
    sender_id: 'user-1',
    sender_name: 'User',
    content: 'hello',
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

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

const studentAgent = makeAgent({
  id: 'student-1',
  name: 'Student Voice',
  category: 'student',
  expertise: ['learning experience'],
  personality: { directness: 4, strictness: 2, humor: 4, empathy: 5 },
})

const teacherAgent = makeAgent({
  id: 'teacher-1',
  name: 'Teaching Researcher',
  category: 'teacher',
  expertise: ['pedagogy', 'lesson plan review', 'evidence'],
  personality: { directness: 4, strictness: 5, humor: 1, empathy: 3 },
})

const parentAgent = makeAgent({
  id: 'parent-1',
  name: 'Parent Representative',
  category: 'parent',
  expertise: ['home learning feedback'],
  personality: { directness: 3, strictness: 3, humor: 2, empathy: 5 },
})

const activeTopic: ChatAgendaItem = {
  id: 'topic-1',
  text: 'lesson plan feasibility',
  source: 'user',
  priority: 3,
  status: 'active',
}

describe('room strategy normalization', () => {
  it('fills a missing room strategy with product defaults', () => {
    const strategy = normalizeChatRoomStrategy()

    expect(strategy).toEqual(DEFAULT_CHAT_ROOM_STRATEGY)
  })

  it('keeps legacy discussionMode while filling newer strategy fields', () => {
    const strategy = normalizeChatRoomStrategy(undefined, 'debate')

    expect(strategy.discussionMode).toBe('debate')
    expect(strategy.contextDepth).toBe(DEFAULT_CHAT_ROOM_STRATEGY.contextDepth)
    expect(strategy.citationPolicy).toBe('optional')
    expect(strategy.identityBoundary).toBe('standard')
  })

  it('preserves user-selected strategy overrides for new rooms', () => {
    const strategy = normalizeChatRoomStrategy({
      discussionMode: 'free',
      contextDepth: 'long-document',
      initiativeLevel: 'high',
      conflictLevel: 'intense',
      roomTone: 'teaching-seminar',
      feedbackLevel: 'simple',
    })

    expect(strategy).toMatchObject({
      discussionMode: 'free',
      contextDepth: 'long-document',
      initiativeLevel: 'high',
      conflictLevel: 'intense',
      roomTone: 'teaching-seminar',
      feedbackLevel: 'simple',
      citationPolicy: 'optional',
      identityBoundary: 'standard',
    })
  })
})

describe('identity boundary and validation', () => {
  it('coerces a student away from expert judgment into experience feedback', () => {
    const profile = inferCapabilityProfile(studentAgent)

    expect(profile.identityType).toBe('student')
    expect(profile.allowedPostures).toEqual(['experience_feedback', 'clarifying_question'])

    const result = validateAndAdaptResponse({
      content: 'The teaching design is not feasible.',
      profile,
      requestedPosture: 'expert_judgment',
      agentName: studentAgent.name,
      topic: activeTopic.text,
    })

    expect(result.needsRewrite).toBe(true)
    expect(result.recommendedPosture).toBe('experience_feedback')
    expect(result.violations.some((violation) => violation.code === 'posture_not_allowed')).toBe(true)
    expect(result.rewriteInstruction).toContain('Student Voice')
  })

  it('keeps parent agents in family-risk and experience postures', () => {
    const profile = inferCapabilityProfile(parentAgent)

    expect(profile.identityType).toBe('parent')
    expect(profile.allowedPostures).toContain('risk_signal')

    const result = validateAndAdaptResponse({
      content: 'This may create too much work at home.',
      profile,
      requestedPosture: 'risk_signal',
      agentName: parentAgent.name,
    })

    expect(result.needsRewrite).toBe(false)
    expect(result.recommendedPosture).toBe('risk_signal')
  })

  it('defaults ambiguous custom agents to a conservative observer profile', () => {
    const customAgent = makeAgent({
      id: 'custom-1',
      name: 'Custom Participant',
      expertise: ['discussion'],
      personality: { directness: 5, strictness: 5, humor: 5, empathy: 5 },
    })

    const profile = inferCapabilityProfile(customAgent)

    expect(profile.identityType).toBe('observer')
    expect(profile.knowledgeLevel).toBe('layperson')
    expect(profile.allowedPostures).toEqual(['experience_feedback', 'clarifying_question'])
  })
})

describe('event routing', () => {
  it('orders explicit user intent before ambient discussion events', () => {
    const events = routeChatEvents({
      participants: [studentAgent, teacherAgent],
      currentTopic: activeTopic,
      idleDurationMs: 60000,
      idleThresholdMs: 30000,
      now: 1,
      collisionSignals: [{ agentAId: 'student-1', agentBId: 'teacher-1', confidence: 0.8 }],
      messages: [
        userMessage({
          id: 'msg-1',
          target_agent_id: 'student-1',
          content: '@Student Voice where is the evidence?',
          attachment: { documentId: 'doc-1', title: 'Lesson Plan', fileType: 'txt' },
        }),
      ],
    })

    expect(events.map((event) => event.type).slice(0, 5)).toEqual([
      'user_mention',
      'document_attached',
      'evidence_request',
      'collision_detected',
      'idle_followup',
    ])
  })

  it('detects confusion requests separately from evidence requests', () => {
    const events = routeChatEvents({
      participants: [teacherAgent],
      currentTopic: activeTopic,
      now: 1,
      messages: [userMessage({ content: 'why does this step matter? please explain' })],
    })

    expect(events.map((event) => event.type)).toContain('confusion_detected')
  })
})

describe('turn planning', () => {
  it('lets a mentioned student answer naturally without expert authority', () => {
    const [mentionEvent] = routeChatEvents({
      participants: [studentAgent, teacherAgent],
      currentTopic: activeTopic,
      now: 1,
      messages: [userMessage({ target_agent_id: 'student-1', content: '@Student Voice is this lesson plan feasible?' })],
    })

    const turns = planDiscussionTurns({
      participants: [studentAgent, teacherAgent],
      messages: [],
      events: [mentionEvent],
      currentTopic: activeTopic,
      strategy: { conflictLevel: 'balanced', initiativeLevel: 'standard', discussionMode: 'moderated' },
    })

    expect(turns).toHaveLength(1)
    expect(turns[0].agent.id).toBe('student-1')
    expect(turns[0].speakingPosture).toBe('experience_feedback')
    expect(turns[0].wasPostureTranslated).toBe(true)
  })

  it('routes evidence requests to a strict capable agent instead of a student voice', () => {
    const [evidenceEvent] = routeChatEvents({
      participants: [studentAgent, teacherAgent, parentAgent],
      currentTopic: activeTopic,
      now: 1,
      messages: [userMessage({ content: 'Where is the evidence in the original document?' })],
    })

    const turns = planDiscussionTurns({
      participants: [studentAgent, teacherAgent, parentAgent],
      messages: [],
      events: [evidenceEvent],
      currentTopic: activeTopic,
      strategy: { conflictLevel: 'balanced', initiativeLevel: 'standard', discussionMode: 'moderated' },
    })

    expect(turns[0].agent.id).toBe('teacher-1')
    expect(turns[0].speakingPosture).toBe('expert_judgment')
  })

  it('uses conflict level to decide how many turns a collision can produce', () => {
    const collisionEvent = routeChatEvents({
      participants: [studentAgent, teacherAgent, parentAgent],
      currentTopic: activeTopic,
      collisionSignals: [{ agentAId: 'student-1', agentBId: 'teacher-1', confidence: 0.9 }],
      now: 1,
      messages: [],
    })[0]

    const softTurns = planDiscussionTurns({
      participants: [studentAgent, teacherAgent, parentAgent],
      messages: [],
      events: [collisionEvent],
      currentTopic: activeTopic,
      strategy: { conflictLevel: 'soft', initiativeLevel: 'standard', discussionMode: 'moderated' },
    })

    const intenseTurns = planDiscussionTurns({
      participants: [studentAgent, teacherAgent, parentAgent],
      messages: [],
      events: [collisionEvent],
      currentTopic: activeTopic,
      strategy: { conflictLevel: 'intense', initiativeLevel: 'standard', discussionMode: 'debate' },
    })

    expect(softTurns).toHaveLength(2)
    expect(softTurns.every((turn) => turn.speakingPosture !== 'expert_judgment')).toBe(true)
    expect(intenseTurns).toHaveLength(3)
  })
})

describe('topic lifecycle and feedback', () => {
  it('moves an opened topic into exploration after the first agent response', () => {
    const suggestion = suggestTopicLifecycleTransition({
      topic: activeTopic,
      state: 'opened',
      messages: [agentMessage({ content: 'lesson plan feasibility has one major risk.' })],
    })

    expect(suggestion.suggestedState).toBe('exploring')
    expect(suggestion.nextAction).toBe('explore_views')
  })

  it('moves conflicting topics toward grounding when evidence is requested', () => {
    const [event] = routeChatEvents({
      participants: [teacherAgent],
      currentTopic: activeTopic,
      now: 1,
      messages: [userMessage({ content: 'show me the evidence' })],
    })

    const suggestion = suggestTopicLifecycleTransition({
      topic: activeTopic,
      state: 'conflicting',
      events: [event],
      messages: [],
    })

    expect(suggestion.suggestedState).toBe('grounding')
    expect(suggestion.nextAction).toBe('seek_evidence')
  })

  it('exposes full process feedback for document and conflict handling', () => {
    const events = routeChatEvents({
      participants: [studentAgent, teacherAgent],
      currentTopic: activeTopic,
      now: 1,
      collisionSignals: [{ agentAId: 'student-1', agentBId: 'teacher-1', confidence: 0.8 }],
      messages: [
        userMessage({
          content: 'please read this',
          attachment: { documentId: 'doc-1', title: 'Lesson Plan', fileType: 'txt' },
        }),
      ],
    })

    const documentEvent = events.find((event) => event.type === 'document_attached')
    const collisionEvent = events.find((event) => event.type === 'collision_detected')

    expect(documentEvent ? getFeedbackSteps(documentEvent, 'full') : []).toEqual([
      'reading_document',
      'locating_relevant_passage',
      'responding_with_context',
    ])
    expect(collisionEvent ? getFeedbackSteps(collisionEvent, 'full') : []).toEqual([
      'reviewing_conflict',
      'forming_challenge',
      'responding_to_agent',
    ])
    expect(documentEvent ? getFeedbackSteps(documentEvent, 'simple') : []).toEqual(['agent_typing'])
  })
})
