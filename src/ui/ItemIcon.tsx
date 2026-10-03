import type { ReactNode } from 'react'
import type { ItemId } from '../game/types'

/**
 * Illustrations des objets (viewBox 64 × 64), dessinées au trait comme des gravures : contours en `currentColor`
 * (la couleur du bouton, qui rougit au survol), détails remplis en rouge sang / rouille / bleu (balle à blanc).
 */
const BLOOD = 'var(--color-blood)'
const RUST = 'var(--color-rust)'
const BLANK = '#3f7fc4'

const ICONS: Record<ItemId, ReactNode> = {
  // canette froissée : taille pincée, bandeau rouge, languette, plis
  beer: (
    <>
      <path d="M21 15 L43 15 L45 24 L41 33 L44 42 L42 52 L22 52 L20 42 L23 33 L19 24 Z" fill="rgba(0,0,0,0.5)" />
      <path d="M19.6 25 L44.4 25 L43.4 31 L40.8 33 L22.2 33 L20.6 31 Z" fill={BLOOD} stroke="none" opacity="0.85" />
      <ellipse cx="32" cy="15" rx="11" ry="3" />
      <circle cx="35" cy="14.4" r="1.8" />
      <path d="M24 38 L30 40 M36 36 L41 39 M25 46 L33 45" strokeWidth="1.5" />
      <path d="M23 10 L26 15 M41 10 L38 15" strokeWidth="1.4" />
    </>
  ),
  // loupe : verre, reflet, manche
  loupe: (
    <>
      <circle cx="27" cy="26" r="16" fill="rgba(216,208,184,0.08)" />
      <circle cx="27" cy="26" r="12" strokeWidth="1.2" />
      <path d="M18 22 A10 10 0 0 1 26 16" strokeWidth="2.4" opacity="0.8" />
      <path d="M39 38 L54 54" strokeWidth="6" strokeLinecap="round" />
      <path d="M39 38 L54 54" strokeWidth="3" strokeLinecap="round" stroke={RUST} />
    </>
  ),
  // paquet de cigarettes + une cigarette qui se consume
  cigarette: (
    <>
      <rect x="10" y="24" width="28" height="32" rx="2" fill="rgba(0,0,0,0.5)" />
      <path d="M10 32 L38 32" />
      <path d="M16 24 L16 17 M24 24 L24 14 M32 24 L32 18" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M24 40 L30 46 L24 52 L18 46 Z" fill={BLOOD} stroke="none" opacity="0.9" />
      <path d="M36 56 L58 34" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M52 40 L58 34" strokeWidth="4.5" strokeLinecap="round" stroke={BLOOD} />
      <path d="M56 28 C54 24 58 22 56 18" strokeWidth="1.3" opacity="0.6" />
    </>
  ),
  // scie à métaux : poignée, arc, lame dentée
  saw: (
    <>
      <rect x="6" y="27" width="11" height="17" rx="3" fill="rgba(0,0,0,0.5)" />
      <path d="M17 29 L17 22 L56 22 L56 44 L17 44" />
      <path d="M17 44 L56 44" strokeWidth="2.6" />
      <path d="M19 44 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5" fill="currentColor" strokeWidth="1" />
      <path d="M10 33 L14 33 M10 38 L14 38" strokeWidth="1.3" stroke={RUST} />
      <circle cx="56" cy="22" r="2" fill={RUST} stroke="none" />
    </>
  ),
  // menottes : deux bracelets ouverts, chaîne
  handcuffs: (
    <>
      <path d="M13 24 A12 12 0 1 0 25 24" strokeWidth="3.4" />
      <path d="M39 24 A12 12 0 1 0 51 24" strokeWidth="3.4" />
      <rect x="10" y="17" width="18" height="8" rx="2" fill="rgba(0,0,0,0.6)" />
      <rect x="36" y="17" width="18" height="8" rx="2" fill="rgba(0,0,0,0.6)" />
      <circle cx="19" cy="21" r="1.4" fill={BLOOD} stroke="none" />
      <circle cx="45" cy="21" r="1.4" fill={BLOOD} stroke="none" />
      <ellipse cx="28" cy="21" rx="3.4" ry="2" strokeWidth="1.8" />
      <ellipse cx="32" cy="21" rx="3.4" ry="2" strokeWidth="1.8" />
      <ellipse cx="36" cy="21" rx="3.4" ry="2" strokeWidth="1.8" />
    </>
  ),
  // boîte de pilules + gélule
  pills: (
    <>
      <rect x="14" y="22" width="24" height="34" rx="3" fill="rgba(0,0,0,0.5)" />
      <rect x="12" y="13" width="28" height="9" rx="2" />
      <path d="M17 29 L35 29 L35 45 L17 45 Z" strokeWidth="1.3" />
      <path d="M26 33 L26 41 M22 37 L30 37" strokeWidth="2" stroke={BLOOD} />
      <g transform="rotate(-38 49 48)">
        <rect x="40" y="43" width="20" height="10" rx="5" fill="rgba(0,0,0,0.5)" />
        <path d="M50 43 L50 53 L45 53 A5 5 0 0 1 45 43 Z" fill={BLOOD} stroke="none" opacity="0.9" />
        <rect x="40" y="43" width="20" height="10" rx="5" />
      </g>
    </>
  ),
  // seringue d'adrénaline : corps gradué, liquide, piston, aiguille
  adrenaline: (
    <g transform="rotate(-42 32 32)">
      <rect x="16" y="26" width="28" height="12" rx="2" fill="rgba(0,0,0,0.5)" />
      <rect x="17.5" y="27.5" width="16" height="9" fill={BLOOD} stroke="none" opacity="0.85" />
      <path d="M26 26 L26 29 M31 26 L31 30 M36 26 L36 29 M41 26 L41 30" strokeWidth="1.2" />
      <path d="M44 32 L56 32" strokeWidth="2.6" />
      <rect x="56" y="25" width="3.4" height="14" rx="1" fill="currentColor" />
      <path d="M12 29 L16 29 L16 35 L12 35 Z" />
      <path d="M12 32 L2 32" strokeWidth="1.6" />
      <path d="M16 24 L16 40" strokeWidth="3" />
    </g>
  ),
  // inverseur : boîtier, flèches inversées, voyants rouge (réelle) / bleu (à blanc)
  inverter: (
    <>
      <rect x="10" y="18" width="44" height="30" rx="3" fill="rgba(0,0,0,0.5)" />
      <path d="M22 25 L22 38 M18 34 L22 38 L26 34" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M42 41 L42 28 M38 32 L42 28 L46 32" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="53" r="3" fill={BLOOD} stroke="none" />
      <circle cx="42" cy="53" r="3" fill={BLANK} stroke="none" />
      <path d="M29 14 L29 18 M35 14 L35 18" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 33 L34 33" strokeWidth="1.4" strokeDasharray="1.5 2" />
    </>
  ),
}

/** Illustration d'un objet, à la couleur du texte courant (taille donnée par le parent). */
export function ItemIcon({ id, className }: { id: ItemId; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[id]}
    </svg>
  )
}
