import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  Clock3,
  FileText,
  MessageCircle,
  Sparkles,
  Star,
  Trophy,
  Upload,
} from 'lucide-react'
import { OnboardingGuide } from '@/components/ui/OnboardingGuide'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useDocumentStore } from '@/stores/documentStore'
import { AGENT_COLORS, useAgentStore } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useChatStore } from '@/stores/chatStore'
import { useActivityStore, type Activity } from '@/stores/activityStore'
import { formatTimeAgo } from '@/utils/format'

const QUICK_ACTIONS = [
  {
    icon: Upload,
    label: '上传教研案',
    description: '支持 PDF、Word、Markdown 和 TXT，上传后会自动解析教学要素。',
    path: '/documents',
    badge: '文档入口',
    tone: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Bot,
    label: '新增角色',
    description: '从模板挑选，或创建更适合你学科场景的评审角色。',
    path: '/agents',
    badge: '角色配置',
    tone: 'bg-violet-50 text-violet-600',
  },
  {
    icon: ClipboardCheck,
    label: '发起评审',
    description: '多角色并行分析文档，生成共识、争议点与改进建议。',
    path: '/reviews/create',
    badge: '核心流程',
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: MessageCircle,
    label: '进入研讨',
    description: '围绕文档和评审结论继续讨论，让角色主动推进重点问题。',
    path: '/chat',
    badge: '讨论空间',
    tone: 'bg-amber-50 text-amber-600',
  },
]

const TYPE_DOT: Record<Activity['type'], string> = {
  review: 'bg-emerald-500',
  upload: 'bg-blue-500',
  agent: 'bg-violet-500',
  chat: 'bg-amber-500',
}

