let rng: () => number = Math.random

export const random = () => rng()
/** Injecte un RNG déterministe (tests). */
export const setRng = (fn: () => number) => {
  rng = fn
}
export const resetRng = () => {
  rng = Math.random
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
