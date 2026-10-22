import { Matrix4, Quaternion, Vector3 } from 'three'
import { create } from 'zustand'
import { MULTI_ITEMS } from '../../game/multi/items'
import type { MultiAction, MultiEvent, MultiState, Seat } from '../../game/multi/types'
import type { ItemId } from '../../game/types'
import { useNetStore } from '../../net/session'
import { useStageStore } from '../../store/stageStore'
import { playBlip, playClick, playShot, setMusic, setMusicRoom, sfx, type SfxName, unlockAudio } from '../audio'
import { fx, triggerImpact, type GunPose } from '../fx'
import { gunGrips } from '../grips'
import { HELD, q } from '../gunPoses'
import { ACTS } from '../itemActs'
import { newAvatarState, type AvatarState } from './avatarRig'
import { chestOf, dealerMatrix, EAST, fromDealer, NORTH, screenOf, seatMatrix, slotOf, SOUTH, WEST, type Slot } from './seats'

/**
 * Réalisateur multijoueur. Chaque client reçoit de l'hôte une suite d'états (un par action). Ils sont mis en file et
 * rejoués un par un : la mise en scène de l'action (MultiState.last) se joue, puis l'état est affiché (`shown`).
 * Les entrées du joueur (fusil, cibles, objets) ne partent que quand rien n'est en cours.
 *
 * La scène est celle du jeu solo : on est toujours assis au sud ; les autres joueurs sont des avatars (Avatar.tsx)
 * aux autres places (seats.ts). Le fusil et les objets en action (Shotgun, ItemProps) sont pilotés par fx.
 */

interface MpStage {
  /** État affiché (en retard sur le réseau pendant une mise en scène). */
  shown: MultiState | null
  me: Seat
  /** Fusil en main, on choisit sa cible. */
  aiming: boolean
  /** Objet ciblé (menottes, adrénaline) en attente d'une victime : son index dans notre inventaire. */
  pick: number | null
  /** Mise en scène en cours ou action envoyée : entrées bloquées. */
  busy: boolean
  /** Objet de notre plateau momentanément retiré (il est en main). */
  hideTray: ItemId | null
  /** On vient de mourir : « TU ES MORT » s'affiche un moment. */
  deadText: boolean
  set: (p: Partial<Omit<MpStage, 'set'>>) => void
}

export const useMpStage = create<MpStage>((set) => ({
  shown: null,
  me: 0,
  aiming: false,
  pick: null,
  busy: false,
  hideTray: null,
  deadText: false,
  set: (p) => set(p),
}))

/** État d'animation de chaque siège (lu chaque image par Avatar.tsx). */
export const avatars: AvatarState[] = Array.from({ length: 4 }, newAvatarState)
/** Étiquette du nom de chaque avatar : position à l'écran (0..1, origine en haut à gauche), écrite par Avatar.tsx. */
export const labels = Array.from({ length: 4 }, () => ({ x: 0, y: 0, on: false }))

const mp = () => useMpStage.getState()
const stage = () => useStageStore.getState()
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
export const slotOfSeat = (seat: Seat): Slot => {
  const { shown, me } = mp()
  return slotOf(seat, me, shown?.names.length ?? 2)
}

// --- fusil ---------------------------------------------------------------------------------------------------------

type GunAim = 'rest' | 'self' | 'show' | Seat
let gun: { holder: Seat; aim: GunAim } = { holder: 0, aim: 'rest' }
let gunCache: { rest: GunPose; pose: GunPose } | null = null
/**
 * Repos du fusil quand la main est à un bout de la table (ouest ; l'est en est le demi-tour) : couché à plat sur
 * l'axe de la table, crosse vers lui, canon vers l'autre bout.
 */
const SIDE_REST_X = -0.18
const CENTER_Z = 0.9
const SIDE_REST_ROT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)

const rotOf = (m: Matrix4) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m))
const place = (pose: GunPose, m: Matrix4): GunPose => ({ p: pose.p.clone().applyMatrix4(m), r: rotOf(m).multiply(pose.r) })

