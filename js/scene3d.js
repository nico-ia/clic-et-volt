/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

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
    threeControls.zoomSpeed = 2;
    threeControls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    threeControls.minDistance = 1.5;   // zoom avant très proche de l'élément
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
    const font = (opts.bold === false ? '' : 'bold ') + (fontPx * S) + 'px Inter, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const haloW = opts.halo ? 4 * S : 0;
    const pad = haloW + 2 * S;
    const nArrows = (text.match(/[↑↓↔]/g) || []).length;
    const W = Math.ceil(measure.measureText(text).width + 2 * pad + nArrows * fontPx * S * 0.8);
    const H = Math.ceil(fontPx * S * 1.6 + 2 * pad);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // dessine l'étiquette ; frameOn : liseré pointillé autour (texte sélectionné)
    const draw = frameOn => {
        const light = currentTheme === 'light';
        ctx.clearRect(0, 0, W, H);
        ctx.font = font;
        if (opts.halo) {
            ctx.lineWidth = haloW;
            ctx.strokeStyle = light ? '#ffffff' : '#020617';
            ctx.strokeText(text, W / 2, H / 2);
        }
        ctx.fillStyle = light ? (opts.light || '#0f172a') : (opts.dark || '#f8fafc');
        drawArrowText(ctx, text, W / 2, H / 2, fontPx * S, 1.6, 'Inter, sans-serif');
        if (frameOn) {
            ctx.save();
            ctx.setLineDash([4 * S, 3 * S]);
            ctx.strokeStyle = light ? '#047857' : '#f8fafc';
            ctx.lineWidth = 1.5 * S;
            ctx.strokeRect(S, S, W - 2 * S, H - 2 * S);
            ctx.restore();
        }
    };
    draw(!!opts.frame);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sprite.renderOrder = 11;
    sprite.userData.frameOn = !!opts.frame;
    // active ou retire le liseré sans reconstruire la scène
    sprite.userData.setFrame = on => {
        if (sprite.userData.frameOn === on) return;
        sprite.userData.frameOn = on;
        draw(on);
        tex.needsUpdate = true;
    };
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
    updateDashedBoxes3D();
    updateCableSelFrame3D();

    sortConduits3D();   // 254
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
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, span.height, s), new THREE.MeshBasicMaterial({ color: shaftVolumeColour() }));
    box.position.copy(pos);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: shaftColour() }));
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
        z: el.height || (el.type === 'panel' ? 150 : el.type === 'wall_light' ? 180 : el.type === 'doorbell_chime' ? 200 : el.type === 'shutter_motor' ? 210 : el.type.startsWith('outlet') ? 30 : 110)
    };
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
    crossPenalty: 12,   // coût fictif (cm) : on ne perce un mur que si cela fait gagner de la longueur
    openMargin: 0,      // marge autour des ouvertures (rayon de gaine + cadre)
    maxDegree: 3,       // câbles maximum arrivant sur un même boîtier d'appareil (repiquage)
    lightLinks: 3,      // points de raccordement testés par plafonnier
    maxRadius: 5,
    ceilFreeFactor: 0,  // 122 : surcoût (×) d'un plafond non réglé « murs haut » ; 1 = coûte deux fois sa longueur
    riserPenalty: 0    // 121 : coût fictif (cm) d'une montée ou descente : évite les montées inutiles vers le plafond
};

// opacité de la gaine mise en surbrillance : assez transparente pour laisser voir les fils
const CONDUIT_FOCUS_OPACITY = 1.0;

// opacité des gaines ICTA, réglée par le curseur 3D (0 à 1) ; valeur de départ = ancien rendu
let conduitOpacity = 0.32;

// rayon d'une âme de fil (unités monde) ; les fils occupent toute la section utile de la gaine
const CORE_R = 0.24;

function circuitById(id) {
    if (!id) return null;
    return projectData.circuits.find(c => c.id === id) || null;
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
    electricalOn(levelId).forEach(el => {
        if (isCircuitPoint(el)) { const c = circuitOf(el); if (c) ids.add(c.id); return; }
        // une commande (interrupteur) n'a pas de circuit : son câble suit celui de la charge qu'elle commande, même à un autre étage
        // 183 : seules les charges réellement pilotées par cette commande (même choix que le câblage) comptent
        if (isControl(el)) { const pilote = commandGroupOf(); (projectData.electrical || []).filter(l => isControlledLoad(l) && pilote.get(l.id) === el.id).forEach(l => { const c = circuitOf(l); if (c) ids.add(c.id); }); }
    });
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
function shaftProxyOn(levelId, otherLevelId, proxyId, type, refs) {
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
            const pos = shaftProxyOn(activeLevelId, light.levelId, 'xl|' + lid, light.type, [sw, light]);
            if (!pos) {
                // warnAt n'est pas visible ici (fonction distincte) : même effet inline
                result.warnings.push('Commande de ' + electricalDisplayName(light) + ' (autre niveau) : aucune trémie entre les deux niveaux');
                result.warnTarget['Commande de ' + electricalDisplayName(light) + ' (autre niveau) : aucune trémie entre les deux niveaux'] = light.id;
                return;
            }
            pos.realId = lid;
            proxies.push(pos);
        });
    });
    projectData.electrical.filter(e => isControl(e) && !hereIds.has(e.id)).forEach(sw => {
        const mine = (Array.isArray(sw.controlledLightIds) ? sw.controlledLightIds : []).filter(lid => lightsHere.some(l => l.id === lid && canControl(sw, l)));
        if (!mine.length) return;
        const pos = shaftProxyOn(activeLevelId, sw.levelId, 'xs|' + sw.id, sw.type, [sw, lightsHere.find(l => l.id === mine[0])]);
        if (!pos) return;
        pos.realId = sw.id;
        pos.controlledLightIds = mine;
        proxies.push(pos);
    });
    return proxies;
}

function computeCableNetwork() {
    // un calcul complet prend la place d'un calcul de fond en cours (mémoire remise à l'état d'avant)
    abortCableJob(true);
    return buildCableNetwork();
}
// Hauteur de passage sous un escalier (cm), au-dessus du sol le plus haut relié
const STAIR_PASSAGE_CM = 210;

// Le segment [a, b] (plan) coupe-t-il le rectangle orienté R (emprise d'un escalier) ?
function segmentHitsRect(a, b, R) {
    const la = { u: (a.x - R.cx) * R.ux + (a.y - R.cy) * R.uy, v: (a.x - R.cx) * R.vx + (a.y - R.cy) * R.vy };
    const lb = { u: (b.x - R.cx) * R.ux + (b.y - R.cy) * R.uy, v: (b.x - R.cx) * R.vx + (b.y - R.cy) * R.vy };
    const du = lb.u - la.u, dv = lb.v - la.v;
    let t0 = 0, t1 = 1;
    const clip = (p, q) => {   // condition p * t <= q, intersection des intervalles
        if (Math.abs(p) < 1e-9) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
    };
    return clip(-du, la.u + R.hl) && clip(du, R.hl - la.u) && clip(-dv, la.v + R.hw) && clip(dv, R.hw - la.v) && t0 <= t1;
}

// Emprises des escaliers du niveau, en trous : plafond (si c'est le niveau le plus bas de l'escalier), sol sinon.
// Emprise complète, collé à un mur ou non (l'exception murale est gérée par stairWallExemptKeys).
function stairHoleRectsOn(levelId) {
    const elev = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
    const out = { ceil: [], floor: [] };
    stairsOn(levelId).forEach(st => {
        const R = stairRect(st);
        const ids = st.levelIds || [st.levelId];
        const lowest = Math.min(...ids.map(elev));
        if (elev(levelId) <= lowest) out.ceil.push(R);
        else out.floor.push(R);
    });
    return out;
}

// Clés « mur|face » des pistes qui longent un mur collé à un escalier, sur la face côté escalier.
// Ces pistes ne sont jamais bloquées par l'emprise (câble dans le placo, à toute hauteur).
function stairWallExemptKeys(levelId) {
    const keys = new Set();
    stairsOn(levelId).forEach(st => {
        const R = stairRect(st);
        wallsOn(levelId).forEach(w => {
            const W = wallRectOf(w);
            if (!W) return;
            const dx = R.cx - W.cx, dy = R.cy - W.cy;
            const rS = R.hl * Math.abs(R.ux * W.vx + R.uy * W.vy) + R.hw * Math.abs(R.vx * W.vx + R.vy * W.vy);
            const gap = Math.abs(dx * W.vx + dy * W.vy) - (W.hw + rS);
            const along = dx * W.ux + dy * W.uy;
            const rU = R.hl * Math.abs(R.ux * W.ux + R.uy * W.uy) + R.hw * Math.abs(R.vx * W.ux + R.vy * W.uy);
            if (!(gap < STAIR_SNAP_CM && gap > -5 && Math.abs(along) < W.hl + rU)) return;
            // même normale que les pistes (buildCableNetwork) : côté +1 ou -1 où se trouve l'escalier
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const nx = (w.y2 - w.y1) / len, ny = -(w.x2 - w.x1) / len;
            const side = ((R.cx - (w.x1 + w.x2) / 2) * nx + (R.cy - (w.y1 + w.y2) / 2) * ny) >= 0 ? 1 : -1;
            keys.add(w.id + '|' + side);
        });
    });
    return keys;
}

