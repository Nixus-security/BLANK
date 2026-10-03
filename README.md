# BLANK

Jeu d'horreur en 3D (Three.js / React Three Fiber) : une roulette au fusil à pompe contre un croupier, rendu PS1/CRT.
Jouable au clavier/souris et sur mobile en paysage.

## Développement

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # règles du jeu
npm run build   # génère dist/
```

## Déploiement (Cloudflare Pages)

Site 100 % statique, aucun serveur.

**Depuis GitHub** : Cloudflare → Workers & Pages → Create → Pages → Connect to Git, puis :

- Build command : `npm run build`
- Build output directory : `dist`
- Variable d'environnement : `NODE_VERSION` = `22`

**En ligne de commande** :

```bash
npm run build
npx wrangler pages deploy dist --project-name blank
```
