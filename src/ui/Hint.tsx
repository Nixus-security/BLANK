import { useTr } from '../i18n'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { isTouch } from './touch'

/** Aide discrète, une seule ligne. */
export function Hint() {
  const tr = useTr()
  const game = useGameStore((s) => s.game)
  const { aiming, busy } = useStageStore()
  let text = ''
  if (game.phase === 'playing' && game.turn === 'player' && !busy) {
    text = aiming
      ? isTouch ? tr('touche le croupier · ou en bas pour toi', 'tap the dealer · or below for yourself') : tr('croupier · ou en bas pour toi · échap', 'dealer · or below for yourself · esc')
      : tr('prends le fusil', 'take the gun')
  }
  if (!text) return null
  return <div className="text-center text-lg tracking-[0.25em] text-bone/45">{text}</div>
}
