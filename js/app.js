// Application principale : état global, undo/redo, thème, sidebars, circuits, métré, inspecteurs,
// sauvegarde/chargement JSON et initialisation (DOMContentLoaded). Chargé après canvas2d.js et scene3d.js.

let currentMode = '2d';
let currentTool = 'select';
let gridSnap = true;
let angleSnap = true;
let currentTheme = 'dark';
let isPrintRendering = false;

let projectData = {
    walls: [],
    openings: [],
    shafts: [],
    stairs: [],
    electrical: [],
    circuits: [
        { id: 'c_lighting', name: 'Éclairage 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5, color: '#facc15' },
        { id: 'c_outlets', name: 'Prises de courant 16A', type: 'outlets', maxPoints: 8, breakerRating: 16, wireSection: 2.5, color: '#f97316' },
        classicOutlet20Circuit(),
        { id: 'c_kitchen', name: 'Prises 20A plan de travail', type: 'specialized', maxPoints: 6, breakerRating: 20, wireSection: 2.5, color: '#ef4444' },
        ...dedicatedCircuitDefs(),
        doorbellCircuitDef(),
        daafCircuitDef(),
        shutterCircuitDef()
    ],
    annotations: []
};
// Couleurs de base figées au chargement, avant toute restauration de projet
const DEFAULT_CIRCUIT_COLOR_BY_ID = Object.fromEntries(projectData.circuits.map(c => [c.id, c.color]));

// Prises 20 A classiques : 12 points max en 2,5 mm² / 20 A
function classicOutlet20Circuit() {
    return { id: 'c_outlets20', name: 'Prises 20A', type: 'specialized', maxPoints: 12, breakerRating: 20, wireSection: 2.5, color: '#15803d' };
}

// Sonnerie : circuit à part, distinct de l'éclairage
function doorbellCircuitDef() {
    return { id: 'c_doorbell', name: 'Sonnerie 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5, color: '#f9a8d4' };
}

// DAAF : circuit à part, distinct de l'éclairage
function daafCircuitDef() {
    return { id: 'c_daaf', name: 'DAAF 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5, color: '#94a3b8' };
}

// Volets roulants : moteurs et commandes sur un circuit à part (et non sur les prises)
function shutterCircuitDef() {
    // 9e circuit : hors de la palette (sinon il reprendrait le jaune de l'éclairage)
    return { id: 'c_shutters', name: 'Volets 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5, color: '#6b7280' };
}

// Circuits dédiés (une prise par circuit) : 20 A en 2,5 mm² ou 32 A en 6 mm²
function dedicatedCircuitDefs() {
    return [
        { id: 'c_dedicated20', name: 'Circuit dédié 20A', type: 'specialized', maxPoints: 1, breakerRating: 20, wireSection: 2.5, color: '#a78bfa' },
        { id: 'c_dedicated32', name: 'Circuit dédié 32A', type: 'specialized', maxPoints: 1, breakerRating: 32, wireSection: 6.0, color: '#38bdf8' }
    ];
}

// Accesseurs de données (phase B1) : lecture seule des murs, ouvertures et appareils d'un niveau.
// Un seul niveau pour l'instant : ils renvoient tout. Les écritures restent sur projectData.
function wallsOn(levelId = activeLevelId) { return projectData.walls.filter(w => w.levelId === levelId); }
// Vrai si le segment se superpose à un mur existant du niveau (même axe, recouvrement > 5 cm)
function segmentOverlapsWall(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) return false;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const perp = (px, py) => Math.abs((px - x1) * uy - (py - y1) * ux);
    const along = (px, py) => (px - x1) * ux + (py - y1) * uy;
    return wallsOn().some(w => {
        if (perp(w.x1, w.y1) > 2 || perp(w.x2, w.y2) > 2) return false;
        const a = along(w.x1, w.y1), b = along(w.x2, w.y2);
        const overlap = Math.min(len, Math.max(a, b)) - Math.max(0, Math.min(a, b));
        return overlap > 5;
    });
}
function openingsOn(levelId = activeLevelId) { return projectData.openings.filter(o => o.levelId === levelId); }
function electricalOn(levelId = activeLevelId) { return projectData.electrical.filter(el => el.levelId === levelId); }
function shaftsOn(levelId = activeLevelId) { return (projectData.shafts || []).filter(sh => (sh.levelIds || [sh.levelId]).includes(levelId)); }
function stairsOn(levelId = activeLevelId) { return (projectData.stairs || []).filter(st => (st.levelIds || [st.levelId]).includes(levelId)); }

// Niveau affiché (D1) : hors du JSON, un fichier se rouvre toujours sur le RDC
let activeLevelId = 'lvl_rdc';

let undoStack = [];
let redoStack = [];

// 2D State
let canvas2D, ctx2D;
let panX = 0, panY = 0, zoom = 1.0;
let rot2D = 0; // rotation de la vue 2D (radians, autour du centre du canvas)
let isPanning = false, startPanX = 0, startPanY = 0;

let drawingStartPoint = null; 
let mouseCurrentPos = null;   
let selectedWallId = null;
let selectedWallIds = [];
let selectedDeviceIds = [];   // C2 : appareils sélectionnés par rectangle en 2D
let selectedOpeningIds = [];  // C2 : ouvertures sélectionnées par rectangle en 2D
let draggingWall = null;
let selectionBoxStart = null;
let selectionBoxEnd = null;
let activeWallThickness = 10; // cm
let activeWallHeight = 250; // cm

// 3D State
let threeScene, threeCamera, threeRenderer, threeControls;
let wallMeshes3D = [];
let clickableWalls3D = [];
let interactiveObjects3D = [];
let ceilingMesh3D = null;
let activePlacementType = null;
let selected3DId = null;
let selectedCircuitId = null;
let selectedHighlightMesh = null;
let dragging3DElementId = null;
let raycaster = new THREE.Raycaster();
let mouse3D = new THREE.Vector2();

let dragPlane = new THREE.Plane();
let planeIntersectPoint = new THREE.Vector3();

// Active ou retire le clignotement d'un onglet ; retirer efface aussi le style laissé par le clignotement
function setTabAlertBlink(key, on) {
    document.querySelectorAll('[data-right-tab="' + key + '"]').forEach(b => {
        if (on) { b.setAttribute('data-alert-blink', ''); return; }
        b.removeAttribute('data-alert-blink');
        b.style.outline = '';
        b.style.outlineOffset = '';
        b.style.backgroundImage = '';
    });
}

// Les alertes suivent les modifications en temps réel : rafraîchissement seulement si les données changent
// Un seul minuteur (500 ms) sérialise le projet une fois : alertes en temps réel + sauvegarde automatique toutes les 2 s
function startProjectWatcher() {
    let lastState = null;
    let lastLevelId = null;
    let tick = 0;
    setInterval(() => {
        let s = '';
        try { s = JSON.stringify(projectData); } catch (e) { return; }
        // le niveau affiché fait partie de l'état : changer de niveau recalcule aussi les alertes
        if (s !== lastState || activeLevelId !== lastLevelId) {
            lastState = s;
            lastLevelId = activeLevelId;
            updateCircuitsUI();
            syncSelectionSliders();
        }
        if (++tick % 4 === 0 && s !== _lastAutosave) {
            try { localStorage.setItem(AUTOSAVE_KEY, s); _lastAutosave = s; } catch (e) { /* stockage indisponible : on ignore */ }
        }
    }, 500);
}

window.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    paintOutletIcons();
    document.getElementById('inspector-dock-slot').appendChild(document.getElementById('inspector-3d'));
    init2DCanvas();
    init3DScene();
    ensureProjectDefaults();
    // la reprise du projet retrouvé passe avant la suite : sinon l'enregistrement automatique écraserait le projet
    restoreAutosave().then(() => {
        ensureShaftLinkControl();
        renderLevelSelector();
        updateCircuitsUI();
        updateStats();
        startProjectWatcher();
        startCollisionBlink();
        ensureNudgePads();
        bindHelpButton();
        // outil par défaut : Sélectionner (surligne le bon bouton et affiche son aide)
        setTool('select');
        placeSharedInspectors();
        setToolHintOpen(localStorage.getItem(TOOL_HINT_KEY) !== 'fermee');
        updateWallEditButtons();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('help-panel')) { toggleHelpPanel(false); return; }
        if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { toggleHelpPanel(); return; }
        if (e.key === 'Escape') {
            // C3 : Échap annule le tracé de mur en cours (comme le clic droit) et le mode placement 3D
            if (currentMode === '2d' && currentTool === 'wall' && drawingStartPoint) {
                drawingStartPoint = null;
                mouseCurrentPos = null;
                document.getElementById('drawing-instruction-hint').textContent = "Tracé arrêté. Cliquez pour placer un nouveau point de mur.";
                redraw2D();
                showNotification("Tracé de mur arrêté", "info");
            }
            if (activePlacementType === 'wall' && wallDraft3D) { endWallTrace3D(); return; }
            if (activePlacementType) setPlacementType(null);
            else if (selected3DId || selectedCircuitId || selectedWallIds.length || selectedDeviceIds.length || selectedOpeningIds.length) clearAllSelection();
            return;
        }
        // Raccourcis d'outils : T = tracer un mur, S = sélectionner (hors champs de saisie, sans Ctrl/Alt)
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            const key = e.key.toLowerCase();
            if (key === 't') { e.preventDefault(); setModeTool('wall'); return; }
            if (key === 's') { e.preventDefault(); setModeTool('select'); return; }
        }
        // Annuler / rétablir au clavier (mêmes fonctions que les boutons), hors champs de saisie
        if ((e.ctrlKey || e.metaKey) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); return; }
            if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redoAction(); return; }
        }
        // Flèches : déplacement de l'élément sélectionné (2D et 3D), Maj : pas fin de 1 cm
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey &&
            !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            if (nudgeSelected(e.key, e.shiftKey ? 1 : 5)) { e.preventDefault(); return; }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            deleteCurrentSelection();
        }
    });
});

// =====================================================================
//  SIDEBARS : repli au clic + redimensionnement à la souris
// =====================================================================
const SIDEBAR_MIN = 180, SIDEBAR_DEFAULT = 340;
const SIDEBARS = [];

function sidebarMax() { return Math.max(SIDEBAR_MIN + 40, Math.min(640, Math.round(window.innerWidth * 0.45))); }

function readSidebarPrefs() {
    try { return JSON.parse(localStorage.getItem('clic_and_volt_sidebars_v4') || '{}') || {}; } catch (e) { return {}; }
}

function saveSidebarPrefs() {
    try {
        const prefs = {};
        SIDEBARS.forEach(sb => { prefs[sb.key] = { width: sb.width, collapsed: sb.collapsed }; });
        localStorage.setItem('clic_and_volt_sidebars_v4', JSON.stringify(prefs));
    } catch (e) { /* stockage indisponible : on ignore */ }
}

function layoutSidebars() {
    SIDEBARS.forEach(sb => {
        const w = Math.max(SIDEBAR_MIN, Math.min(sidebarMax(), sb.width));
        sb.el.style.width = w + 'px';
        sb.el.style.flexShrink = '0';
        sb.el.classList.toggle('sb-collapsed', sb.collapsed);
        sb.resizer.style.display = sb.collapsed ? 'none' : '';
        const offset = sb.collapsed ? 0 : w + 6;
        sb.toggle.style[sb.side] = offset + 'px';
        sb.toggle.innerHTML = '<i class="fa-solid fa-chevron-' + ((sb.side === 'left') === sb.collapsed ? 'right' : 'left') + '"></i>';
        sb.toggle.title = sb.collapsed ? 'Afficher le panneau' : 'Replier le panneau';
        sb.toggle.setAttribute('aria-label', sb.toggle.title);
        sb.toggle.setAttribute('aria-expanded', sb.collapsed ? 'false' : 'true');
    });
    refreshViewportSizes();
}

function refreshViewportSizes() {
    if (currentMode === '2d') resize2DCanvas();
    else if (currentMode === '3d') on3DWindowResize();
}

// Icônes des prises de la sidebar : couleur de base du circuit par défaut de leur type
const OUTLET_ICON_TYPES = ['outlet_16a', 'outlet_20a', 'outlet_20a_classic', 'outlet_dedicated_20', 'outlet_dedicated_32', 'outlet_switched'];
function paintOutletIcons() {
    document.querySelectorAll('button[data-type]').forEach(btn => {
        const svg = btn.querySelector('svg');
        if (!svg || !OUTLET_ICON_TYPES.includes(btn.dataset.type)) return;
        svg.style.color = DEFAULT_CIRCUIT_COLOR_BY_ID[DEFAULT_CIRCUIT_BY_TYPE[btn.dataset.type]];
    });
}

function initSidebars() {
    const prefs = readSidebarPrefs();
    const defs = [
        { key: '2d-left', id: 'sidebar-2d', side: 'left', parent: 'view-2d' },
        { key: '2d-right', id: 'sidebar-2d-right', side: 'right', parent: 'view-2d' },
        { key: '3d-left', id: 'sidebar-3d-left', side: 'left', parent: 'view-3d' },
        { key: '3d-right', id: 'sidebar-3d-right', side: 'right', parent: 'view-3d' }
    ];
    defs.forEach(d => {
        const el = document.getElementById(d.id);
        const parent = document.getElementById(d.parent);
        if (!el || !parent) return;
        const saved = prefs[d.key] || {};
        const sb = {
            key: d.key, side: d.side, el,
            width: Math.max(SIDEBAR_MIN, Math.min(640, +saved.width || SIDEBAR_DEFAULT)),
            collapsed: !!saved.collapsed
        };
        const resizer = document.createElement('div');
        resizer.className = 'sb-resizer';
        resizer.title = 'Glisser pour redimensionner (double-clic : largeur par défaut)';
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-orientation', 'vertical');
        el.insertAdjacentElement(d.side === 'left' ? 'afterend' : 'beforebegin', resizer);
        sb.resizer = resizer;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sb-toggle ' + d.side;
        toggle.addEventListener('click', () => {
            sb.collapsed = !sb.collapsed;
            layoutSidebars();
            saveSidebarPrefs();
        });
        parent.appendChild(toggle);
        sb.toggle = toggle;

        resizer.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startX = e.clientX, startW = el.getBoundingClientRect().width;
            resizer.setPointerCapture(e.pointerId);
            resizer.classList.add('active');
            document.body.classList.add('sb-dragging');
            const move = ev => {
                const dx = ev.clientX - startX;
                sb.width = Math.max(SIDEBAR_MIN, Math.min(sidebarMax(), startW + (d.side === 'left' ? dx : -dx)));
                layoutSidebars();
            };
            const up = () => {
                resizer.removeEventListener('pointermove', move);
                resizer.removeEventListener('pointerup', up);
                resizer.removeEventListener('pointercancel', up);
                resizer.classList.remove('active');
                document.body.classList.remove('sb-dragging');
                saveSidebarPrefs();
            };
            resizer.addEventListener('pointermove', move);
            resizer.addEventListener('pointerup', up);
            resizer.addEventListener('pointercancel', up);
        });
        resizer.addEventListener('dblclick', () => {
            sb.width = SIDEBAR_DEFAULT;
            layoutSidebars();
            saveSidebarPrefs();
        });
        SIDEBARS.push(sb);
    });
    window.addEventListener('resize', layoutSidebars);
    layoutSidebars();
}

window.addEventListener('DOMContentLoaded', initSidebars);

function initializeTheme() {
    try {
        const savedTheme = localStorage.getItem('clic_and_volt_theme');
        currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    } catch (error) {
        console.warn('Impossible de lire le thème enregistré.', error);
    }
    applyTheme();
}

function applyTheme() {
    const light = currentTheme === 'light';
    document.body.classList.toggle('theme-light', light);
    const button = document.getElementById('theme-toggle');
    if (button) {
        button.innerHTML = light
            ? '<i class="fa-solid fa-sun theme-toggle-sun"></i> <span class="hidden min-[1536px]:inline">Clair</span>'
            : '<i class="fa-solid fa-moon"></i> <span class="hidden min-[1536px]:inline">Sombre</span>';
        button.title = light ? 'Passer au thème sombre' : 'Passer au thème clair';
    }
    if (threeScene) threeScene.background = new THREE.Color(light ? '#e2e8f0' : '#020617');
    // la 3D se reconstruit pour que les fils noirs et gris prennent la teinte du thème
    if (currentMode === '3d' && threeScene) build3DScene();
    redraw2D();
}
// Trémie : blanche en thème sombre, noire en thème clair (une trémie blanche disparaît sur fond clair)
function shaftColour() { return currentTheme === 'light' ? '#0f172a' : '#f8fafc'; }

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme();
    try {
        localStorage.setItem('clic_and_volt_theme', currentTheme);
    } catch (error) {
        console.error('Impossible d’enregistrer le thème choisi.', error);
        showNotification('Le thème est appliqué, mais n’a pas pu être mémorisé.', 'error');
    }
}

function showNotification(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');

    toastMsg.textContent = message;
    toastTitle.textContent = type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : 'Information';
    toastIcon.className = type === 'error' ? 'fa-solid fa-triangle-exclamation text-rose-400 text-lg' : type === 'success' ? 'fa-solid fa-circle-check text-emerald-400 text-lg' : 'fa-solid fa-info-circle text-emerald-400 text-lg';

    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 3000);
}

function saveStateToUndo() {
    undoStack.push(JSON.stringify(projectData));
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
}

function undoAction() {
    hideUndoBar();
    if (undoStack.length === 0) {
        showNotification("Rien à annuler", "info");
        return;
    }
    redoStack.push(JSON.stringify(projectData));
    projectData = JSON.parse(undoStack.pop());
    renderLevelSelector();   // le niveau affiché peut ne plus exister après l'annulation
    setSelectedWalls([]);
    selected3DId = null;
    redraw2D();
    if (currentMode === '3d') build3DScene();
    updateStats();
    showNotification("Action annulée", "success");
}

function redoAction() {
    if (redoStack.length === 0) {
        showNotification("Rien à rétablir", "info");
        return;
    }
    undoStack.push(JSON.stringify(projectData));
    projectData = JSON.parse(redoStack.pop());
    renderLevelSelector();
    setSelectedWalls([]);
    selected3DId = null;
    redraw2D();
    if (currentMode === '3d') build3DScene();
    updateStats();
    showNotification("Action rétablie", "success");
}

function switchMode(mode) {
    currentMode = mode;
    placeSharedInspectors();
    refreshToolButtons();   // l'outil actif est affiché à l'identique dans la vue qui s'ouvre
    document.getElementById('view-2d').classList.toggle('hidden', mode !== '2d');
    document.getElementById('view-3d').classList.toggle('hidden', mode !== '3d');
    document.getElementById('view-report').classList.toggle('hidden', mode !== 'report');

    const tabOn = 'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-emerald-600 text-white shadow';
    const tabOff = 'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200';
    ['2d', '3d', 'report'].forEach(m => { document.getElementById('tab-' + m).className = mode === m ? tabOn : tabOff; });

    if (mode === 'report') {
        updateCircuitsUI();
    } else if (mode === '3d') {
        build3DScene();
        frame3DOnProject();   // vue d'ensemble à l'entrée en 3D
        if (selected3DId) {
            const o = interactiveObjects3D.find(x => x.userData && x.userData.id === selected3DId);
            if (o) select3DElement(selected3DId, o);
        }
        setTimeout(() => {
            on3DWindowResize();
        }, 50);
    } else if (mode === '2d') {
        setTimeout(() => {
            resize2DCanvas();
            redraw2D();
            syncElementInspectors();
        }, 50);
    }
}

// Choix d'un élément à placer depuis la barre de droite 2D
// Nom court d'un élément posé (ligne d'aide et bannière)
function placementLabel(type) {
    const names = { door_single: 'Porte', window_std: 'Fenêtre', shaft: 'Trémie', stair: 'Escalier', light_ceiling: 'Plafonnier', wall: 'Mur' };
    return names[type] || ELEMENT_LABELS[type] || type;
}

// Garde-fou : pas deux appareils identiques au même endroit (même mur, même niveau, à moins de 30 cm)
const SAME_SPOT_CM = 30;
// Prises : seul un emplacement quasi identique est refusé, car les prises se posent côte à côte (double, triple…)
const OUTLET_SAME_SPOT_CM = 2;
// Portes et fenêtres : refusées si leurs emprises se chevauchent sur le même mur (largeur prise en compte)
const OPENING_TYPES = ['door_single', 'window_std'];
function openingWidthOf(o) { return o.width || (o.type === 'door_single' ? 96 : 120); }
// Autre ouverture (≠ op) dont l'emprise chevaucherait op placée en wallId à distCm ; null sinon
function openingOverlapWith(op, wallId, distCm) {
    const w = openingWidthOf(op);
    return (projectData.openings || []).find(o => o.id !== op.id && o.levelId === op.levelId && o.wallId === wallId
        && Math.abs((o.distanceFromStart || 0) - distCm) < (openingWidthOf(o) + w) / 2) || null;
}
// Déplacement d'une porte ou fenêtre refusé s'il chevaucherait une autre ouverture (les autres objets : inchangé)
function openingMoveBlocked(item, wallId, distCm) {
    return !!(item && OPENING_TYPES.includes(item.type) && openingOverlapWith(item, wallId, distCm));
}
// Emprise en plan d'une porte ou fenêtre : longueur comme en 3D, épaisseur du mur
function openingRectOf(op) {
    const w = (projectData.walls || []).find(x => x.id === op.wallId);
    const p = w && openingPos2D(op);
    return p ? orientedRect(p.x, p.y, p.angle, openingBox(op, w).half, p.th / 2) : null;
}
// Paires de portes/fenêtres qui se chevauchent : même mur (largeurs), ou murs voisins au coin (emprises en plan)
function computeOpeningOverlaps() {
    const list = [], ops = openingsOn();
    ops.forEach((a, i) => ops.slice(i + 1).forEach(b => {
        if (a.wallId === b.wallId) {
            if (Math.abs((a.distanceFromStart || 0) - (b.distanceFromStart || 0)) < (openingWidthOf(a) + openingWidthOf(b)) / 2) list.push({ a, b });
            return;
        }
        const ra = openingRectOf(a), rb = openingRectOf(b);
        if (ra && rb && rectsOverlap(ra, rb)) list.push({ a, b });
    }));
    return list;
}
function sameSpotBlocker(type, levelId, wallId, distCm, width) {
    if (OPENING_TYPES.includes(type)) {
        const w = width || openingWidthOf({ type });
        return (projectData.openings || []).find(o => o.levelId === levelId && o.wallId === wallId
            && Math.abs((o.distanceFromStart || 0) - distCm) < (openingWidthOf(o) + w) / 2) || null;
    }
    const pool = [...(projectData.electrical || []), ...(projectData.shafts || [])];
    const tol = GANGABLE_OUTLETS.includes(type) ? OUTLET_SAME_SPOT_CM : SAME_SPOT_CM;
    return pool.find(e => e.levelId === levelId && (e.type || 'shaft') === type && e.wallId === wallId
        && Math.abs((e.distanceFromStart || 0) - distCm) < tol) || null;
}
// Idem pour un plafonnier : à moins de 30 cm (en plan) d'un autre plafonnier du niveau
function ceilingSpotBlocker(x, z, levelId) {
    return (projectData.electrical || []).find(e => e.levelId === levelId && CEILING_TYPES.includes(e.type)
        && Math.hypot(e.x - x, e.z - z) < SAME_SPOT_CM) || null;
}
function refuseSameSpot() {
    showNotification('Un élément identique est déjà à cet endroit (moins de 30 cm) : pose annulée', 'error');
}

// Ligne d'aide du mode « poser » en 2D
function placementHintText(type) {
    const where = CEILING_TYPES.includes(type) ? 'cliquez dans la pièce, au plafond' : type === 'stair' ? 'cliquez sur le plan, au centre de l’emprise' : 'cliquez sur un mur';
    return 'Pose : ' + placementLabel(type) + ' ; ' + where + ' (Échap pour arrêter)';
}

// Boutons de placement communs aux sidebars 2D et 3D
function pickPlacement(type) {
    if (currentMode === '2d') {
        // second clic sur l'outil déjà actif : on arrête la pose, comme en 3D
        if (currentTool === 'place' && document.getElementById('place-type').value === type) { setTool('select'); return; }
        setPlaceType2D(type);
    } else setPlacementType(type);
}

function setPlaceType2D(type) {
    document.getElementById('place-type').value = type;
    if (type === 'shaft' || type === 'stair') renderLevelSelector();   // liste « Relier à » à jour
    setTool('place');
}

// Mode affiché : un seul libellé, le même en 2D et en 3D
const MODE_BADGES = { select: 'Mode : sélection', wall: 'Mode : tracer un mur', place: 'Mode : pose d’appareil', pan: 'Mode : déplacer la vue' };

function currentModeKey() {
    if (currentMode === '3d') return activePlacementType === 'wall' ? 'wall' : (activePlacementType ? 'place' : 'select');
    return MODE_BADGES[currentTool] ? currentTool : 'select';
}

function selectionCount() {
    return selectedWallIds.length + selectedDeviceIds.length + selectedOpeningIds.length || (selected3DId ? 1 : 0);
}

// Phrase d'aide selon le mode (les actions en cours la remplacent, en 2D)
function modeHint(key) {
    if (key === 'wall') {
        if (currentMode === '3d') return traceBannerText3D();
        return drawingStartPoint
            ? 'Cliquez pour poser le point suivant. Clic droit ou Échap pour arrêter.'
            : 'Cliquez pour placer le premier point du mur. Clic droit pour terminer.';
    }
    if (key === 'place') return placementHintText(currentMode === '3d' ? activePlacementType : document.getElementById('place-type').value);
    if (key === 'pan') return 'Faites glisser le plan avec le bouton gauche de la souris.';
    return 'Cliquez un élément pour le sélectionner. Glissez dans le vide pour en encadrer plusieurs. Ctrl ou Maj + clic pour ajouter.';
}

// Libellé du mode et phrase d'aide : mêmes emplacements en 2D et en 3D (haut de la sidebar gauche, coin haut-gauche du plan)
function refreshToolHint() {
    const key = currentModeKey();
    let hint = modeHint(key);
    const n = selectionCount();
    if (key === 'select' && n) {
        hint = (n === 1 ? '1 élément sélectionné' : n + ' éléments sélectionnés') + ' : glissez pour déplacer, Suppr pour effacer, Échap pour désélectionner.';
    }
    if (currentMode !== '3d') {
        if (draggingWall) {
            hint = draggingWall.mode === 'move'
                ? 'Glissez pour déplacer le mur ; relâchez pour valider (Ctrl+Z pour annuler).'
                : 'Longueur : ' + (Math.hypot(draggingWall.wall.x2 - draggingWall.wall.x1, draggingWall.wall.y2 - draggingWall.wall.y1) / 100).toFixed(2).replace('.', ',') + ' m ; relâchez pour valider (Ctrl+Z pour annuler).';
        } else if (draggingEl2D) {
            hint = 'Glissez le long du mur ; relâchez pour valider (Ctrl+Z pour annuler).';
        } else if (selectionBoxStart) {
            hint = 'Relâchez pour sélectionner ce qui est encadré (Ctrl ou Maj pour ajouter).';
        }
    }
    updateStopPlacementButton(key);
    const badge = document.getElementById('active-tool-badge');
    const hintEl = document.getElementById('drawing-instruction-hint');
    const badgeText = MODE_BADGES[key];
    if (badge.textContent !== badgeText) badge.textContent = badgeText;
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
}
// L'indication se place dans le coin haut-gauche du plan, en 2D comme en 3D
function placeToolHint() {
    const wrap = document.getElementById('tool-hint');
    const slot = document.getElementById('tool-hint-slot-3d');
    if (!wrap || !slot) return;
    const mark = sharedHomeMark(wrap);
    if (currentMode === '3d') slot.appendChild(wrap);
    else mark.parentNode.insertBefore(wrap, mark);
}

// Bulle d'aide du plan : fermable (croix) et rouvrable (pastille « ? »). Le choix est gardé d'une visite à l'autre.
const TOOL_HINT_KEY = 'cv_aide_plan_v1';
function setToolHintOpen(open) {
    if (!document.getElementById('tool-hint')) return;
    document.getElementById('drawing-instruction-hint').classList.toggle('hidden', !open);
    document.getElementById('tool-hint-close').classList.toggle('hidden', !open);
    document.getElementById('tool-hint-open').classList.toggle('hidden', open);
    localStorage.setItem(TOOL_HINT_KEY, open ? 'ouverte' : 'fermee');
}


function setTool(tool) {
    currentTool = tool;
    placeGhost2D = null;
    drawingStartPoint = null;
    mouseCurrentPos = null;
    draggingWall = null;
    selectionBoxStart = null;
    selectionBoxEnd = null;
    refreshToolButtons(tool);
    const panCanvasButton = document.getElementById('btn-pan-canvas');
    if (panCanvasButton) {
        panCanvasButton.className = tool === 'pan'
            ? 'w-9 h-9 rounded-xl border border-yellow-400 ring-1 ring-yellow-400/60 bg-slate-800 flex items-center justify-center transition'
            : 'w-9 h-9 rounded-xl border border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition';
        panCanvasButton.title = tool === 'pan'
            ? 'Déplacement actif : faites glisser avec le bouton gauche'
            : 'Activer le déplacement du plan à la souris gauche';
    }
    const currentType = document.getElementById('place-type').value;
    refreshToolHint();
    // Palette de placement dans la barre de droite : le type courant est surligné quand l'outil « placer » est actif
    document.querySelectorAll('.place-btn2d').forEach(b => b.classList.toggle('tool-active-yellow', tool === 'place' && b.dataset.type === currentType));
    if (tool !== 'select' && selected3DId) { selected3DId = null; selectedCircuitId = null; syncElementInspectors(); updateCircuitsUI(); }
    if (tool !== 'select') {
        setSelectedWalls([]);
    }
    syncDefaultSpecs();
    refreshPlacementHints();
    redraw2D();
}

