import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { THEME_OPTIONS, useThemeStore } from '@/stores/themeStore'
import {
  FileText,
  Bot,
  ClipboardCheck,
  MessageCircle,
  Settings,
  Trash2,
  ChevronDown,
  LayoutDashboard,
  Sparkles,
  Menu,
  X,
  Moon,
  Sun,
  Monitor,
  Search,
} from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const NAV_ITEMS = [
  { path: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { path: '/documents', label: '教研案', icon: FileText },
  { path: '/agents', label: '评审团', icon: Bot },
  { path: '/reviews', label: '评审大厅', icon: ClipboardCheck },
  { path: '/chat', label: '教研研讨', icon: MessageCircle },
]

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [clearDataConfirm, setClearDataConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const prevPathnameRef = useRef(location.pathname)

  if (location.pathname !== prevPathnameRef.current) {
    prevPathnameRef.current = location.pathname
    if (mobileNavOpen) setMobileNavOpen(false)
  }

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const themeLabel = theme === 'light' ? '亮色模式' : theme === 'dark' ? '暗色模式' : '跟随系统'
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 h-14 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4 md:gap-8">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer border-0 bg-transparent"
              aria-label="打开导航菜单"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/dashboard" className="flex items-center gap-2 text-primary-600 font-bold text-lg no-underline">
              <Sparkles className="h-6 w-6" />
              <span>DocMind</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors no-underline',
                      isActive
                        ? 'bg-primary-100 text-primary-600'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openSearch}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              <span>搜索...</span>
              <kbd className="rounded border border-gray-200 px-1 py-0 text-[10px] font-medium">⌘K</kbd>
            </button>
            <button
              onClick={openSearch}
              className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
              aria-label="搜索"
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setThemeMenuOpen((prev) => !prev)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer"
                aria-label={themeLabel}
                title={themeLabel}
              >
                <ThemeIcon className="h-4 w-4" />
              </button>
              {themeMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg animate-fade-in">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTheme(option.value)
                        setThemeMenuOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer border-0 bg-transparent',
                        theme === option.value
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <span>{option.label}</span>
                      {theme === option.value && <span className="text-[10px]">选中</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600 text-xs font-bold">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <span className="hidden sm:inline">{user?.name || '用户'}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg animate-fade-in">
                <div className="border-b border-gray-100 px-4 py-2">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={() => { navigate('/settings'); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer border-0 bg-transparent"
                >
                  <Settings className="h-4 w-4" />
                  设置
                </button>
                <button
                  onClick={() => {
                    setClearDataConfirm(true)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer border-0 bg-transparent"
                >
                  <Trash2 className="h-4 w-4" />
                  重置所有数据
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <nav className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl animate-slide-right flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <Link to="/dashboard" className="flex items-center gap-2 text-primary-600 font-bold text-lg no-underline" onClick={() => setMobileNavOpen(false)}>
                <Sparkles className="h-6 w-6" />
                <span>DocMind</span>
              </Link>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer border-0 bg-transparent"
                aria-label="关闭导航菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors no-underline mb-0.5',
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
            <div className="border-t border-gray-200 p-4">
              <Link
                to="/settings"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 no-underline"
              >
                <Settings className="h-5 w-5" />
                设置
              </Link>
            </div>
          </nav>
        </div>
      )}

      <CommandPalette open={searchOpen} onClose={closeSearch} />

      <ConfirmDialog
        open={clearDataConfirm}
        title="重置所有本地数据"
        description="这将清空教研案、评审角色、评审记录以及 API 配置等所有本地数据，此操作不可撤销。"
        confirmText="确认重置"
        variant="danger"
        onConfirm={() => {
          localStorage.clear()
          window.location.reload()
        }}
        onCancel={() => setClearDataConfirm(false)}
      />
    </>
  )
}
