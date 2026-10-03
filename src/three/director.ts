import { tr } from '../i18n'
import { decideDealer } from '../game/dealerAI'
import { ITEMS } from '../game/items'
import { useItem } from '../game/rules'
import type { Actor, GameState, ItemId } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useSoundStore } from '../store/soundStore'
import { useStatsStore } from '../store/statsStore'
import { interludeText, useStageStore, type Pose } from '../store/stageStore'
import { audioLive, audioRunning, CARDIAC, playBlip, playCardiacArrest, playChair, playDealerRise, playDealerThrown, playFootstep, playMetalDoor, playEntityVoice, playTypeTick, playVoicePlaceholder, sfxLength, type SfxName, startLightBuzz, setMusic, setMusicRoom, setMusicTrack, playTransition, startCarAmbience, playClick, playShot, preloadSounds, sfx, unlockAudio } from './audio'
import { CREDITS_SECONDS } from '../ui/credits'
import { LAYOUT } from './models'
import { END_SCENE } from './EndScene'
import { ENTRANCE, fx, stepTime, triggerImpact, walkSpeed, WALK_STEPS } from './fx'
import { gunGrips } from './grips'
import { ACT_SPEED, ACTS } from './itemActs'

/**
 * Réalisateur : orchestre les séquences visuelles/sonores et appelle le store de règles
 * au bon moment (l'état du jeu ne change qu'après l'animation du tir).
 */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const game = () => useGameStore.getState().game
const stage = () => useStageStore.getState()
const setPose = (pose: Pose) => stage().set({ pose })

export const canAct = () => stage().started && game().phase === 'playing' && game().turn === 'player' && !stage().busy

async function fire(live: boolean, victim: Actor, shooter: Actor) {
  const hitsPlayer = live && victim === 'player'
  useStatsStore.getState().shot(stage().chapter, shooter, victim, live, game().sawed[shooter] ? 2 : 1)
  if (live) {
    // impact frame d'abord (le son part avec) ; le reste du choc (recul, secousse, coup reçu) arrive
    // après un bref hit-stop, pendant que l'image encrée masque la scène
    const damage = game().sawed[shooter] ? 2 : 1
    const lethal = hitsPlayer && game().hp.player <= damage
    const lethalDealer = live && victim === 'dealer' && game().hp.dealer <= damage
    playShot(game().sawed[shooter], lethal)
    // grosse secousse de caméra dès le tir, que ce soit nous ou le croupier qui tire : recul sec + traumatisme
    fx.shake = Math.max(fx.shake, hitsPlayer ? 4.5 : 3.6)
    fx.snap = hitsPlayer ? 1.5 : 1.2
    triggerImpact(victim === 'dealer' ? [0.42, 0.62] : [0.5, 0.5], [1, 1, 1])
    await wait(140)
    if (lethal) {
      // balle mortelle : on est mort dès l'impact, le noir tombe tout de suite (pas de recul, pas de secousse)
      beginDeath()
      return
    }
    if (victim === 'dealer') {
      if (lethalDealer) {
        // dernière vie du croupier : il est projeté en arrière à l'instant de l'impact, la musique s'arrête net
        setMusic(false)
        stage().set({ dealerDead: true })
      } else fx.dealerHit = 1
    }
    fx.flash = 0.35
    fx.flashColor = [1, 1, 1]
    fx.shake = Math.max(fx.shake, hitsPlayer ? 3.8 : 3) // nouveau pic quand l'image d'impact se lève
    fx.recoil = 1
    fx.muzzle = 1
    fx.kick = hitsPlayer ? 1.5 : 1.1
    await wait(700)
  } else {
    playClick()
    fx.shake = Math.max(fx.shake, 0.4) // à blanc : simple sursaut
    fx.snap = 0.2
    await wait(500)
  }
}

/** Clic sur le fusil : le prend en main / le repose. */
export function toggleAim() {
  unlockAudio()
  if (!canAct()) return
  const aiming = !stage().aiming
  sfx('grab')
  stage().set({ aiming, pose: aiming ? 'playerDealer' : 'rest' })
}

/** Tir du joueur sur 'dealer' ou sur lui-même ('player'). */
export async function playerFire(target: Actor) {
  if (!canAct() || !stage().aiming) return
  unlockAudio()
  stage().set({ busy: true })
  setPose(target === 'dealer' ? 'playerDealer' : 'playerSelf')
  await wait(700)
  const live = game().chamber[0]
  await fire(live, target === 'dealer' ? 'dealer' : 'player', 'player')
  useGameStore.getState().playerShoot(target)
  stage().set({ aiming: false, pose: 'rest' })
  if (await settleEnd()) return
  await wait(600)
  await dealerTurn()
  if (await settleEnd()) return
  stage().set({ busy: false })
}

/** Clic sur un objet (plateau ou liste en bas à droite) : l'objet est montré et utilisé, voir useItemAnimated. */
export async function playerUseItem(id: ItemId) {
  if (!canAct()) return
  unlockAudio()
  const g = game()
  const index = g.inventory.player.indexOf(id)
  if (index < 0 || !ITEMS[id].canUse(g, 'player')) return
  stage().set({ busy: true })
  useStatsStore.getState().item(stage().chapter, 'player')
  if (!(await useItemAnimated('player', index))) {
    stage().set({ busy: false })
    return
  }
  if (await settleEnd()) return // pilules périmées : on peut en mourir
  await wait(250 / chapterSpeed())
  stage().set({ busy: false })
}