/** Demi-longueur du fusil (shotgun.glb : 1,28 m, origine au milieu). */
const GUN_HALF = 0.64
/**
 * Fusil épaulé : la crosse reste en `stock` (contre celui qui tire) et le canon pointe vers `to` (axe +X local).
 * Tourner autour de la crosse, et non du milieu, garde l'arme dans les mains quand la cible est sur le côté.
 */
function shoulderAt(stock: Vector3, to: Vector3): GunPose {
  const d = to.clone().sub(stock).normalize()
  return { p: stock.clone().addScaledVector(d, GUN_HALF), r: q(Math.asin(d.y), Math.atan2(-d.z, d.x)) }
}
/** Crosse au sud (nous) : épaulée, sous la caméra multijoueur (plus haute et plus reculée qu'en solo). */
const STOCK_SOUTH = new Vector3(0.14, 1.2, 1.9)

function computeGun(rest: GunPose): GunPose {
  if (gunCache?.rest === rest) return gunCache.pose
  const h = slotOfSeat(gun.holder)
  const { aim } = gun
  let pose: GunPose
  if (aim === 'rest' || (aim === 'show' && h === SOUTH)) {
    // posé devant celui qui a la main. Aux bouts de la table (trop étroits pour le fusil en travers, 1,28 m),
    // il est couché dans la longueur, crosse vers lui.
    if (h === WEST || h === EAST) {
      const w = { p: new Vector3(SIDE_REST_X, rest.p.y, CENTER_Z), r: SIDE_REST_ROT }
      pose = h === WEST ? w : place(w, seatMatrix(NORTH))
    } else pose = place(rest, seatMatrix(h))
  }
  else if (aim === 'self') pose = h === SOUTH ? HELD.playerSelf : place(HELD.dealerSelf, dealerMatrix(h))
  else if (aim === 'show') pose = place(HELD.dealerShow, dealerMatrix(h))
  else {
    // crosse : la nôtre, ou celle de la pose solo du croupier qui vise (milieu z 0,42 - demi-longueur) à sa place
    const stock = h === SOUTH ? STOCK_SOUTH : fromDealer(h, 0, 0.95, 0.42 - GUN_HALF)
    pose = shoulderAt(stock, chestOf(slotOfSeat(aim)))
  }
  gunCache = { rest, pose }
  return pose
}

/** Console : mp.mpSetGun(2, 1) = le joueur 2 vise le joueur 1 ('rest' | 'self' | 'show' | siège). */
export const mpSetGun = (holder: Seat, aim: GunAim) => setGun(holder, aim)

function setGun(holder: Seat, aim: GunAim) {
  gun = { holder, aim }
  gunCache = null
  avatars.forEach((a, seat) => {
    const mine = seat === holder && slotOfSeat(seat) !== SOUTH
    a.hold = mine && aim !== 'rest'
    a.lean = !mine || aim === 'rest' ? 0 : aim === 'self' ? 0.32 : aim === 'show' ? 0.08 : 0.12
  })
}

// --- état affiché --------------------------------------------------------------------------------------------------

/** Poignets de celui qui est à `seat` (menottes posées dessus). Voir CUFFS_PLAYER / CUFFS_DEALER (ItemProps). */
const cuffSpot = (seat: Seat) => (slotOfSeat(seat) === SOUTH ? new Vector3(0.04, 0.8, 1.42) : fromDealer(slotOfSeat(seat), 0, 0.8, 0.56))
/** Poche droite de celui qui est à `seat` (d'où il sort un objet). */
const pocketOf = (seat: Seat) => fromDealer(slotOfSeat(seat), -0.3, 0.84, 0.52)

function commit(next: MultiState) {
  const prev = mp().shown
  mp().set({ shown: next })
  next.cuffed.forEach((c, seat) => (avatars[seat].cuffed = c))
  next.alive.forEach((a, seat) => {
    if (!a) avatars[seat].dead = true
  })
  fx.sawed = next.sawed.some(Boolean)
  fx.cuffSpots = next.cuffed.flatMap((c, seat) => (c ? [cuffSpot(seat)] : []))
  if (prev && prev.id === next.id && next.load > prev.load) sfx('reload', 0.25)
}