function getReviewTone(score?: number) {
  if (score == null) {
    return 'default' as const
  }

  if (score >= 4.2) {
    return 'success' as const
  }

  if (score >= 3.5) {
    return 'warning' as const
  }

  return 'danger' as const
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const documents = useDocumentStore((state) => state.documents)
  const agents = useAgentStore((state) => state.agents)
  const reviews = useReviewStore((state) => state.reviews)
  const rooms = useChatStore((state) => state.rooms)
  const activities = useActivityStore((state) => state.activities)

  const completedReviews = reviews.filter((review) => review.status === 'completed')
  const readyDocuments = documents.filter((document) => document.status === 'ready')
  const activeRooms = rooms.filter((room) => room.status === 'active')
  const recentReviews = completedReviews.slice(0, 5)
  const recentActivities = activities.slice(0, 6)
  const agentRanking = [...agents].sort((left, right) => right.usage_count - left.usage_count).slice(0, 5)

  const insightCards = [
    {
      label: '就绪文档',
      value: readyDocuments.length,
      meta: `${documents.length} 份总文档`,
      icon: FileText,
    },
    {
      label: '评审完成',
      value: completedReviews.length,
      meta: `${reviews.length} 次评审流程`,
      icon: ClipboardCheck,
    },
    {
      label: '活跃研讨',
      value: activeRooms.length,
      meta: `${rooms.length} 个聊天室`,
      icon: MessageCircle,
    },
    {
      label: '角色储备',
      value: agents.length,
      meta: `${agents.filter((agent) => agent.source === 'template').length} 个模板角色`,
      icon: Bot,
    },
  ]

  return (
    <div className="space-y-6 animate-slide-up">
      <OnboardingGuide />

      <section className="dm-hero-card rounded-[28px] px-6 py-6 sm:px-8">
        <div className="relative z-[1] space-y-5">
          <span className="dm-kicker">
            <Sparkles className="h-3.5 w-3.5" />
            DocMind Workspace
          </span>

          <div className="space-y-3">
            <div>
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {user?.name || '体验用户'}，今天先处理最有价值的教学问题。
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600 sm:text-[15px]">
                先上传教研案，再让不同角色从目标、难点、课堂节奏和学生理解这些角度给出更深的判断。完成评审后，可直接进入聊天室继续推进争议点。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="primary">专业判断</Badge>
              <Badge variant="info">多角色视角</Badge>
              <Badge variant="warning">研讨推进</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.label}
                  to={action.path}
                  className="dm-panel dm-panel-hover rounded-2xl p-4 no-underline"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className={cn('rounded-2xl p-3 shadow-sm', action.tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="default" className="bg-white/80">
                      {action.badge}
                    </Badge>
                  </div>
                  <h2 className="text-base font-semibold text-gray-900">{action.label}</h2>
                  <p className="mt-2 text-xs leading-6 text-gray-500">{action.description}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                    进入
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-2xl">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">角色使用排行</h2>
                <p className="mt-1 text-xs text-gray-500">哪些角色被最频繁地调用，说明它们更贴近当前研讨需求。</p>
              </div>
            </div>
            <Link to="/agents" className="text-xs font-medium text-primary-600 no-underline">
              管理角色
            </Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {agentRanking.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bot className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">还没有角色使用数据</p>
                <p className="mt-1 text-xs text-gray-400">发起评审或进入聊天室后，这里会显示最常用的角色。</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {agentRanking.map((agent, index) => {
                  const accent = AGENT_COLORS[agent.color]
                  return (
                    <Link
                      key={agent.id}
                      to="/agents"
                      className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-gray-50 no-underline"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                        {index + 1}
                      </div>
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm"
                        style={{ backgroundColor: `${accent}18`, boxShadow: `0 0 0 1.5px ${accent}` }}
                      >
                        {agent.avatar || agent.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{agent.name}</p>
                        <p className="truncate text-xs text-gray-500">{agent.tagline}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Star className="h-3.5 w-3.5 text-amber-400" />
                        {agent.usage_count} 次
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">最近评审</h2>
                <p className="mt-1 text-xs text-gray-500">优先查看刚刚完成的报告，及时把建议转入研讨或修订。</p>
              </div>
            </div>
            <Link to="/reviews" className="text-xs font-medium text-primary-600 no-underline">
              查看全部
            </Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {recentReviews.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">还没有评审记录</p>
                <p className="mt-1 text-xs text-gray-400">先上传文档并发起一次评审，这里会出现最近的报告入口。</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentReviews.map((review) => (
                  <Link
                    key={review.id}
                    to={`/reviews/${review.id}`}
                    className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-gray-50 no-underline"
                  >
                    <div className="rounded-2xl bg-primary-50 p-2 text-primary-600">
                      <ClipboardCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{review.document?.title || '未命名文档'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {review.agent_reviews?.filter((item) => item.status !== 'failed').length || 0} 位角色完成分析
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.overall_score != null ? (
                        <Badge variant={getReviewTone(review.overall_score)}>{review.overall_score.toFixed(1)} 分</Badge>
                      ) : null}
                      <span className="text-[11px] text-gray-400">{formatTimeAgo(review.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">运行概览</h2>
                <p className="mt-1 text-xs text-gray-500">把最近的工作状态压缩成一眼能读懂的结构，便于快速判断下一步。</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {insightCards.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="dm-panel-soft rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500">{item.label}</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{item.value}</p>
                      <p className="mt-1 text-xs text-gray-400">{item.meta}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-2.5 text-primary-600 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-gray-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">最近动态</h2>
                <p className="mt-1 text-xs text-gray-500">保留操作轨迹，但不制造伪交互，重点是让你快速回忆最近发生了什么。</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivities.length === 0 ? (
              <div className="py-6 text-center">
                <Clock3 className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">暂时没有动态记录</p>
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-1 h-2.5 w-2.5 rounded-full', TYPE_DOT[activity.type])} />
                    <div>
                      <p className="text-sm text-gray-700">{activity.text}</p>
                      {activity.score != null ? (
                        <div className="mt-2">
                          <Badge variant={getReviewTone(activity.score)}>{activity.score.toFixed(1)} 分</Badge>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">{formatTimeAgo(activity.created_at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
