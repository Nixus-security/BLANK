// `npm test` : règles multijoueur (2-4 joueurs) + invariants sur parties aléatoires
import assert from 'node:assert/strict'
import { applyAction, createMultiGame, forfeitMulti, shootMulti, useItemMulti, viewFor } from '../src/game/multi/rules'
import { resetRng } from '../src/game/rng'
import type { MultiState } from '../src/game/multi/types'

const fixture = (chamber: boolean[], n = 4, turn = 0): MultiState => {
  const g = createMultiGame(Array.from({ length: n }, (_, i) => `J${i + 1}`), 4)
  g.chamber = [...chamber]
  const live = chamber.filter(Boolean).length
  g.announced = { live, blank: chamber.length - live }
  g.remaining = { ...g.announced }
  g.turn = turn
  g.inventory = Array.from({ length: n }, () => [])
  return g
}

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name) }

t('2 à 4 joueurs seulement', () => {
  assert.throws(() => createMultiGame(['a']))
  assert.throws(() => createMultiGame(['a', 'b', 'c', 'd', 'e']))
  assert.equal(createMultiGame(['a', 'b', 'c', 'd']).hp.length, 4)
})
t('tir réelle sur un adversaire : -1 PV, tour au siège suivant', () => {
  const s = shootMulti(fixture([true, false, false]), 0, 2)
  assert.equal(s.hp[2], 3)
  assert.equal(s.turn, 1)
})
t('tir à blanc sur un adversaire : pas de dégât, tour suivant', () => {
  const s = shootMulti(fixture([false, true]), 0, 3)
  assert.equal(s.hp[3], 4)
  assert.equal(s.turn, 1)
})
t('auto-tir blanc : garde la main, balle suivante', () => {
  const s = shootMulti(fixture([false, true, true], 4, 1), 1, 1)
  assert.equal(s.turn, 1)
  assert.equal(s.chamber[0], true)
})
t('auto-tir réelle : -1 PV et la main passe (retour au siège 0)', () => {
  const s = shootMulti(fixture([true, false], 4, 3), 3, 3)
  assert.equal(s.hp[3], 3)
  assert.equal(s.turn, 0)
})
t('scie : 2 dégâts puis consommée', () => {
  const g = fixture([true, true, false]); g.sawed[0] = true
  const s = shootMulti(g, 0, 1)
  assert.equal(s.hp[1], 2)
  assert.equal(s.sawed[0], false)
})
t('tir hors tour / sur mort refusés', () => {
  const g = fixture([true, false])
  assert.equal(shootMulti(g, 1, 2), g)
  g.alive[2] = false
  assert.equal(shootMulti(g, 0, 2), g)
})
t('mort : sauté dans l\'ordre de jeu, inventaire vidé', () => {
  const g = fixture([true, false, false]); g.hp[1] = 1; g.inventory[1] = ['beer']
  const s = shootMulti(g, 0, 1)
  assert.equal(s.alive[1], false)
  assert.deepEqual(s.inventory[1], [])
  assert.equal(s.phase, 'playing')
  assert.equal(s.turn, 2)
})
t('dernier vivant : gameOver + gagnant', () => {
  const g = fixture([true, false, false], 3)
  g.alive[2] = false; g.hp[2] = 0; g.hp[1] = 1
  const s = shootMulti(g, 0, 1)
  assert.equal(s.phase, 'gameOver')
  assert.equal(s.winner, 0)
})
t('auto-tir mortel : la main passe, partie continue', () => {
  const g = fixture([true, false, false], 4, 2); g.hp[2] = 1
  const s = shootMulti(g, 2, 2)
  assert.equal(s.alive[2], false)
  assert.equal(s.turn, 3)
  assert.equal(s.phase, 'playing')
})
t('menottes : la cible saute son tour, le suivant joue', () => {
  const g = fixture([false, false, true, false], 4, 0); g.inventory[0] = ['handcuffs']
  const a = useItemMulti(g, 0, 0, 1)
  assert.equal(a.cuffed[1], true)
  assert.equal(a.inventory[0].length, 0)
  const s = shootMulti(a, 0, 3) // à blanc
  assert.equal(s.cuffed[1], false)
  assert.equal(s.turn, 2)
})
t('menottes : tous les autres sautés → le tireur rejoue', () => {
  const g = fixture([false, false, true, true], 2, 0); g.cuffed[1] = true
  const s = shootMulti(g, 0, 1)
  assert.equal(s.turn, 0)
  assert.equal(s.cuffed[1], false)
})
t('auto-tir mortel, tous les autres menottés : le premier libéré joue', () => {
  const g = fixture([true, false, true], 3, 0); g.hp[0] = 1; g.cuffed[1] = g.cuffed[2] = true
  const s = shootMulti(g, 0, 0)
  assert.equal(s.alive[0], false)
  assert.equal(s.turn, 1)
  assert.deepEqual(s.cuffed, [false, false, false])
})
t('menottes : cible invalide (soi, déjà menotté, morte, absente) refusée', () => {
  const g = fixture([true, false], 4, 0); g.inventory[0] = ['handcuffs']; g.cuffed[2] = true; g.alive[3] = false
  assert.equal(useItemMulti(g, 0, 0, 0), g)
  assert.equal(useItemMulti(g, 0, 0, 2), g)
  assert.equal(useItemMulti(g, 0, 0, 3), g)
  assert.equal(useItemMulti(g, 0, 0), g)
})
t('loupe : privée (journal et vues des autres)', () => {
  const g = fixture([true, false], 3, 0); g.inventory[0] = ['loupe']
  const s = useItemMulti(g, 0, 0)
  assert.equal(s.known[0], true)
  assert.ok(!/LIVE|RÉELLE|BLANK|À BLANC/.test(s.log.at(-1)!))
  assert.equal(viewFor(s, 1).known[0], null)
  assert.equal(viewFor(s, 0).known[0], true)
  assert.deepEqual(viewFor(s, 0).chamber, [])
  assert.equal(s.chamber.length, 2) // l'original n'est pas muté
})
t('inverseur : inverse aussi les loupes de tout le monde', () => {
  const g = fixture([true, false, true], 3, 0); g.inventory[0] = ['inverter']; g.known[1] = true
  const s = useItemMulti(g, 0, 0)
  assert.equal(s.chamber[0], false)
  assert.equal(s.known[1], false)
  assert.deepEqual(s.remaining, { live: 1, blank: 2 })
})
t('bière : éjecte, efface les loupes', () => {
  const g = fixture([true, false, true], 3, 0); g.inventory[0] = ['beer']; g.known[2] = true
  const s = useItemMulti(g, 0, 0)
  assert.equal(s.chamber.length, 2)
  assert.deepEqual(s.known, [null, null, null])
})
t('adrénaline : vole un objet de la cible et l\'utilise', () => {
  const g = fixture([true, false], 3, 0); g.inventory[0] = ['adrenaline']; g.inventory[1] = ['saw']
  const s = useItemMulti(g, 0, 0, 1)
  assert.equal(s.sawed[0], true)
  assert.deepEqual(s.inventory[1], [])
})
t('adrénaline : menottes volées visent la même cible', () => {
  const g = fixture([true, false], 3, 0); g.inventory[0] = ['adrenaline']; g.inventory[1] = ['handcuffs']
  const s = useItemMulti(g, 0, 0, 1)
  assert.equal(s.cuffed[1], true)
})
t('adrénaline : refusée si rien à voler', () => {
  const g = fixture([true, false], 3, 0); g.inventory[0] = ['adrenaline']; g.inventory[1] = ['adrenaline']
  assert.equal(useItemMulti(g, 0, 0, 1), g)
})
t('pilules mortelles : le joueur meurt, la main passe', () => {
  const g = fixture([true, false], 3, 0); g.inventory[0] = ['pills']; g.hp[0] = 1
  let died = 0
  for (let i = 0; i < 200; i++) {
    const s = useItemMulti(g, 0, 0)
    if (!s.alive[0]) { died++; assert.equal(s.turn, 1) }
  }
  assert.ok(died > 0 && died < 200)
})
t('chargeur épuisé → rechargement, objets aux vivants seulement', () => {
  const g = fixture([true, false], 4, 0); g.alive[3] = false; g.hp[3] = 0
  const s2 = shootMulti(g, 0, 1) // réelle, reste [false] → plus de réelle → rechargement
  assert.equal(s2.load, 2)
  assert.ok(s2.inventory[0].length >= 1 && s2.inventory[1].length >= 1 && s2.inventory[2].length >= 1)
  assert.equal(s2.inventory[3].length, 0)
})
t('abandon : éliminé, la main passe, dernier restant gagne', () => {
  const g = fixture([true, false], 3, 1)
  const s = forfeitMulti(g, 1)
  assert.equal(s.alive[1], false)
  assert.equal(s.turn, 2)
  const e = forfeitMulti(s, 0)
  assert.equal(e.phase, 'gameOver')
  assert.equal(e.winner, 2)
})
t('événements : tir, objet, vol, abandon (seq +1 à chaque action)', () => {
  const g = fixture([true, false, true], 3, 0); g.inventory[0] = ['adrenaline', 'beer']; g.inventory[1] = ['saw']
  const a = shootMulti(g, 0, 1)
  assert.equal(a.seq, g.seq + 1)
  assert.deepEqual(a.last, { kind: 'shoot', shooter: 0, target: 1, live: true, dmg: 1 })
  const b = useItemMulti(g, 0, 1)
  assert.deepEqual(b.last, { kind: 'item', user: 0, id: 'beer', shell: true })
  const c = useItemMulti(g, 0, 0, 1)
  assert.deepEqual(c.last, { kind: 'item', user: 0, id: 'adrenaline', target: 1, stolen: 'saw' })
  const d = forfeitMulti(g, 2)
  assert.deepEqual(d.last, { kind: 'forfeit', seat: 2 })
  assert.equal(shootMulti(g, 1, 0).seq, g.seq) // refusé : rien ne change
})
t('loupe : l\'événement ne révèle pas la balle', () => {
  const g = fixture([true, false], 2, 0); g.inventory[0] = ['loupe']
  assert.deepEqual(useItemMulti(g, 0, 0).last, { kind: 'item', user: 0, id: 'loupe' })
})
t('applyAction route shoot/item', () => {
  const g = fixture([true, false, true], 2, 0); g.inventory[0] = ['inverter']
  assert.equal(applyAction(g, 0, { type: 'item', index: 0 }).chamber[0], false)
  assert.equal(applyAction(g, 0, { type: 'shoot', target: 1 }).hp[1], 3)
})
t('invariants sur 2000 parties aléatoires (2-4 joueurs)', () => {
  for (let i = 0; i < 2000; i++) {
    const players = 2 + (i % 3)
    let g = createMultiGame(Array.from({ length: players }, (_, k) => `J${k}`))
    for (let steps = 0; steps < 2000 && g.phase === 'playing'; steps++) {
      const live = g.chamber.filter(Boolean).length
      assert.equal(g.remaining.live, live)
      assert.equal(g.remaining.blank, g.chamber.length - live)
      assert.ok(g.chamber.length > 0)
      assert.ok(g.alive[g.turn], 'la main est à un joueur vivant')
      assert.ok(g.inventory.every((inv) => inv.length <= 8))
      assert.ok(g.alive.every((a, k) => a === g.hp[k] > 0))
      const who = g.turn
      const inv = g.inventory[who]
      const targets = g.alive.flatMap((a, k) => (a ? [k] : []))
      const pick = targets[Math.floor(Math.random() * targets.length)]
      g = Math.random() < 0.3 && inv.length
        ? useItemMulti(g, who, Math.floor(Math.random() * inv.length), pick)
        : shootMulti(g, who, pick)
    }
    assert.equal(g.phase, 'gameOver', 'partie finie')
    assert.equal(g.alive.filter(Boolean).length, 1)
    assert.equal(g.winner, g.alive.indexOf(true))
  }
  resetRng()
})

console.log(`\n${n} tests OK`)
