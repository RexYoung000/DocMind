import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-primary-50">
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-primary-600 to-primary-700 p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <Sparkles className="h-10 w-10" />
            <span className="text-3xl font-bold">DocMind</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            多角色 AI
            <br />
            文档评审平台
          </h1>
          <p className="text-lg text-white/80 leading-relaxed">
            上传文档，多角色多维度交叉评审，全面分析内容质量。
            进入聊天室深度研讨，发现改进空间，推动内容优化。
          </p>
          <div className="mt-10 flex gap-4">
            {['📐 逻辑官', '🔍 分析师', '🎨 创意官', '📋 体验师'].map((name) => (
              <div
                key={name}
                className="rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-sm font-medium"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center text-primary-600">
            <Sparkles className="h-8 w-8" />
            <span className="text-2xl font-bold">DocMind</span>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
