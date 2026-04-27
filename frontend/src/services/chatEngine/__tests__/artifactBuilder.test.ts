import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types'
import { buildDiscussionArtifact, exportDiscussionArtifactAsMarkdown } from '../artifactBuilder'

function message(id: string, content: string, sender_type: ChatMessage['sender_type'] = 'agent'): ChatMessage {
  return {
    id,
    room_id: 'room-1',
    sender_type,
    sender_id: sender_type === 'agent' ? 'agent-1' : 'user-1',
    sender_name: sender_type === 'agent' ? 'Agent' : 'User',
    content,
    created_at: '2026-04-27T00:00:00.000Z',
  }
}

describe('discussion artifact builder', () => {
  it('extracts consensus, disagreements, actions, and questions from messages', () => {
    const artifact = buildDiscussionArtifact([
      message('m1', 'I agree we can keep the warm-up because it gives students an entry point.'),
      message('m2', 'However, the timing risk is still unresolved and needs monitoring.'),
      message('m3', 'We should add a visible rubric before group work starts.'),
      message('m4', 'Why is the homework extension still necessary?', 'user'),
    ], '2026-04-27T00:00:00.000Z')

    expect(artifact.consensus[0]).toContain('keep the warm-up')
    expect(artifact.disagreements[0]).toContain('timing risk')
    expect(artifact.actionItems[0]).toContain('visible rubric')
    expect(artifact.openQuestions[0]).toContain('homework extension')
  })

  it('deduplicates repeated suggestions', () => {
    const artifact = buildDiscussionArtifact([
      message('m1', 'We should add a visible rubric before group work starts.'),
      message('m2', 'We should add a visible rubric before group work starts.'),
    ])

    expect(artifact.actionItems).toHaveLength(1)
  })

  it('exports markdown minutes from the artifact', () => {
    const artifact = buildDiscussionArtifact([
      message('m1', 'I agree this checkpoint should be kept.'),
      message('m2', 'We should adjust the peer discussion timing.'),
    ])
    const markdown = exportDiscussionArtifactAsMarkdown(artifact)

    expect(markdown).toContain('# 聊天室讨论纪要')
    expect(markdown).toContain('## 当前共识')
    expect(markdown).toContain('## 可执行建议')
  })
})