// --- utilisation d'un objet : le joueur voit ce qu'il fait, et ce que fait le croupier ---------------------------------

/** Vitesse des animations d'objets selon la partie en cours (voir ACT_SPEED). */
const chapterSpeed = () => ACT_SPEED[Math.min(Math.max(stage().chapter, 1), ACT_SPEED.length) - 1]

const other = (a: Actor): Actor => (a === 'player' ? 'dealer' : 'player')

function setCine(pos: [number, number, number], aim: [number, number, number]) {
  fx.cine.pos = pos
  fx.cine.aim = aim
  fx.cine.on = true
}
/** Plan large sur celui qui agit : le joueur voit son objet devant lui ; le croupier, buste et mains au-dessus de la table. */
const camGeneral = (user: Actor) => (user === 'player' ? setCine([0, 1.27, 1.95], [0, 0.95, 1.0]) : setCine([0, 1.3, 1.95], [0, 1.02, 0.68]))
/** Plan resserré sur le fusil (culasse, ou canon pour la scie), vu de notre côté de la table. */
function camGun(point: 'chamber' | 'saw', close: number) {
  const p = gunGrips[point]
  setCine([p.x - 0.28 * close, p.y + 0.4 * close, p.z + 0.62 * close], [p.x, p.y, p.z])
}

/**
 * Joue la mise en scène d'un objet (voir ItemProps.tsx pour les images) et applique son effet à l'instant prévu.
 * `next` = état du jeu une fois l'objet utilisé (calculé d'avance : rien ne change avant `apply`) ; null = pas d'effet.
 * Renvoie false si la partie a été recommencée entre-temps.
 */
async function playAct(id: ItemId, user: Actor, g: GameState, next: GameState | null, stolen: boolean) {
  const spec = ACTS[id]
  const dealer = user === 'dealer'
  const apply = next ? spec.apply : spec.dur
  const speed = chapterSpeed()
  fx.act = {
    id, user, start: performance.now(), dur: spec.dur, apply, speed, stolen,
    shell: id === 'beer' || id === 'loupe' ? (g.chamber[0] ?? null) : null,
    good: next ? next.hp[user] > g.hp[user] : false,
  }
  // l'objet quitte le plateau du joueur (il l'utilise, ou le croupier le lui vole)
  stage().set({ hideTray: (user === 'player') !== stolen ? id : null })
  camGeneral(user)

  // sons (le délai est calé sur la mise en scène) et changements de plan
  const SFX: Partial<Record<ItemId, [SfxName, number][]>> = {
    handcuffs: [['handcuffs', 0.95]],
    saw: [['saw', 1.95], ['saw', 2.65]],
    loupe: [['loupe', 1.35]],
    beer: [['beer', 1.35]],
    cigarette: [['cigarette', 1.2]],
    pills: [['pills', 0.85]],
    adrenaline: [['adrenaline', 2.15]],
    inverter: [['inverter', 1.75]],
  }
  sfx('grab', 0.05, { volume: 0.5 })
  for (const [name, at] of SFX[id] ?? []) if (!sfx(name, at / speed)) playBlip(330)
  if (id === 'handcuffs') sfx('thump', apply / speed, { volume: 0.5, rate: 0.9 }) // elles se ferment
  if (id === 'saw') sfx('thump', apply / speed, { volume: 0.45, rate: 1.1 }) // le bout de canon tombe
  if (id === 'beer') sfx('rack', apply / speed)
  const timers: number[] = []
  const at = (s: number, fn: () => void) => void timers.push(window.setTimeout(fn, (s * 1000) / speed))
  if (id === 'saw') {
    at(1.2, () => camGun('saw', 0.85))
    at(apply + 0.9, () => camGeneral(user))
  } else if (id === 'loupe') {
    at(1.1, () => camGun('chamber', 0.55))
    at(3.5, () => camGeneral(user))
  } else if (id === 'inverter') {
    at(1.0, () => camGun('chamber', 0.8))
    at(3.2, () => camGeneral(user))
  } else if (id === 'beer') {
    at(apply - 0.5, () => camGun('chamber', 1.1))
  } else if (id === 'handcuffs') {
    at(1.3, () => (dealer ? setCine([0.05, 1.32, 1.95], [0.04, 0.86, 1.3]) : setCine([0, 1.22, 1.9], [0, 0.88, 0.62])))
  }

  // le croupier prend le fusil (tenu de profil devant lui) pour les objets qui s'en servent
  if (dealer && (id === 'saw' || id === 'loupe' || id === 'inverter')) at(0.25, () => stage().set({ pose: 'dealerShow' }))
  if (dealer && id === 'beer') at(apply - 1.4, () => stage().set({ pose: 'dealerShow' }))

  await wait((apply * 1000) / speed)
  let valid = true
  if (next) {
    if (game() === g) {
      useGameStore.setState({ game: next })
    } else valid = false
  }
  await wait(((spec.dur - apply) * 1000) / speed)
  timers.forEach((id) => window.clearTimeout(id))
  fx.act = null
  return valid
}

/**
 * Le joueur ou le croupier utilise l'objet n° `index` de son inventaire. L'état suivant est calculé d'avance
 * (règles inchangées : rules.useItem) ; la mise en scène l'applique au bon moment. L'adrénaline enchaîne : la seringue,
 * puis l'objet volé est pris à l'adversaire et utilisé à son tour.
 */
