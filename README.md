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

Le bouton **Guide** ouvre le guide pas à pas intégré (Plan 2D, Vue 3D et câblage, Métré & contrôles). Les pages qui s'y prêtent ont un bouton **Essayer** : il ferme le guide, ouvre la vue ou l'onglet correspondant, sélectionne l'outil et met en évidence le contrôle à utiliser.

Les actions de confirmation et de saisie utilisent une fenêtre de dialogue intégrée à l'application. Entrée valide une saisie et Échap l'annule.

## Fonctionnalités

### Interface

- Le bloc **Mode d'interaction**, à gauche, est identique en 2D et en 3D. Il comporte trois lignes : le mode actif ; **Désélection** (orange) et **Supprimer la sélection** (rouge) ; **Tracer mur** et **Sélectionner**. Ses boutons s'adaptent à la largeur du panneau.
- **Désélection** retire la sélection en cours (appareil, ouverture, mur, circuit mis en évidence ou liaison en 3D). Pendant un placement, il arrête le placement. Aucun message n'est affiché pour une mise en évidence à retirer.
- L'onglet **Appareillages**, à droite, regroupe les prises 16 A (orange), les prises 20 A classiques (cyan), les prises 20 A plan de travail (rouge), les prises dédiées 20 A (violet) et 32 A (violet foncé), les interrupteurs (vert), les plafonniers (jaune), les spots, les variateurs (gradateurs), les DAAF, les minuteries et détecteurs de mouvement, les prises commandées, les sonnettes (bouton et sonnerie) et les volets roulants (commande et moteur), avec leur icône.
- Les textes des boutons passent à la ligne entre les mots. Les libellés des onglets restent sur une seule ligne et ne sont jamais coupés au milieu d'un mot. Sous 1200 px de large, l'en-tête s'affiche sur deux lignes.

### Plans et niveaux

- Dessin et édition des murs, ouvertures (portes, fenêtres, trémies et escaliers).
- Paramètres par défaut des murs (épaisseur et hauteur des nouveaux murs) : le panneau n'apparaît que pendant le tracé d'un mur, et il se masque dès qu'un élément ou un mur est sélectionné.
- Refus des murs superposés : un tracé qui se confond avec un mur existant n'est pas créé, et une notification « Mur déjà existant à cet endroit : tracé refusé » s'affiche. Le même contrôle s'applique en 2D et en 3D.
- Alertes de superposition (avertissements, sans blocage) : portes et fenêtres qui se chevauchent, sur le même mur ou au coin de deux murs ; trémies qui chevauchent une ouverture, un mur, un appareil ou une autre trémie, y compris une ouverture d'un autre niveau relié ; escaliers qui se chevauchent entre eux ; trémies qui se chevauchent entre elles sur un niveau commun. Ces alertes apparaissent dans le panneau Alertes et les éléments concernés sont signalés.
- Placement des tableaux électriques, sous-tableaux, prises, interrupteurs, luminaires et boîtes de dérivation.
- Niveaux avec nom, cote et hauteur sous plafond ; ajout d'étages et de sous-sols.
- Copie possible des murs extérieurs lors de la création d'un niveau et affichage fantôme de tous les autres niveaux en 3D (murs transparents de couleur grise, sans interaction).
- Vues 2D et 3D, avec sélection et réglage des appareils en 3D.
- Réglage des curseurs au pas près : chaque curseur a des boutons « − » et « + » (maintenir enfoncé pour répéter). Un geste reste une seule étape d'annulation. La hauteur d'un appareil ou d'une trémie se règle en 3D ; la 2D affiche un rappel à la place.

### Circuits et câblage

