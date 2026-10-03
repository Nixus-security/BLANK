import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import { getLang, tr } from '../i18n'

/** Feuille A4 en pixels (texture) et en mètres (sur la table). */
export const PAPER_PX = { w: 1024, h: 1448 }
/** Facteur de résolution de la texture : le dessin est fait en coordonnées 1024 × 1448, rendu en 2048 × 2896 pour rester net de près. */
const SCALE = 2
export const PAPER_M = { w: 0.48, h: 0.679 }

const INK = '#0f0d0a'
const SIGN_INK = '#0f1a3d'
const MARGIN = 84

/** Zone où le joueur signe (pixels de la texture). */
export const SIGN_RECT = { x: 350, y: 1302, w: 590, h: 100 }
/** Longueur minimale du tracé (px de texture) pour compter comme une signature. */
export const MIN_STROKE = 300
/**
 * Calque d'encre (tracé du joueur + tampon) : petit canvas transparent posé sur la zone de signature.
 * Seul lui est renvoyé au GPU pendant le geste, au lieu de la feuille entière (2048 × 2896).
 */
export const INK_RECT = { x: 300, y: 1230, w: 700, h: 220 }

const rng = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const todayText = () => new Date().toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Coupe `text` en lignes de largeur <= `max` avec la police courante du contexte. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (g.measureText(test).width > max && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Taches de sang séché sur la signature de l'hôte : éclaboussure, grosses taches, coulures, trace de doigt. */
function drawBlood(g: CanvasRenderingContext2D, cx: number, cy: number, seed = 7) {
  const r = rng(seed)
  g.save()
  g.globalCompositeOperation = 'multiply'
  const dried = ['#5c0b08', '#6f0e0a', '#7d110c', '#4a0806']
  // trace de doigt étalée en travers
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(92,11,8,0.55)'
  g.lineWidth = 30
  g.beginPath()
  g.moveTo(cx - 190, cy + 10)
  g.bezierCurveTo(cx - 90, cy - 40, cx + 40, cy + 50, cx + 200, cy - 6)
  g.stroke()
  g.strokeStyle = 'rgba(125,17,12,0.5)'
  g.lineWidth = 14
  g.beginPath()
  g.moveTo(cx - 175, cy + 26)
  g.bezierCurveTo(cx - 70, cy - 22, cx + 50, cy + 66, cx + 185, cy + 12)
  g.stroke()
  // grosses taches (disques accolés) + coulures
  const blobs: [number, number, number][] = [[cx - 20, cy + 4, 34], [cx + 100, cy + 18, 24], [cx - 120, cy - 8, 18]]
  for (const [bx, by, br] of blobs) {
    g.fillStyle = 'rgba(106,13,9,0.9)'
    g.beginPath()
    g.arc(bx, by, br, 0, Math.PI * 2)
    g.fill()
    for (let k = 0; k < 6; k++) {
      g.beginPath()
      g.arc(bx + (r() - 0.5) * br * 1.7, by + (r() - 0.5) * br * 1.3, br * (0.35 + r() * 0.5), 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = 'rgba(163,20,14,0.35)'
    g.beginPath()
    g.arc(bx - br * 0.15, by - br * 0.2, br * 0.3, 0, Math.PI * 2)
    g.fill()
  }
  const drips: [number, number, number, number][] = [[cx - 22, cy + 30, 100, 8], [cx + 98, cy + 38, 64, 6], [cx - 122, cy + 8, 44, 5]]
  for (const [dx, dy, len, w] of drips) {
    g.strokeStyle = 'rgba(106,13,9,0.9)'
    g.lineWidth = w
    g.beginPath()
    g.moveTo(dx, dy)
    g.lineTo(dx, dy + len)
    g.stroke()
    g.fillStyle = 'rgba(106,13,9,0.92)'
    g.beginPath()
    g.ellipse(dx, dy + len + w * 0.6, w * 0.65, w * 0.95, 0, 0, Math.PI * 2)
    g.fill()
  }
  // gouttes fines autour du point d'impact
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2
    const d = Math.pow(r(), 1.6) * 280
    g.fillStyle = dried[Math.floor(r() * dried.length)]
    g.globalAlpha = 0.65 + r() * 0.3
    g.beginPath()
    g.arc(cx + Math.cos(a) * d * 1.5, cy + Math.sin(a) * d * 0.55, 2 + r() * (d < 90 ? 12 : 6), 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

/**
 * Le contrat en texture 2D (1024 × 1448 px, format A4) : texte, signature de l'hôte « GOD » tachée de sang,
 * cadre du joueur. `strokeTo` dessine la signature du joueur ; `stamp` appose le tampon « SIGNÉ ».
 */
export class ContractPaper {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  readonly inkCanvas = document.createElement('canvas')
  readonly inkTexture: CanvasTexture
  private g: CanvasRenderingContext2D
  private ink: CanvasRenderingContext2D
  private inkDirty = false

  constructor() {
    this.canvas.width = PAPER_PX.w * SCALE
    this.canvas.height = PAPER_PX.h * SCALE
    this.g = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 8
    this.inkCanvas.width = INK_RECT.w * SCALE
    this.inkCanvas.height = INK_RECT.h * SCALE
    this.ink = this.inkCanvas.getContext('2d')!
    // coordonnées de la feuille (1024 × 1448) -> calque
    this.ink.setTransform(SCALE, 0, 0, SCALE, -INK_RECT.x * SCALE, -INK_RECT.y * SCALE)
    this.inkTexture = new CanvasTexture(this.inkCanvas)
    this.inkTexture.colorSpace = SRGBColorSpace
    this.inkTexture.generateMipmaps = false
    this.inkTexture.minFilter = LinearFilter
    this.redraw()
    // les polices web peuvent arriver après : on redessine quand elles sont prêtes
    void Promise.all([document.fonts.load('40px VT323'), document.fonts.load('80px "Nothing You Could Do"')]).then(() => this.redraw())
  }

  /** Redessine la feuille vierge (efface une signature en cours). */
  redraw() {
    const g = this.g
    const { w, h } = PAPER_PX
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    g.clearRect(0, 0, w, h)
    // papier : crème, halo clair en haut, brunissement en bas
    g.fillStyle = '#d8ceb0'
    g.fillRect(0, 0, w, h)
    let grad = g.createRadialGradient(w * 0.3, h * 0.12, 20, w * 0.3, h * 0.12, w * 0.9)
    grad.addColorStop(0, 'rgba(255,255,255,0.28)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    grad = g.createRadialGradient(w * 0.8, h * 0.95, 20, w * 0.8, h * 0.95, w * 0.9)
    grad.addColorStop(0, 'rgba(80,50,20,0.3)')
    grad.addColorStop(1, 'rgba(80,50,20,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    // pli horizontal (feuille pliée en trois) et grain
    g.fillStyle = 'rgba(60,40,20,0.08)'
    g.fillRect(0, h / 3 - 2, w, 4)
    g.fillRect(0, (2 * h) / 3 - 2, w, 4)
    const r = rng(3)
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(70,50,30,${0.03 + r() * 0.05})`
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
    }

    g.fillStyle = INK
    g.textBaseline = 'alphabetic'
    const setFont = (px: number, family = 'VT323, monospace') => (g.font = `${px}px ${family}`)
    const spacing = (px: number) => ((g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`)

    // titre
    g.textAlign = 'center'
    setFont(78)
    spacing(12)
    g.fillText(tr('CONTRAT DE', 'PARTICIPATION'), w / 2, 150)
    g.fillText(tr('PARTICIPATION', 'AGREEMENT'), w / 2, 232)
    setFont(34)
    spacing(10)
    g.globalAlpha = 0.55
    g.fillText('BUCKSHOT ROULETTE', w / 2, 290)
    g.globalAlpha = 1

    // corps
    g.textAlign = 'left'
    spacing(1)
    setFont(48)
    const maxW = w - MARGIN * 2
    let y = 375
    const lh = 52
    for (const l of wrap(g, tr('Je soussigné(e), déclare avoir pris connaissance des conditions de la partie qui va suivre :', 'I, the undersigned, declare that I have read the terms of the game that is about to begin:'), maxW)) {
      g.fillText(l, MARGIN, y)
      y += lh
    }
    y += 20
    const clauses = [
      tr("Un fusil à pompe sera chargé de cartouches réelles et à blanc, dans un ordre que j'ignore.", 'A shotgun will be loaded with live and blank shells, in an order unknown to me.'),
      tr('À mon tour, je devrai tirer sur mon adversaire ou sur moi-même.', 'On my turn, I must shoot my opponent or myself.'),
      tr('Je suis conscient(e) que cette partie peut entraîner ma mort.', 'I am aware that this game may result in my death.'),
      tr("Je renonce à toute réclamation, quelle qu'en soit l'issue.", 'I waive any claim, whatever the outcome.'),
    ]
    const indent = 56
    clauses.forEach((c, i) => {
      g.fillText(`${i + 1}.`, MARGIN, y)
      const lines = wrap(g, c, maxW - indent)
      lines.forEach((l, k) => {
        g.fillText(l, MARGIN + indent, y)
        if (i === 2) {
          // clause de la mort : soulignée en rouge sombre
          const tw = g.measureText(l).width
          g.fillStyle = '#7a1a12'
          g.fillRect(MARGIN + indent, y + 8, tw, 4)
          g.fillStyle = INK
        }
        y += lh
        if (k === lines.length - 1) y += 10
      })
    })

    y += 14
    setFont(36)
    g.globalAlpha = 0.7
    g.fillText(tr(`Fait le ${todayText()}. Lu et approuvé.`, `Dated ${todayText()}. Read and approved.`), MARGIN, y)
    g.globalAlpha = 1

    // signature de l'hôte, déjà apposée, tachée de sang
    setFont(36)
    spacing(1)
    const hostY = 1234
    g.fillText(tr("Signature de l'hôte :", "Host's signature:"), MARGIN, hostY - 6)
    g.fillStyle = 'rgba(27,23,18,0.7)'
    g.fillRect(350, hostY, 590, 3)
    g.save()
    g.translate(645, hostY - 14)
    g.rotate(-0.09)
    g.fillStyle = '#12101a'
    g.textAlign = 'center'
    g.font = '112px "Nothing You Could Do", "Segoe Script", cursive'
    spacing(6)
    g.fillText('GOD', 0, 0)
    g.restore()
    drawBlood(g, 640, hostY - 34)

    // cadre du joueur
    g.fillStyle = INK
    g.textAlign = 'left'
    setFont(36)
    spacing(1)
    g.fillText(tr('Signature du joueur :', "Player's signature:"), MARGIN, SIGN_RECT.y + SIGN_RECT.h - 8)
    g.fillStyle = 'rgba(27,23,18,0.7)'
    g.fillRect(SIGN_RECT.x, SIGN_RECT.y + SIGN_RECT.h, SIGN_RECT.w, 3)
    g.textAlign = 'center'
    setFont(40)
    spacing(8)
    g.globalAlpha = 0.28
    g.fillStyle = INK
    g.fillText(tr('signe ici', 'sign here'), SIGN_RECT.x + SIGN_RECT.w / 2, SIGN_RECT.y + SIGN_RECT.h / 2 + 14)
    g.globalAlpha = 1
    spacing(0)
    this.texture.needsUpdate = true
  }

  /** Efface le tracé en cours (calque d'encre seulement : la feuille n'est pas redessinée). */
  clear() {
    this.ink.clearRect(INK_RECT.x, INK_RECT.y, INK_RECT.w, INK_RECT.h)
    this.inkDirty = true
  }

  /** Envoie le calque d'encre au GPU s'il a changé : à appeler une fois par image, pas à chaque événement souris. */
  flush() {
    if (!this.inkDirty) return
    this.inkDirty = false
    this.inkTexture.needsUpdate = true
  }

  /** Relie (x0,y0) à (x1,y1) en encre bleu nuit, limité au cadre de signature (un peu débordant). */
  strokeTo(x0: number, y0: number, x1: number, y1: number) {
    const g = this.ink
    g.save()
    g.beginPath()
    g.rect(SIGN_RECT.x - 12, SIGN_RECT.y - 40, SIGN_RECT.w + 24, SIGN_RECT.h + 60)
    g.clip()
    g.strokeStyle = SIGN_INK
    g.lineWidth = 4.5
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
    g.restore()
    this.inkDirty = true
  }

  /** Tampon rouge « SIGNÉ » par-dessus la signature. */
  stamp() {
    const g = this.ink
    g.save()
    g.translate(SIGN_RECT.x + SIGN_RECT.w * 0.7, SIGN_RECT.y + SIGN_RECT.h * 0.72)
    g.rotate(-0.21)
    g.globalAlpha = 0.85
    g.strokeStyle = '#8a1d12'
    g.fillStyle = '#8a1d12'
    g.lineWidth = 8
    g.font = '96px VT323, monospace'
    ;(g as unknown as { letterSpacing: string }).letterSpacing = '14px'
    g.textAlign = 'center'
    const word = tr('SIGNÉ', 'SIGNED')
    const tw = g.measureText(word).width
    g.strokeRect(-tw / 2 - 22, -84, tw + 44, 112)
    g.fillText(word, 0, 0)
    g.restore()
    this.inkDirty = true
  }
}
