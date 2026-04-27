import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Bot, ClipboardCheck, MessageCircle, ArrowRight, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    icon: Sparkles,
    title: '欢迎使用 DocMind',
    description: 'DocMind 是一个多角色 AI 文档评审平台。多个 AI 角色从不同角度评审你的文档，帮助你发现改进空间。',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: FileText,
    title: '1. 上传文档',
    description: '首先到文档中心上传你的文档。支持 PDF、DOC、DOCX、Markdown 和纯文本格式，系统会自动解析文档内容。',
    action: '/documents',
    actionLabel: '前往文档中心',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Bot,
    title: '2. 添加评审角色',
    description: '在角色工坊选择预设角色（如教育专家、产品经理），或自定义创建你专属的评审角色。',
    action: '/agents',
    actionLabel: '前往角色工坊',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: ClipboardCheck,
    title: '3. 发起评审',
    description: '选择文档和角色，发起多角色评审。每个角色会独立给出评分、观点和修改建议。',
    action: '/reviews/create',
    actionLabel: '发起评审',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: MessageCircle,
    title: '4. 角色辩论',
    description: '评审完成后，你可以让角色们进入聊天室，围绕争议点展开辩论，深入探讨每个建议。',
    color: 'bg-amber-50 text-amber-600',
  },
]

const STORAGE_KEY = 'docmind-onboarding-completed'

export function OnboardingGuide() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY))

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
  }

  const handleAction = (action?: string) => {
    if (action) {
      handleComplete()
      navigate(action)
    } else {
      handleComplete()
    }
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleComplete}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl animate-slide-up mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-6 bg-primary-600' : i < step ? 'w-3 bg-primary-300' : 'w-3 bg-gray-200'
                )}
              />
            ))}
          </div>
          <button
            onClick={handleComplete}
            className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer"
            aria-label="跳过引导"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="text-center py-4">
          <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4', current.color)}>
            <Icon className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{current.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{current.description}</p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => step > 0 && setStep(step - 1)}
            disabled={step === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-0 cursor-pointer border-0 bg-transparent transition-all"
          >
            上一步
          </button>
          <div className="flex gap-2">
            {isLast ? (
              <>
                <button
                  onClick={handleComplete}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  我已了解
                </button>
                {current.action && (
                  <button
                    onClick={() => handleAction(current.action)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0 transition-colors"
                  >
                    {current.actionLabel} <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              <>
                {current.action && (
                  <button
                    onClick={() => handleAction(current.action)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    {current.actionLabel}
                  </button>
                )}
                <button
                  onClick={() => setStep(step + 1)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0 transition-colors"
                >
                  下一步 <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
