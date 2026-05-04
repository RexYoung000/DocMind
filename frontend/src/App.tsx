import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ToastContainer } from '@/components/ui/Toast'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const DocumentListPage = lazy(() => import('@/pages/documents/DocumentListPage'))
const DocumentDetailPage = lazy(() => import('@/pages/documents/DocumentDetailPage'))
const AgentListPage = lazy(() => import('@/pages/agents/AgentListPage'))
const AgentCreatePage = lazy(() => import('@/pages/agents/AgentCreatePage'))
const AgentEditPage = lazy(() => import('@/pages/agents/AgentEditPage'))
const ReviewListPage = lazy(() => import('@/pages/reviews/ReviewListPage'))
const ReviewCreatePage = lazy(() => import('@/pages/reviews/ReviewCreatePage'))
const ReviewDetailPage = lazy(() => import('@/pages/reviews/ReviewDetailPage'))
const CompareReportPage = lazy(() => import('@/pages/reviews/CompareReportPage'))
const ChatListPage = lazy(() => import('@/pages/chat/ChatListPage'))
const ChatRoomPage = lazy(() => import('@/pages/chat/ChatRoomPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="dm-panel flex items-center gap-3 rounded-2xl px-5 py-4 text-sm text-gray-600">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary-200 border-t-primary-600" />
        正在加载内容...
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastContainer />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentListPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/agents" element={<AgentListPage />} />
            <Route path="/agents/create" element={<AgentCreatePage />} />
            <Route path="/agents/:id/edit" element={<AgentEditPage />} />
            <Route path="/reviews" element={<ReviewListPage />} />
            <Route path="/reviews/create" element={<ReviewCreatePage />} />
            <Route path="/reviews/:id" element={<ReviewDetailPage />} />
            <Route path="/reviews/compare/:reviewId" element={<CompareReportPage />} />
            <Route path="/chat" element={<ChatListPage />} />
            <Route path="/chat/:id" element={<ChatRoomPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
