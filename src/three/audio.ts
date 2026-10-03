// Moteur audio : samples CC0 (public/sounds, voir LICENSES.txt) avec repli sur des sons synthétisés
// tant qu'un fichier n'est pas chargé.
import { useSoundStore } from '../store/soundStore'

let ctx: AudioContext | null = null
const ac = () => (ctx ??= new AudioContext())

/**
 * Sortie : `master` (coupe-son) -> haut-parleurs. Deux entrées :
 *  - out()    : effets sonores, avec réverbération (grande salle en béton) ;
 *  - dryOut() : ambiance, voix, sans réverbération ajoutée (l'ambiance est déjà diffuse) ;
 *  - musicOut() : la musique (volume propre).
 */
const REVERB_WET = 0.8 // part de signal envoyée à la réverbération
const REVERB_SECONDS = 3.6 // longueur de la queue de réverbération
let outNode: GainNode | null = null
/** Volumes de réglage : effets (et ambiance, voix) et musique, chacun avant le volume général. */
let sfxLevel: GainNode | null = null
let musicLevel: GainNode | null = null
let sfxBus: GainNode | null = null

/** Réponse impulsionnelle synthétique : bruit stéréo qui décroît en exponentielle et s'assombrit (pas d'aigus dans la queue). */
function makeImpulse(c: AudioContext) {
  const len = Math.floor(c.sampleRate * REVERB_SECONDS)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
      lp += (x - lp) * (0.55 - 0.45 * (i / len)) // filtre passe-bas de plus en plus fermé
      d[i] = lp
    }
  }
  return buf
}

/** Sortie générale : coupe-son et volume général -> haut-parleurs. */
const masterOut = () => {
  if (!outNode) {
    const c = ac()
    outNode = c.createGain()
    const { muted, volume } = useSoundStore.getState()
    outNode.gain.value = muted ? 0 : volume
    outNode.connect(c.destination)
  }
  return outNode
}
/** Effets, ambiance et voix : réglés par le volume « effets ». */
const dryOut = () => {
  if (!sfxLevel) {
    sfxLevel = ac().createGain()
    sfxLevel.gain.value = useSoundStore.getState().sfxVolume
    sfxLevel.connect(masterOut())
  }
  return sfxLevel
}
/** Musique : réglée par le volume « musique ». */
const musicOut = () => {
  if (!musicLevel) {
    musicLevel = ac().createGain()
    musicLevel.gain.value = useSoundStore.getState().musicVolume
    musicLevel.connect(masterOut())
  }
  return musicLevel
}

const out = () => {
  if (!sfxBus) {
    const c = ac()
    const master = dryOut()
    sfxBus = c.createGain()
    sfxBus.connect(master) // signal direct
    const pre = c.createDelay(0.1)
    pre.delayTime.value = 0.03 // pré-délai : sépare l'attaque de la queue
    const conv = c.createConvolver()
    conv.buffer = makeImpulse(c)
    const wet = c.createGain()
    wet.gain.value = REVERB_WET
    sfxBus.connect(pre).connect(conv).connect(wet).connect(master)
  }
  return sfxBus
}
useSoundStore.subscribe((s) => {
  if (!ctx) return
  const set = (node: GainNode | null, v: number) => {
    if (!node) return
    node.gain.cancelScheduledValues(ctx!.currentTime)
    node.gain.setTargetAtTime(v, ctx!.currentTime, 0.05)
  }
  set(outNode, s.muted ? 0 : s.volume)
  set(sfxLevel, s.sfxVolume)
  set(musicLevel, s.musicVolume)
})

function noise(seconds: number) {
  const c = ac()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  return src
}

/** Le contexte tourne (un geste utilisateur a eu lieu) : sinon les sons planifiés se déclencheraient en retard. */
export const audioRunning = () => ctx?.state === 'running'

/** La bande son est réellement audible : contexte actif et lecture en cours (faux tant qu'aucun geste n'a débloqué l'audio). */
export const audioLive = () => ctx?.state === 'running' && !!music && !music.el.paused

export function unlockAudio() {
  const c = ac()
  if (c.state === 'suspended') void c.resume()
  if (musicWanted) startMusic()
}

function synthShot() {
  const c = ac()
  const t = c.currentTime
  const n = noise(0.6)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(5000, t)
  lp.frequency.exponentialRampToValueAtTime(200, t + 0.5)
  const g = c.createGain()
  g.gain.setValueAtTime(1, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
  n.connect(lp).connect(g).connect(out())
  n.start(t)
  const o = c.createOscillator()
  const og = c.createGain()
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(30, t + 0.25)
  og.gain.setValueAtTime(1, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  o.connect(og).connect(out())
  o.start(t)
  o.stop(t + 0.35)
}

function synthClick() {
  const c = ac()
  const t = c.currentTime
  const n = noise(0.05)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2500
  const g = c.createGain()
  g.gain.setValueAtTime(0.5, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
  n.connect(hp).connect(g).connect(out())
  n.start(t)
}

function synthBlip(freq = 440) {
  const c = ac()
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'square'
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.08, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  o.connect(g).connect(out())
  o.start(t)
  o.stop(t + 0.13)
}

// --- samples ---------------------------------------------------------------------------------

export type SfxName =
  | 'shot' | 'rack' | 'reload' | 'click' | 'grab' | 'thump'
  | 'beer' | 'loupe' | 'cigarette' | 'saw' | 'handcuffs' | 'pills' | 'adrenaline' | 'inverter' | 'door' | 'dealerSigned' | 'dealerNotOver' | 'dealerAlone'

const FILES: Record<SfxName, string> = {
  shot: '/sounds/shotgun.mp3', // fourni par l'utilisateur : détonation puis action de la pompe (2,8 s)
  rack: '/sounds/rack.mp3',
  reload: '/sounds/reload.mp3',
  click: '/sounds/click.wav',
  grab: '/sounds/grab.wav',
  thump: '/sounds/thump.wav',
  beer: '/sounds/beer.wav',
  loupe: '/sounds/loupe.wav',
  cigarette: '/sounds/cigarette.wav',
  saw: '/sounds/saw.wav',
  handcuffs: '/sounds/handcuffs.wav',
  pills: '/sounds/pills.wav',
  adrenaline: '/sounds/adrenaline.wav',
  inverter: '/sounds/inverter.wav',
  door: '/sounds/door.mp3',
  dealerSigned: '/sounds/dealer-signed.mp3',
  // « You think it's over? » (2,1 s) : voix de remplacement si le fichier est absent
  dealerNotOver: '/sounds/dealer-not-over.mp3',
  // voix du croupier avant la partie 3 (16,3 s), à la place de « You think it's over? »
  dealerAlone: '/sounds/dealer-alone.mp3',
}

interface Opts {
  volume?: number
  rate?: number
  /** Décalage de début dans le fichier (s) */
  offset?: number
  /** Durée maximale jouée (s) : fondu de sortie sur la fin */
  duration?: number
}

/** Réglages par son (niveau, hauteur, découpe). */
const OPTS: Partial<Record<SfxName, Opts>> = {
  shot: { volume: 0.72 }, // détonation + pompe réarmée dans le même fichier ; le pic dépasse 0 dBFS, d'où le gain < 1
  rack: { volume: 0.8, offset: 0.58 }, // 0,6 s de silence en tête de fichier
  reload: { volume: 0.7 },
  click: { volume: 0.9, rate: 0.85 },
  grab: { volume: 0.6 },
  thump: { volume: 1, rate: 0.55 },
  beer: { volume: 0.7 },
  loupe: { volume: 0.7 },
  cigarette: { volume: 0.7 },
  saw: { volume: 0.7, duration: 1.2 },
  handcuffs: { volume: 0.8 },
  pills: { volume: 0.7 },
  adrenaline: { volume: 0.5, duration: 1 },
  inverter: { volume: 0.7, duration: 1.2 },
  dealerNotOver: { volume: 1 },
  dealerAlone: { volume: 1 },
  dealerSigned: { volume: 1.15 }, // voix du croupier : « You signed. That was the only choice you were given. » (5,2 s)
  door: { volume: 1.5 }, // vrai grincement de porte métallique (extrait de 4,8 s, déjà en fondu d'entrée et de sortie)
}

const buffers: Partial<Record<SfxName, AudioBuffer>> = {}
const onset: Partial<Record<SfxName, number>> = {}

/** Premier échantillon net (pic > 20 %) : sert à couper le premier coup d'un enregistrement à 5 tirs. */
function findOnset(buf: AudioBuffer) {
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.2) return Math.max(0, i / buf.sampleRate - 0.02)
  return 0
}

/** Charge et décode tous les sons (peut être appelé avant le premier clic). */
export function preloadSounds() {
  const c = ac()
  for (const [name, url] of Object.entries(FILES) as [SfxName, string][]) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((buf) => {
        buffers[name] = buf
        onset[name] = findOnset(buf)
      })
      .catch(() => {
        /* repli synthétisé */
      })
  }
}

/** Paliers d'amplitude (bit-crusher) : quantifie le signal sur ~6 bits, d'où le grain numérique. */
function crushCurve(levels: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = Math.round(x * levels) / levels
  }
  return curve
}