// --- file des états reçus ------------------------------------------------------------------------------------------

let queue: MultiState[] = []
let running = false
/** Incrémenté en quittant la partie : les mises en scène en suspens s'arrêtent. */
let run = 0
/** Instant d'envoi de notre dernière action (0 = rien en attente). */
let awaiting = 0

const refreshBusy = () => mp().set({ busy: running || queue.length > 0 || awaiting > 0 })

async function pump() {
  if (running) return
  running = true
  refreshBusy()
  const my = run
  try {
    while (queue.length && my === run) {
      const next = queue.shift()!
      const prev = mp().shown
      if (!prev || prev.id !== next.id) begin(next)
      else if (next.seq <= prev.seq || !next.last) commit(next)
      else await animate(prev, next.last, next, my)
    }
  } finally {
    if (my === run) {
      running = false
      refreshBusy()
    }
  }
}

/** Nouvelle partie (ou revanche) : tout le monde à sa place, vivant, le fusil devant le premier joueur. */
function begin(next: MultiState) {
  avatars.forEach((a) => Object.assign(a, newAvatarState()))
  mp().set({ shown: null, aiming: false, pick: null, hideTray: null, deadText: false })
  commit(next)
  setGun(next.turn, 'rest')
  sfx('reload', 0.3)
}

async function animate(prev: MultiState, ev: MultiEvent, next: MultiState, my: number) {
  if (ev.kind === 'shoot') await animShoot(ev, next, my)
  else if (ev.kind === 'item') await animItem(ev, next, my)
  else commit(next) // abandon : l'avatar s'effondre (commit le marque mort)
  if (my !== run) return
  setGun(mp().shown?.turn ?? 0, 'rest')
  void prev
}

async function animShoot(ev: Extract<MultiEvent, { kind: 'shoot' }>, next: MultiState, my: number) {
  const { me } = mp()
  const local = ev.shooter === me
  const tslot = slotOfSeat(ev.target)
  mp().set({ aiming: false })
  setGun(ev.shooter, ev.target === ev.shooter ? 'self' : ev.target)
  if (!local) sfx('grab', 0, { volume: 0.5 })
  await wait(local ? 450 : 1100)
  if (my !== run) return
  const hitsMe = ev.live && ev.target === me
  const killed = ev.live && !next.alive[ev.target]
  if (ev.live) {
    playShot(ev.dmg > 1, hitsMe && killed)
    fx.shake = Math.max(fx.shake, hitsMe ? 4.5 : 3.6)
    fx.snap = hitsMe ? 1.5 : 1.2
    triggerImpact(screenOf(tslot), [1, 1, 1])
    await wait(140)
    if (my !== run) return
    if (tslot !== SOUTH) {
      if (killed) avatars[ev.target].dead = true
      else avatars[ev.target].hit = 1
    }
    fx.flash = hitsMe ? 0.6 : 0.35
    fx.flashColor = hitsMe ? [1, 0.12, 0.08] : [1, 1, 1]
    fx.shake = Math.max(fx.shake, hitsMe ? 3.8 : 3)
    fx.recoil = 1
    fx.muzzle = 1
    fx.kick = hitsMe ? 1.5 : 1.1
    if (hitsMe && killed) {
      mp().set({ deadText: true })
      setTimeout(() => mp().set({ deadText: false }), 4000)
    }
    await wait(700)
  } else {
    playClick()
    fx.shake = Math.max(fx.shake, 0.4)
    fx.snap = 0.2
    await wait(500)
  }
  if (my !== run) return
  commit(next)
  await wait(400)
}

