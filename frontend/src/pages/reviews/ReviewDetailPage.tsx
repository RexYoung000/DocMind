import { useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  Lightbulb,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
  XCircle,
} from 'lucide-react'
import { AGENT_COLORS } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { RadarChart } from '@/components/ui/RadarChart'
import { TEACHING_DIMENSIONS } from '@/types'
import type { AgentReview, Suggestion } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'

const PRIORITY_STYLES = {
  high: { label: '高优先', badge: 'danger' as const, color: 'bg-red-50 text-red-600 border-red-200' },
  medium: { label: '中优先', badge: 'warning' as const, color: 'bg-amber-50 text-amber-600 border-amber-200' },
  low: { label: '低优先', badge: 'success' as const, color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
} as const

function buildSuggestionKey(suggestion: Suggestion) {
  return `${suggestion.title || ''}|${suggestion.content}`.toLowerCase().replace(/\s+/g, '')
}

function dedupeSuggestions(items: Suggestion[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = buildSuggestionKey(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function getScoreTone(score?: number) {
  if (score == null) return 'default' as const
  if (score >= 4.2) return 'success' as const
  if (score >= 3.5) return 'warning' as const
  return 'danger' as const
}

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const review = useReviewStore((state) => state.reviews.find((item) => item.id === id))
  const toggleSuggestionAdopted = useReviewStore((state) => state.toggleSuggestionAdopted)

  if (!review) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> 返回评审大厅
        </Link>
        <Card className="rounded-[28px]">
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-500">评审记录不存在或已被删除</p>
            <Link to="/reviews" className="mt-4 inline-flex no-underline">
              <Button>返回评审大厅</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (review.status === 'in_progress') {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> 返回评审大厅
        </Link>
        <div className="dm-review-stage-card rounded-[30px] p-[1px]">
          <div className="rounded-[29px] bg-white/96 px-8 py-16 text-center backdrop-blur-xl">
            <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-primary-500" />
            <h2 className="text-xl font-bold text-gray-900">评审正在进行中</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-600">
              角色正在逐步分析文档，建议稍后回来查看完整报告，或返回大厅观察其它评审任务。
            </p>
            <Link to="/reviews" className="mt-6 inline-flex no-underline">
              <Button variant="secondary">返回评审大厅</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const agentReviews = review.agent_reviews || []
  const completedReviews = agentReviews.filter((item) => item.status !== 'failed')
  const failedReviews = agentReviews.filter((item) => item.status === 'failed')
  const summary = review.summary
  const consensus = summary?.consensus || []
  const controversies = summary?.controversies || []
  const docTitle = review.document?.title || '未知文档'
  const allSuggestions = dedupeSuggestions(completedReviews.flatMap((item) => item.suggestions))
  const prioritySuggestions = dedupeSuggestions(summary?.top_suggestions?.length ? summary.top_suggestions : allSuggestions).slice(0, 10)
  const strengths = (summary?.strengths || []).slice(0, 4)
  const painPoints = (summary?.pain_points || []).slice(0, 4)

  const teacherReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return !agent?.category || agent.category === 'teacher'
  })
  const studentReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return agent?.category === 'student'
  })
  const parentReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return agent?.category === 'parent'
  })

  const radarDatasets = useMemo(
    () =>
      completedReviews.map((item) => {
        const dimensionMap = new Map(item.dimensions.map((dimension) => [dimension.name, dimension.score]))
        return {
          label: item.agent_name,
          color: item.agent_color,
          scores: TEACHING_DIMENSIONS.map((dimension) => dimensionMap.get(dimension) || 0),
        }
      }),
    [completedReviews]
  )

  const avgDimScores = useMemo(
    () =>
      TEACHING_DIMENSIONS.map((dimension) => {
        const scores = completedReviews.map((item) => item.dimensions.find((entry) => entry.name === dimension)?.score || 0)

        if (!scores.length) {
          return { name: dimension, avg: 0, min: 0, max: 0 }
        }

        return {
          name: dimension,
          avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
          min: Math.min(...scores),
          max: Math.max(...scores),
        }
      }),
    [completedReviews]
  )

  const buildReportMarkdown = () => {
    const lines = [
      `# 《${docTitle}》教研评审报告`,
      '',
      `- **评审时间**：${new Date(review.created_at).toLocaleDateString('zh-CN')}`,
      `- **参与角色总数**：${agentReviews.length}`,
      `- **成功生成**：${completedReviews.length}`,
      `- **生成失败**：${failedReviews.length}`,
      `- **综合评分**：${review.overall_score?.toFixed(1) || '-'}`,
      '',
    ]

    if (summary?.overview) {
      lines.push('## 总体诊断', '', summary.overview, '')
    }

    if (strengths.length > 0) {
      lines.push('## 核心亮点', '', ...strengths.map((item) => `- ${item}`), '')
    }

    if (painPoints.length > 0) {
      lines.push('## 关键痛点', '', ...painPoints.map((item) => `- ${item}`), '')
    }

    if (completedReviews.length > 0) {
      lines.push(
        '## 六维度评分概览',
        '',
        '| 维度 | 平均分 | 最低分 | 最高分 |',
        '|------|--------|--------|--------|',
        ...avgDimScores.map((item) => `| ${item.name} | ${item.avg.toFixed(1)} | ${item.min.toFixed(1)} | ${item.max.toFixed(1)} |`),
        ''
      )
    }

    if (prioritySuggestions.length > 0) {
      lines.push('## 优先优化建议', '')
      lines.push(
        ...prioritySuggestions.flatMap((suggestion, index) => [
          `### ${index + 1}. ${suggestion.title || '建议'}`,
          '',
          `- **优先级**：${PRIORITY_STYLES[suggestion.priority].label}`,
          `- **内容**：${suggestion.content}`,
          `- **来源**：${suggestion.source_agent}`,
          ...(suggestion.evidence ? [`- **证据**：${suggestion.evidence}`] : []),
          ...(suggestion.expected_effect ? [`- **预期收益**：${suggestion.expected_effect}`] : []),
          '',
        ])
      )
    }

    if (consensus.length > 0) {
      lines.push('## 多方共识', '', ...consensus.map((item) => `- ${item}`), '')
    }

    if (controversies.length > 0) {
      lines.push('## 争议点', '')
      lines.push(
        ...controversies.flatMap((item) => [
          `### ${item.topic}`,
          ...item.opinions.map((opinion) => `- **${opinion.agent_name}**：${opinion.stance}`),
          '',
        ])
      )
    }

    if (completedReviews.length > 0) {
      lines.push('## 分角色评审观点', '')
      lines.push(
        ...completedReviews.flatMap((item) => [
          `### ${item.agent_name} - ${item.score.toFixed(1)} 分`,
          '',
          item.opinion,
          '',
          '**维度评分**',
          ...item.dimensions.map((dimension) =>
            `- ${dimension.name}: ${dimension.score.toFixed(1)}/5${dimension.comment ? ` - ${dimension.comment}` : ''}`
          ),
          '',
          ...(item.highlights?.length ? ['**亮点**', ...item.highlights.map((highlight) => `- ${highlight}`), ''] : []),
        ])
      )
    }

    if (failedReviews.length > 0) {
      lines.push('## 生成失败角色', '')
      lines.push(
        ...failedReviews.flatMap((item) => [
          `### ${item.agent_name}`,
          '',
          `- **原因**：${item.error_message || '未返回错误信息'}`,
          '',
        ])
      )
    }

    return lines.join('\n')
  }

  const handleExport = () => {
    const text = buildReportMarkdown()
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `教研评审报告_${docTitle}_${new Date(review.created_at).toLocaleDateString('zh-CN')}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast('success', '教研评审报告已下载')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildReportMarkdown())
      toast('success', '评审报告已复制到剪贴板')
    } catch {
      toast('error', '复制失败，请手动复制')
    }
  }

  const handleCreateChat = () => {
    navigate(`/chat?review=${review.id}`)
  }

  const renderAgentCards = (items: AgentReview[], title: string, icon: string) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <Badge variant="default">{items.length}</Badge>
        </div>

        <div className="space-y-4">
          {items.map((item) => {
            const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)

            return (
              <Card
                key={item.agent_id}
                className="rounded-[24px]"
                style={{ borderLeftColor: AGENT_COLORS[item.agent_color], borderLeftWidth: '3px' }}
              >
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: `${AGENT_COLORS[item.agent_color]}15` }}
                      >
                        {agent?.avatar || item.agent_name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{item.agent_name}</p>
                          {agent?.focusDimension ? <Badge variant="warning">{agent.focusDimension}</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{agent?.tagline || '角色评审视角'}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: AGENT_COLORS[item.agent_color] }}>
                        {item.score.toFixed(1)}
                      </p>
                      <Badge variant={getScoreTone(item.score)}>角色评分</Badge>
                    </div>
                  </div>

                  <p className="mb-4 whitespace-pre-wrap text-sm leading-7 text-gray-700">{item.opinion}</p>

                  {item.highlights?.length ? (
                    <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">角色提炼亮点</p>
                      <div className="space-y-1.5">
                        {item.highlights.slice(0, 3).map((highlight) => (
                          <p key={highlight} className="text-sm text-gray-700">{highlight}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    {item.dimensions.map((dimension) => (
                      <div key={dimension.name} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{dimension.name}</span>
                          <span className="text-gray-500">{dimension.score.toFixed(1)}/5</span>
                        </div>
                        <div className="mb-3 h-1.5 rounded-full bg-white">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${dimension.score * 20}%`, backgroundColor: AGENT_COLORS[item.agent_color] }}
                          />
                        </div>
                        {dimension.comment ? <p className="text-xs leading-6 text-gray-600">{dimension.comment}</p> : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
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

      <section className="dm-hero-card rounded-[30px] px-6 py-6 sm:px-8 dm-stage-reveal" style={{ ['--reveal-delay' as string]: '0ms' }}>
        <div className="relative z-[1] space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="dm-kicker">
                <Sparkles className="h-3.5 w-3.5" />
                Review Report Ready
              </span>
              <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                《{docTitle}》教研评审报告
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
                这不是一堆零散意见，而是从多角色分析中压缩出的结果阅读态。先看总体诊断和关键痛点，再往下读建议、共识、争议和分角色细评。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreateChat}>
                <MessageCircle className="h-4 w-4" />
                教研研讨
              </Button>
              <Button variant="secondary" onClick={handleExport}>
                <Download className="h-4 w-4" />
                下载 Markdown
              </Button>
              <Button variant="secondary" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                复制
              </Button>
              <Link to={`/reviews/create?doc=${review.document_id}`} className="no-underline">
                <Button variant="secondary">
                  <RefreshCw className="h-4 w-4" />
                  重新评审
                </Button>
              </Link>
            </div>
          </div>

          {summary?.overview ? (
            <div className="rounded-[24px] border border-primary-100 bg-white/76 px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">总体诊断</p>
              <p className="mt-2 text-sm leading-7 text-gray-700">{summary.overview}</p>
            </div>
          ) : null}
        </div>
      </section>

      {failedReviews.length > 0 ? (
        <section className="rounded-[28px] border border-red-200 bg-red-50/70 p-5 dm-stage-reveal" style={{ ['--reveal-delay' as string]: '80ms' }}>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-red-700">
            <XCircle className="h-5 w-5" />
            生成失败角色 ({failedReviews.length})
          </h2>
          <div className="space-y-2">
            {failedReviews.map((item) => (
              <div key={item.agent_id} className="rounded-2xl border border-red-100 bg-white/70 p-3 text-sm text-red-700">
                <p className="font-medium">{item.agent_name}</p>
                <p className="mt-1 text-xs text-red-600">{item.error_message || '未返回错误信息'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr] dm-stage-reveal" style={{ ['--reveal-delay' as string]: '120ms' }}>
        <Card className="rounded-[28px]">
          <CardContent className="p-6">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Scoreboard</p>
                <p className="mt-2 text-5xl font-bold text-gray-900">{review.overall_score?.toFixed(1) || '-'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={getScoreTone(review.overall_score)}>{review.overall_score && review.overall_score >= 4.2 ? '诊断成熟' : review.overall_score && review.overall_score >= 3.5 ? '可继续强化' : '优先修正'}</Badge>
                  <Badge variant="default">成功 {completedReviews.length}</Badge>
                  <Badge variant="default">失败 {failedReviews.length}</Badge>
                </div>
                <div className="rounded-[24px] border border-gray-100 bg-gray-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Quick Read</p>
                  <div className="mt-3 space-y-2">
                    {(painPoints.slice(0, 2).length ? painPoints.slice(0, 2) : ['当前报告已经生成，可继续查看下方建议与分角色判断。']).map((item) => (
                      <p key={item} className="text-sm leading-7 text-gray-700">{item}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-gray-100 bg-gray-50/80 p-4">
                <p className="mb-3 text-sm font-semibold text-gray-700">六维度均值</p>
                <div className="space-y-2">
                  {avgDimScores.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 text-right text-gray-500">{item.name}</span>
                      <div className="h-2 flex-1 rounded-full bg-white">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${item.avg * 20}%` }} />
                      </div>
                      <span className="w-6 text-right font-medium text-gray-600">{item.avg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-white px-3 py-3">
                    <p className="text-[11px] text-gray-500">共识</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{consensus.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3">
                    <p className="text-[11px] text-gray-500">争议</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{controversies.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3">
                    <p className="text-[11px] text-gray-500">建议</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{prioritySuggestions.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {radarDatasets.length > 0 ? (
          <Card className="rounded-[28px]">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <p className="mb-3 text-sm font-semibold text-gray-700">六维度雷达图对比</p>
              <RadarChart datasets={radarDatasets} size={300} />
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 dm-stage-reveal" style={{ ['--reveal-delay' as string]: '180ms' }}>
        <Card className="rounded-[28px] border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              核心亮点
            </h2>
            <div className="space-y-2">
              {(strengths.length ? strengths : ['暂无明确亮点汇总']).map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-amber-200 bg-amber-50/50">
          <CardContent className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              关键痛点
            </h2>
            <div className="space-y-2">
              {(painPoints.length ? painPoints : ['暂无明确痛点汇总']).map((item) => (
                <p key={item} className="text-sm leading-7 text-gray-700">{item}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-primary-200 bg-primary-50/50">
          <CardContent className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Users className="h-5 w-5 text-primary-500" />
              多角色结论
            </h2>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">共识</p>
                <div className="space-y-1.5">
                  {(consensus.length ? consensus : ['暂无明显共识']).map((item) => (
                    <p key={item} className="text-sm leading-6 text-gray-700">{item}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">争议</p>
                <div className="space-y-1.5">
                  {(controversies.length
                    ? controversies.map((item) => `${item.topic}：${item.opinions.map((opinion) => `${opinion.agent_name}认为${opinion.stance}`).join('；')}`)
                    : ['暂无明显争议']).map((item) => (
                    <p key={item} className="text-sm leading-6 text-gray-700">{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {prioritySuggestions.length > 0 ? (
        <section className="dm-stage-reveal" style={{ ['--reveal-delay' as string]: '240ms' }}>
          <Card className="rounded-[28px]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">优先优化建议</h2>
                    <p className="mt-1 text-xs text-gray-500">这里保留的是压缩后的高价值建议，不追求数量，追求可执行。</p>
                  </div>
                </div>
                <Badge variant="default">{prioritySuggestions.length} 条</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {prioritySuggestions.map((suggestion) => {
                  const priority = PRIORITY_STYLES[suggestion.priority]

                  return (
                    <div key={suggestion.id} className="rounded-[24px] border border-gray-100 p-4 transition-colors hover:bg-gray-50">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-gray-900">{suggestion.title || '建议'}</p>
                          <p className="mt-1 text-xs text-gray-400">来自 {suggestion.source_agent}</p>
                        </div>
                        <Badge variant={priority.badge}>{priority.label}</Badge>
                      </div>

                      <p className={cn('text-sm leading-7 text-gray-700', suggestion.adopted && 'line-through text-gray-400')}>
                        {suggestion.content}
                      </p>

                      {suggestion.evidence ? (
                        <div className="mt-3 rounded-2xl bg-gray-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">证据</p>
                          <p className="mt-1 text-sm leading-7 text-gray-600">{suggestion.evidence}</p>
                        </div>
                      ) : null}

                      {suggestion.expected_effect ? (
                        <div className="mt-3 rounded-2xl bg-primary-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-600">预期收益</p>
                          <p className="mt-1 text-sm leading-7 text-gray-700">{suggestion.expected_effect}</p>
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        <Button
                          variant={suggestion.adopted ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => toggleSuggestionAdopted(review.id, suggestion.id)}
                        >
                          {suggestion.adopted ? '已采纳' : '采纳'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {completedReviews.length > 0 ? (
        <section className="space-y-6 dm-stage-reveal" style={{ ['--reveal-delay' as string]: '300ms' }}>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">各角色评审观点</h2>
          </div>

          {renderAgentCards(teacherReviews, '教师视角', '👩‍🏫')}
          {renderAgentCards(studentReviews, '学生视角', '🧑‍🎓')}
          {renderAgentCards(parentReviews, '家长视角', '👨‍👩‍👧')}
        </section>
      ) : null}
    </div>
  )
}