/**
 * Voix d'entité synthétique : le sample de voix traverse une chaîne qui l'ôte de l'humain :
 *  - modulation en anneau (62 Hz) : timbre métallique de robot ;
 *  - filtre en peigne (délai de 6 ms avec rétroaction) : résonance creuse, vocodée ;
 *  - bit-crusher (6 bits) et bande passante réduite : grain numérique, froideur ;
 *  - souffle numérique et micro-coupures (la voix « saute » quelques centièmes de seconde) ;
 *  - réverbération de la salle.
 * Renvoie false si le sample n'est pas chargé.
 */
export function playEntityVoice(name: SfxName, delay = 0, volume = 1) {
  const buf = buffers[name]
  if (!buf) return false
  const c = ac()
  const t = c.currentTime + delay
  const len = buf.duration
  const bus = out()

  const glitch = c.createGain() // micro-coupures de la voix principale
  const crush = c.createWaveShaper()
  crush.curve = crushCurve(31)
  const band = c.createBiquadFilter()
  band.type = 'lowpass'
  band.frequency.value = 6800
  const post = c.createGain() // les trois chemins s'additionnent : on garde de la marge avant l'écrêtage du bit-crusher
  // la voix passe par la réverbération de la salle comme les bruitages (direct + queue de ~3,6 s)
  post.gain.value = volume * 0.8
  crush.connect(band).connect(glitch).connect(post).connect(bus)

  // voix unique (pas de seconde voix décalée : elle s'entendait comme un deuxième audio), très légèrement grave
  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 0.96
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 110
  src.connect(hp)
  const dry = c.createGain()
  dry.gain.value = 0.45
  hp.connect(dry).connect(crush)
  // modulation en anneau
  const ring = c.createGain()
  ring.gain.value = 0
  const carrier = c.createOscillator()
  carrier.frequency.value = 62
  carrier.connect(ring.gain)
  const ringMix = c.createGain()
  ringMix.gain.value = 0.6
  hp.connect(ring).connect(ringMix).connect(crush)
  // filtre en peigne
  const comb = c.createDelay(0.05)
  comb.delayTime.value = 0.0062
  const feedback = c.createGain()
  feedback.gain.value = 0.5
  const combMix = c.createGain()
  combMix.gain.value = 0.3
  hp.connect(comb)
  comb.connect(feedback).connect(comb)
  comb.connect(combMix).connect(crush)

  // souffle numérique pendant la parole
  const hiss = noise(len + 0.5)
  const hissHp = c.createBiquadFilter()
  hissHp.type = 'highpass'
  hissHp.frequency.value = 5200
  const hissGain = c.createGain()
  hissGain.gain.setValueAtTime(0.0001, t)
  hissGain.gain.linearRampToValueAtTime(0.012 * volume, t + 0.15)
  hissGain.gain.setValueAtTime(0.012 * volume, t + len)
  hissGain.gain.linearRampToValueAtTime(0.0001, t + len + 0.4)
  hiss.connect(hissHp).connect(hissGain).connect(bus)

  // micro-coupures : 5 trous de 30 à 70 ms répartis dans la phrase
  for (let i = 0; i < 5; i++) {
    const at = t + ((i + 0.3 + Math.random() * 0.5) / 5) * len
    glitch.gain.setValueAtTime(1, at - 0.001)
    glitch.gain.setValueAtTime(0.02, at)
    glitch.gain.setValueAtTime(1, at + 0.03 + Math.random() * 0.04)
  }

  src.start(t)
  carrier.start(t)
  hiss.start(t)
  carrier.stop(t + len + 0.1)
  return true
}

/**
 * Voix de remplacement (tant que l'enregistrement d'une réplique n'existe pas) : murmure grave d'entité,
 * fait de syllabes sans paroles (dent de scie filtrée par deux formants qui bougent, modulation en anneau),
 * dans la réverbération de la salle. Dure `seconds` secondes ; renvoie une fonction qui la coupe en fondu.
 */
export function playVoicePlaceholder(seconds: number, volume = 0.5) {
  const c = ac()
  const t = c.currentTime
  const bus = out()
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(84, t)
  const vib = c.createOscillator()
  vib.frequency.value = 5
  const vibGain = c.createGain()
  vibGain.gain.value = 3
  vib.connect(vibGain).connect(osc.frequency)
  const f1 = c.createBiquadFilter()
  f1.type = 'bandpass'
  f1.Q.value = 6
  const f2 = c.createBiquadFilter()
  f2.type = 'bandpass'
  f2.Q.value = 8
  const mix = c.createGain()
  mix.gain.value = 0.5
  const ring = c.createGain()
  ring.gain.value = 0
  const carrier = c.createOscillator()
  carrier.frequency.value = 62
  carrier.connect(ring.gain)
  const amp = c.createGain()
  amp.gain.value = 0.0001
  osc.connect(f1).connect(mix)
  osc.connect(f2).connect(mix)
  mix.connect(ring).connect(amp).connect(bus)
  // syllabes : une enveloppe et deux formants tirés au hasard à chaque fois
  let x = 0.15
  while (x < seconds - 0.25) {
    const d = 0.13 + Math.random() * 0.12
    f1.frequency.setValueAtTime(380 + Math.random() * 480, t + x)
    f2.frequency.setValueAtTime(900 + Math.random() * 1400, t + x)
    amp.gain.setValueAtTime(0.0001, t + x)
    amp.gain.linearRampToValueAtTime(volume, t + x + 0.025)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + x + d)
    x += d + 0.04 + (Math.random() < 0.18 ? 0.28 : 0)
  }
  osc.start(t)
  vib.start(t)
  carrier.start(t)
  for (const n of [osc, vib, carrier]) n.stop(t + seconds + 0.3)
  // arrêt anticipé (cinématique passée) : fondu rapide
  return () => {
    const now = c.currentTime
    amp.gain.cancelScheduledValues(now)
    amp.gain.setTargetAtTime(0.0001, now, 0.04)
  }
}

/** Durée (s) d'un son chargé, 0 s'il ne l'est pas encore. */
export const sfxLength = (name: SfxName) => buffers[name]?.duration ?? 0

/** Joue un son après `delay` secondes. Renvoie false si le sample n'est pas encore chargé. */
export function sfx(name: SfxName, delay = 0, extra: Opts = {}) {
  const buf = buffers[name]
  if (!buf) return false
  const c = ac()
  const o = { ...OPTS[name], ...extra }
  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = o.rate ?? 1
  const g = c.createGain()
  const t = c.currentTime + delay
  const start = o.offset ?? (name === 'shot' ? onset.shot ?? 0 : 0)
  const dur = Math.min(o.duration ?? buf.duration - start, buf.duration - start)
  const realDur = dur / (o.rate ?? 1) // la durée réelle s'allonge quand la lecture est ralentie
  g.gain.setValueAtTime(o.volume ?? 1, t)
  if (o.duration) {
    g.gain.setValueAtTime(o.volume ?? 1, t + realDur * 0.7)
    g.gain.linearRampToValueAtTime(0, t + realDur)
  }
  src.connect(g).connect(out())
  src.start(t, start, dur)
  return true
}

/**
 * `sawed` : canon scié -> détonation plus grave et plus lourde (lecture ralentie + choc sourd en renfort).
 * `lethal` : le tir tue le joueur : on ne garde que la détonation (fondu à 0,6 s), sans l'action de la pompe qui suit
 * dans le fichier : le noir tombe, on n'entend plus que le corps.
 */
export const playShot = (sawed = false, lethal = false) => {
  duckAmbience()
  const cut = lethal ? { duration: 0.6 } : {}
  const played = sawed ? sfx('shot', 0, { rate: 0.62, volume: 0.85, ...cut }) : sfx('shot', 0, cut)
  if (sawed) sfx('thump', 0, { rate: 0.38, volume: 0.9 })
  if (!played) {
    // fichier non chargé : détonation synthétisée, et la pompe est réarmée séparément (elle n'est pas dans la synthèse)
    synthShot()
    if (!lethal) sfx('rack', 0.4)
  }
}
export const playClick = () => {
  if (!sfx('click')) synthClick()
}
export const playBlip = (freq = 440) => synthBlip(freq)

