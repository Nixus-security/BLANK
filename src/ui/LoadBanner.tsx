import { useTr } from '../i18n'
import { useGameStore } from '../store/gameStore'

/** Annonce brève à chaque chargement : nombre de balles réelles / à blanc. */
export function LoadBanner() {
  const tr = useTr()
  const load = useGameStore((s) => s.game.load)
  const { live, blank } = useGameStore((s) => s.game.announced)
  return (
    // key = load : rejoue l'animation à chaque nouveau chargement
    <div key={load} className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-1 [animation:banner_2.6s_ease-out_forwards]">
      <span className="text-lg tracking-[0.5em] text-bone/50">{tr('CHARGEMENT', 'LOAD')} {load}</span>
      <span className="text-4xl tracking-[0.25em]">
        <span className="text-blood">{live}</span> {tr(`réelle${live > 1 ? 's' : ''}`, 'live')}
        <span className="mx-3 text-bone/30">·</span>
        <span className="text-bone">{blank}</span> {tr('à blanc', 'blank')}
      </span>
    </div>
  )
}