function setSelectedWalls(ids) {
    const selected = new Set(ids);
    selectedWallIds = wallsOn().filter(w => selected.has(w.id)).map(w => w.id);
    selectedWallId = selectedWallIds[0] || null;

    const inspector = document.getElementById('wall-inspector');
    inspector.classList.toggle('hidden', selectedWallIds.length === 0);
    syncDefaultSpecs();
    updateWallEditButtons();
    updateDeselectButtons();
    if (!selectedWallIds.length) return;

    const walls = projectData.walls.filter(w => selected.has(w.id));
    const multiple = walls.length > 1;
    document.getElementById('wall-inspector-title').textContent = multiple
        ? walls.length + ' murs sélectionnés' : 'Inspecteur de Mur';
    document.getElementById('wall-inspector-description').textContent = multiple
        ? 'Modifiez ensemble l’épaisseur et la hauteur des murs sélectionnés.' : 'Modifiez la longueur exacte ou déplacez le mur.';
    document.getElementById('inspector-length-container').classList.toggle('hidden', multiple);
    document.getElementById('inspector-thickness-label').textContent = multiple
        ? 'Épaisseur (' + walls.length + ' murs)' : 'Épaisseur';
    document.getElementById('inspector-height-label').textContent = multiple
        ? 'Hauteur (' + walls.length + ' murs)' : 'Hauteur';

    const thicknesses = new Set(walls.map(w => w.thickness));
    document.getElementById('inspector-thickness').value = walls[0].thickness;
    document.getElementById('inspector-thickness-val').textContent = thicknesses.size === 1
        ? walls[0].thickness + ' cm' : 'Variable';
    const heights = new Set(walls.map(w => w.height));
    document.getElementById('inspector-height').value = walls[0].height;
    document.getElementById('inspector-height-val').textContent = heights.size === 1
        ? (walls[0].height / 100).toFixed(2) + ' m' : 'Variable';
    if (!multiple) {
        const lengthM = Math.hypot(walls[0].x2 - walls[0].x1, walls[0].y2 - walls[0].y1) / 100;
        document.getElementById('inspector-length-input').value = lengthM.toFixed(2);
        document.getElementById('inspector-length-val').textContent = lengthM.toFixed(2) + ' m';
    }
}

function updateWallSpec(prop, val) {
    if (prop === 'thickness') {
        activeWallThickness = Math.max(5, Math.min(50, parseInt(val)));
        document.getElementById('val-thickness').textContent = activeWallThickness + ' cm';
    } else if (prop === 'height') {
        activeWallHeight = parseInt(val);
        document.getElementById('val-height').textContent = (val / 100).toFixed(2) + ' m';
    }
}

function updateSelectedWallProp(prop, val) {
    if (!selectedWallIds.length) return;
    if (!canEditWalls()) {
        showNotification(wallEditRefusedMessage(), "info");
        updateWallEditButtons();
        return;
    }
    saveStateToUndo();
    if (prop === 'thickness') {
        const thickness = Math.max(5, Math.min(50, parseInt(val)));
        selectedWallIds.forEach(id => {
            const wall = projectData.walls.find(w => w.id === id);
            if (wall) wall.thickness = thickness;
        });
        document.getElementById('inspector-thickness').value = thickness;
        document.getElementById('inspector-thickness-val').textContent = thickness + ' cm';
    } else if (prop === 'height') {
        const height = Math.max(200, Math.min(400, parseInt(val)));
        selectedWallIds.forEach(id => {
            const wall = projectData.walls.find(w => w.id === id);
            if (wall) wall.height = height;
        });
        document.getElementById('inspector-height').value = height;
        document.getElementById('inspector-height-val').textContent = (height / 100).toFixed(2) + ' m';
    }
    refreshSelectedView();
}

function updateSelectedWallLength(valStr) {
    if (!selectedWallId) return;
    if (!canEditWalls()) {
        showNotification(wallEditRefusedMessage(), "info");
        updateWallEditButtons();
        return;
    }
    const newLenM = parseFloat(valStr);
    if (isNaN(newLenM) || newLenM <= 0) return;
    const wall = projectData.walls.find(w => w.id === selectedWallId);
    if (!wall) return;

    const currentLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (currentLen === 0) return;
    const newLenCm = newLenM * 100;
    const ratio = newLenCm / currentLen;
    const nx2 = wall.x1 + (wall.x2 - wall.x1) * ratio;
    const ny2 = wall.y1 + (wall.y2 - wall.y1) * ratio;

    // sécurité trémie : on teste la nouvelle longueur, puis on l'applique seulement si aucun câble ne se coupe
    const linksBefore = shaftLinksValid();
    const ox2 = wall.x2, oy2 = wall.y2;
    wall.x2 = nx2; wall.y2 = ny2;
    const lost = shaftLinksLostSince(linksBefore);
    wall.x2 = ox2; wall.y2 = oy2;
    if (lost.length) {
        showNotification(shaftRefusalMessage(lost), 'error');
        document.getElementById('inspector-length-input').value = (currentLen / 100).toFixed(2);
        return;
    }

    saveStateToUndo();
    wall.x2 = nx2;
    wall.y2 = ny2;

    document.getElementById('inspector-length-val').textContent = newLenM.toFixed(2) + ' m';
    refreshSelectedView();
    showNotification("Longueur du mur mise à jour", "success");
}

// C2 : suppression de toute la sélection 2D (murs, appareils, ouvertures)
// Suppr : supprime la sélection courante, en 2D comme en 3D (murs, appareils, ouvertures, trémies, escaliers)
function deleteCurrentSelection() {
    const shaftSelected = [...(projectData.shafts || []), ...(projectData.stairs || [])].some(s => s.id === selected3DId);
    if (currentMode === '3d' && selected3DId) return deleteSelected3DElement();   // élément 3D : prioritaire
    if (selectedWallIds.length || (currentMode === '2d' && (selectedDeviceIds.length || selectedOpeningIds.length || shaftSelected))) return deleteMultiSelection();
    if (selected3DId) return deleteSelected3DElement();
}

// Verrou des murs : aucun mur ne se supprime tant qu'ils sont verrouillés (trémies, ouvertures et appareils restent modifiables)
function refuseIfWallsLocked() {
    if (!projectData.wallsLocked) return false;
    showNotification('Murs verrouillés : déverrouillez-les pour supprimer un mur.', 'error');
    return true;
}

async function deleteMultiSelection() {
    // murs verrouillés : on ne les retire pas, les autres éléments sélectionnés restent supprimables
    const wallIds = new Set(projectData.wallsLocked ? [] : selectedWallIds);
    if (selectedWallIds.length && projectData.wallsLocked) showNotification('Murs verrouillés : les murs sélectionnés ne seront pas supprimés.', 'info');
    const devIds = new Set(selectedDeviceIds);
    const opIds = new Set(selectedOpeningIds);
    const shIds = new Set([...(projectData.shafts || []), ...(projectData.stairs || [])].filter(s => s.id === selected3DId).map(s => s.id));
    const n = wallIds.size + devIds.size + opIds.size + shIds.size;
    if (!n) return;
    const parts = [];
    if (wallIds.size) parts.push(wallIds.size > 1 ? wallIds.size + ' murs' : 'le mur sélectionné');
    if (devIds.size) parts.push(devIds.size > 1 ? devIds.size + ' appareils' : 'l’appareil sélectionné');
    if (opIds.size) parts.push(opIds.size > 1 ? opIds.size + ' ouvertures' : 'l’ouverture sélectionnée');
    if (shIds.size) parts.push('la trémie ou l’escalier sélectionné');
    if (!(await confirmDeletion(parts.join(' et ')))) return;
    saveStateToUndo();
    projectData.walls = projectData.walls.filter(w => !wallIds.has(w.id));
    projectData.openings = projectData.openings.filter(o => !wallIds.has(o.wallId) && !opIds.has(o.id));
    projectData.electrical = projectData.electrical.filter(el => !wallIds.has(el.wallId) && !devIds.has(el.id));
    projectData.shafts = (projectData.shafts || []).filter(s => !wallIds.has(s.wallId) && !shIds.has(s.id));
    projectData.stairs = (projectData.stairs || []).filter(s => !shIds.has(s.id));
    if (shIds.size) selected3DId = null;
    selectedDeviceIds = [];
    selectedOpeningIds = [];
    setSelectedWalls([]);
    syncElementInspectors();
    updateStats();
    refreshSelectedView();
    showNotification(n > 1 ? n + ' éléments supprimés' : 'Élément supprimé', 'success');
}

// ---------- Niveaux (D2) ----------
function refreshAfterLevelChange() {
    renderLevelSelector();
    setSelectedWalls([]);
    selected3DId = null;
    selectedDeviceIds = [];
    selectedOpeningIds = [];
    syncElementInspectors();
    updateStats();
    redraw2D();
    if (currentMode === '3d') build3DScene();
    updateCircuitsUI();
}

function renderLevelSelector() {
    const sel = document.getElementById('level-select');
    if (!sel) return;
    if (!projectData.levels.some(l => l.id === activeLevelId)) activeLevelId = projectData.levels[0].id;
    const levels = [...projectData.levels].sort((a, b) => b.elevation - a.elevation);   // étages les plus hauts en premier
    sel.innerHTML = levels.map(l => '<option value="' + esc(l.id) + '">' + esc(l.name) + ' (' + (l.elevation / 100).toFixed(2) + ' m)</option>').join('');
    sel.value = activeLevelId;
    // niveaux reliables à une trémie ou un escalier : cases à cocher
    ['shaft-link-list', 'shaft-link-list-3d'].forEach(renderShaftLinkList);
}

// Cases « Niveaux reliés » : le plus proche en cote est coché au premier affichage, les choix sont ensuite conservés
function renderShaftLinkList(listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    const others = otherLevelsByDistance();
    if (!others.length) {
        list.innerHTML = '<span class="text-slate-400">Aucun autre niveau : ajoutez un étage pour le relier.</span>';
        return;
    }
    const firstTime = !list.querySelector('input');
    const prev = new Set([...list.querySelectorAll('input:checked')].map(i => i.value));
    list.innerHTML = others.map((l, i) => {
        const checked = firstTime ? i === 0 : prev.has(l.id);
        return '<label class="flex items-center gap-2 cursor-pointer">' +
            '<input type="checkbox" value="' + esc(l.id) + '" class="accent-yellow-400"' + (checked ? ' checked' : '') + '>' +
            '<span>' + esc(l.name) + ' (' + (l.elevation / 100).toFixed(2) + ' m)</span></label>';
    }).join('');
}

// Liste « Niveaux reliés » créée par le code si elle manque dans index.html
function ensureShaftLinkControl() {
    if (document.getElementById('shaft-link-list')) return;
    const btn = document.getElementById('btn-2d-place-shaft');
    if (!btn) return;
    const wrap = document.createElement('div');
    wrap.className = 'col-span-2 flex flex-col gap-1 text-[11px] text-slate-300';
    wrap.innerHTML = '<span class="font-semibold">Niveaux reliés</span><div id="shaft-link-list" class="flex flex-col gap-1"></div>';
    btn.insertAdjacentElement('afterend', wrap);
}

// Autres niveaux, du plus proche en cote au plus lointain (pour relier une trémie)
function otherLevelsByDistance() {
    const cur = projectData.levels.find(l => l.id === activeLevelId);
    if (!cur) return [];
    return projectData.levels.filter(l => l.id !== activeLevelId)
        .sort((a, b) => Math.abs(a.elevation - cur.elevation) - Math.abs(b.elevation - cur.elevation));
}

function setActiveLevel(id) {
    if (!projectData.levels.some(l => l.id === id)) return;
    activeLevelId = id;
    refreshAfterLevelChange();
}

// Murs extérieurs d'un niveau : un mur est extérieur si l'un de ses deux côtés touche l'extérieur du bâtiment.
// On trace les murs sur une grille de 2 cm, on remplit l'extérieur depuis le bord, puis on regarde chaque côté.
// Faces extérieures des murs d'un niveau : pour chaque mur, les côtés (+1 / -1, comme les pistes du câblage)
// qui donnent sur l'extérieur du logement. isOutside(x, y) dit si un point du plan est dehors.
function outsideFacesOf(levelId) {
    const walls = wallsOn(levelId);
    const faces = new Map();
    if (!walls.length) return { faces, isOutside: () => false };
    const margin = 100, cell = 2;
    const minX = Math.min(...walls.map(w => Math.min(w.x1, w.x2))) - margin;
    const minY = Math.min(...walls.map(w => Math.min(w.y1, w.y2))) - margin;
    const maxX = Math.max(...walls.map(w => Math.max(w.x1, w.x2))) + margin;
    const maxY = Math.max(...walls.map(w => Math.max(w.y1, w.y2))) + margin;
    const W = Math.ceil((maxX - minX) / cell) + 1, H = Math.ceil((maxY - minY) / cell) + 1;
    const toC = (x, y) => [Math.round((x - minX) / cell), Math.round((y - minY) / cell)];
    const solid = new Uint8Array(W * H);
    walls.forEach(w => {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        const half = (w.thickness || 10) / 2;
        const steps = Math.ceil(len / (cell / 2));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = w.x1 + (w.x2 - w.x1) * t, py = w.y1 + (w.y2 - w.y1) * t;
            for (let dx = -half; dx <= half; dx += cell / 2) {
                for (let dy = -half; dy <= half; dy += cell / 2) {
                    const [cx, cy] = toC(px + dx, py + dy);
                    if (cx >= 0 && cy >= 0 && cx < W && cy < H) solid[cy * W + cx] = 1;
                }
            }
        }
    });
    const outside = new Uint8Array(W * H);
    const queue = [0];
    outside[0] = 1;
    for (let q = 0; q < queue.length; q++) {
        const idx = queue[q], x = idx % W, y = (idx - x) / W;
        [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(([nx, ny]) => {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
            const n = ny * W + nx;
            if (outside[n] || solid[n]) return;
            outside[n] = 1;
            queue.push(n);
        });
    }
    const isOutside = (x, y) => {
        const [cx, cy] = toC(x, y);
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
        return outside[cy * W + cx] === 1;
    };
    walls.forEach(w => {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        // même normale que les pistes du câblage : (dy, -dx) / longueur
        const nx = (w.y2 - w.y1) / len, ny = -(w.x2 - w.x1) / len;
        const off = (w.thickness || 10) / 2 + 3;
        const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
        const sides = [1, -1].filter(s => {
            const [cx, cy] = toC(mx + s * off * nx, my + s * off * ny);
            return cx >= 0 && cy >= 0 && cx < W && cy < H && outside[cy * W + cx] === 1;
        });
        faces.set(w.id, sides);
    });
    return { faces, isOutside };
}

function exteriorWallsOf(levelId) {
    const { faces } = outsideFacesOf(levelId);
    return wallsOn(levelId).filter(w => (faces.get(w.id) || []).length > 0);
}

// Création : nom et cote demandés. Par défaut : sous-sol à −2,60 m ; étage à la cote la plus haute + 2,70 m.
// Option : recopier les murs extérieurs du niveau affiché (même contour, sans ouvertures ni appareils).
// ---------- Nouvel étage : proposition de nom et de cote selon les niveaux existants ----------
let levelDialogDown = false;

function suggestLevelName(down) {
    const taken = new Set((projectData.levels || []).map(l => l.name.trim().toLowerCase()));
    const base = down ? 'Sous-sol' : 'Étage';
    for (let k = 1; k < 500; k++) {
        const cand = (k === 1 && down) ? base : base + ' ' + k;
        if (!taken.has(cand.toLowerCase())) return cand;
    }
    return base + ' ' + Date.now();
}

// Au-dessus du niveau le plus haut, ou sous le plus bas : on tient compte de la hauteur sous plafond de chacun
function suggestLevelElevation(down) {
    const levels = projectData.levels;
    if (!down) {
        const top = levels.reduce((x, y) => (y.elevation > x.elevation ? y : x));
        return { cm: top.elevation + (top.ceilingHeight || 250) + 30, from: top, above: true };
    }
    const bottom = levels.reduce((x, y) => (y.elevation < x.elevation ? y : x));
    const rdc = levels.find(l => l.id === 'lvl_rdc') || levels[0];
    return { cm: bottom.elevation - ((rdc.ceilingHeight || 250) + 30), from: bottom, above: false };
}