/** Sons de chaque objet, calés sur la mise en scène (mêmes repères que le jeu solo). */
const ITEM_SFX: Partial<Record<ItemId, [SfxName, number][]>> = {
  handcuffs: [['handcuffs', 0.95]],
  saw: [['saw', 1.95], ['saw', 2.65]],
  loupe: [['loupe', 1.35]],
  beer: [['beer', 1.35]],
  cigarette: [['cigarette', 1.2]],
  pills: [['pills', 0.85]],
  adrenaline: [['adrenaline', 2.15]],
  inverter: [['inverter', 1.75]],
}

const cine = (pos: Vector3 | [number, number, number], aim: Vector3 | [number, number, number]) => {
  fx.cine.pos = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z]
  fx.cine.aim = Array.isArray(aim) ? aim : [aim.x, aim.y, aim.z]
  fx.cine.on = true
}

interface ActOpts {
  user: Seat
  stolen: boolean
  /** Victime de l'objet (menottes, adrénaline). */
  target?: Seat
  shell: boolean | null
  good: boolean
  /** État à afficher à l'instant où l'objet fait effet (null : pas d'effet propre, ex. la seringue). */
  next: MultiState | null
  my: number
}

async function playAct(id: ItemId, o: ActOpts) {
  const { me } = mp()
  const local = o.user === me
  const uslot = slotOfSeat(o.user)
  const spec = ACTS[id]
  const apply = o.next ? spec.apply : spec.dur
  const victimMe = o.target === me
  fx.act = {
    id,
    user: local ? 'player' : 'dealer',
    start: performance.now(),
    dur: spec.dur,
    apply,
    speed: 1,
    stolen: o.stolen,
    shell: o.shell,
    good: o.good,
    frame: local ? null : dealerMatrix(uslot),
    foe: o.target !== undefined ? cuffSpot(o.target) : null,
    // objet volé : il sort de la poche de la victime (sauf si c'est nous : de notre plateau, comme en solo)
    from: o.stolen && o.target !== undefined && !victimMe ? pocketOf(o.target) : null,
  }
  mp().set({ hideTray: (local && !o.stolen) || (o.stolen && victimMe) ? id : null })
  avatars[o.user].reach = !local
  // plan large sur celui qui agit : nous, ou son buste au-dessus de la table
  if (local) cine([0, 1.27, 1.95], [0, 0.95, 1.0])
  else cine([0, 1.32, 2.0], fromDealer(uslot, 0, 1.0, 0.6))

  sfx('grab', 0.05, { volume: 0.5 })
  for (const [name, at] of ITEM_SFX[id] ?? []) if (!sfx(name, at)) playBlip(330)
  if (id === 'handcuffs') sfx('thump', apply, { volume: 0.5, rate: 0.9 })
  if (id === 'saw') sfx('thump', apply, { volume: 0.45, rate: 1.1 })
  if (id === 'beer') sfx('rack', apply)
  const timers: number[] = []
  const at = (s: number, fn: () => void) => void timers.push(window.setTimeout(fn, s * 1000))
  const camGun = (point: 'chamber' | 'saw', close: number) => {
    const p = gunGrips[point]
    cine([p.x - 0.28 * close, p.y + 0.4 * close, p.z + 0.62 * close], p)
  }
  const back = () => (local ? cine([0, 1.27, 1.95], [0, 0.95, 1.0]) : cine([0, 1.32, 2.0], fromDealer(uslot, 0, 1.0, 0.6)))
  if (id === 'saw') {
    at(1.2, () => camGun('saw', 0.85))
    at(apply + 0.9, back)
  } else if (id === 'loupe' && local) {
    at(1.1, () => camGun('chamber', 0.55))
    at(3.5, back)
  } else if (id === 'inverter') {
    at(1.0, () => camGun('chamber', 0.8))
    at(3.2, back)
  } else if (id === 'beer') at(apply - 0.5, () => camGun('chamber', 1.1))
  else if (id === 'handcuffs' && o.target !== undefined) at(1.3, () => cine([0, 1.3, 1.95], cuffSpot(o.target!)))

  // un adversaire prend le fusil (tenu de profil devant lui) pour les objets qui s'en servent
  if (!local && (id === 'saw' || id === 'loupe' || id === 'inverter')) at(0.25, () => setGun(o.user, 'show'))
  if (!local && id === 'beer') at(apply - 1.4, () => setGun(o.user, 'show'))

  try {
    await wait(apply * 1000)
    if (o.my !== run) return
    if (o.next) commit(o.next)
    await wait((spec.dur - apply) * 1000)
  } finally {
    timers.forEach((t) => window.clearTimeout(t))
    fx.act = null
    avatars[o.user].reach = false
  }
}

