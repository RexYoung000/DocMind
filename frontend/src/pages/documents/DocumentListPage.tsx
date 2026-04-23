import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Upload, Search, FileText, File, FileCode, MoreHorizontal,
  Clock, Trash2, ClipboardCheck, X, CloudUpload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimeAgo, formatFileSize } from '@/utils/format'
import { useDocumentStore } from '@/stores/documentStore'
import { useAuthStore } from '@/stores/authStore'
import { parseDocument, createDocumentFromFile, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from '@/services/documentParser'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Document } from '@/types'

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, docx: File, md: FileCode, txt: File,
}
const FILE_COLORS: Record<string, string> = {
  pdf: 'text-red-500 bg-red-50', docx: 'text-blue-500 bg-blue-50',
  md: 'text-gray-600 bg-gray-100', txt: 'text-gray-500 bg-gray-50',
}
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ready: { label: '已就绪', color: 'bg-emerald-50 text-emerald-600' },
  parsing: { label: '解析中', color: 'bg-amber-50 text-amber-600' },
  uploading: { label: '上传中', color: 'bg-blue-50 text-blue-600' },
  error: { label: '解析失败', color: 'bg-red-50 text-red-600' },
}

export default function DocumentListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const documents = useDocumentStore((s) => s.documents)
  const addDocument = useDocumentStore((s) => s.addDocument)
  const updateDocument = useDocumentStore((s) => s.updateDocument)
  const removeDocument = useDocumentStore((s) => s.removeDocument)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'ready' | 'parsing'>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpenId) return
    const handler = () => setMenuOpenId(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const filteredDocs = documents.filter((doc) => {
    if (activeTab !== 'all' && doc.status !== activeTab) return false
    if (search && !doc.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const processFile = useCallback(async (file: File) => {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      toast('error', `不支持的文件格式: ${ext}，请上传 PDF/DOCX/MD/TXT`)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast('error', '文件大小超过 20MB 限制')
      return
    }

    const doc = createDocumentFromFile(file, user?.id || '')
    addDocument(doc)
    setShowUpload(false)

    try {
      const result = await parseDocument(file)
      updateDocument(doc.id, {
        raw_content: result.raw_content,
        structured_content: result.structured_content,
        word_count: result.word_count,
        doc_metadata: result.doc_metadata,
        status: 'ready',
      })
      toast('success', `文档《${doc.title}》解析完成`)
      navigate(`/documents/${doc.id}`)
    } catch (err) {
      updateDocument(doc.id, { status: 'error' })
      toast('error', `解析失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [user, addDocument, updateDocument])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true)
    for (const file of Array.from(files)) {
      await processFile(file)
    }
    setUploading(false)
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)

  const handleDelete = (doc: Document) => {
    removeDocument(doc.id)
    toast('success', `已删除文档《${doc.title}》`)
    setMenuOpenId(null)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">文档中心</h1>
          <p className="text-sm text-gray-500 mt-1">管理你的文档，上传新文档开始评审</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors cursor-pointer border-0"
        >
          <Upload className="h-4 w-4" />
          上传文档
        </button>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !uploading && setShowUpload(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">上传文档</h3>
              <button onClick={() => !uploading && setShowUpload(false)} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className={cn(
                'rounded-xl border-2 border-dashed p-8 text-center transition-all',
                dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
                uploading && 'opacity-60 pointer-events-none'
              )}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <CloudUpload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              {uploading ? (
                <p className="text-sm font-medium text-primary-600">正在解析文档...</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">拖拽文件到这里</p>
                  <p className="text-xs text-gray-500 mt-1">或点击选择文件</p>
                </>
              )}
              <p className="text-xs text-gray-400 mt-3">支持 PDF / Word / Markdown / TXT，最大 20MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.md,.txt"
                className="hidden"
                multiple
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0 disabled:opacity-50"
              >
                选择文件
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文档..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['all', 'ready', 'parsing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-0',
                activeTab === tab ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 bg-transparent'
              )}
            >
              {tab === 'all' ? `全部 (${documents.length})` : tab === 'ready' ? '已就绪' : '解析中'}
            </button>
          ))}
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {documents.length === 0 ? '还没有文档' : '没有找到匹配的文档'}
          </p>
          <p className="text-sm text-gray-400 mt-1">上传你的第一份文档，开始多角色评审之旅</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0"
          >
            <Upload className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            上传文档
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocs.map((doc) => {
            const Icon = FILE_ICONS[doc.file_type] || FileText
            const colorClass = FILE_COLORS[doc.file_type] || 'text-gray-500 bg-gray-50'
            const status = STATUS_MAP[doc.status]
            return (
              <div key={doc.id} className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 transform-gpu">
                <Link to={`/documents/${doc.id}`} className="absolute inset-0 z-0" />
                <div className="relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn('rounded-lg p-2.5', colorClass)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="relative pointer-events-auto">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id) }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpenId === doc.id && (
                        <div className="absolute right-0 top-6 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-20" onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(doc); setMenuOpenId(null) }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer border-0 bg-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{doc.title}</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    {doc.file_type.toUpperCase()} · {doc.word_count ? `${doc.word_count.toLocaleString()} 字` : formatFileSize(doc.file_size)}
                    {doc.review_count > 0 && ` · ${doc.review_count} 次评审`}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status.color)}>
                      {status.label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(doc.created_at)}
                    </span>
                  </div>

                  {doc.status === 'ready' && (
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3 pointer-events-auto">
                      <Link
                        to={`/reviews/create?doc=${doc.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-primary-600 font-medium no-underline hover:text-primary-700"
                      >
                        <ClipboardCheck className="h-3 w-3" /> 发起评审
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