function setLevelDialogKind(down) {
    levelDialogDown = down;
    const up = document.getElementById('ld-kind-up'), dn = document.getElementById('ld-kind-down');
    up.className = 'px-2 py-2 rounded-lg border ' + (down ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-emerald-500 bg-emerald-500/20 text-emerald-300');
    dn.className = 'px-2 py-2 rounded-lg border ' + (down ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300');
    document.getElementById('ld-name').value = suggestLevelName(down);
    const sug = suggestLevelElevation(down);
    document.getElementById('ld-elev').value = (sug.cm / 100).toFixed(2);
    document.getElementById('ld-hint').textContent = 'Proposition : ' + (sug.above ? 'au-dessus de ' : 'sous ') + '« ' + sug.from.name + ' ». Vous pouvez modifier la cote.';
    const active = projectData.levels.find(l => l.id === activeLevelId);
    const hasWalls = !!active && wallsOn(activeLevelId).length > 0;
    const copy = document.getElementById('ld-copy');
    copy.disabled = !hasWalls;
    copy.checked = hasWalls;
    document.getElementById('ld-copy-label').textContent = hasWalls ? 'Copier les murs extérieurs de « ' + active.name + ' »' : 'Pas de murs à copier depuis le niveau affiché';
    document.getElementById('ld-error').classList.add('hidden');
}

function addLevel(asBasement = false) {
    document.getElementById('level-dialog').classList.remove('hidden');
    setLevelDialogKind(!!asBasement);
    document.getElementById('ld-name').focus();
}

function closeLevelDialog() {
    document.getElementById('level-dialog').classList.add('hidden');
}

function levelDialogError(msg) {
    const box = document.getElementById('ld-error');
    box.textContent = msg;
    box.classList.remove('hidden');
}

function confirmLevelDialog() {
    const name = document.getElementById('ld-name').value.trim();
    if (!name) { levelDialogError('Donnez un nom au niveau.'); return; }
    if (projectData.levels.some(l => l.name.trim().toLowerCase() === name.toLowerCase())) { levelDialogError('Ce nom existe déjà.'); return; }
    const raw = document.getElementById('ld-elev').value;
    const m = parseFloat(String(raw).replace('−', '-').replace(',', '.').trim());
    if (!isFinite(m)) { levelDialogError('Cote invalide : indiquez des mètres, par exemple 2,70.'); return; }
    const cm = Math.round(m * 100);
    if (projectData.levels.some(l => l.elevation === cm)) { levelDialogError('Un niveau existe déjà à cette cote.'); return; }
    const rdc = projectData.levels.find(l => l.id === 'lvl_rdc') || projectData.levels[0];
    const copy = document.getElementById('ld-copy');
    const toCopy = copy.checked && !copy.disabled ? exteriorWallsOf(activeLevelId) : [];
    saveStateToUndo();
    const id = 'lvl_' + Date.now();
    projectData.levels.push({ id, name, elevation: cm, ceilingHeight: rdc.ceilingHeight || 250 });
    toCopy.forEach((w, i) => projectData.walls.push({ ...w, id: 'w_' + Date.now() + '_' + i, levelId: id }));
    activeLevelId = id;
    closeLevelDialog();
    refreshAfterLevelChange();
    showNotification('Niveau ajouté : ' + name, 'success');
}

// Renommage du niveau affiché (sous-sols compris)
async function renameActiveLevel() {
    const lvl = projectData.levels.find(l => l.id === activeLevelId);
    if (!lvl) return;
    const values = await askFields('Renommer le niveau', [{ id: 'name', label: 'Nouveau nom du niveau', value: lvl.name }], 'Renommer', v => {
        if (!v.name) return 'Le nom ne peut pas être vide.';
        if (projectData.levels.some(l => l.id !== lvl.id && l.name.trim().toLowerCase() === v.name.toLowerCase())) return 'Ce nom existe déjà.';
        return null;
    });
    if (values === null) return;
    const name = values.name;
    if (name === lvl.name) return;
    saveStateToUndo();
    lvl.name = name;
    renderLevelSelector();
    updateCircuitsUI();
    if (currentMode === '3d') build3DScene(); else redraw2D();
    showNotification('Niveau renommé : ' + name, 'success');
}

// Cote (altitude) et hauteur sous plafond du niveau affiché, modifiables après création
async function editActiveLevelHeights() {
    const lvl = projectData.levels.find(l => l.id === activeLevelId);
    if (!lvl) return;
    const parseMeters = v => parseFloat(String(v).replace('−', '-').replace(',', '.').trim());
    const parseCm = v => Math.round(parseFloat(String(v).replace(',', '.').trim()));
    const values = await askFields('Cote et plafond du niveau « ' + lvl.name + ' »', [
        { id: 'elev', label: 'Cote en mètres (ex. 2,70 ou -2,50)', value: String(lvl.elevation / 100).replace('.', ','), inputmode: 'decimal' },
        { id: 'ceil', label: 'Hauteur sous plafond en centimètres (150 à 500)', value: String(lvl.ceilingHeight || 250), inputmode: 'numeric' }
    ], 'Enregistrer', v => {
        const m = parseMeters(v.elev);
        if (!isFinite(m)) return 'Cote invalide : indiquez des mètres, par exemple 2,70.';
        if (projectData.levels.some(l => l.id !== lvl.id && l.elevation === Math.round(m * 100))) return 'Un autre niveau existe déjà à cette cote.';
        const ch = parseCm(v.ceil);
        if (!isFinite(ch) || ch < 150 || ch > 500) return 'Hauteur sous plafond invalide : entre 150 et 500 cm.';
        return null;
    });
    if (values === null) return;
    const elevation = Math.round(parseMeters(values.elev) * 100);
    const ceilingHeight = parseCm(values.ceil);
    if (elevation === lvl.elevation && ceilingHeight === (lvl.ceilingHeight || 250)) return;
    saveStateToUndo();
    lvl.elevation = elevation;
    lvl.ceilingHeight = ceilingHeight;
    refreshAfterLevelChange();
    showNotification('Niveau « ' + lvl.name + ' » : cote ' + (elevation / 100).toFixed(2).replace('.', ',') + ' m, plafond ' + ceilingHeight + ' cm', 'success');
}

// Charnière et « Relier à » : affichés seulement pour l'outil correspondant
function refreshPlacementHints() {
    const sel = document.getElementById('place-type');
    const type2d = currentTool === 'place' && sel ? sel.value : null;
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
    show('door-hinge-placement-container', type2d === 'door_single');
    show('shaft-link-wrap', type2d === 'shaft' || type2d === 'stair');
    show('door-hinge-3d-placement-container', activePlacementType === 'door_single');
    show('shaft-link-wrap-3d', activePlacementType === 'shaft' || activePlacementType === 'stair');
}

// Suppression du niveau affiché, après confirmation. Passe par l'annulation.
async function deleteActiveLevel() {
    const levels = projectData.levels;
    if (levels.length <= 1) { showNotification('Il faut garder au moins un niveau', 'error'); return; }
    const lvl = levels.find(l => l.id === activeLevelId);
    if (!lvl) return;
    const nW = wallsOn().length, nO = openingsOn().length, nE = electricalOn().length;
    if (!await askConfirm('Supprimer le niveau', 'Supprimer le niveau « ' + lvl.name + ' » avec ses ' + nW + ' murs, ' + nO + ' ouvertures et ' + nE + ' appareils ? Vous pourrez annuler.', 'Supprimer le niveau', { danger: true })) return;
    saveStateToUndo();
    const id = lvl.id;
    projectData.walls = projectData.walls.filter(w => w.levelId !== id);
    projectData.openings = projectData.openings.filter(o => o.levelId !== id);
    projectData.electrical = projectData.electrical.filter(el => el.levelId !== id);
    // une trémie reliée à deux niveaux garde l'autre niveau ; sans lien restant, elle part
    projectData.shafts = (projectData.shafts || []).map(sh => {
        const ids = (sh.levelIds || [sh.levelId]).filter(x => x !== id);
        return ids.length ? Object.assign({}, sh, { levelIds: ids, levelId: ids[0] }) : null;
    }).filter(Boolean);
    projectData.stairs = (projectData.stairs || []).map(st => {
        const ids = (st.levelIds || [st.levelId]).filter(x => x !== id);
        return ids.length ? Object.assign({}, st, { levelIds: ids, levelId: ids[0] }) : null;
    }).filter(Boolean);
    projectData.levels = levels.filter(l => l.id !== id);
    activeLevelId = projectData.levels[0].id;
    refreshAfterLevelChange();
    showNotification('Niveau supprimé', 'success');
}

// Taille de la trémie sélectionnée (D5). Une seule annulation par glissement du curseur.
let shaftUndoPending = false;
function setShaftSize(v) {
    const sh = (projectData.shafts || []).find(s => s.id === selected3DId);
    if (!sh) return;
    if (!shaftUndoPending) { saveStateToUndo(); shaftUndoPending = true; }
    sh.size = Math.max(20, Math.min(120, parseInt(v, 10) || 40));
    document.getElementById('shaft-size-val').textContent = sh.size + ' cm';
    refreshSelectedView();   // 2D et 3D : la taille de la trémie se voit dans les deux vues
}

// Trémie sélectionnée : cases des niveaux reliés. Le niveau d'origine (où la trémie est posée) reste toujours relié.
function renderShaftLevelEditor(sh) {
    const list = document.getElementById('shaft-edit-levels');
    if (!list) return;
    const origin = sh.levelId || sh.levelIds[0];
    const originLevel = projectData.levels.find(l => l.id === origin);
    const originElev = originLevel ? originLevel.elevation : 0;
    const linked = new Set(sh.levelIds || [origin]);
    const others = projectData.levels.filter(l => l.id !== origin)
        .sort((a, b) => Math.abs(a.elevation - originElev) - Math.abs(b.elevation - originElev));
    const head = '<span class="text-slate-400">' + esc(originLevel ? originLevel.name : origin) + ' : niveau d’origine (toujours relié)</span>';
    if (!others.length) {
        list.innerHTML = head + '<span class="text-slate-400">Aucun autre niveau à relier.</span>';
        return;
    }
    list.innerHTML = head + others.map(l =>
        '<label class="flex items-center gap-2 cursor-pointer">' +
        '<input type="checkbox" value="' + esc(l.id) + '" class="accent-yellow-400"' + (linked.has(l.id) ? ' checked' : '') + '>' +
        '<span>' + esc(l.name) + ' (' + (l.elevation / 100).toFixed(2) + ' m)</span></label>').join('');
    list.onchange = e => { if (e.target.type === 'checkbox') setShaftLinkedLevel(e.target.value, e.target.checked); };
}

// Ajoute ou retire un niveau relié à la trémie sélectionnée. Refus si la trémie ne tomberait pas sur un mur de cet étage,
// ou s'il ne resterait qu'un seul niveau.
function setShaftLinkedLevel(levelId, on) {
    const sh = (projectData.shafts || []).find(s => s.id === selected3DId);
    if (!sh) return;
    const origin = sh.levelId || sh.levelIds[0];
    const wanted = new Set(sh.levelIds || [origin]);
    if (on) wanted.add(levelId); else wanted.delete(levelId);
    const relinked = [origin, ...projectData.levels.map(l => l.id).filter(id => id !== origin && wanted.has(id))];
    const lvName = (projectData.levels.find(l => l.id === levelId) || {}).name || levelId;
    if (on && !shaftValidOn(sh, levelId)) {
        showNotification('Pas de mur sous la trémie à l’étage ' + lvName + ' : elle ne peut pas le relier. Ajoutez d’abord un mur à cet emplacement.', 'error');
    } else if (!on && relinked.length < 2) {
        showNotification('Une trémie relie au moins deux niveaux.', 'error');
    } else {
        saveStateToUndo();
        sh.levelId = origin;
        sh.levelIds = relinked;
        // l'étage affiché n'est plus relié : la trémie disparaît de cette vue, sa sélection s'arrête
        if (!relinked.includes(activeLevelId)) selected3DId = null;
    }
    syncElementInspectors();
    refreshSelectedView();
}

// Escalier sélectionné : largeur, longueur, rotation. Une seule annulation par glissement du curseur.
let stairUndoPending = false;
function syncStairInspector(st) {
    const width = st.width || 90, length = st.length || 300;
    const angle = ((st.angleDeg || 0) % 360 + 360) % 360;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    // deux jeux de réglages : barre 2D (trémie) et panneau 3D
    ['', '-3d'].forEach(sfx => {
        set('stair-width' + sfx, width); txt('stair-width-val' + sfx, width + ' cm');
        set('stair-length' + sfx, length); txt('stair-length-val' + sfx, length + ' cm');
        set('stair-angle' + sfx, Math.round(angle)); txt('stair-angle-val' + sfx, Math.round(angle) + '°');
    });
}
function setStairProp(prop, v) {
    const st = (projectData.stairs || []).find(s => s.id === selected3DId);
    if (!st) return;
    if (!stairUndoPending) { saveStateToUndo(); stairUndoPending = true; }
    const n = parseFloat(v) || 0;
    if (prop === 'width') st.width = Math.max(60, Math.min(150, n));
    if (prop === 'length') st.length = Math.max(150, Math.min(600, n));
    if (prop === 'angle') st.angleDeg = ((n % 360) + 360) % 360;
    snapStairToWalls(st);
    syncStairInspector(st);
    if (currentMode === '3d') build3DScene(); else redraw2D();
}

// Avertissement avant toute suppression (2D comme 3D). L'annulation reste possible.
function confirmDeletion(what) {
    return askConfirm('Supprimer', 'Supprimer ' + what + ' ?\n\nVous pourrez revenir en arrière avec Annuler (Ctrl+Z).', 'Supprimer', { danger: true });
}

// Quadrillage 3D : affiché ou masqué, la scène est reconstruite
// Quadrillage : même réglage en 2D et en 3D (maille 50 cm)
let gridVisible = true;

// Boutons d'aide (grille, ortho, câbles, quadrillage) : même rendu à chaque changement d'état
function paintAideBtn(btn, icon, label, on) {
    if (!btn) return;
    btn.innerHTML = `<i class="fa-solid ${icon} text-xs"></i><span class="text-[10px] leading-none">${label}</span><b class="text-[10px] leading-none font-semibold">${on ? 'ON' : 'OFF'}</b>`;
    // Même identité que les onglets de la barre droite : liseré gris, liseré jaune quand actif
    btn.className = 'h-12 flex flex-col items-center justify-center gap-1 rounded-xl border transition ' +
        (on ? 'border-yellow-400 ring-1 ring-yellow-400/60 bg-slate-800' : 'border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function toggleGridView() {
    gridVisible = !gridVisible;
    paintAideBtn(document.getElementById('btn-grid-view'), 'fa-table-cells', 'Quadrillage', gridVisible);
    refreshSelectedView();
}

function toggleGridSnap() {
    gridSnap = !gridSnap;
    paintAideBtn(document.getElementById('btn-grid-snap'), 'fa-magnet', 'Aimantation', gridSnap);
    redraw2D();
}

function toggleAngleSnap() {
    angleSnap = !angleSnap;
    paintAideBtn(document.getElementById('btn-angle-snap'), 'fa-compass', 'Ortho', angleSnap);
}

function updateStats() {
    // Le compteur de murs n'est plus affiché en 2D : on ne met à jour que s'il existe
    const wallCount = document.getElementById('stat-walls-count');
    if (wallCount) wallCount.textContent = projectData.walls.length;
}

// =====================================================================
//  CIRCUITS, MÉTRÉ, CONTRÔLES, OUTILS 2D, SAUVEGARDE AUTO
// =====================================================================
const CIRCUIT_PALETTE = ['#facc15', '#f97316', '#14b8a6', '#ec4899', '#a78bfa', '#38bdf8', '#84cc16', '#94a3b8'];
// Familles d'appareils : un nouveau type s'ajoute aussi dans ces listes selon son comportement
const CEILING_TYPES = ['light_ceiling', 'light_spot', 'smoke_detector'];   // fixés au plafond
const LIGHT_TYPES = ['light_ceiling', 'light_spot', 'wall_light'];         // luminaires, reliés à une commande
const LIGHTING_CONTROL_TYPES = ['switch_simple', 'switch_va_et_vient', 'switch_pushbutton', 'switch_dimmer', 'motion_timer'];
// Charges pilotées par une commande : luminaires, prise commandée, sonnerie, moteur de volet
const SWITCH_LOAD_TYPES = [...LIGHT_TYPES, 'outlet_switched'];
const CONTROLLED_LOAD_TYPES = [...SWITCH_LOAD_TYPES, 'doorbell_chime', 'shutter_motor'];
// Commande -> charges qu'elle peut piloter (un variateur ou une minuterie ne pilote pas une prise)
const CONTROL_LOADS = {
    switch_simple: SWITCH_LOAD_TYPES, switch_va_et_vient: SWITCH_LOAD_TYPES, switch_pushbutton: SWITCH_LOAD_TYPES,
    switch_dimmer: LIGHT_TYPES, motion_timer: LIGHT_TYPES,
    doorbell_button: ['doorbell_chime'], shutter_control: ['shutter_motor']
};
const DEFAULT_CIRCUIT_BY_TYPE = {
    light_ceiling: 'c_lighting', light_spot: 'c_lighting', smoke_detector: 'c_daaf', wall_light: 'c_lighting',
    outlet_16a: 'c_outlets', outlet_20a: 'c_kitchen', outlet_20a_classic: 'c_outlets20', outlet_dedicated_20: 'c_dedicated20', outlet_dedicated_32: 'c_dedicated32',
    outlet_switched: 'c_outlets', doorbell_chime: 'c_doorbell', shutter_motor: 'c_shutters', shutter_control: 'c_shutters'
};
const CIRCUIT_POINT_LIMITS = { c_lighting: 8, c_outlets: 8, c_outlets20: 12, c_kitchen: 6, c_dedicated20: 1, c_dedicated32: 1 };
// Appareils proposés pour une prise dédiée (libellé affiché dans l'inspecteur)
const DEDICATED_APPLIANCE_LABELS = {
    lave_linge: 'Lave-linge', lave_vaisselle: 'Lave-vaisselle', seche_linge: 'Sèche-linge',
    four: 'Four', plaque: 'Plaque de cuisson', chauffe_eau: 'Chauffe-eau',
    climatisation: 'Climatisation', autre: 'Autre'
};
const ELEMENT_LABELS = {
    outlet_16a: 'Prise 16A', outlet_20a: 'Prise 20A plan de travail', outlet_20a_classic: 'Prise 20A classique', outlet_dedicated_20: 'Prise 20A dédiée', outlet_dedicated_32: 'Prise 32A dédiée',
    outlet_switched: 'Prise commandée 16A',
    switch_simple: 'Interrupteur simple', switch_va_et_vient: 'Interrupteur va-et-vient',
    switch_pushbutton: 'Bouton poussoir (télérupteur)', switch_dimmer: 'Variateur',
    motion_timer: 'Minuterie / détecteur de mouvement',
    doorbell_button: 'Bouton de sonnette', doorbell_chime: 'Sonnerie',
    shutter_control: 'Commande de volet roulant', shutter_motor: 'Moteur de volet roulant',
    wall_light: 'Applique murale', light_ceiling: 'Plafonnier', light_spot: 'Spot encastré',
    smoke_detector: 'Détecteur de fumée (DAAF)',
    panel: 'Tableau électrique', subpanel: 'Sous-tableau',
    junction_box: 'Boîte de dérivation'
};
const EL_COLORS = {
    outlet_16a: '#f97316', outlet_20a: '#ef4444', outlet_20a_classic: '#15803d', outlet_dedicated_20: '#a78bfa', outlet_dedicated_32: '#38bdf8',
    outlet_switched: '#f97316',
    switch_simple: '#10b981', switch_va_et_vient: '#22c55e', switch_pushbutton: '#38bdf8',
    switch_dimmer: '#14b8a6', motion_timer: '#a3e635',
    doorbell_button: '#f9a8d4', doorbell_chime: '#f9a8d4',
    shutter_control: '#9ca3af', shutter_motor: '#6b7280',
    wall_light: '#fbbf24', light_ceiling: '#fde047', light_spot: '#fef08a', smoke_detector: '#94a3b8',
    panel: '#06b6d4', subpanel: '#67e8f9',
    junction_box: '#e2e8f0'
};

function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function isCircuitPoint(el) { return el.type in DEFAULT_CIRCUIT_BY_TYPE; }
function isLightingControl(el) {
    return LIGHTING_CONTROL_TYPES.includes(el.type);
}
// Commande (interrupteur, poussoir, bouton de sonnette, commande de volet) et charge (luminaire, prise commandée, sonnerie, moteur)
function isControl(el) { return el.type in CONTROL_LOADS; }
function isControlledLoad(el) { return CONTROLLED_LOAD_TYPES.includes(el.type); }
function canControl(sw, load) { return isControl(sw) && CONTROL_LOADS[sw.type].includes(load.type); }
// Commande -> première charge qu'elle pilote (liaison manuelle ou automatique), pour lui donner la couleur de son circuit
function controlTargetsOf(net) {
    const byId = new Map(projectData.electrical.map(el => [el.id, el]));
    const map = new Map();
    const pick = (sw, loadId) => {
        const load = byId.get(loadId);
        if (load && canControl(sw, load) && !map.has(sw.id)) map.set(sw.id, load);
    };
    projectData.electrical.filter(isControl).forEach(sw => {
        (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).forEach(id => pick(sw, id));
    });
    (net && net.controlLinks || []).forEach(link => {
        const sw = byId.get(link.switchId);
        if (sw) link.lightIds.forEach(id => pick(sw, id));
    });
    return map;
}
// Câble de commande : couleur du circuit de la charge pilotée (même couleur que la charge et sa commande).
// loadTypes : types de charge à prendre en compte, ou null pour toutes.
function controlCableColors(net, loadTypes) {
    const byId = new Map(projectData.electrical.map(el => [el.id, el]));
    const map = new Map();
    (net && net.controlLinks || []).forEach(link => {
        link.lightIds.forEach(id => {
            const load = byId.get(id);
            const c = load && (!loadTypes || loadTypes.includes(load.type)) ? circuitOf(load) : null;
            if (c) map.set(controlCableLinkId(link.switchId, id), circuitColor(c));
        });
    });
    return map;
}
// Câble de commande vers une prise commandée : couleur du circuit de cette prise
function switchedOutletCableColors(net) { return controlCableColors(net, ['outlet_switched']); }
// Couleur d'un appareil = couleur de son circuit, comme pour les prises. Une commande prend celle de la charge
// qu'elle pilote, ou, sans liaison, celle du circuit par défaut de cette charge. targets : controlTargetsOf, ou null.
function deviceCircuitOf(el, targets) {
    if (isControl(el)) {
        const load = targets && targets.get(el.id);
        return load ? circuitOf(load) : defaultCircuitOfType(CONTROL_LOADS[el.type][0]);
    }
    return isCircuitPoint(el) ? circuitOf(el) : null;
}
function deviceColor(el, targets) {
    const circ = deviceCircuitOf(el, targets);
    return circ ? circuitColor(circ) : null;
}
function defaultCircuitOfType(type) {
    return projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE[type]) || null;
}
// Aide affichée quand l'appareil sélectionné n'a encore aucun partenaire compatible
function compatibleLoadsHint(sw) { return CONTROL_LOADS[sw.type].map(t => ELEMENT_LABELS[t].toLowerCase()).join(', '); }
function compatibleControlsHint(load) {
    return Object.keys(CONTROL_LOADS).filter(t => CONTROL_LOADS[t].includes(load.type)).map(t => ELEMENT_LABELS[t].toLowerCase()).join(', ');
}
function controlCableLinkId(switchId, lightId) { return switchId + '::' + lightId; }

function maxPointsForCircuit(circuit) {
    const root = circuitRoot(circuit);
    const configured = Math.max(1, circuit.maxPoints | 0);
    return root && CIRCUIT_POINT_LIMITS[root.id] !== undefined
        ? Math.min(configured, CIRCUIT_POINT_LIMITS[root.id])
        : configured;
}

// Circuit d'un appareil : affectation calculée (voir ensureCircuitAssignment), sinon circuit par défaut de son type
function circuitOf(el) {
    // un point de raccord de trémie (commande inter-niveaux) suit l'appareil réel qu'il représente
    if (el && el.isProxy) el = projectData.electrical.find(e => e.id === el.realId) || el;
    if (!isCircuitPoint(el)) return null;
    const id = AUTO_ASSIGN.map.get(el.id);
    return projectData.circuits.find(c => c.id === id)
        || projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE[el.type])
        || null;
}

// Prise dédiée : le calibre (20 ou 32 A) découle de son type ; l'appareil alimenté est choisi dans l'inspecteur
function dedicatedCalibreId(el) { return el.type === 'outlet_dedicated_32' ? 'c_dedicated32' : 'c_dedicated20'; }
function dedicatedAmpsOf(el) { return dedicatedCalibreId(el) === 'c_dedicated32' ? 32 : 20; }
function isDedicatedOutlet(el) { return el.type === 'outlet_dedicated_20' || el.type === 'outlet_dedicated_32'; }
function dedicatedApplianceOf(el) { return DEDICATED_APPLIANCE_LABELS[el.applianceKind] ? el.applianceKind : 'autre'; }

// Clignotement des appareils en collision (plan 2D et vue 3D)
// Élément sélectionné depuis un circuit : son repère clignote pour qu'on sache qu'il est sélectionné
function selectionBlinkNeeded() {
    // tout élément sélectionné ou tout circuit : le plan est redessiné à chaque phase de clignotement
    return !!selectedCircuitId || !!selected3DId;
}

function startCollisionBlink() {
    setInterval(() => {
        blinkOn = !blinkOn;
        if (currentMode === '3d') {
            wallMeshes3D.forEach(m => { if (m.userData && m.userData.blink) m.visible = blinkOn; });
            // cadres de sélection : alternent de couleur (blanc / couleur d'origine), toujours visibles
            wallMeshes3D.forEach(m => {
                if (m.userData && m.userData.blinkPalette && m.material) m.material.color.set(blinkOn ? m.userData.blinkPalette[1] : m.userData.blinkPalette[0]);
            });
            if (selectedHighlightMesh && selectedHighlightMesh.material) selectedHighlightMesh.material.color.set(blinkOn ? contrastHex3D('#f8fafc') : '#f8fafc');
            // trémie sélectionnée : sa colonne et son cadre alternent avec un contraste
            if (selected3DId) wallMeshes3D.forEach(m => {
                if (m.userData && m.userData.shaftId === selected3DId && m.material) m.material.color.set(blinkOn ? contrastHex3D(shaftColour()) : shaftColour());
            });
        } else if (currentMode === '2d' && (collidingElementIds().size || selectionBlinkNeeded())) {
            redraw2D();
        }
        // Onglet Alertes et cartes de circuits en alerte : même clignotement rouge, dans les deux vues
        document.querySelectorAll('[data-alert-blink]').forEach(el => {
            // rouge par contour (outline) et fond en dégradé : ne touche ni la bordure ni l'anneau jaunes
            // de la sélection, qui restent visibles en même temps que le clignotement
            el.style.outline = blinkOn ? '2px solid #ef4444' : '';
            el.style.outlineOffset = blinkOn ? '2px' : '';
            el.style.backgroundImage = blinkOn ? 'linear-gradient(rgba(239,68,68,0.3), rgba(239,68,68,0.3))' : '';
        });
    }, 450);
}

function circuitRoot(c) {
    return c && c.baseId ? (projectData.circuits.find(x => x.id === c.baseId) || c) : c;
}

// Répartition des appareils en circuits : quand un circuit atteint son nombre de points maximum,
// un circuit supplémentaire est créé automatiquement (« Prises de courant 16A (2) », etc.).
// Les appareils déjà affectés gardent leur circuit ; les nouveaux rejoignent d'abord les voisins les plus proches.
const AUTO_ASSIGN = { map: new Map(), sig: null };

function ensureCircuitAssignment() {
    const circuits = projectData.circuits;
    // chaque suite automatique garde son propre calibre, sa section et sa capacité (aucune recopie depuis le circuit d'origine)
    const pts = projectData.electrical.filter(isCircuitPoint);
    const sigOf = () => JSON.stringify([
        circuits.map(c => [c.id, c.name, c.maxPoints, c.breakerRating, c.wireSection, c.baseId || 0, c.wiringMode || 'chain']),
        pts.map(el => [el.id, el.type, el.circuitId || 0])
    ]);
    if (AUTO_ASSIGN.sig === sigOf()) return;

    const prev = AUTO_ASSIGN.map;
    const next = new Map();
    const created = [];
    const byId = id => circuits.find(c => c.id === id);
    const famOf = el => {
        const pinned = byId(el.circuitId);
        return pinned ? circuitRoot(pinned) : (byId(DEFAULT_CIRCUIT_BY_TYPE[el.type]) || null);
    };
    const fams = new Map();
    pts.forEach(el => {
        const f = famOf(el);
        if (!f) return;
        if (!fams.has(f.id)) fams.set(f.id, []);
        fams.get(f.id).push(el);
    });
    const panel = projectData.electrical.find(el => el.type === 'panel');
    const pc = panel ? getElCoords(panel) : null;

    // circuits automatiques dont la famille n'existe plus
    for (let i = circuits.length - 1; i >= 0; i--) {
        if (circuits[i].auto && !byId(circuits[i].baseId)) circuits.splice(i, 1);
    }

    const processed = new Set();
    const families = circuits.filter(c => !c.auto);
    families.forEach(F => {
        processed.add(F.id);
        const members = fams.get(F.id) || [];
        const capacity = c => maxPointsForCircuit(c);
        const chain = [F].concat(circuits.filter(c => c.auto && c.baseId === F.id));
        const count = new Map(chain.map(c => [c.id, 0]));
        const assigned = new Map();
        // un circuit automatique est réservé au niveau de ses premières prises : pas de prises de plusieurs étages sur un même circuit
        const lvlOf = new Map();
        const canTake = (c, el) => !lvlOf.has(c.id) || lvlOf.get(c.id) === el.levelId;
        const assign = (el, cid) => { assigned.set(el.id, cid); if (!lvlOf.has(cid)) lvlOf.set(cid, el.levelId); count.set(cid, count.get(cid) + 1); };

        // 1. choix explicites de l'utilisateur
        members.forEach(el => {
            const target = chain.find(c => c.id === el.circuitId);
            if (target && count.get(target.id) < capacity(target)) assign(el, target.id);
        });
        // 2. affectation précédente (les circuits ne bougent pas quand on ajoute un appareil)
        members.forEach(el => {
            if (assigned.has(el.id)) return;
            const p = prev.get(el.id);
            const target = chain.find(c => c.id === p);
            if (target && canTake(target, el) && count.get(target.id) < capacity(target)) assign(el, target.id);
        });
        // 3. nouveaux appareils : chemin de proche en proche à partir du tableau
        const rest = members.filter(el => !assigned.has(el.id));
        const order = [];
        let cur = pc;
        while (rest.length) {
            let bi = 0, bd = Infinity;
            rest.forEach((el, i) => {
                const c = getElCoords(el);
                const d = cur ? Math.hypot(c.x - cur.x, c.y - cur.y) : i;
                if (d < bd) { bd = d; bi = i; }
            });
            const el = rest.splice(bi, 1)[0];
            order.push(el);
            cur = getElCoords(el);
        }
        order.forEach(el => {
            let c = chain.find(x => count.get(x.id) < capacity(x) && canTake(x, el));
            if (!c) {
                let n = 2;
                while (byId(F.id + '_x' + n)) n++;
                c = { id: F.id + '_x' + n, name: F.name, type: F.type, maxPoints: CIRCUIT_POINT_LIMITS[F.id] !== undefined ? CIRCUIT_POINT_LIMITS[F.id] : F.maxPoints, breakerRating: F.breakerRating, wireSection: F.wireSection, color: freeFamilyShade(F, chain.length, null), auto: true, baseId: F.id };
                circuits.splice(circuits.indexOf(chain[chain.length - 1]) + 1, 0, c);
                chain.push(c);
                count.set(c.id, 0);
                created.push(c);
            }
            assign(el, c.id);
        });
        // 4. compactage : le dernier circuit automatique se vide s'il tient dans les précédents
        for (let i = chain.length - 1; i >= 1; i--) {
            const c = chain[i], n = count.get(c.id);
            if (!n || members.some(el => assigned.get(el.id) === c.id && el.circuitId === c.id)) continue;
            // simulation : tous les appareils du circuit doivent trouver place, au même niveau, avant de déplacer
            const sim = new Map(count);
            let fits = true;
            members.filter(el => assigned.get(el.id) === c.id).forEach(el => {
                const t = chain.slice(0, i).find(x => sim.get(x.id) < capacity(x) && canTake(x, el));
                if (!t) fits = false; else sim.set(t.id, sim.get(t.id) + 1);
            });
            if (!fits) continue;
            members.filter(el => assigned.get(el.id) === c.id).forEach(el => {
                const tgt = chain.slice(0, i).find(x => count.get(x.id) < capacity(x) && canTake(x, el));
                count.set(c.id, count.get(c.id) - 1);
                assigned.set(el.id, tgt.id);
                count.set(tgt.id, count.get(tgt.id) + 1);
            });
        }
        // 5. circuits automatiques vides supprimés, les autres renumérotés sans modifier leurs réglages
        const kept = [F];
        chain.slice(1).forEach(c => {
            if (count.get(c.id) > 0) kept.push(c);
            else circuits.splice(circuits.indexOf(c), 1);
        });
        kept.slice(1).forEach((c, i) => {
            c.name = F.name + ' (' + (i + 2) + ')';
            c.color = freeFamilyShade(F, i + 1, c);
        });
        assigned.forEach((cid, id) => next.set(id, cid));
    });

    ensureDistinctCircuitColors();
    AUTO_ASSIGN.map = next;
    const notify = AUTO_ASSIGN.sig !== null && created.length;
    AUTO_ASSIGN.sig = sigOf();
    if (notify && typeof showNotification === 'function') {
        showNotification('Limite de points atteinte : nouveau circuit « ' + created[created.length - 1].name + ' » créé', 'info');
    }
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return [h, s * 100, l * 100];
}

// Circuits supplémentaires d'une même famille : nuances voisines de la couleur du circuit d'origine (luminosité et teinte légèrement décalées)
const FAMILY_SHADE_STEPS = [[0, 0], [-12, 0], [12, 0], [-6, -6], [6, 6], [-18, -3], [18, 3]];
function familyShadeColor(root, k) {
    if (k <= 0) return circuitColor(root);
    const [h, s, l] = hexToHsl(circuitColor(root));
    const [dl, dh] = FAMILY_SHADE_STEPS[k % FAMILY_SHADE_STEPS.length];
    const cycle = Math.floor(k / FAMILY_SHADE_STEPS.length);
    const L = Math.min(85, Math.max(25, l + dl + cycle * 5));
    return hslToHex((h + dh - cycle * 3 + 360) % 360, Math.max(40, s), L);
}

// Première couleur libre : palette d'abord, puis teintes réparties (angle d'or) pour qu'aucun circuit ne partage sa couleur
function usedCircuitColors(self) {
    return new Set((projectData.circuits || []).filter(c => c !== self).map(c => c.color));
}
function nextCircuitColor(taken) {
    const used = taken || usedCircuitColors(null);
    for (let i = 0; i < 400; i++) {
        const col = i < CIRCUIT_PALETTE.length ? CIRCUIT_PALETTE[i] : hslToHex(((i - CIRCUIT_PALETTE.length) * 137.508 + 20) % 360, 68, i % 2 ? 62 : 52);
        if (!used.has(col)) return col;
    }
    return '#94a3b8';
}

// Circuit de famille supplémentaire : première nuance voisine qui n'est prise par aucun autre circuit (self : circuit concerné, exclu)
function freeFamilyShade(root, k, self) {
    const used = usedCircuitColors(self);
    for (let j = Math.max(1, k); j < Math.max(1, k) + 400; j++) {
        const col = familyShadeColor(root, j);
        if (!used.has(col)) return col;
    }
    return nextCircuitColor(used);
}

// Deux circuits ne partagent jamais une couleur : le premier garde la sienne, le suivant en reçoit une libre
function ensureDistinctCircuitColors() {
    const seen = new Set();
    (projectData.circuits || []).forEach(c => {
        if (!c.color || seen.has(c.color)) c.color = nextCircuitColor(seen);
        seen.add(c.color);
    });
}

function circuitColor(c) {
    if (!c) return '#94a3b8';
    if (c.color) return c.color;
    const i = projectData.circuits.indexOf(c);
    return CIRCUIT_PALETTE[(i < 0 ? 0 : i) % CIRCUIT_PALETTE.length];
}

// Section minimale indicative selon le calibre du disjoncteur
function minSectionFor(breaker) { return breaker <= 10 ? 1.5 : breaker <= 20 ? 2.5 : 6; }

function ensureProjectDefaults() {
    if (!Array.isArray(projectData.levels) || !projectData.levels.length) {
        projectData.levels = [{ id: 'lvl_rdc', name: 'RDC', elevation: 0, ceilingHeight: 250 }];
    }
    const firstLevelId = projectData.levels[0].id;
    if (!Array.isArray(projectData.shafts)) projectData.shafts = [];
    if (!Array.isArray(projectData.stairs)) projectData.stairs = [];
    projectData.stairs.forEach(st => { if (!Array.isArray(st.levelIds)) st.levelIds = [st.levelId || firstLevelId]; });
    projectData.shafts.forEach(sh => { if (!Array.isArray(sh.levelIds)) sh.levelIds = [sh.levelId || firstLevelId]; });
    ['walls', 'openings', 'electrical', 'shafts', 'stairs'].forEach(key => {
        (projectData[key] || []).forEach(x => {
            if (!x.levelId || !projectData.levels.some(l => l.id === x.levelId)) x.levelId = firstLevelId;
        });
    });
    if (!activeLevelId || !projectData.levels.some(l => l.id === activeLevelId)) activeLevelId = firstLevelId;
    projectData.walls = projectData.walls || [];
    projectData.wallsLocked = !!projectData.wallsLocked;
    projectData.walls.forEach(w => {
        w.thickness = w.thickness ? Math.max(5, Math.min(50, w.thickness)) : 10;
    });
    projectData.openings = projectData.openings || [];
    projectData.electrical = projectData.electrical || [];
    projectData.openings.forEach(op => {
        if (op.type === 'door_single') {
            if (op.hingeSide !== 'right') op.hingeSide = 'left';
            if (op.side !== -1) op.side = 1;
        }
    });
    projectData.annotations = projectData.annotations || [];
    if (!Array.isArray(projectData.circuits) || !projectData.circuits.length) {
        projectData.circuits = [
            { id: 'c_lighting', name: 'Éclairage 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5 },
            { id: 'c_outlets', name: 'Prises de courant 16A', type: 'outlets', maxPoints: 8, breakerRating: 16, wireSection: 2.5 },
            { id: 'c_kitchen', name: 'Prises 20A plan de travail', type: 'specialized', maxPoints: 6, breakerRating: 20, wireSection: 2.5 }
        ];
    }
    // circuits fixes : ajoutés aux fichiers enregistrés avant leur création, couleur recalée sur la valeur par défaut
    [classicOutlet20Circuit(), doorbellCircuitDef(), daafCircuitDef(), shutterCircuitDef(), ...dedicatedCircuitDefs()].forEach(d => {
        const existing = projectData.circuits.find(c => c.id === d.id);
        if (existing) existing.color = d.color;
        else projectData.circuits.push(d);
    });
    projectData.circuits.forEach(c => {
        if (c.id === 'c_kitchen') { c.name = 'Prises 20A plan de travail'; c.color = '#ef4444'; }
        if (c.id === 'c_lighting') {
            if (c.name === 'Circuit Éclairage') c.name = 'Éclairage 10A';
        }
        const limit = CIRCUIT_POINT_LIMITS[c.id];
        if (limit !== undefined) c.maxPoints = Math.min(Math.max(1, c.maxPoints | 0), limit);
    });
    projectData.electrical.forEach(el => {
        if (el.type === 'outlet_10a') {
            el.type = 'outlet_16a';
            if (el.circuitId === 'c_lighting') delete el.circuitId;
        }
        // sonneries et DAAF enregistrés sur l'éclairage : ils passent sur leur propre circuit
        if (el.type === 'doorbell_chime' && el.circuitId === 'c_lighting') delete el.circuitId;
        if (el.type === 'smoke_detector' && el.circuitId === 'c_lighting') delete el.circuitId;
        // moteurs et commandes de volet enregistrés sur les prises : ils passent sur le circuit des volets
        if ((el.type === 'shutter_motor' || el.type === 'shutter_control') && el.circuitId === 'c_outlets') delete el.circuitId;
    });
    ensureDistinctCircuitColors();
    // répartition recalculée dès le chargement : pas d'affichage « tout sur le premier circuit » avant le premier calcul
    ensureCircuitAssignment();
}

// ---------- Contrôles par circuit + métré ----------
// Appareils posés dans l'emprise d'une porte ou d'une fenêtre
function computeOpeningCollisions() {
    const list = [];
    electricalOn().forEach(el => {
        if (CEILING_TYPES.includes(el.type)) return;
        const w = wallsOn().find(x => x.id === el.wallId);
        if (!w) return;
        const wl = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        const dist = el.distanceFromStart !== undefined ? el.distanceFromStart : wl / 2;
        const z = getElCoords(el).z;
        openingsOn().forEach(op => {
            if (op.wallId !== w.id) return;
            const b = openingBox(op, w);
            if (Math.abs(dist - b.d) < b.half && z >= b.z0 && z <= b.z1) list.push({ el, isDoor: !!b.isDoor });
        });
    });
    return list;
}

// Chevauchement entre appareils (tableau, prises, interrupteurs, appliques, boîtes) : sur le plan.
// Un plafonnier n'est comparé qu'à un autre plafonnier (il est au plafond, pas sur le mur).
// Demi-encombrements (cm), d'après les volumes dessinés en 3D (le centre de l'appareil est à sa hauteur)
function deviceBox(el) {
    const c = getElCoords(el);
    const gang = GANGABLE_OUTLETS.includes(el.type);
    const r = el.type === 'panel' ? 21 : el.type === 'junction_box' ? 5 : gang ? 3.6 : (el.type === 'outlet_dedicated_20' || el.type === 'outlet_dedicated_32') ? 7.6 : 4;
    const h = el.type === 'panel' ? 28 : el.type === 'wall_light' || el.type === 'junction_box' ? 5 : 4.5;
    return { el, x: c.x, y: c.y, z: c.z, ceiling: CEILING_TYPES.includes(el.type), r, h };
}
function computeDeviceOverlaps() {
    const list = [];
    const boxes = electricalOn().map(deviceBox);
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.ceiling !== b.ceiling) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r && Math.abs(a.z - b.z) < a.h + b.h) list.push({ a: a.el, b: b.el });
        }
    }
    return list;
}

function collidingElementIds() {
    const ids = new Set(computeOpeningCollisions().map(c => c.el.id));
    computeShaftCollisions().forEach(c => { ids.add(c.shaft.id); ids.add(c.other.id); });
    computeDeviceOverlaps().forEach(c => { ids.add(c.a.id); ids.add(c.b.id); });
    computeStairCollisions().forEach(c => { ids.add(c.stair.id); ids.add(c.other.id); });
    computeOutletGangs().overflow.forEach(id => ids.add(id));
    return ids;
}

// Emprise en plan d'une trémie (carré de sa taille, posé contre son mur)
function shaftRectOf(sh) {
    const p = shaftPos2D(sh);
    return p ? orientedRect(p.x, p.y, p.angle, (sh.size || 40) / 2, (sh.size || 40) / 2) : null;
}
// Zone d'une trémie : son emprise plus l'épaisseur du mur jusqu'à son axe, pour retrouver les ouvertures qui lui font face
function shaftZoneOf(sh) {
    const wp = openingPos2D({ wallId: sh.wallId, distanceFromStart: sh.distanceFromStart });
    if (!wp) return null;
    const size = sh.size || 40, side = sh.side === -1 ? -1 : 1;
    const k = (wp.th / 2 + size) / 2;
    return orientedRect(wp.x + Math.sin(wp.angle) * side * k, wp.y - Math.cos(wp.angle) * side * k, wp.angle, size / 2, k);
}
// Deux trémies ou escaliers qui relient un niveau en commun
function linksSharedLevel(a, b) {
    const lb = b.levelIds || [b.levelId];
    return (a.levelIds || [a.levelId]).some(lv => lb.includes(lv));
}
// Trémies : chevauchement avec une ouverture, un mur voisin, un appareil ou une autre trémie (vérifié dans les deux sens)
function computeShaftCollisions() {
    const list = [];
    const shafts = projectData.shafts || [];
    shafts.forEach(sh => {
        // la trémie est ancrée sur son mur d'origine, même si elle traverse plusieurs niveaux
        const w = (projectData.walls || []).find(x => x.id === sh.wallId);
        if (!w) return;
        const half = (sh.size || 40) / 2;
        const center = shaftPos2D(sh);
        const zone = shaftZoneOf(sh), rect = shaftRectOf(sh);
        // une trémie traverse chaque niveau qu'elle relie : ouvertures, murs et appareils de chacun sont contrôlés
        (sh.levelIds || [sh.levelId]).forEach(lv => {
            // ouverture face à la trémie : même mur, mur parallèle d'un autre niveau, ou mur voisin au coin
            openingsOn(lv).forEach(op => {
                const r = openingRectOf(op);
                if (zone && r && rectsOverlap(zone, r) && !list.some(c => c.kind === 'ouverture' && c.other === op && c.shaft === sh)) list.push({ shaft: sh, other: op, kind: 'ouverture' });
            });
            // mur voisin (autre que le mur d'origine) : 2 cm de tolérance, comme pour les escaliers
            if (rect) wallsOn(lv).forEach(W => {
                if (W.id === w.id) return;
                const wr = wallRectOf(W);
                if (!wr) return;
                wr.hw -= 2;
                if (rectsOverlap(rect, wr) && !list.some(c => c.kind === 'mur' && c.other === W && c.shaft === sh)) list.push({ shaft: sh, other: W, kind: 'mur' });
            });
            // test sur la position en plan de chaque élément (mur, plafond ou pose libre : tableau, boîte)
            if (!center) return;
            electricalOn(lv).forEach(el => {
                const c = getElCoords(el);
                const r = el.type === 'panel' ? 20 : 14;
                if (Math.hypot(c.x - center.x, c.y - center.y) < half + r && !list.some(x => x.kind === 'appareil' && x.other === el && x.shaft === sh)) list.push({ shaft: sh, other: el, kind: 'appareil' });
            });
        });
    });
    // deux trémies qui partagent un niveau : chaque paire n'est signalée qu'une fois
    shafts.forEach((a, i) => shafts.slice(i + 1).forEach(b => {
        const ra = shaftRectOf(a), rb = shaftRectOf(b);
        if (ra && rb && linksSharedLevel(a, b) && rectsOverlap(ra, rb)) list.push({ shaft: a, other: b, kind: 'trémie' });
    }));
    return list;
}

