// Scène 3D (Three.js) : initialisation, caméra, maillages, câblage automatique et interactions souris.
// Script classique : les fonctions sont globales et utilisent l'état partagé défini dans index.html
// (threeScene, threeCamera, threeRenderer, threeControls, projectData, interactiveObjects3D, ...).

function init3DScene() {
    const container = document.getElementById('three-container');
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(currentTheme === 'light' ? 0xe2e8f0 : 0x020617);

    threeCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    threeCamera.position.set(0, 500, 600);

    // Profondeur logarithmique (B2) : précision suffisante à 1 cm près, même pour les appareils collés aux murs
    threeRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    threeRenderer.shadowMap.enabled = true;
    container.appendChild(threeRenderer.domElement);

    threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
    threeControls.enableDamping = true;
    threeControls.dampingFactor = 0.05;
    threeControls.minDistance = 3;   // zoom avant très proche de l'élément
    threeControls.maxDistance = 3000;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(400, 800, 400);
    threeScene.add(dirLight);

    threeRenderer.domElement.addEventListener('pointerdown', on3DPointerDown);
    threeRenderer.domElement.addEventListener('pointermove', on3DPointerMove);
    threeRenderer.domElement.addEventListener('pointerleave', hidePlanTooltip);
    threeRenderer.domElement.addEventListener('pointerup', on3DPointerUp);
    // tracé de mur 3D : clic droit = terminer la chaîne (le menu contextuel est masqué dans ce mode)
    threeRenderer.domElement.addEventListener('contextmenu', e => {
        if (activePlacementType !== 'wall') return;
        e.preventDefault();
        if (wallDraft3D) endWallTrace3D();
    });
    window.addEventListener('resize', on3DWindowResize);
    animate3D();
}

function on3DWindowResize() {
    const container = document.getElementById('three-container');
    if (!container || !threeRenderer || !threeCamera) return;
    threeCamera.aspect = container.clientWidth / container.clientHeight;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
}

function animate3D() {
    requestAnimationFrame(animate3D);
    if (threeControls && !dragging3DElementId) threeControls.update();
    if (threeRenderer && threeScene && threeCamera) {
        threeRenderer.render(threeScene, threeCamera);
    }
}

function setCameraView(view) {
    const center = new THREE.Vector3(0, 100, 0);
    if (view === 'iso') {
        threeCamera.position.set(0, 500, 600);
    } else if (view === 'top') {
        threeCamera.position.set(0, 800, 0.1);
    } else if (view === 'front') {
        threeCamera.position.set(0, 100, 700);
    } else if (view === 'side') {
        threeCamera.position.set(700, 100, 0);
    }
    threeCamera.lookAt(center);
    if (threeControls) threeControls.target.copy(center);
}

// Entrée en 3D : la caméra recule pour montrer tout le projet (étendue des murs et hauteur des étages)
function frame3DOnProject() {
    if (!threeCamera || !threeControls) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wallsOn().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    });
    const halfW = isFinite(minX) ? (maxX - minX) / 2 + 150 : 400;
    const halfD = isFinite(minY) ? (maxY - minY) / 2 + 150 : 400;
    const levels = Math.max(1, (projectData.levels || []).length);
    const height = levels * 300;
    const radius = Math.max(Math.hypot(halfW, halfD), height * 0.6);
    const halfFov = (threeCamera.fov * Math.PI / 180) / 2;
    const dist = (radius / Math.sin(halfFov)) * 1.1;
    const centre = new THREE.Vector3(0, height / 2, 0);
    const dir = new THREE.Vector3(0, 500, 600).normalize();   // même angle que la vue isométrique
    threeCamera.position.copy(centre).addScaledVector(dir, dist);
    threeCamera.lookAt(centre);
    threeControls.maxDistance = Math.max(threeControls.maxDistance || 0, dist * 2);
    threeControls.target.copy(centre);
    threeControls.update();
}

// ---------- Fantôme de pose (3D) ----------
// Le vrai modèle de l'élément (prise, porte, plafonnier…), translucide, à l'endroit visé.
// Rouge : il y a déjà un élément identique à moins de 30 cm, la pose serait refusée.
let placeGhost3D = null;
let placeGhostKey3D = null;

function removePlaceGhost3D() {
    if (placeGhost3D) {
        if (threeScene) threeScene.remove(placeGhost3D);
        placeGhost3D.traverse(o => { if (o.isMesh && o.material) o.material.dispose(); });   // matériaux clonés seulement
    }
    placeGhost3D = null;
    placeGhostKey3D = null;
}

function makeGhostGroup3D(group, blocked) {
    group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.7;
        o.material.depthWrite = false;
        if (blocked && o.material.color) o.material.color.set(0xef4444);
    });
    group.userData = {};
    return group;
}

// Couleur qui se détache de celle donnée (noir sur couleur claire, blanc sur couleur sombre)
function contrastHex3D(css) {
    const c = new THREE.Color(css);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.6 ? 0x0f172a : 0xffffff;
}

// Trémie fantôme : colonne translucide (même emprise et même hauteur que la vraie trémie)
function createShaftGhost3D(sh, cx, cy) {
    const sp = shaftPos2D(sh);
    if (!sp) return null;
    const span = shaftSpan3D(sh);
    const s = sh.size || 40;
    const group = new THREE.Group();
    const pos = new THREE.Vector3(sp.x - cx, span.base + span.height / 2, sp.y - cy);
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, span.height, s), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    box.position.copy(pos);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xf8fafc }));
    edges.position.copy(pos);
    group.add(box, edges);
    return group;
}

function updatePlaceGhost3D(e) {
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse3D, threeCamera);
    const type = activePlacementType;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wallsOn().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    let ghost = null, blocked = false, wall = null;
    if (type === 'light_ceiling') {
        const hit = ceilingMesh3D ? raycaster.intersectObject(ceilingMesh3D) : [];
        if (hit.length) {
            const pt = hit[0].point;
            ghost = { id: '__ghost', levelId: activeLevelId, type, x: pt.x + cx, y: 245, z: pt.z + cy };
            blocked = !!ceilingSpotBlocker(ghost.x, ghost.z, activeLevelId);
        }
    } else if (type !== 'stair') {
        const wallIntersects = raycaster.intersectObjects(clickableWalls3D, true);
        if (wallIntersects.length) {
            let m = wallIntersects[0].object;
            while (m && (!m.userData || !m.userData.id) && m.parent) m = m.parent;
            wall = m && m.userData && m.userData.id ? projectData.walls.find(w => w.id === m.userData.id) : null;
            if (wall) {
                const hitPt = wallIntersects[0].point;
                const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
                const distToPt = Math.hypot(hitPt.x - (wall.x1 - cx), hitPt.z - (wall.y1 - cy));
                const distanceCm = Math.round(Math.max(10, Math.min(wallLen - 10, distToPt)));
                const localHit = m.worldToLocal(hitPt.clone());
                const side = localHit.x >= 0 ? 1 : -1;
                ghost = { id: '__ghost', levelId: activeLevelId, type, wallId: wall.id, distanceFromStart: distanceCm, side,
                    height: defaultHeightFor(type) };
                if (type === 'shaft') { ghost.size = 40; ghost.levelIds = [activeLevelId]; }
                if (type === 'door_single' || type === 'window_std') {
                    ghost.width = type === 'door_single' ? 96 : 120;
                    ghost.height = type === 'door_single' ? 210 : 120;
                    if (type === 'window_std') ghost.sillHeight = 90;
                    if (type === 'door_single') ghost.hingeSide = doorHingeForPlacement();
                }
                blocked = !!sameSpotBlocker(type, activeLevelId, wall.id, distanceCm);
            }
        }
    }
    if (!ghost) { removePlaceGhost3D(); return; }

    // reconstruction seulement si quelque chose a changé (pas à chaque mouvement de souris)
    const key = JSON.stringify([ghost, blocked]);
    if (key === placeGhostKey3D && placeGhost3D && placeGhost3D.parent === threeScene) return;   // encore présent dans la scène
    removePlaceGhost3D();
    const isOpening = type === 'door_single' || type === 'window_std';
    const mesh = type === 'shaft'
        ? createShaftGhost3D(ghost, cx, cy)
        : isOpening
            ? createOpeningMesh3D(ghost, wall, cx, cy)
            : createElementMesh3D(ghost, cx, cy);
    if (!mesh) return;
    placeGhost3D = makeGhostGroup3D(mesh, blocked);
    placeGhostKey3D = key;
    threeScene.add(placeGhost3D);
}

function setPlacementType(type) {
    removePlaceGhost3D();
    activePlacementType = activePlacementType === type ? null : type;
    wallDraft3D = null;
    wallCursor3D = null;
    updateWallPreview3D();
    document.querySelectorAll('.place-btn').forEach(btn => {
        btn.classList.remove('tool-active-yellow');
    });
    refreshPlacementHints();
    if (activePlacementType) {
        const btn = document.getElementById('btn-place-' + type);
        if (btn) btn.classList.add('tool-active-yellow');
    }
    refreshToolButtons();
    refreshToolHint();
}

function doorHingeForPlacement() {
    const selector = currentMode === '3d'
        ? document.getElementById('door-hinge-3d-placement')
        : document.getElementById('door-hinge-placement');
    return selector && selector.value === 'right' ? 'right' : 'left';
}

function getElCoords(el) {
    if (el.type === 'light_ceiling') {
        return { x: el.x, y: el.z, z: el.y || 245 };
    }
    
    const wall = projectData.walls.find(w => w.id === el.wallId);
    if (!wall) return { x: 0, y: 0, z: el.height || 0 };
    
    const wx1 = wall.x1, wz1 = wall.y1;
    const wx2 = wall.x2, wz2 = wall.y2;
    const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);
    
    let distFromStart = el.distanceFromStart !== undefined ? el.distanceFromStart : wallLen / 2;
    distFromStart = Math.max(5, Math.min(wallLen - 5, distFromStart));
    
    const t = wallLen > 0 ? distFromStart / wallLen : 0.5;
    const posX = wx1 + t * (wx2 - wx1);
    const posY = wz1 + t * (wz2 - wz1); 
    const angle = Math.atan2(wz2 - wz1, wx2 - wx1);
    
    const side = el.side !== undefined ? el.side : 1;
    const offsetDist = ((wall.thickness || 10) / 2) + 1;
    
    // Fixed perpendicular offset calculation so elements stay correctly oriented
    const perpX = Math.sin(angle);
    const perpY = -Math.cos(angle);
    
    return {
        x: posX + perpX * side * offsetDist,
        y: posY + perpY * side * offsetDist,
        z: el.height || (el.type === 'panel' ? 150 : el.type === 'wall_light' ? 180 : el.type.startsWith('outlet') ? 30 : 110)
    };
}

function findNearestElement(target, allowedTypes) {
    let nearest = null;
    let minDistance = Infinity;
    const targetCoords = getElCoords(target);

    electricalOn().forEach(el => {
        if (allowedTypes.includes(el.type) && el.id !== target.id) {
            const elCoords = getElCoords(el);
            const dist = Math.hypot(elCoords.x - targetCoords.x, elCoords.y - targetCoords.y);
            if (dist < minDistance && dist < 600) {
                minDistance = dist;
                nearest = el;
            }
        }
    });
    return nearest;
}

// =====================================================================
//  CÂBLAGE AUTOMATIQUE v3
//  - graphe de pistes le long des murs (niveau bas à hauteur des prises) et du plafond
//  - passages de cloison possibles tous les 60 cm (jamais à travers une ouverture)
//  - ouvertures (portes ET fenêtres) prises en compte selon leur hauteur : ni gaine horizontale
//    ni colonne verticale dans leur emprise
//  - arbre de câblage minimal par circuit (chaque appareil se raccorde au plus proche déjà alimenté),
//    distances mesurées sur le trajet réel des gaines
// =====================================================================
const CABLE_CFG = {
    trackOffset: 5.5,   // axe de la gaine à 5.5 cm de la face du mur (rayon max 5 cm => jamais dans le mur)
    lowZ: 30,           // cheminement bas : à hauteur des prises (une prise à 30 cm se raccorde sans descente)
    ceilGap: 8,         // cheminement haut = juste sous le plafond
    crossStep: 60,      // pas des traversées de cloison possibles (cm)
    crossPenalty: 12,   // coût fictif (cm) : on ne perce un mur que si cela fait gagner de la longueur
    openMargin: 8,      // marge autour des ouvertures (rayon de gaine + cadre)
    maxDegree: 3,       // câbles maximum arrivant sur un même boîtier d'appareil (repiquage)
    lightLinks: 3,      // points de raccordement testés par plafonnier
    maxRadius: 5
};
const CABLE_RES = {};
let cableStats = { segments: [], linkCount: 0, unrouted: 0 };

function markShared(o) {
    o.userData = o.userData || {};
    o.userData.shared = true;
    return o;
}

function disposeSceneObject(o) {
    const isShared = r => r && r.userData && r.userData.shared;
    o.traverse(c => {
        if (c.userData && c.userData.shared) return;   // ressources partagées (gaines, modèles d'appareils)
        if (c.geometry && !isShared(c.geometry)) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { if (!isShared(m)) m.dispose(); });
    });
}

// Emprise d'une ouverture sur son mur : position, demi-largeur, hauteurs d'allège et de linteau
function openingBox(op, wall) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const isDoor = op.type === 'door_single';
    let d = op.distanceFromStart !== undefined ? op.distanceFromStart : (op.positionRatio !== undefined ? op.positionRatio * len : len / 2);
    d = Math.max(10, Math.min(len - 10, d));
    const width = op.width || (isDoor ? 96 : 120);
    const sill = isDoor ? 0 : (op.sillHeight !== undefined ? op.sillHeight : 90);
    const top = isDoor ? 210 : sill + (op.height || 120);
    return { d, half: width / 2, z0: sill, z1: top, isDoor };
}

// Position de la charnière dans le repère du mur (x local : du départ vers la fin du mur).
// Convention « poussant » (cf. schéma DP / GP) : on regarde la porte de face, depuis le côté opposé au côté de pose,
// la porte s'ouvrant en s'éloignant de vous. Côté A (side = 1) : « gauche » = côté départ du mur ;
// côté B (side = -1), on regarde le mur dans l'autre sens, d'où l'inversion.
// Résultat : -1 = charnière côté départ du mur, +1 = côté fin.
function doorHingeSign(op) {
    return (op.hingeSide === 'right' ? 1 : -1) * (op.side === -1 ? -1 : 1);
}

class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(p, v) {
        const a = this.a;
        a.push([p, v]);
        let i = a.length - 1;
        while (i > 0) {
            const q = (i - 1) >> 1;
            if (a[q][0] <= a[i][0]) break;
            [a[q], a[i]] = [a[i], a[q]];
            i = q;
        }
    }
    pop() {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < a.length && a[l][0] < a[m][0]) m = l;
                if (r < a.length && a[r][0] < a[m][0]) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]];
                i = m;
            }
        }
        return top;
    }
}

// Calcule le réseau de gaines (coordonnées plan : x, y = plan, z = hauteur). Aucune dépendance à THREE.
// D5b : pour un étage sans tableau, la trémie reliée au niveau du tableau sert de source (pseudo-tableau à son mur)
// Hauteur du point de dérivation d'une trémie à un niveau (cm, 150 par défaut)
const DERIV_BOX_H = 14;   // hauteur de la boîte de dérivation (cm)
function levelCeilingOf(levelId) {
    const lv = (projectData.levels || []).find(l => l.id === levelId);
    return lv && Number.isFinite(Number(lv.ceilingHeight)) ? Number(lv.ceilingHeight) : 250;
}
// Le centre de la boîte reste dans la pièce : son sommet ne dépasse jamais le plafond
function derivHeightOf(sh, levelId) {
    const h = sh.derivHeight && sh.derivHeight[levelId];
    const wanted = Number.isFinite(h) ? h : 150;
    return Math.min(wanted, levelCeilingOf(levelId) - DERIV_BOX_H / 2);
}

// Position du point de dérivation le long du mur de la trémie, par niveau (cm) ; par défaut, celle de la trémie
// Le point reste dans l'ouverture de la trémie (la gaine ne se prolonge pas au-delà) : bord de la boîte compris
function clampDerivDist(sh, d) {
    const half = (sh.size || 40) / 2;
    return Math.max(sh.distanceFromStart - half + DERIV_BOX_H / 2, Math.min(sh.distanceFromStart + half - DERIV_BOX_H / 2, d));
}
// La boîte de dérivation reste fixe dans la largeur de la trémie : elle est toujours au centre
function derivDistOf(sh, levelId) {
    return sh.distanceFromStart;
}

// Trémies reliant deux niveaux, de la plus proche à la plus éloignée des appareils de référence (somme des distances en plan)
function shaftCandidatesBetween(levelA, levelB, refs) {
    const cands = (projectData.shafts || []).filter(s => {
        const ids = s.levelIds || [s.levelId];
        return ids.includes(levelA) && ids.includes(levelB);
    });
    return cands.map(sh => {
        const pt = shaftPos2D(sh);
        const cost = pt ? refs.reduce((acc, ref) => { const E = getElCoords(ref); return acc + Math.hypot(pt.x - E.x, pt.y - E.y); }, 0) : Infinity;
        return { sh, cost };
    }).sort((p, q) => p.cost - q.cost).map(c => c.sh);
}

// Une trémie relie deux niveaux si elle a un mur utilisable sur chacun d'eux
function shaftValidOn(sh, levelId) {
    const saved = activeLevelId;
    try {
        activeLevelId = levelId;
        const pt = shaftPos2D(sh, derivDistOf(sh, levelId));
        const info = pt && nearestWallInfo(pt);
        return !!info && info.d <= (sh.size || 40) / 2 + 10;
    } finally {
        activeLevelId = saved;
    }
}

