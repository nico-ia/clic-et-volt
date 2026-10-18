// Scène 3D (Three.js) : initialisation, caméra, maillages, câblage automatique et interactions souris.
// Script classique : les fonctions sont globales et utilisent l'état partagé défini dans index.html
// (threeScene, threeCamera, threeRenderer, threeControls, projectData, interactiveObjects3D, ...).

function init3DScene() {
    const container = document.getElementById('three-container');
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(currentTheme === 'light' ? '#e2e8f0' : '#020617');

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

    const ambientLight = new THREE.AmbientLight('#ffffff', 0.75);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#ffffff', 0.85);
    dirLight.position.set(400, 800, 400);
    threeScene.add(dirLight);

    threeRenderer.domElement.addEventListener('pointerdown', on3DPointerDown);
    threeRenderer.domElement.addEventListener('pointermove', on3DPointerMove);
    threeRenderer.domElement.addEventListener('pointerleave', hidePlanTooltip);

    threeRenderer.domElement.addEventListener('pointerup', on3DPointerUp);
    threeRenderer.domElement.addEventListener('dblclick', on3DDoubleClick);

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

// =====================================================================
//  ÉTIQUETTES À TAILLE FIXE À L'ÉCRAN (3D) : cotes des murs et noms des niveaux des trémies
// =====================================================================
// Le canvas de chaque étiquette est SCREEN_LABEL_SCALE fois plus grand que sa taille à l'écran : le texte reste net.
const SCREEN_LABEL_SCALE = 4;
// Étiquettes recalculées à chaque image : { sprite, wPx, hPx } (tailles en pixels écran)
const SCREEN_LABELS_3D = [];

// Crée une étiquette de texte, sans fond. fontPx : taille du texte à l'écran, en pixels.
// opts.bold (vrai par défaut), opts.halo (contour autour des lettres, 4 px), opts.dark (couleur en thème sombre)
function makeScreenLabel3D(text, fontPx, opts = {}) {
    const S = SCREEN_LABEL_SCALE;
    const light = currentTheme === 'light';
    const font = (opts.bold === false ? '' : 'bold ') + (fontPx * S) + 'px Inter, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const haloW = opts.halo ? 4 * S : 0;
    const pad = haloW + 2 * S;
    const W = Math.ceil(measure.measureText(text).width + 2 * pad);
    const H = Math.ceil(fontPx * S + 2 * pad);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (opts.halo) {
        ctx.lineWidth = haloW;
        ctx.strokeStyle = light ? '#ffffff' : '#020617';
        ctx.strokeText(text, W / 2, H / 2);
    }
    ctx.fillStyle = light ? '#0f172a' : (opts.dark || '#f8fafc');
    ctx.fillText(text, W / 2, H / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sprite.renderOrder = 11;
    SCREEN_LABELS_3D.push({ sprite, wPx: W / S, hPx: H / S });
    return sprite;
}

// Taille monde d'un pixel écran à la distance de l'objet (caméra en perspective)
function worldPerScreenPx3D(pos) {
    const dist = threeCamera.position.distanceTo(pos);
    const viewH = threeRenderer.domElement.clientHeight || 1;
    return 2 * dist * Math.tan((threeCamera.fov * Math.PI / 180) / 2) / viewH;
}

// Met chaque étiquette à l'échelle pour qu'elle garde sa taille à l'écran, quel que soit le zoom ou la distance
function updateScreenLabels3D() {
    if (!threeCamera || !threeRenderer) return;
    SCREEN_LABELS_3D.forEach(l => {
        if (!l.sprite.parent) return;   // retirée par une reconstruction de la scène
        const k = worldPerScreenPx3D(l.sprite.position);
        l.sprite.scale.set(l.wPx * k, l.hPx * k, 1);
    });
}




function animate3D() {
    requestAnimationFrame(animate3D);
    // scène 3D cachée (mode 2D) : inutile de la dessiner ni de mettre à jour la caméra
    if (currentMode !== '3d') return;

    if (threeControls && !dragging3DElementId) threeControls.update();
    updateScreenLabels3D();

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
        if (blocked && o.material.color) o.material.color.set('#ef4444');
    });
    group.userData = {};
    return group;
}

// Couleur qui se détache de celle donnée (noir sur couleur claire, blanc sur couleur sombre)
function contrastHex3D(css) {
    const c = new THREE.Color(css);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.6 ? '#0f172a' : '#ffffff';
}

// Trémie fantôme : colonne translucide (même emprise et même hauteur que la vraie trémie)
function createShaftGhost3D(sh, cx, cy) {
    const sp = shaftPos2D(sh);
    if (!sp) return null;
    const span = shaftSpan3D(sh);
    const s = sh.size || 40;
    const group = new THREE.Group();
    const pos = new THREE.Vector3(sp.x - cx, span.base + span.height / 2, sp.y - cy);
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, span.height, s), new THREE.MeshBasicMaterial({ color: '#f8fafc' }));
    box.position.copy(pos);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: '#f8fafc' }));
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
    if (CEILING_TYPES.includes(type)) {
        const hit = ceilingMesh3D ? raycaster.intersectObject(ceilingMesh3D) : [];
        if (hit.length) {
            const pt = hit[0].point;
            ghost = { id: '__ghost', levelId: activeLevelId, type, x: pt.x + cx, y: 245, z: pt.z + cy };
            blocked = !!ceilingSpotBlocker(ghost.x, ghost.z, activeLevelId);
        }
    } else if (type === 'stair' || type === 'shaft') {
        // escalier ou trémie : point du sol sous le curseur ; l'escalier se colle aux murs
        const floorPt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorPt)) {
            ghost = { id: '__ghost', type, levelId: activeLevelId, levelIds: previewStairLevels(),
                x: Math.round(floorPt.x + cx), y: Math.round(floorPt.z + cy), angleDeg: 0, width: 90, length: 300, size: 40 };
            if (type === 'stair') snapStairToWalls(ghost);
        }
    } else {
        const wallIntersects = raycaster.intersectObjects(clickableWalls3D, true);
        if (wallIntersects.length) {
            let m = wallIntersects[0].object;
            while (m && (!m.userData || !m.userData.id) && m.parent) m = m.parent;
            wall = m && m.userData && m.userData.id ? projectData.walls.find(w => w.id === m.userData.id) : null;
            
            if (wall) {
                const hitPt = wallIntersects[0].point;
                const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
                const distToPt = Math.hypot(hitPt.x - (wall.x1 - cx), hitPt.z - (wall.y1 - cy));
                const side = wallSideOf(hitPt.x, hitPt.z, wall.x1 - cx, wall.y1 - cy, wall.x2 - cx, wall.y2 - cy);
                const distanceCm = placedDistance({ type, height: defaultHeightFor(type) }, wall.id, Math.round(distToPt), side);                
                ghost = { id: '__ghost', levelId: activeLevelId, type, wallId: wall.id, distanceFromStart: distanceCm, side,
                    height: defaultHeightFor(type) };
                if (type === 'shaft') { ghost.size = 40; ghost.levelIds = [activeLevelId]; }
                if (type === 'door_single' || type === 'window_std') {
                    ghost.width = type === 'door_single' ? 96 : 120;
                    ghost.height = type === 'door_single' ? 210 : 120;
                    if (type === 'window_std') ghost.sillHeight = 90;
                    if (type === 'door_single') ghost.hingeSide = doorHingeForPlacement();
                }
                blocked = !!sameSpotBlocker(type, activeLevelId, wall.id, distanceCm, side, defaultHeightFor(type));
            }
        }
    }
    if (!ghost) { removePlaceGhost3D(); return; }

    // reconstruction seulement si quelque chose a changé (pas à chaque mouvement de souris)
    const key = JSON.stringify([ghost, blocked]);
    if (key === placeGhostKey3D && placeGhost3D && placeGhost3D.parent === threeScene) return;   // encore présent dans la scène
    removePlaceGhost3D();
    const isOpening = type === 'door_single' || type === 'window_std';
    const mesh = type === 'stair'
        ? buildStair3D(ghost, cx, cy, true)
        : type === 'shaft'
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
    syncDefaultSpecs();
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
    if (CEILING_TYPES.includes(el.type)) {
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
        z: el.height || ((el.type === 'panel' || el.type === 'subpanel') ? 150 : el.type === 'wall_light' ? 180 : el.type === 'doorbell_chime' ? 200 : el.type === 'shutter_motor' ? 210 : el.type.startsWith('outlet') ? 30 : 110)
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
    lowZ: 10,           // cheminement bas : à hauteur des prises (une prise à 30 cm se raccorde sans descente)
    ceilGap: 8,         // cheminement haut = juste sous le plafond
    crossStep: 60,      // pas des traversées de cloison possibles (cm)
    crossPenalty: 12,   // coût fictif (cm) : on ne perce un mur que si cela fait gagner de la longueur
    passageCost: 150,   // coût fictif (cm) d'un passage à plafond entre deux pièces fermées
    passageStep: 20,    // pas de contrôle du passage (cm)
    openMargin: 8,      // marge autour des ouvertures (rayon de gaine + cadre)
    maxDegree: 3,       // câbles maximum arrivant sur un même boîtier d'appareil (repiquage)
    lightLinks: 3,      // points de raccordement testés par plafonnier
    maxRadius: 5
};
// câble de liaison tableau → sous-tableau : identifiant réservé (hors circuits) et couleur de mise en évidence
const FEEDER_CID = '_feeder';
const FEEDER_COLOR = '#e879f9';
// opacité de la gaine mise en surbrillance : assez transparente pour laisser voir les fils
const CONDUIT_FOCUS_OPACITY = 0.45;
// opacité des gaines ICTA, réglée par le curseur 3D (0 à 1) ; valeur de départ = ancien rendu
let conduitOpacity = 0.32;
// rayon d'une âme de fil (unités monde) ; les fils occupent toute la section utile de la gaine
const CORE_R = 0.24;
// le câble de liaison est listé comme un circuit (sans appareils) : le pseudo-circuit permet de le sélectionner
const FEEDER_CIRCUIT = { id: FEEDER_CID, name: 'Câble entre tableaux', type: 'feeder', color: FEEDER_COLOR };
function circuitById(id) {
    if (!id) return null;
    if (id === FEEDER_CID) return FEEDER_CIRCUIT;
    return projectData.circuits.find(c => c.id === id) || null;
}
// false : le câble de liaison a été retiré de l'affichage du circuit sélectionné
let feederWithCircuit = true;
function feederShownForSelection() {
    if (selectedCircuitId === FEEDER_CID) return true;
    return !!selectedCircuitId && feederWithCircuit;
}
function toggleFeederWithCircuit() {
    feederWithCircuit = !feederWithCircuit;
    build3DScene();
    updateCircuitsUI();
    redraw2D();
}
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

// Côté d'un mur (+1 / -1) où se trouve un point, mesuré sur la normale du tracé (même convention que l'ancien mesh pivoté)
function wallSideOf(hitX, hitZ, wx1, wz1, wx2, wz2) {
    const dx = wx2 - wx1, dz = wz2 - wz1;
    return ((hitX - (wx1 + wx2) / 2) * dz - (hitZ - (wz1 + wz2) / 2) * dx) >= 0 ? 1 : -1;
}

// Contour en plan d'un mur (4 coins). À une jonction avec un seul autre mur, le coin est une coupe à 45° :
// les deux murs se rejoignent sur leur épaisseur au lieu de se chevaucher par leur axe.
// Extrémité libre, jonction multiple ou murs alignés : coupe perpendiculaire.
function mitredWallOutline(w, levelWalls, cx, cy) {
    const A = { x: w.x1 - cx, z: w.y1 - cy };
    const B = { x: w.x2 - cx, z: w.y2 - cy };
    const h = (w.thickness || 10) / 2;
    const L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    const u = { x: (B.x - A.x) / L, z: (B.z - A.z) / L };
    const n = { x: u.z, z: -u.x };
    const flat = (J, side) => ({ x: J.x + side * h * n.x, z: J.z + side * h * n.z });
    const ends = o => [{ x: o.x1 - cx, z: o.y1 - cy }, { x: o.x2 - cx, z: o.y2 - cy }];
    const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1;
    const unit = v => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
    const cornerAt = (J, uBody, side) => {
        const touching = levelWalls.filter(o => o.id !== w.id && ends(o).some(p => near(p, J)));
        if (touching.length !== 1) return flat(J, side);
        const other = ends(touching[0]).find(p => !near(p, J));
        if (!other) return flat(J, side);
        const uo = unit({ x: other.x - J.x, z: other.z - J.z });
        const no = { x: uo.z, z: -uo.x };
        const ho = (touching[0].thickness || 10) / 2;
        // s1 : côté de ce mur où se trouve l'autre mur ; s2 : côté de l'autre mur où se trouve ce mur
        const s1 = Math.sign(n.x * uo.x + n.z * uo.z);
        const s2 = Math.sign(no.x * uBody.x + no.z * uBody.z);
        if (!s1 || !s2) return flat(J, side);
        const tau = side === s1 ? s2 : -s2;
        const det = n.x * no.z - n.z * no.x;
        if (Math.abs(det) < 1e-6) return flat(J, side);
        const ey = side * h, fy = tau * ho;
        const P = { x: J.x + (ey * no.z - n.z * fy) / det, z: J.z + (n.x * fy - no.x * ey) / det };
        // angle très aigu : la coupe s'allongerait démesurément
        if (Math.hypot(P.x - J.x, P.z - J.z) > 6 * Math.max(h, ho)) return flat(J, side);
        return P;
    };
    return [
        cornerAt(A, u, 1),
        cornerAt(B, { x: -u.x, z: -u.z }, 1),
        cornerAt(B, { x: -u.x, z: -u.z }, -1),
        cornerAt(A, u, -1)
    ];
}

