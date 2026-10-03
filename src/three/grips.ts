import { Vector3 } from 'three'

/** Points de saisie du fusil de table en coordonnées monde, mis à jour chaque frame par Shotgun. */
export const gunGrips = {
  right: new Vector3(), // poignée / détente
  left: new Vector3(), // pompe
  chamber: new Vector3(), // culasse (là où la balle est éjectée, où la loupe se pose)
  saw: new Vector3(), // endroit du canon que scie la scie
  muzzle: new Vector3(), // bouche du canon
  axis: new Vector3(1, 0, 0), // direction du canon (unitaire)
}
