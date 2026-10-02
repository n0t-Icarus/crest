import { create } from 'zustand'

/**
 * Minimal router.
 *
 * Crest has a small, fixed set of views inside a single window: a hand-rolled
 * store-backed router is a few dozen lines and keeps a 20 kB dependency out of
 * the bundle. It behaves like a normal history stack, including back/forward,
 * which is what the title bar's navigation buttons use.
 */

export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'playlists' }
  | { name: 'liked' }
  | { name: 'history' }
  | { name: 'lyrics' }
  | { name: 'settings'; section?: string }
  | { name: 'playlist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'mix'; id: string }

export type RouteName = Route['name']

type RouterState = {
  stack: Route[]
  index: number
  navigate: (route: Route) => void
  replace: (route: Route) => void
  back: () => void
  forward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const MAX_STACK = 60

export const useRouter = create<RouterState>()((set, get) => ({
  stack: [{ name: 'home' }],
  index: 0,

  navigate: (route) =>
    set((state) => {
      const current = state.stack[state.index]
      if (current && sameRoute(current, route)) return state
      const trimmed = state.stack.slice(0, state.index + 1)
      const next = [...trimmed, route].slice(-MAX_STACK)
      return { stack: next, index: next.length - 1 }
    }),

  replace: (route) =>
    set((state) => {
      const next = state.stack.slice()
      next[state.index] = route
      return { stack: next }
    }),

  back: () => set((state) => ({ index: Math.max(0, state.index - 1) })),
  forward: () => set((state) => ({ index: Math.min(state.stack.length - 1, state.index + 1) })),
  canGoBack: () => get().index > 0,
  canGoForward: () => get().index < get().stack.length - 1,
}))

export function sameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false
  if ('id' in a && 'id' in b) return a.id === b.id
  return true
}

export function currentRoute(): Route {
  const { stack, index } = useRouter.getState()
  return stack[index] ?? { name: 'home' }
}

export function navigate(route: Route): void {
  useRouter.getState().navigate(route)
}

/** Stable key for a route, used for page transition animations. */
export function routeKey(route: Route): string {
  return 'id' in route ? `${route.name}:${route.id}` : route.name
}

export function useRoute(): Route {
  return useRouter((state) => state.stack[state.index] ?? { name: 'home' })
}