// Les câbles peuvent traverser les escaliers (mais pas les trémies)
function segmentCrossesStairVolume(a, b) {
    // Un escalier collé à un mur n'est pas bloquant : le câble longe le mur et le traverse (placo entre les deux)
    const stairs = stairsOn(activeLevelId);
    if (!stairs.length) return null;
    for (const st of stairs) {
        const R = stairRect(st);
        const elevOf = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
        const here = elevOf(activeLevelId);
        const elevs = (st.levelIds || [st.levelId]).map(elevOf);
        const zLow = Math.min(...elevs) - here;
        const zHigh = Math.max(...elevs) - here + STAIR_PASSAGE_CM;
        // NOUVEAU : Vérifier si l'escalier est contre un mur
        const walls = wallsOn(activeLevelId);
        const isAgainstWall = wallsOn(activeLevelId).some(w => {
            const W = wallRectOf(w);
            if (!W) return false;
            const dx = R.cx - W.cx, dy = R.cy - W.cy;
            // projection réelle de l'emprise sur la normale du mur (et non la demi-longueur seule)
            const rS = R.hl * Math.abs(R.ux * W.vx + R.uy * W.vy) + R.hw * Math.abs(R.vx * W.vx + R.vy * W.vy);
            const gap = Math.abs(dx * W.vx + dy * W.vy) - (W.hw + rS);
            // l'escalier doit aussi se trouver le long du mur (pas au-delà de son extrémité)
            const along = dx * W.ux + dy * W.uy;
            const rU = R.hl * Math.abs(R.ux * W.ux + R.uy * W.uy) + R.hw * Math.abs(R.vx * W.ux + R.vy * W.uy);
            return gap < STAIR_SNAP_CM && gap > -5 && Math.abs(along) < W.hl + rU;
        });
        // Si l'escalier est contre un mur, NE PAS bloquer les câbles
        if (isAgainstWall) continue;
        // Sinon, vérifier si le segment traverse le volume de l'escalier
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const N = Math.max(1, Math.ceil(len / 2));
        for (let k = 0; k <= N; k++) {
            const t = k / N;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            const z = a.z + (b.z - a.z) * t;
            const dx = x - R.cx, dy = y - R.cy;
            const pu = dx * R.ux + dy * R.uy;
            const pv = dx * R.vx + dy * R.vy;
            if (Math.abs(pu) > R.hl || Math.abs(pv) > R.hw) continue;
            if (z < zLow || z > zHigh) continue;
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

// Étape 8, partie 1 : nature d'une arête. inOtherWall(e) : vrai si l'arête est dans l'épaisseur d'un autre mur
function cableNatureOfEdge(e, inOtherWall) {
    if (e.acc) return 'accès sous-plancher';
    if (e.kind === 'air') return 'faux plafond';
    if (e.kind === 'sp') return 'sous-plancher';
    if (e.kind === 'riser') return 'montée';
    if (e.kind === 'stub') return 'raccord';
    if (e.kind === 'low' || e.kind === 'ceil') {
        if (inOtherWall(e)) return 'passage cloison';
        return e.kind === 'low' ? 'murs bas' : 'murs haut';
    }
    return e.kind;
}

// Découpe un chemin (arêtes dans l'ordre) : une coupure à chaque changement de nature
function cutCableMorceaux(path, inOtherWall) {
    const out = [];
    path.forEach(e => {
        const nature = cableNatureOfEdge(e, inOtherWall);
        const last = out[out.length - 1];
        if (last && last.nature === nature) { last.len += e.len; last.keys.push(e.cutKey); }
        else out.push({ nature, len: e.len, keys: [e.cutKey] });
    });
    return out;
}

// Patch 155 : liaisons figées. Pour chaque circuit, on retient à quel appareil ou raccord
// chaque prise est reliée. Au recalcul, cette liaison est reprise si elle reste possible ;
// seules les liaisons devenues impossibles sont recherchées à nouveau.
// Mémoire de session : vidée à l'ouverture de la page et par « Tout réinitialiser ».
const FROZEN_LINKS = new Map();   // id du circuit -> Map(id de l'appareil -> { parent, key })

// 123 : hauteur de chaque tronçon utilisé, par circuit. Un tronçon en « auto » garde la hauteur qu'il a déjà
// quand on règle un autre tronçon : seul le tronçon réglé change. Mémoire de session.
const SECTION_PINS = new Map();    // id du circuit -> { clé de tronçon: 'low' | 'ceil' }
const SECTION_MANUAL_SEEN = new Map();   // id du circuit -> Set des tronçons déjà réglés à la main
// réglages effectifs d'un circuit : hauteurs verrouillées, puis réglages faits à la main (ils l'emportent)
function effectiveCutsOf(c) {
    if (!c) return null;
    // un tronçon dont le réglage à la main a été retiré (« Auto ») reprend le plus court chemin
    const seen = SECTION_MANUAL_SEEN.get(c.id) || new Set();
    const manual = c.cableCuts || {};
    const pins = SECTION_PINS.get(c.id) || {};
    seen.forEach(k => { if (!(k in manual)) { delete pins[k]; seen.delete(k); } });
    Object.keys(manual).forEach(k => seen.add(k));
    SECTION_MANUAL_SEEN.set(c.id, seen);
    return Object.assign({}, pins, manual);
}

// 175 : clé du tronçon de mur d'un segment pour un circuit donné (un segment peut porter plusieurs circuits)
function cableSegKey(sg, cid) { return (cid && sg && sg.cutKeys && sg.cutKeys[cid]) || null; }

// Position d'un appareil (plan) : sert à savoir s'il a bougé
const frozenPosOf = el => {
    const p = el.free || getElCoords(el);
    return Math.round(p.x * 10) + '|' + Math.round(p.y * 10);
};
// Clé d'une liaison : position de l'appareil et de son raccord. Si l'un bouge, la liaison n'est plus reprise.
const frozenKeyOf = (child, parent) => frozenPosOf(child) + '~' + frozenPosOf(parent);

// seul le bâti (murs, ouvertures, escaliers, trémies) vide la mémoire du câblage ; les appareils n'y touchent pas
let _cableTopoSig = null;
function forgetCableMemoryIfTopologyChanged() {
    const sig = JSON.stringify([projectData.walls, projectData.openings, projectData.stairs, projectData.shafts]);
    if (_cableTopoSig !== null && sig !== _cableTopoSig) { FROZEN_LINKS.clear(); SECTION_PINS.clear(); }
    _cableTopoSig = sig;
}
// 199 : raccord de plafonnier retenu par chaque liaison (clé de liaison -> clé de base du raccord)
const cableLinkFeet = new Map();
// préparation avant tout calcul (ou toute sauvegarde de la mémoire du câblage)
function prepareCableMemory() {
    forgetCableMemoryIfTopologyChanged();
    // 175 : les clés de tronçon deviennent propres à chaque circuit : anciens réglages retirés une fois
    if (projectData.cutKeyVersion !== 2) {
        (projectData.circuits || []).forEach(c => { c.cableCuts = {}; });
        SECTION_PINS.clear();
        SECTION_MANUAL_SEEN.clear();
        projectData.cutKeyVersion = 2;
    }
    ensureCircuitAssignment();
}
// calcul découpé en étapes : chaque « yield » rend la main au navigateur (voir runCableJobSlice)
function* buildCableNetworkSteps() {
    const C = CABLE_CFG;
    const walls = wallsOn().filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1);
    const els = electricalOn();
    const result = { segments: [], linkCount: 0, unrouted: 0, linkInfo: [], circuitRuns: {}, warnings: [], controlLinks: [], boxServed: {}, cavityCids: new Set(), unroutedBy: {}, warnTarget: {}, stairHitIds: [], stairCulprits: [], morceaux: [] };
    // avertissement de câblage + élément à corriger (id), lu par l'onglet Avertissements
    const warnAt = (msg, id) => { result.warnings.push(msg); if (id) result.warnTarget[msg] = id; };
    // 133 : nom d'un appareil dans un avertissement, avec son circuit entre parenthèses (sans passer par le réseau)
    const warnName = el => { const c = circuitOf(el); return electricalDisplayName(el) + (c ? ' (' + c.name + ')' : ''); };
    // chaque liaison non reliée est comptée sur son circuit (« _none » : sans circuit) pour que l'alerte le désigne
    const lostFor = (cid, n = 1) => { const k = cid || '_none'; result.unroutedBy[k] = (result.unroutedBy[k] || 0) + n; result.unrouted += n; };
    const cidOfEl = el => { const c = circuitOf(el); return c ? c.id : null; };
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
            wired.forEach(el => lostFor(cidOfEl(el)));
            result.warnings.push('Pas de tableau ni de trémie vers le tableau à cet étage : appareils non reliés');
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
    // plafond de chaque mur : un mur plus bas ne fait descendre que ses propres câbles
    const wallCeil = w => (w.height || 250) - C.ceilGap;
    const ceilZ = Math.min(...walls.map(wallCeil));   // plafond le plus bas de l'étage (contrôles de ligne de vue)
    // trous d'escalier : plafond du niveau bas, sol de l'étage haut. Aucun tronçon ne les traverse,
    // sauf les pistes qui longent un mur collé à un escalier, côté escalier (câble dans le placo)
    const holes = stairHoleRectsOn(activeLevelId);
    const wallExempt = stairWallExemptKeys(activeLevelId);
    const holeCrosses = (a, b, kind) => {
        const list = kind === 'ceil' ? holes.ceil : kind === 'low' ? holes.floor : holes.ceil.concat(holes.floor);
        return list.some(R => segmentHitsRect(a, b, R));
    };
    const levelsAt = z => [{ kind: 'low', z: C.lowZ }, { kind: 'ceil', z }];
    const tracks = [];
    walls.forEach(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len, th = w.thickness || 10;
        const ext = th + 10;   // prolongement pour retrouver les angles
        // une seule piste par mur, au centre de l'épaisseur : plus de distinction intérieur / extérieur
        tracks.push({ wall: w, side: 0, len, ux, uy, ox: w.x1, oy: w.y1, t0: -ext, t1: len + ext, st: [0, len], ceilZ: wallCeil(w) });
    });
    const P = (t, s) => ({ x: t.ox + t.ux * s, y: t.oy + t.uy * s });
    yield;
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

    yield;
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
    // un blocage d'escalier ne vaut que pour sa face ; une ouverture (sans face) bloque les deux
    const sameFace = (sp, side) => side === undefined || side === 0 || sp.side === undefined || sp.side === side;
    const blockedH = (wid, s0, s1, z, side) => (spans.get(wid) || []).some(sp => sameFace(sp, side) && s1 > sp.lo + 0.01 && s0 < sp.hi - 0.01 && z > sp.z0 && z < sp.z1);
    const blockedV = (wid, s, za, zb, side) => (spans.get(wid) || []).some(sp => sameFace(sp, side) && s > sp.lo && s < sp.hi && Math.max(za, zb) > sp.z0 && Math.min(za, zb) < sp.z1);
    yield;
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
                const zF = Math.max(C.lowZ, Math.min(t.ceilZ, el.height || 150));
                if (d < bestD && !segmentCrossesStairVolume({ x: el.free.x, y: el.free.y, z: zF }, { x: F.x, y: F.y, z: zF })) { bestD = d; bestT = t; bestS = s; }
            });
            // trémie au bout d'un mur (coin) : le point d'attache tomberait sur une extrémité non reliée aux autres pistes.
            // On se rattache au croisement le plus proche, qui est déjà relié au réseau.
            if (bestT && (bestS <= 0.5 || bestS >= bestT.len - 0.5) && junctions.length) {
                let jb = null, jd = Infinity;
                junctions.forEach(j => { const dj = Math.hypot(el.free.x - j.p.x, el.free.y - j.p.y); if (dj < jd) { jd = dj; jb = j; } });
                if (jb) { bestT = jb.a; bestS = jb.s; }
            }
            if (!bestT) {
                if (!tracks.length) warnAt('Trémie « ' + shaftTitle(el.shaftId) + ' » : aucun mur à cet étage, le câble ne peut pas la rejoindre', el.shaftId);
                else warnAt('Trémie « ' + shaftTitle(el.shaftId) + ' » : toutes les liaisons vers un mur traversent un escalier, le câble ne peut pas la rejoindre', el.shaftId);
                return;
            }
            bestT.st.push(bestS);
            const zFree = Math.max(C.lowZ, Math.min(bestT.ceilZ, el.height || 150));
            // trémie libre (boucle allEls, branche el.free)
            place.set(el.id, { t: bestT, E: { x: el.free.x, y: el.free.y, z: zFree }, dist: bestS, r: bestS, zEl: zFree, free: true, label: el.shaftId, cid: cidOfEl(el) });
            return;
        }
        if (CEILING_TYPES.includes(el.type)) return;
        const w = walls.find(x => x.id === el.wallId);
        if (!w) return;
        const t = tracks.find(tr => tr.wall === w);
        const E = getElCoords(el);
        let dist = el.distanceFromStart !== undefined ? el.distanceFromStart : t.len / 2;
        // 1 cm du bout du mur (et non 10 cm) : un interrupteur près d'un angle reste sur son mur, au lieu d'être repoussé
        const EDGE_MIN = 1;
        dist = Math.max(EDGE_MIN, Math.min(t.len - EDGE_MIN, dist));
        const zEl = Math.max(C.lowZ, Math.min(t.ceilZ, E.z));
        const list = spans.get(w.id);
        const own = list.find(sp => dist > sp.lo && dist < sp.hi && E.z >= sp.z0 && E.z <= sp.z1) || null;
        const stubOK = (r) => !list.some(sp => sp !== own && Math.max(r, dist) > sp.lo && Math.min(r, dist) < sp.hi && E.z >= sp.z0 && E.z <= sp.z1);
        // Keep the vertical drop above the device unless an opening blocks that position.
        const cands = [dist];
        list.forEach(sp => cands.push(sp.lo - 0.5, sp.hi + 0.5));
        const valid = cands
            .filter(r => r >= EDGE_MIN && r <= t.len - EDGE_MIN && !blockedV(w.id, r, C.lowZ, t.ceilZ, t.side) && stubOK(r))
            .sort((p, q) => Math.abs(p - dist) - Math.abs(q - dist) || q - p);
        let r = valid.length ? valid[0] : Math.max(EDGE_MIN, Math.min(t.len - EDGE_MIN, dist));
        if (!valid.length) warnAt('Aucune descente possible pour ' + warnName(el), el.id);
        t.st.push(r);
        // appareil fixé sur un mur
        place.set(el.id, { t, E, dist, r, zEl, cid: cidOfEl(el) });
    });
    // 175 : limites de section. Communes à tous les circuits : extrémités du mur, intersections avec un autre mur,
    // ouvertures (début et fin de baie), escaliers. Propres à un circuit : ses seuls appareils posés sur le mur (own = circuit).
    // Un appareil d'un autre circuit ne coupe jamais le tronçon de ce circuit.

    tracks.forEach(t => {
        const lim = [{ s: 0, ref: 'e0' }, { s: t.len, ref: 'e1' }];
        junctions.forEach(j => {
            if (j.a === t && j.s > 0 && j.s < t.len) lim.push({ s: j.s, ref: 'j:' + j.b.wall.id });
            if (j.b === t && j.u > 0 && j.u < t.len) lim.push({ s: j.u, ref: 'j:' + j.a.wall.id });
        });
        place.forEach((pl, id) => {
            if (pl.t !== t || !(pl.r > 0 && pl.r < t.len) || !pl.cid) return;
            lim.push({ s: pl.r, ref: id, own: pl.cid });
        });
        t.limits = lim;
        t.boundsBy = new Map();
    });

    // 187 : une même paire de limites peut encadrer deux travées séparées (ex. un plafonnier qui raccorde deux fois le même mur) :
    // la n-ième occurrence reçoit le suffixe #n, pour que deux tronçons distincts ne partagent jamais la même clé
    const bayKeyFromBounds = (t, B, i) => {
        let n = 0;
        for (let j = 0; j < i; j++) if (B[j].ref === B[i].ref && B[j + 1] && B[j + 1].ref === B[i + 1].ref) n++;
        return t.wall.id + '|' + B[i].ref + '|' + B[i + 1].ref + (n ? '#' + n : '');
    };

    // limites retenues pour un circuit (k = '' : sans circuit, seulement les limites communes)
    const boundsFor = (t, cid) => {
        const k = cid || '';
        if (t.boundsBy.has(k)) return t.boundsBy.get(k);
        const lim = t.limits.filter(l => !l.own || l.own === k).sort((p, q) => p.s - q.s);
        const B = lim.filter((l, i) => i === 0 || Math.round(l.s * 10) !== Math.round(lim[i - 1].s * 10));
        t.boundsBy.set(k, B);
        return B;
    };
    // clé d'une section : mur, limite de départ, limite d'arrivée, vues par ce circuit
    const bayKeyOf = (t, s, cid) => {
        const B = boundsFor(t, cid), x = Math.max(0, Math.min(t.len, s));
        let i = 0;
        while (i < B.length - 2 && B[i + 1].s <= x) i++;
        return bayKeyFromBounds(t, B, i);
    };
    // clé de section d'une arête de mur pour un circuit (null pour une arête qui n'est pas un morceau de mur)
    // 188 : un tronçon ne traverse pas un coude. Pour un plafonnier (travée bornée par son raccord « L: »), le morceau au plafond
    // a sa propre clé (suffixe @c) : il ne partage ni le réglage ni la sélection du morceau sur le mur
    const lightBayOf = (t, s, cid) => {
        const B = boundsFor(t, cid), x = Math.max(0, Math.min(t.len, s));
        let i = 0;
        while (i < B.length - 2 && B[i + 1].s <= x) i++;
        return B[i].ref.startsWith('L:') || B[i + 1].ref.startsWith('L:');
    };
    const keyOfEdge = (e, cid) => {
        if (!e.track || !cid) return null;
        if (!e.keyBy) e.keyBy = new Map();
        if (!e.keyBy.has(cid)) {
            const k = bayKeyOf(e.track, e.sMid, cid);
            e.keyBy.set(cid, e.kind === 'ceil' && lightBayOf(e.track, e.sMid, cid) ? k + '@c' : k);
        }
        return e.keyBy.get(cid);
    };
    yield;
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

    yield;
    // 6. Murs avec des ouvertures
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

    // identifiant d'un tronçon : ses deux extrémités arrondies (stable tant que les murs ne bougent pas)
    // identifiant d'un tronçon en plan (sans la hauteur) : le même passage bas et haut partage le même réglage
    const cutKeyOf = (p, q) => { const a = Math.round(p.x * 10) + '|' + Math.round(p.y * 10), b = Math.round(q.x * 10) + '|' + Math.round(q.y * 10); return a < b ? a + '~' + b : b + '~' + a; };
    const addEdge = (n1, n2, kind, extraCost) => {
        if (n1 === n2) return null;
        const ek = n1.k < n2.k ? n1.k + '~' + n2.k : n2.k + '~' + n1.k;
        if (edgeKeys.has(ek)) return null;
        edgeKeys.add(ek);
        const len = Math.hypot(n2.x - n1.x, n2.y - n1.y, n2.z - n1.z);
        const e = { a: n1, b: n2, len, kind, dead: false, cost: len + (extraCost || 0) + (kind === 'riser' ? C.riserPenalty : 0), cutKey: cutKeyOf(n1, n2) };
        n1.adj.push(e);
        n2.adj.push(e);
        allEdges.length;
        allEdges.push(e);
        return e;
    };

    // géométrie des murs calculée une seule fois (B2) : mêmes opérations que l'ancienne version, résultat identique
    const wallGeo = walls.map(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const half = (w.thickness || 10) / 2 + 1;
        // boîte englobante : insideBody accepte jusqu'à 0,5 cm au-delà des extrémités, d'où la marge + 0,5
        const reach = half + 0.5;
        return { x1: w.x1, y1: w.y1, len, ux: dx / len, uy: dy / len, half, top: w.height || 250,
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
    // comme insideBody, en ignorant le mur donné (une piste est au centre de son propre mur)
    const insideBodyExcept = (x, y, wall) => {
        for (let i = 0; i < wallGeo.length; i++) {
            if (walls[i] === wall) continue;
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
        // 184 : pied de chaque plafonnier au-dessus du mur : station du mur, pour que les morceaux bas et hauts soient coupés au même endroit
        electricalOn().filter(el => CEILING_TYPES.includes(el.type) && cidOfEl(el)).forEach(el => {
            const E = getElCoords(el);
            const along = (E.x - t.ox) * t.ux + (E.y - t.oy) * t.uy;
            const across = Math.abs((E.x - t.ox) * t.uy - (E.y - t.oy) * t.ux);
            if (across <= (t.wall.thickness || 10) / 2 + 0.5 && along > 10 && along < t.len - 10) t.st.push(along);
        });
        const ss = t.st.slice().sort((p, q) => p - q).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.3);
        const tWalls = stubWalls.get(t) || [];
        // murs qui rejoignent cette piste à son extrémité : leur épaisseur déborde normalement au coin
        const cornerWalls = junctions.filter(j => (j.a === t && (j.s <= 0.01 || j.s >= t.len - 0.01)) || (j.b === t && (j.u <= 0.01 || j.u >= t.len - 0.01)))
            .map(j => (j.a === t ? j.b : j.a).wall);
        const inCorner = p => cornerWalls.some(w => inWallBody(w, p.x, p.y));
        for (let k = 0; k < ss.length - 1; k++) {
            const s0 = ss[k], s1 = ss[k + 1];
            if (s1 - s0 < 0.5) continue;
            const samples = [0.25, 0.5, 0.75].map(f => P(t, s0 + (s1 - s0) * f));
            // ne traverse jamais un mur, sauf l'épaisseur du mur où la piste est enfoncée en T
            const inTWall = p => s0 >= 0 && s1 <= t.len && tWalls.some(w => inWallBody(w, p.x, p.y));
            // 216 : un morceau qui aboutit à une jonction en T (mur perpendiculaire au milieu de cette piste) peut
            // entrer dans l'épaisseur de ce mur : sinon les morceaux courts près de la jonction disparaissent
            const endWalls = junctions.filter(j => (j.a === t && (Math.abs(j.s - s0) < 0.5 || Math.abs(j.s - s1) < 0.5)))
                .map(j => j.b.wall)
                .concat(junctions.filter(j => (j.b === t && (Math.abs(j.u - s0) < 0.5 || Math.abs(j.u - s1) < 0.5))).map(j => j.a.wall));
            const inEndWall = p => endWalls.some(w => inWallBody(w, p.x, p.y));
            if (samples.some(p => insideBodyExcept(p.x, p.y, t.wall) && !inTWall(p) && !inCorner(p) && !inEndWall(p))) continue;
            const p0 = P(t, s0), p1 = P(t, s1);
            levelsAt(t.ceilZ).forEach(L => {
                if (blockedH(t.wall.id, s0, s1, L.z, t.side)) return;   // ni devant une porte, ni devant une fenêtre
                // ni dans le trou d'un escalier, sauf le long d'un mur collé à cet escalier (placo)
                if (!(wallExempt.has(t.wall.id + '|1') || wallExempt.has(t.wall.id + '|-1')) && holeCrosses(p0, p1, L.kind)) return;
                const ed = addEdge(node(p0.x, p0.y, L.z), node(p1.x, p1.y, L.z), L.kind);
                if (ed) { ed.track = t; ed.sMid = (s0 + s1) / 2; }
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
            if (blockedV(o.wall.id, so, C.lowZ, o.ceilZ, o.side)) return;
            const p0 = P(t, s), p1 = P(t, sEnd);
            levelsAt(t.ceilZ).forEach(L => {
                if (blockedH(t.wall.id, Math.min(s, sEnd), Math.max(s, sEnd), L.z, t.side)) return;
                if (holeCrosses(p0, p1, L.kind)) return;
                const ed = addEdge(node(p0.x, p0.y, L.z), node(p1.x, p1.y, L.z), L.kind, C.crossPenalty);
                if (ed) { ed.track = t; ed.sMid = sEnd; }
            });
        });
    });

    const airClearCalc = (a, b) => {
        const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
        // seuls les murs dont la boîte englobante touche le segment peuvent le couper
        const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x), sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);
        const near = wallGeo.filter(g => g.top > a.z && g.bx1 >= sx0 && g.bx0 <= sx1 && g.by1 >= sy0 && g.by0 <= sy1);
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
         // Un segment au plafond ne traverse pas l'emprise d'un escalier (trou dans le plafond), escalier tourné compris
        for (const st of stairsOn(activeLevelId)) {
            if (segmentHitsRect(a, b, stairRect(st))) return false;
        }
        // Garder la vérification du volume 3D pour les autres cas
        if (segmentCrossesStairVolume({ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z })) return false;
        return true;
    };    
    // signature de ce qui influence airClear : murs, escaliers, niveaux, hauteur du plafond
    const airMemoSig = JSON.stringify([
        walls.map(w => [w.x1, w.y1, w.x2, w.y2, w.thickness, w.levelId, w.height]),
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
        const key = a.x + ',' + a.y + ',' + a.z + ',' + b.x + ',' + b.y + ',' + b.z;
        const memo = AIR_CLEAR_MEMO.map;
        if (!memo.has(key)) memo.set(key, airClearCalc(a, b));
        return memo.get(key);
    };
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
            if (holeCrosses(a.p, b.p, 'riser')) continue;            
            addEdge(node(a.p.x, a.p.y, C.lowZ), node(b.p.x, b.p.y, C.lowZ), 'low');
            if (Math.abs(a.t.ceilZ - b.t.ceilZ) < 0.01) addEdge(node(a.p.x, a.p.y, a.t.ceilZ), node(b.p.x, b.p.y, b.t.ceilZ), 'ceil');
            [a, b].forEach(q => addEdge(node(q.p.x, q.p.y, C.lowZ), node(q.p.x, q.p.y, q.t.ceilZ), 'riser'));
        }
    }
    // Colonnes verticales dans les angles / jonctions (sauf devant une ouverture)
    junctions.forEach(j => {
        const lo = findNode(j.p.x, j.p.y, C.lowZ);
        const hiA = findNode(j.p.x, j.p.y, j.a.ceilZ), hiB = findNode(j.p.x, j.p.y, j.b.ceilZ);
        // la montée ne dépend que des ouvertures du mur qui monte : une porte sur le mur voisin ne la bloque pas
        if (lo && hiA && !blockedV(j.a.wall.id, j.s, C.lowZ, j.a.ceilZ, j.a.side) && !holeCrosses(j.p, j.p, 'riser')) addEdge(lo, hiA, 'riser');
        if (lo && hiB && !blockedV(j.b.wall.id, j.u, C.lowZ, j.b.ceilZ, j.b.side) && !holeCrosses(j.p, j.p, 'riser')) addEdge(lo, hiB, 'riser');
        // murs de hauteurs différentes : descente entre les deux plafonds, à la jonction
        if (hiA && hiB && hiA !== hiB && !holeCrosses(j.p, j.p, 'riser')) addEdge(hiA, hiB, 'riser');
    });
    yield;
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
            const cz = pl.t.ceilZ;   // plafond du mur de cet appareil
            const lo = node(A.x, A.y, C.lowZ), hi = node(A.x, A.y, cz);
            // trémie : la sortie monte jusqu'au plafond dans la trémie, puis file au plafond jusqu'au mur (patch 24).
            // Jamais d'horizontale à mi-hauteur ni au sol. Les appareils fixés sur un mur ne sont pas concernés.
            if (pl.free) {
                addEdge(lo, hi, 'riser');
                return { node: hi, stub: [pl.E, { x: pl.E.x, y: pl.E.y, z: cz }, { x: A.x, y: A.y, z: cz }] };
            }
            let at;
            if (pl.zEl - C.lowZ < 1) { at = lo; addEdge(lo, hi, 'riser'); }
            else if (cz - pl.zEl < 1) { at = hi; addEdge(lo, hi, 'riser'); }
            else { at = node(A.x, A.y, pl.zEl); addEdge(lo, at, 'riser'); addEdge(at, hi, 'riser'); }
            const stub = [pl.E, { x: F.x, y: F.y, z: pl.E.z }, { x: A.x, y: A.y, z: pl.E.z }];
            if (Math.abs(pl.zEl - pl.E.z) > 0.3) stub.push({ x: A.x, y: A.y, z: pl.zEl });
           
            // 207/208 : prise à deux bornes : le fond bas et le haut du mur restent continus ; entrée (at) et sortie (nodeOut) à 1 cm, chacune avec sa descente
            if (String(el.type).startsWith('outlet') && at !== lo && at !== hi) {
                const ox = pl.t.ux * 1, oy = pl.t.uy * 1;
                const loOut = node(A.x + ox, A.y + oy, C.lowZ);
                const hiOut = node(A.x + ox, A.y + oy, cz);
                const nodeOut = node(A.x + ox, A.y + oy, pl.zEl);
                addEdge(loOut, nodeOut, 'riser');   // descente de sortie (fond bas)
                addEdge(hiOut, nodeOut, 'riser');   // montée de sortie (fond haut)
                // 212 : entrée et sortie dans la boîte ; les bouts (mur → boîte) et le trait horizontal font partie du chemin du fil
                const inE = node(pl.E.x, pl.E.y, pl.zEl);            // point d'entrée, dans la boîte
                const inOut = node(pl.E.x + ox, pl.E.y + oy, pl.zEl); // point de sortie, dans la boîte
                addEdge(at, inE, 'stub');        // bout d'entrée (point du mur → boîte)
                addEdge(inE, inOut, 'stub');     // trait horizontal dans la boîte
                addEdge(inOut, nodeOut, 'stub'); // bout de sortie (boîte → point du mur)
                // 214 : pontage réservé aux circuits étrangers ; le circuit de la prise passe obligatoirement par ses bornes
                const cidSrv = cidOfEl(el);
                const br1 = addEdge(lo, loOut, 'stub'); if (br1) { br1.bypass = true; br1.serveCid = cidSrv; }
                const br2 = addEdge(hi, hiOut, 'stub'); if (br2) { br2.bypass = true; br2.serveCid = cidSrv; }

                // ce qui va au-delà de la prise (sens du mur) repart de la sortie, pas de l'entrée
                const moveRight = (from, to, kind) => {
                    from.adj.slice().forEach(e => {
                        if (e.dead || e.kind !== kind || !e.track) return;
                        const o = e.a === from ? e.b : e.a;
                        if ((o.x - A.x) * pl.t.ux + (o.y - A.y) * pl.t.uy <= 0.5) return;
                        from.adj.splice(from.adj.indexOf(e), 1);
                        if (e.a === from) e.a = to; else e.b = to;
                        to.adj.push(e);
                    });
                };
                moveRight(lo, loOut, 'low');
                moveRight(hi, hiOut, 'ceil');
                // 214 : montées et descentes de la prise ne servent que son propre circuit
                [at, nodeOut, loOut, hiOut, inE, inOut].forEach(n => n.adj.forEach(e => {
                    if (!e.dead && !e.bypass && !e.track) e.serveCid = cidSrv;
                }));
                const stubOut = [{ x: pl.E.x + ox, y: pl.E.y + oy, z: pl.E.z }, { x: F.x + ox, y: F.y + oy, z: pl.E.z }, { x: A.x + ox, y: A.y + oy, z: pl.E.z }];
                if (Math.abs(pl.zEl - pl.E.z) > 0.3) stubOut.push({ x: A.x + ox, y: A.y + oy, z: pl.zEl });
                return { node: at, stub, nodeOut, stubOut };
            }
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
            // le tronçon s'arrête à la face du mur visé : la piste est sur l'axe, son épaisseur ne bloque pas la liaison
            const faceEnd = (c, from) => {
                const back = ((c.e.track ? c.e.track.wall.thickness : 10) || 10) / 2 + 1;
                const dl = Math.hypot(c.px - from[0], c.py - from[1]);
                if (dl <= back) return [from[0], from[1]];
                const k = back / dl;
                return [c.px + (from[0] - c.px) * k, c.py + (from[1] - c.py) * k];
            };
            const lpath = (c) => {
                if (c.perp || Math.abs(c.px - E.x) < 0.5 || Math.abs(c.py - E.y) < 0.5) {
                    const f = faceEnd(c, [E.x, E.y]);
                    return segmentHitsWall(E.x, E.y, f[0], f[1]) ? null : [];
                }
                const opts = [[c.px, E.y], [E.x, c.py]];
                return opts.find(q => {
                    const f = faceEnd(c, q);
                    return !segmentHitsWall(E.x, E.y, q[0], q[1]) && !segmentHitsWall(q[0], q[1], f[0], f[1]);
                }) || null;
            };
            const usable = list.filter(c => c.perp).length ? list.filter(c => c.perp) : list;
            // le plafonnier se raccorde au plafond du mur le plus proche
            const zc = usable[0] ? usable[0].e.a.z : ceilZ;
            const picks = [];
            for (const c of usable) {
                if (picks.length >= C.lightLinks) break;
                if (Math.abs(c.e.a.z - zc) > 0.01) continue;   // un seul plafond par plafonnier
                if (picks.length && c.d > usable[0].d + 200) break;
                const via = lpath(c);
                if (via === null) continue;
                const hops = [E, ...(via.length ? [{ x: via[0], y: via[1] }] : []), { x: c.px, y: c.py }];
                if (hops.some((p, k) => k > 0 && holeCrosses(hops[k - 1], p, 'ceil'))) continue;   // raccord interdit dans un trou
                if (picks.some(o => Math.hypot(o.px - c.px, o.py - c.py) < 30)) continue;
                c.via = via;
                picks.push(c);
            }
            if (!picks.length) return null;
            const ln = node(E.x, E.y, zc);
            ln.light = true;
            // plafonnier au-dessus d'un mur à interrupteur : raccord direct à l'accès sous-plancher de l'interrupteur
            tracks.forEach(t => {
                const list = accessByWall.get(t.wall.id);
                if (!list) return;
                const along = (E.x - t.ox) * t.ux + (E.y - t.oy) * t.uy;
                const across = Math.abs((E.x - t.ox) * t.uy - (E.y - t.oy) * t.ux);
                if (along < 0 || along > t.len || across > (t.wall.thickness || 10) / 2 + 0.5) return;
                list.forEach(h => { const e = addEdge(ln, h, 'stub'); if (e) e.acc = true; });
            });
            picks.forEach(c => {
                let nd;
                if (c.u * c.e.len < 1) nd = c.e.a;
                else if ((1 - c.u) * c.e.len < 1) nd = c.e.b;
                else {
                    nd = node(c.px, c.py, zc);
                    c.e.dead = true;
                    // 182 : chaque morceau scindé garde la piste et son propre milieu le long du mur
                    const dS = c.e.track;
                    const sP = p => (p.x - dS.ox) * dS.ux + (p.y - dS.oy) * dS.uy;
                    const e1 = addEdge(c.e.a, nd, 'ceil'), e2 = addEdge(nd, c.e.b, 'ceil');
                    if (dS) [[e1, c.e.a], [e2, c.e.b]].forEach(([x, o]) => { if (x) { x.track = dS; x.sMid = (sP(o) + sP(nd)) / 2; } });
                }

                // 181 : le pied du raccord du plafonnier coupe le mur pour le circuit de ce plafonnier
                const dtL = c.e.track;
                if (dtL && cidOfEl(el)) {
                    const sL = (nd.x - dtL.ox) * dtL.ux + (nd.y - dtL.oy) * dtL.uy;
                    if (sL > 0 && sL < dtL.len) {
                        dtL.limits.push({ s: sL, ref: 'L:' + el.id, own: cidOfEl(el) });
                        dtL.boundsBy = new Map();
                    }
                }
                // pied au milieu d'un mur : descente le long du mur, pour que le plafonnier rejoigne le sous-plancher.
                // Plafonnier au-dessus d'un mur : pas de descente ; il ne rejoint le sous-plancher que par l'accès d'un interrupteur de ce mur
                const dt = c.e.track;
                // 185 : le pied du raccord coupe tous les morceaux bas et hauts du mur qu'il franchit
                if (dt) {
                    const sOfN = p => (p.x - dt.ox) * dt.ux + (p.y - dt.oy) * dt.uy;
                    const sF = sOfN(nd);
                    allEdges.slice().forEach(e => {
                        if (e.dead || e.track !== dt || (e.kind !== 'low' && e.kind !== 'ceil')) return;
                        const sa = sOfN(e.a), sb = sOfN(e.b);
                        if (sF <= Math.min(sa, sb) + 0.5 || sF >= Math.max(sa, sb) - 0.5) return;
                        const nw = node(nd.x, nd.y, e.a.z);
                        e.dead = true;
                        [addEdge(e.a, nw, e.kind), addEdge(nw, e.b, e.kind)].forEach((x, i) => {
                            if (x) { x.track = dt; x.sMid = (sOfN(i ? e.b : e.a) + sF) / 2; }
                        });
                    });
                }
                const aboveWall = dt && Math.abs((E.x - dt.ox) * dt.uy - (E.y - dt.oy) * dt.ux) <= (dt.wall.thickness || 10) / 2 + 0.5;
                if (dt && !aboveWall) {
                    const sd = (nd.x - dt.ox) * dt.ux + (nd.y - dt.oy) * dt.uy;
                    // 189 : la descente au pied d'un plafonnier est un tronçon à part, avec sa propre clé
                    const rl = (sd >= 0 && sd <= dt.len && !blockedV(dt.wall.id, sd, C.lowZ, zc, dt.side) && !holeCrosses(nd, nd, 'riser')) ? addEdge(nd, node(nd.x, nd.y, C.lowZ), 'riser') : null;
                    if (rl) rl.foot = dt.wall.id + '|R:' + el.id;
                }
                // 190 : le raccord du plafonnier est une ligne droite (un tronçon) ; un coude dans le raccord en fait deux
                const sk = dt ? dt.wall.id + '|S:' + el.id : null;
                if (c.via.length) {
                    // point de coude du raccord (défini ici, utilisé juste après)
                    const mn = node(c.via[0], c.via[1], zc);
                    const s1 = addEdge(ln, mn, 'stub'), s2 = addEdge(mn, nd, 'stub');
                    if (s1 && sk) s1.stubKey = sk + '|1';
                    if (s2 && sk) s2.stubKey = sk + '|2';
                } else {
                    const s0 = addEdge(ln, nd, 'stub');
                    if (s0 && sk) s0.stubKey = sk;
                }
            });
            const stub = [E];
            if (Math.abs(zc - E.z) > 0.3) stub.push({ x: E.x, y: E.y, z: zc });
            return { node: ln, stub };
        }
        return null;
    };
    // Interrupteur sur mur : accès direct au sous-plancher de chaque côté du mur (5 cm hors de la face)
    const accessByWall = new Map();
    allEls.forEach(el => {
        const pl = place.get(el.id);
        if (!pl || pl.free || !String(el.type).startsWith('switch')) return;
        const t = pl.t, off = (t.wall.thickness || 10) / 2 + 5;
        const A = P(t, pl.r);
        const list = accessByWall.get(t.wall.id) || [];
        [-1, 1].forEach(sg => {
            const ax = A.x - t.uy * off * sg, ay = A.y + t.ux * off * sg;
            const lo = node(ax, ay, C.lowZ), hi = node(ax, ay, t.ceilZ);
            const r = addEdge(lo, hi, 'riser');
            if (r) r.acc = true;
            list.push(hi);
        });
        accessByWall.set(t.wall.id, list);
    });
    const R = new Map();
    allEls.forEach(el => R.set(el.id, resolve(el)));
    // 228 : prises posées à la même hauteur sur un même mur, d'un même circuit : un passage horizontal à leur hauteur
    // les relie directement (sans descendre au bas du mur ni monter au plafond). Réservé à ce circuit.
    const socketRows = new Map();
    const skPassages = [];   // 229 : passages à hauteur de prise (pour « murs bas » / « murs haut » sur leur tronçon de mur)
    allEls.forEach(el => {
        const r = R.get(el.id), pl = place.get(el.id);
        if (!r || !pl || !pl.t || !pl.cid || pl.free || !r.node || !String(el.type).startsWith('outlet')) return;
        if (r.node.z - C.lowZ < 1 || pl.t.ceilZ - r.node.z < 1) return;   // déjà reliée au bas ou au plafond
        const key = [pl.t.wall.id, pl.t.side, el.side === -1 ? -1 : 1, Math.round(r.node.z), pl.cid].join('|');
        if (!socketRows.has(key)) socketRows.set(key, []);
        socketRows.get(key).push({ s: pl.r, t: pl.t, node: r.node, cid: pl.cid, id: el.id });
    });
    socketRows.forEach(list => {
        list.sort((p, q) => p.s - q.s);
        for (let k = 0; k + 1 < list.length; k++) {
            const a = list[k], b = list[k + 1];
            if (b.s - a.s < 0.5 || a.node === b.node) continue;
            if (blockedH(a.t.wall.id, a.s, b.s, a.node.z, a.t.side)) continue;   // pas à travers une porte ou une fenêtre
            if (holeCrosses(a.node, b.node, 'low')) continue;                    // pas à travers un escalier
            const e = addEdge(a.node, b.node, 'stub');
            if (e) {
                e.serveCid = a.cid; e.skKey = 'sk:' + [a.id, b.id].sort().join('~');   // 229 : réglable comme un tronçon
                e.skWall = a.t.wall.id; e.skSide = a.t.side; e.skS0 = a.s; e.skS1 = b.s;
                e.skA = a.node; e.skB = b.node; e.skCeilZ = a.t.ceilZ;
                skPassages.push(e);
            }
        }
    });
    const unresolved = wired.filter(el => !R.get(el.id));
    if (!R.get(panel.id)) { wired.forEach(el => lostFor(cidOfEl(el))); return result; }
    unresolved.forEach(el => lostFor(cidOfEl(el)));
    // Hauteurs des plafonds des murs : base des liaisons de cavité (faux plafond : risers vers le plan au-dessus)
    const ceilHeights = tracks.map(t => t.ceilZ);
    const ceilNodes = [...nodes.values()].filter(n => ceilHeights.some(z => Math.abs(n.z - z) < 0.01));
    // faux plafond : 10 cm au-dessus du plafond du plan, donc au-dessus des murs.
    // Liaisons de cavité (pair + cav) : seule la cavité choisie par le circuit les emprunte (voir edgeAllowed).
    const fpZ = levelCeilingOf(activeLevelId) + 10;
    const fpNodes = ceilNodes.map(n => {
        const f = node(n.x, n.y, fpZ);
        addEdge(n, f, 'riser');
        f.lightAnchor = !!n.light;
        // 119 : clés des tronçons de mur posés sous ce point (pour savoir s'il est au-dessus d'un mur en faux plafond)
        f.wallEdges = n.adj.filter(e => e.kind === 'ceil' && e.track);
        f.ceilNode = n;   // point du plafond d'origine : pour retrouver les tronçons de mur qui partent de ce point
        return f;
    });
    for (let i = 0; i < fpNodes.length; i++) {
        for (let j = i + 1; j < fpNodes.length; j++) {
            const a = fpNodes[i], b = fpNodes[j];
            if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) continue;
            if (!airClear(a, b)) continue;
            const e = addEdge(a, b, 'air');
            if (e) { e.pair = true; e.cav = 'faux_plafond'; }
        }
    }

    // sous-plancher : 10 cm sous le sol, tranchée recouverte de béton. Mêmes liaisons de cavité que le faux plafond,
    // mais les murs reposent sur la dalle : seuls les escaliers coupent la tranchée.
    const SP_Z = -10;
    // Seuls les points à hauteur des prises descendent au sous-plancher : un plafonnier ne descend jamais droit au sol.
    const spNodes = [...nodes.values()].filter(n => Math.abs(n.z - C.lowZ) < 0.01).map(n => {
        const s = node(n.x, n.y, SP_Z);
        addEdge(n, s, 'riser');
        // 161 : murs posés au-dessus de ce point (pour savoir s'il est sous un mur réglé « sous plancher »)
        s.wallEdges = n.adj.filter(e => e.kind === 'low' && e.track);
        s.lowNode = n;
        return s;
    });
    const stairRects = stairsOn(activeLevelId).map(stairRect);
    for (let i = 0; i < spNodes.length; i++) {
        for (let j = i + 1; j < spNodes.length; j++) {
            const a = spNodes[i], b = spNodes[j];
            if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) continue;
            if (stairRects.some(r => segmentHitsRect(a, b, r))) continue;
            const e = addEdge(a, b, 'sp');
            if (e) { e.pair = true; e.cav = 'sous_plancher'; }
        }
    }

    // 229 : passage à hauteur de prise réglé « faux plafond » ou « sous plancher » : le point du plafond et celui du sol
    // au-dessus ou dessous de chaque prise sont rattachés à ce passage, comme un tronçon de mur réglé
    const fpByCeil = new Map(fpNodes.map(f => [f.ceilNode, f]));
    const spByLow = new Map(spNodes.map(s => [s.lowNode, s]));
    const riserEnd = (n, z) => (n.adj || []).filter(x => x.kind === 'riser').map(x => x.a === n ? x.b : x.a).find(m => Math.abs(m.z - z) < 0.01);
    skPassages.forEach(p => {
        [p.skA, p.skB].forEach(n => {
            const f = fpByCeil.get(riserEnd(n, p.skCeilZ));
            const d = spByLow.get(riserEnd(n, C.lowZ));
            if (f) (f.skPass = f.skPass || []).push(p);
            if (d) (d.skPass = d.skPass || []).push(p);
        });
    });

    // 167-168 : passages possibles de chaque section de mur. « Murs bas » et « Murs haut » sont bloqués par une porte,
    // une fenêtre ou un escalier. « Faux plafond » et « Sous plancher » ne sont bloqués que par un escalier.
    // 167-168 (175) : passages possibles de chaque section de mur, pour un circuit (ses propres limites)
    result.levelsFor = cid => {
        const levels = {};
        tracks.forEach(t => {
            const B = boundsFor(t, cid);
            const exempt = wallExempt.has(t.wall.id + '|1') || wallExempt.has(t.wall.id + '|-1');
            for (let i = 0; i + 1 < B.length; i++) {
                const s0 = B[i].s, s1 = B[i + 1].s;
                if (s1 - s0 < 0.5) continue;
                const key = bayKeyFromBounds(t, B, i);
                const p0 = P(t, s0), p1 = P(t, s1);
                const ok = {};
                ['low', 'ceil'].forEach(kind => {
                    const z = kind === 'low' ? C.lowZ : t.ceilZ;
                    ok[kind] = !blockedH(t.wall.id, s0, s1, z, t.side) && (exempt || !holeCrosses(p0, p1, kind));
                });
                ok.air = ok.sp = !stairRects.some(R => segmentHitsRect(p0, p1, R));
                levels[key] = ok;
                // 188 : morceau au plafond d'un plafonnier : même passage, clé distincte
                if (B[i].ref.startsWith('L:') || B[i + 1].ref.startsWith('L:')) levels[key + '@c'] = ok;
            }
        });
        // 191 : chaque raccord de plafonnier (clé « |S: ») n'accepte que « faux plafond »
        allEdges.forEach(e => { if (!e.dead && e.kind === 'stub' && e.stubKey) levels[e.stubKey] = { air: true, low: false, ceil: false, sp: false }; });
        // 229 : passage à hauteur de prise : « murs bas » ou « murs haut » l'interdisent (le câble passe alors par le mur)
        allEdges.forEach(e => { if (!e.dead && e.skKey) levels[e.skKey] = { low: true, ceil: true, air: true, sp: true }; });
        return levels;
    };

    yield;
    // 9. Plus courts chemins (Dijkstra, un passage par un plafonnier n'est jamais un raccourci)
    // route d'une liaison : mode du circuit (auto ou faux plafond / sous plancher) et cavité choisie
    const cutsCache = new Map();
    const cutsOf = c => {
        if (!c) return null;
        if (!cutsCache.has(c.id)) cutsCache.set(c.id, effectiveCutsOf(c));
        return cutsCache.get(c.id);
    };
    const routeFor = (A, B, cid) => {
        const c = cid ? projectData.circuits.find(x => x.id === cid) : null;
        const routing = c ? cableRoutingOf(c) : null;
        const cavity = c && c.cavity === 'sous_plancher' ? 'sous_plancher' : 'faux_plafond';
        let mode = 'walls';
        if (routing === 'auto') mode = 'mix';
        else if (routing === 'air') mode = 'air';
        // 117 : le vide au plafond n'est permis qu'aux liaisons qui touchent un plafonnier ou un spot
        return { mode, cavity, cid: cid || '', cuts: cutsOf(c),
            lightEnd: !!((A && isControlledLoad(A)) || (B && isControlledLoad(B))) };
    };
    const mapCaches = new Map();
    // Dijkstra sur tableaux indexés (B2) : même tas, mêmes relaxations dans le même ordre => mêmes distances et chemins
    const nodeCount = nodes.size;
    let nodeIdx = 0;
    nodes.forEach(n => { n.idx = nodeIdx++; });
    
    // 119 (faux plafond par mur) : un point du vide est « au-dessus d'un mur en faux plafond » si l'un des murs
    // qui le surplombent est réglé « air » pour ce circuit
    // mémos : une liaison garde les mêmes réglages (objet cuts, stable par circuit) pendant un calcul ; indexé par cuts + cid
    const NO_CUTS = {};
    const routeMemos = new WeakMap();
    const memoOf = (route, name) => {
        const cuts = route.cuts || NO_CUTS;
        if (!routeMemos.has(cuts)) routeMemos.set(cuts, new Map());
        const byCuts = routeMemos.get(cuts);
        const k = name + '|' + (route.cid || '');
        if (!byCuts.has(k)) byCuts.set(k, new Map());
        return byCuts.get(k);
    };
    const wallKeysAt = (n, route) => {
        const memo = memoOf(route, 'wallKeys');
        if (!memo.has(n)) memo.set(n, (n.wallEdges || []).map(x => keyOfEdge(x, route.cid)).filter(Boolean));
        return memo.get(n);
    };
    const skAt = (n, route, lvl) => !!route.cuts && (n.skPass || []).some(p => route.cuts[p.skKey] === lvl);   // 229
    const airAt = (n, route) => {
        if (!route.cuts) return false;
        const memo = memoOf(route, 'air');
        if (!memo.has(n)) memo.set(n, wallKeysAt(n, route).some(k => route.cuts[k] === 'air') || skAt(n, route, 'air'));
        return memo.get(n);
    };
    const spAt = (n, route) => {
        if (!route.cuts) return false;
        const memo = memoOf(route, 'sp');
        if (!memo.has(n)) memo.set(n, wallKeysAt(n, route).some(k => route.cuts[k] === 'sp') || skAt(n, route, 'sp'));
        return memo.get(n);
    };

    // 161 : murs posés sous ou au-dessus du morceau lui-même (dans son sens), pas seulement à ses extrémités
    const spanKeysOf = (e, cid) => {
        if (!e.spanBy) e.spanBy = new Map();
        const memo = e.spanBy.get(cid || '');
        if (memo) return memo;
        const kind = e.cav === 'faux_plafond' ? 'ceil' : 'low';
        const keys = new Set();
        [[e.a, e.b], [e.b, e.a]].forEach(([f, o]) => {
            const n = f.ceilNode || f.lowNode;
            if (!n) return;
            (n.adj || []).forEach(x => {
                if (x.kind !== kind || !x.track) return;
                const p = x.a === n ? x.b : x.a;
                if ((p.x - n.x) * (o.x - n.x) + (p.y - n.y) * (o.y - n.y) > 0) {
                    const k = keyOfEdge(x, cid);
                    if (k) keys.add(k);
                }
            });
        });
        const out = [...keys];
        e.spanBy.set(cid || '', out);
        return out;
    };

    // 175c : vrai si les deux extrémités d'une liaison de cavité sont sur l'axe d'un même mur (morceau le long du mur)
    const alongWallOf = e => {
        if (e.alongWall !== undefined) return e.alongWall;
        e.alongWall = tracks.some(t => [e.a, e.b].every(n => {
            const s = (n.x - t.ox) * t.ux + (n.y - t.oy) * t.uy;
            const d = Math.abs((n.x - t.ox) * t.uy - (n.y - t.oy) * t.ux);
            return d < 0.5 && s >= -0.5 && s <= t.len + 0.5;
        }));
        return e.alongWall;
    };

    // 191 : un raccord réglé « faux plafond » rejoint le réseau du plafond à son pied (le point du plafond du mur)
    const airStubAt = (n, route) => {
        const m = n.ceilNode || n;
        return !!route.cuts && (m.adj || []).some(x => x.kind === 'stub' && x.stubKey && route.cuts[x.stubKey] === 'air');
    };

    // 192 : ensemble des points reliés au plafonnier par des raccords réglés « faux plafond » (ce raccord seulement)
    const raccordOf = (n, route) => {
        const memo = memoOf(route, 'raccord');
        if (memo.has(n)) return memo.get(n);
        const seen = new Set([n]);
        if (route.cuts) {
            const todo = [n];
            while (todo.length) {
                const m = todo.pop();
                (m.adj || []).forEach(x => {
                    if (x.kind !== 'stub' || !x.stubKey || route.cuts[x.stubKey] !== 'air') return;
                    const o = x.a === m ? x.b : x.a;
                    if (!seen.has(o)) { seen.add(o); todo.push(o); }
                });
            }
        }
        memo.set(n, seen);
        return seen;
    };

    // une arête est-elle permise pour ce mode de route ?
    const edgeAllowed = (e, route) => {// 214 : un autre circuit n'entre pas dans la boîte ; le circuit de la prise ne contourne pas ses bornes
        if (e.serveCid && !e.bypass && route.cid && e.serveCid !== route.cid) return false;
        if (e.bypass && route.cid && route.cid === e.serveCid) return false;
        // 229 : passage à hauteur de prise réglé « murs bas » ou « murs haut » : interdit, le câble passe par le mur
        if (e.skKey && route.cuts && ['low', 'ceil', 'air', 'sp'].includes(route.cuts[e.skKey])) return false;
        // « murs bas » : le câble entre les deux prises longe le bas du mur (pas le haut), et inversement pour « murs haut »
        if (route.cuts && (e.kind === 'low' || e.kind === 'ceil') && e.track && skPassages.some(p => {
            const c = route.cuts[p.skKey];
            const bad = c === 'low' || c === 'ceil' ? (c !== e.kind) : (c === 'air' || c === 'sp');
            return bad && p.skWall === e.track.wall.id && p.skSide === e.track.side && e.sMid > p.skS0 && e.sMid < p.skS1;
        })) return false;
        // liaison de cavité : seulement dans la cavité du circuit, jamais en « murs » ; en Auto seulement pour un pontage
        // 116 : le vide au-dessus du plafond est commun à tous les circuits. En mode faux plafond / sous-plancher, le câble
        // y circule pour rejoindre son point de descente (mur ou sous-plancher), quelle que soit la cavité choisie.
        if (e.pair) {
            // 161 : pas de repli d'une cavité vers l'autre au-dessus ou sous un mur réglé
            // 161 : refusé seulement si le morceau passe réellement sous un mur de l'autre type (un coin commun reste permis)
            if (route.cuts && e.cav === 'faux_plafond' && spanKeysOf(e, route.cid).some(k => route.cuts[k] === 'sp')) return false;
            if (route.cuts && e.cav === 'sous_plancher' && spanKeysOf(e, route.cid).some(k => route.cuts[k] === 'air')) return false;
            // 119 : en Auto, le faux plafond ne sert qu'entre deux points au-dessus d'un mur réglé « faux plafond »
            if (e.cav === 'faux_plafond' && route.mode === 'mix') {
                // 180 : une extrémité libre (plafonnier, spot, sans mur) est permise si l'autre est sur un mur réglé « faux plafond »
                const free = n => !(n.wallEdges && n.wallEdges.length);
                const ok = n => airAt(n, route) || free(n) || airStubAt(n, route);
                // 192 : un raccord « faux plafond » ne relie son plafonnier qu'à son propre pied de mur
                const ca = e.a.ceilNode || e.a, cb = e.b.ceilNode || e.b;
                const sameRaccord = raccordOf(ca, route).has(cb);
                return ok(e.a) && ok(e.b) && (airAt(e.a, route) || airAt(e.b, route) || (sameRaccord && (airStubAt(e.a, route) || airStubAt(e.b, route))));
            }
            // 229 : passage à hauteur de prise réglé « sous plancher » : ses deux points de sol se rejoignent
            if (e.cav === 'sous_plancher' && skAt(e.a, route, 'sp') && skAt(e.b, route, 'sp')) return true;
            // 165 : en Auto, le sous-plancher ne passe que sous des murs réglés « Sous plancher » (pas de pontage libre)
            if (e.cav === 'sous_plancher' && route.mode === 'mix') {
                const keys = spanKeysOf(e, route.cid);
                // 177 : passe sous les murs en Auto ou « sous plancher » ; refusé seulement sous un mur réglé autrement
                return keys.length > 0 && !!route.cuts && keys.some(k => route.cuts[k] === 'sp') && keys.every(k => [undefined, null, 'auto', 'sp'].includes(route.cuts[k]));
            }
            // 194 : en « murs », seul le passage dans le vide au-dessus d'un tronçon réglé « faux plafond » est permis
            // 196 : en « murs », le vide est permis au-dessus d'un tronçon réglé « faux plafond », et entre un plafonnier et le pied de son propre raccord « faux plafond »
            if (route.mode === 'walls') {
                if (!route.cuts || e.cav !== 'faux_plafond') return false;
                const ca = e.a.ceilNode || e.a, cb = e.b.ceilNode || e.b;
                return (airAt(e.a, route) && airAt(e.b, route)) || raccordOf(ca, route).has(cb);
            }
            // 161 : sous-plancher réglé mur par mur : passe sous les murs réglés « sous plancher »
            if (e.cav === 'sous_plancher' && spAt(e.a, route) && spAt(e.b, route)) return true;
            // 117 : le vide au plafond n'est emprunté que par une liaison qui touche un plafonnier ou un spot
            // 118 : un circuit en cavité faux plafond garde son trajet ; un circuit en sous-plancher n'utilise le vide que près d'un plafonnier
            if (route.mode === 'air' && e.cav === 'faux_plafond') return route.cavity === 'faux_plafond' || !!route.lightEnd;
            return route.cavity === e.cav && (route.mode === 'air' || mixJumpOk(e, route));
        }
        // accès sous-plancher de l'interrupteur : seulement pour un câble qui part au sous-plancher
        if (e.acc) return route.mode !== 'walls' && route.cavity === 'sous_plancher';
        // descente verticale : toujours permise
        if (e.kind === 'riser') return true;
        // 199 : une liaison garde le raccord de plafonnier qu'elle utilisait ; les autres raccords restent libres pour les autres liaisons
        if (route.pin && e.kind === 'stub' && e.stubKey && (e.a === route.pin.node || e.b === route.pin.node) && e.stubKey.replace(/\|[12]$/, '') !== route.pin.base) return false;
        // réglage du tronçon de mur : « low » ou « ceil » = seulement ce niveau, « air » = pas de mur ici
        // 191 : un raccord de plafonnier a son propre réglage (sa clé de raccord)
        const ek = route.cuts ? (e.kind === 'stub' && e.stubKey ? e.stubKey : keyOfEdge(e, route.cid)) : null;
        const cut = ek ? route.cuts[ek] : undefined;
                // 230 : un passage entre prises réglé dans cette travée décide seul : le réglage mémorisé (SECTION_PINS) du tronçon de mur ne s'y applique plus
        const passageDecides = !!route.cuts && (e.kind === 'low' || e.kind === 'ceil') && !!e.track && skPassages.some(p => {
            return !!route.cuts[p.skKey] && p.skWall === e.track.wall.id && p.skSide === e.track.side && e.sMid > p.skS0 && e.sMid < p.skS1;
        });
        if (cut && !passageDecides && (e.kind === 'low' || e.kind === 'ceil')) {
            if (cut === 'air' || cut === 'sp') return false;   // 161 : sous plancher réglé : pas de mur ici
            if (cut === 'low' || cut === 'ceil') return e.kind === cut;
        }
        // 191 : raccord réglé « faux plafond » : il ne longe plus le plafond, le câble emprunte le vide au-dessus du mur
        if (cut === 'air' && e.kind === 'stub') return false;

        // « faux plafond / sous plancher » : aucune horizontale, sauf le raccord du plafonnier à son mur (coudes compris)
        if (route.mode === 'air') return e.kind === 'stub';
        return true;
    };

    const routeKeyOf = route => route.mode + '|' + (route.cavity || '') + '|' + (route.lightEnd ? 'L' : '') + '|c' + (route.cid || '') + '|' + (route.cuts ? route.cid : '') + (route.pin ? '|pin' + route.pin.node.idx + ':' + route.pin.base : '');
    const mapFor = (src, route, target) => {
        // 117 : une liaison avec plafonnier et une liaison sans plafonnier ne partagent pas leur cache
        const key = routeKeyOf(route);
        if (!mapCaches.has(key)) mapCaches.set(key, new Map());
        const cache = mapCaches.get(key);
        // 215 : la recherche reprend là où elle s'était arrêtée ; avec une cible, elle s'arrête dès que la cible est réglée
        let st = cache.get(src);
        if (!st) {
            st = { D: new Float64Array(nodeCount).fill(Infinity), P: new Array(nodeCount).fill(null), settled: new Uint8Array(nodeCount), heap: new MinHeap() };
            st.D[src.idx] = 0;
            st.heap.push(0, src);
            cache.set(src, st);
        }
        const { D, P, settled, heap } = st;
        while (heap.size) {
            if (target && settled[target.idx]) break;
            const [d, n] = heap.pop();
            if (d > D[n.idx] || settled[n.idx]) continue;
            settled[n.idx] = 1;
            if ((n.light || n.socketTerm) && n !== src) continue;
            for (const e of n.adj) {
                if (e.dead) continue;
                if (!cache.allow) cache.allow = new Uint8Array(allEdges.length);   // 0 = inconnu, 1 = permis, 2 = interdit
                let ok = e.idx < cache.allow.length ? cache.allow[e.idx] : 0;
                if (ok === 0) {
                    ok = edgeAllowed(e, route) ? 1 : 2;
                    if (e.idx < cache.allow.length) cache.allow[e.idx] = ok;
                }
                if (ok === 2) continue;
                const o = e.a === n ? e.b : e.a;
                // 122 : un plafond non réglé coûte deux fois sa longueur : le câble ne change de hauteur qu'aux limites
                // d'une section réglée « murs haut », pas au point le plus proche du tableau
                const ceilKey = e.kind === 'ceil' && route.cuts ? keyOfEdge(e, route.cid) : null;
                const ceilExtra = e.kind === 'ceil' && !(ceilKey && route.cuts[ceilKey] === 'ceil') ? e.len * C.ceilFreeFactor : 0;
                const nd = d + e.cost + ceilExtra;
                if (nd < D[o.idx]) {
                    D[o.idx] = nd;
                    P[o.idx] = [n, e];
                    heap.push(nd, o);
                }
            }
        }
        return {
            dist: {
                get: (n) => { const v = D[n.idx]; return v === Infinity ? undefined : v; },
                has: (n) => D[n.idx] !== Infinity
            },
            prev: { get: (n) => P[n.idx] || undefined }
        };
    };

    // saut Auto (pontage) : permis seulement si les deux extrémités ne se relient pas par les murs.
    // Trajet par les murs d'abord.
    // Composantes des murs seuls (sans liaisons de cavité), calculées une fois. Un nœud relié à un plafonnier
    // (light) ne se traverse pas : ces cas passent par mapFor.
    let wallFind = null;
    const wallRoot = n => {
        if (!wallFind) {
            const parent = Int32Array.from({ length: nodeCount }, (_, i) => i);
            const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
            allEdges.forEach(e => {
                if (e.dead || e.pair || e.a.light || e.b.light) return;
                parent[find(e.a.idx)] = find(e.b.idx);
            });
            wallFind = find;
        }
        return wallFind(n.idx);
    };
    const mixJumpOk = (e, route) => {
        // circuit avec réglages de tronçons : on recalcule les murs avec ces réglages (pas de mémo global)
        if (route && route.cuts) {
            return mapFor(e.a, { mode: 'walls', cuts: route.cuts, cid: route.cid, lightEnd: false }, e.b).dist.get(e.b) === undefined;
        }
        if (e.mixOk === undefined) {
            e.mixOk = (e.a.lightAnchor || e.b.lightAnchor)
                ? mapFor(e.a, { mode: 'walls' }, e.b).dist.get(e.b) === undefined
                : wallRoot(e.a) !== wallRoot(e.b);
        }
        return e.mixOk;
    };

    // Auto, par liaison : si les deux appareils se relient par les murs, la liaison reste sur les murs (bas ou haut) ;
    // sinon elle peut faire un pontage au faux plafond ou au sous-plancher du circuit.
    const liaisonRoute = (srcNode, dstNode, route) => {
        // 121 : un circuit qui a un réglage « faux plafond » garde le mode Auto complet, sinon le vide serait interdit
        // dès que les murs relient les deux appareils par un long détour
            // 194 : un réglage « faux plafond » ne fait plus passer toutes les liaisons en mix : seul le tronçon réglé passe dans le vide
    if (route.mode !== 'mix' || (route.cuts && Object.values(route.cuts).some(v => v === 'sp'))) return route;
        const walls = Object.assign({}, route, { mode: 'walls' });
        return mapFor(srcNode, walls, dstNode).dist.get(dstNode) !== undefined ? walls : route;
    };

    const rdist = (A, B, cid) => {
        const ra = R.get(A.id), rb = R.get(B.id);
        if (!ra || !rb) return Infinity;
        const stubs = stubLen(ra.stub) + stubLen(rb.stub);
        if (ra.node === rb.node) return stubs;
        const d = mapFor(ra.node, liaisonRoute(ra.node, rb.node, routeFor(A, B, cid)), rb.node).dist.get(rb.node);
        return d === undefined ? Infinity : d + stubs;
    };

    yield;
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
    for (const sw of switches) {
        yield;
        if (!Array.isArray(sw.controlledLightIds)) continue;
        manuallyConfigured.add(sw.id);
        for (const id of sw.controlledLightIds) {
            const light = lights.find(candidate => candidate.id === id || candidate.id === 'xl|' + id);
            if (light && canControl(sw, light) && isFinite(rdist(sw, light, lightCid(light)))) {
                // E1 : une commande ne se lie qu'à des lampes de son propre circuit ; les autres sont refusées et signalées
                if (ctrl.get(sw.id).length && lightCid(ctrl.get(sw.id)[0]) !== lightCid(light)) {
                    warnAt('Commande de ' + warnName(light) + ' : lampe sur un autre circuit que son interrupteur, liaison refusée. Mettez-la sur le circuit de l\'interrupteur ou retirez la commande.', light.realId || light.id);
                    continue;
                }
                ctrl.get(sw.id).push(light);
                taken.add(light.id);
            }
        }
    }

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

    // 236 : interrupteurs posés à même hauteur sur un même mur, d'un même circuit : passage horizontal entre eux (comme les prises)
    {
        const swRows = new Map();
        switches.forEach(sw => {
            const r = R.get(sw.id), pl = place.get(sw.id);
            if (!r || !pl || !pl.t || pl.free || !r.node) return;
            if (r.node.z - C.lowZ < 1 || pl.t.ceilZ - r.node.z < 1) return;   // déjà relié au bas ou au plafond
            const ls = ctrl.get(sw.id) || [];
            const c = ls.length ? circuitOf(ls[0]) : projectData.circuits.find(x => x.id === (sw.type === 'shutter_control' ? DEFAULT_CIRCUIT_BY_TYPE.shutter_motor : DEFAULT_CIRCUIT_BY_TYPE.light_ceiling));
            const cid = c ? c.id : null;
            if (!cid) return;
            const key = [pl.t.wall.id, pl.t.side, sw.side === -1 ? -1 : 1, Math.round(r.node.z), cid].join('|');
            if (!swRows.has(key)) swRows.set(key, []);
            swRows.get(key).push({ s: pl.r, t: pl.t, node: r.node, cid, id: sw.id });
        });
        swRows.forEach(list => {
            list.sort((p, q) => p.s - q.s);
            for (let k = 0; k + 1 < list.length; k++) {
                const a = list[k], b = list[k + 1];
                if (b.s - a.s < 0.5 || a.node === b.node) continue;
                if (blockedH(a.t.wall.id, a.s, b.s, a.node.z, a.t.side)) continue;
                if (holeCrosses(a.node, b.node, 'low')) continue;
                const e = addEdge(a.node, b.node, 'stub');
                if (!e) continue;
                e.serveCid = a.cid; e.skKey = 'sk:' + [a.id, b.id].sort().join('~');
                e.skWall = a.t.wall.id; e.skSide = a.t.side; e.skS0 = a.s; e.skS1 = b.s;
                e.skA = a.node; e.skB = b.node; e.skCeilZ = a.t.ceilZ;
                skPassages.push(e);
                // points du plafond et du sol au-dessus ou dessous de chaque interrupteur (comme pour les prises)
                [a.node, b.node].forEach(n => {
                    const f = fpByCeil.get(riserEnd(n, e.skCeilZ));
                    const d = spByLow.get(riserEnd(n, C.lowZ));
                    if (f) (f.skPass = f.skPass || []).push(e);
                    if (d) (d.skPass = d.skPass || []).push(e);
                });
            }
        });
    }

    // lampes commandées par un interrupteur d'un autre circuit : liaison refusée (E1 de l'audit), la lampe reste alimentée par son propre circuit
    switches.forEach(sw => {
        const ls = ctrl.get(sw.id);
        // une commande sans charge reste rattachée au circuit d'éclairage (le volet, lui, sur les prises)
        const fallbackId = sw.type === 'shutter_control' ? DEFAULT_CIRCUIT_BY_TYPE.shutter_motor : DEFAULT_CIRCUIT_BY_TYPE.light_ceiling;
        const c = ls.length ? circuitOf(ls[0]) : projectData.circuits.find(x => x.id === fallbackId);
        const cid = c ? c.id : null;
        // 120 : le tronçon vers le tableau porte aussi neutre et terre, pour que les neutres des lampes suivent le rouge jusqu'au tableau
        // 125 (E3) : commandes électroniques (variateur, détecteur, télérupteur) : phase et neutre
        const electronicCommand = ['switch_dimmer', 'motion_timer', 'switch_pushbutton'].includes(sw.type);
        let trunkWires = electronicCommand ? ['red', 'neutral'] : ['red'];
        let unitMembers = ls.filter(l => circuitIdOf(l) === cid);
        // 126 (E2) : va-et-vient à deux interrupteurs. Le premier (le plus proche du tableau) reçoit la phase, sans retour lampe ;
        // le second ne reçoit pas la phase : il est relié au premier par les deux navettes, et renvoie le retour lampe.
        if (sw.type === 'switch_va_et_vient') {
            const partner = switches.find(o => o !== sw && o.type === 'switch_va_et_vient' && ctrl.get(o.id).some(l => ls.includes(l)));
            if (partner) {
                const dSw = rdist(panel, sw, cid), dPartner = rdist(panel, partner, cid);
                const isFirst = dSw < dPartner || (dSw === dPartner && sw.id < partner.id);
                if (isFirst) unitMembers = [];
                else trunkWires = [];
            }
        }
        units.push({ cid, entry: sw, members: unitMembers, wires: trunkWires, memberWires: commandWires(sw) });
        ls.filter(l => circuitIdOf(l) !== cid).forEach(l => {
            units.push({ cid: circuitIdOf(l), entry: l, members: [], wires: std });
            warnAt('Commande de ' + warnName(l) + ' : lampe sur un autre circuit que son interrupteur, liaison refusée. Mettez-la sur le circuit de l\'interrupteur ou retirez la commande.', l.realId || l.id);
        });
    });
    lights.filter(l => !taken.has(l.id)).forEach(l => {
        const c = circuitOf(l);
        units.push({ cid: c ? c.id : null, entry: l, members: [], wires: std });
    });
    yield;
    // 11. Arbre de câblage minimal par circuit (Prim sur les distances réelles de gaine)
    const used = new Map();
    const priv = new Map();
    // un même câble ne se pose qu'une fois par tronçon : deux appareils du même circuit qui passent par ce tronçon le partagent
    const bundleSeen = new Map();
    const pushBundle = (segment, wires, cid, relationId) => {
        if (!bundleSeen.has(segment)) bundleSeen.set(segment, new Set());
        const sig = [cid, wires.slice().sort().join(','), relationId || ''].join('|');
        const seen = bundleSeen.get(segment);
        if (seen.has(sig)) return;
        seen.add(sig);
        segment.cables.push(wires);
        segment.cids.push(cid);
    };
    const addPriv = (pts, wires, cid, relationId, extraIds = []) => {
        for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.3) continue;
            const ka = key(a.x, a.y, a.z), kb = key(b.x, b.y, b.z);
            const pk = ka < kb ? ka + '~' + kb : kb + '~' + ka;
            if (!priv.has(pk)) priv.set(pk, { a, b, cables: [], cids: [], links: [] });
            const segment = priv.get(pk);
            pushBundle(segment, wires, cid, relationId);
            [relationId, ...extraIds].filter(Boolean).forEach(id => { if (!segment.links.includes(id)) segment.links.push(id); });
        }
    };

    const linkKeyOf = (cid, A, B) => (cid || '') + '|' + [A.id, B.id].sort().join('~');
    const addLink = (A, B, wires, cid, extraIds = []) => {
        const ra = R.get(A.id), rb = R.get(B.id);
        const relationId = isControl(A) && canControl(A, B)
            ? controlCableLinkId(A.id, B.id)
            : isControl(B) && canControl(B, A)
                ? controlCableLinkId(B.id, A.id)
                : null;
        const path = [];
        // 203 : une prise en sortie part de son point de sortie
        const srcNode = ra.nodeOut || ra.node;
        if (srcNode !== rb.node) {
            // 199 : la liaison garde son raccord de plafonnier mémorisé ; si ce raccord n'est plus praticable, calcul libre
            const lightNode = srcNode.light ? srcNode : (rb.node.light ? rb.node : null);
            const lk = linkKeyOf(cid, A, B);
            const base = cableLinkFeet.get(lk);
            const pinned = lightNode && base ? Object.assign({}, routeFor(A, B, cid), { pin: { node: lightNode, base } }) : null;
            let mp = mapFor(srcNode, liaisonRoute(srcNode, rb.node, pinned || routeFor(A, B, cid)), rb.node);
            if (pinned && mp.dist.get(rb.node) === undefined) mp = mapFor(srcNode, liaisonRoute(srcNode, rb.node, routeFor(A, B, cid)), rb.node);

            for (let cur = rb.node; cur !== srcNode;) {
                const [p, e] = mp.prev.get(cur);
                path.push(e);
                cur = p;
            }
            path.reverse();
            const st = lightNode && path.find(e => e.kind === 'stub' && e.stubKey && (e.a === lightNode || e.b === lightNode));
            if (st) cableLinkFeet.set(lk, st.stubKey.replace(/\|[12]$/, ''));
        }
        // étape 8, partie 1 : découpe du chemin en morceaux (calcul seul)
        if (path.length) result.morceaux.push({ circuitId: cid, from: A.id, to: B.id, parts: cutCableMorceaux(path, e => !!e.track && [0.25, 0.5, 0.75].some(f => insideBodyExcept(e.a.x + (e.b.x - e.a.x) * f, e.a.y + (e.b.y - e.a.y) * f, e.track.wall))) });
        // 127 : une liaison sans fil (ex. second va-et-vient, relié par les navettes) n'a pas de gaine
        if (wires.length) {
            addPriv(ra.stubOut || ra.stub, wires, cid, relationId, extraIds);
            addPriv(rb.stub, wires, cid, relationId, extraIds);
        }
        if (wires.length) path.forEach(e => {   // 127 : pas de tronçon tracé sans fil ; la longueur reste comptée
            if (!used.has(e)) used.set(e, { cables: [], cids: [], links: [] });
            const segment = used.get(e);
            pushBundle(segment, wires, cid, relationId);
            [relationId, ...extraIds].filter(Boolean).forEach(id => { if (!segment.links.includes(id)) segment.links.push(id); });
        });
        if (cid && path.some(e => e.pair)) result.cavityCids.add(cid);
        const length = path.reduce((acc, e) => acc + e.len, 0) + stubLen(ra.stub) + stubLen(rb.stub);
        result.linkInfo.push({ circuitId: cid, length });
        return length;
    };
    const byCircuit = new Map();
    units.forEach(u => {
        const k = u.cid || '_none';
        if (!byCircuit.has(k)) byCircuit.set(k, []);
        byCircuit.get(k).push(u);
    });
    for (const [k, list] of byCircuit) {
        yield;
        const cidOf = k === '_none' ? null : k;
        // liaisons non reliées, comptées par circuit (clé « _none » : sans circuit)
        const lostOn = n => lostFor(cidOf, n);
        const tree = [{ el: panel, deg: 0, depth: 0, free: true, boxId: null }];
        // appareils servis par chaque boîte retenue (le calcul du câblage n'en dépend pas)
        const countServed = id => { if (id) result.boxServed[id] = (result.boxServed[id] || 0) + 1; };
        const rest = list.slice();
        // boîtes de dérivation posées dans ce circuit : raccordées au tableau seulement si un appareil s'y relie
        const pending = alive.filter(el => el.type === 'junction_box' && boxCircuitId(el) === k);
        // mode étoile (F2) : chaque appareil se raccorde au tableau ou à une boîte posée (I2) ; mode chaîné : comportement actuel
        const circ = projectData.circuits.find(c => c.id === k);
        const star = !!circ && circ.wiringMode === 'star';
        // patch 155 : liaisons figées de ce circuit (mémoire de session)
        const frozen = FROZEN_LINKS.get(k) || new Map();
        FROZEN_LINKS.set(k, frozen);
        // 200 : prises en série (mode chaîné) : chaque prise se raccorde à la précédente ; boîte de dérivation seulement si la chaîne ne peut pas l'atteindre
        const serialOnly = el => !star && !!el && String(el.type).startsWith('outlet');
        let serialTail = tree[0];
        const serialCand = u => {
            const dc = rdist(serialTail.el, u.entry, cidOf);
            if (isFinite(dc)) return { d: dc, tn: serialTail, bx: null };
            let bestBox = null;
            pending.forEach(bx => {
                const d1 = rdist(serialTail.el, bx, cidOf), d2 = rdist(bx, u.entry, cidOf);
                if (isFinite(d1) && isFinite(d2) && (!bestBox || d1 + d2 < bestBox.d)) bestBox = { d: d1 + d2, tn: null, bx };
            });
            return bestBox;
        };
        while (rest.length) {
            yield;
            let best = null;
            // patch 155 : d'abord une liaison figée encore possible (le raccord est déjà dans l'arbre, rien n'a bougé)
            const frozenHit = rest.some(u => {
                const f = frozen.get(u.entry.id);
                if (!f) return false;
                const tn = tree.find(t => t.el.id === f.parent);
                if (!tn || f.key !== frozenKeyOf(u.entry, tn.el)) return false;
                if (star && !tn.free) return false;
                if (serialOnly(u.entry) && tn !== serialTail) return false;
                if (!tn.free && tn.deg >= C.maxDegree) return false;
                const d = rdist(tn.el, u.entry, cidOf);
                if (!isFinite(d)) return false;
                best = { d, ui: rest.indexOf(u), tn, bx: null };
                return true;
            });
            // sinon, recherche normale du plus proche (comme avant)
            if (!frozenHit) for (let ui = 0; ui < rest.length; ui++) {
                yield;
                const u = rest[ui];
                if (serialOnly(u.entry)) {
                    const sc = serialCand(u);
                    if (sc && (!best || sc.d < best.d)) best = { d: sc.d, ui, tn: sc.tn, bx: sc.bx };
                    continue;
                }
                for (const tn of tree) {
                    if (star && !tn.free) continue;
                    if (!tn.free && tn.deg >= C.maxDegree) continue;
                    const d = rdist(tn.el, u.entry, cidOf);
                    if (!best || d < best.d) best = { d, ui, tn, bx: null };
                }
                // une boîte pas encore raccordée coûte son trajet depuis le tableau
                for (const bx of pending) {
                    // étoile : la boîte est la plus proche de l'appareil que son tableau ; son trajet n'est compté qu'une fois
                    const dBox = rdist(bx, u.entry, cidOf);
                    const d = star ? (dBox < rdist(panel, u.entry, cidOf) ? dBox : Infinity) : rdist(panel, bx, cidOf) + dBox;
                    if (isFinite(d) && (!best || d < best.d)) best = { d, ui, tn: null, bx };
                }
            }
            if (!best || !isFinite(best.d)) { lostOn(rest.length); break; }
            if (best.bx) {
                const bx = best.bx;
                pending.splice(pending.indexOf(bx), 1);
                const srcTn = serialOnly(rest[best.ui].entry) ? serialTail : tree[0];
                const l0 = addLink(srcTn.el, bx, std, cidOf);
                if (l0 === null) continue;
                best.tn = { el: bx, deg: 0, depth: srcTn.depth + l0 + 60, free: true, boxId: bx.id };
                tree.push(best.tn);
            }
            const u = rest.splice(best.ui, 1)[0];
            const cid = u.cid;
            const len = addLink(best.tn.el, u.entry, u.wires, cid);
            if (len === null) { lostOn(1); continue; }
            // patch 155 : on retient à quel appareil cette prise est reliée
            frozen.set(u.entry.id, { parent: best.tn.el.id, key: frozenKeyOf(u.entry, best.tn.el) });
            best.tn.deg++;
            const entryNode = { el: u.entry, deg: 1, depth: best.tn.depth + len + 60, boxId: best.tn.boxId || null };
            tree.push(entryNode);
            countServed(entryNode.boxId);
            if (serialOnly(u.entry)) serialTail = entryNode;
            if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, entryNode.depth);
            // 201 : lampes commandées (mode chaîné) : retour et neutre/terre de lampe en lampe ; la première depuis l'interrupteur (retour) et le tableau (neutre/terre)
            const seq = [];
            const left = u.members.slice();
            let cur = u.entry;
            while (left.length) {
                let bi = 0, bd = Infinity;
                left.forEach((m, i) => { const d = rdist(cur, m, cid); if (isFinite(d) && d < bd) { bd = d; bi = i; } });
                cur = left[bi];
                seq.push(cur);
                left.splice(bi, 1);
            }
            const chainMembers = star ? u.members : seq;
            let prevEl = u.entry, prevSup = panel;

            chainMembers.forEach((mb, k) => {
                // 222 : chaque tronçon de la chaîne porte les liaisons de tous les luminaires situés en aval (cliquer sur un spot le met en évidence depuis l'interrupteur)
                const downIds = star ? [] : chainMembers.slice(k).filter(m => canControl(u.entry, m)).map(m => controlCableLinkId(u.entry.id, m.id));
                const l2 = addLink(star ? u.entry : prevEl, mb, u.memberWires || ret, cid, downIds);
                if (l2 === null) { lostOn(1); return; }
                // étoile : neutre et terre depuis le tableau ; chaîne (défaut) : depuis la lampe précédente
                if (addLink(star ? panel : prevSup, mb, supplyWires, cid) === null) lostOn(1);
                entryNode.deg++;
                const mn = { el: mb, deg: 1, depth: entryNode.depth + l2 + 60, boxId: entryNode.boxId };
                prevEl = mb; prevSup = mb;
                tree.push(mn);
                countServed(mn.boxId);
                if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, mn.depth);
            });
        }
    }
    yield;
    // E1 : plus de liaison de commande entre circuits (voir l'avertissement de la commande)
    // navettes : deux va-et-vient qui commandent la même lampe sont reliés par deux fils violets
    const navettePairs = new Set();
    lights.forEach(light => {
        const pair = switches.filter(sw => sw.type === 'switch_va_et_vient' && ctrl.get(sw.id).includes(light));
        for (let k = 0; k + 1 < pair.length; k++) {
            const pk = [pair[k].id, pair[k + 1].id].sort().join('~');
            if (navettePairs.has(pk)) continue;
            navettePairs.add(pk);
            if (addLink(pair[k], pair[k + 1], ['violet', 'violet'], circuitIdOf(light), [controlCableLinkId(pair[k].id, light.id), controlCableLinkId(pair[k + 1].id, light.id)]) === null) lostFor(circuitIdOf(light));
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
    const elevOf = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
    if (feedInfo && feedInfo.feed && feedInfo.shaft && R.get(panel.id)) {
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
    // niveau avec tableau : la gaine descend ou monte jusqu'à la trémie de chaque niveau relié qui n'a pas de tableau
    // (les circuits qui y passent restent visibles de ce côté). Pas de longueur ajoutée ici : elle est comptée à l'étage concerné.
    if (!feedInfo) {
        derivPts.forEach(dp => {
            const Rdp = R.get(dp.id);
            if (!Rdp) return;
            const shaftId = dp.id.slice(3);
            const shObj = (projectData.shafts || []).find(x => x.id === shaftId);
            if (!shObj) return;
            tree.forEach((step, childId) => {
                if (step.to !== activeLevelId || step.shaft !== shaftId) return;
                const E0 = Rdp.stub[0];
                const zChild = derivHeightOf(shObj, childId) + (elevOf(childId) - elevOf(activeLevelId));
                circuitsOnHop({ from: childId, to: activeLevelId, shaft: shaftId }, tree, treePanelId)
                    .forEach(cid => addPriv([E0, { x: E0.x, y: E0.y, z: zChild }], std, cid, null));
            });
        });
    }

    yield;
    // murs survolés par un morceau de faux plafond / sous plancher : tronçons de mur qui partent de ce point (pour ce circuit)
    const wallsToward = (f, other, cid) => {
        const n = f.ceilNode || f.lowNode; if (!n) return [];
        const kind = f.ceilNode ? 'ceil' : 'low';
        return (n.adj || []).filter(x => x.kind === kind && x.track).filter(x => {
            const o = x.a === n ? x.b : x.a;
            return (o.x - n.x) * (other.x - n.x) + (o.y - n.y) * (other.y - n.y) > 0;
        }).map(x => keyOfEdge(x, cid)).filter(Boolean);
    };
    // 175 : tronçon de chaque segment, pour chaque circuit qui le porte. Un morceau de mur suit les limites du circuit ;
    // un raccord, une montée ou un morceau de vide suit le tronçon de mur voisin que ce circuit emprunte
    // 189 : un raccord de plafonnier (chaîne de morceaux « stub ») suit le tronçon au plafond auquel il se rattache
    const lightStubKey = (e, cid) => {
        const seen = new Set([e]);
        const stack = [e.a, e.b];
        while (stack.length) {
            const n = stack.pop();
            for (const x of (n.adj || [])) {
                if (x.dead) continue;
                if (x.track && x.kind === 'ceil') { const k = keyOfEdge(x, cid); if (k) return k; }
                if (x.kind === 'stub' && !seen.has(x)) { seen.add(x); stack.push(x.a === n ? x.b : x.a); }
            }
        }
        return null;
    };

    const cutKeyOfUsed = (e, cid) => {
        if (e.pair) { const ks = spanKeysOf(e, cid); return ks[0] || null; }
        if (e.skKey) return e.skKey;   // 229 : passage à hauteur de prise
        if (e.kind === 'riser') return e.foot || null;   // 189 : descente d'un plafonnier = son tronçon ; montée ordinaire = aucun tronçon de mur
        if (e.kind === 'stub' && e.stubKey) return e.stubKey;   // 190 : raccord de plafonnier = son propre tronçon
        if (e.track) return keyOfEdge(e, cid);
        for (const n of [e.a, e.b]) {
            for (const x of (n.adj || [])) {
                if (x.dead || !x.track || (x.kind !== 'low' && x.kind !== 'ceil')) continue;
                const u = used.get(x);
                if (u && (u.cids || []).includes(cid)) return keyOfEdge(x, cid);
            }
        }
        return null;
    };
    used.forEach((u, e) => {
        const cids = [...new Set((u.cids || []).filter(Boolean))];
        const cutKeys = {}, wallKeysBy = {};
        cids.forEach(cid => {
            const k = cutKeyOfUsed(e, cid);
            if (k) cutKeys[cid] = k;
            if (e.kind === 'air' || e.kind === 'sp') {
                wallKeysBy[cid] = [...new Set([...wallsToward(e.a, e.b, cid), ...wallsToward(e.b, e.a, cid)])];
            }
        });
        result.segments.push({
            a: { x: e.a.x, y: e.a.y, z: e.a.z }, b: { x: e.b.x, y: e.b.y, z: e.b.z }, cables: u.cables, cids: u.cids, links: u.links,
            kind: e.kind, cutKeys, wallKeysBy
        });
    });
    priv.forEach(sg => result.segments.push(sg));
    // 123 (175) : hauteur retenue pour le prochain calcul, seulement si le tronçon est tout entier à la même hauteur
    const pinSeen = new Map();   // cid -> Map(clé -> Set(hauteurs vues))
    result.segments.forEach(sg => {
        if (sg.kind !== 'low' && sg.kind !== 'ceil') return;
        Object.keys(sg.cutKeys || {}).forEach(cid => {
            if (!pinSeen.has(cid)) pinSeen.set(cid, new Map());
            const m = pinSeen.get(cid), k = sg.cutKeys[cid];
            if (!m.has(k)) m.set(k, new Set());
            m.get(k).add(sg.kind);
        });
    });
    pinSeen.forEach((m, cid) => {
        m.forEach((kinds, k) => {
            if (kinds.size !== 1) return;
            if (!SECTION_PINS.has(cid)) SECTION_PINS.set(cid, {});
            SECTION_PINS.get(cid)[k] = [...kinds][0];
        });
    });

    yield;
    // contrôle final : tout tronçon qui traverse le volume d'un escalier est marqué (rouge) et signalé
    let stairCrossing = false;
    result.segments.forEach(sg => {
        const st = segmentCrossesStairVolume(sg.a, sg.b);
        if (!st) return;
        sg.stairHit = st.id; stairCrossing = true;
        if (!result.stairHitIds.includes(st.id)) result.stairHitIds.push(st.id);
        // appareils responsables, un par élément (sans doublon)
        const inFootprint = e => { const R = stairRect(st), b = deviceBox(e); const dx = b.x - R.cx, dy = b.y - R.cy; return Math.abs(dx * R.ux + dy * R.uy) < R.hl && Math.abs(dx * R.vx + dy * R.vy) < R.hw; };
        const addCulprit = e => { if (e && !result.stairCulprits.includes(e.id)) result.stairCulprits.push(e.id); };
        let ctlFound = false;
        // 1. câbles de commande : l'interrupteur et chaque charge commandée dont le lien passe par ce tronçon
        projectData.electrical.forEach(sw => {
            if (!isControl(sw) || sw.levelId !== activeLevelId) return;
            const loads = projectData.electrical.filter(l => l.levelId === activeLevelId && canControl(sw, l)
                && (sg.links || []).includes(controlCableLinkId(sw.id, l.id)));
            if (!loads.length) return;
            ctlFound = true;
            // extrémités du lien dans l'emprise de l'escalier (toutes désignées) ; sinon l'interrupteur
            const inside = [sw, ...loads].filter(inFootprint);
            (inside.length ? inside : [sw]).forEach(addCulprit);
        });
        // 2. câble de puissance : l'appareil du même circuit le plus proche du milieu du tronçon
        if (!ctlFound) {
            const mx = (sg.a.x + sg.b.x) / 2, my = (sg.a.y + sg.b.y) / 2;
            let best = null, bestD = Infinity;
            projectData.electrical.forEach(e => {
                if (['panel', 'junction_box'].includes(e.type) || e.levelId !== activeLevelId) return;
                if (!(sg.cids || []).includes(cidOfEl(e))) return;
                const b = deviceBox(e), d = Math.hypot(b.x - mx, b.y - my);
                if (d < bestD) { bestD = d; best = e; }
            });
            addCulprit(best);
        }
    });
    if (stairCrossing) result.warnings.push('Câble qui traverse un escalier : tronçon en rouge, à déplacer.');
    // 161 : murs réglés faux plafond / sous plancher qu'aucun câble ne traverse, sur un circuit qui a des appareils non reliés
    result.blockedCuts = {};
    projectData.circuits.forEach(c => {
        if (!c.cableCuts || !(result.unroutedBy[c.id] > 0)) return;
        const carried = new Set();
        result.segments.forEach(sg => {
            if ((sg.cids || []).includes(c.id)) ((sg.wallKeysBy && sg.wallKeysBy[c.id]) || []).forEach(k => carried.add(k));
        });
        const blocked = Object.keys(c.cableCuts).filter(k => (c.cableCuts[k] === 'air' || c.cableCuts[k] === 'sp') && !carried.has(k));
        if (blocked.length) result.blockedCuts[c.id] = blocked;
    });
    return result;
    
}

// calcul complet, d'un seul bloc (ouverture, export, tests)
function buildCableNetwork() {
    prepareCableMemory();
    const steps = buildCableNetworkSteps();
    let r = steps.next();
    while (!r.done) r = steps.next();
    return r.value;
}

// Tronçons, âmes et manchons de même matériau et même ordre de rendu fusionnés en un seul maillage :
// l'orbite ne coûte plus un appel de dessin par câble
function mergeCableParts(parts) {
    let tubeSeq = 0;
    const groups = new Map();
    parts.forEach(p => {
        p.updateMatrix();
        // 254 : une gaine reste seule (triée à chaque image) ; les autres pièces sont fusionnées par matériau
        const key = p.userData && p.userData.conduit ? 'tube|' + (tubeSeq++) : p.material.uuid + '|' + p.renderOrder;
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
        if (list[0].userData && list[0].userData.conduit) { mesh.userData = list[0].userData; conduitMeshes3D.push(mesh); }
    });
}

// 254 : gaines translucides, une pièce par tronçon, triées à chaque image de la plus lointaine à la plus proche
let conduitMeshes3D = [];
function sortConduits3D() {
    if (!threeCamera || !conduitMeshes3D.length) return;
    const cam = threeCamera.position;
    const dist = m => {
        const a = m.userData.a, ab = new THREE.Vector3().subVectors(m.userData.b, m.userData.a);
        const L2 = ab.lengthSq();
        const u = L2 > 1e-9 ? Math.max(0, Math.min(1, new THREE.Vector3().subVectors(cam, a).dot(ab) / L2)) : 0;
        return new THREE.Vector3().copy(a).addScaledVector(ab, u).distanceTo(cam);
    };
    const list = conduitMeshes3D.map(m => ({ m, d: dist(m) }));
    list.sort((x, y) => y.d - x.d);   // le plus lointain d'abord
    const n = Math.max(1, list.length);
    list.forEach((e, i) => { e.m.renderOrder = e.m.userData.base + 0.5 * (i / n); });
}

// Rendu fantôme (patch 20) : options lues par renderCableNetwork ; null pour l'étage affiché
let cableGhostOpts = null;

// Gaine fantôme : pleine (non translucide), à la couleur de son circuit, grise sans circuit
function ghostConduitMat(cid) {
    let hex = '#0ea5e9';
    if (typeof cid === 'string' && cid.startsWith('ctl:')) hex = cid.slice(4);
    else {
        const c = cid ? projectData.circuits.find(x => x.id === cid) : null;
        if (c) hex = circuitColor(c);
    }
    CABLE_RES.ghostMats = CABLE_RES.ghostMats || {};
    return CABLE_RES.ghostMats[hex] || (CABLE_RES.ghostMats[hex] = markShared(new THREE.MeshBasicMaterial({ color: hex })));
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

// 176 : axes réellement dessinés des tubes du circuit réglé (décalés de leur groupe), rafraîchis à chaque rendu
let cableTubes3D = [];

function renderCableNetwork(cx, cy) {
    const G = cableGhostOpts;   // rendu fantôme (patch 20) ou null pour l'étage affiché
    if (!G) conduitMeshes3D = [];   // 254
    // circuits mis en évidence : le circuit sélectionné, sinon ceux qui traversent la trémie sélectionnée (patch 24)
    
    const BOX = G ? (G.box || null) : shaftBoxSel();
    const FOC = G ? (G.focusIds || null) : focusCircuitSet();
    const net = G ? G.net : getCableNetwork();
    if (!G) updateCircuitsUI();

    if (!showCables2D) return;   // câbles masqués (réglage commun avec la 2D)
    if (!G && net.unrouted > 0) {
        console.warn(net.unrouted + ' liaison(s) non routée(s)');
        showNotification(net.unrouted + ' appareil(s) n\'ont pas pu être reliés au tableau', 'error');
    }
    if (!net.segments.length) return net;
    const selectedElement = projectData.electrical.find(el => el.id === selected3DId);
    const isLightingSelection = selectedElement &&
        (isControl(selectedElement) || isControlledLoad(selectedElement));
    // 130 : un interrupteur met en évidence ses lampes et les autres interrupteurs qui les commandent (va-et-vient)
    const focusLinks = (() => {
        const all = net.controlLinks || [];
        if (!isLightingSelection) return [];
        const direct = all.filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId));
        const isSwitchSel = direct.some(link => link.switchId === selected3DId);
        const ownLights = new Set(isSwitchSel ? direct.flatMap(link => link.lightIds) : []);
        return all.filter(link => direct.includes(link) || (ownLights.size && link.lightIds.some(id => ownLights.has(id))));
    })();
    const selectedLinkIds = new Set(focusLinks.flatMap(link => link.linkIds || []));
    const hasLinkFocus = selectedLinkIds.size > 0;
    // circuits réellement concernés par la sélection : les autres circuits qui passent dans le même tronçon restent estompés
    const linkCircuitIds = new Set();
    if (hasLinkFocus) {
        focusLinks
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
        CABLE_RES.highlightConduit = markShared(new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: conduitOpacity, depthWrite: false }));   // 235 : suit le curseur
        CABLE_RES.dimConduit = markShared(new THREE.MeshBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.035, depthWrite: false }));
        CABLE_RES.dimCore = markShared(new THREE.MeshBasicMaterial({ color: '#475569', transparent: true, opacity: 0.08, depthWrite: false }));
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
        const ctlHex = ctlHexOf(cid);
        const circuit = !ctlHex && cid && projectData.circuits.find(c => c.id === cid);
        if (!ctlHex && !circuit) return CABLE_RES.highlightConduit;
        const hex = ctlHex || circuitColor(circuit);
        const key = 'g' + hex;
        return CABLE_RES.hiMats[key] || (CABLE_RES.hiMats[key] = markShared(new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: conduitOpacity, depthWrite: false })));   // 235 : suit le curseur, même à la sélection d'un circuit
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
        // fil de terre : tronçons de 5 cm alternés vert et jaune
        if (mat === 'stripe') {
            const green = matFor('green-yellow');
            const yellow = CABLE_RES.mats.yellowStripe || (CABLE_RES.mats.yellowStripe = markShared(new THREE.MeshBasicMaterial({ color: '#facc15' })));
            let s = 0, vert = true;
            while (s < L - 1e-6) {
                const len = Math.min(vert ? 5 : 10, L - s);   // 5 cm vert, 10 cm jaune
                strut(p.clone().lerp(q, s / L), p.clone().lerp(q, (s + len) / L), radius, vert ? green : yellow, order, isTube);
                s += len;
                vert = !vert;
            }
            return;
        }
        const m = new THREE.Mesh(isTube ? CABLE_RES.cyl : CABLE_RES.core, mat);
        m.position.copy(p).add(q).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(Y, d.normalize());
        m.scale.set(radius, L, radius);
        m.renderOrder = order;
        if (isTube && !G) m.userData = { conduit: true, a: p.clone(), b: q.clone(), base: order };   // 254
        add(m);
    };


    // 1) tron?ons et leurs groupes (un groupe = un circuit, ou un tube de commande sans fils)
    if (!G) cableTubes3D = [];
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
        // lumière ou commande sélectionnée : seuls les tronçons de sa liaison, et seulement le circuit de la lumière
        if (hasLinkFocus && !(seg.links || []).some(id => selectedLinkIds.has(id))) return;
        const kept = new Map([...groups].filter(([, g]) => (!G || G.keepGroup(g.cid)) && (!hasLinkFocus || linkCircuitIds.has(g.cid) || String(g.cid).startsWith('ctl:'))));
        if (G && (!kept.size || !G.keepSeg(seg))) return;   // fantôme : tronçon hors sélection, rien à tracer
        segs.push({ a, b, dir, groups: kept, links: seg.links || [], stairHit: !!seg.stairHit, src: seg });
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
    // repère de la section au n?ud : normale = bissectrice des deux tron?ons (plan de coupe en onglet)
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

    // 209 : place fixe de chaque fil sur tout le réseau (ne dépend plus des autres fils présents au nœud)
    const laneSeen = new Map();   // gk -> Map(clé du fil -> rang de tri)
    segs.forEach(s => s.groups.forEach((g, gk) => {
        if (!laneSeen.has(gk)) laneSeen.set(gk, new Map());
        wireKeysOf(g.wires).forEach(w => laneSeen.get(gk).set(w.key, w.sortKey));
    }));
    const laneOf = new Map();     // gk -> Map(clé du fil -> indice fixe)
    const laneCount = new Map();  // gk -> nombre de fils (plafonné à 18)
    laneSeen.forEach((m, gk) => {
        const ordered = [...m.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k);
        laneOf.set(gk, new Map(ordered.map((k, i) => [k, i])));
        laneCount.set(gk, Math.min(18, Math.max(ordered.length, 1)));
    });
    const nodeOffsets = new Map();
    nodes.forEach((n, nk) => {
        const { U, V } = nodeFrame(n.dirs);
        const gl = [...n.groups].sort(([x], [y]) => x.localeCompare(y));
        const Rmax = Math.max(...gl.map(([gk]) => groupRadius(laneCount.get(gk) || 1)));
        const off = new Map();
        gl.forEach(([gk], gi) => {
            const total = laneCount.get(gk) || 1;
            const lanes = laneOf.get(gk) || new Map();
            const R = groupRadius(total);
            const radial = gl.length > 1 ? (1.15 * Rmax) / Math.sin(Math.PI / gl.length) : 0;
            const angle = (gi / gl.length) * Math.PI * 2;
            const tube = new THREE.Vector3()
                .addScaledVector(U, Math.cos(angle) * radial)
                .addScaledVector(V, Math.sin(angle) * radial);
            // 247 : au-delà de 4 fils, l'écart se resserre pour que tous les fils restent dans le tube (rayon R) ; identique en entrée, en sortie et en bas
            const PITCH = total > 1 ? Math.min(1.5, Math.max(0.3, (R - CORE_R - 0.25) * 2 / (total - 1))) : 1.5;
            const wires = new Map();
            n.groups.get(gk).slots.forEach((w, key) => {
                const i = lanes.get(key);
                if (i === undefined || i >= total) return;
                // fils alignés à pas fixe, centrés sur le tube du groupe : l'écart ne dépend plus du nombre de fils au nœud
                wires.set(key, tube.clone()
                    .addScaledVector(V, (i - (total - 1) / 2) * PITCH));
            });
            off.set(gk, { R, tube, wires });
        });
        nodeOffsets.set(nk, off);
    });

    // 3) rendu : chaque tron?on relie les points calculés à ses deux n?uds
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
                : isSelected;
            const emphasised = isFocused;
            // 253 : circuit ou liaison sélectionné : les autres gaines et fils ne sont plus dessinés (sauf les escaliers)
            if (!G && !s.stairHit && (hasLinkFocus || FOC || BOX) && !isFocused) return;
            const cmat = s.stairHit ? stairHitMaterial()
                : G ? (isFocused ? hiFor(cid) : ghostConduitMat(cid))
                : ((hasLinkFocus || FOC || BOX) ? (isFocused ? hiFor(cid) : CABLE_RES.dimConduit) : conduitFor(cid));
            const order = emphasised ? 3 : 2;
            strut(s.a.clone().add(A.tube), s.b.clone().add(B.tube), (G && G.radiusCm !== undefined ? G.radiusCm : R), cmat, order, true);
            // 176 : axe réellement dessiné de ce tube, pour la sélection au clic
            if (!G && cid === cableManualId && s.src) cableTubes3D.push({ key: cableSegKey(s.src, cid), a: s.a.clone().add(A.tube), b: s.b.clone().add(B.tube), R });
            noteSphere(ka, gk, cmat, emphasised);
            noteSphere(kb, gk, cmat, emphasised);

            wireKeysOf(g.wires).forEach(w => {
                const pa = A.wires.get(w.key);
                const pb = B.wires.get(w.key);
                if (!pa || !pb) return;
                const coreMat = (hasLinkFocus || FOC || BOX) && !emphasised
                    ? CABLE_RES.dimCore
                    : (w.colour === 'green-yellow' ? 'stripe' : matFor(w.colour));
                if (!G || G.wires) strut(s.a.clone().add(pa), s.b.clone().add(pb), CORE_R, coreMat, order, false);
                });
        });
    });
    // manchons : coudes, d?rivations et extr?mit?s de groupe (rien là où un groupe passe tout droit)
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
    const mats = [CABLE_RES.conduitMat, CABLE_RES.highlightConduit,
        ...Object.values(CABLE_RES.circMats || {}), ...Object.values(CABLE_RES.hiMats || {})];
    mats.forEach(m => { if (m) m.opacity = v; });
}

