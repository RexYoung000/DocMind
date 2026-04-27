import type { Agent, AgentCategory, ChatRoomStrategy } from '@/types'

export type ChatControlActionId =
  | 'increase_conflict'
  | 'decrease_conflict'
  | 'return_to_evidence'
  | 'student_view'
  | 'expert_judgment'
  | 'summarize_now'
  | 'reduce_noise'
  | 'advance_topic'

export interface ChatControlActionDefinition {
  id: ChatControlActionId
  label: string
  instruction: string
  strategyPatch?: Partial<ChatRoomStrategy>
  targetRole?: AgentCategory | 'expert'
  forceSummary?: boolean
  advanceTopic?: boolean
}

export interface ResolvedChatControlAction extends ChatControlActionDefinition {
  targetAgent?: Agent
}

export const CHAT_CONTROL_ACTIONS: ChatControlActionDefinition[] = [
  {
    id: 'increase_conflict',
    label: '更激烈一点',
    instruction: '请更明确地指出分歧，允许角色直接反驳，但要落到具体依据和判断标准。',
    strategyPatch: { conflictLevel: 'intense' },
  },
  {
    id: 'decrease_conflict',
    label: '更温和一点',
    instruction: '请降低对抗强度，先承认合理部分，再温和指出风险或补充条件。',
    strategyPatch: { conflictLevel: 'soft' },
  },
  {
    id: 'return_to_evidence',
    label: '回到文档证据',
    instruction: '请回到文档证据或评审依据，优先说明原文、出处、例子或评审结论支持了什么。',
    strategyPatch: { contextDepth: 'deep', citationPolicy: 'optional' },
  },
  {
    id: 'student_view',
    label: '学生视角',
    instruction: '请让学生角色从课堂体验、理解难点和学习负担角度说说，不要做专业评审裁决。',
    targetRole: 'student',
  },
  {
    id: 'expert_judgment',
    label: '专家判断',
    instruction: '请让具备教师、专家或专业能力的角色给出一个明确判断，并说明判断标准。',
    targetRole: 'expert',
  },
  {
    id: 'summarize_now',
    label: '先总结',
    instruction: '请先总结当前共识、关键分歧和下一步需要验证的问题。',
    forceSummary: true,
  },
  {
    id: 'reduce_noise',
    label: '少说废话',
    instruction: '请减少铺垫，每个角色只说最关键的一条判断或追问。',
    strategyPatch: { initiativeLevel: 'low' },
  },
  {
    id: 'advance_topic',
    label: '下一议题',
    instruction: '请收束当前议题，并推进到下一个最重要的议题。',
    advanceTopic: true,
  },
]

export function resolveChatControlAction(
  id: ChatControlActionId,
  participants: Agent[] = [],
): ResolvedChatControlAction {
  const action = CHAT_CONTROL_ACTIONS.find((item) => item.id === id)
  if (!action) {
    throw new Error(`Unknown chat control action: ${id}`)
  }

  return {
    ...action,
    targetAgent: resolveTargetAgent(action.targetRole, participants),
  }
}

function resolveTargetAgent(targetRole: ChatControlActionDefinition['targetRole'], participants: Agent[]): Agent | undefined {
  if (!targetRole) return undefined
  if (targetRole !== 'expert') {
    return participants.find((agent) => agent.category === targetRole)
  }

  return participants.find((agent) =>
    agent.category === 'teacher' ||
    agent.expertise.some((item) => /expert|review|pedagogy|teaching|assessment|专业|评审|教学|教研/i.test(item)) ||
    /expert|teacher|reviewer|专家|教师|教研|评审/.test(agent.name),
  )
}
