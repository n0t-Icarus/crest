/**
 * Active provider registry.
 *
 * Components call `useProvider()` / `getProvider()` and never import a concrete
 * backend. Phase 5 registers additional providers here (local files, official
 * APIs, or an opt-in unofficial one isolated in its own folder) and this module
 * is the single switch that selects between them.
 */

import { mockProvider } from './mock/mockProvider'
import { synthProvider } from './synth/synthProvider'
import { ytProvider } from './yt/ytProvider'
import type { MusicProvider } from './types'
import { readPersistedSettings } from '@/store/settingsStore'

const registry = new Map<string, MusicProvider>([
  [mockProvider.id, mockProvider],
  [synthProvider.id, synthProvider],
  [ytProvider.id, ytProvider],
])

// YouTube Music plays full-length real audio through the local helper, so it
// is the default. Any legacy demo selections ('synth' / 'mock') are migrated to 'yt'.
let activeId = ytProvider.id
const persistedProviderId = readPersistedSettings().providerId
if (persistedProviderId && persistedProviderId !== 'synth' && persistedProviderId !== 'mock' && registry.has(persistedProviderId)) {
  activeId = persistedProviderId
} else {
  activeId = ytProvider.id
}

export function registerProvider(provider: MusicProvider, options: { activate?: boolean } = {}): void {
  registry.set(provider.id, provider)
  if (options.activate) activeId = provider.id
}

export function setActiveProvider(id: string): void {
  if (!registry.has(id)) throw new Error(`Unknown provider: ${id}`)
  activeId = id
}

export function getProvider(): MusicProvider {
  const provider = registry.get(activeId)
  if (!provider) throw new Error(`Provider "${activeId}" is not registered`)
  return provider
}

export function listProviders(): MusicProvider[] {
  return [...registry.values()]
}

export type { MusicProvider } from './types'