// Étages voisins (dessus et dessous) affichés en fantôme dans la 3D : visibles, mais ni cliquables ni sélectionnables
let ghostLevelsOn = false;   // 217 : étages fantômes masqués par défaut (le calcul de leurs câbles est évité)

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
    const hit = _ghostNetCache.get(levelId);
    // 238 : pendant un glissement, le dernier résultat suffit : pas de JSON de toute la géométrie à chaque image
    if (hit && (layoutDragging3D() || sliderDragging)) return hit.net;
    const sig = JSON.stringify([projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts, projectData.stairs]);
    if (hit && hit.sig === sig) return hit.net;
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

// Une trémie et ses pièces : cadre, colonne, zone cliquable, volume de sélection, étiquette, point de dérivation
function addShaft3D(sh, cx, cy) {
        const s = sh.size || 40;
        const frame = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)),
              new THREE.LineBasicMaterial({ color: shaftColour() }));
        const sp = shaftPos2D(sh);
        frame.position.set(sp.x - cx, 1, sp.y - cy);
        frame.userData.shaftId = sh.id;
        frame.userData.shaftFrame = true;   // repère du déplacement direct
        threeScene.add(frame);
        wallMeshes3D.push(frame);
        // colonne visible en permanence (même aspect qu'à la sélection) : repère la trémie en 3D
        const span = shaftSpan3D(sh);
        const column = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, span.height, s)),
            new THREE.LineBasicMaterial({ color: shaftColour(), transparent: true, opacity: 0.85 }));
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
        // volume translucide dans la colonne, identique sélectionnée ou non (blanc en sombre, gris en clair)
        const volume = new THREE.Mesh(new THREE.BoxGeometry(s + 2, span.height, s + 2),
            new THREE.MeshBasicMaterial({ color: shaftVolumeColour(), transparent: true, opacity: 0.3, depthWrite: false }));
        volume.position.set(frame.position.x, span.base + span.height / 2, frame.position.z);
        volume.renderOrder = 5;
        volume.userData = { shaftId: sh.id };
        threeScene.add(volume);
        wallMeshes3D.push(volume);
        // noms des niveaux reliés : taille du réglage « Noms des niveaux reliés », texte seul, sans fond
        const label = makeScreenLabel3D(shaftLevelNames(sh).join(' ↔ '), textSizePx('niveau'), { bold: true, halo: false });
        // l'étiquette se place en bas de la trémie si elle relie un niveau plus bas, en haut sinon
        const elevOf = lvId => ((projectData.levels || []).find(l => l.id === lvId) || {}).elevation || 0;
        const otherId = (sh.levelIds || [sh.levelId]).find(lvId => lvId !== activeLevelId);
        const goesDown = otherId !== undefined && elevOf(otherId) < elevOf(activeLevelId);
        const labelY = goesDown ? 40 : Math.min(230, levelCeilingOf(activeLevelId) - 20);
        label.position.set(frame.position.x, labelY, frame.position.z);
        label.renderOrder = 11;
        label.userData = { type: 'shaftLabel', id: sh.id };
        threeScene.add(label);
        wallMeshes3D.push(label);
        // point de dérivation : chaque niveau relié prend ses circuits à ce point de la gaine (hauteur 1,50 m)
        // boîte : 10 cm d'épaisseur (perpendiculaire au mur) et 14 cm de long, orientée comme le mur
        const derivation = new THREE.Mesh(new THREE.BoxGeometry(10, DERIV_BOX_H, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        // la boîte est collée à la face du mur, côté pièce de la trémie (jamais dans le mur)
        const dp = derivFacePos2D(sh);
        derivation.position.set(dp.x - cx, derivHeightOf(sh, activeLevelId), dp.y - cy);
        derivation.rotation.y = -dp.angle + Math.PI / 2;
        derivation.renderOrder = 6;
        derivation.userData = { type: 'derivation', id: sh.id, derivation: true };
        interactiveObjects3D.push(derivation);
        threeScene.add(derivation);
        wallMeshes3D.push(derivation);
}

// Reconstruit seulement une trémie (taille, hauteur de dérivation) ; renvoie false si la trémie n'est pas du niveau affiché
function rebuildShaft3D(sh) {
    if (!shaftsOn().some(x => x.id === sh.id)) return false;
    const { cx, cy } = scene3DCentre();
    const drop = o => o.userData && (o.userData.shaftId === sh.id || ((o.userData.type === 'shaft' || o.userData.type === 'shaftLabel' || o.userData.type === 'derivation') && o.userData.id === sh.id));
    for (let i = threeScene.children.length - 1; i >= 0; i--) if (drop(threeScene.children[i])) threeScene.remove(threeScene.children[i]);
    for (let i = wallMeshes3D.length - 1; i >= 0; i--) if (drop(wallMeshes3D[i])) wallMeshes3D.splice(i, 1);
    for (let i = interactiveObjects3D.length - 1; i >= 0; i--) if (drop(interactiveObjects3D[i])) interactiveObjects3D.splice(i, 1);
    addShaft3D(sh, cx, cy);
    if (selected3DId === sh.id) {
        const hit = interactiveObjects3D.find(o => o.userData && o.userData.type === 'shaft' && o.userData.id === sh.id);
        if (hit) updateSelectionHighlight(hit);
    }
    return true;
}

// 251 : murs blancs en thème sombre, gris foncé en thème clair (sinon ils disparaissent sur fond clair)
const wallColour3D = () => currentTheme === 'light' ? '#8e98a5' : '#ffffff';

// Volume d'un mur coupé aux ouvertures : tronçons pleins entre les ouvertures, sous l'allège et au-dessus du linteau
function wallPieces3D(w, levelWalls, cx, cy, height) {
    const A = { x: w.x1 - cx, z: w.y1 - cy };
    const B = { x: w.x2 - cx, z: w.y2 - cy };
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    const u = { x: (B.x - A.x) / len, z: (B.z - A.z) / len };
    const n = { x: u.z, z: -u.x };
    const h = (w.thickness || 10) / 2;
    const at = (s, side) => ({ x: A.x + u.x * s + n.x * side * h, z: A.z + u.z * s + n.z * side * h });
    const outline = mitredWallOutline(w, levelWalls, cx, cy);   // [A+, B+, B-, A-] : coupes d'angle aux extrémités
    const quad = (sa, sb) => [
        sa <= 0 ? outline[0] : at(sa, 1),
        sb >= len ? outline[1] : at(sb, 1),
        sb >= len ? outline[2] : at(sb, -1),
        sa <= 0 ? outline[3] : at(sa, -1)
    ];
    const slab = (sa, sb, z0, z1) => {
        const geo = wallSolidGeometry(quad(sa, sb), z1 - z0);
        geo.translate(0, z0, 0);
        return geo;
    };
    const ops = openingsOn().filter(o => o.wallId === w.id).map(o => openingBox(o, w)).sort((p, q) => p.d - q.d);
    const out = [];
    let s = 0;
    ops.forEach(b => {
        const lo = Math.max(s, b.d - b.half), hi = Math.min(len, b.d + b.half);
        if (hi <= lo) return;
        if (lo > s) out.push(slab(s, lo, 0, height));                       // plein à gauche de l'ouverture
        if (b.z0 > 0) out.push(slab(lo, hi, 0, Math.min(b.z0, height)));    // sous l'allège
        if (b.z1 < height) out.push(slab(lo, hi, Math.max(b.z1, 0), height)); // au-dessus du linteau
        s = hi;
    });
    if (s < len || !ops.length) out.push(slab(s, len, 0, height));          // plein à droite
    return out;
}

function addWall3D(w, levelWalls, cx, cy) {
    const height = w.height || 250;
    const wallMat = new THREE.MeshStandardMaterial({
        color: wallColour3D(),
        transparent: true,
        opacity: 0.10,
        roughness: 0.8,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    wallPieces3D(w, levelWalls, cx, cy, height).forEach(geo => {
        const wallMesh = new THREE.Mesh(geo, wallMat);
        wallMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: wallColour3D(), transparent: true, opacity: 0.8 })));
        wallMesh.renderOrder = 1;   // 234 : murs dessinés avant les gaines (ordre 2-3), sinon le mur translucide voile les tronçons à l'intérieur
        wallMesh.userData = { type: 'wall', id: w.id };
        threeScene.add(wallMesh);
        wallMeshes3D.push(wallMesh);
        clickableWalls3D.push(wallMesh);
    });
    // cote de longueur : même texte que le plan 2D (« 4,00 m »), taille fixe à l'écran
    const wallLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (wallLen >= 1) {
        const cote = makeScreenLabel3D((wallLen / 100).toFixed(2).replace('.', ',') + ' m', textSizePx('cote'), { bold: true, halo: false, dark: '#f1f5f9' });
        // posée à mi-hauteur, du côté +normale du mur, à demi-épaisseur + 12 cm
        const ux = (w.x2 - w.x1) / wallLen, uz = (w.y2 - w.y1) / wallLen;
        const off = (w.thickness || 10) / 2 + 12;
        cote.position.set((w.x1 + w.x2) / 2 - cx + uz * off, height / 2, (w.y1 + w.y2) / 2 - cy - ux * off);
        cote.userData = { type: 'wallLabel', id: w.id };
        threeScene.add(cote);
        wallMeshes3D.push(cote);
    }
}

