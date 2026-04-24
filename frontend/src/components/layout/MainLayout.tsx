import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function MainLayout() {
  return (
    <div className="dm-shell min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 animate-fade-in">
        <Outlet />
      </main>
    </div>
  )
}
