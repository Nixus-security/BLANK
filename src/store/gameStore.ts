import { create } from 'zustand'
import { decideDealer } from '../game/dealerAI'
import { createGame, shoot, useItem } from '../game/rules'
import type { Actor, GameState } from '../game/types'

interface GameStore {
  game: GameState
  newGame: (maxHp?: number, level?: number) => void
  playerShoot: (target: Actor) => void
  playerUseItem: (index: number) => void
  /** Un seul pas de l'IA (l'UI/3D l'appelle avec des délais). Renvoie true si le croupier a encore la main. */
  dealerStep: () => boolean
  /** Joue tout le tour du croupier d'un coup (console/tests). */
  playDealerTurn: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: createGame(),

  newGame: (maxHp = 3, level = 1) => set({ game: createGame(maxHp, level) }),

  playerShoot: (target) => set((st) => ({ game: shoot(st.game, 'player', target) })),

  playerUseItem: (index) => set((st) => ({ game: useItem(st.game, 'player', index) })),

  dealerStep: () => {
    const g = get().game
    if (g.phase !== 'playing' || g.turn !== 'dealer') return false
    const a = decideDealer(g)
    const next = a.type === 'item' ? useItem(g, 'dealer', a.index) : shoot(g, 'dealer', a.target)
    set({ game: next })
    return next.phase === 'playing' && next.turn === 'dealer'
  },

  playDealerTurn: () => {
    for (let guard = 0; guard < 50 && get().dealerStep(); guard++);
  },
}))
