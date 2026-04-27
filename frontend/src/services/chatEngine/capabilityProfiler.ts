import type { Agent } from '@/types'
import type {
  CapabilityProfile,
  EvidenceStyle,
  IdentityType,
  KnowledgeLevel,
  SpeakingPosture,
} from './strategyTypes'

export type CapabilityAgentInput = Pick<
  Agent,
  'name' | 'category' | 'expertise' | 'system_prompt' | 'focusDimension'
>

interface IdentityRule {
  identityType: IdentityType
  category?: string
  keywords: string[]
  profile: Omit<CapabilityProfile, 'identityType' | 'confidence' | 'sourceSignals'>
}

const COMMON_EXPERT_TERMS = [
  '课程标准',
  '教学目标',
  '教学设计',
  '教研案',
  '评价指标',
  '形成性评价',
  '目标达成',
  '学情分析',
  '教学法',
  '重难点',
  '课堂环节',
  '单元整体',
]

const STUDENT_FORBIDDEN = [
  ...COMMON_EXPERT_TERMS,
  '专业可行性判断',
  '课程结构评价',
  '教师教学能力评价',
]

const PARENT_FORBIDDEN = [
  ...COMMON_EXPERT_TERMS,
  '替代教师做专业教学结论',
  '替代学生表达课堂即时理解',
]

const TECHNICAL_FORBIDDEN = [
  '学生真实课堂感受判断',
  '课程标准专业结论',
  '教学目标达成结论',
]

const CREATIVE_FORBIDDEN = [
  '课程标准专业结论',
  '技术实现确定性承诺',
  '替代用户体验证据',
]

function createProfile(
  knowledgeLevel: KnowledgeLevel,
  allowedPostures: SpeakingPosture[],
  forbiddenClaims: string[],
  preferredEvidenceStyle: EvidenceStyle,
  fallbackPosture: CapabilityProfile['fallbackPosture'],
  boundaryNotes: string[],
): Omit<CapabilityProfile, 'identityType' | 'confidence' | 'sourceSignals'> {
  return {
    knowledgeLevel,
    allowedPostures,
    forbiddenClaims,
    preferredEvidenceStyle,
    fallbackPosture,
    boundaryNotes,
  }
}

const IDENTITY_RULES: IdentityRule[] = [
  {
    identityType: 'student',
    category: 'student',
    keywords: ['学生', '小学生', '初中生', '高中生', '学习者', '同学', '孩子视角', '听不懂'],
    profile: createProfile(
      'experiential',
      ['experience_feedback', 'clarifying_question'],
      STUDENT_FORBIDDEN,
      'personal',
      'experience_feedback',
      ['只能从学习体验、困惑点、兴趣点和朴素问题发言。'],
    ),
  },
  {
    identityType: 'parent',
    category: 'parent',
    keywords: ['家长', '父母', '家庭', '孩子压力', '课后', '陪伴', '作业负担'],
    profile: createProfile(
      'experiential',
      ['experience_feedback', 'clarifying_question', 'risk_signal'],
      PARENT_FORBIDDEN,
      'personal',
      'risk_signal',
      ['只能从家庭配合、孩子压力、课后反馈和家长可理解性发言。'],
    ),
  },
  {
    identityType: 'teacher',
    category: 'teacher',
    keywords: ['教师', '老师', '班主任', '授课', '课堂', '教学', '教案'],
    profile: createProfile(
      'practitioner',
      ['expert_judgment', 'experience_feedback', 'clarifying_question', 'risk_signal', 'summary_bridge'],
      ['替代全部学生表达真实感受', '脱离课堂实施条件做绝对结论'],
      'classroom',
      'risk_signal',
      ['可以评价课堂节奏、教学目标、重难点和实施风险。'],
    ),
  },
  {
    identityType: 'technical',
    category: 'engineer',
    keywords: ['技术', '工程师', '架构', '系统', '数据', '接口', '前端', '后端', '算法', '实现'],
    profile: createProfile(
      'expert',
      ['expert_judgment', 'clarifying_question', 'risk_signal', 'summary_bridge'],
      TECHNICAL_FORBIDDEN,
      'implementation',
      'risk_signal',
      ['可以判断实现方案、数据流、系统风险和工程成本。'],
    ),
  },
  {
    identityType: 'product',
    keywords: ['产品', '用户体验', 'ux', '用户价值', '需求', '流程', '交互', '可用性'],
    profile: createProfile(
      'practitioner',
      ['expert_judgment', 'experience_feedback', 'clarifying_question', 'risk_signal', 'summary_bridge'],
      ['课程标准专业结论', '底层技术确定性承诺'],
      'product',
      'risk_signal',
      ['可以判断用户价值、流程、优先级、体验风险和落地路径。'],
    ),
  },
  {
    identityType: 'creative',
    category: 'creative',
    keywords: ['创意', '创新', '发散', '脑暴', '故事', '表达', '文案', '设计'],
    profile: createProfile(
      'practitioner',
      ['experience_feedback', 'clarifying_question', 'risk_signal', 'summary_bridge'],
      CREATIVE_FORBIDDEN,
      'creative',
      'clarifying_question',
      ['适合提出表达、创意和发散方向，不做专业确定性裁决。'],
    ),
  },
  {
    identityType: 'expert',
    category: 'analyst',
    keywords: ['专家', '教研员', '研究员', '分析师', '评审', '顾问', '标准', '评价'],
    profile: createProfile(
      'expert',
      ['expert_judgment', 'clarifying_question', 'risk_signal', 'summary_bridge'],
      ['替代个体学生或家长表达亲身体验'],
      'professional',
      'risk_signal',
      ['可以做专业判断，但需要区分证据、推断和经验。'],
    ),
  },
]

