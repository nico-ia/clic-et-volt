/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

// Boutons de pose des barres de droite (2D et 3D) : une seule liste, deux barres.
// Chaque entrée décrit un bouton :
//   type   : identifiant passé à pickPlacement() et placé en data-type
//   label  : texte affiché
//   title  : infobulle
//   group  : 'ouvertures' ou 'appareillages' (section où le bouton apparaît)
//   color  : couleur d'accent de l'icône (les blancs et contours sombres restent fixes)
//   sub    : couleur secondaire facultative (broche de la prise 32 A)
//   fa     : icône Font Awesome (à la place de icon)
//   icon   : fonction (couleur, couleur secondaire) renvoyant le SVG
//   sep    : true pour un séparateur entre deux familles
// Pour changer une couleur, modifier seulement color (ou sub) de l'entrée.

function placeSvg(viewBox, inner, cls = 'w-7 h-6 shrink-0') {
    return `<svg class="${cls}" viewBox="${viewBox}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Prise 16 A et 20 A (petit format) ; mid = true ajoute le trait de la 20 A
function socketSmall(c, mid) {
    return `<path d="M-1,-6 V6" stroke="${c}" stroke-width="1.2"/>` +
        `<path d="M-1,-4.5 A4.5,4.5 0 0 1 -1,4.5 Z" fill="#f8fafc" stroke="${c}" stroke-width="1.3"/>` +
        `<path d="M3.5,0 H8.5 M8.5,-3.5 V3.5${mid ? ' M6,-3 V3' : ''}" stroke="${c}" stroke-width="1.1"/>`;
}

// Prise grand format (dédiée, commandée) ; fill et pin réglables pour la 32 A
function socketBig(c, fill = '#f8fafc', pin = c) {
    return `<path d="M-1,-11 V11" stroke="${c}" stroke-width="1.2"/>` +
        `<path d="M-1,-9.5 A9.5,9.5 0 0 1 -1,9.5 Z" fill="${fill}" stroke="${c}" stroke-width="1.3"/>` +
        `<path d="M8.5,0 H13.5 M13.5,-3.5 V3.5 M11,-4.5 V4.5" stroke="${pin}" stroke-width="1.1"/>`;
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
    { group: 'appareillages', type: 'junction_box', label: 'Dérivation', title: 'Boîte de dérivation : point où se rejoignent les câbles d’un circuit', color: '#64748b',
        icon: c => placeSvg('-8 -8 16 16', `<rect x="-6" y="-6" width="12" height="12" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><path d="M-4,0 H4 M0,-4 V4" stroke="#0f172a" stroke-width="0.9"/>`) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'outlet_16a', label: 'Prise 16A', title: 'Prise 16 A (8 prises max) : cliquez sur un mur', color: '#f97316',
        icon: c => placeSvg('-3 -8 17 16', socketSmall(c, false)) },
    { group: 'appareillages', type: 'outlet_20a', label: 'Prise 20A plan de travail', title: 'Prise 20A plan de travail (6 prises max) : cliquez sur un mur', color: '#ef4444',
        icon: c => placeSvg('-3 -8 17 16', socketSmall(c, true)) },
    { group: 'appareillages', type: 'outlet_20a_classic', label: 'Prise 20A classique', title: 'Prise 20A classique (12 prises max) : cliquez sur un mur', color: '#0891b2',
        icon: c => placeSvg('-3 -8 17 16', socketSmall(c, true)) },
    { group: 'appareillages', type: 'outlet_dedicated_20', label: 'Prise 20A dédiée', title: 'Prise 20A dédiée (1 prise max, un appareil par circuit) : cliquez sur un mur', color: '#8b5cf6',
        icon: c => placeSvg('-3 -13 22 26', socketBig(c)) },
    { group: 'appareillages', type: 'outlet_dedicated_32', label: 'Prise 32A dédiée', title: 'Prise 32A dédiée (1 prise max, un appareil par circuit) : cliquez sur un mur', color: '#6d28d9', sub: '#c4b5fd',
        icon: (c, s) => placeSvg('-3 -13 22 26', socketBig(c, c, s)) },
    { group: 'appareillages', type: 'outlet_switched', label: 'Prise commandée', title: 'Prise commandée (8 prises max) : une prise que l\'interrupteur coupe ou rétablit (ex. radiateur)', color: '#f59e0b',
        icon: c => placeSvg('-3 -13 22 26', socketBig(c)) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'light_ceiling', label: 'Plafonnier', title: 'Plafonnier : cliquez au plafond, dans la pièce', color: '#fde047',
        icon: c => placeSvg('-12 -12 24 24', `<circle cx="0" cy="0" r="10" fill="#fef9c3" stroke="${c}" stroke-width="1.4"/><path d="M-6.5,-6.5 L6.5,6.5 M-6.5,6.5 L6.5,-6.5" stroke="#0f172a" stroke-width="1"/>`) },
    { group: 'appareillages', type: 'light_spot', label: 'Spot', title: 'Spot encastré : luminaire affleurant au plafond, dans la pièce', color: '#eab308',
        icon: c => placeSvg('-8 -8 16 16', `<circle cx="0" cy="0" r="6" fill="#fef9c3" stroke="${c}" stroke-width="1.6"/><circle cx="0" cy="0" r="2.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'wall_light', label: 'Applique', title: 'Applique : luminaire fixé sur un mur', color: '#eab308',
        icon: c => placeSvg('-5 -9 30 18', `<rect x="-3" y="-7" width="3" height="14" rx="1" fill="#facc15" stroke="#ca8a04" stroke-width="1"/><path d="M0,0 H4" stroke="${c}" stroke-width="1.2"/><path d="M4,-6 Q15,-5 15,0 Q15,5 4,6 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1"/><path d="M17,-5 L21,-7 M18,0 H23 M17,5 L21,7" stroke="${c}" stroke-width="1"/>`) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'switch_simple', label: 'Interrupteur', title: 'Interrupteur simple : commande un luminaire', color: '#10b981',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L12.7,-4.2" stroke="${c}" stroke-width="1.1"/><circle cx="12.7" cy="-4.2" r="1" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_va_et_vient', label: 'Va-et-vient', title: 'Va-et-vient : deux interrupteurs commandent un même luminaire', color: '#22c55e',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L13.5,-4.5 M8.5,0 L13.5,4.5" stroke="${c}" stroke-width="1.1"/><circle cx="13.5" cy="-4.5" r="1" fill="${c}"/><circle cx="13.5" cy="4.5" r="1" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_pushbutton', label: 'Poussoir', title: 'Poussoir (télérupteur) : commande un luminaire par impulsion', color: '#38bdf8',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="1.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'switch_dimmer', label: 'Variateur', title: 'Variateur : réglage progressif d\'un luminaire', color: '#14b8a6',
        icon: c => placeSvg('-2 -8 18 16', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M8.5,0 L12.7,-4.2" stroke="${c}" stroke-width="1.1"/><path d="M11.3,-5.6 A6.2,6.2 0 0 1 11.3,5.6" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', type: 'motion_timer', label: 'Minuterie / mouv.', title: 'Minuterie / détecteur de mouvement : allume un luminaire pendant une durée ou à la présence', color: '#a3e635',
        icon: c => placeSvg('-2 -8 20 16', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><path d="M13.5,-4.2 A6.5,6.5 0 0 1 13.5,4.2 M15.8,-6.1 A9.5,9.5 0 0 1 15.8,6.1" fill="none" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', sep: true },
    { group: 'appareillages', type: 'doorbell_button', label: 'Bouton sonnette', title: 'Bouton de sonnette : fait sonner la sonnette', color: '#f472b6',
        icon: c => placeSvg('-2 -6 18 14', `<path d="M-1,0 H5" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="3.6" fill="#f8fafc" stroke="${c}" stroke-width="1.2"/><circle cx="8.5" cy="0" r="1.2" fill="${c}"/>`) },
    { group: 'appareillages', type: 'doorbell_chime', label: 'Sonnerie', title: 'Sonnerie : carillon alimenté par le circuit d\'éclairage', color: '#f472b6',
        icon: c => placeSvg('-8 -8 22 16', `<circle cx="0" cy="0" r="4" fill="#fbcfe8" stroke="${c}" stroke-width="1.2"/><path d="M6,-4 A6,6 0 0 1 6,4 M9,-6.5 A9.5,9.5 0 0 1 9,6.5" fill="none" stroke="${c}" stroke-width="1.1"/>`) },
    { group: 'appareillages', type: 'shutter_control', label: 'Commande volet', title: 'Commande de volet roulant : monter / descendre le volet', color: '#94a3b8',
        icon: c => placeSvg('-6 -8 14 16', `<path d="M0,-6 L3,-2 H-3 Z M0,6 L3,2 H-3 Z" fill="${c}" stroke="#64748b" stroke-width="0.8"/>`) },
    { group: 'appareillages', type: 'shutter_motor', label: 'Moteur volet', title: 'Moteur de volet roulant : alimenté par le circuit prises', color: '#64748b',
        icon: c => placeSvg('-2 -7 18 14', `<rect x="0" y="-5" width="14" height="10" rx="2" fill="#e2e8f0" stroke="${c}" stroke-width="1"/><path d="M3,-2.5 V2.5 M11,-2.5 V2.5" stroke="${c}" stroke-width="1"/>`) },
    { group: 'appareillages', type: 'smoke_detector', label: 'DAAF', title: 'Détecteur de fumée (DAAF) : cliquez au plafond, dans la pièce', color: '#64748b',
        icon: c => placeSvg('-11 -11 22 22', `<circle cx="0" cy="0" r="9" fill="#f8fafc" stroke="${c}" stroke-width="1.6"/><circle cx="0" cy="0" r="4" fill="none" stroke="${c}" stroke-width="1.2"/>`) }
];

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
    return item.icon(item.color, item.sub || item.color);
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