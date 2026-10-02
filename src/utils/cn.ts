/** Tiny class-name joiner (no dependency needed for what we actually use). */
export type ClassValue = string | false | null | undefined

export function cn(...values: ClassValue[]): string {
  let out = ''
  for (const value of values) {
    if (!value) continue
    out = out ? `${out} ${value}` : value
  }
  return out
}
