import { useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { SignHint } from './SignHint'
import { CarStats } from './CarStats'
import { Death } from './Death'
import { Ending } from './Ending'
import { GameOver } from './GameOver'
import { Headphones } from './Headphones'
import { Health } from './Health'
import { Hint } from './Hint'
import { Interlude } from './Interlude'
import { Inventory } from './Inventory'
import { LoadBanner } from './LoadBanner'
import { LogPanel } from './LogPanel'
import { ShellTracker } from './ShellTracker'
import { SoundButton } from './SoundButton'
import { Subtitles } from './Subtitles'
import { Title } from './Title'
import { RotateHint, TouchControls } from './TouchControls'

/**
 * Overlay 2D par-dessus le canvas, volontairement sobre : texte fin, peu de couleurs (rouge = danger).
 * Le conteneur ne capte aucun clic (pointer-events-none) : seuls les boutons et écrans qui le demandent
 * (pointer-events-auto) interceptent la souris.
 */
export function Overlay() {
  const tr = useTr()
  const started = useStageStore((s) => s.started)
  const contract = useStageStore((s) => s.contract)
  const entrance = useStageStore((s) => s.entrance)
  const ending = useStageStore((s) => s.ending)
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-crt text-bone">
      {started && !entrance && !ending && (
        <>
          <div className="absolute left-[max(1.5rem,env(safe-area-inset-left))] top-5"><Health who="dealer" label={tr('CROUPIER', 'DEALER')} /></div>
          <div className="absolute right-[max(3.5rem,env(safe-area-inset-right))] top-5"><ShellTracker /></div>

          <div className="absolute bottom-5 left-[max(1.5rem,env(safe-area-inset-left))] flex flex-col gap-3">
            <LogPanel />
            <Health who="player" label={tr('TOI', 'YOU')} />
          </div>
          <div className="absolute bottom-5 right-[max(1.5rem,env(safe-area-inset-right))]"><Inventory /></div>
          <div className="absolute inset-x-0 bottom-5 mx-auto w-[34%]"><Hint /></div>

          <LoadBanner />
        </>
      )}
      <GameOver />
      <Death />
      <Ending />
      <CarStats />
      {contract && <SignHint />}
      {!started && !contract && <Title />}

      <Subtitles />

      <Interlude />
      <Headphones />

      <TouchControls />

      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-4"><SoundButton /></div>
      <RotateHint />
    </div>
  )
}