async function useItemAnimated(user: Actor, index: number) {
  const g = game()
  const id = g.inventory[user][index]
  if (!id) return false
  const next = useItem(g, user, index)
  if (next === g) return false
  stage().set({ busy: true })
  let ok: boolean
  try {
    let stolen: ItemId | null = null
    if (id === 'adrenaline') {
      // l'objet volé : celui qui manque dans l'inventaire de l'adversaire
      const left = [...next.inventory[other(user)]]
      for (const x of g.inventory[other(user)]) {
        const i = left.indexOf(x)
        if (i >= 0) left.splice(i, 1)
        else {
          stolen = x
          break
        }
      }
    }
    if (stolen) {
      await playAct('adrenaline', user, g, null, false)
      ok = await playAct(stolen, user, g, next, true)
    } else ok = await playAct(id, user, g, next, false)
  } finally {
    fx.act = null
    fx.cine.on = false
    fx.focus.on = false
    fx.reach.on = false
    fx.buzz = 0
    stage().set({ hideTray: null, ...(stage().pose === 'dealerShow' ? { pose: 'rest' as const } : {}) })
  }
  return ok
}

/** Numéro de la séquence de mort en cours : recommencer la partie l'invalide (les attentes en suspens s'arrêtent). */
let deathRun = 0
/** Instant (performance.now) où la mort a commencé, 0 = pas de mort en cours. */
let deathStart = 0
let stopDeathSound: (() => void) | null = null

/**
 * Le joueur est touché par une balle mortelle : le noir tombe aussitôt (juste après l'impact frame), la musique
 * s'éteint et le cœur lâche (battements de plus en plus faibles, bips de moniteur, acouphène, tracé plat).
 * Idempotente : l'appel de la fin de partie (playerDeath) ne relance rien.
 */
function beginDeath() {
  if (deathStart > 0) return
  deathRun++
  deathStart = performance.now()
  useStatsStore.getState().death(stage().chapter)
  setMusic(false)
  stage().set({ death: true, deathText: false })
  stopDeathSound = playCardiacArrest()
}

/** Suite de la mort, une fois le tir résolu : « TU ES MORT » sur le tracé plat, puis rejouer. Renvoie false si la partie a été recommencée entre-temps. */
async function playerDeath(final = false) {
  beginDeath() // déjà fait au moment du tir ; au cas où (ex. mort par un autre chemin)
  const run = deathRun
  const alive = () => run === deathRun && game().phase === 'gameOver'
  await sleepUntil(deathStart + CARDIAC.flatline * 1000)
  if (!alive()) return false
  if (final) return true // mort définitive (partie 3) : pas de « TU ES MORT », le néant suit
  stage().set({ deathText: true })
  await wait(2200)
  return alive()
}

/** Fin de partie : le croupier s'effondre s'il est mort, sinon écran de mort ; puis l'écran de fin s'affiche. Renvoie true si la partie est finie. */
async function settleEnd() {
  const g = game()
  if (g.phase !== 'gameOver') return false
  stage().set({ busy: true })
  if (g.winner === 'player') {
    // parties 1 et 2 : le croupier ressuscite ; partie 3 : victoire
    useStatsStore.getState().finish(stage().chapter) // durée de la partie, figée à la victoire
    if (stage().chapter < 3) {
      await reviveDealer() // false = partie recommencée pendant la séquence : rien d'autre à faire
      return true
    }
    stage().set({ dealerDead: true })
    await wait(2100) // déjà projeté à l'impact du tir
    await carEnding() // victoire finale : la voiture, la valise, puis le générique
    return true
  } else {
    const final = stage().chapter >= 3 // partie 3 : plus de défibrillateur, la mort est la fin
    if (!(await playerDeath(final))) return true // partie recommencée pendant la séquence
    if (final) {
      await theEnd()
      return true
    }
  }
  stage().set({ endReady: true })
  return true
}

async function dealerTurn() {
  for (let guard = 0; guard < 40 && game().phase === 'playing' && game().turn === 'dealer'; guard++) {
    await wait(900 / chapterSpeed()) // il réfléchit moins longtemps aux parties suivantes
    const a = decideDealer(game())
    if (a.type === 'item') {
      // le croupier sort l'objet, le montre et l'utilise (comme le joueur) ; repli : application directe
      if (!(await useItemAnimated('dealer', a.index))) useGameStore.getState().dealerStep()
      await wait(450 / chapterSpeed())
      continue
    }
    setPose(a.target === 'player' ? 'dealerPlayer' : 'dealerSelf')
    await wait(1000)
    const live = game().chamber[0]
    await fire(live, a.target === 'player' ? 'player' : 'dealer', 'dealer')
    useGameStore.getState().dealerStep()
    setPose('rest')
    if (game().phase === 'gameOver') return
    await wait(500)
  }
}

/**
 * Bouton JOUER : transition style CRT (extinction du titre, allumage de la salle, ~1,6 s), puis scène du
 * contrat : la salle de jeu avec le papier à signer. La partie ne démarre qu'à la signature.
 * Le clic débloque aussi l'audio.
 */
/** Durée (ms) de l'écran noir « casque » après PLAY. */
const HEADPHONES_MS = 4500

