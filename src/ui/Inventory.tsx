import { ITEMS } from '../game/items'
import { useTr } from '../i18n'
import type { ItemId } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { playerUseItem } from '../three/director'
import { ItemIcon } from './ItemIcon'

/**
 * Objets du joueur : une illustration par objet (cadre gravé, compteur ×N), cliquable, grisée quand elle est
 * inutilisable. Le nom et l'effet apparaissent au survol.
 */
export function Inventory() {
  useTr() // les noms et descriptions suivent la langue
  const game = useGameStore((s) => s.game)
  const busy = useStageStore((s) => s.busy)
  const myTurn = game.phase === 'playing' && game.turn === 'player' && !busy

  const counts = game.inventory.player.reduce<Partial<Record<ItemId, number>>>((a, id) => ({ ...a, [id]: (a[id] ?? 0) + 1 }), {})
  const ids = Object.keys(counts) as ItemId[]
  if (ids.length === 0) return null

  return (
    <div className="flex max-w-lg flex-wrap justify-end gap-2.5">
      {ids.map((id) => {
        const usable = myTurn && ITEMS[id].canUse(game, 'player')
        return (
          <button
            key={id}
            disabled={!usable}
            onClick={() => void playerUseItem(id)}
            aria-label={`${ITEMS[id].label} : ${ITEMS[id].description}`}
            className="group pointer-events-auto relative h-[max(3.6rem,44px)] w-[max(3.6rem,44px)] border border-bone/25 bg-black/55 p-1.5 text-bone transition enabled:hover:border-blood/70 enabled:hover:text-blood enabled:hover:shadow-[0_0_14px_rgba(179,38,30,0.35)] disabled:opacity-35"
          >
            <ItemIcon id={id} className="h-full w-full" />
            {counts[id]! > 1 && (
              <span className="absolute -right-1.5 -top-1.5 border border-bone/30 bg-black px-1 text-sm leading-tight tracking-wider text-bone/80">×{counts[id]}</span>
            )}
            <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-max max-w-[16rem] border border-bone/20 bg-black/90 px-2.5 py-1.5 text-left text-base leading-snug tracking-[0.1em] text-bone opacity-0 transition-opacity group-hover:opacity-100">
              <span className="block uppercase text-bone">{ITEMS[id].label}</span>
              <span className="block text-bone/60">{ITEMS[id].description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
