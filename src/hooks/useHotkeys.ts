import { useEffect, useRef } from 'react'

export type HotkeyHandler = (event: KeyboardEvent) => void

/** True when the event came from somewhere the user is typing text. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

/**
 * Registers a single window-level keydown listener.
 * Typing targets are skipped unless `allowInInput` is set, so shortcuts never
 * fight with the search field.
 */
export function useHotkeys(handler: HotkeyHandler, options: { allowInInput?: boolean; enabled?: boolean } = {}) {
  const { allowInInput = false, enabled = true } = options
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowInInput && isTypingTarget(event.target)) return
      handlerRef.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [allowInInput, enabled])
}
