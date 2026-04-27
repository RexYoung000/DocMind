import { useState, useMemo, useCallback } from 'react'
import {
  Settings,
  Plus,
  Trash2,
  Check,
  Zap,
  HelpCircle,
  Eye,
  EyeOff,
  Edit3,
  X,
  Info,
  Globe,
  Server,
  ChevronDown,
  Wifi,
  Loader2,
  Download,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useSettingsStore,
  PROVIDER_MODE_OPTIONS,
  MODEL_REGISTRY,
  resolveOfficialBaseUrl,
} from '@/stores/settingsStore'
import { testConnection } from '@/services/llmService'
import { toast as globalToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ModelConfig, ProviderMode, SavedModelProfile } from '@/types'

type FormValues = ModelConfig & { profileName: string }

const CAPABILITY_LABELS: Record<string, { label: string; color: string }> = {
  'text-only': { label: '纯文本', color: 'bg-gray-100 text-gray-600' },
  'vision': { label: '视觉理解', color: 'bg-blue-50 text-blue-600' },
  'multimodal': { label: '多模态', color: 'bg-emerald-50 text-emerald-600' },
}

function getDefaultForm(): FormValues {
  return {
    profileName: '',
    providerMode: 'official',
    model: '',
    apiKey: '',
    baseUrl: '',
    localEndpoint: '',
    maxConcurrentReviews: 1,
  }
}

function getFormFromProfile(profile: SavedModelProfile): FormValues {
  return {
    profileName: profile.name,
    ...profile.config,
  }
}

function TestConnectionButton() {
  const [testing, setTesting] = useState(false)
  return (
    <button
      onClick={async () => {
        setTesting(true)
        const result = await testConnection()
        setTesting(false)
        if (result.ok) {
          globalToast('success', `${result.message} 模型: ${result.model || ''}`)
        } else {
          globalToast('error', result.message)
        }
      }}
      disabled={testing}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer bg-white transition-colors disabled:opacity-50"
    >
      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
      {testing ? '测试中...' : '测试连接'}
    </button>
  )
}

