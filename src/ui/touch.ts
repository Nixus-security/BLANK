/** Appareil tactile (téléphone, tablette) : pointeur principal grossier, pas de souris. */
export const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Simule l'appui d'une touche (Échap...) : les boutons tactiles réutilisent les raccourcis clavier. */
export const pressKey = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }))

type LockApi = { keyboard?: { lock?: (keys: string[]) => Promise<void> }; }

/**
 * Plein écran. Les navigateurs l'interdisent sans geste de l'utilisateur : on l'appelle depuis un clic / un toucher.
 * Sur mobile, verrouille aussi le paysage (Android ; iOS Safari ne permet ni l'un ni l'autre : échec ignoré).
 * Sur ordinateur, réserve Échap au jeu (reposer le fusil) : le plein écran se quitte alors par un appui long.
 */
export function goFullscreen() {
  if (typeof document === 'undefined' || document.fullscreenElement || !document.fullscreenEnabled) return
  void Promise.resolve(document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }))
    .then(() => {
      if (isTouch) return (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')
      return (navigator as unknown as LockApi).keyboard?.lock?.(['Escape'])
    })
    .catch(() => {})
}

/** Plein écran dès le premier clic / toucher sur la page. */
export function installFullscreen() {
  const once = () => {
    window.removeEventListener('click', once)
    window.removeEventListener('touchend', once)
    goFullscreen()
  }
  window.addEventListener('click', once)
  window.addEventListener('touchend', once)
}
