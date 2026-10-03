/** Appareil tactile (téléphone, tablette) : pointeur principal grossier, pas de souris. */
export const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Simule l'appui d'une touche (Échap...) : les boutons tactiles réutilisent les raccourcis clavier. */
export const pressKey = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }))

/** Plein écran + verrouillage en paysage (Android ; iOS Safari ne le permet pas : échec ignoré). */
export function goFullscreen() {
  if (!isTouch || document.fullscreenElement) return
  const el = document.documentElement
  void Promise.resolve(el.requestFullscreen?.({ navigationUI: 'hide' }))
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {})
}