// Arbre des niveaux vers le niveau du tableau (parcours en largeur depuis le tableau) :
// chaque niveau garde la trémie qui le relie au niveau « plus proche du tableau ». Même arbre des deux côtés, donc tracé cohérent.
function levelTreeToPanel(panelLevelId) {
    const adj = new Map();
    (projectData.shafts || []).forEach(sh => {
        const ids = (sh.levelIds && sh.levelIds.length ? sh.levelIds : [sh.levelId]).filter(Boolean);
        if (ids.length < 2) return;
        ids.forEach(a => ids.forEach(b => {
            if (a === b) return;
            if (!shaftValidOn(sh, a) || !shaftValidOn(sh, b)) return;
            if (!adj.has(a)) adj.set(a, []);
            adj.get(a).push({ to: b, shaft: sh.id });
        }));
    });
    const parent = new Map();
    const seen = new Set([panelLevelId]);
    const queue = [panelLevelId];
    while (queue.length) {
        const cur = queue.shift();
        (adj.get(cur) || []).forEach(e => {
            if (seen.has(e.to)) return;
            seen.add(e.to);
            parent.set(e.to, { to: cur, shaft: e.shaft });
            queue.push(e.to);
        });
    }
    return parent;
}

// Suite des trémies (dans l'ordre) qui relie un niveau au tableau ; null si aucun chemin
function hopsToPanel(levelId, tree, panelLevelId) {
    const hops = [];
    let cur = levelId;
    let guard = 0;
    while (cur !== panelLevelId) {
        const p = tree.get(cur);
        if (!p || guard++ > 50) return null;
        hops.push({ from: cur, to: p.to, shaft: p.shaft });
        cur = p.to;
    }
    return hops;
}

// Circuits (identifiants) dont les appareils d'un niveau sont présents sur ce niveau
function circuitIdsOfLevel(levelId) {
    const ids = new Set();
    electricalOn(levelId).filter(isCircuitPoint).forEach(el => { const c = circuitOf(el); if (c) ids.add(c.id); });
    return [...ids];
}

// Circuits qui empruntent une liaison verticale de trémie (du niveau from vers to)
function circuitsOnHop(hop, tree, panelLevelId) {
    const ids = new Set();
    (projectData.levels || []).forEach(lv => {
        const path = hopsToPanel(lv.id, tree, panelLevelId);
        if (!path || !path.some(h => h.from === hop.from && h.to === hop.to && h.shaft === hop.shaft)) return;
        circuitIdsOfLevel(lv.id).forEach(cid => ids.add(cid));
    });
    return [...ids];
}

// Circuits qui arrivent à ce niveau par la trémie donnée (depuis un niveau plus éloigné du tableau)
function circuitsEnteringLevel(levelId, shaftId, tree, panelLevelId) {
    const ids = new Set();
    (projectData.levels || []).forEach(lv => {
        if (lv.id === levelId) return;
        const path = hopsToPanel(lv.id, tree, panelLevelId);
        if (!path || !path.some(h => h.to === levelId && h.shaft === shaftId)) return;
        circuitIdsOfLevel(lv.id).forEach(cid => ids.add(cid));
    });
    return [...ids];
}

function shaftFeedFor(levelId) {
    const panelEl = projectData.electrical.find(e => e.type === 'panel');
    if (!panelEl) return { feed: null, reason: 'none' };
    if (levelId === panelEl.levelId) {
        // niveau du tableau lui-même : sa trémie de dérivation vers un autre étage (sert à l'affichage)
        const sh = (projectData.shafts || []).find(s => (s.levelIds || []).length >= 2 && s.levelIds.includes(levelId) && shaftValidOn(s, levelId));
        if (!sh) return { feed: null, reason: 'noShaft' };
        const pt = shaftPos2D(sh, derivDistOf(sh, levelId));
        const info = pt && nearestWallInfo(pt);
        if (!info) return { feed: null, reason: 'noWall' };
        const feed = { id: 'feed_' + sh.id, type: 'panel', levelId, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), height: derivHeightOf(sh, levelId), side: info.side, isFeed: true };
        return { feed, reason: null, shaft: sh, nextLevelId: sh.levelIds.find(id => id !== levelId), panelLevelId: levelId, tree: null };
    }
    const tree = levelTreeToPanel(panelEl.levelId);
    const step = tree.get(levelId);
    if (!step) return { feed: null, reason: 'noShaft' };
    const sh = (projectData.shafts || []).find(s => s.id === step.shaft);
    if (!sh) return { feed: null, reason: 'noShaft' };
    const pt = shaftPos2D(sh, derivDistOf(sh, levelId));
    const info = pt && nearestWallInfo(pt);
    if (!info) return { feed: null, reason: 'noWall' };
    const feed = { id: 'feed_' + sh.id, type: 'panel', levelId, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), height: derivHeightOf(sh, levelId), side: info.side, isFeed: true };
    return { feed, reason: null, shaft: sh, nextLevelId: step.to, panelLevelId: panelEl.levelId, tree };
}

// Pseudo-élément placé à la trémie qui joint deux niveaux (même logique que le pseudo-tableau d'un étage)
// refs : les deux appareils de la commande ; même choix de trémie des deux côtés, donc tracé cohérent
function shaftProxyOn(levelId, otherLevelId, proxyId, type, height, refs) {
    for (const sh of shaftCandidatesBetween(levelId, otherLevelId, refs)) {
        const pt = shaftPos2D(sh, derivDistOf(sh, levelId));
        const info = pt && nearestWallInfo(pt);
        if (info && info.d <= (sh.size || 40) / 2 + 10) {
            return { id: proxyId, type, levelId, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), height: derivHeightOf(sh, levelId), side: info.side, isProxy: true };
        }
    }
    return null;
}

// Commande entre niveaux (ex. va-et-vient RDC / sous-sol) : la liaison est coupée à la trémie.
// Côté interrupteur : une lumière d'un autre niveau devient un point de raccord « xl| » à la trémie.
// Côté lumière : un interrupteur d'un autre niveau devient un point de raccord « xs| » à la trémie.
function crossLevelControlProxies(result) {
    const here = electricalOn();
    const hereIds = new Set(here.map(e => e.id));
    const lightsHere = here.filter(e => e.type === 'light_ceiling' || e.type === 'wall_light');
    const proxies = [];
    here.filter(isLightingControl).forEach(sw => {
        (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).forEach(lid => {
            if (hereIds.has(lid)) return;
            const light = projectData.electrical.find(e => e.id === lid && (e.type === 'light_ceiling' || e.type === 'wall_light'));
            if (!light) return;
            const pos = shaftProxyOn(activeLevelId, light.levelId, 'xl|' + lid, 'wall_light', 110, [sw, light]);
            if (!pos) {
                result.warnings.push('Commande de ' + electricalDisplayName(light) + ' (autre niveau) : aucune trémie entre les deux niveaux');
                return;
            }
            pos.realId = lid;
            proxies.push(pos);
        });
    });
    projectData.electrical.filter(e => isLightingControl(e) && !hereIds.has(e.id)).forEach(sw => {
        const mine = (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).filter(lid => lightsHere.some(l => l.id === lid));
        if (!mine.length) return;
        const pos = shaftProxyOn(activeLevelId, sw.levelId, 'xs|' + sw.id, 'switch_simple', 110,
            [sw, lightsHere.find(l => l.id === mine[0])]);
        if (!pos) return;
        pos.realId = sw.id;
        pos.controlledLightIds = mine;
        proxies.push(pos);
    });
    return proxies;
}

// Point de dérivation de chaque trémie qui relie cet étage à un autre : là où la gaine se raccorde à cet étage
function derivationPointsOn(levelId) {
    const out = [];
    shaftsOn(levelId).forEach(sh => {
        if ((sh.levelIds || [sh.levelId]).length < 2) return;
        // mur de CE niveau le plus proche du point de la trémie (le mur de la trémie peut être à un autre étage)
        const pt = shaftPos2D(sh, derivDistOf(sh, levelId));
        const info = pt && nearestWallInfo(pt);
        if (!info || info.d > (sh.size || 40) / 2 + 10) return;
        out.push({ id: 'dv|' + sh.id, type: 'derivation', levelId, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), height: derivHeightOf(sh, levelId), side: info.side, isProxy: true });
    });
    return out;
}