// Reconstruit seulement les murs réglés et ceux qui se raccordent à eux ; false si aucun n'est à l'étage affiché
function rebuildWalls3D(ids) {
    const onLevel = wallsOn();
    const targets = onLevel.filter(w => ids.includes(w.id));
    if (!targets.length) return false;
    const near = (a, b) => [[a.x1, a.y1], [a.x2, a.y2]].some(([px, py]) =>
        [[b.x1, b.y1], [b.x2, b.y2]].some(([qx, qy]) => Math.hypot(px - qx, py - qy) < 1));
    const redo = new Set(targets.map(w => w.id));
    targets.forEach(t => onLevel.forEach(o => { if (near(t, o)) redo.add(o.id); }));
    for (let i = wallMeshes3D.length - 1; i >= 0; i--) {
        const m = wallMeshes3D[i];
        const u = m.userData || {};
        const mine = (u.type === 'wall' || u.type === 'wallLabel') && redo.has(u.id);
        if (!mine && u.type !== 'wallSel') continue;
        threeScene.remove(m);
        if (u.type === 'wallLabel') {
            const k = SCREEN_LABELS_3D.findIndex(l => l.sprite === m);
            if (k >= 0) SCREEN_LABELS_3D.splice(k, 1);
        }
        const ci = clickableWalls3D.indexOf(m);
        if (ci >= 0) clickableWalls3D.splice(ci, 1);
        disposeSceneObject(m);
        wallMeshes3D.splice(i, 1);
    }
    const { cx, cy } = scene3DCentre();
    onLevel.filter(w => redo.has(w.id)).forEach(w => addWall3D(w, onLevel, cx, cy));
    addWallSelectionHighlights();   // cadres et poignées des murs sélectionnés, reposés sur les nouveaux volumes
    return true;
}
// ---------- Liseré pointillé du tronçon de câble sélectionné (3D) ----------
// Boîte pointillée autour du tronçon : dessus, dessous, faces, dos et extrémités (12 arêtes).
// Même couleur et même clignotement qu'en 2D. Seuls les segments du circuit réglé sont encadrés.
const CABLE_SEL_HALF_CM = 5.5;         // demi-côté de la boîte (cm), au-delà du rayon d'un tube (3,2 cm au plus)
const CABLE_SEL_DASH_PX = 4, CABLE_SEL_GAP_PX = 2;   // mêmes tirets que le cadre des appareils (simple sélection)
let cableSelFrame3D = null;

