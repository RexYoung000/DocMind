import type { Agent, AgentColor, Document, AgentReview, Suggestion, ReviewSummary } from '@/types'
import { TEACHING_DIMENSIONS } from '@/types'
import { chatCompletion } from './llmService'
import { createId } from '@/utils/id'

const MAX_DOC_CONTENT = 14000
const MIN_TOP_SUGGESTIONS = 3
const MAX_TOP_SUGGESTIONS = 10

const REVIEW_SYSTEM_PROMPT = (agent: Agent) => `${agent.system_prompt}

你现在正在执行一份教研案深度评审任务，必须严格站在「${agent.name}」的身份与视角说话。

评审要求：
1. 不要只复述文件内容，要判断教学设计背后的因果链条，例如“目标过高为什么会导致难点无法落地”“活动设计为什么会削弱学生理解”。
2. 亮点和问题都要落在具体文本上。引用原文时使用（原文：“……”）格式。
3. 优化建议必须是可执行建议，不要空话。每条建议都要包含：问题定位 -> 改进动作 -> 预期收益。
4. 建议数量默认 3-8 条；如果文档明显优秀，也至少保留 2-3 条高价值建议。
5. 评论要有延伸，说明它会如何影响课堂节奏、学生理解、教学评价或迁移应用。
6. 维度评论不能只有一句话，每个维度都要给出具体发现和原因。

只输出 JSON，不要输出 Markdown，不要输出解释，不要输出代码块。
{
  "status_message": "2-3 句角色化短评",
  "score": 4.2,
  "opinion": "整体评价，需要包含：总体判断、最大亮点、核心痛点、最优先动作。",
  "highlights": ["亮点 1", "亮点 2"],
  "dimensions": [
    { "name": "课程设计", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" },
    { "name": "知识链", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" },
    { "name": "教学目标", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" },
    { "name": "课程重点", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" },
    { "name": "课程难点", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" },
    { "name": "学习梯度", "score": 4.0, "comment": "2-3 句深度评论", "evidence": "必要时引用原文" }
  ],
  "suggestions": [
    {
      "title": "建议标题",
      "content": "问题定位 -> 改进动作 -> 预期收益",
      "priority": "high",
      "evidence": "必要时引用原文",
      "expected_effect": "实施后的预期改善"
    }
  ]
}`

type ParsedReviewPayload = {
  status_message?: string
  score?: number
  opinion?: string
  highlights?: string[]
  dimensions?: { name?: string; score?: number; comment?: string; evidence?: string }[]
  suggestions?: {
    title?: string
    content?: string
    priority?: string
    evidence?: string
    expected_effect?: string
  }[]
}

type ParsedSummaryPayload = {
  overview?: string
  strengths?: string[]
  pain_points?: string[]
  consensus?: string[]
  controversies?: {
    topic?: string
    opinions?: { agent_name?: string; agent_color?: string; stance?: string }[]
  }[]
  top_suggestions?: {
    title?: string
    content?: string
    priority?: string
    evidence?: string
    expected_effect?: string
    source_agent?: string
  }[]
}

function extractJsonBlock(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const objectMatch = text.match(/\{[\s\S]*\}/)
  return objectMatch?.[0] ?? null
}

function parseJsonCandidate<T>(text: string): T | null {
  const jsonBlock = extractJsonBlock(text)
  if (!jsonBlock) {
    return null
  }

  try {
    return JSON.parse(jsonBlock) as T
  } catch {
    return null
  }
}

function normalizeScore(score: number | undefined, fallback = 3.5) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return fallback
  }

  return Math.min(5, Math.max(1, Number(score.toFixed(1))))
}

function normalizeTextList(items: unknown, minLength = 0) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > minLength)
}

function normalizeSuggestionKey(suggestion: { title?: string; content?: string }) {
  return `${suggestion.title || ''}|${suggestion.content || ''}`
    .toLowerCase()
    .replace(/\s+/g, '')
}

