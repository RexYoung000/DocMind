import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, FileText, Loader2, Play, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { AGENT_COLORS, useAgentStore } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useAuthStore } from '@/stores/authStore'
import { isModelConfigValid, useSettingsStore } from '@/stores/settingsStore'
import { createFailedAgentReview, executeAgentReview, generateSummary } from '@/services/reviewEngine'
import { toast } from '@/components/ui/Toast'
import { createId } from '@/utils/id'
import { REVIEW_DIMENSIONS } from '@/types'
import type { AgentReview, Review } from '@/types'

const KAOMOJIS = [
  '(｀・ω・´)',
  '(ﾉ◕ヮ◕)ﾉ',
  '╰(*°▽°*)╯',
  '(•̀ᴗ•́)و',
  '(ง •̀_•́)ง',
  '(✿◠‿◠)',
  '٩(˘◡˘)۶',
  '(≧▽≦)',
]

const DIMENSION_META: { emoji: string; activeLabel: string; doneLabel: string }[] = [
  { emoji: '📐', activeLabel: '教学框架深度分析中...', doneLabel: '教学框架分析完毕' },
  { emoji: '🔗', activeLabel: '知识脉络梳理中...', doneLabel: '知识脉络梳理完毕' },
  { emoji: '🎯', activeLabel: '目标合理性评估中...', doneLabel: '目标合理性评估完毕' },
  { emoji: '📌', activeLabel: '重点内容核查中...', doneLabel: '重点内容核查完毕' },
  { emoji: '⚡', activeLabel: '难点突破策略审查中...', doneLabel: '难点突破策略审查完毕' },
  { emoji: '📈', activeLabel: '梯度设计评估中...', doneLabel: '梯度设计评估完毕' },
]

