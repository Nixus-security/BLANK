import { useStageStore } from '../store/stageStore'
import { useTr } from '../i18n'

/**
 * Après PLAY : écran noir uni (par-dessus tout, y compris le post-traitement) avec le conseil d'écoute,
 * avant la scène du contrat. Le réalisateur (startGame) le pose puis le retire.
 */
export function Headphones() {
  const tr = useTr()
  const on = useStageStore((s) => s.headphones)
  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-black px-8 ${on ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ opacity: on ? 1 : 0, transition: `opacity ${on ? 0.6 : 1}s ease-in-out` }}
    >
      <p
        className="max-w-3xl text-center text-[clamp(1.4rem,3.4vw,2.4rem)] leading-relaxed tracking-[0.16em] text-bone/85"
        style={{ opacity: on ? 1 : 0, transition: `opacity ${on ? 1.2 : 0.4}s ease-in-out ${on ? 0.5 : 0}s` }}
      >
        {tr('Pour une meilleure expérience, mettez des écouteurs ou un casque.', 'For a better experience, use headphones or a headset.')}
      </p>
    </div>
  )
}