export async function startGame() {
  if (stage().started || stage().contract || stage().transitioning) return
  setMusicRoom(true) // la bande son passe derrière le mur (avant unlockAudio : si elle démarre ici, c'est déjà filtrée)
  unlockAudio()
  sfx('grab', 0, { volume: 0.4, rate: 0.6 })
  // écran noir : conseil d'écoute, puis le noir se lève sur la transition vers le contrat
  stage().set({ transitioning: true, headphones: true })
  await wait(HEADPHONES_MS)
  playTransition()
  stage().set({ headphones: false })
  fx.transStart = performance.now()
  fx.transT = 0
  await wait(800)
  stage().set({ contract: true, signed: false, aiming: false, busy: false, pose: 'rest', dealerDead: false, endReady: false })
  await wait(850)
  stage().set({ transitioning: false })
}

/**
 * Signature validée : tampon, puis entracte (écran noir, la musique s'éteint, silence total, la phrase s'écrit
 * lettre par lettre avec un bruit de frappe), puis la partie se lance et la musique revient.
 */
export async function signContract() {
  if (!stage().contract || stage().signed) return
  stage().set({ signed: true })
  sfx('thump', 0, { volume: 0.55, rate: 0.9 }) // coup de tampon
  sfx('grab', 0.05, { volume: 0.5 })
  await wait(1500)

  // noir + silence
  setMusic(false)
  stage().set({ interlude: true, interludeText: '' })
  await wait(2300)

  // la phrase s'écrit : une frappe par lettre, pauses sur la ponctuation
  const phrase = interludeText()
  for (let i = 1; i <= phrase.length; i++) {
    const ch = phrase[i - 1]
    stage().set({ interludeText: phrase.slice(0, i) })
    if (ch !== ' ') playTypeTick()
    await wait(ch === ' ' ? 170 : 90 + Math.random() * 70)
  }
  await wait(2200)

  // le texte disparaît, le noir continue
  stage().set({ interludeText: '' })
  fx.dealerReveal = 0 // le croupier n'est pas encore là
  await wait(1600)

  // une lourde porte métallique s'ouvre derrière nous
  playMetalDoor()
  await wait(6400) // verrou, grincement (~4,8 s), butée ; la queue de réverbération couvre le début de la marche
  await enterRoom()
}

const sleepUntil = (ms: number) => wait(Math.max(0, ms - performance.now()))

/** Sous-titre : [début (s), fin (s), texte] depuis le début de la voix. */
type Cue = [number, number, string]

/**
 * Voix du croupier : le sample part (voix d'entité synthétique, réverbérée) et les sous-titres suivent les repères
 * (calés sur les pauses de l'enregistrement). Résout à la fin du sample ; rien ne se passe s'il n'est pas chargé.
 */
async function speak(name: SfxName, cues: Cue[], volume = 0.55, fallbackSeconds = 0) {
  const played = playEntityVoice(name, 0, volume)
  // pas d'enregistrement : voix de remplacement (murmure sans paroles) si une durée est donnée, sinon rien
  if (!played) {
    if (fallbackSeconds <= 0) return
    playVoicePlaceholder(fallbackSeconds)
  }
  const duration = played ? sfxLength(name) : fallbackSeconds
  const t0 = performance.now()
  void (async () => {
    for (const [from, to, text] of cues) {
      await sleepUntil(t0 + from * 1000)
      stage().set({ subtitle: text })
      await sleepUntil(t0 + to * 1000)
      if (stage().subtitle === text) stage().set({ subtitle: '' })
    }
  })()
  await sleepUntil(t0 + duration * 1000)
}

/** Rougeur des yeux du croupier par partie (voir Croupier.tsx : intensité × (1 + 1,8 × valeur), teinte vers le rouge pur). */
const EYE_RED = [0, 1, 2.6]

/** Change de partie (1 à 3) : les yeux du croupier rougissent et le morceau change (un par partie). */
function setChapter(n: number) {
  stage().set({ chapter: n, defibGone: false }) // le défibrillateur ne disparaît qu'à la cinématique de la partie 3
  fx.eyeRed = EYE_RED[n - 1] ?? 0 // partie 1 : yeux d'origine ; 2 : très rouges ; 3 : le rouge à son comble
  setMusicTrack(n === 2 ? 'part2' : n === 3 ? 'part3' : 'main') // un morceau par partie
  setMusicRoom(true) // et toujours « derrière le mur » en jeu, quel que soit le chemin par lequel on arrive dans la partie
}

/** Le croupier sort de l'obscurité : la lampe papillote, grésille, et il apparaît peu à peu (3,4 s). */
async function emerge() {
  const stopBuzz = startLightBuzz(() => ({ flicker: fx.flicker, lamp: fx.lamp }))
  playDealerRise()
  fx.flicker = 1
  const t0 = performance.now()
  const DURATION = 3400
  await new Promise<void>((resolve) => {
    const tick = () => {
      const k = Math.min((performance.now() - t0) / DURATION, 1)
      fx.dealerReveal = k * k * (3 - 2 * k)
      if (k < 1) requestAnimationFrame(tick)
      else resolve()
    }
    tick()
  })
  fx.dealerReveal = 1
  await wait(900)
  stopBuzz()
}

/** Règles par partie : PV de chaque joueur et niveau de l'IA du croupier (partie 1 inchangée, puis 5 PV, puis 7 PV). */
const ROUNDS = [
  { hp: 3, level: 1 },
  { hp: 5, level: 2 },
  { hp: 7, level: 3 },
]

/** Nouvelle manche, avec les règles de la partie en cours. */
function newRound() {
  const r = ROUNDS[Math.min(Math.max(stage().chapter, 1), ROUNDS.length) - 1]
  useGameStore.getState().newGame(r.hp, r.level)
  useStatsStore.getState().begin(stage().chapter) // le chrono de la partie démarre à sa première manche
}