function computeCableNetwork() {
    ensureCircuitAssignment();
    const C = CABLE_CFG;
    const walls = wallsOn().filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1);
    // faces extérieures : les gaines et les fils restent à l'intérieur du logement
    const outFaces = outsideFacesOf();
    const els = electricalOn();
    const result = { segments: [], linkCount: 0, unrouted: 0, linkInfo: [], circuitRuns: {}, warnings: [], controlLinks: [], boxServed: {} };
    let panel = els.find(e => e.type === 'panel') || null;
    const wired = els.filter(e => e.type !== 'panel');
    let feedInfo = null;   // niveau sans tableau : trémie qui le relie au tableau d'un autre étage
    // un niveau sans appareil mais avec une trémie vers un autre étage doit aussi être raccordé (ses trémies passent les circuits)
    const hasShaftLinks = wired.length > 0 || derivationPointsOn(activeLevelId).length > 0;
    if (!panel && hasShaftLinks) {
        const fed = shaftFeedFor(activeLevelId);
        feedInfo = fed;
        panel = fed.feed;
        if (!panel) {
            if (!wired.length) return result;   // étage sans appareil ni trémie utilisable : rien à signaler
            result.unrouted += wired.length;
            result.warnings.push(fed.reason === 'noWall'
                ? 'Trémie sans mur à cet étage : appareils non reliés'
                : 'Pas de tableau ni de trémie vers le tableau à cet étage : appareils non reliés');
            return result;
        }
    }
    // commandes entre niveaux : points de raccord à la trémie, traités comme des appareils du niveau
    const crossProxies = crossLevelControlProxies(result);
    wired.push(...crossProxies);
    // points de dérivation : chacun est raccordé au tableau de cet étage par le câble de la gaine
    const derivPts = derivationPointsOn(activeLevelId);
    wired.push(...derivPts);
    if (!walls.length || !panel || !wired.length) return result;
    // le pseudo-tableau d'une trémie est traité comme un appareil du niveau
    const allEls = (panel.isFeed ? els.concat([panel]) : els).concat(crossProxies, derivPts);

    const ceilZ = Math.min(...walls.map(w => w.height || 250)) - C.ceilGap;
    const levels = [{ kind: 'low', z: C.lowZ }, { kind: 'ceil', z: ceilZ }];

    // 1. Pistes : une par mur et par face, décalées de la face du mur
    const tracks = [];
    walls.forEach(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len, nx = uy, ny = -ux, th = w.thickness || 10;
        const ext = th + 10;   // prolongement pour retrouver les angles
        const outs = outFaces.faces.get(w.id) || [];
        [1, -1].forEach(side => {
            if (outs.length === 1 && outs[0] === side) return;   // mur extérieur : pas de piste sur la face extérieure
            const off = side * (th / 2 + C.trackOffset);
            // stations seulement sur le mur : aucun tronçon ne dépasse un angle vers l'extérieur
            tracks.push({ wall: w, side, len, ux, uy, ox: w.x1 + nx * off, oy: w.y1 + ny * off, t0: -ext, t1: len + ext, st: [0, len] });
        });
    });
    const P = (t, s) => ({ x: t.ox + t.ux * s, y: t.oy + t.uy * s });
    // mur extérieur : la face extérieure n'a pas de piste, on prend la piste intérieure
    const trackOf = (w, side) => tracks.find(t => t.wall === w && t.side === side) || tracks.find(t => t.wall === w);
    const twoFaces = w => tracks.filter(t => t.wall === w).length === 2;

    // 2. Intersections entre pistes (angles, T, croisements)
    const junctions = [];
    const coincident = [];
    for (let i = 0; i < tracks.length; i++) {
        for (let j = i + 1; j < tracks.length; j++) {
            const a = tracks[i], b = tracks[j];
            if (a.wall === b.wall) continue;
            const dxo = b.ox - a.ox, dyo = b.oy - a.oy;
            const det = -a.ux * b.uy + b.ux * a.uy;
            if (Math.abs(det) < 1e-6) {
                if (Math.abs(dxo * a.uy - dyo * a.ux) < 0.5) coincident.push([a, b]);
                continue;
            }
            const s = (-dxo * b.uy + b.ux * dyo) / det;
            const u = (a.ux * dyo - a.uy * dxo) / det;
            if (s < a.t0 || s > a.t1 || u < b.t0 || u > b.t1) continue;
            a.st.push(s);
            b.st.push(u);
            junctions.push({ p: P(a, s), a, s, b, u });
        }
    }

    // 3. Ouvertures : emprises (avec marge) sur chaque mur
    const m = C.openMargin;
    const spans = new Map();
    walls.forEach(w => {
        const list = openingsOn().filter(o => o.wallId === w.id).map(o => {
            const b = openingBox(o, w);
            return { lo: b.d - b.half - m, hi: b.d + b.half + m, z0: b.z0 - m, z1: b.z1 + m };
        });
        spans.set(w.id, list);
        tracks.filter(t => t.wall === w).forEach(t => list.forEach(sp => t.st.push(sp.lo, sp.hi)));
    });
    // gaine horizontale à la hauteur z entre s0 et s1 ?
    const blockedH = (wid, s0, s1, z) => spans.get(wid).some(sp => s1 > sp.lo + 0.01 && s0 < sp.hi - 0.01 && z >= sp.z0 && z <= sp.z1);
    // colonne verticale à la position s entre les hauteurs za et zb ?
    const blockedV = (wid, s, za, zb) => spans.get(wid).some(sp => s > sp.lo && s < sp.hi && Math.max(za, zb) >= sp.z0 && Math.min(za, zb) <= sp.z1);

    // 4. Position de la descente verticale de chaque appareil mural
    const place = new Map();
    allEls.forEach(el => {
        if (el.type === 'light_ceiling') return;
        const w = walls.find(x => x.id === el.wallId);
        if (!w) return;
        const t = trackOf(w, el.side === -1 ? -1 : 1);
        const E = getElCoords(el);
        let dist = el.distanceFromStart !== undefined ? el.distanceFromStart : t.len / 2;
        dist = Math.max(5, Math.min(t.len - 5, dist));
        const zEl = Math.max(C.lowZ, Math.min(ceilZ, E.z));
        const list = spans.get(w.id);
        const own = list.find(sp => dist > sp.lo && dist < sp.hi && E.z >= sp.z0 && E.z <= sp.z1) || null;
        const stubOK = (r) => !list.some(sp => sp !== own && Math.max(r, dist) > sp.lo && Math.min(r, dist) < sp.hi && E.z >= sp.z0 && E.z <= sp.z1);
        // Keep the vertical drop above the device unless an opening blocks that position.
        const cands = [dist];
        list.forEach(sp => cands.push(sp.lo - 0.5, sp.hi + 0.5));
        const valid = cands
            .filter(r => r >= 10 && r <= t.len - 10 && !blockedV(w.id, r, C.lowZ, ceilZ) && stubOK(r))
            .sort((p, q) => Math.abs(p - dist) - Math.abs(q - dist) || q - p);
        let r = valid.length ? valid[0] : Math.max(10, Math.min(t.len - 10, dist));
        if (!valid.length) result.warnings.push('Aucune descente possible pour ' + electricalDisplayName(el));
        t.st.push(r);
        place.set(el.id, { t, E, dist, r, zEl });
    });

    // 5. Pistes colinéaires (murs alignés) : on partage leurs stations pour que les nœuds coïncident
    coincident.forEach(([a, b]) => {
        const sa = a.st.slice(), sb = b.st.slice();
        const push = (from, to, list) => list.forEach(s => {
            const p = P(from, s);
            const u = (p.x - to.ox) * to.ux + (p.y - to.oy) * to.uy;
            if (u >= to.t0 && u <= to.t1) to.st.push(u);
        });
        push(a, b, sa);
        push(b, a, sb);
    });

    // 6. Stations de passage de cloison : les deux faces d'un mur partagent les mêmes stations
    walls.forEach(w => {
        if (!twoFaces(w)) return;
        const tA = trackOf(w, 1), tB = trackOf(w, -1);
        const S = new Set();
        [tA, tB].forEach(t => t.st.forEach(s => S.add(Math.round(s * 100) / 100)));
        for (let s = C.crossStep; s < tA.len - 10; s += C.crossStep) S.add(s);
        S.forEach(s => {
            if (s >= tA.t0 && s <= tA.t1) { tA.st.push(s); tB.st.push(s); }
        });
    });

    // 7. Graphe
    const nodes = new Map();
    const nodeBuckets = new Map();
    const edgeKeys = new Set();
    const allEdges = [];
    const key = (x, y, z) => Math.round(x * 10) + '|' + Math.round(y * 10) + '|' + Math.round(z * 10);
    const bucketKey = (x, y, z) => Math.floor(x) + '|' + Math.floor(y) + '|' + Math.floor(z);
    // Independently computed junctions can differ by a few millimetres due to floating-point rounding.
    // B2 : on ne visite que les cases pouvant contenir un point à moins de 0,2 (même ordre, même résultat)
    const findNode = (x, y, z) => {
        for (let ix = Math.floor(x - 0.2); ix <= Math.floor(x + 0.2); ix++) {
            for (let iy = Math.floor(y - 0.2); iy <= Math.floor(y + 0.2); iy++) {
                for (let iz = Math.floor(z - 0.2); iz <= Math.floor(z + 0.2); iz++) {
                    const bucket = nodeBuckets.get(ix + '|' + iy + '|' + iz) || [];
                    const found = bucket.find(n => Math.hypot(n.x - x, n.y - y, n.z - z) <= 0.2);
                    if (found) return found;
                }
            }
        }
        return null;
    };
    let nodeId = 0;
    const node = (x, y, z) => {
        let n = findNode(x, y, z);
        if (n) return n;
        const k = key(x, y, z) + '#' + nodeId++;
        n = { k, x, y, z, adj: [], light: false };
        nodes.set(k, n);
        const bucket = bucketKey(x, y, z);
        if (!nodeBuckets.has(bucket)) nodeBuckets.set(bucket, []);
        nodeBuckets.get(bucket).push(n);
        return n;
    };
    const addEdge = (n1, n2, kind, extraCost) => {
        if (n1 === n2) return null;
        const ek = n1.k < n2.k ? n1.k + '~' + n2.k : n2.k + '~' + n1.k;
        if (edgeKeys.has(ek)) return null;
        edgeKeys.add(ek);
        const len = Math.hypot(n2.x - n1.x, n2.y - n1.y, n2.z - n1.z);
        const e = { a: n1, b: n2, len, kind, dead: false, cost: len + (extraCost || 0) };
        n1.adj.push(e);
        n2.adj.push(e);
        allEdges.push(e);
        return e;
    };
    // géométrie des murs calculée une seule fois (B2) : mêmes opérations que l'ancienne version, résultat identique
    const wallGeo = walls.map(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        return { x1: w.x1, y1: w.y1, len, ux: dx / len, uy: dy / len, half: (w.thickness || 10) / 2 + 1 };
    });
    const insideBody = (x, y) => {
        for (let i = 0; i < wallGeo.length; i++) {
            const g = wallGeo[i];
            const s = (x - g.x1) * g.ux + (y - g.y1) * g.uy;
            const d = Math.abs(-(x - g.x1) * g.uy + (y - g.y1) * g.ux);
            if (s > -0.5 && s < g.len + 0.5 && d < g.half) return true;
        }
        return false;
    };
    const segmentHitsWall = (x1, y1, x2, y2) => {
        for (let i = 1; i < 12; i++) {
            const f = i / 12;
            if (insideBody(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)) return true;
        }
        return false;
    };

    tracks.forEach(t => {
        const ss = t.st.slice().sort((p, q) => p - q).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.3);
        for (let k = 0; k < ss.length - 1; k++) {
            const s0 = ss[k], s1 = ss[k + 1];
            if (s1 - s0 < 0.5) continue;
            const samples = [0.25, 0.5, 0.75].map(f => P(t, s0 + (s1 - s0) * f));
            if (samples.some(p => insideBody(p.x, p.y))) continue;      // ne traverse jamais un mur
            const p0 = P(t, s0), p1 = P(t, s1);
            levels.forEach(L => {
                if (blockedH(t.wall.id, s0, s1, L.z)) return;           // ni devant une porte, ni devant une fenêtre
                addEdge(node(p0.x, p0.y, L.z), node(p1.x, p1.y, L.z), L.kind);
            });
        }
    });

    // Passages de cloison : un par station et par niveau, là où le mur est plein
    walls.forEach(w => {
        if (!twoFaces(w)) return;
        const tA = trackOf(w, 1), tB = trackOf(w, -1);
        const ss = tA.st.slice().sort((p, q) => p - q).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.3);
        ss.forEach(s => {
            if (s < 10 || s > tA.len - 10) return;
            const pa = P(tA, s), pb = P(tB, s);
            if (insideBody(pa.x, pa.y) || insideBody(pb.x, pb.y)) return;
            levels.forEach(L => {
                if (blockedH(w.id, s - 0.01, s + 0.01, L.z)) return;
                const na = findNode(pa.x, pa.y, L.z), nb = findNode(pb.x, pb.y, L.z);
                if (na && nb) addEdge(na, nb, 'cross', C.crossPenalty);
            });
        });
    });

    // Bouts de murs voisins non jointifs (angle pas tout à fait fermé) : un petit raccord les relie, au lieu
    // de faire faire le tour complet du logement au câble. Pas de raccord si un mur sépare les deux points.
    const bridgeMax = 40;   // cm
    const ends = [];
    tracks.forEach(t => [0, t.len].forEach(s => ends.push({ t, p: P(t, s) })));
    for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
            const a = ends[i], b = ends[j];
            if (a.t.wall === b.t.wall) continue;
            const d = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y);
            if (d < 0.5 || d > bridgeMax) continue;
            if (insideBody(a.p.x, a.p.y) || insideBody(b.p.x, b.p.y)) continue;
            if (segmentHitsWall(a.p.x, a.p.y, b.p.x, b.p.y)) continue;
            levels.forEach(L => addEdge(node(a.p.x, a.p.y, L.z), node(b.p.x, b.p.y, L.z), L.kind));
            [a, b].forEach(q => addEdge(node(q.p.x, q.p.y, C.lowZ), node(q.p.x, q.p.y, ceilZ), 'riser'));
        }
    }

    // Colonnes verticales dans les angles / jonctions (sauf devant une ouverture)
    junctions.forEach(j => {
        if (blockedV(j.a.wall.id, j.s, C.lowZ, ceilZ) || blockedV(j.b.wall.id, j.u, C.lowZ, ceilZ)) return;
        const lo = findNode(j.p.x, j.p.y, C.lowZ), hi = findNode(j.p.x, j.p.y, ceilZ);
        if (lo && hi) addEdge(lo, hi, 'riser');
    });

    // 8. Raccordement des appareils
    const stubLen = pts => {
        let l = 0;
        for (let k = 0; k < pts.length - 1; k++) l += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y, pts[k + 1].z - pts[k].z);
        return l;
    };
    const resolve = (el) => {
        const pl = place.get(el.id);
        if (pl) {
            const A = P(pl.t, pl.r), F = P(pl.t, pl.dist);
            const lo = node(A.x, A.y, C.lowZ), hi = node(A.x, A.y, ceilZ);
            let at;
            if (pl.zEl - C.lowZ < 1) { at = lo; addEdge(lo, hi, 'riser'); }
            else if (ceilZ - pl.zEl < 1) { at = hi; addEdge(lo, hi, 'riser'); }
            else { at = node(A.x, A.y, pl.zEl); addEdge(lo, at, 'riser'); addEdge(at, hi, 'riser'); }
            const stub = [pl.E, { x: F.x, y: F.y, z: pl.E.z }, { x: A.x, y: A.y, z: pl.E.z }];
            if (Math.abs(pl.zEl - pl.E.z) > 0.3) stub.push({ x: A.x, y: A.y, z: pl.zEl });
            return { node: at, stub };
        }
        if (el.type === 'light_ceiling') {
            const E = getElCoords(el);
            const list = [];
            allEdges.forEach(e => {
                if (e.dead || e.kind !== 'ceil') return;
                const abx = e.b.x - e.a.x, aby = e.b.y - e.a.y, l2 = abx * abx + aby * aby;
                let u = l2 ? ((E.x - e.a.x) * abx + (E.y - e.a.y) * aby) / l2 : 0;
                u = Math.max(0, Math.min(1, u));
                const px = e.a.x + abx * u, py = e.a.y + aby * u;
                const raw = l2 ? ((E.x - e.a.x) * abx + (E.y - e.a.y) * aby) / l2 : 0;
                list.push({ d: Math.hypot(E.x - px, E.y - py), e, u, px, py, perp: raw > 0 && raw < 1 });
            });
            list.sort((p, q) => p.d - q.d);
            // Un câble de plafonnier ne part jamais en diagonale : soit il rejoint un tronçon à sa perpendiculaire
            // (segment droit), soit, faute de perpendiculaire (plafonnier près d'un angle), il fait un coude à 90°.
            const lpath = (c) => {
                if (c.perp) return segmentHitsWall(E.x, E.y, c.px, c.py) ? null : [];
                if (Math.abs(c.px - E.x) < 0.5 || Math.abs(c.py - E.y) < 0.5) return segmentHitsWall(E.x, E.y, c.px, c.py) ? null : [];
                const opts = [[c.px, E.y], [E.x, c.py]];
                return opts.find(q => !segmentHitsWall(E.x, E.y, q[0], q[1]) && !segmentHitsWall(q[0], q[1], c.px, c.py)) || null;
            };
            const usable = list.filter(c => c.perp).length ? list.filter(c => c.perp) : list;
            const picks = [];
            for (const c of usable) {
                if (picks.length >= C.lightLinks) break;
                if (picks.length && c.d > usable[0].d + 200) break;
                const via = lpath(c);
                if (via === null) continue;
                if (picks.some(o => Math.hypot(o.px - c.px, o.py - c.py) < 30)) continue;
                c.via = via;
                picks.push(c);
            }
            if (!picks.length) return null;
            const ln = node(E.x, E.y, ceilZ);
            ln.light = true;
            picks.forEach(c => {
                let nd;
                if (c.u * c.e.len < 1) nd = c.e.a;
                else if ((1 - c.u) * c.e.len < 1) nd = c.e.b;
                else {
                    nd = node(c.px, c.py, ceilZ);
                    c.e.dead = true;
                    addEdge(c.e.a, nd, 'ceil');
                    addEdge(nd, c.e.b, 'ceil');
                }
                if (c.via.length) {
                    const mn = node(c.via[0], c.via[1], ceilZ);
                    addEdge(ln, mn, 'stub');
                    addEdge(mn, nd, 'stub');
                } else {
                    addEdge(ln, nd, 'stub');
                }
            });
            const stub = [E];
            if (Math.abs(ceilZ - E.z) > 0.3) stub.push({ x: E.x, y: E.y, z: ceilZ });
            return { node: ln, stub };
        }
        return null;
    };
    const R = new Map();
    allEls.forEach(el => R.set(el.id, resolve(el)));
    const unresolved = wired.filter(el => !R.get(el.id));
    result.unrouted += unresolved.length;
    if (!R.get(panel.id)) { result.unrouted += wired.length - unresolved.length; return result; }

    // 9. Plus courts chemins (Dijkstra, un passage par un plafonnier n'est jamais un raccourci)
    const maps = new Map();
    // Dijkstra sur tableaux indexés (B2) : même tas, mêmes relaxations dans le même ordre => mêmes distances et chemins
    const nodeCount = nodes.size;
    let nodeIdx = 0;
    nodes.forEach(n => { n.idx = nodeIdx++; });
    const mapFor = (src) => {
        let r = maps.get(src);
        if (r) return r;
        const D = new Float64Array(nodeCount).fill(Infinity);
        const P = new Array(nodeCount).fill(null);
        D[src.idx] = 0;
        const heap = new MinHeap();
        heap.push(0, src);
        while (heap.size) {
            const [d, n] = heap.pop();
            if (d > D[n.idx]) continue;
            if (n.light && n !== src) continue;
            for (const e of n.adj) {
                if (e.dead) continue;
                const o = e.a === n ? e.b : e.a;
                const nd = d + e.cost;
                if (nd < D[o.idx]) {
                    D[o.idx] = nd;
                    P[o.idx] = [n, e];
                    heap.push(nd, o);
                }
            }
        }
        r = {
            dist: {
                get: (n) => { const v = D[n.idx]; return v === Infinity ? undefined : v; },
                has: (n) => D[n.idx] !== Infinity
            },
            prev: { get: (n) => P[n.idx] || undefined }
        };
        maps.set(src, r);
        return r;
    };
    const rdist = (A, B) => {
        const ra = R.get(A.id), rb = R.get(B.id);
        if (!ra || !rb) return Infinity;
        const stubs = stubLen(ra.stub) + stubLen(rb.stub);
        if (ra.node === rb.node) return stubs;
        const d = mapFor(ra.node).dist.get(rb.node);
        return d === undefined ? Infinity : d + stubs;
    };

    // 10. Organisation des liaisons : appareils → unités à alimenter
    const std = ['red', 'blue', 'green-yellow'];
    const ret = ['orange', 'blue', 'green-yellow'];
    const alive = wired.filter(el => R.get(el.id));
    const switches = alive.filter(isLightingControl);
    const lights = alive.filter(el => el.type === 'light_ceiling' || el.type === 'wall_light');
    const ctrl = new Map(switches.map(sw => [sw.id, []]));
    const taken = new Set();
    const manuallyConfigured = new Set();
    switches.forEach(sw => {
        if (!Array.isArray(sw.controlledLightIds)) return;
        manuallyConfigured.add(sw.id);
        sw.controlledLightIds.forEach(id => {
            const light = lights.find(candidate => candidate.id === id || candidate.id === 'xl|' + id);
            if (light && isFinite(rdist(sw, light))) {
                ctrl.get(sw.id).push(light);
                taken.add(light.id);
            }
        });
    });
    // Chaque luminaire non affecté rejoint sa commande la plus proche, plutôt qu'un appariement global.
    lights.filter(light => !taken.has(light.id)).forEach(light => {
        let best = null;
        switches.filter(sw => !manuallyConfigured.has(sw.id)).forEach(sw => {
            const d = rdist(sw, light);
            if (d <= 500 && (!best || d < best.d)) best = { sw, d };
        });
        if (best) { ctrl.get(best.sw.id).push(light); taken.add(light.id); }
    });
    // Une seconde commande va-et-vient rejoint le point déjà desservi le plus proche.
    switches.filter(sw => !manuallyConfigured.has(sw.id) && sw.type === 'switch_va_et_vient' && !ctrl.get(sw.id).length).forEach(sw => {
        let best = null;
        lights.forEach(l => { const d = rdist(sw, l); if (isFinite(d) && (!best || d < best.d)) best = { l, d }; });
        if (best) ctrl.get(sw.id).push(best.l);
    });
    // identifiants réels pour l'interface ; les identifiants de raccord ne servent qu'au tracé
    result.controlLinks = switches.map(sw => ({
        switchId: sw.realId || sw.id,
        lightIds: ctrl.get(sw.id).map(light => light.realId || light.id),
        linkIds: ctrl.get(sw.id).map(light => controlCableLinkId(sw.id, light.id))
    }));

    // circuit d'une boîte posée : celui choisi dans son inspecteur, sinon l'éclairage
    const boxCircuitId = (jb) => {
        const c = projectData.circuits.find(x => x.id === (jb.circuitId || DEFAULT_CIRCUIT_BY_TYPE.light_ceiling));
        return c ? c.id : '_none';
    };
    const units = [];
    alive.filter(el => el.type.startsWith('outlet')).forEach(el => {
        const c = circuitOf(el);
        units.push({ cid: c ? c.id : null, entry: el, members: [], wires: std });
    });
    const lightingDefault = projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE.light_ceiling);
    switches.forEach(sw => {
        const ls = ctrl.get(sw.id);
        const c = ls.length ? circuitOf(ls[0]) : lightingDefault;
        units.push({ cid: c ? c.id : null, entry: sw, members: ls, wires: std });
    });
    lights.filter(l => !taken.has(l.id)).forEach(l => {
        const c = circuitOf(l);
        units.push({ cid: c ? c.id : null, entry: l, members: [], wires: std });
    });

    // 11. Arbre de câblage minimal par circuit (Prim sur les distances réelles de gaine)
    const used = new Map();
    const priv = new Map();
    const addPriv = (pts, wires, cid, relationId) => {
        for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.3) continue;
            const ka = key(a.x, a.y, a.z), kb = key(b.x, b.y, b.z);
            const pk = ka < kb ? ka + '~' + kb : kb + '~' + ka;
            if (!priv.has(pk)) priv.set(pk, { a, b, cables: [], cids: [], links: [] });
            const segment = priv.get(pk);
            segment.cables.push(wires);
            segment.cids.push(cid);
            if (relationId && !segment.links.includes(relationId)) segment.links.push(relationId);
        }
    };
    const addLink = (A, B, wires, cid) => {
        const ra = R.get(A.id), rb = R.get(B.id);
        const relationId = isLightingControl(A) && (B.type === 'light_ceiling' || B.type === 'wall_light')
            ? controlCableLinkId(A.id, B.id)
            : isLightingControl(B) && (A.type === 'light_ceiling' || A.type === 'wall_light')
                ? controlCableLinkId(B.id, A.id)
                : null;
        const path = [];
        if (ra.node !== rb.node) {
            const mp = mapFor(ra.node);
            if (!mp.dist.has(rb.node)) return null;
            for (let cur = rb.node; cur !== ra.node;) {
                const [p, e] = mp.prev.get(cur);
                path.push(e);
                cur = p;
            }
            path.reverse();
        }
        addPriv(ra.stub, wires, cid, relationId);
        addPriv(rb.stub, wires, cid, relationId);
        path.forEach(e => {
            if (!used.has(e)) used.set(e, { cables: [], cids: [], links: [] });
            const segment = used.get(e);
            segment.cables.push(wires);
            segment.cids.push(cid);
            if (relationId && !segment.links.includes(relationId)) segment.links.push(relationId);
        });
        const length = path.reduce((acc, e) => acc + e.len, 0) + stubLen(ra.stub) + stubLen(rb.stub);
        result.linkInfo.push({ circuitId: cid, length });
        result.linkCount++;
        return length;
    };

    const byCircuit = new Map();
    units.forEach(u => {
        const k = u.cid || '_none';
        if (!byCircuit.has(k)) byCircuit.set(k, []);
        byCircuit.get(k).push(u);
    });
    byCircuit.forEach((list, k) => {
        const cidOf = k === '_none' ? null : k;
        const tree = [{ el: panel, deg: 0, depth: 0, free: true, boxId: null }];
        // appareils servis par chaque boîte retenue (le calcul du câblage n'en dépend pas)
        const countServed = id => { if (id) result.boxServed[id] = (result.boxServed[id] || 0) + 1; };
        const rest = list.slice();
        // boîtes de dérivation posées dans ce circuit : raccordées au tableau seulement si un appareil s'y relie
        const pending = alive.filter(el => el.type === 'junction_box' && boxCircuitId(el) === k);
        // mode étoile (F2) : chaque appareil se raccorde au tableau ou à une boîte posée (I2) ; mode chaîné : comportement actuel
        const circ = projectData.circuits.find(c => c.id === k);
        const star = !!circ && circ.wiringMode === 'star';
        while (rest.length) {
            let best = null;
            rest.forEach((u, ui) => {
                tree.forEach(tn => {
                    if (star && !tn.free) return;
                    if (!tn.free && tn.deg >= C.maxDegree) return;
                    const d = rdist(tn.el, u.entry);
                    if (!best || d < best.d) best = { d, ui, tn, bx: null };
                });
                // une boîte pas encore raccordée coûte son trajet depuis le tableau
                pending.forEach(bx => {
                    // étoile : la boîte est la plus proche de l'appareil que le tableau ; son trajet n'est compté qu'une fois
                    const dBox = rdist(bx, u.entry);
                    const d = star ? (dBox < rdist(panel, u.entry) ? dBox : Infinity) : rdist(panel, bx) + dBox;
                    if (isFinite(d) && (!best || d < best.d)) best = { d, ui, tn: null, bx };
                });
            });
            if (!best || !isFinite(best.d)) { result.unrouted += rest.length; break; }
            if (best.bx) {
                const bx = best.bx;
                pending.splice(pending.indexOf(bx), 1);
                const l0 = addLink(panel, bx, std, cidOf);
                if (l0 === null) continue;
                best.tn = { el: bx, deg: 0, depth: tree[0].depth + l0 + 60, free: true, boxId: bx.id };
                tree.push(best.tn);
            }
            const u = rest.splice(best.ui, 1)[0];
            const cid = u.cid;
            const len = addLink(best.tn.el, u.entry, u.wires, cid);
            if (len === null) { result.unrouted++; continue; }
            best.tn.deg++;
            const entryNode = { el: u.entry, deg: 1, depth: best.tn.depth + len + 60, boxId: best.tn.boxId || null };
            tree.push(entryNode);
            countServed(entryNode.boxId);
            if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, entryNode.depth);
            u.members.forEach(mb => {
                const l2 = addLink(u.entry, mb, ret, cid);
                if (l2 === null) { result.unrouted++; return; }
                entryNode.deg++;
                const mn = { el: mb, deg: 1, depth: entryNode.depth + l2 + 60, boxId: entryNode.boxId };
                tree.push(mn);
                countServed(mn.boxId);
                if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, mn.depth);
            });
        }
    });

    // raccordement : tableau de cet étage → point de dérivation (la gaine vers les autres niveaux)
    // boîtes de dérivation : chaque tronçon de gaine est tracé dans la couleur des circuits qui le traversent
    const treePanelId = feedInfo ? feedInfo.panelLevelId : panel.levelId;
    const tree = feedInfo ? feedInfo.tree : levelTreeToPanel(treePanelId);
    derivPts.forEach(dp => {
        if (!R.get(dp.id)) { result.unrouted++; return; }
        const shaftId = dp.id.slice(3);   // 'dv|' + id de la trémie
        const cidsIn = circuitsEnteringLevel(activeLevelId, shaftId, tree, treePanelId);
        if (!cidsIn.length) {
            // trémie sans circuit venant d'un autre étage : tronçon neutre, retiré du métré par circuit
            if (addLink(panel, dp, std, null) === null) result.unrouted++;
            else result.linkInfo.pop();
            return;
        }
        cidsIn.forEach(cid => { if (addLink(panel, dp, std, cid) === null) result.unrouted++; });
    });

    // niveau sans tableau : la gaine monte ou descend de la trémie de cet étage jusqu'à la trémie du niveau suivant
    // (vers le tableau). Les couleurs de chaque circuit qui emprunte ce tronçon sont conservées.
    if (feedInfo && feedInfo.feed && feedInfo.shaft && R.get(panel.id)) {
        const elevOf = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
        const E0 = R.get(panel.id).stub[0];   // point de la trémie sur cet étage, à sa hauteur
        const next = feedInfo.nextLevelId;
        const hop = { from: activeLevelId, to: next, shaft: feedInfo.shaft.id };
        // hauteur de la même trémie au niveau suivant, rapportée au repère de cet étage
        const zNext = derivHeightOf(feedInfo.shaft, next) + (elevOf(next) - elevOf(activeLevelId));
        const vEnd = { x: E0.x, y: E0.y, z: zNext };
        const vLen = Math.abs(zNext - E0.z);
        const cidsUp = circuitsOnHop(hop, feedInfo.tree, feedInfo.panelLevelId);
        if (!cidsUp.length) addPriv([E0, vEnd], std, null, null);
        cidsUp.forEach(cid => {
            addPriv([E0, vEnd], std, cid, null);
            result.linkInfo.push({ circuitId: cid, length: vLen });
        });
    }

    used.forEach((u, e) => result.segments.push({
        a: { x: e.a.x, y: e.a.y, z: e.a.z }, b: { x: e.b.x, y: e.b.y, z: e.b.z }, cables: u.cables, cids: u.cids, links: u.links
    }));
    priv.forEach(sg => result.segments.push(sg));
    return result;
}