// Volume d'un mur : extrusion du contour en plan sur la hauteur du mur (repère de la scène, sans transformation de mesh)
function wallSolidGeometry(outline, height) {
    const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, -p.z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
}
// Emprise d'une ouverture sur son mur : position, demi-largeur, hauteurs d'allège et de linteau
function openingBox(op, wall) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const isDoor = op.type === 'door_single';
    const width = op.width || (isDoor ? 96 : 120);
    let d = op.distanceFromStart !== undefined ? op.distanceFromStart : (op.positionRatio !== undefined ? op.positionRatio * len : len / 2);
    // l'ouverture reste entièrement sur le mur : son centre est au moins à une demi-largeur de chaque bout
    d = Math.max(width / 2, Math.min(len - width / 2, d));
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

// Une trémie se pose n'importe où et relie ses niveaux : le câble la rejoint depuis le mur le plus proche
function shaftValidOn() { return true; }

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

// Point de dérivation libre d'une trémie pour un niveau : le câble le rejoint depuis le mur le plus proche
function freeDerivationItem(sh, id, type, levelId) {
    return { id, type, levelId, free: { x: sh.x, y: sh.y }, height: derivHeightOf(sh, levelId), side: 1, shaftId: sh.id };
}

function shaftFeedFor(levelId) {
    const panelEl = projectData.electrical.find(e => e.type === 'panel');
    if (!panelEl) return { feed: null, reason: 'none' };
    if (levelId === panelEl.levelId) {
        // niveau du tableau lui-même : sa trémie de dérivation vers un autre étage (sert à l'affichage)
        const sh = (projectData.shafts || []).find(s => (s.levelIds || []).length >= 2 && s.levelIds.includes(levelId));
        if (!sh) return { feed: null, reason: 'noShaft' };
        const feed = Object.assign(freeDerivationItem(sh, 'feed_' + sh.id, 'panel', levelId), { isFeed: true });
        return { feed, reason: null, shaft: sh, nextLevelId: sh.levelIds.find(id => id !== levelId), panelLevelId: levelId, tree: null };
    }
    const tree = levelTreeToPanel(panelEl.levelId);
    const step = tree.get(levelId);
    if (!step) return { feed: null, reason: 'noShaft' };
    const sh = (projectData.shafts || []).find(s => s.id === step.shaft);
    if (!sh) return { feed: null, reason: 'noShaft' };
    const feed = Object.assign(freeDerivationItem(sh, 'feed_' + sh.id, 'panel', levelId), { isFeed: true });
    return { feed, reason: null, shaft: sh, nextLevelId: step.to, panelLevelId: panelEl.levelId, tree };
}

// Pseudo-élément placé à la trémie qui joint deux niveaux
function shaftProxyOn(levelId, otherLevelId, proxyId, type, height, refs) {
    const sh = shaftCandidatesBetween(levelId, otherLevelId, refs)[0];
    if (!sh) return null;
    return Object.assign(freeDerivationItem(sh, proxyId, type, levelId), { isProxy: true });
}

// Point de dérivation de chaque trémie qui relie cet étage à un autre
function derivationPointsOn(levelId) {
    return shaftsOn(levelId)
        .filter(sh => (sh.levelIds || [sh.levelId]).length >= 2)
        .map(sh => Object.assign(freeDerivationItem(sh, 'dv|' + sh.id, 'derivation', levelId), { isProxy: true }));
}

// Commande entre niveaux (ex. va-et-vient RDC / sous-sol) : la liaison est coupée à la trémie.
// Côté interrupteur : une lumière d'un autre niveau devient un point de raccord « xl| » à la trémie.
// Côté lumière : un interrupteur d'un autre niveau devient un point de raccord « xs| » à la trémie.
function crossLevelControlProxies(result) {
    const here = electricalOn();
    const hereIds = new Set(here.map(e => e.id));
    const lightsHere = here.filter(e => CONTROLLED_LOAD_TYPES.includes(e.type));
    const proxies = [];
    here.filter(isControl).forEach(sw => {
        (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).forEach(lid => {
            if (hereIds.has(lid)) return;
            const light = projectData.electrical.find(e => e.id === lid && CONTROLLED_LOAD_TYPES.includes(e.type) && canControl(sw, e));
            if (!light) return;
            const pos = shaftProxyOn(activeLevelId, light.levelId, 'xl|' + lid, light.type, 110, [sw, light]);
            if (!pos) {
                result.warnings.push('Commande de ' + electricalDisplayName(light) + ' (autre niveau) : aucune trémie entre les deux niveaux');
                return;
            }
            pos.realId = lid;
            proxies.push(pos);
        });
    });
    projectData.electrical.filter(e => isControl(e) && !hereIds.has(e.id)).forEach(sw => {
        const mine = (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).filter(lid => lightsHere.some(l => l.id === lid && canControl(sw, l)));
        if (!mine.length) return;
        const pos = shaftProxyOn(activeLevelId, sw.levelId, 'xs|' + sw.id, sw.type, 110,
            [sw, lightsHere.find(l => l.id === mine[0])]);
        if (!pos) return;
        pos.realId = sw.id;
        pos.controlledLightIds = mine;
        proxies.push(pos);
    });
    return proxies;
}

// Calcul du réseau : sans passage entre pièces tant qu'aucun circuit ne l'autorise (routes inchangées).
// Sinon, les arêtes de passage existent, mais seuls les circuits autorisés (c.roomCrossing) peuvent les emprunter.
function computeCableNetwork() {
    const anyCrossing = projectData.circuits.some(c => c.roomCrossing);
    if (!anyCrossing) return buildCableNetwork(false);
    const net = buildCableNetwork(true);
    net.passageUsed = true;
    return net;
}

// Escalier posé contre ce mur (à moins de STAIR_SNAP_CM) : intervalle bloqué sur la piste du mur,
// de sol à plafond, pour que le câble contourne l'emprise de l'escalier
function stairSpansOnWall(w, m) {
    const W = wallRectOf(w);
    if (!W) return [];
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const out = [];
    stairsOn(activeLevelId).forEach(st => {
        const R = stairRect(st);
        const dx = R.cx - W.cx, dy = R.cy - W.cy;
        const d = dx * W.vx + dy * W.vy;
        const rS = R.hl * Math.abs(R.ux * W.vx + R.uy * W.vy) + R.hw * Math.abs(R.vx * W.vx + R.vy * W.vy);
        const gap = Math.abs(d) - (W.hw + rS);
        if (gap >= STAIR_SNAP_CM) return;
        const t = dx * W.ux + dy * W.uy;
        const rU = R.hl * Math.abs(R.ux * W.ux + R.uy * W.uy) + R.hw * Math.abs(R.vx * W.ux + R.vy * W.uy);
        const sc = t + W.hl;   // position le long du mur, depuis son origine
        const lo = Math.max(0, sc - rU - m), hi = Math.min(len, sc + rU + m);
        if (hi <= lo) return;
        // face du mur côté escalier : d >= 0 est le côté +v, qui correspond à la piste de côté -1
        // hauteur des marches le long du mur (s = distance depuis l'origine du mur)
        const stepTop = s => {
            const px = w.x1 + (w.x2 - w.x1) / len * s - R.cx, py = w.y1 + (w.y2 - w.y1) / len * s - R.cy;
            return stairStepTopAt(st, px * R.ux + py * R.uy);
        };
        // le blocage du mur s'arrête à la hauteur de passage, comme le volume protégé (sol le plus haut relié + 210 cm)
        const elevOfSt = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
        const zTop = Math.max(...(st.levelIds || [st.levelId]).map(elevOfSt)) - elevOfSt(activeLevelId) + STAIR_PASSAGE_CM;
        out.push({ lo, hi, z0: -1e9, z1: zTop, side: d >= 0 ? -1 : 1, stepTop });
    });
    return out;
}


// Marge autour de l'emprise pour un câble (cm)
const STAIR_CABLE_MARGIN = 8;

// Hauteur de passage sous un escalier (cm), au-dessus du sol le plus haut relié
const STAIR_PASSAGE_CM = 210;

// Bande le long d'un mur collé à l'escalier : libre au-dessus des marches (cm)
const STAIR_STRIP_CM = 15;

// Côtés de l'escalier collés à un mur du niveau : +1 ou -1 (le long de l'axe v de l'escalier)
function stairWallSides(st) {
    const R = stairRect(st);
    const sides = [];
    (projectData.walls || []).filter(w => (st.levelIds || [st.levelId]).includes(w.levelId)).forEach(w => {
        const W = wallRectOf(w);
        if (!W) return;
        const dx = W.cx - R.cx, dy = W.cy - R.cy;
        const dv = dx * R.vx + dy * R.vy;
        const du = dx * R.ux + dy * R.uy;
        const gap = Math.abs(dv) - (R.hw + W.hw);
        if (gap < STAIR_SNAP_CM && Math.abs(du) < R.hl + W.hl) sides.push(dv >= 0 ? 1 : -1);
    });
    return sides;
}

// Hauteur du dessus des marches au point pu de l'axe de l'escalier (0 au bas, H en haut)
function stairStepTopAt(st, pu) {
    const R = stairRect(st);
    const H = Math.max(stairRiseCm(st), 1);
    return H * Math.min(1, Math.max(0, (pu + R.hl) / (2 * R.hl)));
}

// Tronçon au-dessus des marches : autorisé dans la bande le long du mur
function aboveStairSteps(sp, s0, s1, z) {
    if (!sp.stepTop) return false;
    return z >= Math.max(sp.stepTop(s0), sp.stepTop(s1)) + 5;
}

// Premier escalier du niveau dont le volume protégé est traversé par le tronçon a-b, sinon null.
// Volume protégé : emprise au sol, du sol le plus bas relié jusqu'au sol le plus haut relié + 210 cm,
// sauf la bande le long du mur au-dessus des marches.
function segmentCrossesStairVolume(a, b) {
    const stairs = stairsOn(activeLevelId);
    if (!stairs.length) return null;
    const elevOf = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
    const here = elevOf(activeLevelId);
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const N = Math.max(1, Math.ceil(len / 2));   // un point tous les 2 cm
    for (const st of stairs) {
        const elevs = (st.levelIds || [st.levelId]).map(elevOf);
        const zLow = Math.min(...elevs) - here;
        const zHigh = Math.max(...elevs) - here + STAIR_PASSAGE_CM;
        const R = stairRect(st);
        // boîte de l'emprise élargie de la marge : un tronçon qui ne la touche pas ne peut pas la traverser
        const extU = Math.abs(R.ux) * (R.hl + STAIR_CABLE_MARGIN) + Math.abs(R.vx) * (R.hw + STAIR_CABLE_MARGIN);
        const extV = Math.abs(R.uy) * (R.hl + STAIR_CABLE_MARGIN) + Math.abs(R.vy) * (R.hw + STAIR_CABLE_MARGIN);
        if (Math.max(a.x, b.x) < R.cx - extU || Math.min(a.x, b.x) > R.cx + extU
            || Math.max(a.y, b.y) < R.cy - extV || Math.min(a.y, b.y) > R.cy + extV) continue;
        if (Math.max(a.z, b.z) < zLow || Math.min(a.z, b.z) > zHigh) continue;
        const sides = stairWallSides(st);
        for (let k = 0; k <= N; k++) {
            const t = k / N;
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
            if (z < zLow || z > zHigh) continue;
            const dx = x - R.cx, dy = y - R.cy;
            const pu = dx * R.ux + dy * R.uy, pv = dx * R.vx + dy * R.vy;
            if (Math.abs(pu) > R.hl + STAIR_CABLE_MARGIN || Math.abs(pv) > R.hw + STAIR_CABLE_MARGIN) continue;
            // bande le long du mur : libre au-dessus des marches, interdite en dessous
            const inStrip = sides.some(sv => sv * pv >= R.hw - STAIR_STRIP_CM);
            if (inStrip && z >= stairStepTopAt(st, pu) + 5) continue;
            return st;
        }
    }
    return null;
}

// Matériau rouge des tronçons qui traversent un escalier
function stairHitMaterial() {
    return CABLE_RES.stairHitMat || (CABLE_RES.stairHitMat = markShared(new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 1, depthWrite: false })));
}

// Mémoire des tests de ligne de vue (airClear) : vidée dès que murs, escaliers, niveaux ou plafond changent
const AIR_CLEAR_MEMO = { sig: null, map: new Map() };