// --- ambiance : pièce sombre en continu -------------------------------------------------------
// Fichier en boucle ; secours synthétisé (boucle sans couture) : bruit brun filtré qui respire,
// bourdon grave désaccordé, bourdonnement d'ampoule, et de rares grondements / grincements lointains.

const AMBIENCE_LEVEL = 0.55
let ambience: { master: GainNode; timer: number } | null = null

function brownNoise(seconds: number) {
  const c = ac()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    d[i] = last * 3.5
  }
  // raccord de boucle : fondu croisé sur les 0,2 dernières secondes
  const n = Math.floor(c.sampleRate * 0.2)
  for (let i = 0; i < n; i++) {
    const k = i / n
    d[d.length - n + i] = d[d.length - n + i] * (1 - k) + d[i] * k
  }
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.loopStart = 0
  src.loopEnd = seconds - 0.2
  return src
}

export function startAmbience() {
  if (ambience) return
  const c = ac()
  const master = c.createGain()
  master.gain.value = 0
  master.gain.linearRampToValueAtTime(AMBIENCE_LEVEL, c.currentTime + 4)
  master.connect(dryOut())
  ambience = { master, timer: 0 }

  // ambiance principale : boucle continue (public/sounds/ambience.ogg, CC0) ; repli synthétisé si absente
  fetch('/sounds/ambience.ogg')
    .then((r) => {
      if (!r.ok) throw new Error('ambience introuvable')
      return r.arrayBuffer()
    })
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      const src = c.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(master)
      src.start()
    })
    .catch(() => startSynthAmbience(master))
}

/** Ambiance de secours, entièrement synthétisée. */
function startSynthAmbience(master: GainNode) {
  const c = ac()
  // souffle de la pièce : bruit brun dont la coupure oscille lentement
  const air = brownNoise(6)
  const airLp = c.createBiquadFilter()
  airLp.type = 'lowpass'
  airLp.frequency.value = 200
  const airLfo = c.createOscillator()
  airLfo.frequency.value = 0.06
  const airLfoGain = c.createGain()
  airLfoGain.gain.value = 80
  airLfo.connect(airLfoGain).connect(airLp.frequency)
  const airGain = c.createGain()
  airGain.gain.value = 0.55
  air.connect(airLp).connect(airGain).connect(master)
  air.start()
  airLfo.start()

  // bourdon : deux sinus désaccordés (battement lent) + un octave au-dessus filtré
  for (const [freq, gain] of [[41, 0.16], [43.4, 0.14]] as const) {
    const o = c.createOscillator()
    o.frequency.value = freq
    const g = c.createGain()
    g.gain.value = gain
    o.connect(g).connect(master)
    o.start()
  }
  const oct = c.createOscillator()
  oct.type = 'sawtooth'
  oct.frequency.value = 82.4
  const octLp = c.createBiquadFilter()
  octLp.type = 'lowpass'
  octLp.frequency.value = 160
  const octGain = c.createGain()
  octGain.gain.value = 0.05
  oct.connect(octLp).connect(octGain).connect(master)
  oct.start()

  // bourdonnement électrique de l'ampoule (100 Hz), très discret, avec une légère instabilité
  const buzz = c.createOscillator()
  buzz.type = 'sawtooth'
  buzz.frequency.value = 100
  const buzzLp = c.createBiquadFilter()
  buzzLp.type = 'lowpass'
  buzzLp.frequency.value = 420
  const buzzGain = c.createGain()
  buzzGain.gain.value = 0.014
  const buzzLfo = c.createOscillator()
  buzzLfo.frequency.value = 0.31
  const buzzLfoGain = c.createGain()
  buzzLfoGain.gain.value = 0.006
  buzzLfo.connect(buzzLfoGain).connect(buzzGain.gain)
  buzz.connect(buzzLp).connect(buzzGain).connect(master)
  buzz.start()
  buzzLfo.start()

  scheduleAmbientEvent()
}

/** Événements rares : grondement lointain ou grincement métallique, toutes les 7 à 20 s. */
function scheduleAmbientEvent() {
  if (!ambience) return
  ambience.timer = window.setTimeout(() => {
    if (ambience && ac().state === 'running') {
      if (Math.random() < 0.55) rumble()
      else creak()
    }
    scheduleAmbientEvent()
  }, 7000 + Math.random() * 13000)
}

function rumble() {
  const c = ac()
  const t = c.currentTime
  const n = noise(5)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 70 + Math.random() * 40
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 1.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5)
  n.connect(lp).connect(g).connect(ambience!.master)
  n.start(t)
}

function creak() {
  const c = ac()
  const t = c.currentTime
  const o = c.createOscillator()
  o.type = 'sawtooth'
  const f0 = 180 + Math.random() * 140
  o.frequency.setValueAtTime(f0, t)
  o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.3), t + 1.4)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 600
  bp.Q.value = 6
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.05, t + 0.5)
  g.gain.linearRampToValueAtTime(0.0001, t + 1.5)
  o.connect(bp).connect(g).connect(ambience!.master)
  o.start(t)
  o.stop(t + 1.6)
}

/** L'ambiance s'efface un instant après un coup de feu, puis revient. */
function duckAmbience() {
  const c = ac()
  const duck = (g: AudioParam, level: number) => {
    g.cancelScheduledValues(c.currentTime)
    g.setValueAtTime(g.value, c.currentTime)
    g.linearRampToValueAtTime(level * 0.15, c.currentTime + 0.05)
    g.linearRampToValueAtTime(level, c.currentTime + 3.5)
  }
  if (ambience) duck(ambience.master.gain, AMBIENCE_LEVEL)
  // la musique de la pièce voisine s'efface aussi un instant après un tir (partie seulement)
  if (music && musicRoom && musicWanted) duck(music.gain.gain, musicMode().level)
}

