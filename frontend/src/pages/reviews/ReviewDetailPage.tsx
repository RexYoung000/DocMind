import { useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, ClipboardCheck, Copy, Download, Lightbulb, MessageCircle, RefreshCw, Users, XCircle } from 'lucide-react'
import { AGENT_COLORS } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { RadarChart } from '@/components/ui/RadarChart'
import { REVIEW_DIMENSIONS } from '@/types'

const PRIORITY_STYLES = {
  high: { label: '高', color: 'bg-red-50 text-red-600 border-red-200' },
  medium: { label: '中', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  low: { label: '低', color: 'bg-green-50 text-green-600 border-green-200' },
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
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-500">评审记录不存在或已被删除</p>
          <Link to="/reviews" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-primary-700">
            返回评审大厅
          </Link>
        </div>
      </div>
    )
  }

  if (review.status === 'in_progress') {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> 返回评审大厅
        </Link>
        <div className="rounded-xl border border-primary-200 bg-primary-50/50 py-16 text-center">
          <RefreshCw className="mx-auto mb-3 h-12 w-12 text-primary-400 animate-spin" />
          <p className="font-medium text-gray-700">评审正在进行中...</p>
          <p className="mt-2 text-sm text-gray-500">角色正在分析文档，请稍候。</p>
          <Link to="/reviews" className="mt-4 inline-block rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 no-underline hover:bg-gray-50">
            返回评审大厅
          </Link>
        </div>
      </div>
    )
  }

  const agentReviews = review.agent_reviews || []
  const completedReviews = agentReviews.filter((item) => item.status !== 'failed')
  const failedReviews = agentReviews.filter((item) => item.status === 'failed')
  const consensus = review.summary?.consensus || []
  const controversies = review.summary?.controversies || []
  const allSuggestions = completedReviews.flatMap((item) => item.suggestions)
  const docTitle = review.document?.title || '未知文档'

  const teacherReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return !agent?.category || agent.category === 'analyst'
  })
  const studentReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return agent?.category === 'engineer'
  })
  const parentReviews = completedReviews.filter((item) => {
    const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
    return agent?.category === 'creative'
  })

  const radarDatasets = useMemo(() => completedReviews.map((item) => {
    const dimensionMap = new Map(item.dimensions.map((dimension) => [dimension.name, dimension.score]))
    return {
      label: item.agent_name,
      color: item.agent_color,
      scores: REVIEW_DIMENSIONS.map((dimension) => dimensionMap.get(dimension) || 0),
    }
  }), [completedReviews])

  const avgDimScores = useMemo(() => REVIEW_DIMENSIONS.map((dimension) => {
    const scores = completedReviews.map((item) => {
      const found = item.dimensions.find((entry) => entry.name === dimension)
      return found?.score || 0
    })

    if (scores.length === 0) {
      return { name: dimension, avg: 0, min: 0, max: 0 }
    }

    return {
      name: dimension,
      avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
    }
  }), [completedReviews])

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

    if (completedReviews.length > 0) {
      lines.push(
        '## 六维度评分汇总',
        '',
        '| 维度 | 平均分 | 最低分 | 最高分 |',
        '|------|--------|--------|--------|',
        ...avgDimScores.map((item) => `| ${item.name} | ${item.avg.toFixed(1)} | ${item.min.toFixed(1)} | ${item.max.toFixed(1)} |`),
        '',
      )
    }

    if (completedReviews.length > 0) {
      lines.push('## 成功生成的角色分析', '')
      lines.push(...completedReviews.flatMap((item) => [
        `### ${item.agent_name} - ${item.score.toFixed(1)} 分`,
        '',
        item.opinion,
        '',
        '**维度评分：**',
        ...item.dimensions.map((dimension) => `- ${dimension.name}: ${dimension.score.toFixed(1)}/5${dimension.comment ? ` - ${dimension.comment}` : ''}`),
        '',
        '**修改建议：**',
        ...(item.suggestions.length > 0
          ? item.suggestions.map((suggestion) => `- [${suggestion.priority === 'high' ? '高' : suggestion.priority === 'medium' ? '中' : '低'}] ${suggestion.content}${suggestion.adopted ? ' ✅已采纳' : ''}`)
          : ['- 暂无']),
        '',
      ]))
    }

    if (failedReviews.length > 0) {
      lines.push('## 生成失败的角色', '')
      lines.push(...failedReviews.flatMap((item) => [
        `### ${item.agent_name}`,
        '',
        '- **状态**：生成失败',
        `- **原因**：${item.error_message || '未返回错误信息'}`,
        '',
      ]))
    }

    if (consensus.length > 0) {
      lines.push('## 多方共识', '', ...consensus.map((item) => `- ${item}`), '')
    }

    if (controversies.length > 0) {
      lines.push('## 争议观点', '')
      lines.push(...controversies.flatMap((item) => [
        `### ${item.topic}`,
        ...item.opinions.map((opinion) => `- **${opinion.agent_name}**：${opinion.stance}`),
        '',
      ]))
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

  const renderAgentCards = (items: typeof completedReviews, title: string, icon: string) => {
    if (items.length === 0) return null

    return (
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="text-base">{icon}</span> {title} ({items.length})
        </h3>
        <div className="space-y-4">
          {items.map((item) => {
            const agent = review.agents?.find((candidate) => candidate.id === item.agent_id)
            return (
              <div
                key={item.agent_id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                style={{ borderLeftColor: AGENT_COLORS[item.agent_color], borderLeftWidth: '3px' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-lg"
                      style={{ backgroundColor: `${AGENT_COLORS[item.agent_color]}15` }}
                    >
                      {agent?.avatar || item.agent_name[0]}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900">{item.agent_name}</span>
                      {agent?.focusDimension && (
                        <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                          {agent.focusDimension}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xl font-bold" style={{ color: AGENT_COLORS[item.agent_color] }}>
                    {item.score.toFixed(1)}
                  </span>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.opinion}</p>
                <div className="space-y-1.5">
                  {item.dimensions.map((dimension) => (
                    <div key={dimension.name} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 text-gray-500">{dimension.name}</span>
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${dimension.score * 20}%`, backgroundColor: AGENT_COLORS[item.agent_color] }}
                        />
                      </div>
                      <span className="w-6 text-right text-gray-500">{dimension.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">《{docTitle}》教研评审报告</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            共 {agentReviews.length} 位角色，其中成功 {completedReviews.length} 位，失败 {failedReviews.length} 位
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateChat}
            className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-100"
          >
            <MessageCircle className="h-4 w-4" /> 教研研讨
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> 下载 Markdown 报告
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Copy className="h-4 w-4" /> 复制
          </button>
          <Link
            to={`/reviews/create?doc=${review.document_id}`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 no-underline hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> 重新评审
          </Link>
        </div>
      </div>

      {failedReviews.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-red-700">
            <XCircle className="h-5 w-5" /> 生成失败的角色 ({failedReviews.length})
          </h2>
          <div className="space-y-2">
            {failedReviews.map((item) => (
              <div key={item.agent_id} className="rounded-lg border border-red-100 bg-white/70 p-3 text-sm text-red-700">
                <p className="font-medium">{item.agent_name}</p>
                <p className="mt-1 text-xs text-red-600">{item.error_message || '未返回错误信息'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {review.overall_score != null && completedReviews.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="mb-2 text-sm text-gray-500">综合评分</p>
            <p className="text-5xl font-bold text-gray-900">{review.overall_score.toFixed(1)}</p>
            <div className="mt-1 text-2xl text-yellow-500">
              {'★'.repeat(Math.max(1, Math.round(review.overall_score)))}
              {'☆'.repeat(5 - Math.max(1, Math.round(review.overall_score)))}
            </div>
            <p className="mt-3 text-sm text-gray-500">
              成功分析 {completedReviews.length} 份 · 共识 {consensus.length} 个 · 争议 {controversies.length} 个 · 建议 {allSuggestions.length} 条
            </p>
            <div className="mt-4 space-y-1.5">
              {avgDimScores.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-right text-gray-500">{item.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${item.avg * 20}%` }} />
                  </div>
                  <span className="w-6 text-right font-medium text-gray-600">{item.avg.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {radarDatasets.length > 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">六维度雷达图对比</p>
            <RadarChart datasets={radarDatasets} size={300} />
          </div>
        )}
      </div>

      {completedReviews.length > 0 && (
        <div className="space-y-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Users className="h-5 w-5 text-primary-500" /> 各角色评审观点
          </h2>

          {renderAgentCards(teacherReviews, '分析师视角', '📊')}
          {renderAgentCards(studentReviews, '工程师视角', '⚙️')}
          {renderAgentCards(parentReviews, '创意视角', '🎨')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {consensus.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h3 className="mb-3 text-base font-semibold text-gray-900">多方共识 ({consensus.length})</h3>
              <div className="space-y-2">
                {consensus.map((item, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {controversies.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
              <h3 className="mb-3 text-base font-semibold text-gray-900">争议观点 ({controversies.length})</h3>
              {controversies.map((item, index) => (
                <div key={index} className="mb-3 space-y-2 last:mb-0">
                  <p className="text-sm font-medium text-gray-800">{item.topic}</p>
                  {item.opinions.map((opinion) => (
                    <div key={`${item.topic}-${opinion.agent_name}`} className="rounded-lg bg-white/70 p-2.5 text-sm">
                      <span className="font-medium" style={{ color: AGENT_COLORS[opinion.agent_color] }}>
                        {opinion.agent_name}:
                      </span>{' '}
                      <span className="text-gray-600">{opinion.stance}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {allSuggestions.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Lightbulb className="h-5 w-5 text-amber-500" /> 优化建议 ({allSuggestions.length})
            </h3>
            <div className="space-y-2">
              {allSuggestions.map((suggestion) => {
                const priority = PRIORITY_STYLES[suggestion.priority]
                return (
                  <div key={suggestion.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50">
                    <span className={cn('rounded border px-1.5 py-0.5 text-xs font-medium', priority.color)}>
                      {priority.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm text-gray-700', suggestion.adopted && 'line-through text-gray-400')}>
                        {suggestion.content}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">来自 {suggestion.source_agent}</p>
                    </div>
                    <button
                      onClick={() => toggleSuggestionAdopted(review.id, suggestion.id)}
                      className={cn(
                        'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                        suggestion.adopted
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      {suggestion.adopted ? '已采纳' : '采纳'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
