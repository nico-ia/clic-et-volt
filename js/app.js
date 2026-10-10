// Application principale : état global, undo/redo, thème, sidebars, circuits, métré, inspecteurs,
// sauvegarde/chargement JSON et initialisation (DOMContentLoaded). Chargé après canvas2d.js et scene3d.js.

let currentMode = '2d';
let currentTool = 'wall';
let gridSnap = true;
let angleSnap = true;
let currentTheme = 'dark';
let isPrintRendering = false;

let projectData = {
    walls: [],
    openings: [],
    electrical: [],
    circuits: [
        { id: 'c_lighting', name: 'Éclairage 10A', type: 'lighting', maxPoints: 8, breakerRating: 10, wireSection: 1.5 },
        { id: 'c_outlets', name: 'Prises de courant 16A', type: 'outlets', maxPoints: 8, breakerRating: 16, wireSection: 2.5 },
        { id: 'c_kitchen', name: 'Spécialisé Cuisine 20A', type: 'specialized', maxPoints: 12, breakerRating: 20, wireSection: 2.5 },
        { id: 'c_cooking', name: 'Spécialisé Cuisson 32A', type: 'specialized', maxPoints: 1, breakerRating: 32, wireSection: 6.0 }
    ],
    annotations: []
};

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

window.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    document.getElementById('inspector-dock-slot').appendChild(document.getElementById('inspector-3d'));
    init2DCanvas();
    init3DScene();
    ensureProjectDefaults();
    restoreAutosave();
    updateCircuitsUI();
    updateStats();
    startAutosave();
    startCollisionBlink();

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
            e.preventDefault();
            duplicateSelectedElement();
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            if (currentMode === '2d' && selectedWallId) {
                deleteSelectedWall();
            } else if (selected3DId) {
                deleteSelected3DElement();
            }
        }
    });
});

// =====================================================================
//  SIDEBARS : repli au clic + redimensionnement à la souris
// =====================================================================
const SIDEBAR_MIN = 200, SIDEBAR_DEFAULT = 320;
const SIDEBARS = [];

function sidebarMax() { return Math.max(SIDEBAR_MIN + 40, Math.min(640, Math.round(window.innerWidth * 0.45))); }

function readSidebarPrefs() {
    try { return JSON.parse(localStorage.getItem('clic_and_volt_sidebars') || '{}') || {}; } catch (e) { return {}; }
}