// Arêtes de la boîte d'un tronçon : paires de points [A, B] (repère de scène)
function cableSelEdges3D(sg, cx, cy) {
    const R = CABLE_SEL_HALF_CM;
    const a = new THREE.Vector3(sg.a.x - cx, sg.a.z, sg.a.y - cy);
    const b = new THREE.Vector3(sg.b.x - cx, sg.b.z, sg.b.y - cy);
    const d = b.clone().sub(a);
    const len = d.length();
    // axe du tronçon ; un point (montée réduite à un point) : axe vertical
    const t = len < 0.5 ? new THREE.Vector3(0, 1, 0) : d.divideScalar(len);
    const u = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(t).normalize() : new THREE.Vector3(1, 0, 0);
    const v = new THREE.Vector3().crossVectors(t, u).normalize();
    // coins de la section, en ordre cyclique, aux deux extrémités
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([su, sv]) => [
        a.clone().addScaledVector(u, su * R).addScaledVector(v, sv * R),
        b.clone().addScaledVector(u, su * R).addScaledVector(v, sv * R)
    ]);
    const edges = corners.map(([pa, pb]) => [pa, pb]);   // 4 arêtes longues
    for (let k = 0; k < 4; k++) {                          // 4 arêtes à chaque extrémité
        const n = (k + 1) % 4;
        edges.push([corners[k][0], corners[n][0]]);
        edges.push([corners[k][1], corners[n][1]]);
    }
    return edges;
}