// ---------- Escaliers : emprise rectangulaire au sol, reliant des niveaux comme les trémies ----------
// La montée va de la marche basse (côté -L/2) à la marche haute (côté +L/2) ; la flèche du plan la montre.
const STAIR_RISER_CM = 17.5;
function stairLevelNames(st) {
    return (st.levelIds || [st.levelId]).map(lv => {
        const l = (projectData.levels || []).find(x => x.id === lv);
        return l ? l.name : '?';
    });
}
function stairTitle(st) { return 'Escalier : relie ' + stairLevelNames(st).join(' ↔ '); }
function stairRiseCm(st) {
    const elev = (st.levelIds || [st.levelId]).map(lv => {
        const l = (projectData.levels || []).find(x => x.id === lv);
        return l ? Number(l.elevation) || 0 : 0;
    });
    // un seul niveau relié : la montée va jusqu'au plafond de ce niveau (sinon les marches seraient plates)
    return elev.length > 1 ? Math.max(...elev) - Math.min(...elev) : levelCeilingOf(st.levelId);
}
function stairStepCount(st) { return Math.max(2, Math.round(stairRiseCm(st) / STAIR_RISER_CM)); }
// Rectangle orienté : axe u = (cos a, sin a), axe v perpendiculaire ; hl et hw : demi-dimensions (cm)
function orientedRect(cx, cy, angle, hl, hw) {
    return { cx, cy, ux: Math.cos(angle), uy: Math.sin(angle), vx: -Math.sin(angle), vy: Math.cos(angle), hl, hw };
}
function stairRect(st) {
    return orientedRect(st.x, st.y, (st.angleDeg || 0) * Math.PI / 180, (st.length || 300) / 2, (st.width || 90) / 2);
}
// Recouvrement de deux rectangles orientés (séparation des axes) ; un contact de moins de 0,5 cm ne compte pas
function rectsOverlap(A, B) {
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    const radius = (R, ax, ay) => R.hl * Math.abs(R.ux * ax + R.uy * ay) + R.hw * Math.abs(R.vx * ax + R.vy * ay);
    const axes = [[A.ux, A.uy], [A.vx, A.vy], [B.ux, B.uy], [B.vx, B.vy]];
    return axes.every(([ax, ay]) => Math.abs(dx * ax + dy * ay) < radius(A, ax, ay) + radius(B, ax, ay) - 0.5);
}
function wallRectOf(w) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
    if (len < 1) return null;
    return orientedRect((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, Math.atan2(dy, dx), len / 2, (w.thickness || 10) / 2);
}
// Chevauchements d'un escalier (niveau affiché) : appareils dans l'emprise jusqu'au plafond, trémies, ouvertures, murs
function computeStairCollisions() {
    const list = [];
    const ceil = levelCeilingOf(activeLevelId);
    (projectData.stairs || []).forEach(st => {
        const R = stairRect(st);
        // hauteur de la montée : l'escalier est plein sous sa rampe, de la dalle basse jusqu'à la marche au point considéré
        const ids = st.levelIds || [st.levelId];
        const elevOfL = lv => Number(((projectData.levels || []).find(l => l.id === lv) || {}).elevation) || 0;
        const rise = stairRiseCm(st) || ceil;
        // un escalier relie plusieurs niveaux : ses obstacles sont cherchés sur chacun d'eux, pas seulement sur le niveau affiché
        // (hauteur testée sur le niveau affiché seulement ; sur les autres niveaux, contrôle du plan)
        ids.forEach(lv => {
            electricalOn(lv).forEach(el => {
                const b = deviceBox(el);
                if (b.z > levelCeilingOf(lv)) return;
                const dx = b.x - R.cx, dy = b.y - R.cy;
                const lu = dx * R.ux + dy * R.uy, lv2 = dx * R.vx + dy * R.vy;
                if (!(Math.abs(lu) < R.hl + b.r && Math.abs(lv2) < R.hw + b.r)) return;
                // hauteurs absolues (niveau de l'appareil + cote dans son niveau) : comparées à la montée
                const f = Math.max(0, Math.min(1, (lu + R.hl) / (2 * R.hl)));   // 0 en marche basse, 1 en marche haute
                const zAbs = elevOfL(lv) + b.z;
                const stepTopAbs = Math.min(...ids.map(elevOfL)) + rise * f;
                const bottomAbs = Math.min(...ids.map(elevOfL));
                if (zAbs + b.h > bottomAbs && zAbs - b.h < stepTopAbs) list.push({ stair: st, other: el, kind: 'appareil' });
            });
            shaftsOn(lv).forEach(sh => {
                const p = shaftPos2D(sh);
                if (p && rectsOverlap(R, orientedRect(p.x, p.y, p.angle, (sh.size || 40) / 2, (sh.size || 40) / 2))) {
                    if (!list.some(c => c.kind === 'trémie' && c.other === sh)) list.push({ stair: st, other: sh, kind: 'trémie' });
                }
            });
            openingsOn(lv).forEach(op => {
                const w = wallsOn(lv).find(x => x.id === op.wallId);
                const p = w && openingPos2D(op);
                if (!p) return;
                if (rectsOverlap(R, orientedRect(p.x, p.y, p.angle, openingBox(op, w).half, p.th / 2))) {
                    if (!list.some(c => c.kind === 'ouverture' && c.other === op)) list.push({ stair: st, other: op, kind: 'ouverture' });
                }
            });
            wallsOn(lv).forEach(w => {
                const wr = wallRectOf(w);
                // tolérance de 2 cm : l'aimantation colle l'escalier à la face du mur, arrondie au cm, sans chevaucher
                if (wr) wr.hw -= 2;
                if (wr && rectsOverlap(R, wr)) {
                    if (!list.some(c => c.kind === 'mur' && c.other === w)) list.push({ stair: st, other: w, kind: 'mur' });
                }
            });
        });
    });
    // deux escaliers qui partagent un niveau : chaque paire n'est signalée qu'une fois
    const stairs = projectData.stairs || [];
    stairs.forEach((a, i) => stairs.slice(i + 1).forEach(b => {
        if (linksSharedLevel(a, b) && rectsOverlap(stairRect(a), stairRect(b))) list.push({ stair: a, other: b, kind: 'escalier' });
    }));
    return list;
}

// Escaliers : se bloquent sur les murs du niveau affiché (face contre face) et s'alignent sur eux si l'orientation est proche
const STAIR_SNAP_CM = 25;
const STAIR_SNAP_ANGLE = 8 * Math.PI / 180;
function snapStairToWalls(st, prev) {
    // écart entre l'emprise et un mur, le long de la normale du mur (négatif = chevauchement)
    const gapOf = (R, W) => {
        const dx = R.cx - W.cx, dy = R.cy - W.cy;
        const d = dx * W.vx + dy * W.vy;
        const rS = R.hl * Math.abs(R.ux * W.vx + R.uy * W.vy) + R.hw * Math.abs(R.vx * W.vx + R.vy * W.vy);
        const t = dx * W.ux + dy * W.uy;
        const rU = R.hl * Math.abs(R.ux * W.ux + R.uy * W.uy) + R.hw * Math.abs(R.vx * W.ux + R.vy * W.uy);
        return { gap: Math.abs(d) - (W.hw + rS), sign: d >= 0 ? 1 : -1, along: Math.abs(t) < W.hl + rU + STAIR_SNAP_CM };
    };
    // murs de tous les niveaux que l'escalier relie (pas seulement le niveau affiché)
    const levelsOfSt = st.levelIds || [st.levelId];
    const walls = (projectData.walls || []).filter(w => levelsOfSt.includes(w.levelId)).map(w => wallRectOf(w)).filter(Boolean);
    // pousse l'escalier hors d'un mur chevauché : d'abord le mur le moins pénétré, plusieurs passes
    const pushOut = () => {
        for (let pass = 0; pass < 4; pass++) {
            let pick = null;
            walls.forEach(W => {
                const g = gapOf(stairRect(st), W);
                if (g.along && g.gap < 0 && (!pick || g.gap > pick.g.gap)) pick = { W, g };
            });
            if (!pick) return;
            st.x = Math.round(st.x - pick.g.sign * pick.g.gap * pick.W.vx);
            st.y = Math.round(st.y - pick.g.sign * pick.g.gap * pick.W.vy);
        }
    };
    pushOut();
    // aimantation : collage à la face d'un mur tout proche (écart inférieur à 25 cm)
    let best = null;
    walls.forEach(W => {
        const g = gapOf(stairRect(st), W);
        if (g.along && g.gap >= 0 && g.gap < STAIR_SNAP_CM && (!best || g.gap < best.g.gap)) best = { W, g };
    });
    // éloignement : si l'escalier s'éloigne du mur (flèches, glisser), il n'est pas recollé
    if (best && prev) {
        const before = gapOf(stairRect(Object.assign({}, st, { x: prev.x, y: prev.y })), best.W).gap;
        if (best.g.gap >= before) best = null;
    }
    if (best) {
        // alignement : parallèle au mur, ou perpendiculaire, si l'escalier est presque dans cette direction
        const wa = Math.atan2(best.W.uy, best.W.ux);
        const a = (st.angleDeg || 0) * Math.PI / 180;
        const delta = c => { let d = ((a - c) % Math.PI + Math.PI) % Math.PI; return d > Math.PI / 2 ? d - Math.PI : d; };
        const c = Math.abs(delta(wa)) <= Math.abs(delta(wa + Math.PI / 2)) ? wa : wa + Math.PI / 2;
        if (Math.abs(delta(c)) < STAIR_SNAP_ANGLE) st.angleDeg = ((c * 180 / Math.PI) % 360 + 360) % 360;
        const g = gapOf(stairRect(st), best.W);
        st.x = Math.round(st.x - g.sign * g.gap * best.W.vx);
        st.y = Math.round(st.y - g.sign * g.gap * best.W.vy);
    }
    // dernière vérification : une rotation ou un arrondi ne doit jamais laisser l'escalier dans un mur
    pushOut();
}

// Prises simples proches (même mur, même côté, même hauteur) : regroupées automatiquement en double / triple / quadruple
const GANGABLE_OUTLETS = ['outlet_16a', 'outlet_20a', 'outlet_20a_classic'];
const GANG_MAX_GAP_CM = 15;
const GANG_NAMES = { 1: 'simple', 2: 'double', 3: 'triple', 4: 'quadruple' };
// Aimantation : une prise posée à moins de 15 cm d'une voisine (même mur, côté et hauteur) se colle à une plaque (7,5 cm)
const OUTLET_PLATE_CM = 7.5;
function snapOutletDistance(type, wallId, dist, side, height, excludeId) {
    if (!GANGABLE_OUTLETS.includes(type)) return dist;
    const sd = side === -1 ? -1 : 1;
    const peers = electricalOn().filter(o => o.id !== excludeId && GANGABLE_OUTLETS.includes(o.type) && o.wallId === wallId &&
        o.distanceFromStart !== undefined && (o.side === -1 ? -1 : 1) === sd &&
        Math.abs((o.height || defaultHeightFor(o.type)) - height) <= 5);
    const near = peers.filter(o => Math.abs(dist - o.distanceFromStart) <= GANG_MAX_GAP_CM);
    if (!near.length) return dist;
    // une position d'aimantation n'est retenue que si elle ne touche aucune autre prise
    const taken = pos => peers.some(o => Math.abs(o.distanceFromStart - pos) < OUTLET_PLATE_CM - 0.5);
    let best = null;
    // arrondi vers l'extérieur : au moins 7,5 cm de centre à centre, à droite comme à gauche
    near.forEach(o => [Math.ceil(o.distanceFromStart + OUTLET_PLATE_CM), Math.floor(o.distanceFromStart - OUTLET_PLATE_CM)].forEach(t => {
        if (taken(t)) return;
        if (best === null || Math.abs(dist - t) < Math.abs(dist - best)) best = t;
    }));
    return best === null ? dist : best;
}

function computeOutletGangs() {
    const sizeOf = new Map();
    // prises en trop : une 5e prise collée à un groupe déjà complet (4 max)
    const overflow = new Set();
    // membres de chaque groupe (ids), indexés par l'id de chaque prise du groupe
    const groupOf = new Map();
    const tally = {};
    GANGABLE_OUTLETS.forEach(type => { tally[type] = { 1: 0, 2: 0, 3: 0, 4: 0 }; });
    const buckets = new Map();
    electricalOn().forEach(el => {
        if (!GANGABLE_OUTLETS.includes(el.type)) return;
        const w = wallsOn().find(x => x.id === el.wallId);
        const wl = w ? Math.hypot(w.x2 - w.x1, w.y2 - w.y1) : 0;
        const dist = el.distanceFromStart !== undefined ? el.distanceFromStart : wl / 2;
        const key = el.type + '|' + el.wallId + '|' + (el.side === -1 ? -1 : 1);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ el, dist, h: el.height || defaultHeightFor(el.type) });
    });
    buckets.forEach(items => {
        items.sort((a, b) => a.dist - b.dist);
        let cluster = [];
        const close = () => {
            if (!cluster.length) return;
            const n = cluster.length;
            const ids = cluster.map(it => it.el.id);
            cluster.forEach(it => {
                sizeOf.set(it.el.id, n);
                groupOf.set(it.el.id, ids);
            });
            tally[cluster[0].el.type][n]++;
            cluster = [];
        };
        items.forEach(it => {
            const last = cluster[cluster.length - 1];
            if (last && it.dist - last.dist <= GANG_MAX_GAP_CM && Math.abs(it.h - last.h) <= 5) {
                if (cluster.length < 4) { cluster.push(it); return; }
                // groupe complet : la prise en trop et les quatre voisines sont signalées
                overflow.add(it.el.id);
                cluster.forEach(c => overflow.add(c.el.id));
            }
            close();
            cluster.push(it);
        });
        close();
    });
    return { sizeOf, tally, overflow, groupOf };
}

// Réseau de câblage de chaque niveau (le métré couvre tout le projet, pas seulement le niveau affiché)
// Les caches existants sont utilisés : sans eux, chaque image de glissement 3D refaisait le câblage
function networksAllLevels() {
    const saved = activeLevelId;
    const nets = [];
    try {
        (projectData.levels || []).forEach(l => {
            nets.push(l.id === saved ? getCableNetwork() : ghostCableNetwork(l.id));
        });
    } finally {
        activeLevelId = saved;
    }
    return nets;
}

function computeCircuitReport() {
    const net = getCableNetwork();
    const nets = networksAllLevels();
    const info = nets.flatMap(n => n.linkInfo || []);
    const rows = projectData.circuits.map(c => {
        // points comptés sur tous les niveaux : un circuit est une protection, pas un étage
        const ptsAll = projectData.electrical.filter(el => { const cc = circuitOf(el); return cc && cc.id === c.id; });
        const points = ptsAll.length;
        const levelsUsed = new Set(ptsAll.map(el => el.levelId)).size;
        const mine = info.filter(l => l.circuitId === c.id);
        // montée verticale : une colonne de trémie par niveau atteint depuis le niveau du tableau (écart de cote + réserve)
        const panelEl = projectData.electrical.find(e => e.type === 'panel');
        const panelLevel = panelEl ? panelEl.levelId : activeLevelId;
        const elevOf = id => { const lv = (projectData.levels || []).find(x => x.id === id); return lv ? (Number(lv.elevation) || 0) : 0; };
        const riserCm = [...new Set(ptsAll.map(el => el.levelId))]
            .filter(lv => lv !== panelLevel)
            .reduce((sum, lv) => sum + Math.abs(elevOf(lv) - elevOf(panelLevel)) + 60, 0);
        const cableCm = mine.reduce((s, l) => s + l.length + 60, 0) + riserCm;   // +30 cm de réserve à chaque extrémité
        const maxRunM = Math.max(0, ...nets.map(n => ((n.circuitRuns || {})[c.id] || 0))) / 100;      // du tableau à l'appareil le plus éloigné
        const drop = 2 * 0.0225 * maxRunM * c.breakerRating / c.wireSection / 230 * 100;   // cuivre, monophasé, au calibre
        const limit = c.type === 'lighting' ? 3 : 5;
        const warnings = [];
        const pointLimit = maxPointsForCircuit(c);
        if (points > pointLimit) warnings.push(points + ' points pour ' + pointLimit + ' maximum (tous niveaux)');
        if (c.wireSection < minSectionFor(c.breakerRating)) warnings.push('section ' + c.wireSection + ' mm² trop faible pour ' + c.breakerRating + ' A');
        if (drop > limit) warnings.push('chute de tension ' + drop.toFixed(1) + ' % (limite ' + limit + ' %)');
        const unrouted = nets.reduce((s, n) => s + ((n.unroutedBy || {})[c.id] || 0), 0);
        return { circuit: c, points, cableM: cableCm / 100, maxRunM, drop, limit, warnings, unrouted };
    });

    const alerts = [];
    // cible de chaque alerte (même index) : onglet à ouvrir, appareil à sélectionner, conseil précis
    const alertTargets = [];
    const addAlert = (text, target) => { alerts.push(text); alertTargets.push(target || null); };
    const panels = electricalOn().filter(el => el.type === 'panel');
    // un étage sans tableau est alimenté par la trémie qui le relie au tableau d'un autre niveau
    const anyPanel = projectData.electrical.some(el => el.type === 'panel');
    // une boîte de dérivation posée n'est pas un appareil : seule, elle n'appelle ni tableau ni alerte d'appareil
    if (electricalOn().some(el => el.type !== 'panel' && el.type !== 'junction_box') && !panels.length) {
        if (!anyPanel) addAlert('Aucun tableau électrique : les appareils ne sont pas reliés.', { tab: 'appareillage', hint: 'Placez un tableau électrique depuis l’onglet Appareillages.' });
        else if (shaftFeedFor(activeLevelId).reason) addAlert('Cet étage n\'est relié au tableau par aucune trémie : ses appareils ne sont pas alimentés.', { tab: 'ouvertures', hint: 'Placez une trémie qui relie cet étage au tableau de l’autre niveau, depuis l’onglet Ouvertures.' });
    }
    if (panels.length > 1) addAlert('Plusieurs tableaux : seul le premier est alimenté.', { tab: 'appareillage', hint: 'Gardez un seul tableau : supprimez les autres depuis l’onglet Appareillages.' });
    if (computeOutletGangs().overflow.size) addAlert('Plus de 4 prises groupées : une quadruple au maximum, les prises en trop sont en rouge.', { tab: 'appareillage', hint: 'Éloignez la prise en trop d’au moins 15 cm du groupe, ou retirez-la depuis l’onglet Appareillages.' });
    // le réseau câblé est calculé pour l'étage affiché : ses alertes portent son nom
    if (net.unrouted > 0) {
        // compteur global : renvoie vers le circuit le plus touché, qui signale lui-même son problème
        const worst = Object.entries(net.unroutedBy || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
        const target = { tab: 'circuits', hint: 'Ouvrez le circuit en rouge : son cheminement se règle sur sa carte (murs, mixte ou plafond).' };
        if (worst) target.circuitId = worst[0];
        const worstCircuit = worst && projectData.circuits.find(c => c.id === worst[0]);
        if (worstCircuit && !worstCircuit.roomCrossing) target.action = 'roomCrossing';
        addAlert(levelPrefix(activeLevelId) + net.unrouted + ' liaison(s) de câble non reliée(s) au tableau, sans chemin possible.', target);
    }
    (net.warnings || []).forEach(w => addAlert(levelPrefix(activeLevelId) + w, { tab: 'appareillage', hint: 'Vérifiez l’appareil ou la trémie concernés par ce câblage, depuis l’onglet Appareillages.' }));
    // commandes et charges comptées sur tout le projet : une liaison peut relier deux niveaux
    const nSw = projectData.electrical.filter(isLightingControl).length;
    const nVaEtVient = projectData.electrical.filter(el => el.type === 'switch_va_et_vient').length;
    const nLi = projectData.electrical.filter(el => LIGHT_TYPES.includes(el.type)).length;
    const nOutSw = projectData.electrical.filter(el => el.type === 'outlet_switched').length;
    const countType = t => projectData.electrical.filter(el => el.type === t).length;
    if (nSw > 0 && nLi + nOutSw === 0) addAlert('Interrupteur(s) sans luminaire à commander.', { tab: 'appareillage', hint: 'Ajoutez un plafonnier, une applique ou une prise commandée depuis l’onglet Appareillages.' });
    if (nLi > 0 && nSw === 0) addAlert('Luminaire(s) sans interrupteur de commande.', { tab: 'appareillage', hint: 'Ajoutez un interrupteur depuis l’onglet Appareillages.' });
    // chaque prise commandée doit être reliée à une commande : liaison manuelle (tout le projet) ou automatique (étage affiché)
    electricalOn().filter(el => el.type === 'outlet_switched').forEach(el => {
        const linkedByHand = projectData.electrical.some(sw => isControl(sw) && canControl(sw, el) &&
            Array.isArray(sw.controlledLightIds) && sw.controlledLightIds.includes(el.id));
        const linkedAuto = (net.controlLinks || []).some(link => link.lightIds.includes(el.id));
        if (!linkedByHand && !linkedAuto) {
            addAlert(levelPrefix(el.levelId) + electricalDisplayName(el) + ' non reliée à un interrupteur de commande.', { tab: 'appareillage', elId: el.id, hint: 'Ajoutez un interrupteur, ou reliez manuellement la prise à une commande depuis l’onglet Appareillages.' });
        }
    });
    if (countType('doorbell_button') > 0 && countType('doorbell_chime') === 0) addAlert('Bouton de sonnette sans sonnerie.', { tab: 'appareillage', hint: 'Ajoutez une sonnerie depuis l’onglet Appareillages.' });
    if (countType('doorbell_chime') > 0 && countType('doorbell_button') === 0) addAlert('Sonnerie sans bouton de sonnette.', { tab: 'appareillage', hint: 'Ajoutez un bouton de sonnette depuis l’onglet Appareillages.' });
    if (countType('shutter_control') > 0 && countType('shutter_motor') === 0) addAlert('Commande de volet sans moteur.', { tab: 'appareillage', hint: 'Ajoutez un moteur de volet roulant depuis l’onglet Appareillages.' });
    if (countType('shutter_motor') > 0 && countType('shutter_control') === 0) addAlert('Moteur de volet sans commande.', { tab: 'appareillage', hint: 'Ajoutez une commande de volet roulant depuis l’onglet Appareillages.' });
    if (nVaEtVient % 2 !== 0) addAlert('Nombre impair d’interrupteurs va-et-vient : associez-les par deux pour commander chaque éclairage.', { tab: 'appareillage', hint: 'Ajoutez ou retirez un interrupteur va-et-vient, depuis l’onglet Appareillages, pour en avoir un nombre pair.' });
    electricalOn().filter(isControl).forEach(el => {
        const height = el.height || 110;
        if (height < 90 || height > 130) {
            addAlert(levelPrefix(el.levelId) + electricalDisplayName(el) + ' hors de la plage de hauteur usuelle 0,90–1,30 m.', { tab: 'appareillage', elId: el.id, hint: 'Sélectionnez-le, puis réglez sa hauteur entre 0,90 et 1,30 m.' });
        }
    });
    rows.forEach(r => r.warnings.forEach(w => addAlert(r.circuit.name + ' : ' + w, { tab: 'circuits', circuitId: r.circuit.id, hint: circuitWarningHint(w) })));
    // liaison tableau → sous-tableau : 3G6 mm² pour un disjoncteur de tête de 32 A, limite 5 %
    const feederRunM = Math.max(0, ...info.filter(l => l.circuitId === FEEDER_CID).map(l => l.length + 60)) / 100;
    const feederDrop = 2 * 0.0225 * feederRunM * 32 / 6 / 230 * 100;
    if (feederDrop > 5) addAlert('Liaison tableau → sous-tableau : chute de tension ' + feederDrop.toFixed(1) + ' % (limite 5 %)', { tab: 'appareillage', hint: 'Rapprochez le sous-tableau du tableau principal, ou réduisez le trajet de la liaison.' });
    computeOpeningCollisions().forEach(({ el, isDoor }) => {
        addAlert(levelPrefix(el.levelId) + electricalDisplayName(el) + ' placé(e) dans ' + (isDoor ? 'une porte' : 'une fenêtre') + ' : à déplacer', { tab: 'appareillage', elId: el.id, hint: 'Sélectionnez-le et déplacez-le hors de la porte ou fenêtre (glisser, ou flèches ← →).' });
    });
    computeOpeningOverlaps().forEach(({ a, b }) => {
        const nm = o => o.type === 'door_single' ? 'porte' : 'fenêtre';
        const where = a.wallId === b.wallId ? ' sur le même mur' : ' au coin de deux murs';
        addAlert(levelPrefix(a.levelId) + nm(a)[0].toUpperCase() + nm(a).slice(1) + ' chevauche une ' + nm(b) + where + ' : à déplacer', { tab: 'ouvertures', elId: a.id, hint: 'Sélectionnez l’une des deux et déplacez-la le long du mur, ou réduisez sa largeur.' });
    });
    computeDeviceOverlaps().forEach(({ a, b }) => {
        addAlert(levelPrefix(a.levelId) + electricalDisplayName(a) + ' chevauche ' + electricalDisplayName(b) + ' : à déplacer', { tab: 'appareillage', elId: a.id, hint: 'Sélectionnez-le et déplacez-le pour qu’il ne chevauche plus ' + electricalDisplayName(b) + '.' });
    });
    computeShaftCollisions().forEach(({ shaft, other, kind }) => {
        const otherName = kind === 'appareil' ? electricalDisplayName(other) : kind === 'trémie' ? 'une autre trémie' : kind === 'mur' ? 'un mur' : (other.type === 'door_single' ? 'une porte' : 'une fenêtre');
        addAlert(levelPrefix(shaft.levelId) + shaftTitle(shaft.id) + ' chevauche ' + otherName + ' : à déplacer', { tab: 'ouvertures', elId: shaft.id, hint: 'Déplacez la trémie depuis l’onglet Ouvertures pour la dégager de l’élément qui la chevauche.' });
    });
    computeStairCollisions().forEach(({ stair, other, kind }) => {
        const otherName = kind === 'appareil' ? electricalDisplayName(other) : kind === 'trémie' ? 'une trémie' : kind === 'mur' ? 'un mur' : kind === 'escalier' ? 'un autre escalier' : (other.type === 'door_single' ? 'une porte' : 'une fenêtre');
        addAlert(levelPrefix(stair.levelId) + stairTitle(stair) + ' chevauche ' + otherName + ' : à déplacer', { tab: 'ouvertures', elId: stair.id, hint: 'Déplacez ou réorientez l’escalier depuis l’onglet Ouvertures pour le dégager.' });
    });
    const infos = projectData.circuits.filter(c => c.auto).map(c => '« ' + c.name + ' » créé automatiquement (' + c.maxPoints + ' points maximum par circuit)');

    const sections = new Map();
    rows.forEach(r => { if (r.cableM > 0) sections.set(r.circuit.wireSection, (sections.get(r.circuit.wireSection) || 0) + r.cableM); });
    const conduitM = net.segments.reduce((s, sg) => s + Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y, sg.b.z - sg.a.z), 0) / 100;
    const counts = {};
    // les boîtes de dérivation posées sont décomptées à part (voir buildBomRows), pas comme appareils
    electricalOn().forEach(el => { if (el.type !== 'junction_box') counts[el.type] = (counts[el.type] || 0) + 1; });
    const gangs = computeOutletGangs();
    // lignes du décompte : les prises regroupables sont détaillées en simple / double / triple / quadruple
    const countLines = [];
    Object.keys(counts).forEach(t => {
        if (gangs.tally[t]) {
            [1, 2, 3, 4].forEach(n => {
                if (gangs.tally[t][n]) countLines.push({ type: t, gang: n, label: ELEMENT_LABELS[t] + ' ' + GANG_NAMES[n], count: gangs.tally[t][n] });
            });
        } else {
            countLines.push({ type: t, gang: 0, label: ELEMENT_LABELS[t] || t, count: counts[t] });
        }
    });
    const feederM = info.filter(l => l.circuitId === FEEDER_CID).reduce((s, l) => s + l.length + 60, 0) / 100;
    return { rows, alerts, alertTargets, infos, sections, conduitM, feederM, counts, countLines };
}

// Cellule de réglage d'un circuit (calibre, section, éléments) : libellé au-dessus, valeur entre − et +
function circuitCellHtml(id, field, label, value) {
    const btn = (dir, sym) => '<button onclick="event.stopPropagation();adjustCircuit(\'' + esc(id) + '\',\'' + field + '\',' + dir + ')" class="w-5 h-5 shrink-0 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 leading-none" aria-label="' + label + (dir > 0 ? ' plus' : ' moins') + '">' + sym + '</button>';
    return '<div class="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 min-w-0 overflow-hidden" title="' + label + '">' +
        '<div class="text-[9px] uppercase tracking-wide text-slate-500">' + label + '</div>' +
        '<div class="flex items-center justify-between gap-1 mt-0.5">' + btn(-1, '−') +
        '<span class="font-semibold text-slate-100 text-[11px] truncate min-w-0">' + esc(value) + '</span>' + btn(1, '+') + '</div></div>';
}

