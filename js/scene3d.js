// Scène 3D (Three.js) : initialisation, caméra, maillages, câblage automatique et interactions souris.
// Script classique : les fonctions sont globales et utilisent l'état partagé défini dans index.html
// (threeScene, threeCamera, threeRenderer, threeControls, projectData, interactiveObjects3D, ...).

function init3DScene() {
    const container = document.getElementById('three-container');
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(currentTheme === 'light' ? 0xe2e8f0 : 0x020617);

    threeCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    threeCamera.position.set(0, 500, 600);

    threeRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    threeRenderer.shadowMap.enabled = true;
    container.appendChild(threeRenderer.domElement);

    threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
    threeControls.enableDamping = true;
    threeControls.dampingFactor = 0.05;
    threeControls.minDistance = 100;
    threeControls.maxDistance = 3000;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(400, 800, 400);
    threeScene.add(dirLight);

    threeRenderer.domElement.addEventListener('pointerdown', on3DPointerDown);
    threeRenderer.domElement.addEventListener('pointermove', on3DPointerMove);
    threeRenderer.domElement.addEventListener('pointerup', on3DPointerUp);
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

function setPlacementType(type) {
    activePlacementType = activePlacementType === type ? null : type;
    document.querySelectorAll('.place-btn').forEach(btn => {
        btn.classList.remove('tool-active-yellow');
    });
    const banner = document.getElementById('placement-banner');
    const bannerText = document.getElementById('placement-banner-text');
    document.getElementById('door-hinge-placement-container').classList.toggle('hidden', activePlacementType !== 'door_single');
    document.getElementById('door-hinge-3d-placement-container').classList.toggle('hidden', activePlacementType !== 'door_single');

    if (activePlacementType) {
        const btn = document.getElementById('btn-place-' + type);
        if (btn) btn.classList.add('tool-active-yellow');
        document.getElementById('placement-status-badge').textContent = 'Mode Placement: ' + type;
        banner.classList.remove('hidden');
        bannerText.textContent = type === 'light_ceiling' ? "Cliquez sur le plafond pour poser un plafonnier" : "Cliquez sur le bon côté du mur 3D pour y fixer l'élément";
    } else {
        document.getElementById('placement-status-badge').textContent = 'Mode Sélection';
        banner.classList.add('hidden');
    }
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

    projectData.electrical.forEach(el => {
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
function computeCableNetwork() {
    ensureCircuitAssignment();
    const C = CABLE_CFG;
    const walls = projectData.walls.filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1);
    const els = projectData.electrical;
    const result = { segments: [], linkCount: 0, unrouted: 0, linkInfo: [], circuitRuns: {}, warnings: [], controlLinks: [] };
    const panel = els.find(e => e.type === 'panel') || null;
    const wired = els.filter(e => e.type !== 'panel');
    if (!walls.length || !panel || !wired.length) return result;

    const ceilZ = Math.min(...walls.map(w => w.height || 250)) - C.ceilGap;
    const levels = [{ kind: 'low', z: C.lowZ }, { kind: 'ceil', z: ceilZ }];

    // 1. Pistes : une par mur et par face, décalées de la face du mur
    const tracks = [];
    walls.forEach(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len, nx = uy, ny = -ux, th = w.thickness || 10;
        const ext = th + 10;   // prolongement pour retrouver les angles
        [1, -1].forEach(side => {
            const off = side * (th / 2 + C.trackOffset);
            tracks.push({ wall: w, side, len, ux, uy, ox: w.x1 + nx * off, oy: w.y1 + ny * off, t0: -ext, t1: len + ext, st: [-ext, 0, len, len + ext] });
        });
    });
    const P = (t, s) => ({ x: t.ox + t.ux * s, y: t.oy + t.uy * s });
    const trackOf = (w, side) => tracks.find(t => t.wall === w && t.side === side);

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
        const list = projectData.openings.filter(o => o.wallId === w.id).map(o => {
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
    els.forEach(el => {
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
    const findNode = (x, y, z) => {
        const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
        for (let ix = bx - 1; ix <= bx + 1; ix++) {
            for (let iy = by - 1; iy <= by + 1; iy++) {
                for (let iz = bz - 1; iz <= bz + 1; iz++) {
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
    const insideBody = (x, y) => walls.some(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        const s = (x - w.x1) * ux + (y - w.y1) * uy;
        const d = Math.abs(-(x - w.x1) * uy + (y - w.y1) * ux);
        return s > -0.5 && s < len + 0.5 && d < (w.thickness || 10) / 2 + 1;
    });
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
    els.forEach(el => R.set(el.id, resolve(el)));
    const unresolved = wired.filter(el => !R.get(el.id));
    result.unrouted += unresolved.length;
    if (!R.get(panel.id)) { result.unrouted += wired.length - unresolved.length; return result; }

    // 9. Plus courts chemins (Dijkstra, un passage par un plafonnier n'est jamais un raccourci)
    const maps = new Map();
    const mapFor = (src) => {
        let r = maps.get(src);
        if (r) return r;
        const dist = new Map([[src, 0]]);
        const prev = new Map();
        const heap = new MinHeap();
        heap.push(0, src);
        while (heap.size) {
            const [d, n] = heap.pop();
            if (d > (dist.get(n) ?? Infinity)) continue;
            if (n.light && n !== src) continue;
            for (const e of n.adj) {
                if (e.dead) continue;
                const o = e.a === n ? e.b : e.a;
                const nd = d + e.cost;
                if (nd < (dist.get(o) ?? Infinity)) {
                    dist.set(o, nd);
                    prev.set(o, [n, e]);
                    heap.push(nd, o);
                }
            }
        }
        r = { dist, prev };
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
            const light = lights.find(candidate => candidate.id === id);
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
    result.controlLinks = switches.map(sw => ({
        switchId: sw.id,
        lightIds: ctrl.get(sw.id).map(light => light.id),
        linkIds: ctrl.get(sw.id).map(light => controlCableLinkId(sw.id, light.id))
    }));

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
        const tree = [{ el: panel, deg: 0, depth: 0, free: true }];
        const rest = list.slice();
        while (rest.length) {
            let best = null;
            rest.forEach((u, ui) => tree.forEach(tn => {
                if (!tn.free && tn.deg >= C.maxDegree) return;
                const d = rdist(tn.el, u.entry);
                if (!best || d < best.d) best = { d, ui, tn };
            }));
            if (!best || !isFinite(best.d)) { result.unrouted += rest.length; break; }
            const u = rest.splice(best.ui, 1)[0];
            const cid = u.cid;
            const len = addLink(best.tn.el, u.entry, u.wires, cid);
            if (len === null) { result.unrouted++; continue; }
            best.tn.deg++;
            const entryNode = { el: u.entry, deg: 1, depth: best.tn.depth + len + 60 };
            tree.push(entryNode);
            if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, entryNode.depth);
            u.members.forEach(mb => {
                const l2 = addLink(u.entry, mb, ret, cid);
                if (l2 === null) { result.unrouted++; return; }
                entryNode.deg++;
                const mn = { el: mb, deg: 1, depth: entryNode.depth + l2 + 60 };
                tree.push(mn);
                if (cid) result.circuitRuns[cid] = Math.max(result.circuitRuns[cid] || 0, mn.depth);
            });
        }
    });

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

    if (projectData.walls.length === 0) {
        selected3DId = null;
        syncElementInspectors();
        updateCircuitsUI();
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    projectData.walls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const floorWidth = (maxX - minX) + 400;
    const floorDepth = (maxY - minY) + 400;
    const planDiagonal = Math.hypot(floorWidth, floorDepth);
    threeCamera.far = Math.max(10000, planDiagonal * 4);
    threeCamera.updateProjectionMatrix();
    if (threeControls) threeControls.maxDistance = Math.max(500, planDiagonal * 1.2);
    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    const floorMat = new THREE.MeshStandardMaterial({ color: currentTheme === 'light' ? 0xf8fafc : 0x1e293b, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 0);
    floorMesh.receiveShadow = true;
    threeScene.add(floorMesh);
    wallMeshes3D.push(floorMesh);

    const maxH = Math.max(...projectData.walls.map(w => w.height || 250), 250);
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

    projectData.walls.forEach(w => {
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

    projectData.openings.forEach(op => {
        const wall = projectData.walls.find(w => w.id === op.wallId);
        if (!wall) return;
        const mesh = createOpeningMesh3D(op, wall, cx, cy);
        if (mesh) {
            threeScene.add(mesh);
            wallMeshes3D.push(mesh);
            interactiveObjects3D.push(mesh);
        }
    });

    projectData.electrical.forEach(el => {
        const mesh = createElementMesh3D(el, cx, cy);
        if (mesh) {
            threeScene.add(mesh);
            wallMeshes3D.push(mesh);
            interactiveObjects3D.push(mesh);
        }
    });

    addCircuitElementHighlights();
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
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });

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
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.5, roughness: 0.1 });

        const outerGeo = new THREE.BoxGeometry(winWidth, winHeight, wallThickness + 2);
        const outerFrame = new THREE.Mesh(outerGeo, frameMat);
        group.add(outerFrame);

        const glassGeo = new THREE.BoxGeometry(Math.max(4, winWidth - 12), Math.max(4, winHeight - 12), 4);
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
        const offsetDist = (wallThickness / 2) + 1;

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

function on3DPointerDown(e) {
    if (e.button !== 0) return;
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse3D, threeCamera);

    if (activePlacementType) {
        if (activePlacementType === 'light_ceiling') {
            if (ceilingMesh3D) {
                const ceilingIntersect = raycaster.intersectObject(ceilingMesh3D);
                if (ceilingIntersect.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    projectData.walls.forEach(w => {
                        minX = Math.min(minX, w.x1, w.x2);
                        minY = Math.min(minY, w.y1, w.y2);
                        maxX = Math.max(maxX, w.x1, w.x2);
                        maxY = Math.max(maxY, w.y1, w.y2);
                    });
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;
                    const pt = ceilingIntersect[0].point;

                    saveStateToUndo();
                    projectData.electrical.push({
                        id: 'el_' + Date.now(),
                        type: 'light_ceiling',
                        x: pt.x + cx,
                        y: 245,
                        z: pt.z + cy
                    });
                    build3DScene();
                    showNotification("Plafonnier ajouté au plafond", "success");
                    setPlacementType(null);
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
                    projectData.walls.forEach(w => {
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

                    saveStateToUndo();
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
                        projectData.openings.push(opening);
                        showNotification("Ouverture placée sur le mur avec succès", "success");
                    } else {
                        let defaultH = 110;
                        if (activePlacementType === 'panel') defaultH = 150;
                        if (activePlacementType === 'wall_light') defaultH = 180;
                        if (activePlacementType.startsWith('outlet')) defaultH = 30;
                        if (activePlacementType === 'outlet_32a') defaultH = 20;

                        projectData.electrical.push({
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
                    setPlacementType(null);
                    return;
                }
            }
        }
    } else {
        const interactiveIntersects = raycaster.intersectObjects(interactiveObjects3D, true);
        if (interactiveIntersects.length > 0) {
            // on remonte jusqu'à l'objet posé directement dans la scène (appareil ou ouverture)
            let target = interactiveIntersects[0].object;
            while (target.parent && target.parent !== threeScene) target = target.parent;
            if (target.userData && target.userData.id) {
                const targetId = target.userData.id;
                select3DElement(targetId, target);
                const selectedElectrical = projectData.electrical.find(el => el.id === targetId);
                if (selectedElectrical && (isLightingControl(selectedElectrical) ||
                    selectedElectrical.type === 'light_ceiling' || selectedElectrical.type === 'wall_light')) {
                    build3DScene();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }
                const clickedCircuit = selectedElectrical && isCircuitPoint(selectedElectrical) ? circuitOf(selectedElectrical) : null;
                if (clickedCircuit && clickedCircuit.id !== selectedCircuitId) {
                    selectedCircuitId = clickedCircuit.id;
                    build3DScene();
                    updateCircuitsUI();
                    target = interactiveObjects3D.find(obj => obj.userData && obj.userData.id === targetId) || target;
                }

                let isCeiling = selectedElectrical && selectedElectrical.type === 'light_ceiling';
                dragging3DElementId = targetId;
                if (isCeiling) {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), target.position);
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(threeCamera.getWorldDirection(dragPlane.normal).negate(), target.position);
                }
                if (threeControls) threeControls.enabled = false;
                return;
            }
        }
    }
}

function on3DPointerMove(e) {
    if (!dragging3DElementId) return;

    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    mouse3D.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse3D.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse3D, threeCamera);
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    projectData.walls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        let ceilingEl = projectData.electrical.find(el => el.id === dragging3DElementId && el.type === 'light_ceiling');
        if (ceilingEl) {
            ceilingEl.x = planeIntersectPoint.x + cx;
            ceilingEl.z = planeIntersectPoint.z + cy;
            build3DScene();
            return;
        }

        let closestWall = null;
        let closestDistCm = 0;
        let minDistance = Infinity;

        projectData.walls.forEach(w => {
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
            }
        });

        if (closestWall) {
            let item = projectData.electrical.find(el => el.id === dragging3DElementId) || projectData.openings.find(op => op.id === dragging3DElementId);
            if (item) {
                item.wallId = closestWall.id;
                item.distanceFromStart = closestDistCm;
                
                const distInput = document.getElementById('inspector-distance-input');
                const distVal = document.getElementById('inspector-distance-val');
                if (distInput) distInput.value = closestDistCm;
                if (distVal) distVal.textContent = closestDistCm + ' cm';
                
                build3DScene();
            }
        }
    }
}

function on3DPointerUp(e) {
    if (dragging3DElementId) {
        dragging3DElementId = null;
        if (threeControls) {
            threeControls.enabled = true;
            threeControls.update();
        }
    }
}

function select3DElement(id, meshObj) {
    selected3DId = id;
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
    document.getElementById('inspector-3d-element-name').textContent =
        foundEl ? electricalDisplayName(foundEl) : name;

    if (foundEl && foundEl.type === 'light_ceiling') {
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
    build3DScene();
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
    selectedHighlightMesh = new THREE.BoxHelper(obj, 0xf59e0b);
    threeScene.add(selectedHighlightMesh);
}

function updateSelected3DDistance(val) {
    if (!selected3DId) return;
    const distCm = parseInt(val);
    document.getElementById('inspector-distance-val').textContent = distCm + ' cm';

    let item = projectData.electrical.find(e => e.id === selected3DId) || projectData.openings.find(o => o.id === selected3DId);
    if (item) {
        item.distanceFromStart = distCm;
        build3DScene();
    }
}

function updateSelected3DHeight(val) {
    if (!selected3DId) return;
    const height = parseInt(val);
    document.getElementById('inspector-height-3d-val').textContent = (height / 100).toFixed(2) + ' m';

    let el = projectData.electrical.find(e => e.id === selected3DId);
    if (el) {
        el.height = height;
        build3DScene();
    }
}

function deleteSelected3DElement() {
    if (!selected3DId) return;
    saveStateToUndo();
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
    if (selected3DId) {
        selected3DId = null;
        updateSelectionHighlight(null);
        syncElementInspectors();
    }
    selectedCircuitId = id && projectData.circuits.some(c => c.id === id)
        ? (selectedCircuitId === id ? null : id)
        : null;
    build3DScene();
    updateCircuitsUI();
}

function addCircuitElementHighlights() {
    if (!selectedCircuitId) return;
    const selectedCircuit = projectData.circuits.find(c => c.id === selectedCircuitId);
    if (!selectedCircuit) return;
    const panel = projectData.electrical.find(el => el.type === 'panel');
    const highlightedIds = new Set(projectData.electrical
        .filter(el => {
            const assigned = circuitOf(el);
            return (assigned && assigned.id === selectedCircuitId)
                || (selectedCircuit.type === 'lighting' && isLightingControl(el))
                || (panel && el.id === panel.id);
        })
        .map(el => el.id));
    interactiveObjects3D.forEach(obj => {
        if (!obj.userData || !highlightedIds.has(obj.userData.id)) return;
        const helper = new THREE.BoxHelper(obj, circuitColor(selectedCircuit));
        helper.material.transparent = true;
        helper.material.opacity = 0.95;
        helper.material.depthTest = false;
        helper.renderOrder = 10;
        helper.userData.shared = false;
        threeScene.add(helper);
        wallMeshes3D.push(helper);
    });
}

let blinkOn = true;

function addCollisionHighlights() {
    const ids = collidingElementIds();
    if (!ids.size) return;
    interactiveObjects3D.forEach(obj => {
        if (!obj.userData || !ids.has(obj.userData.id)) return;
        const helper = new THREE.BoxHelper(obj, 0xef4444);
        helper.material.depthTest = false;
        helper.renderOrder = 11;
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
    const sig = JSON.stringify([projectData.walls, projectData.openings, projectData.electrical, projectData.circuits]);
    if (_cableCache.sig !== sig) _cableCache = { sig, net: computeCableNetwork() };
    cableStats = _cableCache.net;
    return _cableCache.net;
}
