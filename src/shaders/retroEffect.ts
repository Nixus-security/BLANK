import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2, Vector3 } from 'three'
import { LOW_RES_HEIGHT, lowRes } from './config'

/**
 * Passe unique : pixelation (grille basse résolution) + courbure CRT + aberration chromatique
 * + scanlines + grain + tramage de Bayer avec quantification de palette + vignette + étalonnage.
 * Tout est dans un seul shader pour que courbure -> grille -> échantillonnage restent cohérents.
 */
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec2 uRes;
uniform float uCurve;
uniform float uCA;
uniform float uScan;
uniform float uGrain;
uniform float uLevels;
uniform float uDither;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uTransT;
uniform float uImpactT;
uniform vec2 uImpactCenter;
uniform vec3 uImpactColor;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Matrice de Bayer 4x4, valeurs dans [0,1)
float bayer4(vec2 p) {
  vec2 q = mod(p, 4.0);
  float x = q.x, y = q.y;
  float a = mod(x, 2.0), b = mod(y, 2.0);
  float lo = 2.0 * a + 3.0 * b - 4.0 * a * b;          // bayer 2x2 de (x mod 2, y mod 2)
  float hi = 2.0 * step(2.0, x) + 3.0 * step(2.0, y) - 4.0 * step(2.0, x) * step(2.0, y);
  return (lo * 4.0 + hi + 0.5) / 16.0;
}

vec3 sampleCell(vec2 uv) {
  return texture2D(inputBuffer, (floor(uv * uRes) + 0.5) / uRes).rgb;
}

