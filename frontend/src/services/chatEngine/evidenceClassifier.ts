export type EvidenceLevel = 'quote' | 'review' | 'user' | 'inference' | 'experience'

export interface EvidenceClassificationInput {
  content: string
  source?: 'document' | 'review' | 'user' | 'agent' | 'memory' | 'unknown'
  speakerRole?: 'student' | 'teacher' | 'parent' | 'expert' | 'user' | 'agent' | 'observer'
  hasExactQuote?: boolean
  isUserProvided?: boolean
  isReviewConclusion?: boolean
}

export interface EvidenceClassificationResult {
  level: EvidenceLevel
  confidence: number
  signals: string[]
}

export interface EvidenceCandidate extends EvidenceClassificationInput {
  id?: string
}

export interface RankedEvidenceCandidate extends EvidenceCandidate {
  evidence: EvidenceClassificationResult
  rankScore: number
}

const quotedTextPattern = /(["“][^"”]{6,}["”]|['‘][^'’]{6,}['’]|「[^」]{6,}」|『[^』]{6,}』)/
const reviewPattern = /(review|rubric|assessment|evaluation|peer review|审阅|评审|评价|评分|量规|审核|专家意见)/i
const experiencePattern = /(as a student|student feedback|my experience|i feel|i felt|i found|i think|from my perspective|学生体验|学生反馈|我觉得|我感觉|我的体验|我发现|上课时|学习时)/i
const requestEvidencePattern = /(evidence|basis|source|quote|citation|review|依据|证据|出处|引用|原文|评审|评价|结论)/i

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, value))
}

export function classifyEvidence(input: EvidenceClassificationInput | string): EvidenceClassificationResult {
  const normalizedInput = typeof input === 'string' ? { content: input } : input
  const content = normalizedInput.content.trim()
  const signals: string[] = []

  if (normalizedInput.hasExactQuote || quotedTextPattern.test(content)) {
    signals.push(normalizedInput.hasExactQuote ? 'exact_quote_flag' : 'quoted_text')
    if (normalizedInput.source === 'document') {
      signals.push('document_source')
    }

    return {
      level: 'quote',
      confidence: clampConfidence(normalizedInput.hasExactQuote ? 0.95 : 0.86),
      signals,
    }
  }

  if (
    normalizedInput.speakerRole === 'student' ||
    experiencePattern.test(content)
  ) {
    signals.push(normalizedInput.speakerRole === 'student' ? 'student_role' : 'experience_language')

    return {
      level: 'experience',
      confidence: clampConfidence(normalizedInput.speakerRole === 'student' ? 0.9 : 0.76),
      signals,
    }
  }

  if (
    normalizedInput.isReviewConclusion ||
    normalizedInput.source === 'review' ||
    reviewPattern.test(content)
  ) {
    signals.push(normalizedInput.isReviewConclusion ? 'review_flag' : 'review_language')

    return {
      level: 'review',
      confidence: clampConfidence(normalizedInput.isReviewConclusion ? 0.92 : 0.82),
      signals,
    }
  }

  if (
    normalizedInput.isUserProvided ||
    normalizedInput.source === 'user' ||
    normalizedInput.speakerRole === 'user'
  ) {
    signals.push(normalizedInput.isUserProvided ? 'user_provided_flag' : 'user_source')

    return {
      level: 'user',
      confidence: 0.8,
      signals,
    }
  }

  signals.push('derived_reasoning')

  return {
    level: 'inference',
    confidence: 0.62,
    signals,
  }
}

export function isEvidenceRequest(request?: string): boolean {
  return Boolean(request && requestEvidencePattern.test(request))
}

export function rankEvidenceForRequest(
  candidates: EvidenceCandidate[],
  request?: string,
): RankedEvidenceCandidate[] {
  const requestNeedsEvidence = isEvidenceRequest(request)
  const weights: Record<EvidenceLevel, number> = requestNeedsEvidence
    ? {
        quote: 100,
        review: 90,
        user: 65,
        experience: 55,
        inference: 35,
      }
    : {
        quote: 90,
        review: 80,
        experience: 70,
        user: 60,
        inference: 50,
      }

  return candidates
    .map((candidate, index) => {
      const evidence = classifyEvidence(candidate)
      return {
        ...candidate,
        evidence,
        rankScore: weights[evidence.level] + evidence.confidence - index / 1000,
      }
    })
    .sort((left, right) => right.rankScore - left.rankScore)
}
