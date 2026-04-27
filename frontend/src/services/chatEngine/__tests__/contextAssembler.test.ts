import { describe, expect, it } from 'vitest'
import type { ChatMessage, Document, ReviewSummary } from '@/types'
import { assembleLayeredContext, selectRelevantDocumentExcerpts } from '../contextAssembler'

function makeDocument(overrides: Partial<Document> & Pick<Document, 'id' | 'title'>): Document {
  return {
    owner_id: 'user-1',
    file_name: 'doc.txt',
    file_type: 'txt',
    file_size: 1000,
    status: 'ready',
    review_count: 0,
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

function makeMessage(index: number, content = `message ${index}`): ChatMessage {
  return {
    id: `msg-${index}`,
    room_id: 'room-1',
    sender_type: index % 2 === 0 ? 'agent' : 'user',
    sender_id: index % 2 === 0 ? 'agent-1' : 'user-1',
    sender_name: index % 2 === 0 ? 'Agent' : 'User',
    content,
    created_at: `2026-04-27T00:0${index}:00.000Z`,
  }
}

const longRawContent = [
  'Opening overview with broad classroom context and background that should not dominate the prompt.',
  'Assessment rubric details explain scoring criteria, peer feedback timing, and teacher observation evidence.',
  'Homework logistics mention family workload, calendar pressure, and unrelated operational details.',
  'Assessment follow up describes rubric calibration and student reflection evidence.',
].join('\n\n')

const reviewSummary: ReviewSummary = {
  overview: 'The plan has a clear direction but needs sharper classroom evidence.',
  strengths: ['Clear objective'],
  pain_points: ['Assessment criteria are vague.', 'Student workload may exceed the available lesson time.'],
  consensus: ['Agents agree the lesson needs measurable checkpoints.'],
  controversies: [],
  top_suggestions: [
    {
      id: 's1',
      content: 'Add a visible rubric before group work starts.',
      priority: 'high',
      adopted: false,
      source_agent: 'Teaching Researcher',
      evidence: 'Rubric language is missing from the activity section.',
    },
    {
      id: 's2',
      content: 'Trim the homework extension.',
      priority: 'medium',
      adopted: false,
      source_agent: 'Parent Representative',
    },
  ],
}

describe('assembleLayeredContext', () => {
  it('keeps fast context to short summaries and a small recent message window', () => {
    const result = assembleLayeredContext({
      contextDepth: 'fast',
      roomTopic: 'Lesson review',
      currentTopic: 'assessment rubric',
      documents: [
        makeDocument({
          id: 'doc-1',
          title: 'Lesson Plan',
          summary: 'A concise summary of the lesson plan and assessment design.',
          raw_content: longRawContent,
        }),
      ],
      reviewSummary,
      recentMessages: [1, 2, 3, 4, 5].map((index) => makeMessage(index)),
      agentMemory: ['Prefers direct feedback.', 'Often asks for classroom evidence.', 'Older memory should be dropped.'],
    })

    expect(result.sections.some((section) => section.type === 'review')).toBe(false)
    expect(result.sections.some((section) => section.type === 'document-excerpt')).toBe(false)
    expect(result.promptText).toContain('A concise summary')
    expect(result.promptText).not.toContain('Assessment rubric details explain scoring criteria')

    const recentMessages = result.sections.find((section) => section.type === 'recent-messages')
    expect(recentMessages?.content).not.toContain('message 1')
    expect(recentMessages?.content).not.toContain('message 2')
    expect(recentMessages?.content).toContain('message 3')
    expect(recentMessages?.content).toContain('message 5')
  })

  it('includes review pain points, suggestions, and relevant document excerpts for deep context', () => {
    const result = assembleLayeredContext({
      contextDepth: 'deep',
      roomTopic: 'Lesson review',
      currentTopic: 'assessment rubric',
      documents: [
        makeDocument({
          id: 'doc-1',
          title: 'Lesson Plan',
          summary: 'The lesson plan focuses on group work and assessment.',
          structured_content: {
            sections: [
              { title: 'Warm up', content: 'Students review previous vocabulary.' },
              { title: 'Assessment rubric', content: 'Assessment rubric criteria need clearer evidence and checkpoint language.' },
              { title: 'Extension', content: 'Homework extension is optional.' },
            ],
          },
        }),
      ],
      reviewSummary,
      recentMessages: [1, 2].map((index) => makeMessage(index)),
    })

    const review = result.sections.find((section) => section.type === 'review')
    expect(review?.content).toContain('Pain point: Assessment criteria are vague.')
    expect(review?.content).toContain('Suggestion: Add a visible rubric before group work starts.')

    const excerpts = result.sections.filter((section) => section.type === 'document-excerpt')
    expect(excerpts[0]?.title).toContain('Assessment rubric')
    expect(excerpts[0]?.content).toContain('checkpoint language')
    expect(result.promptText).toContain('## Review pain points and suggestions')
  })

  it('selects long-document excerpts by current topic without stuffing full raw content', () => {
    const result = assembleLayeredContext({
      contextDepth: 'long-document',
      roomTopic: 'Lesson review',
      currentTopic: 'assessment rubric evidence',
      documents: [
        makeDocument({
          id: 'doc-1',
          title: 'Long Lesson Plan',
          summary: 'Long plan summary.',
          raw_content: `${longRawContent}\n\n${'Filler material that is not relevant. '.repeat(80)}`,
        }),
      ],
      reviewSummary,
      recentMessages: [1, 2, 3, 4].map((index) => makeMessage(index)),
    })

    const prompt = result.promptText
    expect(prompt).toContain('Assessment rubric details')
    expect(prompt).toContain('Assessment follow up')
    expect(prompt).not.toContain('Filler material that is not relevant. Filler material that is not relevant. Filler material that is not relevant. Filler material that is not relevant.')
    expect(prompt.length).toBeLessThan(longRawContent.length + 'Filler material that is not relevant. '.repeat(80).length)
  })
})

describe('selectRelevantDocumentExcerpts', () => {
  it('returns scored context sections for the most topic-relevant snippets', () => {
    const excerpts = selectRelevantDocumentExcerpts(
      [
        makeDocument({
          id: 'doc-1',
          title: 'Mixed Notes',
          structured_content: {
            sections: [
              { title: 'Logistics', content: 'Print handouts and arrange seats.' },
              { title: 'Rubric evidence', content: 'Rubric evidence should be visible in every checkpoint.' },
            ],
          },
        }),
      ],
      'rubric evidence',
      1,
      200,
    )

    expect(excerpts).toHaveLength(1)
    expect(excerpts[0]).toMatchObject({
      type: 'document-excerpt',
      title: 'Mixed Notes: Rubric evidence',
      sourceId: 'doc-1',
    })
    expect(excerpts[0]?.score).toBeGreaterThan(0)
  })
})