/** Numéro de la résurrection en cours : recommencer la partie l'invalide. */
let reviveRun = 0

/**
 * Le croupier n'a plus de vie (parties 1 et 2) : la musique s'arrête, il est projeté en arrière dans la pénombre,
 * la lampe grésille sur la chaise repoussée et il disparaît pour de bon ; la phrase résonne dans la salle vide ; la lampe grésille de nouveau, il réapparaît (les yeux
 * plus rouges qu'avant), la musique revient, et la partie suivante commence. Renvoie false si la partie a été
 * recommencée entre-temps.
 */
async function reviveDealer() {
  const run = ++reviveRun
  const on = () => run === reviveRun
  setMusic(false) // plus de vie : la musique s'arrête
  stage().set({ dealerDead: true }) // déjà projeté à l'impact du tir (voir fire) ; au cas où il y serait arrivé autrement
  await wait(1700) // la projection a commencé 0,7 s plus tôt, au moment du tir
  if (!on()) return false

  // la lampe grésille, il disparaît
  stage().set({ entrance: true }) // interface masquée pendant l'entracte
  const stopBuzz = startLightBuzz(() => ({ flicker: fx.flicker, lamp: fx.lamp }))
  fx.flicker = 1
  await wait(900)
  if (!on()) return false
  fx.dealerReveal = 0
  stage().set({ dealerDead: false }) // remis en place hors de vue
  await wait(1100)
  if (!on()) return false
  fx.flicker = 0 // la lampe se stabilise sur la chaise vide
  stopBuzz()
  await wait(900)
  if (!on()) return false

  // la phrase (enregistrement fourni : dealer-not-over.mp3, 2,1 s ; repli : murmure de remplacement)
  // avant la partie 3 : autre enregistrement (dealer-alone.mp3, 16,3 s ; repères calés sur les silences du fichier)
  if (stage().chapter === 2) {
    await speak('dealerAlone', [
      [0, 2.3, tr('Pourquoi persistes-tu ?', 'Why do you persist?')],
      [2.8, 5.75, tr('Ta vie ne vaut rien...', 'Your life is worth nothing...')],
      [5.9, 9.3, tr("N'oublie pas que si tu meurs...", "Don't forget that if you die...")],
      [9.9, 12.1, tr('tu seras seul.', 'you will be alone.')],
      [12.4, 13.3, tr('Très...', 'Very...')],
      [14.9, 16.2, tr('seul.', 'alone.')],
    ], 0.55)
  }
  else await speak('dealerNotOver', [[0, 2.0, tr("Tu crois que c'est fini ?", "You think it's over?")]], 0.55, 2.1)
  if (!on()) return false
  await wait(1000)
  if (!on()) return false

  // il réapparaît, plus menaçant ; la musique revient
  setChapter(stage().chapter + 1)
  if (stage().chapter < 3) setMusic(true) // partie 3 : la musique ne revient que quand le défibrillateur disparaît (finalWarning)
  await emerge()
  if (!on()) return false
  if (stage().chapter === 3) {
    await finalWarning(on)
    if (!on()) return false
  }
  stage().set({ entrance: false, busy: false, aiming: false, pose: 'rest' })
  newRound()
  return true
}

// --- cinématique d'explication des objets (partie 1) -------------------------------------------------------

/** Passe la cinématique (Échap) : les phrases en cours s'interrompent, le jeu démarre. */
let tutorialSkip = false

/** Phrase du croupier : voix de remplacement (murmure d'entité) + sous-titre, interruptibles. */
async function say(text: string, pause = 450) {
  if (tutorialSkip) return
  const secs = Math.min(7.5, 1.3 + text.length * 0.058)
  const stopVoice = playVoicePlaceholder(secs, 1.2) // voix des règles (partie 1) : bien audible
  stage().set({ subtitle: text })
  const end = performance.now() + secs * 1000
  while (performance.now() < end && !tutorialSkip) await wait(60)
  stopVoice()
  if (stage().subtitle === text) stage().set({ subtitle: '' })
  if (!tutorialSkip) await wait(pause)
}

/** Caméra vers un point de la table (glissé lent) et lumière de mise en valeur au-dessus de l'objet. */
async function look(focus: [number, number, number], cam: [number, number, number], settle = 1500) {
  if (tutorialSkip) return
  fx.cine.pos = cam
  fx.cine.aim = [focus[0], focus[1], focus[2]]
  fx.cine.on = true
  fx.focus.x = focus[0]
  fx.focus.y = focus[1]
  fx.focus.z = focus[2]
  fx.focus.on = true
  const end = performance.now() + settle
  while (performance.now() < end && !tutorialSkip) await wait(60)
}

/** Position monde de l'objet du plateau (centre local mesuré dans inventaire.glb, plateau à l'échelle 0,58). */
const onTray = (cx: number, cz: number): [number, number, number] => [LAYOUT.tray[0] + LAYOUT.trayScale * cx, 0.81, LAYOUT.tray[2] + LAYOUT.trayScale * cz]
/**
 * Caméra presque à la verticale de l'objet, côté gauche (plongée d'environ 55°, ~0,5 m) : le fusil, posé à droite du
 * plateau, ne s'interpose pas entre l'objet et l'œil.
 */