// Tirets le long d'une arête (tirets et intervalles en unités monde) ; sortie : paires de points
function dashEdge3D(A, B, dash, gap, out) {
    if (!(dash + gap > 0)) return out;   // pas nul : boucle infinie évitée
    const len = A.distanceTo(B);
    for (let d = 0; d < len; d += dash + gap) {
        out.push(A.clone().lerp(B, d / len), A.clone().lerp(B, Math.min(d + dash, len) / len));
    }
    return out;
}

// Recalcule les tirets selon le zoom courant (4 px et 2 px à l'écran, quel que soit le zoom)
function fillCableSelFrame3D(frame) {
    const edges = frame.userData.edges;
    const wpp = worldPerPixel3D(edges[0][0]);
    frame.userData.wpp = wpp;
    const pts = [];
    edges.forEach(([A, B]) => dashEdge3D(A, B, CABLE_SEL_DASH_PX * wpp, CABLE_SEL_GAP_PX * wpp, pts));
    frame.geometry.dispose();
    frame.geometry = new THREE.BufferGeometry().setFromPoints(pts);
}

// Retire le liseré (scène et liste des objets 3D)
function clearCableSelFrame3D() {
    if (!cableSelFrame3D) return;
    if (threeScene) threeScene.remove(cableSelFrame3D);
    const i = wallMeshes3D.indexOf(cableSelFrame3D);
    if (i >= 0) wallMeshes3D.splice(i, 1);
    disposeSceneObject(cableSelFrame3D);
    cableSelFrame3D = null;
}

// 186 : fusionne les morceaux d'un même tronçon en une seule travée par niveau (bas, haut), de l'extrémité à l'autre
function cableSelRuns3D(segs) {
    const runs = [];
    ['low', 'ceil'].forEach(kind => {
        const group = segs.filter(sg => sg.kind === kind);
        if (!group.length) return;
        const d0 = group[0];
        const dx = d0.b.x - d0.a.x, dy = d0.b.y - d0.a.y, dl = Math.hypot(dx, dy) || 1;
        const ux = dx / dl, uy = dy / dl;
        let lo = null, hi = null;
        group.forEach(sg => [sg.a, sg.b].forEach(p => {
            const s = p.x * ux + p.y * uy;
            if (!lo || s < lo.s) lo = { s, p };
            if (!hi || s > hi.s) hi = { s, p };
        }));
        runs.push({ a: lo.p, b: hi.p });
    });
    // raccords, montées et autres morceaux : gardent leur cadre propre
    segs.filter(sg => sg.kind !== 'low' && sg.kind !== 'ceil').forEach(sg => runs.push(sg));
    return runs;
}

// Dessine la boîte de tous les segments du circuit réglé portant la clé sélectionnée (comme en 2D)
function addCableSelFrame3D(cx, cy) {
    clearCableSelFrame3D();
    if (!selectedCableKey || !showCables2D || currentMode !== '3d' || !threeScene) return;
    // seuls les segments du circuit réglé : une travée partagée avec d'autres circuits ne doit pas être encadrée
    const segs = (getCableNetwork().segments || []).filter(sg => cableSegKey(sg, cableManualId) === selectedCableKey);
    const edges = [];
    cableSelRuns3D(segs).forEach(r => cableSelEdges3D(r, cx, cy).forEach(ed => edges.push(ed)));
    if (!edges.length) return;
    // mêmes couleurs que le cadre des appareils et ouvertures sélectionnés
    const [base, alt] = selectionFramePalette3D();
    const frame = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: base, transparent: true, depthTest: false }));
    frame.renderOrder = 12;
    // selectionFrame : le clignotement des cadres de sélection le fait alterner avec blinkPalette
    frame.userData = { selectionFrame: true, blinkPalette: [base, alt], cableSel: true, edges, wpp: 0 };
    fillCableSelFrame3D(frame);
    threeScene.add(frame);
    wallMeshes3D.push(frame);
    cableSelFrame3D = frame;
}

// Remet le liseré à jour après un changement de tronçon sélectionné, sans reconstruire la scène
function refreshCableSelFrame3D() {
    if (!threeScene) return;
    const c = scene3DCentre();
    addCableSelFrame3D(c.cx, c.cy);
}

// Tirets recalculés quand le zoom change de plus de 2 % (appelée à chaque image)
function updateCableSelFrame3D() {
    if (!cableSelFrame3D || !threeCamera || !threeRenderer) return;
    const old = cableSelFrame3D.userData.wpp || 0;
    const wpp = worldPerPixel3D(cableSelFrame3D.userData.edges[0][0]);
    if (Math.abs(wpp - old) > old * 0.02) fillCableSelFrame3D(cableSelFrame3D);
}

