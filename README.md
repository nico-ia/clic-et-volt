© 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés.

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
- L'onglet **Appareillages**, à droite, regroupe les prises 16 A (orange), les prises 20 A classiques (cyan), les prises 20 A plan de travail (rouge), les prises dédiées 20 A (violet) et 32 A (violet foncé), les interrupteurs (vert ; sur le plan, ils prennent la couleur du circuit de l'appareil qu'ils pilotent), les plafonniers (jaune), les spots, les variateurs (gradateurs), les DAAF, les minuteries et détecteurs de mouvement, les prises commandées, les sonnettes (bouton et sonnerie) et les volets roulants (commande et moteur), avec leur icône.
- Les deux colonnes latérales (gauche et droite) ont la même largeur de base, 340 px. Elles se redimensionnent à la souris, et la largeur mémorisée dans le navigateur est stockée sous la clé `clic_and_volt_sidebars_v4`.
- Les textes des boutons passent à la ligne entre les mots. Les libellés des onglets restent sur une seule ligne et ne sont jamais coupés au milieu d'un mot. Sous 1200 px de large, l'en-tête s'affiche sur deux lignes.

### Plans et niveaux

- Dessin et édition des murs, ouvertures (portes, fenêtres, trémies et escaliers).
- Paramètres par défaut des murs (épaisseur et hauteur des nouveaux murs) : le panneau n'apparaît que pendant le tracé d'un mur, et il se masque dès qu'un élément ou un mur est sélectionné.
- Refus des murs superposés : un tracé qui se confond avec un mur existant n'est pas créé, et une notification « Mur déjà existant à cet endroit : tracé refusé » s'affiche. Le même contrôle s'applique en 2D et en 3D.
- Alertes de superposition (avertissements, sans blocage) : portes et fenêtres qui se chevauchent, sur le même mur ou au coin de deux murs ; trémies qui chevauchent une ouverture, un mur, un appareil ou une autre trémie, y compris une ouverture d'un autre niveau relié ; escaliers qui se chevauchent entre eux ; trémies qui se chevauchent entre elles sur un niveau commun. Ces alertes apparaissent dans le panneau Alertes et les éléments concernés sont signalés.
- Placement des tableaux électriques, prises, interrupteurs, luminaires et boîtes de dérivation.
- Niveaux avec nom, cote et hauteur sous plafond ; ajout d'étages et de sous-sols.
- Copie possible des murs extérieurs lors de la création d'un niveau et affichage fantôme de tous les autres niveaux en 3D (murs transparents de couleur grise, sans interaction).
- Vues 2D et 3D, avec sélection et réglage des appareils en 3D.
- Réglage des curseurs au pas près : chaque curseur a deux flèches « ▲ » et « ▼ » à sa droite (maintenir enfoncé pour répéter). Un geste reste une seule étape d'annulation. La hauteur d'un appareil ou d'une trémie se règle en 3D ; la 2D affiche un rappel à la place.

### Circuits et câblage