/** Frappe de machine à écrire (entracte) : claquement sec + petit choc grave, légèrement différent à chaque lettre. Sans réverbération. */
export function playTypeTick() {
  const c = ac()
  const t = c.currentTime
  const n = noise(0.05)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2200 + Math.random() * 1400
  bp.Q.value = 1.1
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.32, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
  n.connect(bp).connect(g).connect(dryOut())
  n.start(t)
  const o = c.createOscillator()
  const og = c.createGain()
  o.frequency.setValueAtTime(150 + Math.random() * 40, t)
  o.frequency.exponentialRampToValueAtTime(60, t + 0.06)
  og.gain.setValueAtTime(0.22, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  o.connect(og).connect(dryOut())
  o.start(t)
  o.stop(t + 0.08)
}

// --- entrée dans la salle (après le contrat) : porte, pas, chaise, apparition du croupier -------------
// Tout est synthétisé et passe par la réverbération de la salle (out()) : grande salle en béton, écho long.

/** Enveloppe d'amplitude : montée linéaire rapide puis décroissance exponentielle. */
function burst(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

/** Résonances métalliques inharmoniques (un coup sur de la tôle) : sinusoïdes qui s'éteignent à des vitesses différentes. */
function metalRing(t: number, base: number, vol: number, decay: number) {
  const c = ac()
  for (const [mul, v, d] of [[1, 1, 1], [2.32, 0.7, 0.7], [4.1, 0.5, 0.5], [6.25, 0.3, 0.32]] as const) {
    const o = c.createOscillator()
    o.frequency.value = base * mul * (1 + (Math.random() - 0.5) * 0.012)
    const g = c.createGain()
    burst(g, t, vol * v, 0.002, decay * d)
    o.connect(g).connect(out())
    o.start(t)
    o.stop(t + 0.01 + decay * d + 0.05)
  }
}

/**
 * Porte métallique lourde, derrière nous (~5 s) : deux claquements de verrou, puis le battant qui racle et
 * grince sur ses gonds, puis la butée contre le mur (choc grave et résonance de tôle).
 */
export function playMetalDoor() {
  const c = ac()
  const t = c.currentTime

  // 1) verrou : deux claquements secs
  const clank = (at: number, vol: number, base: number) => {
    const n = noise(0.12)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2400
    bp.Q.value = 1.6
    const g = c.createGain()
    burst(g, at, vol, 0.002, 0.09)
    n.connect(bp).connect(g).connect(out())
    n.start(at)
    metalRing(at, base, vol * 0.3, 0.55)
  }
  clank(t + 0.05, 0.9, 430)
  clank(t + 0.4, 0.6, 520)

  // 2) battant : vrai enregistrement de porte métallique qui grince (public/sounds/door.mp3, 4,8 s) ; si le fichier
  // n'est pas chargé, repli synthétisé (dent de scie filtrée, vibrato lent, coupure qui balaie, frottement grave)
  const creakStart = t + 0.9
  const sampled = sfx('door', 0.9)
  const creakEnd = t + (sampled ? 5.5 : 3.7)
  if (!sampled) synthDoorCreak(creakStart, creakEnd)

  // 3) butée : choc grave + résonance de tôle
  const hit = creakEnd + 0.25
  const thud = c.createOscillator()
  thud.frequency.setValueAtTime(64, hit)
  thud.frequency.exponentialRampToValueAtTime(34, hit + 0.5)
  const tg = c.createGain()
  burst(tg, hit, 1, 0.004, 0.7)
  thud.connect(tg).connect(out())
  thud.start(hit)
  thud.stop(hit + 0.8)
  const slam = noise(0.2)
  const slp = c.createBiquadFilter()
  slp.type = 'lowpass'
  slp.frequency.value = 900
  const slg = c.createGain()
  burst(slg, hit, 0.7, 0.003, 0.15)
  slam.connect(slp).connect(slg).connect(out())
  slam.start(hit)
  metalRing(hit, 300, 0.22, 1.6)
}

/** Grincement de porte synthétisé (repli quand door.mp3 n'est pas disponible). */
function synthDoorCreak(creakStart: number, creakEnd: number) {
  const c = ac()
  const saw = c.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.setValueAtTime(92, creakStart)
  saw.frequency.linearRampToValueAtTime(142, creakStart + 1.5)
  saw.frequency.linearRampToValueAtTime(112, creakEnd)
  const vib = c.createOscillator()
  vib.frequency.value = 6.5
  const vibGain = c.createGain()
  vibGain.gain.value = 4
  vib.connect(vibGain).connect(saw.frequency)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 7
  bp.frequency.setValueAtTime(520, creakStart)
  bp.frequency.linearRampToValueAtTime(1150, creakStart + 1.4)
  bp.frequency.linearRampToValueAtTime(700, creakEnd)
  const cg = c.createGain()
  cg.gain.setValueAtTime(0.0001, creakStart)
  cg.gain.linearRampToValueAtTime(0.1, creakStart + 0.5)
  cg.gain.linearRampToValueAtTime(0.07, creakEnd - 0.6)
  cg.gain.linearRampToValueAtTime(0.0001, creakEnd)
  saw.connect(bp).connect(cg).connect(out())
  saw.start(creakStart)
  vib.start(creakStart)
  saw.stop(creakEnd + 0.05)
  vib.stop(creakEnd + 0.05)
  // un cri plus aigu au milieu du mouvement (rouille qui cède)
  const squeal = c.createOscillator()
  squeal.type = 'sawtooth'
  squeal.frequency.setValueAtTime(610, creakStart + 1.2)
  squeal.frequency.linearRampToValueAtTime(930, creakStart + 1.9)
  squeal.frequency.linearRampToValueAtTime(700, creakStart + 2.4)
  const sbp = c.createBiquadFilter()
  sbp.type = 'bandpass'
  sbp.frequency.value = 1700
  sbp.Q.value = 10
  const sg = c.createGain()
  sg.gain.setValueAtTime(0.0001, creakStart + 1.2)
  sg.gain.linearRampToValueAtTime(0.05, creakStart + 1.6)
  sg.gain.linearRampToValueAtTime(0.0001, creakStart + 2.4)
  squeal.connect(sbp).connect(sg).connect(out())
  squeal.start(creakStart + 1.2)
  squeal.stop(creakStart + 2.5)
  // frottement du battant sur le sol
  const scrape = noise(3.2)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(420, creakStart)
  lp.frequency.linearRampToValueAtTime(260, creakEnd)
  const scg = c.createGain()
  scg.gain.setValueAtTime(0.0001, creakStart)
  scg.gain.linearRampToValueAtTime(0.28, creakStart + 0.7)
  scg.gain.linearRampToValueAtTime(0.2, creakEnd - 0.5)
  scg.gain.linearRampToValueAtTime(0.0001, creakEnd)
  scrape.connect(lp).connect(scg).connect(out())
  scrape.start(creakStart)
}

/** Un pas sur du béton (côté gauche / droit : timbre légèrement différent) : choc grave + frottement de semelle. */
export function playFootstep(side: number, vol = 1) {
  const c = ac()
  const t = c.currentTime
  const n = noise(0.2)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 650 + Math.random() * 200 + (side % 2) * 120
  const g = c.createGain()
  burst(g, t, (0.34 + Math.random() * 0.06) * vol, 0.004, 0.14)
  n.connect(lp).connect(g).connect(out())
  n.start(t)
  const o = c.createOscillator()
  o.frequency.setValueAtTime(92 - (side % 2) * 10, t)
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12)
  const og = c.createGain()
  burst(og, t, 0.4 * vol, 0.003, 0.13)
  o.connect(og).connect(out())
  o.start(t)
  o.stop(t + 0.2)
  // grain de gravier sous la semelle
  const grit = noise(0.1)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2600
  const gg = c.createGain()
  burst(gg, t + 0.03, 0.05 * vol, 0.004, 0.06)
  grit.connect(hp).connect(gg).connect(out())
  grit.start(t + 0.03)
}

/**
 * Le croupier est projeté en arrière dans le noir : souffle de l'impact qui l'arrache, sifflement d'air, puis à
 * ~0,8 s le choc lourd contre le fond de la salle (loin, dans la réverbération) avec la chaise qui racle et des éclats.
 */
export function playDealerThrown() {
  const c = ac()
  const t = c.currentTime

  // souffle d'air : bruit large qui balaie de l'aigu au grave pendant la projection
  const air = noise(0.9)
  const abp = c.createBiquadFilter()
  abp.type = 'bandpass'
  abp.Q.value = 0.9
  abp.frequency.setValueAtTime(3400, t)
  abp.frequency.exponentialRampToValueAtTime(260, t + 0.8)
  const ag = c.createGain()
  burst(ag, t, 0.7, 0.03, 0.7)
  air.connect(abp).connect(ag).connect(out())
  air.start(t)

  // choc grave de l'arrachement
  const kick = c.createOscillator()
  kick.frequency.setValueAtTime(95, t)
  kick.frequency.exponentialRampToValueAtTime(34, t + 0.35)
  const kg = c.createGain()
  burst(kg, t, 0.8, 0.004, 0.4)
  kick.connect(kg).connect(out())
  kick.start(t)
  kick.stop(t + 0.5)

  // contre le fond de la salle : choc sourd + éclats
  const hit = t + 0.8
  const thud = c.createOscillator()
  thud.frequency.setValueAtTime(58, hit)
  thud.frequency.exponentialRampToValueAtTime(28, hit + 0.7)
  const tg = c.createGain()
  burst(tg, hit, 1.1, 0.004, 0.9)
  thud.connect(tg).connect(out())
  thud.start(hit)
  thud.stop(hit + 1)
  const crash = noise(0.3)
  const clp = c.createBiquadFilter()
  clp.type = 'lowpass'
  clp.frequency.value = 650
  const cg = c.createGain()
  burst(cg, hit, 0.8, 0.003, 0.22)
  crash.connect(clp).connect(cg).connect(out())
  crash.start(hit)
  metalRing(hit + 0.02, 240, 0.2, 1.3) // la chaise métallique
  for (const at of [0.12, 0.23, 0.4, 0.62, 0.9]) {
    const d = noise(0.05)
    const dbp = c.createBiquadFilter()
    dbp.type = 'bandpass'
    dbp.frequency.value = 700 + Math.random() * 2200
    dbp.Q.value = 1.4
    const dg = c.createGain()
    burst(dg, hit + at, 0.22 + Math.random() * 0.2, 0.002, 0.04)
    d.connect(dbp).connect(dg).connect(out())
    d.start(hit + at)
  }
}

/**
 * S'asseoir (3,4 s, calé sur la caméra) : froissement de vêtements, choc sourd sur l'assise à 1,45 s, puis la chaise
 * tirée vers la table qui racle le béton par saccades de 1,75 s à 3,2 s.
 */
export function playChair() {
  const c = ac()
  const t = c.currentTime

  // froissement de tissu pendant qu'on se tourne pour s'asseoir
  const cloth = noise(0.9)
  const clp = c.createBiquadFilter()
  clp.type = 'bandpass'
  clp.frequency.value = 900
  clp.Q.value = 0.7
  const cg = c.createGain()
  cg.gain.setValueAtTime(0.0001, t + 0.55)
  cg.gain.linearRampToValueAtTime(0.07, t + 1.0)
  cg.gain.linearRampToValueAtTime(0.0001, t + 1.5)
  cloth.connect(clp).connect(cg).connect(out())
  cloth.start(t + 0.55)

  // choc sur l'assise : bois / métal sourd + un peu de grain
  const sit = t + 1.45
  const thud = c.createOscillator()
  thud.frequency.setValueAtTime(82, sit)
  thud.frequency.exponentialRampToValueAtTime(42, sit + 0.22)
  const tg = c.createGain()
  burst(tg, sit, 0.55, 0.008, 0.3)
  thud.connect(tg).connect(out())
  thud.start(sit)
  thud.stop(sit + 0.4)
  const knock = noise(0.1)
  const klp = c.createBiquadFilter()
  klp.type = 'lowpass'
  klp.frequency.value = 800
  const kg = c.createGain()
  burst(kg, sit, 0.3, 0.004, 0.08)
  knock.connect(klp).connect(kg).connect(out())
  knock.start(sit)

  // chaise tirée : frottement en saccades (le métal accroche puis lâche) qui s'espacent à l'arrêt
  const start = t + 1.75
  const scrape = noise(1.5)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2.2
  bp.frequency.setValueAtTime(600, start)
  bp.frequency.linearRampToValueAtTime(1300, start + 0.5)
  bp.frequency.linearRampToValueAtTime(550, start + 1.45)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, start)
  const jerks = [0.0, 0.18, 0.32, 0.5, 0.66, 0.9, 1.1, 1.3]
  for (const j of jerks) {
    const level = 0.18 * (1 - j / 1.6) + 0.03
    g.gain.linearRampToValueAtTime(level, start + j + 0.04)
    g.gain.linearRampToValueAtTime(level * 0.2, start + j + 0.12)
  }
  g.gain.linearRampToValueAtTime(0.0001, start + 1.5)
  scrape.connect(bp).connect(g).connect(out())
  scrape.start(start)
}

