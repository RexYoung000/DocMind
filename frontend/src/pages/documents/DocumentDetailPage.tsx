import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, File, FileCode, ClipboardCheck, Clock, Tag, BarChart3, Trash2 } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useReviewStore } from '@/stores/reviewStore'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatTimeAgo } from '@/utils/format'

const FILE_ICON_MAP: Record<string, typeof FileText> = { pdf: FileText, docx: File, md: FileCode, txt: File }
const FILE_COLOR_MAP: Record<string, string> = {
  pdf: 'bg-red-50 text-red-500', docx: 'bg-blue-50 text-blue-500',
  md: 'bg-gray-100 text-gray-600', txt: 'bg-gray-50 text-gray-500',
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const doc = useDocumentStore((s) => s.documents.find((d) => d.id === id))
  const removeDocument = useDocumentStore((s) => s.removeDocument)
  const allReviews = useReviewStore((s) => s.reviews)
  const reviewsForDoc = useMemo(() => allReviews.filter((r) => r.document_id === id), [allReviews, id])

  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!doc) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
          <ArrowLeft className="h-4 w-4" /> 返回文档列表
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">文档不存在或已被删除</p>
          <Link to="/documents" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 no-underline">
            返回文档列表
          </Link>
        </div>
      </div>
    )
  }

  const Icon = FILE_ICON_MAP[doc.file_type] || FileText
  const iconColor = FILE_COLOR_MAP[doc.file_type] || 'bg-gray-50 text-gray-500'

  const handleDelete = () => {
    removeDocument(doc.id)
    toast('success', `已删除文档《${doc.title}》`)
    navigate('/documents')
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
        <ArrowLeft className="h-4 w-4" /> 返回文档列表
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 ${iconColor}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{doc.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {doc.file_type.toUpperCase()} · {doc.word_count ? `${doc.word_count.toLocaleString()} 字` : `${(doc.file_size / 1024).toFixed(1)} KB`} · {doc.review_count} 次评审
            </p>
          </div>
        </div>
        {doc.keywords && doc.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {doc.keywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-600">
                <Tag className="h-3 w-3" /> {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">操作</h3>
            <div className="space-y-3">
              {doc.status === 'ready' && (
                <Link
                  to={`/reviews/create?doc=${doc.id}`}
                  className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm font-medium text-primary-600 hover:bg-primary-100 transition-colors no-underline"
                >
                  <ClipboardCheck className="h-5 w-5" />
                  <div>
                    <p className="font-medium">发起评审</p>
                    <p className="text-xs text-primary-500">选择角色开始多角色评审</p>
                  </div>
                </Link>
              )}
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">删除文档</p>
                  <p className="text-xs text-red-500">此操作不可撤销</p>
                </div>
              </button>
              <ConfirmDialog
                open={confirmDelete}
                title="确认删除文档"
                description={`确定要删除《${doc.title}》吗？关联的评审记录不会被删除，但文档内容将无法恢复。`}
                confirmText="删除"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-3">文档信息</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['格式', doc.file_type.toUpperCase()],
                ['文件名', doc.file_name],
                ['字数', doc.word_count ? `${doc.word_count.toLocaleString()} 字` : '-'],
                ['大小', `${(doc.file_size / 1024).toFixed(1)} KB`],
                ['评审次数', `${doc.review_count} 次`],
                ['上传时间', new Date(doc.created_at).toLocaleDateString('zh-CN')],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900 truncate max-w-[60%] text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {doc.doc_metadata && (
            <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-3">文档识别结果</h3>
              <dl className="space-y-2 text-sm">
                {doc.doc_metadata.topic && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">主题</dt>
                    <dd className="font-medium text-gray-900 truncate max-w-[60%] text-right">{doc.doc_metadata.topic}</dd>
                  </div>
                )}
                {doc.doc_metadata.category && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">类别</dt>
                    <dd className="font-medium text-gray-900">{doc.doc_metadata.category}</dd>
                  </div>
                )}
                {doc.doc_metadata.author && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">作者</dt>
                    <dd className="font-medium text-gray-900">{doc.doc_metadata.author}</dd>
                  </div>
                )}
                {doc.doc_metadata.abstract && (
                  <div>
                    <dt className="text-gray-500 mb-1">摘要</dt>
                    <dd className="text-gray-700">{doc.doc_metadata.abstract}</dd>
                  </div>
                )}
                {doc.doc_metadata.keyPoints && doc.doc_metadata.keyPoints.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">核心要点</dt>
                    <dd className="text-gray-700">{doc.doc_metadata.keyPoints.join('；')}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">评审历史</h3>
            {reviewsForDoc.length === 0 ? (
              <div className="py-8 text-center">
                <ClipboardCheck className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">暂无评审记录</p>
                {doc.status === 'ready' && (
                  <Link to={`/reviews/create?doc=${doc.id}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 no-underline">
                    <ClipboardCheck className="h-4 w-4" /> 发起第一次评审
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {reviewsForDoc.map((review) => (
                  <Link
                    key={review.id}
                    to={`/reviews/${review.id}`}
                    className="block rounded-lg border border-gray-100 p-4 hover:bg-gray-50 transition-colors no-underline"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary-500" />
                        <span className="text-lg font-bold text-gray-900">{review.overall_score?.toFixed(1) || '-'}</span>
                        <span className="text-sm text-gray-500">分</span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" /> {formatTimeAgo(review.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {review.agent_reviews?.map((ar) => (
                        <span key={ar.agent_id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {ar.agent_name} {ar.score.toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
