# Clic & Volt

Clic & Volt est une application web de dessin de plans électriques. Elle permet de dessiner un logement en 2D, de le visualiser et de poser des appareils en 3D, puis de générer automatiquement le câblage, le métré et des contrôles indicatifs.

## Démarrer

Ouvrir `index.html` dans un navigateur récent. Aucun serveur ni processus de compilation n'est nécessaire. Une connexion internet est requise pour charger Tailwind CSS, Three.js, Font Awesome et Vercel Web Analytics depuis leurs CDN.

Le projet ne contient pas de configuration de build ni de suite de tests automatisés. Les vérifications de l'interface et du rendu 3D se font dans le navigateur.

## Utiliser l'application

1. Dans **Plan 2D**, dessiner les murs et placer les ouvertures et les appareils.
2. Ajouter des étages ou un sous-sol si nécessaire, puis relier les niveaux avec une trémie.
3. Régler les circuits et les associations entre interrupteurs et luminaires.
4. Passer en **Plan 3D** pour inspecter le bâtiment, poser ou déplacer des appareils et régler leurs hauteurs.
5. Consulter **Métré & Contrôles** pour le quantitatif, les longueurs de câble et les alertes.

Le bouton **Guide** ouvre le guide pas à pas intégré (Plan 2D, Plan 3D, Métré & contrôles). Les pages qui s'y prêtent ont un bouton **Essayer** : il ferme le guide, ouvre la vue ou l'onglet correspondant, sélectionne l'outil et met en évidence le contrôle à utiliser.

Les actions de confirmation et de saisie utilisent une fenêtre de dialogue intégrée à l'application. Entrée valide une saisie et Échap l'annule.

## Fonctionnalités

### Plans et niveaux

- Dessin et édition des murs, ouvertures (portes, fenêtres, trémies et escaliers).
- Placement des tableaux électriques, prises, interrupteurs, luminaires et boîtes de dérivation.
- Niveaux avec nom, cote et hauteur sous plafond ; ajout d'étages et de sous-sols.
- Copie possible des murs extérieurs lors de la création d'un niveau et affichage fantôme des niveaux voisins.
- Vues 2D et 3D, avec sélection et réglage des appareils en 3D.

### Circuits et câblage

- Circuits configurables (calibre, section, nombre maximal de points et mode de câblage), affichés avec leur couleur.
- Câblage et cheminement calculés automatiquement à partir du plan, des appareils et des trémies.
- Associations entre interrupteurs et luminaires.
- Affichage des câbles activable ou masquable sans les supprimer du projet.

### Métré, contrôles et sorties

- Quantitatif de l'appareillage, des gaines, des câbles et des boîtes de dérivation.
- Longueurs de câble par circuit, chute de tension et alertes avec pistes de correction.
- Export du métré en CSV ; impression ou enregistrement en PDF du métré et des plans.
- Enregistrement d'un projet en JSON et réouverture d'un fichier JSON.
- Sauvegarde automatique dans le navigateur et proposition de restauration au démarrage.
- Annulation et rétablissement des modifications.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+Z` | Annuler |
| `Ctrl+Y` ou `Ctrl+Maj+Z` | Rétablir |
| `Suppr` | Supprimer la sélection |
| `Ctrl+D` | Dupliquer |
| `Échap` | Arrêter le tracé ou le placement |
| `?` | Ouvrir l'aide et les raccourcis |
| Flèches gauche/droite dans le guide | Page précédente/suivante |

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface, barre d'outils, vues et panneaux de l'application. |
| `style.css` | Styles généraux, thèmes, panneaux, tableaux et impression. |
| `guide.css` | Styles du guide intégré et de ses animations. |
| `js/canvas2d.js` | Dessin, rendu et interactions du plan 2D. |
| `js/scene3d.js` | Scène Three.js, rendu 3D, interactions et calcul du câblage. |
| `js/dialog.js` | Fenêtres intégrées de confirmation et de saisie. |
| `js/app.js` | État du projet, outils, circuits, métré, sauvegarde et initialisation. |
| `js/guide.js` | Pages, animations et actions « Essayer » du guide. |

Les scripts JavaScript sont chargés comme scripts classiques (non modules), dans l'ordre `canvas2d.js`, `scene3d.js`, `dialog.js`, `app.js`, puis `guide.js`. Ils partagent l'état global déclaré par `app.js`. L'initialisation de l'application se fait au chargement du document.

## Données du projet

L'objet `projectData` contient les données enregistrées et exportées en JSON, notamment :

- `levels` : niveaux avec leur identifiant, leur nom, leur cote et leur hauteur sous plafond ;
- `walls`, `openings`, `electrical` : murs, ouvertures et appareils, associés à un niveau ;
- `shafts`, `stairs` : trémies et escaliers reliant des niveaux ;
- `circuits` : circuits, réglages et modes de câblage ;
- `annotations` : annotations du plan.

Le niveau affiché (`activeLevelId`) et l'état de l'interface ne font pas partie du fichier JSON. Un projet rouvert s'affiche sur le RDC.

## Limites

- Les contrôles et quantités calculés sont indicatifs. Ils ne remplacent pas la vérification du projet par un électricien ni la validation des règles applicables, notamment NF C 15-100.
- La montée verticale est prise en compte dans le métré ; elle ne se représente pas comme un segment horizontal en 2D.
- Une trémie relie directement les niveaux qu'elle dessert ; les liaisons en chaîne entre trémies ne sont pas prises en charge.
- Le point de dérivation d'une trémie reste associé à son mur ; sa hauteur se règle en 3D.
- Le rendu et les interactions 3D nécessitent un navigateur avec WebGL.
