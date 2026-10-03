// `npm test` : règles + invariants sur 2000 parties aléatoires
import assert from 'node:assert/strict'
import { decideDealer } from '../src/game/dealerAI'
import { createGame, shoot, useItem } from '../src/game/rules'
import { resetRng, setRng } from '../src/game/rng'
import type { GameState } from '../src/game/types'

const fixture = (chamber: boolean[], turn: 'player' | 'dealer' = 'player', level = 1): GameState => {
  const g = createGame(3, level)
  g.chamber = [...chamber]
  const live = chamber.filter(Boolean).length
  g.announced = g.remaining = { live, blank: chamber.length - live }
  g.turn = turn
  g.inventory = { player: [], dealer: [] }
  return g
}

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name) }

t('tir sur croupier (réelle) : -1 PV et tour au croupier', () => {
  const s = shoot(fixture([true, false, false]), 'player', 'dealer')
  assert.equal(s.hp.dealer, 2)
  assert.equal(s.turn, 'dealer')
})
t('tir sur croupier (blanc) : pas de dégât, tour au croupier', () => {
  const s = shoot(fixture([false, true]), 'player', 'dealer')
  assert.equal(s.hp.dealer, 3)
  assert.equal(s.turn, 'dealer')
})
t('auto-tir blanc : garde le tour, balle suivante', () => {
  const s = shoot(fixture([false, true, true]), 'player', 'player')
  assert.equal(s.hp.player, 3)
  assert.equal(s.turn, 'player')
  assert.equal(s.chamber[0], true)
})
t('auto-tir réelle : -1 PV et tour passe', () => {
  const s = shoot(fixture([true, false]), 'player', 'player')
  assert.equal(s.hp.player, 2)
  assert.equal(s.turn, 'dealer')
})
t('mort : phase gameOver + gagnant', () => {
  const g = fixture([true, false]); g.hp.dealer = 1
  const s = shoot(g, 'player', 'dealer')
  assert.equal(s.phase, 'gameOver')
  assert.equal(s.winner, 'player')
})
t('tir hors tour refusé', () => {
  const g = fixture([true, false])
  assert.equal(shoot(g, 'dealer', 'player'), g)
})
t('chargeur vide -> rechargement + objets', () => {
  const s = shoot(fixture([false, true]), 'player', 'player') // blanc, reste [true]
  const s2 = shoot(s, 'player', 'dealer') // dernière balle
  assert.ok(s2.chamber.length >= 2)
  assert.equal(s2.load, 2)
  assert.ok(s2.inventory.player.length >= 1)
})
t('plus que des balles à blanc -> rechargement', () => {
  const s = shoot(fixture([true, false, false]), 'player', 'dealer') // reste [false, false]
  assert.equal(s.load, 2)
  assert.ok(s.chamber.some(Boolean))
  const g = fixture([true, false]); g.inventory.player = ['beer'] // bière sur la réelle, reste [false]
  const b = useItem(g, 'player', 0)
  assert.equal(b.load, 2)
  assert.ok(b.chamber.some(Boolean))
})
t('bière éjecte la balle et met à jour le décompte', () => {
  const g = fixture([true, false, true]); g.inventory.player = ['beer']
  const s = useItem(g, 'player', 0)
  assert.deepEqual(s.chamber, [false, true])
  assert.deepEqual(s.remaining, { live: 1, blank: 1 })
  assert.equal(s.inventory.player.length, 0)
})
t('loupe révèle la balle au joueur seulement', () => {
  const g = fixture([true, false]); g.inventory.player = ['loupe']
  const s = useItem(g, 'player', 0)
  assert.equal(s.known.player, true)
  assert.equal(s.known.dealer, null)
})
t('cigarette : +1 PV plafonné, refusée à PV max', () => {
  const g = fixture([true, false]); g.inventory.player = ['cigarette']
  assert.equal(useItem(g, 'player', 0), g)
  g.hp.player = 2
  assert.equal(useItem(g, 'player', 0).hp.player, 3)
})
t('scie : tir réel = 2 dégâts puis consommée ; refusée si déjà sciée', () => {
  const g = fixture([true, true, false]); g.inventory.player = ['saw', 'saw']
  const a = useItem(g, 'player', 0)
  assert.equal(a.sawed.player, true)
  assert.equal(useItem(a, 'player', 0), a)
  const s = shoot(a, 'player', 'dealer')
  assert.equal(s.hp.dealer, 1)
  assert.equal(s.sawed.player, false)
})
t('scie : balle à blanc = aucun dégât mais la scie est perdue', () => {
  const g = fixture([false, true]); g.inventory.player = ['saw']
  const s = shoot(useItem(g, 'player', 0), 'player', 'dealer')
  assert.equal(s.hp.dealer, 3)
  assert.equal(s.sawed.player, false)
})
t('scie : peut tuer d un coup un croupier à 2 PV', () => {
  const g = fixture([true, false]); g.inventory.player = ['saw']; g.hp.dealer = 2
  assert.equal(shoot(useItem(g, 'player', 0), 'player', 'dealer').phase, 'gameOver')
})
t('menottes : le croupier saute son tour, une seule fois', () => {
  const g = fixture([false, true, true, false]); g.inventory.player = ['handcuffs']
  const a = useItem(g, 'player', 0)
  assert.equal(a.cuffed.dealer, true)
  const b = shoot(a, 'player', 'dealer') // blanc : normalement le tour passerait
  assert.equal(b.turn, 'player')
  assert.equal(b.cuffed.dealer, false)
  assert.equal(shoot(b, 'player', 'dealer').turn, 'dealer')
})
t('menottes : refusées si déjà menotté', () => {
  const g = fixture([true, false]); g.inventory.player = ['handcuffs']; g.cuffed.dealer = true
  assert.equal(useItem(g, 'player', 0), g)
})
t('inverseur : inverse la balle, le décompte et la connaissance', () => {
  const g = fixture([true, true, false]); g.inventory.player = ['loupe', 'inverter']
  const a = useItem(g, 'player', 0)
  assert.equal(a.known.player, true)
  const b = useItem(a, 'player', 0)
  assert.equal(b.chamber[0], false)
  assert.equal(b.known.player, false)
  assert.deepEqual(b.remaining, { live: 1, blank: 2 })
})
t('pilules : 50/50 +2 PV (plafonné) ou -1 PV, peuvent tuer', () => {
  const g = fixture([true, false]); g.inventory.player = ['pills']; g.hp.player = 1
  setRng(() => 0.1)
  assert.equal(useItem(g, 'player', 0).hp.player, 3)
  setRng(() => 0.9)
  const dead = useItem(g, 'player', 0)
  assert.equal(dead.phase, 'gameOver')
  assert.equal(dead.winner, 'dealer')
  resetRng()
})
t('adrénaline : vole et utilise un objet ; refusée sans cible utilisable', () => {
  const g = fixture([true, false]); g.inventory.player = ['adrenaline']; g.inventory.dealer = ['adrenaline', 'saw']
  const s = useItem(g, 'player', 0)
  assert.equal(s.sawed.player, true)
  assert.deepEqual(s.inventory.dealer, ['adrenaline'])
  const h = fixture([true, false]); h.inventory.player = ['adrenaline']; h.inventory.dealer = ['cigarette'] // PV pleins : inutilisable
  assert.equal(useItem(h, 'player', 0), h)
})
t('IA : scie puis menottes avant de viser le joueur', () => {
  const g = fixture([true, true, false], 'dealer'); g.inventory.dealer = ['handcuffs', 'saw']
  assert.deepEqual(decideDealer(g), { type: 'item', index: 1 })
  const a = useItem(g, 'dealer', 1)
  assert.deepEqual(decideDealer(a), { type: 'item', index: 0 })
})
t('IA : inverseur si balle à blanc connue', () => {
  const g = fixture([false, true], 'dealer'); g.inventory.dealer = ['inverter']; g.known.dealer = false
  assert.deepEqual(decideDealer(g), { type: 'item', index: 0 })
})
t('IA : plus de réelles -> vise le joueur', () => {
  const g = fixture([true, true, false], 'dealer')
  assert.deepEqual(decideDealer(g), { type: 'shoot', target: 'player' })
})
t('IA : plus de blanches -> se tire dessus', () => {
  const g = fixture([false, false, true], 'dealer')
  assert.deepEqual(decideDealer(g), { type: 'shoot', target: 'dealer' })
})
t('IA : utilise sa loupe puis agit sur balle connue', () => {
  const g = fixture([false, true], 'dealer'); g.inventory.dealer = ['loupe']
  assert.deepEqual(decideDealer(g), { type: 'item', index: 0 })
  const s = useItem(g, 'dealer', 0)
  assert.deepEqual(decideDealer(s), { type: 'shoot', target: 'dealer' })
})

