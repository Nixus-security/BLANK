// Partie console : joueur = heuristique simple, croupier = IA. `npm run sim`
import { useGameStore } from '../src/store/gameStore'
import { ITEMS } from '../src/game/items'

const st = () => useGameStore.getState()
st().newGame(3)
let printed = 0
const flush = () => {
  const log = st().game.log
  for (; printed < log.length; printed++) console.log(log[printed])
}

const hud = () => {
  const g = st().game
  console.log(`  [PV joueur ${g.hp.player} | croupier ${g.hp.dealer} | restant ${g.remaining.live}R/${g.remaining.blank}B | objets ${g.inventory.player.map((i) => ITEMS[i].label).join(',') || '-'}]`)
}

for (let i = 0; i < 500 && st().game.phase === 'playing'; i++) {
  flush()
  const g = st().game
  hud()
  if (g.turn === 'dealer') {
    st().playDealerTurn()
    continue
  }
  // joueur : soin, loupe, puis proba
  const heal = g.inventory.player.findIndex((id) => id === 'cigarette' && ITEMS.cigarette.canUse(g, 'player'))
  if (heal >= 0) { st().playerUseItem(heal); continue }
  const loupe = g.inventory.player.findIndex((id) => id === 'loupe' && ITEMS.loupe.canUse(g, 'player'))
  if (loupe >= 0) { st().playerUseItem(loupe); continue }
  const k = g.known.player
  const pLive = g.remaining.live / (g.remaining.live + g.remaining.blank)
  const self = k !== null ? k === false : pLive < 0.5
  st().playerShoot(self ? 'player' : 'dealer')
}
flush()
console.log(`\nGagnant : ${st().game.winner}`)