// Regroupe les lignes de circuits par niveau : chaque circuit va dans le niveau
// où se trouve la majorité de ses appareils. Niveaux du plus haut au plus bas,
// circuits sans appareil en dernier.
function groupCircuitRowsByLevel(rows) {
    const levels = (projectData.levels || []).slice().sort((a, b) => b.elevation - a.elevation);
    const mainLevelOf = circuitId => {
        const counts = new Map();
        projectData.electrical.forEach(el => {
            const cc = circuitOf(el);
            if (cc && cc.id === circuitId) counts.set(el.levelId, (counts.get(el.levelId) || 0) + 1);
        });
        let best = null, bestN = 0;
        counts.forEach((n, id) => { if (n > bestN) { best = id; bestN = n; } });
        return best;
    };
    const byLevel = new Map(levels.map(l => [l.id, []]));
    const orphan = [];
    rows.forEach(r => {
        const id = mainLevelOf(r.circuit.id);
        if (id && byLevel.has(id)) byLevel.get(id).push(r); else orphan.push(r);
    });
    const groups = levels
        .filter(l => byLevel.get(l.id).length)
        .map(l => ({ title: l.name, rows: byLevel.get(l.id) }));
    if (orphan.length) groups.push({ title: 'Sans appareil', rows: orphan });
    return groups;
}

// Réglages de chaque carte de circuit : repliés par défaut, état gardé pendant la session
// Compteur affiché à côté du libellé d'un onglet (vide si zéro)
function setTabCount(key, n) {
    document.querySelectorAll('[data-right-tab="' + key + '"] .tab-count').forEach(s => {
        s.textContent = n ? '(' + n + ')' : '';
    });
}

const expandedCircuitCards = new Set();
function toggleCircuitCard(id) {
    if (expandedCircuitCards.has(id)) expandedCircuitCards.delete(id); else expandedCircuitCards.add(id);
    updateCircuitsUI();
}

// Passage entre pièces fermées (par circuit) : le câble peut traverser le mur au plafond, franchir l'extérieur et
// retraverser le mur de l'autre pièce. Réglage propre à chaque circuit, désactivé par défaut.
function roomCrossingHtml(cid, on) {
    const label = on ? 'Passage entre pièces fermées : autorisé' : 'Passage entre pièces fermées : non autorisé';
    const button = on
        ? '<button type="button" onclick="event.stopPropagation();setCircuitRoomCrossing(\'' + esc(cid) + '\',false)" class="shrink-0 px-2 py-0.5 rounded-md border-2 border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">Retirer l\'autorisation</button>'
        : '<button type="button" onclick="event.stopPropagation();setCircuitRoomCrossing(\'' + esc(cid) + '\',true)" class="shrink-0 px-2 py-0.5 rounded-md border-2 border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[10px]">Autoriser le passage</button>';
    return '<div class="mt-2 flex items-start gap-2"><div class="flex-1 text-[11px] ' + (on ? 'text-amber-200/90' : 'text-slate-400') + '">' + label + '</div>' + button + '</div>';
}

// Cheminement des câbles d'un circuit : murs (défaut), mixte ou plafond
const CABLE_ROUTING = {
    murs: { label: 'Murs', title: 'par les murs', icon: 'fa-border-all', color: 'border-slate-700 bg-slate-800 text-slate-200',
        help: 'Suit les murs. Murs isolés : au plafond.' },
    mixte: { label: 'Mixte', title: 'mixte', icon: 'fa-shuffle', color: 'border-sky-400/50 bg-sky-400/15 text-sky-200',
        help: 'Murs, sauf au plafond si c’est nettement plus court.' },
    plafond: { label: 'Plafond', title: 'par le plafond', icon: 'fa-arrow-up', color: 'border-amber-400/50 bg-amber-400/15 text-amber-200',
        help: 'Plus court chemin au plafond.' }
};
const cableRoutingOf = c => (CABLE_ROUTING[c.cableRouting] ? c.cableRouting : 'murs');
const nextCableRouting = mode => ({ murs: 'mixte', mixte: 'plafond', plafond: 'murs' })[mode];

function cableRoutingHtml(cid, routing) {
    const opts = Object.keys(CABLE_ROUTING).map(m => {
        const o = CABLE_ROUTING[m];
        const on = m === routing;
        return '<button type="button" onclick="event.stopPropagation();setCircuitRouting(\'' + esc(cid) + '\',\'' + m + '\')" aria-pressed="' + (on ? 'true' : 'false') +
            '" class="flex-1 px-1.5 py-1 rounded-md border text-[10px] ' + (on ? o.color : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800') +
            '"><i class="fa-solid ' + o.icon + ' mr-1"></i>' + o.label + '</button>';
    }).join('');
    return '<div class="mt-2"><div class="text-[10px] text-slate-400 mb-1">Cheminement des câbles</div><div class="flex gap-1">' + opts + '</div>' +
        '<div class="text-[10px] text-slate-500 mt-1">' + esc(CABLE_ROUTING[routing].help) + '</div></div>';
}

function updateCircuitsUI() {
    // la liste existe en 3D (barre gauche) et en 2D (barre droite) : les deux sont remplies
    const lists = ['circuits-list', 'circuits-list-2d'].map(id => document.getElementById(id)).filter(Boolean);
    if (!lists.length) return;
    const rep = computeCircuitReport();
    lists.forEach(list => {
    list.innerHTML = '';
    // circuits non utilisés (aucun appareil, par exemple un 32 A sans prise dédiée 32 A) : absents de la liste
    groupCircuitRowsByLevel(rep.rows.filter(r => r.points > 0)).forEach(group => {
    const header = document.createElement('div');
    header.className = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400 pt-2 pb-0.5 flex items-center gap-1.5';
    header.innerHTML = '<i class="fa-solid fa-layer-group"></i><span>' + esc(group.title) + '</span><span class="font-normal normal-case text-slate-500">(' + group.rows.length + ')</span>';
    list.appendChild(header);
    group.rows.forEach(r => {
        const c = r.circuit;
        const div = document.createElement('div');
        const selected = selectedCircuitId === c.id;
        // Même présentation que les boutons de la barre : tuile sombre, surbrillance jaune quand le circuit est sélectionné
        div.className = 'p-2 rounded-xl border cursor-pointer transition text-slate-200 ' +
            (selected ? 'tool-active-yellow' : (r.warnings.length ? 'bg-slate-800 hover:bg-slate-700 border-rose-500/60' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'));
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.setAttribute('aria-pressed', selected ? 'true' : 'false');
        div.setAttribute('aria-label', 'Afficher le circuit ' + c.name + ' en 3D');
        div.addEventListener('click', () => selectCircuit(c.id));
        div.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectCircuit(c.id);
            }
        });
        // Carte compacte : une ligne d'identité, une ligne de résumé ; réglages et détails repliés
        const open = expandedCircuitCards.has(c.id);
        const levelNames = [...new Set(projectData.electrical
            .filter(el => { const cc = circuitOf(el); return cc && cc.id === c.id; })
            .map(el => el.levelId))]
            .map(id => ((projectData.levels || []).find(l => l.id === id) || {}).name)
            .filter(Boolean);
        const star = c.wiringMode === 'star';
        const routing = cableRoutingOf(c);
        const rout = CABLE_ROUTING[routing];
        const unroutedHere = r.unrouted || 0;
        // sur le circuit sélectionné : bouton pour retirer (ou remettre) le câble entre tableaux de son affichage
        const feederBtn = selectedCircuitId === c.id && rep.feederM > 0
            ? '<button onclick="event.stopPropagation();toggleFeederWithCircuit()" class="w-6 h-6 shrink-0 rounded-md border text-[11px] ' +
              (feederWithCircuit ? 'border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200' : 'border-slate-700 bg-slate-800 text-slate-400') +
              '" aria-pressed="' + (feederWithCircuit ? 'true' : 'false') + '" title="' +
              (feederWithCircuit ? 'Câble entre tableaux affiché avec ce circuit. Cliquer pour le retirer de cet affichage' : 'Câble entre tableaux retiré de ce circuit. Cliquer pour le remettre') +
              '"><i class="fa-solid fa-arrows-left-right"></i></button>'
            : '';
        const hasWarn = r.warnings.length > 0;
        const summary = [c.breakerRating + ' A', c.wireSection + ' mm²',
            r.cableM > 0 ? r.cableM.toFixed(1) + ' m' : '',
            r.cableM > 0 ? 'ΔU ' + r.drop.toFixed(1) + ' %' : '',
            routing !== 'murs' ? 'câble ' + rout.title : '',
            c.roomCrossing ? 'passage pièces autorisé' : ''].filter(Boolean).join(' · ');
        const multiLevel = levelNames.length > 1 ? ' · ' + levelNames.join(' · ') : '';
        const nextRouting = CABLE_ROUTING[nextCableRouting(routing)];
        div.innerHTML =
            '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + esc(circuitColor(c)) + '"></span>' +
            '<span class="font-semibold text-slate-200 min-w-0 flex-1 break-words">' + esc(c.name) + '</span>' +
            (c.auto ? '<i class="fa-solid fa-wand-magic-sparkles text-[10px] text-sky-300 shrink-0" title="Circuit créé automatiquement : suite du circuit d’origine"></i>' : '') +
            '<span class="text-[11px] text-slate-400 shrink-0">' + r.points + '/' + c.maxPoints + '</span>' +
            (hasWarn ? '<i class="fa-solid fa-triangle-exclamation text-rose-400 text-[11px] shrink-0" title="' + esc(r.warnings.join(' ; ')) + '"></i>' : '') +
            feederBtn +
            '<button onclick="event.stopPropagation();toggleWiringMode(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md border text-[11px] ' +
            (star ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-800 text-slate-200') +
            '" title="Câblage : ' + (star ? 'étoile (chaque appareil relié au tableau)' : 'chaîné (en guirlande)') + '. Cliquer pour changer"><i class="fa-solid ' + (star ? 'fa-sitemap' : 'fa-link') + '"></i></button>' +
            '<button onclick="event.stopPropagation();toggleCircuitRouting(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md border text-[11px] ' + rout.color + '"' +
            (unroutedHere ? ' data-alert-blink' : '') +
            ' title="Cheminement des câbles : ' + rout.title + '. Cliquer pour passer à : ' + nextRouting.title + '"><i class="fa-solid ' + rout.icon + '"></i></button>' +
            '<button onclick="event.stopPropagation();toggleCircuitCard(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" aria-expanded="' + (open ? 'true' : 'false') + '"' + (hasWarn ? ' data-alert-blink' : '') + ' title="Réglages du circuit"><i class="fa-solid ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i></button>' +
            '</div>' +
            '<div class="mt-0.5 pl-4 text-[10px] text-slate-400 break-words">' + esc(summary + multiLevel) + '</div>' +
            (unroutedHere
                ? '<div class="mt-1 pl-4 text-[10px] text-rose-300 break-words"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + unroutedHere +
                  ' liaison(s) non reliée(s) : ' + (routing === 'murs'
                      ? 'passez ce circuit en « mixte » ou « plafond », ou autorisez le passage entre pièces fermées.'
                      : 'aucun chemin, même au plafond : ajoutez une trémie ou déplacez l’appareil.') + '</div>'
                : '') +
            (open
                ? '<div class="grid gap-1.5 mt-2" style="grid-template-columns:repeat(auto-fit,minmax(84px,1fr))">' +
                  circuitCellHtml(c.id, 'breakerRating', 'Calibre', c.breakerRating + ' A') +
                  circuitCellHtml(c.id, 'wireSection', 'Section', c.wireSection + ' mm²') +
                  circuitCellHtml(c.id, 'maxPoints', 'Éléments', String(c.maxPoints)) +
                  '</div>' +
                  cableRoutingHtml(c.id, routing) +
                  roomCrossingHtml(c.id, !!c.roomCrossing) +
                  r.warnings.map(w => '<div class="text-[10px] text-rose-300 mt-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(w) + '</div>' +
                      '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(w)) + '</div>').join('')
                : '');
        if (hasWarn || unroutedHere) div.setAttribute('data-alert-blink', '');
        list.appendChild(div);
    });
    });
    // câble de liaison tableau → sous-tableau : entrée optionnelle, affichée seulement s'il existe un sous-tableau
    if (rep.feederM > 0) {
        const selected = selectedCircuitId === FEEDER_CID;
        const header = document.createElement('div');
        header.className = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400 pt-2 pb-0.5 flex items-center gap-1.5';
        header.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i><span>Liaisons</span>';
        list.appendChild(header);
        const div = document.createElement('div');
        div.className = 'p-2 rounded-xl border cursor-pointer transition text-slate-200 ' +
            (selected ? 'tool-active-yellow' : 'bg-slate-800 hover:bg-slate-700 border-slate-700');
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.setAttribute('aria-pressed', selected ? 'true' : 'false');
        div.setAttribute('aria-label', 'Afficher le câble entre tableaux en 3D');
        div.addEventListener('click', () => selectCircuit(FEEDER_CID));
        div.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectCircuit(FEEDER_CID);
            }
        });
        div.innerHTML =
            '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + FEEDER_COLOR + '"></span>' +
            '<span class="font-semibold text-slate-200 min-w-0 flex-1 break-words">Câble entre tableaux</span></div>' +
            '<div class="mt-0.5 pl-4 text-[10px] text-slate-400 break-words">Tableau → sous-tableau · ' + rep.feederM.toFixed(1) + ' m · masqué par défaut</div>';
        list.appendChild(div);
    }
    });

    lastAlertTargets = rep.alertTargets;
    const alertsHtml = (rep.alerts.length
        ? '<div class="space-y-2">' + rep.alerts.map((a, i) => {
            const t = rep.alertTargets[i];
            const tabLabel = t ? (RIGHT_TABS.find(x => x[0] === t.tab) || [])[1] : '';
            const where = t
                ? '<div class="ml-4 mt-0.5 flex items-start gap-2"><div class="flex-1 text-[10px] text-amber-200/90">Onglet « ' + esc(tabLabel) + ' » : ' + esc(t.hint) + '</div>' +
                  (t.action === 'roomCrossing' && t.circuitId ? '<button type="button" onclick="setCircuitRoomCrossing(\'' + esc(t.circuitId) + '\',true)" class="shrink-0 px-2 py-0.5 rounded-md border-2 border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[10px]">Autoriser le passage</button>' : '') +
                  '<button type="button" onclick="goToAlert(' + i + ')" class="shrink-0 px-2 py-0.5 rounded-md border-2 border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">Aller ↗</button></div>'
                : '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(a)) + '</div>';
            return '<div><div class="text-[11px] text-amber-300"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(a) + '</div>' + where + '</div>';
          }).join('') + '</div>'
        : '<div class="text-[11px] text-emerald-300"><i class="fa-solid fa-circle-check mr-1"></i>Aucune alerte</div>');

    setTabCount('circuits', rep.rows.filter(r => r.points > 0).length);
    setTabCount('avertissements', rep.alerts.length);
    setTabAlertBlink('avertissements', rep.alerts.length > 0);
    setTabAlertBlink('circuits', rep.rows.some(r => r.warnings.length > 0));
    ['warnings-content', 'warnings-content-2d'].forEach(id => {
        const warningsBox = document.getElementById(id);
        if (warningsBox) warningsBox.innerHTML = alertsHtml;
    });

    const box = document.getElementById('report-content');
    if (box) {
        let html = '';
        if (rep.alerts.length || projectData.electrical.length) html += alertsHtml;
        if (rep.infos.length) {
            html += '<div class="space-y-1">' + rep.infos.map(a => '<div class="text-[11px] text-sky-300"><i class="fa-solid fa-circle-info mr-1"></i>' + esc(a) + '</div>').join('') + '</div>';
        }
        html += reportTablesHtml(rep);
        box.innerHTML = html;
    }
}

// ---------- Métré en tableaux (écran + impression) ----------
// Quantitatif par catégories : null = ligne d'espacement entre deux catégories
const BOM_DEVICE_ORDER = ['panel', 'subpanel', 'light_ceiling', 'light_spot', 'wall_light', 'smoke_detector', 'switch_simple', 'switch_va_et_vient', 'switch_pushbutton', 'switch_dimmer', 'motion_timer', 'outlet_16a', 'outlet_20a', 'outlet_20a_classic', 'outlet_dedicated_20', 'outlet_dedicated_32', 'outlet_switched', 'doorbell_button', 'doorbell_chime', 'shutter_control', 'shutter_motor'];

// Nombre de boîtes de dérivation de tout le projet (une par étage relié à une trémie)
function countDerivationBoxes() {
    const saved = activeLevelId;
    let n = 0;
    try {
        (projectData.levels || []).forEach(l => { activeLevelId = l.id; n += derivationPointsOn(l.id).length; });
    } finally {
        activeLevelId = saved;
    }
    return n;
}

function buildBomRows(rep) {
    // Comme le CSV de référence : une ligne titre par catégorie, puis les désignations (catégorie laissée vide)
    const section = (title, lines) => lines.length ? [[title, '', '', ''], ...lines.map(l => ['', l[1], l[2], l[3]])] : [];
    const groups = [];

    const openings = [];
    const doors = projectData.openings.filter(o => o.type === 'door_single').length;
    const wins = projectData.openings.filter(o => o.type === 'window_std').length;
    if (doors) openings.push(['Ouvertures', 'Porte simple', doors, 'u']);
    if (wins) openings.push(['Ouvertures', 'Fenêtre', wins, 'u']);
    groups.push(section('Ouvertures', openings));

    // appareillage : une catégorie par famille de la légende imprimée (Prises, Interrupteurs…), ordre interne commun
    const rank = t => { const i = BOM_DEVICE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
    const appliance = rep.countLines.slice()
        .sort((x, y) => legendFamilyRank(x.type) - legendFamilyRank(y.type) || rank(x.type) - rank(y.type) || (x.gang || 0) - (y.gang || 0));
    PRINT_LEGEND_GROUPS.forEach(([family, test]) => {
        groups.push(section(family, appliance.filter(l => test(l.type)).map(line => [family, line.label, line.count, 'u'])));
    });
    groups.push(section('Appareillages', appliance.filter(l => legendFamilyRank(l.type) === 99).map(line => ['Appareillages', line.label, line.count, 'u'])));

    const cables = [];
    // boîtes de dérivation : une par étage relié à une trémie (comptées sur chaque niveau, comme dans la 3D)
    const boxCount = countDerivationBoxes();
    if (boxCount > 0) cables.push(['Gaines et câbles', 'Boîte de dérivation (pavé 14 × 14 × 10 cm)', boxCount, 'u']);
    const posedBoxes = projectData.electrical.filter(el => el.type === 'junction_box').length;
    if (posedBoxes > 0) cables.push(['Gaines et câbles', 'Boîte de dérivation posée (10 × 10 × 4 cm)', posedBoxes, 'u']);
    if (rep.conduitM > 0) cables.push(['Gaines et câbles', 'Gaine / conduit (marge 10 %)', Math.ceil(rep.conduitM * 1.1), 'm']);
    [...rep.sections.entries()].sort((x, y) => x[0] - y[0]).forEach(([sec, m]) =>
        cables.push(['Gaines et câbles', 'Câble 3G' + sec + ' mm² (marge 10 %)', Math.ceil(m * 1.1), 'm']));
    if (rep.feederM > 0) cables.push(['Gaines et câbles', 'Liaison tableau → sous-tableau, 3G6 mm² (disjoncteur 32 A, marge 10 %)', Math.ceil(rep.feederM * 1.1), 'm']);
    groups.push(section('Gaines et câbles', cables));

    const rows = [];
    groups.filter(g => g.length).forEach((g, i) => {
        if (i) rows.push(null);
        g.forEach(r => rows.push(r));
    });
    return rows;
}

function reportTablesHtml(rep) {
    const bom = buildBomRows(rep);
    let html = '<h3 class="rt-title">Quantitatif</h3>';
    if (!bom.length) {
        html += '<p class="rt-empty">Aucun matériel à décompter : placez un tableau et des appareils.</p>';
    } else {
        html += '<table class="rt"><thead><tr><th>Catégorie</th><th>Désignation</th><th class="num">Quantité</th><th>Unité</th></tr></thead><tbody>' +
            bom.map(r => r ? '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="num">' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>'
                : '<tr class="rt-gap" aria-hidden="true"><td colspan="4"></td></tr>').join('') +
            '</tbody></table>';
    }
    html += '<h3 class="rt-title">Circuits</h3>';
    html += '<table class="rt"><thead><tr><th>Circuit</th><th class="num">Calibre</th><th class="num">Section</th><th class="num">Points</th><th class="num">Câble</th><th class="num">ΔU</th><th>Contrôle</th></tr></thead><tbody>' +
        rep.rows.map(r => {
            const c = r.circuit;
            return '<tr' + (r.warnings.length ? ' class="rt-warn"' : '') + '><td>' + esc(c.name) + '</td><td class="num">' + c.breakerRating + ' A</td><td class="num">' + c.wireSection + ' mm²</td><td class="num">' + r.points + ' / ' + c.maxPoints +
                '</td><td class="num">' + (r.cableM > 0 ? r.cableM.toFixed(1) + ' m' : '—') + '</td><td class="num">' + (r.cableM > 0 ? r.drop.toFixed(1) + ' %' : '—') +
                '</td><td>' + (r.warnings.length ? esc(r.warnings.join(' ; ')) : 'OK') + '</td></tr>';
        }).join('') + '</tbody></table>';
    html += '<p class="rt-note">Longueurs de câble avec 10 % de marge. Contrôles indicatifs : à faire valider par un électricien (NF C 15-100).</p>';
    return html;
}

function printReport() {
    // Fenêtre de la taille d'une feuille A4 (ratio 210 x 297 mm), pour que l'aperçu corresponde à l'impression
    const win = window.open('', '_blank', 'width=820,height=1100,scrollbars=yes,resizable=yes');
    if (!win) {
        showNotification('Autorisez les fenêtres contextuelles pour imprimer le métré.', 'error');
        return;
    }
    const rep = computeCircuitReport();
    const date = new Date().toLocaleDateString('fr-FR');
    const alerts = rep.alerts.length
        ? '<h3 class="rt-title">Alertes</h3><ul class="rt-alerts">' + rep.alerts.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>'
        : '';
    // Thème de l'appli (barre slate, accent jaune) à l'écran ; feuille blanche sobre à l'impression
    const css = '@page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        'body{margin:0;padding:0;background:#e2e8f0;color:#0f172a;font:13px Inter,system-ui,Arial,sans-serif}' +
        '.page{max-width:186mm;margin:24px auto;padding:0 24px 20px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.12),0 8px 24px rgba(15,23,42,.10)}' +
        '.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 -24px 16px;padding:14px 24px;background:#0f172a;color:#f8fafc;border-radius:12px 12px 0 0;border-bottom:3px solid #facc15}' +
        '.toolbar h1{font-size:17px;font-weight:700;margin:0 auto 0 0;color:#fff}.toolbar h1 small{color:#94a3b8;font-weight:400}' +
        '.toolbar label{font-size:12px;color:#cbd5e1}.toolbar select{font:inherit;padding:6px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#f8fafc}' +
        '.toolbar button{font:inherit;font-weight:600;padding:7px 14px;border:0;border-radius:8px;background:#facc15;color:#0f172a;cursor:pointer}.toolbar button:hover{background:#eab308}' +
        '.rt-title{font-size:13px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #facc15;text-transform:uppercase;letter-spacing:.05em;color:#0f172a}' +
        '.rt{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}' +
        '.rt th,.rt td{padding:6px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0}' +
        '.rt th{background:#1e293b;color:#f8fafc;font-weight:600;font-size:12px}' +
        '.rt tbody tr:last-child td{border-bottom:0}' +
        '.rt .num{text-align:right;white-space:nowrap}.rt tr{break-inside:avoid}' +
        '.rt-warn td{background:#fef2f2}' +
        '.rt tr.rt-gap td{border:0;padding:0;height:12px}' +
        '.rt-note,.rt-empty{font-size:11px;color:#475569}.rt-alerts{margin:0;padding-left:18px}.rt-alerts li{margin-bottom:3px}' +
        '@media print{' +
        'html,body{margin:0 !important;padding:0 !important;background:#fff !important;width:auto !important;overflow:visible !important}' +
        '.page{max-width:186mm;margin:0 auto;padding:0;box-shadow:none;border-radius:0}' +
        '.toolbar{margin:0 0 6px;padding:0 0 6px;background:none;color:#0f172a;border:0;border-bottom:1px solid #0f172a;border-radius:0}' +
        '.toolbar h1{font-size:15px;color:#0f172a}.toolbar h1 small{color:#475569}.toolbar button,.toolbar label{display:none}' +
        'body{font-size:11px}.rt{font-size:10px}.rt th,.rt td{padding:3px 6px}.rt th{background:#e2e8f0;color:#0f172a}.rt thead{display:table-header-group}' +
        '.rt-title{font-size:12px;margin:10px 0 4px}.rt-note,.rt-empty{font-size:9px}.rt-alerts li{margin-bottom:1px}' +
        '}';
    win.document.open();
    win.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Métré — Clic & Volt</title><style>' + css + '</style></head><body><div class="page">' +
        '<div class="toolbar"><h1>Clic & Volt — Métré & contrôles <small style="font-weight:normal;color:#64748b">(' + date + ')</small></h1>' +
        '<label style="font-size:12px">Échelle <select onchange="fitRpt(this.value)" style="font:inherit;padding:4px">' +
        '<option value="1">100 %</option><option value="0.9">90 %</option><option value="0.85">85 %</option><option value="0.8">80 %</option><option value="0.75">75 %</option>' +
        '<option value="auto">Ajuster à une page</option></select></label>' +
        '<button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>' +
        reportTablesHtml(rep) + alerts + '</div>' +
        // Réduit le contenu (zoom) pour qu'il tienne sur une page A4 : 273 mm utiles = 1032 px à 96 dpi
        '<script>function fitRpt(v){var p=document.querySelector(".page");p.style.zoom="1";if(v==="auto"){var h=p.getBoundingClientRect().height;p.style.zoom=String(h>1032?Math.floor(1032/h*100)/100:1);}else{p.style.zoom=v;}}<\/script>' +
        '</body></html>');
    win.document.close();
    win.focus();
}

// Conseil précis pour un avertissement de circuit (ouvre les réglages du circuit)
function circuitWarningHint(w) {
    const t = String(w);
    if (t.includes('points')) return 'Réglages du circuit (⚙) : retirez des points, ou répartissez-les sur un circuit de plus.';
    if (t.includes('section')) return 'Réglages du circuit (⚙) : choisissez une section de câble adaptée au calibre.';
    if (t.includes('chute')) return 'Réglages du circuit (⚙) : passez à une section supérieure, ou scindez le circuit en deux en retirant des éléments vers un second circuit (moins d’appareils sur le trajet le plus long).';
    return 'Réglages du circuit (⚙) : ajustez le calibre ou la section.';
}

// Ouvre l'onglet, sélectionne l'élément ou le circuit concerné par une alerte
let lastAlertTargets = [];
function goToAlert(i) {
    const t = lastAlertTargets[i];
    if (!t) return;
    if (t.circuitId) {
        expandedCircuitCards.add(t.circuitId);
        setRightTab('circuits');
        selectCircuit(t.circuitId);
        return;
    }
    if (t.elId) {
        const item = [...projectData.electrical, ...(projectData.openings || []), ...(projectData.shafts || []), ...(projectData.stairs || [])].find(e => e.id === t.elId);
        if (item && item.levelId && item.levelId !== activeLevelId) setActiveLevel(item.levelId);
        setRightTab(t.tab);
        focusAssociatedElement(t.elId);
        return;
    }
    setRightTab(t.tab);
}

function solutionForWarning(message) {
    const text = String(message).toLowerCase();
    // G2 : pistes propres aux liaisons entre niveaux et aux trémies
    if (text.includes('pas de tableau ni de trémie')) {
        return 'Ajoutez une trémie entre cet étage et le tableau (outil Trémie : cliquez sur un mur), ou placez le tableau à cet étage.';
    }
    if (text.includes('trémie sans mur')) {
        return 'Placez la trémie sur un mur de cet étage, ou supprimez-la si elle ne sert à rien.';
    }
    if (text.includes("n'est relié au tableau par aucune trémie")) {
        return 'Ajoutez une trémie entre cet étage et un niveau déjà relié au tableau.';
    }
    if (text.includes('aucune trémie entre')) {
        return 'Ajoutez une trémie entre les deux niveaux pour relier la commande au luminaire.';
    }
    if (text.includes('points pour') || text.includes('maximum')) {
        return 'Attribuez certains appareils à un autre circuit ou créez un circuit supplémentaire, sans dépasser le calibre ni la section prévus.';
    }
    if (text.includes('section') && text.includes('trop faible')) {
        return 'Augmentez la section des conducteurs pour qu’elle soit adaptée au calibre de la protection et au mode de pose.';
    }
    if (text.includes('chute de tension')) {
        return 'Vérifiez le dimensionnement : augmentez la section des conducteurs, ou scindez le circuit en deux en diminuant le nombre d’éléments (répartissez-les sur un second circuit).';
    }
    if (text.includes('sans chemin') || text.includes('pas pu être reliés')) {
        return 'Le câble ne trouve pas de passage : vérifiez que les murs se rejoignent bien, rapprochez l’appareil du parcours des autres câbles ou ajoutez une trémie à proximité.';
    }
    if (text.includes('aucune descente possible')) {
        return 'Déplacez légèrement l’appareil sur le mur ou essayez l’autre face afin de dégager un cheminement vertical sans ouverture.';
    }
    if (text.includes('aucun tableau')) {
        return 'Ajoutez un tableau électrique au plan, puis vérifiez que chaque appareil peut être relié au tableau.';
    }
    if (text.includes('plusieurs tableaux')) {
        return 'Conservez un tableau principal ou vérifiez explicitement l’alimentation et le rattachement des autres tableaux.';
    }
    if (text.includes('sans luminaire')) {
        return 'Ajoutez le luminaire à commander ou retirez la commande inutilisée.';
    }
    if (text.includes('sans interrupteur')) {
        return 'Ajoutez une commande d’éclairage adaptée et vérifiez son association au luminaire.';
    }
    if (text.includes('va-et-vient')) {
        return 'Associez les interrupteurs va-et-vient par paire et vérifiez leur câblage avec les navettes.';
    }
    if (text.includes('plage de hauteur')) {
        return 'Réglez la hauteur de la commande entre 0,90 m et 1,30 m, puis contrôlez le contexte et les exigences applicables.';
    }
    if (text.includes('porte') || text.includes('fenêtre') || text.includes('à déplacer')) {
        return 'Déplacez l’appareil hors de l’emprise de l’ouverture et vérifiez son implantation sur les plans 2D et 3D.';
    }
    return 'Vérifiez le dimensionnement, le raccordement et les exigences NF C 15-100 applicables à cette installation.';
}

function exportBOM() {
    const rep = computeCircuitReport();
    const rows = [['Catégorie', 'Désignation', 'Quantité', 'Unité']];
    buildBomRows(rep).forEach(r => rows.push(r || []));
    rows.push([]);
    rep.rows.forEach(r => rows.push(['Circuit', r.circuit.name + ' (' + r.circuit.breakerRating + 'A, ' + r.circuit.wireSection + ' mm²)', r.points + ' pts / ' + r.cableM.toFixed(1) + ' m / ΔU ' + r.drop.toFixed(1) + ' %', '']));
    const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'clic_and_volt_pro_metre.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotification('Métré exporté en CSV', 'success');
}

const CIRCUIT_STEPS = { breakerRating: [10, 16, 20, 32], wireSection: [1.5, 2.5, 6] };

function stepperHtml(id, field, label, value) {
    const btn = (dir, sym) => '<button onclick="event.stopPropagation();adjustCircuit(\'' + esc(id) + '\',\'' + field + '\',' + dir + ')" class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 leading-none" aria-label="' + label + (dir > 0 ? ' +' : ' -') + '">' + sym + '</button>';
    return '<span class="flex items-center gap-1" title="' + label + '">' + label + ' ' + btn(-1, '−') +
        '<span class="min-w-[2.5rem] text-center font-semibold text-slate-100">' + esc(value) + '</span>' + btn(1, '+') + '</span>';
}

// Mode de câblage du circuit : « chain » (chaîné, défaut) ou « star » (étoile)
function toggleWiringMode(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    saveStateToUndo();
    c.wiringMode = c.wiringMode === 'star' ? 'chain' : 'star';
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

// Cheminement des câbles du circuit : passe au mode suivant (murs → mixte → plafond → murs)
function toggleCircuitRouting(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (c) setCircuitRouting(id, nextCableRouting(cableRoutingOf(c)));
}

// Cheminement des câbles du circuit : « murs » (défaut), « mixte » ou « plafond »
function setCircuitRouting(id, mode) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c || !CABLE_ROUTING[mode] || cableRoutingOf(c) === mode) return;
    saveStateToUndo();
    c.cableRouting = mode;
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

function adjustCircuit(id, field, dir) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    let next;
    if (field === 'maxPoints') {
        next = (c.maxPoints | 0) + dir;
        const standardLimit = CIRCUIT_POINT_LIMITS[circuitRoot(c).id];
        if (next < 1) return;
        if (standardLimit !== undefined && next > standardLimit) {
            showNotification('Limite NF C 15-100 dépassée : ' + standardLimit + ' points maximum pour ce circuit', 'error');
            return;
        }
    } else {
        const steps = CIRCUIT_STEPS[field];
        if (!steps) return;
        let idx = steps.findIndex(v => v >= c[field]);
        if (idx < 0) idx = steps.length - 1;
        else if (steps[idx] !== c[field] && dir < 0) idx -= 1;
        else if (steps[idx] === c[field]) idx += dir;
        if (idx < 0 || idx >= steps.length) return;
        next = steps[idx];
    }
    if (next === c[field]) return;
    saveStateToUndo();
    c[field] = next;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
}