function buildCableNetwork(passage) {
    ensureCircuitAssignment();
    const C = CABLE_CFG;
    const walls = wallsOn().filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1);
    // faces extérieures : les gaines et les fils restent à l'intérieur du logement
    const outFaces = outsideFacesOf();
    const els = electricalOn();
    const result = { segments: [], linkCount: 0, unrouted: 0, linkInfo: [], circuitRuns: {}, warnings: [], controlLinks: [], boxServed: {}, forced: new Set(), unroutedBy: {} };
    // chaque liaison non reliée est comptée sur son circuit (« _none » : sans circuit) pour que l'alerte le désigne
    const lostFor = (cid, n = 1) => { const k = cid || '_none'; result.unroutedBy[k] = (result.unroutedBy[k] || 0) + n; result.unrouted += n; };
    const cidOfEl = el => { const c = circuitOf(el); return c ? c.id : null; };
    let panel = els.find(e => e.type === 'panel') || null;
    const wired = els.filter(e => e.type !== 'panel' && e.type !== 'subpanel');
    let feedInfo = null;   // niveau sans tableau : trémie qui le relie au tableau d'un autre étage
    // un niveau sans appareil mais avec une trémie vers un autre étage doit aussi être raccordé (ses trémies passent les circuits)
    const hasShaftLinks = wired.length > 0 || derivationPointsOn(activeLevelId).length > 0;
    if (!panel && hasShaftLinks) {
        const fed = shaftFeedFor(activeLevelId);
        feedInfo = fed;
        panel = fed.feed;
        if (!panel) {
            if (!wired.length) return result;   // étage sans appareil ni trémie utilisable : rien à signaler
            wired.forEach(el => lostFor(cidOfEl(el)));
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
        list.push(...stairSpansOnWall(w, m));   // escaliers posés contre le mur : le câble les contourne
        spans.set(w.id, list);
        tracks.filter(t => t.wall === w).forEach(t => list.forEach(sp => t.st.push(sp.lo, sp.hi)));
    });
    // gaine horizontale à la hauteur z entre s0 et s1 ?
    // un blocage d'escalier ne vaut que pour sa face ; une ouverture (sans face) bloque les deux
    const sameFace = (sp, side) => side === undefined || sp.side === undefined || sp.side === side;
    const blockedH = (wid, s0, s1, z, side) => spans.get(wid).some(sp => sameFace(sp, side) && !aboveStairSteps(sp, s0, s1, z) && s1 > sp.lo + 0.01 && s0 < sp.hi - 0.01 && z >= sp.z0 && z <= sp.z1);
    // colonne verticale à la position s entre les hauteurs za et zb ?
    const blockedV = (wid, s, za, zb, side) => spans.get(wid).some(sp => sameFace(sp, side) && !aboveStairSteps(sp, s, s, Math.min(za, zb)) && s > sp.lo && s < sp.hi && Math.max(za, zb) >= sp.z0 && Math.min(za, zb) <= sp.z1);

    // 4. Position de la descente verticale de chaque appareil mural
    const place = new Map();
    allEls.forEach(el => {
        if (el.free) {
            // point libre (trémie) : le câble rejoint la piste du mur le plus proche, en ligne droite
            let bestT = null, bestS = 0, bestD = Infinity;
            tracks.forEach(t => {
                const s = Math.max(0, Math.min(t.len, (el.free.x - t.ox) * t.ux + (el.free.y - t.oy) * t.uy));
                const F = P(t, s);
                const d = Math.hypot(el.free.x - F.x, el.free.y - F.y);
                const zF = Math.max(C.lowZ, Math.min(ceilZ, el.height || 150));
                if (d < bestD && !segmentCrossesStairVolume({ x: el.free.x, y: el.free.y, z: zF }, { x: F.x, y: F.y, z: zF })) { bestD = d; bestT = t; bestS = s; }
            });
            if (!bestT) {
                result.warnings.push('Trémie « ' + shaftTitle(el.shaftId) + ' » : aucun mur à cet étage, le câble ne peut pas la rejoindre');
                return;
            }
            bestT.st.push(bestS);
            const zFree = Math.max(C.lowZ, Math.min(ceilZ, el.height || 150));
            place.set(el.id, { t: bestT, E: { x: el.free.x, y: el.free.y, z: zFree }, dist: bestS, r: bestS, zEl: zFree, free: true, label: el.shaftId });
            return;
        }
        if (CEILING_TYPES.includes(el.type)) return;
        const w = walls.find(x => x.id === el.wallId);
        if (!w) return;
        const t = trackOf(w, el.side === -1 ? -1 : 1);
        const E = getElCoords(el);
        let dist = el.distanceFromStart !== undefined ? el.distanceFromStart : t.len / 2;
        dist = Math.max(10, Math.min(t.len - 10, dist));
        const zEl = Math.max(C.lowZ, Math.min(ceilZ, E.z));
        const list = spans.get(w.id);
        const own = list.find(sp => dist > sp.lo && dist < sp.hi && E.z >= sp.z0 && E.z <= sp.z1) || null;
        const stubOK = (r) => !list.some(sp => sp !== own && Math.max(r, dist) > sp.lo && Math.min(r, dist) < sp.hi && E.z >= sp.z0 && E.z <= sp.z1);
        // Keep the vertical drop above the device unless an opening blocks that position.
        const cands = [dist];
        list.forEach(sp => cands.push(sp.lo - 0.5, sp.hi + 0.5));
        const valid = cands
            .filter(r => r >= 10 && r <= t.len - 10 && !blockedV(w.id, r, C.lowZ, ceilZ, t.side) && stubOK(r))
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
    // Passage : stations face à l'extérieur, là où un câble peut traverser le mur à plafond
    if (passage) {
        tracks.forEach(t => {
            const k = 2 * t.side * ((t.wall.thickness || 10) / 2 + C.trackOffset);
            for (let s = C.crossStep; s < t.len; s += C.crossStep) {
                const p = P(t, s);
                if (outFaces.isOutside(p.x - k * t.uy, p.y + k * t.ux)) t.st.push(s);
            }
        });
    }

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
        const half = (w.thickness || 10) / 2 + 1;
        // boîte englobante : insideBody accepte jusqu'à 0,5 cm au-delà des extrémités, d'où la marge + 0,5
        const reach = half + 0.5;
        return { x1: w.x1, y1: w.y1, len, ux: dx / len, uy: dy / len, half,
            bx0: Math.min(w.x1, w.x2) - reach, bx1: Math.max(w.x1, w.x2) + reach,
            by0: Math.min(w.y1, w.y2) - reach, by1: Math.max(w.y1, w.y2) + reach };
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
    const inWallBody = (w, x, y) => {
        const g = wallGeo[walls.indexOf(w)];
        const s = (x - g.x1) * g.ux + (y - g.y1) * g.uy;
        const d = Math.abs(-(x - g.x1) * g.uy + (y - g.y1) * g.ux);
        return s > -0.5 && s < g.len + 0.5 && d < g.half;
    };

    // murs dans lesquels une piste se termine en T (son bout est enfoncé dans ce mur)
    const stubWalls = new Map();
    junctions.forEach(j => {
        [[j.a, j.s, j.b], [j.b, j.u, j.a]].forEach(([t, s, o]) => {
            if (s >= 0 && s <= t.len) return;
            if (!stubWalls.has(t)) stubWalls.set(t, []);
            stubWalls.get(t).push(o.wall);
        });
    });
    tracks.forEach(t => {
        const ss = t.st.slice().sort((p, q) => p - q).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.3);
        const tWalls = stubWalls.get(t) || [];
        for (let k = 0; k < ss.length - 1; k++) {
            const s0 = ss[k], s1 = ss[k + 1];
            if (s1 - s0 < 0.5) continue;
            const samples = [0.25, 0.5, 0.75].map(f => P(t, s0 + (s1 - s0) * f));
            // ne traverse jamais un mur, sauf l'épaisseur du mur où la piste est enfoncée en T
            const inTWall = p => s0 >= 0 && s1 <= t.len && tWalls.some(w => inWallBody(w, p.x, p.y));
            if (samples.some(p => insideBody(p.x, p.y) && !inTWall(p))) continue;
            const p0 = P(t, s0), p1 = P(t, s1);
            levels.forEach(L => {
                if (blockedH(t.wall.id, s0, s1, L.z, t.side)) return;   // ni devant une porte, ni devant une fenêtre
                addEdge(node(p0.x, p0.y, L.z), node(p1.x, p1.y, L.z), L.kind);
            });
        }
    });

    // Pied de tronçon contre un mur (T) : le tronçon rejoint la piste du mur en traversant son épaisseur.
    // Indispensable quand le mur n'a pas de piste sur sa face extérieure.
    junctions.forEach(j => {
        [[j.a, j.s, j.b, j.u], [j.b, j.u, j.a, j.s]].forEach(([t, s, o, so]) => {
            if (s >= 0 && s <= t.len) return;
            const sEnd = s < 0 ? 0 : t.len;
            const samples = [0.25, 0.5, 0.75].map(f => P(t, s + (sEnd - s) * f));
            if (!samples.some(p => insideBody(p.x, p.y))) return;
            if (samples.some(p => insideBody(p.x, p.y) && !inWallBody(o.wall, p.x, p.y))) return;
            if (blockedV(o.wall.id, so, C.lowZ, ceilZ, o.side)) return;
            const p0 = P(t, s), p1 = P(t, sEnd);
            levels.forEach(L => {
                if (blockedH(t.wall.id, Math.min(s, sEnd), Math.max(s, sEnd), L.z, t.side)) return;
                addEdge(node(p0.x, p0.y, L.z), node(p1.x, p1.y, L.z), L.kind, C.crossPenalty);
            });
        });
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

    // Passage à plafond entre pièces fermées : le câble traverse le mur d'une pièce à hauteur de plafond,
    // franchit l'espace extérieur, puis retraverse le mur de l'autre pièce. Chaque traversée est pénalisée.
    if (passage) {
        const exits = [];
        tracks.forEach(t => {
            const k = 2 * t.side * ((t.wall.thickness || 10) / 2 + C.trackOffset);
            t.st.forEach(s => {
                if (s < 0 || s > t.len) return;
                const p = P(t, s);
                const q = { x: p.x - k * t.uy, y: p.y + k * t.ux };
                if (!outFaces.isOutside(q.x, q.y)) return;
                const inner = findNode(p.x, p.y, ceilZ);
                if (!inner || blockedH(t.wall.id, s - 0.01, s + 0.01, ceilZ, t.side)) return;
                const outN = node(q.x, q.y, ceilZ);
                const pe = addEdge(inner, outN, 'passage', C.passageCost);
                if (pe) pe.room = true;
                exits.push({ n: outN, wall: t.wall });
            });
        });
        const clearOutside = (a, b) => {
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            const n = Math.ceil(d / C.passageStep);
            for (let i = 1; i < n; i++) {
                const f = i / n;
                if (!outFaces.isOutside(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)) return false;
            }
            return true;
        };
        for (let i = 0; i < exits.length; i++) {
            for (let j = i + 1; j < exits.length; j++) {
                const a = exits[i], b = exits[j];
                if (a.wall === b.wall) continue;
                const d = Math.hypot(b.n.x - a.n.x, b.n.y - a.n.y);
                if (d < 0.5) continue;
                if (!clearOutside(a.n, b.n)) continue;
                const pe = addEdge(a.n, b.n, 'passage', 0);
                if (pe) pe.room = true;
            }
        }
    }

    // Mur intérieur isolé (relié à aucun mur qui touche l'extérieur) : le câble le rejoint au plafond,
    // en survolant la pièce. Le segment ne doit croiser aucun mur. Ces liens (marqués island) ne servent
    // qu'aux circuits « plafond » ou « mixte », et aux appareils posés sur un tel mur.
    const comp = new Map(walls.map(w => [w.id, w.id]));
    const root = id => { while (comp.get(id) !== id) id = comp.get(id); return id; };
    const joinWalls = (wa, wb) => comp.set(root(wa.id), root(wb.id));
    junctions.forEach(j => joinWalls(j.a.wall, j.b.wall));
    coincident.forEach(([a, b]) => joinWalls(a.wall, b.wall));
    const envelope = new Set(walls.filter(w => (outFaces.faces.get(w.id) || []).length).map(w => root(w.id)));
    const isolated = w => !envelope.has(root(w.id));
    const airClearCalc = (a, b) => {
        const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
        // seuls les murs dont la boîte englobante touche le segment peuvent le couper
        const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x), sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);
        const near = wallGeo.filter(g => g.bx1 >= sx0 && g.bx0 <= sx1 && g.by1 >= sy0 && g.by0 <= sy1);
        for (let i = 1; i < n; i++) {
            const f = i / n;
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
            for (let k = 0; k < near.length; k++) {
                const g = near[k];
                const s = (x - g.x1) * g.ux + (y - g.y1) * g.uy;
                const d = Math.abs(-(x - g.x1) * g.uy + (y - g.y1) * g.ux);
                if (s > -0.5 && s < g.len + 0.5 && d < g.half) return false;
            }
        }
        // une liaison de plafond ne traverse jamais le volume d'un escalier
        if (segmentCrossesStairVolume({ x: a.x, y: a.y, z: ceilZ }, { x: b.x, y: b.y, z: ceilZ })) return false;
        return true;
    };    
    // signature de ce qui influence airClear : murs, escaliers, niveaux, hauteur du plafond
    const airMemoSig = JSON.stringify([
        walls.map(w => [w.x1, w.y1, w.x2, w.y2, w.thickness, w.levelId]),
        projectData.stairs || [],
        (projectData.levels || []).map(l => [l.id, l.elevation]),
        activeLevelId, ceilZ
    ]);
    if (AIR_CLEAR_MEMO.sig !== airMemoSig) {
        AIR_CLEAR_MEMO.sig = airMemoSig;
        AIR_CLEAR_MEMO.map = new Map();
    }
    // clé exacte (nombres complets) : deux points différents ne partagent jamais une entrée
    const airClear = (a, b) => {
        const key = a.x + ',' + a.y + ',' + b.x + ',' + b.y;
        const memo = AIR_CLEAR_MEMO.map;
        if (!memo.has(key)) memo.set(key, airClearCalc(a, b));
        return memo.get(key);
    };
    const islandEdge = (a, b) => { const e = addEdge(a, b, 'passage', C.passageCost); if (e) e.island = true; };
    tracks.forEach(a => {
        if (!isolated(a.wall)) return;
        a.st.forEach(s => {
            if (s < 0 || s > a.len || blockedH(a.wall.id, s - 0.01, s + 0.01, ceilZ, a.side)) return;
            const p = P(a, s);
            const na = node(p.x, p.y, ceilZ);
            tracks.forEach(b => {
                if (b.wall === a.wall) return;
                b.st.forEach(u => {
                    if (u < 0 || u > b.len || blockedH(b.wall.id, u - 0.01, u + 0.01, ceilZ, b.side)) return;
                    const q = P(b, u);
                    if (airClear(p, q)) islandEdge(na, node(q.x, q.y, ceilZ));
                });
            });
        });
    });
    // Appareils posés sur un mur isolé : leur cheminement passe obligatoirement par le plafond
    els.forEach(el => {
        if (el.type === 'panel' || el.type === 'subpanel') return;
        const pl = place.get(el.id);
        if (pl && isolated(pl.t.wall)) result.forced.add(el.id);
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
        if (blockedV(j.a.wall.id, j.s, C.lowZ, ceilZ, j.a.side) || blockedV(j.b.wall.id, j.u, C.lowZ, ceilZ, j.b.side)) return;
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
            if (pl.free && (insideBody(pl.E.x, pl.E.y) || segmentHitsWall(pl.E.x, pl.E.y, F.x, F.y))) {
                result.warnings.push('Trémie « ' + shaftTitle(pl.label) + ' » : le câble ne peut pas la rejoindre depuis cet étage (trémie dans un mur, ou un mur la sépare du mur le plus proche)');
                return null;
            }
            const lo = node(A.x, A.y, C.lowZ), hi = node(A.x, A.y, ceilZ);
            // trémie : la sortie monte jusqu'au plafond dans la trémie, puis file au plafond jusqu'au mur (patch 24).
            // Jamais d'horizontale à mi-hauteur ni au sol. Les appareils fixés sur un mur ne sont pas concernés.
            if (pl.free) {
                addEdge(lo, hi, 'riser');
                return { node: hi, stub: [pl.E, { x: pl.E.x, y: pl.E.y, z: ceilZ }, { x: A.x, y: A.y, z: ceilZ }] };
            }
            let at;
            if (pl.zEl - C.lowZ < 1) { at = lo; addEdge(lo, hi, 'riser'); }
            else if (ceilZ - pl.zEl < 1) { at = hi; addEdge(lo, hi, 'riser'); }
            else { at = node(A.x, A.y, pl.zEl); addEdge(lo, at, 'riser'); addEdge(at, hi, 'riser'); }
            const stub = [pl.E, { x: F.x, y: F.y, z: pl.E.z }, { x: A.x, y: A.y, z: pl.E.z }];
            if (Math.abs(pl.zEl - pl.E.z) > 0.3) stub.push({ x: A.x, y: A.y, z: pl.zEl });
            return { node: at, stub };
        }
        if (CEILING_TYPES.includes(el.type)) {
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
    if (!R.get(panel.id)) { wired.forEach(el => lostFor(cidOfEl(el))); return result; }
    unresolved.forEach(el => lostFor(cidOfEl(el)));

    // Liens libres au plafond : droite entre deux points du plafond qui ne traverse aucun mur.
    // « murs » ne les utilise pas ; « plafond » et « mixte » oui. Un passage direct est alors une seule arête.
    const ceilNodes = [...nodes.values()].filter(n => Math.abs(n.z - ceilZ) < 0.01);
    for (let i = 0; i < ceilNodes.length; i++) {
        for (let j = i + 1; j < ceilNodes.length; j++) {
            const a = ceilNodes[i], b = ceilNodes[j];
            if (!airClear(a, b)) continue;
            const e = addEdge(a, b, 'air');
            if (e) e.air = true;
        }
    }

    // 9. Plus courts chemins (Dijkstra, un passage par un plafonnier n'est jamais un raccourci)
    // Liens par le plafond au-dessus des îlots : « plafond » et « mixte » les utilisent, « murs » non, sauf pour un
    // appareil imposé (mur isolé). En « mixte », chaque passage au plafond (îlot ou lien libre) coûte MIX_ISLAND_PENALTY cm de plus :
    // le câble ne quitte les murs que s'il n'a pas de chemin raisonnable. Le tableau et les points de raccord restent « par les murs ».
    const MIX_ISLAND_PENALTY = 500;
    // route d'une liaison : mode du circuit (murs / plafond / mixte) et autorisation de passage entre pièces fermées
    const routeFor = (A, B, cid) => {
        const c = cid ? projectData.circuits.find(x => x.id === cid) : null;
        const routing = c ? c.cableRouting : undefined;
        let mode = 'walls';
        if (routing === 'mixte') mode = 'mix';
        else if (routing === 'plafond' || result.forced.has(A.id) || result.forced.has(B.id)) mode = 'ceil';
        return { mode, room: !!(c && c.roomCrossing) };
    };
    const mapCaches = new Map();
    // Dijkstra sur tableaux indexés (B2) : même tas, mêmes relaxations dans le même ordre => mêmes distances et chemins
    const nodeCount = nodes.size;
    let nodeIdx = 0;
    nodes.forEach(n => { n.idx = nodeIdx++; });
    const mapFor = (src, route) => {
        const key = route.mode + (route.room ? '+room' : '');
        if (!mapCaches.has(key)) mapCaches.set(key, new Map());
        const cache = mapCaches.get(key);
        const penalty = route.mode === 'mix' ? MIX_ISLAND_PENALTY : 0;
        let r = cache.get(src);
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
                const above = e.island || e.air;
                if (e.dead || (above && route.mode === 'walls') || (e.room && !route.room)) continue;
                const o = e.a === n ? e.b : e.a;
                const nd = d + e.cost + (above ? penalty : 0);
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
        cache.set(src, r);
        return r;
    };
    const rdist = (A, B, cid) => {
        const ra = R.get(A.id), rb = R.get(B.id);
        if (!ra || !rb) return Infinity;
        const stubs = stubLen(ra.stub) + stubLen(rb.stub);
        if (ra.node === rb.node) return stubs;
        const d = mapFor(ra.node, routeFor(A, B, cid)).dist.get(rb.node);
        return d === undefined ? Infinity : d + stubs;
    };

    // 10. Organisation des liaisons : appareils → unités à alimenter
    // Couleurs des conducteurs (NF C 15-100) : phase rouge, neutre bleu, terre vert/jaune ; retour de lampe orange,
    // commande de bouton poussoir / sonnette noire, commande de volet grise
    // Schéma va-et-vient : l'interrupteur ne reçoit que la phase et ne renvoie qu'un fil de commande ;
    // neutre et terre vont directement du tableau à la charge, sans passer par l'interrupteur
    const std = ['red', 'neutral', 'green-yellow'];
    const ret = ['orange'];
    const commandWires = sw => {
        if (sw.type === 'switch_pushbutton' || sw.type === 'doorbell_button') return ['black'];
        if (sw.type === 'shutter_control') return ['grey'];
        return ret;
    };
    const supplyWires = ['neutral', 'green-yellow'];
    const alive = wired.filter(el => R.get(el.id));
    const switches = alive.filter(isControl);
    const lights = alive.filter(isControlledLoad);
    // une liaison de commande suit le circuit de la charge commandée
    const lightCid = el => { const c = circuitOf(el); return c ? c.id : null; };
    const ctrl = new Map(switches.map(sw => [sw.id, []]));
    const taken = new Set();
    const manuallyConfigured = new Set();
    switches.forEach(sw => {
        if (!Array.isArray(sw.controlledLightIds)) return;
        manuallyConfigured.add(sw.id);
        sw.controlledLightIds.forEach(id => {
            const light = lights.find(candidate => candidate.id === id || candidate.id === 'xl|' + id);
            if (light && canControl(sw, light) && isFinite(rdist(sw, light, lightCid(light)))) {
                ctrl.get(sw.id).push(light);
                taken.add(light.id);
            }
        });
    });
    // Chaque charge non affectée rejoint la commande compatible la plus proche, plutôt qu'un appariement global.
    lights.filter(light => !taken.has(light.id)).forEach(light => {
        let best = null;
        switches.filter(sw => !manuallyConfigured.has(sw.id) && canControl(sw, light)).forEach(sw => {
            const d = rdist(sw, light, lightCid(light));
            if (d <= 500 && (!best || d < best.d)) best = { sw, d };
        });
        if (best) { ctrl.get(best.sw.id).push(light); taken.add(light.id); }
    });
    // Une seconde commande va-et-vient rejoint le point déjà desservi le plus proche.
    switches.filter(sw => !manuallyConfigured.has(sw.id) && sw.type === 'switch_va_et_vient' && !ctrl.get(sw.id).length).forEach(sw => {
        let best = null;
        lights.filter(l => canControl(sw, l)).forEach(l => { const d = rdist(sw, l, lightCid(l)); if (isFinite(d) && (!best || d < best.d)) best = { l, d }; });
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
    const circuitIdOf = el => { const c = circuitOf(el); return c ? c.id : null; };
    alive.filter(el => (el.type.startsWith('outlet') && el.type !== 'outlet_switched') || el.type === 'smoke_detector').forEach(el => {
        const c = circuitOf(el);
        units.push({ cid: c ? c.id : null, entry: el, members: [], wires: std });
    });
    const lightingDefault = projectData.circuits.find(c => c.id === DEFAULT_CIRCUIT_BY_TYPE.light_ceiling);
    // lampes commandées par un interrupteur d'un autre circuit : alimentation par leur propre circuit, commande tracée à part
    const crossControl = [];
    switches.forEach(sw => {
        const ls = ctrl.get(sw.id);
        // une commande sans charge reste rattachée au circuit d'éclairage (le volet, lui, sur les prises)
        const fallbackId = sw.type === 'shutter_control' ? DEFAULT_CIRCUIT_BY_TYPE.shutter_motor : DEFAULT_CIRCUIT_BY_TYPE.light_ceiling;
        const c = ls.length ? circuitOf(ls[0]) : projectData.circuits.find(x => x.id === fallbackId);
        const cid = c ? c.id : null;
        units.push({ cid, entry: sw, members: ls.filter(l => circuitIdOf(l) === cid), wires: ['red'], memberWires: commandWires(sw) });
        ls.filter(l => circuitIdOf(l) !== cid).forEach(l => {
            units.push({ cid: circuitIdOf(l), entry: l, members: [], wires: std });
            crossControl.push({ sw, light: l, cid, wires: commandWires(sw) });
        });
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
        const relationId = isControl(A) && canControl(A, B)
            ? controlCableLinkId(A.id, B.id)
            : isControl(B) && canControl(B, A)
                ? controlCableLinkId(B.id, A.id)
                : null;
        const path = [];
        if (ra.node !== rb.node) {
            const mp = mapFor(ra.node, routeFor(A, B, cid));
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

    // sous-tableau : alimenté une fois par le tableau principal (câble neutre, hors circuits), puis racine
    // de l'arbre de chaque circuit : ses appareils se raccordent à lui s'il est le plus proche
    const subRoots = [];
    els.filter(e => e.type === 'subpanel').forEach(sp => {
        const len = R.get(sp.id) ? addLink(panel, sp, std, FEEDER_CID) : null;
        if (len === null) {
            lostFor(null);
            result.warnings.push('Sous-tableau non relié au tableau principal');
            return;
        }
        subRoots.push({ el: sp, depth: len + 60 });
    });

    const byCircuit = new Map();
    units.forEach(u => {
        const k = u.cid || '_none';
        if (!byCircuit.has(k)) byCircuit.set(k, []);
        byCircuit.get(k).push(u);
    });
    byCircuit.forEach((list, k) => {
        const cidOf = k === '_none' ? null : k;
        // liaisons non reliées, comptées par circuit (clé « _none » : sans circuit)
        const lostOn = n => lostFor(cidOf, n);
        const tree = [{ el: panel, deg: 0, depth: 0, free: true, boxId: null }]
            .concat(subRoots.map(s => ({ el: s.el, deg: 0, depth: s.depth, free: true, boxId: null })));
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
                    const d = rdist(tn.el, u.entry, cidOf);
                    if (!best || d < best.d) best = { d, ui, tn, bx: null };
                });
                // une boîte pas encore raccordée coûte son trajet depuis le tableau
                pending.forEach(bx => {
                    // étoile : la boîte est la plus proche de l'appareil que le tableau ; son trajet n'est compté qu'une fois
                    const dBox = rdist(bx, u.entry, cidOf);
                    const d = star ? (dBox < rdist(panel, u.entry, cidOf) ? dBox : Infinity) : rdist(panel, bx, cidOf) + dBox;
                    if (isFinite(d) && (!best || d < best.d)) best = { d, ui, tn: null, bx };
                });
            });
            if (!best || !isFinite(best.d)) { lostOn(rest.length); break; }
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
            if (len === null) { lostOn(1); continue; }
            best.tn.deg++;
            const entryNode = { el: u.entry, deg: 1, depth: best.tn.depth + len + 60, boxId: best.tn.boxId || null };
            tree.push(entryNode);
            countServed(entryNode.boxId);
            if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, entryNode.depth);
            u.members.forEach(mb => {
                const l2 = addLink(u.entry, mb, u.memberWires || ret, cid);
                if (l2 === null) { lostOn(1); return; }
                if (addLink(panel, mb, supplyWires, cid) === null) lostOn(1);
                entryNode.deg++;
                const mn = { el: mb, deg: 1, depth: entryNode.depth + l2 + 60, boxId: entryNode.boxId };
                tree.push(mn);
                countServed(mn.boxId);
                if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, mn.depth);
            });
        }
    });

    // commande des lampes d'un autre circuit (hors arbre : elles ne servent pas de point de branchement)
    crossControl.forEach(({ sw, light, cid, wires }) => {
        if (addLink(sw, light, wires, cid) === null) lostFor(cid);
    });

    // navettes : deux va-et-vient qui commandent la même lampe sont reliés par deux fils violets
    const navettePairs = new Set();
    lights.forEach(light => {
        const pair = switches.filter(sw => sw.type === 'switch_va_et_vient' && ctrl.get(sw.id).includes(light));
        for (let k = 0; k + 1 < pair.length; k++) {
            const pk = [pair[k].id, pair[k + 1].id].sort().join('~');
            if (navettePairs.has(pk)) continue;
            navettePairs.add(pk);
            if (addLink(pair[k], pair[k + 1], ['violet', 'violet'], circuitIdOf(light)) === null) lostFor(circuitIdOf(light));
        }
    });

    // raccordement : tableau de cet étage → point de dérivation (la gaine vers les autres niveaux)
    // boîtes de dérivation : chaque tronçon de gaine est tracé dans la couleur des circuits qui le traversent
    const treePanelId = feedInfo ? feedInfo.panelLevelId : panel.levelId;
    const tree = feedInfo ? feedInfo.tree : levelTreeToPanel(treePanelId);
    derivPts.forEach(dp => {
        if (!R.get(dp.id)) { lostFor(null); return; }
        const shaftId = dp.id.slice(3);   // 'dv|' + id de la trémie
        const cidsIn = circuitsEnteringLevel(activeLevelId, shaftId, tree, treePanelId);
        // trémie sans circuit venant d'un autre étage : aucun câble, rien à tracer
        if (!cidsIn.length) return;
        cidsIn.forEach(cid => { if (addLink(panel, dp, std, cid) === null) lostFor(cid); });
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
        cidsUp.forEach(cid => {
            addPriv([E0, vEnd], std, cid, null);
            result.linkInfo.push({ circuitId: cid, length: vLen });
        });
    }

    used.forEach((u, e) => result.segments.push({
        a: { x: e.a.x, y: e.a.y, z: e.a.z }, b: { x: e.b.x, y: e.b.y, z: e.b.z }, cables: u.cables, cids: u.cids, links: u.links
    }));
    priv.forEach(sg => result.segments.push(sg));
    // contrôle final : tout tronçon qui traverse le volume d'un escalier est marqué (rouge) et signalé
    let stairCrossing = false;
    result.segments.forEach(sg => {
        const st = segmentCrossesStairVolume(sg.a, sg.b);
        if (st) { sg.stairHit = st.id; stairCrossing = true; }
    });
    if (stairCrossing) result.warnings.push('Câble qui traverse un escalier (au-dessus des marches ou dans son emprise au sol) : tronçon en rouge, à déplacer.');
    return result;
}

// Tronçons, âmes et manchons de même matériau et même ordre de rendu fusionnés en un seul maillage :
// l'orbite ne coûte plus un appel de dessin par câble
function mergeCableParts(parts) {
    const groups = new Map();
    parts.forEach(p => {
        p.updateMatrix();
        const key = p.material.uuid + '|' + p.renderOrder;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    });
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    groups.forEach(list => {
        const pos = [];
        const nor = [];
        const idx = [];
        list.forEach(p => {
            const g = p.geometry;
            const P = g.attributes.position;
            const N = g.attributes.normal;
            const nm = new THREE.Matrix3().getNormalMatrix(p.matrix);
            const base = pos.length / 3;
            for (let i = 0; i < P.count; i++) {
                v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
                pos.push(v.x, v.y, v.z);
                n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
                nor.push(n.x, n.y, n.z);
            }
            const ia = g.index.array;
            for (let i = 0; i < ia.length; i++) idx.push(ia[i] + base);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, list[0].material);
        mesh.renderOrder = list[0].renderOrder;
        threeScene.add(mesh);
        wallMeshes3D.push(mesh);
    });
}

// Rendu fantôme (patch 20) : options lues par renderCableNetwork ; null pour l'étage affiché
let cableGhostOpts = null;

// Gaine fantôme : pleine (non translucide), à la couleur de son circuit, grise sans circuit
function ghostConduitMat(cid) {
    let hex = '#94a3b8';
    if (cid === FEEDER_CID) hex = FEEDER_COLOR;
    else if (typeof cid === 'string' && cid.startsWith('ctl:')) hex = cid.slice(4);
    else {
        const c = cid ? projectData.circuits.find(x => x.id === cid) : null;
        if (c) hex = circuitColor(c);
    }
    CABLE_RES.ghostMats = CABLE_RES.ghostMats || {};
    return CABLE_RES.ghostMats[hex] || (CABLE_RES.ghostMats[hex] = markShared(new THREE.MeshBasicMaterial({ color: hex })));
}

// Un point (x, y en plan) est-il dans le carré en plan d'une trémie ?
function insideShaftXY(p, sh) {
    const h = (sh.size || 40) / 2 + 0.5;
    return Math.abs(p.x - sh.x) <= h && Math.abs(p.y - sh.y) <= h;
}

// Rayon des gaines fantômes (cm) : fines, indépendantes du rayon des gaines réelles
const GHOST_CONDUIT_R = 0.5;


// Trémie sélectionnée (sans circuit sélectionné) : seule cette trémie est affichée, par ce qui est dans son carré
function shaftBoxSel() {
    if (selectedCircuitId && circuitById(selectedCircuitId)) return null;
    return selected3DId ? (projectData.shafts || []).find(s => s.id === selected3DId) || null : null;
}

// Circuit sélectionné : le seul circuit mis en évidence
function focusCircuitSet() {
    return selectedCircuitId && circuitById(selectedCircuitId) ? new Set([selectedCircuitId]) : null;
}

// Morceau d'un tronçon situé dans le carré d'une trémie (plan x, y ; z interpolé). null si le tronçon ne touche pas le carré.
function clipSegToShaft(p, q, sh) {
    const h = (sh.size || 40) / 2 + 0.5;
    const x0 = sh.x - h, x1 = sh.x + h, y0 = sh.y - h, y1 = sh.y + h;
    const dx = q.x - p.x, dy = q.y - p.y;
    let t0 = 0, t1 = 1;
    const tests = [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]];
    for (const [pp, qq] of tests) {
        if (pp === 0) { if (qq < 0) return null; continue; }
        const r = qq / pp;
        if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    const at = t => ({ x: p.x + dx * t, y: p.y + dy * t, z: p.z + (q.z - p.z) * t });
    return { a: at(t0), b: at(t1) };
}

// Étage fantôme : gaines seules et fines par défaut ; circuit sélectionné ou trémie sélectionnée : rendu de circuit sélectionné
// circuitOnly : n'afficher que ce qui est mis en évidence (étages fantômes masqués)
function renderGhostLevelCables(net, cx, cy, dy, circuitOnly) {
    if (!net || !net.segments || !net.segments.length) return;
    const box = shaftBoxSel();
    const FS = focusCircuitSet();
    if (circuitOnly && !FS && !box) return;
    let opts;
    if (box) {
        opts = { net, dy, box, wires: true, keepSeg: () => true, keepGroup: () => true };
    } else if (FS) {
        opts = { net, dy, wires: true, focusIds: FS, keepSeg: s => (s.cids || []).some(c => FS.has(c)), keepGroup: c => FS.has(c) };
    } else {
        opts = { net, dy, wires: false, radiusCm: GHOST_CONDUIT_R, keepSeg: () => true, keepGroup: () => true };
    }
    cableGhostOpts = opts;
    try { renderCableNetwork(cx, cy); } finally { cableGhostOpts = null; }
}

function renderCableNetwork(cx, cy) {
    const G = cableGhostOpts;   // rendu fantôme (patch 20) ou null pour l'étage affiché
    // circuits mis en évidence : le circuit sélectionné, sinon ceux qui traversent la trémie sélectionnée (patch 24)
    
    const BOX = G ? (G.box || null) : shaftBoxSel();
    const FOC = G ? (G.focusIds || null) : focusCircuitSet();
    const net = G ? G.net : getCableNetwork();
    if (!G) updateCircuitsUI();

    if (!showCables2D) return;   // câbles masqués (réglage commun avec la 2D)
    if (!G && net.unrouted > 0) {
        console.warn(net.unrouted + ' liaison(s) non routée(s)');
        if (typeof showNotification === 'function') showNotification(net.unrouted + ' appareil(s) n\'ont pas pu être reliés au tableau', 'error');
    }
    if (!net.segments.length) return net;
    const selectedElement = projectData.electrical.find(el => el.id === selected3DId);
    const isLightingSelection = selectedElement &&
        (isControl(selectedElement) || isControlledLoad(selectedElement));
    const selectedLinkIds = new Set(isLightingSelection
        ? (net.controlLinks || [])
            .filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId))
            .flatMap(link => link.linkIds || [])
        : []);
    const hasLinkFocus = selectedLinkIds.size > 0;
    // le câble de liaison n'est affiché que si un circuit (ou le câble lui-même) ou un éclairage est sélectionné
    const feederHidden = !hasLinkFocus && !feederShownForSelection();
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

       // noir et gris prennent une teinte lisible sur le fond du thème (fond sombre : noir clair ; fond clair : gris foncé)
    const lightTheme = currentTheme === 'light';
    const colors = { 'red': '#dc2626', 'neutral': '#2563eb', 'green-yellow': '#018d14', 'black': lightTheme ? '#1f2937' : '#e2e8f0', 'grey': lightTheme ? '#475569' : '#9ca3af', 'orange': '#ff8c00', 'violet': '#5e439c' };
    if (!CABLE_RES.cyl) {
        CABLE_RES.cyl = markShared(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true));
        CABLE_RES.core = markShared(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true));
        CABLE_RES.sph = markShared(new THREE.SphereGeometry(1, 12, 10));
        CABLE_RES.conduitMat = markShared(new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: conduitOpacity, depthWrite: false, side: THREE.DoubleSide }));
        CABLE_RES.circMats = {};
        CABLE_RES.hiMats = {};
        CABLE_RES.highlightConduit = markShared(new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: CONDUIT_FOCUS_OPACITY, depthWrite: false }));
        CABLE_RES.dimConduit = markShared(new THREE.MeshBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.035, depthWrite: false }));
        CABLE_RES.dimCore = markShared(new THREE.MeshBasicMaterial({ color: '#475569', transparent: true, opacity: 0.08, depthWrite: false }));
        CABLE_RES.feederConduit = markShared(new THREE.MeshBasicMaterial({ color: FEEDER_COLOR, transparent: true, opacity: CONDUIT_FOCUS_OPACITY, depthWrite: false }));
        CABLE_RES.mats = {};
    }
    // matériaux des fils recréés si le thème change (noir et gris changent de teinte)
    if (CABLE_RES.matsTheme !== currentTheme) { CABLE_RES.mats = {}; CABLE_RES.matsTheme = currentTheme; }
    const matFor = k => CABLE_RES.mats[k] || (CABLE_RES.mats[k] = markShared(new THREE.MeshBasicMaterial({ color: colors[k] || '#ffffff' })));
    const ctlHexOf = cid => (typeof cid === 'string' && cid.startsWith('ctl:') ? cid.slice(4) : null);
    const conduitFor = cid => {
        if (!cid) return CABLE_RES.conduitMat;
        const ctlHex = ctlHexOf(cid);
        const circuit = ctlHex ? null : projectData.circuits.find(c => c.id === cid);
        if (!ctlHex && !circuit) return CABLE_RES.conduitMat;
        const hex = ctlHex || circuitColor(circuit);
        return CABLE_RES.circMats[hex] || (CABLE_RES.circMats[hex] = markShared(new THREE.MeshBasicMaterial({
            color: hex, transparent: true, opacity: conduitOpacity, depthWrite: false, side: THREE.DoubleSide
        })));
    };
    const hiFor = cid => {
        if (cid === FEEDER_CID) return CABLE_RES.feederConduit;
        const ctlHex = ctlHexOf(cid);
        const circuit = !ctlHex && cid && projectData.circuits.find(c => c.id === cid);
        if (!ctlHex && !circuit) return CABLE_RES.highlightConduit;
        const hex = ctlHex || circuitColor(circuit);
        const key = 'g' + hex;
        return CABLE_RES.hiMats[key] || (CABLE_RES.hiMats[key] = markShared(new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: CONDUIT_FOCUS_OPACITY, depthWrite: false })));
    };
    const parts = [];
    const add = (mesh) => parts.push(mesh);
    const Y = new THREE.Vector3(0, 1, 0);
    const ctlColors = switchedOutletCableColors(net);
    const WIRE_ORDER = ['red', 'neutral', 'green-yellow', 'orange', 'violet', 'black', 'grey'];
    const wireRank = c => { const i = WIRE_ORDER.indexOf(c); return i < 0 ? WIRE_ORDER.length : i; };
    const gKeyOf = cid => (cid === null || cid === undefined) ? '_' : String(cid);
    const nodeKeyOf = p => p.x.toFixed(2) + '|' + p.y.toFixed(2) + '|' + p.z.toFixed(2);
    const groupRadius = n => Math.min(3.2, Math.max(2, 1.8 + 0.22 * n));
    // fils identifi?s par couleur et rang (rouge#0, rouge#1...) : un m?me fil garde sa place d'un tron?on ? l'autre
    const wireKeysOf = cols => {
        const occ = new Map();
        return cols.slice()
            .sort((x, y) => wireRank(x) - wireRank(y))
            .map(col => {
                const o = occ.get(col) || 0;
                occ.set(col, o + 1);
                return { key: col + '#' + o, colour: col, sortKey: wireRank(col) * 100 + o };
            });
    };
    // spirale de Vogel : fils r?partis quasi uniform?ment sur toute la section utile de la gaine
    const wireLayout = (n, R) => {
        if (n <= 1) return [[0, 0]];
        const rMax = Math.max(CORE_R, R - CORE_R - 0.08);
        const golden = Math.PI * (3 - Math.sqrt(5));
        return Array.from({ length: n }, (_, k) => {
            const r = rMax * Math.sqrt((k + 0.5) / n);
            const ang = k * golden;
            return [Math.cos(ang) * r, Math.sin(ang) * r];
        });
    };
    // cylindre entre deux points du monde (axe Y de la g?om?trie orient? de p vers q)
    const strut = (p, q, radius, mat, order, isTube) => {
        const d = q.clone().sub(p);
        const L = d.length();
        if (L < 1e-4) return;
        const m = new THREE.Mesh(isTube ? CABLE_RES.cyl : CABLE_RES.core, mat);
        m.position.copy(p).add(q).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(Y, d.normalize());
        m.scale.set(radius, L, radius);
        m.renderOrder = order;
        add(m);
    };

    // 1) tron?ons et leurs groupes (un groupe = un circuit, ou un tube de commande sans fils)
    const segs = [];
    net.segments.forEach(seg => {
        const dyG = G ? G.dy : 0;   // décalage vertical de l'étage fantôme (0 pour l'étage affiché)
        // trémie sélectionnée : seule la partie du tronçon située dans le carré est gardée, les sorties coupées au bord (patch 24)
        const clip = BOX ? clipSegToShaft(seg.a, seg.b, BOX) : { a: seg.a, b: seg.b };
        if (!clip) return;
        const a = new THREE.Vector3(clip.a.x - cx, clip.a.z + dyG, clip.a.y - cy);
        const b = new THREE.Vector3(clip.b.x - cx, clip.b.z + dyG, clip.b.y - cy);
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 0.1) return;
        dir.normalize();
        const groups = new Map();
        (seg.cables || []).forEach((bundle, i) => {
            const cid = (seg.cids || [])[i] || null;
            const k = gKeyOf(cid);
            if (!groups.has(k)) groups.set(k, { cid, wires: [] });
            groups.get(k).wires.push(...bundle);
        });
        if (!groups.size) groups.set('_', { cid: null, wires: [] });
        // commande vers une prise command?e : tube suppl?mentaire ? la couleur de la prise (sans fils, ceux-ci restent dans leur circuit)
        [...new Set((seg.links || []).filter(id => ctlColors.has(id)).map(id => ctlColors.get(id)))]
            .forEach(hex => groups.set('ctl:' + hex, { cid: 'ctl:' + hex, wires: [] }));
        const kept = new Map([...groups].filter(([, g]) => !(feederHidden && g.cid === FEEDER_CID) && (!G || G.keepGroup(g.cid))));
        if (G && (!kept.size || !G.keepSeg(seg))) return;   // fantôme : tronçon hors sélection, rien à tracer

        segs.push({ a, b, dir, groups: kept, links: seg.links || [], stairHit: !!seg.stairHit });
    });

    // 2) n?uds : extr?mit?s partag?es par les tron?ons ; chaque n?ud calcule une seule disposition
    const nodes = new Map();
    const nodeAt = p => {
        const k = nodeKeyOf(p);
        if (!nodes.has(k)) nodes.set(k, { p: p.clone(), dirs: [], groups: new Map() });
        return nodes.get(k);
    };
    segs.forEach(s => {
        [[s.a, s.dir], [s.b, s.dir.clone().negate()]].forEach(([p, d]) => {
            const n = nodeAt(p);
            n.dirs.push(d);
            s.groups.forEach((g, gk) => {
                if (!n.groups.has(gk)) n.groups.set(gk, { cid: g.cid, slots: new Map(), dirs: [] });
                const ng = n.groups.get(gk);
                ng.dirs.push(d);
                wireKeysOf(g.wires).forEach(w => ng.slots.set(w.key, w));
            });
        });
    });

    // rep?re de la section au n?ud : normale = bissectrice des deux tron?ons (plan de coupe en onglet)
    const nodeFrame = dirs => {
        let N;
        if (dirs.length === 1) N = dirs[0].clone();
        else {
            let best = null;
            for (let i = 0; i < dirs.length; i++) {
                for (let j = i + 1; j < dirs.length; j++) {
                    const dot = dirs[i].dot(dirs[j]);
                    if (!best || dot < best.dot) best = { i, j, dot };
                }
            }
            N = dirs[best.i].clone().sub(dirs[best.j]);
            if (N.lengthSq() < 1e-6) N = dirs[best.i].clone();
        }
        N.normalize();
        const U = Math.abs(N.y) < 0.9
            ? Y.clone().addScaledVector(N, -Y.dot(N)).normalize()
            : new THREE.Vector3(1, 0, 0).addScaledVector(N, -N.x).normalize();
        const V = new THREE.Vector3().crossVectors(N, U).normalize();
        return { U, V };
    };
    // d?calages (gaine et fils) de chaque groupe ? chaque n?ud, relatifs au n?ud
    const nodeOffsets = new Map();
    nodes.forEach((n, nk) => {
        const { U, V } = nodeFrame(n.dirs);
        const gl = [...n.groups].sort(([x], [y]) => x.localeCompare(y));
        const Rmax = Math.max(...gl.map(([, g]) => groupRadius(g.slots.size)));
        const off = new Map();
        gl.forEach(([gk, g], gi) => {
            const R = groupRadius(g.slots.size);
            const radial = gl.length > 1 ? (1.15 * Rmax) / Math.sin(Math.PI / gl.length) : 0;
            const angle = (gi / gl.length) * Math.PI * 2;
            const tube = new THREE.Vector3()
                .addScaledVector(U, Math.cos(angle) * radial)
                .addScaledVector(V, Math.sin(angle) * radial);
            const slots = [...g.slots.values()].sort((x, y) => x.sortKey - y.sortKey).slice(0, 18);
            const layout = wireLayout(slots.length, R);
            const wires = new Map();
            slots.forEach((w, i) => wires.set(w.key, tube.clone()
                .addScaledVector(U, layout[i][0])
                .addScaledVector(V, layout[i][1])));
            off.set(gk, { R, tube, wires });
        });
        nodeOffsets.set(nk, off);
    });

    // 3) rendu : chaque tron?on relie les points calcul?s ? ses deux n?uds
    const sphereNote = new Map();
    const noteSphere = (nk, gk, mat, focused) => {
        const k = nk + '|' + gk;
        const cur = sphereNote.get(k);
        if (!cur) { sphereNote.set(k, { nk, gk, mat, focused }); return; }
        if (focused && !cur.focused) { cur.mat = mat; cur.focused = true; return; }
        if (!focused && !cur.focused && cur.mat !== mat && !selectedCircuitId && !hasLinkFocus) cur.mat = CABLE_RES.conduitMat;
    };
    segs.forEach(s => {
        const isLinkHighlighted = s.links.some(id => selectedLinkIds.has(id));
        const ka = nodeKeyOf(s.a);
        const kb = nodeKeyOf(s.b);
        s.groups.forEach((g, gk) => {
            const cid = g.cid;
            const A = nodeOffsets.get(ka).get(gk);
            const B = nodeOffsets.get(kb).get(gk);
            const R = Math.max(A.R, B.R);
            const isSelected = !!BOX || (!!FOC && FOC.has(cid));
            const isFocused = hasLinkFocus
                ? isLinkHighlighted && (!linkCircuitIds.size || linkCircuitIds.has(cid) || !!ctlHexOf(cid))
                : (isSelected || (cid === FEEDER_CID && !!selectedCircuitId));
            const cmat = s.stairHit ? stairHitMaterial() : G ? (isFocused ? hiFor(cid) : ghostConduitMat(cid)) : ((hasLinkFocus || FOC || BOX)
                ? (isFocused ? hiFor(cid) : CABLE_RES.dimConduit)
                : conduitFor(cid));
            const order = isFocused ? 3 : 2;
            strut(s.a.clone().add(A.tube), s.b.clone().add(B.tube), (G && G.radiusCm !== undefined ? G.radiusCm : R), cmat, order, true);
            noteSphere(ka, gk, cmat, isFocused);
            noteSphere(kb, gk, cmat, isFocused);

            wireKeysOf(g.wires).forEach(w => {
                const pa = A.wires.get(w.key);
                const pb = B.wires.get(w.key);
                if (!pa || !pb) return;
                const coreMat = (hasLinkFocus || FOC || BOX) && !isFocused
                ? CABLE_RES.dimCore
                    : matFor(w.colour);
                if (!G || G.wires) strut(s.a.clone().add(pa), s.b.clone().add(pb), CORE_R, coreMat, order, false);
                });
        });
    });

    // manchons : coudes, d?rivations et extr?mit?s de groupe (rien l? o? un groupe passe tout droit)
    sphereNote.forEach(({ nk, gk, mat, focused }) => {
        const ng = nodes.get(nk).groups.get(gk);
        if (ng.dirs.length === 2 && ng.dirs[0].dot(ng.dirs[1]) < -0.999) return;
        const off = nodeOffsets.get(nk).get(gk);
        const sph = new THREE.Mesh(CABLE_RES.sph, mat);
        sph.position.copy(nodes.get(nk).p).add(off.tube);
        const rr = G && G.radiusCm !== undefined ? G.radiusCm : off.R;
        sph.scale.set(rr, rr, rr);
        sph.renderOrder = focused ? 3 : 2;
        add(sph);
    });
    mergeCableParts(parts);
    return net;
}
// Curseur 3D : opacité de toutes les gaines (0 = invisibles, 100 % = pleines). Les matériaux existants sont mis à jour tout de suite.
// Les gaines « estompées » (hors sélection) gardent leur faible opacité.
function setConduitOpacity(pct) {
    const v = Math.max(0, Math.min(100, parseFloat(pct) || 0)) / 100;
    conduitOpacity = v;
    const label = document.getElementById('conduit-opacity-val');
    if (label) label.textContent = Math.round(v * 100) + ' %';
    if (!CABLE_RES.conduitMat) return;   // matériaux pas encore créés : ils prendront la valeur à leur création
    const mats = [CABLE_RES.conduitMat, CABLE_RES.highlightConduit, CABLE_RES.feederConduit,
        ...Object.values(CABLE_RES.circMats || {}), ...Object.values(CABLE_RES.hiMats || {})];
    mats.forEach(m => { if (m) m.opacity = v; });
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
    const sig = JSON.stringify([projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts, projectData.stairs]);
    const hit = _ghostNetCache.get(levelId);
    if (hit && (hit.sig === sig || layoutDragging3D() || sliderDragging)) return hit.net;
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
    if (selectedCircuitId && !circuitById(selectedCircuitId)) selectedCircuitId = null;

    wallMeshes3D.forEach(m => { threeScene.remove(m); disposeSceneObject(m); });
    wallMeshes3D = [];
    clickableWalls3D = [];
    interactiveObjects3D = [];
    SCREEN_LABELS_3D.length = 0;
    if (ceilingMesh3D) threeScene.remove(ceilingMesh3D);
    if (selectedHighlightMesh) {
        threeScene.remove(selectedHighlightMesh);
        selectedHighlightMesh = null;
    }

    // niveau actif vide : pas de retour anticipé, sinon les fantômes des autres niveaux disparaissent
    if (wallsOn().length === 0) {
        selected3DId = null;
        syncElementInspectors();
        updateCircuitsUI();
    }

    const { cx, cy } = scene3DCentre();
    // étendue réelle des murs du niveau (pour la taille du sol)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    sceneFrameWalls().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    });
    if (!isFinite(minX)) { minX = minY = maxX = maxY = 0; }

    const floorWidth = (maxX - minX) + 400;
    const floorDepth = (maxY - minY) + 400;
    const planDiagonal = Math.hypot(floorWidth, floorDepth);
    threeCamera.far = Math.max(10000, planDiagonal * 4);
    threeCamera.updateProjectionMatrix();
    if (threeControls) threeControls.maxDistance = Math.max(500, planDiagonal * 3);
    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    // sol translucide : on voit les étages et les gaines à travers ; ordre de dessin fixe (comme les murs)
    const floorMat = new THREE.MeshStandardMaterial({ color: currentTheme === 'light' ? '#f8fafc' : '#1e293b', roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
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
        const grid = new THREE.GridHelper(gridSize, divisions, dark ? '#94a3b8' : '#475569', dark ? '#475569' : '#94a3b8');
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
                const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.22, depthWrite: false }));
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.8 }));
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
        });
    }
    // câbles des autres étages : tous les modes si les étages fantômes sont affichés ;
    // sinon seul le circuit sélectionné reste visible
    if (ghostLevelsOn || selectedCircuitId || shaftBoxSel()) {
        const actLevelC = (projectData.levels || []).find(l => l.id === activeLevelId);
        const actElevC = Number(actLevelC && actLevelC.elevation) || 0;
        (projectData.levels || []).filter(l => l.id !== activeLevelId).forEach(lv => {
            const dyC = (Number(lv.elevation) || 0) - actElevC;
            renderGhostLevelCables(ghostCableNetwork(lv.id), cx, cy, dyC, !ghostLevelsOn);
        });
    }

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
        const s = sh.size || 40;
        const frame = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)),
              new THREE.LineBasicMaterial({ color: shaftColour() }));
        const sp = shaftPos2D(sh);
        frame.position.set(sp.x - cx, 1, sp.y - cy);
        frame.userData.shaftId = sh.id;   // la trémie sélectionnée clignote (cadre et colonne)
        threeScene.add(frame);
        wallMeshes3D.push(frame);
        // colonne visible en permanence (même aspect qu'à la sélection) : repère la trémie en 3D
        const span = shaftSpan3D(sh);
        const column = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, span.height, s)),
            new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.85 }));
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
                new THREE.MeshBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.3, depthWrite: false }));
            sel.position.set(frame.position.x, span.base + span.height / 2, frame.position.z);
            sel.renderOrder = 5;
            threeScene.add(sel);
            wallMeshes3D.push(sel);
        }
        // étiquette visible au-dessus de la trémie : les niveaux qu'elle relie

        // noms des niveaux reliés : taille fixe à l'écran (12 px), texte seul, sans fond
        const label = makeScreenLabel3D(shaftLevelNames(sh).join(' ↔ '), 12, { bold: true, halo: false });
        // l'étiquette se place en bas de la trémie si elle relie un niveau plus bas, en haut sinon ;
        // elle est masquée par les murs et les gaines (pas de passage par-dessus)



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
        const derivation = new THREE.Mesh(new THREE.BoxGeometry(10, DERIV_BOX_H, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        // même remède que pour les appareils : la boîte est posée à 1,5 cm de la face du mur (pas sur l'axe de la paroi
        // transparente) et son ordre de dessin est fixe, sinon le tri des transparents la fait scintiller
        // la boîte est collée à la face du mur, côté pièce de la trémie (jamais dans le mur)
        const dp = derivFacePos2D(sh) || { x: sh.x, y: sh.y, angle: 0 };
        derivation.position.set(dp.x - cx, derivHeightOf(sh, activeLevelId), dp.y - cy);
        derivation.rotation.y = -dp.angle + Math.PI / 2;
        derivation.renderOrder = 6;
        derivation.userData = { type: 'derivation', id: sh.id, derivation: true };
        interactiveObjects3D.push(derivation);
        threeScene.add(derivation);
        wallMeshes3D.push(derivation);

    });

    // Escaliers : marches pleines de la marche basse à la marche haute, emprise au sol, zone cliquable
    stairsOn().forEach(st => addStair3D(st, cx, cy));

    const levelWalls = wallsOn();
    levelWalls.forEach(w => {
        const height = w.height || 250;
        const wallGeo = wallSolidGeometry(mitredWallOutline(w, levelWalls, cx, cy), height);
        const wallMat = new THREE.MeshStandardMaterial({
            color: '#0f766e',
            transparent: true,
            opacity: 0.22,
            roughness: 0.8,
            metalness: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        // arêtes : même lecture que les murs fantômes des autres étages
        wallMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(wallGeo), new THREE.LineBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.8 })));
        // Ordre fixe : les murs transparents sont dessinés après les autres transparents, quel que soit l'angle de vue
        // (sinon le tri par distance de Three.js change d'ordre pendant la rotation et fait scintiller les appareils)
        wallMesh.renderOrder = 5;
        wallMesh.userData = { type: 'wall', id: w.id };
        threeScene.add(wallMesh);
        wallMeshes3D.push(wallMesh);

        clickableWalls3D.push(wallMesh);
        // cote de longueur : même texte que le plan 2D (« 4,00 m »), taille fixe à l'écran
        const wallLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (wallLen >= 1) {
            const cote = makeScreenLabel3D((wallLen / 100).toFixed(2).replace('.', ',') + ' m', 11, { bold: true, halo: false, dark: '#f1f5f9' });
            // posée à mi-hauteur, du côté +normale du mur, à demi-épaisseur + 12 cm
            const ux = (w.x2 - w.x1) / wallLen, uz = (w.y2 - w.y1) / wallLen;
            const off = (w.thickness || 10) / 2 + 12;
            cote.position.set((w.x1 + w.x2) / 2 - cx + uz * off, height / 2, (w.y1 + w.y2) / 2 - cy - ux * off);
            threeScene.add(cote);
            wallMeshes3D.push(cote);
        }

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

        const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 });
        const panelMat = new THREE.MeshStandardMaterial({ color: '#b07a4a', roughness: 0.3 });

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

        const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 });
        const glassMat = new THREE.MeshStandardMaterial({ color: '#93c5fd', emissive: '#60a5fa', emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.1 });

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
    // commande : couleur du circuit de la charge qu'elle pilote (sinon celle du circuit par défaut de sa charge)
    const accentHex = deviceColor(el, isControl(el) ? controlTargetsOf(getCableNetwork()) : null) || EL_COLORS[el.type];
    const accent = accentHex || '#94a3b8';
    const white = mMat('#f8fafc', { rough: 0.35 });
    const ivory = mMat('#e2e8f0', { rough: 0.45 });
    const dark = mMat('#0f172a', { rough: 0.6 });
    const metal = mMat('#cbd5e1', { rough: 0.25, metal: 0.8 });
    const accentMat = mMat(accent, { rough: 0.4 });

    if (el.type === 'outlet_16a' || el.type === 'outlet_20a' || el.type === 'outlet_20a_classic' || el.type === 'outlet_switched') {
        // prise 2P+T encastrée : plaque carrée, collerette ronde, deux alvéoles et broche de terre
        box(12, 12, 1.2, white, 0, 0, -0.4);
        cylZ(5.4, 5.6, 0.8, ivory, 0, 0, 0.6);
        cylZ(4.2, 4.2, 0.4, white, 0, 0, 1.1);
        cylZ(0.62, 0.62, 0.5, dark, -1.0, -0.2, 1.3);
        cylZ(0.62, 0.62, 0.5, dark, 1.0, -0.2, 1.3);
        cylZ(0.4, 0.4, 1.8, metal, 0, 2.5, 1.6);                              // broche de terre
        if (el.type === 'outlet_switched') cylZ(1.1, 1.1, 0.4, accentMat, 4.2, 4.2, 0.6);   // repère : prise commandée
        else box(5.5, 1.1, 0.5, accentMat, 0, ['outlet_20a', 'outlet_20a_classic'].includes(el.type) ? 4.7 : -4.8, 0.4);   // repère de calibre
    } else if (el.type === 'outlet_dedicated_20' || el.type === 'outlet_dedicated_32') {
        // prise dédiée (20 ou 32 A) : même gabarit ; la couleur de la bague distingue le calibre
        cylZ(7.4, 7.6, 1.3, white, 0, 0, -0.35);
        cylZ(5.6, 5.8, 1.0, accentMat, 0, 0, 0.8);
        cylZ(4.2, 4.4, 0.6, ivory, 0, 0, 1.5);
        [[-1.8, 0.9], [1.8, 0.9], [0, -1.7]].forEach(p => cylZ(0.75, 0.75, 0.5, dark, p[0], p[1], 1.9));
        [[-6, 0], [6, 0]].forEach(p => cylZ(0.5, 0.5, 0.6, metal, p[0], p[1], 0.5));   // vis de fixation
    } else if (el.type === 'doorbell_button') {
        // bouton de sonnette : plaque et poussoir lumineux
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        cylZ(3.6, 3.8, 1.4, white, 0, 0, 1.0);
        cylZ(2.0, 2.0, 0.4, accentMat, 0, 0, 1.8);
    } else if (el.type === 'doorbell_chime') {
        // sonnerie : boîtier rond avec grille de haut-parleur
        cylZ(6.0, 6.2, 2.0, white, 0, 0, 0.2);
        cylZ(4.6, 4.6, 0.4, dark, 0, 0, 1.3);
        cylZ(5.8, 5.8, 0.3, accentMat, 0, 0, 2.2);
    } else if (el.type === 'shutter_control') {
        // commande de volet : plaque avec deux poussoirs (monter / descendre)
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        box(4.6, 3.6, 1.2, white, 0, 2.6, 1.0);
        box(4.6, 3.6, 1.2, white, 0, -2.6, 1.0);
        box(0.8, 1.6, 0.4, accentMat, 0, 2.6, 1.8);                           // flèche haut
        box(0.8, 1.6, 0.4, accentMat, 0, -2.6, 1.8);                          // flèche bas
    } else if (el.type === 'shutter_motor') {
        // moteur de volet : petit boîtier avec repère
        box(10, 8, 5, metal, 0, 0, 0);
        box(7.6, 5.6, 0.5, white, 0, 0, 2.7);
        box(2.6, 1.0, 0.4, accentMat, 0, 0, 3.1);
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
    } else if (el.type === 'switch_dimmer') {
        // variateur : plaque, grosse molette et repère de réglage
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        cylZ(4.2, 4.2, 0.5, ivory, 0, 0, 0.9);                                  // collerette
        cylZ(3.4, 3.6, 1.4, white, 0, 0, 1.6);                                  // molette
        box(0.8, 2.2, 0.4, accentMat, 0, 2.2, 2.35);                            // repère
    } else if (el.type === 'motion_timer') {
        // détecteur de mouvement : plaque, boîtier arrondi et lentille de Fresnel
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(8.2, 10.4, 0.5, ivory, 0, 0, 0.45);
        cylZ(3.8, 4.4, 2.0, white, 0, 0, 1.2);
        cylZ(2.4, 2.4, 0.4, mMat('#93c5fd', { rough: 0.2 }), 0, 0, 2.3);
    } else if (el.type === 'wall_light') {
        // applique : platine ronde, bras, vasque ouverte vers le haut, ampoule
        cylZ(4.8, 5.0, 1.4, metal, 0, 0, -0.3);
        cylZ(1.0, 1.0, 7.0, mMat('#64748b', { rough: 0.3, metal: 0.7 }), 0, 0, 3.7);
        const bowl = new THREE.Mesh(mGeo('sph', 6.2, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat('#fff7ed', { rough: 0.3, emissive: '#fde68a', emissiveIntensity: 0.35, double: true }));
        bowl.position.set(0, 2.2, 10.5);
        g.add(bowl);
        const bulb = new THREE.Mesh(mGeo('sph', 2.5, 16, 12), mMat('#fde047', { emissive: '#fde047', emissiveIntensity: 1 }));
        bulb.position.set(0, 1.2, 10.5);
        g.add(bulb);
    } else if (el.type === 'light_spot') {
        // spot encastré : collerette affleurante et verre ambré
        cylY(5.4, 5.4, 1.0, white, 0, 0.5, 0);
        cylY(3.9, 3.9, 0.8, mMat('#fffbeb', { rough: 0.2, emissive: '#fde68a', emissiveIntensity: 0.6 }), 0, -0.3, 0);
    } else if (el.type === 'smoke_detector') {
        // DAAF : boîtier rond plat, grille et voyant LED
        cylY(6.2, 6.2, 3.0, white, 0, 1.2, 0);
        cylY(4.2, 4.2, 0.4, ivory, 0, -0.5, 0);
        cylY(0.7, 0.7, 0.5, accentMat, 2.6, -0.6, 0);
    } else if (el.type === 'light_ceiling') {
        // plafonnier : rosace au plafond, couronne, diffuseur en demi-sphère opaline
        cylY(5.0, 5.0, 1.0, white, 0, 4.7, 0);
        cylY(12.8, 12.8, 0.9, mMat('#d4a017', { rough: 0.3, metal: 0.6 }), 0, 4.1, 0);
        const dome = new THREE.Mesh(mGeo('sph', 12.4, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat('#fffbeb', { rough: 0.2, emissive: '#fde68a', emissiveIntensity: 0.55, opacity: 0.93, double: true }));
        dome.position.set(0, 3.9, 0);
        g.add(dome);
    } else if (el.type === 'junction_box') {
        // boîte de dérivation posée : petit coffret blanc, couvercle et quatre vis
        box(10, 10, 4, white, 0, 0, 2);
        box(8.4, 8.4, 0.4, ivory, 0, 0, 4.2);
        [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].forEach(p => cylZ(0.5, 0.5, 0.3, metal, p[0], p[1], 4.4));
    } else if (el.type === 'subpanel') {
        // sous-tableau : petit coffret, porte fumée, deux rangées de modules
        const W = 30, H = 40;
        box(W, H, 6, mMat('#e5e7eb', { rough: 0.5 }), 0, 0, 2);
        box(W - 4, H - 4, 0.5, mMat('#1f2937', { rough: 0.8 }), 0, 0, 5.1);
        const modMat = mMat('#f1f5f9', { rough: 0.4 });
        const toggle = mMat('#111827', { rough: 0.6 });
        [9, -9].forEach(y => {
            box(W - 8, 3, 0.5, mMat('#94a3b8', { rough: 0.3, metal: 0.7 }), 0, y, 5.5);
            for (let i = 0; i < 6; i++) {
                const x = -9 + i * 3.6;
                box(3, 6, 4, modMat, x, y, 7.2);
                box(0.7, 1.5, 0.9, toggle, x, y + 1.2, 9.6);
            }
        });
        box(W - 3, H - 3, 0.5, mMat('#0f172a', { opacity: 0.32, rough: 0.2 }), 0, 0, 10.4);
        box(W - 3, 2, 0.7, accentMat, 0, H / 2 - 3.2, 10.8);
    } else if (el.type === 'panel') {
        // tableau : coffret, porte fumée, trois rangées de modules (différentiel + disjoncteurs)
        const W = 42, H = 56;
        box(W, H, 7, mMat('#e5e7eb', { rough: 0.5 }), 0, 0, 2.5);
        box(W - 5, H - 5, 0.5, mMat('#1f2937', { rough: 0.8 }), 0, 0, 6.1);
        const rail = mMat('#94a3b8', { rough: 0.3, metal: 0.7 });
        const modMat = mMat('#f1f5f9', { rough: 0.4 });
        const toggle = mMat('#111827', { rough: 0.6 });
        const diffMat = mMat('#cbd5e1', { rough: 0.4 });
        const test = mMat('#2563eb', { rough: 0.4 });
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
        box(W - 3, H - 3, 0.5, mMat('#0f172a', { opacity: 0.32, rough: 0.2 }), 0, 0, 12.4);   // porte fumée
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

    if (CEILING_TYPES.includes(el.type)) {
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
// murs servant au cadrage 3D : ceux du niveau affiché, sinon ceux du projet (niveau actif vide)
function sceneFrameWalls() {
    const own = wallsOn();
    return own.length ? own : (projectData.walls || []);
}

function scene3DCentre() {
    if (wallCentreLock3D) return wallCentreLock3D;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    sceneFrameWalls().forEach(w => {
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
    wallPreview3D = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#38bdf8' }));
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
    if (len > 10 && segmentOverlapsWall(wallDraft3D.x, wallDraft3D.y, p.x, p.y)) {
        showNotification('Mur déjà existant à cet endroit : tracé refusé', 'error');
    } else if (len > 10) {
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
                if (!links) return;
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

        if (activePlacementType === 'shaft') {
            // trémie posée au sol, n'importe où
            const floorPt = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorPt)) {
                const { cx, cy } = scene3DCentre();
                const links = askShaftLevels();
                if (!links) return;
                saveStateToUndo();
                if (!projectData.shafts) projectData.shafts = [];
                projectData.shafts.push({ id: 'sh_' + Date.now(), levelId: activeLevelId, levelIds: links,
                    x: Math.round(floorPt.x + cx), y: Math.round(floorPt.z + cy), size: 40 });
                renderLevelSelector();
                showNotification('Trémie posée', 'success');
                build3DScene();
            }
            return;
        }
        if (CEILING_TYPES.includes(activePlacementType)) {
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
                        type: activePlacementType,
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

                    const side = wallSideOf(hitPt.x, hitPt.z, wx1, wz1, wx2, wz2);
                    const distanceCm = placedDistance({ type: activePlacementType, height: defaultHeightFor(activePlacementType) }, wall.id, Math.round(distToPt), side);

                    const why = sameSpotBlocker(activePlacementType, activeLevelId, wall.id, distanceCm, side, defaultHeightFor(activePlacementType));
                    if (why) { refuseSameSpot(why); return; }
                    saveStateToUndo();
                    
                    if (activePlacementType === 'shaft') {
                        // trémie posée en 3D : même réglage de liaison que la 2D (liste « Relier à »)
                        const links = askShaftLevels();
                        if (!links) return;
                        projectData.shafts.push({ id: 'sh_' + Date.now(), levelIds: links, wallId: wall.id, distanceFromStart: distanceCm, side, size: 40 });
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
                        if (activePlacementType === 'panel' || activePlacementType === 'subpanel' || activePlacementType === 'junction_box') defaultH = 150;
                        if (activePlacementType === 'wall_light') defaultH = 180;
                        if (activePlacementType === 'doorbell_chime') defaultH = 200;
                        if (activePlacementType === 'shutter_motor') defaultH = 210;
                        if (activePlacementType.startsWith('outlet')) defaultH = 30;
                        if (activePlacementType === 'outlet_dedicated_20' || activePlacementType === 'outlet_dedicated_32') defaultH = 20;

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
        const interactiveIntersects = orderInteractiveHits(raycaster.intersectObjects(interactiveObjects3D, true));
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
                setSelectedWalls([]);   // un mur sélectionné ne reste pas ouvert quand un autre élément est choisi
                select3DElement(targetId, target);
                if ((projectData.shafts || []).some(s => s.id === targetId)) {
                    build3DScene();   // volume de sélection visible dès le clic
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                const selectedElectrical = projectData.electrical.find(el => el.id === targetId);
                if (selectedElectrical && (isControl(selectedElectrical) ||
                    isControlledLoad(selectedElectrical))) {
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

                let isCeiling = selectedElectrical && CEILING_TYPES.includes(selectedElectrical.type);
                const dragStair = (projectData.stairs || []).find(s => s.id === targetId);
                dragging3DElementId = targetId;
                drag3DMoved = false;   // C1 : l'annulation est enregistrée au premier vrai déplacement
                drag3DDown = { x: e.clientX, y: e.clientY };
                const dragShaft = (projectData.shafts || []).find(s => s.id === targetId);
                if (isCeiling || dragStair || dragShaft) {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), target.position);
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(threeCamera.getWorldDirection(dragPlane.normal).negate(), target.position);
                }
                if (dragStair || dragShaft) {
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

// Double clic sur un appareil en 3D : affiche le circuit entier (même effet que le double clic en 2D)
function on3DDoubleClick(e) {
    if (activePlacementType || !threeCamera) return;
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse3D, threeCamera);
    let id = null;
    for (const hit of orderInteractiveHits(raycaster.intersectObjects(interactiveObjects3D, true))) {
        let o = hit.object;
        while (o && !(o.userData && o.userData.id)) o = o.parent;
        if (o) { id = o.userData.id; break; }
    }
    const el = id ? projectData.electrical.find(x => x.id === id) : null;
    const circ = el ? circuitForDoubleClick(el) : null;
    if (circ) selectCircuit(circ.id);
}



// Ordre des objets touchés par le rayon : la zone invisible d'un escalier (qui couvre toute son emprise)
// passe après les appareils et ouvertures, pour qu'ils restent cliquables quand ils sont dans l'emprise
function orderInteractiveHits(hits) {
    const isStairZone = h => !!(h.object.userData && h.object.userData.type === 'stair');
    return [...hits.filter(h => !isStairZone(h)), ...hits.filter(isStairZone)];
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
    for (const hit of orderInteractiveHits(raycaster.intersectObjects(interactiveObjects3D, true))) {
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
    if (activePlacementType && !dragging3DElementId) { updatePlaceGhost3D(e); return; }
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
        const shaftDrag = (projectData.shafts || []).find(s => s.id === dragging3DElementId);
        if (stairDrag || shaftDrag) {
            const item = stairDrag || shaftDrag;
            const g = stair3DGrab || { x: 0, z: 0 };
            const prevSt = { x: item.x, y: item.y };
            item.x = Math.round(planeIntersectPoint.x - g.x + cx);
            item.y = Math.round(planeIntersectPoint.z - g.z + cy);
            if (stairDrag) snapStairToWalls(stairDrag, prevSt);   // seul l'escalier s'aimante aux murs
            scheduleBuild3D();
            return;
        }

        let ceilingEl = projectData.electrical.find(el => el.id === dragging3DElementId && CEILING_TYPES.includes(el.type));
        if (ceilingEl) {
            ceilingEl.x = planeIntersectPoint.x + cx;
            ceilingEl.z = planeIntersectPoint.z + cy;
            scheduleBuild3D();
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
            const dist3D = item ? placedDistance(item, closestWall.id, closestDistCm, closestSide) : closestDistCm;
            const moveRefusal = item ? openingMoveRefusal(item, closestWall.id, dist3D) : '';
            if (moveRefusal) {
                if (!drag3DRefusedOp) { drag3DRefusedOp = true; showNotification(moveRefusal, 'error'); }
                item = null;   // reste à sa dernière position valide
            } else if (item) drag3DRefusedOp = false;
            if (item) {
                item.wallId = closestWall.id;
                // côté suivi comme en 2D (la fenêtre n'en a pas besoin)
                if (item.type !== 'window_std') item.side = closestSide;
                item.distanceFromStart = dist3D;
                
                const distInput = document.getElementById('inspector-distance-input');
                const distVal = document.getElementById('inspector-distance-val');
                if (distInput) distInput.value = closestDistCm;
                if (distVal) distVal.textContent = closestDistCm + ' cm';
                // appareil posé sur un mur : seul son groupe bouge pendant le geste ; sinon reconstruction habituelle
                if (!moveElementGroup3D(item)) scheduleBuild3D();
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
// Déplacement en direct d'un appareil posé sur un mur : seul son groupe 3D bouge, sans reconstruire la scène.
// Mêmes formules que createElementMesh3D. Renvoie false si ce cas ne s'applique pas (la scène est alors reconstruite).
function moveElementGroup3D(el) {
    if (!el || CEILING_TYPES.includes(el.type)) return false;
    const grp = interactiveObjects3D.find(o => o.userData && o.userData.type === 'electrical' && o.userData.id === el.id);
    const wall = projectData.walls.find(w => w.id === el.wallId);
    if (!grp || !wall || !grp.children.length) return false;
    const { cx, cy } = scene3DCentre();
    const wx1 = wall.x1 - cx, wz1 = wall.y1 - cy, wx2 = wall.x2 - cx, wz2 = wall.y2 - cy;
    const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);
    if (wallLen <= 0) return false;
    const dist = Math.max(5, Math.min(wallLen - 5, el.distanceFromStart !== undefined ? el.distanceFromStart : wallLen / 2));
    const t = dist / wallLen;
    const angle = Math.atan2(wz2 - wz1, wx2 - wx1);
    const side = el.side !== undefined ? el.side : 1;
    const off = (wall.thickness || 10) / 2 + 1.5;
    const perpX = Math.sin(angle), perpZ = -Math.cos(angle);
    grp.position.set(wx1 + t * (wx2 - wx1) + perpX * side * off, el.height || 110, wz1 + t * (wz2 - wz1) + perpZ * side * off);
    grp.rotation.y = -angle;
    // le modèle est le premier enfant du groupe (createElementMesh3D) : il tourne seulement côté A
    grp.children[0].rotation.y = side === 1 ? Math.PI : 0;
    return true;
}
function on3DPointerUp(e) {
    if (wallDrag3D) { endWallDrag3D(); return; }
    if (dragging3DElementId) {
        const moved = drag3DMoved;
        dragging3DElementId = null;
        if (threeControls) {
            threeControls.enabled = true;
            threeControls.update();
        }
        // le câblage n'a pas suivi le glissement : il est recalculé pour la position finale
        if (moved) build3DScene();
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
    const color = b.isDoor ? '#b07a4a' : '#93c5fd';
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
    const colMat = new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.35, depthWrite: false });
    const frame = add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)), colMat));
    frame.position.set(p.x - cx, base + 1, p.y - cy);
    frame.renderOrder = 3;
    // volume léger + arêtes : la colonne fantôme se voit à distance, même avec les murs transparents
    const colGeo = new THREE.BoxGeometry(s, span.height, s);
    const column = add(new THREE.LineSegments(new THREE.EdgesGeometry(colGeo), colMat));
    column.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    column.renderOrder = 3;
    const fill = add(new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.05, depthWrite: false })));
    fill.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    fill.renderOrder = 2;
    // boîtes de dérivation de chaque niveau relié, comme en réel (même taille, même position dans la gaine)
    levels.forEach(lv => {
        const dp = derivFacePos2D(sh, derivDistOf(sh, lv));
        if (!dp) return;
        const geo = new THREE.BoxGeometry(10, DERIV_BOX_H, 14);
        const y = elevOf(lv) - elevOf(activeLevelId) + derivHeightOf(sh, lv);
        const box = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false })));
        box.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.35 })));
        box.position.set(dp.x - cx, y, dp.y - cy);
        box.rotation.y = -dp.angle + Math.PI / 2;
        box.renderOrder = 4;
    });

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
// Modèle de l'escalier (marches, emprise), sans l'ajouter à la scène : sert au fantôme de pose et à la vraie pose
function buildStair3D(st, cx, cy, ghost = false) {
    const L = st.length || 300, W = st.width || 90, n = stairStepCount(st);
    const H = Math.max(stairRiseCm(st), 1);
    const elevOf = lvId => Number(((projectData.levels || []).find(l => l.id === lvId) || {}).elevation) || 0;
    const base = Math.min(...(st.levelIds || [st.levelId]).map(elevOf)) - elevOf(activeLevelId);
    const group = new THREE.Group();
    group.position.set(st.x - cx, base, st.y - cy);
    group.rotation.y = -(st.angleDeg || 0) * Math.PI / 180;
    group.userData = { type: 'stair', id: st.id };
    const stepMat = new THREE.MeshStandardMaterial({ color: '#8b5cf6', roughness: 0.7, metalness: 0, transparent: true, opacity: ghost ? 0.25 : 0.85, depthWrite: !ghost });
    for (let i = 0; i < n; i++) {
        const h = (i + 1) * H / n;
        const step = new THREE.Mesh(new THREE.BoxGeometry(L / n, h, W), stepMat);
        step.position.set(-L / 2 + (i + 0.5) * L / n, h / 2, 0);
        group.add(step);
    }
    // contour de l'emprise au sol : repère même quand les marches sont cachées
    const footprint = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(L, 1, W)),
        new THREE.LineBasicMaterial({ color: '#8b5cf6' }));
    footprint.position.set(0, 0.5, 0);
    group.add(footprint);
    return group;
}

