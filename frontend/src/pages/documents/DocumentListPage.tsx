import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CloudUpload,
  ClipboardCheck,
  Clock3,
  File,
  FileCode,
  FileText,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize, formatTimeAgo } from '@/utils/format'
import { useDocumentStore } from '@/stores/documentStore'
import { useAuthStore } from '@/stores/authStore'
import { parseDocument, createDocumentFromFile, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from '@/services/documentParser'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import type { Document } from '@/types'

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: File,
  md: FileCode,
  txt: File,
}

const FILE_COLORS: Record<string, string> = {
  pdf: 'bg-red-50 text-red-500',
  docx: 'bg-blue-50 text-blue-500',
  md: 'bg-slate-100 text-slate-600',
  txt: 'bg-gray-100 text-gray-500',
}

const STATUS_META: Record<Document['status'], { label: string; variant: 'success' | 'warning' | 'info' | 'danger' }> = {
  ready: { label: '已就绪', variant: 'success' },
  parsing: { label: '解析中', variant: 'warning' },
  uploading: { label: '上传中', variant: 'info' },
  error: { label: '解析失败', variant: 'danger' },
}

export default function DocumentListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const documents = useDocumentStore((state) => state.documents)
  const addDocument = useDocumentStore((state) => state.addDocument)
  const updateDocument = useDocumentStore((state) => state.updateDocument)
  const removeDocument = useDocumentStore((state) => state.removeDocument)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'ready' | 'parsing'>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpenId) return
    const handler = () => setMenuOpenId(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const readyCount = useMemo(() => documents.filter((item) => item.status === 'ready').length, [documents])
  const parsingCount = useMemo(() => documents.filter((item) => item.status === 'parsing' || item.status === 'uploading').length, [documents])

  const filteredDocs = documents.filter((document) => {
    const matchesTab =
      activeTab === 'all'
        ? true
        : activeTab === 'ready'
          ? document.status === 'ready'
          : document.status === 'parsing' || document.status === 'uploading'
    const matchesSearch = search ? document.title.toLowerCase().includes(search.toLowerCase()) : true
    return matchesTab && matchesSearch
  })

  const processFile = useCallback(
    async (file: File) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        toast('error', `不支持的文件格式：${ext}，请上传 PDF、DOCX、MD 或 TXT`)
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        toast('error', '文件大小超过 20MB 限制')
        return
      }

      const document = createDocumentFromFile(file, user?.id || '')
      addDocument(document)
      setShowUpload(false)

      try {
        const result = await parseDocument(file)
        updateDocument(document.id, {
          raw_content: result.raw_content,
          structured_content: result.structured_content,
          word_count: result.word_count,
          teaching_plan: result.teaching_plan,
          status: 'ready',
        })
        toast('success', `《${document.title}》解析完成`)
        navigate(`/documents/${document.id}`)
      } catch (error) {
        updateDocument(document.id, { status: 'error' })
        toast('error', `解析失败：${error instanceof Error ? error.message : '未知错误'}`)
      }
    },
    [user, addDocument, updateDocument, navigate]
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true)
      for (const file of Array.from(files)) {
        await processFile(file)
      }
      setUploading(false)
    },
    [processFile]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragActive(false)
      if (event.dataTransfer.files.length > 0) {
        handleFiles(event.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleDelete = (document: Document) => {
    removeDocument(document.id)
    toast('success', `已删除文档《${document.title}》`)
    setDeleteTarget(null)
    setMenuOpenId(null)
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <section className="dm-page-header">
        <div>
          <span className="dm-kicker">Document Hub</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">文档中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-600">
            在这里管理待评审的教研案。上传后系统会自动提取结构化教学信息，后续评审和聊天室都以这里的文档为来源。
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="shrink-0">
          <Upload className="h-4 w-4" />
          上传文档
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="dm-hero-card rounded-[28px] px-6 py-6">
          <div className="relative z-[1]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">Upload Flow</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900">把文档整理好，后面的评审和研讨才有依据。</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-gray-600">
                  支持 PDF、Word、Markdown 和 TXT。解析完成后可直接进入文档详情、发起评审或进入关联研讨。
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="dm-panel rounded-2xl px-4 py-4">
                <p className="text-xs text-gray-500">全部文档</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{documents.length}</p>
              </div>
              <div className="dm-panel rounded-2xl px-4 py-4">
                <p className="text-xs text-gray-500">可评审</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{readyCount}</p>
              </div>
              <div className="dm-panel rounded-2xl px-4 py-4">
                <p className="text-xs text-gray-500">处理中</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{parsingCount}</p>
              </div>
            </div>
          </div>
        </div>

        <Card className="rounded-[28px]">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-sm font-semibold text-gray-900">筛选与检索</p>
              <p className="mt-1 text-xs leading-6 text-gray-500">先缩小范围，再进入具体文档，不要在长列表里找目标。</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索文档标题..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all' as const, label: `全部 (${documents.length})` },
                { key: 'ready' as const, label: `已就绪 (${readyCount})` },
                { key: 'parsing' as const, label: `处理中 (${parsingCount})` },
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
          </CardContent>
        </Card>
      </section>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !uploading && setShowUpload(false)}>
          <div
            className="dm-panel mx-4 w-full max-w-xl rounded-[28px] p-6 shadow-xl animate-slide-up"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">上传文档</h3>
                <p className="mt-1 text-xs text-gray-500">上传后会自动解析为可评审的结构化内容。</p>
              </div>
              <button
                onClick={() => !uploading && setShowUpload(false)}
                className="rounded-md border-0 bg-transparent p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className={cn(
                'rounded-[24px] border-2 border-dashed p-10 text-center transition-all',
                dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-white/70 hover:border-primary-300 hover:bg-primary-50/50',
                uploading && 'pointer-events-none opacity-70'
              )}
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <CloudUpload className="mx-auto mb-4 h-12 w-12 text-primary-500" />
              {uploading ? (
                <>
                  <p className="text-sm font-medium text-primary-600">正在解析文档...</p>
                  <p className="mt-2 text-xs text-gray-500">系统会尽量提取课题、目标、重点、难点和教学过程。</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-gray-900">拖拽文件到这里</p>
                  <p className="mt-2 text-sm text-gray-500">或点击按钮手动选择文件</p>
                </>
              )}

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Badge variant="info">PDF</Badge>
                <Badge variant="info">DOCX</Badge>
                <Badge variant="info">MD</Badge>
                <Badge variant="info">TXT</Badge>
              </div>

              <p className="mt-4 text-xs text-gray-400">单个文件不超过 20MB</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.md,.txt"
                className="hidden"
                multiple
                onChange={(event) => event.target.files && handleFiles(event.target.files)}
              />

              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="mt-5">
                选择文件
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {filteredDocs.length === 0 ? (
        <Card className="rounded-[28px]">
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-600">
              {documents.length === 0 ? '还没有文档' : '没有找到匹配的文档'}
            </p>
            <p className="mt-2 text-sm text-gray-400">上传第一份教研案后，就可以继续发起评审和聊天室研讨。</p>
            <Button onClick={() => setShowUpload(true)} className="mt-5">
              <Upload className="h-4 w-4" />
              上传文档
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredDocs.map((document) => {
            const Icon = FILE_ICONS[document.file_type] || FileText
            const fileColor = FILE_COLORS[document.file_type] || 'bg-gray-100 text-gray-500'
            const statusMeta = STATUS_META[document.status]

            return (
              <div key={document.id} className="group relative">
                <Link to={`/documents/${document.id}`} className="absolute inset-0 z-0 rounded-[28px]" />

                <Card className="dm-panel-hover relative z-[1] h-full rounded-[28px]">
                  <CardContent className="pointer-events-none flex h-full flex-col p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className={cn('rounded-2xl p-3 shadow-sm', fileColor)}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="pointer-events-auto relative">
                        <button
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setMenuOpenId(menuOpenId === document.id ? null : document.id)
                          }}
                          className="rounded-md border-0 bg-transparent p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 cursor-pointer"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {menuOpenId === document.id ? (
                          <div
                            className="absolute right-0 top-8 z-20 w-36 rounded-2xl border border-gray-200 bg-white py-1 shadow-lg"
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <button
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setDeleteTarget(document)
                                setMenuOpenId(null)
                              }}
                              className="flex w-full items-center gap-2 border-0 bg-transparent px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除文档
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h2 className="line-clamp-2 text-lg font-semibold text-gray-900">{document.title}</h2>
                      <p className="text-sm text-gray-500">
                        {document.file_type.toUpperCase()} · {document.word_count ? `${document.word_count.toLocaleString()} 字` : formatFileSize(document.file_size)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      {document.review_count > 0 ? <Badge variant="default">{document.review_count} 次评审</Badge> : null}
                    </div>

                    <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        最近更新 {formatTimeAgo(document.updated_at || document.created_at)}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                      <span className="text-xs font-medium text-primary-600">查看详情</span>
                      {document.status === 'ready' ? (
                        <Link
                          to={`/reviews/create?doc=${document.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="pointer-events-auto inline-flex items-center gap-1 text-xs font-medium text-primary-600 no-underline hover:text-primary-700"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          发起评审
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">等待解析完成</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </section>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除文档"
        description={deleteTarget ? `确定要删除《${deleteTarget.title}》吗？此操作不可撤销。` : ''}
        confirmText="删除"
        variant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