const camAbove = (p: [number, number, number]): [number, number, number] => [Math.max(p[0] - 0.12, -0.95), 1.25, p[2] + 0.28]
/** Boîte du défibrillateur sur la table (recul de DEFIB_SHIFT_Z compris : voir Room.tsx). */
const DEFIB: [number, number, number] = [-0.68, 0.86, 0.68]

/**
 * Le croupier explique les objets un par un (la caméra se pose sur chacun, une lumière le met en valeur), puis
 * montre le défibrillateur : c'est lui qui nous maintient en vie. Les voix sont des murmures de remplacement tant
 * que les enregistrements n'existent pas ; les sous-titres portent le texte. Échap passe la cinématique.
 */
export async function tutorial() {
  tutorialSkip = false
  stage().set({ tutorial: true })
  try {
    await say(tr('Avant de commencer... tu dois savoir ce qui se trouve sur cette table.', 'Before we begin... you should know what lies on this table.'), 700)
    await say(tr('Ces objets sont à toi. Utilise-les à chaque tour, depuis le bas à droite de ton écran.', 'These items are yours. Use them any time it is your turn, from the bottom right of your screen.'), 800)

    const beer = onTray(0.32, -0.25)
    await look(beer, camAbove(beer))
    await say(tr('La bière. Bois-la, et la balle en chambre est éjectée. Non tirée. Non vue.', 'The beer. Drink it, and the shell in the chamber is thrown out. Unfired. Unseen.'))

    const loupe = onTray(-0.325, -0.27)
    await look(loupe, camAbove(loupe))
    await say(tr('La loupe. Elle te montre la balle en chambre. Réelle... ou à blanc.', 'The glass. It shows you the shell in the chamber. Live... or blank.'))

    const cig = onTray(-0.005, 0.02)
    await look(cig, camAbove(cig))
    await say(tr('Les cigarettes. Une bouffée, et une vie te revient.', 'Cigarettes. One drag, and a life returns to you.'))

    const saw = onTray(0.02, -0.27)
    await look(saw, camAbove(saw))
    await say(tr('La scie. Raccourcis le canon, et le prochain tir frappe deux fois plus fort.', 'The saw. Shorten the barrel, and the next shot hits twice as hard.'))

    const cuffs = onTray(-0.315, 0.01)
    await look(cuffs, camAbove(cuffs))
    await say(tr('Les menottes. Entrave ton adversaire, et il perd son prochain tour.', 'Handcuffs. Bind your opponent, and he loses his next turn.'))

    const pills = onTray(-0.32, 0.245)
    await look(pills, camAbove(pills))
    await say(tr('De vieilles pilules. Avale-les, et joue ta chance. Deux vies gagnées... ou une perdue.', 'Old pills. Swallow them, and gamble. Two lives gained... or one lost.'))

    const adrenaline = onTray(-0.01, 0.255)
    await look(adrenaline, camAbove(adrenaline))
    await say(tr("L'adrénaline. Vole un objet à ton adversaire, et utilise-le aussitôt.", 'Adrenaline. Steal an item from your opponent, and use it at once.'))

    const inverter = onTray(0.31, 0.305)
    await look(inverter, camAbove(inverter))
    await say(tr("L'inverseur. Il retourne la balle en chambre. Réelle devient à blanc. À blanc devient réelle.", 'The inverter. It flips the shell in the chamber. Live becomes blank. Blank becomes live.'), 900)
    await say(tr('Mais ne compte pas sur un objet en particulier. À chaque round, ils sont distribués au hasard.', 'But do not count on any one item. Every round, they are dealt at random.'), 700)

    // le défibrillateur
    await look(DEFIB, [-0.55, 1.35, 1.2], 2000)
    await say(tr('Et ceci...', 'And this...'), 900)
    await say(tr('Le défibrillateur.', 'The defibrillator.'), 900)
    await say(tr("C'est la seule raison pour laquelle nous respirons encore.", 'It is the only reason we are still breathing.'), 600)
    await say(tr("Chaque fois qu'un cœur s'arrête sur cette table... il le fait repartir.", 'Every time a heart stops on this table... it starts it again.'), 700)
    await say(tr("Tu mourras ici. Et tu reviendras. Jusqu'à la fin de la partie.", 'You will die here. And you will come back. Until the game is finished.'), 1000)
  } finally {
    // retour à la vue de jeu
    fx.cine.on = false
    fx.focus.on = false
    stage().set({ tutorial: false, subtitle: '' })
  }
  if (!tutorialSkip) await say(tr('Souviens-toi. Clique sur les objets en bas à droite de ton écran pour les utiliser.', 'Remember. Click the items at the bottom right of your screen to use them.'), 500)
  if (!tutorialSkip) await say(tr('Maintenant. Prends le fusil.', 'Now. Take the gun.'), 300)
  await wait(500)
}

/** Mini cinématique de la partie 3 en cours (Échap la passe). */
let warningOn = false

/**
 * Partie 3, juste après son retour : le croupier ne plaisante plus. La caméra va sur le défibrillateur, la lampe
 * grésille et la machine disparaît de la table ; il annonce les règles de cette dernière partie. Échap la passe.
 */