function saveSidebarPrefs() {
    try {
        const prefs = {};
        SIDEBARS.forEach(sb => { prefs[sb.key] = { width: sb.width, collapsed: sb.collapsed }; });
        localStorage.setItem('clic_and_volt_sidebars', JSON.stringify(prefs));
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

function initSidebars() {
    const prefs = readSidebarPrefs();
    const defs = [
        { key: '2d-left', id: 'sidebar-2d', side: 'left', parent: 'view-2d' },
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
            ? '<i class="fa-solid fa-sun theme-toggle-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';
        button.title = light ? 'Passer au thème sombre' : 'Passer au thème clair';
        button.setAttribute('aria-label', button.title);
    }
    if (threeScene) threeScene.background = new THREE.Color(light ? 0xe2e8f0 : 0x020617);
    redraw2D();
}

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
    if (undoStack.length === 0) {
        showNotification("Rien à annuler", "info");
        return;
    }
    redoStack.push(JSON.stringify(projectData));
    projectData = JSON.parse(undoStack.pop());
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
    setSelectedWalls([]);
    selected3DId = null;
    redraw2D();
    if (currentMode === '3d') build3DScene();
    updateStats();
    showNotification("Action rétablie", "success");
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('view-2d').classList.toggle('hidden', mode !== '2d');
    document.getElementById('view-3d').classList.toggle('hidden', mode !== '3d');
    document.getElementById('view-report').classList.toggle('hidden', mode !== 'report');

    const tabOn = 'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-emerald-600 text-white shadow';
    const tabOff = 'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 text-slate-400 hover:text-white';
    ['2d', '3d', 'report'].forEach(m => { document.getElementById('tab-' + m).className = mode === m ? tabOn : tabOff; });

    if (mode === 'report') {
        updateCircuitsUI();
    } else if (mode === '3d') {
        build3DScene();
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

function setTool(tool) {
    currentTool = tool;
    drawingStartPoint = null;
    mouseCurrentPos = null;
    draggingWall = null;
    selectionBoxStart = null;
    selectionBoxEnd = null;
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.className = "tool-btn p-3 rounded-xl border border-slate-800 bg-slate-800 text-slate-300 text-xs font-medium flex flex-col items-center gap-1.5 hover:border-slate-700 transition shadow-sm";
    });
    const activeBtn = document.getElementById('btn-tool-' + tool);
    if (activeBtn) {
        activeBtn.className = "tool-btn p-3 rounded-xl border border-emerald-500 bg-emerald-500/20 text-emerald-300 text-xs font-medium flex flex-col items-center gap-1.5 transition shadow-sm";
    }
    const panCanvasButton = document.getElementById('btn-pan-canvas');
    if (panCanvasButton) {
        panCanvasButton.className = tool === 'pan'
            ? 'w-9 h-9 rounded-lg border border-emerald-500 bg-emerald-500/20 text-emerald-300 flex items-center justify-center transition'
            : 'w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center transition';
        panCanvasButton.title = tool === 'pan'
            ? 'Déplacement actif : faites glisser avec le bouton gauche'
            : 'Activer le déplacement du plan à la souris gauche';
    }
    const toolBadges = { wall: 'Tracer Mur', select: 'Sélectionner / Glisser', place: 'Placer appareil', pan: 'Déplacer la vue' };
    const toolHints = {
        wall: 'Cliquez pour placer le premier point du mur (Clic droit pour fermer/arrêter)',
        select: 'Cliquez un mur ; glissez dans le vide pour encadrer ; tirez une extrémité ; Ctrl/Cmd/Shift pour ajouter',
        place: 'Choisissez un élément à gauche puis cliquez près d\'un mur pour le poser',
        pan: 'Faites glisser le plan avec le bouton gauche de la souris'
    };
    document.getElementById('active-tool-badge').textContent = toolBadges[tool] || tool;
    document.getElementById('drawing-instruction-hint').textContent = toolHints[tool] || '';
    document.getElementById('place-palette').classList.toggle('hidden', tool !== 'place');
    if (tool !== 'select' && selected3DId) { selected3DId = null; selectedCircuitId = null; syncElementInspectors(); updateCircuitsUI(); }
    if (tool !== 'select') {
        setSelectedWalls([]);
    }
    redraw2D();
}

function setSelectedWalls(ids) {
    const selected = new Set(ids);
    selectedWallIds = projectData.walls.filter(w => selected.has(w.id)).map(w => w.id);
    selectedWallId = selectedWallIds[0] || null;

    const inspector = document.getElementById('wall-inspector');
    inspector.classList.toggle('hidden', selectedWallIds.length === 0);
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
    redraw2D();
}

function updateSelectedWallLength(valStr) {
    if (!selectedWallId) return;
    const newLenM = parseFloat(valStr);
    if (isNaN(newLenM) || newLenM <= 0) return;
    const wall = projectData.walls.find(w => w.id === selectedWallId);
    if (!wall) return;

    saveStateToUndo();
    const currentLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (currentLen === 0) return;
    const newLenCm = newLenM * 100;
    const ratio = newLenCm / currentLen;

    wall.x2 = wall.x1 + (wall.x2 - wall.x1) * ratio;
    wall.y2 = wall.y1 + (wall.y2 - wall.y1) * ratio;

    document.getElementById('inspector-length-val').textContent = newLenM.toFixed(2) + ' m';
    redraw2D();
    showNotification("Longueur du mur mise à jour", "success");
}

function deleteSelectedWall() {
    if (!selectedWallIds.length) return;
    const ids = new Set(selectedWallIds);
    saveStateToUndo();
    projectData.walls = projectData.walls.filter(w => !ids.has(w.id));
    projectData.openings = projectData.openings.filter(o => !ids.has(o.wallId));
    projectData.electrical = projectData.electrical.filter(el => !ids.has(el.wallId));
    setSelectedWalls([]);
    updateStats();
    redraw2D();
    showNotification(ids.size > 1 ? ids.size + ' murs supprimés avec succès' : 'Mur supprimé avec succès', 'success');
}

function toggleGridSnap() {
    gridSnap = !gridSnap;
    const btn = document.getElementById('btn-grid-snap');
    btn.className = gridSnap ? "p-2.5 rounded-lg border border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium flex items-center justify-center gap-1.5 transition" : "p-2.5 rounded-lg border border-slate-800 bg-slate-800 text-slate-400 font-medium flex items-center justify-center gap-1.5 transition";
    btn.innerHTML = `<i class="fa-solid fa-magnet"></i> Grille : ${gridSnap ? 'ON' : 'OFF'}`;
    redraw2D();
}

function toggleAngleSnap() {
    angleSnap = !angleSnap;
    const btn = document.getElementById('btn-angle-snap');
    btn.className = angleSnap ? "p-2.5 rounded-lg border border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium flex items-center justify-center gap-1.5 transition" : "p-2.5 rounded-lg border border-slate-800 bg-slate-800 text-slate-400 font-medium flex items-center justify-center gap-1.5 transition";
    btn.innerHTML = `<i class="fa-solid fa-compass"></i> Ortho : ${angleSnap ? 'ON' : 'OFF'}`;
}

function clearCanvas() {
    if (projectData.walls.length === 0) return;
    if (confirm("Voulez-vous vraiment tout effacer ?")) {
        saveStateToUndo();
        projectData.walls = [];
        projectData.openings = [];
        projectData.electrical = [];
        setSelectedWalls([]);
        selected3DId = null;
        document.getElementById('wall-inspector').classList.add('hidden');
        updateStats();
        redraw2D();
        showNotification("Projet réinitialisé", "info");
    }
}

function updateStats() {
    document.getElementById('stat-walls-count').textContent = projectData.walls.length;
}

// =====================================================================
//  CIRCUITS, MÉTRÉ, CONTRÔLES, OUTILS 2D, SAUVEGARDE AUTO
// =====================================================================
const CIRCUIT_PALETTE = ['#facc15', '#f97316', '#ef4444', '#ec4899', '#a78bfa', '#38bdf8', '#34d399', '#94a3b8'];
const DEFAULT_CIRCUIT_BY_TYPE = {
    light_ceiling: 'c_lighting', wall_light: 'c_lighting',
    outlet_16a: 'c_outlets', outlet_20a: 'c_kitchen', outlet_32a: 'c_cooking'
};
const CIRCUIT_POINT_LIMITS = { c_lighting: 8, c_outlets: 8, c_kitchen: 12, c_cooking: 1 };
const ELEMENT_LABELS = {
    outlet_16a: 'Prise 16A', outlet_20a: 'Prise 20A', outlet_32a: 'Prise 32A',
    switch_simple: 'Interrupteur simple', switch_va_et_vient: 'Interrupteur va-et-vient',
    switch_pushbutton: 'Bouton poussoir (télérupteur)',
    wall_light: 'Applique murale', light_ceiling: 'Plafonnier', panel: 'Tableau électrique'
};
const EL_COLORS = {
    outlet_16a: '#f97316', outlet_20a: '#ef4444', outlet_32a: '#ec4899',
    switch_simple: '#10b981', switch_va_et_vient: '#22c55e', switch_pushbutton: '#38bdf8',
    wall_light: '#fbbf24', light_ceiling: '#fde047', panel: '#06b6d4'
};

function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function isCircuitPoint(el) { return el.type in DEFAULT_CIRCUIT_BY_TYPE; }
function isLightingControl(el) {
    return el.type === 'switch_simple' || el.type === 'switch_va_et_vient' || el.type === 'switch_pushbutton';
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
    if (!isCircuitPoint(el)) return null;
    const id = AUTO_ASSIGN.map.get(el.id);
    return projectData.circuits.find(c => c.id === id)
        || projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE[el.type])
        || null;
}