function normalizeSuggestions(
  suggestions: ParsedReviewPayload['suggestions'] | ParsedSummaryPayload['top_suggestions'],
  sourceAgent: string,
) {
  if (!Array.isArray(suggestions)) {
    return [] as Suggestion[]
  }

  const seen = new Set<string>()

  const normalized: Array<Suggestion | null> = suggestions
    .map((suggestion) => {
      const content = suggestion.content?.trim()
      if (!content) {
        return null
      }

      const title = suggestion.title?.trim()
      const key = normalizeSuggestionKey({ title, content })
      if (seen.has(key)) {
        return null
      }
      seen.add(key)

      const priority = suggestion.priority === 'high' || suggestion.priority === 'medium' || suggestion.priority === 'low'
        ? suggestion.priority
        : 'medium'

      return {
        id: createId(),
        title,
        content,
        priority,
        adopted: false,
        source_agent: sourceAgent,
        evidence: suggestion.evidence?.trim(),
        expected_effect: suggestion.expected_effect?.trim(),
      } satisfies Suggestion
    })

  return normalized.filter((suggestion) => suggestion !== null) as Suggestion[]
}

function normalizeDimensions(dimensions: ParsedReviewPayload['dimensions']) {
  const dimensionMap = new Map(
    Array.isArray(dimensions)
      ? dimensions
          .filter((dimension) => dimension.name)
          .map((dimension) => [dimension.name as string, dimension])
      : []
  )

  return TEACHING_DIMENSIONS.map((dimensionName) => {
    const found = dimensionMap.get(dimensionName)
    return {
      name: dimensionName,
      score: normalizeScore(found?.score),
      comment: found?.comment?.trim(),
      evidence: found?.evidence?.trim(),
    }
  })
}

function buildTeachingContext(doc: Document) {
  if (!doc.teaching_plan) {
    return ''
  }

  const teachingPlan = doc.teaching_plan
  const sections = [
    `学科：${teachingPlan.subject || '未识别'}`,
    `年级：${teachingPlan.grade || '未识别'}`,
    `课题：${teachingPlan.topic || '未识别'}`,
    `课时：${teachingPlan.duration || '未识别'}`,
  ]

  if (teachingPlan.objectives) {
    sections.push(
      `教学目标：`,
      `- 知识与技能：${teachingPlan.objectives.knowledge || '未明确'}`,
      `- 过程与方法：${teachingPlan.objectives.process || '未明确'}`,
      `- 情感态度价值观：${teachingPlan.objectives.emotion || '未明确'}`
    )
  }

  if (teachingPlan.keyPoints?.length) {
    sections.push(`教学重点：${teachingPlan.keyPoints.join('；')}`)
  }

  if (teachingPlan.difficulties?.length) {
    sections.push(`教学难点：${teachingPlan.difficulties.join('；')}`)
  }

  if (teachingPlan.teachingProcess?.length) {
    sections.push(
      '教学过程：',
      ...teachingPlan.teachingProcess.slice(0, 5).map((item) => `- ${item.stage}：${item.content}`)
    )
  }

  return `\n\n【结构化教学信息】\n${sections.join('\n')}`
}

function buildStructuredSections(doc: Document) {
  const sections = (doc.structured_content?.sections as { title?: string; content?: string }[] | undefined) || []
  if (!sections.length) {
    return ''
  }

  return `\n\n【文档章节摘录】\n${sections
    .slice(0, 6)
    .map((section, index) => `${index + 1}. ${section.title || '未命名章节'}：${(section.content || '').slice(0, 240)}`)
    .join('\n')}`
}

async function collectCompletionText(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  signal?: AbortSignal,
  onProgress?: (text: string) => void,
) {
  let fullText = ''

  await chatCompletion(
    messages,
    {
      onChunk: (chunk) => {
        fullText += chunk
        onProgress?.(fullText)
      },
      onDone: (text) => {
        fullText = text || fullText
        onProgress?.(fullText)
      },
      onError: () => {},
    },
    signal,
  )

  return fullText
}

async function repairReviewPayload(rawText: string, signal?: AbortSignal) {
  const repairedText = await collectCompletionText(
    [
      {
        role: 'system',
        content:
          '你是一个 JSON 修复助手。请把下面的评审文本整理成合法 JSON，只输出 JSON，不要解释。必须保留 opinion、dimensions、suggestions 字段，并尽量补全 title、evidence、expected_effect。',
      },
      {
        role: 'user',
        content: rawText,
      },
    ],
    signal,
  )

  return parseJsonCandidate<ParsedReviewPayload>(repairedText)
}

function buildFallbackOpinion(text: string) {
  return text.trim().slice(0, 500) || '评审结果解析失败，请重试'
}

