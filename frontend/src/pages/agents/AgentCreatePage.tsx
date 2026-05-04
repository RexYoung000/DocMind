import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Send, Sparkles, Check, Dices, Undo2, Wand2 } from 'lucide-react'
import { AGENT_COLORS, useAgentStore } from '@/stores/agentStore'
import { useAuthStore } from '@/stores/authStore'
import { chatCompletion, LLMError, optimizePrompt, continuePrompt } from '@/services/llmService'
import { isModelConfigValid } from '@/stores/settingsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/components/ui/Toast'
import { createId } from '@/utils/id'
import type { Agent, AgentColor, AgentCategory } from '@/types'
import { cn } from '@/lib/utils'

const ALL_COLORS: AgentColor[] = ['indigo', 'violet', 'pink', 'orange', 'teal', 'sky', 'slate', 'green', 'rose', 'amber', 'emerald', 'cyan']

interface ChatMsg {
  role: 'ai' | 'user'
  content: string
}

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
  "personality": {
    "directness": 3,
    "strictness": 4,
    "humor": 2,
    "empathy": 3
  },
  "expertise": ["专长1", "专长2", "专长3", "专长4"],
  "behavior": {
    "style": "说话风格描述",
    "catchphrase": "口头禅（有性格特色）"
  },
  "system_prompt": "完整的人物设定，包含角色身份、说话方式、专业背景、评审原则。要明确不评价课件交互逻辑和功能设计，专注于教研内容。"
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
  "personality": {
    "directness": 随机1-5,
    "strictness": 随机1-5,
    "humor": 随机1-5,
    "empathy": 随机1-5
  },
  "expertise": ["专长1", "专长2", "专长3"],
  "behavior": {
    "style": "说话风格描述",
    "catchphrase": "有个性的口头禅"
  },
  "system_prompt": "完整的人物设定，包含教育角色身份、说话方式和评审原则。明确不评价课件交互逻辑。"
}`

const INITIAL_MESSAGES: ChatMsg[] = [
  {
    role: 'ai',
    content: '你好！让我们一起创建一个教研评审角色吧 🎭\n\n首先，你想创建什么类型的角色？\n\nA. 👨‍🏫 教研老师视角 — 专业的教学设计审视\nB. 🎒 学生视角 — 模拟学生的学习感受\nC. 👨‍👩‍👧 家长视角 — 家长对教学的关注点\nD. 🎭 自定义视角 — 完全自由设计\n\n输入字母选择，或直接告诉我你想要的角色！',
  },
]

function parseAgentJSON(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.name || !parsed.personality) return null
    return parsed
  } catch {
    return null
  }
}

export default function AgentCreatePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const addAgent = useAgentStore((s) => s.addAgent)
  const config = useSettingsStore((s) => s.currentConfig)
  const hasValidConfig = isModelConfigValid(config)

  const [messages, setMessages] = useState<ChatMsg[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{
    name: string; avatar: string; tagline: string; color: AgentColor
    category?: AgentCategory; focusDimension?: string
    personality: { directness: number; strictness: number; humor: number; empathy: number }
    expertise: string[]; behavior: { style: string; catchphrase: string }; system_prompt: string
  } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [aiLoading, setAiLoading] = useState<'optimize' | 'continue' | null>(null)
  const [undoSystemPrompt, setUndoSystemPrompt] = useState<string | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleOptimizePreview = async () => {
    if (!preview?.system_prompt?.trim()) return
    setUndoSystemPrompt(preview.system_prompt)
    setAiLoading('optimize')
    try {
      const result = await optimizePrompt(preview.system_prompt, {
        onChunk: () => {},
        onDone: (text) => setPreview((p) => p ? { ...p, system_prompt: text } : p),
        onError: (err) => toast('error', `AI优化失败: ${err.message}`),
      })
      if (result) setPreview((p) => p ? { ...p, system_prompt: result } : p)
    } catch { /* handled by onError */ } finally { setAiLoading(null) }
  }

  const handleContinuePreview = async () => {
    if (!preview?.system_prompt?.trim()) return
    setUndoSystemPrompt(preview.system_prompt)
    setAiLoading('continue')
    try {
      const result = await continuePrompt(preview.system_prompt, {
        onChunk: () => {},
        onDone: () => {},
        onError: (err) => toast('error', `AI续写失败: ${err.message}`),
      })
      if (result) setPreview((p) => p ? { ...p, system_prompt: p.system_prompt + '\n\n' + result } : p)
    } catch { /* handled by onError */ } finally { setAiLoading(null) }
  }

  const handleUndoPreview = () => {
    if (undoSystemPrompt !== null && preview) {
      setPreview({ ...preview, system_prompt: undoSystemPrompt })
      setUndoSystemPrompt(null)
    }
  }

  const processLLMResponse = (text: string) => {
    const parsed = parseAgentJSON(text)
    if (parsed) {
      const validColor = ALL_COLORS.includes(parsed.color) ? parsed.color : ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]
      const previewData = {
        name: parsed.name,
        avatar: parsed.avatar || '🤖',
        tagline: parsed.tagline || '',
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
        role: 'ai',
        content: `角色「${previewData.name}」已生成！\n\n请在右侧预览卡片中查看详情。如果满意，点击"保存角色"即可。\n\n不满意？继续告诉我哪里需要调整。`,
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
      setMessages((prev) => [...prev, {
        role: 'ai',
        content: '你还没有配置 API Key，请先到「设置」页面配置模型和 API Key。\n\n配置完成后回来继续创建角色。',
      }])
      setLoading(false)
      return
    }

    const conversationMsgs = messages
      .concat([{ role: 'user', content: userMsg }])
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }))

    try {
      await chatCompletion(
        [{ role: 'system', content: GUIDED_CREATION_PROMPT }, ...conversationMsgs],
        {
          onChunk: () => {},
          onDone: (text) => processLLMResponse(text),
          onError: (err) => {
            setMessages((prev) => [...prev, { role: 'ai', content: `出错了：${err.message}` }])
          },
        }
      )
    } catch (err) {
      const message = err instanceof LLMError ? err.message : '请求失败，请检查网络连接'
      setMessages((prev) => [...prev, { role: 'ai', content: message }])
    }
    setLoading(false)
  }

  const handleRandomGenerate = async () => {
    if (loading) return
    if (!hasValidConfig) {
      toast('info', '请先到设置页面配置 API Key')
      return
    }
    setMessages((prev) => [...prev, { role: 'user', content: '🎲 随机生成一个角色！' }])
    setLoading(true)

    try {
      await chatCompletion(
        [{ role: 'system', content: RANDOM_AGENT_PROMPT }, { role: 'user', content: '请随机生成一个独特有趣的教研评审角色' }],
        {
          onChunk: () => {},
          onDone: (text) => processLLMResponse(text),
          onError: (err) => {
            setMessages((prev) => [...prev, { role: 'ai', content: `出错了：${err.message}` }])
          },
        }
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
      id: createId(),
      owner_id: user?.id || '',
      name: preview.name,
      avatar: preview.avatar,
      tagline: preview.tagline,
      personality: preview.personality,
      expertise: preview.expertise,
      behavior: preview.behavior,
      system_prompt: preview.system_prompt,
      source: 'custom',
      is_public: false,
      usage_count: 0,
      color: preview.color,
      category: preview.category,
      focusDimension: preview.focusDimension as Agent['focusDimension'],
      creation_history: messages.map((m) => ({ role: m.role, content: m.content })),
      created_at: new Date().toISOString(),
    }
    addAgent(agent)
    toast('success', `角色「${preview.name}」已保存！`)
    navigate('/agents')
  }

  const categoryLabels: Record<string, string> = { teacher: '教研老师', student: '学生', parent: '家长' }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/agents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 no-underline">
        <ArrowLeft className="h-4 w-4" /> 返回教研评审团
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">创建教研评审角色</h1>
          <p className="text-sm text-gray-500 mt-1">
            {hasValidConfig
              ? '通过对话引导创建教研老师、学生或家长视角的评审角色'
              : '请先到设置页面配置 API Key，然后回来创建角色'}
          </p>
        </div>
        <button
          onClick={handleRandomGenerate}
          disabled={loading || !hasValidConfig}
          className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="随机抽一个角色"
        >
          <Dices className="h-4 w-4" />
          随机生成
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col" style={{ height: '600px' }}>
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary-500" /> 教育专属引导
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user' ? 'bg-primary-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-700 rounded-tl-sm'
                  }`}
                >
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

          <div className="border-t border-gray-100 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="输入你的选择或描述..."
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">角色预览</h3>

            {preview ? (
              <div>
                <div
                  className="rounded-xl border-l-[3px] border border-gray-100 p-4 mb-4"
                  style={{ borderLeftColor: AGENT_COLORS[preview.color] }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                      style={{ backgroundColor: AGENT_COLORS[preview.color] + '15', boxShadow: `0 0 0 2px ${AGENT_COLORS[preview.color]}` }}
                    >
                      {preview.avatar}
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{preview.name}</h4>
                      <p className="text-xs text-gray-500">{preview.tagline}</p>
                    </div>
                  </div>

                  {preview.category && (
                    <div className="mb-3">
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary-50 text-primary-600 border border-primary-200">
                        {categoryLabels[preview.category] || preview.category}
                      </span>
                      {preview.focusDimension && (
                        <span className="inline-block ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                          {preview.focusDimension}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5 mb-3">
                    {Object.entries(preview.personality).map(([key, val]) => {
                      const labels: Record<string, string> = { directness: '直接度', strictness: '严格度', humor: '幽默感', empathy: '共情力' }
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="w-12 text-gray-500">{labels[key]}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                            <div className="h-full rounded-full" style={{ width: `${val * 20}%`, backgroundColor: AGENT_COLORS[preview.color] }} />
                          </div>
                          <span className="text-gray-400 w-5 text-right">{val}/5</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {preview.expertise.map((e) => (
                      <span key={e} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: AGENT_COLORS[preview.color] + '15', color: AGENT_COLORS[preview.color] }}>
                        {e}
                      </span>
                    ))}
                  </div>

                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">人物设定</span>
                      <div className="flex items-center gap-1">
                        {undoSystemPrompt !== null && (
                          <button onClick={handleUndoPreview} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 cursor-pointer border-0 bg-transparent" title="撤销">
                            <Undo2 className="h-2.5 w-2.5" /> 撤销
                          </button>
                        )}
                        <button
                          onClick={handleOptimizePreview}
                          disabled={!preview.system_prompt?.trim() || aiLoading !== null}
                          className="flex items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {aiLoading === 'optimize' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Wand2 className="h-2.5 w-2.5" />}
                          AI优化
                        </button>
                        <button
                          onClick={handleContinuePreview}
                          disabled={!preview.system_prompt?.trim() || aiLoading !== null}
                          className="flex items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {aiLoading === 'continue' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                          AI续写
                        </button>
                      </div>
                    </div>
                    <p className={cn('text-xs text-gray-600 leading-relaxed', !preview.system_prompt?.trim() && 'text-gray-400 italic')}>
                      {preview.system_prompt?.trim() || '可以尝试给角色增加一些人物设定哦'}
                    </p>
                  </div>

                  {preview.behavior.catchphrase && (
                    <p className="text-xs text-gray-400 italic">"{preview.behavior.catchphrase}"</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0"
                  >
                    <Check className="h-4 w-4" /> 保存角色
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">完成对话引导后，角色预览会在这里显示</p>
                <p className="text-xs text-gray-400 mt-1">也可以点击"随机生成"快速抽一个</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