/** Le croupier sort de l'obscurité : grondement grave qui monte, courte coupure électrique de la lampe. */
export function playDealerRise() {
  const c = ac()
  const t = c.currentTime
  const n = noise(5)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(70, t)
  lp.frequency.linearRampToValueAtTime(190, t + 2.6)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.55, t + 2.4)
  g.gain.linearRampToValueAtTime(0.0001, t + 4.6)
  n.connect(lp).connect(g).connect(out())
  n.start(t)
  const o = c.createOscillator()
  o.frequency.setValueAtTime(36, t)
  o.frequency.linearRampToValueAtTime(48, t + 3)
  const og = c.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.linearRampToValueAtTime(0.4, t + 2.2)
  og.gain.linearRampToValueAtTime(0.0001, t + 4.6)
  o.connect(og).connect(out())
  o.start(t)
  o.stop(t + 4.7)
}

/**
 * Lampe qui grésille, synchrone avec le papillotement visible : ronflement secteur (100 Hz et harmoniques) qui
 * tombe quand l'ampoule s'éteint, sifflement d'électronique, crépitements aléatoires et claquements secs à chaque
 * coupure / rallumage. `read` donne l'état courant (flicker : intensité du phénomène, lamp : niveau de la lampe).
 * Se coupe tout seul quand le papillotement est retombé ; renvoie aussi une fonction d'arrêt immédiat.
 */
export function startLightBuzz(read: () => { flicker: number; lamp: number }) {
  const c = ac()
  const dest = dryOut()
  const master = c.createGain()
  master.gain.value = 1
  master.connect(dest)

  // ronflement : dent de scie 100 Hz + carré 200 Hz, filtrés
  const humLp = c.createBiquadFilter()
  humLp.type = 'lowpass'
  humLp.frequency.value = 760
  humLp.Q.value = 0.8
  const humGain = c.createGain()
  humGain.gain.value = 0
  humLp.connect(humGain).connect(master)
  const hum = c.createOscillator()
  hum.type = 'sawtooth'
  hum.frequency.value = 100
  hum.connect(humLp)
  const hum2 = c.createOscillator()
  hum2.type = 'square'
  hum2.frequency.value = 200.6
  const hum2Gain = c.createGain()
  hum2Gain.gain.value = 0.35
  hum2.connect(hum2Gain).connect(humLp)

  // sifflement d'électronique
  const whine = c.createOscillator()
  whine.frequency.value = 3150
  const whineGain = c.createGain()
  whineGain.gain.value = 0
  whine.connect(whineGain).connect(master)

  // crépitements : bruit en boucle, filtré dans l'aigu, ouvert par à-coups
  const crack = noise(1)
  crack.loop = true
  const crackHp = c.createBiquadFilter()
  crackHp.type = 'highpass'
  crackHp.frequency.value = 2600
  const crackGain = c.createGain()
  crackGain.gain.value = 0
  crack.connect(crackHp).connect(crackGain).connect(master)

  hum.start()
  hum2.start()
  whine.start()
  crack.start()

  const pop = (strong: boolean) => {
    const t = c.currentTime
    const n = noise(0.05)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1500 + Math.random() * 2000
    bp.Q.value = 0.9
    const g = c.createGain()
    burst(g, t, strong ? 0.5 : 0.25, 0.001, 0.03)
    n.connect(bp).connect(g).connect(dest)
    n.start(t)
    if (strong) {
      const o = c.createOscillator()
      o.frequency.setValueAtTime(260, t)
      o.frequency.exponentialRampToValueAtTime(70, t + 0.05)
      const og = c.createGain()
      burst(og, t, 0.18, 0.001, 0.05)
      o.connect(og).connect(dest)
      o.start(t)
      o.stop(t + 0.08)
    }
  }

  let last = read().lamp
  let calm = 0
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    const t = c.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setTargetAtTime(0, t, 0.12)
    window.setTimeout(() => {
      for (const s of [hum, hum2, whine, crack]) s.stop()
      master.disconnect()
    }, 900)
  }
  const timer = window.setInterval(() => {
    const { flicker, lamp } = read()
    const t = c.currentTime
    // le ronflement suit l'ampoule : fort quand elle est allumée et qu'elle souffre, nul quand elle est éteinte
    humGain.gain.setTargetAtTime((0.035 + 0.1 * flicker) * lamp, t, 0.006)
    whineGain.gain.setTargetAtTime(0.012 * flicker * (0.3 + 0.7 * lamp), t, 0.01)
    if (Math.random() < flicker * 0.45) {
      crackGain.gain.setValueAtTime(0.04 + Math.random() * 0.3 * flicker, t)
      crackGain.gain.setTargetAtTime(0, t + 0.004, 0.012)
    }
    const jump = lamp - last
    if (Math.abs(jump) > 0.35) pop(jump < 0) // coupure : claquement fort ; rallumage : plus sec
    last = lamp
    calm = flicker < 0.02 ? calm + 1 : 0
    if (calm > 20) stop()
  }, 16)
  return stop
}

/**
 * Instants (s, depuis le tir mortel) des battements du cœur qui lâche et début du tracé plat : le texte
 * « TU ES MORT » apparaît avec le tracé plat.
 */
/** Niveau général de la séquence de mort (1 = niveau d'origine, trop fort) ; les sons aigus sont en plus baissés individuellement. */
const CARDIAC_LEVEL = 0.45

export const CARDIAC = { beats: [0.26, 0.52, 0.76, 1.0, 1.3, 1.66, 2.1, 2.65], flatline: 3.5 }