// flou radial vers le centre de l'impact
vec3 sampleZoom(vec2 uv, vec2 c, float k) {
  vec3 a = vec3(0.0);
  for (int i = 0; i < 6; i++) a += sampleCell(uv + (c - uv) * k * float(i) / 5.0);
  return a / 6.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // --- courbure CRT (le coin est rogné : bord d'écran arrondi) ---
  vec2 p = uv * 2.0 - 1.0;
  float c = 1.0 / (1.0 + uCurve);
  p *= c;
  vec2 s = p * (1.0 + uCurve * dot(p, p));

  // --- transition titre -> partie : extinction CRT (l'image s'écrase en ligne puis en point),
  //     puis allumage (point -> ligne -> image), le tout avec un halo blanc ---
  float lineMask = 0.0;
  float tw = 1.0;
  if (uTransT >= 0.0) {
    float T = uTransT;
    float wx = 1.0;
    float wy = 1.0;
    if (T < 0.55) { float k = T / 0.55; wy = 1.0 - 0.996 * k * k * k; }
    else if (T < 0.75) { wy = 0.004; wx = 1.0 - smoothstep(0.55, 0.75, T); }
    else if (T < 0.85) { wy = 0.004; wx = 0.0; }
    else if (T < 1.05) { wy = 0.004; wx = smoothstep(0.85, 1.05, T); }
    else { float k = clamp((T - 1.05) / 0.55, 0.0, 1.0); wy = 0.004 + 0.996 * (1.0 - pow(1.0 - k, 3.0)); }
    wx = max(wx, 0.006);
    float thin = 1.0 - smoothstep(0.02, 0.3, wy);
    lineMask = smoothstep(0.004 + 0.03 * wy, 0.0, abs(s.y)) * step(abs(s.x), wx) * thin;
    tw = 1.0 + 2.2 * (1.0 - wy); // surluminosité pendant que l'image est écrasée
    s = s / vec2(wx, wy);
  }
  vec2 suv = s * 0.5 + 0.5;

  // impact frame : la caméra "claque" (zoom qui monte d'une image à l'autre) et tremble d'un demi-écran de pixels
  bool inkPhase = uImpactT >= 0.035 && uImpactT < 0.14;
  if (inkPhase) {
    float k = (uImpactT - 0.035) / 0.105;
    suv = uImpactCenter + (suv - uImpactCenter) / (1.06 + 0.14 * k);
    float fseed = floor(uImpactT * 90.0);
    suv += (vec2(hash(vec3(fseed, 1.0, 2.0)), hash(vec3(fseed, 3.0, 4.0))) - 0.5) * 0.02;
  }
  float inside = step(abs(s.x), 1.0) * step(abs(s.y), 1.0);
  float edge = 1.0 - smoothstep(0.985, 1.0, max(abs(s.x), abs(s.y)));

  // --- aberration chromatique : nulle au centre, très forte sur les bords ---
  vec2 dir = suv - 0.5;
  float d2 = dot(dir, dir);
  vec2 off = dir * uCA * (d2 * 7.0 + 0.08);
  vec3 col;
  // après l'impact frame : flou radial + aberration chromatique gonflée, qui retombent
  float rec = uImpactT > 0.14 ? 1.0 - smoothstep(0.14, 0.55, uImpactT) : 0.0;
  if (rec > 0.002) {
    off *= 1.0 + 6.0 * rec;
    float zk = 0.09 * rec * rec;
    col.r = sampleZoom(suv + off, uImpactCenter, zk).r;
    col.g = sampleZoom(suv, uImpactCenter, zk).g;
    col.b = sampleZoom(suv - off, uImpactCenter, zk).b;
  } else {
    col.r = sampleCell(suv + off).r;
    col.g = sampleCell(suv).g;
    col.b = sampleCell(suv - off).b;
  }

  // --- pixels « préservés » (feuille du contrat) : marqués par un alpha de 0,5 dans le buffer de scène.
  //     Ils sont relus en pleine résolution, sans pixelation, grain, scanlines ni palette réduite. ---
  float keepA = texture2D(inputBuffer, suv).a;
  float keep = (uImpactT < 0.0) ? step(0.25, keepA) * step(keepA, 0.75) : 0.0;
  if (keep > 0.5) col = texture2D(inputBuffer, suv).rgb;

  // --- étalonnage : désaturé, teinte verdâtre/sale, contraste ---
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.72);
  col *= vec3(1.02, 1.0, 0.86);

  // travail en espace d'affichage (sRGB approx) pour quantifier uniformément
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col = (col - 0.5) * 1.12 + 0.5;

  vec2 cell = floor(suv * uRes);

  // --- grain de film (renouvelé ~24 fps) + scintillement ---
  float n = hash(vec3(cell, floor(uTime * 24.0)));
  col += (n - 0.5) * uGrain * (1.0 - keep);
  col *= 1.0 + (0.015 * sin(uTime * 55.0) + 0.02 * (hash(vec3(floor(uTime * 12.0), 3.0, 1.0)) - 0.5)) * (1.0 - keep);

  // --- scanlines : sombres entre chaque ligne de la grille basse-res + bande qui défile ---
  float fr = fract(suv.y * uRes.y);
  float scan = 1.0 - uScan * (0.5 - 0.5 * cos(fr * 6.2831853)) * (1.0 - keep);
  float roll = 0.5 + 0.5 * sin(suv.y * 3.0 - uTime * 0.7);
  col *= scan * (1.0 - 0.06 * roll * roll * (1.0 - keep));

  // --- vignette ---
  float v = smoothstep(1.3, 0.35, length(s));
  col *= mix(1.0, v, uVignette);

  // --- impact frame (style manga) ---
  // 0) blanc pur  1) encre : silhouettes noires, contours, trame de points, lignes de vitesse effilées
  // 2) même image en négatif  3) encre, zoom plus fort  puis 4) retombée teintée avec flou radial
  if (uImpactT >= 0.0) {
    if (uImpactT < 0.035) {
      col = vec3(1.0);
    } else if (uImpactT < 0.14) {
      float frame = floor((uImpactT - 0.035) / 0.035); // 0, 1, 2
      float fseed = floor(uImpactT * 60.0);
      vec2 d = suv - uImpactCenter;
      d.x *= uRes.x / uRes.y;
      float r = length(d);
      float ang = atan(d.y, d.x);

      float lum = dot(col, vec3(0.299, 0.587, 0.114));

      // silhouettes : tout ce qui est éclairé passe en noir
      float ink = step(0.2, lum);
      // trame (screentone) à 45° dans les demi-teintes : la pénombre devient une rangée de points
      vec2 gp = suv * uRes;
      vec2 rg = vec2(gp.x + gp.y, gp.x - gp.y) * 0.7071;
      vec2 cellUv = fract(rg / 2.6) - 0.5;
      float dotR = 0.55 * (1.0 - smoothstep(0.03, 0.2, lum));
      float tone = (1.0 - ink) * step(length(cellUv), dotR) * step(0.04, lum);
      // contours : gradient de luminance sur 4 voisins (encre épaisse d'une cellule)
      vec2 px = 1.0 / uRes;
      float l1 = dot(sampleCell(suv + vec2(px.x, 0.0)), vec3(0.299, 0.587, 0.114));
      float l2 = dot(sampleCell(suv - vec2(px.x, 0.0)), vec3(0.299, 0.587, 0.114));
      float l3 = dot(sampleCell(suv + vec2(0.0, px.y)), vec3(0.299, 0.587, 0.114));
      float l4 = dot(sampleCell(suv - vec2(0.0, px.y)), vec3(0.299, 0.587, 0.114));
      float edge = step(0.06, abs(l1 - l2) + abs(l3 - l4));

      // lignes de vitesse : secteurs de largeur/longueur aléatoires, fines près du centre, larges au bord
      const float SECT = 72.0;
      float sid = floor(ang / 6.2831853 * SECT);
      float sf = fract(ang / 6.2831853 * SECT) - 0.5;
      float rnd = hash(vec3(sid, fseed, 5.0));
      float start = 0.07 + 0.33 * hash(vec3(sid, fseed, 9.0));
      float half_ = (0.05 + 0.6 * (r - start)) * step(start, r);
      float lines = step(0.42, rnd) * step(abs(sf), clamp(half_, 0.0, 0.5));

      float black = max(max(ink, tone), max(edge, lines));
      float v = 1.0 - black;
      // noyau blanc à l'origine du choc qui se contracte
      float core = 1.0 - smoothstep(0.02, 0.07 - 0.02 * frame, r);
      v = max(v, core);
      // image 2 : négatif
      if (mod(frame, 2.0) == 1.0) v = 1.0 - v;
      col = vec3(v);
    } else {
      col = mix(col, uImpactColor, 0.5 * rec * rec);
    }
  }

  // --- flash (tir, dégât) ---
  col = mix(col, uFlashColor, uFlash);

  // --- tramage ordonné + palette réduite ---
  float th = bayer4(cell) - 0.5;
  vec3 quant = floor(clamp(col, 0.0, 1.0) * (uLevels - 1.0) + 0.5 + th * uDither) / (uLevels - 1.0);
  col = mix(quant, clamp(col, 0.0, 1.0), keep);

  col = pow(clamp(col, 0.0, 1.0), vec3(2.2)); // retour linéaire : la conversion sRGB finale est faite par le composer
  outputColor = vec4(col * tw * inside * edge + vec3(lineMask), 1.0);
}
`

export interface RetroOptions {
  curve?: number
  chromaticAberration?: number
  scanlines?: number
  grain?: number
  levels?: number
  dither?: number
  vignette?: number
}

export class RetroEffect extends Effect {
  constructor({ curve = 0.16, chromaticAberration = 0.014, scanlines = 0.32, grain = 0.09, levels = 12, dither = 1, vignette = 0.6 }: RetroOptions = {}) {
    super('RetroEffect', fragmentShader, {
      // CONVOLUTION : autorise l'échantillonnage libre de inputBuffer (courbure, CA, pixelation)
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uRes', lowRes as Uniform<Vector2>],
        ['uCurve', new Uniform(curve)],
        ['uCA', new Uniform(chromaticAberration)],
        ['uScan', new Uniform(scanlines)],
        ['uGrain', new Uniform(grain)],
        ['uLevels', new Uniform(levels)],
        ['uDither', new Uniform(dither)],
        ['uVignette', new Uniform(vignette)],
        ['uFlash', new Uniform(0)],
        ['uTransT', new Uniform(-1)],
        ['uImpactT', new Uniform(-1)],
        ['uImpactCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uImpactColor', new Uniform(new Vector3(1, 1, 1))],
        ['uFlashColor', new Uniform(new Vector3(1, 1, 1))],
      ]),
    })
  }

  private aspect = 16 / 9
  private lowHeight = LOW_RES_HEIGHT

  setSize(width: number, height: number) {
    this.aspect = width / Math.max(height, 1)
    this.applyLowRes()
  }

  /** Hauteur de la grille basse résolution (240 = PS1 ; plus haut = image plus fine, texte lisible). */
  setLowResHeight(h: number) {
    if (h === this.lowHeight) return
    this.lowHeight = h
    this.applyLowRes()
  }

  private applyLowRes() {
    lowRes.value.set(Math.round(this.lowHeight * this.aspect), this.lowHeight)
  }

  setFlash(amount: number, [r, g, b]: readonly [number, number, number]) {
    this.uniforms.get('uFlash')!.value = amount
    ;(this.uniforms.get('uFlashColor')!.value as Vector3).set(r, g, b)
  }

  /** t = secondes depuis le clic sur JOUER (<0 : pas de transition). */
  setTransition(t: number) {
    this.uniforms.get('uTransT')!.value = t
  }

  /** t = secondes depuis le tir (<0 : inactif), centre en UV, couleur d'accent. */
  setImpact(t: number, [cx, cy]: readonly [number, number], [r, g, b]: readonly [number, number, number]) {
    this.uniforms.get('uImpactT')!.value = t
    ;(this.uniforms.get('uImpactCenter')!.value as Vector2).set(cx, cy)
    ;(this.uniforms.get('uImpactColor')!.value as Vector3).set(r, g, b)
  }

  update(_renderer: unknown, _inputBuffer: unknown, deltaTime: number) {
    const t = this.uniforms.get('uTime')!
    t.value += deltaTime
  }
}
