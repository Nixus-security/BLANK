import { Material, Mesh, Object3D } from 'three'
import { lowRes } from './config'

/**
 * Vertex jitter PS1 : les sommets sont accrochés à la grille de pixels basse résolution après
 * projection. Quand la caméra ou un objet bouge, les polygones "tremblent" d'un pixel à l'autre.
 */
function patch(mat: Material) {
  if (mat.userData.ps1) return
  mat.userData.ps1 = true
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    shader.uniforms.uJitterRes = lowRes
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uJitterRes;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec2 g = uJitterRes * 0.5;
          gl_Position.xy = ((floor(gl_Position.xy / gl_Position.w * g) + 0.5) / g) * gl_Position.w;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'ps1'
  mat.needsUpdate = true
}

export function applyPS1(root: Object3D) {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach(patch)
  })
}