- Circuits configurables (calibre, section, nombre maximal de points et mode de câblage), affichés avec leur couleur.
- Couleurs : chaque circuit a une couleur propre, différente de celle des autres circuits (les teintes d'une même famille, éclairage, prises 16 A, prises 20 A, etc., peuvent être proches). Un circuit supplémentaire créé automatiquement prend une nuance de sa famille si elle est libre, sinon une autre couleur libre.
- Nombre maximal de points par circuit (NF C 15-100) : éclairage 8 points (10 A, 1,5 mm²) ; sonnerie 8 points (10 A, 1,5 mm²) ; DAAF 8 points (10 A, 1,5 mm²) ; volets roulants (moteurs et commandes) 8 points (10 A, 1,5 mm²) ; prises 16 A 8 points (2,5 mm²) ; prises 20 A classiques 12 points (2,5 mm²) ; prises 20 A plan de travail 6 points (2,5 mm²) ; prises dédiées 1 appareil par circuit.
- Câblage et cheminement calculés automatiquement à partir du plan, des appareils et des trémies.
- En 3D, pendant le déplacement d'un appareil ou d'un mur, les câbles gardent leur tracé d'origine pour garder la vue fluide ; ils sont recalculés au relâchement de la souris.
- Associations entre interrupteurs et luminaires. Un interrupteur peut commander des luminaires situés sur un autre circuit : le câble de commande part alors du circuit de l'interrupteur jusqu'à celui du luminaire. Les luminaires ne sont pas déplacés d'un circuit à l'autre.
- Quand un circuit atteint son nombre maximal de points, un circuit supplémentaire est créé automatiquement pour les points suivants.
- Prise dédiée : une prise par appareil (lave-linge, lave-vaisselle, sèche-linge, four, plaque de cuisson, chauffe-eau, climatisation, autre). Deux types : prise 20A dédiée (2,5 mm²) et prise 32A dédiée (6 mm²), chacun sur son circuit dédié. L'appareil alimenté est choisi dans l'inspecteur. Le métré les compte à part (« Prise 20A dédiée » et « Prise 32A dédiée »).
- Prise 20 A classique : prise de 20 A sur le circuit « Prises 20A » (12 points max, 2,5 mm²).
- Prise 20 A plan de travail : prise de 20 A sur le circuit « Prises 20A plan de travail » (6 points max, 2,5 mm²), qui n'est pas réservé à la cuisine.
- Prise commandée 16A : elle est coupée ou rétablie par un interrupteur, comme un luminaire (circuit des prises). Son interrupteur et le câble de commande qui les relie prennent la couleur du circuit de la prise (orange sur le circuit des prises 16 A), et non le jaune. Une alerte signale chaque prise commandée qui n'est reliée à aucune commande.
- Sonnette : le bouton de sonnette fait sonner la sonnerie. Simplification : le bouton est en réalité en très basse tension (via un transformateur) ; ici il est relié à la sonnerie comme un interrupteur, et la sonnerie est sur son propre circuit « Sonnerie 10A ».
- Volet roulant : la commande fait monter ou descendre le moteur, alimentés par leur propre circuit « Volets 10A ». Simplification : un vrai moteur de volet demande plusieurs fils (environ 5) ; ils ne sont pas représentés.
- Cheminement par circuit (carte du circuit dans l'onglet Circuits) : deux modes. « Auto » (défaut) suit les murs, bas ou haut, au plus court selon portes et fenêtres. Si une pièce fermée ou un mur isolé n'est pas relié au tableau (pas de mur commun), l'app le signale par une alerte qui demande « Faux plafond » ou « Sous plancher » ; le choix est mémorisé par circuit et se change ensuite sur la carte du circuit (rangée « Cavité »). « Faux plafond / Sous plancher » trace des lignes droites dans le faux plafond (10 cm au-dessus du plafond) ou sous le sol (10 cm sous le sol), sans suivre les murs. Un interrupteur posé sur un mur donne accès au sous-plancher de chaque côté de ce mur. Un plafonnier posé au-dessus d'un mur est signalé « à déplacer » (il ne descend jamais droit au sol). Un circuit qui n'a pas de chemin vers le tableau clignote en rouge, avec son bouton de cheminement, et le compteur global d'alertes pointe vers lui (une alerte par niveau concerné ; le clic change d'étage si besoin) ; la piste est de déplacer l'appareil concerné ou d'ajouter une trémie. Chaque suite automatique (ex. « _x2 ») a son propre réglage, qui n'est pas hérité du circuit d'origine.
- Affichage des câbles activable ou masquable sans les supprimer du projet.

### Métré, contrôles et sorties

- Quantitatif de l'appareillage, des gaines, des câbles et des boîtes de dérivation.
- Longueurs de câble par circuit, chute de tension et alertes avec pistes de correction.
- Export du métré en CSV ; impression ou enregistrement en PDF du métré et des plans.
- Impression du plan 2D avec une légende des appareillages présents (symboles réels de l'application, nombre par appareil, prises double/triple/quadruple représentées côte à côte) : colonne à droite en paysage, bandeau en bas en portrait. La légende n'apparaît que dans l'impression. L'aperçu affiche le plan sur une feuille A4 avec des marges de 10 mm.
- Prises multiples en 2D : les prises double, triple et quadruple (écart de 13 cm) sont entourées d'un seul liseré de la couleur de leur appareil, et leur numéro 16 A ou 20 A est affiché en dehors du symbole. Une cinquième prise sur un groupe de quatre fait clignoter l'appareil en rouge et affiche une alerte de surcharge.
- Interrupteurs groupés en 2D : deux interrupteurs posés côte à côte (même mur, même côté, même hauteur) forment un double, entouré d'un seul liseré, même si leurs lumières sont sur des circuits différents. Un troisième interrupteur sur le même groupe est refusé à la pose.
- Câbles en 2D : les traits de câble s'arrêtent au bord des symboles d'appareillage pour ne pas les masquer.
- Couleur des appareils en 2D et en 3D : chaque appareil prend la couleur de son circuit, comme les prises (plafonnier sur le circuit éclairage, sonnerie sur le circuit sonnerie, moteur de volet sur le circuit volets, etc.). Une commande (interrupteur, bouton de sonnette, commande de volet) prend la couleur du circuit de la charge qu'elle pilote, ou celle du circuit par défaut de cette charge si elle n'est pas encore reliée. La légende suit la même règle.
- Liseré de circuit : les prises, luminaires et autres points de circuit ont en permanence un liseré de la couleur de leur circuit. La sonnerie et le moteur de volet n'en ont pas au repos, et les commandes non plus. Quand un circuit est sélectionné, le liseré de chacun de ses appareils clignote ; un appareil qui n'en a pas au repos reçoit alors un liseré qui clignote, le temps de la sélection.
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
