import { createContext, useContext } from 'react'

/**
 * The element that scrolls the current page.
 *
 * Long lists window against this element instead of creating a nested scroll
 * area, so the page keeps exactly one scrollbar — the shell's.
 */
export const ScrollElementContext = createContext<HTMLElement | null>(null)

export function useScrollElement(): HTMLElement | null {
  return useContext(ScrollElementContext)
}