t('IA niveau 1 : scie même sur balle incertaine ; niveau 2 : seulement sur balle sûre', () => {
  const g1 = fixture([true, true, false], 'dealer', 1); g1.inventory.dealer = ['saw']
  assert.deepEqual(decideDealer(g1), { type: 'item', index: 0 })
  const g2 = fixture([true, true, false], 'dealer', 2); g2.inventory.dealer = ['saw']
  assert.deepEqual(decideDealer(g2), { type: 'shoot', target: 'player' })
  g2.known.dealer = true
  assert.deepEqual(decideDealer(g2), { type: 'item', index: 0 })
  g2.hp.player = 1 // scie gaspillée sur un joueur à 1 PV
  assert.deepEqual(decideDealer(g2), { type: 'shoot', target: 'player' })
})
t('IA niveau 3 : à 1 PV, tire sur le joueur plutôt que sur lui-même si le risque dépasse 1/3, ou éjecte la balle', () => {
  const g = fixture([true, false, false], 'dealer', 3); g.hp.dealer = 1 // 1 réelle / 3 : 33 %
  assert.deepEqual(decideDealer(g), { type: 'shoot', target: 'dealer' }) // sous le seuil : il se tire dessus
  const h = fixture([true, true, false, false, false], 'dealer', 3); h.hp.dealer = 1 // 40 %
  assert.deepEqual(decideDealer(h), { type: 'shoot', target: 'player' })
  h.inventory.dealer = ['beer']
  assert.deepEqual(decideDealer(h), { type: 'item', index: 0 })
  const l2 = fixture([true, true, false, false, false], 'dealer', 2); l2.hp.dealer = 1
  assert.deepEqual(decideDealer(l2), { type: 'shoot', target: 'dealer' }) // niveau 2 : inchangé
})

// Invariants : parties aléatoires jusqu'à la fin
t('2000 parties aléatoires terminent, invariants respectés', () => {
  let seed = 42
  setRng(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32))
  for (let i = 0; i < 2000; i++) {
    let g = createGame(3)
    for (let step = 0; step < 1000 && g.phase === 'playing'; step++) {
      const live = g.chamber.filter(Boolean).length
      assert.equal(g.remaining.live, live)
      assert.equal(g.remaining.blank, g.chamber.length - live)
      assert.ok(g.chamber.length > 0)
      assert.ok(g.inventory.player.length <= 8 && g.inventory.dealer.length <= 8)
      const who = g.turn
      const inv = g.inventory[who]
      const r = Math.random()
      g = r < 0.3 && inv.length ? useItem(g, who, 0) : shoot(g, who, Math.random() < 0.5 ? 'player' : 'dealer')
      seed ^= 1
    }
    assert.equal(g.phase, 'gameOver')
  }
  resetRng()
})

console.log(`\n${n} tests OK`)