export interface ReviewProgress {
  agentId: string
  agentName: string
  status: 'pending' | 'reviewing' | 'done' | 'error'
  streamText: string
  result?: AgentReview
  error?: string
}

export function createFailedAgentReview(agent: Agent, errorMessage: string): AgentReview {
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_color: agent.color,
    score: 0,
    opinion: '该角色本次分析未能成功生成，请根据错误信息重试。',
    status: 'failed',
    error_message: errorMessage,
    dimensions: TEACHING_DIMENSIONS.map((name) => ({ name, score: 0 })),
    suggestions: [],
  }
}

export async function executeAgentReview(
  agent: Agent,
  doc: Document,
  onProgress: (text: string) => void,
  signal?: AbortSignal,
): Promise<AgentReview> {
  const docContent = doc.raw_content || '(文档内容为空)'
  const truncatedContent = docContent.slice(0, MAX_DOC_CONTENT)
  const teachingContext = buildTeachingContext(doc)
  const structuredSections = buildStructuredSections(doc)

  const rawText = await collectCompletionText(
    [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT(agent) },
      {
        role: 'user',
        content: `请评审以下教研案。

标题：${doc.title}${teachingContext}${structuredSections}

【完整内容】
${truncatedContent}`,
      },
    ],
    signal,
    onProgress,
  )

  let parsed = parseJsonCandidate<ParsedReviewPayload>(rawText)
  if (!parsed) {
    try {
      parsed = await repairReviewPayload(rawText, signal)
    } catch {
      parsed = null
    }
  }

  if (!parsed) {
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_color: agent.color,
      score: 3.5,
      opinion: buildFallbackOpinion(rawText),
      status: 'completed',
      dimensions: TEACHING_DIMENSIONS.map((name) => ({ name, score: 3.5 })),
      suggestions: [],
    }
  }

  return {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_color: agent.color,
    score: normalizeScore(parsed.score),
    opinion: parsed.opinion?.trim() || buildFallbackOpinion(rawText),
    status: 'completed',
    highlights: normalizeTextList(parsed.highlights, 3),
    dimensions: normalizeDimensions(parsed.dimensions),
    suggestions: normalizeSuggestions(parsed.suggestions, agent.name),
  }
}

function collectSuggestions(agentReviews: AgentReview[]) {
  const ranked = agentReviews
    .flatMap((review) => review.suggestions)
    .sort((left, right) => {
      const priorityScore = { high: 3, medium: 2, low: 1 }
      return priorityScore[right.priority] - priorityScore[left.priority]
    })

  const seen = new Set<string>()
  const collected: Suggestion[] = []

  for (const suggestion of ranked) {
    const key = normalizeSuggestionKey(suggestion)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    collected.push({ ...suggestion, id: createId() })

    if (collected.length >= MAX_TOP_SUGGESTIONS) {
      break
    }
  }

  return collected
}

function buildFallbackSummary(completedReviews: AgentReview[]): ReviewSummary {
  const topSuggestions = collectSuggestions(completedReviews)
  const highlights = completedReviews.flatMap((review) => review.highlights || []).slice(0, 3)
  const risks = topSuggestions.slice(0, 3).map((suggestion) => suggestion.title || suggestion.content)

  return {
    overview: completedReviews.length
      ? `已完成 ${completedReviews.length} 份评审，整体判断集中在“可用但仍有关键教学落点需要加深”。`
      : '暂无有效评审结果。',
    strengths: highlights.length ? highlights : ['文档至少具备了基础教学要素，便于继续迭代。'],
    pain_points: risks,
    consensus: completedReviews.length === 1 ? [completedReviews[0].opinion.slice(0, 120)] : [],
    controversies: [],
    top_suggestions: topSuggestions,
  }
}

