import { useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { isTouch } from './touch'

/** Sous-titres de la voix du croupier : bas de l'écran, fondu à l'apparition et à la disparition. */
export function Subtitles() {
  const tr = useTr()
  const text = useStageStore((s) => s.subtitle)
  const tutorial = useStageStore((s) => s.tutorial)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[11%] z-30 flex justify-center px-8">
      <p
        key={text}
        className={`max-w-[72%] rounded-sm bg-black/55 px-4 py-1 text-center text-[clamp(1.2rem,2.6vw,1.9rem)] leading-snug tracking-[0.12em] text-bone [text-shadow:0_0_6px_#000,0_2px_10px_#000] ${text ? '[animation:fadein_0.35s_ease-out_forwards]' : 'opacity-0 bg-transparent'}`}
      >
        {text}
      </p>
      {tutorial && !isTouch && <span className="absolute bottom-0 right-6 text-sm tracking-[0.3em] text-bone/35">{tr('échap : passer', 'esc: skip')}</span>}
    </div>
  )
}
