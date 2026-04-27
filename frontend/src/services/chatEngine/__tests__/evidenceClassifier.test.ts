import { describe, expect, it } from 'vitest'
import { classifyEvidence, rankEvidenceForRequest } from '../evidenceClassifier'

describe('evidence classification', () => {
  it('marks student experience feedback as experience evidence', () => {
    const result = classifyEvidence({
      content: 'I felt confused when the activity switched from reading to group discussion.',
      speakerRole: 'student',
    })

    expect(result.level).toBe('experience')
    expect(result.signals).toContain('student_role')
  })

  it('marks original text excerpts as quote evidence', () => {
    const result = classifyEvidence({
      content: 'The document says "students compare two solution paths before choosing one."',
      source: 'document',
    })

    expect(result.level).toBe('quote')
    expect(result.signals).toContain('quoted_text')
    expect(result.signals).toContain('document_source')
  })

  it('prioritizes quotes or review conclusions when the user asks for evidence', () => {
    const ranked = rankEvidenceForRequest(
      [
        {
          id: 'student-feedback',
          content: 'As a student, I found the transition unclear.',
          speakerRole: 'student',
        },
        {
          id: 'teacher-inference',
          content: 'This likely needs a shorter warm-up.',
          speakerRole: 'teacher',
        },
        {
          id: 'review-note',
          content: 'The rubric review flags weak alignment with the learning objective.',
          source: 'review',
        },
        {
          id: 'document-quote',
          content: 'The lesson plan states "students explain one strategy to a partner."',
          source: 'document',
        },
      ],
      'What evidence or review basis supports this?',
    )

    expect(ranked.slice(0, 2).map((candidate) => candidate.evidence.level)).toEqual(['quote', 'review'])
    expect(ranked[0].id).toBe('document-quote')
  })
})