async function editCircuit(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    const num = v => parseFloat(String(v).replace(',', '.'));
    const standardLimit = CIRCUIT_POINT_LIMITS[circuitRoot(c).id];
    const values = await askFields('Circuit « ' + c.name + ' »', [
        { id: 'breaker', label: 'Calibre du disjoncteur (A)', value: String(c.breakerRating), inputmode: 'decimal' },
        { id: 'section', label: 'Section du fil (mm²)', value: String(c.wireSection), inputmode: 'decimal' },
        { id: 'points', label: 'Points maximum', value: String(c.maxPoints), inputmode: 'numeric' }
    ], 'Enregistrer', v => {
        const b = num(v.breaker), s = num(v.section), m = num(v.points);
        if (!(b > 0) || !(s > 0) || !(m >= 1)) return 'Valeurs invalides (ex. : 16 ; 2,5 ; 8).';
        if (standardLimit !== undefined && Math.round(m) > standardLimit) return 'Limite NF C 15-100 dépassée : ' + standardLimit + ' points maximum pour ce circuit.';
        return null;
    });
    if (values === null) return;
    const b = num(values.breaker), s = num(values.section), m = num(values.points);
    saveStateToUndo();
    c.breakerRating = b;
    c.wireSection = s;
    c.maxPoints = Math.round(m);
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    showNotification('Circuit mis à jour', 'success');
}

// ---------- Inspecteurs d'éléments (3D + 2D) ----------
// Inspecteurs communs : un seul panneau gauche est visible à la fois, donc on déplace les blocs
// dans la sidebar du mode courant (les identifiants restent uniques, le code ne change pas)
// Sections repliables de la barre gauche : leur état (ouvert / fermé) est mémorisé dans le navigateur.
// Le stockage peut être indisponible (navigation privée, données bloquées) : tout est protégé par try/catch.
const COLLAPSE_STORAGE_KEY = 'cv_sections_ouvertes_v1';
function readCollapseState() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeCollapseState() {
    const state = {};
    document.querySelectorAll('details[data-persist]').forEach(d => { state[d.dataset.persist] = d.open; });
    try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible : on ignore */ }
}
function initCollapsibleSections() {
    const saved = readCollapseState();
    document.querySelectorAll('details[data-persist]').forEach(d => {
        if (Object.prototype.hasOwnProperty.call(saved, d.dataset.persist)) d.open = !!saved[d.dataset.persist];
        d.addEventListener('toggle', writeCollapseState);
    });
}
// Barre droite en onglets : un seul panneau visible à la fois (2D et 3D partagent le même choix).
// Les sections existantes restent les mêmes ; on leur ajoute seulement un repère data-tab.
// [clé, libellé affiché, titre de section à reconnaître, icône, aide au survol]
const RIGHT_TABS = [
    ['ouvertures', 'Ouvertures', 'Ouvertures', [['fa-door-open', '#b07a4a'], ['fa-window-maximize', '#3b82f6'], ['fa-stairs', '#8b5cf6']], 'Placer portes, fenêtres, trémies et escaliers', 'text-sky-400'],
    // (couleurs alignées sur le plan 2D : porte marron, fenêtre bleue, trémie blanche, escalier violet)
    ['appareillage', 'Appareillages', 'Appareillages', [['fa-plug', '#f97316'], ['fa-toggle-on', '#10b981'], ['fa-lightbulb', '#fde047']], 'Placer tableau, dérivations, prises, interrupteurs et plafonniers', 'text-violet-400'],
    ['circuits', 'Circuits', 'Circuits', 'fa-bezier-curve', 'Voir un circuit mis en surbrillance', 'text-rose-400'],
    ['avertissements', 'Alertes', 'Avertissements', 'fa-triangle-exclamation', 'Points à vérifier dans le projet', 'text-yellow-400']
];
const RIGHT_TAB_KEY = 'cv_onglet_droite_v1';
const RIGHT_SIDEBARS = ['sidebar-2d-right', 'sidebar-3d-right'];

// Onglet courant (null = aucun, comme un outil désactivé par un second clic)
let rightTabCurrent = null;

function readRightTab() {
    try {
        const v = localStorage.getItem(RIGHT_TAB_KEY);
        if (v === '') return null;
        return RIGHT_TABS.some(([k]) => k === v) ? v : 'ouvertures';
    } catch (e) { return 'ouvertures'; }
}

function setRightTab(key, save = true) {
    rightTabCurrent = key;
    RIGHT_SIDEBARS.forEach(id => {
        const side = document.getElementById(id);
        if (!side) return;
        side.querySelectorAll('details[data-tab]').forEach(d => {
            const on = d.dataset.tab === key;
            d.classList.toggle('hidden', !on);
            if (on) d.open = true;
        });
    });
    document.querySelectorAll('.right-tabs [data-right-tab]').forEach(b => {
        const on = b.dataset.rightTab === key;
        // Chaque onglet a son propre liseré (gris) ; l'onglet actif est entouré d'un liseré jaune
        b.className = 'right-tab-btn relative px-2 py-2 rounded-xl border flex items-center gap-2 transition text-[11px] leading-tight ' +
            (on ? 'tool-active-yellow border-yellow-400 ring-1 ring-yellow-400/60'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-500 text-slate-200');
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (save) { try { localStorage.setItem(RIGHT_TAB_KEY, key || ''); } catch (e) { /* stockage indisponible */ } }
}

function buildRightTabs() {
    RIGHT_SIDEBARS.forEach(id => {
        const side = document.getElementById(id);
        const body = side && side.querySelector('.overflow-y-auto');
        if (!body) return;
        body.querySelectorAll('details').forEach(d => {
            const s = d.querySelector('summary');
            const label = s ? s.textContent.trim() : '';
            const m = RIGHT_TABS.find(t => label.startsWith(t[2]));
            if (m) {
                d.dataset.tab = m[0];
                // Présentation identique à « Ouvertures » et « Appareillages » : pas de cadre, même titre, pas d'icône
                d.className = 'space-y-2';
                const title = d.querySelector('summary');
                if (title) {
                    title.className = 'text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer';
                    title.querySelectorAll('i').forEach(icon => icon.remove());
                }
            }
        });
        const bar = document.createElement('div');
        // La barre remonte jusqu'au bord du panneau (-mt-3 / -top-3 compensent le padding du conteneur) pour que rien ne passe au-dessus ni entre les onglets
        bar.className = 'right-tabs sticky -top-3 -mt-3 pt-3 z-10 bg-slate-900 grid grid-cols-2 gap-2 pb-2 text-xs';
        RIGHT_TABS.forEach(([key, label, , icon, tip, color]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.rightTab = key;
            b.title = tip;
            b.innerHTML = `<span class="flex gap-1">${Array.isArray(icon)
                ? icon.map(([c, col]) => `<i class="fa-solid ${c} text-xs" style="color:${col}"></i>`).join('')
                : `<i class="fa-solid ${icon} ${color} text-sm"></i>`}</span><span class="whitespace-nowrap">${label}</span><span class="tab-count opacity-80"></span>`;
            // second clic sur l'onglet actif : on le désactive, comme un outil de placement
            b.addEventListener('click', () => setRightTab(rightTabCurrent === key ? null : key));
            bar.appendChild(b);
        });
        body.insertBefore(bar, body.firstChild);
    });
    setRightTab(readRightTab(), false);
}

document.addEventListener('DOMContentLoaded', () => {
    initCollapsibleSections();
    buildRightTabs();
});

const SHARED_INSPECTORS_3D = ['wall-inspector', 'default-specs-2d', 'shaft-inspector'];
const SHARED_CONTROLS_2D = ['position-distance-container'];

function sharedHomeMark(el) {
    if (!el._homeMark) {
        el._homeMark = document.createComment('home:' + el.id);
        el.parentNode.insertBefore(el._homeMark, el);
    }
    return el._homeMark;
}

// Outils communs (Mode d'interaction, garde-fous des murs, aides) : une seule copie, déplacée selon le mode
function placeSharedTools() {
    const block = document.getElementById('shared-tools-block');
    const slot = document.getElementById('shared-tools-slot-3d');
    if (!block) return;
    const mark = sharedHomeMark(block);
    const in3d = currentMode === '3d';
    if (in3d && slot) slot.appendChild(block);
    else mark.parentNode.insertBefore(block, mark);
}

// Choix d'un outil : en 2D, l'outil 2D ; en 3D, « Tracer mur » lance la pose de mur, « Sélectionner » sort de la pose
function setModeTool(tool) {
    if (currentMode !== '3d') { setTool(tool); return; }
    if (tool === 'wall') {
        if (activePlacementType !== 'wall') setPlacementType('wall');
    } else if (activePlacementType) {
        setPlacementType(activePlacementType);   // même type : désactive le mode de pose
    }
    refreshToolButtons();
}

// Surbrillance de l'outil actif, dans la sidebar commune
function refreshToolButtons(override) {
    const active = override || (currentMode === '3d' ? (activePlacementType === 'wall' ? 'wall' : 'select') : currentTool);
    document.querySelectorAll('.tool-btn').forEach(btn => {
        const on = btn.id === 'btn-tool-' + active;
        btn.className = 'tool-btn px-2 py-2 rounded-xl border bg-slate-800 hover:bg-slate-700 text-[11px] font-medium flex items-center gap-2 transition ' +
            (on ? 'tool-active-yellow border-yellow-400 ring-1 ring-yellow-400/60' : 'border-slate-500 text-slate-200');
    });
}

function placeSharedInspectors() {
    placeSharedTools();
    placeToolHint();
    refreshToolHint();
    const slot3d = document.getElementById('shared-inspector-slot-3d');
    const slot2d = document.getElementById('shared-controls-slot-2d');
    const slotSide2d = document.getElementById('shared-side-slot-2d');
    const place = (id, target) => {
        const el = document.getElementById(id);
        if (!el) return;
        const mark = sharedHomeMark(el);
        if (target === 'home') mark.parentNode.insertBefore(el, mark);
        else if (target) target.appendChild(el);
    };
    const in3d = currentMode === '3d';
    SHARED_INSPECTORS_3D.forEach(id => place(id, in3d ? slot3d : 'home'));
    place('side-toggle-container', in3d ? 'home' : slotSide2d);
    SHARED_CONTROLS_2D.forEach(id => place(id, in3d ? 'home' : slot2d));
    placeHeightControl();
}

// En 3D, la hauteur d'une trémie se règle dans son cadre (un seul cadre, pas de second « Trémie » au-dessus)
function placeHeightControl() {
    const h = document.getElementById('height-control-container');
    const box = document.getElementById('shaft-inspector');
    if (!h || !box) return;
    const mark = sharedHomeMark(h);
    const shaftIn3D = currentMode === '3d' && (projectData.shafts || []).some(s => s.id === selected3DId);
    if (shaftIn3D) box.firstElementChild.after(h);
    else if (box.contains(h)) mark.parentNode.insertBefore(h, mark);
}

// Rafraîchit la vue active après une modification de l'élément sélectionné (2D ou 3D)
function refreshSelectedView() {
    if (currentMode === '3d') build3DScene(); else redraw2D();
}

// Bouton main : un second clic désactive le déplacement et revient à la sélection
function togglePanTool() {
    setTool(currentTool === 'pan' ? 'select' : 'pan');
}

// Garde-fous des murs (2D, et plus tard 3D) :
// - « Modifier les murs » : interrupteur, désactivé par défaut. Sans lui, un clic sur un mur le sélectionne seulement.
// - « Murs verrouillés » : bloque tout déplacement, étirement et saisie de longueur, même en mode modification.
let wallEditMode = false;

function canEditWalls() {
    return !!wallEditMode && !projectData.wallsLocked;
}

// Message affiché quand une modification de mur est refusée
function wallEditRefusedMessage() {
    return projectData.wallsLocked
        ? "Murs verrouillés : déverrouillez-les pour modifier les murs."
        : "Activez « Modifier les murs » pour changer ce mur.";
}

function toggleWallEdit() {
    if (projectData.wallsLocked) {
        showNotification("Les murs sont verrouillés : déverrouillez-les d’abord.", "info");
        return;
    }
    wallEditMode = !wallEditMode;
    updateWallEditButtons();
    showNotification(wallEditMode ? "Modification des murs activée" : "Modification des murs désactivée", "info");
}

function toggleWallsLock() {
    projectData.wallsLocked = !projectData.wallsLocked;
    if (projectData.wallsLocked) { wallEditMode = false; if (selectedWallIds.length) setSelectedWalls([]); }
    updateWallEditButtons();
    showNotification(projectData.wallsLocked ? "Murs verrouillés" : "Murs déverrouillés", "info");
}

// Autorise (ou retire) pour un seul circuit le passage du câble à plafond entre pièces fermées
function setCircuitRoomCrossing(id, on) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c || !!c.roomCrossing === !!on) return;
    saveStateToUndo();
    c.roomCrossing = !!on;
    _cableCache.sig = null;
    updateStats();
    updateCircuitsUI();
    redraw2D();
    scheduleBuild3D();
    showNotification(on ? "Passage entre pièces autorisé pour « " + c.name + " »" : "Passage entre pièces retiré pour « " + c.name + " »", "info");
}

// Bouton à bascule (murs) : liseré coloré quand actif (jaune pour « Modifier les murs », rose pour le verrou), gris sinon
function setActiveRing(el, on, colour = 'yellow') {
    const cls = colour === 'rose'
        ? ['border-rose-400', 'ring-rose-400/60']
        : ['border-yellow-400', 'ring-yellow-400/60'];
    cls.forEach(c => el.classList.toggle(c, on));
    el.classList.toggle('ring-1', on);
    el.classList.toggle('border-slate-500', !on);
}

function updateWallEditButtons() {
    const allowed = canEditWalls();
    const locked = !!projectData.wallsLocked;
    syncDefaultSpecs();
    // deux copies (2D et 3D) de chaque bouton : toutes sont mises à jour ensemble
    document.querySelectorAll('.wall-edit-btn').forEach(editBtn => {
        editBtn.disabled = locked;
        editBtn.classList.toggle('opacity-50', locked);
        editBtn.classList.toggle('cursor-not-allowed', locked);
        setActiveRing(editBtn, allowed, 'yellow');
        const state = editBtn.querySelector('.wall-edit-state');
        if (state) state.textContent = allowed ? 'oui' : 'non';
        editBtn.setAttribute('aria-pressed', allowed ? 'true' : 'false');
    });
    document.querySelectorAll('.wall-lock-btn').forEach(lockBtn => {
        setActiveRing(lockBtn, locked, 'rose');
        const state = lockBtn.querySelector('.wall-lock-state');
        if (state) state.textContent = locked ? 'oui' : 'non';
        lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
    });
    // Les champs de l'inspecteur de mur sont désactivés quand la modification n'est pas permise
    ['inspector-length-input', 'inspector-thickness', 'inspector-height'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !allowed;
        el.classList.toggle('opacity-40', !allowed);
        el.classList.toggle('cursor-not-allowed', !allowed);
    });
    const hint = document.getElementById('wall-edit-hint');
    if (hint) {
        hint.textContent = allowed ? '' : wallEditRefusedMessage();
        hint.classList.toggle('hidden', allowed);
    }
}

// Bandeau « Annuler » après une modification de mur (visible environ 6 s)
let undoBarTimer = null;

// Liaisons trémie → étage qui fonctionnent (la trémie tombe sur un mur de cet étage)
function shaftLinksValid() {
    const ok = new Set();
    (projectData.shafts || []).forEach(sh => (sh.levelIds || []).forEach(lv => {
        if (shaftValidOn(sh, lv)) ok.add(sh.id + '|' + lv);
    }));
    return ok;
}

// Message du bandeau après un geste sur un mur : signale les étages dont les câbles ne montent plus
// Étages dont une liaison trémie fonctionnait avant le geste et ne fonctionne plus
function shaftLinksLostSince(before) {
    const lost = [];
    if (!before) return lost;
    (projectData.shafts || []).forEach(sh => (sh.levelIds || []).forEach(lv => {
        if (before.has(sh.id + '|' + lv) && !shaftValidOn(sh, lv)) {
            const l = (projectData.levels || []).find(x => x.id === lv);
            const name = l ? l.name : lv;
            if (!lost.includes(name)) lost.push(name);
        }
    }));
    return lost;
}

// Message de refus : le geste est annulé pour que les câbles restent en place
function shaftRefusalMessage(lost) {
    return 'Geste refusé : la trémie ne tomberait plus sur un mur de ' + lost.join(', ') + ' et les câbles seraient coupés. Déplacez d’abord le mur de l’étage ou la trémie.';
}

function wallMoveMessage(before, verb) {
    const lost = shaftLinksLostSince(before);
    if (!lost.length) return 'Mur ' + verb;
    return 'Mur ' + verb + ' : la trémie ne tombe plus sur un mur de ' + lost.join(', ') + ' (câbles coupés). Annuler pour revenir.';
}

function showUndoBar(msg) {
    const bar = document.getElementById('undo-bar');
    const text = document.getElementById('undo-bar-msg');
    if (!bar || !text) return;
    text.textContent = msg;
    bar.classList.remove('hidden');
    clearTimeout(undoBarTimer);
    undoBarTimer = setTimeout(hideUndoBar, 6000);
}

function hideUndoBar() {
    const bar = document.getElementById('undo-bar');
    if (bar) bar.classList.add('hidden');
    clearTimeout(undoBarTimer);
}

// Affiche « Désélectionner » seulement quand quelque chose est sélectionné (2D et 3D)
function updateDeselectButtons() {
    const any = !!(selected3DId || selectedCircuitId || selectedWallIds.length || selectedDeviceIds.length || selectedOpeningIds.length);
    const b = document.getElementById('btn-deselect-all');
    if (b) b.classList.toggle('hidden', !any || currentModeKey() === 'place');
    // Suppression de la sélection (un ou plusieurs éléments, 2D et 3D) : bouton unique en haut
    const del = document.getElementById('btn-delete-multi');
    const deletable = !!(selected3DId || selectedDeviceIds.length || selectedOpeningIds.length || (selectedWallIds.length && !projectData.wallsLocked));
    if (del) del.classList.toggle('hidden', !deletable);
}

// Vide toute sélection (murs, appareils, ouvertures, trémies, escaliers, circuit mis en évidence)
function clearAllSelection() {
    setSelectedWalls([]);
    selectedDeviceIds = [];
    selectedOpeningIds = [];
    selected3DId = null;
    selectedCircuitId = null;
    updateSelectionHighlight(null);
    syncElementInspectors();
    updateCircuitsUI();
    if (currentMode === '3d') build3DScene(); else redraw2D();
}

// Bouton « Désélection » de la sidebar : visible pendant la pose d'un appareil ou d'une ouverture (2D et 3D)
function updateStopPlacementButton(key) {
    const b = document.getElementById('btn-stop-placement');
    if (b) b.classList.toggle('hidden', key !== 'place');
    updateDeselectButtons();
}

// Arrête la pose en cours et vide la sélection, comme Échap
function stopPlacement() {
    if (currentMode === '3d') {
        if (activePlacementType) setPlacementType(activePlacementType);
    } else setTool('select');
    clearAllSelection();
}

// Circuit mis en évidence au clic : celui d'un point de circuit, ou celui qu'une boîte de dérivation porte.
// Une commande et l'appareil qu'elle pilote ne sélectionnent pas de circuit : seul leur câblage de commande s'affiche.
function highlightCircuitOf(el) {
    if (!el) return null;
    if (el.type === 'junction_box') return boxCircuitOf(el);
    if (isControl(el) || isControlledByLink(el)) return null;
    return isCircuitPoint(el) ? circuitOf(el) : null;
}

function isControlledByLink(el) {
    return (getCableNetwork().controlLinks || []).some(link => link.lightIds.includes(el.id));
}

// Circuit d'une boîte de dérivation : celui dont elle porte les câbles (lighting par défaut)
function boxCircuitOf(el) {
    return projectData.circuits.find(c => c.id === (el.circuitId || DEFAULT_CIRCUIT_BY_TYPE.light_ceiling)) || null;
}
// Libellés de l'inspecteur : pour une boîte, dire clairement quel circuit elle porte
function setCircuitInspectorText(el) {
    const isBox = !!(el && el.type === 'junction_box');
    const c = isBox ? boxCircuitOf(el) : null;
    const label = isBox ? 'Circuit porté par cette boîte' : 'Circuit';
    let info = '';
    if (c) {
        const served = (getCableNetwork().boxServed || {})[el.id] || 0;
        info = 'Les câbles de « ' + c.name + ' » passent par cette boîte. ' +
            (served > 0
                ? 'Utilisée : elle dessert ' + served + ' appareil' + (served > 1 ? 's' : '') + '.'
                : 'Non utilisée : elle ne dessert aucun appareil pour l’instant (un appareil se relie à elle seulement si c’est le trajet le plus court, en mode étoile).');
    }
    [['circuit-select-label', 'circuit-select-info'], ['el2d-circuit-label', 'el2d-circuit-info']].forEach(([lid, iid]) => {
        const l = document.getElementById(lid), i = document.getElementById(iid);
        if (l) l.textContent = label;
        if (i) { i.textContent = info; i.classList.toggle('hidden', !isBox); }
    });
}

function fillCircuitSelect(sel, el) {
    if (!sel) return;
    const cur = el && el.type === 'junction_box' ? boxCircuitOf(el) : circuitOf(el);
    sel.innerHTML = '';
    projectData.circuits.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name + ' (' + c.breakerRating + 'A)';
        if (cur && cur.id === c.id) o.selected = true;
        sel.appendChild(o);
    });
}

function electricalDisplayName(el) {
    const sameType = projectData.electrical.filter(candidate => candidate.type === el.type);
    const ordinal = sameType.findIndex(candidate => candidate.id === el.id) + 1;
    const base = (ELEMENT_LABELS[el.type] || el.type) + ' n°' + ordinal;
    return isDedicatedOutlet(el) ? base.replace(' n°', ' (' + DEDICATED_APPLIANCE_LABELS[dedicatedApplianceOf(el)] + ') n°') : base;
}

// Survol du plan (2D et 3D) : une étiquette indique l'élément visé (nom, étage, circuit)
let planTooltipEl = null;
function planHoverInfo(id) {
    if (!id) return null;
    const levelName = lvId => ((projectData.levels || []).find(l => l.id === lvId) || {}).name;
    const el = projectData.electrical.find(e => e.id === id);
    if (el) {
        const c = el.type === 'junction_box' ? boxCircuitOf(el) : circuitOf(el);
        const parts = [levelName(el.levelId), c ? 'circuit ' + c.name : ''];
        if (c && el.type.startsWith('outlet_')) {
            const max = maxPointsForCircuit(c);
            parts.push(max + (max > 1 ? ' prises max' : ' prise max'));
        }
        return { title: electricalDisplayName(el), sub: parts.filter(Boolean).join(' · ') };
    }
    const op = projectData.openings.find(o => o.id === id);
    if (op) return { title: op.type === 'door_single' ? 'Porte' : 'Fenêtre', sub: levelName(op.levelId) || '' };
    const sh = (projectData.shafts || []).find(s => s.id === id);
    if (sh) return { title: shaftTitle(id), sub: '' };
    const st = (projectData.stairs || []).find(s => s.id === id);
    if (st) return { title: 'Escalier', sub: stairLevelNames(st).join(' ↔ ') };
    return null;
}
function showPlanTooltip(clientX, clientY, id) {
    const info = planHoverInfo(id);
    if (!info) { hidePlanTooltip(); return; }
    if (!planTooltipEl) {
        planTooltipEl = document.createElement('div');
        planTooltipEl.className = 'fixed z-[80] pointer-events-none px-2 py-1 rounded-md bg-slate-900/95 border border-slate-600 text-[11px] text-slate-100 shadow-lg hidden';
        document.body.appendChild(planTooltipEl);
    }
    planTooltipEl.innerHTML = '<div class="font-semibold">' + esc(info.title) + '</div>' +
        (info.sub ? '<div class="text-[10px] text-slate-400">' + esc(info.sub) + '</div>' : '') +
        '<div class="text-[10px] text-sky-300">Clic : sélectionner</div>';
    planTooltipEl.style.left = (clientX + 14) + 'px';
    planTooltipEl.style.top = (clientY + 14) + 'px';
    planTooltipEl.classList.remove('hidden');
}
function hidePlanTooltip() { if (planTooltipEl) planTooltipEl.classList.add('hidden'); }

function focusAssociatedElement(id) {
    // ouverture depuis une alerte ou une liste : seul cet élément reste sélectionné (ni circuit, ni autres)
    setSelectedWalls([]);
    selectedDeviceIds = [];
    selectedOpeningIds = [];
    selectedCircuitId = null;
    selected3DId = id;
    if (currentMode === '3d') {
        build3DScene();
        const obj = interactiveObjects3D.find(candidate => candidate.userData && candidate.userData.id === id);
        if (obj) select3DElement(id, obj);
    } else {
        syncElementInspectors();
        redraw2D();
    }
}

// Indique à quel niveau se trouve un appareil dans les listes d'association (ex. « · RDC »)
function levelSuffix(item) {
    const lv = (projectData.levels || []).find(l => l.id === item.levelId);
    return lv ? ' <span class="text-slate-500">· ' + esc(lv.name) + '</span>' : '';
}

// G1 : préfixe « Sous-sol : » pour situer une alerte (seulement s'il y a plusieurs niveaux)
function levelPrefix(levelId) {
    const levels = projectData.levels || [];
    if (levels.length < 2) return '';
    const lv = levels.find(l => l.id === levelId);
    return lv ? lv.name + ' : ' : '';
}

// G3 : aide et raccourcis (bouton « ? » de la barre et touche ?)
function bindHelpButton() {
    const b = document.getElementById('help-fab');
    if (b) b.addEventListener('click', () => toggleHelpPanel());
}

