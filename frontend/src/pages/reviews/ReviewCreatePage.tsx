import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { AGENT_COLORS, useAgentStore } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useAuthStore } from '@/stores/authStore'
import { isModelConfigValid, useSettingsStore } from '@/stores/settingsStore'
import { createFailedAgentReview, executeAgentReview, generateSummary } from '@/services/reviewEngine'
import { toast } from '@/components/ui/Toast'
import { createId } from '@/utils/id'
import type { Agent, AgentReview, Review, ReviewDimension } from '@/types'
import { REVIEW_DIMENSIONS } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'

type ReviewProgressItem = {
  status: 'pending' | 'reviewing' | 'done' | 'error'
  text: string
  dimensionsCompleted: number
}

const DIMENSION_STEPS = [
  { emoji: '🧭', label: '解析教学框架', activeLabel: '正在对齐教案结构与课堂节奏' },
  { emoji: '🧠', label: '梳理知识链', activeLabel: '正在检查概念衔接与迁移路径' },
  { emoji: '🎯', label: '校准教学目标', activeLabel: '正在判断目标是否可达且可验证' },
  { emoji: '📌', label: '聚焦课程重点', activeLabel: '正在确认重点是否真正突出' },
  { emoji: '🪜', label: '拆解课程难点', activeLabel: '正在推演难点突破路径' },
  { emoji: '📈', label: '评估学习梯度', activeLabel: '正在判断学生能否顺着节奏跟上' },
] as const

const REVIEW_STAGES = [
  {
    title: '解析文档结构',
    description: '先把文档的目标、重点和结构提取出来，建立统一的评审语境。',
  },
  {
    title: '对齐角色视角',
    description: '不同角色先站稳自己的观察位置，避免一上来就同质化输出。',
  },
  {
    title: '逐维度深度分析',
    description: '围绕逻辑结构、内容深度、表达清晰等多个维度逐项推进。',
  },
  {
    title: '聚合共识与分歧',
    description: '把多个角色真正说到一起，提炼共识，也保留有价值的分歧。',
  },
  {
    title: '生成高价值建议',
    description: '把分散意见压缩成可执行、可验证、可延伸的优化建议。',
  },
] as const

const REVIEW_PERSONA_COPY: Record<string, { active: string[]; done: string[]; error: string[] }> = {
  analyst: {
    active: [
      '正在梳理文档结构，理顺各部分之间的逻辑关系。',
      '正在做标注，标记出表达不够清晰的地方。',
      '正在写评审草稿，先把最关键的问题记下来。',
    ],
    done: [
      '已经把这一轮分析判断收束成了完整意见。',
      '刚刚给出了可落地的评审结论。',
    ],
    error: [
      '这一轮判断被打断了，需要重新组织观点。',
    ],
  },
  engineer: {
    active: [
      '正在从技术角度审视内容，验证论据的充分性。',
      '正在检查论证链条，看看有没有逻辑断点。',
      '正在逐条核验内容的实用性和可操作性。',
    ],
    done: [
      '已经把技术角度的判断说清楚了。',
      '刚刚从实用性角度给出了完整反馈。',
    ],
    error: [
      '这一轮工程视角的判断没顺利产出，还得再试一次。',
    ],
  },
  creative: {
    active: [
      '正在从创新角度审视内容，寻找突破点。',
      '正在思考内容的表达方式是否可以更有新意。',
      '正在记下关于创新性和差异化最有价值的发现。',
    ],
    done: [
      '已经把创新视角的核心发现提炼出来了。',
      '刚刚完成一轮从创意和表达角度的判断。',
    ],
    error: [
      '这一轮创意视角没能稳定生成，需要重新梳理。',
    ],
  },
}

type AgentActivityCopy = { status: string; active: string[]; detail: string[]; done: string }

const AGENT_ACTIVITY_COPY: Record<string, AgentActivityCopy> = {}

