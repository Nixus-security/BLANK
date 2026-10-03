import { useTr } from '../i18n'
import { useGameStore } from '../store/gameStore'

/**
 * Cartouche gravée (viewBox 28 × 64), même langage que les objets (ItemIcon) : contour bone, fond noir translucide,
 * bande rouge sang (réelle) ou bleue (à blanc, comme les voyants de l'inverseur), culot rouille.
 */
function Shell({ live }: { live: boolean }) {
  return (
    <svg
      viewBox="0 0 28 64"
      className="h-16 w-7 text-bone"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="6" width="20" height="38" rx="3" fill="rgba(0,0,0,0.55)" />
      <rect x="5" y="14" width="18" height="16" fill={live ? 'var(--color-blood)' : '#3f7fc4'} stroke="none" opacity="0.88" />
      <path d="M4 14 L24 14 M4 30 L24 30" strokeWidth="1.4" />
      <path d="M9 36 L9 41" strokeWidth="1.2" opacity="0.6" />
      <rect x="2" y="44" width="24" height="14" rx="2" fill="rgba(0,0,0,0.55)" />
      <path d="M2 49 L26 49" strokeWidth="1.4" stroke="var(--color-rust)" />
      <circle cx="14" cy="53.5" r="2.3" fill="var(--color-rust)" stroke="none" />
    </svg>
  )
}

/** Balles restantes : cartouches rouges (réelles) et bleues (à blanc). L'ordre reste caché. */
export function ShellTracker() {
  const tr = useTr()
  const remaining = useGameStore((s) => s.game.remaining)
  const known = useGameStore((s) => s.game.known.player)
  return (
    <div className="flex flex-col items-end gap-2 text-2xl tracking-[0.2em]">
      <div className="flex gap-1">
        {Array.from({ length: remaining.live }, (_, i) => <Shell key={`l${i}`} live />)}
        {Array.from({ length: remaining.blank }, (_, i) => <Shell key={`b${i}`} live={false} />)}
      </div>
      <span className="text-bone/60">{tr(`${remaining.live} réelle${remaining.live > 1 ? 's' : ''} · ${remaining.blank} à blanc`, `${remaining.live} live · ${remaining.blank} blank`)}</span>
      {known !== null && <span className={known ? 'text-blood' : 'text-bone'}>{tr('chambre', 'chamber')} : {known ? tr('réelle', 'live') : tr('à blanc', 'blank')}</span>}
    </div>
  )
}