function toggleHelpPanel(force) {
    const existing = document.getElementById('help-panel');
    const open = force === undefined ? !existing : force;
    if (!open) { if (existing) existing.remove(); return; }
    if (existing) return;
    const p = document.createElement('div');
    p.id = 'help-panel';
    p.className = 'fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center p-4';
    const rows = [
        ['Ctrl+Z', 'Annuler'],
        ['Ctrl+Y ou Ctrl+Maj+Z', 'Rétablir'],
        ['T  /  S', 'Tracer un mur  /  Sélectionner'],
        ['← →  (Maj : 1 cm)', 'Appareil ou porte le long du mur ; escalier et plafonnier en x'],
        ['↑ ↓  (Maj : 1 cm)', 'Hauteur de l’appareil mural ; escalier et plafonnier en y'],
        ['Ctrl+D', 'Dupliquer l’élément sélectionné'],
        ['Suppr ou Retour arrière', 'Supprimer la sélection (2D ou 3D)'],
        ['Échap', 'Arrêter le tracé de mur ou le mode placement'],
        ['Clic droit (2D)', 'Arrêter le tracé de mur en cours'],
        ['Ctrl ou Maj + clic (2D)', 'Ajouter ou retirer un élément de la sélection'],
        ['Glisser dans le vide (2D)', 'Sélection par rectangle (appareils, ouvertures)'],
        ['?', 'Ouvrir ou fermer cette aide']
    ];
    const lines = rows.map(([k, v]) => '<tr><td class="py-1.5 pr-4 align-top whitespace-nowrap"><kbd class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-300 text-xs">' + k + '</kbd></td><td class="py-1.5 text-slate-300">' + v + '</td></tr>').join('');
    p.innerHTML = '<div role="dialog" aria-label="Aide et raccourcis" class="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full shadow-2xl text-sm text-slate-200">' +
        '<div class="flex items-center justify-between mb-3"><h2 class="text-base font-semibold">Aide et raccourcis</h2>' +
        '<button type="button" id="help-close" class="text-slate-400 hover:text-white px-2" aria-label="Fermer">✕</button></div>' +
        '<table class="w-full text-xs"><tbody>' + lines + '</tbody></table>' +
        '<p class="mt-4 text-[11px] text-slate-400">Les alertes du métré indiquent le niveau concerné et proposent une piste de correction.</p></div>';
    p.addEventListener('click', e => { if (e.target === p) toggleHelpPanel(false); });
    document.body.appendChild(p);
    document.getElementById('help-close').addEventListener('click', () => toggleHelpPanel(false));
}

function updateLightingAssociations(el) {
    const boxes = [
        document.getElementById('lighting-associations'),
        document.getElementById('lighting-associations-2d')
    ].filter(Boolean);
    const isLoad = el && isControlledLoad(el);
    if (!el || (!isLoad && !isControl(el))) {
        boxes.forEach(box => box.classList.add('hidden'));
        return;
    }

    const network = getCableNetwork();
    const links = network.controlLinks || [];
    const switches = new Map(links.map(link => [link.switchId, link]));
    const lightById = new Map(projectData.electrical
        .filter(candidate => isControlledLoad(candidate))
        .map(light => [light.id, light]));
    const switchById = new Map(projectData.electrical.filter(isControl).map(sw => [sw.id, sw]));
    const linkButton = item =>
        '<button type="button" data-related-id="' + esc(item.id) +
        '" class="text-left text-[11px] text-amber-300 underline decoration-dotted">' +
        esc(electricalDisplayName(item)) + levelSuffix(item) + '</button>';
    let content = '<div class="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Commandes d’éclairage calculées</div>';

    if (isControl(el)) {
        const lightIds = switches.get(el.id) ? switches.get(el.id).lightIds : [];
        content += '<div class="text-[11px] text-slate-300">Charge(s) commandée(s)</div>';
        if (!lightIds.length) {
            content += '<div class="text-[11px] text-slate-500">Aucune association calculée (vérifiez le tableau et les trajets).</div>';
        } else {
            content += '<ol class="list-decimal list-inside space-y-1">';
            lightIds.forEach(id => {
                const light = lightById.get(id);
                if (!light) return;
                content += '<li class="text-[11px] text-slate-300">' + linkButton(light);
                const otherSwitches = links
                    .filter(link => link.switchId !== el.id && link.lightIds.includes(id))
                    .map(link => switchById.get(link.switchId))
                    .filter(Boolean);
                if (otherSwitches.length) {
                    const partnerLabel = el.type === 'switch_va_et_vient' &&
                        otherSwitches.some(other => other.type === 'switch_va_et_vient')
                        ? 'Autre interrupteur va-et-vient'
                        : 'Autre commande du point';
                    content += '<div class="ml-4 text-[11px] text-sky-300">' + partnerLabel + ' : ' +
                        otherSwitches.map(linkButton).join(', ') + '</div>';
                }
                content += '</li>';
            });
            content += '</ol>';
        }
        const configuredIds = Array.isArray(el.controlledLightIds) ? el.controlledLightIds : lightIds;
        content += '<details class="pt-1"><summary class="cursor-pointer text-[11px] text-emerald-300">Modifier les associations</summary><div class="mt-1 space-y-1">';
        const compatibleLoads = [...lightById.values()].filter(light => canControl(el, light));
        if (!compatibleLoads.length) content += '<div class="text-[11px] text-slate-500">Ajoutez une charge compatible au plan (' + esc(compatibleLoadsHint(el)) + ').</div>';
        compatibleLoads.forEach(light => {
            content += '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
                esc(el.id) + '" data-association-light="' + esc(light.id) + '"' +
                (configuredIds.includes(light.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
                esc(electricalDisplayName(light)) + levelSuffix(light) + '</label>';
        });
        content += '</div></details>';
    } else {
        const controllingSwitches = links
            .filter(link => link.lightIds.includes(el.id))
            .map(link => switchById.get(link.switchId))
            .filter(Boolean);
        content += '<div class="text-[11px] text-slate-300">Commande(s) associée(s)</div>';
        if (!controllingSwitches.length) {
            content += '<div class="text-[11px] text-slate-500">Aucune association calculée (vérifiez le tableau et les trajets).</div>';
        } else {
            content += '<div class="flex flex-wrap gap-x-2 gap-y-1">' + controllingSwitches.map(linkButton).join('') + '</div>';
            const vaEtVient = controllingSwitches.filter(sw => sw.type === 'switch_va_et_vient');
            if (vaEtVient.length > 1) {
                content += '<div class="text-[11px] text-sky-300">Va-et-vient : ' + vaEtVient.map(linkButton).join(' ↔ ') + '</div>';
            }
        }
        content += '<details class="pt-1"><summary class="cursor-pointer text-[11px] text-emerald-300">Modifier les associations</summary><div class="mt-1 space-y-1">';
        const compatibleSwitches = [...switchById.values()].filter(sw => canControl(sw, el));
        if (!compatibleSwitches.length) content += '<div class="text-[11px] text-slate-500">Ajoutez une commande compatible au plan (' + esc(compatibleControlsHint(el)) + ').</div>';
        compatibleSwitches.forEach(sw => {
            const association = switches.get(sw.id);
            const configuredIds = Array.isArray(sw.controlledLightIds)
                ? sw.controlledLightIds
                : association ? association.lightIds : [];
            content += '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
                esc(sw.id) + '" data-association-light="' + esc(el.id) + '"' +
                (configuredIds.includes(el.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
                esc(electricalDisplayName(sw)) + levelSuffix(sw) + '</label>';
        });
        content += '</div></details>';
    }

    boxes.forEach(box => {
        // les volets « Modifier les associations » gardent leur état ouvert / fermé après la mise à jour
        const openStates = [...box.querySelectorAll('details')].map(d => d.open);
        box.innerHTML = content;
        box.querySelectorAll('details').forEach((d, i) => { if (openStates[i]) d.open = true; });
        box.classList.remove('hidden');
        box.querySelectorAll('[data-related-id]').forEach(button => {
            button.addEventListener('click', () => focusAssociatedElement(button.dataset.relatedId));
        });
        box.querySelectorAll('[data-association-switch]').forEach(input => {
            input.addEventListener('change', () => setLightingAssociation(
                input.dataset.associationSwitch,
                input.dataset.associationLight,
                input.checked
            ));
        });
    });
}

function setLightingAssociation(switchId, lightId, isAssociated) {
    const sw = projectData.electrical.find(candidate => candidate.id === switchId && isControl(candidate));
    const light = projectData.electrical.find(candidate =>
        candidate.id === lightId && isControlledLoad(candidate));
    if (!sw || !light || !canControl(sw, light)) {
        showNotification('Association impossible : commande ou charge introuvable, ou incompatible.', 'error');
        return;
    }

    const automaticLinks = getCableNetwork().controlLinks || [];
    const initialIds = Array.isArray(sw.controlledLightIds)
        ? sw.controlledLightIds
        : (automaticLinks.find(link => link.switchId === sw.id) || { lightIds: [] }).lightIds;
    const nextIds = new Set(initialIds);
    if (isAssociated) nextIds.add(light.id);
    else nextIds.delete(light.id);
    saveStateToUndo();
    sw.controlledLightIds = [...nextIds];
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene();
    syncElementInspectors();
    redraw2D();
    showNotification('Association d’éclairage mise à jour.', 'success');
}

// Paramètres par défaut (épaisseur, hauteur des NOUVEAUX murs) : visibles seulement pendant le tracé d'un mur,
// et masqués dès qu'un élément ou un mur est sélectionné
function syncDefaultSpecs() {
    const box = document.getElementById('default-specs-2d');
    if (!box) return;
    const busy = selectedWallIds.length > 0 || !!selected3DId || selectedDeviceIds.length > 0 || selectedOpeningIds.length > 0;
    const tracing = currentMode === '3d' ? activePlacementType === 'wall' : currentTool === 'wall';
    box.classList.toggle('hidden', busy || !tracing);
}

function syncElementInspectors() {
    updateNudgePads();
    syncSelectionSliders();
    updateDeselectButtons();
    syncDefaultSpecs();
    const el = projectData.electrical.find(e => e.id === selected3DId);
    const op = !el ? projectData.openings.find(o => o.id === selected3DId) : null;
    const selectedDoor = !!(op && op.type === 'door_single');
    const shaftSel = !el && !op && (projectData.shafts || []).some(s => s.id === selected3DId);
    const stairSel = !el && !op && !shaftSel && (projectData.stairs || []).some(s => s.id === selected3DId);
    const isSelected = !!(el || op || shaftSel || stairSel);
    // Message d'attente identique en 2D et en 3D (inspecteur vide)
    const emptyDock = document.getElementById('inspector-dock-empty');
    if (emptyDock) emptyDock.classList.toggle('hidden', isSelected);
    const emptyDock2d = document.getElementById('inspector-dock-empty-2d');
    if (emptyDock2d) emptyDock2d.classList.toggle('hidden', isSelected);
    const dockInspector = document.getElementById('inspector-3d');
    if (dockInspector) dockInspector.classList.toggle('hidden', !isSelected || shaftSel);
    // un appareil relié à un circuit : l'onglet Circuits s'ouvre pour montrer ce circuit
    if (el && selectedCircuitId && rightTabCurrent !== 'circuits') setRightTab('circuits');
    updateLightingAssociations(el);
    syncOpeningControls(op);
    if (isSelected) {
        document.getElementById('inspector-3d-element-name').textContent =
            el ? electricalDisplayName(el) : shaftSel ? 'Trémie' : stairSel ? 'Escalier' : op.type === 'door_single' ? 'Porte' : 'Fenêtre';
    }
    // une boîte posée a son propre choix de circuit ; la prise dédiée a son bloc calibre + appareil
    const dedicated = !!(el && isDedicatedOutlet(el));
    const circ = !!(el && (isCircuitPoint(el) || el.type === 'junction_box')) && !dedicated;
    const c3 = document.getElementById('circuit-select-container');
    if (c3) c3.classList.toggle('hidden', !circ);
    setCircuitInspectorText(el);
    syncDedicatedInspectors(el, dedicated);
    const box = document.getElementById('el-inspector-2d');
    if (box) {
        // l'inspecteur 2D couvre aussi l'escalier, comme l'inspecteur 3D
        box.classList.toggle('hidden', !(el || op || stairSel));
        if (el || op || stairSel) {
            const nameEl = document.getElementById('el2d-name');
            nameEl.textContent = el ? electricalDisplayName(el) : op ? (op.type === 'door_single' ? 'Porte' : 'Fenêtre') : 'Escalier';
            document.getElementById('el2d-circuit-wrap').classList.toggle('hidden', !circ);
        }
    }
    // Trémie sélectionnée (D5) : inspecteur de taille
    const sh = (projectData.shafts || []).find(s => s.id === selected3DId) || null;
    const shaftBox = document.getElementById('shaft-inspector');
    if (shaftBox) {
        shaftBox.classList.toggle('hidden', !sh);
        if (sh) {
            document.getElementById('shaft-size').value = sh.size || 40;
            document.getElementById('shaft-size-val').textContent = (sh.size || 40) + ' cm';
            renderShaftLevelEditor(sh);
        }
    }
    placeHeightControl();
    // Escalier sélectionné : emprise (largeur, longueur) et rotation
    const stair = (projectData.stairs || []).find(s => s.id === selected3DId) || null;
    ['stair-inspector', 'stair-inspector-3d'].forEach(id => {
        const stairBox = document.getElementById(id);
        if (!stairBox) return;
        stairBox.classList.toggle('hidden', !stair);
    });
    if (stair) syncStairInspector(stair);
    const door2d = document.getElementById('door-hinge-2d-container');
    const door3d = document.getElementById('door-hinge-3d-container');
    if (door2d) door2d.classList.toggle('hidden', !selectedDoor);
    if (door3d) door3d.classList.toggle('hidden', !selectedDoor);
    if (selectedDoor) {
        const hinge = op.hingeSide === 'right' ? 'right' : 'left';
        document.getElementById('door-hinge-2d').value = hinge;
        document.getElementById('door-hinge-3d').value = hinge;
    }
    if (circ) {
        fillCircuitSelect(document.getElementById('inspector-circuit'), el);
        fillCircuitSelect(document.getElementById('el2d-circuit'), el);
    }
}

// ---------- Dimensions des ouvertures (portes : largeur ; fenêtres : largeur, hauteur, allège) ----------
const OPENING_ROWS = [
    ['width', 'Largeur'],
    ['height', 'Hauteur'],
    ['sill', 'Espace sol-fenêtre']
];

// Même disposition que l'escalier et la trémie : libellé, slider et valeur sur une seule ligne
function initOpeningControls() {
    ['3d', '2d'].forEach(suffix => {
        const box = document.getElementById('opening-controls-' + suffix);
        if (!box) return;
        box.innerHTML = '<div data-op-title class="text-xs font-semibold text-slate-200"></div>' +
            OPENING_ROWS.map(([prop, label]) =>
                '<div data-op-row="' + prop + '" class="flex items-center gap-2">' +
                '<span class="w-[6.5rem] shrink-0 text-[11px] text-slate-300">' + label + '</span>' +
                '<input type="range" step="1" data-op-range="' + prop + '" oninput="setSelectedOpeningProp(\'' + prop + '\', this.value)" class="flex-1 min-w-0 bg-slate-800 rounded-lg h-1.5 cursor-pointer">' +
                '<span data-op-val="' + prop + '" class="w-12 shrink-0 text-left text-[11px] text-slate-200"></span>' +
                '</div>').join('');
    });
}

function openingLimits(op, wall) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const wallH = wall.height || 250;
    const isDoor = op.type === 'door_single';
    const b = openingBox(op, wall);
    const width = Math.round(b.half * 2);
    const height = isDoor ? 210 : Math.round(b.z1 - b.z0);
    const sill = Math.round(b.z0);
    const wMin = isDoor ? 60 : 30;
    const wMax = Math.max(wMin, Math.min(isDoor ? 200 : 300, Math.floor(len - 20)));
    return {
        isDoor, len, wallH,
        width: { min: wMin, max: wMax, val: width },
        height: { min: 30, max: Math.max(30, Math.min(250, wallH - 5 - sill)), val: height },
        sill: { min: 0, max: Math.max(0, wallH - 5 - height), val: sill }
    };
}

function syncOpeningControls(op) {
    ['opening-controls-3d', 'opening-controls-2d'].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        const wall = op ? projectData.walls.find(w => w.id === op.wallId) : null;
        box.classList.toggle('hidden', !wall);
        if (!wall) return;
        const lim = openingLimits(op, wall);
        const title = box.querySelector('[data-op-title]');
        title.textContent = lim.isDoor ? 'Dimensions de la porte' : 'Dimensions de la fenêtre';
        box.querySelectorAll('[data-op-row]').forEach(row => {
            const prop = row.dataset.opRow;
            const show = !lim.isDoor || prop === 'width';
            row.classList.toggle('hidden', !show);
            if (!show) return;
            const L = lim[prop];
            const range = row.querySelector('input[type="range"]');
            range.min = L.min; range.max = L.max; range.value = L.val;
            row.querySelector('[data-op-val]').textContent = L.val + ' cm';
        });
    });
}

let _openingUndoStamp = { key: null, t: 0 };
function openingUndoOnce(key) {
    const now = Date.now();
    if (_openingUndoStamp.key !== key || now - _openingUndoStamp.t > 800) saveStateToUndo();
    _openingUndoStamp = { key, t: now };
}

function setSelectedOpeningProp(prop, raw) {
    const op = projectData.openings.find(o => o.id === selected3DId);
    if (!op) return;
    const wall = projectData.walls.find(w => w.id === op.wallId);
    if (!wall) return;
    const value = parseFloat(String(raw).replace(',', '.'));
    if (!isFinite(value)) { syncOpeningControls(op); return; }
    const lim = openingLimits(op, wall);
    if (lim.isDoor && prop !== 'width') return;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    openingUndoOnce(op.id + ':' + prop);

    if (prop === 'width') {
        const w = clamp(Math.round(value), lim.width.min, lim.width.max);
        const box = openingBox(op, wall);
        op.width = w;
        const edge = Math.max(10, w / 2);
        op.distanceFromStart = Math.round(clamp(box.d, edge, Math.max(edge, lim.len - edge)));
    } else if (prop === 'height') {
        op.height = clamp(Math.round(value), lim.height.min, lim.height.max);
        if (op.sillHeight === undefined) op.sillHeight = lim.sill.val;
    } else if (prop === 'sill') {
        op.sillHeight = clamp(Math.round(value), 0, lim.sill.max);
        if (!op.height) op.height = lim.height.val;
    } else {
        return;
    }
    _cableCache.sig = null;
    syncOpeningControls(op);
    const distInput = document.getElementById('inspector-distance-input');
    if (distInput && op.distanceFromStart !== undefined) {
        distInput.value = op.distanceFromStart;
        document.getElementById('inspector-distance-val').textContent = op.distanceFromStart + ' cm';
    }
    if (currentMode === '3d') build3DScene();
    redraw2D();
}

window.addEventListener('DOMContentLoaded', initOpeningControls);

// Flèches ▲ ▼ à droite de chaque curseur : même effet qu'un glissement (input pendant le réglage, change au relâchement, donc un seul pas d'annulation)
const STEPPER_BTN = 'shrink-0 w-4 h-3 flex items-center justify-center rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[8px] leading-none select-none';
function stepRange(input, dir) {
    if (dir > 0) input.stepUp(); else input.stepDown();
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
function enhanceRangeInput(input) {
    if (input.dataset.stepper) return;
    input.dataset.stepper = '1';
    // la largeur du curseur (flex-1, w-28…) passe au conteneur : le curseur remplit ensuite l'espace restant
    const sizing = [...input.classList].filter(c => c.startsWith('w-') || c === 'flex-1');
    sizing.forEach(c => input.classList.remove(c));
    input.classList.add('flex-1', 'min-w-0');
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-1 min-w-0 ' + sizing.join(' ');
    const makeBtn = (sym, dir, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = STEPPER_BTN;
        b.textContent = sym;
        b.title = label;
        b.setAttribute('aria-label', label);
        let delay = null, repeat = null, moved = false;
        const stop = () => {
            clearTimeout(delay); clearInterval(repeat); delay = repeat = null;
            if (moved) { moved = false; input.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        b.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            stepRange(input, dir);
            moved = true;
            delay = setTimeout(() => { repeat = setInterval(() => stepRange(input, dir), 60); }, 350);
        });
        b.addEventListener('pointerup', stop);
        b.addEventListener('pointerleave', stop);
        b.addEventListener('pointercancel', stop);
        // clavier (Entrée / Espace) : pas de pointerdown, donc un seul pas
        b.addEventListener('click', e => {
            if (e.detail !== 0) return;
            stepRange(input, dir);
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        return b;
    };
    const minus = makeBtn('▼', -1, 'Diminuer');
    const plus = makeBtn('▲', 1, 'Augmenter');
    const arrows = document.createElement('div');
    arrows.className = 'flex flex-col gap-0.5 shrink-0';
    arrows.append(plus, minus);
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input, arrows);
}
function enhanceRangeInputs(root) {
    if (root.matches && root.matches('input[type="range"]')) enhanceRangeInput(root);
    if (root.querySelectorAll) root.querySelectorAll('input[type="range"]').forEach(enhanceRangeInput);
}
window.addEventListener('DOMContentLoaded', () => {
    enhanceRangeInputs(document.body);
    new MutationObserver(records => {
        records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) enhanceRangeInputs(n); }));
    }).observe(document.body, { childList: true, subtree: true });
});

function setSelectedDoorHinge(side) {
    const op = projectData.openings.find(o => o.id === selected3DId && o.type === 'door_single');
    if (!op || (side !== 'left' && side !== 'right') || op.hingeSide === side) return;
    saveStateToUndo();
    op.hingeSide = side;
    build3DScene();
    redraw2D();
    syncElementInspectors();
}

function setSelectedCircuit(val) {
    const el = projectData.electrical.find(e => e.id === selected3DId);
    if (!el) return;
    saveStateToUndo();
    el.circuitId = val;
    if (currentMode === '3d') build3DScene(); else { redraw2D(); updateCircuitsUI(); }
    syncElementInspectors();
}

// Prise dédiée : appareil alimenté (le calibre passe par setSelectedCircuit)
function setDedicatedAppliance(val) {
    const el = projectData.electrical.find(e => e.id === selected3DId);
    if (!el || !isDedicatedOutlet(el)) return;
    saveStateToUndo();
    el.applianceKind = val;
    if (currentMode === '3d') build3DScene(); else { redraw2D(); updateCircuitsUI(); }
    syncElementInspectors();
}

// Blocs « appareil + calibre » de la prise dédiée, en 2D et en 3D
function syncDedicatedInspectors(el, show) {
    ['dedicated-container', 'el2d-dedicated-wrap'].forEach(id => {
        const wrap = document.getElementById(id);
        if (wrap) wrap.classList.toggle('hidden', !show);
    });
    if (!show) return;
    ['dedicated-appliance', 'el2d-dedicated-appliance'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '';
        Object.keys(DEDICATED_APPLIANCE_LABELS).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = DEDICATED_APPLIANCE_LABELS[k];
            sel.appendChild(o);
        });
        sel.value = dedicatedApplianceOf(el);
    });
}

// Déplacement d'un appareil ou d'une porte le long de son mur ; renvoie false si ce n'est pas possible
function nudgeSelectedAlongWall(dir, stepCm) {
    const item = projectData.electrical.find(e => e.id === selected3DId) || projectData.openings.find(o => o.id === selected3DId) || (projectData.shafts || []).find(s => s.id === selected3DId);
    if (!item || item.distanceFromStart === undefined || !item.wallId) return false;
    const w = projectData.walls.find(x => x.id === item.wallId);
    if (!w) return false;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const next = Math.max(5, Math.min(len - 5, Math.round(item.distanceFromStart + dir * stepCm)));
    if (next === item.distanceFromStart) return true;
    if (openingMoveBlocked(item, item.wallId, next)) { showNotification('Porte ou fenêtre déjà à cet endroit : déplacement refusé', 'error'); return true; }
    saveStateToUndo();
    item.distanceFromStart = next;
    refreshSelectedView();
    syncElementInspectors();
    return true;
}

// Ce qui peut être déplacé aux flèches : appareil, porte/fenêtre, trémie, escalier
function selectedMovable() {
    const id = selected3DId;
    if (!id) return null;
    const el = projectData.electrical.find(e => e.id === id);
    if (el) return { kind: CEILING_TYPES.includes(el.type) ? 'plafonnier' : 'mural', item: el };
    const op = projectData.openings.find(o => o.id === id);
    if (op) return { kind: 'ouverture', item: op };
    const sh = (projectData.shafts || []).find(x => x.id === id);
    if (sh) return { kind: 'trémie', item: sh };
    const st = (projectData.stairs || []).find(x => x.id === id);
    if (st) return { kind: 'escalier', item: st };
    return null;
}

// Flèches, selon l'élément (la même logique en 2D et en 3D) :
// - appareil mural : gauche / droite le long du mur, haut / bas = hauteur (5 à 250 cm)
// - plafonnier : gauche / droite = x, haut / bas = y (plan)
// - porte, fenêtre, trémie : gauche / droite le long du mur
// - escalier : gauche / droite = x, haut / bas = y (plan), avec l'aimantation
// Axes de la caméra projetés sur le plan (3D seulement) : « droite » de l'écran et « avant » (vers le fond)
function cameraPlanAxes() {
    if (currentMode === '2d') {
        // vue 2D tournée : « droite » et « haut » de l'écran, exprimés sur le plan (x, y) — inverse de la rotation de la vue
        const c = Math.cos(rot2D), sn = Math.sin(rot2D);
        return { r: { x: c, z: -sn }, f: { x: -sn, z: -c } };
    }
    if (currentMode !== '3d' || typeof threeCamera === 'undefined' || !threeCamera || typeof THREE === 'undefined') return null;
    try {
        const d = new THREE.Vector3();
        threeCamera.getWorldDirection(d);
        const len = Math.hypot(d.x, d.z);
        if (!(len > 1e-6)) return null;
        const fx = d.x / len, fz = d.z / len;
        // plan (x, y) = monde (x, z) ; droite de l'écran = avant × haut
        return { f: { x: fx, z: fz }, r: { x: -fz, z: fx } };
    } catch (e) { return null; }
}

// Sens du mur, vu depuis l'écran : +1 si « droite » de l'écran va dans le sens du mur (ou sans caméra)
function wallScreenSign(w, ax) {
    if (!ax) return 1;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const ux = (w.x2 - w.x1) / len, uz = (w.y2 - w.y1) / len;
    return ax.r.x * ux + ax.r.z * uz >= 0 ? 1 : -1;
}

// Flèches, selon l'élément (2D et 3D) ; en 3D, « droite / gauche / haut / bas » suivent l'écran et non le plan :
// - appareil mural : gauche / droite le long du mur, haut / bas = hauteur (10 à 380 cm)
// - plafonnier et escalier : sur le plan, dans le sens de l'écran (haut = vers le fond de la vue)
// - porte, fenêtre, trémie : gauche / droite le long du mur
function nudgeSelected(key, stepCm) {
    const m = selectedMovable();
    if (!m) return false;
    const horiz = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    const vert = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    if (horiz === 0 && vert === 0) return false;
    const it = m.item;
    const ax = cameraPlanAxes();
    if (m.kind === 'escalier' || m.kind === 'plafonnier') {
        // déplacement sur le plan : en 3D, traduit depuis l'écran
        // flèche haut = vers le fond de la vue (avant), bas = vers la caméra
        const dx = ax ? horiz * ax.r.x - vert * ax.f.x : horiz;
        const dy = ax ? horiz * ax.r.z - vert * ax.f.z : vert;
        saveStateToUndo();
        if (m.kind === 'escalier') {
            const prev = { x: it.x, y: it.y };
            it.x = Math.round(it.x + dx * stepCm);
            it.y = Math.round(it.y + dy * stepCm);
            snapStairToWalls(it, prev);
        } else {
            it.x = Math.round(it.x + dx * stepCm);
            it.z = Math.round((it.z || 0) + dy * stepCm);   // y du plan = z de l'élément
        }
        refreshSelectedView();
        syncElementInspectors();
        return true;
    }
    if (m.kind === 'mural') {
        saveStateToUndo();
        if (horiz !== 0 && it.distanceFromStart !== undefined) {
            const w = projectData.walls.find(x => x.id === it.wallId);
            if (!w) return false;
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const along = horiz * wallScreenSign(w, ax);
            it.distanceFromStart = Math.max(5, Math.min(len - 5, Math.round(it.distanceFromStart + along * stepCm)));
        }
        if (vert !== 0) {
            const h = it.height || defaultHeightFor(it.type);
            it.height = Math.max(10, Math.min(380, Math.round(h - vert * stepCm)));   // haut = plus haut, comme le curseur
        }
        refreshSelectedView();
        syncElementInspectors();
        return true;
    }
    if (m.kind === 'ouverture' || m.kind === 'trémie') {
        if (horiz === 0) return false;
        const w = projectData.walls.find(x => x.id === it.wallId);
        return nudgeSelectedAlongWall(horiz * (w ? wallScreenSign(w, ax) : 1), stepCm);
    }
    return false;
}

// Pavé de flèches dans la barre du bas (2D et 3D), visible seulement si un élément déplaçable est sélectionné
function ensureNudgePads() {
    ['view-2d', 'view-3d'].forEach(id => {
        const bar = document.querySelector('#' + id + ' .absolute.bottom-4.left-4');
        if (!bar || bar.querySelector('.nudge-pad')) return;
        const pad = document.createElement('div');
        pad.className = 'nudge-pad hidden flex items-center gap-1 pl-2 ml-1 border-l border-slate-700';
        const btn = (key, icon, title) => '<button type="button" data-key="' + key + '" title="' + title + '" class="w-8 h-8 rounded-lg border border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"><i class="fa-solid ' + icon + '"></i></button>';
        pad.innerHTML =
            btn('ArrowLeft', 'fa-arrow-left', 'Gauche (le long du mur, ou x). Maj : 1 cm') +
            '<div class="flex flex-col gap-1">' +
            btn('ArrowUp', 'fa-arrow-up', 'Haut (hauteur de l’appareil mural, ou y). Maj : 1 cm') +
            btn('ArrowDown', 'fa-arrow-down', 'Bas (hauteur de l’appareil mural, ou y). Maj : 1 cm') +
            '</div>' +
            btn('ArrowRight', 'fa-arrow-right', 'Droite (le long du mur, ou x). Maj : 1 cm');
        pad.querySelectorAll('button[data-key]').forEach(b => b.addEventListener('click', () => {
            nudgeSelected(b.dataset.key, 5);
        }));
        bar.appendChild(pad);
    });
}