// Clignotement des appareils en collision (plan 2D et vue 3D)
function startCollisionBlink() {
    setInterval(() => {
        blinkOn = !blinkOn;
        if (currentMode === '3d') {
            wallMeshes3D.forEach(m => { if (m.userData && m.userData.blink) m.visible = blinkOn; });
        } else if (currentMode === '2d' && collidingElementIds().size) {
            redraw2D();
        }
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
    const pts = projectData.electrical.filter(isCircuitPoint);
    const sigOf = () => JSON.stringify([
        circuits.map(c => [c.id, c.name, c.maxPoints, c.breakerRating, c.wireSection, c.baseId || 0]),
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
        const assign = (el, cid) => { assigned.set(el.id, cid); count.set(cid, count.get(cid) + 1); };

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
            if (target && count.get(target.id) < capacity(target)) assign(el, target.id);
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
            let c = chain.find(x => count.get(x.id) < capacity(x));
            if (!c) {
                let n = 2;
                while (byId(F.id + '_x' + n)) n++;
                c = { id: F.id + '_x' + n, name: F.name, type: F.type, maxPoints: F.maxPoints, breakerRating: F.breakerRating, wireSection: F.wireSection, color: nextCircuitColor(), auto: true, baseId: F.id };
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
            let free = 0;
            for (let j = 0; j < i; j++) free += capacity(chain[j]) - count.get(chain[j].id);
            if (free < n) continue;
            members.filter(el => assigned.get(el.id) === c.id).forEach(el => {
                const tgt = chain.slice(0, i).find(x => count.get(x.id) < capacity(x));
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
        });
        assigned.forEach((cid, id) => next.set(id, cid));
    });

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

// Première couleur libre : palette d'abord, puis teintes réparties (angle d'or) pour qu'aucun circuit ne partage sa couleur
function nextCircuitColor() {
    const used = new Set((projectData.circuits || []).map(c => c.color));
    for (let i = 0; i < 400; i++) {
        const col = i < CIRCUIT_PALETTE.length ? CIRCUIT_PALETTE[i] : hslToHex(((i - CIRCUIT_PALETTE.length) * 137.508 + 20) % 360, 68, i % 2 ? 62 : 52);
        if (!used.has(col)) return col;
    }
    return '#94a3b8';
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
    projectData.walls = projectData.walls || [];
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
            { id: 'c_kitchen', name: 'Spécialisé Cuisine 20A', type: 'specialized', maxPoints: 12, breakerRating: 20, wireSection: 2.5 },
            { id: 'c_cooking', name: 'Spécialisé Cuisson 32A', type: 'specialized', maxPoints: 1, breakerRating: 32, wireSection: 6.0 }
        ];
    }
    projectData.circuits.forEach(c => {
        if (c.id === 'c_lighting') {
            if (c.maxPoints === 5) c.maxPoints = 8;
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
    });
    projectData.circuits.forEach(c => { if (!c.color) c.color = nextCircuitColor(); });
    delete projectData.wires;
}

// ---------- Contrôles par circuit + métré ----------
// Appareils posés dans l'emprise d'une porte ou d'une fenêtre
function computeOpeningCollisions() {
    const list = [];
    projectData.electrical.forEach(el => {
        if (el.type === 'light_ceiling') return;
        const w = projectData.walls.find(x => x.id === el.wallId);
        if (!w) return;
        const wl = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        const dist = el.distanceFromStart !== undefined ? el.distanceFromStart : wl / 2;
        const z = getElCoords(el).z;
        projectData.openings.forEach(op => {
            if (op.wallId !== w.id) return;
            const b = openingBox(op, w);
            if (Math.abs(dist - b.d) < b.half && z >= b.z0 && z <= b.z1) list.push({ el, isDoor: !!b.isDoor });
        });
    });
    return list;
}

function collidingElementIds() {
    return new Set(computeOpeningCollisions().map(c => c.el.id));
}

// Prises simples proches (même mur, même côté, même hauteur) : regroupées automatiquement en double / triple / quadruple
const GANGABLE_OUTLETS = ['outlet_16a', 'outlet_20a'];
const GANG_MAX_GAP_CM = 15;
const GANG_NAMES = { 1: 'simple', 2: 'double', 3: 'triple', 4: 'quadruple' };

function computeOutletGangs() {
    const sizeOf = new Map();
    const tally = {};
    GANGABLE_OUTLETS.forEach(type => { tally[type] = { 1: 0, 2: 0, 3: 0, 4: 0 }; });
    const buckets = new Map();
    projectData.electrical.forEach(el => {
        if (!GANGABLE_OUTLETS.includes(el.type)) return;
        const w = projectData.walls.find(x => x.id === el.wallId);
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
            cluster.forEach(it => sizeOf.set(it.el.id, cluster.length));
            tally[cluster[0].el.type][cluster.length]++;
            cluster = [];
        };
        items.forEach(it => {
            const last = cluster[cluster.length - 1];
            if (last && it.dist - last.dist <= GANG_MAX_GAP_CM && Math.abs(it.h - last.h) <= 5 && cluster.length < 4) cluster.push(it);
            else { close(); cluster.push(it); }
        });
        close();
    });
    return { sizeOf, tally };
}

function computeCircuitReport() {
    const net = getCableNetwork();
    const info = net.linkInfo || [];
    const rows = projectData.circuits.map(c => {
        const points = projectData.electrical.filter(el => { const cc = circuitOf(el); return cc && cc.id === c.id; }).length;
        const mine = info.filter(l => l.circuitId === c.id);
        const cableCm = mine.reduce((s, l) => s + l.length + 60, 0);   // +30 cm de réserve à chaque extrémité
        const maxRunM = ((net.circuitRuns || {})[c.id] || 0) / 100;      // du tableau à l'appareil le plus éloigné
        const drop = 2 * 0.0225 * maxRunM * c.breakerRating / c.wireSection / 230 * 100;   // cuivre, monophasé, au calibre
        const limit = c.type === 'lighting' ? 3 : 5;
        const warnings = [];
        const pointLimit = maxPointsForCircuit(c);
        if (points > pointLimit) warnings.push(points + ' points pour ' + pointLimit + ' maximum');
        if (c.wireSection < minSectionFor(c.breakerRating)) warnings.push('section ' + c.wireSection + ' mm² trop faible pour ' + c.breakerRating + ' A');
        if (drop > limit) warnings.push('chute de tension ' + drop.toFixed(1) + ' % (limite ' + limit + ' %)');
        return { circuit: c, points, cableM: cableCm / 100, maxRunM, drop, limit, warnings };
    });

    const alerts = [];
    const panels = projectData.electrical.filter(el => el.type === 'panel');
    if (projectData.electrical.some(el => el.type !== 'panel') && !panels.length) alerts.push('Aucun tableau électrique : les appareils ne sont pas reliés.');
    if (panels.length > 1) alerts.push('Plusieurs tableaux : seul le premier est alimenté.');
    if (net.unrouted > 0) alerts.push(net.unrouted + ' liaison(s) sans chemin possible.');
    (net.warnings || []).forEach(w => alerts.push(w));
    const nSw = projectData.electrical.filter(isLightingControl).length;
    const nVaEtVient = projectData.electrical.filter(el => el.type === 'switch_va_et_vient').length;
    const nLi = projectData.electrical.filter(el => el.type === 'light_ceiling' || el.type === 'wall_light').length;
    if (nSw > 0 && nLi === 0) alerts.push('Interrupteur(s) sans luminaire à commander.');
    if (nLi > 0 && nSw === 0) alerts.push('Luminaire(s) sans interrupteur de commande.');
    if (nVaEtVient % 2 !== 0) alerts.push('Nombre impair d’interrupteurs va-et-vient : associez-les par deux pour commander chaque éclairage.');
    projectData.electrical.filter(isLightingControl).forEach(el => {
        const height = el.height || 110;
        if (height < 90 || height > 130) {
            alerts.push(electricalDisplayName(el) + ' hors de la plage de hauteur usuelle 0,90–1,30 m.');
        }
    });
    rows.forEach(r => r.warnings.forEach(w => alerts.push(r.circuit.name + ' : ' + w)));
    computeOpeningCollisions().forEach(({ el, isDoor }) => {
        alerts.push(electricalDisplayName(el) + ' placé(e) dans ' + (isDoor ? 'une porte' : 'une fenêtre') + ' : à déplacer');
    });
    const infos = projectData.circuits.filter(c => c.auto).map(c => '« ' + c.name + ' » créé automatiquement (' + c.maxPoints + ' points maximum par circuit)');

    const sections = new Map();
    rows.forEach(r => { if (r.cableM > 0) sections.set(r.circuit.wireSection, (sections.get(r.circuit.wireSection) || 0) + r.cableM); });
    const conduitM = net.segments.reduce((s, sg) => s + Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y, sg.b.z - sg.a.z), 0) / 100;
    const counts = {};
    projectData.electrical.forEach(el => { counts[el.type] = (counts[el.type] || 0) + 1; });
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
    return { rows, alerts, infos, sections, conduitM, counts, countLines };
}

function updateCircuitsUI() {
    const list = document.getElementById('circuits-list');
    if (!list) return;
    const rep = computeCircuitReport();
    list.innerHTML = '';
    const clearButton = document.getElementById('clear-circuit-highlight');
    if (clearButton) clearButton.classList.toggle('hidden', !selectedCircuitId);
    rep.rows.forEach(r => {
        const c = r.circuit;
        const div = document.createElement('div');
        const selected = selectedCircuitId === c.id;
        div.className = 'bg-slate-900 p-2 rounded-lg border cursor-pointer transition-colors ' +
            (selected ? 'border-amber-400 ring-1 ring-amber-400/50 bg-amber-500/10' : (r.warnings.length ? 'border-rose-500/50 hover:border-slate-600' : 'border-slate-800 hover:border-slate-600'));
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
        const lengthInfo = r.cableM > 0 ? ' | ' + r.cableM.toFixed(1) + ' m | ΔU ' + r.drop.toFixed(1) + ' %' : '';
        div.innerHTML =
            '<div class="flex items-center justify-between gap-2">' +
            '<div class="flex items-center gap-2 min-w-0"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + esc(circuitColor(c)) + '"></span>' +
            '<div class="min-w-0"><div class="font-semibold text-slate-200 truncate">' + esc(c.name) + (c.auto ? ' <span class="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300 align-middle">auto</span>' : '') + '</div>' +
            '<div class="text-[10px] text-slate-400">' + r.points + '/' + c.maxPoints + ' pts' + lengthInfo + '</div></div></div></div>' +
            '<div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] text-slate-300">' +
            stepperHtml(c.id, 'breakerRating', 'Calibre', c.breakerRating + 'A') +
            stepperHtml(c.id, 'wireSection', 'Section', c.wireSection + ' mm²') +
            stepperHtml(c.id, 'maxPoints', 'Éléments', String(c.maxPoints)) + '</div>' +
            r.warnings.map(w => '<div class="text-[10px] text-rose-300 mt-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(w) + '</div>' +
                '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(w)) + '</div>').join('');
        list.appendChild(div);
    });

    const alertsHtml = rep.alerts.length
        ? '<div class="space-y-2">' + rep.alerts.map(a => '<div><div class="text-[11px] text-amber-300"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(a) + '</div>' +
            '<div class="ml-4 text-[10px] text-amber-200/90">Piste de correction : ' + esc(solutionForWarning(a)) + '</div></div>').join('') + '</div>'
        : '<div class="text-[11px] text-emerald-300"><i class="fa-solid fa-circle-check mr-1"></i>Aucune alerte</div>';

    const warningsBox = document.getElementById('warnings-content');
    if (warningsBox) warningsBox.innerHTML = alertsHtml;

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
const BOM_DEVICE_ORDER = ['panel', 'light_ceiling', 'wall_light', 'switch_simple', 'switch_va_et_vient', 'switch_pushbutton', 'outlet_16a', 'outlet_20a', 'outlet_32a'];

function buildBomRows(rep) {
    const groups = [];

    const openings = [];
    const doors = projectData.openings.filter(o => o.type === 'door_single').length;
    const wins = projectData.openings.filter(o => o.type === 'window_std').length;
    if (doors) openings.push(['Ouvertures', 'Porte simple', doors, 'u']);
    if (wins) openings.push(['Ouvertures', 'Fenêtre', wins, 'u']);
    groups.push(openings);

    // appareillage : tableau, puis points lumineux, puis interrupteurs, puis prises
    const rank = t => { const i = BOM_DEVICE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
    groups.push(rep.countLines.slice()
        .sort((x, y) => rank(x.type) - rank(y.type) || (x.gang || 0) - (y.gang || 0))
        .map(line => ['Appareillage', line.label, line.count, 'u']));

    const cables = [];
    if (rep.conduitM > 0) cables.push(['Gaines et câbles', 'Gaine / conduit (marge 10 %)', Math.ceil(rep.conduitM * 1.1), 'm']);
    [...rep.sections.entries()].sort((x, y) => x[0] - y[0]).forEach(([sec, m]) =>
        cables.push(['Gaines et câbles', 'Câble 3G' + sec + ' mm² (marge 10 %)', Math.ceil(m * 1.1), 'm']));
    groups.push(cables);

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
    const win = window.open('', '_blank');
    if (!win) {
        showNotification('Autorisez les fenêtres contextuelles pour imprimer le métré.', 'error');
        return;
    }
    const rep = computeCircuitReport();
    const date = new Date().toLocaleDateString('fr-FR');
    const alerts = rep.alerts.length
        ? '<h3 class="rt-title">Alertes</h3><ul class="rt-alerts">' + rep.alerts.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>'
        : '';
    const css = '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;padding:16px;background:#fff;color:#0f172a;font:13px Arial,sans-serif}' +
        '.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px}.toolbar h1{font-size:18px;margin:0 auto 0 0}.toolbar button{font:inherit;padding:6px 12px;cursor:pointer}' +
        '.rt-title{font-size:14px;margin:18px 0 6px}.rt{width:100%;border-collapse:collapse;margin-bottom:6px}.rt th,.rt td{border:1px solid #94a3b8;padding:5px 8px;text-align:left;vertical-align:top}' +
        '.rt th{background:#e2e8f0}.rt .num{text-align:right;white-space:nowrap}.rt tr{break-inside:avoid}.rt-warn td{background:#fee2e2}.rt tr.rt-gap td{border:0;background:#fff;padding:0;height:14px}.rt-note,.rt-empty{font-size:11px;color:#475569}.rt-alerts{margin:0;padding-left:18px}.rt-alerts li{margin-bottom:3px}' +
        '@media print{.toolbar{display:none}body{padding:0}}';
    win.document.open();
    win.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Métré — Clic & Volt</title><style>' + css + '</style></head><body>' +
        '<div class="toolbar"><h1>Clic & Volt — Métré & contrôles <small style="font-weight:normal;color:#64748b">(' + date + ')</small></h1><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>' +
        reportTablesHtml(rep) + alerts + '</body></html>');
    win.document.close();
    win.focus();
}

function solutionForWarning(message) {
    const text = String(message).toLowerCase();
    if (text.includes('points pour') || text.includes('maximum')) {
        return 'Répartissez les appareils sur un circuit supplémentaire adapté, sans dépasser le calibre ni la section prévus.';
    }
    if (text.includes('section') && text.includes('trop faible')) {
        return 'Augmentez la section des conducteurs pour qu’elle soit adaptée au calibre de la protection et au mode de pose.';
    }
    if (text.includes('chute de tension')) {
        return 'Vérifiez le parcours et le dimensionnement ; réduisez la longueur si possible ou augmentez la section des conducteurs.';
    }
    if (text.includes('sans chemin') || text.includes('pas pu être reliés')) {
        return 'Vérifiez la continuité des murs et le cheminement jusqu’au tableau ; rapprochez l’appareil du parcours si nécessaire.';
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

function editCircuit(id) {
    const c = projectData.circuits.find(x => x.id === id);
    if (!c) return;
    const answer = prompt('Calibre (A), section (mm²), points maximum pour « ' + c.name + ' » :', c.breakerRating + ', ' + c.wireSection + ', ' + c.maxPoints);
    if (!answer) return;
    const [b, s, m] = answer.split(',').map(v => parseFloat(v.replace(',', '.')));
    if (!(b > 0) || !(s > 0) || !(m >= 1)) { showNotification('Valeurs invalides (ex. : 16, 2.5, 8)', 'error'); return; }
    const standardLimit = CIRCUIT_POINT_LIMITS[circuitRoot(c).id];
    if (standardLimit !== undefined && Math.round(m) > standardLimit) {
        showNotification('Limite NF C 15-100 dépassée : ' + standardLimit + ' points maximum pour ce circuit', 'error');
        return;
    }
    saveStateToUndo();
    c.breakerRating = b;
    c.wireSection = s;
    c.maxPoints = Math.round(m);
    if (currentMode === '3d') build3DScene(); else updateCircuitsUI();
    showNotification('Circuit mis à jour', 'success');
}

// ---------- Inspecteurs d'éléments (3D + 2D) ----------
function fillCircuitSelect(sel, el) {
    if (!sel) return;
    const cur = circuitOf(el);
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
    return (ELEMENT_LABELS[el.type] || el.type) + ' n°' + ordinal;
}

function focusAssociatedElement(id) {
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

function updateLightingAssociations(el) {
    const boxes = [
        document.getElementById('lighting-associations'),
        document.getElementById('lighting-associations-2d')
    ].filter(Boolean);
    const isLight = el && (el.type === 'light_ceiling' || el.type === 'wall_light');
    if (!el || (!isLight && !isLightingControl(el))) {
        boxes.forEach(box => box.classList.add('hidden'));
        return;
    }

    const network = getCableNetwork();
    const links = network.controlLinks || [];
    const switches = new Map(links.map(link => [link.switchId, link]));
    const lightById = new Map(projectData.electrical
        .filter(candidate => candidate.type === 'light_ceiling' || candidate.type === 'wall_light')
        .map(light => [light.id, light]));
    const switchById = new Map(projectData.electrical.filter(isLightingControl).map(sw => [sw.id, sw]));
    const linkButton = item =>
        '<button type="button" data-related-id="' + esc(item.id) +
        '" class="text-left text-[11px] text-amber-300 underline decoration-dotted">' +
        esc(electricalDisplayName(item)) + '</button>';
    let content = '<div class="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Commandes d’éclairage calculées</div>';

    if (isLightingControl(el)) {
        const lightIds = switches.get(el.id) ? switches.get(el.id).lightIds : [];
        content += '<div class="text-[11px] text-slate-300">Point(s) lumineux commandé(s)</div>';
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
        if (!lightById.size) content += '<div class="text-[11px] text-slate-500">Ajoutez un point lumineux au plan.</div>';
        lightById.forEach(light => {
            content += '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
                esc(el.id) + '" data-association-light="' + esc(light.id) + '"' +
                (configuredIds.includes(light.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
                esc(electricalDisplayName(light)) + '</label>';
        });
        content += '</div></details>';
    } else {
        const controllingSwitches = links
            .filter(link => link.lightIds.includes(el.id))
            .map(link => switchById.get(link.switchId))
            .filter(Boolean);
        content += '<div class="text-[11px] text-slate-300">Interrupteur(s) associé(s)</div>';
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
        if (!switchById.size) content += '<div class="text-[11px] text-slate-500">Ajoutez un interrupteur au plan.</div>';
        switchById.forEach(sw => {
            const association = switches.get(sw.id);
            const configuredIds = Array.isArray(sw.controlledLightIds)
                ? sw.controlledLightIds
                : association ? association.lightIds : [];
            content += '<label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-association-switch="' +
                esc(sw.id) + '" data-association-light="' + esc(el.id) + '"' +
                (configuredIds.includes(el.id) ? ' checked' : '') + ' class="accent-emerald-500">' +
                esc(electricalDisplayName(sw)) + '</label>';
        });
        content += '</div></details>';
    }

    boxes.forEach(box => {
        box.innerHTML = content;
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
    const sw = projectData.electrical.find(candidate => candidate.id === switchId && isLightingControl(candidate));
    const light = projectData.electrical.find(candidate =>
        candidate.id === lightId && (candidate.type === 'light_ceiling' || candidate.type === 'wall_light'));
    if (!sw || !light) {
        showNotification('Association impossible : interrupteur ou luminaire introuvable.', 'error');
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

function syncElementInspectors() {
    const el = projectData.electrical.find(e => e.id === selected3DId);
    const op = !el ? projectData.openings.find(o => o.id === selected3DId) : null;
    const selectedDoor = !!(op && op.type === 'door_single');
    const isSelected = !!(el || op);
    const emptyDock = document.getElementById('inspector-dock-empty');
    if (emptyDock) emptyDock.classList.toggle('hidden', isSelected);
    const dockInspector = document.getElementById('inspector-3d');
    if (dockInspector) dockInspector.classList.toggle('hidden', !isSelected);
    updateLightingAssociations(el);
    syncOpeningControls(op);
    if (isSelected) {
        document.getElementById('inspector-3d-element-name').textContent =
            el ? electricalDisplayName(el) : op.type === 'door_single' ? 'Porte' : 'Fenêtre';
    }
    const circ = !!(el && isCircuitPoint(el));
    const c3 = document.getElementById('circuit-select-container');
    const d3 = document.getElementById('duplicate-btn-3d');
    if (c3) c3.classList.toggle('hidden', !circ);
    if (d3) d3.classList.toggle('hidden', !el);
    const box = document.getElementById('el-inspector-2d');
    if (box) {
        box.classList.toggle('hidden', !(el || op));
        if (el || op) {
            document.getElementById('el2d-name').textContent = el ? electricalDisplayName(el) : (op.type === 'door_single' ? 'Porte' : 'Fenêtre');
            document.getElementById('el2d-circuit-wrap').classList.toggle('hidden', !circ);
            document.getElementById('el2d-dup').classList.toggle('hidden', !el);
        }
    }
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
    ['height', 'Hauteur de la fenêtre'],
    ['sill', 'Hauteur d’allège (sol → bas de la fenêtre)']
];

function initOpeningControls() {
    ['3d', '2d'].forEach(suffix => {
        const box = document.getElementById('opening-controls-' + suffix);
        if (!box) return;
        box.innerHTML = '<div data-op-title class="text-xs font-semibold text-slate-200"></div>' +
            OPENING_ROWS.map(([prop, label]) =>
                '<div data-op-row="' + prop + '" class="space-y-1"><div class="text-xs text-slate-300">' + label + '</div>' +
                '<div class="flex items-center gap-2">' +
                '<input type="range" step="1" data-op-range="' + prop + '" oninput="setSelectedOpeningProp(\'' + prop + '\', this.value)" class="flex-1 min-w-0 accent-emerald-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer">' +
                '<input type="number" step="1" data-op-num="' + prop + '" onchange="setSelectedOpeningProp(\'' + prop + '\', this.value)" class="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500">' +
                '<span class="text-[10px] text-slate-500">cm</span></div></div>').join('');
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
        box.querySelector('[data-op-title]').textContent = lim.isDoor ? 'Dimensions de la porte' : 'Dimensions de la fenêtre';
        box.querySelectorAll('[data-op-row]').forEach(row => {
            const prop = row.dataset.opRow;
            const show = !lim.isDoor || prop === 'width';
            row.classList.toggle('hidden', !show);
            if (!show) return;
            const L = lim[prop];
            row.querySelectorAll('input').forEach(inp => { inp.min = L.min; inp.max = L.max; inp.value = L.val; });
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

function duplicateSelectedElement() {
    const el = projectData.electrical.find(e => e.id === selected3DId);
    if (!el) { showNotification('Sélectionnez un appareil à dupliquer', 'info'); return; }
    saveStateToUndo();
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    if (el.type === 'light_ceiling') {
        copy.x = el.x + 40;
    } else {
        const w = projectData.walls.find(x => x.id === el.wallId);
        if (w) {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const d = el.distanceFromStart !== undefined ? el.distanceFromStart : len / 2;
            copy.distanceFromStart = Math.round(d + 35 > len - 10 ? Math.max(10, d - 35) : d + 35);
        }
    }
    projectData.electrical.push(copy);
    selected3DId = copy.id;
    if (currentMode === '3d') build3DScene();
    redraw2D();
    syncElementInspectors();
    showNotification('Appareil dupliqué', 'success');
}

// ---------- Plan 2D : appareils, ouvertures, câbles ----------
let showCables2D = true;
let draggingEl2D = null;

// ---------- Sauvegarde automatique ----------
const AUTOSAVE_KEY = 'clic_and_volt_pro_autosave_v1';
let _lastAutosave = '';

function startAutosave() {
    setInterval(() => {
        try {
            const s = JSON.stringify(projectData);
            if (s !== _lastAutosave) {
                localStorage.setItem(AUTOSAVE_KEY, s);
                _lastAutosave = s;
            }
        } catch (e) { /* stockage indisponible : on ignore */ }
    }, 2000);
}

function restoreAutosave() {
    try {
        const s = localStorage.getItem(AUTOSAVE_KEY);
        if (!s) return;
        const p = JSON.parse(s);
        if (p && Array.isArray(p.walls) && p.walls.length > 0) {
            if (confirm('Un projet non enregistré a été retrouvé (' + p.walls.length + ' murs). Le reprendre ?')) {
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

function triggerNewProject() {
    if (confirm("Créer un nouveau projet effacera le travail en cours non sauvegardé. Continuer ?")) {
        projectData = {
            walls: [],
            openings: [],
            electrical: [],
            circuits: projectData.circuits,
            annotations: []
        };
        undoStack = [];
        redoStack = [];
        setSelectedWalls([]);
        selected3DId = null;
        recenter2DView();
        updateStats();
        redraw2D();
        if (currentMode === '3d') build3DScene();
        showNotification("Nouveau projet créé", "success");
    }
}

function triggerSaveProject() {
    const requestedName = prompt('Nom du fichier à enregistrer :', 'clic_and_volt_pro_projet');
    if (requestedName === null) return;
    const fileName = requestedName.trim()
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
        on3DWindowResize();
        threeRenderer.render(threeScene, threeCamera);
        return threeRenderer.domElement.toDataURL('image/png');
    }
    resize2DCanvas();
    const previouslySelectedId = selected3DId;
    selected3DId = null;
    isPrintRendering = true;
    try {
        redraw2D();
        return canvas2D.toDataURL('image/png');
    } finally {
        isPrintRendering = false;
        selected3DId = previouslySelectedId;
        redraw2D();
    }
}

function savePlanPng(mode) {
    try {
        const imageUrl = capturePlanImage(mode);
        if (!imageUrl) throw new Error('La vue à enregistrer est vide.');
        const anchor = document.createElement('a');
        anchor.href = imageUrl;
        anchor.download = 'clic_and_volt_pro_plan_' + mode + '.png';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        showNotification('Plan ' + mode.toUpperCase() + ' enregistré en PNG', 'success');
    } catch (error) {
        console.error('Échec de l’enregistrement PNG.', error);
        showNotification('Impossible d’enregistrer le plan en PNG.', 'error');
    }
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
        const title = mode === '3d' ? 'Plan 3D' : 'Plan 2D';
        printWindow.document.open();
        printWindow.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + title +
            ' — Clic & Volt</title><style id="print-style">@page{size:landscape;margin:10mm}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#fff;color:#0f172a;font:14px Arial,sans-serif}.toolbar{display:flex;align-items:center;gap:10px;margin:0 0 8px}.toolbar label{font-weight:600}.toolbar button,.toolbar select{font:inherit;padding:5px 10px}h1{font-size:16px;margin:0 auto 0 0}.plan{display:block;width:100%;height:calc(100vh - 38mm);object-fit:contain;break-inside:avoid;page-break-inside:avoid}@media print{.toolbar{display:none!important}.plan{height:calc(100vh - 20mm);width:100%;object-fit:contain}}</style></head><body><div class="toolbar"><h1>Clic & Volt — ' +
            title + '</h1><label for="orientation">Orientation</label><select id="orientation"><option value="landscape" selected>Paysage</option><option value="portrait">Portrait</option></select><button id="print-button" type="button" disabled>Imprimer / Enregistrer en PDF</button></div><img class="plan" id="plan" alt="' +
            title + '"></body></html>');
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
            printWindow.document.getElementById('print-style').textContent =
                '@page{size:' + orientation.value + ';margin:10mm}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#fff;color:#0f172a;font:14px Arial,sans-serif}.toolbar{display:flex;align-items:center;gap:10px;margin:0 0 8px}.toolbar label{font-weight:600}.toolbar button,.toolbar select{font:inherit;padding:5px 10px}h1{font-size:16px;margin:0 auto 0 0}.plan{display:block;width:100%;height:calc(100vh - 38mm);object-fit:contain;break-inside:avoid;page-break-inside:avoid}@media print{.toolbar{display:none!important}.plan{height:calc(100vh - 20mm);width:100%;object-fit:contain}}';
        });
        printWindow.document.getElementById('print-button').addEventListener('click', () => {
            printWindow.focus();
            printWindow.print();
        });
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
                    ensureProjectDefaults();
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