// Rendu : une gaine par tronçon (cylindres partagés), coudes en manchons sphériques, âmes colorées à l'intérieur
function renderCableNetwork(cx, cy) {
    const net = getCableNetwork();
    updateCircuitsUI();
    if (!showCables2D) return;   // câbles masqués (réglage commun avec la 2D)
    if (net.unrouted > 0) {
        console.warn(net.unrouted + ' liaison(s) non routée(s)');
        if (typeof showNotification === 'function') showNotification(net.unrouted + ' appareil(s) n\'ont pas pu être reliés au tableau', 'error');
    }
    if (!net.segments.length) return net;
    const selectedElement = projectData.electrical.find(el => el.id === selected3DId);
    const isLightingSelection = selectedElement &&
        (isLightingControl(selectedElement) || selectedElement.type === 'light_ceiling' || selectedElement.type === 'wall_light');
    const selectedLinkIds = new Set(isLightingSelection
        ? (net.controlLinks || [])
            .filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId))
            .flatMap(link => link.linkIds || [])
        : []);
    const hasLinkFocus = selectedLinkIds.size > 0;
    // circuits réellement concernés par la sélection : les autres circuits qui passent dans le même tronçon restent estompés
    const linkCircuitIds = new Set();
    if (hasLinkFocus) {
        (net.controlLinks || [])
            .filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId))
            .forEach(link => link.lightIds.forEach(lightId => {
                const light = projectData.electrical.find(el => el.id === lightId);
                const circuit = light && circuitOf(light);
                if (circuit) linkCircuitIds.add(circuit.id);
            }));
    }

    const colors = { 'red': 0xef4444, 'blue': 0x3b82f6, 'green-yellow': 0x22c55e, 'violet': 0x8b5cf6, 'orange': 0xf97316 };
    if (!CABLE_RES.cyl) {
        CABLE_RES.cyl = markShared(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true));
        CABLE_RES.core = markShared(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true));
        CABLE_RES.sph = markShared(new THREE.SphereGeometry(1, 12, 10));
        CABLE_RES.conduitMat = markShared(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
        CABLE_RES.circMats = {};
        CABLE_RES.hiMats = {};
        CABLE_RES.highlightConduit = markShared(new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, depthWrite: false }));
        CABLE_RES.dimConduit = markShared(new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.035, depthWrite: false }));
        CABLE_RES.highlightCore = markShared(new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        CABLE_RES.dimCore = markShared(new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.08, depthWrite: false }));
        CABLE_RES.mats = {};
    }
    const matFor = k => CABLE_RES.mats[k] || (CABLE_RES.mats[k] = markShared(new THREE.MeshBasicMaterial({ color: colors[k] || 0xffffff })));
    const conduitFor = cid => {
        if (!cid) return CABLE_RES.conduitMat;
        const circuit = projectData.circuits.find(c => c.id === cid);
        if (!circuit) return CABLE_RES.conduitMat;
        const hex = circuitColor(circuit);
        return CABLE_RES.circMats[hex] || (CABLE_RES.circMats[hex] = markShared(new THREE.MeshBasicMaterial({
            color: hex, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide
        })));
    };
    const hiFor = (cid, core) => {
        const circuit = cid && projectData.circuits.find(c => c.id === cid);
        if (!circuit) return core ? CABLE_RES.highlightCore : CABLE_RES.highlightConduit;
        const hex = circuitColor(circuit);
        const key = (core ? 'c' : 'g') + hex;
        return CABLE_RES.hiMats[key] || (CABLE_RES.hiMats[key] = markShared(new THREE.MeshBasicMaterial(core
            ? { color: hex }
            : { color: hex, transparent: true, opacity: 0.9, depthWrite: false })));
    };
    const add = (mesh) => { mesh.userData.shared = true; threeScene.add(mesh); wallMeshes3D.push(mesh); };
    const Y = new THREE.Vector3(0, 1, 0);
    const joints = new Map();

    net.segments.forEach(seg => {
        const isLinkHighlighted = (seg.links || []).some(id => selectedLinkIds.has(id));
        const a = new THREE.Vector3(seg.a.x - cx, seg.a.z, seg.a.y - cy);
        const b = new THREE.Vector3(seg.b.x - cx, seg.b.z, seg.b.y - cy);
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 0.1) return;
        dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
        const mid = a.clone().lerp(b, 0.5);
        const ref = Math.abs(dir.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
        const v = new THREE.Vector3().crossVectors(dir, u).normalize();

        const groups = new Map();
        (seg.cables || []).forEach((bundle, i) => {
            const cid = (seg.cids || [])[i] || null;
            if (!groups.has(cid)) groups.set(cid, []);
            groups.get(cid).push(...bundle);
        });
        if (!groups.size) groups.set(null, []);
        const conduitGroups = [...groups.entries()];
        conduitGroups.forEach(([cid, wires], groupIndex) => {
            const R = Math.min(3.2, Math.max(2, 1.8 + 0.22 * wires.length));
            const radialOffset = conduitGroups.length > 1
                ? (1.15 * R) / Math.sin(Math.PI / conduitGroups.length)
                : 0;
            const angle = (groupIndex / conduitGroups.length) * Math.PI * 2;
            const offset = new THREE.Vector3()
                .addScaledVector(u, Math.cos(angle) * radialOffset)
                .addScaledVector(v, Math.sin(angle) * radialOffset);
            const isSelected = selectedCircuitId && cid === selectedCircuitId;
            const isFocused = hasLinkFocus
                ? isLinkHighlighted && (!linkCircuitIds.size || linkCircuitIds.has(cid))
                : isSelected;
            const cmat = (hasLinkFocus || selectedCircuitId)
                ? (isFocused ? hiFor(cid, false) : CABLE_RES.dimConduit)
                : conduitFor(cid);
            const tube = new THREE.Mesh(CABLE_RES.cyl, cmat);
            tube.position.copy(mid).add(offset);
            tube.quaternion.copy(q);
            tube.scale.set(R, len, R);
            tube.renderOrder = isFocused ? 3 : 2;
            add(tube);

            wires.slice(0, 18).forEach((col, i) => {
                const wireOffset = new THREE.Vector3();
                if (wires.length > 1) {
                    const inner = i < 6;
                    const idx = inner ? i : i - 6;
                    const n = inner ? Math.min(wires.length, 6) : wires.length - 6;
                    const rad = R * (inner ? 0.35 : 0.62);
                    const ang = (idx / n) * Math.PI * 2;
                    wireOffset.addScaledVector(u, Math.cos(ang) * rad).addScaledVector(v, Math.sin(ang) * rad);
                }
                const coreMat = (hasLinkFocus || selectedCircuitId)
                    ? (isFocused ? hiFor(cid, true) : CABLE_RES.dimCore)
                    : matFor(col);
                const core = new THREE.Mesh(CABLE_RES.core, coreMat);
                core.renderOrder = isFocused ? 3 : 2;
                core.position.copy(mid).add(offset).add(wireOffset);
                core.quaternion.copy(q);
                core.scale.set(0.6, len, 0.6);
                add(core);
            });

            [[a, dir.clone()], [b, dir.clone().negate()]].forEach(([p, d]) => {
                const jp = p.clone().add(offset);
                const k = (cid || '_') + '|' + jp.x.toFixed(1) + '|' + jp.y.toFixed(1) + '|' + jp.z.toFixed(1);
                if (!joints.has(k)) joints.set(k, { pos: jp, dirs: [], R: 0, mat: cmat, focused: isFocused });
                const j = joints.get(k);
                if ((selectedCircuitId || hasLinkFocus) && isFocused && !j.focused) { j.mat = cmat; j.focused = true; }
                if (!selectedCircuitId && !hasLinkFocus && j.mat !== cmat) j.mat = CABLE_RES.conduitMat;
                j.dirs.push(d);
                j.R = Math.max(j.R, R);
            });
        });
    });

    // Manchons : coudes, dérivations et extrémités (rien sur un tronçon droit)
    joints.forEach(j => {
        if (j.dirs.length === 2 && j.dirs[0].dot(j.dirs[1]) < -0.999) return;
        const s = new THREE.Mesh(CABLE_RES.sph, j.mat);
        s.position.copy(j.pos);
        s.scale.set(j.R, j.R, j.R);
        s.renderOrder = j.focused ? 3 : 2;
        add(s);
    });
    return net;
}

// Étages voisins (dessus et dessous) affichés en fantôme dans la 3D : visibles, mais ni cliquables ni sélectionnables
let ghostLevelsOn = true;
function toggleGhostLevels() {
    ghostLevelsOn = !ghostLevelsOn;
    const b = document.getElementById('ghost-toggle');
    if (b) b.classList.toggle('opacity-50', !ghostLevelsOn);
    build3DScene();
}

// Câblage d'un niveau fantôme : même calcul que le niveau affiché, fait sur ce niveau puis rendu en gris.
// Mis en cache par données ; pendant un glissement on garde le dernier résultat (le calcul est trop lourd à chaque image).
const _ghostNetCache = new Map();
function ghostCableNetwork(levelId) {
    const sig = JSON.stringify([projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts]);
    const hit = _ghostNetCache.get(levelId);
    if (hit && (hit.sig === sig || dragging3DElementId)) return hit.net;
    const saved = activeLevelId;
    let net = null;
    try {
        activeLevelId = levelId;
        ensureCircuitAssignment();
        net = computeCableNetwork();
    } finally {
        activeLevelId = saved;
    }
    _ghostNetCache.set(levelId, { sig, net });
    return net;
}

