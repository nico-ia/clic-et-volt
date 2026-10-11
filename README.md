# Clic & Volt

Application web de plan électrique : plan 2D, modélisation 3D, câblage automatique par circuit et métré. Elle sert à dessiner un logement, à y placer l'appareillage (prises, interrupteurs, luminaires, tableau, boîtes de dérivation), à répartir les appareils sur des circuits, puis à obtenir le câblage, les longueurs et le quantitatif.

## Lancer l'application

Ouvrir `index.html` dans un navigateur récent. Une connexion internet est nécessaire pour charger Tailwind CSS, Three.js et Font Awesome depuis les CDN.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique : barre du haut (niveaux, annulation, sauvegarde), vue 2D (boîte à outils à gauche, placement et circuits à droite), vue 3D (inspection à gauche, placement et circuits à droite), vue métré et contrôles. |
| `style.css` | Thème clair et sombre, barres de défilement, sidebars repliables et redimensionnables, tableaux du métré, règles d'impression. |
| `canvas2d.js` | Plan 2D : zoom, déplacement et rotation de la vue, souris, dessin des murs, ouvertures, appareils, trémies et câbles, placement et sélection. |
| `scene3d.js` | Scène 3D (Three.js) : caméra, murs, ouvertures, appareils, trémies et boîtes de dérivation, calcul du câblage (gaines, descentes, montées entre niveaux), sélection et glissement en 3D, surbrillance des circuits. |
| `app.js` | Cœur de l'application : état (`projectData`), annulation et rétablissement, niveaux, circuits et leurs réglages, métré et alertes, export CSV, impression, inspecteurs, sauvegarde automatique, import et export JSON, aide. |

Les trois scripts sont chargés en classique, dans l'ordre `canvas2d.js`, `scene3d.js`, `app.js`. Ils partagent le même espace global : c'est `app.js` qui déclare l'état, et les deux autres fichiers l'utilisent. L'initialisation se fait au `DOMContentLoaded`.

## Fonctionnalités

**Plan et niveaux**
- Murs, ouvertures (portes, fenêtres), appareils et trémies, en 2D comme en 3D.
- Nombre illimité de niveaux, sous-sol inclus. Chaque élément a son niveau. Le niveau affiché est choisi dans la barre du haut.
- Trémies : carrées, taille réglable, reliées à un autre niveau. Chaque étage relié a son point de dérivation sur la trémie.

**Câblage**
- Un tableau par projet, au RDC. Un étage sans tableau est alimenté par la trémie qui le relie au tableau.
- Circuits : calibre, section, nombre d'éléments, mode de câblage (chaîné ou étoile). Chaque circuit a une couleur et une surbrillance.
- Commandes : un interrupteur peut commander un luminaire, y compris à un autre niveau (trémie entre les deux).
- Boîtes de dérivation posées librement : elles prennent part au câblage de leur circuit quand des appareils s'y raccordent.

**Métré et contrôles**
- Longueur de câble par circuit, montée verticale comptée par niveau, chute de tension.
- Quantitatif (appareillage, gaines, câbles par section, boîtes de dérivation).
- Alertes par niveau (« Sous-sol : … »), chacune avec une piste de correction.
- Export CSV, impression et enregistrement du plan (2D et 3D) en image.

**Divers**
- Annulation et rétablissement (Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z).
- Sauvegarde automatique dans le navigateur, import et export JSON.
- Raccourcis : Suppr (supprimer la sélection), Ctrl+D (dupliquer), Échap (arrêter le tracé ou le placement), `?` (aide).

## Données

L'état est un objet `projectData` :
- `levels` : `{ id, name, elevation, ceilingHeight }` ; le RDC est à 0 par défaut.
- `walls`, `openings`, `electrical` : chacun porte un `levelId`.
- `shafts` : `{ id, levelId, levelIds, wallId, distanceFromStart, size, derivHeight }`.
- `circuits` : `{ id, name, breakerRating, wireSection, maxPoints, wiringMode }`.

Le niveau affiché (`activeLevelId`) n'est pas enregistré : un fichier se rouvre toujours sur le RDC.

## Tests

Le câblage peut être vérifié hors navigateur, en chargeant les trois scripts dans un contexte Node avec un DOM et Three.js factices. Les tests de référence reprennent un projet d'un seul niveau dont le métré et les segments de gaine sont enregistrés. Ils ne vérifient pas le rendu 3D ni les clics : ceux-ci se testent dans le navigateur.

## Limites connues

- La montée verticale est comptée dans le métré, mais n'est pas tracée en 2D (elle est verticale) ; en 3D, son tracé n'apparaît que sur le niveau affiché.
- Une trémie relie directement les niveaux qu'elle dessert : pas de liaison en chaîne par deux trémies.
- Le point de dérivation d'une trémie reste sur son mur ; ses réglages sont en 3D seulement.
- Les règles de pose (NF C 15-100 : conduits, séparation des circuits, nombre de boîtes) ne sont pas encodées et doivent être validées par un électricien.
- La 3D ne se teste pas sans navigateur.
