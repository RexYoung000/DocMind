import type {
  CapabilityProfile,
  IdentityType,
  SpeakingPosture,
} from './strategyTypes'
import { resolveAllowedPosture } from './capabilityProfiler'

export interface ResponseValidationInput {
  content: string
  profile: CapabilityProfile
  requestedPosture?: SpeakingPosture
  topic?: string
  agentName?: string
}

export interface ResponseViolation {
  code:
    | 'posture_not_allowed'
    | 'forbidden_claim'
    | 'overprofessional_language'
    | 'identity_overreach'
  matchedTerms: string[]
  message: string
}

export interface ResponseValidationResult {
  isValid: boolean
  needsRewrite: boolean
  recommendedPosture: SpeakingPosture
  rewriteInstruction?: string
  violations: ResponseViolation[]
}

const PROFESSIONAL_TERM_GROUPS: Record<IdentityType, string[]> = {
  student: [
    '课程标准',
    '教学目标',
    '教学设计',
    '教研案',
    '评价指标',
    '目标达成',
    '形成性评价',
    '学情分析',
    '教学策略',
    '重难点',
    '课堂环节',
  ],
  parent: [
    '课程标准',
    '教学目标',
    '教学设计',
    '教研案',
    '评价指标',
    '目标达成',
    '形成性评价',
    '学情分析',
    '教学策略',
  ],
  technical: [
    '学生一定会',
    '学生肯定能',
    '课堂体验一定',
    '教学目标达成',
    '课程标准符合',
  ],
  product: ['数据库一定', '接口必然', '算法复杂度一定'],
  creative: ['课程标准符合', '技术上一定可行', '教学目标达成'],
  teacher: [],
  expert: [],
  observer: [
    '课程标准',
    '教学目标',
    '教学设计',
    '教研案',
    '评价指标',
    '目标达成',
    '技术上一定',
  ],
}

const JUDGMENT_PATTERNS = [
  '不合理',
  '不可行',
  '不符合',
  '缺少',
  '必须',
  '应该',
  '一定',
  '显然',
  '证明',
  '达成度',
  '可行性',
]

function findTerms(content: string, terms: string[]): string[] {
  return terms.filter((term) => term && content.includes(term))
}

function hasProfessionalJudgment(content: string): boolean {
  return JUDGMENT_PATTERNS.some((pattern) => content.includes(pattern))
}

function isExperienceBoundIdentity(identityType: IdentityType): boolean {
  return identityType === 'student' || identityType === 'parent' || identityType === 'observer'
}

function postureLabel(posture: SpeakingPosture): string {
  switch (posture) {
    case 'expert_judgment':
      return '专业判断'
    case 'experience_feedback':
      return '体验反馈'
    case 'clarifying_question':
      return '澄清追问'
    case 'risk_signal':
      return '风险提醒'
    case 'summary_bridge':
      return '总结连接'
  }
}

function identityRewriteGuidance(profile: CapabilityProfile): string {
  switch (profile.identityType) {
    case 'student':
      return '改成学生能自然说出口的学习体验：哪里听不懂、哪里跟不上、哪里需要例子、会提出什么朴素问题。'
    case 'parent':
      return '改成家长能自然说出口的家庭和孩子反馈：课后压力、理解成本、家庭配合、孩子可能的反应。'
    case 'technical':
      return '改成技术视角：实现路径、数据流、系统风险、工程成本，不替代课堂体验或教研结论。'
    case 'product':
      return '改成产品视角：用户价值、流程阻力、优先级、可用性风险，不替代技术或教研专业结论。'
    case 'creative':
      return '改成创意视角：表达方式、活动形式、发散方案和可尝试方向，避免做专业确定性裁决。'
    case 'teacher':
      return '改成教师视角：课堂节奏、重难点、实施条件和学生可能反应，避免替所有学生下绝对结论。'
    case 'expert':
      return '保留专业判断，但区分证据、推断和经验，不替代个体体验。'
    case 'observer':
      return '改成观察者视角：指出疑问、感受和需要澄清的信息，不做专业结论。'
  }
}

function buildRewriteInstruction(input: ResponseValidationInput, posture: SpeakingPosture): string {
  const agentPart = input.agentName ? `请保留 ${input.agentName} 的身份口吻，` : '请保留当前角色口吻，'
  const topicPart = input.topic ? `当前议题是“${input.topic}”。` : ''

  return [
    agentPart + '重写这段回复。',
    topicPart,
    `推荐发言姿态：${postureLabel(posture)}。`,
    identityRewriteGuidance(input.profile),
    '不要生硬拒答，不要解释系统规则；把越权的专业判断自然转译成该身份能提供的反馈。',
  ].filter(Boolean).join('\n')
}

export function validateAndAdaptResponse(
  input: ResponseValidationInput,
): ResponseValidationResult {
  const content = input.content.trim()
  const recommendedPosture = resolveAllowedPosture(input.profile, input.requestedPosture)
  const violations: ResponseViolation[] = []

  if (
    input.requestedPosture &&
    !input.profile.allowedPostures.includes(input.requestedPosture)
  ) {
    violations.push({
      code: 'posture_not_allowed',
      matchedTerms: [input.requestedPosture],
      message: `该身份不适合使用“${postureLabel(input.requestedPosture)}”姿态。`,
    })
  }

  const forbiddenTerms = findTerms(content, input.profile.forbiddenClaims)
  if (forbiddenTerms.length > 0) {
    violations.push({
      code: 'forbidden_claim',
      matchedTerms: forbiddenTerms,
      message: '回复包含该身份边界内禁止直接下结论的内容。',
    })
  }

  const professionalTerms = findTerms(
    content,
    PROFESSIONAL_TERM_GROUPS[input.profile.identityType],
  )
  if (
    professionalTerms.length > 0 &&
    isExperienceBoundIdentity(input.profile.identityType) &&
    hasProfessionalJudgment(content)
  ) {
    violations.push({
      code: 'overprofessional_language',
      matchedTerms: professionalTerms,
      message: '体验型身份使用了明显专业评审术语并给出判断。',
    })
  }

  if (
    input.profile.identityType === 'technical' &&
    professionalTerms.length > 0 &&
    hasProfessionalJudgment(content)
  ) {
    violations.push({
      code: 'identity_overreach',
      matchedTerms: professionalTerms,
      message: '技术身份越界判断了课堂体验或教研结论。',
    })
  }

  const needsRewrite = violations.length > 0

  return {
    isValid: !needsRewrite,
    needsRewrite,
    recommendedPosture,
    rewriteInstruction: needsRewrite
      ? buildRewriteInstruction(input, recommendedPosture)
      : undefined,
    violations,
  }
}
