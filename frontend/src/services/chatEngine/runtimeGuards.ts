import type { Agent } from '@/types'
import type { AgentDiscussionMemory } from './memoryTracker'
import type { RepetitionAction } from './repetitionGuard'
import type { CapabilityProfile, SpeakingPosture } from './strategyTypes'
import type { ResponseViolation } from './responseValidator'

export function formatAgentMemoryForContext(memory?: AgentDiscussionMemory): string[] {
  if (!memory) return []

  const lines = [
    `当前立场：${stanceLabel(memory.stance)}`,
    memory.lastIntent ? `上次发言意图：${intentLabel(memory.lastIntent)}` : '',
    ...memory.claims.slice(-3).map((claim) => `已表达观点：${claim.text}`),
    ...memory.unresolvedQuestions.slice(-2).map((question) => `未解决问题：${question}`),
    memory.supportedAgentIds.length > 0 ? `曾支持：${memory.supportedAgentIds.join('、')}` : '',
    memory.opposedAgentIds.length > 0 ? `曾反对：${memory.opposedAgentIds.join('、')}` : '',
  ]

  return lines.filter(Boolean)
}

export function buildRepetitionRecoveryInstruction(action: Exclude<RepetitionAction, 'allow'>): string {
  switch (action) {
    case 'question':
      return '刚才候选回复和已有观点接近。请不要复述结论，改成一个能继续推进讨论的追问。'
    case 'evidence':
      return '刚才候选回复和已有观点接近。请不要复述结论，改成补充一条新的文档、评审或具体例子依据。'
    case 'summarize':
      return '刚才候选回复和已有观点接近。请不要复述结论，改成压缩共识、分歧和下一步。'
    case 'skip':
      return '刚才候选回复和已有观点重复。请换一个尚未出现的角度，优先提出追问、证据缺口或下一步动作。'
  }
}

export function createIdentitySafeFallbackReply(input: {
  agent: Pick<Agent, 'name'>
  profile: Pick<CapabilityProfile, 'identityType'>
  focus?: string
  requestedPosture?: SpeakingPosture
  violations?: ResponseViolation[]
}): string {
  const focus = truncateFocus(input.focus)

  switch (input.profile.identityType) {
    case 'student':
      return `从学生体验看，我更想确认“${focus}”这里有没有更直观的例子和练习步骤；如果只给结论，我可能会跟不上。`
    case 'parent':
      return `从家长视角，我会关注孩子课后能不能复述清楚，以及这个安排会不会增加额外压力；最好补一个家里能观察到的反馈方式。`
    case 'observer':
      return `我还不能直接下专业结论，但围绕“${focus}”，我会先追问：现在缺的关键证据是什么，谁能补一条具体依据？`
    case 'technical':
      return `从实现视角看，“${focus}”需要先拆清数据流、边界条件和失败兜底；否则后面很容易变成不可验证的判断。`
    case 'product':
      return `从产品视角看，“${focus}”要先落到用户价值、操作阻力和优先级上；我建议先确认最影响体验的一步。`
    case 'creative':
      return `从创意视角看，“${focus}”可以先换一种表达或活动形式试出来；我会先提一个可尝试方向，而不是直接下定论。`
    case 'teacher':
      return `从教师视角看，“${focus}”要回到课堂节奏、学生反应和可观察证据上；我建议先补一条课堂里能验证的依据。`
    case 'expert':
      return `我的判断先收窄到“${focus}”：这里需要区分原文证据、评审推断和个人经验，再决定是否推进。`
  }
}

function stanceLabel(stance: AgentDiscussionMemory['stance']): string {
  switch (stance) {
    case 'supporting':
      return '支持'
    case 'opposing':
      return '反对'
    case 'summarizing':
      return '总结中'
    case 'neutral':
      return '中立'
  }
}

function intentLabel(intent: NonNullable<AgentDiscussionMemory['lastIntent']>): string {
  switch (intent) {
    case 'open':
      return '开启观点'
    case 'support':
      return '补充支持'
    case 'challenge':
      return '提出反驳'
    case 'evidence':
      return '补充证据'
    case 'question':
      return '追问澄清'
    case 'synthesize':
      return '阶段总结'
  }
}

function truncateFocus(focus?: string): string {
  const normalized = (focus || '当前讨论').replace(/\s+/g, ' ').trim()
  return normalized.length > 42 ? `${normalized.slice(0, 41)}…` : normalized
}
