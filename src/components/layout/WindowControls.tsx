import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/utils/cn'
import { closeWindow, isTauri, isWindowMaximized, minimizeWindow, onWindowResized, toggleMaximizeWindow } from '@/windows/tauri'
import styles from './WindowControls.module.css'

/**
 * Window controls for the frameless window (minimise / maximise / close), drawn
 * to match the reference and placed in the queue panel header.
 *
 * In a plain browser (frontend-only development) they are replaced by a small
 * "browser preview" chip instead of being rendered as dead buttons.
 */
export function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false)
  const tauri = isTauri()

  useEffect(() => {
    if (!tauri) return
    let active = true
    const refresh = () => {
      void isWindowMaximized().then((value) => {
        if (active) setMaximized(value)
      })
    }
    refresh()
    const dispose = onWindowResized(refresh)
    return () => {
      active = false
      dispose()
    }
  }, [tauri])

  if (!tauri) {
    return (
      <div className={cn(styles.controls, className)} data-no-drag>
        <span className={styles.previewChip} title="Running in a browser — window controls are only active in the desktop build.">
          Browser preview
        </span>
      </div>
    )
  }

  return (
    <div className={cn(styles.controls, className)} data-no-drag>
      <Tooltip label="Minimise" side="bottom">
        <button type="button" className={styles.button} aria-label="Minimise window" onClick={() => void minimizeWindow()}>
          <Icon name="winMinimize" size={14} strokeWidth={1.4} />
        </button>
      </Tooltip>
      <Tooltip label={maximized ? 'Restore' : 'Maximise'} side="bottom">
        <button
          type="button"
          className={styles.button}
          aria-label={maximized ? 'Restore window' : 'Maximise window'}
          onClick={() => void toggleMaximizeWindow()}
        >
          <Icon name={maximized ? 'winRestore' : 'winMaximize'} size={13} strokeWidth={1.4} />
        </button>
      </Tooltip>
      <Tooltip label="Close" side="bottom">
        <button
          type="button"
          className={cn(styles.button, styles.close)}
          aria-label="Close window"
          onClick={() => void closeWindow()}
        >
          <Icon name="close" size={15} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  )
}
