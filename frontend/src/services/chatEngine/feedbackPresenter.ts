import type { FeedbackStep } from './feedbackController'

export type FeedbackTone = 'neutral' | 'document' | 'evidence' | 'conflict' | 'summary'

export interface FeedbackDisplayItem {
  step: FeedbackStep
  label: string
  tone: FeedbackTone
  active: boolean
}

const STEP_LABELS: Record<FeedbackStep, { label: string; tone: FeedbackTone }> = {
  agent_typing: { label: '角色正在组织回复', tone: 'neutral' },
  planning_turn: { label: '规划下一位发言角色', tone: 'neutral' },
  reading_document: { label: '阅读相关文档', tone: 'document' },
  locating_relevant_passage: { label: '定位相关片段', tone: 'document' },
  responding_with_context: { label: '结合上下文回应', tone: 'document' },
  searching_evidence: { label: '查找证据依据', tone: 'evidence' },
  checking_context_source: { label: '核对上下文来源', tone: 'evidence' },
  responding_with_evidence: { label: '带依据回应', tone: 'evidence' },
  reviewing_conflict: { label: '梳理观点分歧', tone: 'conflict' },
  forming_challenge: { label: '形成反驳要点', tone: 'conflict' },
  responding_to_agent: { label: '回应其他角色', tone: 'conflict' },
  summarizing_topic: { label: '总结当前议题', tone: 'summary' },
  switching_topic: { label: '准备切换议题', tone: 'summary' },
}

export function buildFeedbackDisplay(
  steps: FeedbackStep[],
  activeIndex = Math.max(0, steps.length - 1),
): FeedbackDisplayItem[] {
  return steps.map((step, index) => {
    const definition = STEP_LABELS[step]
    return {
      step,
      label: definition.label,
      tone: definition.tone,
      active: index === activeIndex,
    }
  })
}

export function getFeedbackStatusText(steps: FeedbackStep[]): string {
  const display = buildFeedbackDisplay(steps)
  const active = display.find((item) => item.active) ?? display.at(-1)
  return active?.label ?? ''
}
