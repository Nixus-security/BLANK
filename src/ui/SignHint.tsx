import { useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { isTouch } from './touch'

/** Consigne discrète pendant le contrat (la signature se fait sur la feuille 3D). */
export function SignHint() {
  const tr = useTr()
  const signed = useStageStore((s) => s.signed)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-lg tracking-[0.3em] text-bone/60 transition-opacity duration-500" style={{ opacity: signed ? 0 : 1 }}>
      {isTouch
        ? tr('signe dans le cadre du bas · pose le doigt et trace', 'sign in the box below · press and draw')
        : tr('signe dans le cadre du bas · maintiens le clic et trace', 'sign in the box below · hold the click and draw')}
    </div>
  )
}
