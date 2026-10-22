import { useEffect, useRef } from 'react'
import { ITEMS } from '../game/items'
import { MULTI_ITEMS } from '../game/multi/items'
import type { ItemId } from '../game/types'
import { useTr } from '../i18n'
import { useNetStore } from '../net/session'
import { labels, mpCancel, mpItemUsable, mpToggleAim, mpUseItem, useMpStage } from '../three/multi/mpDirector'
import { SEAT_CSS } from '../three/multi/seats'
import { Heart } from './Health'
import { ItemIcon } from './ItemIcon'
import { Shell } from './ShellTracker'
import { isTouch } from './touch'

/** Joueurs : nom (couleur du siège), cœurs, état. Celui qui a la main est mis en avant. */
function Players() {
  const tr = useTr()
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  if (!g) return null
  return (
    <div className="flex flex-col gap-2">
      {g.names.map((name, i) => {
        const turn = g.phase === 'playing' && g.turn === i
        return (
          <div key={i} className={`flex flex-col transition-opacity ${!g.alive[i] ? 'opacity-30' : turn ? 'opacity-100' : 'opacity-60'}`}>
            <div className="flex items-center gap-3 text-xl tracking-[0.2em]">
              <span style={{ color: SEAT_CSS[i % SEAT_CSS.length] }}>
                {turn ? '▸ ' : ''}
                {i === me ? tr('TOI', 'YOU') : name}
              </span>
              {!g.alive[i] && <span className="text-base text-blood">{tr('mort', 'dead')}</span>}
              {g.cuffed[i] && <span className="text-base text-bone/60">{tr('menotté', 'cuffed')}</span>}
              {g.sawed[i] && <span className="text-base text-bone/60">{tr('scie ×2', 'sawed ×2')}</span>}
            </div>
            <div className="flex gap-0.5 [&_svg]:h-7 [&_svg]:w-7">
              {Array.from({ length: g.maxHp }, (_, k) => <Heart key={k} full={k < g.hp[i]} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Balles restantes (décompte public) et, si on l'a regardée à la loupe, la balle en chambre. */
function Shells() {
  const tr = useTr()
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  if (!g) return null
  const { live, blank } = g.remaining
  const known = g.known[me]
  return (
    <div className="flex flex-col items-end gap-2 text-2xl tracking-[0.2em]">
      <div className="flex gap-1">
        {Array.from({ length: live }, (_, i) => <Shell key={`l${i}`} live />)}
        {Array.from({ length: blank }, (_, i) => <Shell key={`b${i}`} live={false} />)}
      </div>
      <span className="text-bone/60">{tr(`${live} réelle${live > 1 ? 's' : ''} · ${blank} à blanc`, `${live} live · ${blank} blank`)}</span>
      {known !== null && <span className={known ? 'text-blood' : 'text-bone'}>{tr('chambre', 'chamber')} : {known ? tr('réelle', 'live') : tr('à blanc', 'blank')}</span>}
    </div>
  )
}

function Log() {
  const g = useMpStage((s) => s.shown)
  if (!g) return null
  const log = g.log.filter((l) => !l.startsWith('—'))
  const lines = log.slice(-3)
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

/** Nos objets : mêmes cadres que le jeu solo (Inventory.tsx). */
function Items() {
  useTr()
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  const busy = useMpStage((s) => s.busy)
  if (!g) return null
  const inv = g.inventory[me]
  const myTurn = g.phase === 'playing' && g.turn === me && g.alive[me] && !busy
  const counts = inv.reduce<Partial<Record<ItemId, number>>>((a, id) => ({ ...a, [id]: (a[id] ?? 0) + 1 }), {})
  const ids = Object.keys(counts) as ItemId[]
  if (ids.length === 0) return null
  return (
    <div className="flex max-w-lg flex-wrap justify-end gap-2.5">
      {ids.map((id) => {
        const index = inv.indexOf(id)
        const usable = myTurn && mpItemUsable(index)
        return (
          <button
            key={id}
            disabled={!usable}
            onClick={() => mpUseItem(index)}
            aria-label={`${ITEMS[id].label} : ${ITEMS[id].description}`}
            className="group pointer-events-auto relative h-[max(3.6rem,44px)] w-[max(3.6rem,44px)] border border-bone/25 bg-black/55 p-1.5 text-bone transition enabled:hover:border-blood/70 enabled:hover:text-blood enabled:hover:shadow-[0_0_14px_rgba(179,38,30,0.35)] disabled:opacity-35"
          >
            <ItemIcon id={id} className="h-full w-full" />
            {counts[id]! > 1 && (
              <span className="absolute -right-1.5 -top-1.5 border border-bone/30 bg-black px-1 text-sm leading-tight tracking-wider text-bone/80">×{counts[id]}</span>
            )}
            <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-max max-w-[16rem] border border-bone/20 bg-black/90 px-2.5 py-1.5 text-left text-base leading-snug tracking-[0.1em] text-bone opacity-0 transition-opacity group-hover:opacity-100">
              <span className="block uppercase text-bone">{ITEMS[id].label}</span>
              <span className="block text-bone/60">{ITEMS[id].description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Aide d'une ligne : ce qu'on peut faire maintenant. */
function Hint() {
  const tr = useTr()
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  const { aiming, pick, busy } = useMpStage()
  if (!g || g.phase !== 'playing') return null
  let text = ''
  if (!g.alive[me]) text = tr('tu es mort · tu regardes la suite', 'you are dead · watching the rest')
  else if (g.turn !== me) text = `${tr('au tour de', 'waiting for')} ${g.names[g.turn]}`
  else if (busy) text = ''
  else if (pick !== null) {
    const id = g.inventory[me][pick]
    text = `${id ? ITEMS[id].label.toLowerCase() : ''} : ${isTouch ? tr('touche un joueur', 'tap a player') : tr('clique sur un joueur · échap', 'click a player · esc')}`
  } else if (aiming) text = isTouch ? tr('touche un joueur · ou en bas pour toi', 'tap a player · or below for yourself') : tr('un joueur · ou en bas pour toi · échap', 'a player · or below for yourself · esc')
  else text = tr('ton tour · prends le fusil', 'your turn · take the gun')
  if (!text) return null
  return <div className="text-center text-lg tracking-[0.25em] text-bone/45">{text}</div>
}

/** Fin de partie : le survivant ; l'hôte relance ou ramène tout le monde au salon. */
function End() {
  const tr = useTr()
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  const busy = useMpStage((s) => s.busy)
  const { role, start, toLobby, leave } = useNetStore()
  if (!g || g.phase !== 'gameOver' || busy) return null
  const title = g.winner === null ? tr('PERSONNE NE SURVIT', 'NOBODY SURVIVES') : g.winner === me ? tr('SURVIVANT', 'SURVIVOR') : `${g.names[g.winner]} ${tr('SURVIT', 'SURVIVES')}`
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/70 [animation:fadein_1s_ease-out_forwards]">
      <span className={`text-6xl tracking-[0.4em] ${g.winner === me ? 'text-bone' : 'text-blood'}`}>{title}</span>
      {role === 'host' ? (
        <div className="flex gap-10 text-2xl tracking-[0.4em]">
          <button onClick={start} autoFocus className="text-bone/70 transition hover:text-bone">{tr('revanche', 'rematch')}</button>
          <button onClick={toLobby} className="text-bone/70 transition hover:text-bone">{tr('salon', 'lobby')}</button>
        </div>
      ) : (
        <span className="text-xl tracking-[0.3em] text-bone/45">{tr("en attente de l'hôte…", 'waiting for host…')}</span>
      )}
      <button onClick={leave} className="text-lg tracking-[0.3em] text-bone/40 transition hover:text-blood">{tr('quitter', 'leave')}</button>
    </div>
  )
}

/** On vient de prendre une balle mortelle : le texte du jeu solo, en plus bref (la partie continue pour les autres). */
function Dead() {
  const tr = useTr()
  const on = useMpStage((s) => s.deadText)
  if (!on) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 [animation:fadein_0.3s_ease-out]">
      <span className="text-6xl tracking-[0.4em] text-blood [animation:deathtext_1.4s_ease-out_forwards] [text-shadow:0_0_26px_rgba(179,38,30,0.55)]">{tr('TU ES MORT', 'YOU ARE DEAD')}</span>
    </div>
  )
}

/** Boutons tactiles : prendre / reposer le fusil, annuler une cible (au clavier : clic sur le fusil, Échap). */
function TouchButtons() {
  const tr = useTr()
  const { aiming, pick } = useMpStage()
  if (!isTouch) return null
  return (
    <div className="pointer-events-auto flex gap-4 text-xl tracking-[0.25em]">
      {(aiming || pick !== null) && (
        <button onClick={mpCancel} className="border border-bone/30 bg-black/60 px-4 py-2 text-bone/80">{tr('✕ annuler', '✕ cancel')}</button>
      )}
      {!aiming && pick === null && (
        <button onClick={mpToggleAim} className="border border-bone/30 bg-black/60 px-4 py-2 text-bone/80">{tr('fusil', 'gun')}</button>
      )}
    </div>
  )
}

/** Nom de chaque adversaire au-dessus de sa tête (position projetée par Avatar.tsx, suivie à chaque image). */
function SeatLabels() {
  const g = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      refs.current.forEach((el, seat) => {
        if (!el) return
        const l = labels[seat]
        el.style.display = l.on ? 'block' : 'none'
        el.style.left = `${l.x * 100}%`
        el.style.top = `${l.y * 100}%`
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  if (!g) return null
  return (
    <>
      {g.names.map((name, seat) => {
        if (seat === me) return null
        const turn = g.phase === 'playing' && g.turn === seat
        const dead = !g.alive[seat]
        return (
          <div
            key={seat}
            ref={(el) => void (refs.current[seat] = el)}
            className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-xl tracking-[0.2em] [text-shadow:0_2px_6px_#000]"
            style={{ display: 'none', color: dead ? 'rgba(216,208,184,0.3)' : SEAT_CSS[seat % SEAT_CSS.length], opacity: turn || dead ? 1 : 0.7 }}
          >
            {turn && !dead ? '▸ ' : ''}
            {name}
          </div>
        )
      })}
    </>
  )
}

/** Interface de la partie multijoueur (même langage que l'overlay du jeu solo). */
export function MultiHud() {
  const tr = useTr()
  const leave = useNetStore((s) => s.leave)
  const g = useMpStage((s) => s.shown)
  const pick = useMpStage((s) => s.pick)
  const needsTarget = pick !== null && g ? MULTI_ITEMS[g.inventory[useMpStage.getState().me][pick]]?.needsTarget : false
  return (
    <>
      <SeatLabels />
      <div className="absolute left-[max(1.5rem,env(safe-area-inset-left))] top-5"><Players /></div>
      <div className="absolute right-[max(3.5rem,env(safe-area-inset-right))] top-5"><Shells /></div>
      <div className="absolute bottom-5 left-[max(1.5rem,env(safe-area-inset-left))] flex flex-col gap-3">
        <Log />
        <button onClick={leave} className="pointer-events-auto self-start text-base tracking-[0.3em] text-bone/30 transition hover:text-blood">{tr('quitter la partie', 'leave game')}</button>
      </div>
      <div className="absolute bottom-5 right-[max(1.5rem,env(safe-area-inset-right))]"><Items /></div>
      <div className="absolute inset-x-0 bottom-5 mx-auto flex w-[40%] flex-col items-center gap-3">
        <TouchButtons />
        <Hint />
      </div>
      {needsTarget && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(179,38,30,0.25)]" />}
      <Dead />
      <End />
    </>
  )
}