const DEFAULT_OBSERVER_PROFILE: CapabilityProfile = {
  identityType: 'observer',
  knowledgeLevel: 'layperson',
  allowedPostures: ['experience_feedback', 'clarifying_question'],
  forbiddenClaims: [...COMMON_EXPERT_TERMS, '专业确定性结论', '实现确定性承诺'],
  preferredEvidenceStyle: 'questioning',
  fallbackPosture: 'clarifying_question',
  confidence: 0.35,
  sourceSignals: ['default:observer'],
  boundaryNotes: ['身份信号不足时默认作为观察者，只提体验反馈或澄清问题。'],
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.join(' ').toLowerCase()
  return String(value ?? '').toLowerCase()
}

function buildSearchText(agent: CapabilityAgentInput): string {
  return [
    agent.category,
    agent.name,
    agent.focusDimension,
    agent.expertise.join(' '),
    agent.system_prompt,
  ].map(normalizeText).join(' ')
}

function scoreRule(rule: IdentityRule, agent: CapabilityAgentInput, searchText: string): {
  score: number
  signals: string[]
} {
  const signals: string[] = []
  let score = 0

  if (rule.category && agent.category === rule.category) {
    score += 5
    signals.push(`category:${rule.category}`)
  }

  for (const keyword of rule.keywords) {
    if (!searchText.includes(keyword.toLowerCase())) continue
    score += 1
    signals.push(`keyword:${keyword}`)
  }

  return { score, signals }
}

function confidenceFromScore(score: number): number {
  if (score >= 7) return 0.95
  if (score >= 5) return 0.86
  if (score >= 3) return 0.72
  if (score >= 1) return 0.58
  return 0.35
}

function mergeBoundaryNotes(baseNotes: string[], conflictSignals: string[]): string[] {
  if (conflictSignals.length === 0) return baseNotes
  return [
    ...baseNotes,
    `检测到混合身份信号：${conflictSignals.join('、')}。运行时应优先使用更保守的发言姿态。`,
  ]
}

export function inferCapabilityProfile(agent: CapabilityAgentInput): CapabilityProfile {
  const searchText = buildSearchText(agent)
  const scored = IDENTITY_RULES
    .map((rule) => ({ rule, ...scoreRule(rule, agent, searchText) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) return DEFAULT_OBSERVER_PROFILE

  const conflictSignals = scored
    .slice(1)
    .filter((item) => item.score >= 2)
    .map((item) => item.rule.identityType)

  return {
    identityType: best.rule.identityType,
    ...best.rule.profile,
    confidence: confidenceFromScore(best.score),
    sourceSignals: best.signals,
    boundaryNotes: mergeBoundaryNotes(best.rule.profile.boundaryNotes, conflictSignals),
  }
}

export function isPostureAllowed(
  profile: CapabilityProfile,
  posture: SpeakingPosture,
): boolean {
  return profile.allowedPostures.includes(posture)
}

export function resolveAllowedPosture(
  profile: CapabilityProfile,
  requestedPosture?: SpeakingPosture,
): SpeakingPosture {
  if (requestedPosture && isPostureAllowed(profile, requestedPosture)) {
    return requestedPosture
  }

  if (profile.allowedPostures.includes(profile.fallbackPosture)) {
    return profile.fallbackPosture
  }

  return profile.allowedPostures[0] ?? 'clarifying_question'
}

export function buildCapabilityInstruction(profile: CapabilityProfile): string {
  return [
    `身份边界：${profile.identityType} / ${profile.knowledgeLevel}。`,
    `允许姿态：${profile.allowedPostures.join('、')}。`,
    `推荐证据风格：${profile.preferredEvidenceStyle}。`,
    `禁止越权：${profile.forbiddenClaims.join('、')}。`,
    ...profile.boundaryNotes,
  ].join('\n')
}
