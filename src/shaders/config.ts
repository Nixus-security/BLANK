import { Vector2 } from 'three'

/** Hauteur de la grille "basse résolution" (PS1 ≈ 240 lignes). La largeur suit l'aspect de l'écran. */
export const LOW_RES_HEIGHT = 240

/** Résolution basse partagée entre le vertex jitter et l'effet plein écran (mise à jour par RetroEffect.setSize). */
export const lowRes = { value: new Vector2(427, LOW_RES_HEIGHT) }
