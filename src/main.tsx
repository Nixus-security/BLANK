import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GameScene } from './three/GameScene'
import { useGameStore } from './store/gameStore'
import { useStageStore } from './store/stageStore'
import { Overlay } from './ui/Overlay'
import { installFullscreen } from './ui/touch'
import { fx } from './three/fx'
import { kickStats, musicBeat } from './three/audio'
import { installKeys, installSound } from './three/director'
import './index.css'

// Console : window.game.getState().playerShoot('dealer')
;(window as unknown as { game: typeof useGameStore }).game = useGameStore

;(window as unknown as { stage: typeof useStageStore }).stage = useStageStore

;(window as unknown as { fx: typeof fx }).fx = fx

;Object.assign(window, { kickStats, musicBeat })

installKeys()
installSound()
installFullscreen()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="relative h-[100dvh] w-screen bg-black">
      <GameScene />
      <Overlay />
    </div>
  </StrictMode>,
)