async function animItem(ev: Extract<MultiEvent, { kind: 'item' }>, next: MultiState, my: number) {
  const { me } = mp()
  mp().set({ aiming: false })
  const loupeShell = ev.user === me ? next.known[me] : null
  const base = { user: ev.user, target: ev.target, good: !!ev.good, my }
  try {
    if (ev.id === 'adrenaline' && ev.stolen) {
      await playAct('adrenaline', { ...base, stolen: false, shell: null, next: null })
      if (my !== run) return
      await playAct(ev.stolen, { ...base, stolen: true, shell: ev.stolen === 'beer' ? (ev.shell ?? null) : ev.stolen === 'loupe' ? loupeShell : null, next })
    } else {
      await playAct(ev.id, { ...base, stolen: false, shell: ev.id === 'beer' ? (ev.shell ?? null) : ev.id === 'loupe' ? loupeShell : null, next })
    }
  } finally {
    fx.cine.on = false
    fx.reach.on = false
    fx.buzz = 0
    mp().set({ hideTray: null })
    if (my === run && mp().shown !== next) commit(next) // par sécurité : l'état final est toujours affiché
  }
  await wait(250)
}

// --- entrées du joueur ---------------------------------------------------------------------------------------------

export const mpCanAct = () => {
  const { shown: g, me, busy } = mp()
  return !!g && stage().multi && g.phase === 'playing' && g.turn === me && g.alive[me] && !busy
}

/** Vue client sans chargeur : on rétablit sa longueur pour les objets qui la testent (bière, scie, loupe…). */
const probe = (g: MultiState): MultiState => ({ ...g, chamber: Array<boolean>(g.remaining.live + g.remaining.blank).fill(false) })

/** Premier adversaire vivant après nous dans l'ordre du tour (cible par défaut quand on prend le fusil). */
function defaultTarget(): Seat {
  const { shown: g, me } = mp()
  if (!g) return me
  for (let k = 1; k < g.names.length; k++) {
    const s = (me + k) % g.names.length
    if (g.alive[s]) return s
  }
  return me
}

function send(a: MultiAction) {
  awaiting = performance.now()
  const sent = awaiting
  refreshBusy()
  useNetStore.getState().act(a)
  // action refusée par l'hôte (aucun nouvel état) : on débloque au bout de 3 s
  setTimeout(() => {
    if (awaiting === sent) {
      awaiting = 0
      refreshBusy()
      setGun(mp().me, 'rest')
    }
  }, 3000)
}

/** Clic sur le fusil : le prendre / le reposer. */
export function mpToggleAim() {
  unlockAudio()
  if (!mpCanAct()) return
  const aiming = !mp().aiming
  sfx('grab')
  mp().set({ aiming, pick: null })
  setGun(mp().me, aiming ? defaultTarget() : 'rest')
}

/** Survol d'un joueur fusil en main : le canon le suit. null = plus de survol. */
export function mpHover(seat: Seat | null) {
  if (!mp().aiming || mp().busy) return
  setGun(mp().me, seat === null ? defaultTarget() : seat === mp().me ? 'self' : seat)
}

/** Tir sur `target` (nous compris). */
export function mpFire(target: Seat) {
  const { shown: g, me, aiming } = mp()
  if (!mpCanAct() || !aiming || !g?.alive[target]) return
  unlockAudio()
  setGun(me, target === me ? 'self' : target)
  send({ type: 'shoot', target })
}

