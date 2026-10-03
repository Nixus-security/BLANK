import { interludeText } from '../store/stageStore'
import { useStageStore } from '../store/stageStore'
import { useTr } from '../i18n'

/**
 * Entracte après la signature : écran noir uni (par-dessus tout, y compris le post-traitement), puis la phrase
 * s'écrit lettre par lettre (le rythme et le son sont pilotés par le réalisateur). Il s'estompe quand la partie commence.
 * La phrase entière est réservée dès le départ (partie non écrite invisible) : le texte reste centré, sans sauter à chaque lettre.
 */
export function Interlude() {
  useTr()
  const on = useStageStore((s) => s.interlude)
  const text = useStageStore((s) => s.interludeText)
  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-black px-6 ${on ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ opacity: on ? 1 : 0, transition: `opacity ${on ? 0.9 : 1.4}s ease-in-out` }}
    >
      <p className="text-center text-[clamp(1.5rem,4.6vw,3.2rem)] tracking-[0.16em] text-bone/90">
        {text}
        <span className="animate-pulse text-bone/70">{text ? '_' : ''}</span>
        <span className="invisible">{interludeText().slice(text.length)}</span>
      </p>
    </div>
  )
}