function build3DScene() {
    if (!threeScene) return;
    if (selectedCircuitId && !projectData.circuits.some(c => c.id === selectedCircuitId)) selectedCircuitId = null;

    wallMeshes3D.forEach(m => { threeScene.remove(m); disposeSceneObject(m); });
    wallMeshes3D = [];
    clickableWalls3D = [];
    interactiveObjects3D = [];
    if (ceilingMesh3D) threeScene.remove(ceilingMesh3D);
    if (selectedHighlightMesh) {
        threeScene.remove(selectedHighlightMesh);
        selectedHighlightMesh = null;
    }

    if (wallsOn().length === 0) {
        selected3DId = null;
        syncElementInspectors();
        updateCircuitsUI();
        return;
    }

    const { cx, cy } = scene3DCentre();
    // étendue réelle des murs du niveau (pour la taille du sol)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wallsOn().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    });

    const floorWidth = (maxX - minX) + 400;
    const floorDepth = (maxY - minY) + 400;
    const planDiagonal = Math.hypot(floorWidth, floorDepth);
    threeCamera.far = Math.max(10000, planDiagonal * 4);
    threeCamera.updateProjectionMatrix();
    if (threeControls) threeControls.maxDistance = Math.max(500, planDiagonal * 3);
    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    // sol translucide : on voit les étages et les gaines à travers ; ordre de dessin fixe (comme les murs)
    const floorMat = new THREE.MeshStandardMaterial({ color: currentTheme === 'light' ? 0xf8fafc : 0x1e293b, roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.renderOrder = 1;
    floorMesh.rotation.x = -Math.PI / 2;
    // Sol 0,5 cm sous y = 0 : la face basse des murs ne le touche plus (le décalage de profondeur ne marche plus avec la profondeur logarithmique)
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.receiveShadow = true;
    threeScene.add(floorMesh);
    wallMeshes3D.push(floorMesh);

    // quadrillage au sol, maille de 50 cm comme en 2D, centré comme le sol
    if (gridVisible) {
        const gridSize = Math.max(floorWidth, floorDepth);
        const divisions = Math.min(400, Math.max(2, Math.round(gridSize / 50)));
        const dark = currentTheme !== 'light';
        const grid = new THREE.GridHelper(gridSize, divisions, dark ? 0x94a3b8 : 0x475569, dark ? 0x475569 : 0x94a3b8);
        grid.position.set(0, 0.5, 0);
        grid.material.transparent = true;
        grid.material.opacity = 0.7;
        grid.renderOrder = 2;
        threeScene.add(grid);
        wallMeshes3D.push(grid);
    }

    // fantômes : tous les autres niveaux, chacun à sa vraie hauteur par rapport au niveau affiché
    if (ghostLevelsOn) {
        const actLevel = (projectData.levels || []).find(l => l.id === activeLevelId);
        const actElev = Number(actLevel && actLevel.elevation) || 0;
        const others = (projectData.levels || []).filter(l => l.id !== activeLevelId);
        const ghostDrawnIds = new Set();   // trémies / escaliers reliant plusieurs niveaux : un seul fantôme
        others.forEach(lv => {
            const dy = (Number(lv.elevation) || 0) - actElev;
            wallsOn(lv.id).forEach(w => {
                const x1 = w.x1 - cx, z1 = w.y1 - cy, x2 = w.x2 - cx, z2 = w.y2 - cy;
                const length = Math.hypot(x2 - x1, z2 - z1);
                if (length < 1) return;
                const height = w.height || 250;
                const geo = new THREE.BoxGeometry(w.thickness || 10, height, length);
                // même couleur que les murs réels, plus transparente
                const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0f766e, transparent: true, opacity: 0.12, depthWrite: false }));
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0f766e, transparent: true, opacity: 0.5 }));
                ghost.add(edges);
                ghost.position.set((x1 + x2) / 2, dy + height / 2, (z1 + z2) / 2);
                ghost.rotation.y = -Math.atan2(z2 - z1, x2 - x1) + Math.PI / 2;
                ghost.renderOrder = 2;
                // pas de userData interactif : le fantôme n'est dans aucune liste cliquable
                threeScene.add(ghost);
                wallMeshes3D.push(ghost);
            });
            // tout le niveau en fantôme (transparent, jamais cliquable) : ouvertures, trémies, escaliers, appareils
            openingsOn(lv.id).forEach(op => addGhostOpening3D(op, dy, cx, cy));
            // toutes les trémies de ce niveau, réelles ou non, sont représentées de la même façon (une fois par trémie)
            shaftsOn(lv.id).forEach(sh => {
                if (ghostDrawnIds.has('sh|' + sh.id)) return;
                ghostDrawnIds.add('sh|' + sh.id);
                addGhostShaft3D(sh, cx, cy);
            });
            stairsOn(lv.id).forEach(st => {
                if (ghostDrawnIds.has(st.id) || (st.levelIds || [st.levelId]).includes(activeLevelId)) return;
                ghostDrawnIds.add(st.id);
                addStair3D(st, cx, cy, true);
            });
            // appareils de ce niveau, modèles complets rendus transparents (comme en réel, sans interaction)
            electricalOn(lv.id).forEach(el => {
                const mesh = createElementMesh3D(el, cx, cy);
                if (!mesh) return;
                mesh.position.y += dy;
                makeGhost3D(mesh, 0.3);
                mesh.renderOrder = 3;
                threeScene.add(mesh);
                wallMeshes3D.push(mesh);
            });
            // câblage de ce niveau en fantôme (lignes grises, sans interaction)
            const ghostNet = ghostCableNetwork(lv.id);
            const pts = [], cols = [];
            (ghostNet && ghostNet.segments || []).forEach(sg => {
                // chaque tronçon prend la couleur de son circuit, comme sur le plan réel
                const cid = (sg.cids || []).find(Boolean);
                const cc = cid ? projectData.circuits.find(c => c.id === cid) : null;
                const col = cc ? new THREE.Color(circuitColor(cc)) : new THREE.Color('#94a3b8');
                pts.push(sg.a.x - cx, sg.a.z + dy, sg.a.y - cy, sg.b.x - cx, sg.b.z + dy, sg.b.y - cy);
                cols.push(col.r, col.g, col.b, col.r, col.g, col.b);
            });
            if (pts.length) {
                const lineGeo = new THREE.BufferGeometry();
                lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
                const cableGhost = new THREE.LineSegments(lineGeo,
                    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
                cableGhost.renderOrder = 3;
                threeScene.add(cableGhost);
                wallMeshes3D.push(cableGhost);
            }
        });
    }
    // circuit sélectionné : ses appareils et câbles sont surlignés aussi sur les autres niveaux
    addCircuitCrossLevelHighlights(cx, cy);

    const maxH = Math.max(...wallsOn().map(w => w.height || 250), 250);
    const ceilingGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    const ceilingMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    ceilingMesh3D = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceilingMesh3D.rotation.x = Math.PI / 2;
    ceilingMesh3D.position.set(0, maxH + 0.5, 0);
    ceilingMesh3D.name = 'ceiling-placement-surface';
    threeScene.add(ceilingMesh3D);
    wallMeshes3D.push(ceilingMesh3D);

    // Trémies (D5) : cadre clair au sol, à la place de chaque trémie du niveau affiché
    shaftsOn().forEach(sh => {
        const w = projectData.walls.find(x => x.id === sh.wallId);
        if (!w) return;
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        const d = Math.max(10, Math.min(len - 10, sh.distanceFromStart !== undefined ? sh.distanceFromStart : len / 2));
        const s = sh.size || 40;
        const frame = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)),
            new THREE.LineBasicMaterial({ color: 0xf8fafc }));
        const sp = shaftPos2D(sh) || { x: w.x1 + (w.x2 - w.x1) * d / len, y: w.y1 + (w.y2 - w.y1) * d / len };
        frame.position.set(sp.x - cx, 1, sp.y - cy);
        frame.userData.shaftId = sh.id;   // la trémie sélectionnée clignote (cadre et colonne)
        threeScene.add(frame);
        wallMeshes3D.push(frame);
        // colonne visible en permanence (même aspect qu'à la sélection) : repère la trémie en 3D
        const span = shaftSpan3D(sh);
        const column = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, span.height, s)),
            new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.85 }));
        column.position.set(frame.position.x, span.base + span.height / 2, frame.position.z);
        column.userData.shaftId = sh.id;
        threeScene.add(column);
        wallMeshes3D.push(column);
        // zone invisible de la trémie (hauteur de la pièce) : permet de la sélectionner au clic en 3D
        const hit = new THREE.Mesh(
            new THREE.BoxGeometry(s, span.height, s),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.set(frame.position.x, span.base + span.height / 2, frame.position.z);
        hit.userData = { type: 'shaft', id: sh.id };
        threeScene.add(hit);
        wallMeshes3D.push(hit);
        interactiveObjects3D.push(hit);
        // trémie sélectionnée : volume blanc translucide dans la colonne (en plus du cadre de sélection)
        if (sh.id === selected3DId) {
            const sel = new THREE.Mesh(new THREE.BoxGeometry(s + 2, span.height, s + 2),
                new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.3, depthWrite: false }));
            sel.position.set(frame.position.x, span.base + span.height / 2, frame.position.z);
            sel.renderOrder = 5;
            threeScene.add(sel);
            wallMeshes3D.push(sel);
        }
        // étiquette visible au-dessus de la trémie : les niveaux qu'elle relie
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512; labelCanvas.height = 96;
        const lctx = labelCanvas.getContext('2d');
        lctx.fillStyle = 'rgba(15,23,42,0.85)';
        lctx.fillRect(0, 0, 512, 96);
        lctx.fillStyle = '#f8fafc';
        lctx.font = 'bold 40px sans-serif';
        lctx.textAlign = 'center';
        lctx.textBaseline = 'middle';
        lctx.fillText(shaftLevelNames(sh).join(' ↔ '), 256, 48);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        // l'étiquette se place en bas de la trémie si elle relie un niveau plus bas, en haut sinon ;
        // elle est masquée par les murs et les gaines (pas de passage par-dessus)
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: true, transparent: true }));
        label.scale.set(150, 28, 1);
        const elevOf = lvId => ((projectData.levels || []).find(l => l.id === lvId) || {}).elevation || 0;
        const otherId = (sh.levelIds || [sh.levelId]).find(lvId => lvId !== activeLevelId);
        const goesDown = otherId !== undefined && elevOf(otherId) < elevOf(activeLevelId);
        const labelY = goesDown ? 40 : Math.min(230, levelCeilingOf(activeLevelId) - 20);
        label.position.set(frame.position.x, labelY, frame.position.z);
        label.renderOrder = 11;
        threeScene.add(label);
        wallMeshes3D.push(label);
        // point de dérivation : chaque niveau relié prend ses circuits à ce point de la gaine (hauteur 1,50 m)
        // boîte : 10 cm d'épaisseur (perpendiculaire au mur) et 14 cm de long, orientée comme le mur
        const derivation = new THREE.Mesh(new THREE.BoxGeometry(10, DERIV_BOX_H, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        // même remède que pour les appareils : la boîte est posée à 1,5 cm de la face du mur (pas sur l'axe de la paroi
        // transparente) et son ordre de dessin est fixe, sinon le tri des transparents la fait scintiller
        // la boîte est collée à la face du mur, côté pièce de la trémie (jamais dans le mur)
        const dp = derivFacePos2D(sh, derivDistOf(sh, activeLevelId)) || { x: w.x1, y: w.y1, angle: 0 };
        derivation.position.set(dp.x - cx, derivHeightOf(sh, activeLevelId), dp.y - cy);
        derivation.rotation.y = -dp.angle + Math.PI / 2;
        derivation.renderOrder = 6;
        derivation.userData = { type: 'derivation', id: sh.id, derivation: true };
        interactiveObjects3D.push(derivation);
        threeScene.add(derivation);
        wallMeshes3D.push(derivation);
        // montée verticale : trait jaune de la cote de ce niveau à celle de chaque niveau relié par la trémie
        const elevHere = (projectData.levels || []).find(l => l.id === activeLevelId);
        (sh.levelIds || [sh.levelId]).filter(lv => lv !== activeLevelId).forEach(lv => {
            const other = (projectData.levels || []).find(l => l.id === lv);
            if (!other || !elevHere) return;
            const dy = (Number(other.elevation) || 0) - (Number(elevHere.elevation) || 0);
            // câble de la boîte de ce niveau jusqu'à la boîte de l'autre niveau (même trémie)
            const y0 = derivation.position.y;
            const y1 = dy + derivHeightOf(sh, lv);
            const riser = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(derivation.position.x, y0, derivation.position.z), new THREE.Vector3(derivation.position.x, y1, derivation.position.z)]),
                new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
            threeScene.add(riser);
            wallMeshes3D.push(riser);
        });
    });

    // Escaliers : marches pleines de la marche basse à la marche haute, emprise au sol, zone cliquable
    stairsOn().forEach(st => addStair3D(st, cx, cy));

    wallsOn().forEach(w => {
        const x1 = w.x1 - cx;
        const z1 = w.y1 - cy;
        const x2 = w.x2 - cx;
        const z2 = w.y2 - cy;

        const length = Math.hypot(x2 - x1, z2 - z1);
        const height = w.height || 250;
        const thickness = w.thickness || 10;

        const wallGeo = new THREE.BoxGeometry(thickness, height, length);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x0f766e,
            transparent: true,
            opacity: 0.52,
            roughness: 0.8,
            metalness: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        // Ordre fixe : les murs transparents sont dessinés après les autres transparents, quel que soit l'angle de vue
        // (sinon le tri par distance de Three.js change d'ordre pendant la rotation et fait scintiller les appareils)
        wallMesh.renderOrder = 5;

        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        wallMesh.position.set(midX, height / 2, midZ);

        const angle = Math.atan2(z2 - z1, x2 - x1);
        wallMesh.rotation.y = -angle + Math.PI / 2;
        
        wallMesh.userData = { type: 'wall', id: w.id };
        threeScene.add(wallMesh);
        wallMeshes3D.push(wallMesh);
        clickableWalls3D.push(wallMesh);
    });

    openingsOn().forEach(op => {
        const wall = wallsOn().find(w => w.id === op.wallId);
        if (!wall) return;
        const mesh = createOpeningMesh3D(op, wall, cx, cy);
        if (mesh) {
            threeScene.add(mesh);
            wallMeshes3D.push(mesh);
            interactiveObjects3D.push(mesh);
        }
    });

    electricalOn().forEach(el => {
        const mesh = createElementMesh3D(el, cx, cy);
        if (mesh) {
            threeScene.add(mesh);
            wallMeshes3D.push(mesh);
            interactiveObjects3D.push(mesh);
        }
    });

    addCircuitElementHighlights();
    addWallSelectionHighlights();
    addCollisionHighlights();
    renderCableNetwork(cx, cy);

    if (selected3DId) {
        let foundObj = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === selected3DId);
        if (foundObj) {
            updateSelectionHighlight(foundObj);
        } else {
            selected3DId = null;
            syncElementInspectors();
        }
    }
}

function createOpeningMesh3D(op, wall, cx, cy) {
    const wx1 = wall.x1 - cx;
    const wz1 = wall.y1 - cy;
    const wx2 = wall.x2 - cx;
    const wz2 = wall.y2 - cy;
    const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);

    let distFromStart = op.distanceFromStart !== undefined ? op.distanceFromStart : (op.positionRatio !== undefined ? op.positionRatio * wallLen : wallLen / 2);
    distFromStart = Math.max(10, Math.min(wallLen - 10, distFromStart));

    const t = wallLen > 0 ? distFromStart / wallLen : 0.5;
    const posX = wx1 + t * (wx2 - wx1);
    const posZ = wz1 + t * (wz2 - wz1);
    const angle = Math.atan2(wz2 - wz1, wx2 - wx1);

    const group = new THREE.Group();
    const wallThickness = wall.thickness || 10;

    if (op.type === 'door_single') {
        const doorHeight = 210;
        const doorWidth = op.width || 96;
        const halfOpening = doorWidth / 2;
        group.position.set(posX, doorHeight / 2, posZ);
        group.rotation.y = -angle;

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
        const panelMat = new THREE.MeshStandardMaterial({ color: 0xb07a4a, roughness: 0.3 });

        const postGeo = new THREE.BoxGeometry(6, doorHeight, wallThickness + 4);
        const leftPost = new THREE.Mesh(postGeo, frameMat);
        leftPost.position.set(-(halfOpening - 3), 0, 0);
        group.add(leftPost);

        const rightPost = new THREE.Mesh(postGeo, frameMat);
        rightPost.position.set(halfOpening - 3, 0, 0);
        group.add(rightPost);

        const headerGeo = new THREE.BoxGeometry(doorWidth, 6, wallThickness + 4);
        const header = new THREE.Mesh(headerGeo, frameMat);
        header.position.set(0, doorHeight / 2 - 3, 0);
        group.add(header);

        const innerHalf = halfOpening - 5;
        const leafGeo = new THREE.BoxGeometry(2 * innerHalf, doorHeight - 8, 4);
        const leaf = new THREE.Mesh(leafGeo, panelMat);
        const hingeSide = op.hingeSide === 'right' ? 'right' : 'left';
        const side = op.side === -1 ? -1 : 1;
        // Même repère que le plan 2D ; gauche/droite : voir doorHingeSign.
        const hx = doorHingeSign(op);
        const pivot = new THREE.Group();
        pivot.position.set(hx * innerHalf, 0, 0);
        pivot.rotation.y = -side * hx * Math.PI / 2;
        leaf.position.set(-hx * innerHalf, 0, 0);
        pivot.add(leaf);
        group.add(pivot);
    } else {
        const winWidth = op.width || 120;
        const winHeight = op.height || 120;
        const sillHeight = op.sillHeight !== undefined ? op.sillHeight : 90;
        const centerY = sillHeight + winHeight / 2;

        group.position.set(posX, centerY, posZ);
        group.rotation.y = -angle;

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x60a5fa, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.1 });

        // Cadre à quatre montants (pas de pavé plein) : le vitrage reste visible.
        const frameDepth = wallThickness + 2;
        const frameBar = 6;
        const sideGeo = new THREE.BoxGeometry(frameBar, winHeight, frameDepth);
        const topGeo = new THREE.BoxGeometry(winWidth, frameBar, frameDepth);
        const leftBar = new THREE.Mesh(sideGeo, frameMat);
        leftBar.position.set(-(winWidth / 2 - frameBar / 2), 0, 0);
        const rightBar = new THREE.Mesh(sideGeo, frameMat);
        rightBar.position.set(winWidth / 2 - frameBar / 2, 0, 0);
        const topBar = new THREE.Mesh(topGeo, frameMat);
        topBar.position.set(0, winHeight / 2 - frameBar / 2, 0);
        const bottomBar = new THREE.Mesh(topGeo, frameMat);
        bottomBar.position.set(0, -(winHeight / 2 - frameBar / 2), 0);
        group.add(leftBar, rightBar, topBar, bottomBar);

        const glassGeo = new THREE.BoxGeometry(Math.max(4, winWidth - 2 * frameBar), Math.max(4, winHeight - 2 * frameBar), 2);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        group.add(glass);
    }

    group.userData = { type: 'opening', id: op.id, opType: op.type, wallId: wall.id };
    group.traverse(child => {
        child.userData = group.userData;
    });
    return group;
}

// =====================================================================
//  APPAREILLAGE 3D RÉALISTE (dimensions en cm, un peu agrandies pour rester lisibles)
//  Repère du modèle : face avant vers +z, mur en z = -1, centre de l'appareil en (0, 0)
// =====================================================================
const MODEL_RES = { geo: {}, mat: {} };

function mGeo(kind, ...a) {
    const k = kind + ':' + a.join(',');
    if (!MODEL_RES.geo[k]) {
        const g = kind === 'box' ? new THREE.BoxGeometry(...a)
            : kind === 'cyl' ? new THREE.CylinderGeometry(...a)
            : new THREE.SphereGeometry(...a);
        MODEL_RES.geo[k] = markShared(g);
    }
    return MODEL_RES.geo[k];
}

function mMat(color, o) {
    o = o || {};
    const k = [color, o.emissive || 0, o.opacity || 1, o.rough === undefined ? 0.5 : o.rough, o.metal || 0, o.double ? 1 : 0].join(',');
    if (!MODEL_RES.mat[k]) {
        const p = { color: color, roughness: o.rough === undefined ? 0.5 : o.rough, metalness: o.metal || 0 };
        if (o.emissive) { p.emissive = o.emissive; p.emissiveIntensity = o.emissiveIntensity || 0.6; }
        if (o.opacity !== undefined && o.opacity < 1) { p.transparent = true; p.opacity = o.opacity; p.depthWrite = false; }
        if (o.double) p.side = THREE.DoubleSide;
        MODEL_RES.mat[k] = markShared(new THREE.MeshStandardMaterial(p));
    }
    return MODEL_RES.mat[k];
}

