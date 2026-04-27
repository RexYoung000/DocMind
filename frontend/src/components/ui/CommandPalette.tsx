import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Bot, ClipboardCheck, MessageCircle, Settings, LayoutDashboard, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useAgentStore } from '@/stores/agentStore'
import { useReviewStore } from '@/stores/reviewStore'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: typeof FileText
  path: string
  category: string
}

const STATIC_COMMANDS: CommandItem[] = [
  { id: 'nav-dashboard', label: '工作台', icon: LayoutDashboard, path: '/dashboard', category: '导航' },
  { id: 'nav-documents', label: '文档中心', icon: FileText, path: '/documents', category: '导航' },
  { id: 'nav-agents', label: '角色工坊', icon: Bot, path: '/agents', category: '导航' },
  { id: 'nav-reviews', label: '评审大厅', icon: ClipboardCheck, path: '/reviews', category: '导航' },
  { id: 'nav-chat', label: '聊天室', icon: MessageCircle, path: '/chat', category: '导航' },
  { id: 'nav-settings', label: '设置', icon: Settings, path: '/settings', category: '导航' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const documents = useDocumentStore((s) => s.documents)
  const agents = useAgentStore((s) => s.agents)
  const reviews = useReviewStore((s) => s.reviews)

  const dynamicCommands = useMemo<CommandItem[]>(() => {
    const docItems: CommandItem[] = documents.map((d) => ({
      id: `doc-${d.id}`, label: d.title, description: `${d.file_type.toUpperCase()} · ${d.word_count?.toLocaleString() || 0} 字`,
      icon: FileText, path: `/documents/${d.id}`, category: '文档',
    }))
    const agentItems: CommandItem[] = agents.map((a) => ({
      id: `agent-${a.id}`, label: a.name, description: a.tagline,
      icon: Bot, path: `/agents/${a.id}/edit`, category: '角色',
    }))
    const reviewItems: CommandItem[] = reviews.filter((r) => r.status === 'completed').slice(0, 5).map((r) => ({
      id: `review-${r.id}`, label: `${r.document?.title || '未知文档'} 评审报告`,
      description: `评分 ${r.overall_score?.toFixed(1) || '-'}`,
      icon: ClipboardCheck, path: `/reviews/${r.id}`, category: '评审',
    }))
    return [...docItems, ...agentItems, ...reviewItems]
  }, [documents, agents, reviews])

  const allCommands = useMemo(() => [...STATIC_COMMANDS, ...dynamicCommands], [dynamicCommands])

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands.slice(0, 12)
    const q = query.toLowerCase()
    return allCommands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    ).slice(0, 12)
  }, [query, allCommands])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && filtered[activeIndex]) {
        navigate(filtered[activeIndex].path)
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, filtered, activeIndex, navigate, onClose])

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
        else {
          const event = new CustomEvent('open-command-palette')
          document.dispatchEvent(event)
        }
      }
    }
    document.addEventListener('keydown', handleGlobalKey)
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl animate-slide-up border border-gray-200 overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <Search className="h-5 w-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="搜索文档、角色、页面..."
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">ESC</kbd>
          <button onClick={onClose} className="sm:hidden text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">未找到匹配的结果</div>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => { navigate(item.path); onClose() }}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer border-0 bg-transparent',
                    i === activeIndex ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{item.category}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span><kbd className="rounded border border-gray-200 px-1 py-0.5">↑↓</kbd> 选择</span>
          <span><kbd className="rounded border border-gray-200 px-1 py-0.5">Enter</kbd> 打开</span>
          <span><kbd className="rounded border border-gray-200 px-1 py-0.5">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