function build3DScene() {
    const __t3 = performance.now();
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
        grid.renderOrder = 1;   // 248 : quadrillage dessiné avant les gaines (ordre 2 et plus), sinon il passe au-dessus d'elles
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
                const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.10, depthWrite: false }));
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.8 }));
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
        // 219 : sans étages fantômes, seuls les étages où le circuit sélectionné a des points sont calculés
        const selLevels = ghostLevelsOn || !selectedCircuitId ? null : new Set((projectData.electrical || [])
            .filter(el => el.type !== 'shutter_control' && el.levelId && circuitOf(el) && circuitOf(el).id === selectedCircuitId)
            .map(el => el.levelId));
        (projectData.levels || []).filter(l => l.id !== activeLevelId && (!selLevels || selLevels.has(l.id))).forEach(lv => {
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
    shaftsOn().forEach(sh => addShaft3D(sh, cx, cy));
    // Escaliers : marches pleines de la marche basse à la marche haute, emprise au sol, zone cliquable
    stairsOn().forEach(st => addStair3D(st, cx, cy));
    const levelWalls = wallsOn();
    levelWalls.forEach(w => addWall3D(w, levelWalls, cx, cy));
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
    // Textes ajoutables (patch 72) : étiquette à taille fixe, à la hauteur choisie, cliquable
    textsOn().forEach(tx => {
        const s = makeScreenLabel3D(tx.text || '', textSizePx('text'), { bold: true, halo: false, light: '#1e3a8a', dark: '#fde68a', frame: tx.id === selected3DId });
        s.position.set(tx.x - cx, tx.height || 150, tx.y - cy);
        s.renderOrder = 11;
        Object.assign(s.userData, { type: 'texte', id: tx.id });
        threeScene.add(s);
        wallMeshes3D.push(s);
        interactiveObjects3D.push(s);
    });
    addCircuitElementHighlights();
    addWallSelectionHighlights();
    addCollisionHighlights();
    renderCableNetwork(cx, cy);
    addCableSelFrame3D(cx, cy);
    addMultiHighlights3D();   // patch 79 : cadres de la sélection multiple
    if (selected3DId) {
        let foundObj = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === selected3DId);
        if (foundObj) {
            updateSelectionHighlight(foundObj);
        } else {
            selected3DId = null;
            syncElementInspectors();
        }
    }
    refreshToolHint();   // patch 88 : la bulle suit chaque changement de la scène 3D
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
        // deux ventaux (une demi-largeur chacun), pivotant sur chaque montant et ouverts à 90° du côté choisi
        const sy = op.side === -1 ? 1 : -1;   // même convention que la 2D et la zone de conflit
        const leafLen = winWidth / 2;
        const leafGeo = new THREE.BoxGeometry(leafLen, winHeight - 2 * frameBar, 2);
        const leafMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.4, roughness: 0.2, depthWrite: false });
        const leftPivot = new THREE.Group();
        leftPivot.position.set(-winWidth / 2, 0, 0);
        leftPivot.rotation.y = -sy * Math.PI / 2;
        const leftLeaf = new THREE.Mesh(leafGeo, leafMat);
        leftLeaf.position.set(leafLen / 2, 0, 0);
        leftPivot.add(leftLeaf);
        const rightPivot = new THREE.Group();
        rightPivot.position.set(winWidth / 2, 0, 0);
        rightPivot.rotation.y = sy * Math.PI / 2;
        const rightLeaf = new THREE.Mesh(leafGeo, leafMat);
        rightLeaf.position.set(-leafLen / 2, 0, 0);
        rightPivot.add(rightLeaf);
        group.add(leftPivot, rightPivot);
    }
    group.userData = { type: 'opening', id: op.id, opType: op.type, wallId: wall.id, side: op.side, hingeSide: op.hingeSide };
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
    const grey = mMat('#797c80', { rough: 0.5 });
    const dark = mMat('#0f172a', { rough: 0.6 });
    const metal = mMat('#cbd5e1', { rough: 0.25, metal: 0.8 });
    const accentMat = mMat(accent, { rough: 0.4 });

    if (el.type === 'outlet_16a' || el.type === 'outlet_20a' || el.type === 'outlet_20a_classic' || el.type === 'outlet_switched') {
        // prise 2P+T encastrée : plaque carrée, collerette ronde, deux alvéoles et broche de terre
        box(12, 12, 1.2, white, 0, 0, -0.4);
        cylZ(5.6, 5.6, 0.6, accentMat, 0, 0, 0.5);   // bague colorée (couleur du circuit)
        cylZ(4.2, 4.2, 1.2, white, 0, 0, 1.35);
        cylZ(0.62, 0.62, 0.5, dark, -1.5, -0.2, 1.8);
        cylZ(0.62, 0.62, 0.5, dark, 1.5, -0.2, 1.8);
        cylZ(0.4, 0.4, 1.8, metal, 0, 2.5, 2.1);                              // broche de terre
        if (el.type === 'outlet_switched') cylZ(0.9, 0.9, 0.4, accentMat, 4.9, 4.9, 0.6);   // point de commande, dans le coin
    } else if (el.type === 'outlet_dedicated_20' || el.type === 'outlet_dedicated_32') {
        // prise dédiée (20 ou 32 A) : même gabarit ; la couleur de la bague distingue le calibre
        cylZ(7.4, 7.6, 1.2, white, 0, 0, -0.4);
        cylZ(5.6, 5.8, 1.0, accentMat, 0, 0, 0.5);
        cylZ(4.2, 4.4, 1.2, ivory, 0, 0, 1.35);
        [[-1.8, 0.9], [1.8, 0.9], [0, -1.7]].forEach(p => cylZ(0.75, 0.75, 0.5, dark, p[0], p[1], 1.9));
        [[-6.5, 0], [6.5, 0]].forEach(p => cylZ(0.5, 0.5, 0.4, grey, p[0], p[1], 0.5));   // vis de fixation
    } else if (el.type === 'doorbell_button') {
        // bouton de sonnette : plaque et poussoir lumineux
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(10, 10, 0.6, accentMat, 0, 0, 0.6);
        box(6.4, 6.4, 1.2, white, 0, 0, 1.0);                                              // centre carré blanc
        box(4.4, 0.3, 0.4, dark, 0, 0, 1.7);                                            // grille du haut-parleur
        box(4.4, 0.3, 0.4, dark, 0, -0.7, 1.7);
        box(4.4, 0.3, 0.4, dark, 0, 0.7, 1.7);
        box(4.4, 0.3, 0.4, dark, 0, -1.4, 1.7); 
        box(4.4, 0.3, 0.4, dark, 0, 1.4, 1.7);
        box(4.4, 0.3, 0.4, dark, 0, -2.1, 1.7);
        box(4.4, 0.3, 0.4, dark, 0, 2.1, 1.7);
    } else if (el.type === 'doorbell_chime') {
        // sonnerie : boîtier rond avec grille de haut-parleur
        cylZ(6.0, 6.2, 2.0, white, 0, 0, 0.2);
        cylZ(4.6, 4.6, 0.4, dark, 0, 0, 1.3);
        cylZ(5.8, 5.8, 0.3, accentMat, 0, 0, 2.2);
    } else if (el.type === 'shutter_control') {
        // commande de volet : plaque avec deux poussoirs (monter / descendre)
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(10, 10, 0.85, accentMat, 0, 0, 0.6);
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
        box(10, 10, 0.85, accentMat, 0, 0, 0.6);
        const rocker = box(6.2, 8.4, 2.0, white, 0, 0, 1.15);                   // bascule
        rocker.rotation.x = -0.16;
        box(5.2, 0.5, 1.25, grey, 0, 0, 1.55);                                // creux de la bascule
        if (el.type === 'switch_va_et_vient') {
            box(0.8, 2.0, 2.2, accentMat, 0, -2.6, 1.7);
            box(0.8, 2.0, 2.2, accentMat, 0, 2.6, 1.0);
        }
    } else if (el.type === 'switch_pushbutton') {
        // bouton-poussoir : plaque, cadre et bouton     
        box(12, 12, 1.4, white, 0, 0, -0.4);
        box(10, 10, 0.95, accentMat, 0, 0, 0.85);
        cylZ(4.1, 4.1, 0.5, grey, 0, 0, 1.25);                                             // anneau chromé à la base
        cylZ(3.4, 3.8, 1.6, white, 0, 0, 1.0);                                             // bouton rond
        cylZ(2.2, 2.2, 0.5, accentMat, 0, 0, 2.0);                                             // axe de rotation
    } else if (el.type === 'switch_dimmer') {
        // variateur : plaque, grosse molette et repère de réglage
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(10, 10, 0.85, accentMat, 0, 0, 0.6);
        cylZ(3.4, 3.6, 1.4, white, 0, 0, 1.6);                                  // molette
        box(0.8, 2.2, 0.4, accentMat, 0, 2.2, 2.35);                            // repère
        cylZ(4.0, 4.0, 0.4, grey, 0, 0, 1.0);                                             // anneau chromé à la base
    } else if (el.type === 'motion_timer') {
        // détecteur de mouvement : plaque, boîtier arrondi et lentille de Fresnel
        box(12, 12, 1.2, white, 0, 0, -0.4);
        box(10, 10, 0.85, accentMat, 0, 0, 0.6);
        cylZ(4.0, 4.0, 0.5, ivory, 0, 0, 1.0);                                   // cadran
        for (let i = 0; i < 12; i++) {                                            // graduations : 12 points autour du cadran
            const a = i * Math.PI / 6;
            cylZ(0.35, 0.35, 0.3, dark, Math.sin(a) * 3.2, Math.cos(a) * 3.2, 1.3);
        }
        cylZ(2.2, 2.2, 0.8, white, 0, 0, 1.6);                                    // molette centrale
        cylZ(2.5, 2.5, 0.5, grey, 0, 0, 1.2);                                 // axe de rotation
        box(0.5, 2.0, 0.3, accentMat, 0, 1.0, 2.1);                               // aiguille à la couleur du circuit
    } else if (el.type === 'wall_light') {
        // applique : platine ronde, bras, vasque ouverte vers le haut, ampoule
        cylZ(4.8, 5.0, 1.4, metal, 0, 0, -0.3);
        cylZ(1.0, 1.0, 7.0, mMat('#64748b', { rough: 0.3, metal: 0.7 }), 0, 0, 3.7);
        const bowl = new THREE.Mesh(mGeo('sph', 6.2, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat('#facc15', { rough: 0.3, emissive: '#facc15', emissiveIntensity: 0.35, double: true }));        bowl.position.set(0, 2.2, 10.5);
        g.add(bowl);
        const bulb = new THREE.Mesh(mGeo('sph', 2.5, 16, 12), mMat('#fdfdfd', { emissive: '#ca8a04', emissiveIntensity: 1 }));
        bulb.position.set(0, 1.2, 10.5);
        g.add(bulb);
    } else if (el.type === 'light_spot') {
        // spot encastré : collerette affleurante et verre ambré
        cylY(5.4, 5.4, 1.0, mMat('#facc15', { rough: 0.35 }), 0, 0.5, 0);
        cylY(3.9, 3.9, 0.8, mMat('#fffbeb', { rough: 0.2, emissive: '#fde68a', emissiveIntensity: 0.6 }), 0, -0.3, 0);
    } else if (el.type === 'smoke_detector') {
        // DAAF : boîtier rond plat, grille et voyant LED
        const liseré = mMat('#64748b', { rough: 0.4 });
        cylY(6.2, 6.2, 3.0, white, 0, 1.2, 0);
        cylY(6.3, 6.3, 0.5, liseré, 0, -0.3, 0);   // liseré gris bas
        cylY(6.3, 6.3, 0.5, liseré, 0, 2.7, 0);    // liseré gris haut
        cylY(4.2, 4.2, 0.4, ivory, 0, -0.5, 0);
        cylY(0.7, 0.7, 0.5, accentMat, 2.6, -0.6, 0);
    } else if (el.type === 'light_ceiling') {
        // plafonnier : rosace au plafond, couronne, diffuseur en demi-sphère opaline
        cylY(5.0, 5.0, 1.0, mMat('#facc15', { rough: 0.35 }), 0, 4.7, 0);
        cylY(12.8, 12.8, 0.9, mMat('#eec265', { rough: 0.3, metal: 0.3 }), 0, 4.1, 0);
        const dome = new THREE.Mesh(mGeo('sph', 12.4, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mMat('#fde047', { rough: 0.2, emissive: '#fde047', emissiveIntensity: 0.55, opacity: 0.93, double: true }));
        dome.position.set(0, 3.9, 0);
        g.add(dome);
    } else if (el.type === 'junction_box') {
        // boîte de dérivation posée : petit coffret blanc, couvercle et quatre vis
        box(10, 10, 8.0, white, 0, 0, 2);
        box(8.4, 8.4, 4.0, ivory, 0, 0, 4.5);
        [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].forEach(p => cylZ(0.5, 0.5, 3.0, metal, p[0], p[1], 5.2));
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
        return 'Pose : Mur ; cliquez le premier point au sol ; clic droit pour terminer (Échap pour arrêter)';
    }
    const len = Math.hypot(wallCursor3D.x - wallDraft3D.x, wallCursor3D.y - wallDraft3D.y) / 100;
    return 'Pose : Mur ; longueur ' + len.toFixed(2).replace('.', ',') + ' m ; clic pour valider, clic droit pour terminer (Échap pour arrêter)';
}

// Longueur du tracé en cours, affichée dans le plan 3D près du tracé (comme la 2D)
let wallLabel3D = null;

function removeWallLabel3D() {
    if (!wallLabel3D) return;
    if (threeScene) threeScene.remove(wallLabel3D);
    const i = SCREEN_LABELS_3D.findIndex(l => l.sprite === wallLabel3D);
    if (i >= 0) SCREEN_LABELS_3D.splice(i, 1);
    wallLabel3D = null;
}

function updateWallPreview3D() {
    if (wallPreview3D && wallPreview3D.parent) wallPreview3D.parent.remove(wallPreview3D);
    wallPreview3D = null;
    removeWallLabel3D();
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
    // Longueur du segment en cours : taille fixe à l'écran, au milieu du segment
    const lenM = Math.hypot(wallCursor3D.x - wallDraft3D.x, wallCursor3D.y - wallDraft3D.y) / 100;
    wallLabel3D = makeScreenLabel3D(lenM.toFixed(2).replace('.', ',') + ' m', 12, { bold: true, halo: true, dark: '#f8fafc' });
    wallLabel3D.position.set((wallDraft3D.x + wallCursor3D.x) / 2 - cx, 60, (wallDraft3D.y + wallCursor3D.y) / 2 - cy);
    threeScene.add(wallLabel3D);
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

// 164 : distance minimale entre le rayon de la souris et un tronçon (3D), en cm
function raySegmentDist3D(ray, p, q) {
    const u = ray.direction;
    const v = q.clone().sub(p);
    const w0 = ray.origin.clone().sub(p);
    const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w0), e = v.dot(w0);
    const denom = a * c - b * b;
    let s = 0, t = 0;
    if (c < 1e-9) {
        t = 0;
        s = Math.max(0, -d / a);
    } else {
        s = denom > 1e-9 ? (b * e - c * d) / denom : 0;
        t = denom > 1e-9 ? (a * e - b * d) / denom : e / c;
        if (s < 0) { s = 0; t = e / c; }
        t = Math.max(0, Math.min(1, t));
        s = Math.max(0, (b * t - d) / a);
    }
    const R = ray.origin.clone().addScaledVector(u, s);
    const S = p.clone().addScaledVector(v, t);
    return R.distanceTo(S);
}

// 173 : tube du circuit réglé touché par le rayon, à sa surface (rayon du tube + 2 px).
// Plusieurs tubes touchés : le plus proche de la caméra d'abord ; un second clic au même endroit passe au suivant.
const CABLE_TUBE_R_CM = 3.5;   // rayon maximal d'un tube tel qu'il est tracé (cm)
let cablePickCycle = null;

function pickCableRay3D(e) {
    const ray = raycaster.ray;
    const hits = [];
    // 176 : distance au tube réellement dessiné (décalé de son groupe), pas à l'axe du tronçon
    cableTubes3D.forEach(tb => {
        if (!tb.key) return;
        const mid = tb.a.clone().add(tb.b).multiplyScalar(0.5);
        const tol = tb.R + 2 * worldPerPixel3D(mid);
        if (raySegmentDist3D(ray, tb.a, tb.b) < tol) hits.push({ key: tb.key, camD: threeCamera.position.distanceTo(mid) });
    });
    if (!hits.length) { cablePickCycle = null; return null; }
    hits.sort((m, n) => m.camD - n.camD);
    // clés uniques, dans l'ordre de distance à la caméra
    const keys = [...new Set(hits.map(h => h.key))];
    const sig = keys.join('|');
    let idx = 0;
    if (cablePickCycle && cablePickCycle.sig === sig && Math.hypot(e.clientX - cablePickCycle.x, e.clientY - cablePickCycle.y) < 4) {
        idx = (cablePickCycle.idx + 1) % keys.length;
    }
    cablePickCycle = { sig, idx, x: e.clientX, y: e.clientY };
    return { cutKey: keys[idx] };
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
        if (activePlacementType === 'text') {
            // texte : posé au point du sol cliqué (coordonnées du plan)
            const p = floorPlanPointFrom3D(e);
            if (p) placeText2D(p);
            return;
        }
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
                        opening.side = side;
                        if (activePlacementType === 'door_single') opening.hingeSide = doorHingeForPlacement();
                        projectData.openings.push(Object.assign(opening, { levelId: activeLevelId }));
                        showNotification("Ouverture placée sur le mur avec succès", "success");
                    } else {
                        // même hauteur que la pose en 2D (defaultHeightFor, canvas2d.js)
                        const defaultH = defaultHeightFor(activePlacementType);
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
        // 164 : tout clic dans la scène referme la fenêtre du tronçon précédent
        if (selectedCableKey) { selectedCableKey = null; syncCableCutInspector(); }
        // patch 79 : Ctrl / Maj + clic ajoute ou retire un appareil, une ouverture, une trémie ou un escalier
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            const multiHits = orderInteractiveHits(raycaster.intersectObjects(interactiveObjects3D, true));
            const multiDeriv = multiHits.find(i => i.object.userData && i.object.userData.derivation);
            let multiTarget = multiDeriv ? multiDeriv.object : (multiHits.length ? multiHits[0].object : null);
            while (multiTarget && multiTarget.parent && multiTarget.parent !== threeScene) multiTarget = multiTarget.parent;
            const mid = multiTarget && multiTarget.userData ? multiTarget.userData.id : null;
            // murs, textes et éléments sans identifiant : rien ne se passe (pas de glissement)
            if (mid && !textById(mid) && !(projectData.walls || []).some(w => w.id === mid)) {
                const isDev = electricalOn().some(x => x.id === mid);
                // l'élément seul déjà sélectionné rejoint la sélection multiple
                const prev = selected3DId;
                if (prev && prev !== mid) {
                    if (electricalOn().some(x => x.id === prev) && !selectedDeviceIds.includes(prev)) selectedDeviceIds = [...selectedDeviceIds, prev];
                    else if (isOpeningLikeId(prev) && !selectedOpeningIds.includes(prev)) selectedOpeningIds = [...selectedOpeningIds, prev];
                }
                if (isDev) selectedDeviceIds = selectedDeviceIds.includes(mid) ? selectedDeviceIds.filter(x => x !== mid) : [...selectedDeviceIds, mid];
                else if (isOpeningLikeId(mid)) selectedOpeningIds = selectedOpeningIds.includes(mid) ? selectedOpeningIds.filter(x => x !== mid) : [...selectedOpeningIds, mid];
                selected3DId = null;
                selectedCircuitId = null;
                syncElementInspectors();
                updateCircuitsUI();
                build3DScene();
                refreshToolHint();
            }
            // patch 87 : aucun élément interactif touché : Ctrl/Maj + clic sur un mur ajoute ou retire le mur
            if (!mid) {
                const ctrlWallHit = raycaster.intersectObjects(clickableWalls3D, true);
                let cwm = ctrlWallHit.length ? ctrlWallHit[0].object : null;
                while (cwm && !(cwm.userData && cwm.userData.id) && cwm.parent) cwm = cwm.parent;
                const cwid = cwm && cwm.userData && cwm.userData.id;
                if (cwid && projectData.walls.some(w => w.id === cwid)) {
                    // l'élément seul déjà sélectionné rejoint la sélection multiple
                    const prevW = selected3DId;
                    if (prevW && prevW !== cwid) {
                        if (electricalOn().some(x => x.id === prevW) && !selectedDeviceIds.includes(prevW)) selectedDeviceIds = [...selectedDeviceIds, prevW];
                        else if (isOpeningLikeId(prevW) && !selectedOpeningIds.includes(prevW)) selectedOpeningIds = [...selectedOpeningIds, prevW];
                    }
                    selected3DId = null;
                    selectedCircuitId = null;
                    setSelectedWalls(selectedWallIds.includes(cwid) ? selectedWallIds.filter(x => x !== cwid) : [...selectedWallIds, cwid]);
                    syncElementInspectors();
                    updateCircuitsUI();
                    build3DScene();
                    refreshToolHint();
                }
            }
            return;
        }
        const interactiveIntersects = orderInteractiveHits(raycaster.intersectObjects(interactiveObjects3D, true));
        const derivHit = interactiveIntersects.find(i => i.object.userData && i.object.userData.derivation);
        if (derivHit) {
            // un clic sur la boîte sélectionne la trémie (sa hauteur se règle dans le panneau)
            setSelectedWalls([]);
            clearMultiSelection3D();   // patch 79
            select3DElement(derivHit.object.userData.id, derivHit.object);
            return;
        }
        if (interactiveIntersects.length > 0) {
            // on remonte jusqu'à l'objet posé directement dans la scène (appareil ou ouverture)
            let target = interactiveIntersects[0].object;
            while (target.parent && target.parent !== threeScene) target = target.parent;
            if (target.userData && target.userData.id) {
                const targetId = target.userData.id;
                const wasSelected = selected3DId === target.userData.id;   // élément déjà sélectionné avant ce clic
                setSelectedWalls([]);   // un mur sélectionné ne reste pas ouvert quand un autre élément est choisi
                clearMultiSelection3D();   // patch 79 : un clic simple vide la sélection multiple
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
                // comme en 2D (on2DMouseDown) : un clic sur un point de circuit sélectionne son circuit ;
                // un élément sans circuit (commande, charge commandée) le retire ; réglage manuel en cours : inchangé
                const clickedCircuit = highlightCircuitOf(selectedElectrical);
                const keepCircuit3D = !!cableManualId && selectedCircuitId === cableManualId;
                const nextCircuitId = clickedCircuit ? clickedCircuit.id : null;
                if (!keepCircuit3D && nextCircuitId !== selectedCircuitId) {
                    selectedCircuitId = nextCircuitId;
                    build3DScene();
                    updateCircuitsUI();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                if (clickedCircuit && clickedCircuit.id !== selectedCircuitId && !(cableManualId && selectedCircuitId === cableManualId)) {
                    selectedCircuitId = clickedCircuit.id;
                    build3DScene();
                    updateCircuitsUI();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                // règle « sélectionner d'abord » : un premier clic ne fait que sélectionner ; le glissement demande un second clic
                if (!wasSelected) return;
                let isCeiling = selectedElectrical && CEILING_TYPES.includes(selectedElectrical.type);
                const dragStair = (projectData.stairs || []).find(s => s.id === targetId);
                dragging3DElementId = targetId;
                drag3DMoved = false;   // C1 : l'annulation est enregistrée au premier vrai déplacement
                drag3DDown = { x: e.clientX, y: e.clientY };
                const dragShaft = (projectData.shafts || []).find(s => s.id === targetId);
                if (isCeiling || dragStair || dragShaft || textById(targetId)) {
                    // trémie : plan du sol (base de sa colonne), pas le centre de la colonne, sinon le point saisi dérive en perspective
                    const floorY = dragShaft ? shaftSpan3D(dragShaft).base : target.position.y;
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(target.position.x, floorY, target.position.z));
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(threeCamera.getWorldDirection(dragPlane.normal).negate(), target.position);
                }
                if (dragStair || dragShaft) {
                    const grabPt = new THREE.Vector3();
                    if (raycaster.ray.intersectPlane(dragPlane, grabPt)) {
                        // décalage saisi dans le repère de l'escalier : rotation inverse R(-a), comme stairGrab en 2D
                        const a = ((dragStair || dragShaft).angleDeg || 0) * Math.PI / 180;
                        const dX = grabPt.x - target.position.x, dZ = grabPt.z - target.position.z;
                        stair3DGrab = { x: dX * Math.cos(a) + dZ * Math.sin(a), z: -dX * Math.sin(a) + dZ * Math.cos(a) };
                    } else {
                        stair3DGrab = { x: 0, z: 0 };
                    }
                }
                if (threeControls) threeControls.enabled = false;
                return;
            }
        }
        // 164 : réglage manuel par tronçon : un clic près d'un câble du circuit réglé ouvre son tronçon,
        // et le circuit reste sélectionné pendant les clics dans la scène
        const manualOn3D = !!cableManualId && selectedCircuitId === cableManualId;
        const cutHit3D = manualOn3D ? pickCableRay3D(e) : null;
        if (cutHit3D) {
            setSelectedWalls([]);
            clearMultiSelection3D();
            selected3DId = null;   // comme en 2D : un appareil déjà choisi ne doit pas masquer le tronçon
            selectedCableKey = cutHit3D.cutKey;
            syncElementInspectors();
            updateCircuitsUI();
            syncCableCutInspector();
            placeCablePopover(e.clientX, e.clientY);
            return;
        }
        // rien d'interactif touché : un mur se sélectionne (inspecteur de mur, comme en 2D)
        const wallHit = raycaster.intersectObjects(clickableWalls3D, true);
        if (wallHit.length > 0) {
            let wm = wallHit[0].object;
            while (wm && !(wm.userData && wm.userData.id) && wm.parent) wm = wm.parent;
            const wid = wm && wm.userData && wm.userData.id;
            if (wid && projectData.walls.some(w => w.id === wid) && !projectData.wallsLocked) {
                const wasSelected = selectedWallIds.includes(wid);
                if (selected3DId) { selected3DId = null; if (!manualOn3D) selectedCircuitId = null; }
                clearMultiSelection3D();   // patch 79
                setSelectedWalls([wid]);
                syncElementInspectors();
                // règle « sélectionner d'abord » : le glissement du mur demande qu'il soit déjà sélectionné ;
                // canEditWalls() garde le blocage du bouton « Modifier les murs » et du verrou
                if (canEditWalls() && wasSelected) startWallDrag3D(e, wid, wasSelected);
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
    if (id && textById(id)) { editText2D(id); return; }
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
    if (activePlacementType && activePlacementType !== 'text' && !dragging3DElementId) { updatePlaceGhost3D(e); return; }
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
            const angleRad = (item.angleDeg || 0) * Math.PI / 180;
            const cosA = Math.cos(angleRad);
            const sinA = Math.sin(angleRad);
            item.x = Math.round(planeIntersectPoint.x - (g.x * cosA - g.z * sinA) + cx);
            item.y = Math.round(planeIntersectPoint.z - (g.x * sinA + g.z * cosA) + cy);
            if (stairDrag) snapStairToWalls(stairDrag, prevSt);   // seul l'escalier s'aimante aux murs
            if (stairDrag && moveStairLive3D(stairDrag)) return;   // déplacement direct, sans reconstruction
            if (shaftDrag && moveShaftLive3D(shaftDrag)) return;   // trémie : déplacement direct
            scheduleBuild3D();
            return;
        }
        const textDrag = textById(dragging3DElementId);
        if (textDrag) {
            textDrag.x = Math.round(planeIntersectPoint.x + cx);
            textDrag.y = Math.round(planeIntersectPoint.z + cy);
            // déplacement direct du sprite : pas de reconstruction de la scène, donc fluide
            const txSprite = wallMeshes3D.find(o => o.userData && o.userData.type === 'texte' && o.userData.id === textDrag.id);
            if (txSprite) { txSprite.position.x = textDrag.x - cx; txSprite.position.z = textDrag.y - cy; }
            else scheduleBuild3D();
            return;
        }
        let ceilingEl = projectData.electrical.find(el => el.id === dragging3DElementId && CEILING_TYPES.includes(el.type));
        if (ceilingEl) {
            ceilingEl.x = planeIntersectPoint.x + cx;
            ceilingEl.z = planeIntersectPoint.z + cy;
            // déplacement direct du modèle ; les câbles sont recalculés au relâchement
            const grp = interactiveObjects3D.find(o => o.userData && o.userData.type === 'electrical' && o.userData.id === ceilingEl.id);
            if (grp) {
                grp.position.x = ceilingEl.x - cx;
                grp.position.z = ceilingEl.z - cy;
                if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
            } else scheduleBuild3D();
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
                if (!moveElementGroup3D(item) && !moveOpeningLive3D(item)) scheduleBuild3D();
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
    // murs qui touchent le mur au départ : leur coupe d'angle change pendant le geste
    const touchesAtStart = o => o.id !== wid && [[wall.x1, wall.y1], [wall.x2, wall.y2]].some(([px, py]) =>
        [[o.x1, o.y1], [o.x2, o.y2]].some(([qx, qy]) => Math.hypot(px - qx, py - qy) < 1));
    const neighbourIds = wallsOn().filter(touchesAtStart).map(o => o.id);
    wallDrag3D = { wallId: wid, mode, startWall: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
        origin: p, down: { x: e.clientX, y: e.clientY }, moved: false, neighbourIds };
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
    scheduleWallLive3D(d);
}

// Déplacement direct d'un escalier et de son étiquette ; renvoie false si les objets ne sont pas trouvés (reconstruction)
function moveStairLive3D(st) {
    const { cx, cy } = scene3DCentre();
    const grp = threeScene.children.find(o => o.userData && o.userData.type === 'stair' && o.userData.id === st.id);
    if (!grp) return false;
    grp.position.x = st.x - cx;
    grp.position.z = st.y - cy;
    const lab = threeScene.children.find(o => o.userData && o.userData.type === 'stairLabel' && o.userData.id === st.id);
    if (lab) { lab.position.x = st.x - cx; lab.position.z = st.y - cy; }
    if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
    return true;
}

// Déplacement direct d'une trémie : toutes ses pièces sont décalées du même écart ; renvoie false si le repère n'est pas trouvé
function moveShaftLive3D(sh) {
    const { cx, cy } = scene3DCentre();
    const sp = shaftPos2D(sh);
    const frame = threeScene.children.find(o => o.userData && o.userData.shaftId === sh.id && o.userData.shaftFrame);
    if (!frame) return false;
    const dx = (sp.x - cx) - frame.position.x;
    const dz = (sp.y - cy) - frame.position.z;
    threeScene.children.forEach(o => {
        const u = o.userData;
        if (!u) return;
        const mine = u.shaftId === sh.id || (u.type === 'shaft' && u.id === sh.id) || (u.type === 'shaftLabel' && u.id === sh.id) || (u.type === 'derivation' && u.id === sh.id);
        if (mine) { o.position.x += dx; o.position.z += dz; }
    });
    if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
    return true;
}

// Déplacement direct d'une porte ou fenêtre le long de son mur (même formule que createOpeningMesh3D) ; renvoie false si le groupe n'est pas trouvé
function moveOpeningLive3D(op) {
    const wall = projectData.walls.find(w => w.id === op.wallId);
    const grp = threeScene.children.find(o => o.userData && o.userData.type === 'opening' && o.userData.id === op.id);
    if (!wall || !grp) return false;
    // mur, côté ou sens d'ouverture changé : l'orientation et le pivot changent, on reconstruit
    if (grp.userData.wallId !== op.wallId || grp.userData.side !== op.side || grp.userData.hingeSide !== op.hingeSide) return false;
    const { cx, cy } = scene3DCentre();
    const wx1 = wall.x1 - cx, wz1 = wall.y1 - cy, wx2 = wall.x2 - cx, wz2 = wall.y2 - cy;
    const wallLen = Math.hypot(wx2 - wx1, wz2 - wz1);
    let d = op.distanceFromStart !== undefined ? op.distanceFromStart : (op.positionRatio !== undefined ? op.positionRatio * wallLen : wallLen / 2);
    d = Math.max(10, Math.min(wallLen - 10, d));
    const t = wallLen > 0 ? d / wallLen : 0.5;
    grp.position.x = wx1 + t * (wx2 - wx1);
    grp.position.z = wz1 + t * (wz2 - wz1);
    // fenêtre : centre à allège + demi-hauteur (même formule que createOpeningMesh3D) ; la porte garde sa hauteur
    if (op.type !== 'door_single') grp.position.y = (op.sillHeight !== undefined ? op.sillHeight : 90) + (op.height || 120) / 2;
    if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
    return true;
}

// Plafonnier : déplacement direct du groupe sur le plan
function moveCeilingLive3D(el) {
    const { cx, cy } = scene3DCentre();
    const grp = interactiveObjects3D.find(o => o.userData && o.userData.type === 'electrical' && o.userData.id === el.id);
    if (!grp) return false;
    grp.position.x = el.x - cx;
    grp.position.z = el.z - cy;
    return true;
}

// Texte : déplacement direct du sprite sur le plan
function moveTextLive3D(tx) {
    const { cx, cy } = scene3DCentre();
    const s = wallMeshes3D.find(o => o.userData && o.userData.type === 'texte' && o.userData.id === tx.id);
    if (!s) return false;
    s.position.x = tx.x - cx;
    s.position.z = tx.y - cy;
    return true;
}

// 169-170 : seul le texte se déplace sans recalcul du câblage ; les autres éléments (appareil, plafonnier, ouverture,
// escalier, trémie) changent le câblage : on refait la scène complète, comme au relâchement d'un glissement
function refreshNudge3D(m) {
    if (currentMode !== '3d') { refreshSelectedView(); return; }
    const it = m.item;
    const ok = m.kind === 'texte' ? moveTextLive3D(it) : false;
    if (!ok) { refreshSelectedView(); return; }
    if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
}

// Reconstruit seulement le groupe 3D d'une porte ou fenêtre (largeur, hauteur, allège) ; renvoie false si le mur ou le groupe est introuvable
function rebuildOpening3D(op) {
    const wall = projectData.walls.find(w => w.id === op.wallId);
    const old = threeScene.children.find(o => o.userData && o.userData.type === 'opening' && o.userData.id === op.id);
    if (!wall || !old) return false;
    const { cx, cy } = scene3DCentre();
    const mesh = createOpeningMesh3D(op, wall, cx, cy);
    if (!mesh) return false;
    const inW = wallMeshes3D.indexOf(old), inI = interactiveObjects3D.indexOf(old);
    if (inW >= 0) wallMeshes3D[inW] = mesh;
    if (inI >= 0) interactiveObjects3D[inI] = mesh;
    threeScene.remove(old);
    threeScene.add(mesh);
    if (selected3DId === op.id) updateSelectionHighlight(mesh);
    if (selectedOpeningIds.includes(op.id)) addMultiHighlights3D();
    return true;
}

// Le groupe réel d'un escalier : celui qui a des zones cliquables (les fantômes des autres niveaux n'en ont pas)
function findRealStair3D(id) {
    return threeScene.children.find(o => o.userData && o.userData.type === 'stair' && o.userData.id === id && o.children.some(c => interactiveObjects3D.includes(c))) || null;
}

// Reconstruit seulement l'escalier réglé (forme, étiquette, zones cliquables) ; renvoie false s'il n'est pas trouvé
function rebuildStair3D(st) {
    const real = findRealStair3D(st.id);
    if (!real) return false;
    const { cx, cy } = scene3DCentre();
    const kids = real.children;
    const lab = threeScene.children.find(o => o.userData && o.userData.type === 'stairLabel' && o.userData.id === st.id) || null;
    threeScene.remove(real);
    if (lab) threeScene.remove(lab);
    const drop = o => o === real || o === lab || kids.includes(o);
    for (let i = wallMeshes3D.length - 1; i >= 0; i--) if (drop(wallMeshes3D[i])) wallMeshes3D.splice(i, 1);
    for (let i = interactiveObjects3D.length - 1; i >= 0; i--) if (drop(interactiveObjects3D[i])) interactiveObjects3D.splice(i, 1);
    addStair3D(st, cx, cy);
    const nouveau = findRealStair3D(st.id);
    if (selected3DId === st.id && nouveau) updateSelectionHighlight(nouveau);
    if (selectedOpeningIds.includes(st.id)) addMultiHighlights3D();
    return true;
}

// Une reconstruction par image au plus pendant le glissement
function scheduleBuild3D() {
    if (wallDragFrame3D) return;
    wallDragFrame3D = true;
    requestAnimationFrame(() => { wallDragFrame3D = false; build3DScene(); });
}

// Glissement d'un mur : une mise à jour par image, limitée au mur, à ses voisins et à ce qui est posé dessus
let wallLiveFrame3D = false;

function scheduleWallLive3D(d) {
    if (wallLiveFrame3D) return;
    wallLiveFrame3D = true;
    requestAnimationFrame(() => {
        wallLiveFrame3D = false;
        if (!wallDrag3D || wallDrag3D !== d) return;   // geste terminé entre-temps : endWallDrag3D reconstruit
        if (!rebuildWalls3D([d.wallId, ...(d.neighbourIds || [])])) { build3DScene(); return; }
        let ok = true;
        openingsOn().filter(op => op.wallId === d.wallId).forEach(op => { if (!moveOpeningLive3D(op)) ok = false; });
        electricalOn().filter(el => el.wallId === d.wallId && !CEILING_TYPES.includes(el.type))
            .forEach(el => { if (!moveElementGroup3D(el)) ok = false; });
        if (!ok) build3DScene();   // ouverture ou appareil dont le groupe ne peut pas être déplacé seul
    });
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
        if (threeControls) threeControls.update();
    }
    if (d.moved) startCableJob();
    build3DScene();
    if (d.moved) {
        // message de fin de geste et alerte de superposition dans la même barre (sinon l'alerte est masquée)
        const msg = wallMoveMessage(d.linksBefore, d.mode === 'move' ? 'déplacé' : 'étiré');
        const clashes = computeWallOpeningClashes();
        if (clashes.length) {
            const alert = clashes.length === 1
                ? 'SUPERPOSITION : ce mur traverse une porte ou une fenêtre (surlignée en rouge).'
                : clashes.length + ' superpositions : des murs traversent des portes ou fenêtres (surlignées en rouge).';
            showUndoBar(msg + ' — ' + alert);
            showNotification(alert, 'error');
        } else {
            showUndoBar(msg);
        }
    }
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
        // le câblage n'a pas suivi le glissement : il est recalculé en fond pour la position finale
        if (moved) { startCableJob(); build3DScene(); }
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
    const colMat = new THREE.LineBasicMaterial({ color: shaftColour(), transparent: true, opacity: 0.35, depthWrite: false });
    const frame = add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, 1, s)), colMat));
    frame.position.set(p.x - cx, base + 1, p.y - cy);
    frame.renderOrder = 3;
    // volume léger + arêtes : la colonne fantôme se voit à distance, même avec les murs transparents
    const colGeo = new THREE.BoxGeometry(s, span.height, s);
    const column = add(new THREE.LineSegments(new THREE.EdgesGeometry(colGeo), colMat));
    column.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    column.renderOrder = 3;
    const fill = add(new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: shaftVolumeColour(), transparent: true, opacity: 0.05, depthWrite: false })));
    fill.position.set(p.x - cx, base + span.height / 2, p.y - cy);
    fill.renderOrder = 2;
    // boîtes de dérivation de chaque niveau relié, comme en réel (même taille, même position dans la gaine)
    levels.forEach(lv => {
        const dp = derivFacePos2D(sh);
        if (!dp) return;
        const geo = new THREE.BoxGeometry(10, DERIV_BOX_H, 14);
        const y = elevOf(lv) - elevOf(activeLevelId) + derivHeightOf(sh, lv);
        const box = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false })));
        box.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.35 })));
        box.position.set(dp.x - cx, y, dp.y - cy);
        box.rotation.y = -dp.angle + Math.PI / 2;
        box.renderOrder = 4;
        box.userData = { type: 'derivation', id: sh.id, ghost: true };
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
    const L = st.length || 300, W = st.width || 90;
    const H = Math.max(stairRiseCm(st), 1); // Hauteur totale de la montée
    const n = stairStepCount(st); // Nombre de marches
    const stepHeight = H / n; // Hauteur de chaque marche
    const stepDepth = L / n; // Profondeur de chaque marche (longueur divisée par le nombre de marches)
    const stepThickness = 5; // Épaisseur de la marche (5 cm)
    const elevOf = lvId => Number(((projectData.levels || []).find(l => l.id === lvId) || {}).elevation) || 0;
    const base = Math.min(...(st.levelIds || [st.levelId]).map(elevOf)) - elevOf(activeLevelId);
    const group = new THREE.Group();
    group.position.set(st.x - cx, base, st.y - cy);
    group.rotation.y = -(st.angleDeg || 0) * Math.PI / 180;
    group.userData = { type: 'stair', id: st.id };
    // Matériau des marches (violet clair)
    const stepMat = new THREE.MeshStandardMaterial({
        color: '#8b5cf6',
        roughness: 0.7,
        metalness: 0,
        transparent: true,
        opacity: ghost ? 0.25 : 0.85,
        depthWrite: !ghost
    });
    // Créer chaque marche comme un L (horizontale + verticale)
    for (let i = 0; i < n; i++) {
        const currentHeight = i * stepHeight; // Hauteur de la base de cette marche
        const nextHeight = (i + 1) * stepHeight; // Hauteur de la marche suivante

        // 1. Partie horizontale de la marche (la surface où on marche)
        const stepHorizontal = new THREE.Mesh(
            new THREE.BoxGeometry(stepDepth, stepThickness, W),
            stepMat
        );
        stepHorizontal.position.set(
            -L / 2 + (i + 0.5) * stepDepth, // Centré sur la marche
            currentHeight - stepThickness / 2, // À mi-hauteur de l'épaisseur
            0
        );
        group.add(stepHorizontal);

        // 2. Partie verticale de la marche (la contremarche)
        const stepVertical = new THREE.Mesh(
            new THREE.BoxGeometry(stepThickness, stepHeight, W),
            stepMat
        );
        stepVertical.position.set(
            -L / 2 + (i + 1) * stepDepth - stepThickness / 2, // À la fin de la marche
            currentHeight + stepHeight / 2, // À mi-hauteur de la contremarche
            0
        );
        group.add(stepVertical);
    }
    // Contour de l'emprise au sol (pour repère visuel)
    const footprint = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(L, 1, W)),
        new THREE.LineBasicMaterial({ color: '#8b5cf6' })
    );
    footprint.position.set(0, 0.5, 0);
    group.add(footprint);

    return group;
}

