import type { Actor } from '../game/types'
import { useTr } from '../i18n'
import { useGameStore } from '../store/gameStore'

/**
 * Cœur gravé, même langage que les objets (ItemIcon) : contour bone, fond noir translucide, détails rouge sang.
 * PV perdu : le contour seul reste, pâli, et le cœur est fendu (le défibrillateur du jeu ne repart pas).
 */
function Heart({ full }: { full: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`h-10 w-10 transition-opacity ${full ? 'text-bone' : 'text-bone/30'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M32 55 C14 42 7 33 7 22 C7 14 13 9 20 9 C25 9 29.5 12 32 17 C34.5 12 39 9 44 9 C51 9 57 14 57 22 C57 33 50 42 32 55 Z" fill="rgba(0,0,0,0.5)" />
      {full ? (
        <>
          <path d="M32 50 C17 39 12 31 12 23 C12 18 16 14 20 14 C25 14 29 18 32 24 C35 18 39 14 44 14 C48 14 52 18 52 23 C52 31 47 39 32 50 Z" fill="var(--color-blood)" stroke="none" opacity="0.88" />
          <path d="M16 20 C17 17 19 16 22 16 M20 28 L26 34 M44 28 L38 34" strokeWidth="1.4" opacity="0.7" />
          <path d="M26 9 L26 3 M38 9 L38 3" strokeWidth="3" stroke="var(--color-rust)" />
        </>
      ) : (
        <path d="M32 17 L28 29 L36 36 L30 46 L32 55" strokeWidth="1.6" strokeDasharray="3 2.5" />
      )}
    </svg>
  )
}

/** PV : rangée de cœurs gravés, bien visibles. Le texte ne sert qu'à l'état (tour, menotté, scie). */
export function Health({ who, label }: { who: Actor; label: string }) {
  const tr = useTr()
  const hp = useGameStore((s) => s.game.hp[who])
  const max = useGameStore((s) => s.game.maxHp)
  const cuffed = useGameStore((s) => s.game.cuffed[who])
  const sawed = useGameStore((s) => s.game.sawed[who])
  const active = useGameStore((s) => s.game.turn === who && s.game.phase === 'playing')
  return (
    <div className={`flex flex-col gap-1 transition-opacity ${active ? 'opacity-100' : 'opacity-55'}`}>
      <div className="flex items-center gap-4 text-2xl tracking-[0.25em]">
        <span>{label}</span>
        {cuffed && <span className="text-lg text-bone/60">{tr('menotté', 'cuffed')}</span>}
        {sawed && <span className="text-lg text-bone/60">{tr('scie ×2', 'sawed ×2')}</span>}
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => <Heart key={i} full={i < hp} />)}
      </div>
    </div>
  )
}
