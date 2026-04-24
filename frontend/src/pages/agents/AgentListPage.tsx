import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Bot, Sparkles, Trash2, Edit3, X, RotateCcw, Recycle,
  ChevronDown, ChevronRight, ChevronLeft, Send, Check, Dices, Wand2,
  Download, Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentStore, AGENT_COLORS, createAgentFromTemplate } from '@/stores/agentStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { isModelConfigValid } from '@/stores/settingsStore'
import { chatCompletion, LLMError } from '@/services/llmService'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createId } from '@/utils/id'
import type { Agent, AgentTemplate, AgentColor, AgentCategory, TeachingDimension } from '@/types'
import { TEACHING_DIMENSIONS } from '@/types'

const TEMPLATE_GROUPS: { label: string; icon: string; ids: string[] }[] = [
  { label: '教研老师', icon: '📐', ids: ['tpl-edu-1', 'tpl-edu-2', 'tpl-edu-3', 'tpl-edu-4', 'tpl-edu-5', 'tpl-edu-6'] },
  { label: '学生视角', icon: '🎒', ids: ['tpl-stu-1', 'tpl-stu-2', 'tpl-stu-3'] },
  { label: '家长视角', icon: '👨‍👩‍👧', ids: ['tpl-par-1', 'tpl-par-2', 'tpl-par-3'] },
]

const ALL_COLORS: AgentColor[] = ['indigo', 'violet', 'pink', 'orange', 'teal', 'sky', 'slate', 'green', 'rose', 'amber', 'emerald', 'cyan']

const CATEGORY_OPTIONS: { value: AgentCategory; label: string; icon: string }[] = [
  { value: 'teacher', label: '教研老师', icon: '👨‍🏫' },
  { value: 'student', label: '学生', icon: '🎒' },
  { value: 'parent', label: '家长', icon: '👨‍👩‍👧' },
]

// === MD Import/Export ===

function exportAgentToMD(agent: Agent): string {
  const lines: string[] = [
    '---',
    `name: "${agent.name}"`,
    `avatar: "${agent.avatar || ''}"`,
    `tagline: "${agent.tagline}"`,
    `color: ${agent.color}`,
  ]
  if (agent.category) lines.push(`category: ${agent.category}`)
  if (agent.focusDimension) lines.push(`focusDimension: ${agent.focusDimension}`)
  lines.push(`source: ${agent.source}`)
  lines.push('expertise:')
  for (const e of agent.expertise) lines.push(`  - "${e}"`)
  lines.push('personality:')
  lines.push(`  directness: ${agent.personality.directness}`)
  lines.push(`  strictness: ${agent.personality.strictness}`)
  lines.push(`  humor: ${agent.personality.humor}`)
  lines.push(`  empathy: ${agent.personality.empathy}`)
  lines.push('behavior:')
  lines.push(`  style: "${agent.behavior.style}"`)
  if (agent.behavior.catchphrase) lines.push(`  catchphrase: "${agent.behavior.catchphrase}"`)
  lines.push('---')
  lines.push('')
  lines.push('## 系统提示词')
  lines.push('')
  lines.push(agent.system_prompt)
  return lines.join('\n')
}

function parseAgentMD(md: string): Partial<Agent> | null {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null
  const fm = fmMatch[1]
  const body = md.slice(fmMatch[0].length).trim()

  const getStr = (key: string): string => {
    const m = fm.match(new RegExp(`^${key}:\\s*"?(.+?)"?\\s*$`, 'm'))
    return m ? m[1].replace(/^"|"$/g, '') : ''
  }
  const getNum = (key: string): number => {
    const m = fm.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'))
    return m ? parseInt(m[1], 10) : 3
  }

  const expertiseMatch = fm.match(/expertise:\n((?:\s+- ".+"\n?)+)/)
  const expertise = expertiseMatch
    ? [...expertiseMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : []

  const systemPrompt = body.replace(/^##\s*系统提示词\s*\n?/, '').trim()

  const colorVal = getStr('color')
  const categoryVal = getStr('category')

  return {
    name: getStr('name'),
    avatar: getStr('avatar'),
    tagline: getStr('tagline'),
    color: ALL_COLORS.includes(colorVal as AgentColor) ? (colorVal as AgentColor) : 'indigo',
    category: ['teacher', 'student', 'parent'].includes(categoryVal) ? (categoryVal as AgentCategory) : undefined,
    focusDimension: (TEACHING_DIMENSIONS as readonly string[]).includes(getStr('focusDimension')) ? (getStr('focusDimension') as TeachingDimension) : undefined,
    source: (getStr('source') === 'template' ? 'template' : 'custom') as Agent['source'],
    expertise,
    personality: {
      directness: Math.min(5, Math.max(1, getNum('directness'))),
      strictness: Math.min(5, Math.max(1, getNum('strictness'))),
      humor: Math.min(5, Math.max(1, getNum('humor'))),
      empathy: Math.min(5, Math.max(1, getNum('empathy'))),
    },
    behavior: {
      style: getStr('style'),
      catchphrase: getStr('catchphrase') || undefined,
    },
    system_prompt: systemPrompt,
  }
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ======================== Recommend Tab ========================

function MiniAgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const borderColor = AGENT_COLORS[agent.color]
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-base shrink-0"
        style={{ backgroundColor: borderColor + '15', boxShadow: `0 0 0 2px ${borderColor}` }}
      >
        {agent.avatar || agent.name[0]}
      </div>
      <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{agent.name}</span>
    </button>
  )
}

function RecommendTemplateCard({ template, onUse }: {
  template: AgentTemplate; onUse: () => void
}) {
  const borderColor = AGENT_COLORS[template.color]
  return (
    <div
      className="w-48 shrink-0 snap-start rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ borderTopWidth: '3px', borderTopColor: borderColor }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl shrink-0"
          style={{ backgroundColor: borderColor + '15', boxShadow: `0 0 0 2px ${borderColor}` }}
        >
          {template.avatar}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{template.name}</h3>
          <p className="text-[10px] text-gray-500 truncate">{template.tagline}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {template.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: borderColor + '15', color: borderColor }}>
            {tag}
          </span>
        ))}
      </div>
      <button
        onClick={onUse}
        className="w-full rounded-lg bg-primary-600 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors cursor-pointer border-0"
      >
        使用此模板
      </button>
    </div>
  )
}