// Curseurs « Distance au départ » et « Hauteur au sol » : réglés en 3D seulement. En 2D, la hauteur n'est jamais réglable :
// un message indique où la régler (fenêtre 3D). Mêmes réglages en 2D et en 3D pour la distance, suivent l'élément en temps réel
function syncSelectionSliders() {
    const dist = document.getElementById('position-distance-container');
    const height = document.getElementById('height-control-container');
    const side = document.getElementById('side-toggle-container');
    if (!dist || !height || !side) return;
    const show = (c, on) => c.classList.toggle('hidden', !on);
    const in3d = currentMode === '3d';
    const m = selectedMovable();
    document.getElementById('height-control-label').textContent = m && m.kind === 'trémie' ? 'Hauteur au sol boîte' : 'Hauteur au sol';
    show(document.getElementById('height-hint-2d'), !in3d && !!m && m.kind === 'mural');
    show(document.getElementById('shaft-height-hint-2d'), !in3d && !!m && m.kind === 'trémie');
    if (!m || m.kind === 'escalier' || m.kind === 'plafonnier') { show(dist, false); show(height, false); show(side, false); return; }
    const it = m.item;
    if (m.kind === 'trémie') {
        show(dist, false); show(side, false); show(height, in3d);
        const h = derivHeightOf(it, activeLevelId);
        const hi = document.getElementById('inspector-height-3d-input');
        hi.max = levelCeilingOf(activeLevelId) - DERIV_BOX_H / 2;
        hi.value = h;
        document.getElementById('inspector-height-3d-val').textContent = (h / 100).toFixed(2) + ' m';
        return;
    }
    const isDoor = m.kind === 'ouverture' && it.type === 'door_single';
    const hasSide = m.kind === 'mural' || isDoor;
    show(side, hasSide);
    if (hasSide) document.getElementById('inspector-side-val').textContent = it.side === -1 ? 'Côté B' : 'Côté A';
    show(dist, true);
    const w = projectData.walls.find(x => x.id === it.wallId);
    if (w) {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        const d = it.distanceFromStart !== undefined ? it.distanceFromStart : Math.round((it.positionRatio || 0.5) * len);
        const di = document.getElementById('inspector-distance-input');
        di.max = Math.round(len);
        di.value = d;
        document.getElementById('inspector-distance-val').textContent = d + ' cm';
    }
    show(height, in3d && m.kind === 'mural');
    if (m.kind === 'mural') {
        const h = it.height || defaultHeightFor(it.type);
        const hi = document.getElementById('inspector-height-3d-input');
        hi.value = h;
        document.getElementById('inspector-height-3d-val').textContent = (h / 100).toFixed(2) + ' m';
    }
}

function updateNudgePads() {
    const can = !!selectedMovable();
    document.querySelectorAll('.nudge-pad').forEach(p => p.classList.toggle('hidden', !can));
}

// ---------- Plan 2D : appareils, ouvertures, câbles ----------
let showCables2D = true;
let draggingEl2D = null;

// ---------- Sauvegarde automatique ----------
const AUTOSAVE_KEY = 'clic_and_volt_pro_autosave_v2';
let _lastAutosave = '';

async function restoreAutosave() {
    try {
        const s = localStorage.getItem(AUTOSAVE_KEY);
        if (!s) return;
        const p = JSON.parse(s);
        if (p && Array.isArray(p.walls) && p.walls.length > 0) {
            if (await askConfirm('Projet retrouvé', 'Un projet non enregistré a été retrouvé (' + p.walls.length + ' murs). Le reprendre ?', 'Reprendre le projet', { cancelLabel: 'Ne pas reprendre' })) {
                projectData = p;
                ensureProjectDefaults();
                recenter2DView();
                updateStats();
                redraw2D();
                _lastAutosave = s;
                showNotification('Projet précédent restauré', 'success');
            } else {
                localStorage.setItem(AUTOSAVE_KEY + '_backup', s);
            }
        }
    } catch (e) { /* données illisibles : on ignore */ }
}

async function triggerNewProject() {
    if (await askConfirm('Nouveau projet', 'Créer un nouveau projet effacera le travail en cours non sauvegardé. Continuer ?', 'Créer le projet', { danger: true })) {
        projectData = {
            walls: [],
            openings: [],
            electrical: [],
            shafts: [],
            stairs: [],
            levels: [{ id: 'lvl_rdc', name: 'RDC', elevation: 0, ceilingHeight: 250 }],
            circuits: projectData.circuits,
            annotations: []
        };
        undoStack = [];
        redoStack = [];
        activeLevelId = 'lvl_rdc';
        renderLevelSelector();
        setSelectedWalls([]);
        selected3DId = null;
        recenter2DView();
        updateStats();
        redraw2D();
        if (currentMode === '3d') build3DScene();
        showNotification("Nouveau projet créé", "success");
    }
}

async function triggerSaveProject() {
    const values = await askFields('Enregistrer le projet', [{ id: 'name', label: 'Nom du fichier (sans .json)', value: 'clic_and_volt_pro_projet' }], 'Enregistrer');
    if (values === null) return;
    const fileName = values.name
        .replace(/\.json$/i, '')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '');
    if (!fileName) {
        showNotification('Saisissez un nom de fichier valide.', 'error');
        return;
    }
    const data = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json;charset=utf-8' });
    const dataUrl = URL.createObjectURL(data);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataUrl);
    downloadAnchor.setAttribute("download", fileName + '.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(dataUrl), 1000);
    showNotification('Projet enregistré sous « ' + fileName + '.json »', 'success');
}

function capturePlanImage(mode) {
    if (mode === '3d') {
        // capture 3D en haute résolution, puis retour à la résolution d'écran
        const previousRatio = threeRenderer.getPixelRatio();
        try {
            threeRenderer.setPixelRatio(PRINT_RENDER_SCALE);
            on3DWindowResize();
            threeRenderer.render(threeScene, threeCamera);
            return threeRenderer.domElement.toDataURL('image/png');
        } finally {
            threeRenderer.setPixelRatio(previousRatio);
            on3DWindowResize();
        }
    }
    resize2DCanvas();
    const previouslySelectedId = selected3DId;
    selected3DId = null;
    isPrintRendering = true;
    try {
        // capture en haute résolution (le PNG reste net sur papier)
        canvas2D.width = canvas2D.parentElement.clientWidth * PRINT_RENDER_SCALE;
        canvas2D.height = canvas2D.parentElement.clientHeight * PRINT_RENDER_SCALE;
        redraw2D();
        return canvas2D.toDataURL('image/png');
    } finally {
        isPrintRendering = false;
        selected3DId = previouslySelectedId;
        resize2DCanvas();
    }
}

// Nom de fichier proposé puis demandé à l'utilisateur avant l'export PNG
function pngDefaultFileName(mode) {
    const lvl = (projectData.levels || []).find(l => l.id === activeLevelId);
    const levelPart = lvl ? '_' + lvl.name : '';
    return ('clic_and_volt_' + mode + levelPart).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
}

async function savePlanPng(mode) {
    try {
        const values = await askFields('Enregistrer en PNG', [{ id: 'name', label: 'Nom du fichier PNG (sans l’extension)', value: pngDefaultFileName(mode) }], 'Enregistrer');
        if (values === null) return; // annulé
        // nettoyage : caractères interdits dans un nom de fichier, extension .png en trop
        let base = values.name.replace(/\.png$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim();
        if (!base) base = pngDefaultFileName(mode);
        const imageUrl = capturePlanImage(mode);
        if (!imageUrl) throw new Error('La vue à enregistrer est vide.');
        const anchor = document.createElement('a');
        anchor.href = imageUrl;
        anchor.download = base + '.png';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        showNotification('Plan ' + mode.toUpperCase() + ' enregistré en PNG', 'success');
    } catch (error) {
        console.error('Échec de l’enregistrement PNG.', error);
        showNotification('Impossible d’enregistrer le plan en PNG.', 'error');
    }
}

// Familles de la légende du plan imprimé (l'ordre suit celui du Métré)
const PRINT_LEGEND_GROUPS = [
    ['Prises', t => t.startsWith('outlet_')],
    ['Interrupteurs et commandes', t => t.startsWith('switch_') || ['motion_timer', 'doorbell_button', 'shutter_control'].includes(t)],
    ['Éclairage', t => ['light_ceiling', 'light_spot', 'wall_light'].includes(t)],
    ['Autres appareils', t => ['smoke_detector', 'doorbell_chime', 'shutter_motor'].includes(t)],
    ['Tableaux', t => ['panel', 'subpanel'].includes(t)]
];

// Rang de famille d'un appareil dans la légende imprimée (99 = hors légende, en fin de liste)
function legendFamilyRank(type) {
    const i = PRINT_LEGEND_GROUPS.findIndex(([, test]) => test(type));
    return i < 0 ? 99 : i;
}

// Seules les entrées présentes sur le niveau affiché sont listées, avec leur nombre
function buildPrintLegend() {
    const rep = computeCircuitReport();
    const rank = t => { const i = BOM_DEVICE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
    const lines = rep.countLines.slice().sort((x, y) => rank(x.type) - rank(y.type) || (x.gang || 0) - (y.gang || 0));
    const groups = PRINT_LEGEND_GROUPS.map(([title, test]) => ({
        title,
        items: lines.filter(l => test(l.type)).map(l => ({ label: l.label, count: l.count, type: l.type, gang: l.gang || 1 }))
    }));
    const doors = openingsOn().filter(o => o.type === 'door_single').length;
    const wins = openingsOn().filter(o => o.type === 'window_std').length;
    const shafts = shaftsOn().length;
    groups.push({
        title: 'Ouvertures et trémie',
        items: [
            doors && { label: 'Porte simple', count: doors, kind: 'door', gang: 1 },
            wins && { label: 'Fenêtre', count: wins, kind: 'window', gang: 1 },
            shafts && { label: 'Trémie', count: shafts, kind: 'shaft', gang: 1 }
        ].filter(Boolean)
    });
    return groups.filter(g => g.items.length);
}

// Glyphes des ouvertures et de la trémie (même couleurs que le plan)
function drawLegendOpening(ctx, kind, cx, cy, fs) {
    const w = fs * 1.2, th = fs * 0.4;
    const x0 = cx - w / 2;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, fs * 0.1);
    if (kind === 'shaft') {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.strokeStyle = '#f59e0b';
        ctx.fillRect(cx - fs * 0.5, cy - fs * 0.45, fs, fs * 0.9);
        ctx.strokeRect(cx - fs * 0.5, cy - fs * 0.45, fs, fs * 0.9);
    } else {
        ctx.fillStyle = '#020617';
        ctx.fillRect(x0, cy - th / 2, w, th);
        ctx.strokeStyle = kind === 'door' ? '#b07a4a' : '#3b82f6';
        if (kind === 'door') {                                  // vantail ouvert, pivot à gauche
            ctx.beginPath();
            ctx.moveTo(x0 + w, cy);
            ctx.arc(x0, cy, w, 0, -Math.PI / 2, true);
            ctx.stroke();
        } else {                                                // fenêtre : double trait
            ctx.beginPath();
            ctx.moveTo(x0, cy);
            ctx.lineTo(x0 + w, cy);
            ctx.stroke();
        }
    }
    ctx.restore();
}

// Symbole réel de l'appli (drawElementSymbol2D), dessiné à l'échelle de la légende.
// L'élément fictif n'a ni mur ni circuit : il est dessiné à l'origine, face vers la droite, puis pivoté
// pour que le mur soit en bas et la face avant vers le haut, comme sur la légende de référence.
// Les copies d'un groupe se suivent le long du mur (axe x).
// Pas entre copies d'un groupe sur la légende : 16 unités de dessin, pour que les anneaux de prise (rayon 7.4) ne se touchent pas
const LEGEND_GANG_PITCH = 16;
const LEGEND_RING_R = 7.4;

function legendScale(type) {
    return type === 'panel' || type === 'subpanel' ? 0.04 : 0.085;
}

function drawLegendDevice(ctx, type, n, cx, cy, fs) {
    const s = fs * legendScale(type);
    const step = LEGEND_GANG_PITCH * s;
    const x0 = cx;
    const el = { id: '__legend__', type, x: 0, y: 0, z: 0, wallId: null, side: 1, legendOnly: true };
    const prevCtx = ctx2D, prevGangs = _gangSizes2D;
    ctx2D = ctx;
    _gangSizes2D = new Map([[el.id, n]]);
    try {
        for (let i = 0; i < n; i++) {
            ctx.save();
            ctx.translate(x0 + i * step, cy);
            ctx.rotate(-Math.PI / 2);
            ctx.scale(s, s);
            ctx.translate(-3, 0);
            drawElementSymbol2D(el);
            ctx.restore();
        }
    } finally {
        ctx2D = prevCtx;
        _gangSizes2D = prevGangs;
    }
    // groupe de prises : un seul liseré autour, comme sur le plan (rayon d'anneau = 3.4 + 4)
    if (n > 1 && type.startsWith('outlet_')) {
        const R = LEGEND_RING_R * s;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x0 - R, cy - R, (n - 1) * step + 2 * R, 2 * R, R);
        ctx.lineWidth = 1.1 * s;
        ctx.strokeStyle = deviceColor({ type }, null) || EL_COLORS[type] || '#94a3b8';
        ctx.stroke();
        ctx.restore();
    }
}

// Un symbole par prise d'un groupe (double = 2 symboles côte à côte)
function drawLegendSymbol(ctx, item, cx, cy, fs) {
    if (item.kind) drawLegendOpening(ctx, item.kind, cx, cy, fs);
    else drawLegendDevice(ctx, item.type, item.gang || 1, cx, cy, fs);
}


// Décalage horizontal du libellé depuis le centre du symbole : après le groupe complet (copies + anneau)
function legendLabelOffset(it, fs) {
    if (it.kind) return fs * 4;
    const n = it.gang || 1;
    const s = fs * legendScale(it.type);
    const groupRight = fs * 1.6 + (n - 1) * LEGEND_GANG_PITCH * s + LEGEND_RING_R * s;
    return Math.max(fs * 4, groupRight + fs * 0.6);
}

// Met la légende en page (réduit la police si une ligne déborde) ; draw(ctx, x, y) la dessine
function measurePrintLegend(ctx, legend, width, cols, baseFs) {
    const colGap = Math.round(baseFs * 1.2);
    const colW = (width - (cols - 1) * colGap) / cols;
    let need = 0;
    ctx.font = 'bold ' + baseFs + 'px Arial, sans-serif';
    legend.forEach(g => {
        need = Math.max(need, ctx.measureText(g.title).width);
        g.items.forEach(it => {
            ctx.font = baseFs + 'px Arial, sans-serif';
            need = Math.max(need, legendLabelOffset(it, baseFs) + ctx.measureText(it.label).width + baseFs * 1.5 + ctx.measureText(String(it.count)).width);
        });
    });
    const fs = need > colW ? Math.max(10, Math.floor(baseFs * colW / need)) : baseFs;
    const lineH = Math.round(fs * 2), headH = Math.round(fs * 2), blockGap = Math.round(fs * 1.2);
    const colH = new Array(cols).fill(0);
    const placed = legend.map(g => {
        const c = colH.indexOf(Math.min(...colH));
        const p = { g, x: c * (colW + colGap), y: colH[c] };
        colH[c] += headH + g.items.length * lineH + blockGap;
        return p;
    });
    return {
        height: Math.max(0, Math.max(...colH) - blockGap),
        draw(target, x0, y0) {
            target.save();
            target.fillStyle = '#0f172a';
            target.textBaseline = 'middle';
            placed.forEach(({ g, x, y }) => {
                const gx = x0 + x, gy = y0 + y;
                // libellés alignés sur le groupe le plus large du bloc
                const labelX = gx + Math.max(...g.items.map(it => legendLabelOffset(it, fs)));
                target.font = 'bold ' + fs + 'px Arial, sans-serif';
                target.textAlign = 'left';
                target.fillText(g.title, gx, gy + headH / 2);
                g.items.forEach((it, i) => {
                    const cy = gy + headH + i * lineH + lineH / 2;
                    drawLegendSymbol(target, it, gx + fs * 1.6, cy, fs);
                    target.fillStyle = '#0f172a';
                    target.font = fs + 'px Arial, sans-serif';
                    target.textAlign = 'left';
                    target.fillText(it.label, labelX, cy);
                    target.font = 'bold ' + fs + 'px Arial, sans-serif';
                    target.textAlign = 'right';
                    target.fillText(String(it.count), gx + colW, cy);
                });
            });
            target.restore();
        }
    };
}

function printPlan(mode) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showNotification('Autorisez les fenêtres contextuelles pour imprimer ou créer un PDF.', 'error');
        return;
    }
    try {
        const imageUrl = capturePlanImage(mode);
        if (!imageUrl) throw new Error('La vue à imprimer est vide.');
        // la légende n'accompagne que le plan 2D (la 3D n'a pas d'appareillage à lire)
        const legend = mode === '2d' ? buildPrintLegend() : null;
        const title = mode === '3d' ? 'Plan 3D' : 'Plan 2D';
        printWindow.document.open();
        printWindow.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + title +
            ' — Clic & Volt</title><style id="print-style">@page{size:landscape;margin:10mm}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#fff;color:#0f172a;font:14px Arial,sans-serif}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 8px}.toolbar label{font-weight:600}.toolbar button,.toolbar select{font:inherit;padding:5px 10px}h1{font-size:16px;margin:0 auto 0 0}.plan{display:block;width:100%;height:calc(100vh - 38mm);object-fit:contain;break-inside:avoid;page-break-inside:avoid}@media print{.toolbar{display:none!important}.plan{height:calc(100vh - 20mm);width:100%;object-fit:contain}}</style></head><body><div class="toolbar"><h1>Clic & Volt — ' +
            title + '</h1><label for="orientation">Orientation</label><select id="orientation"><option value="landscape" selected>Paysage</option><option value="portrait">Portrait</option></select>' + '<span style="font-weight:600">Recadrage (%) :</span> <label>Haut <input id="crop-t" type="number" min="0" max="95" step="1" value="0" style="width:52px;font:inherit;padding:4px"></label> <label>Bas <input id="crop-b" type="number" min="0" max="95" step="1" value="0" style="width:52px;font:inherit;padding:4px"></label> <label>Gauche <input id="crop-l" type="number" min="0" max="95" step="1" value="0" style="width:52px;font:inherit;padding:4px"></label> <label>Droite <input id="crop-r" type="number" min="0" max="95" step="1" value="0" style="width:52px;font:inherit;padding:4px"></label> <button id="crop-reset" type="button">Réinitialiser le cadrage</button>' + '<button id="print-button" type="button" disabled>Imprimer / Enregistrer en PDF</button></div><div id="preview-row"><div id="stage"><img class="plan" id="plan" alt="' +
            title + '"><div id="crop-box"><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div></div><div id="plan-sheet"><img id="plan-preview" alt="' + title + ' avec légende"></div></div><img id="plan-print" alt="' + title + '">' +
            '<style>' +
            '@media screen{html,body{background:#e2e8f0}.toolbar{background:#0f172a;color:#f8fafc;margin:0;padding:10px 16px;border-bottom:3px solid #facc15}.toolbar h1{color:#fff;font-size:16px;font-weight:700}.toolbar label,.toolbar span{color:#cbd5e1;font-size:12px;font-weight:500}.toolbar select,.toolbar input{background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px}.toolbar button{border:0;border-radius:8px;padding:7px 14px;font-weight:600;background:#334155;color:#f8fafc;cursor:pointer}.toolbar button:hover{background:#475569}.toolbar button:disabled{opacity:.5;cursor:default}#print-button{background:#facc15;color:#0f172a}#print-button:hover{background:#eab308}#print-button:disabled:hover{background:#facc15}#stage,#plan-sheet{border-radius:4px}}' +
            '#stage{position:relative;margin:0 auto;background:#fff;overflow:hidden;user-select:none;box-shadow:0 0 0 1px #94a3b8,0 4px 12px rgba(0,0,0,.2);aspect-ratio:297/210;width:min(100%,calc((100vh - 38mm) * 297 / 210));height:auto}' +
            '#stage.portrait{aspect-ratio:210/297;width:min(100%,calc((100vh - 38mm) * 210 / 297))}#stage .plan{height:100%;width:100%}' +
            '#crop-box{position:absolute;box-sizing:border-box;border:2px dashed #facc15;box-shadow:0 0 0 9999px rgba(15,23,42,.55);cursor:move;touch-action:none}' +
            '#crop-box i{position:absolute;width:12px;height:12px;box-sizing:border-box;background:#facc15;border:1px solid #0f172a;touch-action:none}' +
            '#crop-box i[data-h=nw]{left:-6px;top:-6px;cursor:nwse-resize}#crop-box i[data-h=se]{right:-6px;bottom:-6px;cursor:nwse-resize}' +
            '#crop-box i[data-h=ne]{right:-6px;top:-6px;cursor:nesw-resize}#crop-box i[data-h=sw]{left:-6px;bottom:-6px;cursor:nesw-resize}' +
            '#crop-box i[data-h=n]{left:50%;top:-6px;margin-left:-6px;cursor:ns-resize}#crop-box i[data-h=s]{left:50%;bottom:-6px;margin-left:-6px;cursor:ns-resize}' +
            '#crop-box i[data-h=e]{right:-6px;top:50%;margin-top:-6px;cursor:ew-resize}#crop-box i[data-h=w]{left:-6px;top:50%;margin-top:-6px;cursor:ew-resize}' +
            '#preview-row{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:flex-start}' +
            '#plan-sheet{display:none;position:relative;margin:0 auto;background:#fff;box-shadow:0 0 0 1px #94a3b8,0 4px 12px rgba(0,0,0,.2);aspect-ratio:297/210;width:min(100%,calc((100vh - 38mm) * 297 / 210));height:auto}' +
            '#plan-sheet.portrait{aspect-ratio:210/297;width:min(100%,calc((100vh - 38mm) * 210 / 297))}' +
            '#preview-row.legend #plan-sheet{display:block}' +
            // zone imprimable : marges de 10 mm (pourcentages de la largeur pour left/right, de la hauteur pour top/bottom)
            '#plan-preview{position:absolute;top:4.762%;left:3.367%;width:93.266%;height:90.476%;object-fit:contain}' +
            '#plan-sheet.portrait #plan-preview{top:3.367%;left:4.762%;width:90.476%;height:93.266%}' +
            '#plan-print{display:none;width:100%;height:calc(100vh - 38mm);object-fit:contain}' +
            '@media print{#preview-row{display:none!important}#plan-print{display:block!important;height:calc(100vh - 20mm)}}' +
            '</style></body></html>');
        printWindow.document.close();
        const image = printWindow.document.getElementById('plan');
        image.onload = () => {
            printWindow.document.getElementById('print-button').disabled = false;
            printWindow.focus();
        };
        image.onerror = () => {
            printWindow.close();
            showNotification('Impossible de préparer l’image du plan pour l’impression.', 'error');
        };
        const orientation = printWindow.document.getElementById('orientation');
        orientation.addEventListener('change', () => {
            // La feuille affichée suit l'orientation choisie (A4 portrait ou paysage)
            printWindow.document.getElementById('stage').classList.toggle('portrait', orientation.value === 'portrait');
            printWindow.document.getElementById('plan-sheet').classList.toggle('portrait', orientation.value === 'portrait');
            // Changer d'orientation remet le cadrage à zéro
            printWindow.document.getElementById('crop-reset').click();
            printWindow.document.getElementById('print-style').textContent =
                '@page{size:' + orientation.value + ';margin:10mm}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#fff;color:#0f172a;font:14px Arial,sans-serif}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 8px}.toolbar label{font-weight:600}.toolbar button,.toolbar select{font:inherit;padding:5px 10px}h1{font-size:16px;margin:0 auto 0 0}.plan{display:block;width:100%;height:calc(100vh - 38mm);object-fit:contain;break-inside:avoid;page-break-inside:avoid}@media print{.toolbar{display:none!important}.plan{height:calc(100vh - 20mm);width:100%;object-fit:contain}}';
        });
        printWindow.document.getElementById('print-button').addEventListener('click', () => {
            printWindow.focus();
            const url = printCropped();
            const planPrint = printWindow.document.getElementById('plan-print');
            if (planPrint.src === url) {
                printWindow.print();
            } else {
                planPrint.onload = () => printWindow.print();
                planPrint.src = url;
            }
        });
        // Recadrage à la souris : cadre sur l'image d'origine (fractions t, b, l, r), découpe au moment d'imprimer
        const doc = printWindow.document;
        const stage = doc.getElementById('stage');
        const box = doc.getElementById('crop-box');
        const planPrint = doc.getElementById('plan-print');
        const cropInputs = ['crop-t', 'crop-b', 'crop-l', 'crop-r'].map(id => doc.getElementById(id));
        const MIN_SIZE = 0.05, MAX_CROP = 0.95;
        const crop = { t: 0, b: 0, l: 0, r: 0 };
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        const rendered = () => {
            // zone réellement occupée par l'image (object-fit: contain)
            const sw = stage.clientWidth, sh = stage.clientHeight;
            const nw = image.naturalWidth || sw, nh = image.naturalHeight || sh;
            const s = Math.min(sw / nw, sh / nh);
            const rw = nw * s, rh = nh * s;
            return { x: (sw - rw) / 2, y: (sh - rh) / 2, w: rw, h: rh };
        };
        const drawBox = () => {
            const R = rendered();
            box.style.left = (R.x + crop.l * R.w) + 'px';
            box.style.top = (R.y + crop.t * R.h) + 'px';
            box.style.width = ((1 - crop.l - crop.r) * R.w) + 'px';
            box.style.height = ((1 - crop.t - crop.b) * R.h) + 'px';
            [crop.t, crop.b, crop.l, crop.r].forEach((v, i) => { cropInputs[i].value = Math.round(v * 100); });
        };
        const setCrop = (t, b, l, r) => {
            crop.l = clamp(l, 0, MAX_CROP);
            crop.r = clamp(r, 0, Math.min(MAX_CROP, 1 - MIN_SIZE - crop.l));
            crop.t = clamp(t, 0, MAX_CROP);
            crop.b = clamp(b, 0, Math.min(MAX_CROP, 1 - MIN_SIZE - crop.t));
            drawBox();
            refreshPreview();
        };
        cropInputs.forEach(input => input.addEventListener('change', () => {
            const v = i => (parseFloat(cropInputs[i].value) || 0) / 100;
            setCrop(v(0), v(1), v(2), v(3));
        }));
        doc.getElementById('crop-reset').addEventListener('click', () => setCrop(0, 0, 0, 0));
        let drag = null;
        const startDrag = (e, mode) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag = { mode, x: e.clientX, y: e.clientY, R: rendered(), start: { ...crop } };
        };
        const onMove = (e) => {
            if (!drag) return;
            const dx = (e.clientX - drag.x) / drag.R.w, dy = (e.clientY - drag.y) / drag.R.h;
            const s = drag.start;
            let L = s.l, Rt = 1 - s.r, T = s.t, B = 1 - s.b;
            if (drag.mode === 'move') {
                const w = Rt - L, h = B - T;
                L = clamp(L + dx, 0, 1 - w);
                T = clamp(T + dy, 0, 1 - h);
                Rt = L + w;
                B = T + h;
            } else {
                if (drag.mode.includes('w')) L = clamp(L + dx, 0, Rt - MIN_SIZE);
                if (drag.mode.includes('e')) Rt = clamp(Rt + dx, L + MIN_SIZE, 1);
                if (drag.mode.includes('n')) T = clamp(T + dy, 0, B - MIN_SIZE);
                if (drag.mode.includes('s')) B = clamp(B + dy, T + MIN_SIZE, 1);
            }
            crop.l = L; crop.r = 1 - Rt; crop.t = T; crop.b = 1 - B;
            drawBox();
        };
        const endDrag = () => { drag = null; refreshPreview(); };
        box.addEventListener('pointerdown', e => startDrag(e, 'move'));
        box.addEventListener('pointermove', onMove);
        box.addEventListener('pointerup', endDrag);
        box.addEventListener('pointercancel', endDrag);
        box.querySelectorAll('i').forEach(h => h.addEventListener('pointerdown', e => startDrag(e, h.dataset.h)));
        window.addEventListener('resize', drawBox);
        image.addEventListener('load', () => { drawBox(); refreshPreview(); });
        // Découpe la zone choisie : ce sont ces pixels qui partent à l'impression
        const printCropped = () => {
            const nw = image.naturalWidth, nh = image.naturalHeight;
            const sx = Math.round(nw * crop.l), sy = Math.round(nh * crop.t);
            const cw = Math.round(nw * (1 - crop.l - crop.r)), ch = Math.round(nh * (1 - crop.t - crop.b));
            const out = doc.createElement('canvas');
            const landscape = doc.getElementById('orientation').value !== 'portrait';
            let W = cw, H = ch, layout = null, gap = 0;
            if (legend) {
                const baseFs = Math.max(16, Math.round(cw / 55));
                gap = Math.round(baseFs * 1.5);
                const measureCtx = doc.createElement('canvas').getContext('2d');
                if (landscape) {
                    // colonne à droite en paysage
                    const colW = Math.round(cw * 0.26);
                    layout = measurePrintLegend(measureCtx, legend, colW, 1, baseFs);
                    W = cw + gap + colW;
                    H = Math.max(ch, layout.height);
                } else {
                    // bandeau en bas en portrait, sur 3 colonnes
                    layout = measurePrintLegend(measureCtx, legend, cw, 3, baseFs);
                    H = ch + gap + layout.height;
                }
            }
            out.width = W;
            out.height = H;
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
            ctx.drawImage(image, sx, sy, cw, ch, 0, 0, cw, ch);
            if (layout) layout.draw(ctx, landscape ? cw + gap : 0, landscape ? 0 : ch + gap);
            return out.toDataURL('image/png');
        };
        // Aperçu : l'image composée (plan recadré + légende), mise à jour à chaque recadrage
        const previewRow = doc.getElementById('preview-row');
        const planPreview = doc.getElementById('plan-preview');
        previewRow.classList.toggle('legend', !!legend);
        const refreshPreview = () => {
            if (legend && image.naturalWidth) planPreview.src = printCropped();
        };
        image.src = imageUrl;
        showNotification('Choisissez l’orientation dans la fenêtre ouverte, puis imprimez ou enregistrez en PDF.', 'info');
    } catch (error) {
        printWindow.close();
        console.error('Échec de la préparation du plan à imprimer.', error);
        showNotification('Impossible de préparer le plan à imprimer.', 'error');
    }
}

function triggerLoadProject(event) {
    const fileReader = new FileReader();
    if (event.target.files[0]) {
        fileReader.readAsText(event.target.files[0], "UTF-8");
        fileReader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed && parsed.walls) {
                    saveStateToUndo();
                    projectData = parsed;
                    activeLevelId = null;
                    ensureProjectDefaults();
                    renderLevelSelector();
                    setSelectedWalls([]);
                    selected3DId = null;
                    recenter2DView();
                    updateStats();
                    redraw2D();
                    if (currentMode === '3d') build3DScene();
                    updateCircuitsUI();
                    showNotification("Projet chargé avec succès !", "success");
                } else {
                    showNotification("Format de fichier invalide", "error");
                }
            } catch (err) {
                showNotification("Erreur lors de la lecture du fichier JSON", "error");
            }
        };
    }
}
