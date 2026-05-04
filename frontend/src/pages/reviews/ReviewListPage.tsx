import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, Clock3, FileText, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_COLORS } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { formatTimeAgo } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'

function getScoreVariant(score?: number) {
  if (score == null) return 'default' as const
  if (score >= 4.2) return 'success' as const
  if (score >= 3.5) return 'warning' as const
  return 'danger' as const
}

export default function ReviewListPage() {
  const reviews = useReviewStore((state) => state.reviews)
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'in_progress'>('all')

  const filteredReviews = reviews.filter((review) => (activeTab === 'all' ? true : review.status === activeTab))
  const completedCount = reviews.filter((review) => review.status === 'completed').length
  const runningCount = reviews.filter((review) => review.status === 'in_progress').length
  const groupedReviews = useMemo(() => {
    const groups = new Map<string, { documentTitle: string; reviews: typeof filteredReviews }>()

    filteredReviews.forEach((review) => {
      const key = review.document_id
      const current = groups.get(key)
      if (current) {
        current.reviews.push(review)
        return
      }

      groups.set(key, {
        documentTitle: review.document?.title || '未命名文档',
        reviews: [review],
      })
    })

    return Array.from(groups.entries())
      .map(([documentId, group]) => ({
        documentId,
        documentTitle: group.documentTitle,
        reviews: group.reviews.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
      }))
      .sort((left, right) => new Date(right.reviews[0]?.created_at || 0).getTime() - new Date(left.reviews[0]?.created_at || 0).getTime())
  }, [filteredReviews])

  return (
    <div className="space-y-6 animate-slide-up">
      <section className="dm-page-header">
        <div>
          <span className="dm-kicker">
            <Sparkles className="h-3.5 w-3.5" />
            Review Center
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">评审大厅</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-600">
            所有评审记录都集中在这里。先看总体诊断，再进入报告页查看痛点、建议和角色分歧，必要时继续拉起聊天室深入讨论。
          </p>
        </div>

        <Link to="/reviews/create" className="no-underline">
          <Button>
            <Plus className="h-4 w-4" />
            发起评审
          </Button>
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="dm-hero-card rounded-[28px] px-6 py-6">
          <div className="relative z-[1]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">Review Snapshot</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">把最近的教研判断整理成可继续行动的结果。</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-gray-600">
              完成态报告适合看诊断和建议，进行中报告适合观察模型输出是否稳定。所有后续聊天室都应该从这里出发，而不是脱离评审结果空聊。
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="dm-panel rounded-2xl px-4 py-4">
            <p className="text-xs text-gray-500">全部评审</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{reviews.length}</p>
          </div>
          <div className="dm-panel rounded-2xl px-4 py-4">
            <p className="text-xs text-gray-500">已完成</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{completedCount}</p>
          </div>
          <div className="dm-panel rounded-2xl px-4 py-4">
            <p className="text-xs text-gray-500">进行中</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{runningCount}</p>
          </div>
        </div>
      </section>

      <Card className="rounded-[28px]">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">筛选记录</h2>
            <p className="mt-1 text-xs text-gray-500">先看完成态，再回头关注进行中评审是否需要取消或重跑。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all' as const, label: `全部 (${reviews.length})` },
              { key: 'completed' as const, label: `已完成 (${completedCount})` },
              { key: 'in_progress' as const, label: `进行中 (${runningCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  activeTab === tab.key
                    ? 'border-primary-200 bg-primary-50 text-primary-600'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {filteredReviews.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-base font-medium text-gray-500">
                {reviews.length === 0 ? '还没有评审记录' : '当前筛选条件下没有记录'}
              </p>
              <p className="mt-2 text-sm text-gray-400">先上传文档并发起评审，这里才会出现可读、可追踪的结果。</p>
              <Link to="/reviews/create" className="mt-5 inline-flex no-underline">
                <Button>
                  <Plus className="h-4 w-4" />
                  发起评审
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedReviews.map((group) => (
                <section key={group.documentId} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{group.documentTitle}</h3>
                      <p className="mt-1 text-xs text-gray-500">共 {group.reviews.length} 份评审记录，按时间倒序排列。</p>
                    </div>
                    <Badge variant="default">{group.reviews.length} 份评审</Badge>
                  </div>
                  <div className="space-y-3">
              {group.reviews.map((review) => (
                <Link
                  key={review.id}
                  to={review.compareReport ? `/reviews/compare/${review.id}` : `/reviews/${review.id}`}
                  className="block no-underline"
                >
                  <div className="dm-panel dm-panel-hover rounded-[28px] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-2xl bg-primary-50 p-3 text-primary-600 shadow-sm">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-gray-900">{review.document?.title || '未命名文档'}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant={review.status === 'completed' ? 'success' : 'warning'}>
                              {review.status === 'completed' ? '已完成' : '进行中'}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatTimeAgo(review.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {review.status === 'completed' && review.overall_score != null ? (
                        <div className="text-right">
                          <p className="text-4xl font-bold text-gray-900">{review.overall_score.toFixed(1)}</p>
                          <div className="mt-1 flex justify-end">
                            <Badge variant={getScoreVariant(review.overall_score)}>{review.overall_score >= 4.2 ? '表现较强' : review.overall_score >= 3.5 ? '仍可优化' : '重点修正'}</Badge>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {review.agent_reviews?.length ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="text-xs text-gray-500">参与角色</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {review.agent_reviews.map((agentReview) => (
                            <div key={agentReview.agent_id} className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2 py-1">
                              <div
                                className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                style={{ backgroundColor: `${AGENT_COLORS[agentReview.agent_color]}15`, boxShadow: `0 0 0 1.5px ${AGENT_COLORS[agentReview.agent_color]}` }}
                              >
                                {review.agents?.find((agent) => agent.id === agentReview.agent_id)?.avatar || agentReview.agent_name[0]}
                              </div>
                              <span className="text-xs text-gray-700">{agentReview.agent_name}</span>
                              {agentReview.score > 0 ? (
                                <span className="text-xs font-medium" style={{ color: AGENT_COLORS[agentReview.agent_color] }}>
                                  {agentReview.score.toFixed(1)}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {review.status === 'completed' && review.summary ? (
                      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                          <p className="text-xs font-medium text-emerald-700">多方共识</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{review.summary.consensus.length}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                          <p className="text-xs font-medium text-amber-700">争议点</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{review.summary.controversies.length}</p>
                        </div>
                        <div className="rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3">
                          <p className="text-xs font-medium text-primary-700">聚合建议</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{review.summary.top_suggestions.length}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                        <span className="inline-flex items-center gap-2 text-sm text-amber-600">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                          </span>
                          正在生成评审结果
                        </span>
                      </div>
                    )}

                    <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                      查看详情
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
