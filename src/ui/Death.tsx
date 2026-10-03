import { useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { restart } from '../three/director'

/**
 * Mort du joueur : le noir tombe d'un coup après l'impact du tir, sans autre effet visuel ; le cœur lâche en son
 * seulement, puis « TU ES MORT » apparaît avec le tracé plat ; le bouton rejouer arrive en dernier.
 */
export function Death() {
  const tr = useTr()
  const death = useStageStore((s) => s.death)
  const text = useStageStore((s) => s.deathText)
  const ready = useStageStore((s) => s.endReady)
  const ending = useStageStore((s) => s.ending)
  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-black ${death && ready ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ opacity: death ? 1 : 0, transition: death ? 'none' : ending ? 'opacity 4s ease-out' : 'opacity 0.8s linear' }}
    >
      {text && <span className="relative text-6xl tracking-[0.4em] text-blood [animation:deathtext_1.4s_ease-out_forwards] [text-shadow:0_0_26px_rgba(179,38,30,0.55)]">{tr('TU ES MORT', 'YOU ARE DEAD')}</span>}
      {ready && (
        <button onClick={restart} className="relative text-2xl tracking-[0.4em] text-bone/60 transition [animation:fadein_1s_ease-out_forwards] hover:text-bone">
          {tr('rejouer', 'retry')}
        </button>
      )}
    </div>
  )
}
