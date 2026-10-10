# Clic & Volt

Application web de plan 2D et de modélisation 3D avec câblage électrique automatique, contrôles par circuit et métré. Ouvrir `index.html` dans un navigateur (connexion internet requise pour Tailwind, Three.js et Font Awesome via CDN).

## Structure du projet

| Fichier | Rôle |
|---|---|
| [`index.html`](./index.html) | Page unique : structure HTML (barre d'outils, vues 2D / 3D / métré, panneaux) et inclusion des scripts. Ne contient plus de code JavaScript en ligne. |
| [`style.css`](./style.css) | Styles personnalisés : thème clair, barres de défilement, tableaux de métré, sidebars repliables et redimensionnables, règles d'impression. |
| [`js/canvas2d.js`](./js/canvas2d.js) | Plan 2D : initialisation du canvas, zoom, déplacement et rotation de la vue, gestion de la souris, dessin des murs, des appareils et des câbles, placement et déplacement des éléments. |
| [`js/scene3d.js`](./js/scene3d.js) | Scène 3D (Three.js) : caméra, maillages des murs, ouvertures et appareils, calcul et rendu du câblage automatique (gaines), sélection et déplacement en 3D, surbrillances des circuits et collisions. |
| [`js/app.js`](./js/app.js) | Cœur de l'application : état global (`projectData`, undo/redo), initialisation au `DOMContentLoaded`, thème, sidebars, circuits, métré, export CSV, impression, inspecteurs d'éléments, sauvegarde automatique et import/export JSON. |

## Ordre de chargement

Les scripts sont des scripts classiques avec `defer`, chargés dans cet ordre :

1. `js/canvas2d.js`
2. `js/scene3d.js`
3. `js/app.js`

Ils partagent le même espace global : l'état (`projectData`, `zoom`, `panX`, `panY`, `threeScene`, etc.) est déclaré dans `app.js` et utilisé par les deux autres fichiers. L'application démarre au `DOMContentLoaded`, une fois tous les scripts chargés.