function applianceModel(el) {
    const g = new THREE.Group();
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(mGeo('box', w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    // cylindre dont l'axe est dirigé vers l'avant (+z) ; rF = rayon côté avant, rB = rayon côté mur
    const cylZ = (rF, rB, len, mat, x, y, z) => { const m = new THREE.Mesh(mGeo('cyl', rF, rB, len, 28), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
    const cylY = (rT, rB, len, mat, x, y, z) => { const m = new THREE.Mesh(mGeo('cyl', rT, rB, len, 28), mat); m.position.set(x, y, z); g.add(m); return m; };
    const accent = EL_COLORS[el.type] ? parseInt(EL_COLORS[el.type].slice(1), 16) : 0x94a3b8;
    const white = mMat(0xf8fafc, { rough: 0.35 });
    const ivory = mMat(0xe2e8f0, { rough: 0.45 });
    const dark = mMat(0x0f172a, { rough: 0.6 });
    const metal = mMat(0xcbd5e1, { rough: 0.25, metal: 0.8 });
    const accentMat = mMat(accent, { rough: 0.4 });

    if (el.type === 'outlet_16a' || el.type === 'outlet_20a') {
        // prise 2P+T encastrée : plaque carrée, collerette ronde, deux alvéoles et broche de terre
        box(12, 12, 1.2, white, 0, 0, -0.4);
        cylZ(5.4, 5.6, 0.8, ivory, 0, 0, 0.6);
        cylZ(4.2, 4.2, 0.4, white, 0, 0, 1.1);
        cylZ(0.62, 0.62, 0.5, dark, -1.0, -0.2, 1.3);
        cylZ(0.62, 0.62, 0.5, dark, 1.0, -0.2, 1.3);
        cylZ(0.4, 0.4, 1.8, metal, 0, 2.5, 1.6);                              // broche de terre
        box(5.5, 1.1, 0.5, accentMat, 0, el.type === 'outlet_20a' ? 4.7 : -4.8, 0.4);   // repère de calibre
        // prise simple : plaque de 7,2 cm (un module), pour que deux prises aimantées (7,5 cm) ne se touchent pas
        g.scale.setScalar(0.6);
    } else if (el.type === 'outlet_32a') {
        // sortie de cuisson 32 A : grand disque, bague colorée, trois bornes
        cylZ(7.4, 7.6, 1.3, white, 0, 0, -0.35);
        cylZ(5.6, 5.8, 1.0, accentMat, 0, 0, 0.8);
        cylZ(4.2, 4.4, 0.6, ivory, 0, 0, 1.5);
        [[-1.8, 0.9], [1.8, 0.9], [0, -1.7]].forEach(p => cylZ(0.75, 0.75, 0.5, dark, p[0], p[1], 1.9));
        [[-6, 0], [6, 0]].forEach(p => cylZ(0.5, 0.5, 0.6, metal, p[0], p[1], 0.5));   // vis de fixation
    } else if (el.type === 'switch_simple' || el.type === 'switch_va_et_vient') {
        // Interrupteur mécanique : plaque, cadre et bascule.
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        const rocker = box(6.2, 8.4, 1.0, white, 0, 0, 1.0);
        rocker.rotation.x = -0.16;
        box(5.2, 0.5, 0.35, ivory, 0, 0, 1.55);                                // creux de la bascule
        cylZ(0.5, 0.5, 0.4, accentMat, 0, -5.0, 0.5);                           // voyant
        if (el.type === 'switch_va_et_vient') {
            box(0.8, 2.0, 0.45, accentMat, 0, -2.6, 1.75);
            box(0.8, 2.0, 0.45, accentMat, 0, 2.6, 1.75);
        }
    } else if (el.type === 'switch_pushbutton') {
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        cylZ(3.4, 3.8, 1.6, white, 0, 0, 1.0);
        cylZ(2.2, 2.2, 0.5, accentMat, 0, 0, 2.0);
    } else if (el.type === 'wall_light') {
        // applique : platine ronde, bras, vasque ouverte vers le haut, ampoule
        cylZ(4.8, 5.0, 1.4, metal, 0, 0, -0.3);
        cylZ(1.0, 1.0, 7.0, mMat(0x64748b, { rough: 0.3, metal: 0.7 }), 0, 0, 3.7);
        const bowl = new THREE.Mesh(mGeo('sph', 6.2, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat(0xfff7ed, { rough: 0.3, emissive: 0xfde68a, emissiveIntensity: 0.35, double: true }));
        bowl.position.set(0, 2.2, 10.5);
        g.add(bowl);
        const bulb = new THREE.Mesh(mGeo('sph', 2.5, 16, 12), mMat(0xfde047, { emissive: 0xfde047, emissiveIntensity: 1 }));
        bulb.position.set(0, 1.2, 10.5);
        g.add(bulb);
    } else if (el.type === 'light_ceiling') {
        // plafonnier : rosace au plafond, couronne, diffuseur en demi-sphère opaline
        cylY(5.0, 5.0, 1.0, white, 0, 4.7, 0);
        cylY(12.8, 12.8, 0.9, mMat(0xd4a017, { rough: 0.3, metal: 0.6 }), 0, 4.1, 0);
        const dome = new THREE.Mesh(mGeo('sph', 12.4, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat(0xfffbeb, { rough: 0.2, emissive: 0xfde68a, emissiveIntensity: 0.55, opacity: 0.93, double: true }));
        dome.position.set(0, 3.9, 0);
        g.add(dome);
    } else if (el.type === 'junction_box') {
        // boîte de dérivation posée : petit coffret blanc, couvercle et quatre vis
        box(10, 10, 4, white, 0, 0, 2);
        box(8.4, 8.4, 0.4, ivory, 0, 0, 4.2);
        [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].forEach(p => cylZ(0.5, 0.5, 0.3, metal, p[0], p[1], 4.4));
    } else if (el.type === 'panel') {
        // tableau : coffret, porte fumée, trois rangées de modules (différentiel + disjoncteurs)
        const W = 42, H = 56;
        box(W, H, 7, mMat(0xe5e7eb, { rough: 0.5 }), 0, 0, 2.5);
        box(W - 5, H - 5, 0.5, mMat(0x1f2937, { rough: 0.8 }), 0, 0, 6.1);
        const rail = mMat(0x94a3b8, { rough: 0.3, metal: 0.7 });
        const modMat = mMat(0xf1f5f9, { rough: 0.4 });
        const toggle = mMat(0x111827, { rough: 0.6 });
        const diffMat = mMat(0xcbd5e1, { rough: 0.4 });
        const test = mMat(0x2563eb, { rough: 0.4 });
        const x0 = -11.65;
        [16, 0, -16].forEach((y, row) => {
            box(28, 3.2, 0.5, rail, 0, y, 6.5);
            box(3.5, 8.6, 4.8, diffMat, x0 + 1.75, y, 8.9);                         // différentiel 30 mA
            box(1.0, 2.0, 1.0, toggle, x0 + 1.75, y - 1.8, 11.7);
            box(1.0, 1.0, 0.8, test, x0 + 1.75, y + 2.6, 11.6);
            for (let i = 0; i < 11; i++) {
                const x = x0 + 3.5 + 0.95 + i * 1.8;
                box(1.7, 8.4, 4.4, modMat, x, y, 8.7);
                box(0.8, 1.8, 1.0, toggle, x, y + ((i + row) % 3 === 0 ? -1.5 : 1.5), 11.0);
            }
        });
        box(W - 3, H - 3, 0.5, mMat(0x0f172a, { opacity: 0.32, rough: 0.2 }), 0, 0, 12.4);   // porte fumée
        box(W - 3, 2.6, 0.7, accentMat, 0, H / 2 - 4.2, 12.8);                            // bandeau de couleur
        box(0.9, 5, 1.0, metal, W / 2 - 3.5, 0, 13.0);                                    // poignée
    } else {
        box(10, 10, 4, accentMat, 0, 0, 1);
    }
    return g;
}

function createElementMesh3D(el, cx, cy) {
    const group = new THREE.Group();
    group.userData = { type: 'electrical', id: el.id, elType: el.type, wallId: el.wallId };
    const model = applianceModel(el);

    if (el.type === 'light_ceiling') {
        group.position.set(el.x - cx, el.y || 245, el.z - cy);
    } else {
        const wall = projectData.walls.find(w => w.id === el.wallId);
        if (!wall) return null;
        const wx1 = wall.x1 - cx;
        const wz1 = wall.y1 - cy;
        const wx2 = wall.x2 - cx;
        const wz2 = wall.y2 - cy;
        const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);

        let distFromStart = el.distanceFromStart !== undefined ? el.distanceFromStart : (el.positionRatio !== undefined ? el.positionRatio * wallLen : wallLen / 2);
        distFromStart = Math.max(5, Math.min(wallLen - 5, distFromStart));

        const t = wallLen > 0 ? distFromStart / wallLen : 0.5;
        const posX = wx1 + t * (wx2 - wx1);
        const posZ = wz1 + t * (wz2 - wz1);
        const angle = Math.atan2(wz2 - wz1, wx2 - wx1);

        const side = el.side !== undefined ? el.side : 1;
        const wallThickness = wall.thickness || 10;
        // Visuel seulement : 0,5 cm de plus que le calcul, pour que le socle de l'appareil ne soit pas
        // exactement sur la face du mur (sinon scintillement à travers la paroi transparente)
        const offsetDist = (wallThickness / 2) + 1.5;

        const perpX = Math.sin(angle);
        const perpZ = -Math.cos(angle);

        group.position.set(posX + perpX * side * offsetDist, el.height || 110, posZ + perpZ * side * offsetDist);
        group.rotation.y = -angle;
        // le modèle regarde vers +z ; côté A (side = 1) la face avant est vers -z
        if (side === 1) model.rotation.y = Math.PI;
    }
    group.add(model);
    group.traverse(child => {
        child.userData = group.userData;
    });
    return group;
}

let drag3DMoved = false;
let drag3DRefusedOp = false;   // déplacement de porte/fenêtre refusé (une seule notification par geste)
let wallDrag3D = null;        // glissement d'un mur en 3D : { wallId, mode, startWall, origin, down, moved }
let wallCentreLock3D = null;  // centre figé pendant le glissement : la scène ne se recentre pas à chaque pas
let wallDragFrame3D = false;
let drag3DDown = null;

// Tracé de mur en 3D : même logique que la 2D (points au sol, aimantation, clic droit pour terminer)
let wallDraft3D = null;     // point de départ du tracé courant, en cm (coordonnées du plan)
let wallCursor3D = null;    // point courant, aimanté
let wallPreview3D = null;   // trait de prévisualisation dans la scène

// Centre de la scène 3D : même repère que celui des murs, escaliers et trémies
function scene3DCentre() {
    if (wallCentreLock3D) return wallCentreLock3D;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wallsOn().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    });
    if (!isFinite(minX)) return { cx: 0, cy: 0 };
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// Aimantation identique à la 2D : extrémités des murs (25 cm), grille de 25 cm, angles droits
function snapTracePoint3D(p, start) {
    let x = p.x, y = p.y;
    if (gridSnap) {
        let best = null, bestD = 25;
        wallsOn().forEach(w => {
            [[w.x1, w.y1], [w.x2, w.y2]].forEach(([px, py]) => {
                const d = Math.hypot(px - x, py - y);
                if (d < bestD) { bestD = d; best = { x: px, y: py }; }
            });
        });
        if (best) { x = best.x; y = best.y; }
        else { x = Math.round(x / 25) * 25; y = Math.round(y / 25) * 25; }
    }
    if (angleSnap && start) {
        if (Math.abs(x - start.x) > Math.abs(y - start.y)) y = start.y;
        else x = start.x;
    }
    return { x, y };
}

// Point du sol sous le pointeur, en coordonnées du plan (cm)
function floorPlanPointFrom3D(e) {
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse3D, threeCamera);
    const floorPt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorPt)) return null;
    const { cx, cy } = scene3DCentre();
    return { x: floorPt.x + cx, y: floorPt.z + cy };
}

function traceBannerText3D() {
    if (!wallDraft3D || !wallCursor3D) {
        return 'Pose : Mur ; cliquez le premier point au sol (Échap pour arrêter)';
    }
    const len = Math.hypot(wallCursor3D.x - wallDraft3D.x, wallCursor3D.y - wallDraft3D.y) / 100;
    return 'Pose : Mur ; longueur ' + len.toFixed(2).replace('.', ',') + ' m ; clic pour valider, clic droit pour terminer (Échap pour arrêter)';
}

function updateWallPreview3D() {
    if (wallPreview3D && wallPreview3D.parent) wallPreview3D.parent.remove(wallPreview3D);
    wallPreview3D = null;
    if (activePlacementType === 'wall') refreshToolHint();
    if (!threeScene || activePlacementType !== 'wall' || !wallDraft3D || !wallCursor3D) return;
    const { cx, cy } = scene3DCentre();
    const pts = [
        new THREE.Vector3(wallDraft3D.x - cx, 5, wallDraft3D.y - cy),
        new THREE.Vector3(wallCursor3D.x - cx, 5, wallCursor3D.y - cy)
    ];
    wallPreview3D = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    wallPreview3D.renderOrder = 10;
    threeScene.add(wallPreview3D);
}

// Un clic au sol : premier point, ou fin d'un segment qui devient le point de départ du suivant
function commitTracePoint3D(rawPoint) {
    const p = snapTracePoint3D(rawPoint, wallDraft3D);
    if (!wallDraft3D) {
        wallDraft3D = p;
        wallCursor3D = p;
        updateWallPreview3D();
        return;
    }
    const len = Math.hypot(p.x - wallDraft3D.x, p.y - wallDraft3D.y);
    if (len > 10) {
        saveStateToUndo();
        projectData.walls.push({ levelId: activeLevelId, id: 'w_' + Date.now(),
            x1: wallDraft3D.x, y1: wallDraft3D.y, x2: p.x, y2: p.y,
            thickness: activeWallThickness, height: activeWallHeight });
        updateStats();
        showNotification('Mur tracé', 'success');
        wallDraft3D = p;
        wallCursor3D = p;
        build3DScene();
    }
    updateWallPreview3D();
}

// Clic droit ou Échap pendant un tracé : arrête la chaîne, le mode « Tracer mur » reste actif
function endWallTrace3D() {
    wallDraft3D = null;
    wallCursor3D = null;
    updateWallPreview3D();
    showNotification('Tracé de mur arrêté', 'info');
}

function on3DPointerDown(e) {
    if (e.button !== 0) return;
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse3D, threeCamera);

    if (activePlacementType === 'wall') {
        const floorPt = floorPlanPointFrom3D(e);
        if (floorPt) commitTracePoint3D(floorPt);
        return;
    }
    if (activePlacementType) {
        if (activePlacementType === 'stair') {
            // escalier posé au sol : son emprise est centrée sur le point cliqué
            const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const floorPt = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(floorPlane, floorPt)) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                wallsOn().forEach(w => {
                    minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
                    maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
                });
                const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
                const links = askShaftLevels();
                saveStateToUndo();
                if (!projectData.stairs) projectData.stairs = [];
                projectData.stairs.push({ id: 'st_' + Date.now(), levelId: activeLevelId, levelIds: links,
                    x: Math.round(floorPt.x + cx), y: Math.round(floorPt.z + cy), angleDeg: 0, width: 90, length: 300 });
                snapStairToWalls(projectData.stairs[projectData.stairs.length - 1]);
                showNotification('Escalier posé', 'success');
                build3DScene();
                // le mode de pose reste actif : on enchaîne les poses (Échap ou second clic pour arrêter)
            }
            return;
        }
        if (activePlacementType === 'light_ceiling') {
            if (ceilingMesh3D) {
                const ceilingIntersect = raycaster.intersectObject(ceilingMesh3D);
                if (ceilingIntersect.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    wallsOn().forEach(w => {
                        minX = Math.min(minX, w.x1, w.x2);
                        minY = Math.min(minY, w.y1, w.y2);
                        maxX = Math.max(maxX, w.x1, w.x2);
                        maxY = Math.max(maxY, w.y1, w.y2);
                    });
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;
                    const pt = ceilingIntersect[0].point;

                    if (ceilingSpotBlocker(pt.x + cx, pt.z + cy, activeLevelId)) { refuseSameSpot(); return; }
                    saveStateToUndo();
                    projectData.electrical.push({ levelId: activeLevelId,
                        id: 'el_' + Date.now(),
                        type: 'light_ceiling',
                        x: pt.x + cx,
                        y: 245,
                        z: pt.z + cy
                    });
                    build3DScene();
                    showNotification("Plafonnier ajouté au plafond", "success");
                    // le mode de pose reste actif : on enchaîne les poses (Échap ou second clic pour arrêter)
                    return;
                }
            }
        } else {
            const wallIntersects = raycaster.intersectObjects(clickableWalls3D, true);
            if (wallIntersects.length > 0) {
                let hitWallMesh = wallIntersects[0].object;
                while (hitWallMesh && (!hitWallMesh.userData || !hitWallMesh.userData.id) && hitWallMesh.parent) {
                    hitWallMesh = hitWallMesh.parent;
                }
                
                const wallId = hitWallMesh.userData && hitWallMesh.userData.id ? hitWallMesh.userData.id : null;
                const wall = projectData.walls.find(w => w.id === wallId);

                if (wall) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    wallsOn().forEach(w => {
                        minX = Math.min(minX, w.x1, w.x2);
                        minY = Math.min(minY, w.y1, w.y2);
                        maxX = Math.max(maxX, w.x1, w.x2);
                        maxY = Math.max(maxY, w.y1, w.y2);
                    });
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;

                    const hitPt = wallIntersects[0].point;
                    const wx1 = wall.x1 - cx;
                    const wz1 = wall.y1 - cy;
                    const wx2 = wall.x2 - cx;
                    const wz2 = wall.y2 - cy;
                    const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);

                    const distToPt = Math.hypot(hitPt.x - wx1, hitPt.z - wz1);
                    const distanceCm = Math.round(Math.max(10, Math.min(wallLen - 10, distToPt)));

                    const localHit = hitWallMesh.worldToLocal(hitPt.clone());
                    const side = localHit.x >= 0 ? 1 : -1;

                    if (sameSpotBlocker(activePlacementType, activeLevelId, wall.id, distanceCm)) { refuseSameSpot(); return; }
                    saveStateToUndo();
                    if (activePlacementType === 'shaft') {
                        // trémie posée en 3D : même réglage de liaison que la 2D (liste « Relier à »)
                        const links = askShaftLevels();
                        projectData.shafts.push({ id: 'sh_' + Date.now(), levelId: activeLevelId, levelIds: links, wallId: wall.id, distanceFromStart: distanceCm, side, size: 40 });
                        renderLevelSelector();
                        showNotification('Trémie placée sur le mur', 'success');
                        build3DScene();
                        // le mode de pose reste actif : on enchaîne les poses (Échap ou second clic pour arrêter)
                        return;
                    }
                    if (activePlacementType === 'door_single' || activePlacementType === 'window_std') {
                        const opening = {
                            id: 'op_' + Date.now(),
                            type: activePlacementType,
                            wallId: wall.id,
                            distanceFromStart: distanceCm,
                            height: activePlacementType === 'door_single' ? 210 : 120,
                            width: activePlacementType === 'door_single' ? 96 : 120
                        };
                        if (activePlacementType === 'window_std') opening.sillHeight = 90;
                        if (activePlacementType === 'door_single') {
                            opening.hingeSide = doorHingeForPlacement();
                            opening.side = side;
                        }
                        projectData.openings.push(Object.assign(opening, { levelId: activeLevelId }));
                        showNotification("Ouverture placée sur le mur avec succès", "success");
                    } else {
                        let defaultH = 110;
                        if (activePlacementType === 'panel' || activePlacementType === 'junction_box') defaultH = 150;
                        if (activePlacementType === 'wall_light') defaultH = 180;
                        if (activePlacementType.startsWith('outlet')) defaultH = 30;
                        if (activePlacementType === 'outlet_32a') defaultH = 20;

                        projectData.electrical.push({ levelId: activeLevelId,
                            id: 'el_' + Date.now(),
                            type: activePlacementType,
                            wallId: wall.id,
                            distanceFromStart: distanceCm,
                            height: defaultH,
                            side: side
                        });
                        showNotification(`Appareillage fixé (${activePlacementType.toUpperCase()}, Côté ${side === 1 ? 'A' : 'B'})`, "success");
                    }
                    build3DScene();
                    // le mode de pose reste actif : on enchaîne les poses (Échap ou second clic pour arrêter)
                    return;
                }
            }
        }
    } else {
        const interactiveIntersects = raycaster.intersectObjects(interactiveObjects3D, true);
        const derivHit = interactiveIntersects.find(i => i.object.userData && i.object.userData.derivation);
        if (derivHit) {
            // un clic sur la boîte sélectionne la trémie (sa hauteur se règle dans le panneau)
            setSelectedWalls([]);
            select3DElement(derivHit.object.userData.id, derivHit.object);
            return;
        }
        if (interactiveIntersects.length > 0) {
            // on remonte jusqu'à l'objet posé directement dans la scène (appareil ou ouverture)
            let target = interactiveIntersects[0].object;
            while (target.parent && target.parent !== threeScene) target = target.parent;
            if (target.userData && target.userData.id) {
                const targetId = target.userData.id;
                select3DElement(targetId, target);
                if ((projectData.shafts || []).some(s => s.id === targetId)) {
                    build3DScene();   // volume de sélection visible dès le clic
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                const selectedElectrical = projectData.electrical.find(el => el.id === targetId);
                if (selectedElectrical && (isLightingControl(selectedElectrical) ||
                    selectedElectrical.type === 'light_ceiling' || selectedElectrical.type === 'wall_light')) {
                    build3DScene();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                const clickedCircuit = highlightCircuitOf(selectedElectrical);
                if (clickedCircuit && clickedCircuit.id !== selectedCircuitId) {
                    selectedCircuitId = clickedCircuit.id;
                    build3DScene();
                    updateCircuitsUI();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }

                let isCeiling = selectedElectrical && selectedElectrical.type === 'light_ceiling';
                const dragStair = (projectData.stairs || []).find(s => s.id === targetId);
                dragging3DElementId = targetId;
                drag3DMoved = false;   // C1 : l'annulation est enregistrée au premier vrai déplacement
                drag3DDown = { x: e.clientX, y: e.clientY };
                if (isCeiling || dragStair) {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), target.position);
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(threeCamera.getWorldDirection(dragPlane.normal).negate(), target.position);
                }
                if (dragStair) {
                    const grabPt = new THREE.Vector3();
                    stair3DGrab = raycaster.ray.intersectPlane(dragPlane, grabPt) ? { x: grabPt.x - target.position.x, z: grabPt.z - target.position.z } : { x: 0, z: 0 };
                }
                if (threeControls) threeControls.enabled = false;
                return;
            }
        }
        // rien d'interactif touché : un mur se sélectionne (inspecteur de mur, comme en 2D)
        const wallHit = raycaster.intersectObjects(clickableWalls3D, true);
        if (wallHit.length > 0) {
            let wm = wallHit[0].object;
            while (wm && !(wm.userData && wm.userData.id) && wm.parent) wm = wm.parent;
            const wid = wm && wm.userData && wm.userData.id;
            if (wid && projectData.walls.some(w => w.id === wid) && !projectData.wallsLocked) {
                const wasSelected = selectedWallIds.includes(wid);
                if (selected3DId) { selected3DId = null; selectedCircuitId = null; }
                setSelectedWalls([wid]);
                syncElementInspectors();
                if (canEditWalls()) startWallDrag3D(e, wid, wasSelected);
                build3DScene();
            }
        }
    }
}