async function finalWarning(on: () => boolean) {
  tutorialSkip = false
  warningOn = true
  try {
    await say(tr('Maintenant... les jeux sont finis.', 'Now... the games are over.'), 800)
    if (!on()) return

    await look(DEFIB, [-0.55, 1.35, 1.2], 1800)
    await say(tr('Tu vois cette machine ?', 'Do you see this machine?'), 600)
    // la lampe grésille et le défibrillateur disparaît
    const stopBuzz = startLightBuzz(() => ({ flicker: fx.flicker, lamp: fx.lamp }))
    fx.flicker = 1
    await wait(900)
    stage().set({ defibGone: true })
    setMusic(true) // la machine disparaît : la musique de la partie 3 se lance
    await wait(1100)
    fx.flicker = 0
    stopBuzz()
    if (!on()) return
    await say(tr('Plus de défibrillateur.', 'No more defibrillator.'), 900)
    await say(tr('Plus de seconde chance.', 'No more second chances.'), 800)
    await say(tr("Quand ton cœur s'arrête maintenant... il reste arrêté.", 'When your heart stops now... it stays stopped.'), 900)
    await say(tr('Sept vies chacun. Rien de plus.', 'Seven lives each. Nothing more.'), 900)
  } finally {
    fx.cine.on = false
    fx.focus.on = false
    warningOn = false
    stage().set({ subtitle: '' })
  }
  if (!tutorialSkip && on()) await say(tr('Prends le fusil.', 'Take the gun.'), 300)
  await wait(400)
}

/**
 * Entrée dans la salle : le noir s'estompe, on marche lentement vers la table dans l'obscurité (un bruit de pas à
 * chaque foulée), on tire la chaise et on s'assoit ; un temps ; puis le croupier sort de l'ombre et la partie commence.
 */
async function enterRoom() {
  useStatsStore.getState().reset() // nouvelle aventure : les chiffres repartent de zéro
  stage().set({ contract: false, started: true, entrance: true, aiming: false, busy: true, pose: 'rest', dealerDead: false, endReady: false })
  setChapter(1)
  fx.entranceStart = performance.now()
  const start = fx.entranceStart
  stage().set({ interlude: false }) // le noir s'estompe sur la salle vide
  setMusic(true) // la porte ouverte laisse filtrer la musique de la pièce voisine

  // pas : un à chaque appui de talon (la caméra suit la même distance parcourue), plus doux au départ et à l'arrêt
  const { walk, sit } = ENTRANCE
  void (async () => {
    for (let i = 1; i <= WALK_STEPS; i++) {
      const at = stepTime(i)
      await sleepUntil(start + at * 1000)
      playFootstep(i, 0.5 + 0.5 * Math.min(1, walkSpeed(at) / 0.42))
    }
    await sleepUntil(start + (walk - 0.05) * 1000)
    playFootstep(WALK_STEPS + 1, 0.4) // le pied qui rejoint l'autre : on s'arrête
  })()
  await sleepUntil(start + walk * 1000)
  playChair()
  await sleepUntil(start + (walk + sit) * 1000)
  stage().set({ interludeText: '' })

  // assis, seul dans le silence de la salle ; puis la voix du croupier, encore invisible, dans le noir
  await wait(2000)
  await speak('dealerSigned', [
    [0, 1.55, tr('Tu as signé.', 'You signed.')],
    [1.75, 5.35, tr("C'était le seul choix qu'on t'a donné.", 'That was the only choice you were given.')],
  ])
  await wait(900)

  // le croupier sort de l'obscurité
  await emerge()

  // partie 1 : il explique les objets, puis montre le défibrillateur
  await tutorial()

  // la partie commence
  stage().set({ entrance: false, busy: false })
  fx.entranceStart = -1
  newRound()
}

/** Numéro de la séquence de fin en cours : Échap (retour au titre) l'invalide. */
let endingRun = 0
let stopCarSound: ((fade?: number) => void) | null = null

/**
 * Fin du jeu (mort en partie 3) : le cœur est plat dans le noir, puis le néant s'éclaire peu à peu avec sa musique (le portail seul
 * dans le vide, la caméra s'en approche, ses vantaux s'ouvrent sur la lumière), « THE END » apparaît, puis le générique
 * défile (même bande son, du néant au générique) ; retour au titre à la fin.
 */
async function theEnd() {
  const run = ++endingRun
  const alive = () => run === endingRun
  stage().set({ ending: true, busy: true }) // le noir de la mort couvre encore tout ; plus de rejouer
  await wait(2200)
  if (!alive()) return
  stopDeathSound?.()
  stopDeathSound = null
  fx.endStart = performance.now()
  // le néant et le générique partagent la même bande son : elle entre en fondu quand le noir se lève
  setMusicTrack('end')
  setMusicRoom(false)
  setMusic(true)
  stage().set({ death: false, deathText: false }) // le noir se lève lentement sur le néant
  await wait(END_TITLE_AT)
  if (!alive()) return
  stage().set({ endTitle: true })
  await wait(7000)
  if (!alive()) return
  stage().set({ endTitle: false })
  await wait(1500)
  if (!alive()) return
  stage().set({ credits: true }) // la musique continue
  await wait(CREDITS_SECONDS * 1000 + 3000)
  if (!alive()) return
  backToTitle()
}

/** Durée (ms) de la scène de la voiture avant le générique. */
const CAR_SCENE_MS = 34000

/**
 * Fin victorieuse (partie 3 gagnée) : la partie s'efface au noir et la musique s'éteint ; puis le siège passager
 * d'une voiture qui roule de nuit (la valise ouverte pleine de billets, le fusil du jeu), avec le bruit de la route
 * et la bande son ; enfin le générique défile sur la même musique, puis retour au titre.
 */
