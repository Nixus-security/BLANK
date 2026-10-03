import { useEffect, useState } from 'react'
import { getLang, useTr } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { useStatsStore, type PartStats } from '../store/statsStore'

/** Prime versée au joueur à la fin. */
export const PRIZE = 100000

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const euro = (n: number) => (getLang() === 'en' ? `€${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n).toLocaleString('fr-FR')} €`)

/** Apparition progressive : une ligne après l'autre (délai en s depuis l'affichage du panneau). */
const reveal = (delay: number) => ({ animation: `fadein 1.2s ease-out ${delay}s both` })

function Row({ label, stats, delay }: { label: string; stats: PartStats; delay: number }) {
  const tr = useTr()
  return (
    <div className="flex flex-col gap-0.5" style={reveal(delay)}>
      <div className="flex justify-between text-2xl tracking-[0.25em] text-bone">
        <span>{label}</span>
        <span>{mmss(stats.ms)}</span>
      </div>
      <div className="text-lg tracking-[0.15em] text-bone/60">
        {tr(`${stats.shots} tirs · ${stats.hits} touches · ${stats.items} objets`, `${stats.shots} shots · ${stats.hits} hits · ${stats.items} items`)}
      </div>
      <div className="text-lg tracking-[0.15em] text-bone/60">
        {tr(`${stats.taken} PV perdus · ${stats.deaths} ${stats.deaths > 1 ? 'morts' : 'mort'}`, `${stats.taken} HP lost · ${stats.deaths} ${stats.deaths > 1 ? 'deaths' : 'death'}`)}
      </div>
    </div>
  )
}

/**
 * Fin victorieuse : à gauche de la scène de la voiture, le bilan des trois parties (durée, tirs, touches, objets,
 * PV perdus, morts), puis la prime de 100 000 € qui s'additionne.
 */
export function CarStats() {
  const tr = useTr()
  const show = useStageStore((s) => s.ending && s.endKind === 'car' && !s.credits)
  const parts = useStatsStore((s) => s.parts)
  const [amount, setAmount] = useState(0)

  // la prime s'additionne une fois les trois parties affichées (~9 s après le début du panneau)
  useEffect(() => {
    if (!show) {
      setAmount(0)
      return
    }
    let raf = 0
    const start = performance.now() + 9000
    const DURATION = 3500
    const tick = () => {
      const k = Math.min(Math.max((performance.now() - start) / DURATION, 0), 1)
      setAmount(PRIZE * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [show])

  if (!show) return null
  const total = parts.reduce(
    (t, p) => ({ ms: t.ms + p.ms, shots: t.shots + p.shots, hits: t.hits + p.hits, items: t.items + p.items, taken: t.taken + p.taken, deaths: t.deaths + p.deaths, startedAt: null }),
    { ms: 0, shots: 0, hits: 0, items: 0, taken: 0, deaths: 0, startedAt: null } as PartStats,
  )
  return (
    <div className="absolute left-10 top-1/2 z-20 flex w-[27rem] -translate-y-1/2 flex-col gap-5 [text-shadow:0_2px_10px_#000]">
      <div className="text-xl tracking-[0.5em] text-blood" style={reveal(3)}>
        {tr('BILAN', 'SUMMARY')}
      </div>
      <Row label={`${tr('PARTIE', 'PART')} 1`} stats={parts[0]} delay={4} />
      <Row label={`${tr('PARTIE', 'PART')} 2`} stats={parts[1]} delay={5.6} />
      <Row label={`${tr('PARTIE', 'PART')} 3`} stats={parts[2]} delay={7.2} />
      <div className="h-px bg-bone/25" style={reveal(8.6)} />
      <div className="flex flex-col gap-1" style={reveal(8.8)}>
        <div className="flex justify-between text-lg tracking-[0.25em] text-bone/60">
          <span>{tr('TEMPS TOTAL', 'TOTAL TIME')}</span>
          <span className="text-bone">{mmss(total.ms)}</span>
        </div>
        <div className="flex justify-between text-lg tracking-[0.25em] text-bone/60">
          <span>{tr('MORTS', 'DEATHS')}</span>
          <span className="text-bone">{total.deaths}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t border-bone/25 pt-3" style={reveal(9)}>
        <span className="text-xl tracking-[0.4em] text-blood">{tr('GAIN', 'PRIZE')}</span>
        <span className="text-5xl tracking-[0.1em] text-bone">{euro(amount)}</span>
      </div>
    </div>
  )
}