function TemplateGroup({ group, templates, onUseTemplate }: {
  group: { label: string; icon: string }
  templates: AgentTemplate[]
  onUseTemplate: (tpl: AgentTemplate) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 400
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-3 cursor-pointer bg-transparent border-0 p-0 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        <span className="text-base">{group.icon}</span>
        <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
        <span className="text-xs text-gray-400">{templates.length} 个角色</span>
      </button>

      {expanded && (
        <div className="relative group/scroll">
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 -mx-1 px-1 scrollbar-hide"
          >
            {templates.map((tpl) => (
              <RecommendTemplateCard key={tpl.id} template={tpl} onUse={() => onUseTemplate(tpl)} />
            ))}
          </div>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  )
}

// ======================== Agent Manage Card ========================

function AgentManageCard({ agent, onEdit, onDelete, onExport, onImport }: {
  agent: Agent; onEdit: () => void; onDelete: () => void; onExport: () => void; onImport: () => void
}) {
  const borderColor = AGENT_COLORS[agent.color]
  const isOfficial = agent.source === 'template'
  return (
    <div
      className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-2xl shrink-0"
          style={{ backgroundColor: borderColor + '15', boxShadow: `0 0 0 2px ${borderColor}` }}
        >
          {agent.avatar || agent.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">{agent.name}</h3>
          <p className="text-xs text-gray-500">{agent.tagline}</p>
        </div>
        {isOfficial && (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-600 border border-primary-200">官方</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {agent.expertise.slice(0, 4).map((e) => (
          <span key={e} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: borderColor + '15', color: borderColor }}>
            {e}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {isOfficial ? '来自模板' : agent.source === 'custom' ? '自定义创建' : '社区'}
        {' · '}已使用 {agent.usage_count} 次
        {agent.category && (
          <> · {{ teacher: '教研老师', student: '学生', parent: '家长' }[agent.category]}</>
        )}
      </p>
      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer bg-white"
        >
          <Edit3 className="h-3.5 w-3.5" /> 编辑
        </button>
        {!isOfficial && (
          <button
            onClick={onImport}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer bg-white"
            title="导入 MD 文档覆盖当前角色"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onExport}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer bg-white"
          title="导出为 MD 文档"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer bg-white"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ======================== Preset Add Modal ========================

function PresetAddModal({ initialTemplate, onClose, onSaved, embedded }: {
  initialTemplate?: AgentTemplate; onClose: () => void; onSaved: () => void; embedded?: boolean
}) {
  const { user } = useAuthStore()
  const templates = useAgentStore((s) => s.templates)
  const hiddenTemplateIds = useAgentStore((s) => s.hiddenTemplateIds)
  const agents = useAgentStore((s) => s.agents)
  const addAgent = useAgentStore((s) => s.addAgent)

  const visibleTemplates = templates.filter((t) => !hiddenTemplateIds.includes(t.id))
  const [selectedTpl, setSelectedTpl] = useState<AgentTemplate | null>(initialTemplate || null)
  const [step, setStep] = useState<'select' | 'edit'>(initialTemplate ? 'edit' : 'select')

  // Editable fields
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [avatar, setAvatar] = useState('')
  const [color, setColor] = useState<AgentColor>('indigo')
  const [expertise, setExpertise] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [directness, setDirectness] = useState(3)
  const [strictness, setStrictness] = useState(3)
  const [humor, setHumor] = useState(3)
  const [empathy, setEmpathy] = useState(3)

  useEffect(() => {
    if (selectedTpl) {
      setName(selectedTpl.name)
      setTagline(selectedTpl.tagline)
      setAvatar(selectedTpl.avatar || '')
      setColor(selectedTpl.color)
      setExpertise(selectedTpl.expertise.join('、'))
      setSystemPrompt(selectedTpl.description)
      setDirectness(selectedTpl.personality.directness)
      setStrictness(selectedTpl.personality.strictness)
      setHumor(selectedTpl.personality.humor)
      setEmpathy(selectedTpl.personality.empathy)
      setStep('edit')
    }
  }, [selectedTpl])

  const handleSave = () => {
    if (!selectedTpl || !name.trim()) return
    const exists = agents.some((a) => a.template_id === selectedTpl.id)
    if (exists) {
      toast('info', `你已经添加过「${selectedTpl.name}」了`)
      return
    }
    const agent = createAgentFromTemplate(selectedTpl, user?.id || '')
    // Apply user edits
    agent.name = name.trim()
    agent.tagline = tagline.trim()
    agent.avatar = avatar.trim() || name.trim()[0]
    agent.color = color
    agent.expertise = expertise.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    agent.personality = { directness, strictness, humor, empathy }
    addAgent(agent)
    toast('success', `已添加角色「${name.trim()}」到你的评审团`)
    onSaved()
  }

  const borderColor = AGENT_COLORS[color]

  const innerContent = (
    <>
      {step === 'select' ? (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {visibleTemplates.map((tpl) => {
              const bc = AGENT_COLORS[tpl.color]
              const added = agents.some((a) => a.template_id === tpl.id)
              return (
                <button
                  key={tpl.id}
                  onClick={() => !added && setSelectedTpl(tpl)}
                  disabled={added}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer',
                    added ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed' : 'border-gray-200 hover:border-primary-300 hover:shadow-sm bg-white'
                  )}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-xl shrink-0"
                    style={{ backgroundColor: bc + '15', boxShadow: `0 0 0 2px ${bc}` }}
                  >
                    {tpl.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">{tpl.name}</h4>
                    <p className="text-[10px] text-gray-500 truncate">{tpl.tagline}</p>
                  </div>
                  {added && <span className="text-[10px] text-gray-400 shrink-0">已添加</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {selectedTpl && (
            <button
              onClick={() => { setStep('select'); setSelectedTpl(null) }}
              className="text-xs text-primary-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
            >
              ← 重新选择模板
            </button>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">角色名称</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">头像 (emoji)</label>
              <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色标语</label>
            <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">专长领域（用顿号分隔）</label>
            <input type="text" value={expertise} onChange={(e) => setExpertise(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">主题色</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('h-7 w-7 rounded-full border-2 transition-all cursor-pointer', color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: AGENT_COLORS[c] }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">性格参数</label>
            <div className="space-y-2">
              {[
                { label: '直接度', value: directness, set: setDirectness },
                { label: '严格度', value: strictness, set: setStrictness },
                { label: '幽默感', value: humor, set: setHumor },
                { label: '共情力', value: empathy, set: setEmpathy },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-12">{item.label}</span>
                  <input type="range" min={1} max={5} step={1} value={item.value}
                    onChange={(e) => item.set(Number(e.target.value))} className="flex-1 accent-primary-600" />
                  <span className="text-xs text-gray-400 w-6 text-right">{item.value}/5</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">预览</p>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: borderColor + '15', boxShadow: `0 0 0 2px ${borderColor}` }}>
                {avatar || name[0] || '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{name || '未命名'}</p>
                <p className="text-[10px] text-gray-500">{tagline}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2 shrink-0">
        <button onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer bg-white">
          取消
        </button>
        {step === 'edit' && (
          <button onClick={handleSave} disabled={!name.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0">
            确认添加
          </button>
        )}
      </div>
    </>
  )

  if (embedded) {
    return <div className="flex flex-col flex-1 min-h-0">{innerContent}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl mx-4 flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {step === 'select' ? '选择模板' : '编辑角色'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {innerContent}
      </div>
    </div>
  )
}

// ======================== Custom Add Modal ========================

function CustomAddModal({ onClose, onSaved, embedded }: { onClose: () => void; onSaved: () => void; embedded?: boolean }) {
  const { user } = useAuthStore()
  const addAgent = useAgentStore((s) => s.addAgent)

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [avatar, setAvatar] = useState('')
  const [color, setColor] = useState<AgentColor>('indigo')
  const [category, setCategory] = useState<AgentCategory>('teacher')
  const [expertise, setExpertise] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [catchphrase, setCatchphrase] = useState('')
  const [directness, setDirectness] = useState(3)
  const [strictness, setStrictness] = useState(3)
  const [humor, setHumor] = useState(3)
  const [empathy, setEmpathy] = useState(3)

  const handleSave = () => {
    if (!name.trim()) {
      toast('error', '请输入角色名称')
      return
    }
    const agent: Agent = {
      id: createId(),
      owner_id: user?.id || '',
      name: name.trim(),
      avatar: avatar.trim() || name.trim()[0],
      tagline: tagline.trim(),
      personality: { directness, strictness, humor, empathy },
      expertise: expertise.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
      behavior: { style: style.trim(), catchphrase: catchphrase.trim() || undefined },
      system_prompt: systemPrompt.trim(),
      source: 'custom',
      is_public: false,
      usage_count: 0,
      color,
      category,
      created_at: new Date().toISOString(),
    }
    addAgent(agent)
    toast('success', `角色「${name.trim()}」已创建`)
    onSaved()
  }

  const borderColor = AGENT_COLORS[color]

  const innerContent = (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色名称 *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：李老师"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">头像 (emoji)</label>
            <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="例如 🎓"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">角色类别</label>
          <div className="flex gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setCategory(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all cursor-pointer',
                  category === opt.value ? 'border-primary-300 bg-primary-50 text-primary-600 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50 bg-white'
                )}>
                <span>{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">角色标语</label>
          <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="一句话描述角色"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">专长领域（用顿号分隔）</label>
          <input type="text" value={expertise} onChange={(e) => setExpertise(e.target.value)} placeholder="例如：课程设计、环节编排、时间分配"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">说话风格</label>
          <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="例如：严谨务实风"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">口头禅（可选）</label>
          <input type="text" value={catchphrase} onChange={(e) => setCatchphrase(e.target.value)} placeholder="例如：我们来看看这节课的设计思路..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">主题色</label>
          <div className="flex gap-2 flex-wrap">
            {ALL_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={cn('h-7 w-7 rounded-full border-2 transition-all cursor-pointer', color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105')}
                style={{ backgroundColor: AGENT_COLORS[c] }} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">性格参数</label>
          <div className="space-y-2">
            {[
              { label: '直接度', value: directness, set: setDirectness },
              { label: '严格度', value: strictness, set: setStrictness },
              { label: '幽默感', value: humor, set: setHumor },
              { label: '共情力', value: empathy, set: setEmpathy },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12">{item.label}</span>
                <input type="range" min={1} max={5} step={1} value={item.value}
                  onChange={(e) => item.set(Number(e.target.value))} className="flex-1 accent-primary-600" />
                <span className="text-xs text-gray-400 w-6 text-right">{item.value}/5</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">系统提示词</label>
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-y"
            placeholder="描述角色的身份、说话方式、专业背景和评审原则..." />
        </div>

        <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">预览</p>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
              style={{ backgroundColor: borderColor + '15', boxShadow: `0 0 0 2px ${borderColor}` }}>
              {avatar || name[0] || '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{name || '未命名'}</p>
              <p className="text-[10px] text-gray-500">{tagline || '暂无标语'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2 shrink-0">
        <button onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer bg-white">
          取消
        </button>
        <button onClick={handleSave} disabled={!name.trim()}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0">
          创建角色
        </button>
      </div>
    </>
  )

  if (embedded) {
    return <div className="flex flex-col flex-1 min-h-0">{innerContent}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl mx-4 flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">自定义创建角色</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {innerContent}
      </div>
    </div>
  )
}

// ======================== AI Create Modal ========================

const GUIDED_CREATION_PROMPT = `你是教研评审平台的角色创建助手。你的目标是通过**分步引导**帮教研老师创建一个教研案评审角色。

## 对话流程（严格按顺序进行，每次只问一个问题）

### 第1步：确认角色类型
首先问用户想创建什么类型的角色：
A. 👨‍🏫 教研老师视角 — 专业的教学设计审视
B. 🎒 学生视角 — 模拟学生的学习感受
C. 👨‍👩‍👧 家长视角 — 家长对教学的关注点
D. 🎭 自定义视角 — 完全自由设计

### 第2步：细化角色定位
根据用户选择的类型，进一步细化：

如果是教研老师：
- 主要关注哪个维度？课程设计 / 知识链 / 教学目标 / 课程重点 / 课程难点 / 学习梯度
- 还是综合型，不侧重特定维度？

如果是学生：
- 什么年龄段？小学 / 初中 / 高中
- 什么学习特点？活泼好动 / 安静内向 / 学霸型 / 努力追赶型

如果是家长：
- 什么教育理念？重视成绩 / 关注素质 / 比较放手 / 其他
- 对教育参与度？深度参与 / 一般关注 / 基本信任学校

### 第3步：确认性格和说话风格
问用户希望这个角色的性格偏好：
A. 严谨认真型 — 专业严格，一丝不苟
B. 温和鼓励型 — 善于发现优点，建设性建议
C. 直言不讳型 — 有问题直接指出，不留情面
D. 幽默亲和型 — 轻松表达，善用比喻
E. 让用户自由描述

### 第4步：关注重点
问用户希望这个角色在评审教研案时特别关注什么？
比如：教学目标的清晰度 / 知识点的衔接 / 课堂活动设计 / 练习题设计 / 分层教学 / 学生参与度 / 作业设计 / 其他

### 第5步：教学经验和背景
问用户想给这个角色什么样的教学背景？
比如：教龄 / 学校类型 / 是否有班主任经验 / 特殊教育经历等
（如果是学生/家长角色，跳过此步，直接到第6步）

### 第6步：生成角色
收集完信息后，告诉用户"正在为你生成角色..."，然后输出 JSON。

## JSON 输出格式（仅在第6步输出）
请严格按以下格式输出（仅输出 JSON，不要其他内容）：
\`\`\`json
{
  "name": "角色名称（2-4个字，有个性）",
  "avatar": "一个代表此角色的 emoji",
  "tagline": "一句话角色标签",
  "color": "从 indigo/violet/pink/orange/teal/sky/slate/green/rose/amber/emerald/cyan 中选一个",
  "category": "teacher 或 student 或 parent",
  "focusDimension": "课程设计/知识链/教学目标/课程重点/课程难点/学习梯度 中的一个（仅教研老师需要）",
  "personality": { "directness": 3, "strictness": 4, "humor": 2, "empathy": 3 },
  "expertise": ["专长1", "专长2", "专长3", "专长4"],
  "behavior": { "style": "说话风格描述", "catchphrase": "口头禅（有性格特色）" },
  "system_prompt": "完整的系统提示词，包含角色身份、说话方式、专业背景、评审原则。要明确不评价课件交互逻辑和功能设计，专注于教研内容。"
}
\`\`\`

## 重要规则
- 每次只问一个问题，不要一次把所有问题都抛出
- 用轻松友好的语气，像和同事聊天
- 给出的选项要用 A/B/C/D 标记，方便选择
- 如果用户说"随机"或"帮我选"，你就随机组合一个
- 在最后一步之前，不要输出任何 JSON
- 角色必须聚焦教研案评审，不评价课件交互和功能设计`

const RANDOM_AGENT_PROMPT = `你是教研评审平台的角色创建助手。请随机生成一个有特色的教研案评审角色。

随机选择一种角色类型（教研老师/学生/家长），随机组合性格、说话风格、关注维度，生成一个独特的教育领域评审角色。

请严格按以下 JSON 格式输出（仅输出 JSON，不要其他内容）：
{
  "name": "角色名称（2-4个字，有个性）",
  "avatar": "一个代表此角色的 emoji",
  "tagline": "一句话角色标签",
  "color": "从 indigo/violet/pink/orange/teal/sky/slate/green/rose/amber/emerald/cyan 中随机选一个",
  "category": "teacher 或 student 或 parent",
  "focusDimension": "课程设计/知识链/教学目标/课程重点/课程难点/学习梯度 中的一个（仅 teacher 需要，其他留空字符串）",
  "personality": { "directness": 随机1-5, "strictness": 随机1-5, "humor": 随机1-5, "empathy": 随机1-5 },
  "expertise": ["专长1", "专长2", "专长3"],
  "behavior": { "style": "说话风格描述", "catchphrase": "有个性的口头禅" },
  "system_prompt": "完整的系统提示词，包含教育角色身份、说话方式和评审原则。明确不评价课件交互逻辑。"
}`

interface AIMsg { role: 'ai' | 'user'; content: string }

function parseAgentJSON(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.name || !parsed.personality) return null
    return parsed
  } catch { return null }
}

function AICreateModal({ onClose, onSaved, embedded }: { onClose: () => void; onSaved: () => void; embedded?: boolean }) {
  const { user } = useAuthStore()
  const addAgent = useAgentStore((s) => s.addAgent)
  const config = useSettingsStore((s) => s.currentConfig)
  const hasValidConfig = isModelConfigValid(config)

  const [messages, setMessages] = useState<AIMsg[]>([
    { role: 'ai', content: '你好！让我们一起创建一个教研评审角色吧 🎭\n\n首先，你想创建什么类型的角色？\n\nA. 👨‍🏫 教研老师视角 — 专业的教学设计审视\nB. 🎒 学生视角 — 模拟学生的学习感受\nC. 👨‍👩‍👧 家长视角 — 家长对教学的关注点\nD. 🎭 自定义视角 — 完全自由设计\n\n输入字母选择，或直接告诉我你想要的角色！' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{
    name: string; avatar: string; tagline: string; color: AgentColor
    category?: AgentCategory; focusDimension?: string
    personality: { directness: number; strictness: number; humor: number; empathy: number }
    expertise: string[]; behavior: { style: string; catchphrase: string }; system_prompt: string
  } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const processLLMResponse = (text: string) => {
    const parsed = parseAgentJSON(text)
    if (parsed) {
      const validColor = ALL_COLORS.includes(parsed.color) ? parsed.color : ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]
      const previewData = {
        name: parsed.name, avatar: parsed.avatar || '🤖', tagline: parsed.tagline || '',
        color: validColor as AgentColor,
        category: (['teacher', 'student', 'parent'].includes(parsed.category) ? parsed.category : 'teacher') as AgentCategory,
        focusDimension: parsed.focusDimension || undefined,
        personality: {
          directness: Math.min(5, Math.max(1, parsed.personality?.directness || 3)),
          strictness: Math.min(5, Math.max(1, parsed.personality?.strictness || 3)),
          humor: Math.min(5, Math.max(1, parsed.personality?.humor || 3)),
          empathy: Math.min(5, Math.max(1, parsed.personality?.empathy || 3)),
        },
        expertise: parsed.expertise || [],
        behavior: { style: parsed.behavior?.style || '', catchphrase: parsed.behavior?.catchphrase || '' },
        system_prompt: parsed.system_prompt || '',
      }
      setPreview(previewData)
      setMessages((prev) => [...prev, {
        role: 'ai', content: `角色「${previewData.name}」已生成！\n\n请在右侧预览卡片中查看详情。如果满意，点击"保存角色"即可。\n\n不满意？继续告诉我哪里需要调整。`,
      }])
    } else {
      setMessages((prev) => [...prev, { role: 'ai', content: text || '生成失败，请重新描述。' }])
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    if (!hasValidConfig) {
      setMessages((prev) => [...prev, { role: 'ai', content: '你还没有配置 API Key，请先到「设置」页面配置模型和 API Key。\n\n配置完成后回来继续创建角色。' }])
      setLoading(false)
      return
    }

    const conversationMsgs = messages.concat([{ role: 'user', content: userMsg }]).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      await chatCompletion(
        [{ role: 'system', content: GUIDED_CREATION_PROMPT }, ...conversationMsgs],
        { onChunk: () => {}, onDone: (text) => processLLMResponse(text), onError: (err) => {
          setMessages((prev) => [...prev, { role: 'ai', content: `出错了：${err.message}` }])
        }}
      )
    } catch (err) {
      const message = err instanceof LLMError ? err.message : '请求失败，请检查网络连接'
      setMessages((prev) => [...prev, { role: 'ai', content: message }])
    }
    setLoading(false)
  }

  const handleRandom = async () => {
    if (loading || !hasValidConfig) return
    setMessages((prev) => [...prev, { role: 'user', content: '🎲 随机生成一个角色！' }])
    setLoading(true)
    try {
      await chatCompletion(
        [{ role: 'system', content: RANDOM_AGENT_PROMPT }, { role: 'user', content: '请随机生成一个独特有趣的教研评审角色' }],
        { onChunk: () => {}, onDone: (text) => processLLMResponse(text), onError: (err) => {
          setMessages((prev) => [...prev, { role: 'ai', content: `出错了：${err.message}` }])
        }}
      )
    } catch (err) {
      const message = err instanceof LLMError ? err.message : '请求失败，请检查网络连接'
      setMessages((prev) => [...prev, { role: 'ai', content: message }])
    }
    setLoading(false)
  }

  const handleSave = () => {
    if (!preview) return
    const agent: Agent = {
      id: createId(), owner_id: user?.id || '',
      name: preview.name, avatar: preview.avatar, tagline: preview.tagline,
      personality: preview.personality, expertise: preview.expertise, behavior: preview.behavior,
      system_prompt: preview.system_prompt, source: 'custom', is_public: false, usage_count: 0,
      color: preview.color, category: preview.category,
      focusDimension: preview.focusDimension as Agent['focusDimension'],
      creation_history: messages.map((m) => ({ role: m.role, content: m.content })),
      created_at: new Date().toISOString(),
    }
    addAgent(agent)
    toast('success', `角色「${preview.name}」已保存！`)
    onSaved()
  }

  const categoryLabels: Record<string, string> = { teacher: '教研老师', student: '学生', parent: '家长' }

  const innerContent = (
    <div className="flex-1 flex min-h-0">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col border-r border-gray-100">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user' ? 'bg-primary-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-700 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-xl bg-gray-100 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse-dot" />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="border-t border-gray-100 p-3">
          <div className="flex gap-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="输入你的选择或描述..."
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <button onClick={handleSend} disabled={!input.trim() || loading}
              className="rounded-lg bg-primary-600 px-3 py-2 text-white hover:bg-primary-700 disabled:opacity-50 cursor-pointer border-0">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="w-72 shrink-0 p-4 overflow-y-auto">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">角色预览</h4>
        {preview ? (
          <div>
            <div className="rounded-xl border border-gray-100 p-3 mb-3" style={{ borderLeftWidth: '3px', borderLeftColor: AGENT_COLORS[preview.color] }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
                  style={{ backgroundColor: AGENT_COLORS[preview.color] + '15', boxShadow: `0 0 0 2px ${AGENT_COLORS[preview.color]}` }}>
                  {preview.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{preview.name}</p>
                  <p className="text-[10px] text-gray-500">{preview.tagline}</p>
                </div>
              </div>
              {preview.category && (
                <div className="mb-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary-50 text-primary-600 border border-primary-200">
                    {categoryLabels[preview.category] || preview.category}
                  </span>
                  {preview.focusDimension && (
                    <span className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                      {preview.focusDimension}
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-1 mb-2">
                {Object.entries(preview.personality).map(([key, val]) => {
                  const labels: Record<string, string> = { directness: '直接度', strictness: '严格度', humor: '幽默感', empathy: '共情力' }
                  return (
                    <div key={key} className="flex items-center gap-1 text-[10px]">
                      <span className="w-10 text-gray-500">{labels[key]}</span>
                      <div className="flex-1 h-1 rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${val * 20}%`, backgroundColor: AGENT_COLORS[preview.color] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {preview.expertise.map((e) => (
                  <span key={e} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: AGENT_COLORS[preview.color] + '15', color: AGENT_COLORS[preview.color] }}>{e}</span>
                ))}
              </div>
            </div>
            <button onClick={handleSave}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0">
              <Check className="h-4 w-4" /> 保存角色
            </button>
          </div>
        ) : (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">完成对话引导后</p>
            <p className="text-xs text-gray-500">角色预览会在这里显示</p>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 shrink-0">
          <button onClick={handleRandom} disabled={loading || !hasValidConfig}
            className="flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <Dices className="h-3 w-3" /> 随机生成
          </button>
          {!hasValidConfig && (
            <span className="text-xs text-amber-600">请先在设置页配置模型和 API Key</span>
          )}
        </div>
        {innerContent}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[95vw] max-w-4xl h-[85vh] rounded-xl bg-white shadow-xl mx-4 flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">AI 创建角色</h3>
            <button onClick={handleRandom} disabled={loading || !hasValidConfig}
              className="flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Dices className="h-3 w-3" /> 随机生成
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {innerContent}
      </div>
    </div>
  )
}

// ======================== Unified Add Modal ========================

type AddAgentTab = 'preset' | 'custom' | 'ai'

function UnifiedAddModal({
  initialTab = 'preset',
  initialTemplate,
  onClose,
  onSaved,
}: {
  initialTab?: AddAgentTab
  initialTemplate?: AgentTemplate
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<AddAgentTab>(initialTab)

  const tabs: { key: AddAgentTab; label: string }[] = [
    { key: 'preset', label: '📋 预设模板' },
    { key: 'custom', label: '✏️ 自定义' },
    { key: 'ai', label: '🤖 AI 生成' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[95vw] max-w-4xl h-[88vh] rounded-xl bg-white shadow-xl mx-4 flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with tabs + close */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-0',
                  tab === t.key
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 bg-transparent'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-3 text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === 'preset' && (
            <PresetAddModal initialTemplate={initialTemplate} onClose={onClose} onSaved={onSaved} embedded />
          )}
          {tab === 'custom' && (
            <CustomAddModal onClose={onClose} onSaved={onSaved} embedded />
          )}
          {tab === 'ai' && (
            <AICreateModal onClose={onClose} onSaved={onSaved} embedded />
          )}
        </div>
      </div>
    </div>
  )
}

// ======================== Main Page ========================

export default function AgentListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const templates = useAgentStore((s) => s.templates)
  const hiddenTemplateIds = useAgentStore((s) => s.hiddenTemplateIds)
  const agents = useAgentStore((s) => s.agents)
  const trashedAgents = useAgentStore((s) => s.trashedAgents)
  const addAgent = useAgentStore((s) => s.addAgent)
  const removeAgent = useAgentStore((s) => s.removeAgent)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const hideTemplate = useAgentStore((s) => s.hideTemplate)
  const restoreTemplate = useAgentStore((s) => s.restoreTemplate)
  const restoreAgent = useAgentStore((s) => s.restoreAgent)
  const permanentlyDeleteAgent = useAgentStore((s) => s.permanentlyDeleteAgent)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'recommend' | 'manage' | 'trash'>('recommend')
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Agent | null>(null)
  const [importTarget, setImportTarget] = useState<Agent | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [presetModalTpl, setPresetModalTpl] = useState<AgentTemplate | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalTab, setAddModalTab] = useState<AddAgentTab>('preset')

  // Recommend tab: recently used agents
  const recentlyUsedAgents = useMemo(() =>
    agents
      .filter((a) => a.last_used_at)
      .sort((a, b) => new Date(b.last_used_at!).getTime() - new Date(a.last_used_at!).getTime())
      .slice(0, 8),
    [agents]
  )

  // Recommend tab: template groups
  const visibleTemplates = templates.filter((t) => !hiddenTemplateIds.includes(t.id))
  const filteredTemplates = visibleTemplates.filter((t) =>
    !search || t.name.includes(search) || t.tags.some((tag) => tag.includes(search))
  )
  const groupedTemplates = useMemo(() => {
    const filteredIds = new Set(filteredTemplates.map((t) => t.id))
    const tplMap = new Map(filteredTemplates.map((t) => [t.id, t]))
    const grouped: { label: string; icon: string; templates: AgentTemplate[] }[] = []
    const usedIds = new Set<string>()
    for (const group of TEMPLATE_GROUPS) {
      const items = group.ids.filter((id) => filteredIds.has(id)).map((id) => tplMap.get(id)!)
      if (items.length > 0) {
        grouped.push({ label: group.label, icon: group.icon, templates: items })
        items.forEach((t) => usedIds.add(t.id))
      }
    }
    const ungrouped = filteredTemplates.filter((t) => !usedIds.has(t.id))
    if (ungrouped.length > 0) {
      grouped.push({ label: '其他', icon: '🤖', templates: ungrouped })
    }
    return grouped
  }, [filteredTemplates])

  // Manage tab: filtered agents
  const filteredAgents = agents.filter((a) =>
    !search || a.name.includes(search) || a.expertise.some((e) => e.includes(search))
  )

  const hiddenTemplates = templates.filter((t) => hiddenTemplateIds.includes(t.id))
  const trashCount = trashedAgents.length + hiddenTemplates.length

  const handleUseTemplate = (tpl: AgentTemplate) => {
    setPresetModalTpl(tpl)
    setAddModalTab('preset')
    setShowAddModal(true)
  }

  const handleDeleteAgent = (agent: Agent) => {
    removeAgent(agent.id)
    toast('success', `已将「${agent.name}」移到回收站`)
    setDeleteTarget(null)
  }

  const handleRestoreAgent = (agent: Agent) => {
    restoreAgent(agent.id)
    toast('success', `已恢复角色「${agent.name}」`)
  }

  const handlePermanentDelete = (agent: Agent) => {
    permanentlyDeleteAgent(agent.id)
    toast('success', `已永久删除「${agent.name}」`)
    setPermanentDeleteTarget(null)
  }

  const handleRestoreTemplate = (id: string) => {
    restoreTemplate(id)
    toast('success', '已恢复模板')
  }

  const handleExport = (agent: Agent) => {
    const md = exportAgentToMD(agent)
    const filename = `${agent.name.replace(/[^\w一-鿿]/g, '_')}.md`
    downloadFile(filename, md)
    toast('success', `已导出「${agent.name}」角色文档`)
  }

  const handleImportClick = (agent: Agent) => {
    setImportTarget(agent)
  }

  const handleImportConfirm = () => {
    importFileRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !importTarget) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const md = ev.target?.result as string
      const parsed = parseAgentMD(md)
      if (!parsed || !parsed.name) {
        toast('error', '文件格式不正确，请检查 MD 文件格式')
        return
      }
      const updates: Partial<Agent> = {}
      if (parsed.name) updates.name = parsed.name
      if (parsed.avatar) updates.avatar = parsed.avatar
      if (parsed.tagline) updates.tagline = parsed.tagline
      if (parsed.color) updates.color = parsed.color
      if (parsed.category) updates.category = parsed.category
      if (parsed.focusDimension) updates.focusDimension = parsed.focusDimension
      if (parsed.expertise && parsed.expertise.length > 0) updates.expertise = parsed.expertise
      if (parsed.personality) updates.personality = parsed.personality
      if (parsed.behavior) updates.behavior = parsed.behavior
      if (parsed.system_prompt) updates.system_prompt = parsed.system_prompt
      updateAgent(importTarget!.id, updates)
      toast('success', `已导入角色配置到「${parsed.name}」`)
      setImportTarget(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleModalSaved = () => {
    setShowAddModal(false)
    setPresetModalTpl(null)
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">教研评审团</h1>
          <p className="text-sm text-gray-500 mt-1">创建和管理你的教研评审角色</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAddModalTab('preset'); setPresetModalTpl(null); setShowAddModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors cursor-pointer border-0"
          >
            <Plus className="h-4 w-4" /> 新增角色
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {[
            { key: 'recommend' as const, label: '推荐角色', icon: Sparkles },
            { key: 'manage' as const, label: `角色管理 (${agents.length})`, icon: Bot },
            { key: 'trash' as const, label: `回收站${trashCount > 0 ? ` (${trashCount})` : ''}`, icon: Recycle },
          ].map((tab) => {
            const TabIcon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-0',
                  activeTab === tab.key ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 bg-transparent'
                )}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
        {activeTab !== 'trash' && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索角色..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        )}
      </div>

      {/* ====== Recommend Tab ====== */}
      {activeTab === 'recommend' && (
        <div className="space-y-6">
          {/* Recently Used */}
          {recentlyUsedAgents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-700">最近使用</h3>
                <span className="text-xs text-gray-400">{recentlyUsedAgents.length} 个角色</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recentlyUsedAgents.map((agent) => (
                  <MiniAgentCard key={agent.id} agent={agent} onClick={() => setActiveTab('manage')} />
                ))}
              </div>
            </div>
          )}

          {/* Official Templates by Group */}
          {filteredTemplates.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                {search ? '没有匹配的模板' : '所有模板已隐藏，可以在回收站恢复'}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedTemplates.map((group) => (
                <TemplateGroup
                  key={group.label}
                  group={group}
                  templates={group.templates}
                  onUseTemplate={handleUseTemplate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== Manage Tab ====== */}
      {activeTab === 'manage' && (
        filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
            <Bot className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">还没有角色</p>
            <p className="text-sm text-gray-400 mt-1">从推荐页面添加模板，或通过自定义/AI方式创建角色</p>
            <div className="mt-4 flex justify-center gap-3">
              <button onClick={() => setActiveTab('recommend')}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer bg-white">
                浏览推荐
              </button>
              <button onClick={() => { setAddModalTab('custom'); setPresetModalTpl(null); setShowAddModal(true) }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0">
                <Plus className="h-4 w-4" /> 自定义创建
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAgents.map((agent) => (
              <AgentManageCard
                key={agent.id}
                agent={agent}
                onEdit={() => navigate(`/agents/${agent.id}/edit`)}
                onDelete={() => setDeleteTarget(agent)}
                onExport={() => handleExport(agent)}
                onImport={() => handleImportClick(agent)}
              />
            ))}
          </div>
        )
      )}

      {/* ====== Trash Tab ====== */}
      {activeTab === 'trash' && (
        <div className="space-y-6">
          {trashedAgents.length === 0 && hiddenTemplates.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
              <Recycle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">回收站是空的</p>
              <p className="text-sm text-gray-400 mt-1">删除的角色和隐藏的模板会出现在这里</p>
            </div>
          ) : (
            <>
              {trashedAgents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">已删除的角色 ({trashedAgents.length})</h3>
                  <div className="space-y-2">
                    {trashedAgents.map((agent) => {
                      const borderColor = AGENT_COLORS[agent.color]
                      return (
                        <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-xl shrink-0 opacity-60"
                            style={{ backgroundColor: borderColor + '15' }}>
                            {agent.avatar || agent.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-700">{agent.name}</h4>
                            <p className="text-xs text-gray-500">{agent.tagline}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleRestoreAgent(agent)}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer bg-white">
                              <RotateCcw className="h-3 w-3" /> 恢复
                            </button>
                            <button onClick={() => setPermanentDeleteTarget(agent)}
                              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer bg-white">
                              <Trash2 className="h-3 w-3" /> 永久删除
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {hiddenTemplates.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">已隐藏的模板 ({hiddenTemplates.length})</h3>
                  <div className="space-y-2">
                    {hiddenTemplates.map((tpl) => {
                      const borderColor = AGENT_COLORS[tpl.color]
                      return (
                        <div key={tpl.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-xl shrink-0 opacity-60"
                            style={{ backgroundColor: borderColor + '15' }}>
                            {tpl.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-700">{tpl.name}</h4>
                            <p className="text-xs text-gray-500">{tpl.tagline}</p>
                          </div>
                          <button onClick={() => handleRestoreTemplate(tpl.id)}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer bg-white shrink-0">
                            <RotateCcw className="h-3 w-3" /> 恢复
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ====== Modals ====== */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="移到回收站"
        description={deleteTarget ? `确定要将「${deleteTarget.name}」移到回收站吗？你可以在回收站中恢复。` : ''}
        confirmText="移到回收站" variant="danger"
        onConfirm={() => deleteTarget && handleDeleteAgent(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!permanentDeleteTarget}
        title="永久删除"
        description={permanentDeleteTarget ? `确定要永久删除「${permanentDeleteTarget.name}」吗？此操作不可撤销。` : ''}
        confirmText="永久删除" variant="danger"
        onConfirm={() => permanentDeleteTarget && handlePermanentDelete(permanentDeleteTarget)}
        onCancel={() => setPermanentDeleteTarget(null)}
      />
      {showAddModal && (
        <UnifiedAddModal
          initialTab={addModalTab}
          initialTemplate={presetModalTpl || undefined}
          onClose={() => { setShowAddModal(false); setPresetModalTpl(null) }}
          onSaved={handleModalSaved}
        />
      )}

      {/* Import confirm + file input */}
      <input ref={importFileRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleImportFile} />
      <ConfirmDialog
        open={!!importTarget}
        title="导入角色配置"
        description={importTarget ? `导入将覆盖「${importTarget.name}」的当前配置，是否继续？` : ''}
        confirmText="选择文件并导入"
        variant="danger"
        onConfirm={handleImportConfirm}
        onCancel={() => setImportTarget(null)}
      />
    </div>
  )
}