- Circuits configurables (calibre, section, nombre maximal de points et mode de câblage), affichés avec leur couleur.
- Couleurs par famille : les circuits d'une même famille (éclairage, prises 16 A, prises 20 A, etc.) gardent la teinte de leur famille, avec de légères variations de nuance. Un circuit supplémentaire créé automatiquement reprend donc la couleur de son circuit d'origine.
- Nombre maximal de points par circuit (NF C 15-100) : éclairage 8 points (10 A, 1,5 mm²) ; prises 16 A 8 points (2,5 mm²) ; prises 20 A classiques 12 points (2,5 mm²) ; prises 20 A plan de travail 6 points (2,5 mm²) ; prises dédiées 1 appareil par circuit. Les survols (plan et boutons de l'onglet Appareillages) affichent ce maximum.
- Câblage et cheminement calculés automatiquement à partir du plan, des appareils et des trémies.
- En 3D, pendant le déplacement d'un appareil ou d'un mur, les câbles gardent leur tracé d'origine pour garder la vue fluide ; ils sont recalculés au relâchement de la souris.
- Associations entre interrupteurs et luminaires. Un interrupteur peut commander des luminaires situés sur un autre circuit : le câble de commande part alors du circuit de l'interrupteur jusqu'à celui du luminaire. Les luminaires ne sont pas déplacés d'un circuit à l'autre.
- Quand un circuit atteint son nombre maximal de points, un circuit supplémentaire est créé automatiquement pour les points suivants.
- Prise dédiée : une prise par appareil (lave-linge, lave-vaisselle, sèche-linge, four, plaque de cuisson, chauffe-eau, climatisation, autre). Deux types : prise 20A dédiée (2,5 mm²) et prise 32A dédiée (6 mm²), chacun sur son circuit dédié. L'appareil alimenté est choisi dans l'inspecteur. Le métré les compte à part (« Prise 20A dédiée » et « Prise 32A dédiée »).
- Prise 20 A classique : prise de 20 A sur le circuit « Prises 20A » (12 points max, 2,5 mm²).
- Prise 20 A plan de travail : prise de 20 A sur le circuit « Prises 20A plan de travail » (6 points max, 2,5 mm²), qui n'est pas réservé à la cuisine.
- Prise commandée : elle est coupée ou rétablie par un interrupteur, comme un luminaire (circuit des prises).
- Sonnette : le bouton de sonnette fait sonner la sonnerie. Simplification : le bouton est en réalité en très basse tension (via un transformateur) ; ici il est relié à la sonnerie comme un interrupteur, et la sonnerie est sur le circuit d'éclairage.
- Volet roulant : la commande fait monter ou descendre le moteur, alimenté par le circuit des prises. Simplification : un vrai moteur de volet demande plusieurs fils (environ 5) ; ils ne sont pas représentés.
- Si une pièce fermée n'est pas reliée au tableau (pas de mur commun), l'alerte propose soit un mur commun, soit « Autoriser le passage » : le câble traverse alors au plafond l'espace entre les pièces, sans limite de distance entre elles. Ce choix est mémorisé dans le projet ; le bouton « Autoriser le passage » est aussi disponible dans l'onglet Appareillages, et « Retirer l'autorisation » annule le choix (panneau Avertissements ou onglet Appareillages).
- Sous-tableau pour une pièce séparée : il est alimenté par un câble tracé automatiquement depuis le tableau principal, puis alimente les appareils de sa pièce. Ce câble d'alimentation n'est pas compté dans le métrage d'un circuit : il a sa propre ligne dans les quantités (« Liaison tableau → sous-tableau », 3G6 mm² pour un disjoncteur de tête de 32 A). Il est listé dans les circuits (« Câble entre tableaux ») et masqué par défaut ; il apparaît en fuchsia quand on le sélectionne, et en violet quand un circuit est sélectionné. Sur la carte du circuit sélectionné, le bouton ⇄ le retire de l'affichage de ce circuit (et le remet). Ce câble a sa propre chute de tension : une alerte apparaît au-delà de 5 %.
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
| `T` / `S` | Tracer un mur / Sélectionner |
| `Suppr` | Supprimer la sélection |
| `Ctrl+D` | Dupliquer |
| `Échap` | Arrêter le tracé ou le placement ; sans cela, désélectionner |
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
- Une trémie ou un escalier relie l'étage affiché aux niveaux cochés à la création (un seul, plusieurs, ou tous ; l'étage affiché est toujours inclus) ; les liaisons en chaîne entre trémies ne sont pas prises en charge.
- Les niveaux reliés d'une trémie existante se modifient en la sélectionnant (section « Niveaux reliés » du panneau) : cocher ajoute un niveau, décocher le retire. Le niveau d'origine reste fixe, un niveau ne peut être relié que s'il a un mur à la même position, et une trémie relie au moins deux niveaux.
- Le point de dérivation d'une trémie reste associé à son mur ; sa hauteur se règle en 3D.
- Le rendu et les interactions 3D nécessitent un navigateur avec WebGL.
