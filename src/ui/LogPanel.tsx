import { useGameStore } from '../store/gameStore'

const LINES = 3

/** Trois dernières actions, les plus anciennes s'estompent. */
export function LogPanel() {
  const log = useGameStore((s) => s.game.log).filter((l) => !l.startsWith('—'))
  const lines = log.slice(-LINES)
  return (
    <div className="flex max-w-sm flex-col gap-0.5 text-lg leading-tight">
      {lines.map((l, i) => (
        <span key={log.length - lines.length + i} style={{ opacity: 0.25 + (0.6 * (i + 1)) / lines.length }}>
          {l}
        </span>
      ))}
    </div>
  )
}
