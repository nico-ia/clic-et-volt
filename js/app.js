/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

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

// Mesure (console seulement, aucun effet sur l'appli) : tape perfProbe() dans la console.
// Renvoie le temps moyen de chaque étape lourde sur le projet courant (affiché comme valeur de retour).
function perfProbe(n = 5) {
    const lignes = ['--- perfProbe, moyenne sur ' + n + ' passage(s) ---'];
    const mesure = (label, fn) => {
        const t0 = performance.now();
        for (let i = 0; i < n; i++) fn();
        lignes.push(label.padEnd(30) + ((performance.now() - t0) / n).toFixed(1).padStart(8) + ' ms');
    };
    mesure('JSON.stringify(projectData)', () => JSON.stringify(projectData));
    mesure('collidingElementIds', () => collidingElementIds());
    mesure('computeCircuitReport', () => computeCircuitReport());
    mesure('updateCircuitsUI', () => updateCircuitsUI());
    // le réseau de câbles est mis en cache : le premier appel est un vrai calcul si le cache est vide
    const t0 = performance.now();
    getCableNetwork();
    lignes.push('getCableNetwork (1er appel)'.padEnd(30) + (performance.now() - t0).toFixed(1).padStart(8) + ' ms');
    const texte = lignes.join('\n');
    console.log(texte);
    return texte;
}

