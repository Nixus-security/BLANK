import { useTr } from '../i18n'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { restart } from '../three/director'

/** Victoire. La défaite a son propre écran (Death.tsx : noir, arrêt cardiaque, « TU ES MORT »). */
export function GameOver() {
  const tr = useTr()
  const { phase, winner } = useGameStore((s) => s.game)
  const endReady = useStageStore((s) => s.endReady)
  if (phase !== 'gameOver' || !endReady || winner !== 'player') return null
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/75 [animation:fadein_1s_ease-out_forwards]">
      <span className="text-6xl tracking-[0.4em] text-bone">{tr('SURVIVANT', 'SURVIVOR')}</span>
      <button onClick={restart} className="text-2xl tracking-[0.4em] text-bone/60 transition hover:text-bone">
        {tr('rejouer', 'retry')}
      </button>
    </div>
  )
}