// Survol 3D : étiquette de l'objet sous le curseur (même logique que le clic)
function hover3DTooltip(e) {
    if (activePlacementType || !threeCamera || !interactiveObjects3D.length) { hidePlanTooltip(); return; }
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse3D, threeCamera);
    let id = null;
    for (const hit of raycaster.intersectObjects(interactiveObjects3D, true)) {
        let o = hit.object;
        while (o && !(o.userData && o.userData.id)) o = o.parent;
        if (o) { id = o.userData.id; break; }
    }
    showPlanTooltip(e.clientX, e.clientY, id);
}

function on3DPointerMove(e) {
    if (wallDrag3D) {
        if ((e.buttons & 1) === 0) { endWallDrag3D(); return; }   // bouton relâché hors de la scène
        updateWallDrag3D(e);
        return;
    }
    if (activePlacementType === 'wall') {
        const floorPt = floorPlanPointFrom3D(e);
        if (floorPt && wallDraft3D) { wallCursor3D = snapTracePoint3D(floorPt, wallDraft3D); updateWallPreview3D(); }
        return;
    }
    if (activePlacementType && activePlacementType !== 'stair' && !dragging3DElementId) { updatePlaceGhost3D(e); return; }
    if (!dragging3DElementId) { hover3DTooltip(e); return; }
    // un simple clic ne déplace rien : le glissement commence après 5 px de mouvement
    if (!drag3DMoved && drag3DDown && Math.hypot(e.clientX - drag3DDown.x, e.clientY - drag3DDown.y) < 5) return;
    if (!drag3DMoved) { saveStateToUndo(); drag3DMoved = true; }   // C1 : comme en 2D (un clic sans mouvement ne crée rien)

    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse3D, threeCamera);
    
    const { cx, cy } = scene3DCentre();

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        const stairDrag = (projectData.stairs || []).find(s => s.id === dragging3DElementId);
        if (stairDrag) {
            const g = stair3DGrab || { x: 0, z: 0 };
            const prevSt = { x: stairDrag.x, y: stairDrag.y };
            stairDrag.x = Math.round(planeIntersectPoint.x - g.x + cx);
            stairDrag.y = Math.round(planeIntersectPoint.z - g.z + cy);
            snapStairToWalls(stairDrag, prevSt);
            scheduleBuild3D();
            return;
        }
        let ceilingEl = projectData.electrical.find(el => el.id === dragging3DElementId && el.type === 'light_ceiling');
        if (ceilingEl) {
            ceilingEl.x = planeIntersectPoint.x + cx;
            ceilingEl.z = planeIntersectPoint.z + cy;
            scheduleBuild3D();
            return;
        }

        if (dragging3DElementId.startsWith('deriv|')) {
            const shId = dragging3DElementId.slice(6);
            const sh = (projectData.shafts || []).find(x => x.id === shId);
            const w = sh && projectData.walls.find(x => x.id === sh.wallId);
            if (w) {
                const ax = w.x1 - cx, az = w.y1 - cy;
                const bx = w.x2 - cx, bz = w.y2 - cy;
                const L = Math.hypot(bx - ax, bz - az) || 1;
                const t = ((planeIntersectPoint.x - ax) * (bx - ax) + (planeIntersectPoint.z - az) * (bz - az)) / (L * L);
                const dCm = Math.round(Math.max(10, Math.min(L - 10, t * L)));
                sh.derivDist = Object.assign({}, sh.derivDist, { [activeLevelId]: clampDerivDist(sh, dCm) });
                scheduleBuild3D();
            }
            return;
        }

        let closestWall = null;
        let closestDistCm = 0;
        let closestSide = 1;
        let minDistance = Infinity;

        wallsOn().forEach(w => {
            const wx1 = w.x1 - cx, wz1 = w.y1 - cy;
            const wx2 = w.x2 - cx, wz2 = w.y2 - cy;
            const len = Math.hypot(wx2 - wx1, wz2 - wz1);
            if (len === 0) return;
            
            const t = ((planeIntersectPoint.x - wx1) * (wx2 - wx1) + (planeIntersectPoint.z - wz1) * (wz2 - wz1)) / (len * len);
            const clampedT = Math.max(0.05, Math.min(0.95, t));
            const projX = wx1 + clampedT * (wx2 - wx1);
            const projZ = wz1 + clampedT * (wz2 - wz1);
            const dist = Math.hypot(planeIntersectPoint.x - projX, planeIntersectPoint.z - projZ);

            if (dist < minDistance) {
                minDistance = dist;
                closestWall = w;
                closestDistCm = Math.round(Math.max(10, Math.min(len - 10, clampedT * len)));
                // côté du mur où se trouve le curseur (même convention que la 2D)
                closestSide = ((planeIntersectPoint.x - projX) * (wz2 - wz1) / len - (planeIntersectPoint.z - projZ) * (wx2 - wx1) / len) >= 0 ? 1 : -1;
            }
        });

        if (closestWall) {
            let item = projectData.electrical.find(el => el.id === dragging3DElementId) || projectData.openings.find(op => op.id === dragging3DElementId) || (projectData.shafts || []).find(sh => sh.id === dragging3DElementId);
            if (item && openingMoveBlocked(item, closestWall.id, closestDistCm)) {
                if (!drag3DRefusedOp) { drag3DRefusedOp = true; showNotification('Porte ou fenêtre déjà à cet endroit : déplacement refusé', 'error'); }
                item = null;   // reste à sa dernière position valide
            } else if (item) drag3DRefusedOp = false;
            if (item) {
                item.wallId = closestWall.id;
                // trémie : son côté (pièce) ne change pas pendant un glissement le long du mur
                item.distanceFromStart = projectData.electrical.includes(item)
                    ? snapOutletDistance(item.type, closestWall.id, closestDistCm, item.side, item.height || defaultHeightFor(item.type), item.id)
                    : closestDistCm;
                
                const distInput = document.getElementById('inspector-distance-input');
                const distVal = document.getElementById('inspector-distance-val');
                if (distInput) distInput.value = closestDistCm;
                if (distVal) distVal.textContent = closestDistCm + ' cm';
                
                scheduleBuild3D();
            }
        }
    }
}

// Glissement d'un mur en 3D (mêmes règles qu'en 2D) :
// - corps du mur : déplacement ; extrémité d'un mur déjà sélectionné (à 30 cm près) : étirement
// - seuil de 8 px avant le premier mouvement ; annulation enregistrée à ce moment
// - le centre de la scène est figé pendant le glissement, puis la vue est recalée à la fin
function startWallDrag3D(e, wid, wasSelected) {
    const wall = projectData.walls.find(w => w.id === wid);
    const p = floorPlanPointFrom3D(e);
    if (!wall || !p) return;
    const c = scene3DCentre();
    wallCentreLock3D = { cx: c.cx, cy: c.cy };
    let mode = 'move';
    const d1 = Math.hypot(p.x - wall.x1, p.y - wall.y1);
    const d2 = Math.hypot(p.x - wall.x2, p.y - wall.y2);
    if (wasSelected && Math.min(d1, d2) < 30) mode = d1 <= d2 ? 'end1' : 'end2';
    wallDrag3D = { wallId: wid, mode, startWall: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
        origin: p, down: { x: e.clientX, y: e.clientY }, moved: false };
    if (threeControls) threeControls.enabled = false;
}

function updateWallDrag3D(e) {
    const d = wallDrag3D;
    if (!d) return;
    if (!d.moved) {
        if (Math.hypot(e.clientX - d.down.x, e.clientY - d.down.y) < 8) return;
        if (!canEditWalls()) { endWallDrag3D(); return; }   // verrouillé ou modification désactivée pendant le geste
        saveStateToUndo();
        d.moved = true;
        d.linksBefore = shaftLinksValid();
    }
    const wall = projectData.walls.find(w => w.id === d.wallId);
    const p = floorPlanPointFrom3D(e);
    if (!wall || !p) return;
    const s = d.startWall;
    const prev = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
    if (d.mode === 'move') {
        const dx = p.x - d.origin.x, dy = p.y - d.origin.y;
        wall.x1 = s.x1 + dx; wall.y1 = s.y1 + dy;
        wall.x2 = s.x2 + dx; wall.y2 = s.y2 + dy;
    } else {
        const other = d.mode === 'end1' ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
        const q = snapTracePoint3D(p, other);
        if (Math.hypot(q.x - other.x, q.y - other.y) < 1) return;   // jamais de mur de longueur nulle
        if (d.mode === 'end1') { wall.x1 = q.x; wall.y1 = q.y; } else { wall.x2 = q.x; wall.y2 = q.y; }
    }
    // sécurité trémie : si ce geste couperait des câbles, on revient à la position précédente
    const lost = shaftLinksLostSince(d.linksBefore);
    if (lost.length) {
        Object.assign(wall, prev);
        if (!d.refused) { d.refused = true; showNotification(shaftRefusalMessage(lost), 'error'); }
        return;
    }
    d.refused = false;
    const L = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) / 100;
    const li = document.getElementById('inspector-length-input');
    if (li) li.value = L.toFixed(2);
    const lv = document.getElementById('inspector-length-val');
    if (lv) lv.textContent = L.toFixed(2) + ' m';
    scheduleBuild3D();
}

// Une reconstruction par image au plus pendant le glissement
function scheduleBuild3D() {
    if (wallDragFrame3D) return;
    wallDragFrame3D = true;
    requestAnimationFrame(() => { wallDragFrame3D = false; build3DScene(); });
}

function endWallDrag3D() {
    const d = wallDrag3D;
    const old = wallCentreLock3D;
    wallDrag3D = null;
    wallCentreLock3D = null;
    if (threeControls) threeControls.enabled = true;
    if (!d) return;
    if (d.moved && old) {
        // le centre se recalcule sur le nouveau mur : la vue suit, le mur reste sous le curseur
        const now = scene3DCentre();
        const dx = old.cx - now.cx, dz = old.cy - now.cy;
        if (threeCamera) { threeCamera.position.x += dx; threeCamera.position.z += dz; }
        if (threeControls && threeControls.target) { threeControls.target.x += dx; threeControls.target.z += dz; }
        showUndoBar(wallMoveMessage(d.linksBefore, d.mode === 'move' ? 'déplacé' : 'étiré'));
        if (threeControls) threeControls.update();
    }
    build3DScene();
}

function on3DPointerUp(e) {
    if (wallDrag3D) { endWallDrag3D(); return; }
    if (dragging3DElementId) {
        dragging3DElementId = null;
        if (threeControls) {
            threeControls.enabled = true;
            threeControls.update();
        }
    }
}

// Noms des niveaux reliés par une trémie, dans l'ordre de la liste
// Fantôme : copie transparente des matériaux (le modèle réel n'est pas modifié), sans interaction
function makeGhost3D(obj, opacity) {
    obj.traverse(c => {
        if (!c.material) return;
        const cloneOne = m => { const k = m.clone(); k.transparent = true; k.opacity = Math.min(k.opacity === undefined ? 1 : k.opacity, opacity); k.depthWrite = false; return k; };
        c.material = Array.isArray(c.material) ? c.material.map(cloneOne) : cloneOne(c.material);
    });
    return obj;
}
// Ouverture d'un autre niveau : emprise transparente dans son mur (hauteur de l'allège au linteau)
function addGhostOpening3D(op, dy, cx, cy) {
    const w = projectData.walls.find(x => x.id === op.wallId);
    const p = w && openingPos2D(op);
    if (!p) return;
    const b = openingBox(op, w);
    const color = b.isDoor ? 0xb07a4a : 0x93c5fd;
    const geo = new THREE.BoxGeometry(p.th + 1, Math.max(1, b.z1 - b.z0), 2 * b.half);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })));
    mesh.position.set(p.x - cx, dy + (b.z0 + b.z1) / 2, p.y - cy);
    mesh.rotation.y = -p.angle + Math.PI / 2;
    mesh.renderOrder = 3;
    threeScene.add(mesh);
    wallMeshes3D.push(mesh);
}
// Trémie fantôme : même représentation que la trémie réelle (cadre au sol, colonne en arêtes), estompée,
// avec sa boîte de dérivation à chaque niveau relié (et la montée qui les relie)
function addGhostShaft3D(sh, cx, cy) {
    const p = shaftPos2D(sh);
    if (!p) return;
    const s = sh.size || 40;
    const elevOf = lvId => Number(((projectData.levels || []).find(l => l.id === lvId) || {}).elevation) || 0;
    const levels = sh.levelIds || [sh.levelId];
    const span = shaftSpan3D(sh);
    const base = span.base;
    const add = obj => { threeScene.add(obj); wallMeshes3D.push(obj); return obj; };
    const colMat = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.35, depthWrite: false });
    const frame = add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)), colMat));
    frame.position.set(p.x - cx, base + 1, p.y - cy);
    frame.renderOrder = 3;
    // volume léger + arêtes : la colonne fantôme se voit à distance, même avec les murs transparents
    const colGeo = new THREE.BoxGeometry(s, span.height, s);
    const column = add(new THREE.LineSegments(new THREE.EdgesGeometry(colGeo), colMat));
    column.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    column.renderOrder = 3;
    const fill = add(new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.05, depthWrite: false })));
    fill.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    fill.renderOrder = 2;
    // boîtes de dérivation de chaque niveau relié, comme en réel (même taille, même position dans la gaine)
    const boxes = [];
    levels.forEach(lv => {
        const dp = derivFacePos2D(sh, derivDistOf(sh, lv));
        if (!dp) return;
        const geo = new THREE.BoxGeometry(10, DERIV_BOX_H, 14);
        const y = elevOf(lv) - elevOf(activeLevelId) + derivHeightOf(sh, lv);
        const box = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })));
        box.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.35 })));
        box.position.set(dp.x - cx, y, dp.y - cy);
        box.rotation.y = -dp.angle + Math.PI / 2;
        box.renderOrder = 4;
        boxes.push({ x: dp.x - cx, y, z: dp.y - cy });
    });
    // montée entre les boîtes des niveaux reliés
    if (boxes.length > 1) {
        const ys = boxes.map(bx => bx.y);
        const riser = add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(boxes[0].x, Math.min(...ys), boxes[0].z), new THREE.Vector3(boxes[0].x, Math.max(...ys), boxes[0].z)]),
            new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, depthWrite: false })));
        riser.renderOrder = 4;
    }
}

// Étendue verticale d'une trémie, relative au niveau affiché : de la dalle la plus basse au plafond le plus haut
function shaftSpan3D(sh) {
    const elevOf = lvId => Number(((projectData.levels || []).find(l => l.id === lvId) || {}).elevation) || 0;
    const act = elevOf(activeLevelId);
    const ids = sh.levelIds || [sh.levelId];
    const bottom = Math.min(...ids.map(elevOf)) - act;
    const top = Math.max(...ids.map(lv => elevOf(lv) - act + levelCeilingOf(lv)));
    return { base: bottom, height: Math.max(250, top - bottom) };
}

// Escalier grabbé en 3D : décalage entre le point saisi et le centre (coordonnées de la scène)
let stair3DGrab = null;
function addStair3D(st, cx, cy, ghost = false) {
    const L = st.length || 300, W = st.width || 90, n = stairStepCount(st);
    const H = Math.max(stairRiseCm(st), 1);
    const elevOf = lvId => Number(((projectData.levels || []).find(l => l.id === lvId) || {}).elevation) || 0;
    const base = Math.min(...(st.levelIds || [st.levelId]).map(elevOf)) - elevOf(activeLevelId);
    const group = new THREE.Group();
    group.position.set(st.x - cx, base, st.y - cy);
    group.rotation.y = -(st.angleDeg || 0) * Math.PI / 180;
    group.userData = { type: 'stair', id: st.id };
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.7, metalness: 0, transparent: true, opacity: ghost ? 0.25 : 0.85, depthWrite: !ghost });
    for (let i = 0; i < n; i++) {
        const h = (i + 1) * H / n;
        const step = new THREE.Mesh(new THREE.BoxGeometry(L / n, h, W), stepMat);
        step.position.set(-L / 2 + (i + 0.5) * L / n, h / 2, 0);
        group.add(step);
    }
    // contour de l'emprise au sol : repère même quand les marches sont cachées
    const footprint = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(L, 1, W)),
        new THREE.LineBasicMaterial({ color: 0x8b5cf6 }));
    footprint.position.set(0, 0.5, 0);
    group.add(footprint);
    // zone invisible sur toute la montée : permet de cliquer l'escalier et de le glisser
    const hit = new THREE.Mesh(
        new THREE.BoxGeometry(L, H + 10, W),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(0, (H + 10) / 2, 0);
    hit.userData = { type: 'stair', id: st.id };
    if (!ghost) {
        group.add(hit);
        interactiveObjects3D.push(hit);
    }
    threeScene.add(group);
    wallMeshes3D.push(group);
}