// Escalier réel (ou fantôme d'un autre niveau) : ajouté à la scène, avec sa zone cliquable si ce n'est pas un fantôme
function addStair3D(st, cx, cy, ghost = false) {
    const L = st.length || 300, W = st.width || 90;
    const H = Math.max(stairRiseCm(st), 1);
    const group = buildStair3D(st, cx, cy, ghost);
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

    if ((foundEl && CEILING_TYPES.includes(foundEl.type)) || isStairSel) {
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
    if (!item || (el && CEILING_TYPES.includes(el.type))) return;

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
    selectedHighlightMesh = new THREE.BoxHelper(target, '#f8fafc');
    threeScene.add(selectedHighlightMesh);
}

function updateSelected3DDistance(val) {
    if (!selected3DId) return;
    const distCm = parseInt(val);
    document.getElementById('inspector-distance-val').textContent = distCm + ' cm';

    let item = projectData.electrical.find(e => e.id === selected3DId) || projectData.openings.find(o => o.id === selected3DId);
    const distRefusal = item ? openingMoveRefusal(item, item.wallId, distCm) : '';
    if (distRefusal) { showNotification(distRefusal, 'error'); return; }
    if (item) {
        if (!posUndoPending) { saveStateToUndo(); posUndoPending = true; }
        sliderDragging = true;
        item.distanceFromStart = distCm;
        refreshSliderView();
    }
}
function updateSelected3DHeight(val) {
    if (!selected3DId) return;
    const height = parseInt(val);
    document.getElementById('inspector-height-3d-val').textContent = (height / 100).toFixed(2) + ' m';

    let el = projectData.electrical.find(e => e.id === selected3DId);
    const sh = !el ? (projectData.shafts || []).find(x => x.id === selected3DId) : null;
    if (!el && !sh) return;
    if (!posUndoPending) { saveStateToUndo(); posUndoPending = true; }
    sliderDragging = true;
    if (el) {
        el.height = height;
    } else {
        // trémie sélectionnée : hauteur de son point de dérivation sur ce niveau
        sh.derivHeight = Object.assign({}, sh.derivHeight, { [activeLevelId]: Math.min(height, levelCeilingOf(activeLevelId) - DERIV_BOX_H / 2) });
    }
    refreshSliderView();
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
    selectedCircuitId = id && circuitById(id)
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
        // une commande sans charge commandée n'appartient à aucun circuit
        const first = (lightsOf.get(sw.id) || []).map(id => byId.get(id) || projectData.electrical.find(e => e.id === id)).find(Boolean);
        const c = first ? circuitOf(first) : null;
        return !!c && c.id === selectedCircuit.id;
    };
    return new Set(shown
        .filter(el => {
            // une commande suit la charge qu'elle commande, jamais le circuit d'éclairage par défaut
            if (isControl(el)) return switchBelongs(el);
            const assigned = circuitOf(el);
            return (assigned && assigned.id === selectedCircuit.id) || (panel && el.id === panel.id) || el.type === 'subpanel';
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
                const h = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: '#38bdf8', depthTest: false }));
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
        const helper = new THREE.BoxHelper(m, '#38bdf8');
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
    const sc = circuitById(selectedCircuitId);
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

    });
}

