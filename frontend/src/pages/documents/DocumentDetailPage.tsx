import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  Clock3,
  File,
  FileCode,
  FileText,
  CheckCircle2,
  MessageCircle,
  Tag,
  Trash2,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { useChatStore } from '@/stores/chatStore'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatFileSize, formatTimeAgo } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'

const FILE_ICON_MAP: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: File,
  docx: File,
  md: FileCode,
  txt: FileText,
}

const FILE_COLOR_MAP: Record<string, string> = {
  pdf: 'bg-red-50 text-red-500',
  doc: 'bg-blue-50 text-blue-500',
  docx: 'bg-blue-50 text-blue-500',
  md: 'bg-slate-100 text-slate-600',
  txt: 'bg-gray-100 text-gray-500',
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const document = useDocumentStore((state) => state.documents.find((item) => item.id === id))
  const removeDocument = useDocumentStore((state) => state.removeDocument)
  const reviews = useReviewStore((state) => state.reviews)
  const reviewsForDocument = useMemo(() => reviews.filter((review) => review.document_id === id), [reviews, id])
  const chatRooms = useChatStore((state) => state.rooms)
  const reviewIdsForDocument = useMemo(() => new Set(reviewsForDocument.map((review) => review.id)), [reviewsForDocument])
  const chatRoomsForDocument = useMemo(
    () => chatRooms.filter((room) => room.document_id === id || (room.review_id ? reviewIdsForDocument.has(room.review_id) : false)),
    [chatRooms, id, reviewIdsForDocument]
  )
  const suggestionStats = useMemo(() => {
    const suggestions = reviewsForDocument.flatMap((review) => [
      ...(review.summary?.top_suggestions || []),
      ...(review.agent_reviews || []).flatMap((agentReview) => agentReview.suggestions || []),
    ])
    const uniqueSuggestions = Array.from(
      new Map(suggestions.map((suggestion) => [`${suggestion.title || ''}-${suggestion.content}`, suggestion])).values()
    )
    const adopted = uniqueSuggestions.filter((suggestion) => suggestion.adopted).length
    const highPriority = uniqueSuggestions.filter((suggestion) => suggestion.priority === 'high').length

    return {
      total: uniqueSuggestions.length,
      adopted,
      pending: uniqueSuggestions.length - adopted,
      highPriority,
      rate: uniqueSuggestions.length > 0 ? Math.round((adopted / uniqueSuggestions.length) * 100) : 0,
    }
  }, [reviewsForDocument])
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!document) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
          <ArrowLeft className="h-4 w-4" /> 返回文档列表
        </Link>
        <Card className="rounded-[28px]">
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-500">文档不存在或已被删除</p>
            <Link to="/documents" className="mt-4 inline-flex rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-primary-700">
              返回文档列表
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const Icon = FILE_ICON_MAP[document.file_type] || FileText
  const iconColor = FILE_COLOR_MAP[document.file_type] || 'bg-gray-100 text-gray-500'

  const handleDelete = () => {
    removeDocument(document.id)
    toast('success', `已删除文档《${document.title}》`)
    navigate('/documents')
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
        <ArrowLeft className="h-4 w-4" /> 返回文档列表
      </Link>

      <section className="dm-hero-card rounded-[28px] px-6 py-6 sm:px-8">
        <div className="relative z-[1] grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-start gap-4">
              <div className={`rounded-[20px] p-3 shadow-sm ${iconColor}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <span className="dm-kicker">Document Detail</span>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{document.title}</h1>
                <p className="mt-2 text-sm text-gray-500">
                  {document.file_type.toUpperCase()} · {document.word_count ? `${document.word_count.toLocaleString()} 字` : formatFileSize(document.file_size)} · {document.review_count} 次评审
                </p>
              </div>
            </div>

            {document.keywords && document.keywords.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {document.keywords.map((keyword) => (
                  <Badge key={keyword} variant="primary">
                    <Tag className="mr-1 h-3 w-3" />
                    {keyword}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="dm-panel rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-500">最近更新</p>
              <p className="mt-2 text-xl font-bold text-gray-900">{formatTimeAgo(document.updated_at || document.created_at)}</p>
            </div>
            <div className="dm-panel rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-500">评审记录</p>
              <p className="mt-2 text-xl font-bold text-gray-900">{reviewsForDocument.length}</p>
            </div>
            <div className="dm-panel rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-500">文件大小</p>
              <p className="mt-2 text-xl font-bold text-gray-900">{formatFileSize(document.file_size)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <Card className="rounded-[28px]">
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">操作</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {document.status === 'ready' ? (
                <Link to={`/reviews/create?doc=${document.id}`} className="block no-underline">
                  <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-4 transition-colors hover:bg-primary-100">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-white p-2.5 text-primary-600 shadow-sm">
                        <ClipboardCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-700">发起评审</p>
                        <p className="mt-1 text-xs leading-6 text-primary-600">基于当前文档直接进入角色选择和评审配置。</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              <button
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-left transition-colors hover:bg-red-100 cursor-pointer"
              >
                <div className="rounded-2xl bg-white p-2.5 text-red-600 shadow-sm">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-700">删除文档</p>
                  <p className="mt-1 text-xs leading-6 text-red-600">仅删除当前文档内容，不会自动删除既有评审记录。</p>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card className="rounded-[28px]">
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">文档信息</h2>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {[
                  ['格式', document.file_type.toUpperCase()],
                  ['文件名', document.file_name],
                  ['字数', document.word_count ? `${document.word_count.toLocaleString()} 字` : '-'],
                  ['大小', formatFileSize(document.file_size)],
                  ['评审次数', `${document.review_count} 次`],
                  ['上传时间', new Date(document.created_at).toLocaleDateString('zh-CN')],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="max-w-[65%] truncate text-right font-medium text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {document.teaching_plan ? (
            <Card className="rounded-[28px]">
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">识别出的教学要素</h2>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {document.teaching_plan.topic ? (
                  <div>
                    <p className="text-xs text-gray-500">课题</p>
                    <p className="mt-1 font-medium text-gray-900">{document.teaching_plan.topic}</p>
                  </div>
                ) : null}
                {document.teaching_plan.subject ? (
                  <div>
                    <p className="text-xs text-gray-500">学科</p>
                    <p className="mt-1 font-medium text-gray-900">{document.teaching_plan.subject}</p>
                  </div>
                ) : null}
                {document.teaching_plan.grade ? (
                  <div>
                    <p className="text-xs text-gray-500">年级</p>
                    <p className="mt-1 font-medium text-gray-900">{document.teaching_plan.grade}</p>
                  </div>
                ) : null}
                {document.teaching_plan.duration ? (
                  <div>
                    <p className="text-xs text-gray-500">课时</p>
                    <p className="mt-1 font-medium text-gray-900">{document.teaching_plan.duration}</p>
                  </div>
                ) : null}
                {document.teaching_plan.keyPoints?.length ? (
                  <div>
                    <p className="text-xs text-gray-500">教学重点</p>
                    <p className="mt-1 leading-7 text-gray-700">{document.teaching_plan.keyPoints.join('；')}</p>
                  </div>
                ) : null}
                {document.teaching_plan.difficulties?.length ? (
                  <div>
                    <p className="text-xs text-gray-500">教学难点</p>
                    <p className="mt-1 leading-7 text-gray-700">{document.teaching_plan.difficulties.join('；')}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
        <Card className="rounded-[28px]">
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">评审历史</h2>
              <p className="mt-1 text-xs text-gray-500">围绕该文档已经生成过的报告，可以直接回看或继续讨论。</p>
            </div>
            {document.status === 'ready' ? (
              <Link to={`/reviews/create?doc=${document.id}`} className="no-underline">
                <Button size="sm">
                  <ClipboardCheck className="h-4 w-4" />
                  新建评审
                </Button>
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {reviewsForDocument.length === 0 ? (
              <div className="py-10 text-center">
                <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">还没有评审记录</p>
                <p className="mt-1 text-xs text-gray-400">如果文档已准备完成，现在就可以发起第一轮评审。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviewsForDocument.map((review) => (
                  <Link
                    key={review.id}
                    to={`/reviews/${review.id}`}
                    className="block rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-colors hover:bg-gray-50 no-underline"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-white p-2.5 text-primary-600 shadow-sm">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">{review.overall_score?.toFixed(1) || '-'} 分</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {review.agent_reviews?.filter((item) => item.status !== 'failed').length || 0} 位角色完成分析
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatTimeAgo(review.created_at)}
                      </span>
                    </div>

                    {review.summary?.top_suggestions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {review.summary.top_suggestions.slice(0, 3).map((suggestion) => (
                          <Badge key={suggestion.id} variant="default">
                            {suggestion.title || suggestion.content.slice(0, 18)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-[28px]">
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">关联聊天室</h2>
              <p className="mt-1 text-xs text-gray-500">展示和该文档有关的讨论房间，便于从文档继续追踪讨论。</p>
            </div>
          </CardHeader>
          <CardContent>
            {chatRoomsForDocument.length === 0 ? (
              <div className="py-8 text-center">
                <MessageCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">还没有关联聊天室</p>
                <p className="mt-1 text-xs text-gray-400">从评审页发起聊天室后，这里会自动汇总展示。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {chatRoomsForDocument.map((room) => (
                  <Link
                    key={room.id}
                    to={`/chat/${room.id}`}
                    className="block rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-colors hover:bg-gray-50 no-underline"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{room.topic}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {room.participants.length} 位角色 · {room.status === 'active' ? '进行中' : '已关闭'}
                        </p>
                      </div>
                      <MessageCircle className="h-4 w-4 text-primary-500" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-[28px]">
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">建议采纳统计</h2>
          </CardHeader>
          <CardContent>
            {suggestionStats.total === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">还没有可统计的建议</p>
                <p className="mt-1 text-xs text-gray-400">完成评审后，建议采纳情况会在这里汇总。</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                  <p className="text-xs text-gray-500">建议总数</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{suggestionStats.total}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs text-emerald-700">已采纳</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">{suggestionStats.adopted}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-xs text-amber-700">待采纳</p>
                  <p className="mt-2 text-2xl font-bold text-amber-700">{suggestionStats.pending}</p>
                </div>
                <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                  <p className="text-xs text-primary-700">采纳率</p>
                  <p className="mt-2 text-2xl font-bold text-primary-700">{suggestionStats.rate}%</p>
                </div>
              </div>
            )}
            {suggestionStats.highPriority > 0 ? (
              <p className="mt-3 text-xs text-gray-500">其中 {suggestionStats.highPriority} 条为高优先级建议。</p>
            ) : null}
          </CardContent>
        </Card>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="确认删除文档"
        description={`确定要删除《${document.title}》吗？文档内容会被移除，历史评审记录不会自动删除。`}
        confirmText="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