export default function SettingsPage() {
  const {
    profiles,
    activeProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
    applyProfile,
  } = useSettingsStore()

  const initialProfile = activeProfileId
    ? profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
    : profiles[0]
  const [form, setForm] = useState<FormValues>(() => initialProfile ? getFormFromProfile(initialProfile) : getDefaultForm())
  const [selectedId, setSelectedId] = useState<string | null>(initialProfile?.id ?? null)
  const [isCreating, setIsCreating] = useState(profiles.length === 0)
  const [showApiKey, setShowApiKey] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedModelProfile | null>(null)
  const [clearDataConfirm, setClearDataConfirm] = useState(false)

  const modelInfo = useMemo(() => {
    const trimmed = form.model.toLowerCase().trim()
    return MODEL_REGISTRY.find(
      (m) => m.id.toLowerCase() === trimmed || m.displayName.toLowerCase() === trimmed
    )
  }, [form.model])

  const filteredModels = useMemo(() => {
    const trimmed = form.model.toLowerCase().trim()
    if (!trimmed) return MODEL_REGISTRY.slice(0, 12)
    return MODEL_REGISTRY.filter(
      (m) =>
        m.id.toLowerCase().includes(trimmed) ||
        m.displayName.toLowerCase().includes(trimmed) ||
        m.vendor.toLowerCase().includes(trimmed)
    ).slice(0, 12)
  }, [form.model])

  const startCreate = useCallback(() => {
    setSelectedId(null)
    setIsCreating(true)
    setForm(getDefaultForm())
    setErrors({})
  }, [])

  const selectProfile = useCallback((profile: SavedModelProfile) => {
    setSelectedId(profile.id)
    setIsCreating(false)
    setForm(getFormFromProfile(profile))
    setErrors({})
  }, [])

  const updateField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.profileName.trim()) errs.profileName = '请输入配置名称'
    if (!form.model.trim()) errs.model = '请输入模型名称'
    if (!form.apiKey.trim()) errs.apiKey = '请输入 API Key'
    if (form.providerMode === 'official' && form.model.trim()) {
      if (!resolveOfficialBaseUrl(form.model.trim())) {
        errs.model = '官方模式无法识别此模型，请切换到第三方兼容模式'
      }
    }
    if (form.providerMode === 'third-party' && !form.baseUrl.trim()) {
      errs.baseUrl = '第三方模式必须填写 Base URL'
    }
    if (form.providerMode === 'local' && !form.localEndpoint.trim()) {
      errs.localEndpoint = '本地模式必须填写本地地址'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = () => {
    if (!validate()) return

    const { profileName, ...config } = form
    const name = profileName.trim() || `${form.providerMode === 'official' ? '官方' : form.providerMode === 'third-party' ? '第三方' : '本地'} - ${form.model || '未命名'}`

    if (isCreating) {
      const profile = addProfile(name, config)
      setSelectedId(profile.id)
      setIsCreating(false)
      globalToast('success', `配置"${name}"已创建`)
    } else if (selectedId) {
      updateProfile(selectedId, name, config)
      globalToast('success', `配置"${name}"已保存`)
    }
  }

  const handleApply = () => {
    if (!validate()) return

    const { profileName, ...config } = form
    const name = profileName.trim() || `${form.providerMode === 'official' ? '官方' : form.providerMode === 'third-party' ? '第三方' : '本地'} - ${form.model || '未命名'}`

    if (isCreating) {
      const profile = addProfile(name, config)
      applyProfile(profile.id)
      setSelectedId(profile.id)
      setIsCreating(false)
      globalToast('success', `配置"${name}"已创建并应用`)
    } else if (selectedId) {
      updateProfile(selectedId, name, config)
      applyProfile(selectedId)
      globalToast('success', `已切换到配置"${name}"`)
    }
  }

  const handleDelete = (profile: SavedModelProfile) => {
    deleteProfile(profile.id)
    if (profile.id === selectedId) {
      const remaining = profiles.filter((p) => p.id !== profile.id)
      if (remaining.length > 0) selectProfile(remaining[0])
      else startCreate()
    }
    globalToast('success', `已删除配置"${profile.name}"`)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary-500" /> 设置
          </h1>
          <p className="text-sm text-gray-500 mt-1">管理 AI 模型配置，设置 API Key 和接口地址</p>
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer bg-white"
        >
          <HelpCircle className="h-4 w-4" /> 配置帮助
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left - Profile List */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">配置列表</h3>
              <button
                onClick={startCreate}
                className="flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 cursor-pointer border-0"
              >
                <Plus className="h-3 w-3" /> 新增
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {profiles.length === 0 && !isCreating ? (
                <div className="py-8 text-center">
                  <Settings className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">暂无配置</p>
                  <button
                    onClick={startCreate}
                    className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700 bg-transparent border-0 cursor-pointer"
                  >
                    创建第一套配置
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {profiles.map((profile) => {
                    const isSelected = !isCreating && selectedId === profile.id
                    const isActive = activeProfileId === profile.id
                    const entry = MODEL_REGISTRY.find((m) => m.id === profile.config.model)

                    return (
                      <div
                        key={profile.id}
                        onClick={() => selectProfile(profile)}
                        className={cn(
                          'flex items-center justify-between px-4 py-3 cursor-pointer transition-colors border-l-[3px]',
                          isSelected
                            ? 'bg-primary-50 border-l-primary-500'
                            : 'border-l-transparent hover:bg-gray-50'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('text-sm font-medium truncate', isSelected ? 'text-primary-700' : 'text-gray-900')}>
                              {profile.name}
                            </span>
                            {isActive && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 shrink-0">
                                <Zap className="h-2.5 w-2.5" /> 使用中
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-500 truncate">
                              {profile.config.model || '未设置模型'}
                            </span>
                            {entry && (
                              <span className={cn('rounded-full px-1.5 py-0 text-[10px] font-medium', CAPABILITY_LABELS[entry.capability]?.color)}>
                                {CAPABILITY_LABELS[entry.capability]?.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(profile)
                          }}
                          className="ml-2 text-gray-300 hover:text-red-500 bg-transparent border-0 cursor-pointer shrink-0 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right - Edit Form */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Edit3 className="h-5 w-5 text-primary-500" />
              <h3 className="text-base font-semibold text-gray-900">
                {isCreating ? '新建配置' : '编辑配置'}
              </h3>
              {!isCreating && selectedId && activeProfileId === selectedId && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  <Zap className="h-3 w-3" /> 当前使用中
                </span>
              )}
            </div>

            <div className="space-y-5">
              {/* Profile Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">配置名称</label>
                <input
                  type="text"
                  value={form.profileName}
                  onChange={(e) => updateField('profileName', e.target.value)}
                  placeholder="例如：OpenAI 官方、DeepSeek 中转站、本地 Ollama"
                  className={cn(
                    'w-full rounded-lg border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500/20',
                    errors.profileName ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
                  )}
                />
                {errors.profileName && <p className="text-xs text-red-500 mt-1">{errors.profileName}</p>}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Provider Mode + Model */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider 模式</label>
                  <div className="relative">
                    <select
                      value={form.providerMode}
                      onChange={(e) => updateField('providerMode', e.target.value as ProviderMode)}
                      className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    >
                      {PROVIDER_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {form.providerMode === 'official' && '官方模式会自动推断接口地址'}
                    {form.providerMode === 'third-party' && '需要手动填写中转站 Base URL'}
                    {form.providerMode === 'local' && '使用本地部署的模型服务'}
                  </p>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">模型名称</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => {
                      updateField('model', e.target.value)
                      setModelDropdownOpen(true)
                    }}
                    onFocus={() => setModelDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setModelDropdownOpen(false), 200)}
                    placeholder="例如：gpt-4o、deepseek-chat、qwen-max"
                    className={cn(
                      'w-full rounded-lg border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500/20',
                      errors.model ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
                    )}
                  />
                  {errors.model && <p className="text-xs text-red-500 mt-1">{errors.model}</p>}

                  {/* Model Dropdown */}
                  {modelDropdownOpen && filteredModels.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {filteredModels.map((m) => (
                        <button
                          key={m.id}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            updateField('model', m.id)
                            setModelDropdownOpen(false)
                          }}
                          className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer border-0 bg-transparent text-left"
                        >
                          <span className="font-medium text-gray-900">{m.displayName}</span>
                          <span className="flex items-center gap-2 text-xs text-gray-500">
                            {m.vendor}
                            <span className={cn('rounded-full px-1.5 py-0 text-[10px] font-medium', CAPABILITY_LABELS[m.capability]?.color)}>
                              {CAPABILITY_LABELS[m.capability]?.label}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Model Info Alert */}
              {form.model.trim() && (
                <div className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 text-sm',
                  modelInfo
                    ? modelInfo.capability === 'multimodal'
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700'
                      : modelInfo.capability === 'vision'
                        ? 'bg-blue-50/50 border-blue-200 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    : 'bg-amber-50/50 border-amber-200 text-amber-700'
                )}>
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    {modelInfo ? (
                      <>
                        <span className={cn('inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium mr-1.5', CAPABILITY_LABELS[modelInfo.capability]?.color)}>
                          {CAPABILITY_LABELS[modelInfo.capability]?.label}
                        </span>
                        <span className="text-xs">{modelInfo.vendor} · {modelInfo.displayName}</span>
                        {modelInfo.capability === 'text-only' && (
                          <p className="text-xs mt-1 opacity-80">该模型是纯文本模型，不支持图片识别。</p>
                        )}
                        {(modelInfo.capability === 'vision' || modelInfo.capability === 'multimodal') && (
                          <p className="text-xs mt-1 opacity-80">该模型支持图片理解，可用于含图片文档的解析。</p>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-700 mr-1.5">
                          未识别模型
                        </span>
                        <span className="text-xs">{form.model.trim()}</span>
                        <p className="text-xs mt-1 opacity-80">当前模型不在已知列表中。官方模式会按前缀推断接口地址。</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Conditional: Base URL (third-party) */}
              {form.providerMode === 'third-party' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Base URL</label>
                  <input
                    type="text"
                    value={form.baseUrl}
                    onChange={(e) => updateField('baseUrl', e.target.value)}
                    placeholder="填写中转站或兼容 OpenAI 的接口根地址"
                    className={cn(
                      'w-full rounded-lg border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500/20',
                      errors.baseUrl ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
                    )}
                  />
                  <p className="text-xs text-gray-400 mt-1">示例：https://api.digitflow.cfd/v1</p>
                  {errors.baseUrl && <p className="text-xs text-red-500 mt-1">{errors.baseUrl}</p>}
                </div>
              )}

              {/* Conditional: Local Endpoint */}
              {form.providerMode === 'local' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">本地模型地址</label>
                  <input
                    type="text"
                    value={form.localEndpoint}
                    onChange={(e) => updateField('localEndpoint', e.target.value)}
                    placeholder="填写本地模型服务地址"
                    className={cn(
                      'w-full rounded-lg border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500/20',
                      errors.localEndpoint ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
                    )}
                  />
                  <p className="text-xs text-gray-400 mt-1">示例：http://127.0.0.1:11434/v1</p>
                  {errors.localEndpoint && <p className="text-xs text-red-500 mt-1">{errors.localEndpoint}</p>}
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => updateField('apiKey', e.target.value)}
                    placeholder="输入 API Key"
                    className={cn(
                      'w-full rounded-lg border bg-white px-4 py-2.5 pr-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500/20',
                      errors.apiKey ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {form.providerMode === 'official' && '官方模式只需要 API Key 和模型名称，接口地址会自动推断。'}
                  {form.providerMode === 'third-party' && '第三方兼容模式请填写中转站提供的 API Key。'}
                  {form.providerMode === 'local' && '如果本地服务启用了鉴权，这里填写对应密钥。'}
                </p>
                {errors.apiKey && <p className="text-xs text-red-500 mt-1">{errors.apiKey}</p>}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Concurrent Reviews */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  评审并发数
                </label>
                <div className="relative">
                  <select
                    value={form.maxConcurrentReviews ?? 1}
                    onChange={(e) => updateField('maxConcurrentReviews', Number(e.target.value))}
                    className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value={1}>串行（逐个评审，稳定推荐）</option>
                    <option value={2}>2 个并行</option>
                    <option value={3}>3 个并行</option>
                    <option value={5}>全部并行（最快）</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {(form.maxConcurrentReviews ?? 1) > 1 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>并行评审会同时发起多个 API 请求，请确认您的模型服务商支持并发调用，否则可能触发限流或报错。</span>
                  </div>
                )}
              </div>

              <div className="h-px bg-gray-100" />
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer bg-white transition-colors"
                >
                  <Check className="h-4 w-4" />
                  {isCreating ? '保存配置' : '保存修改'}
                </button>
                <button
                  onClick={handleApply}
                  className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0 transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  {isCreating ? '保存并应用' : '应用此配置'}
                </button>
                <TestConnectionButton />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Download className="h-5 w-5 text-primary-500" /> 数据管理
        </h3>
        <p className="text-sm text-gray-500 mb-4">所有数据存储在浏览器本地 (localStorage)。你可以导出备份或清除数据。</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              const data: Record<string, string> = {}
              const keys = ['docmind-documents', 'docmind-reviews', 'docmind-agents', 'docmind-chat', 'docmind-activities', 'docmind-settings']
              for (const key of keys) {
                const val = localStorage.getItem(key)
                if (val) data[key] = val
              }
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `DocMind_备份_${new Date().toISOString().slice(0, 10)}.json`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
              globalToast('success', '数据已导出')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer bg-white transition-colors"
          >
            <Download className="h-4 w-4" /> 导出数据 (JSON)
          </button>
          <button
            onClick={() => setClearDataConfirm(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer bg-white transition-colors"
          >
            <AlertTriangle className="h-4 w-4" /> 清除数据（保留配置）
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除配置"
        description={deleteTarget ? `确定要删除配置"${deleteTarget.name}"吗？此操作不可撤销。` : ''}
        confirmText="删除"
        variant="danger"
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={clearDataConfirm}
        title="清除数据"
        description="确定要清除所有本地数据吗？此操作不可撤销。API 配置和角色将保留。"
        confirmText="确认清除"
        variant="danger"
        onConfirm={() => {
          const keys = ['docmind-documents', 'docmind-reviews', 'docmind-chat', 'docmind-activities']
          for (const key of keys) localStorage.removeItem(key)
          globalToast('success', '文档、评审、聊天数据已清除（API 配置和 Agent 已保留）')
          setClearDataConfirm(false)
          setTimeout(() => window.location.reload(), 1000)
        }}
        onCancel={() => setClearDataConfirm(false)}
      />

      {/* Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setHelpOpen(false)}>
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl animate-slide-up max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">模型配置帮助</h3>
              <button onClick={() => setHelpOpen(false)} className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-600">
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-blue-500" /> 官方模式
                </h4>
                <p>适用于 OpenAI、Anthropic、Google Gemini、DeepSeek、阿里云/Qwen、智谱/GLM、Moonshot/Kimi、xAI/Grok、百度/ERNIE、字节跳动/Doubao、MiniMax、Mistral 等官方接口。只需填写模型名称和 API Key，系统会自动匹配对应的官方 Base URL。</p>
              </div>

              <div className="rounded-lg bg-purple-50 border border-purple-100 p-4">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                  <Server className="h-4 w-4 text-purple-500" /> 第三方兼容模式
                </h4>
                <p>适用于各类中转站、代理站或兼容 OpenAI 协议的平台。此模式必须手动填写 Base URL、API Key 和模型名称。</p>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                  <Server className="h-4 w-4 text-emerald-500" /> 本地模式
                </h4>
                <p>适用于本地部署模型服务，例如 Ollama 或其他本地兼容接口。此模式使用你填写的本地端点地址作为请求入口。</p>
              </div>

              <div className="h-px bg-gray-100" />

              <div>
                <h4 className="font-semibold text-gray-900 mb-2">常见问题</h4>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-gray-800">为什么官方模式没有 Base URL 输入框？</p>
                    <p className="text-gray-500 mt-0.5">因为官方模式由系统自动决定接口地址，避免误填导致调用失败。</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">第三方中转站一直报错怎么办？</p>
                    <p className="text-gray-500 mt-0.5">先确认 Base URL 是接口根地址而不是控制台网页地址，并确保模型名是中转站实际支持的标识。</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">配置保存在哪里？</p>
                    <p className="text-gray-500 mt-0.5">配置存储在浏览器本地，不会上传到服务器。清除浏览器数据会导致配置丢失。</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setHelpOpen(false)}
                className="w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer border-0"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