function addCircuitElementHighlights() {
    if (!selectedCircuitId) return;
    const selectedCircuit = circuitById(selectedCircuitId);
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
            new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.4, depthTest: false, depthWrite: false })
        );
        fill.position.copy(centre);
        fill.renderOrder = 11;
        fill.userData.shared = false;
        fill.userData.blink = true;
        fill.visible = blinkOn;
        threeScene.add(fill);
        wallMeshes3D.push(fill);

        const helper = new THREE.BoxHelper(target, '#ef4444');
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
// Pendant un glissement 3D (appareil, ouverture, trémie ou mur) le réseau garde sa forme d'avant le glissement :
// il est recalculé une fois au relâchement, au lieu d'être refait à chaque image
function layoutDragging3D() { return !!dragging3DElementId || !!wallDrag3D; }
function getCableNetwork() {
    ensureCircuitAssignment();
    // pendant un déplacement (3D ou appareil en 2D) ou un glissement de curseur, on garde le réseau calculé au départ
    if ((layoutDragging3D() || draggingEl2D || sliderDragging) && _cableCache.net) { cableStats = _cableCache.net; return _cableCache.net; }
    // Le niveau affiché fait partie de la clé ; les escaliers aussi (ils bloquent les pistes)
    const sig = JSON.stringify([activeLevelId, projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts, projectData.stairs]);
    if (_cableCache.sig !== sig) _cableCache = { sig, net: computeCableNetwork() };
    cableStats = _cableCache.net;
    return _cableCache.net;
}