async function carEnding() {
  const run = ++endingRun
  const alive = () => run === endingRun
  stage().set({ busy: true, curtain: true }) // fondu au noir sur le croupier à terre
  setMusic(false)
  await wait(2600)
  if (!alive()) return
  stage().set({ ending: true, endKind: 'car', dealerDead: false })
  fx.endStart = performance.now()
  stopCarSound = startCarAmbience()
  setMusicTrack('car')
  setMusicRoom(false)
  setMusic(true)
  await wait(400)
  if (!alive()) return
  stage().set({ curtain: false }) // le noir se lève lentement sur la voiture
  await wait(CAR_SCENE_MS)
  if (!alive()) return
  stopCarSound?.(6) // le bruit de la route s'éteint sous le générique, la musique continue
  stopCarSound = null
  stage().set({ credits: true })
  await wait(CREDITS_SECONDS * 1000 + 3000)
  if (!alive()) return
  backToTitle()
}

/** Moment (ms) où « THE END » apparaît, après le début de la scène du néant : la caméra est arrivée au portail. */
const END_TITLE_AT = (END_SCENE.approach + 1) * 1000

/** Retour à l'écran titre après la fin (ou Échap) : tout est remis à zéro, la partie recommence à la partie 1. */
export function backToTitle() {
  endingRun++
  reviveRun++
  deathRun++
  useStatsStore.getState().reset()
  stopCarSound?.(1)
  stopCarSound = null
  deathStart = 0
  stopDeathSound?.()
  stopDeathSound = null
  fx.endStart = -1
  fx.flicker = 0
  fx.dealerReveal = 1
  fx.cine.on = false
  fx.focus.on = false
  setChapter(1)
  setMusicRoom(false) // setChapter la met « derrière le mur » : le titre est joué net, devant nous
  newRound()
  stage().set({
    ending: false, endKind: 'void', curtain: false, endTitle: false, credits: false, death: false, deathText: false, endReady: false, dealerDead: false,
    started: false, contract: false, entrance: false, signed: false, aiming: false, busy: false, pose: 'rest', subtitle: '',
  })
  setMusic(true)
}

export function restart() {
  // fin d'une séquence en cours (mort, résurrection du croupier) : son coupé, noir levé, lampe stable, musique de retour
  deathRun++
  reviveRun++
  endingRun++ // fondu vers la fin victorieuse en cours : annulé
  deathStart = 0
  stopDeathSound?.()
  stopDeathSound = null
  const won = game().phase === 'gameOver' && game().winner === 'player'
  if (won) setChapter(1) // après une victoire finale, on repart de la partie 1
  fx.flicker = 0
  fx.dealerReveal = 1
  setMusic(true)
  newRound()
  stage().set({ curtain: false, aiming: false, busy: false, pose: 'rest', dealerDead: false, endReady: false, death: false, deathText: false, entrance: false, subtitle: '' })
}

/** R = nouvelle partie. À appeler une fois au démarrage. */
export function installKeys() {
  const onKey = (e: KeyboardEvent) => {
    // Entrée lance la partie, sauf sur un bouton ou un réglage de l'écran d'accueil (c'est lui qui réagit : BACK, volume…)
    const onControl = e.target instanceof HTMLElement && ['BUTTON', 'INPUT'].includes(e.target.tagName)
    if (e.key === 'Enter' && !stage().started && !(onControl && !(e.target as HTMLElement).textContent?.includes('PLAY'))) void startGame()
    if (e.key.toLowerCase() === 'm') {
      // tant que la musique n'est pas audible, M sert à l'activer (le geste débloque l'audio) et jamais à la couper
      if (!audioLive() && !useSoundStore.getState().muted) unlockAudio()
      else useSoundStore.getState().toggle()
    }
    if (e.key === 'Escape' && stage().ending) backToTitle()
    if (e.key === 'Escape' && (stage().tutorial || warningOn)) tutorialSkip = true
    if (e.key === 'Escape' && stage().aiming && !stage().busy) stage().set({ aiming: false, pose: 'rest' })
    if (e.key.toLowerCase() === 'r' && stage().started && !stage().ending && (!stage().busy || game().phase === 'gameOver')) restart()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}

/** Charge les sons et branche ceux qui réagissent à l'état (chargement du fusil, chute du croupier). */
export function installSound() {
  preloadSounds()
  // Politique d'autoplay du navigateur : la musique ne peut démarrer qu'après un geste. On tente quand même dès
  // le chargement (elle part toute seule si le navigateur l'autorise), puis chaque clic / touche / toucher
  // relance l'audio tant qu'il n'est pas réellement audible. unlockAudio est idempotente.
  unlockAudio()
  const gestures = ['pointerdown', 'keydown', 'touchend'] as const
  const onGesture = () => {
    unlockAudio()
    // une fois la musique audible, on n'écoute plus (le contexte met un instant à passer en « running »)
    window.setTimeout(() => {
      if (audioLive()) gestures.forEach((g) => window.removeEventListener(g, onGesture))
    }, 400)
  }
  gestures.forEach((g) => window.addEventListener(g, onGesture))
  const offGame = useGameStore.subscribe((s, p) => {
    const newLoad = s.game.load > p.game.load
    const newGame = s.game.log.length < p.game.log.length
    if ((newLoad || newGame) && audioRunning()) sfx('reload', 0.25)
  })
  const offStage = useStageStore.subscribe((s, p) => {
    if (s.dealerDead && !p.dealerDead) playDealerThrown() // projeté en arrière : souffle, puis choc contre le fond de la salle
  })
  return () => {
    offGame()
    offStage()
  }
}