/** Clic sur un objet (plateau ou liste) : utilisé tout de suite, ou en attente d'une victime (menottes, adrénaline). */
export function mpUseItem(index: number) {
  unlockAudio()
  const { shown: g, me } = mp()
  if (!mpCanAct() || !g) return
  const id = g.inventory[me][index]
  if (!id) return
  const def = MULTI_ITEMS[id]
  if (!def.canUse(probe(g), me)) return
  if (def.needsTarget) {
    sfx('grab', 0, { volume: 0.4 })
    mp().set({ pick: index, aiming: false })
    setGun(me, 'rest')
    return
  }
  send({ type: 'item', index })
}

/** Victime choisie pour l'objet en attente. */
export function mpPickTarget(seat: Seat) {
  const { shown: g, me, pick } = mp()
  if (pick === null || !g || !mpCanAct()) return
  const id = g.inventory[me][pick]
  if (!id || !MULTI_ITEMS[id].canUse(probe(g), me, seat)) return
  mp().set({ pick: null })
  send({ type: 'item', index: pick, target: seat })
}

/** Clic sur un joueur : tir si on tient le fusil, victime si un objet attend sa cible. */
export function mpClickSeat(seat: Seat) {
  if (mp().aiming) mpFire(seat)
  else if (mp().pick !== null) mpPickTarget(seat)
}

/** Peut-on cliquer sur ce joueur maintenant ? (curseur) */
export function mpSeatClickable(seat: Seat) {
  const { shown: g, me, aiming, pick } = mp()
  if (!g || !mpCanAct() || !g.alive[seat]) return false
  if (aiming) return true
  if (pick === null) return false
  const id = g.inventory[me][pick]
  return !!id && MULTI_ITEMS[id].canUse(probe(g), me, seat)
}

export function mpCancel() {
  if (!mp().aiming && mp().pick === null) return
  mp().set({ aiming: false, pick: null })
  if (!mp().busy) setGun(mp().me, 'rest')
}

export const mpItemUsable = (index: number) => {
  const { shown: g, me } = mp()
  const id = g?.inventory[me][index]
  return !!g && !!id && MULTI_ITEMS[id].canUse(probe(g), me)
}

// --- entrée / sortie de la partie ----------------------------------------------------------------------------------

function enter() {
  run++
  queue = []
  running = false
  awaiting = 0
  avatars.forEach((a) => Object.assign(a, newAvatarState()))
  mp().set({ shown: null, aiming: false, pick: null, busy: false, hideTray: null, deadText: false })
  fx.gunTarget = computeGun
  fx.cine.on = false
  fx.act = null
  // la salle de jeu, sans croupier ni défibrillateur ; la musique « derrière le mur », comme en partie
  stage().set({ multi: true, defibGone: true, aiming: false, busy: false, pose: 'rest', hideTray: null })
  setMusicRoom(true)
  setMusic(true)
}

function exit() {
  run++
  queue = []
  running = false
  awaiting = 0
  fx.gunTarget = null
  fx.sawed = null
  fx.cuffSpots = null
  fx.act = null
  fx.cine.on = false
  fx.reach.on = false
  fx.buzz = 0
  mp().set({ shown: null, aiming: false, pick: null, busy: false, hideTray: null, deadText: false })
  stage().set({ multi: false, defibGone: false })
  setMusicRoom(false)
}

/** Branche le réalisateur sur la session réseau (une fois, au démarrage). */
export function installMulti() {
  const off = useNetStore.subscribe((s, p) => {
    if (s.status === 'playing' && s.view && s.view !== p.view) {
      if (!stage().multi) enter()
      awaiting = 0
      mp().set({ me: s.seat })
      queue.push(s.view)
      void pump()
    }
    if (p.status === 'playing' && s.status !== 'playing' && stage().multi) exit()
  })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && stage().multi) mpCancel()
  }
  window.addEventListener('keydown', onKey)
  return () => {
    off()
    window.removeEventListener('keydown', onKey)
  }
}
