// Guide intégré à Clic & Volt (parties 1 à 3 : Plan 2D, Plan 3D, Métré & contrôles).
// Les symboles des animations sont ceux de l'appli : mêmes formes et mêmes couleurs que les boutons
// de la colonne de droite et que le plan (canvas2d.js, drawElementSymbol2D).
// Script autonome : à charger après app.js.
(function () {
    'use strict';

    // ---------- Symboles de l'appli (repère local : mur à gauche, face avant vers +x) ----------
    // sym(corps, x, y, rotation, échelle) : pose le symbole à (x, y) dans la vue de l'animation
    const sym = (body, x, y, rot = 0, s = 1) =>
        `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${body}</g>`;

    const S = {
        // colonne de droite : tableau électrique (bandeau et éclair cyan)
        panel: `<rect x="-1" y="-18" width="11" height="36" fill="#f8fafc" stroke="#06b6d4" stroke-width="1.6"/>
                <path d="M-1,-6 H10 M-1,6 H10" stroke="#06b6d4" stroke-width="0.9"/>
                <polygon class="g-bolt" points="3,-4 7.5,-0.5 5,-0.5 7.5,4 2.5,0.5 5,0.5" fill="#06b6d4"/>`,
        // boîte de dérivation (carré clair, croix)
        junction: `<rect x="-6" y="-6" width="12" height="12" fill="#f8fafc" stroke="#64748b" stroke-width="1.6"/>
                   <path d="M-4,0 H4 M0,-4 V4" stroke="#0f172a" stroke-width="0.9"/>`,
        // prise 16 A (orange) : demi-disque, broche de terre
        outlet16: `<path d="M-1,-6 V6" stroke="#f97316" stroke-width="1.2"/>
                   <path d="M-1,-4.5 A4.5,4.5 0 0 1 -1,4.5 Z" fill="#f8fafc" stroke="#f97316" stroke-width="1.3"/>
                   <path d="M3.5,0 H8.5 M8.5,-3.5 V3.5" stroke="#f97316" stroke-width="1.1"/>`,
        // prise 20 A (rouge) : deux alvéoles
        outlet20: `<path d="M-1,-6 V6" stroke="#ef4444" stroke-width="1.2"/>
                   <path d="M-1,-4.5 A4.5,4.5 0 0 1 -1,4.5 Z" fill="#f8fafc" stroke="#ef4444" stroke-width="1.3"/>
                   <path d="M3.5,0 H8.5 M8.5,-3.5 V3.5 M6,-3 V3" stroke="#ef4444" stroke-width="1.1"/>`,
        // interrupteur simple (vert)
        switchSimple: `<path d="M-1,0 H5" stroke="#10b981" stroke-width="1.2"/>
                       <circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="#10b981" stroke-width="1.2"/>
                       <path d="M8.5,0 L12.7,-4.2" stroke="#10b981" stroke-width="1.1"/>
                       <circle cx="12.7" cy="-4.2" r="1" fill="#10b981"/>`,
        // va-et-vient (vert clair)
        switchVaEtVient: `<path d="M-1,0 H5" stroke="#22c55e" stroke-width="1.2"/>
                          <circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="#22c55e" stroke-width="1.2"/>
                          <path d="M8.5,0 L13.5,-4.5 M8.5,0 L13.5,4.5" stroke="#22c55e" stroke-width="1.1"/>
                          <circle cx="13.5" cy="-4.5" r="1" fill="#22c55e"/><circle cx="13.5" cy="4.5" r="1" fill="#22c55e"/>`,
        // bouton poussoir (bleu)
        push: `<path d="M-1,0 H5" stroke="#38bdf8" stroke-width="1.2"/>
               <circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="#38bdf8" stroke-width="1.2"/>
               <circle cx="8.5" cy="0" r="1.2" fill="#38bdf8"/>`,
        // plafonnier (vue de dessus)
        ceiling: `<circle r="10" fill="#fef9c3" stroke="#fde047" stroke-width="1.4"/>
                  <path d="M-6.5,-6.5 L6.5,6.5 M-6.5,6.5 L6.5,-6.5" stroke="#0f172a" stroke-width="1"/>`,
        // applique murale (jaune)
        wallLight: `<rect x="-3" y="-7" width="3" height="14" rx="1" fill="#facc15" stroke="#ca8a04" stroke-width="1"/>
                    <path d="M0,0 H4" stroke="#eab308" stroke-width="1.2"/>
                    <path d="M4,-6 Q15,-5 15,0 Q15,5 4,6 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1"/>`,
        // fenêtre (cyan) : ouverture dans le mur, double trait
        window: `<rect x="-30" y="-4" width="60" height="8" fill="#020617"/>
                 <rect x="-30" y="-4" width="60" height="8" fill="none" stroke="#22d3ee" stroke-width="2"/>
                 <line x1="-30" y1="0" x2="30" y2="0" stroke="#22d3ee" stroke-width="2"/>`,
        // trémie (ambre) : carré en pointillés, point de dérivation
        shaft: `<rect x="-20" y="-20" width="40" height="40" fill="rgba(251,191,36,0.3)" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6 4"/>`
    };

    // ---------- Animations (SVG, animées en CSS) ----------
    const svg = (body) => `<svg class="g-svg" viewBox="0 0 320 180" role="img" aria-hidden="true">${body}</svg>`;

    const animZones = () => svg(`
        <rect class="g-zone z1" x="4" y="4" width="312" height="22" rx="4"/>
        <rect class="g-zone z2" x="4" y="32" width="66" height="144" rx="4"/>
        <rect class="g-zone z3" x="76" y="32" width="168" height="144" rx="4"/>
        <rect class="g-zone z4" x="250" y="32" width="66" height="144" rx="4"/>
        <rect class="g-zone z5" x="84" y="136" width="152" height="32" rx="6"/>
        <text class="g-lbl" x="37" y="110">Outils</text>
        <text class="g-lbl" x="160" y="92">Plan</text>
        <text class="g-lbl" x="283" y="110">Onglets</text>
        <text class="g-lbl" x="160" y="156">Barre du bas</text>
        <text class="g-lbl" x="160" y="18">Barre du haut</text>`);

    const animTrace = () => svg(`
        <path class="g-wall-draw" d="M40 140 L160 140 L160 60 L280 60" fill="none" stroke="#34d399" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="g-pt" cx="40" cy="140" r="5"/>
        <circle class="g-pt g-pt2" cx="160" cy="140" r="5"/>
        <circle class="g-pt g-pt3" cx="280" cy="60" r="5"/>
        <rect x="8" y="150" width="62" height="22" rx="5" fill="#1e293b" stroke="#475569"/>
        <text class="g-lbl" x="39" y="165">Touche T</text>
        <text class="g-lbl" x="200" y="170">Clic, clic, clic droit = fin</text>`);

    const animEdit = () => svg(`
        <rect x="8" y="6" width="150" height="22" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text class="g-lbl" x="83" y="21">Modifier les murs : oui</text>
        <line class="g-erase" x1="60" y1="100" x2="260" y2="100" stroke="#34d399" stroke-width="10" stroke-linecap="round"/>
        <circle class="g-handle" cx="60" cy="100" r="7"/>
        <circle class="g-handle" cx="260" cy="100" r="7"/>
        <rect class="g-key" x="122" y="150" width="76" height="22" rx="5"/>
        <text class="g-lbl" x="160" y="165">Suppr</text>`);

    // Porte : même dessin que le plan. Charnière (pivot) à droite de l'ouverture, comme le réglage par défaut « Gauche » de l'appli
    const animDoor = () => svg(`
        <rect x="40" y="105" width="240" height="10" fill="#334155"/>
        <rect x="130" y="105" width="80" height="10" fill="#0f172a"/>
        <g class="g-door" style="transform-origin:210px 110px">
            <line x1="210" y1="110" x2="130" y2="110" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
        </g>
        <path d="M130 110 A80 80 0 0 1 210 30" fill="none" stroke="#38bdf8" stroke-dasharray="3 4" opacity=".5"/>
        <circle cx="210" cy="110" r="4" fill="#f8fafc"/>
        ${sym(S.window, 260, 110)}
        <text class="g-lbl" x="130" y="165">Porte</text>
        <text class="g-lbl" x="260" y="150">Fenêtre</text>`);

    // Tableau : symbole du plan agrandi, éclair qui clignote (la légende est dans le texte de la page)
    const animPanel = () => svg(`
        <g class="g-pop">${sym(S.panel, 160, 90, 0, 4)}</g>`);

    // Prises, interrupteur, plafonnier : posés sur le mur (face avant vers le bas)
    const animDevices = () => svg(`
        <line x1="20" y1="50" x2="300" y2="50" stroke="#334155" stroke-width="8"/>
        <g class="g-pop p1">${sym(S.outlet16, 60, 52, 90, 3.2)}
            <text class="g-lbl" x="60" y="110">Prise 16 A</text></g>
        <g class="g-pop p2">${sym(S.switchSimple, 150, 52, 90, 3.2)}
            <text class="g-lbl" x="150" y="110">Interrupteur</text></g>
        <g class="g-pop p3">${sym(S.ceiling, 240, 100, 0, 2.2)}
            <text class="g-lbl" x="240" y="150">Plafonnier</text></g>
        <text class="g-lbl" x="160" y="172">Prise : 30 cm du sol · interrupteur : 1,10 m</text>`);

    // Commande : interrupteur sur le mur, câble pointillé jusqu'au plafonnier qui s'allume
    const animControl = () => svg(`
        <line x1="20" y1="30" x2="300" y2="30" stroke="#334155" stroke-width="8"/>
        ${sym(S.switchSimple, 60, 32, 90, 3.2)}
        <path class="g-dash" d="M60 74 L60 120 L216 120" fill="none" stroke="#facc15" stroke-width="3" stroke-dasharray="6 6"/>
        <circle class="g-bulb" cx="240" cy="120" r="22"/>
        ${sym(S.ceiling, 240, 120, 0, 2.2)}
        <text class="g-lbl" x="160" y="172">Le câble de commande relie les deux</text>`);

    const animLevels = () => svg(`
        <rect x="90" y="50" width="140" height="56" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <text class="g-lvl g-lvl-a" x="160" y="86">RDC</text>
        <text class="g-lvl g-lvl-b" x="160" y="86">Sous-sol</text>
        <text class="g-lbl" x="160" y="140">Nom, cote, puis « Créer le niveau »</text>`);

    // Trémie : carré ambre sur les deux niveaux, point de dérivation à chaque étage
    const animShaft = () => svg(`
        <rect x="30" y="30" width="260" height="50" rx="4" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <rect x="30" y="110" width="260" height="50" rx="4" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <text class="g-lbl" x="60" y="48">Étage</text>
        <text class="g-lbl" x="60" y="128">RDC</text>
        <g class="g-shaftpulse">${sym(S.shaft, 160, 90)}</g>
        <circle cx="160" cy="55" r="5" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>
        <circle cx="160" cy="135" r="5" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>
        <text class="g-lbl" x="160" y="175">La trémie relie les deux étages</text>`);

    // Escalier : marches violettes (même couleur que le plan), montée visible
    const animStair = () => svg(`
        <g class="g-stair s1"><rect x="60" y="132" width="50" height="18" fill="#a78bfa"/></g>
        <g class="g-stair s2"><rect x="110" y="114" width="50" height="36" fill="#a78bfa"/></g>
        <g class="g-stair s3"><rect x="160" y="96" width="50" height="54" fill="#a78bfa"/></g>
        <g class="g-stair s4"><rect x="210" y="78" width="50" height="72" fill="#a78bfa"/></g>
        <line x1="50" y1="152" x2="270" y2="152" stroke="#475569"/>
        <text class="g-lbl" x="160" y="30">Montée de l'escalier</text>
        <text class="g-lbl" x="160" y="170">Il relie deux niveaux, comme la trémie</text>`);

    const animAlert = () => svg(`
        <rect x="16" y="26" width="288" height="98" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text x="32" y="48" class="g-warn" style="font-size:11px">▲ Trémie chevauche une porte : à déplacer</text>
        <text class="g-lbl" x="32" y="66" style="text-anchor:start">Déplacez la trémie depuis l'onglet</text>
        <text class="g-lbl" x="32" y="80" style="text-anchor:start">Ouvertures, hors de la porte</text>
        <rect class="g-btnpress" x="222" y="96" width="66" height="18" rx="5"/>
        <text class="g-lbl" x="255" y="109">Aller ↗</text>
        <text class="g-lbl" x="160" y="150">Cliquez « Aller ↗ » : l'élément est sélectionné</text>`);

    // ---------- Partie 2 : vue 3D ----------
    // Vue 3D : barre du haut, boîte à outils et élément sélectionné à gauche, bâtiment au centre, « Placement & contrôles » à droite
    const animZones3d = () => svg(`
        <rect class="g-zone z1" x="4" y="4" width="312" height="22" rx="4"/>
        <rect class="g-zone z2" x="4" y="32" width="80" height="144" rx="4"/>
        <rect class="g-zone z3" x="92" y="32" width="136" height="144" rx="4"/>
        <rect class="g-zone z4" x="236" y="32" width="80" height="144" rx="4"/>
        <rect class="g-zone z5" x="96" y="122" width="124" height="46" rx="6"/>
        <text class="g-lbl" x="160" y="18">Barre du haut</text>
        <text class="g-lbl" x="44" y="110">Outils</text>
        <text class="g-lbl" x="160" y="92">Vue 3D</text>
        <text class="g-lbl" x="276" y="110">Onglets</text>
        <text class="g-lbl" x="158" y="149">Barre du bas</text>`);

    // Rotation : la pièce « tourne » (largeur qui varie), clic gauche / clic droit / molette
    const animOrbit = () => svg(`
        <path class="g-dash" d="M50 96 Q160 0 270 96" fill="none" stroke="#38bdf8" stroke-width="2"/>
        <g class="g-orbit">
            <polygon points="90,50 200,30 250,90 140,110" fill="#0f172a" stroke="#34d399" stroke-width="2.5" stroke-linejoin="round"/>
            <polygon points="90,50 140,110 140,124 90,64" fill="#1e293b" stroke="#34d399" stroke-width="1.5"/>
        </g>
        <rect class="g-key" x="8" y="136" width="96" height="36" rx="6"/>
        <text class="g-lbl" x="56" y="151">Clic gauche</text>
        <text class="g-lbl" x="56" y="165">tourner</text>
        <rect class="g-key" x="112" y="136" width="96" height="36" rx="6" style="animation-delay:1.3s"/>
        <text class="g-lbl" x="160" y="151">Clic droit</text>
        <text class="g-lbl" x="160" y="165">déplacer</text>
        <rect class="g-key" x="216" y="136" width="96" height="36" rx="6" style="animation-delay:2.6s"/>
        <text class="g-lbl" x="264" y="151">Molette</text>
        <text class="g-lbl" x="264" y="165">zoom</text>`);

    // Câblage auto : le fil se trace du tableau jusqu'à l'interrupteur, puis jusqu'à la prise
    const animCablesAuto = () => svg(`
        <line x1="30" y1="40" x2="290" y2="40" stroke="#334155" stroke-width="6"/>
        <path class="g-wall-draw" d="M50 124 V96 H160 V76 H266 V60" fill="none" stroke="#facc15" stroke-width="3" stroke-linejoin="round"/>
        ${sym(S.panel, 50, 124, 0, 1.6)}
        ${sym(S.switchSimple, 160, 52, 90, 1.8)}
        ${sym(S.outlet16, 270, 52, 90, 2.2)}
        <text class="g-lbl" x="50" y="170">Tableau</text>
        <text class="g-lbl" x="160" y="170">Interrupteur</text>
        <text class="g-lbl" x="270" y="170">Prise</text>
        <text class="g-lbl" x="160" y="18">Posé en 2D ou en 3D : le câble se trace seul</text>`);

    // Circuits : trois couleurs (même palette qu'en 2D et dans la liste des circuits)
    const animCircuits = () => svg(`
        <line x1="30" y1="40" x2="290" y2="40" stroke="#334155" stroke-width="6"/>
        ${sym(S.panel, 40, 100, 0, 1.6)}
        <path class="g-circ c1" d="M50 100 H120 V66 H200" fill="none" stroke="#facc15" stroke-width="3"/>
        <path class="g-circ c2" d="M50 100 H160 V130 H270" fill="none" stroke="#f97316" stroke-width="3"/>
        <path class="g-circ c3" d="M50 100 V150 H150" fill="none" stroke="#ef4444" stroke-width="3"/>
        <text class="g-lbl" x="180" y="150" style="text-anchor:start;font-size:10px;fill:#facc15">Éclairage 10A</text>
        <text class="g-lbl" x="180" y="164" style="text-anchor:start;font-size:10px;fill:#f97316">Prises de courant 16A</text>
        <text class="g-lbl" x="180" y="178" style="text-anchor:start;font-size:10px;fill:#ef4444">Spécialisé Cuisine 20A</text>`);

    // Bouton « Câbles » : tuile de la grille « Aides & Commandes » (barre de gauche du plan 2D). ON : câbles visibles, OFF : masqués
    const animCablesToggle = () => svg(`
        <rect x="20" y="10" width="280" height="22" rx="5" fill="#1e293b" stroke="#334155"/>
        <text class="g-lbl" x="160" y="25" style="fill:#e2e8f0">Aides &amp; Commandes</text>
        <rect x="120" y="42" width="80" height="64" rx="10" fill="#1e293b" stroke="#facc15" stroke-width="2"/>
        <text class="g-lbl" x="160" y="66" style="fill:#e2e8f0">Câbles</text>
        <text class="g-lvl g-lvl-a" x="160" y="92" style="font-size:14px">ON</text>
        <text class="g-lvl g-lvl-b" x="160" y="92" style="font-size:14px;fill:#94a3b8">OFF</text>
        <path class="g-cab-on" d="M60 140 H260" fill="none" stroke="#facc15" stroke-width="3"/>
        <path class="g-cab-off" d="M60 140 H260" fill="none" stroke="#facc15" stroke-width="3" stroke-dasharray="2 6"/>
        <text class="g-lbl" x="160" y="170">Dans « Aides &amp; Commandes » (gauche du plan 2D)</text>`);

    // Inspecteur 3D : curseur « Hauteur au sol » qui glisse, libellés réels de l'appli
    const animInspector3d = () => svg(`
        <rect x="40" y="14" width="240" height="110" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
        <text class="g-lbl" x="58" y="36" style="text-anchor:start;fill:#e2e8f0">Réglage de l'appareil</text>
        <text class="g-lbl" x="58" y="66" style="text-anchor:start">Hauteur au sol</text>
        <line x1="58" y1="90" x2="262" y2="90" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
        <circle class="g-slide" cx="68" cy="90" r="8" fill="#34d399"/>
        <text class="g-lbl" x="160" y="144">Distance au départ · Côté du mur</text>
        <text class="g-lbl" x="160" y="160">Basculer de l'autre côté du mur</text>
        <text class="g-lbl" x="160" y="174">Le changement se voit tout de suite en 3D</text>`);

    // Trémie : colonne ambre entre deux étages, boîte blanche de dérivation (réglage « Hauteur au sol » de la trémie)
    const animRiser = () => svg(`
        <rect x="30" y="12" width="260" height="44" rx="4" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <rect x="30" y="100" width="260" height="44" rx="4" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <text class="g-lbl" x="50" y="38" style="text-anchor:start">Étage</text>
        <text class="g-lbl" x="50" y="126" style="text-anchor:start">RDC</text>
        <g class="g-shaftpulse">${sym(S.shaft, 160, 78)}</g>
        <rect x="153" y="27" width="14" height="14" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
        <rect x="153" y="115" width="14" height="14" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
        <text class="g-lbl" x="160" y="164">Une boîte blanche de dérivation par étage relié</text>
        <text class="g-lbl" x="160" y="176">Hauteur par défaut : 1,50 m du sol</text>`);

    // ---------- Partie 3 : métré et contrôles ----------
    // Onglets du haut : le troisième s'allume, puis le tableau apparaît
    const animReport = () => svg(`
        <rect x="20" y="14" width="88" height="26" rx="6" fill="#1e293b" stroke="#475569"/>
        <rect x="116" y="14" width="88" height="26" rx="6" fill="#1e293b" stroke="#475569"/>
        <rect class="g-zone z1" x="212" y="14" width="96" height="26" rx="6"/>
        <text class="g-lbl" x="64" y="31">Plan 2D</text>
        <text class="g-lbl" x="160" y="31">Plan 3D</text>
        <text class="g-lbl" x="260" y="31">Métré &amp; Contrôles</text>
        <rect x="30" y="58" width="260" height="106" rx="6" fill="#0f172a" stroke="#334155"/>
        <line x1="30" y1="82" x2="290" y2="82" stroke="#334155"/>
        <text class="g-lbl" x="56" y="76" style="fill:#e2e8f0;text-anchor:start">Circuit</text>
        <text class="g-lbl" x="210" y="76" style="fill:#e2e8f0">Calibre</text>
        <text class="g-lbl" x="270" y="76" style="fill:#e2e8f0">Points</text>
        <g class="g-row"><text class="g-lbl" x="56" y="104" style="text-anchor:start">Éclairage 10A</text><text class="g-lbl" x="210" y="104">10 A</text><text class="g-lbl" x="270" y="104">6/8</text></g>
        <g class="g-row r2"><text class="g-lbl" x="56" y="130" style="text-anchor:start">Prises de courant 16A</text><text class="g-lbl" x="210" y="130">16 A</text><text class="g-lbl" x="270" y="130">5/8</text></g>
        <g class="g-row r3"><text class="g-lbl" x="56" y="156" style="text-anchor:start">Spécialisé Cuisine 20A</text><text class="g-lbl" x="210" y="156">20 A</text><text class="g-lbl" x="270" y="156">2/12</text></g>`);

    // Métré : les lignes arrivent une à une
    const animBom = () => svg(`
        <text class="g-lbl" x="160" y="11" style="fill:#e2e8f0">Quantitatif</text>
        <rect x="24" y="18" width="272" height="24" rx="4" fill="#1e293b" stroke="#475569"/>
        <text class="g-lbl" x="32" y="34" style="text-anchor:start;fill:#e2e8f0">Catégorie</text>
        <text class="g-lbl" x="140" y="34" style="text-anchor:start;fill:#e2e8f0">Désignation</text>
        <text class="g-lbl" x="288" y="34" style="text-anchor:end;fill:#e2e8f0">Quantité</text>
        <g class="g-row"><text class="g-lbl" x="32" y="66" style="text-anchor:start">Appareillage</text><text class="g-lbl" x="140" y="66" style="text-anchor:start">Prise 16 A</text><text class="g-lbl" x="288" y="66" style="text-anchor:end;fill:#e2e8f0">6</text></g>
        <g class="g-row r2"><text class="g-lbl" x="32" y="96" style="text-anchor:start">Appareillage</text><text class="g-lbl" x="140" y="96" style="text-anchor:start">Interrupteur simple</text><text class="g-lbl" x="288" y="96" style="text-anchor:end;fill:#e2e8f0">4</text></g>
        <g class="g-row r3"><text class="g-lbl" x="32" y="126" style="text-anchor:start">Gaines et câbles</text><text class="g-lbl" x="140" y="126" style="text-anchor:start">Boîte de dérivation</text><text class="g-lbl" x="288" y="126" style="text-anchor:end;fill:#e2e8f0">3</text></g>
        <text class="g-lbl" x="160" y="168">Quantités comptées sur le plan</text>`);

    // Contrôle : section trop fine pour 16 A (avertissement), puis − / + : 2,5 mm² conforme
    const animControls = () => svg(`
        <rect x="40" y="10" width="240" height="146" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
        <text class="g-lbl" x="56" y="34" style="text-anchor:start;fill:#e2e8f0">Prise de courant 16A</text>
        <text class="g-lbl" x="56" y="62" style="text-anchor:start">Section</text>
        <rect x="150" y="50" width="22" height="20" rx="4" fill="#334155"/>
        <text class="g-lbl" x="161" y="64" style="fill:#e2e8f0">−</text>
        <text class="g-lvl g-lvl-a" x="182" y="64" style="font-size:11px;text-anchor:start">1.5 mm²</text>
        <text class="g-lvl g-lvl-b" x="182" y="64" style="font-size:11px;text-anchor:start;fill:#34d399">2.5 mm²</text>
        <rect class="g-btnpress" x="238" y="50" width="22" height="20" rx="4"/>
        <text class="g-lbl" x="249" y="64" style="fill:#e2e8f0">+</text>
        <text class="g-warn g-lvl-a" x="56" y="92" style="text-anchor:start;font-size:11px">▲ section 1.5 mm² trop faible</text>
        <text class="g-warn g-lvl-a" x="56" y="106" style="text-anchor:start;font-size:11px">pour 16 A</text>
        <text class="g-lvl g-lvl-b" x="56" y="96" style="text-anchor:start;font-size:11px;fill:#34d399">✓ Aucune alerte pour 16 A</text>
        <text class="g-lbl" x="56" y="132" style="text-anchor:start">Points : 5/8</text>
        <text class="g-lbl" x="160" y="174">Les contrôles sont indicatifs</text>`);

    // Export : bouton Imprimer et bouton CSV qui s'enfoncent à tour de rôle
    const animExport = () => svg(`
        <rect class="g-key" x="30" y="50" width="120" height="46" rx="8"/>
        <text class="g-lbl" x="90" y="70">Imprimer le métré</text>
        <text class="g-lbl" x="90" y="84">(aperçu, PDF)</text>
        <rect class="g-key" x="170" y="50" width="120" height="46" rx="8" style="animation-delay:1.3s"/>
        <text class="g-lbl" x="230" y="70">Exporter le métré</text>
        <text class="g-lbl" x="230" y="84">(CSV, tableur)</text>
        <text class="g-lbl" x="160" y="140">Imprimer : aperçu avant l'impression</text>
        <text class="g-lbl" x="160" y="156">CSV : ouvrable dans Excel ou LibreOffice</text>`);

    // ---------- Contenu ----------
    const PAGES = [
        { part: 'Plan 2D', title: 'Découvrir l\'écran', anim: animZones,
          text: ['En haut : le niveau (menu), Nouveau, Enregistrer, Ouvrir, Guide.',
                 'À gauche : la boîte à outils (tracer, sélectionner) et « Aides & Commandes ».',
                 'Au centre : le plan. Dans son coin haut-gauche, une bulle d\'aide indique l\'action en cours : la croix (×) la ferme, le bouton « ? » la rouvre.',
                 'À droite : les onglets « Ouvertures », « Appareils », « Circuits », « Alertes ».',
                 'En bas du plan : la barre du bas, avec Annuler, Rétablir, Imprimer, Effacer tout le plan.'],
          retenir: 'Chaque zone a un rôle précis. Échap désélectionne tout.' },
        { part: 'Plan 2D', title: 'Tracer un mur', anim: animTrace,
          text: ['Appuyez sur T, ou cliquez « Tracer mur ».',
                 'Cliquez à un coin, puis au coin suivant. Clic droit ou Échap pour arrêter.',
                 'Le mur s\'accroche aux autres murs : les bouts se rejoignent tout seuls.'],
          essayer: { mode: '2d', tool: 'wall', pulse: '#btn-tool-wall' },
          retenir: 'L\'option Ortho (angle droit) garde les murs bien droits.' },
        { part: 'Plan 2D', title: 'Modifier ou supprimer un mur', anim: animEdit,
          text: ['Activez « Modifier les murs ». Sans cela, un clic ne fait que sélectionner.',
                 'Glissez un bout du mur pour l\'allonger, ou le mur entier pour le déplacer.',
                 'Sélectionnez un ou plusieurs éléments : la barre du haut affiche « Déselection » et « Supprimer la sélection » (rouge). Suppr fait la même chose, après confirmation. Annuler (Ctrl+Z) revient en arrière.'],
          essayer: { mode: '2d', tool: 'select', wallEdit: true, pulse: '#btn-wall-edit' },
          retenir: '« Murs verrouillés » protège tous les murs : ils ne se sélectionnent plus, seuls les autres éléments se sélectionnent et se suppriment.' },
        { part: 'Plan 2D', title: 'Poser une porte ou une fenêtre', anim: animDoor,
          text: ['Ouvrez l\'onglet « Ouvertures » à droite.',
                 'Cliquez « Porte » ou « Fenêtre », puis cliquez près du mur.',
                 'Le côté cliqué est le côté de pose. Deux ouvertures ne peuvent pas se chevaucher.',
                 'Réglage « Charnière (porte poussant) » : Gauche ou Droite, vu depuis le côté où vous êtes. Par défaut, « Gauche » : la charnière est à droite de l\'ouverture, comme dans l\'animation.'],
          essayer: { mode: '2d', tab: 'ouvertures', place: 'door_single', pulse: '#btn-2d-place-door_single' },
          retenir: 'Ne placez jamais une prise ou un interrupteur à l\'emplacement d\'une porte.' },
        { part: 'Plan 2D', title: 'Poser le tableau électrique', anim: animPanel,
          text: ['Ouvrez l\'onglet « Appareils ».',
                 'Cliquez « Tableau » (un seul par projet, au RDC), puis cliquez sur un mur près de l\'entrée.'],
          essayer: { mode: '2d', tab: 'appareillage', place: 'panel', pulse: '#btn-2d-place-panel' },
          retenir: 'Un seul tableau par projet.' },
        { part: 'Plan 2D', title: 'Poser prises, interrupteurs et luminaires', anim: animDevices,
          text: ['Onglet « Appareils » : choisissez l\'appareil.',
                 'Cliquez près d\'un mur. Pour le plafonnier, cliquez au plafond, au milieu de la pièce.',
                 'Des prises posées côte à côte se regroupent (double, triple).'],
          essayer: { mode: '2d', tab: 'appareillage', place: 'outlet_16a', pulse: '#btn-2d-place-outlet_16a' },
          retenir: 'Un interrupteur se place à environ 1,10 m du sol, une prise à 30 cm.' },
        { part: 'Plan 2D', title: 'Relier un interrupteur à son luminaire', anim: animControl,
          text: ['Cliquez sur l\'interrupteur.',
                 'Ouvrez « Modifier les associations », puis cochez le luminaire à commander.'],
          essayer: { mode: '2d', tab: 'appareillage', place: 'switch_simple', pulse: '#btn-2d-place-switch_simple' },
          retenir: 'Un va-et-vient se pose toujours par deux.' },
        { part: 'Plan 2D', title: 'Ajouter un étage ou un sous-sol', anim: animLevels,
          text: ['Cliquez sur [fa-circle-up] pour ajouter un étage, ou sur [fa-circle-down] pour ajouter un sous-sol, dans la barre du haut.',
                 'Donnez un nom et une cote (hauteur par rapport au RDC).',
                 'Cochez « Copier les murs extérieurs » pour reprendre le contour du logement.',
                 'Le menu du haut choisit le niveau affiché. Le bouton [fa-pen] renomme le niveau. Le bouton [fa-up-down] règle la cote et la hauteur sous plafond.'],
          essayer: { mode: '2d', pulse: '#btn-add-level' },
          retenir: 'Chaque élément appartient à un seul niveau.' },
        { part: 'Plan 2D', title: 'Trémie et escalier', anim: animShaft,
          text: ['La trémie (ouverture dans le plancher) se pose sur un mur et relie deux niveaux.',
                 'Choisissez l\'étage à relier, puis cliquez sur le mur.',
                 'L\'escalier relie aussi deux niveaux : posez-le sur le plan, puis réglez sa largeur et sa rotation.'],
          essayer: { mode: '2d', tab: 'ouvertures', place: 'shaft', pulse: '#btn-2d-place-shaft' },
          retenir: 'Les câbles passent par la trémie pour rejoindre l\'autre étage.' },
        { part: 'Plan 2D', title: 'Corriger une alerte', anim: animAlert,
          text: ['Les alertes sont dans l\'onglet « Alertes ».',
                 'Cliquez « Aller ↗ » : l\'élément concerné est sélectionné et son onglet s\'ouvre.',
                 'Suivez la piste de correction écrite sous l\'alerte.'],
          essayer: { mode: '2d', tab: 'avertissements', pulse: '#sidebar-2d-right [data-right-tab="avertissements"]' },
          retenir: 'Une alerte ne bloque rien : elle signale un point à vérifier.' },

        // ----- Partie 2 : Plan 3D -----
        { part: 'Plan 3D', title: 'Découvrir la vue 3D', anim: animZones3d,
          text: ['Cliquez « Plan 3D » en haut. La vue 3D montre le bâtiment en volume (comme une maquette).',
                 'La barre du haut, la boîte à outils et les onglets de droite sont les mêmes qu\'en 2D. Seuls le centre et la barre du bas changent. La bulle d\'aide se ferme et se rouvre comme en 2D.',
                 'À gauche : la boîte à outils, et le réglage de l\'élément sélectionné (ses curseurs et ses boutons).',
                 'Au centre : le bâtiment en 3D. Vous pouvez aussi poser des appareils directement en 3D.',
                 'À droite : les onglets « Ouvertures », « Appareils », « Circuits », « Alertes ».',
                 'En bas de la vue 3D : la barre du bas, avec Imprimer, PNG, Annuler, Rétablir, Effacer tout le plan, Centrer et les vues (Isométrique, Dessus, Face, Profil).'],
          essayer: { mode: '3d' },
          retenir: 'Le plan 2D reste la référence : c\'est là qu\'on dessine les murs et qu\'on pose les appareils.' },
        { part: 'Plan 3D', title: 'Tourner, zoomer, déplacer', anim: animOrbit,
          text: ['Clic gauche maintenu : tourner autour du bâtiment (orbite, rotation autour d\'un point).',
                 'Clic droit maintenu : déplacer la vue (panoramique, glisser la vue sans la tourner).',
                 'Molette de la souris : zoom avant ou arrière.',
                 'Si la vue est vide, tracez d\'abord quelques murs en 2D.'],
          essayer: { mode: '3d', pulse: '#three-container' },
          retenir: 'Si vous êtes perdu, faites un zoom arrière avec la molette.' },
        { part: 'Plan 3D', title: 'Le câblage automatique', anim: animCablesAuto,
          text: ['Vous ne dessinez pas les câbles : l\'appli les trace toute seule entre le tableau et chaque appareil.',
                 'Un appareil posé en 2D ou en 3D reçoit son câble automatiquement.',
                 'Le câble suit les murs et passe par les trémies (ouvertures dans le plancher) pour rejoindre l\'autre étage.'],
          retenir: 'Pas besoin de tracer les câbles : vérifiez seulement la place des appareils.' },
        { part: 'Plan 3D', title: 'Les circuits en couleur', anim: animCircuits,
          text: ['Un circuit est un groupe d\'appareils protégés par le même disjoncteur (coupe-circuit automatique).',
                 'Chaque circuit a sa couleur. Cette couleur est la même en 2D, en 3D et dans la liste des circuits.',
                 'Par défaut, l\'éclairage est jaune, les prises orange et la cuisine rouge.'],
          essayer: { mode: '3d', tab: 'circuits', pulse: '#sidebar-3d-right [data-right-tab="circuits"]' },
          retenir: 'Deux circuits de même couleur ? Vérifiez le nom du circuit dans la liste.' },
        { part: 'Plan 3D', title: 'Afficher ou masquer les câbles', anim: animCablesToggle,
          text: ['Le bouton « Câbles » est dans « Aides & Commandes » (barre de gauche du plan 2D). Il affiche ou masque les câbles, en 2D et en 3D.',
                 'Quand les câbles sont masqués, le bâtiment reste visible : pratique pour repérer les pièces et les appareils.'],
          essayer: { mode: '2d', pulse: '#btn-cables-2d' },
          retenir: 'Masquer les câbles ne les supprime pas : ils restent dans le projet.' },
        { part: 'Plan 3D', title: 'Régler un appareil en 3D', anim: animInspector3d,
          text: ['Cliquez un appareil en 3D : il est sélectionné et son réglage s\'affiche à gauche.',
                 'Le curseur « Hauteur au sol » règle la hauteur. « Distance au départ » le déplace le long du mur.',
                 '« Basculer de l\'autre côté du mur » le place de l\'autre côté. Pour une porte, « Charnière (porte poussant) » indique le côté où elle pivote.'],
          essayer: { mode: '3d', tab: 'appareillage', place3d: 'outlet_16a', pulse: '#btn-place-outlet_16a' },
          retenir: 'Hauteurs usuelles : prise à 30 cm du sol, interrupteur à 1,10 m.' },
        { part: 'Plan 3D', title: 'Escalier en 3D', anim: animStair,
          text: ['L\'escalier posé en 2D apparaît en 3D : vous voyez sa montée d\'un étage à l\'autre.',
                 'Sélectionnez-le pour régler sa largeur et sa rotation (son orientation).'],
          essayer: { mode: '2d', tab: 'ouvertures', place: 'stair', pulse: '#btn-2d-place-stair' },
          retenir: 'Vérifiez la largeur de l\'escalier et le passage libre en haut et en bas.' },
        { part: 'Plan 3D', title: 'Trémie et point de dérivation', anim: animRiser,
          text: ['La trémie (ouverture dans le plancher) laisse passer les câbles entre les étages.',
                 'La boîte blanche de dérivation (boîte où se rejoignent les câbles) est placée à 1,50 m du sol par défaut, à chaque étage relié.',
                 'Pour la changer, sélectionnez la trémie et réglez « Hauteur au sol ».'],
          essayer: { mode: '2d', tab: 'ouvertures', place: 'shaft', pulse: '#btn-2d-place-shaft' },
          retenir: 'La boîte de dérivation se règle depuis la trémie, pas depuis la boîte.' },

        // ----- Partie 3 : Métré & contrôles -----
        { part: 'Métré & contrôles', title: 'Découvrir l\'onglet', anim: animReport,
          text: ['Cliquez « Métré & Contrôles » en haut. L\'écran affiche des tableaux prêts à lire.',
                 'Le tableau « Quantitatif » se remplit tout seul à partir du plan. Le tableau « Circuits » a 7 colonnes (Circuit, Calibre, Section, Points, Câble, ΔU, Contrôle) ; l\'animation n\'en montre que 3.',
                 'Les contrôles vérifient chaque circuit : nombre de points, section des fils, chute de tension ΔU (perte de tension le long du câble).'],
          retenir: 'Le métré se met à jour dès que vous changez le plan.' },
        { part: 'Métré & contrôles', title: 'Lire le métré', anim: animBom,
          text: ['Le tableau « Quantitatif » compte les éléments par catégorie : Ouvertures, Appareillage, Gaines et câbles.',
                 'Chaque ligne donne une désignation, une quantité et une unité.',
                 'Les boîtes de dérivation sont dans « Gaines et câbles ». Les longueurs de câble sont données avec 10 % de marge.'],
          retenir: 'Le métré sert à préparer le devis et la liste d\'achat.' },
        { part: 'Métré & contrôles', title: 'Contrôles par circuit', anim: animControls,
          text: ['Chaque circuit a un calibre (intensité du disjoncteur : 10, 16, 20 ou 32 A), une section (épaisseur du fil : 1,5, 2,5 ou 6 mm²) et un nombre de points maximum.',
                 'Avec − et +, changez ces valeurs. Pour 16 A, il faut au moins 2,5 mm² : un fil plus fin est signalé par une alerte.',
                 'Points max (NF C 15-100) : 8 pour l\'éclairage et les prises, 12 pour la cuisine. Au-delà, l\'appli crée un circuit supplémentaire.',
                 'La chute de tension doit rester sous 3 % pour l\'éclairage et sous 5 % pour le reste.'],
          retenir: 'Les contrôles sont indicatifs : faites-les valider par un électricien.' },
        { part: 'Métré & contrôles', title: 'Imprimer et exporter', anim: animExport,
          text: ['« Imprimer le métré » ouvre l\'aperçu d\'impression (enregistrement en PDF possible).',
                 '« Exporter le métré (CSV) » crée un fichier à ouvrir dans un tableur comme Excel ou LibreOffice.'],
          retenir: 'Imprimez ou exportez le métré avant de commander le matériel.' }
    ];

    let current = 0;
    let overlay = null;

    // ---------- Construction du panneau ----------
    function build() {
        overlay = document.createElement('div');
        overlay.id = 'guide-overlay';
        overlay.className = 'g-overlay hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Guide Clic & Volt');
        overlay.innerHTML =
            '<div class="g-panel">' +
            '  <header class="g-head"><strong>Guide Clic &amp; Volt</strong>' +
            '    <button type="button" class="g-close" aria-label="Fermer le guide">✕</button></header>' +
            '  <div class="g-body">' +
            '    <nav class="g-nav" aria-label="Sommaire"></nav>' +
            '    <section class="g-page"></section>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(overlay);

        const nav = overlay.querySelector('.g-nav');
        let lastPart = null;
        PAGES.forEach((p, i) => {
            if (p.part !== lastPart) {
                lastPart = p.part;
                nav.appendChild(el('div', 'g-navpart', 'Partie ' + partPos(i).partNo + ' · ' + p.part));
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'g-navbtn';
            b.textContent = partPos(i).num + '. ' + p.title;
            b.addEventListener('click', () => show(i));
            nav.appendChild(b);
        });
        overlay.querySelector('.g-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', e => {
            if (overlay.classList.contains('hidden')) return;
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowRight') show(current + 1);
            else if (e.key === 'ArrowLeft') show(current - 1);
        });
    }

    // Position d'une page dans sa partie : numéro de la page, total de la partie, numéro de la partie.
    function partPos(i) {
        const part = PAGES[i].part;
        const names = [...new Set(PAGES.map(p => p.part))];
        return {
            num: PAGES.slice(0, i + 1).filter(p => p.part === part).length,
            total: PAGES.filter(p => p.part === part).length,
            partNo: names.indexOf(part) + 1
        };
    }

    function show(i) {
        if (i < 0 || i >= PAGES.length) return;
        current = i;
        const p = PAGES[i];
        const page = overlay.querySelector('.g-page');
        page.innerHTML = '';

        const pos = partPos(i);
        const part = el('div', 'g-part', p.part + ' · ' + pos.num + ' / ' + pos.total);
        const h = el('h2', 'g-title', p.title);
        const anim = el('div', 'g-anim');
        anim.innerHTML = p.anim();
        const text = el('div', 'g-text');
        p.text.forEach(t => text.appendChild(richP(t)));
        const retenir = el('div', 'g-retenir');
        retenir.appendChild(el('strong', null, 'À retenir : '));
        retenir.appendChild(document.createTextNode(p.retenir));

        const nav = el('div', 'g-prevnext');
        const prev = el('button', 'g-btn', '← Précédent');
        prev.type = 'button';
        prev.disabled = i === 0;
        prev.addEventListener('click', () => show(i - 1));
        const next = el('button', 'g-btn g-primary', i === PAGES.length - 1 ? 'Terminer' : 'Suivant →');
        next.type = 'button';
        next.addEventListener('click', () => (i === PAGES.length - 1 ? close() : show(i + 1)));
        nav.append(prev);
        if (p.essayer) {
            const essai = el('button', 'g-btn g-essayer');
            essai.type = 'button';
            essai.title = 'Ferme le guide et montre l\'action dans le plan';
            essai.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i> Essayer';
            essai.addEventListener('click', () => essayer(p.essayer));
            nav.appendChild(essai);
        }
        nav.appendChild(next);

        page.append(part, h, anim, text, retenir, nav);
        overlay.querySelectorAll('.g-navbtn').forEach((b, k) => b.classList.toggle('active', k === i));
        page.scrollTop = 0;
        next.focus({ preventScroll: true });
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    // Texte d'un paragraphe : « [fa-circle-up] » affiche l'icône Font Awesome du même nom
    function richP(s) {
        const p = el('p');
        s.split(/(\[fa-[a-z-]+\])/).forEach(part => {
            const m = /^\[(fa-[a-z-]+)\]$/.exec(part);
            if (m) {
                const i = el('i', 'g-ico fa-solid ' + m[1]);
                i.setAttribute('aria-hidden', 'true');
                p.appendChild(i);
            } else if (part) {
                p.appendChild(document.createTextNode(part));
            }
        });
        return p;
    }

    function open(i) {
        if (!overlay) build();
        overlay.classList.remove('hidden');
        show(typeof i === 'number' ? i : current);
    }

    function close() {
        if (overlay) overlay.classList.add('hidden');
    }

    // « Essayer » : ferme le guide, règle l'appli comme la page l'indique, puis surligne le bouton à utiliser
    function essayer(spec) {
        close();
        if (spec.mode && spec.mode !== currentMode) switchMode(spec.mode);
        if (spec.tab) setRightTab(spec.tab);
        if (spec.tool) setModeTool(spec.tool);
        if (spec.place) setPlaceType2D(spec.place);
        // setPlacementType (3D) bascule le type choisi : on ne l'appelle pas si ce type est déjà actif
        if (spec.place3d && activePlacementType !== spec.place3d) setPlacementType(spec.place3d);
        if (spec.wallEdit) { if (!wallEditMode) toggleWallEdit(); }
        else if (wallEditMode) { wallEditMode = false; updateWallEditButtons(); }
        if (spec.pulse) surligner(document.querySelector(spec.pulse));
    }

    function surligner(node) {
        if (!node) return;
        const section = node.closest('details');
        if (section) section.open = true;   // ouvre « Aides & Commandes » si elle est repliée
        node.classList.remove('essai-surligne');
        void node.offsetWidth;   // redémarre l'animation si le bouton était déjà surligné
        node.classList.add('essai-surligne');
        setTimeout(() => node.classList.remove('essai-surligne'), 4000);
    }

    // ---------- Bouton dans la barre du haut ----------
    function addButton() {
        const themeBtn = document.getElementById('theme-toggle');
        if (!themeBtn || document.getElementById('guide-btn')) return;
        const b = document.createElement('button');
        b.id = 'guide-btn';
        b.type = 'button';
        b.className = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition flex items-center gap-1.5';
        b.title = 'Ouvrir le guide pas à pas';
        b.innerHTML = '<i class="fa-solid fa-book-open"></i> <span class="hidden min-[1536px]:inline">Guide</span>';
        b.addEventListener('click', () => open());
        themeBtn.parentElement.insertBefore(b, themeBtn);
    }

    window.addEventListener('DOMContentLoaded', addButton);
    window.openClicVoltGuide = open;
})();
