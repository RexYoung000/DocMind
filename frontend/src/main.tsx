import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initTheme } from './stores/themeStore'

const STALE_CHUNK_RELOAD_KEY = 'docmind-stale-chunk-reloaded'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()

  try {
    if (!sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1')
      window.location.reload()
      return
    }
  } catch {
    // Ignore storage access errors and fall through to a normal navigation.
  }

  window.location.replace(window.location.pathname + window.location.search + window.location.hash)
})

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