/** Courbe de saturation (écrêtage progressif) : donne du mordant aux chocs graves. */
function distortionCurve(amount: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

/**
 * Mort violente : l'impact de la balle (choc sourd qui secoue tout, claquement sec, impact de chair, craquements
 * d'os), l'acouphène qui perce juste après, le sang qui afflue, un râle étranglé ; puis le cœur s'emballe et lâche
 * (battements saturés de plus en plus faibles, bip de moniteur à chacun) jusqu'au tracé plat, un bip continu et pur.
 * Renvoie une fonction qui coupe tout en fondu (recommencer la partie).
 */
export function playCardiacArrest() {
  const c = ac()
  const t = c.currentTime
  const master = c.createGain()
  master.gain.value = CARDIAC_LEVEL
  master.connect(dryOut())
  const wetMaster = c.createGain()
  wetMaster.gain.value = CARDIAC_LEVEL
  wetMaster.connect(out())
  const shaper = c.createWaveShaper()
  shaper.curve = distortionCurve(25)
  shaper.oversample = '2x'
  shaper.connect(wetMaster)
  shaper.connect(master)

  // --- 1) l'impact -----------------------------------------------------------------------------------
  // choc sourd qui secoue tout : sinus grave qui s'effondre
  const boom = c.createOscillator()
  boom.frequency.setValueAtTime(78, t)
  boom.frequency.exponentialRampToValueAtTime(22, t + 0.9)
  const bg = c.createGain()
  burst(bg, t, 1.1, 0.002, 0.9)
  boom.connect(bg)
  bg.connect(shaper)
  boom.start(t)
  boom.stop(t + 1)
  // claquement sec large bande
  const crack = noise(0.2)
  const chp = c.createBiquadFilter()
  chp.type = 'highpass'
  chp.frequency.value = 500
  const cg = c.createGain()
  burst(cg, t, 1, 0.001, 0.09)
  crack.connect(chp).connect(cg).connect(master)
  crack.start(t)
  // impact de chair : bruit médium, bref et lourd
  const flesh = noise(0.2)
  const fbp = c.createBiquadFilter()
  fbp.type = 'bandpass'
  fbp.frequency.value = 850
  fbp.Q.value = 1.1
  const fg = c.createGain()
  burst(fg, t + 0.015, 0.9, 0.002, 0.12)
  flesh.connect(fbp).connect(fg).connect(master)
  flesh.start(t + 0.015)
  // craquements d'os : quatre éclats secs
  for (const at of [0.04, 0.075, 0.115, 0.17]) {
    const k = noise(0.04)
    const khp = c.createBiquadFilter()
    khp.type = 'highpass'
    khp.frequency.value = 1800 + Math.random() * 1500
    const kg = c.createGain()
    burst(kg, t + at, 0.45 + Math.random() * 0.25, 0.001, 0.02)
    k.connect(khp).connect(kg).connect(master)
    k.start(t + at)
  }

  // --- 2) acouphène : perce d'un coup, siffle, puis s'éteint ---------------------------------------------
  for (const f of [6800, 7360]) {
    const o = c.createOscillator()
    o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.03, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 5.1)
  }
  const whistle = c.createOscillator()
  whistle.frequency.setValueAtTime(10500, t)
  whistle.frequency.exponentialRampToValueAtTime(6600, t + 0.5)
  const wg = c.createGain()
  burst(wg, t, 0.02, 0.005, 0.5)
  whistle.connect(wg).connect(master)
  whistle.start(t)
  whistle.stop(t + 0.6)

  // --- 3) le sang afflue, râle étranglé ---------------------------------------------------------------
  const rush = noise(2.4)
  const rlp = c.createBiquadFilter()
  rlp.type = 'lowpass'
  rlp.frequency.value = 320
  const rg = c.createGain()
  rg.gain.setValueAtTime(0.0001, t + 0.15)
  rg.gain.linearRampToValueAtTime(0.32, t + 0.7)
  rg.gain.linearRampToValueAtTime(0.0001, t + 2.4)
  rush.connect(rlp).connect(rg).connect(wetMaster)
  rush.start(t + 0.15)
  const gasp = noise(1.4)
  const gbp = c.createBiquadFilter()
  gbp.type = 'bandpass'
  gbp.Q.value = 4
  gbp.frequency.setValueAtTime(520, t + 0.45)
  gbp.frequency.linearRampToValueAtTime(980, t + 0.9)
  gbp.frequency.linearRampToValueAtTime(480, t + 1.8)
  const gg = c.createGain()
  gg.gain.setValueAtTime(0.0001, t + 0.45)
  gg.gain.linearRampToValueAtTime(0.2, t + 0.65)
  gg.gain.linearRampToValueAtTime(0.0001, t + 1.85)
  const gurgle = c.createOscillator() // le gargouillis : l'amplitude tremble à ~11 Hz
  gurgle.frequency.value = 11
  const gurgleGain = c.createGain()
  gurgleGain.gain.value = 0.1
  gurgle.connect(gurgleGain).connect(gg.gain)
  gasp.connect(gbp).connect(gg).connect(master)
  gasp.start(t + 0.45)
  gurgle.start(t + 0.45)
  gurgle.stop(t + 1.9)

  // --- 4) le cœur s'emballe puis lâche ----------------------------------------------------------------
  const thump = (at: number, amp: number, freq: number) => {
    const o = c.createOscillator()
    o.frequency.setValueAtTime(freq, at)
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, at + 0.16)
    const g = c.createGain()
    burst(g, at, 0.8 * amp, 0.004, 0.2)
    o.connect(g).connect(shaper)
    o.start(at)
    o.stop(at + 0.3)
    const n = noise(0.12)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 160
    const ng = c.createGain()
    burst(ng, at, 0.55 * amp, 0.003, 0.08)
    n.connect(lp).connect(ng).connect(master)
    n.start(at)
  }
  const beep = (at: number, dur: number, amp: number) => {
    const o = c.createOscillator()
    o.frequency.value = 1000
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(amp, at + 0.004)
    g.gain.setValueAtTime(amp, at + dur)
    g.gain.linearRampToValueAtTime(0.0001, at + dur + 0.008)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + dur + 0.05)
  }
  const amps = [1.3, 1.3, 1.2, 1.1, 0.95, 0.78, 0.6, 0.42]
  CARDIAC.beats.forEach((at, i) => {
    thump(t + at, amps[i], 64)
    thump(t + at + 0.17, amps[i] * 0.75, 54)
    if (i < CARDIAC.beats.length - 1) beep(t + at, 0.08, 0.055 * Math.min(1, amps[i]))
  })

  // --- 5) tracé plat : bip continu, pur, qui s'éteint ---------------------------------------------------
  const flat = t + CARDIAC.flatline
  const fo = c.createOscillator()
  fo.frequency.value = 1000
  const flg = c.createGain()
  flg.gain.setValueAtTime(0.0001, flat)
  flg.gain.linearRampToValueAtTime(0.06, flat + 0.02)
  flg.gain.setValueAtTime(0.06, flat + 3)
  flg.gain.linearRampToValueAtTime(0.0001, flat + 4.5)
  fo.connect(flg).connect(master)
  fo.start(flat)
  fo.stop(flat + 4.6)

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    const now = c.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setTargetAtTime(0, now, 0.08)
    wetMaster.gain.cancelScheduledValues(now)
    wetMaster.gain.setTargetAtTime(0, now, 0.08)
  }
}

/** Extinction puis allumage d'un écran cathodique : chute de tonalité + claquement, puis montée + sifflement. */
export function playTransition() {
  const c = ac()
  const t = c.currentTime
  const off = c.createOscillator()
  const offGain = c.createGain()
  off.frequency.setValueAtTime(1400, t)
  off.frequency.exponentialRampToValueAtTime(40, t + 0.6)
  offGain.gain.setValueAtTime(0.0001, t)
  offGain.gain.linearRampToValueAtTime(0.16, t + 0.05)
  offGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
  off.connect(offGain).connect(out())
  off.start(t)
  off.stop(t + 0.75)
  const pop = noise(0.05)
  const popGain = c.createGain()
  popGain.gain.setValueAtTime(0.35, t + 0.72)
  popGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.78)
  pop.connect(popGain).connect(out())
  pop.start(t + 0.72)
  const on = c.createOscillator()
  const onGain = c.createGain()
  on.frequency.setValueAtTime(60, t + 0.85)
  on.frequency.exponentialRampToValueAtTime(1800, t + 1.25)
  onGain.gain.setValueAtTime(0.0001, t + 0.85)
  onGain.gain.linearRampToValueAtTime(0.1, t + 1.1)
  onGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  on.connect(onGain).connect(out())
  on.start(t + 0.85)
  on.stop(t + 1.65)
}

/**
 * Habitacle d'une voiture qui roule de nuit : moteur grave (deux dents de scie qui pulsent, régime qui dérive), bruit
 * de roulement, souffle d'air, « ta-dum » des joints de la chaussée (essieu avant puis arrière) et, de temps en temps,
 * un véhicule qui double côté fenêtre. Entre en fondu (~5 s) ; la fonction renvoyée l'éteint en fondu.
 */