// Les alertes suivent les modifications en temps réel : rafraîchissement seulement si les données changent
// Un seul minuteur (500 ms) sérialise le projet une fois : alertes en temps réel + sauvegarde automatique toutes les 2 s
function startProjectWatcher() {
    let lastState = null;
    let lastLevelId = null;
    let lastRev = -1;
    let tick = 0;
    setInterval(() => {
        let s = '';
        try { s = JSON.stringify(projectData); } catch (e) { return; }

        // le niveau affiché fait partie de l'état : changer de niveau recalcule aussi les alertes
        // pendant le glissement d'un appareil, le panneau n'est mis à jour qu'au relâchement (patch 28)
        if (draggingEl2D || layoutDragging3D()) return;
        // un calcul de fond terminé change le réseau sans changer le projet : les alertes sont rafraîchies aussi
        if (s !== lastState || activeLevelId !== lastLevelId || cableRevision !== lastRev) {
            lastState = s;
            lastLevelId = activeLevelId;
            lastRev = cableRevision;
            updateCircuitsUI();
            syncSelectionSliders();
        }
        if (++tick % 4 === 0 && s !== _lastAutosave) {
            try { localStorage.setItem(AUTOSAVE_KEY, s); localStorage.setItem(AUTOSAVE_KEY + '_name', currentProjectFileName || ''); _lastAutosave = s; } catch (e) { /* stockage indisponible : on ignore */ }   // 137 : nom du projet mémorisé avec la sauvegarde
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
            // pose 2D (outil « place ») : Échap arrête la pose et vide la sélection, comme le bouton Désélection
            if (currentMode === '2d' && (currentTool === 'place' || currentTool === 'text' || currentTool === 'wall')) { stopPlacement(); return; }
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

// Volume translucide de la trémie en 3D : blanc en thème sombre, gris en thème clair (toujours, sélectionnée ou non)
function shaftVolumeColour() { return currentTheme === 'light' ? '#94a3b8' : '#f8fafc'; }

// patch 89 : couleur de sélection 3D, comme les pointillés de la 2D
function selectionColour3D() { return currentTheme === 'light' ? '#047857' : '#f8fafc'; }

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

// 136 : notifications au centre du plan (centre de la fenêtre : les deux barres latérales ont la même largeur)
let notifTimer = null;
function showNotification(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    toastMsg.textContent = message;
    toastTitle.textContent = type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : 'Information';
    toastIcon.className = type === 'error' ? 'fa-solid fa-triangle-exclamation text-rose-400 text-lg' : type === 'success' ? 'fa-solid fa-circle-check text-emerald-400 text-lg' : 'fa-solid fa-info-circle text-emerald-400 text-lg';
    // 136 : au centre du plan ; un message reste plus longtemps (8 s pour une erreur)
    toast.classList.remove('bottom-6', 'left-6', 'right-6', 'translate-y-24');
    toast.classList.add('top-1/3', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2');
    toast.classList.remove('opacity-0');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
        toast.classList.add('opacity-0');
    }, type === 'error' ? 8000 : 6000);
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

// L'outil choisi reste le même d'une vue à l'autre : Sélectionner, Tracer mur, Texte ou un appareil
function syncToolBetweenViews(mode) {
    if (mode === '3d') {
        const want = (currentTool === 'wall' || currentTool === 'text') ? currentTool
            : currentTool === 'place' ? document.getElementById('place-type').value : null;
        if (want !== activePlacementType) {
            if (activePlacementType) setPlacementType(activePlacementType);   // désactive l'ancien mode
            if (want) setPlacementType(want);                                 // active le nouveau
        }
    } else if (mode === '2d') {
        const t = activePlacementType;
        if (t) setPlacementType(t);                    // quitte le mode de pose 3D
        if (t === 'wall' || t === 'text') setTool(t);
        else if (t) { document.getElementById('place-type').value = t; setTool('place'); }
        else if (currentTool !== 'select' && currentTool !== 'pan') setTool('select');
    }
}

function switchMode(mode) {
    currentMode = mode;
    placeSharedInspectors();
    syncToolBetweenViews(mode);   // l'outil choisi suit le passage d'une vue à l'autre
    refreshToolButtons();   // l'outil actif est affiché à l'identique dans la vue qui s'ouvre
    syncCableCutInspector();   // replace le réglage du tronçon dans la barre du mode affiché
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

// Déplacement d'une porte ou fenêtre : message du refus (chevauchement ou escalier), '' si le déplacement est permis
function openingMoveRefusal(item, wallId, distCm, side) {
    if (!item || !OPENING_TYPES.includes(item.type)) return '';
    if (openingOverlapWith(item, wallId, distCm)) return 'Porte ou fenêtre déjà à cet endroit : choisissez un autre point du mur.';
    const w = (projectData.walls || []).find(x => x.id === wallId);
    return '';
}

// Emprise en plan d'une porte ou fenêtre : longueur comme en 3D, épaisseur du mur
function openingRectOf(op) {
    const w = (projectData.walls || []).find(x => x.id === op.wallId);
    const p = w && openingPos2D(op);
    return p ? orientedRect(p.x, p.y, p.angle, openingBox(op, w).half, p.th / 2) : null;
}

// Carré au sol d'une porte : côté = largeur de la baie, du côté où le vantail balaie (contient le quart de cercle)
function doorSquareOf(op) {
    const w = (projectData.walls || []).find(x => x.id === op.wallId);
    const p = w && openingPos2D(op);
    if (!p || op.type !== 'door_single') return null;
    const half = openingBox(op, w).half;
    const sy = op.side === -1 ? 1 : -1;                  // même convention que drawOpening2D
    const cyL = sy * (p.th / 2 + half);                  // centre du carré, repère de la baie
    return orientedRect(p.x - cyL * Math.sin(p.angle), p.y + cyL * Math.cos(p.angle), p.angle, half, half);
}

// Emprise en plan d'un appareil (petit carré autour de son point)
function applianceRectOf(el) {
    const c = getElCoords(el);
    return orientedRect(c.x, c.y, 0, 5, 5);
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

// Emprise en plan d'un mur (longueur, épaisseur), même repère que openingRectOf
function wallPlanRectOf(w) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (len < 1) return null;
    const angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
    return orientedRect((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, angle, len / 2, (w.thickness || 10) / 2);
}

// Mur qui traverse une porte ou une fenêtre posée sur un autre mur (même étage)
function computeWallOpeningClashes() {
    const list = [];
    const walls = wallsOn();
    openingsOn().forEach(op => {
        const ro = openingRectOf(op);
        if (!ro) return;
        walls.forEach(w => {
            if (w.id === op.wallId) return;   // l'ouverture suit son propre mur
            const rw = wallPlanRectOf(w);
            if (rw && rectsOverlap(ro, rw)) list.push({ wall: w, opening: op });
        });
    });
    return list;
}

// 142 : une ouverture ne bloque que si elle occupe la matière d'une marche (même logique que les appareils électriques)
function openingClashesSolid(op, wall, st, dz = 0) {   // 143 : dz = décalage de hauteur du niveau de l'ouverture par rapport au pied de l'escalier
    const b = openingBox(op, wall);
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (len < 1) return false;
    const ux = (wall.x2 - wall.x1) / len, uy = (wall.y2 - wall.y1) / len;
    const th = wall.thickness || 10;
    const R = stairRect(st);
    // rectangle de l'ouverture sur le mur : largeur le long du mur, épaisseur du mur
    const cx = wall.x1 + ux * b.d, cy = wall.y1 + uy * b.d;
    const opening = orientedRect(cx, cy, Math.atan2(uy, ux), b.half, th / 2);
    // chaque marche pleine : rectangle dans le plan de l'escalier ; le dessus et le dessous restent libres
    const angle = Math.atan2(R.uy, R.ux);
    return stairStepSolids(st).some(s => {
        const uc = (s.u0 + s.u1) / 2, vc = (s.v0 + s.v1) / 2;
        const step = orientedRect(R.cx + uc * R.ux + vc * R.vx, R.cy + uc * R.uy + vc * R.vy, angle, (s.u1 - s.u0) / 2, (s.v1 - s.v0) / 2);
        return b.z0 + dz < s.z1 - 1 && b.z1 + dz > s.z0 + 1 && rectsOverlap(opening, step);
    });
}

// Collisions escalier / porte ou fenêtre, tous niveaux : chaque ouverture est comparée aux escaliers posés sur son niveau
function computeStairOpeningCollisions() {
    const list = [];
    (projectData.stairs || []).forEach(st => {
        (projectData.openings || []).filter(op => op.levelId === st.levelId).forEach(op => {
            const wall = (projectData.walls || []).find(w => w.id === op.wallId);
            if (wall && openingClashesSolid(op, wall, st)) list.push({ stair: st, opening: op });
        });
    });
    return list;
}

// Refus d'une pose : renvoie le motif (texte) si la position est interdite, sinon null
function sameSpotBlocker(type, levelId, wallId, distCm, side, height) {
    if (OPENING_TYPES.includes(type)) {
        const w = openingWidthOf({ type });
        const wall = (projectData.walls || []).find(x => x.id === wallId);
        if (wall && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) < w) return 'Mur trop court pour cette ouverture : pose annulée';
        const hit = (projectData.openings || []).find(o => o.levelId === levelId && o.wallId === wallId
            && Math.abs((o.distanceFromStart || 0) - distCm) < (openingWidthOf(o) + w) / 2);
        if (hit) return 'Porte ou fenêtre déjà à cet endroit : choisissez un autre point du mur.';
        return null;
    }
    if (type === 'shaft') {
        const hit = (projectData.shafts || []).find(s => s.levelId === levelId && s.wallId === wallId
            && Math.abs((s.distanceFromStart || 0) - distCm) < SAME_SPOT_CM);
        return hit ? 'Une trémie est déjà à cet endroit : choisissez un autre point du mur.' : null;
    }
    return applianceRefusal(type, levelId, wallId, distCm, side, height);
}

// Idem pour un plafonnier : à moins de 30 cm (en plan) d'un autre plafonnier du niveau
function ceilingSpotBlocker(x, z, levelId) {
    return (projectData.electrical || []).find(e => e.levelId === levelId && CEILING_TYPES.includes(e.type)
        && Math.hypot(e.x - x, e.z - z) < SAME_SPOT_CM) || null;
}
function refuseSameSpot(msg) {
    showNotification(msg || 'Emplacement occupé : choisissez un autre point, à distance d’un élément identique.', 'error');
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
const MODE_BADGES = { select: 'Mode : sélection', wall: 'Mode : tracer un mur', place: 'Mode : pose d’appareil', text: 'Mode : ajout de texte', pan: 'Mode : déplacer la vue' };

function currentModeKey() {
    if (currentMode === '3d') return activePlacementType === 'wall' ? 'wall' : activePlacementType === 'text' ? 'text' : (activePlacementType ? 'place' : 'select');
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
    if (key === 'text') return 'Cliquez sur le plan, à l’endroit du texte (Échap pour arrêter).';
    if (key === 'pan') return 'Faites glisser le plan avec le bouton gauche de la souris.';
    return 'Cliquez un élément pour le sélectionner. Pour en choisir plusieurs : Ctrl+clic ou Maj+clic sur chacun, ou glissez dans le vide pour encadrer.';
}

// Aide du mode courant : titre et consigne en cours (se met à jour pendant qu'elle est ouverte)
function updateModeHelp() {
    const p = document.getElementById('mode-help');
    if (!p || p.classList.contains('hidden')) return;
    const key = currentModeKey();
    const live = document.getElementById('drawing-instruction-hint');
    document.getElementById('mode-help-title').textContent = MODE_BADGES[key];
    document.getElementById('mode-help-text').textContent = (live && live.textContent) || modeHint(key);
}

// « ? » du bloc de mode : ouvre ou ferme l'aide. Seul l'utilisateur la ferme (ce bouton ou la croix).
function toggleModeHelp(e) {
    if (e) e.stopPropagation();
    const p = document.getElementById('mode-help');
    if (!p) return;
    p.classList.toggle('hidden');
    updateModeHelp();
}

// Libellé du mode et phrase d'aide : mêmes emplacements en 2D et en 3D (haut de la sidebar gauche, coin haut-gauche du plan)
function refreshToolHint() {
    const key = currentModeKey();
    let hint = modeHint(key);
    const n = selectionCount();
    if (key === 'select' && n) {
        hint = n === 1
            ? '1 élément sélectionné : glissez pour le déplacer, Ctrl+clic ou Maj+clic pour en ajouter, Suppr pour l’effacer, Échap pour désélectionner.'
            : n + ' éléments sélectionnés : Ctrl+clic ou Maj+clic pour en ajouter ou retirer, Suppr pour les effacer, Échap pour désélectionner.';
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
        } else if (key === 'wall' && drawingStartPoint && mouseCurrentPos) {
            // patch 76 : même phrase qu'en 3D (longueur en cours)
            const lenM = Math.hypot(mouseCurrentPos.x - drawingStartPoint.x, mouseCurrentPos.y - drawingStartPoint.y) / 100;
            hint = 'Pose : Mur ; longueur ' + lenM.toFixed(2).replace('.', ',') + ' m ; clic pour valider, clic droit pour terminer (Échap pour arrêter)';
        }
    }
    updateStopPlacementButton(key);
    const badge = document.getElementById('active-tool-badge');
    const hintEl = document.getElementById('drawing-instruction-hint');
    const badgeText = MODE_BADGES[key];
    if (badge.textContent !== badgeText) badge.textContent = badgeText;
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
    updateModeHelp();
}

// Bloc du mode (et des boutons Désélection / Supprimer) : posé en haut à droite du plan, en 2D comme en 3D
function placeModeBar() {
    const bar = document.getElementById('mode-bar');
    if (!bar) return;
    const host = currentMode === '3d'
        ? document.getElementById('three-container')
        : document.getElementById('floorplan-canvas').parentElement;
    if (host && bar.parentElement !== host) host.appendChild(bar);
}

// L'indication se place dans le coin haut-gauche du plan, en 2D comme en 3D
function placeToolHint() {
    placeModeBar();
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
    if (typeof refreshOverlays3D === 'function') refreshOverlays3D();   // patch 90 : cadres mis à jour tout de suite
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
    if (!wallUndoPending) { saveStateToUndo(); wallUndoPending = true; }
    sliderDragging = true;
    wallSliderTouched = true;
    if (prop === 'thickness') {
        const thickness = Math.max(5, Math.min(50, parseInt(val)));
        selectedWallIds.forEach(id => {
            const wall = projectData.walls.find(w => w.id === id);
            if (wall) wall.thickness = thickness;
        });
        document.getElementById('inspector-thickness').value = thickness;
        document.getElementById('inspector-thickness-val').textContent = thickness + ' cm';
    } else if (prop === 'height') {
        const height = Math.max(50, Math.min(400, parseInt(val)));
        selectedWallIds.forEach(id => {
            const wall = projectData.walls.find(w => w.id === id);
            if (wall) wall.height = height;
        });
        document.getElementById('inspector-height').value = height;
        document.getElementById('inspector-height-val').textContent = (height / 100).toFixed(2) + ' m';
    }
    if (!(currentMode === '3d' && rebuildWalls3D(selectedWallIds))) refreshSliderView();   // 3D : seuls les murs réglés sont reconstruits
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
    if (textById(selected3DId)) return deleteText2D();
    const shaftSelected = [...(projectData.shafts || []), ...(projectData.stairs || [])].some(s => s.id === selected3DId);
    if (currentMode === '3d' && selected3DId) return deleteSelected3DElement();   // élément 3D : prioritaire
    if (selectedWallIds.length || selectedDeviceIds.length || selectedOpeningIds.length || shaftSelected) return deleteMultiSelection();
    if (selected3DId) return deleteSelected3DElement();
}
async function deleteMultiSelection() {
    // murs verrouillés : on ne les retire pas, les autres éléments sélectionnés restent supprimables
    const wallIds = new Set(projectData.wallsLocked ? [] : selectedWallIds);
    if (selectedWallIds.length && projectData.wallsLocked) showNotification('Murs verrouillés : les murs sélectionnés ne seront pas supprimés.', 'info');
    const devIds = new Set(selectedDeviceIds);
    // trémies et escaliers sont dans la sélection d'ouvertures : on les retire ici, pas comme ouvertures
    const shIds = new Set([...(projectData.shafts || []), ...(projectData.stairs || [])].filter(s => s.id === selected3DId || selectedOpeningIds.includes(s.id)).map(s => s.id));
    const opIds = new Set(selectedOpeningIds.filter(id => !shIds.has(id)));
    const n = wallIds.size + devIds.size + opIds.size + shIds.size;
    if (!n) return;
    const parts = [];
    if (wallIds.size) parts.push(wallIds.size > 1 ? wallIds.size + ' murs' : 'le mur sélectionné');
    if (devIds.size) parts.push(devIds.size > 1 ? devIds.size + ' appareils' : 'l’appareil sélectionné');
    if (opIds.size) parts.push(opIds.size > 1 ? opIds.size + ' ouvertures' : 'l’ouverture sélectionnée');
    if (shIds.size) parts.push(shIds.size > 1 ? shIds.size + ' trémies ou escaliers' : 'la trémie ou l’escalier sélectionné');
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

// Curseurs et flèches (largeur, taille, épaisseur, hauteur, escalier, distance, hauteur au sol) :
// pendant le réglage, le réseau de câbles reste celui du début (sliderDragging) et le redessin est regroupé par image.
// Fin du réglage : relâchement du curseur (« change ») ou arrêt des flèches (350 ms sans pression).
let sliderDragging = false;
let _sliderFrame = 0;
let _keyHoldTimer = 0;
let wallUndoPending = false;
let wallSliderTouched = false;   // un curseur de mur a été réglé : contrôle des superpositions au relâchement
let posUndoPending = false;   // distance et hauteur au sol : une annulation par réglage
let nudgeUndoPending = false; // flèches du clavier : une annulation par série de pressions

function refreshSliderView() {
    if (_sliderFrame) return;
    _sliderFrame = requestAnimationFrame(() => { _sliderFrame = 0; refreshSelectedView(); });
}

function endSliderDrag() {
    clearTimeout(_keyHoldTimer);
    if (!sliderDragging) return;
    sliderDragging = false;
    _collideDrag = null;   // 239 : les conflits sont recalculés au relâchement
    wallUndoPending = false;
    posUndoPending = false;
    nudgeUndoPending = false;
    _cableCache.sig = null;
    _ghostNetCache.clear();
    refreshSelectedView();
    if (wallSliderTouched) {
        wallSliderTouched = false;
        const clashes = computeWallOpeningClashes();
        if (clashes.length) showNotification(clashes.length === 1
            ? 'Superposition : ce mur traverse une porte ou une fenêtre (surlignée en rouge). Réglez l’épaisseur ou la hauteur autrement, ou déplacez l’ouverture.'
            : clashes.length + ' superpositions : des murs traversent des portes ou fenêtres (surlignées en rouge).', 'error');
    }
}

// Flèches du clavier : une touche n'a pas de « relâchement », on termine le réglage 350 ms après la dernière pression
function holdSliderDrag() {
    sliderDragging = true;
    clearTimeout(_keyHoldTimer);
    _keyHoldTimer = setTimeout(endSliderDrag, 350);
}
// relâche une fonction de glissement restée bloquée
function unstickDrags() { endSliderDrag(); draggingEl2D = null; dragging3DElementId = null; }
document.addEventListener('change', e => {
    if (sliderDragging) endSliderDrag();
}, true);
document.addEventListener('pointerup', e => {
    // 240 : relâcher une flèche ne termine pas le réglage : le recalcul part après la pause (stepRange)
    if (sliderDragging && !(e.target && e.target.closest && e.target.closest('[data-step-btn]'))) setTimeout(endSliderDrag, 0);
}, true);

// Taille de la trémie sélectionnée (D5). Une seule annulation par glissement du curseur.
let shaftUndoPending = false;

function setShaftSize(v) {
    const sh = (projectData.shafts || []).find(s => s.id === selected3DId);
    if (!sh) return;
    if (!shaftUndoPending) { saveStateToUndo(); shaftUndoPending = true; }
    sliderDragging = true;
    sh.size = Math.max(20, Math.min(120, parseInt(v, 10) || 40));
    document.getElementById('shaft-size-val').textContent = sh.size + ' cm';
    if (!(currentMode === '3d' && rebuildShaft3D(sh))) refreshSliderView();   // 2D et 3D : la taille de la trémie se voit dans les deux vues
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
    renderStairLevelEditor(st);
}

function setStairProp(prop, v) {
    const st = (projectData.stairs || []).find(s => s.id === selected3DId);
    if (!st) return;
    if (!stairUndoPending) { saveStateToUndo(); stairUndoPending = true; }
    sliderDragging = true;
    const n = parseFloat(v) || 0;
    if (prop === 'width') st.width = Math.max(60, Math.min(150, n));
    if (prop === 'length') st.length = Math.max(150, Math.min(600, n));
    if (prop === 'angle') st.angleDeg = ((n % 360) + 360) % 360;
    if (prop !== 'angle') snapStairToWalls(st);   // rotation : aimantation au relâchement seulement
    syncStairInspector(st);
    if (!(currentMode === '3d' && rebuildStair3D(st))) refreshSliderView();
}

// Avertissement avant toute suppression (2D comme 3D). L'annulation reste possible.

// Escalier sélectionné : cases des niveaux reliés, dans l'inspecteur 2D et 3D.
// Le niveau d'origine reste toujours relié ; un escalier relie au moins deux niveaux.
function renderStairLevelEditor(st) {
    ['stair-inspector', 'stair-inspector-3d'].forEach(boxId => {
        const box = document.getElementById(boxId);
        if (!box) return;
        let list = box.querySelector('.stair-level-list');
        if (!list) {
            const wrap = document.createElement('div');
            wrap.className = 'flex flex-col gap-1 text-[11px] text-slate-300';
            wrap.innerHTML = '<span class="font-semibold">Niveaux reliés</span><div class="stair-level-list flex flex-col gap-1"></div>';
            box.appendChild(wrap);
            list = wrap.querySelector('.stair-level-list');
        }
        const origin = st.levelId || (st.levelIds || [])[0];
        const originLevel = projectData.levels.find(l => l.id === origin);
        const originElev = originLevel ? originLevel.elevation : 0;
        const linked = new Set(st.levelIds || [origin]);
        const others = projectData.levels.filter(l => l.id !== origin)
            .sort((a, b) => Math.abs(a.elevation - originElev) - Math.abs(b.elevation - originElev));
        const head = '<span class="text-slate-400">' + esc(originLevel ? originLevel.name : origin) + ' : niveau d’origine (toujours relié)</span>';
        if (!others.length) {
            list.innerHTML = head + '<span class="text-slate-400">Aucun autre niveau à relier.</span>';
        } else {
            list.innerHTML = head + others.map(l =>
                '<label class="flex items-center gap-2 cursor-pointer">' +
                '<input type="checkbox" value="' + esc(l.id) + '" class="accent-yellow-400"' + (linked.has(l.id) ? ' checked' : '') + '>' +
                '<span>' + esc(l.name) + ' (' + (l.elevation / 100).toFixed(2) + ' m)</span></label>').join('');
        }
        list.onchange = e => { if (e.target.type === 'checkbox') setStairLinkedLevel(e.target.value, e.target.checked); };
    });
}

// Ajoute ou retire un niveau relié à l'escalier sélectionné. Refus s'il ne resterait qu'un seul niveau.
// L'escalier est recalé sur les murs des niveaux qu'il relie ; s'il n'est plus visible à l'étage affiché, sa sélection s'arrête.
function setStairLinkedLevel(levelId, on) {
    const st = (projectData.stairs || []).find(s => s.id === selected3DId);
    if (!st) return;
    const origin = st.levelId || st.levelIds[0];
    const wanted = new Set(st.levelIds || [origin]);
    if (on) wanted.add(levelId); else wanted.delete(levelId);
    const relinked = [origin, ...projectData.levels.map(l => l.id).filter(id => id !== origin && wanted.has(id))];
    if (!on && relinked.length < 2) {
        showNotification('Un escalier relie au moins deux niveaux.', 'error');
    } else {
        saveStateToUndo();
        st.levelId = origin;
        st.levelIds = relinked;   // pas de recalage sur les murs : l'escalier garde sa place et son sens
        if (!relinked.includes(activeLevelId)) selected3DId = null;
    }
    syncElementInspectors();
    refreshSelectedView();
}

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

// Commandes qui peuvent piloter une charge donnée (pour entourer les interrupteurs à poser dans Appareillages)
const controlTypesFor = loadType => Object.keys(CONTROL_LOADS).filter(t => CONTROL_LOADS[t].includes(loadType));
const DEFAULT_CIRCUIT_BY_TYPE = {
    light_ceiling: 'c_lighting', light_spot: 'c_lighting', smoke_detector: 'c_daaf', wall_light: 'c_lighting',
    outlet_16a: 'c_outlets', outlet_20a: 'c_kitchen', outlet_20a_classic: 'c_outlets20', outlet_dedicated_20: 'c_dedicated20', outlet_dedicated_32: 'c_dedicated32',
    outlet_switched: 'c_outlets', doorbell_chime: 'c_doorbell', shutter_motor: 'c_shutters', shutter_control: 'c_shutters'
};

const CIRCUIT_POINT_LIMITS = { c_lighting: 8, c_outlets: 8, c_outlets20: 12, c_kitchen: 6, c_dedicated20: 1, c_dedicated32: 1 };

// 237 : un appareil ne se place que dans les circuits de même nature (lumière dans l'éclairage, prise 16 A dans les 16 A, 20 A dans les 20 A...)
// Circuits de même calibre et même usage qui se remplacent : les deux circuits 20 A de prises
const CIRCUIT_EQUIVALENTS = { c_outlets20: ['c_kitchen'], c_kitchen: ['c_outlets20'] };
// Racines de circuit autorisées pour un appareil (null = pas de restriction, ex. boîtes de dérivation)
function allowedCircuitRootsFor(el) {
    if (!el || el.type === 'junction_box') return null;
    const base = el.type === 'shutter_control' ? DEFAULT_CIRCUIT_BY_TYPE.shutter_control
        : isControl(el) ? DEFAULT_CIRCUIT_BY_TYPE.light_ceiling
        : DEFAULT_CIRCUIT_BY_TYPE[el.type];
    if (!base) return null;
    return [base, ...(CIRCUIT_EQUIVALENTS[base] || [])];
}

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
    panel: 'Tableau électrique',
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
    panel: '#06b6d4',
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
    // tout élément sélectionné (seul ou en multiple) ou tout circuit : le plan est redessiné à chaque phase de clignotement
    return !!selectedCircuitId || !!selected3DId || selectedDeviceIds.length > 0 || selectedOpeningIds.length > 0 || selectedWallIds.length > 0;
}

// Vrai si un câble traverse un escalier : le plan doit alors se redessiner à chaque clignotement
function cableStairHitNow() {
    return !!(cableStats && cableStats.segments && cableStats.segments.some(s => s.stairHit));
}

function startCollisionBlink() {
    setInterval(() => {
        blinkOn = !blinkOn;
        // câbles qui traversent un escalier : même rythme que les autres conflits, sans reconstruire la scène
        if (CABLE_RES.stairHitMat) CABLE_RES.stairHitMat.color.set(blinkOn ? '#ef4444' : '#fecaca');
        if (currentMode === '3d') {
            if (typeof refreshOverlays3D === 'function') refreshOverlays3D();   // patch 90 : collisions et sélections à jour
            blinkSelectionFrames3D();   // patch 93 : les cadres de sélection alternent de couleur
            wallMeshes3D.forEach(m => { if (m.userData && m.userData.blink) m.visible = blinkOn; });
        } else if (currentMode === '2d' && (collidingElementIds().size || selectionBlinkNeeded() || cableStairHitNow())) {
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
    }, 1000);
}

function circuitRoot(c) {
    return c && c.baseId ? (projectData.circuits.find(x => x.id === c.baseId) || c) : c;
}

// Répartition des appareils en circuits : quand un circuit atteint son nombre de points maximum,
// un circuit supplémentaire est créé automatiquement (« Prises de courant 16A (2) », etc.).
// Les appareils déjà affectés gardent leur circuit ; les nouveaux rejoignent d'abord les voisins les plus proches.
const AUTO_ASSIGN = { map: new Map(), sig: null };

// Commande qui pilote chaque lampe (id lampe -> id commande) : la commande manuelle d'abord, sinon la plus proche
// en ligne droite au même étage. Ne dépend pas des circuits : répartition et câblage utilisent le même choix (patch 111).
function commandGroupOf() {
    const map = new Map();
    const controls = projectData.electrical.filter(isControl);
    controls.forEach(sw => {
        (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).forEach(lid => {
            const light = projectData.electrical.find(e => e.id === lid && isControlledLoad(e));
            if (light && light.levelId === sw.levelId && canControl(sw, light) && !map.has(light.id)) map.set(light.id, sw.id);
        });
    });
    projectData.electrical.filter(isControlledLoad).forEach(light => {
        if (map.has(light.id)) return;
        const L = getElCoords(light);
        let best = null, bestD = Infinity;
        controls.forEach(sw => {
            if (sw.levelId !== light.levelId || Array.isArray(sw.controlledLightIds) || !canControl(sw, light)) return;
            const S = getElCoords(sw);
            const d = Math.hypot(S.x - L.x, S.y - L.y);
            if (d <= 500 && d < bestD) { bestD = d; best = sw; }
        });
        if (best) map.set(light.id, best.id);
    });
    return map;
}

function ensureCircuitAssignment() {
    const circuits = projectData.circuits;
    // chaque suite automatique garde son propre calibre, sa section et sa capacité (aucune recopie depuis le circuit d'origine)
    // une commande de volet ne prend pas de place sur un circuit : son fil suit le circuit de son moteur (voir scene3d)
    const pts = projectData.electrical.filter(el => isCircuitPoint(el) && el.type !== 'shutter_control');
    // 227 : appareils posés après la création d'un circuit à la demande : ils lui sont affectés
    circuits.forEach(c => {
        if (!c.receives) return;
        const els = projectData.electrical;
        const at = c.receivesAfter ? els.findIndex(e => e.id === c.receivesAfter) : -2;
        if (at === -1) return;   // repère supprimé : on ne touche à rien
        const root = circuitRoot(c);
        for (let i = at + 1; i < els.length; i++) {
            const el = els[i];
            if (!isCircuitPoint(el) || el.circuitId) continue;
            const dflt = projectData.circuits.find(x => x.id === DEFAULT_CIRCUIT_BY_TYPE[el.type]);
            if (dflt && circuitRoot(dflt).id === root.id) el.circuitId = c.id;
        }
    });
    // patch 111 : une commande modifiée ou un appareil déplacé recalcule la répartition
    const groupOf = commandGroupOf();
    const sigOf = () => JSON.stringify([
        circuits.map(c => [c.id, c.name, c.maxPoints, c.breakerRating, c.wireSection, c.baseId || 0, c.wiringMode || 'chain']),
        pts.map(el => [el.id, el.type, el.circuitId || 0]),
        [...groupOf.entries()],
        projectData.electrical.map(e => { const p = getElCoords(e); return [e.id, Math.round(p.x), Math.round(p.y)]; })
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

        // patch 111 : les lampes d'une même commande forment un bloc, placé en entier sur un même circuit
        const blocks = new Map();
        members.forEach(el => {
            const sid = groupOf.get(el.id);
            if (!sid) return;
            if (!blocks.has(sid)) blocks.set(sid, []);
            blocks.get(sid).push(el);
        });
        // 1. choix explicites de l'utilisateur
        members.forEach(el => {
            const target = chain.find(c => c.id === el.circuitId);
            if (target && count.get(target.id) < capacity(target)) assign(el, target.id);
        });
        // 2. affectation précédente : un bloc garde son circuit en entier, ou il est replacé à l'étape 3
        blocks.forEach(list => {
            const todo = list.filter(el => !assigned.has(el.id));
            if (!todo.length) return;
            const pcs = new Set(todo.map(el => prev.get(el.id) || null));
            if (pcs.size !== 1 || pcs.has(null)) return;
            const target = chain.find(c => c.id === [...pcs][0]);
            if (target && todo.every(el => canTake(target, el)) && count.get(target.id) + todo.length <= capacity(target)) {
                todo.forEach(el => assign(el, target.id));
            }
        });
        members.forEach(el => {
            if (assigned.has(el.id) || groupOf.has(el.id)) return;   // les lampes en bloc sont traitées ci-dessus
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
        // circuit automatique neuf, en fin de la famille
        const newCircuit = () => {
            let n = 2;
            while (byId(F.id + '_x' + n)) n++;
            const nc = { id: F.id + '_x' + n, name: F.name, type: F.type, maxPoints: CIRCUIT_POINT_LIMITS[F.id] !== undefined ? CIRCUIT_POINT_LIMITS[F.id] : F.maxPoints, breakerRating: F.breakerRating, wireSection: F.wireSection, color: freeFamilyShade(F, chain.length, null), auto: true, baseId: F.id };
            circuits.splice(circuits.indexOf(chain[chain.length - 1]) + 1, 0, nc);
            chain.push(nc);
            count.set(nc.id, 0);
            created.push(nc);
            return nc;
        };
        order.forEach(el => {
            if (assigned.has(el.id)) return;
            // patch 111 : tout le bloc d'une commande va sur un même circuit
            const list = groupOf.has(el.id) ? (blocks.get(groupOf.get(el.id)) || [el]).filter(m => !assigned.has(m.id)) : [el];
            let c = chain.find(x => count.get(x.id) + list.length <= capacity(x) && list.every(m => canTake(x, m)));
            if (!c && list.length > 1) {
                const nc = newCircuit();
                if (list.length <= capacity(nc)) c = nc;
                else {
                    circuits.splice(circuits.indexOf(nc), 1);
                    chain.pop();
                    created.pop();
                    count.delete(nc.id);
                }
            }
            if (c) { list.forEach(m => assign(m, c.id)); return; }
            // élément seul, ou bloc trop grand pour un circuit : un par un, comme avant
            list.forEach(m => {
                let t = chain.find(x => count.get(x.id) < capacity(x) && canTake(x, m));
                if (!t) t = newCircuit();
                assign(m, t.id);
            });
        });
        // 4. compactage : un circuit automatique se vide dans un précédent seulement en entier (les blocs restent entiers)
        for (let i = chain.length - 1; i >= 1; i--) {
            const c = chain[i], n = count.get(c.id);
            if (!n || c.manual || members.some(el => assigned.get(el.id) === c.id && el.circuitId === c.id)) continue;
            const inC = members.filter(el => assigned.get(el.id) === c.id);
            const t = chain.slice(0, i).find(x => count.get(x.id) + n <= capacity(x) && inC.every(el => canTake(x, el)));
            if (!t) continue;
            inC.forEach(el => assigned.set(el.id, t.id));
            count.set(t.id, count.get(t.id) + n);
            count.set(c.id, 0);
        }
        // 5. circuits automatiques vides supprimés, les autres renumérotés sans modifier leurs réglages
        const kept = [F];
        chain.slice(1).forEach(c => {
            if (count.get(c.id) > 0 || c.manual) kept.push(c);
            else circuits.splice(circuits.indexOf(c), 1);
        });
        // 153 : « (n°1) », « (n°2)… » ; le premier garde son numéro dès qu'il y a plusieurs circuits de la même famille
        const famName = F.name.replace(/ \((n°)?\d+\)$/, '');
        F.name = kept.length > 1 ? famName + ' (n°1)' : famName;
        kept.slice(1).forEach((c, i) => {
            c.name = famName + ' (n°' + (i + 2) + ')';
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

// Section minimale indicative selon le calibre du disjoncteur ; éclairage : 1,5 mm² minimum jusqu'à 16 A
function minSectionFor(breaker, type) {
    if (type === 'lighting' && breaker <= 16) return 1.5;
    return breaker <= 10 ? 1.5 : breaker <= 20 ? 2.5 : 6;
}

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

    // trémies à position libre : les anciennes (ancrées sur un mur) reçoivent leur centre en plan
    (projectData.shafts || []).forEach(sh => {
        if (Number.isFinite(sh.x) && Number.isFinite(sh.y)) return;
        const w = (projectData.walls || []).find(x => x.id === sh.wallId);
        if (!w) { sh.x = 0; sh.y = 0; return; }
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        const d = Math.max(10, Math.min(len - 10, sh.distanceFromStart !== undefined ? sh.distanceFromStart : len / 2));
        const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
        const off = (w.thickness || 10) / 2 + (sh.size || 40) / 2;
        const side = sh.side === -1 ? -1 : 1;
        sh.x = Math.round(w.x1 + ux * d + uy * side * off);
        sh.y = Math.round(w.y1 + uy * d - ux * side * off);
    });
    // répartition recalculée dès le chargement : pas d'affichage « tout sur le premier circuit » avant le premier calcul
    ensureCircuitAssignment();
    syncTextSizeInputs();   // patch 83 : les champs de taille reprennent la valeur du projet
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
            // 139 : on compte l'encombrement de l'appareil (rayon le long du mur, demi-hauteur), pas seulement son centre
            const eb = deviceBox(el);
            if (Math.abs(dist - b.d) < b.half + eb.r && z + eb.h >= b.z0 && z - eb.h <= b.z1) list.push({ el, isDoor: !!b.isDoor, box: b, dist, z });
        });
    });
    return list;
}

// Chevauchement entre appareils (tableau, prises, interrupteurs, appliques, boîtes) : sur le plan.
// Un plafonnier n'est comparé qu'à un autre plafonnier (il est au plafond, pas sur le mur).
// Demi-encombrements (cm), d'après les volumes dessinés en 3D (le centre de l'appareil est à sa hauteur)
function deviceBox(el) {
    const c = getElCoords(el);
    const gang = gangFamily(el.type) !== null;
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
            // deux appareils du même mur mais de part et d'autre : ils ne se gênent pas
            if (!a.ceiling && a.el.wallId === b.el.wallId && (a.el.side === -1 ? -1 : 1) !== (b.el.side === -1 ? -1 : 1)) continue;
            if (boxesOverlap(a, b)) list.push({ a: a.el, b: b.el });
        }
    }
    return list;
}

// Plafonnier ou spot dont le point au plan tombe dans l'épaisseur d'un mur de son étage
function computeCeilingOnWallHits() {
    return (projectData.electrical || []).filter(el => {
        if (!CEILING_TYPES.includes(el.type)) return false;
        const c = getElCoords(el);
        return wallsOn(el.levelId).some(w => {
            const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
            if (!len) return false;
            const s = ((c.x - w.x1) * dx + (c.y - w.y1) * dy) / len;
            const d = Math.abs((c.x - w.x1) * dy - (c.y - w.y1) * dx) / len;
            return s >= 0 && s <= len && d < (w.thickness || 10) / 2;
        });
    });
}

// Même test d'encombrement que computeDeviceOverlaps (plan + hauteur)
function boxesOverlap(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r && Math.abs(a.z - b.z) < a.h + b.h;
}

// Appareil déjà présent, même mur, même côté, qui chevauche le candidat ; null sinon
function wallDeviceHit(cand) {
    const a = deviceBox(cand);
    return electricalOn().find(o => !CEILING_TYPES.includes(o.type) && o.wallId === cand.wallId
        && (o.side === -1 ? -1 : 1) === (cand.side === -1 ? -1 : 1) && boxesOverlap(a, deviceBox(o))) || null;
}

// Un interrupteur de plus fait-il dépasser le groupe maximal ? Test sur l'état réel, annulé aussitôt
function wouldOverflowGang(cand) {
    const before = computeOutletGangs().overflow.size;
    projectData.electrical.push(cand);
    try { return computeOutletGangs().overflow.size > before; }
    finally { projectData.electrical.pop(); }
}

// Motif de refus d'un appareil mural posé à distCm (texte) ; null si la pose est permise
function applianceRefusal(type, levelId, wallId, distCm, side, height) {
    const cand = { id: '__cand', type, levelId, wallId, distanceFromStart: distCm,
        side: side === -1 ? -1 : 1, height: height || defaultHeightFor(type) };
    if (wallDeviceHit(cand)) return 'Emplacement occupé par un appareil : choisissez un autre point du mur.';
    if (gangFamily(type) === 'switch' && wouldOverflowGang(cand)) return 'Groupe d’interrupteurs complet (deux au maximum) : placez-le sur un autre point du mur.';
    return null;
}

// Position retenue sur le mur : ouverture entièrement sur le mur ; appareil ramené dans le mur puis aimanté à sa plaque
function placedDistance(el, wallId, distCm, side) {
    const w = (projectData.walls || []).find(x => x.id === wallId);
    if (!w) return distCm;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (OPENING_TYPES.includes(el.type)) {
        const hw = openingWidthOf(el) / 2;
        return Math.max(hw, Math.min(len - hw, distCm));
    }
    const d = Math.max(10, Math.min(len - 10, distCm));
    return snapOutletDistance(el.type, wallId, d, side, el.height || defaultHeightFor(el.type), el.id || null);
}

// Éléments cités par une alerte (interrupteur sans charge, câble non relié, superposition…) : ils clignotent en rouge
let alertBlinkIds = new Set();

// Carré au sol d'une porte qui touche un autre élément : la porte et l'élément clignotent en rouge (comme les autres conflits)
function computeDoorZoneCollisions() {
    const out = [];
    openingsOn().filter(o => o.type === 'door_single').forEach(d => {
        const sq = doorSquareOf(d);
        if (!sq) return;
        if (wallsOn().some(w => { const r = wallRectOf(w); return r && rectsOverlap(sq, r); })) out.push({ door: d.id, other: null });
        openingsOn().forEach(o => {
            if (o.id === d.id) return;
            const r = openingRectOf(o), s = o.type === 'door_single' ? doorSquareOf(o) : null;
            if ((r && rectsOverlap(sq, r)) || (s && rectsOverlap(sq, s))) out.push({ door: d.id, other: o.id });
        });
        shaftsOn().forEach(sh => { if (rectsOverlap(sq, shaftRectOf(sh))) out.push({ door: d.id, other: sh.id }); });
        // escalier : seules les marches pleines entre le sol et la hauteur de la porte gênent le vantail
        // (dessous et dessus libres, même règle que openingClashesSolid)
        const elevL = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
        const floorD = elevL(d.levelId), topD = floorD + 210;
        stairsOn().forEach(st => {
            const R = stairRect(st);
            if (!rectsOverlap(sq, R)) return;
            const bottom = Math.min(...(st.levelIds || [st.levelId]).map(elevL));
            const angle = Math.atan2(R.uy, R.ux);
            const touche = stairStepSolids(st).some(s => {
                const uc = (s.u0 + s.u1) / 2, vc = (s.v0 + s.v1) / 2;
                const step = orientedRect(R.cx + uc * R.ux + vc * R.vx, R.cy + uc * R.uy + vc * R.vy, angle, (s.u1 - s.u0) / 2, (s.v1 - s.v0) / 2);
                return bottom + s.z1 > floorD + 1 && bottom + s.z0 < topD - 1 && rectsOverlap(sq, step);
            });
            if (touche) out.push({ door: d.id, other: st.id });
        });
        // 223 : plafonniers et spots sont au plafond : ils ne gênent pas le vantail, même au-dessus du carré au sol
        electricalOn().forEach(el => { if (!CEILING_TYPES.includes(el.type) && rectsOverlap(sq, applianceRectOf(el))) out.push({ door: d.id, other: el.id }); });
    });
    return out;
}

// Fenêtre ouverte : emprise au sol de la largeur de la fenêtre sur une demi-largeur de profondeur, du côté où elle s'ouvre
function windowSquaresOf(op) {
    const w = (projectData.walls || []).find(x => x.id === op.wallId);
    const p = w && openingPos2D(op);
    if (!p || op.type !== 'window_std') return [];
    const W = openingBox(op, w).half * 2;          // largeur de la fenêtre
    const sy = op.side === -1 ? 1 : -1;            // même convention que doorSquareOf
    const cyL = sy * (p.th / 2 + W / 4);           // centre de l'emprise, côté d'ouverture
    return [orientedRect(p.x - cyL * Math.sin(p.angle), p.y + cyL * Math.cos(p.angle), p.angle, W / 2, W / 4)];
}

// Escalier dans l'emprise d'une fenêtre ouverte : seules les marches entre l'allège et le linteau comptent
function computeWindowZoneCollisions() {
    const out = [];
    const elevL = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
    openingsOn().filter(o => o.type === 'window_std').forEach(win => {
        const sqs = windowSquaresOf(win);
        const w = (projectData.walls || []).find(x => x.id === win.wallId);
        if (!sqs.length || !w) return;
        const b = openingBox(win, w);
        const low = elevL(win.levelId) + b.z0, high = elevL(win.levelId) + b.z1;
        stairsOn().forEach(st => {
            const R = stairRect(st);
            const bottom = Math.min(...(st.levelIds || [st.levelId]).map(elevL));
            const angle = Math.atan2(R.uy, R.ux);
            const touche = stairStepSolids(st).some(s => {
                const uc = (s.u0 + s.u1) / 2, vc = (s.v0 + s.v1) / 2;
                const step = orientedRect(R.cx + uc * R.ux + vc * R.vx, R.cy + uc * R.uy + vc * R.vy, angle, (s.u1 - s.u0) / 2, (s.v1 - s.v0) / 2);
                return bottom + s.z1 > low + 1 && bottom + s.z0 < high - 1 && sqs.some(sq => rectsOverlap(sq, step));
            });
            if (touche) out.push({ window: win.id, other: st.id });
        });
    });
    return out;
}
// 239 : pendant un glissement de curseur, les conflits sont ceux du début du glissement (recalculés au relâchement)
let _collideDrag = null;
function collidingElementIds() {
    if (sliderDragging && _collideDrag) return _collideDrag;
    const ids = new Set(computeOpeningCollisions().map(c => c.el.id));
    computeShaftCollisions().forEach(c => { ids.add(c.shaft.id); ids.add(c.other.id); });
    computeDeviceOverlaps().forEach(c => { ids.add(c.a.id); ids.add(c.b.id); });
    computeCeilingOnWallHits().forEach(el => ids.add(el.id));
    computeStairCollisions().forEach(c => { ids.add(c.stair.id); ids.add(c.other.id); });
    computeOutletGangs().overflow.forEach(id => ids.add(id));
    computeStairOpeningCollisions().forEach(c => { ids.add(c.stair.id); ids.add(c.opening.id); });
    computeWallOpeningClashes().forEach(c => ids.add(c.opening.id));
    computeDoorZoneCollisions().forEach(c => { ids.add(c.door); if (c.other) ids.add(c.other); });
    computeWindowZoneCollisions().forEach(c => { ids.add(c.window); ids.add(c.other); });
    alertBlinkIds.forEach(id => ids.add(id));
    if (sliderDragging) _collideDrag = ids;
    return ids;
}

// Emprise en plan d'une trémie (carré de sa taille, posé contre son mur)
function shaftRectOf(sh) {
    const p = shaftPos2D(sh);
    return p ? orientedRect(p.x, p.y, p.angle, (sh.size || 40) / 2, (sh.size || 40) / 2) : null;
}

// Zone d'une trémie : son emprise plus l'épaisseur du mur jusqu'à son axe, pour retrouver les ouvertures qui lui font face
// Zone d'une trémie pour retrouver les ouvertures voisines
function shaftZoneOf(sh) {
    const size = sh.size || 40;
    return orientedRect(sh.x, sh.y, 0, size / 2 + 6, size / 2 + 6);
}

// Deux trémies ou escaliers qui relient un niveau en commun
function linksSharedLevel(a, b) {
    const lb = b.levelIds || [b.levelId];
    return (a.levelIds || [a.levelId]).some(lv => lb.includes(lv));
}

// Trémies : chevauchement avec une ouverture, un mur, un appareil ou une autre trémie (vérifié dans les deux sens)
function computeShaftCollisions() {
    const list = [];
    const shafts = projectData.shafts || [];
    shafts.forEach(sh => {
        const half = (sh.size || 40) / 2;
        const center = shaftPos2D(sh);
        const zone = shaftZoneOf(sh), rect = shaftRectOf(sh);
        (sh.levelIds || [sh.levelId]).forEach(lv => {
            openingsOn(lv).forEach(op => {
                const r = openingRectOf(op);
                if (zone && r && rectsOverlap(zone, r) && !list.some(c => c.kind === 'ouverture' && c.other === op && c.shaft === sh)) list.push({ shaft: sh, other: op, kind: 'ouverture' });
            });
            if (rect) wallsOn(lv).forEach(W => {
                const wr = wallRectOf(W);
                if (!wr) return;
                wr.hw -= 2;
                if (rectsOverlap(rect, wr) && !list.some(c => c.kind === 'mur' && c.other === W && c.shaft === sh)) list.push({ shaft: sh, other: W, kind: 'mur' });
            });
            if (!center) return;
            electricalOn(lv).forEach(el => {
                const c = getElCoords(el);
                const r = el.type === 'panel' ? 20 : 14;
                if (Math.hypot(c.x - center.x, c.y - center.y) < half + r && !list.some(x => x.kind === 'appareil' && x.other === el && x.shaft === sh)) list.push({ shaft: sh, other: el, kind: 'appareil' });
            });
        });
    });
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

// Étiquette d'un escalier sur le niveau affiché : « ↑ Étage 1 · ↓ Sous-sol ».
// La flèche indique si le niveau relié est au-dessus (↑) ou en dessous (↓), d'après les altitudes des niveaux.
function stairLevelLabel(st) {
    const levels = projectData.levels || [];
    const elevOf = id => Number(((levels.find(l => l.id === id)) || {}).elevation) || 0;
    const here = elevOf(activeLevelId);
    return (st.levelIds || [st.levelId])
        .filter(id => id !== activeLevelId)
        .map(id => ({ id, elev: elevOf(id), name: ((levels.find(l => l.id === id)) || {}).name || '?' }))
        .sort((p, q) => q.elev - p.elev)
        .map(o => (o.elev > here ? '↑ ' : '↓ ') + o.name)
        .join(' · ');
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

// Marches pleines d'un escalier, en repère de l'escalier (u : longueur, v : largeur, z : hauteur depuis le pied).
// Même géométrie que buildStair3D : marche horizontale de 5 cm + contremarche. Le reste est vide (dessous, dessus).
function stairStepSolids(st) {
    const L = st.length || 300, W = st.width || 90;
    const H = Math.max(stairRiseCm(st), 1), n = stairStepCount(st);
    const sh = H / n, d = L / n, T = 5, hw = W / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
        const u0 = -L / 2 + i * d, u1 = u0 + d;
        out.push({ u0, u1, v0: -hw, v1: hw, z0: i * sh - T, z1: i * sh });            // marche horizontale
        out.push({ u0: u1 - T, u1, v0: -hw, v1: hw, z0: i * sh, z1: (i + 1) * sh });  // contremarche
    }
    return out;
}

// Chevauchements d'un escalier (niveau affiché) : appareils dans l'emprise jusqu'au plafond, trémies, ouvertures, murs
function computeStairCollisions() {
    const list = [];
    (projectData.stairs || []).forEach(st => {
        const R = stairRect(st);
        const ids = st.levelIds || [st.levelId];
        const elevOfL = lv => Number(((projectData.levels || []).find(l => l.id === lv) || {}).elevation) || 0;
        // marches en cote absolue : le pied de l'escalier est au niveau le plus bas relié
        const bottomAbs = Math.min(...ids.map(elevOfL));
        const solids = stairStepSolids(st).map(s => Object.assign({}, s, { z0: bottomAbs + s.z0, z1: bottomAbs + s.z1 }));
        // un escalier relie plusieurs niveaux : ses obstacles sont cherchés sur chacun d'eux
        ids.forEach(lv => {
            electricalOn(lv).forEach(el => {
                const b = deviceBox(el);
                if (b.z > levelCeilingOf(lv)) return;
                const dx = b.x - R.cx, dy = b.y - R.cy;
                const lu = dx * R.ux + dy * R.uy, lw = dx * R.vx + dy * R.vy;
                // plafonnier dans l'emprise : trou dans le plafond (niveau le plus bas de l'escalier) → à déplacer
                if (CEILING_TYPES.includes(el.type)) {
                    if (elevOfL(lv) === bottomAbs && Math.abs(lu) < R.hl && Math.abs(lw) < R.hw) list.push({ stair: st, other: el, kind: 'appareil' });
                    return;
                }
                if (!(Math.abs(lu) < R.hl + b.r && Math.abs(lw) < R.hw + b.r)) return;
                const zAbs = elevOfL(lv) + b.z;
                // signalé seulement s'il touche la matière d'une marche (espace libre dessus et dessous : accepté)
                const touche = solids.some(s => {
                    const cu = (s.u0 + s.u1) / 2, cw = (s.v0 + s.v1) / 2;
                    return Math.abs(lu - cu) < b.r + (s.u1 - s.u0) / 2 - 0.5
                        && Math.abs(lw - cw) < b.r + (s.v1 - s.v0) / 2 - 0.5
                        && zAbs - b.h < s.z1 - 0.5 && zAbs + b.h > s.z0 + 0.5;
                });
                if (touche) list.push({ stair: st, other: el, kind: 'appareil' });
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
                // 143 : seule la matière des marches compte, comme pour le clignotement et l'alerte « Escalier sur une fenêtre ou une porte »
                if (openingClashesSolid(op, w, st, elevOfL(lv) - bottomAbs)) {
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
    // écart entre l'emprise et un mur, le long de la normale du mur
    const gapOf = (R, W) => {
        const dx = R.cx - W.cx, dy = R.cy - W.cy;
        const d = dx * W.vx + dy * W.vy;
        const rS = R.hl * Math.abs(R.ux * W.vx + R.uy * W.vy) + R.hw * Math.abs(R.vx * W.vx + R.vy * W.vy);
        const t = dx * W.ux + dy * W.uy;
        const rU = R.hl * Math.abs(R.ux * W.ux + R.uy * W.uy) + R.hw * Math.abs(R.vx * W.ux + R.vy * W.uy);
        return { gap: Math.abs(d) - (W.hw + rS), sign: d >= 0 ? 1 : -1, along: Math.abs(t) < W.hl + rU + STAIR_SNAP_CM };
    };

    // murs de tous les niveaux que l'escalier relie
    const levelsOfSt = st.levelIds || [st.levelId];
    const walls = (projectData.walls || []).filter(w => levelsOfSt.includes(w.levelId)).map(w => wallRectOf(w)).filter(Boolean);
    // Aimantation : collage à la face d'un mur tout proche (écart inférieur à 25 cm)
    let best = null;
    walls.forEach(W => {
        const g = gapOf(stairRect(st), W);
        if (g.along && g.gap >= 0 && g.gap < STAIR_SNAP_CM && (!best || g.gap < best.g.gap)) best = { W, g };
    });
    // éloignement : si l'escalier s'éloigne du mur, il n'est pas recollé
    if (best && prev) {
        const before = gapOf(stairRect(Object.assign({}, st, { x: prev.x, y: prev.y })), best.W).gap;
        if (best.g.gap >= before) best = null;
    }
    // Aimantation positionnelle seulement (collage au mur sans rotation automatique ni push-out)
    if (best) {
        const g = gapOf(stairRect(st), best.W);
        st.x = Math.round(st.x - g.sign * g.gap * best.W.vx);
        st.y = Math.round(st.y - g.sign * g.gap * best.W.vy);
    }
}

// Prises simples proches (même mur, même côté, même hauteur) : regroupées automatiquement en double / triple / quadruple
const GANGABLE_OUTLETS = ['outlet_16a', 'outlet_20a', 'outlet_20a_classic'];

// Interrupteurs : tous les types d'interrupteur se regroupent entre eux, deux au maximum (double)
const SWITCH_GANG_TYPES = ['switch_simple', 'switch_va_et_vient', 'switch_dimmer', 'switch_pushbutton'];
const GANG_CAP = { outlet: 4, switch: 2 };
const GANG_MAX_GAP_CM = 15;
const GANG_NAMES = { 1: 'simple', 2: 'double', 3: 'triple', 4: 'quadruple' };

// Libellé d'une ligne de légende. Interrupteur : son nom seul, ou « (double) » si groupé. Prise : nom + taille du groupe, comme avant
function gangLabel(type, n) {
    const base = ELEMENT_LABELS[type] || type;
    if (gangFamily(type) === 'switch') return n > 1 ? base + ' (' + GANG_NAMES[n] + ')' : base;
    return base + ' ' + GANG_NAMES[n];
}

// Famille de regroupement : 'outlet', 'switch', ou null si l'appareil ne se regroupe pas
function gangFamily(type) {
    if (GANGABLE_OUTLETS.includes(type)) return 'outlet';
    if (SWITCH_GANG_TYPES.includes(type)) return 'switch';
    return null;
}

// Aimantation : un appareil posé à moins de 15 cm d'un voisin (même famille, même mur, côté et hauteur) se colle à une plaque (7,5 cm)
const OUTLET_PLATE_CM = 7.5;
function snapOutletDistance(type, wallId, dist, side, height, excludeId) {
    const fam = gangFamily(type);
    if (!fam) return dist;
    const sd = side === -1 ? -1 : 1;
    const peers = electricalOn().filter(o => o.id !== excludeId && gangFamily(o.type) === fam && o.wallId === wallId &&
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
    // appareils en trop : le groupe est déjà au maximum (4 prises, 2 interrupteurs)
    const overflow = new Set();
    const overflowGroups = [];
    // membres de chaque groupe (ids), indexés par l'id de chaque appareil du groupe
    const groupOf = new Map();
    const tally = {};
    [...GANGABLE_OUTLETS, ...SWITCH_GANG_TYPES].forEach(type => { tally[type] = { 1: 0, 2: 0, 3: 0, 4: 0 }; });
    const buckets = new Map();
    electricalOn().forEach(el => {
        const fam = gangFamily(el.type);
        if (!fam) return;
        const w = wallsOn().find(x => x.id === el.wallId);
        const wl = w ? Math.hypot(w.x2 - w.x1, w.y2 - w.y1) : 0;
        const dist = el.distanceFromStart !== undefined ? el.distanceFromStart : wl / 2;
        // prises : un groupe par type ; interrupteurs : tous types confondus
        const key = (fam === 'switch' ? 'switch' : el.type) + '|' + el.wallId + '|' + (el.side === -1 ? -1 : 1);
        if (!buckets.has(key)) buckets.set(key, { fam, items: [] });
        buckets.get(key).items.push({ el, dist, h: el.height || defaultHeightFor(el.type) });
    });
    buckets.forEach(({ fam, items }) => {
        const cap = GANG_CAP[fam];
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
                if (cluster.length < cap) { cluster.push(it); return; }
                // groupe complet : l'appareil en trop et les membres du groupe sont signalés
                overflow.add(it.el.id);
                cluster.forEach(c => overflow.add(c.el.id));
            }
            close();
            cluster.push(it);
        });
        close();
    });
    // un groupe trop grand = une seule alerte : prises (ou interrupteurs) contigus au-delà de la capacité
    buckets.forEach(({ fam, items }) => {
        const cap = GANG_CAP[fam];
        const sorted = [...items].sort((a, b) => a.dist - b.dist);
        let run = [];
        const flush = () => {
            if (run.length > cap) overflowGroups.push({ fam, cap, count: run.length, extra: run.length - cap, firstExtra: run[cap].el.id });
            run = [];
        };
        sorted.forEach(it => {
            const last = run[run.length - 1];
            if (last && !(it.dist - last.dist <= GANG_MAX_GAP_CM && Math.abs(it.h - last.h) <= 5)) flush();
            run.push(it);
        });
        flush();
    });
    return { sizeOf, tally, overflow, groupOf, overflowGroups };
}

// Réseau de câblage de chaque niveau (le métré couvre tout le projet, pas seulement le niveau affiché)
// Les caches existants sont utilisés : sans eux, chaque image de glissement 3D refaisait le câblage
function networksAllLevels() {
    const saved = activeLevelId;
    const nets = [];
    // 218 : un étage sans point de circuit n'a aucun câble à compter : son réseau n'est pas calculé
    const withPoints = new Set((projectData.electrical || [])
        .filter(el => el.type !== 'shutter_control' && el.levelId && circuitOf(el))
        .map(el => el.levelId));
    try {
        (projectData.levels || []).forEach(l => {
            if (l.id === saved) nets.push(getCableNetwork());
            else if (withPoints.has(l.id)) nets.push(ghostCableNetwork(l.id));
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
        const ptsAll = projectData.electrical.filter(el => { if (el.type === 'shutter_control') return false; const cc = circuitOf(el); return cc && cc.id === c.id; });
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
        const limit = 5;
        const warnings = [];
        const pointLimit = maxPointsForCircuit(c);
        if (points > pointLimit) warnings.push(points + ' points pour ' + pointLimit + ' maximum (tous niveaux)');
        if (c.wireSection < minSectionFor(c.breakerRating, c.type)) warnings.push('section ' + c.wireSection + ' mm² trop faible pour ' + c.breakerRating + ' A');
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
        if (!anyPanel) addAlert('Aucun tableau électrique : les appareils ne sont pas reliés.', { tab: 'appareillage', redTools: ['panel'], hint: 'Placez un tableau électrique depuis l’onglet Appareillages.' });   // 124 : bouton Tableau entouré en rouge
        else if (shaftFeedFor(activeLevelId).reason) addAlert('Cet étage n\'est relié au tableau par aucune trémie : ses appareils ne sont pas alimentés.', { tab: 'ouvertures', hint: 'Placez une trémie qui relie cet étage au tableau de l’autre niveau, depuis l’onglet Ouvertures.' });
    }
    if (panels.length > 1) addAlert('Plusieurs tableaux : seul le premier est alimenté.', { tab: 'appareillage', hint: 'Gardez un seul tableau : supprimez les autres depuis l’onglet Appareillages.' });
    computeOutletGangs().overflowGroups.forEach(g => {
        const what = g.fam === 'switch' ? 'interrupteurs' : 'prises';
        const one = g.extra === 1;
        addAlert('Groupe trop grand : ' + g.count + ' ' + what + ' (maximum ' + g.cap + ') : ' + (one ? 'retirez 1 ' + (g.fam === 'switch' ? 'interrupteur' : 'prise') + ' du groupe' : 'retirez ' + g.extra + ' ' + what + ' du groupe') + ' (en rouge).', { tab: 'appareillage', elId: g.firstExtra, hint: 'Les appareils en trop sont en rouge : retirez-les ou éloignez-les depuis l’onglet Appareillages.' });
    });
    computeStairOpeningCollisions().forEach(c => addAlert('Escalier sur une fenêtre ou une porte : les deux sont en rouge, déplacez l’un des deux.', { tab: 'ouvertures', elId: c.stair.id, hint: 'Déplacez l’escalier hors de l’ouverture, ou déplacez l’ouverture, depuis l’onglet Ouvertures.' + (String(c.opening.type).startsWith('window') ? ' Pour une fenêtre, remontez aussi son allège (Espace sol-fenêtre) au-dessus des marches.' : '') }));
    computeWindowZoneCollisions().forEach(c => addAlert('Escalier dans le débattement d’une fenêtre ouverte : les deux sont en rouge, déplacez l’un des deux.', { tab: 'ouvertures', elId: c.other, hint: 'Déplacez l’escalier hors de l’emprise des ventaux, ou changez le côté d’ouverture de la fenêtre avec le bouton Côté de l’inspecteur.' }));
    // le réseau câblé est calculé pour l'étage affiché : ses alertes portent son nom
    // une alerte par étage non relié : elle désigne le circuit le plus touché de cet étage, qui signale son problème sur sa carte
    const levelIds = (projectData.levels || []).map(l => l.id);
    const netsByLevel = levelIds.length ? nets.map((n, i) => ({ levelId: levelIds[i], net: n })) : [{ levelId: activeLevelId, net }];
    netsByLevel.forEach(({ levelId, net: n }) => {
        if (!(n.unrouted > 0)) return;
        const worst = Object.entries(n.unroutedBy || {}).filter(([k, v]) => k !== '_none' && v > 0).sort((a, b) => b[1] - a[1])[0];
        const target = worst
            ? { tab: 'circuits', levelId, circuitId: worst[0], hint: unroutedHintFor(projectData.circuits.find(c => c.id === worst[0])) }
            : { tab: 'appareillage', levelId, hint: unroutedHintFor(null) };
        addAlert(levelPrefix(levelId) + n.unrouted + ' liaison(s) de câble non reliée(s) au tableau, sans chemin possible.', target);
    });
    (net.warnings || []).forEach(w => {
        if (w.startsWith('Câble qui traverse un escalier')) {
            // un tronçon par appareil responsable ; à défaut, l'escalier lui-même
            const culprits = (net.stairCulprits || []).map(id => projectData.electrical.find(e => e.id === id)).filter(Boolean);
            if (culprits.length) {
                culprits.forEach(el => addAlert(levelPrefix(activeLevelId) + alertNameOf(el) + ' : son câble traverse un escalier, à déplacer.', { tab: 'appareillage', elId: el.id, hint: 'Déplacez ' + alertNameOf(el) + ' hors de l’escalier (glisser, ou flèches ← →) : le tronçon en rouge sur le plan doit disparaître.' }));
            } else {
                addAlert(levelPrefix(activeLevelId) + w, { tab: 'ouvertures', elId: (net.stairHitIds || [])[0] || null, hint: 'Déplacez l’escalier, ou réorientez-le, depuis l’onglet Ouvertures : le tronçon en rouge doit disparaître.' });
            }
            return;
        }
        const id = (net.warnTarget || {})[w] || null;
        addAlert(levelPrefix(activeLevelId) + w, { tab: routingTabFor(w), elId: id, hint: routingHintFor(w) });
    });
    // commandes et charges comptées sur tout le projet : une liaison peut relier deux niveaux
    const nSw = projectData.electrical.filter(isLightingControl).length;
    const nVaEtVient = projectData.electrical.filter(el => el.type === 'switch_va_et_vient').length;
    const nLi = projectData.electrical.filter(el => LIGHT_TYPES.includes(el.type)).length;
    const nOutSw = projectData.electrical.filter(el => el.type === 'outlet_switched').length;
    const countType = t => projectData.electrical.filter(el => el.type === t).length;
    if (nSw > 0 && nLi + nOutSw === 0) addAlert('Interrupteur(s) sans luminaire à commander.', { tab: 'appareillage', redTools: ['light_ceiling', 'wall_light', 'outlet_switched'], hint: 'Ajoutez un plafonnier, une applique ou une prise commandée depuis l’onglet Appareillages.' });
    if (nLi > 0 && nSw === 0) {
        // 132 : nom et circuit de chaque luminaire dans l'alerte
        const lamps = projectData.electrical.filter(el => LIGHT_TYPES.includes(el.type)).map(el => alertNameOf(el));
        addAlert('Luminaire(s) sans interrupteur de commande : ' + lamps.join(', ') + '.', { tab: 'appareillage', redTools: controlTypesFor('light_ceiling'), hint: 'Ajoutez un interrupteur depuis l’onglet Appareillages.' });
    }
    // chaque charge commandée (prise commandée, luminaire, moteur de volet, sonnerie) doit être reliée à une commande :
    // liaison manuelle (tout le projet, y compris entre étages) ou automatique (étage affiché)
    const NOUNS = {
        outlet_switched: { link: 'un interrupteur de commande', none: 'pas d’interrupteur de commande à cet étage' },
        shutter_motor: { link: 'une commande de volet', none: 'pas de commande de volet à cet étage' },
        doorbell_chime: { link: 'un bouton de sonnette', none: 'pas de bouton de sonnette à cet étage' }
    };
    const nounOf = t => NOUNS[t] || { link: 'un interrupteur de commande', none: 'pas d’interrupteur de commande à cet étage' };
    const compatibleControls = load => projectData.electrical.filter(sw => isControl(sw) && canControl(sw, load));
    const linkedLoad = load => compatibleControls(load).some(sw => Array.isArray(sw.controlledLightIds) && sw.controlledLightIds.includes(load.id)) ||
        (net.controlLinks || []).some(link => link.lightIds.includes(load.id));
    electricalOn().filter(el => CONTROLLED_LOAD_TYPES.includes(el.type)).forEach(el => {
        if (linkedLoad(el)) return;
        const anywhere = compatibleControls(el);
        // un luminaire, une sonnerie ou un moteur sans aucune commande dans le projet est déjà signalé plus bas
        if (!anywhere.length && (LIGHT_TYPES.includes(el.type) || el.type === 'doorbell_chime' || el.type === 'shutter_motor')) return;
        const here = electricalOn().some(sw => isControl(sw) && canControl(sw, el));
        const name = levelPrefix(el.levelId) + alertNameOf(el);
        if (!here && anywhere.length) {
            addAlert(name + ' : ' + nounOf(el.type).none + '.', { tab: 'appareillage', elId: el.id, redTools: controlTypesFor(el.type), assocElId: el.id, hint: 'Ajoutez une commande à cet étage, ou reliez à la main une commande d’un autre niveau depuis la sidebar gauche (Modifier les associations).' });
        } else {
            addAlert(name + ' non reliée à ' + nounOf(el.type).link + '.', { tab: 'appareillage', elId: el.id, redTools: controlTypesFor(el.type), assocElId: el.id, hint: 'Ajoutez une commande à cet étage, ou reliez-la à la main depuis la sidebar gauche (Modifier les associations).' });
        }
    });
    // une commande sans charge commandable : à cet étage, ou dans le projet
    const loadsOfControl = sw => projectData.electrical.filter(el => CONTROLLED_LOAD_TYPES.includes(el.type) && canControl(sw, el));
    electricalOn().filter(isControl).forEach(sw => {
        const linked = (Array.isArray(sw.controlledLightIds) && sw.controlledLightIds.length > 0) ||
            (net.controlLinks || []).some(link => link.switchId === (sw.realId || sw.id) && link.lightIds.length > 0);
        if (linked) return;
        const everywhere = loadsOfControl(sw);
        if (!everywhere.length) return;   // aucune charge compatible dans le projet : signalé par les alertes générales
        const here = electricalOn().filter(el => CONTROLLED_LOAD_TYPES.includes(el.type) && canControl(sw, el));
        const swName = levelPrefix(sw.levelId) + alertNameOf(sw);
        if (here.length) {
            // des charges existent à cet étage (déjà commandées par d'autres interrupteurs) : relier, ou en ajouter une
            addAlert(swName + ' : ne commande rien.', { tab: 'appareillage', elId: sw.id, redTools: CONTROL_LOADS[sw.type] || [], assocElId: sw.id, hint: 'Reliez-le à une lumière existante à cet étage (bloc « Modifier les associations » de la barre gauche), ou ajoutez une lumière depuis l’onglet Appareillages.' });
        } else {
            addAlert(swName + ' : pas de charge commandable à cet étage.', { tab: 'appareillage', elId: sw.id, redTools: CONTROL_LOADS[sw.type] || [], assocElId: sw.id, hint: 'Ajoutez la charge à cet étage, ou reliez à la main cette commande à une charge d’un autre niveau depuis la sidebar gauche (Modifier les associations).' });
        }
    });
    if (countType('doorbell_button') > 0 && countType('doorbell_chime') === 0) addAlert('Bouton de sonnette sans sonnerie.', { tab: 'appareillage', redTools: ['doorbell_chime'], hint: 'Ajoutez une sonnerie depuis l’onglet Appareillages.' });
    if (countType('doorbell_chime') > 0 && countType('doorbell_button') === 0) addAlert('Sonnerie sans bouton de sonnette.', { tab: 'appareillage', redTools: ['doorbell_button'], hint: 'Ajoutez un bouton de sonnette depuis l’onglet Appareillages.' });
    if (countType('shutter_control') > 0 && countType('shutter_motor') === 0) addAlert('Commande de volet sans moteur.', { tab: 'appareillage', redTools: ['shutter_motor'], hint: 'Ajoutez un moteur de volet roulant depuis l’onglet Appareillages.' });
    if (countType('shutter_motor') > 0 && countType('shutter_control') === 0) addAlert('Moteur de volet sans commande.', { tab: 'appareillage', redTools: ['shutter_control'], hint: 'Ajoutez une commande de volet roulant depuis l’onglet Appareillages.' });
    if (nVaEtVient % 2 !== 0) addAlert('Nombre impair d’interrupteurs va-et-vient : associez-les par deux pour commander chaque éclairage.', { tab: 'appareillage', redTools: ['switch_va_et_vient'], hint: 'Ajoutez ou retirez un interrupteur va-et-vient, depuis l’onglet Appareillages, pour en avoir un nombre pair.' });
    rows.forEach(r => r.warnings.forEach(w => addAlert(r.circuit.name + ' : ' + w, { tab: 'circuits', circuitId: r.circuit.id, hint: circuitWarningHint(w) })));
    computeOpeningCollisions().forEach(({ el, isDoor, box, dist, z }) => {
        // 139 : l'encombrement de l'appareil compte pour sortir de l'emprise
        const eb = deviceBox(el);
        // cm à parcourir le long du mur pour sortir de la largeur ; cm à monter ou descendre pour sortir de la hauteur
        const lateral = Math.max(0, box.half + eb.r + 5 - Math.abs(dist - box.d));
        const down = z + eb.h - (box.z0 - 5), up = (box.z1 + 5) - z + eb.h;
        const opts = [];
        if (lateral > 0) opts.push('décalez-le de ' + Math.ceil(lateral) + ' cm le long du mur (← →)');
        if (!isDoor) { opts.push('descendez-le de ' + Math.ceil(down) + ' cm, sous l’allège (↓)'); opts.push('montez-le de ' + Math.ceil(up) + ' cm, au-dessus du linteau (↑)'); }
        addAlert(levelPrefix(el.levelId) + alertNameOf(el) + ' placé(e) dans ' + (isDoor ? 'une porte' : 'une fenêtre') + ' : à déplacer', { tab: 'appareillage', elId: el.id, hint: 'Sélectionnez-le, puis ' + (opts.join(' ; ') || 'déplacez-le hors de l’ouverture') + '.' });
    });
    computeOpeningOverlaps().forEach(({ a, b }) => {
        const nm = o => o.type === 'door_single' ? 'porte' : 'fenêtre';
        const where = a.wallId === b.wallId ? ' sur le même mur' : ' au coin de deux murs';
        addAlert(levelPrefix(a.levelId) + nm(a)[0].toUpperCase() + nm(a).slice(1) + ' chevauche une ' + nm(b) + where + ' : à déplacer', { tab: 'ouvertures', elId: a.id, hint: 'Sélectionnez l’une des deux et déplacez-la le long du mur, ou réduisez sa largeur.' });
    });
    
        computeWallOpeningClashes().forEach(({ wall, opening }) => {
        const nm = opening.type === 'door_single' ? 'porte' : 'fenêtre';
        addAlert(levelPrefix(opening.levelId) + 'Mur qui traverse une ' + nm + ' posée sur un autre mur : à déplacer',
            { tab: 'ouvertures', elId: opening.id, hint: 'Sélectionnez la ' + nm + ' et déplacez-la le long de son mur, ou déplacez le mur qui la traverse depuis la 3D.' });
    });
    
    // emprise au sol d'une porte touchée par un élément : même détection que le clignotement rouge, une entrée par porte
    const doorZoneSeen = new Set();
    computeDoorZoneCollisions().forEach(({ door }) => {
        if (doorZoneSeen.has(door)) return;
        doorZoneSeen.add(door);
        const d = (projectData.openings || []).find(o => o.id === door);
        if (!d) return;
        addAlert(levelPrefix(d.levelId) + 'Porte : un élément touche son emprise au sol : à déplacer', { tab: 'ouvertures', elId: d.id, hint: 'Le carré au sol de la porte et l’élément qui le touche clignotent en rouge : déplacez l’un des deux.' });
    });
    computeCeilingOnWallHits().forEach(el => {
        addAlert(levelPrefix(el.levelId) + electricalDisplayName(el) + ' est posé au-dessus d’un mur : à déplacer', { tab: 'appareillage', elId: el.id, hint: 'Sélectionnez-le et déplacez-le au plafond, au milieu d’une pièce.' });
    });
    computeDeviceOverlaps().forEach(({ a, b }) => {
        addAlert(levelPrefix(a.levelId) + alertNameOf(a) + ' chevauche ' + alertNameOf(b) + ' : à déplacer', { tab: 'appareillage', elId: a.id, hint: 'Sélectionnez-le et déplacez-le pour qu’il ne chevauche plus ' + alertNameOf(b) + '.' });
    });
    // une trémie qui chevauche plusieurs murs d'un même étage (au coin, par exemple) = un seul avertissement ;
    // un mur par étage = un avertissement par étage, préfixé par l'étage du mur
    const shaftWallSeen = new Set();
    computeShaftCollisions().forEach(({ shaft, other, kind }) => {
        if (kind === 'mur') { const key = shaft.id + '|' + other.levelId; if (shaftWallSeen.has(key)) return; shaftWallSeen.add(key); }
        const wallLevel = kind === 'mur' ? other.levelId : shaft.levelId;
        const otherName = kind === 'appareil' ? electricalDisplayName(other) : kind === 'trémie' ? 'une autre trémie' : kind === 'mur' ? 'un mur' : (other.type === 'door_single' ? 'une porte' : 'une fenêtre');
        addAlert(levelPrefix(wallLevel) + shaftTitle(shaft.id) + ' chevauche ' + otherName + ' : à déplacer', { tab: 'ouvertures', elId: shaft.id, hint: 'Déplacez la trémie depuis l’onglet Ouvertures pour la dégager de l’élément qui la chevauche.' });
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
                if (gangs.tally[t][n]) countLines.push({ type: t, gang: n, label: gangLabel(t, n), count: gangs.tally[t][n] });
            });
        } else {
            countLines.push({ type: t, gang: 0, label: ELEMENT_LABELS[t] || t, count: counts[t] });
        }
    });
    return { rows, alerts, alertTargets, infos, sections, conduitM, counts, countLines };
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
// Cheminement des câbles d'un circuit : auto (défaut) ou faux plafond / sous plancher (lignes droites dans la cavité)
const CABLE_ROUTING = {
    auto: { label: 'Auto', title: 'auto', icon: 'fa-shuffle', color: 'border-sky-400/50 bg-sky-400/15 text-sky-200',
        help: 'Murs bas ou haut, au plus court selon portes et fenêtres. Si des pièces ou murs ne se rejoignent pas, l’app propose faux plafond ou sous plancher.' },
    air: { label: 'Faux plafond / Sous plancher', title: 'faux plafond ou sous plancher', icon: 'fa-layer-group', color: 'border-violet-400/50 bg-violet-400/15 text-violet-200',
        help: 'Lignes droites dans le faux plafond (10 cm au-dessus du plafond) ou sous le sol (10 cm sous le sol), sans suivre les murs.' }
};
// anciennes valeurs enregistrées : murs, mixte, plafond et murs haut deviennent auto ; faux plafond devient air
const CABLE_ROUTING_LEGACY = { murs: 'auto', mixte: 'auto', plafond: 'auto', murs_haut: 'auto', faux_plafond: 'air' };
const cableRoutingOf = c => {
    const v = CABLE_ROUTING_LEGACY[c.cableRouting] || c.cableRouting;
    return CABLE_ROUTING[v] ? v : 'auto';
};
const nextCableRouting = mode => ({ auto: 'air', air: 'auto' })[mode];
// Choix du cheminement : Auto, faux plafond ou sous plancher (cycle à trois étapes)
const CABLE_CHOICES = ['auto', 'faux_plafond', 'sous_plancher'];
const CABLE_CHOICE = {
    auto: { label: 'Auto', title: 'auto', icon: 'fa-shuffle', color: CABLE_ROUTING.auto.color },
    faux_plafond: { label: 'Faux plafond', title: 'faux plafond', icon: 'fa-layer-group', color: CABLE_ROUTING.air.color },
    sous_plancher: { label: 'Sous plancher', title: 'sous plancher', icon: 'fa-layer-group', color: 'border-teal-400/50 bg-teal-400/15 text-teal-200' }
};
// choix affiché : Auto, ou la cavité du circuit quand il n'est pas en Auto
const cableChoiceOf = c => cableRoutingOf(c) === 'auto' ? 'auto' : (c.cavity === 'sous_plancher' ? 'sous_plancher' : 'faux_plafond');
const nextCableChoice = ch => CABLE_CHOICES[(CABLE_CHOICES.indexOf(ch) + 1) % CABLE_CHOICES.length];
// cavité choisie par circuit (alerte) : faux plafond par défaut, sous plancher si choisi
const CABLE_CAVITIES = { faux_plafond: 'faux plafond', sous_plancher: 'sous plancher' };
const cavityLabelOf = c => c.cavity === 'sous_plancher' ? CABLE_CAVITIES.sous_plancher : CABLE_CAVITIES.faux_plafond;
const CABLE_CAVITY_BUTTONS = { faux_plafond: 'Faux plafond', sous_plancher: 'Sous plancher' };

// message sous le choix « faux plafond / sous plancher » : propose de choisir l’un des deux espaces
const CABLE_CAVITY_INTRO = 'Le câble peut passer dans deux espaces : le faux plafond (au-dessus du plafond) ou le sous plancher (sous le sol). Choisissez-en un.';
// phrase d’explication affichée sous la cavité sélectionnée
const CABLE_CAVITY_HELP = {
    faux_plafond: 'Le câble court en lignes droites dans le faux plafond, à 10 cm au-dessus du plafond.',
    sous_plancher: 'Le câble court en lignes droites sous le sol, à 10 cm sous le plancher.'
};

function cableRoutingHtml(cid, routing, cavity) {
    const choice = routing === 'auto' ? 'auto' : (cavity === 'sous_plancher' ? 'sous_plancher' : 'faux_plafond');
    const opts = CABLE_CHOICES.map(k => {
        const o = CABLE_CHOICE[k];
        const on = k === choice;
        return '<button type="button" onclick="event.stopPropagation();setCircuitChoice(\'' + esc(cid) + '\',\'' + k + '\')" aria-pressed="' + (on ? 'true' : 'false') +
            '" class="flex-1 px-1.5 py-1 rounded-md border text-[10px] ' + (on ? o.color : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800') +
            '"><i class="fa-solid ' + o.icon + ' mr-1"></i>' + o.label + '</button>';
    }).join('');
    let detail;
    if (choice === 'auto') {
        detail = '<div class="text-[10px] text-slate-500 mt-1">' + esc(CABLE_ROUTING.auto.help) + '</div>';
    } else {
        detail = '<div class="text-[10px] text-slate-500 mt-1">' + esc(CABLE_CAVITY_INTRO) + '</div>' +
            '<div class="text-[10px] text-slate-500 mt-1">' + esc(CABLE_CAVITY_HELP[choice]) + '</div>';
    }
    // réglage manuel par tronçon : bouton sous la rangée, actif seulement pour le circuit sélectionné
    const manualOn = cableManualId === cid && selectedCircuitId === cid;
    const manual = '<button type="button" onclick="event.stopPropagation();toggleCableManual(\'' + esc(cid) + '\')" aria-pressed="' + (manualOn ? 'true' : 'false') +
        '" class="mt-2 w-full px-1.5 py-1 rounded-md border text-[10px] ' + (manualOn ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800') +
        '"><i class="fa-solid fa-sliders mr-1"></i>Réglage manuel par tronçon</button>' +
        '<div class="text-[10px] text-slate-500 mt-1">' + (manualOn ? 'Actif : cliquez un tronçon de ce circuit dans le plan pour le régler.' : 'Règle chaque tronçon du câble à la main (murs bas, murs haut, faux plafond, sous plancher), dans le plan.') + '</div>';
    return '<div class="mt-2"><div class="text-[10px] text-slate-400 mb-1">Cheminement des câbles</div><div class="flex gap-1">' + opts + '</div>' +
        manual + detail + cableCutsSummaryHtml(cid) + '</div>';
}

// réglage manuel par tronçon : le circuit choisi a ses tronçons cliquables dans le plan
function toggleCableManual(cid) {
    const on = !(cableManualId === cid && selectedCircuitId === cid);
    cableManualId = on ? cid : null;
    if (on) selectedCircuitId = cid;
    selectedCableKey = null;
    syncCableCutInspector();
    updateCircuitsUI();
    build3DScene();   // reconstruit la 3D : sans cela, les tronçons ne sont cliquables qu'après une resélection
    redraw2D();
}

// Nombre de tronçons réglés sur ce circuit, avec un bouton pour tout remettre en automatique
function cableCutsSummaryHtml(cid) {
    const c = projectData.circuits.find(x => x.id === cid);
    const n = c && c.cableCuts ? Object.keys(c.cableCuts).length : 0;
    if (!n) return '';
    return '<div class="mt-2 flex items-center justify-between text-[10px] text-slate-400"><span>' + n + ' tronçon(s) réglé(s)</span>' +
        '<button type="button" onclick="event.stopPropagation();resetCircuitCuts(\'' + esc(cid) + '\')" class="px-2 py-0.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300">Tout réinitialiser</button></div>';
}

function resetCircuitCuts(cid) {
    unstickDrags();
    FROZEN_LINKS.delete(cid); SECTION_PINS.delete(cid); SECTION_MANUAL_SEEN.delete(cid); _cableCache.sig = null;
    const c = projectData.circuits.find(x => x.id === cid);
    if (!c || !c.cableCuts) return;
    saveStateToUndo();
    c.cableCuts = {};
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
    syncCableCutInspector();
}

// Entoure dans les barres latérales ce qu'il faut modifier pour une alerte
// ambre : onglet, carte du circuit, bouton de cheminement ; rouge : boutons de pose à utiliser, association d'un appareil
// contour (outline) : se superpose au liseré jaune des boutons actifs sans le masquer
const ALERT_RING_AMBER = ['outline', 'outline-2', 'outline-offset-2', 'outline-amber-300'];
const ALERT_RING_RED = ['outline', 'outline-2', 'outline-offset-2', 'outline-rose-500'];
// appareil dont le bloc d'association (barre gauche) est entouré en rouge
let alertRingAssocId = null;
function alertTargetElements(t) {
    if (!t) return [];
    const out = [];
    if (t.tab) document.querySelectorAll('.right-tabs [data-right-tab="' + t.tab + '"]').forEach(b => out.push(b));
    if (t.circuitId) {
        const card = '[data-circuit-card="' + t.circuitId + '"]';
        document.querySelectorAll(card).forEach(b => out.push(b));
        document.querySelectorAll(card + ' [data-routing-btn]').forEach(b => out.push(b));
    }
    // boutons de pose à utiliser dans Appareillages (2D et 3D)
    (t.redTools || []).forEach(type => document.querySelectorAll('.place-btn[data-type="' + type + '"]').forEach(b => out.push(b)));
    return out;
}

// Entoure le bloc « Commandes d’éclairage calculées » de l'appareil de l'alerte, quand il est sélectionné
function syncAssocRing() {
    ['lighting-associations', 'lighting-associations-2d'].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.classList.remove(...ALERT_RING_RED);
        if (alertRingAssocId && !box.classList.contains('hidden') && box.dataset.assocFor === alertRingAssocId) box.classList.add(...ALERT_RING_RED);
    });
}

// Entoure les cibles de l'alerte survolée (ou de la première par défaut)
function markAlertTargets(index) {
    const t = lastAlertTargets[index];
    const cls = t && (t.redTools || t.assocElId) ? ALERT_RING_RED : ALERT_RING_AMBER;
    document.querySelectorAll('.alert-target-ring').forEach(el => el.classList.remove('alert-target-ring', ...ALERT_RING_AMBER, ...ALERT_RING_RED));
    alertRingAssocId = t && t.assocElId ? t.assocElId : null;
    alertTargetElements(t).forEach(el => el.classList.add('alert-target-ring', ...cls));
    syncAssocRing();
}

// 152 : blocs de la barre des circuits : un bloc par niveau (repliable), puis un sous-bloc par type de circuit dans chaque niveau ouvert
const collapsedCircuitLevels = new Set();
function toggleCircuitLevel(title) {
    if (collapsedCircuitLevels.has(title)) collapsedCircuitLevels.delete(title); else collapsedCircuitLevels.add(title);
    updateCircuitsUI();
}

const CIRCUIT_TYPE_BLOCKS = [
    { title: 'Éclairages', ids: ['c_lighting'] },
    { title: 'Prises', ids: ['c_outlets', 'c_outlets20', 'c_kitchen'] },
    { title: 'Appareils dédiés', ids: ['c_dedicated20', 'c_dedicated32'] },
    { title: 'Autres (sonnerie, volets, DAAF)', ids: [] }   // repli : tout ce qui n'est pas listé ci-dessus
];

// Type d'un circuit : celui de sa racine (un circuit automatique suit le type du circuit d'origine)
function circuitTypeBlockOf(c) {
    const root = circuitRoot(c);
    const id = root ? root.id : c.id;
    return CIRCUIT_TYPE_BLOCKS.find(b => b.ids.includes(id)) || CIRCUIT_TYPE_BLOCKS[CIRCUIT_TYPE_BLOCKS.length - 1];
}
// Blocs affichés : pour chaque niveau, son titre (repliable) puis ses types de circuits si le niveau est ouvert
function circuitBlocksForList(rows) {
    const blocks = [];
    groupCircuitRowsByLevel(rows).forEach(level => {
        const collapsed = collapsedCircuitLevels.has(level.title);
        blocks.push({ kind: 'level', title: level.title, count: level.rows.length, collapsed, rows: [] });
        if (collapsed) return;
        CIRCUIT_TYPE_BLOCKS.forEach(t => {
            const sub = level.rows.filter(r => circuitTypeBlockOf(r.circuit) === t);
            if (sub.length) blocks.push({ kind: 'type', title: t.title, count: sub.length, rows: sub });
        });
    });
    return blocks;
}

// 161 : murs réglés faux plafond / sous plancher que le circuit ne peut pas relier : nommés dans la fiche du circuit
function blockedCutsHtml(c) {
    const list = (getCableNetwork().blockedCuts || {})[c.id] || [];
    return list.map(k => '<div class="mt-1 pl-4 text-[10px] text-rose-300 break-words"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' +
        esc(wallLabelOf(k, [k]) + ' réglé en ' + (c.cableCuts[k] === 'sp' ? 'sous plancher' : 'faux plafond') + ' : aucun chemin, il reste non relié.') + '</div>').join('');
}

// 238 : un circuit dédié affiche l'usage choisi pour sa prise (lave-linge, four...) au lieu de son nom générique
function circuitListName(c) {
    const d = projectData.electrical.find(el => isDedicatedOutlet(el) && el.applianceKind && DEDICATED_APPLIANCE_LABELS[el.applianceKind] && (circuitOf(el) || {}).id === c.id);
    return d ? DEDICATED_APPLIANCE_LABELS[d.applianceKind] + ' (' + c.breakerRating + ' A)' : c.name;
}

function updateCircuitsUI() {
    // la liste existe en 3D (barre gauche) et en 2D (barre droite) : les deux sont remplies
    const lists = ['circuits-list', 'circuits-list-2d'].map(id => document.getElementById(id)).filter(Boolean);
    if (!lists.length) return;
    const rep = computeCircuitReport();
    lists.forEach(list => {
    list.innerHTML = '';
    list.appendChild(onDemandCircuitBar());
    // circuits non utilisés (aucun appareil, par exemple un 32 A sans prise dédiée 32 A) : absents de la liste
    circuitBlocksForList(rep.rows.filter(r => r.points > 0)).forEach(group => {
    const header = document.createElement('div');
    if (group.kind === 'level') {
        // 152 : titre de niveau repliable (clic pour ouvrir ou fermer)
        header.className = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400 pt-3 pb-0.5 flex items-center gap-1.5 cursor-pointer select-none';
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true');
        header.innerHTML = '<i class="fa-solid ' + (group.collapsed ? 'fa-chevron-right' : 'fa-chevron-down') + ' w-3 text-center"></i><i class="fa-solid fa-layer-group"></i><span>' + esc(group.title) + '</span><span class="font-normal normal-case text-slate-500">(' + group.count + ')</span>';
        header.addEventListener('click', () => toggleCircuitLevel(group.title));
    } else {
        // 152 : sous-titre de type, à l'intérieur du niveau
        header.className = 'text-[10px] font-medium tracking-wide text-slate-500 pl-4 pt-1.5 pb-0.5 flex items-center gap-1.5';
        header.innerHTML = '<span>' + esc(group.title) + '</span><span class="font-normal text-slate-600">(' + group.count + ')</span>';
    }
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
        div.setAttribute('data-circuit-card', c.id);
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
        const choice = cableChoiceOf(c);
        const rout = CABLE_CHOICE[choice];
        const unroutedHere = r.unrouted || 0;
        const hasWarn = r.warnings.length > 0;
        const summary = [c.breakerRating + ' A', c.wireSection + ' mm²',
            r.cableM > 0 ? r.cableM.toFixed(1) + ' m' : '',
            r.cableM > 0 ? 'ΔU ' + r.drop.toFixed(1) + ' %' : '',
            routing !== 'auto' ? 'câble ' + cavityLabelOf(c) : ''].filter(Boolean).join(' · ');
        const multiLevel = levelNames.length > 1 ? ' · ' + levelNames.join(' · ') : '';
        const nextRouting = CABLE_CHOICE[nextCableChoice(choice)];
        // 179 : nombre de tronçons réglés à la main sur ce circuit
        const nCuts = c.cableCuts ? Object.keys(c.cableCuts).length : 0;
        div.innerHTML =
            '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + esc(circuitColor(c)) + '"></span>' +
            '<span class="font-semibold text-slate-200 min-w-0 flex-1 break-words">' + esc(circuitListName(c)) + '</span>' +
            // 153 : poubelle juste après le nom, sur la ligne des icônes (circuit sélectionné seulement, comme avant)
            (selected && list.closest('#sidebar-2d-right, #sidebar-3d-right')
                ? '<button type="button" onclick="event.stopPropagation();deleteCircuit(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md border border-rose-500/60 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-[11px]" title="Supprimer ce circuit" aria-label="Supprimer ce circuit"><i class="fa-solid fa-trash"></i></button>'
                : '') +
            (c.auto ? '<i class="fa-solid fa-wand-magic-sparkles text-[10px] text-sky-300 shrink-0" title="Circuit créé automatiquement : suite du circuit d’origine"></i>' : '') +
            '<span class="text-[11px] text-slate-400 shrink-0">' + r.points + '/' + c.maxPoints + '</span>' +

            (hasWarn ? '<i class="fa-solid fa-triangle-exclamation text-rose-400 text-[11px] shrink-0" title="' + esc(r.warnings.join(' ; ')) + '"></i>' : '') +
            '<button onclick="event.stopPropagation();toggleWiringMode(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md border text-[11px] ' +
            (star ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-800 text-slate-200') +
            '" title="Câblage : ' + (star ? 'étoile (chaque appareil relié au tableau)' : 'chaîné (en guirlande)') + '. Cliquer pour changer"><i class="fa-solid ' + (star ? 'fa-sitemap' : 'fa-link') + '"></i></button>' +
            '<button data-routing-btn onclick="event.stopPropagation();toggleCircuitRouting(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md border text-[11px] ' + rout.color + '"' +
            (unroutedHere && routing === 'auto' ? ' data-alert-blink' : '') +
            ' title="Cheminement des câbles : ' + rout.title + '. Cliquer pour passer à : ' + nextRouting.title + '"><i class="fa-solid ' + rout.icon + '"></i></button>' +
            (nCuts ? '<i class="fa-solid fa-sliders text-[10px] text-emerald-300 shrink-0" title="' + nCuts + ' tronçon(s) réglé(s) à la main"></i>' : '') +
            '<button onclick="event.stopPropagation();toggleCircuitCard(\'' + esc(c.id) + '\')" class="w-6 h-6 shrink-0 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" aria-expanded="' + (open ? 'true' : 'false') + '"' + (hasWarn ? ' data-alert-blink' : '') + ' title="Réglages du circuit"><i class="fa-solid ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i></button>' +
            '</div>' +
            '<div class="mt-0.5 pl-4 text-[10px] text-slate-400 break-words">' + esc(summary + multiLevel) + '</div>' +
            (unroutedHere && routing === 'auto'
                ? '<div class="mt-1 pl-4 text-[10px] text-rose-300 break-words"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + unroutedHere +
                  ' liaison(s) non reliée(s) : ce circuit ne trouve pas de chemin automatique.</div>'
                : '') +
            blockedCutsHtml(c) +
            (open
                ? '<div class="grid gap-1.5 mt-2" style="grid-template-columns:repeat(auto-fit,minmax(84px,1fr))">' +
                  circuitCellHtml(c.id, 'breakerRating', 'Calibre', c.breakerRating + ' A') +
                  circuitCellHtml(c.id, 'wireSection', 'Section', c.wireSection + ' mm²') +
                  circuitCellHtml(c.id, 'maxPoints', 'Éléments', String(c.maxPoints)) +
                  '</div>' +
                  cableRoutingHtml(c.id, routing, c.cavity) +
                  r.warnings.map(w => '<div class="text-[10px] text-rose-300 mt-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(w) + '</div>' +
                      '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(w)) + '</div>').join('')
                : '');
        if (hasWarn || unroutedHere) div.setAttribute('data-alert-blink', '');
        list.appendChild(div);
    });
    });
    });

    lastAlertTargets = rep.alertTargets;
    alertBlinkIds = new Set(rep.alertTargets.filter(t => t && t.elId).map(t => t.elId));
    const alertsHtml = (rep.alerts.length
        ? '<div class="space-y-2">' + rep.alerts.map((a, i) => {
            const t = rep.alertTargets[i];
            const tabLabel = t ? (RIGHT_TABS.find(x => x[0] === t.tab) || [])[1] : '';
            const where = t && t.actions
                ? '<div class="ml-4 mt-1 flex gap-1.5">' + t.actions.map(x => '<button type="button" onclick="setCircuitCavity(\'' + esc(t.circuitId) + '\',\'' + x.cavity + '\')" class="px-2 py-0.5 rounded-md border-2 border-violet-400/60 bg-violet-400/15 hover:bg-violet-400/25 text-violet-200 text-[10px]">' + esc(x.label) + '</button>').join('') + '</div>'
                : t
                ? '<div class="ml-4 mt-0.5 flex items-start gap-2"><div class="flex-1 text-[10px] text-amber-200/90">Onglet « ' + esc(tabLabel) + ' » : ' + esc(t.hint) + '</div>' +
                  '<button type="button" onclick="goToAlert(' + i + ')" class="shrink-0 px-2 py-0.5 rounded-md border-2 border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">Aller ↗</button></div>'
                : '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(a)) + '</div>';
            return '<div data-alert-row onmouseenter="markAlertTargets(' + i + ')" onmouseleave="markAlertTargets(0)"><div class="text-[11px] text-amber-300"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(a) + '</div>' + where + '</div>';
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
    // la première alerte entoure sa cible dans les barres latérales
    markAlertTargets(0);

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
const BOM_DEVICE_ORDER = ['panel', 'light_ceiling', 'light_spot', 'wall_light', 'smoke_detector', 'switch_simple', 'switch_va_et_vient', 'switch_pushbutton', 'switch_dimmer', 'motion_timer', 'outlet_16a', 'outlet_20a', 'outlet_20a_classic', 'outlet_dedicated_20', 'outlet_dedicated_32', 'outlet_switched', 'doorbell_button', 'doorbell_chime', 'shutter_control', 'shutter_motor'];
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

// Onglet où se corrige un avertissement de câblage
function routingTabFor(w) {
    const t = String(w);
    // E1 : une lampe d'un autre circuit se corrige sur la lampe, dans l'onglet Appareillages
    if (t.startsWith('Commande de') && t.includes('autre circuit')) return 'appareillage';
    if (t.startsWith('Trémie') || t.startsWith('Pas de tableau') || t.startsWith('Commande de')) return 'ouvertures';
    return 'appareillage';
}

// Aide d'un avertissement de câblage : l'action à faire, pour cette cause
function routingHintFor(w) {
    const t = String(w);
    if (t.includes('aucun mur à cet étage')) return 'Déplacez la trémie près d’un mur accessible de cet étage, depuis l’onglet Ouvertures.';
    if (t.includes('ne peut pas la rejoindre')) return 'Déplacez la trémie pour qu’aucun mur ne la sépare du mur le plus proche, ou hors d’un mur, depuis l’onglet Ouvertures.';
    if (t.startsWith('Commande de') && t.includes('autre circuit')) return 'Sélectionnez la lampe et, dans son inspecteur, mettez son circuit sur celui de l’interrupteur (ou retirez la commande depuis « Modifier les associations »).';
    if (t.startsWith('Commande de')) return 'Ajoutez une trémie entre les deux niveaux, depuis l’onglet Ouvertures.';
    if (t.startsWith('Pas de tableau')) return 'Ajoutez une trémie entre cet étage et le tableau, ou placez le tableau à cet étage, depuis l’onglet Ouvertures.';
    if (t.startsWith('Aucune descente')) return 'Déplacez l’appareil légèrement sur le mur, ou essayez l’autre face.';
    return 'Vérifiez l’élément concerné par ce câblage sur le plan.';
}

// Aide d'une liaison non reliée : selon le mode de cheminement du circuit (cohérent avec la carte du circuit)
function unroutedHintFor(c) {
    if (!c) return 'Vérifiez les trémies et points de dérivation de cet étage, depuis l’onglet Appareillages.';
    if (cableRoutingOf(c) === 'auto') return 'Ce circuit ne trouve pas de chemin automatique.';
    return 'Aucun chemin, même dans le faux plafond ou sous plancher : ajoutez une trémie, ou déplacez l’appareil concerné.';
}

// Conseil précis pour un avertissement de circuit (ouvre les réglages du circuit)
function circuitWarningHint(w) {
    const t = String(w);
    const pts = t.match(/^(\d+) points pour (\d+)/);
    if (pts) return 'Réglages du circuit (⚙) : déplacez ' + (pts[1] - pts[2]) + ' point(s) vers un autre circuit, ou créez-en un.';
    const sec = t.match(/pour (\d+) A/);
    if (t.includes('section') && sec) return 'Réglages du circuit (⚙) : passez à ' + minSectionFor(Number(sec[1])) + ' mm² au minimum pour ' + sec[1] + ' A.';
    if (t.includes('chute')) return 'Réglages du circuit (⚙) : passez à une section supérieure, ou répartissez les éléments sur un second circuit.';
    return 'Réglages du circuit (⚙) : ajustez le calibre ou la section.';
}

// Ouvre l'onglet, sélectionne l'élément ou le circuit concerné par une alerte
let lastAlertTargets = [];
function goToAlert(i) {
    // l'anneau est remis après les changements de classe (onglet, outil actif)
    requestAnimationFrame(() => markAlertTargets(i));
    const t = lastAlertTargets[i];
    if (!t) return;
    if (t.levelId && t.levelId !== activeLevelId) setActiveLevel(t.levelId);
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
    // 124 : l'anneau est recalculé après l'ouverture de l'onglet (il disparaît au changement d'onglet)
    setTimeout(() => markAlertTargets(i), 0);
}

function solutionForWarning(message) {
    const text = String(message).toLowerCase();
    // G2 : pistes propres aux liaisons entre niveaux et aux trémies
    if (text.includes('ne peut pas la rejoindre') || text.includes('aucun mur à cet étage')) {
        return 'Déplacez la trémie pour qu’un mur de cet étage lui soit accessible, sans mur qui la sépare de ce mur. Elle peut rester au milieu d’une pièce.';
    }
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
        return 'Déplacez les points en trop vers un autre circuit, ou créez un circuit supplémentaire.';
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
    if (text.includes('à déplacer') && (text.includes('porte') || text.includes('fenêtre'))) {
        return 'Déplacez l’appareil hors de l’emprise de l’ouverture et vérifiez son implantation sur les plans 2D et 3D.';
    }
    return 'Vérifiez l’élément concerné sur le plan, puis ses réglages dans l’onglet correspondant.';
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
    a.download = (currentProjectFileName ? currentProjectFileName + '_metre' : 'clic_and_volt_pro_metre') + '.csv';   // 137
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotification('Métré exporté en CSV', 'success');
}

const CIRCUIT_STEPS = { breakerRating: [10, 16, 20, 32], wireSection: [1.5, 2.5, 6] };

// Mode de câblage du circuit : « chain » (chaîné, défaut) ou « star » (étoile)
function toggleWiringMode(id) {
    unstickDrags();
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    saveStateToUndo();
    c.wiringMode = c.wiringMode === 'star' ? 'chain' : 'star';
    // changement de câblage : le circuit est recalculé en entier (liaisons figées et hauteurs retenues oubliées)
    FROZEN_LINKS.delete(id); SECTION_PINS.delete(id);
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

// Cheminement des câbles du circuit : passe au mode suivant (auto → faux plafond / sous plancher → auto)
function toggleCircuitRouting(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (c) setCircuitChoice(id, nextCableChoice(cableChoiceOf(c)));
}

// Choix du cheminement d'un circuit : Auto, faux plafond ou sous plancher (une seule annulation, un seul recalcul)
function setCircuitChoice(id, choice) {
    unstickDrags();
    const c = projectData.circuits.find(x => x.id === id);
    if (!c || !CABLE_CHOICE[choice] || cableChoiceOf(c) === choice) return;
    saveStateToUndo();
    c.cableRouting = choice === 'auto' ? 'auto' : 'air';
    if (choice !== 'auto') c.cavity = choice;
    SECTION_PINS.delete(id); SECTION_MANUAL_SEEN.delete(id);
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

// Cheminement des câbles du circuit : « auto » (défaut) ou « faux plafond / sous plancher »
function setCircuitRouting(id, mode) {
    unstickDrags();
    const c = projectData.circuits.find(x => x.id === id);
    if (!c || !CABLE_ROUTING[mode] || cableRoutingOf(c) === mode) return;
    saveStateToUndo();
    c.cableRouting = mode;
    SECTION_PINS.delete(id); SECTION_MANUAL_SEEN.delete(id);
    // 123 : premier passage en faux plafond / sous plancher : faux plafond par défaut, sans question
    if (mode === 'air' && !c.cavity) c.cavity = 'faux_plafond';
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

// Cavité du circuit (faux plafond ou sous plancher), choisie depuis l'alerte de pontage
function setCircuitCavity(id, cavity) {
    unstickDrags();
    const c = projectData.circuits.find(x => x.id === id);
    if (!c || !CABLE_CAVITIES[cavity] || c.cavity === cavity) return;
    saveStateToUndo();
    c.cavity = cavity;
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    redraw2D();
}

// Réglage de cheminement d'un ou plusieurs tronçons pour un circuit : 'air' (faux plafond / sous plancher), 'auto', ou null (retire le réglage, le circuit reprend la main)
function setCableCut(cid, keys, mode) {
    unstickDrags();
    const c = projectData.circuits.find(x => x.id === cid);
    if (!c || !keys || !keys.length) return;
    // 167-168 : réglage impossible sur ce tronçon : refusé, avertissement 6 s
    if (mode === 'low' || mode === 'ceil' || mode === 'air' || mode === 'sp') {
        const levels = getCableNetwork().levelsFor(cid);
        const bad = keys.find(k => !(levels[k] && levels[k][mode]));
        if (bad) {
            const what = { low: 'murs bas', ceil: 'murs haut', air: 'faux plafond', sp: 'sous plancher' }[mode];
            const why = (mode === 'air' || mode === 'sp') ? 'escalier' : 'porte, fenêtre ou escalier';
            showNotification(wallLabelOf(bad, keys) + ' : ' + what + ' impossible ici (' + why + '), réglage non appliqué', 'info');
            return;
        }
    }
    saveStateToUndo();
    c.cableCuts = Object.assign({}, c.cableCuts);
    keys.forEach(k => { if (mode) c.cableCuts[k] = mode; else delete c.cableCuts[k]; });
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    // la fenêtre suit le mur réglé : le morceau de faux plafond peut disparaître après ce réglage
    selectedCableKey = keys[0];
    redraw2D();
    syncCableCutInspector();
}

// Inspecteur du tronçon de câble sélectionné en 2D : un bloc par circuit qui passe dessus
function cableCutBox() {
    let box = document.getElementById('cable-cut-inspector');
    if (!box) {
        box = document.createElement('div');
        box.id = 'cable-cut-inspector';
        box.className = 'hidden';
    }
    // dans la barre latérale du mode affiché : emplacement 3D en 3D, inspecteur 2D sinon
    const slot3d = document.getElementById('shared-inspector-slot-3d');
    const anchor = document.getElementById('el-inspector-2d');
    if (currentMode === '3d' && slot3d) {
        if (box.parentNode !== slot3d) slot3d.appendChild(box);
    } else if (anchor && anchor.parentNode && box.parentNode !== anchor.parentNode) {
        anchor.parentNode.insertBefore(box, anchor);
    }
    return box;
}

const CABLE_CUT_NATURE = { low: 'murs bas', ceil: 'murs haut', air: 'faux plafond', sp: 'sous-plancher', riser: 'montée', stub: 'raccord' };

// Fenêtre flottante près du clic : le tronçon et ses boutons, là où l'on clique
function cableCutPopover() {
    let pop = document.getElementById('cable-cut-popover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'cable-cut-popover';
        pop.className = 'hidden fixed z-50 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl';
        document.body.appendChild(pop);
        // fenêtre déplaçable : on la prend par son en-tête (« Déplacer »)
        let drag = null;
        pop.addEventListener('pointerdown', e => {
            if (!e.target.closest('[data-drag-handle]') || e.target.closest('button')) return;
            const r = pop.getBoundingClientRect();
            drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            pop.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        pop.addEventListener('pointermove', e => {
            if (!drag) return;
            pop.dataset.moved = '1';
            pop.style.left = Math.max(0, Math.min(e.clientX - drag.dx, window.innerWidth - 80)) + 'px';
            pop.style.top = Math.max(0, Math.min(e.clientY - drag.dy, window.innerHeight - 40)) + 'px';
        });
        pop.addEventListener('pointerup', () => { drag = null; });
        pop.addEventListener('pointercancel', () => { drag = null; });
    }
    return pop;
}

// Place la fenêtre près du clic, sans sortir de l'écran
function placeCablePopover(clientX, clientY) {
    const pop = cableCutPopover();
    // fenêtre déplacée à la main : elle reste où on l'a mise
    if (pop.dataset.moved === '1') return;
    const w = 288, h = pop.offsetHeight || 220;
    pop.style.left = Math.max(8, Math.min(clientX + 48, window.innerWidth - w - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(clientY + 32, window.innerHeight - h - 8)) + 'px';
}

function closeCablePopover() {
    selectedCableKey = null;
    syncCableCutInspector();
    redraw2D();
}

// Contenu de l'inspecteur d'un tronçon (même HTML dans la fenêtre et dans la colonne)
// 119 : un morceau de faux plafond ne se règle pas ici : on règle le mur qu'il survole
// nom lisible d'un tronçon de mur : numéro du mur, et rang du tronçon s'il y en a plusieurs sur ce mur
function wallLabelOf(k, keys) {
    const wid = k.split('|')[0];
    const n = wallsOn().findIndex(w => w.id === wid) + 1;
    const same = keys.filter(x => x.split('|')[0] === wid);
    return 'Mur ' + (n || '?') + (same.length > 1 ? ', tronçon ' + (same.indexOf(k) + 1) : '');
}

function cableCutHtml(hit, net) {
    const stubPiece = hit.kind === 'stub' && String(selectedCableKey).includes('|S:');
    const wall = hit.kind === 'low' || hit.kind === 'ceil' || hit.kind === 'wall';
    const cavityPiece = hit.kind === 'air' || hit.kind === 'sp';
    const same = net.segments.filter(s => cableSegKey(s, cableManualId) === selectedCableKey && s.kind === hit.kind);
    const len = Math.round(same.reduce((acc, s) => acc + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0));
    const all = net.segments.filter(s => cableSegKey(s, cableManualId) === selectedCableKey);
    const options = [[null, 'Auto'], ['low', 'Murs bas'], ['ceil', 'Murs haut'], ['air', 'Faux plafond'], ['sp', 'Sous plancher']];
    // un bloc de boutons pour un tronçon de mur, réglé pour le circuit en réglage manuel
    const row = (c, key, title, opts = options) => {
        const set = c.cableCuts ? c.cableCuts[key] : undefined;
        const state = set ? 'réglé ici' : 'réglage du circuit : ' + CABLE_CHOICE[cableChoiceOf(c)].label;
        const btn = (val, label, on) => '<button type="button" aria-pressed="' + (on ? 'true' : 'false') +
            '" onclick="event.stopPropagation();setCableCut(\'' + esc(c.id) + '\',[\'' + esc(key) + '\'],' + (val ? '\'' + val + '\'' : 'null') +
            ')" class="flex-1 px-1.5 py-1 rounded-md border text-[10px] ' + (on ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' :
            'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800') + '">' + label + '</button>';
        return '<div class="mt-2"><div class="text-[10px] text-slate-300 mb-1">' + esc(title) + ' · ' + state + '</div><div class="flex flex-wrap gap-1">' +
            opts.map(([val, label]) => btn(val, label, val === null ? set === undefined : set === val)).join('') + '</div></div>';
    };
    const mine = projectData.circuits.find(c => c.id === cableManualId);
    let rows = '', note;
    if (cavityPiece) {
        // morceau de faux plafond : un bloc par mur qu'il survole
        const keys = [...new Set(all.flatMap(s => (s.wallKeysBy && s.wallKeysBy[cableManualId]) || []))];
        note = hit.kind === 'sp' ? 'Morceau de sous plancher : chaque mur situé au-dessus se règle ici.' : 'Morceau de faux plafond : chaque mur qu’il survole se règle ici.';
        rows = mine && keys.length ? keys.map(k => row(mine, k, wallLabelOf(k, keys))).join('') : '';
    } else if (stubPiece) {
        note = 'Raccord du plafonnier : tronçon à part. « Faux plafond » le fait passer dans le vide au-dessus du mur.';
        rows = mine ? row(mine, selectedCableKey, 'Raccord', [[null, 'Auto'], ['air', 'Faux plafond']]) : '';
    } else if (wall) {
        note = 'Murs bas et hauts de ce tronçon ont le même réglage.';
        rows = mine ? row(mine, selectedCableKey, 'Tronçon de mur') : '';
    } else if (String(selectedCableKey).startsWith('sk:')) {
        // 230 : passage horizontal entre deux prises à même hauteur : réglable comme un tronçon (5 positions)
        note = 'Passage entre deux prises à même hauteur : il se règle ici.';
        rows = mine ? row(mine, selectedCableKey, 'Passage entre prises') : '';
    } else {
        note = 'Pas de réglage propre : ce tronçon suit le réglage de son circuit.';
    }
    return '<div class="p-3 rounded-lg border border-slate-700 bg-slate-900/60">' +
        '<div class="text-xs font-semibold text-slate-200">Tronçon de câble : ' + esc(String(selectedCableKey).startsWith('sk:') ? 'passage entre prises' : (CABLE_CUT_NATURE[hit.kind] || 'mur')) + (len ? ', ' + len + ' cm' : '') + '</div>' +
        '<div class="text-[10px] text-slate-500 mt-0.5">' + note + '</div>' +
        (rows || '<div class="text-[10px] text-slate-500 mt-1">Aucun réglage possible ici.</div>') + '</div>';
}

function syncCableCutInspector() {
    const box = cableCutBox();
    const pop = cableCutPopover();
    // tronçon réglable seulement pour le circuit en réglage manuel et sélectionné
    if (selectedCableKey && !(cableManualId && selectedCircuitId === cableManualId)) selectedCableKey = null;
    refreshCableSelFrame3D();   // le liseré 3D suit toujours le tronçon sélectionné
    const net = selectedCableKey && !selected3DId ? getCableNetwork() : null;
    let hit = net ? net.segments.find(s => cableSegKey(s, cableManualId) === selectedCableKey) : null;
    // mur réglé en faux plafond : il n'a plus de morceau de mur, mais la fenêtre reste ouverte
    if (!hit && net && selectedCableKey && projectData.circuits.some(c => c.id === cableManualId && c.cableCuts && c.cableCuts[selectedCableKey])) hit = { kind: 'wall', cutKey: selectedCableKey };
    box.classList.toggle('hidden', !hit);
    pop.classList.toggle('hidden', !hit);
    if (!hit) { box.innerHTML = ''; pop.innerHTML = ''; return; }
    const html = cableCutHtml(hit, net);
    box.innerHTML = html;
    pop.innerHTML = '<div data-drag-handle style="touch-action:none" class="flex justify-between items-center mb-1 cursor-move select-none"><span class="text-[10px] text-slate-500">⠿ Déplacer</span><button type="button" onclick="event.stopPropagation();closeCablePopover()" class="px-2 text-slate-400 hover:text-slate-200 text-xs">✕</button></div>' + html;
}

// Circuits fixes du projet : recréés au chargement, donc on garde l'entrée et on retire seulement appareils et suites
const FIXED_CIRCUIT_IDS = new Set(Object.values(DEFAULT_CIRCUIT_BY_TYPE));
// Suppression d'un circuit depuis la barre de droite : circuit, suites automatiques et appareils (annulable, Ctrl+Z)
async function deleteCircuit(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    ensureCircuitAssignment();
    const suites = c.auto ? [] : projectData.circuits.filter(x => x.auto && x.baseId === c.id);
    const removeCircuitIds = new Set([c.id, ...suites.map(s => s.id)]);
    const dropObjects = new Set([...suites.map(s => s.id), ...(FIXED_CIRCUIT_IDS.has(c.id) ? [] : [c.id])]);
    // charges du circuit (les commandes ne sont pas des charges de circuit)
    const dropEl = new Set(projectData.electrical.filter(el => {
        if (isControl(el)) return false;
        const cc = circuitOf(el);
        return cc && removeCircuitIds.has(cc.id);
    }).map(el => el.id));
    // interrupteurs dont toutes les charges partent avec le circuit : ils ne commandent plus rien
    const autoLinks = getCableNetwork().controlLinks || [];
    projectData.electrical.filter(sw => isControl(sw) && !sw.isProxy).forEach(sw => {
        const ids = Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : ((autoLinks.find(l => l.switchId === sw.id) || {}).lightIds || []);
        if (ids.length && ids.every(id => dropEl.has(id))) dropEl.add(sw.id);
    });
    const what = 'le circuit « ' + c.name + ' »' +
        (suites.length ? ' et ses ' + suites.length + ' suite(s) automatique(s)' : '') +
        (dropEl.size ? ' avec ' + (dropEl.size > 1 ? dropEl.size + ' appareils' : 'son appareil') : '');
    if (!(await confirmDeletion(what))) return;
    saveStateToUndo();
    projectData.electrical = projectData.electrical.filter(el => !dropEl.has(el.id) && !(el.isProxy && dropEl.has(el.realId)));
    // les commandes gardent leurs autres liaisons : seules les charges supprimées sont retirées de leur liste
    projectData.electrical.forEach(el => { if (Array.isArray(el.controlledLightIds)) el.controlledLightIds = el.controlledLightIds.filter(id => !dropEl.has(id)); });
    projectData.circuits = projectData.circuits.filter(x => !dropObjects.has(x.id));
    selectedDeviceIds = selectedDeviceIds.filter(i => !dropEl.has(i));
    if (selectedCircuitId === id) selectedCircuitId = null;
    expandedCircuitCards.delete(id);
    _cableCache.sig = null;
    syncElementInspectors();
    updateStats();
    refreshSelectedView();
    showNotification('Circuit supprimé', 'success');
}

// 134 : taille du plus grand bloc de lampes (commandées par un même interrupteur) posé sur ce circuit
function biggestCommandBlockOf(circuit) {
    const root = circuitRoot(circuit).id;
    const groupOf = commandGroupOf();
    const sizes = new Map();
    projectData.electrical.filter(isControlledLoad).forEach(light => {
        const c = circuitOf(light);
        const sid = groupOf.get(light.id);
        if (!c || !sid || circuitRoot(c).id !== root) return;
        sizes.set(sid, (sizes.get(sid) || 0) + 1);
    });
    return Math.max(0, ...sizes.values());
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
        // 134 : des lampes commandées par un même interrupteur restent ensemble : on ne descend pas sous leur nombre
        const block = dir < 0 ? biggestCommandBlockOf(c) : 0;
        if (block > next) {
            showNotification('« ' + c.name + ' » : ' + block + ' lampes commandées par le même interrupteur restent ensemble. Ajoutez un interrupteur pour répartir.', 'error');
            return;
        }
    } else {
        // éclairage : calibre 10 A ou 16 A ; section 1,5 ou 2,5 mm² (pas de 6 mm²)
        const steps = c.type === 'lighting' && field === 'breakerRating' ? [10, 16]
            : c.type === 'lighting' && field === 'wireSection' ? [1.5, 2.5]
            : CIRCUIT_STEPS[field];
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
    if (currentMode !== '3d') {
        // 2D : un second clic sur Tracer mur ou Texte revient à Sélectionner
        setTool(currentTool === tool && (tool === 'wall' || tool === 'text') ? 'select' : tool);
        return;
    }
    // 3D : setPlacementType bascule déjà (même type = désactivation)
    if (tool === 'wall' || tool === 'text') setPlacementType(tool);
    else if (activePlacementType) setPlacementType(activePlacementType);
    refreshToolButtons();
    refreshToolHint();   // patch 86 : la bulle suit le nouvel outil (plus de « 2 éléments » périmé)
}

// Surbrillance de l'outil actif, dans la sidebar commune
function refreshToolButtons(override) {
    const active = override || (currentMode === '3d' ? (activePlacementType === 'wall' ? 'wall' : activePlacementType === 'text' ? 'text' : 'select') : currentTool);
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
    return 'Mur ' + verb + ' : la trémie ne tombe plus sur un mur de ' + lost.join(', ') + ' (câbles coupés). Déplacez le mur ou la trémie, ou annulez.';
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
    if (b) b.classList.toggle('hidden', key !== 'place' && key !== 'text' && key !== 'wall');
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
    // 151 : circuits regroupés par niveau (celui où se trouve la majorité de leurs appareils), plus de liste plate de tous les niveaux
    const levels = (projectData.levels || []).slice().sort((a, b) => b.elevation - a.elevation);
    const mainLevelOf = circuitId => {
        const counts = new Map();
        projectData.electrical.forEach(e => {
            const cc = circuitOf(e);
            if (cc && cc.id === circuitId) counts.set(e.levelId, (counts.get(e.levelId) || 0) + 1);
        });
        let best = null, bestN = 0;
        counts.forEach((n, id) => { if (n > bestN) { best = id; bestN = n; } });
        return best;
    };
    const addOption = (parent, c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name + ' (' + c.breakerRating + 'A)';
        if (cur && cur.id === c.id) o.selected = true;
        parent.appendChild(o);
    };
    const byLevel = new Map(levels.map(l => [l.id, []]));
    const orphan = [];
    const roots = allowedCircuitRootsFor(el);
    const pool = projectData.circuits.filter(c => {
        if (!roots || (cur && cur.id === c.id)) return true;
        const r = circuitRoot(c);
        return !!r && roots.includes(r.id);
    });
    pool.forEach(c => {
        const id = mainLevelOf(c.id);
        if (id && byLevel.has(id)) byLevel.get(id).push(c); else orphan.push(c);
    });
    levels.forEach(l => {
        const list = byLevel.get(l.id);
        if (!list.length) return;
        const g = document.createElement('optgroup');
        g.label = l.name;
        list.forEach(c => addOption(g, c));
        sel.appendChild(g);
    });
    if (orphan.length) {
        const g = document.createElement('optgroup');
        g.label = 'Sans appareil';
        orphan.forEach(c => addOption(g, c));
        sel.appendChild(g);
    }
}

function electricalDisplayName(el) {
    const sameType = projectData.electrical.filter(candidate => candidate.type === el.type);
    const ordinal = sameType.findIndex(candidate => candidate.id === el.id) + 1;
    const base = (ELEMENT_LABELS[el.type] || el.type) + ' n°' + ordinal;
    return isDedicatedOutlet(el) ? base.replace(' n°', ' (' + DEDICATED_APPLIANCE_LABELS[dedicatedApplianceOf(el)] + ') n°') : base;
}

// Circuit électrique affiché pour un appareil : une commande suit la charge qu'elle commande (patch 110)
function displayCircuitOf(el) {
    if (!el) return null;
    if (el.type === 'junction_box') return boxCircuitOf(el);
    if (isControl(el)) {
        const link = (getCableNetwork().controlLinks || []).find(l => l.switchId === el.id && l.lightIds.length);
        const light = link ? projectData.electrical.find(e => e.id === link.lightIds[0]) : null;
        if (light) return circuitOf(light);
        if (el.type === 'shutter_control') return projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE.shutter_motor) || null;
        return null;
    }
    return circuitOf(el);
}

// Suffixe « (circuit …) » pour le titre de l'inspecteur (patch 110)
function circuitSuffixOf(el) {
    const c = displayCircuitOf(el);
    return c ? ' (' + c.name + ')' : '';
}

// 131 : nom d'un appareil dans une alerte, avec son circuit entre parenthèses
function alertNameOf(el) {
    return electricalDisplayName(el) + circuitSuffixOf(el);
}

// Survol du plan (2D et 3D) : une étiquette indique l'élément visé (nom, étage, circuit)
let planTooltipEl = null;
function planHoverInfo(id) {
    if (!id) return null;
    const levelName = lvId => ((projectData.levels || []).find(l => l.id === lvId) || {}).name;
    const el = projectData.electrical.find(e => e.id === id);
    if (el) {
        const c = displayCircuitOf(el);
        const parts = [levelName(el.levelId), c ? 'circuit ' + c.name : (isControl(el) ? 'pas de charge commandée' : '')];
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
        ['Ctrl+Shift+P', 'Ouvrir le panneau de propriétés'],
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

// Liste regroupée par étage : un titre par niveau, puis les appareils de ce niveau (ordre des niveaux du projet)
function groupByLevelHtml(items, renderItem) {
    const levels = projectData.levels || [];
    const known = new Set(levels.map(lv => lv.id));
    let html = '';
    levels.forEach(lv => {
        const group = items.filter(it => it.levelId === lv.id);
        if (!group.length) return;
        html += '<div class="pt-1 text-[11px] font-semibold text-slate-400">' + esc(lv.name) + '</div>';
        group.forEach(it => { html += renderItem(it); });
    });
    items.filter(it => !known.has(it.levelId)).forEach(it => { html += renderItem(it); });
    return html;
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
        esc(electricalDisplayName(item)) + levelSuffix(item) + esc(circuitSuffixOf(item)) + '</button>';   // 114 : circuit entre parenthèses
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

        // une case n'est cochée que si la liaison est réellement calculée (E1 : pas de liaison entre circuits)
        const configuredIds = lightIds;
        content += '<details class="pt-1"><summary class="cursor-pointer text-[11px] text-emerald-300">Modifier les associations</summary><div class="mt-1 space-y-1">';
        const compatibleLoads = [...lightById.values()].filter(light => canControl(el, light));
        if (!compatibleLoads.length) content += '<div class="text-[11px] text-slate-500">Ajoutez une charge compatible au plan (' + esc(compatibleLoadsHint(el)) + ').</div>';
        content += groupByLevelHtml(compatibleLoads, light =>
            '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
            esc(el.id) + '" data-association-light="' + esc(light.id) + '"' +
            (configuredIds.includes(light.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
            esc(electricalDisplayName(light) + circuitSuffixOf(light)) + '</label>');   // 113 : circuit entre parenthèses
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
        content += groupByLevelHtml(compatibleSwitches, sw => {
            const association = switches.get(sw.id);
            // une case n'est cochée que si la liaison est réellement calculée (E1 : pas de liaison entre circuits)
            const configuredIds = association ? association.lightIds : [];
            return '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
                esc(sw.id) + '" data-association-light="' + esc(el.id) + '"' +
                (configuredIds.includes(el.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
                esc(electricalDisplayName(sw) + circuitSuffixOf(sw)) + '</label>';   // 113 : circuit entre parenthèses
        });
        content += '</div></details>';
    }
    boxes.forEach(box => {
        // les volets « Modifier les associations » gardent leur état ouvert / fermé après la mise à jour
        const openStates = [...box.querySelectorAll('details')].map(d => d.open);
        box.innerHTML = content;
        box.querySelectorAll('details').forEach((d, i) => { if (openStates[i]) d.open = true; });
        box.classList.remove('hidden');
        box.dataset.assocFor = el.id;
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
    syncAssocRing();
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
    // 108 : une lampe d'un autre circuit que la commande est rattachée au circuit de la commande, si la place le permet
    let moveTo = null;
    const prevCircuitId = light.circuitId;
    if (isAssociated) {
        const linked = automaticLinks.find(link => link.switchId === sw.id);
        const refLight = linked && linked.lightIds.length ? projectData.electrical.find(e => e.id === linked.lightIds[0]) : null;
        const fallbackId = sw.type === 'shutter_control' ? DEFAULT_CIRCUIT_BY_TYPE.shutter_motor : DEFAULT_CIRCUIT_BY_TYPE.light_ceiling;
        const targetCircuit = refLight ? circuitOf(refLight) : projectData.circuits.find(c => c.id === fallbackId);
        const lightCircuit = circuitOf(light);
        if (targetCircuit && lightCircuit && targetCircuit.id !== lightCircuit.id) {
            if (circuitRoot(targetCircuit).id !== circuitRoot(lightCircuit).id) {
                showNotification('Association impossible : la lampe et la commande n’ont pas la même famille de circuits.', 'error');
                return;
            }
            const used = [...AUTO_ASSIGN.map.values()].filter(cid => cid === targetCircuit.id).length;
            if (used >= maxPointsForCircuit(targetCircuit)) {
                showNotification('Association impossible : le circuit « ' + targetCircuit.name + ' » est plein (' + maxPointsForCircuit(targetCircuit) + ' points). Libérez un point ou déplacez la commande.', 'error');
                return;
            }
            moveTo = targetCircuit.id;
        }
    }
    saveStateToUndo();
    const prevControlled = sw.controlledLightIds;   // 108 révisé : pour restaurer en cas de refus
    if (moveTo) light.circuitId = moveTo;
    sw.controlledLightIds = [...nextIds];
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene();
    syncElementInspectors();
    redraw2D();
    // le message de réussite n'est donné que si la liaison est réellement tracée (même niveau uniquement)
    const sameLevel = sw.levelId === activeLevelId && light.levelId === activeLevelId;
    const linkedNow = !isAssociated || !sameLevel || (getCableNetwork().controlLinks || [])
        .some(link => link.switchId === sw.id && link.lightIds.includes(light.id));
    if (linkedNow) {
        if (isAssociated && light.circuitId) {   // 112 : les anciennes listes manuelles de cette lampe sont nettoyées
            pruneManualLinksOf(light);
            _cableCache.sig = null;
            if (currentMode === '3d') build3DScene(); else redraw2D();
            syncElementInspectors();   // 112 v2 : les cases des deux fiches sont redessinées après le nettoyage
        }
        showNotification('Association d’éclairage mise à jour.' + (moveTo ? ' Lampe rattachée au circuit de la commande.' : ''), 'success');
    } else {
        // refus : on remet tout comme avant (liste de la commande et circuit de la lampe), sans liaison fantôme
        if (prevControlled === undefined) delete sw.controlledLightIds;
        else sw.controlledLightIds = prevControlled;
        if (moveTo) light.circuitId = prevCircuitId;
        _cableCache.sig = null;
        if (currentMode === '3d') build3DScene(); else redraw2D();
        syncElementInspectors();
        showNotification('Association refusée : la lampe ne peut pas être reliée à cette commande (voir l’onglet Avertissements).', 'error');
    }
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
    syncCableCutInspector();
    const el = projectData.electrical.find(e => e.id === selected3DId);
    const op = !el ? projectData.openings.find(o => o.id === selected3DId) : null;
    const selectedDoor = !!(op && op.type === 'door_single');
    const shaftSel = !el && !op && (projectData.shafts || []).some(s => s.id === selected3DId);
    const stairSel = !el && !op && !shaftSel && (projectData.stairs || []).some(s => s.id === selected3DId);
    const txSel = textById(selected3DId);
    const isSelected = !!(el || op || shaftSel || stairSel || txSel);
    // Message d'attente identique en 2D et en 3D (inspecteur vide)
    const emptyDock = document.getElementById('inspector-dock-empty');
    const cutBox = document.getElementById('cable-cut-inspector');
    const cableSel = !!cutBox && !cutBox.classList.contains('hidden');   // un tronçon est sélectionné
    if (emptyDock) emptyDock.classList.toggle('hidden', isSelected || cableSel);
    const emptyDock2d = document.getElementById('inspector-dock-empty-2d');
    if (emptyDock2d) emptyDock2d.classList.toggle('hidden', isSelected || cableSel);
    const dockInspector = document.getElementById('inspector-3d');
    if (dockInspector) dockInspector.classList.toggle('hidden', !isSelected || shaftSel);
    // un appareil relié à un circuit : l'onglet Circuits s'ouvre pour montrer ce circuit
    if (el && selectedCircuitId && rightTabCurrent !== 'circuits') setRightTab('circuits');
    updateLightingAssociations(el);
    syncOpeningControls(op);
    if (isSelected) {
        document.getElementById('inspector-3d-element-name').textContent =
            el ? electricalDisplayName(el) + circuitSuffixOf(el) : shaftSel ? 'Trémie' : stairSel ? 'Escalier' : txSel ? 'Texte' : op.type === 'door_single' ? 'Porte' : 'Fenêtre';
        }
    // une boîte posée a son propre choix de circuit ; la prise dédiée a son bloc calibre + appareil
    const dedicated = !!(el && isDedicatedOutlet(el));
    const circ = !!(el && (isCircuitPoint(el) || el.type === 'junction_box')) && !dedicated;
    const c3 = document.getElementById('circuit-select-container');
    if (c3) c3.classList.toggle('hidden', !circ);
    setCircuitInspectorText(el);
    syncDedicatedInspectors(el, dedicated);
    const txBox = document.getElementById('text-inspector-2d');
    if (txBox) {
        txBox.classList.toggle('hidden', !txSel);
        if (txSel) document.getElementById('text-value-2d').value = txSel.text || '';
    }
    // Texte (3D) : seulement le contenu et la hauteur au sol
    const txBox3 = document.getElementById('text-inspector-3d');
    if (txBox3) {
        txBox3.classList.toggle('hidden', !txSel);
        if (txSel) document.getElementById('text-value-3d').value = txSel.text || '';
    }
    if (txSel) {
        ['position-distance-container', 'side-toggle-container', 'circuit-select-container', 'dedicated-container', 'door-hinge-3d-container'].forEach(cid => {
            const c = document.getElementById(cid);
            if (c) c.classList.add('hidden');
        });
        const hc = document.getElementById('height-control-container');
        if (hc) hc.classList.remove('hidden');
        const h = txSel.height || 150;
        const hi = document.getElementById('inspector-height-3d-input');
        hi.min = 10; hi.max = 380; hi.value = h;
        document.getElementById('inspector-height-3d-val').textContent = (h / 100).toFixed(2) + ' m';
        document.getElementById('height-control-label').textContent = 'Hauteur au sol';
    }
    const box = document.getElementById('el-inspector-2d');
    if (box) {
        // l'inspecteur 2D couvre aussi l'escalier, comme l'inspecteur 3D
        box.classList.toggle('hidden', !(el || op || stairSel));
        if (el || op || stairSel) {
            const nameEl = document.getElementById('el2d-name');
            nameEl.textContent = el ? electricalDisplayName(el) + circuitSuffixOf(el) : op ? (op.type === 'door_single' ? 'Porte' : 'Fenêtre') : 'Escalier';
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
    sliderDragging = true;
    syncOpeningControls(op);
    const distInput = document.getElementById('inspector-distance-input');
    if (distInput && op.distanceFromStart !== undefined) {
        distInput.value = op.distanceFromStart;
        document.getElementById('inspector-distance-val').textContent = op.distanceFromStart + ' cm';
    }
    if (!(currentMode === '3d' && rebuildOpening3D(op))) refreshSliderView();
}
window.addEventListener('DOMContentLoaded', initOpeningControls);
// Flèches ▲ ▼ à droite de chaque curseur : même effet qu'un glissement (input pendant le réglage, change au relâchement, donc un seul pas d'annulation)
const STEPPER_BTN = 'shrink-0 w-4 h-3 flex items-center justify-center rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[8px] leading-none select-none';

function stepRange(input, dir) {
    if (dir > 0) input.stepUp(); else input.stepDown();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // 240 : les flèches ne recalculent qu'après une pause (5000 ms sans clic), pas à chaque cm
    clearTimeout(input._stepTimer);
    input._stepTimer = setTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })), 2000);
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
        b.dataset.stepBtn = '1';   // 240 : repéré par le relâchement global (voir pointerup)
        b.textContent = sym;
        b.title = label;
        b.setAttribute('aria-label', label);
        let delay = null, repeat = null, moved = false;
        const stop = () => {
            clearTimeout(delay); clearInterval(repeat); delay = repeat = null;
            moved = false;   // 240 : pas de « change » ici : stepRange le déclenche après la pause
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

// 112 : une lampe dont le circuit change ne reste pas dans la liste manuelle d'une commande dont les autres lampes sont sur un autre circuit
function pruneManualLinksOf(light) {
    const circuitIdOf = e => (circuitOf(e) || {}).id;
    const target = circuitIdOf(light);
    projectData.electrical.forEach(sw => {
        if (!isControl(sw) || !Array.isArray(sw.controlledLightIds) || !sw.controlledLightIds.includes(light.id)) return;
        const others = sw.controlledLightIds
            .filter(id => id !== light.id)
            .map(id => projectData.electrical.find(e => e.id === id))
            .filter(Boolean);
        if (others.some(o => circuitIdOf(o) !== target)) {
            sw.controlledLightIds = sw.controlledLightIds.filter(id => id !== light.id);
        }
    });
}

// 227 : circuits créés à la demande (lampes, prises…). Un circuit « receives » reçoit les appareils posés ensuite
// de sa famille ; il reste même vide (manual) jusqu'à ce qu'on en crée un autre
const ON_DEMAND_FAMILIES = [['c_lighting', 'éclairage'], ['c_outlets', 'prises 16A'], ['c_outlets20', 'prises 20A'], ['c_kitchen', 'prises 20A plan de travail'], ['c_shutters', 'volet']];
function newCircuitOnDemand(familyId) {
    const F = projectData.circuits.find(c => c.id === familyId);
    if (!F) return null;
    // un circuit créé à la demande resté vide est remplacé, au lieu de s'empiler (numéros qui grimpent)
    const used = new Set([...AUTO_ASSIGN.map.values()]);
    projectData.electrical.forEach(e => { if (e.circuitId) used.add(e.circuitId); });
    projectData.circuits.filter(c => c.manual && c.baseId === F.id && !used.has(c.id))
        .forEach(c => projectData.circuits.splice(projectData.circuits.indexOf(c), 1));
    let n = 2;
    while (projectData.circuits.some(c => c.id === F.id + '_x' + n)) n++;
    const family = projectData.circuits.filter(c => circuitRoot(c) && circuitRoot(c).id === F.id);
    const nc = { id: F.id + '_x' + n, name: F.name, type: F.type, maxPoints: CIRCUIT_POINT_LIMITS[F.id] !== undefined ? CIRCUIT_POINT_LIMITS[F.id] : F.maxPoints, breakerRating: F.breakerRating, wireSection: F.wireSection, color: freeFamilyShade(F, family.length, null), auto: true, baseId: F.id, manual: true };
    projectData.circuits.splice(projectData.circuits.indexOf(family[family.length - 1]) + 1, 0, nc);
    // un seul circuit de la famille reçoit les appareils posés ensuite : le dernier créé
    family.forEach(c => { delete c.receives; delete c.receivesAfter; });
    nc.receives = true;
    const els = projectData.electrical;
    nc.receivesAfter = els.length ? els[els.length - 1].id : null;
    saveStateToUndo();
    AUTO_ASSIGN.sig = null;
    ensureCircuitAssignment();
    _cableCache.sig = null;
    if (currentMode === '3d') build3DScene(); else { redraw2D(); updateCircuitsUI(); }
    return nc;
}
function onDemandCircuitBar() {
    const bar = document.createElement('div');
    bar.className = 'flex flex-wrap gap-1 pb-2';
    ON_DEMAND_FAMILIES.forEach(([id, label]) => {
        if (!projectData.circuits.some(c => c.id === id)) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200';
        b.textContent = 'Nouveau circuit ' + label;
        b.title = 'Les appareils posés ensuite de ce type vont sur ce nouveau circuit';
        b.addEventListener('click', () => newCircuitOnDemand(id));
        bar.appendChild(b);
    });
    return bar;
}

function setSelectedCircuit(val) {
    const el = projectData.electrical.find(e => e.id === selected3DId);
    if (!el) return;
    saveStateToUndo();
    el.circuitId = val;
    if (isControlledLoad(el)) pruneManualLinksOf(el);   // 112
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
    const refusal = openingMoveRefusal(item, item.wallId, next);
    if (refusal) { showNotification(refusal, 'error'); return true; }
    if (!nudgeUndoPending) { saveStateToUndo(); nudgeUndoPending = true; }
    item.distanceFromStart = next;
    holdSliderDrag();
    if (!(currentMode === '3d' && (moveElementGroup3D(item) || moveOpeningLive3D(item)))) refreshSliderView();
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
    const tx = textById(id);
    if (tx) return { kind: 'texte', item: tx };
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
      if (m.kind === 'escalier' || m.kind === 'plafonnier' || m.kind === 'trémie' || m.kind === 'texte') {
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
        } else if (m.kind === 'trémie' || m.kind === 'texte') {
            it.x = Math.round(it.x + dx * stepCm);
            it.y = Math.round(it.y + dy * stepCm);
        } else {
            it.x = Math.round(it.x + dx * stepCm);
            it.z = Math.round((it.z || 0) + dy * stepCm);   // y du plan = z de l'élément
        }
        refreshNudge3D(m);
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
        refreshNudge3D(m);
        syncElementInspectors();
        return true;
    }
    if (m.kind === 'ouverture' && vert !== 0 && it.type !== 'door_single') {
        // fenêtre : haut / bas = hauteur d'allège
        saveStateToUndo();
        const winH = it.height || 120;
        const maxSill = Math.max(0, levelCeilingOf(activeLevelId) - winH);
        const sill = it.sillHeight !== undefined ? it.sillHeight : 90;
        it.sillHeight = Math.max(0, Math.min(maxSill, Math.round(sill - vert * stepCm)));
        refreshNudge3D(m);
        syncElementInspectors();
        return true;
    }
    if (m.kind === 'ouverture' || m.kind === 'trémie') {
        if (horiz === 0) return true;   // haut / bas : sans effet sur une porte, une fenêtre ou une trémie, mais la touche ne fait pas bouger la caméra
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
    if (m && m.kind === 'texte') {   // patch 72 : un texte n'a que la hauteur au sol
        show(dist, false); show(side, false); show(height, in3d);
        const th = m.item.height || 150;
        const thi = document.getElementById('inspector-height-3d-input');
        thi.min = 10; thi.max = 380; thi.value = th;
        document.getElementById('inspector-height-3d-val').textContent = (th / 100).toFixed(2) + ' m';
        return;
    }
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
    const hasSide = m.kind === 'mural' || m.kind === 'ouverture';
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
                resetCableCache();
                projectData = p;
                currentProjectFileName = (() => { try { return localStorage.getItem(AUTOSAVE_KEY + '_name') || null; } catch (e) { return null; } })();   // 137
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
        currentProjectFileName = null;   // patch 85 : le nouveau projet n'a pas encore de nom de fichier
        resetCableCache();
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

// patch 84 : nom (sans .json) du dernier projet chargé ou enregistré
let currentProjectFileName = null;
async function triggerSaveProject() {
    const values = await askFields('Enregistrer le projet', [{ id: 'name', label: 'Nom du fichier (sans .json)', value: currentProjectFileName || 'clic_and_volt_pro_projet' }], 'Enregistrer');
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
    currentProjectFileName = fileName;   // patch 84
    try { localStorage.setItem(AUTOSAVE_KEY + '_name', fileName); } catch (e) { /* stockage indisponible : on ignore */ }   // 137
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
    const base = currentProjectFileName || 'clic_and_volt';   // 137 : nom du projet en préfixe
    return (base + '_' + mode + levelPart).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
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
    ['Tableaux', t => t === 'panel']
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
        ctx.fillStyle = kind === 'window' ? '#3b82f6' : '#020617';
        ctx.fillRect(x0, cy - th / 2, w, th);
        ctx.strokeStyle = kind === 'door' ? '#b07a4a' : '#1e3a8a';
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
const LEGEND_GANG_PITCH = 16;
// Liseré de groupe dans la légende : taille propre, en fraction de la hauteur de texte (la ligne fait 2 × fs)
const LEGEND_RING_FS = 0.90;
// Symboles longs (interrupteurs, sonnette, minuterie, volet) : centrés sur leur milieu
const LEGEND_LONG_TYPES = [...SWITCH_GANG_TYPES, 'motion_timer', 'doorbell_button', 'shutter_control'];

function legendScale(type) {
    return type === 'panel' ? 0.04 : 0.085;
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
            ctx.translate(LEGEND_LONG_TYPES.includes(type) ? -7 : -3, 0);   // symbole long : centre sur son milieu (≈ 6 unités)
            drawElementSymbol2D(el);
            ctx.restore();
        }
    } finally {
        ctx2D = prevCtx;
        _gangSizes2D = prevGangs;
    }
    // groupe de prises : un seul liseré autour, comme sur le plan (rayon d'anneau = 3.4 + 4)
    if (n > 1 && (type.startsWith('outlet_') || SWITCH_GANG_TYPES.includes(type))) {
        const R = fs * LEGEND_RING_FS;
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
    const groupRight = fs * 1.6 + (n - 1) * LEGEND_GANG_PITCH * s + fs * LEGEND_RING_FS;
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
        const loadedFileName = event.target.files[0].name.replace(/\.json$/i, '');   // patch 84
        fileReader.readAsText(event.target.files[0], "UTF-8");
        fileReader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed && parsed.walls) {
                    saveStateToUndo();
                    resetCableCache();
                    projectData = parsed;
                    currentProjectFileName = loadedFileName;   // patch 84
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

// Un clic dans le plan valide le champ « Contenu » du texte, sans attendre Entrée
document.addEventListener('mousedown', e => {
    const a = document.activeElement;
    if (a && (a.id === 'text-value-2d' || a.id === 'text-value-3d') && e.target !== a) a.blur();
}, true);

// Réglage d'une taille d'écriture (8 à 32 px), enregistré dans le projet, puis redessin 2D ou 3D
function setTextSize(kind, value) {
    const v = Math.min(32, Math.max(8, Math.round(Number(value)) || TEXT_SIZE_DEFAULTS[kind]));
    if (!projectData.textSizes) projectData.textSizes = {};
    projectData.textSizes[kind] = v;
    syncTextSizeInputs();
    if (currentMode === '3d') build3DScene(); else redraw2D();
}

// Remplit les trois champs de la barre gauche (2D et 3D) avec les tailles courantes
function syncTextSizeInputs() {
    ['text', 'cote', 'niveau'].forEach(kind => {
        document.querySelectorAll('[data-text-size="' + kind + '"]').forEach(inp => { inp.value = textSizePx(kind); });
    });
}