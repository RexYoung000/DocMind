import { describe, expect, it } from 'vitest'
import { buildRepetitionRecoveryInstruction, createIdentitySafeFallbackReply, formatAgentMemoryForContext } from '../runtimeGuards'
import type { AgentDiscussionMemory } from '../memoryTracker'
import type { Agent } from '@/types'

const agent: Pick<Agent, 'name'> = { name: '小学生代表' }

describe('runtime guard helpers', () => {
  it('compresses agent memory into prompt-ready context lines', () => {
    const memory: AgentDiscussionMemory = {
      agentId: 'agent-1',
      stance: 'supporting',
      claims: [
        { text: 'The warm-up should be shorter.', messageId: 'm1', evidenceRefs: [] },
        { text: 'The practice needs one visible example.', messageId: 'm2', evidenceRefs: [] },
      ],
      supportedAgentIds: ['student-1'],
      opposedAgentIds: [],
      unresolvedQuestions: ['How much practice time remains?'],
      lastIntent: 'support',
    }

    const lines = formatAgentMemoryForContext(memory)

    expect(lines).toContain('当前立场：支持')
    expect(lines).toContain('上次发言意图：补充支持')
    expect(lines.some((line) => line.includes('visible example'))).toBe(true)
    expect(lines).toContain('曾支持：student-1')
  })

  it('turns repetition decisions into concrete retry instructions', () => {
    expect(buildRepetitionRecoveryInstruction('skip')).toContain('换一个尚未出现的角度')
    expect(buildRepetitionRecoveryInstruction('evidence')).toContain('补充一条新的文档')
  })

  it('keeps student fallback replies inside experiential boundaries', () => {
    const reply = createIdentitySafeFallbackReply({
      agent,
      profile: { identityType: 'student' },
      focus: '教研案可行性与教学目标达成',
      requestedPosture: 'expert_judgment',
    })

    expect(reply).toContain('学生体验')
    expect(reply).toContain('例子')
    expect(reply).not.toContain('专业结论')
    expect(reply).not.toContain('课程标准')
  })
})