export function startCarAmbience() {
  const c = ac()
  const t = c.currentTime
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.linearRampToValueAtTime(0.6, t + 5)
  master.connect(dryOut())
  const verb = c.createGain()
  verb.gain.value = 0.12
  master.connect(verb).connect(out())
  const stoppers: (() => void)[] = []

  // moteur : 48 Hz + octave désaccordée, filtrées ; le régime dérive, l'amplitude pulse (explosions)
  const engLp = c.createBiquadFilter()
  engLp.type = 'lowpass'
  engLp.frequency.value = 230
  engLp.Q.value = 1.2
  const engGain = c.createGain()
  engGain.gain.value = 0.3
  engLp.connect(engGain).connect(master)
  const pulse = c.createGain()
  pulse.gain.value = 1
  pulse.connect(engLp)
  const pulseLfo = c.createOscillator()
  pulseLfo.frequency.value = 23
  const pulseDepth = c.createGain()
  pulseDepth.gain.value = 0.28
  pulseLfo.connect(pulseDepth).connect(pulse.gain)
  const rpm = c.createOscillator()
  rpm.frequency.value = 0.11
  const rpmDepth = c.createGain()
  rpmDepth.gain.value = 3
  for (const [freq, level] of [[48, 0.8], [96.7, 0.35]] as const) {
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    rpmDepth.connect(o.frequency)
    const g = c.createGain()
    g.gain.value = level
    o.connect(g).connect(pulse)
    o.start(t)
    stoppers.push(() => o.stop())
  }
  rpm.connect(rpmDepth)
  pulseLfo.start(t)
  rpm.start(t)
  stoppers.push(() => { pulseLfo.stop(); rpm.stop() })

  // roulement des pneus : bruit grave, et souffle d'air plus aigu qui gonfle lentement
  const road = noise(2)
  road.loop = true
  const roadLp = c.createBiquadFilter()
  roadLp.type = 'lowpass'
  roadLp.frequency.value = 420
  const roadGain = c.createGain()
  roadGain.gain.value = 0.34
  road.connect(roadLp).connect(roadGain).connect(master)
  const air = noise(2)
  air.loop = true
  const airBp = c.createBiquadFilter()
  airBp.type = 'bandpass'
  airBp.frequency.value = 1900
  airBp.Q.value = 0.5
  const airGain = c.createGain()
  airGain.gain.value = 0.05
  air.connect(airBp).connect(airGain).connect(master)
  const swell = c.createOscillator()
  swell.frequency.value = 0.07
  const swellDepth = c.createGain()
  swellDepth.gain.value = 0.025
  swell.connect(swellDepth).connect(airGain.gain)
  road.start(t)
  air.start(t)
  swell.start(t)
  stoppers.push(() => { road.stop(); air.stop(); swell.stop() })

  // joints de chaussée : un « ta-dum » (essieu avant, puis arrière 0,13 s plus tard) toutes les ~1,2 s
  const thump = (at: number, level: number) => {
    const o = c.createOscillator()
    o.frequency.setValueAtTime(82, at)
    o.frequency.exponentialRampToValueAtTime(32, at + 0.16)
    const g = c.createGain()
    g.gain.setValueAtTime(level, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + 0.22)
  }
  const joints = window.setInterval(() => {
    if (c.state !== 'running') return
    const at = c.currentTime + 0.05
    thump(at, 0.5)
    thump(at + 0.13, 0.36)
  }, 1200)

  // véhicule qui double : bruit dont la bande monte puis redescend (effet Doppler grossier), côté fenêtre
  const whoosh = () => {
    if (c.state !== 'running') return
    const at = c.currentTime + 0.05
    const n = noise(3)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.9
    bp.frequency.setValueAtTime(260, at)
    bp.frequency.exponentialRampToValueAtTime(1500, at + 1.1)
    bp.frequency.exponentialRampToValueAtTime(280, at + 2.6)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(0.5, at + 1.1)
    g.gain.linearRampToValueAtTime(0.0001, at + 2.7)
    const pan = c.createStereoPanner()
    pan.pan.setValueAtTime(-0.2, at)
    pan.pan.linearRampToValueAtTime(-0.85, at + 2.6)
    n.connect(bp).connect(g).connect(pan).connect(master)
    n.start(at)
    n.stop(at + 2.8)
  }
  let whooshTimer = window.setTimeout(function again() {
    whoosh()
    whooshTimer = window.setTimeout(again, 9000 + Math.random() * 6000)
  }, 6500)

  return (fade = 2) => {
    window.clearInterval(joints)
    window.clearTimeout(whooshTimer)
    const now = c.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0.0001, now + fade)
    window.setTimeout(() => stoppers.forEach((s) => { try { s() } catch { /* déjà arrêté */ } }), fade * 1000 + 200)
  }
}

// --- bande son ---------------------------------------------------------------------------------------
// public/sounds/soundtrack.mp3 : lu en boucle en flux (élément <audio>), avec fondu d'entrée / de sortie.
// Titre : musique nette, devant nous. Contrat et partie : la même musique, mais comme si elle venait de la
// pièce d'à côté (le club) : filtrée à travers le mur (graves seuls, aigus étouffés), plus basse, noyée dans la
// réverbération de la salle, avec une très lente dérive du filtre (portes, courants d'air).

interface MusicMode {
  level: number
  /** fréquence de coupure du filtre passe-bas (Hz) */
  cutoff: number
  /** part de signal envoyée à la réverbération */
  wet: number
  /** amplitude (Hz) de la dérive lente de la coupure */
  drift: number
}
const MUSIC_TITLE: MusicMode = { level: 0.7, cutoff: 20000, wet: 0.35, drift: 0 }
const MUSIC_ROOM: MusicMode = { level: 0.8, cutoff: 380, wet: 0.7, drift: 70 }
/** Partie 3 (remix techno) : sans effet « pièce d'à côté », le morceau est joué nu : pas de filtre, pas de réverbération. */
const MUSIC_PART3_DRY: MusicMode = { level: 0.8, cutoff: 20000, wet: 0, drift: 0 }
/** Bandes son : `main` pour le titre, le contrat et la partie 1 ; `part2` pour la partie 2 ; `part3` pour la partie 3 ; `end` pour le néant et son générique ; `car` pour la fin en voiture et son générique. */
const TRACKS = { main: '/sounds/soundtrack.mp3', part2: '/sounds/soundtrack-2.mp3', part3: '/sounds/soundtrack-3-socket.mp3', end: '/sounds/soundtrack-end.mp3', car: '/sounds/soundtrack-car.mp3' } as const
type TrackId = keyof typeof TRACKS
/** Gain propre à chaque morceau, pour égaliser les niveaux (LUFS mesurés : -12,1 / -11,1 / -10,3 / -15,5 / -16,0). */
const TRACK_LEVEL: Record<TrackId, number> = { main: 1, part2: 0.89, part3: 0.62, end: 1.4, car: 1.5 }
let track: TrackId = 'main'

interface MusicChain {
  el: HTMLAudioElement
  track: TrackId
  gain: GainNode
  lp: BiquadFilterNode[]
  wet: GainNode
  drift: GainNode
  lfo: OscillatorNode
}
let music: MusicChain | null = null
let musicWanted = true
let musicRoom = false

const musicMode = () => (track === 'part3' ? MUSIC_PART3_DRY : musicRoom ? MUSIC_ROOM : MUSIC_TITLE)

/** Pousse les paramètres du mode courant vers la chaîne audio, en fondu (`tau` : constante de temps, s). */
function applyMusicMode(tau: number) {
  if (!music) return
  const c = ac()
  const m = musicMode()
  const now = c.currentTime
  for (const lp of music.lp) {
    lp.frequency.cancelScheduledValues(now)
    lp.frequency.setTargetAtTime(m.cutoff, now, tau)
  }
  music.wet.gain.setTargetAtTime(m.wet, now, tau)
  music.drift.gain.setTargetAtTime(m.drift, now, tau)
  music.gain.gain.cancelScheduledValues(now)
  music.gain.gain.setTargetAtTime(musicWanted ? m.level * TRACK_LEVEL[music.track] : 0, now, tau)
}

