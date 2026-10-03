import { useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { isTouch, pressKey } from './touch'

/**
 * Boutons tactiles qui remplacent le clavier : Échap (reposer le fusil, passer la cinématique).
 * Invisibles sur ordinateur.
 */
export function TouchControls() {
  const tr = useTr()
  const aiming = useStageStore((s) => s.aiming)
  const busy = useStageStore((s) => s.busy)
  const tutorial = useStageStore((s) => s.tutorial)
  if (!isTouch) return null
  const label = tutorial ? tr('passer ›', 'skip ›') : aiming && !busy ? tr('✕ reposer', '✕ put down') : null
  if (!label) return null
  return (
    <button
      onClick={() => pressKey('Escape')}
      className="pointer-events-auto absolute left-1/2 top-4 z-30 -translate-x-1/2 border border-bone/30 bg-black/60 px-4 py-1.5 text-lg tracking-[0.25em] text-bone/80 active:text-blood"
    >
      {label}
    </button>
  )
}

/** Téléphone tenu à la verticale : le jeu se joue en paysage. */
export function RotateHint() {
  const tr = useTr()
  return (
    <div className="pointer-events-auto fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-6 bg-black px-8 text-center font-crt text-bone [@media(pointer:coarse)_and_(orientation:portrait)]:flex">
      <svg width="72" height="72" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="[animation:rotatehint_2.4s_ease-in-out_infinite]">
        <rect x="20" y="6" width="24" height="44" rx="4" />
        <path d="M30 44 H34" />
        <path d="M8 56 C14 62 26 62 32 58 M28 62 L32 58 L27 54" />
      </svg>
      <span className="text-3xl tracking-[0.3em]">{tr('TOURNE TON TÉLÉPHONE', 'ROTATE YOUR PHONE')}</span>
      <span className="text-xl tracking-[0.2em] text-bone/50">{tr('ce jeu se joue en paysage', 'this game is played in landscape')}</span>
    </div>
  )
}
