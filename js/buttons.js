/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

// Boutons de pose des barres de droite (2D et 3D) : une seule liste, deux barres.
// Chaque entrée décrit un bouton :
//   type   : identifiant passé à pickPlacement() et placé en data-type
//   label  : texte affiché
//   title  : infobulle
//   group  : 'ouvertures' ou 'appareillages' (section où le bouton apparaît)
//   color  : couleur de l'icône, pour les éléments qui ne sont pas sur un circuit (porte, fenêtre, tableau…)
//   fa     : icône Font Awesome (à la place de icon)
//   icon   : fonction (couleur) renvoyant le SVG
//   sep    : true pour un séparateur entre deux familles
// Les appareils de circuit prennent leur couleur dans PLACE_CIRCUIT_COLORS, comme sur le plan 2D/3D.

function placeSvg(viewBox, inner, cls = 'w-7 h-6 shrink-0') {
    return `<svg class="${cls}" viewBox="${viewBox}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Symbole de prise, même dessin que la référence : coupelle vers le haut, barre, broche qui descend ; sans fond
// sc : échelle (1 pour 16 A / 20 A, plus grand pour les dédiées)
function prisePlanSvg(c, sc = 1) {
    return `<g transform="scale(${sc})" fill="none" stroke="${c}" stroke-width="1.2" stroke-linecap="round">` +
        `<path d="M0,-0.2 V-4.25"/>` +
        `<path d="M-5.6,-4.25 H5.6"/>` +
        `<path d="M-4.5,-8.75 A4.5,4.5 0 0 0 4.5,-8.75"/>` +
        `<path d="M-4.5,-8.75 H-6.3 M4.5,-8.75 H6.3"/>` +
        `</g>`;
}

const PLACE_BUTTONS = [
    // ----- Ouvertures -----
    { group: 'ouvertures', type: 'door_single', label: 'Porte', title: 'Porte : cliquez sur un mur', fa: 'fa-door-open', color: '#b07a4a' },
    { group: 'ouvertures', type: 'window_std', label: 'Fenêtre', title: 'Fenêtre : cliquez sur un mur', fa: 'fa-window-maximize', color: '#3b82f6' },
    { group: 'ouvertures', type: 'shaft', label: 'Trémie', title: 'Trémie : ouverture dans la dalle qui relie des niveaux, posée sur un mur', fa: 'fa-border-none', color: '#f8fafc' },
    { group: 'ouvertures', type: 'stair', label: 'Escalier', title: 'Escalier : emprise au sol, relie des niveaux', fa: 'fa-stairs', color: '#a78bfa' },

    // ----- Appareillages -----
    { group: 'appareillages', type: 'panel', label: 'Tableau', title: 'Tableau électrique : un seul par projet, au RDC', color: '#06b6d4',
        icon: c => placeSvg('-2 -20 16 40', `<rect x="-1" y="-18" width="11" height="36" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><path d="M-1,-6 H10 M-1,6 H10" stroke="${c}" stroke-width="0.9"/><polygon points="3,-4 7.5,-0.5 5,-0.5 7.5,4 2.5,0.5 5,0.5" fill="${c}"/>`) },
    { group: 'appareillages', type: 'meter', label: 'Compteur', title: 'Compteur électrique : un seul par projet, au RDC, posé sur un mur', color: '#be123c',
        icon: c => placeSvg('-2 -20 16 40', `<rect x="-1" y="-9" width="11" height="18" rx="1" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><circle cx="4.5" cy="0" r="3.4" fill="none" stroke="${c}" stroke-width="0.9"/><path d="M4.5,0 L6.3,-1.8" stroke="${c}" stroke-width="0.9"/>`) },
    { group: 'appareillages', type: 'junction_box', label: 'Dérivation', title: 'Boîte de dérivation : point où se rejoignent les câbles d’un circuit', color: '#64748b',
        icon: c => placeSvg('-8 -8 16 16', `<rect x="-6" y="-6" width="12" height="12" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><path d="M-4,0 H4 M0,-4 V4" stroke="#0f172a" stroke-width="0.9"/>`) },
    { group: 'appareillages', sep: true },

    { group: 'appareillages', type: 'outlet_16a', label: 'Prise 16A', title: 'Prise 16 A (8 prises max) : cliquez sur un mur',
        icon: c => placeSvg('-7 -10 14 11', prisePlanSvg(c)) },
    { group: 'appareillages', type: 'outlet_20a', label: 'Prise 20A plan de travail', title: 'Prise 20A plan de travail (6 prises max) : cliquez sur un mur',
        icon: c => placeSvg('-7 -10 14 11', prisePlanSvg(c)) },
    { group: 'appareillages', type: 'outlet_20a_classic', label: 'Prise 20A classique', title: 'Prise 20A classique (12 prises max) : cliquez sur un mur',
        icon: c => placeSvg('-7 -10 14 11', prisePlanSvg(c)) },
    { group: 'appareillages', type: 'outlet_dedicated_20', label: 'Prise 20A dédiée', title: 'Prise 20A dédiée (1 prise max, un appareil par circuit) : cliquez sur un mur',
        icon: c => placeSvg('-9 -12 18 13', prisePlanSvg(c, 1.33)) },
    { group: 'appareillages', type: 'outlet_dedicated_32', label: 'Prise 32A dédiée', title: 'Prise 32A dédiée (1 prise max, un appareil par circuit) : cliquez sur un mur',
        icon: c => placeSvg('-9 -12 18 13', prisePlanSvg(c, 1.33)) },
    { group: 'appareillages', type: 'outlet_switched', label: 'Prise commandée', title: 'Prise commandée (8 prises max) : une prise que l\'interrupteur coupe ou rétablit (ex. radiateur)',
        icon: c => placeSvg('-9 -12 18 13', prisePlanSvg(c, 1.33)) },

    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'light_ceiling', label: 'Plafonnier', title: 'Plafonnier : cliquez au plafond, dans la pièce',
        icon: c => placeSvg('-12 -12 24 24', `<circle cx="0" cy="0" r="10" fill="#fef9c3" stroke="${c}" stroke-width="1.4"/><path d="M-6.5,-6.5 L6.5,6.5 M-6.5,6.5 L6.5,-6.5" stroke="#0f172a" stroke-width="1"/>`) },
    { group: 'appareillages', type: 'light_spot', label: 'Spot', title: 'Spot encastré : luminaire affleurant au plafond, dans la pièce',
        icon: c => placeSvg('-8 -8 16 16', `<circle cx="0" cy="0" r="6" fill="#fef9c3" stroke="${c}" stroke-width="1.6"/><circle cx="0" cy="0" r="2.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'wall_light', label: 'Applique', title: 'Applique : luminaire fixé sur un mur',
        icon: c => placeSvg('-5 -9 30 18', `<rect x="-3" y="-7" width="3" height="14" rx="1" fill="#facc15" stroke="#ca8a04" stroke-width="1"/><path d="M0,0 H4" stroke="${c}" stroke-width="1.2"/><path d="M4,-6 Q15,-5 15,0 Q15,5 4,6 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1"/><path d="M17,-5 L21,-7 M18,0 H23 M17,5 L21,7" stroke="${c}" stroke-width="1"/>`) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'switch_simple', label: 'Interrupteur', title: 'Interrupteur simple : commande un luminaire',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L12.7,-4.2" stroke="${c}" stroke-width="1.1"/><circle cx="12.7" cy="-4.2" r="1" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_va_et_vient', label: 'Va-et-vient', title: 'Va-et-vient : deux interrupteurs commandent un même luminaire',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L13.5,-4.5 M8.5,0 L13.5,4.5" stroke="${c}" stroke-width="1.1"/><circle cx="13.5" cy="-4.5" r="1" fill="${c}"/><circle cx="13.5" cy="4.5" r="1" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_pushbutton', label: 'Poussoir', title: 'Poussoir (télérupteur) : commande un luminaire par impulsion',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="1.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_dimmer', label: 'Variateur', title: 'Variateur : réglage progressif d\'un luminaire',
        icon: c => placeSvg('-2 -8 18 16', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L12.7,-4.2" stroke="${c}" stroke-width="1.1"/><path d="M11.3,-5.6 A6.2,6.2 0 0 1 11.3,5.6" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', type: 'motion_timer', label: 'Minuterie / mouv.', title: 'Minuterie / détecteur de mouvement : allume un luminaire pendant une durée ou à la présence',
        icon: c => placeSvg('-2 -8 20 16', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M13.5,-4.2 A6.5,6.5 0 0 1 13.5,4.2 M15.8,-6.1 A9.5,9.5 0 0 1 15.8,6.1" fill="none" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'doorbell_button', label: 'Bouton sonnette', title: 'Bouton de sonnette : fait sonner la sonnette',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="1.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'doorbell_chime', label: 'Sonnerie', title: 'Sonnerie : carillon alimenté par le circuit d\'éclairage',
        icon: c => placeSvg('-8 -8 22 16', `<circle cx="0" cy="0" r="4" fill="#fbcfe8" stroke="${c}" stroke-width="1.2"/><path d="M6,-4 A6,6 0 0 1 6,4 M9,-6.5 A9.5,9.5 0 0 1 9,6.5" fill="none" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', type: 'shutter_control', label: 'Commande volet', title: 'Commande de volet roulant : monter / descendre le volet',
        icon: c => placeSvg('-6 -8 14 16', `<path d="M0,-6 L3,-2 H-3 Z M0,6 L3,2 H-3 Z" fill="${c}" stroke="#64748b" stroke-width="0.8"/>`) },
    { group: 'appareillages', type: 'shutter_motor', label: 'Moteur volet', title: 'Moteur de volet roulant : alimenté par le circuit prises',
        icon: c => placeSvg('-2 -7 18 14', `<rect x="0" y="-5" width="14" height="10" rx="2" fill="#e2e8f0" stroke="${c}" stroke-width="1"/><path d="M3,-2.5 V2.5 M11,-2.5 V2.5" stroke="${c}" stroke-width="1"/>`) },
    { group: 'appareillages', type: 'smoke_detector', label: 'Détecteur de fumée (DAAF)', title: 'Détecteur de fumée (DAAF) : cliquez au plafond, dans la pièce',
        icon: c => placeSvg('-11 -11 22 22', `<circle cx="0" cy="0" r="9" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><circle cx="0" cy="0" r="4" fill="none" stroke="${c}" stroke-width="1.2"/>`) }
];

// Couleur des appareils de circuit = couleur de leur circuit par défaut (comme sur le plan 2D/3D)
const PLACE_CIRCUIT_COLORS = {
    light_ceiling: '#facc15', light_spot: '#facc15', wall_light: '#facc15',
    switch_simple: '#facc15', switch_va_et_vient: '#facc15', switch_pushbutton: '#facc15', switch_dimmer: '#facc15', motion_timer: '#facc15',
    outlet_16a: '#f97316', outlet_switched: '#f97316',
    outlet_20a: '#ef4444',
    outlet_20a_classic: '#15803d',
    outlet_dedicated_20: '#a78bfa',
    outlet_dedicated_32: '#38bdf8',
    doorbell_button: '#f9a8d4', doorbell_chime: '#f9a8d4',
    shutter_control: '#6b7280', shutter_motor: '#6b7280',
    smoke_detector: '#94a3b8'
};

const PLACE_BUTTON_CLASS = 'place-btn place-btn2d relative px-2 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-500 rounded-xl flex items-center gap-2 text-slate-200 transition text-[11px] leading-tight';

// Barres de droite : sidebar, préfixe des identifiants de bouton
const PLACE_SIDEBARS = [
    { sidebar: 'sidebar-2d-right', prefix: 'btn-2d-place-' },
    { sidebar: 'sidebar-3d-right', prefix: 'btn-place-' }
];

// Section (titre de la balise summary) qui reçoit chaque groupe de boutons
const PLACE_GROUP_SUMMARY = { ouvertures: 'Ouvertures', appareillages: 'Appareillages' };

function placeIconHtml(item) {
    if (item.fa) return `<i class="fa-solid ${item.fa} text-sm" style="color:${item.color}"></i>`;
    const col = PLACE_CIRCUIT_COLORS[item.type] || item.color;
    return item.icon(col);
}

function buildPlaceButton(item, prefix) {
    const btn = document.createElement('button');
    btn.id = prefix + item.type;
    btn.dataset.type = item.type;
    btn.className = PLACE_BUTTON_CLASS;
    btn.title = item.title;
    btn.innerHTML = placeIconHtml(item) + ' ' + item.label;
    btn.addEventListener('click', () => pickPlacement(item.type));
    return btn;
}

function buildPlaceSeparator() {
    const sep = document.createElement('div');
    sep.className = 'col-span-2 border-t border-slate-600/60';
    sep.setAttribute('role', 'separator');
    return sep;
}

// Grille d'une section (ex. « Ouvertures ») dans une barre
function placeGridOf(sidebar, summaryText) {
    const details = [...sidebar.querySelectorAll('details')].find(d => {
        const s = d.querySelector('summary');
        return s && s.textContent.trim().startsWith(summaryText);
    });
    return details ? details.querySelector('.grid') : null;
}

function buildPlaceButtons() {
    PLACE_SIDEBARS.forEach(({ sidebar, prefix }) => {
        const side = document.getElementById(sidebar);
        if (!side) return;
        Object.keys(PLACE_GROUP_SUMMARY).forEach(group => {
            const grid = placeGridOf(side, PLACE_GROUP_SUMMARY[group]);
            if (!grid) return;
            // anciens boutons écrits en dur : retirés s'ils restent dans index.html
            grid.querySelectorAll('.place-btn, [role="separator"]').forEach(n => n.remove());
            const frag = document.createDocumentFragment();
            PLACE_BUTTONS.filter(b => b.group === group).forEach(item => {
                frag.appendChild(item.sep ? buildPlaceSeparator() : buildPlaceButton(item, prefix));
            });
            // les boutons passent avant le reste de la grille (liste « Niveaux reliés » de la trémie)
            grid.insertBefore(frag, grid.firstChild);
        });
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPlaceButtons);
else buildPlaceButtons();

// Appareils posables pour chaque famille de circuit « Nouveau circuit »
const CIRCUIT_PLACE_TYPES = {
    c_lighting: ['light_ceiling', 'light_spot', 'wall_light', 'switch_simple', 'switch_va_et_vient', 'switch_pushbutton', 'switch_dimmer', 'motion_timer'],
    c_outlets: ['outlet_16a', 'outlet_switched'],
    c_outlets20: ['outlet_20a_classic'],
    c_kitchen: ['outlet_20a'],
    c_shutters: ['shutter_control', 'shutter_motor'],
    c_doorbell: ['doorbell_button', 'doorbell_chime'],
    c_daaf: ['smoke_detector'],
    c_dedicated20: ['outlet_dedicated_20'],
    c_dedicated32: ['outlet_dedicated_32']
};

// Affiche l'onglet Appareillages des barres de droite et fait apparaître les appareils compatibles
function revealPlacementSection() {
    setRightTab('appareillage');
    const first = document.querySelector('.place-btn[data-type].ring-yellow-300');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// familyId : appareils compatibles entourés de jaune et cliquables, les autres grisés ; null : tout redevient normal
// reveal : true affiche aussi l'onglet Appareillages (bouton « Aller »)
function setPlacementFilter(familyId, reveal = true) {
    const types = familyId ? (CIRCUIT_PLACE_TYPES[familyId] || []) : null;
    document.querySelectorAll('.place-btn[data-type]').forEach(b => {
        const ok = !types || types.includes(b.dataset.type);
        b.disabled = !ok;
        b.classList.toggle('opacity-40', !!types && !ok);
        b.classList.toggle('cursor-not-allowed', !!types && !ok);
        b.classList.toggle('ring-2', !!types && ok);
        b.classList.toggle('ring-yellow-300', !!types && ok);
    });
    if (types && reveal) revealPlacementSection();
}