function startMusic() {
  // l'analyse des kicks (lumières de l'écran titre) ne vaut que pour le morceau principal
  if (!kicks && track === 'main') void analyzeKicks(TRACKS.main)
  if (music) {
    void music.el.play().catch(() => {})
    return
  }
  const c = ac()
  const m = musicMode()
  const el = new Audio(TRACKS[track])
  el.loop = true
  // deux passe-bas en cascade (24 dB/oct) : un mur épais, pas un simple voile
  const lp = [0, 1].map(() => {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = m.cutoff
    f.Q.value = 0.6
    return f
  })
  const gain = c.createGain()
  gain.gain.value = 0
  c.createMediaElementSource(el).connect(lp[0])
  lp[0].connect(lp[1]).connect(gain).connect(musicOut())
  // réverbération de la salle (même réponse que les effets), mélangée à la musique filtrée
  const pre = c.createDelay(0.2)
  pre.delayTime.value = 0.06
  const conv = c.createConvolver()
  conv.buffer = makeImpulse(c)
  const wet = c.createGain()
  wet.gain.value = m.wet
  gain.connect(pre).connect(conv).connect(wet).connect(musicOut())
  // dérive lente de la coupure : la musique « respire » à travers le mur
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.09
  const drift = c.createGain()
  drift.gain.value = m.drift
  lfo.connect(drift)
  for (const f of lp) drift.connect(f.frequency)
  lfo.start()
  music = { el, track, gain, lp, wet, drift, lfo }
  void el.play().then(() => {
    if (musicWanted) gain.gain.setTargetAtTime(m.level * TRACK_LEVEL[track], c.currentTime, 1.2)
  }).catch(() => {
    /* lecture refusée (pas de geste utilisateur) : on réessaiera au prochain clic */
    music = null
  })
}

/** Active / coupe la bande son avec un fondu. Coupée, elle se met en pause une fois éteinte. */
export function setMusic(on: boolean) {
  musicWanted = on
  if (!music) {
    // pas de chaîne (morceau changé entre deux parties) : on la crée, la musique démarre en fondu
    if (on && ctx) startMusic()
    return
  }
  applyMusicMode(on ? 1.2 : 0.5)
  if (on) void music.el.play().catch(() => {})
  else {
    const m = music
    window.setTimeout(() => {
      if (!musicWanted) m.el.pause()
    }, 2500)
  }
}

// rechargement à chaud (dev) : l'ancienne instance du module garderait sa musique en lecture, sans plus pouvoir la
// piloter, et la nouvelle en lancerait une seconde -> deux bandes son en même temps
import.meta.hot?.dispose(() => {
  music?.el.pause()
  void ctx?.close()
})

/** Détruit la chaîne de lecture courante (changement de morceau). */
function disposeMusic() {
  if (!music) return
  const m = music
  music = null
  m.el.pause()
  m.lfo.stop()
  m.gain.disconnect()
  for (const f of m.lp) f.disconnect()
  m.wet.disconnect()
}

/**
 * Choisit le morceau (un par partie : `main`, `part2`, `part3`). À appeler pendant que la musique est coupée ;
 * le prochain `setMusic(true)` lance le nouveau morceau en fondu.
 */
export function setMusicTrack(next: TrackId) {
  if (next === track) return
  track = next
  disposeMusic()
}

/** Titre -> salle : la musique passe de « devant nous » à « derrière le mur » (fondu ~2 s). */
export function setMusicRoom(room: boolean) {
  musicRoom = room
  applyMusicMode(0.7)
}

// --- détection des kicks de la bande son -------------------------------------------------------
// Analyse hors ligne (une fois) : le morceau est décodé, filtré passe-bas (grave), et on relève les
// attaques de l'enveloppe. Les lumières de l'écran titre lisent ensuite ces instants d'après la position
// de lecture (currentTime) : synchro exacte, sans latence d'analyse en temps réel.

let kicks: Float32Array | null = null

/** Avance du pic de flux sur le début réel de l'attaque (s). */
const ONSET_SHIFT = 0.025
/**
 * Avance des lumières sur la position de lecture (s) : le pipeline <audio> -> haut-parleurs et l'affichage de
 * l'image ajoutent de la latence que `outputLatency` ne couvre pas entièrement. Réglable en direct :
 * `window.__lightLead = 0.12` dans la console (plus grand = flash plus tôt).
 */
const LIGHT_LEAD = 0.14
let analyzing = false

/** Instants (s) des kicks de `url`. Détecte les pics du grave (<~150 Hz) au-dessus de leur moyenne locale. */
async function analyzeKicks(url: string) {
  if (analyzing || kicks) return
  analyzing = true
  try {
    const c = ac()
    const buf = await c.decodeAudioData(await (await fetch(url)).arrayBuffer())
    const sr = buf.sampleRate
    const hop = Math.floor(sr * 0.01) // enveloppe toutes les 10 ms
    const n = Math.floor(buf.length / hop)
    const ch0 = buf.getChannelData(0)
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0
    const alpha = 1 - Math.exp((-2 * Math.PI * 150) / sr) // passe-bas à ~150 Hz
    let lp = 0
    const env = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let e = 0
      for (let j = i * hop; j < (i + 1) * hop; j++) {
        lp += ((ch0[j] + ch1[j]) * 0.5 - lp) * alpha
        e += lp * lp
      }
      env[i] = Math.sqrt(e / hop)
    }
    // flux positif de l'enveloppe, seuil adaptatif sur ±0,4 s, écart minimal entre kicks 0,36 s (le morceau tourne autour de 143 BPM)
    const flux = new Float32Array(n)
    for (let i = 1; i < n; i++) flux[i] = Math.max(env[i] - env[i - 1], 0)
    const w = 40
    const out: number[] = []
    let last = -1
    for (let i = w; i < n - w; i++) {
      let mean = 0
      for (let k = i - w; k <= i + w; k++) mean += flux[k]
      mean /= 2 * w + 1
      const isPeak = flux[i] > flux[i - 1] && flux[i] >= flux[i + 1]
      if (isPeak && flux[i] > mean * 2.2 + 1e-4 && (last < 0 || (i - last) * 0.01 > 0.36)) {
        out.push(Math.max(i * 0.01 - ONSET_SHIFT, 0)) // le pic du flux est un peu après le début de l'attaque
        last = i
      }
    }
    kicks = Float32Array.from(out)
  } catch {
    kicks = new Float32Array(0)
  } finally {
    analyzing = false
  }
}

export interface MusicBeat {
  /** 1 à l'instant d'un kick, décroît vite (contretemps : `off`, au milieu de deux kicks) */
  pulse: number
  off: number
  /** numéro du kick courant (change de couleur / accents) */
  index: number
}

/** État rythmique de la bande son à cet instant, ou null si elle ne joue pas / n'est pas encore analysée. */
export function musicBeat(): MusicBeat | null {
  if (!music || music.track !== 'main' || !kicks || kicks.length < 4 || music.el.paused) return null
  const c = ac()
  const lead = (window as unknown as { __lightLead?: number }).__lightLead ?? LIGHT_LEAD
  const ct = music.el.currentTime - ((c.outputLatency || 0) + c.baseLatency) + lead
  // dernier kick <= ct (recherche dichotomique)
  let lo = 0
  let hi = kicks.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (kicks[mid] <= ct) lo = mid
    else hi = mid - 1
  }
  if (kicks[lo] > ct) return null
  const k = kicks[lo]
  const prev = lo > 0 ? kicks[lo - 1] : k
  const next = lo < kicks.length - 1 ? kicks[lo + 1] : k + (k - prev)
  const decay = 7
  const midNow = (k + next) / 2
  const midPrev = (prev + k) / 2
  const off = ct >= midNow ? Math.exp(-(ct - midNow) * decay) : Math.exp(-(ct - midPrev) * decay)
  return { pulse: Math.exp(-(ct - k) * decay), off, index: lo }
}

/** Debug : nombre de kicks détectés et intervalle médian. */
export function kickStats() {
  if (!kicks) return null
  const d = Array.from(kicks.slice(1)).map((v, i) => v - kicks![i]).sort((a, b) => a - b)
  return { count: kicks.length, medianInterval: d.length ? d[d.length >> 1] : 0, first: Array.from(kicks.slice(0, 8)) }
}

// --- grattement du stylo (signature) ---------------------------------------------------------------

let scratch: { gain: GainNode } | null = null

/** Niveau du grattement (0 = silence, 1 = geste rapide). Le bruit filtré tourne en continu, seul son gain bouge. */
export function setScratch(level: number) {
  const c = ac()
  if (!scratch) {
    const src = noise(2)
    src.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3200
    bp.Q.value = 0.8
    const gain = c.createGain()
    gain.gain.value = 0
    src.connect(bp).connect(gain).connect(out())
    src.start()
    scratch = { gain }
  }
  scratch.gain.gain.setTargetAtTime(level * 0.22, c.currentTime, 0.03)
}
