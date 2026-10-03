import { useRef } from 'react'
import { useTr } from '../i18n'
import { audioLive, unlockAudio } from '../three/audio'
import { useSoundStore } from '../store/soundStore'

/** Coupe-son global, discret dans un coin. Raccourci : M. */
export function SoundButton() {
  const tr = useTr()
  const muted = useSoundStore((s) => s.muted)
  const toggle = useSoundStore((s) => s.toggle)
  // la musique était-elle audible quand le doigt a touché le bouton ? (relevé avant que le geste ne débloque l'audio)
  const wasSilent = useRef<boolean | null>(null)
  return (
    <button
      onPointerDown={() => {
        wasSilent.current = !audioLive()
      }}
      onClick={() => {
        const silent = wasSilent.current ?? !audioLive()
        wasSilent.current = null
        // premier appui alors que rien ne joue encore : le joueur veut du son, pas le couper
        if (silent && !muted) unlockAudio()
        else toggle()
      }}
      title={tr('Couper / remettre le son (M)', 'Mute / unmute (M)')}
      aria-pressed={muted}
      className="pointer-events-auto p-1 text-bone/45 transition hover:text-bone"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M2 7h4l5-4v14l-5-4H2z" />
        {muted ? (
          <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="2" fill="none" />
        ) : (
          <path d="M14 6q3 4 0 8M16 4q5 6 0 12" stroke="currentColor" strokeWidth="1.6" fill="none" />
        )}
      </svg>
    </button>
  )
}