// Escalier réel (ou fantôme d'un autre niveau) : ajouté à la scène, avec sa zone cliquable si ce n'est pas un fantôme
function addStair3D(st, cx, cy, ghost = false) {
    const group = buildStair3D(st, cx, cy, ghost);
        // nom des niveaux reliés : au-dessus de l'escalier, taille du réglage « Noms des niveaux reliés »
    if (!ghost) {
        const lab = makeScreenLabel3D(stairLevelLabel(st), textSizePx('niveau'), { bold: true, halo: false, light: '#6d28d9', dark: '#c4b5fd' });
        lab.position.set(st.x - cx, group.position.y + Math.max(stairRiseCm(st), 1) - 10, st.y - cy);
        lab.userData = { type: 'stairLabel', id: st.id };
        lab.renderOrder = 11;
        threeScene.add(lab);
        wallMeshes3D.push(lab);
    }
    // zone cliquable : chaque marche visible (horizontale et contremarche), pas le volume entier de la montée
    if (!ghost) {
        group.children.forEach(child => {
            if (!child.isMesh) return;   // le contour au sol (LineSegments) n'est pas cliquable
            child.userData = { type: 'stair', id: st.id };
            interactiveObjects3D.push(child);
        });
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
    if (textById(id)) { syncElementInspectors(); return; }
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
        foundEl ? electricalDisplayName(foundEl) + circuitSuffixOf(foundEl) : isShaftSel ? shaftTitle(id) : isStairSel ? 'Escalier' : name;   // 115 : circuit entre parenthèses
    if ((foundEl && CEILING_TYPES.includes(foundEl.type)) || isStairSel) {
        distanceContainer.classList.add('hidden');
        heightContainer.classList.add('hidden');
        sideToggleContainer.classList.add('hidden');
    } else {
        distanceContainer.classList.remove('hidden');
        if (foundEl || foundOp) {
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
    const op = projectData.openings.find(o => o.id === selected3DId);
    const item = el || op;
    if (!item || (el && CEILING_TYPES.includes(el.type))) return;
    saveStateToUndo();
    item.side = item.side === -1 ? 1 : -1;   // sans côté enregistré, c'est le côté A
    const sideName = item.side === -1 ? 'Côté B' : 'Côté A';
    document.getElementById('inspector-side-val').textContent = sideName;
    refreshSelectedView();
    redraw2D();
    syncElementInspectors();
    const label = op ? (op.type === 'door_single' ? 'Porte' : 'Fenêtre') : 'Appareillage';
    showNotification(`${label} basculé(e) (${sideName})`, "success");
}

// patch 79 : cadres de la sélection multiple 3D (en plus du cadre de l'élément sélectionné seul)
let multiHighlights3D = [];

const DASH_PX = 4, GAP_PX = 2, MARGIN_PX = 2;   // tailles en pixels écran (constantes quel que soit le zoom)

// Taille en cm d'un pixel écran, pour un point situé à la position pos
function worldPerPixel3D(pos) {
    const h = threeRenderer.domElement.clientHeight || 1;
    const d = threeCamera.position.distanceTo(pos);
    return 2 * d * Math.tan(THREE.MathUtils.degToRad(threeCamera.fov / 2)) / h;
}

// (Re)calcule la géométrie du cadre pointillé selon le zoom courant
function fillDashedBox3D(box) {
    const target = box.userData.dashTarget;
    const bb = new THREE.Box3().setFromObject(target);
    if (bb.isEmpty()) return;
    const wpp = worldPerPixel3D(bb.getCenter(new THREE.Vector3()));
    box.userData.wpp = wpp;
    bb.expandByScalar((box.userData.marginPx ?? MARGIN_PX) * wpp);   // patch 95 : décalage propre à chaque cadre
    const mn = bb.min, mx = bb.max;
    const c = [
        new THREE.Vector3(mn.x, mn.y, mn.z), new THREE.Vector3(mx.x, mn.y, mn.z),
        new THREE.Vector3(mx.x, mn.y, mx.z), new THREE.Vector3(mn.x, mn.y, mx.z),
        new THREE.Vector3(mn.x, mx.y, mn.z), new THREE.Vector3(mx.x, mx.y, mn.z),
        new THREE.Vector3(mx.x, mx.y, mx.z), new THREE.Vector3(mn.x, mx.y, mx.z)
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const DASH = (box.userData.dashPx ?? DASH_PX) * wpp, GAP = (box.userData.gapPx ?? GAP_PX) * wpp;   // patch 95
    if (!(DASH + GAP > 0)) return;   // patch 93 : pas nul = boucle infinie, on sort
    const pts = [];
    edges.forEach(([a, b]) => {
        const A = c[a], B = c[b];
        const len = A.distanceTo(B);
        for (let d = 0; d < len; d += DASH + GAP) {
            const t0 = d / len, t1 = Math.min(d + DASH, len) / len;
            pts.push(A.clone().lerp(B, t0), A.clone().lerp(B, t1));
        }
    });
    box.geometry.dispose();
    box.geometry = new THREE.BufferGeometry().setFromPoints(pts);
}

function dashedBox3D(target, color, pattern = {}) {
    // patch 96 : matériau translucide (opacité 1) : dessiné après les murs, donc non atténué
    const box = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true }));
    box.userData.dashTarget = target;
    // patch 95 : motif et décalage propres à ce cadre (sinon ceux de la multi-sélection)
    if (pattern.dashPx) box.userData.dashPx = pattern.dashPx;
    if (pattern.gapPx) box.userData.gapPx = pattern.gapPx;
    if (pattern.marginPx) box.userData.marginPx = pattern.marginPx;
    // patch 93 : même interface que BoxHelper, pour que les glissements suivent le cadre
    box.update = () => fillDashedBox3D(box);
    fillDashedBox3D(box);
    return box;
}

// Appelée à chaque image : ne recalcule que si le zoom a changé de plus de 2 %
function updateDashedBoxes3D() {
    if (!threeCamera || !threeRenderer) return;
    // patch 93 : tous les cadres en tirets (multi-sélection, sélection seule, murs) suivent le zoom
    [...multiHighlights3D, selectedHighlightMesh, ...wallMeshes3D.filter(m => m.userData && m.userData.selectionFrame)]
        .filter(b => b && b.userData && b.userData.dashTarget)
        .forEach(box => {
        const target = box.userData.dashTarget;
        if (!target) return;
        const bb = new THREE.Box3().setFromObject(target);
        if (bb.isEmpty()) return;
        const wpp = worldPerPixel3D(bb.getCenter(new THREE.Vector3()));
        const old = box.userData.wpp || 0;
        if (Math.abs(wpp - old) > old * 0.02) fillDashedBox3D(box);
    });
}

// patch 93 : cadre de sélection unique, en tirets dans tous les cas (simple : 4 px / 2 px ; multiple : 2 px / 2 px).
// Couleur de base (thème) et couleur alternée (clignotement, via blinkPalette).
function selectionFramePalette3D() {
    return currentTheme === 'light' ? ['#0044ff', '#000205'] : ['#f8fafc', '#00eeff'];
}

function makeSelectionFrame3D(target, multi) {
    const [base, alt] = selectionFramePalette3D();
    // patch 95 : multi-sélection = tirets 2 px / 2 px décalés de 2 px ; sélection simple = tirets 4 px / 2 px décalés de 4 px
    const frame = multi
        ? dashedBox3D(target, base, { dashPx: 2, gapPx: 2, marginPx: 2 })
        : dashedBox3D(target, base, { dashPx: 4, gapPx: 2, marginPx: 4 });
    frame.renderOrder = 12;   // patch 96 : après les murs (ordre 5)
    frame.userData.blinkPalette = [base, alt];
    frame.userData.selectionFrame = true;
    return frame;
}

// patch 93 : règle unique. Plus d'un élément sélectionné (tous types) = multiple (2 px / 2 px) ; un seul = simple (4 px / 2 px)
function selectionIsMulti3D() {
    const ids = new Set([...(selected3DId ? [selected3DId] : []), ...selectedDeviceIds, ...selectedOpeningIds, ...selectedWallIds]);
    return ids.size > 1;
}

// patch 93 : clignotement des cadres de sélection (couleur du thème ↔ couleur alternée), au rythme du minuteur
function blinkSelectionFrames3D() {
    const frames = [selectedHighlightMesh, ...multiHighlights3D, ...wallMeshes3D.filter(m => m.userData && m.userData.selectionFrame)];
    frames.forEach(f => {
        if (f && f.material && f.userData && f.userData.blinkPalette) {
            f.material.color.set(blinkOn ? f.userData.blinkPalette[0] : f.userData.blinkPalette[1]);
        }
    });
}

function addMultiHighlights3D() {
    multiHighlights3D.forEach(m => threeScene.remove(m));
    multiHighlights3D = [];
    new Set([...selectedDeviceIds, ...selectedOpeningIds]).forEach(id => {
        if (id === selected3DId) return;   // déjà encadré comme sélection seule
        const obj = interactiveObjects3D.find(o => o.userData && o.userData.id === id);
        if (!obj) return;
        const target = obj.parent && obj.parent.userData && obj.parent.userData.type === 'stair' ? obj.parent : obj;
        target.updateWorldMatrix(true, true);
        const box = makeSelectionFrame3D(target, selectionIsMulti3D());   // patch 93
        threeScene.add(box);
        multiHighlights3D.push(box);
    });
}

// patch 79 : vide la sélection multiple (clic simple sur un élément ou un mur)
function clearMultiSelection3D() {
    if (!selectedDeviceIds.length && !selectedOpeningIds.length) return;
    selectedDeviceIds = []; selectedOpeningIds = [];
    addMultiHighlights3D();   // patch 80 : retire les cadres tout de suite, sans attendre une reconstruction
}

// Liseré pointillé seulement sur le texte sélectionné ; les autres sont nettoyés
function setTextFrames3D() {
    wallMeshes3D.forEach(o => {
        if (o.userData && o.userData.type === 'texte' && o.userData.setFrame) o.userData.setFrame(o.userData.id === selected3DId);
    });
}

function updateSelectionHighlight(obj) {
    setTextFrames3D();
    if (selectedHighlightMesh) {
        threeScene.remove(selectedHighlightMesh);
        selectedHighlightMesh = null;
    }
    if (!obj) return;
    if (obj.isSprite) return;   // texte : pas de cadre (l'inspecteur affiche sa sélection)
    // escalier : le cadre suit le groupe
    const target = obj.parent && obj.parent.userData && obj.parent.userData.type === 'stair' ? obj.parent : obj;
    target.updateWorldMatrix(true, true);
    selectedHighlightMesh = makeSelectionFrame3D(target, selectionIsMulti3D());   // patch 93
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
        if (currentMode === '3d' && (moveElementGroup3D(item) || moveOpeningLive3D(item))) {
            if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
        } else refreshSliderView();
    }
}

function updateSelected3DHeight(val) {
    if (!selected3DId) return;
    const height = parseInt(val);
    document.getElementById('inspector-height-3d-val').textContent = (height / 100).toFixed(2) + ' m';
    const txH = textById(selected3DId);
    if (txH) {
        if (!posUndoPending) { saveStateToUndo(); posUndoPending = true; }
        txH.height = height;
        const sprT = wallMeshes3D.find(o => o.userData && o.userData.type === 'texte' && o.userData.id === txH.id);
        if (sprT) sprT.position.y = height;
        else build3DScene();
        return;
    }
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
    if (el && currentMode === '3d' && moveElementGroup3D(el)) {
        if (selectedHighlightMesh && selectedHighlightMesh.update) selectedHighlightMesh.update();
    } else if (sh && currentMode === '3d' && rebuildShaft3D(sh)) {
        // trémie : seule sa boîte de dérivation et ses pièces sont reconstruites
    } else refreshSliderView();
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
    addMultiHighlights3D();   // patch 80 : Échap retire aussi les cadres multiples
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
            return (assigned && assigned.id === selectedCircuit.id) || (panel && el.id === panel.id);
        })
        .map(el => el.id));
}

// Mur sélectionné : cadre bleu autour du mur en 3D, pour savoir ce qui est sélectionné (comme en 2D)
// patch 90 : surbrillances 3D recalculées quand l'état change, sans reconstruire la scène
let overlaySig3D = null;

function overlaySignature3D() {
    return [selected3DId || '', selectedWallIds.join(','), selectedDeviceIds.join(','), selectedOpeningIds.join(','), currentTheme, [...collidingElementIds()].sort().join('|')].join('#');
}

function refreshOverlays3D() {
    if (currentMode !== '3d' || !threeScene) return;
    const sig = overlaySignature3D();
    if (sig === overlaySig3D) return;
    overlaySig3D = sig;
    // retire les anciens cadres : sélection simple, multiple, murs sélectionnés, collisions
    if (selectedHighlightMesh) { threeScene.remove(selectedHighlightMesh); selectedHighlightMesh = null; }
    multiHighlights3D.forEach(m => threeScene.remove(m));
    multiHighlights3D = [];
    for (let i = wallMeshes3D.length - 1; i >= 0; i--) {
        const m = wallMeshes3D[i];
        if (m.userData && (m.userData.type === 'wallSel' || m.userData.blink)) {
            threeScene.remove(m);
            wallMeshes3D.splice(i, 1);
        }
    }
    // recrée ceux qui doivent être visibles
    if (selected3DId) {
        const foundObj = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === selected3DId);
        if (foundObj) updateSelectionHighlight(foundObj);
    }
    addMultiHighlights3D();
    addWallSelectionHighlights();
    addCollisionHighlights();
}

function addWallSelectionHighlights() {
    if (!selectedWallIds.length) return;
    if (canEditWalls()) {
        // poignées aux extrémités du mur sélectionné : tirer une poignée étire le mur
        const { cx, cy } = scene3DCentre();
        selectedWallIds.forEach(id => {
            const w = projectData.walls.find(x => x.id === id);
            if (!w) return;
            [[w.x1, w.y1], [w.x2, w.y2]].forEach(([px, py]) => {
                const h = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: selectionColour3D(), depthTest: false }));
                h.position.set(px - cx, 6, py - cy);
                h.renderOrder = 13;
                h.userData = { type: 'wallSel', id: w.id };
                threeScene.add(h);
                wallMeshes3D.push(h);
            });
        });
    }
    clickableWalls3D.forEach(m => {
        if (!m.userData || !selectedWallIds.includes(m.userData.id)) return;
        m.updateWorldMatrix(true, true);
        const helper = makeSelectionFrame3D(m, selectionIsMulti3D());   // patch 93
        helper.material.depthTest = false;
        helper.renderOrder = 12;
        helper.userData.type = 'wallSel';
        helper.userData.id = m.userData.id;
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
            // alterne entre la couleur du circuit et sa couleur de contraste (blanc ou presque noir) : le cadre ne disparaît plus
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
    // 150 : un escalier a une entrée par marche et par contremarche : on ne traite chaque escalier qu'une fois
    const stairsDone = new Set();
    interactiveObjects3D.forEach(obj => {
        if (!obj.userData || !ids.has(obj.userData.id)) return;
        const isStair = !!(obj.parent && obj.parent.userData && obj.parent.userData.type === 'stair');
        const target = isStair ? obj.parent : obj;
        target.updateWorldMatrix(true, true);
        // 141 : escalier : seul le contour de ses marches clignote (pas de remplissage ni de cadre autour de tout l'escalier)
        if (isStair) {
            // 150 : garde anti-doublon : sans lui, le halo et le contour de tout l'escalier étaient ajoutés une fois par marche
            if (stairsDone.has(target)) return;
            stairsDone.add(target);
            target.traverse(m => {
                // 147 : seules les marches horizontales (épaisseur 5 cm) : une arête par marche, sans doublon avec la contremarche
                if (!m.isMesh || !m.geometry.parameters || Math.abs(m.geometry.parameters.height - 5) > 0.01) return;
                m.updateWorldMatrix(true, false);
                const p = m.geometry.parameters;
                // 149 : marge réduite à 2 cm : les halos des marches voisines ne s'additionnent plus (sinon l'escalier devient rouge plein)
                const sp = 5;
                // 149 : halo orienté comme la marche
                const halo = new THREE.Mesh(
                    new THREE.BoxGeometry(p.width + sp * 2, p.height + sp * 2, p.depth + sp * 2),
                    new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.4, depthTest: false, depthWrite: false })
                );
                halo.applyMatrix4(m.matrixWorld);
                halo.renderOrder = 11;
                halo.userData.shared = false;
                halo.userData.blink = true;
                halo.visible = blinkOn;
                threeScene.add(halo);
                wallMeshes3D.push(halo);
                // 148 : contour fin (1 px) qui suit exactement les arêtes de la marche violette, orienté comme elle
                const edges = new THREE.EdgesGeometry(m.geometry);
                edges.applyMatrix4(m.matrixWorld);
                const outline = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: '#ef4444', depthTest: false, depthWrite: false })
                );
                outline.renderOrder = 12;
                outline.userData.shared = false;
                outline.userData.blink = true;
                outline.visible = blinkOn;
                threeScene.add(outline);
                wallMeshes3D.push(outline);
            });
            return;
        }
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

// Calcul de fond : après un relâchement, le réseau est recalculé par tranches courtes pour que l'interface reste réactive.
// Pendant ce calcul, l'affichage garde l'ancien réseau. Toute action de l'utilisateur annule le calcul :
// la mémoire du câblage revient à son état d'avant, et le calcul repart si le projet a encore changé.
const CABLE_SLICE_MS = 8;
let _cableJob = null;    // { sig, gen, snap, timer } : calcul de fond en cours
let cableRevision = 0;   // compte les réseaux terminés en fond (sert à rafraîchir les alertes)

function cableSig() {
    // Le niveau affiché fait partie de la clé ; les escaliers aussi (ils bloquent les pistes)
    return JSON.stringify([activeLevelId, projectData.walls, projectData.openings, projectData.electrical, projectData.circuits, projectData.shafts, projectData.stairs]);
}
function cableGestureActive() { return layoutDragging3D() || !!draggingEl2D || !!sliderDragging; }

// mémoire de session du câblage (liaisons figées, hauteurs de tronçon, raccords de plafonnier), copiée avant un calcul de fond
function cableMemorySnapshot() {
    return {
        frozen: [...FROZEN_LINKS].map(([cid, m]) => [cid, [...m].map(([id, f]) => [id, Object.assign({}, f)])]),
        pins: [...SECTION_PINS].map(([cid, o]) => [cid, Object.assign({}, o)]),
        seen: [...SECTION_MANUAL_SEEN].map(([cid, s]) => [cid, new Set(s)]),
        feet: [...cableLinkFeet],
    };
}
function cableMemoryRestore(s) {
    FROZEN_LINKS.clear();
    s.frozen.forEach(([cid, entries]) => FROZEN_LINKS.set(cid, new Map(entries)));
    SECTION_PINS.clear();
    s.pins.forEach(([cid, o]) => SECTION_PINS.set(cid, o));
    SECTION_MANUAL_SEEN.clear();
    s.seen.forEach(([cid, set]) => SECTION_MANUAL_SEEN.set(cid, set));
    cableLinkFeet.clear();
    s.feet.forEach(([k, v]) => cableLinkFeet.set(k, v));
}

// lance le calcul de fond si le réseau affiché ne correspond plus au projet (appelé au relâchement)
function startCableJob() {
    if (!_cableCache.net || cableGestureActive()) return;
    abortCableJob(false);
    prepareCableMemory();
    const sig = cableSig();
    if (_cableCache.sig === sig) return;
    const job = { sig, snap: cableMemorySnapshot(), gen: buildCableNetworkSteps(), timer: null };
    _cableJob = job;
    job.timer = setTimeout(() => runCableJobSlice(job), 0);
}

function runCableJobSlice(job) {
    if (_cableJob !== job) return;
    if (cableGestureActive()) { abortCableJob(false); return; }
    const t0 = performance.now();
    let r;
    try {
        do { r = job.gen.next(); } while (!r.done && performance.now() - t0 < CABLE_SLICE_MS);
    } catch (err) {
        console.error('Calcul du câblage en fond interrompu :', err);
        abortCableJob(false);
        return;
    }
    if (r.done) { finishCableJob(job, r.value); return; }
    job.timer = setTimeout(() => runCableJobSlice(job), 0);
}

function finishCableJob(job, net) {
    _cableJob = null;
    // le projet a changé sans geste capté : ce calcul ne correspond plus, on repart du projet actuel
    if (cableSig() !== job.sig) { cableMemoryRestore(job.snap); startCableJob(); return; }
    _cableCache = { sig: job.sig, net };
    cableStats = net;
    cableRevision++;
    syncElementInspectors();   // les cases et listes d'associations se redessinent avec le nouveau réseau
    if (currentMode === '3d') build3DScene(); else requestRedraw2D();
    if (currentMode === '3d') build3DScene(); else requestRedraw2D();
}

// 246 : chargement, nouveau projet ou sauvegarde reprise : le réseau de l'ancien projet n'est plus affiché ; le prochain appel calcule tout de suite
function resetCableCache() {
    abortCableJob(false);
    _cableCache = { sig: null, net: null };
}

// annule le calcul de fond et rend la mémoire du câblage à son état d'avant
function abortCableJob(restart) {
    const job = _cableJob;
    if (!job) return;
    _cableJob = null;
    clearTimeout(job.timer);
    job.gen.return();
    cableMemoryRestore(job.snap);
    if (restart) setTimeout(startCableJob, 0);
}
// 244 : une action de l'utilisateur n'annule le calcul de fond que si elle change réellement le projet (écouteur de bulle : après les gestionnaires)
function cableJobCheckUserEvent() {
    if (_cableJob && cableSig() !== _cableJob.sig) abortCableJob(true);
}
['pointerdown', 'keydown', 'input', 'change', 'click'].forEach(type => window.addEventListener(type, cableJobCheckUserEvent));

function getCableNetwork() {
    // 241 : pendant un déplacement (appareil, 3D ou 2D) ou un glissement, pas de nouvelle affectation à chaque image : elle se fait au relâchement
    if (!sliderDragging && !cableGestureActive()) ensureCircuitAssignment();
    // pendant un déplacement (3D ou appareil en 2D) ou un glissement de curseur, on garde le réseau calculé au départ
    if (cableGestureActive() && _cableCache.net) { cableStats = _cableCache.net; return _cableCache.net; }
    const sig = cableSig();
    if (_cableCache.sig !== sig) {
        if (_cableCache.net) {
            // 245 : le projet a changé hors geste (clic, frappe) : calcul de fond, l'ancien réseau reste affiché en attendant
            if (!_cableJob || _cableJob.sig !== sig) startCableJob();
            cableStats = _cableCache.net;
            return _cableCache.net;
        }
        _cableCache = { sig, net: computeCableNetwork() };
    }
    cableStats = _cableCache.net;
    return _cableCache.net;
}