const FOCUS_ACTIVITY_COPY: Partial<Record<ReviewDimension, AgentActivityCopy>> = {
  逻辑结构: {
    status: '正在看文档结构',
    active: ['正在分析文档的整体框架。', '正在检查各部分的逻辑衔接。', '正在评估结构的完整性和连贯性。'],
    detail: ['会先看整体框架是否清晰。', '会特别留意结构是否有缺失。', '会把逻辑断层的地方标出来。'],
    done: '已经写好结构分析意见。',
  },
  内容深度: {
    status: '正在评估内容深度',
    active: ['正在判断内容的深入程度。', '正在检查论证的充分性。', '正在评估是否有足够的支撑材料。'],
    detail: ['会看内容是否停留在表面。', '会检查关键论点是否充分展开。', '会标注需要深化的部分。'],
    done: '已经完成内容深度评估。',
  },
  表达清晰: {
    status: '正在检查表达',
    active: ['正在逐段阅读，标记表达不清之处。', '正在检查用词是否准确。', '正在评估整体可读性。'],
    detail: ['会找出表述含糊的地方。', '会留意专业术语是否解释到位。', '会将不够通顺的段落单独标注。'],
    done: '已经完成表达清晰度审查。',
  },
  论据充分: {
    status: '正在核对论据',
    active: ['正在逐条核验论据的有效性。', '正在检查论据是否支撑论点。', '正在评估数据来源的可靠性。'],
    detail: ['会先看论据是否充足。', '会判断论据与论点的关联强度。', '会标记缺乏支撑的断言。'],
    done: '已经完成论据充分性评估。',
  },
  创新性: {
    status: '正在评估创新点',
    active: ['正在寻找内容中的创新亮点。', '正在判断观点的独特性。', '正在评估创新点的实际价值。'],
    detail: ['会区分真正的创新和重新表述。', '会看创新点是否具有实际意义。', '会把最亮眼的创新点圈出来。'],
    done: '已经完成创新性评估。',
  },
  实用性: {
    status: '正在评估实用性',
    active: ['正在判断内容的可操作性。', '正在评估建议的落地难度。', '正在检查是否有明确的行动指引。'],
    detail: ['会判断内容是否具有实际应用价值。', '会看建议是否具体可执行。', '会把缺乏可行性的部分标出来。'],
    done: '已经完成实用性评估。',
  },
}

function buildFallbackActivityCopy(agent: Agent): AgentActivityCopy {
  const expertise = agent.focusDimension || agent.expertise[0] || '文档内容'
  return {
    status: `正在分析${expertise}`,
    active: [`${agent.name}正在翻看${expertise}相关内容。`, `${agent.name}正在给${expertise}做批注。`, `${agent.name}正在把${expertise}里的问题记到草稿里。`],
    detail: [`会结合”${agent.behavior.style}”把意见写得更像本人。`, `会围绕「${expertise}」说清楚自己的判断。`, agent.behavior.catchphrase ? `脑子里还挂着那句：”${agent.behavior.catchphrase}”` : '会把观察点整理成几句清楚的话。'],
    done: `${agent.name}已经写完「${expertise}」相关意见。`,
  }
}

function getAgentActivityCopy(agent: Agent) {
  return AGENT_ACTIVITY_COPY[agent.name]
    || (agent.focusDimension ? FOCUS_ACTIVITY_COPY[agent.focusDimension] : undefined)
    || buildFallbackActivityCopy(agent)
}