function shaftLevelNames(sh) {
    return (sh.levelIds || [sh.levelId]).map(lv => {
        const l = (projectData.levels || []).find(x => x.id === lv);
        return l ? l.name : '?';
    });
}

// Titre d'une trémie avec les niveaux qu'elle relie (ex. « Trémie : RDC ↔ Sous-sol »)
function shaftTitle(id) {
    const sh = (projectData.shafts || []).find(s => s.id === id);
    if (!sh) return 'Trémie';
    const names = (sh.levelIds || [sh.levelId]).map(lv => {
        const l = (projectData.levels || []).find(x => x.id === lv);
        return l ? l.name : '?';
    });
    return 'Trémie : relie ' + names.join(' ↔ ');
}

function select3DElement(id, meshObj) {
    selected3DId = id;
    refreshCircuitHighlights3D();
    updateCircuitsUI();   // le bouton de désélection de la liaison suit la sélection
    updateSelectionHighlight(meshObj);
    document.getElementById('inspector-3d').classList.remove('hidden');
    syncElementInspectors();

    let foundEl = projectData.electrical.find(el => el.id === id);
    let foundOp = projectData.openings.find(op => op.id === id);
    let item = foundEl || foundOp;

    const distanceContainer = document.getElementById('position-distance-container');
    const heightContainer = document.getElementById('height-control-container');
    const sideToggleContainer = document.getElementById('side-toggle-container');
    const isDoor = !!(foundOp && foundOp.type === 'door_single');
    const name = foundEl
        ? (ELEMENT_LABELS[foundEl.type] || foundEl.type)
        : foundOp ? (foundOp.type === 'door_single' ? 'Porte' : 'Fenêtre') : 'Élément';
    const isShaftSel = !foundEl && !foundOp && (projectData.shafts || []).some(s => s.id === id);
    const isStairSel = !foundEl && !foundOp && !isShaftSel && (projectData.stairs || []).some(s => s.id === id);
    document.getElementById('inspector-3d-element-name').textContent =
        foundEl ? electricalDisplayName(foundEl) : isShaftSel ? shaftTitle(id) : isStairSel ? 'Escalier' : name;

    if ((foundEl && foundEl.type === 'light_ceiling') || isStairSel) {
        distanceContainer.classList.add('hidden');
        heightContainer.classList.add('hidden');
        sideToggleContainer.classList.add('hidden');
    } else {
        distanceContainer.classList.remove('hidden');
        if (foundEl || isDoor) {
            sideToggleContainer.classList.remove('hidden');
            const side = (foundEl || foundOp).side === -1 ? -1 : 1;
            document.getElementById('inspector-side-val').textContent = side === 1 ? 'Côté A' : 'Côté B';
        } else {
            sideToggleContainer.classList.add('hidden');
        }

        if (item) {
            const wall = projectData.walls.find(w => w.id === item.wallId);
            if (wall) {
                const wx1 = wall.x1, wz1 = wall.y1;
                const wx2 = wall.x2, wz2 = wall.y2;
                const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);
                
                const distCm = item.distanceFromStart !== undefined ? item.distanceFromStart : Math.round((item.positionRatio || 0.5) * wallLen);
                const distInput = document.getElementById('inspector-distance-input');
                distInput.max = Math.round(wallLen);
                distInput.value = distCm;
                document.getElementById('inspector-distance-val').textContent = distCm + ' cm';
            }
        }

        if (foundEl) {
            heightContainer.classList.remove('hidden');
            document.getElementById('inspector-height-3d-input').value = foundEl.height || 110;
            document.getElementById('inspector-height-3d-val').textContent = ((foundEl.height || 110) / 100).toFixed(2) + ' m';
        } else {
            heightContainer.classList.add('hidden');
        }
    }
    // une trémie n'a ni distance, ni côté, ni hauteur à régler ici : seulement sa suppression
    if (isShaftSel) {
        // la trémie n'a ni distance ni côté ici ; sa hauteur, c'est le point de dérivation de ce niveau
        const sh = (projectData.shafts || []).find(x => x.id === id);
        distanceContainer.classList.add('hidden');
        sideToggleContainer.classList.add('hidden');
        heightContainer.classList.remove('hidden');
        const h = derivHeightOf(sh, activeLevelId);
        const hInput = document.getElementById('inspector-height-3d-input');
        hInput.max = levelCeilingOf(activeLevelId) - DERIV_BOX_H / 2;
        hInput.value = h;
        document.getElementById('inspector-height-3d-val').textContent = (h / 100).toFixed(2) + ' m';
    }
}

function toggleSelectedElementSide() {
    if (!selected3DId) return;
    const el = projectData.electrical.find(e => e.id === selected3DId);
    const door = projectData.openings.find(op => op.id === selected3DId && op.type === 'door_single');
    const item = el || door;
    if (!item || (el && el.type === 'light_ceiling')) return;

    saveStateToUndo();
    item.side = item.side === 1 ? -1 : 1;
    document.getElementById('inspector-side-val').textContent = item.side === 1 ? 'Côté A' : 'Côté B';
    refreshSelectedView();
    redraw2D();
    syncElementInspectors();
    showNotification(`${door ? 'Porte' : 'Appareillage'} basculé(e) (${item.side === 1 ? 'Côté A' : 'Côté B'})`, "success");
}

function updateSelectionHighlight(obj) {
    if (selectedHighlightMesh) {
        threeScene.remove(selectedHighlightMesh);
        selectedHighlightMesh = null;
    }
    if (!obj) return;
    // escalier : le cadre suit le groupe (et non la zone cliquable seule) ; matrices à jour avant calcul
    const target = obj.parent && obj.parent.userData && obj.parent.userData.type === 'stair' ? obj.parent : obj;
    target.updateWorldMatrix(true, true);
    selectedHighlightMesh = new THREE.BoxHelper(target, 0xf8fafc);
    threeScene.add(selectedHighlightMesh);
}

function updateSelected3DDistance(val) {
    if (!selected3DId) return;
    const distCm = parseInt(val);
    document.getElementById('inspector-distance-val').textContent = distCm + ' cm';

    let item = projectData.electrical.find(e => e.id === selected3DId) || projectData.openings.find(o => o.id === selected3DId);
    if (item && openingMoveBlocked(item, item.wallId, distCm)) { showNotification('Porte ou fenêtre déjà à cet endroit : déplacement refusé', 'error'); return; }
    if (item) {
        item.distanceFromStart = distCm;
        refreshSelectedView();
    }
}

function updateSelected3DHeight(val) {
    if (!selected3DId) return;
    const height = parseInt(val);
    document.getElementById('inspector-height-3d-val').textContent = (height / 100).toFixed(2) + ' m';

    let el = projectData.electrical.find(e => e.id === selected3DId);
    if (el) {
        el.height = height;
        refreshSelectedView();
        return;
    }
    // trémie sélectionnée : hauteur de son point de dérivation sur ce niveau
    const sh = (projectData.shafts || []).find(x => x.id === selected3DId);
    if (sh) {
        sh.derivHeight = Object.assign({}, sh.derivHeight, { [activeLevelId]: Math.min(height, levelCeilingOf(activeLevelId) - DERIV_BOX_H / 2) });
        build3DScene();
    }
}

async function deleteSelected3DElement() {
    if (!selected3DId) return;
    const el = projectData.electrical.find(e => e.id === selected3DId);
    const op = !el ? projectData.openings.find(o => o.id === selected3DId) : null;
    const what = el ? electricalDisplayName(el) : op ? (op.type === 'door_single' ? 'la porte' : 'la fenêtre') : 'la trémie ou l’escalier sélectionné';
    if (!(await confirmDeletion(what))) return;
    saveStateToUndo();
    projectData.shafts = (projectData.shafts || []).filter(s => s.id !== selected3DId);
    projectData.stairs = (projectData.stairs || []).filter(s => s.id !== selected3DId);
    projectData.openings = projectData.openings.filter(o => o.id !== selected3DId);
    projectData.electrical = projectData.electrical.filter(el => el.id !== selected3DId);
    selected3DId = null;
    if (selectedHighlightMesh) {
        threeScene.remove(selectedHighlightMesh);
        selectedHighlightMesh = null;
    }
    document.getElementById('inspector-3d').classList.add('hidden');
    build3DScene();
    showNotification("Élément supprimé avec succès", "success");
    redraw2D();
    syncElementInspectors();
}

// ---------- Surbrillances 3D des circuits et collisions ----------
function selectCircuit(id) {
    // Si un seul appareil était surligné (son circuit est alors coché par le clic sur l'appareil),
    // un clic sur le circuit affiche tout le circuit ; un second clic seulement le désélectionne.
    const pointFocus = !!selected3DId;
    // une seule sélection à la fois : l'élément, les murs et les ouvertures précédents sont retirés
    setSelectedWalls([]);
    selectedDeviceIds = [];
    selectedOpeningIds = [];
    selected3DId = null;
    updateSelectionHighlight(null);
    syncElementInspectors();
    selectedCircuitId = id && projectData.circuits.some(c => c.id === id)
        ? (selectedCircuitId === id && !pointFocus ? null : id)
        : null;
    build3DScene();
    updateCircuitsUI();
    redraw2D();   // la 2D affiche aussi le circuit surligné : sans ce redessin, elle gardait l'ancienne sélection
}

// Éléments à surligner pour un circuit : par défaut ceux du niveau affiché ; pool = éléments d'un autre niveau si besoin
function circuitHighlightIds(selectedCircuit, pool) {
    const shown = pool || electricalOn();
    const byId = new Map(shown.map(el => [el.id, el]));
    const panel = shown.find(el => el.type === 'panel');
    // Un interrupteur appartient au circuit de la lumière qu'il commande (sinon au circuit d'éclairage par défaut)
    const lightsOf = new Map((getCableNetwork().controlLinks || []).map(l => [l.switchId, l.lightIds || []]));
        const switchBelongs = (sw) => {
        // la lumière commandée peut être à un autre niveau : on la cherche dans tout le projet
        // un interrupteur sans lumière commandée n'appartient à aucun circuit d'éclairage
        const first = (lightsOf.get(sw.id) || []).map(id => byId.get(id) || projectData.electrical.find(e => e.id === id)).find(Boolean);
        const c = first ? circuitOf(first) : null;
        return !!c && c.id === selectedCircuit.id;
    };
    return new Set(shown
        .filter(el => {
            // un interrupteur suit la lumière qu'il commande, jamais le circuit d'éclairage par défaut
            if (isLightingControl(el)) return selectedCircuit.type === 'lighting' && switchBelongs(el);
            const assigned = circuitOf(el);
            return (assigned && assigned.id === selectedCircuit.id) || (panel && el.id === panel.id);
        })
        .map(el => el.id));
}

// Mur sélectionné : cadre bleu autour du mur en 3D, pour savoir ce qui est sélectionné (comme en 2D)
function addWallSelectionHighlights() {
    if (!selectedWallIds.length) return;
    if (canEditWalls()) {
        // poignées aux extrémités du mur sélectionné : tirer une poignée étire le mur
        const { cx, cy } = scene3DCentre();
        selectedWallIds.forEach(id => {
            const w = projectData.walls.find(x => x.id === id);
            if (!w) return;
            [[w.x1, w.y1], [w.x2, w.y2]].forEach(([px, py]) => {
                const h = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8, depthTest: false }));
                h.position.set(px - cx, 6, py - cy);
                h.renderOrder = 13;
                threeScene.add(h);
                wallMeshes3D.push(h);
            });
        });
    }
    clickableWalls3D.forEach(m => {
        if (!m.userData || !selectedWallIds.includes(m.userData.id)) return;
        m.updateWorldMatrix(true, true);
        const helper = new THREE.BoxHelper(m, 0x38bdf8);
        helper.material.depthTest = false;
        helper.renderOrder = 12;
        helper.userData.shared = false;
        threeScene.add(helper);
        wallMeshes3D.push(helper);
    });
}

// Circuit sélectionné : surbrillance sur TOUS les niveaux (3D), pas seulement sur le niveau affiché.
// Pour chaque autre niveau : boîte colorée autour de chaque appareil du circuit (à sa vraie hauteur)
// et tronçons de câble du circuit en pleine couleur, même si les fantômes sont masqués.
function addCircuitCrossLevelHighlights(cx, cy) {
    if (!selectedCircuitId) return;
    const sc = projectData.circuits.find(c => c.id === selectedCircuitId);
    if (!sc) return;
    const actLevel = (projectData.levels || []).find(l => l.id === activeLevelId);
    const actElev = Number(actLevel && actLevel.elevation) || 0;
    const col = circuitColor(sc);
    (projectData.levels || []).filter(l => l.id !== activeLevelId).forEach(lv => {
        const dy = (Number(lv.elevation) || 0) - actElev;
        const pool = electricalOn(lv.id);
        const ids = circuitHighlightIds(sc, pool);
        pool.forEach(el => {
            if (!ids.has(el.id)) return;
            const mesh = createElementMesh3D(el, cx, cy);
            if (!mesh) return;
            mesh.position.y += dy;
            // la boîte ne lit que la géométrie : le modèle n'est pas ajouté à la scène
            mesh.updateWorldMatrix(true, true);
            const helper = new THREE.BoxHelper(mesh, col);
            helper.material.transparent = true;
            helper.material.opacity = 0.95;
            helper.material.depthTest = false;
            helper.renderOrder = 10;
            helper.userData.shared = false;
            threeScene.add(helper);
            wallMeshes3D.push(helper);
        });
        // câbles du circuit sur cet autre niveau
        const net = ghostCableNetwork(lv.id);
        const pts = [];
        (net && net.segments || []).forEach(sg => {
            if (!(sg.cids || []).includes(sc.id)) return;
            pts.push(sg.a.x - cx, sg.a.z + dy, sg.a.y - cy, sg.b.x - cx, sg.b.z + dy, sg.b.y - cy);
        });
        if (pts.length) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: 1, depthWrite: false }));
            line.renderOrder = 6;
            line.userData.shared = false;
            threeScene.add(line);
            wallMeshes3D.push(line);
        }
    });
}

function addCircuitElementHighlights() {
    if (!selectedCircuitId) return;
    const selectedCircuit = projectData.circuits.find(c => c.id === selectedCircuitId);
    if (!selectedCircuit) return;
    const highlightedIds = circuitHighlightIds(selectedCircuit);
    interactiveObjects3D.forEach(obj => {
        if (!obj.userData || !highlightedIds.has(obj.userData.id)) return;
        const helper = new THREE.BoxHelper(obj, circuitColor(selectedCircuit));
        helper.material.transparent = true;
        helper.material.opacity = 0.95;
        helper.material.depthTest = false;
        helper.renderOrder = 10;
        helper.userData.shared = false;
        helper.userData.circuitHL = true;
        // élément sélectionné depuis le circuit : son cadre clignote avec le même rythme que les alertes
        if (obj.userData.id === selected3DId) {
            // alterne entre la couleur du circuit et le blanc (le cadre ne disparaît plus)
            const cc = circuitColor(selectedCircuit);
            helper.userData.blinkPalette = [cc, contrastHex3D(cc)];
            helper.material.color.set(blinkOn ? contrastHex3D(cc) : cc);
        }
        threeScene.add(helper);
        wallMeshes3D.push(helper);
    });
}

// Surbrillance du circuit reconstruite à chaque changement de sélection : le nouvel élément sélectionné
// clignote aussitôt, et l'ancien ne clignote plus
function refreshCircuitHighlights3D() {
    for (let i = wallMeshes3D.length - 1; i >= 0; i--) {
        const m = wallMeshes3D[i];
        if (m.userData && m.userData.circuitHL) {
            threeScene.remove(m);
            wallMeshes3D.splice(i, 1);
        }
    }
    addCircuitElementHighlights();
}

let blinkOn = true;

function addCollisionHighlights() {
    const ids = collidingElementIds();
    if (!ids.size) return;
    interactiveObjects3D.forEach(obj => {
        if (!obj.userData || !ids.has(obj.userData.id)) return;
        const target = obj.parent && obj.parent.userData && obj.parent.userData.type === 'stair' ? obj.parent : obj;
        target.updateWorldMatrix(true, true);
        // Remplissage rouge translucide (aussi visible de loin) + contour : les deux clignotent ensemble
        const box = new THREE.Box3().setFromObject(target);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const pad = 8;
        const fill = new THREE.Mesh(
            new THREE.BoxGeometry(size.x + pad * 2, size.y + pad * 2, size.z + pad * 2),
            new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false })
        );
        fill.position.copy(centre);
        fill.renderOrder = 11;
        fill.userData.shared = false;
        fill.userData.blink = true;
        fill.visible = blinkOn;
        threeScene.add(fill);
        wallMeshes3D.push(fill);

        const helper = new THREE.BoxHelper(target, 0xef4444);
        helper.material.depthTest = false;
        helper.renderOrder = 12;
        helper.userData.shared = false;
        helper.userData.blink = true;
        helper.visible = blinkOn;
        threeScene.add(helper);
        wallMeshes3D.push(helper);
    });
}

// ---------- Cache du réseau de gaines ----------
// Réseau de gaines mis en cache tant que le projet ne change pas
let _cableCache = { sig: null, net: null };
function getCableNetwork() {
    ensureCircuitAssignment();
    // Le niveau affiché fait partie de la clé : changer de niveau change le réseau calculé
    const sig = JSON.stringify([activeLevelId, projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts]);
    if (_cableCache.sig !== sig) _cableCache = { sig, net: computeCableNetwork() };
    cableStats = _cableCache.net;
    return _cableCache.net;
}
