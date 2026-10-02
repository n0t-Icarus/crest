import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Base layers first: tokens and the shared panel/reset rules must land before
// component CSS so component modules can override them.
import '@/styles/tokens.css'
import '@/styles/global.css'
import { App } from '@/app/App'
import { bootstrapAppearance } from '@/app/appearance'
import { revealWindow } from '@/windows/tauri'

// Apply the persisted theme before the first paint: no flash of default accent.
bootstrapAppearance()

const container = document.getElementById('root')
if (!container) throw new Error('Crest failed to find its root container')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The desktop window starts hidden to avoid an empty frame; reveal it as soon as
// the first frame is on screen. In a browser this is a no-op.
requestAnimationFrame(() => {
  void revealWindow()
})
