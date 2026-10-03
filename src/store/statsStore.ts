import { create } from 'zustand'
import type { Actor } from '../game/types'

/** Chiffres d'une partie (1 à 3), affichés dans la scène de fin victorieuse. */
export interface PartStats {
  /** Instant (performance.now) de la première manche de la partie, null = pas encore commencée. */
  startedAt: number | null
  /** Durée (ms), figée à la victoire sur le croupier. */
  ms: number
  /** Tirs du joueur (sur le croupier ou sur lui-même). */
  shots: number
  /** Balles réelles reçues par le croupier. */
  hits: number
  /** PV perdus par le joueur. */
  taken: number
  /** Objets utilisés par le joueur. */
  items: number
  /** Fois où le joueur est mort dans cette partie. */
  deaths: number
}

const empty = (): PartStats => ({ startedAt: null, ms: 0, shots: 0, hits: 0, taken: 0, items: 0, deaths: 0 })

interface StatsStore {
  parts: [PartStats, PartStats, PartStats]
  /** Début d'une manche de la partie `n` : lance le chrono la première fois. */
  begin: (n: number) => void
  shot: (n: number, shooter: Actor, victim: Actor, live: boolean, damage: number) => void
  item: (n: number, user: Actor) => void
  death: (n: number) => void
  /** Victoire sur le croupier : fige la durée. */
  finish: (n: number) => void
  reset: () => void
}

const patch = (s: StatsStore, n: number, f: (p: PartStats) => Partial<PartStats>) => {
  const i = Math.min(Math.max(n, 1), 3) - 1
  const parts = [...s.parts] as StatsStore['parts']
  parts[i] = { ...parts[i], ...f(parts[i]) }
  return { parts }
}

export const useStatsStore = create<StatsStore>((set) => ({
  parts: [empty(), empty(), empty()],
  begin: (n) => set((s) => patch(s, n, (p) => (p.startedAt === null ? { startedAt: performance.now() } : {}))),
  shot: (n, shooter, victim, live, damage) =>
    set((s) =>
      patch(s, n, (p) => ({
        shots: p.shots + (shooter === 'player' ? 1 : 0),
        hits: p.hits + (live && victim === 'dealer' ? 1 : 0),
        taken: p.taken + (live && victim === 'player' ? damage : 0),
      })),
    ),
  item: (n, user) => set((s) => patch(s, n, (p) => (user === 'player' ? { items: p.items + 1 } : {}))),
  death: (n) => set((s) => patch(s, n, (p) => ({ deaths: p.deaths + 1 }))),
  finish: (n) => set((s) => patch(s, n, (p) => ({ ms: p.startedAt === null ? p.ms : Math.round(performance.now() - p.startedAt) }))),
  reset: () => set({ parts: [empty(), empty(), empty()] }),
}))