function getStableSeed(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function pickPersonaLine(category: string | undefined, status: ReviewProgressItem['status'], seed: number) {
  const persona = REVIEW_PERSONA_COPY[category || 'analyst'] || REVIEW_PERSONA_COPY.analyst
  const lines =
    status === 'reviewing'
      ? persona.active
      : status === 'done'
        ? persona.done
        : persona.error
  return lines[seed % lines.length]
}

function estimateRemainingSeconds(progressPercent: number, elapsedSeconds: number, agentCount: number) {
  if (progressPercent <= 0) {
    return Math.max(18, agentCount * 14)
  }

  const totalEstimated = elapsedSeconds / progressPercent
  return Math.max(4, Math.round(totalEstimated - elapsedSeconds))
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60

  if (minutes === 0) {
    return `${secs}s`
  }

  return `${minutes}m ${secs.toString().padStart(2, '0')}s`
}

function getProgressPercent(progressItems: ReviewProgressItem[], agentCount: number) {
  if (agentCount === 0) {
    return 0
  }

  const completedUnits = progressItems.reduce((sum, item) => sum + Math.min(item.dimensionsCompleted, 6), 0)
  const totalUnits = agentCount * 6
  const dimensionProgress = Math.min(1, completedUnits / totalUnits)
  const doneCount = progressItems.filter((item) => item.status === 'done').length
  const reviewingCount = progressItems.filter((item) => item.status === 'reviewing').length

  let stageBaseline = 0
  if (doneCount === agentCount) {
    stageBaseline = 1
  } else if (doneCount >= Math.max(1, Math.floor(agentCount / 2))) {
    stageBaseline = 0.72
  } else if (progressItems.some((item) => item.dimensionsCompleted >= 3)) {
    stageBaseline = 0.48
  } else if (reviewingCount > 0) {
    stageBaseline = 0.18
  }

  return Math.min(1, Math.max(dimensionProgress, stageBaseline))
}

function getStageIndex(progressItems: ReviewProgressItem[], agentCount: number) {
  if (agentCount === 0) {
    return 0
  }

  const doneCount = progressItems.filter((item) => item.status === 'done').length
  const reviewingCount = progressItems.filter((item) => item.status === 'reviewing').length
  const averageDimensions = progressItems.reduce((sum, item) => sum + item.dimensionsCompleted, 0) / agentCount

  if (doneCount === agentCount) {
    return 4
  }

  if (doneCount >= Math.max(1, Math.floor(agentCount / 2))) {
    return 3
  }

  if (averageDimensions >= 3) {
    return 2
  }

  if (reviewingCount > 0) {
    return 1
  }

  return 0
}

function getAgentWorkingStatus(agent: Agent, item: ReviewProgressItem) {
  if (item.status === 'done') return '已写好意见'
  if (item.status === 'error') return '需要重试'
  return getAgentActivityCopy(agent).status
}

function buildAgentTaskCopy(agent: Agent, item: ReviewProgressItem) {
  if (item.status === 'pending') {
    return `${agent.name}正拿起资料，等轮到自己发言。`
  }

  const seed = getStableSeed(agent.id || agent.name) + Math.max(0, item.dimensionsCompleted)
  const activityCopy = getAgentActivityCopy(agent)
  const personaLine = item.status === 'reviewing'
    ? activityCopy.active[seed % activityCopy.active.length]
    : pickPersonaLine(agent.category, item.status, seed)

  if (item.status === 'reviewing') {
    return personaLine
  }

  if (item.status === 'done') {
    return activityCopy.done || personaLine
  }

  return personaLine
}

function buildAgentDetailCopy(agent: Agent, item: ReviewProgressItem) {
  if (item.status === 'done') {
    return agent.behavior.catchphrase ? `收尾时还记了一句：“${agent.behavior.catchphrase}”` : '评审内容已经收进报告里。'
  }

  if (item.status === 'error') {
    return item.text || '这位角色刚才没有顺利写完，可以稍后重试。'
  }
  const seed = getStableSeed(`${agent.id}-${item.dimensionsCompleted}-detail`)
  const details = getAgentActivityCopy(agent).detail
  return details[seed % details.length]
}

export default function ReviewCreatePage() {
  const [searchParams] = useSearchParams()
  const preselectedDocId = searchParams.get('doc')
  const { user } = useAuthStore()
  const allDocuments = useDocumentStore((state) => state.documents)
  const documents = useMemo(() => allDocuments.filter((document) => document.status === 'ready'), [allDocuments])
  const incrementReviewCount = useDocumentStore((state) => state.incrementReviewCount)
  const agents = useAgentStore((state) => state.agents)
  const incrementUsage = useAgentStore((state) => state.incrementUsage)
  const addReview = useReviewStore((state) => state.addReview)
  const updateReview = useReviewStore((state) => state.updateReview)
  const config = useSettingsStore((state) => state.currentConfig)
  const hasValidConfig = isModelConfigValid(config)

  const autoSelectedDocId = preselectedDocId || (documents.length === 1 ? documents[0].id : '')
  const [selectedDocId, setSelectedDocId] = useState(autoSelectedDocId)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config')
  const [progress, setProgress] = useState<Record<string, ReviewProgressItem>>({})
  const [reviewId, setReviewId] = useState('')
  const [runningStartedAt, setRunningStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const dimTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const selectedDoc = documents.find((document) => document.id === selectedDocId)
  const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id))
  const progressItems = selectedAgents.map((agent) => progress[agent.id] || { status: 'pending', text: '', dimensionsCompleted: 0 })
  const successCount = progressItems.filter((item) => item.status === 'done').length
  const failedCount = progressItems.filter((item) => item.status === 'error').length
  const progressPercent = getProgressPercent(progressItems, selectedAgents.length)
  const stageIndex = getStageIndex(progressItems, selectedAgents.length)
  const remainingSeconds = estimateRemainingSeconds(progressPercent, elapsedSeconds, selectedAgents.length)
  const currentStage = REVIEW_STAGES[stageIndex]
  const activeProgressItems = selectedAgents
    .map((agent) => ({ agent, item: progress[agent.id] || { status: 'pending', text: '', dimensionsCompleted: 0 } }))
    .filter(({ item }) => item.status === 'reviewing' || item.status === 'done' || item.status === 'error')
  const processSignals = activeProgressItems
    .map(({ agent, item }) => ({
      id: agent.id,
      agent,
      status: item.status,
      dimensionsCompleted: item.dimensionsCompleted,
      statusCopy: getAgentWorkingStatus(agent, item),
      detailCopy: buildAgentDetailCopy(agent, item),
      taskCopy: buildAgentTaskCopy(agent, item),
    }))
    .filter((signal) => signal.status !== 'pending')

  useEffect(() => {
    if (phase !== 'running' || !runningStartedAt) {
      return
    }

    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runningStartedAt) / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [phase, runningStartedAt])

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id)
      }

      if (previous.length >= 5) {
        toast('info', '最多选择 5 个角色')
        return previous
      }

      return [...previous, id]
    })
  }

  const canStart = Boolean(selectedDocId && selectedAgentIds.length > 0 && hasValidConfig)

  const handleStart = async () => {
    if (!canStart || !selectedDoc) return

    setPhase('running')
    setRunningStartedAt(Date.now())
    setElapsedSeconds(0)
    abortRef.current = new AbortController()

    const review: Review = {
      id: createId(),
      document_id: selectedDocId,
      owner_id: user?.id || '',
      status: 'in_progress',
      created_at: new Date().toISOString(),
      agent_reviews: [],
      agents: selectedAgents,
      document: selectedDoc,
    }

    addReview(review)
    setReviewId(review.id)

    const initialProgress: Record<string, ReviewProgressItem> = {}
    for (const agent of selectedAgents) {
      initialProgress[agent.id] = { status: 'pending', text: '', dimensionsCompleted: 0 }
    }
    setProgress(initialProgress)

    const maxConcurrent = config.maxConcurrentReviews ?? 1
    const results: (AgentReview | null)[] = new Array(selectedAgents.length).fill(null)

    const runAgent = async (agent: (typeof selectedAgents)[number], idx: number) => {
      setProgress((previous) => ({
        ...previous,
        [agent.id]: { status: 'reviewing', text: '', dimensionsCompleted: 0 },
      }))

      let dimCount = 0
      dimTimersRef.current[agent.id] = setInterval(() => {
        dimCount = Math.min(dimCount + 1, 5)
        setProgress((previous) => ({
          ...previous,
          [agent.id]: {
            ...previous[agent.id],
            dimensionsCompleted: dimCount,
          },
        }))
      }, 3600)

      try {
        const result = await executeAgentReview(
          agent,
          selectedDoc,
          (text) =>
            setProgress((previous) => ({
              ...previous,
              [agent.id]: {
                status: 'reviewing',
                text,
                dimensionsCompleted: previous[agent.id]?.dimensionsCompleted ?? 0,
              },
            })),
          abortRef.current!.signal,
        )

        results[idx] = result
        incrementUsage(agent.id)
        clearInterval(dimTimersRef.current[agent.id])
        setProgress((previous) => ({
          ...previous,
          [agent.id]: { status: 'done', text: previous[agent.id]?.text || '', dimensionsCompleted: 6 },
        }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '评审失败'
        results[idx] = createFailedAgentReview(agent, errorMessage)
        clearInterval(dimTimersRef.current[agent.id])
        setProgress((previous) => ({
          ...previous,
          [agent.id]: { status: 'error', text: errorMessage, dimensionsCompleted: previous[agent.id]?.dimensionsCompleted ?? 0 },
        }))
      }
    }

    const agentQueue = [...selectedAgents.entries()]
    let queueIdx = 0
    const worker = async () => {
      while (queueIdx < agentQueue.length) {
        const [idx, agent] = agentQueue[queueIdx++]
        await runAgent(agent, idx)
      }
    }

    await Promise.all(Array.from({ length: Math.min(maxConcurrent, selectedAgents.length) }, worker))

    const finalResults = results.filter((result): result is AgentReview => result !== null)
    const successfulResults = finalResults.filter((result) => result.status !== 'failed')
    const overallScore = successfulResults.length > 0
      ? successfulResults.reduce((sum, result) => sum + result.score, 0) / successfulResults.length
      : undefined

    let summary
    try {
      summary = await generateSummary(finalResults)
    } catch {
      summary = undefined
    }

    updateReview(review.id, {
      status: 'completed',
      overall_score: overallScore,
      agent_reviews: finalResults,
      summary,
    })
    incrementReviewCount(selectedDocId)
    setPhase('done')

    if (successfulResults.length === finalResults.length) {
      toast('success', `评审完成，已生成 ${finalResults.length} 份分析结果`)
      return
    }

    if (successfulResults.length === 0) {
      toast('error', '本次评审全部生成失败，已保留失败记录方便你重试')
      return
    }

    toast('info', `已生成 ${successfulResults.length} 份结果，另有 ${finalResults.length - successfulResults.length} 位角色生成失败`)
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      Object.values(dimTimersRef.current).forEach((timer) => clearInterval(timer))
    }
  }, [])

  if (phase === 'done') {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="dm-page-header">
          <div>
            <span className="dm-kicker">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Review Completed
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">评审已结束</h1>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              《{selectedDoc?.title || '当前文档'}》共选择了 {selectedAgents.length} 位角色，成功 {successCount} 位，失败 {failedCount} 位。
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 px-8 py-10 text-center shadow-sm">
          <Check className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold text-gray-900">报告已经准备好</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-600">
            报告会先给出总体诊断和关键痛点，再下钻到聚合建议与分角色细评，便于你继续进入研讨。
          </p>
          <Link to={`/reviews/${reviewId}`} className="mt-6 inline-flex no-underline">
            <Button size="lg">
              <ClipboardCheck className="h-4 w-4" />
              查看评审报告
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'running') {
    return (
      <div className="space-y-6 animate-slide-up">
      <div className="dm-page-header">
        <div>
          <span className="dm-kicker">
            <Sparkles className="h-3.5 w-3.5" />
            Review Running
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">正在生成评审</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600">
              评审过程不再只是简单等待。系统会先解析文档结构，再按角色视角和多个维度逐步推进，最后压缩成可执行的诊断与建议。
            </p>
          </div>

          <Button
            variant="danger-outline"
            onClick={() => {
              abortRef.current?.abort()
              Object.values(dimTimersRef.current).forEach((timer) => clearInterval(timer))
              toast('info', '评审已取消，已完成的结果会保留')
            }}
          >
            <XCircle className="h-4 w-4" />
            取消评审
          </Button>
        </div>

        <div className="dm-review-stage-card rounded-[30px] p-[1px]">
          <div className="dm-review-process-shell rounded-[29px] px-7 py-6 backdrop-blur-xl sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">Current Stage</p>
                <h2 className="mt-2 text-3xl font-bold text-gray-900">
                  <span className="dm-process-shimmer">{currentStage.title}</span>
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">{currentStage.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="dm-process-metric">{Math.round(progressPercent * 100)}%</span>
                <span className="dm-process-metric text-gray-600">已运行 {formatDuration(elapsedSeconds)}</span>
                <span className="dm-process-metric">预计剩余 {formatDuration(remainingSeconds)}</span>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-gray-700" />
                <span>系统正在推进本轮评审流程</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200/80">
                <div
                  className="dm-review-progress-bar h-full rounded-full"
                  style={{ width: `${Math.max(progressPercent * 100, 6)}%` }}
                />
              </div>
            </div>

            <div className="dm-review-process-grid mt-6">
              <div className="dm-process-panel p-4">
                <div className="space-y-3">
                  {REVIEW_STAGES.map((stage, index) => {
                    const isDone = index < stageIndex
                    const isActive = index === stageIndex

                    return (
                      <div
                        key={stage.title}
                        className={cn(
                          'dm-process-step flex items-start gap-3',
                          isDone && 'dm-process-step-done',
                          isActive && 'dm-process-step-active'
                        )}
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
                          {isDone ? '✓' : isActive ? '•' : index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className={cn('text-sm font-medium', isDone && 'line-through decoration-gray-400')}>{stage.title}</p>
                          <p className="mt-1 text-xs leading-6 opacity-90">{stage.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="dm-process-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">多角色参与态势</p>
                    <p className="mt-1 text-xs text-gray-500">当前正在参与本轮判断的角色会优先亮起。</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    进行中 {progressItems.filter((item) => item.status === 'reviewing').length} · 完成 {successCount} · 失败 {failedCount}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedAgents.map((agent) => {
                    const item = progress[agent.id]
                    const isReviewing = item?.status === 'reviewing'
                    const isDone = item?.status === 'done'
                    const isError = item?.status === 'error'

                    return (
                      <div
                        key={agent.id}
                        className={cn(
                          'dm-process-chip',
                          isReviewing && 'border-primary-200 bg-primary-50 text-primary-700',
                          isDone && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          isError && 'border-red-200 bg-red-50 text-red-700'
                        )}
                      >
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
                          style={{ backgroundColor: `${AGENT_COLORS[agent.color]}18`, boxShadow: `0 0 0 1px ${AGENT_COLORS[agent.color]}` }}
                        >
                          {agent.avatar || agent.name[0]}
                        </div>
                        <span>{agent.name}</span>
                        {isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {isDone ? <Check className="h-3.5 w-3.5" /> : null}
                        {isError ? <XCircle className="h-3.5 w-3.5" /> : null}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 space-y-3">
                  {processSignals.length > 0 ? (
                    processSignals.slice(0, 4).map((signal) => (
                      <div key={signal.id} className="dm-process-feed-item">
                        <div className="flex items-center gap-2 text-xs">
                          <div
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
                            style={{ backgroundColor: `${AGENT_COLORS[signal.agent.color]}18`, boxShadow: `0 0 0 1px ${AGENT_COLORS[signal.agent.color]}` }}
                          >
                            {signal.agent.avatar || signal.agent.name[0]}
                          </div>
                          <span className="font-medium text-gray-800">{signal.agent.name}</span>
                          <span className="text-gray-400">
                            {signal.statusCopy}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-gray-700">
                          {signal.taskCopy}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-gray-500">
                          {signal.detailCopy}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="dm-process-feed-item text-xs leading-6 text-gray-500">
                      角色正在进入本轮审阅，稍后这里会持续更新最新的分析信号。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> 返回评审大厅
      </Link>

      <div className="dm-page-header">
        <div>
          <span className="dm-kicker">
            <Sparkles className="h-3.5 w-3.5" />
            Review Setup
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">发起评审</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600">
            先选文档，再选角色。评审生成后会进入新的报告结构，并可继续拉起聊天室围绕共识、分歧和建议展开讨论。
          </p>
        </div>
      </div>

      {!hasValidConfig ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          请先到 <Link to="/settings" className="font-medium underline">设置页面</Link> 配置有效的 API Key 和模型，才能开始评审。
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-[28px]">
          <CardHeader>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">Step 1</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">选择文档</h2>
            </div>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">还没有可评审的文档</p>
                <Link to="/documents" className="mt-2 inline-block text-xs font-medium text-primary-600 no-underline hover:underline">
                  去上传文档
                </Link>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {documents.map((document) => (
                  <button
                    key={document.id}
                    onClick={() => setSelectedDocId(document.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                      selectedDocId === document.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                      selectedDocId === document.id ? 'bg-white text-primary-600' : 'bg-gray-50 text-gray-400'
                    )}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{document.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {document.word_count?.toLocaleString() || 0} 字 · {document.file_type.toUpperCase()}
                      </p>
                    </div>
                    {selectedDocId === document.id ? <Check className="h-4 w-4 shrink-0 text-primary-600" /> : null}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">Step 2</p>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">选择评审角色</h2>
              </div>
              <Badge variant="default">{selectedAgentIds.length}/5</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">还没有角色</p>
                <Link to="/agents" className="mt-2 inline-block text-xs font-medium text-primary-600 no-underline hover:underline">
                  去创建或添加角色
                </Link>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {agents.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id)
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                        isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      )}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{
                          backgroundColor: `${AGENT_COLORS[agent.color]}18`,
                          boxShadow: `0 0 0 1.5px ${AGENT_COLORS[agent.color]}`,
                        }}
                      >
                        {agent.avatar || agent.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">{agent.tagline}</p>
                      </div>
                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary-600" /> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-[24px] border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">{selectedAgents.length}</span> 位角色将并行参与评审，
          当前并发数设置为 <span className="font-medium text-gray-700">{config.maxConcurrentReviews ?? 1}</span>。
        </div>
        <Button onClick={handleStart} disabled={!canStart} size="lg">
          <Play className="h-4 w-4" />
          开始评审
        </Button>
      </div>
    </div>
  )
}