export async function generateSummary(agentReviews: AgentReview[]): Promise<ReviewSummary> {
  const completedReviews = agentReviews.filter((review) => review.status !== 'failed')
  if (completedReviews.length === 0) {
    return {
      overview: '暂无有效评审结果。',
      strengths: [],
      pain_points: [],
      consensus: [],
      controversies: [],
      top_suggestions: [],
    }
  }

  const fallbackSummary = buildFallbackSummary(completedReviews)
  if (completedReviews.length < 2) {
    return fallbackSummary
  }

  const agentColorMap: Record<string, AgentColor> = {}
  for (const review of completedReviews) {
    agentColorMap[review.agent_name] = review.agent_color
  }

  const agentSummaries = completedReviews
    .map((review) => {
      const dimensionSummary = review.dimensions
        .map((dimension) => `${dimension.name}=${dimension.score.toFixed(1)}${dimension.comment ? `(${dimension.comment})` : ''}`)
        .join('；')

      const suggestionSummary = review.suggestions
        .map((suggestion) =>
          `- [${suggestion.priority}] ${suggestion.title ? `${suggestion.title}: ` : ''}${suggestion.content}${suggestion.expected_effect ? `；预期收益：${suggestion.expected_effect}` : ''}`
        )
        .join('\n')

      return `【${review.agent_name}】评分 ${review.score.toFixed(1)}
总体意见：${review.opinion}
亮点：${(review.highlights || []).join('；') || '未单列'}
维度：${dimensionSummary}
建议：
${suggestionSummary || '- 暂无'}`
    })
    .join('\n\n')

  const summaryPrompt = `以下是多位角色对同一份教研案的评审结果：

${agentSummaries}

请输出一个更适合教师阅读与落地执行的汇总 JSON，只输出 JSON：
{
  "overview": "2-3 句整体诊断，要指出最核心的教学痛点与改进方向",
  "strengths": ["2-4 条真正成立的亮点"],
  "pain_points": ["2-4 条最值得优先处理的痛点"],
  "consensus": ["2-4 条多角色共识"],
  "controversies": [
    {
      "topic": "争议主题",
      "opinions": [
        { "agent_name": "角色名", "agent_color": "indigo", "stance": "该角色的立场" }
      ]
    }
  ],
  "top_suggestions": [
    {
      "title": "建议标题",
      "content": "问题定位 -> 改进动作 -> 预期收益",
      "priority": "high",
      "evidence": "关键证据，可空",
      "expected_effect": "实施后的教学收益",
      "source_agent": "若为跨角色共识可写 评审汇总"
    }
  ]
}

要求：
1. top_suggestions 数量控制在 3-10 条，默认越少越精，不要堆砌重复建议。
2. 不要停留在“表面现象”，要说明这些问题为什么会影响课堂质量。
3. 优先保留真正能落地、能提升课堂效果的建议。
4. 如果多位角色提到同一痛点，请合并成更高质量的一条。`

  try {
    const summaryText = await collectCompletionText(
      [
        {
          role: 'system',
          content: '你是一个擅长教研报告整合的高级分析助手，负责把多角色意见压缩成更深、更准、更可执行的结论。只输出 JSON。',
        },
        { role: 'user', content: summaryPrompt },
      ],
    )

    const parsed = parseJsonCandidate<ParsedSummaryPayload>(summaryText)
    if (!parsed) {
      return fallbackSummary
    }

    const topSuggestions = normalizeSuggestions(
      parsed.top_suggestions,
      '评审汇总',
    ).slice(0, MAX_TOP_SUGGESTIONS)

    return {
      overview: parsed.overview?.trim() || fallbackSummary.overview,
      strengths: normalizeTextList(parsed.strengths, 3).slice(0, 4),
      pain_points: normalizeTextList(parsed.pain_points, 3).slice(0, 4),
      consensus: normalizeTextList(parsed.consensus, 3).slice(0, 4),
      controversies: Array.isArray(parsed.controversies)
        ? parsed.controversies
            .filter((item) => item.topic?.trim())
            .map((item) => ({
              topic: item.topic!.trim(),
              opinions: (item.opinions || [])
                .filter((opinion) => opinion.agent_name?.trim() && opinion.stance?.trim())
                .map((opinion) => ({
                  agent_name: opinion.agent_name!.trim(),
                  agent_color: (agentColorMap[opinion.agent_name!.trim()] || opinion.agent_color || 'slate') as AgentColor,
                  stance: opinion.stance!.trim(),
                })),
            }))
            .filter((item) => item.opinions.length > 0)
            .slice(0, 3)
        : fallbackSummary.controversies,
      top_suggestions: topSuggestions.length >= MIN_TOP_SUGGESTIONS
        ? topSuggestions
        : fallbackSummary.top_suggestions,
    }
  } catch {
    return fallbackSummary
  }
}