function DimensionProgress({ completed }: { completed: number }) {
  const [kaomojiIdx, setKaomojiIdx] = useState(() => Math.floor(Math.random() * KAOMOJIS.length))

  useEffect(() => {
    if (completed >= 6) return
    const timer = setInterval(() => {
      setKaomojiIdx((prev) => (prev + 1) % KAOMOJIS.length)
    }, 2000)
    return () => clearInterval(timer)
  }, [completed])

  return (
    <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2.5 font-mono text-xs">
      {REVIEW_DIMENSIONS.map((dim, i) => {
        const meta = DIMENSION_META[i]
        const isDone = i < completed
        const isActive = i === completed
        return (
          <div
            key={dim}
            className={cn(
              'flex items-start gap-2 transition-all duration-300',
              isDone ? 'text-emerald-600' : isActive ? 'text-primary-700' : 'text-gray-400 opacity-50'
            )}
          >
            <span className="shrink-0 select-none">
              {isDone ? '✅' : isActive ? '⚙️' : '⬜'}
            </span>
            <span className={cn(isDone && 'line-through decoration-emerald-400 decoration-1')}>
              {isDone
                ? `${meta.emoji} 〔${dim}〕${meta.doneLabel}`
                : isActive
                  ? `${meta.emoji} ${KAOMOJIS[kaomojiIdx]} 〔${dim}〕${meta.activeLabel}`
                  : `${meta.emoji} 〔${dim}〕等待中...`}
            </span>
          </div>
        )
      })}
    </div>
  )
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
  const [progress, setProgress] = useState<Record<string, { status: string; text: string; dimensionsCompleted: number }>>({})
  const [reviewId, setReviewId] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const dimTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const selectedDoc = documents.find((document) => document.id === selectedDocId)
  const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id))
  const successCount = Object.values(progress).filter((item) => item.status === 'done').length
  const failedCount = Object.values(progress).filter((item) => item.status === 'error').length

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

    const initialProgress: Record<string, { status: string; text: string; dimensionsCompleted: number }> = {}
    for (const agent of selectedAgents) {
      initialProgress[agent.id] = { status: 'pending', text: '', dimensionsCompleted: 0 }
    }
    setProgress(initialProgress)

    const maxConcurrent = config.maxConcurrentReviews ?? 1
    const results: (AgentReview | null)[] = new Array(selectedAgents.length).fill(null)

    const runAgent = async (agent: typeof selectedAgents[0], idx: number) => {
      setProgress((previous) => ({
        ...previous,
        [agent.id]: { status: 'reviewing', text: '', dimensionsCompleted: 0 },
      }))

      let dimCount = 0
      dimTimersRef.current[agent.id] = setInterval(() => {
        dimCount = Math.min(dimCount + 1, 5)
        setProgress((prev) => ({
          ...prev,
          [agent.id]: { ...prev[agent.id], dimensionsCompleted: dimCount },
        }))
      }, 4000)

      try {
        const result = await executeAgentReview(
          agent,
          selectedDoc,
          (text) => setProgress((previous) => ({
            ...previous,
            [agent.id]: { status: 'reviewing', text, dimensionsCompleted: previous[agent.id]?.dimensionsCompleted ?? 0 },
          })),
          abortRef.current!.signal,
        )

        results[idx] = result
        incrementUsage(agent.id)
        clearInterval(dimTimersRef.current[agent.id])
        setProgress((previous) => ({
          ...previous,
          [agent.id]: { status: 'done', text: '', dimensionsCompleted: 6 },
        }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '评审失败'
        results[idx] = createFailedAgentReview(agent, errorMessage)
        clearInterval(dimTimersRef.current[agent.id])
        setProgress((previous) => ({
          ...previous,
          [agent.id]: { status: 'error', text: errorMessage, dimensionsCompleted: 0 },
        }))
      }
    }

    // Semaphore concurrency pool: maxConcurrent workers share the agent queue
    const agentQueue = [...selectedAgents.entries()]
    let queueIdx = 0
    const worker = async () => {
      while (queueIdx < agentQueue.length) {
        const [idx, agent] = agentQueue[queueIdx++]
        await runAgent(agent, idx)
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, selectedAgents.length) }, worker))

    const finalResults = results.filter((r): r is AgentReview => r !== null)
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
      toast('success', `评审完成！已生成 ${finalResults.length} 份分析结果`)
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
      Object.values(dimTimersRef.current).forEach((t) => clearInterval(t))
    }
  }, [])

  if (phase === 'done') {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <Check className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          <h2 className="mb-2 text-xl font-bold text-gray-900">评审已结束</h2>
          <p className="mb-2 text-sm text-gray-600">
            《{selectedDoc?.title}》共选择了 {selectedAgents.length} 位角色
          </p>
          <p className="mb-4 text-sm text-gray-600">
            成功 {successCount} 位，失败 {failedCount} 位。报告页会完整展示全部结果状态。
          </p>
          <Link
            to={`/reviews/${reviewId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white no-underline hover:bg-primary-700"
          >
            查看评审报告
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'running') {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">评审进行中...</h1>
            <p className="text-sm text-gray-500">正在对《{selectedDoc?.title}》进行多角色评审</p>
          </div>
          <button
            onClick={() => {
              abortRef.current?.abort()
              Object.values(dimTimersRef.current).forEach((t) => clearInterval(t))
              toast('info', '评审已取消，已完成的结果将保留')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <XCircle className="h-4 w-4" />
            取消评审
          </button>
        </div>

        <div className="space-y-4">
          {selectedAgents.map((agent) => {
            const item = progress[agent.id]
            const isReviewing = item?.status === 'reviewing'
            const isDone = item?.status === 'done'
            const isError = item?.status === 'error'
            const isPending = !item || item.status === 'pending'
            const borderColor = AGENT_COLORS[agent.color]

            return (
              <div
                key={agent.id}
                className={cn(
                  'rounded-xl border bg-white p-5 shadow-sm transition-all duration-500',
                  isDone ? 'border-emerald-200' : isError ? 'border-red-200' : 'border-gray-200'
                )}
                style={{ borderLeftColor: isDone ? '#22C55E' : isError ? '#EF4444' : borderColor, borderLeftWidth: '3px' }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full text-xl transition-all',
                      isDone && 'scale-110'
                    )}
                    style={{ backgroundColor: `${borderColor}15` }}
                  >
                    {agent.avatar || agent.name[0]}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-xs text-gray-500">{agent.tagline}</p>
                  </div>
                  {isPending && (
                    <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2.5 py-1">准备中...</span>
                  )}
                  {isReviewing && <Loader2 className="h-5 w-5 animate-spin text-primary-500" />}
                  {isDone && <Check className="h-5 w-5 text-emerald-500" />}
                  {isError && <span className="text-xs text-red-500 font-medium">生成失败</span>}
                </div>

                {isReviewing && (
                  <DimensionProgress
                    completed={item?.dimensionsCompleted || 0}
                  />
                )}

                {isDone && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>评审完成，正在等待其他角色...</span>
                  </div>
                )}

                {isError && item?.text && (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                    {item.text}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> 返回评审大厅
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">发起评审</h1>

      {!hasValidConfig && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          请先到 <Link to="/settings" className="font-medium underline">设置页面</Link> 配置有效的 API Key 和模型，才能开始评审。
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">1. 选择文档</h2>
          {documents.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">还没有就绪的文档</p>
              <Link to="/documents" className="mt-2 inline-block text-xs font-medium text-primary-600 no-underline hover:underline">
                去上传文档
              </Link>
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {documents.map((document) => (
                <button
                  key={document.id}
                  onClick={() => setSelectedDocId(document.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    selectedDocId === document.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50',
                  )}
                >
                  <FileText className={cn('h-5 w-5 shrink-0', selectedDocId === document.id ? 'text-primary-600' : 'text-gray-400')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{document.title}</p>
                    <p className="text-xs text-gray-500">{document.word_count?.toLocaleString()} 字 · {document.file_type.toUpperCase()}</p>
                  </div>
                  {selectedDocId === document.id && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">2. 选择评审角色</h2>
          <p className="mb-4 text-xs text-gray-500">最多选择 5 个 ({selectedAgentIds.length}/5)</p>
          {agents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">还没有角色</p>
              <Link to="/agents" className="mt-2 inline-block text-xs font-medium text-primary-600 no-underline hover:underline">
                去创建或添加角色
              </Link>
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {agents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                    )}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                      style={{
                        backgroundColor: `${AGENT_COLORS[agent.color]}15`,
                        boxShadow: `0 0 0 1.5px ${AGENT_COLORS[agent.color]}`,
                      }}
                    >
                      {agent.avatar || agent.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                      <p className="text-xs text-gray-500">{agent.tagline}</p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          开始评审 ({selectedAgentIds.length} 位角色)
        </button>
      </div>
    </div>
  )
}
