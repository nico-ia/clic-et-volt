/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

// Gestion du canvas 2D et du plan 2D (vue, zoom, pan, souris, dessin des équipements).
// Script classique : les fonctions sont globales et utilisent l'état partagé défini dans index.html
// (projectData, zoom, panX, panY, rot2D, canvas2D, ctx2D, currentTool, ...).

// ---------- Canvas, vue, souris ----------
function init2DCanvas() {
    canvas2D = document.getElementById('floorplan-canvas');
    ctx2D = canvas2D.getContext('2d');
    resize2DCanvas();

    window.addEventListener('resize', () => {
        if (currentMode === '2d') resize2DCanvas();
    });

    canvas2D.addEventListener('mousedown', on2DMouseDown);
    canvas2D.addEventListener('dblclick', on2DDoubleClick);
    
    canvas2D.addEventListener('mousemove', on2DMouseMove);
    canvas2D.addEventListener('mouseleave', hidePlanTooltip);
    window.addEventListener('mouseup', on2DMouseUp);
    canvas2D.addEventListener('wheel', on2DWheel);
    
    canvas2D.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    recenter2DView();
}

// Les événements de molette et de déplacement arrivent plusieurs fois par image :
// on ne redessine qu'une fois par frame pour garder le zoom fluide.
let redraw2DQueued = false;
function requestRedraw2D() {
    if (redraw2DQueued) return;
    redraw2DQueued = true;
    requestAnimationFrame(() => {
        redraw2DQueued = false;
        redraw2D();
    });
}

// Le survol n'est recalculé qu'une fois par frame, avec la dernière position de souris
let hover2DPending = null;
let hover2DFrame = 0;
function hoverAllowed2D() {
    return !isPanning && !draggingEl2D && !selectionBoxStart && !draggingWall && currentTool !== 'place' && currentTool !== 'wall';
}

function scheduleHover2D(clientX, clientY, coords) {
    hover2DPending = { clientX, clientY, coords };
    if (hover2DFrame) return;
    hover2DFrame = requestAnimationFrame(() => {
        hover2DFrame = 0;
        const p = hover2DPending;
        hover2DPending = null;
        if (!p || !hoverAllowed2D()) { hidePlanTooltip(); return; }
        const hovered = pickElement2D(p.coords);
        showPlanTooltip(p.clientX, p.clientY, hovered ? hovered.id : null);
    });
}

function on2DWheel(e) {
    e.preventDefault();
    const rect = canvas2D.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const anchor = viewToWorld(mouseX, mouseY);
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    zoom = Math.max(0.2, Math.min(5.0, zoom * zoomFactor));
    const moved = worldToView(anchor.x, anchor.y);
    panX += mouseX - moved.x;
    panY += mouseY - moved.y;
    document.getElementById('zoom-level').textContent = `Zoom: ${Math.round(zoom * 100)}%`;
    requestRedraw2D();
}

function resize2DCanvas() {
    if (!canvas2D) return;
    canvas2D.width = canvas2D.parentElement.clientWidth;
    canvas2D.height = canvas2D.parentElement.clientHeight;
    redraw2D();
}

function recenter2DView() {
    if (!canvas2D) return;
    if (wallsOn().length === 0) {
        zoom = 1.0;
        panX = 0; panY = 0;
        const o = worldToView(0, 0);
        panX = canvas2D.width / 2 - o.x;
        panY = canvas2D.height / 2 - o.y;
        return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wallsOn().forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    zoom = 1.0;
    panX = 0; panY = 0;
    const c = worldToView(centerX, centerY);
    panX = canvas2D.width / 2 - c.x;
    panY = canvas2D.height / 2 - c.y;
}

const PRINT_RENDER_SCALE = 3;    // Résolution de l'image d'impression / PNG : plus de pixels que l'écran pour rester nets sur papier
const DERIV_HALF = 5;   // demi-côté du carré de dérivation (unités de plan)

function redraw2D() {
    if (!ctx2D || !canvas2D) return;
    if (typeof refreshToolHint === 'function') refreshToolHint();   // le mode affiché suit l'action en cours
    ctx2D.setTransform(1, 0, 0, 1, 0, 0);
    ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
    if (isPrintRendering) {
        ctx2D.fillStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
        ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
    }
    // rendu d'impression : les pixels sont multipliés, les coordonnées restent celles de l'écran
    const k = isPrintRendering ? PRINT_RENDER_SCALE : 1;
    ctx2D.setTransform(k, 0, 0, k, 0, 0);
    ctx2D.save();
    ctx2D.translate(panX, panY);
    ctx2D.rotate(rot2D);
    ctx2D.scale(zoom, zoom);
    if (gridVisible) {
        ctx2D.strokeStyle = currentTheme === 'light' ? '#cbd5e1' : '#1e293b';
        ctx2D.lineWidth = 1 / zoom;
        const gridSize = 50;
        const corners = [viewToWorld(0, 0), viewToWorld(canvas2D.width, 0), viewToWorld(0, canvas2D.height), viewToWorld(canvas2D.width, canvas2D.height)];
        const startX = Math.floor(Math.min(...corners.map(c => c.x)) / gridSize) * gridSize - gridSize;
        const endX = Math.max(...corners.map(c => c.x)) + gridSize;
        const startY = Math.floor(Math.min(...corners.map(c => c.y)) / gridSize) * gridSize - gridSize;
        const endY = Math.max(...corners.map(c => c.y)) + gridSize;
        for (let x = startX; x <= endX; x += gridSize) {
            ctx2D.beginPath();
            ctx2D.moveTo(x, startY);
            ctx2D.lineTo(x, endY);
            ctx2D.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx2D.beginPath();
            ctx2D.moveTo(startX, y);
            ctx2D.lineTo(endX, y);
            ctx2D.stroke();
        }
    }

    // murs vides avec arrondis : 1) plein (les jonctions se fondent), 2) intérieur effacé, il ne reste que le contour
    // écran : effacement (fond transparent, la grille disparaît dans le mur) ; impression : repeint au fond
    const wallsDrawn = wallsOn();
    ctx2D.save();
    ctx2D.strokeStyle = currentTheme === 'light' ? '#475569' : '#ffffff';   // 251 : murs blancs en sombre, gris foncé en clair
    ctx2D.lineCap = 'round';
    // baies : le mur n'est pas dessiné dans l'emplacement des ouvertures (découpe seulement, rien n'est effacé)
    ctx2D.beginPath();
    ctx2D.rect(-1e6, -1e6, 2e6, 2e6);
    openingsOn().forEach(op => {
        const wall = projectData.walls.find(x => x.id === op.wallId);
        const p = wall && openingPos2D(op);
        if (!p) return;
        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        const half = openingBox(op, wall).half;
        ctx2D.rect(-half, -p.th / 2 - 1, half * 2, p.th + 2);
        ctx2D.restore();
    });
    ctx2D.clip('evenodd');
    wallsDrawn.forEach(wall => {
        ctx2D.lineWidth = wall.thickness;
        ctx2D.beginPath();
        ctx2D.moveTo(wall.x1, wall.y1);
        ctx2D.lineTo(wall.x2, wall.y2);
        ctx2D.stroke();
    });
    const border = 2 / zoom;   // épaisseur du contour, constante à l'écran
    if (isPrintRendering) ctx2D.strokeStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
    else ctx2D.globalCompositeOperation = 'destination-out';
    wallsDrawn.forEach(wall => {
        const inner = wall.thickness - 2 * border;
        if (inner <= 0) return;
        ctx2D.lineWidth = inner;
        ctx2D.beginPath();
        ctx2D.moveTo(wall.x1, wall.y1);
        ctx2D.lineTo(wall.x2, wall.y2);
        ctx2D.stroke();
    });
    ctx2D.restore();

    // montants : le contour du mur s'arrête net sur chaque baie (trait en travers, hors du découpage)
    ctx2D.save();
        ctx2D.strokeStyle = currentTheme === 'light' ? '#475569' : '#ffffff';   // 251 : murs blancs en sombre, gris foncé en clair
    ctx2D.lineWidth = 2 / zoom;
    ctx2D.lineCap = 'butt';
    openingsOn().forEach(op => {
        const wall = projectData.walls.find(x => x.id === op.wallId);
        const p = wall && openingPos2D(op);
        if (!p) return;
        const half = openingBox(op, wall).half;
        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        ctx2D.beginPath();
        ctx2D.moveTo(-half, -p.th / 2); ctx2D.lineTo(-half, p.th / 2);
        ctx2D.moveTo(half, -p.th / 2); ctx2D.lineTo(half, p.th / 2);
        ctx2D.stroke();
        ctx2D.restore();
    });
    ctx2D.restore();
    draw2DEquipment();
    if (writingsShown.text) drawTexts2D();

    // fantôme de pose : l'élément qu'on va poser, translucide, sous le curseur
    if (!isPrintRendering && currentTool === 'place' && placeGhost2D) drawPlaceGhost2D(placeGhost2D);
    if (!isPrintRendering && wallSnap && (draggingWall || drawingStartPoint)) {
        const sn = wallSnap;
        ctx2D.save();
        ctx2D.strokeStyle = currentTheme === 'light' ? '#475569' : '#ffffff';
        ctx2D.fillStyle = currentTheme === 'light' ? '#475569' : '#ffffff';
        ctx2D.lineWidth = 2 / zoom;
        ctx2D.beginPath();
        ctx2D.arc(sn.pt.x, sn.pt.y, 6 / zoom, 0, Math.PI * 2);
        ctx2D.stroke();
        ctx2D.font = 'bold ' + (12 / zoom) + 'px Inter, sans-serif';
        ctx2D.textAlign = 'left';
        ctx2D.textBaseline = 'middle';
        ctx2D.translate(sn.pt.x, sn.pt.y);
        ctx2D.rotate(-rot2D);
        ctx2D.fillText(SNAP_LABEL[sn.kind], 10 / zoom, -10 / zoom);
        ctx2D.restore();
    }
    if (!isPrintRendering && drawingStartPoint && mouseCurrentPos) {
        ctx2D.strokeStyle = '#34d399';
        ctx2D.lineWidth = activeWallThickness;
        ctx2D.lineCap = 'round';
        ctx2D.beginPath();
        ctx2D.moveTo(drawingStartPoint.x, drawingStartPoint.y);
        ctx2D.lineTo(mouseCurrentPos.x, mouseCurrentPos.y);
        ctx2D.stroke();
        const dx = mouseCurrentPos.x - drawingStartPoint.x;
        const dy = mouseCurrentPos.y - drawingStartPoint.y;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
            // patch 77 : taille fixe à l'écran (on divise par le zoom, comme le texte du plan)
            const labelX = (drawingStartPoint.x + mouseCurrentPos.x) / 2 - dy / length * (18 / zoom);
            const labelY = (drawingStartPoint.y + mouseCurrentPos.y) / 2 + dx / length * (18 / zoom);
            const label = (length / 100).toFixed(2) + ' m';
            ctx2D.font = 'bold ' + (14 / zoom) + 'px Inter, sans-serif';
            ctx2D.textAlign = 'center';
            ctx2D.textBaseline = 'middle';
            const labelWidth = ctx2D.measureText(label).width + 12 / zoom;
            ctx2D.save();
            ctx2D.translate(labelX, labelY);
            ctx2D.rotate(-rot2D);
            ctx2D.fillStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
            ctx2D.fillRect(-labelWidth / 2, -10 / zoom, labelWidth, 20 / zoom);
            ctx2D.fillStyle = currentTheme === 'light' ? '#0f172a' : '#a7f3d0';
            ctx2D.fillText(label, 0, 0);
            ctx2D.restore();
        }
        ctx2D.fillStyle = '#34d399';
        ctx2D.beginPath();
        ctx2D.arc(drawingStartPoint.x, drawingStartPoint.y, 6 / zoom, 0, Math.PI * 2);
        ctx2D.fill();
    }
    if (!isPrintRendering && currentTool === 'select') {
        selectedWallIds.forEach(id => {
            const wall = wallsOn().find(w => w.id === id);
            if (!wall) return;
            // cadre comme en 3D : rectangle orienté le long du mur, même règle simple / multiple
            const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
            if (len > 0) {
                ctx2D.save();
                ctx2D.translate((wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2);
                ctx2D.rotate(Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1));
                selectionFrame2D(-len / 2, -wall.thickness / 2, len, wall.thickness);
                ctx2D.restore();
            }
            [ [wall.x1, wall.y1], [wall.x2, wall.y2] ].forEach(([x, y]) => {
                ctx2D.beginPath();
                ctx2D.arc(x, y, wall.thickness / 2, 0, Math.PI * 2);
                ctx2D.fillStyle = currentTheme === 'light' ? '#ffffff' : '#f8fafc';
                ctx2D.fill();
                ctx2D.lineWidth = 2 / zoom;
                ctx2D.strokeStyle = '#059669';
                ctx2D.stroke();
            });
        });
    }
    if (!isPrintRendering && selectionBoxStart && selectionBoxEnd) {
        const left = Math.min(selectionBoxStart.x, selectionBoxEnd.x);
        const top = Math.min(selectionBoxStart.y, selectionBoxEnd.y);
        const width = Math.abs(selectionBoxEnd.x - selectionBoxStart.x);
        const height = Math.abs(selectionBoxEnd.y - selectionBoxStart.y);
        ctx2D.fillStyle = 'rgba(16, 185, 129, 0.12)';
        ctx2D.fillRect(left, top, width, height);
        ctx2D.strokeStyle = '#34d399';
        ctx2D.lineWidth = 1 / zoom;
        ctx2D.setLineDash([5 / zoom, 4 / zoom]);
        ctx2D.strokeRect(left, top, width, height);
        ctx2D.setLineDash([]);
    }
    ctx2D.restore();
}

function worldToCanvasCoords(clientX, clientY) {
    const rect = canvas2D.getBoundingClientRect();
    return viewToWorld(clientX - rect.left, clientY - rect.top);
}

// Repère écran <-> repère plan (translation, rotation puis zoom)
function viewToWorld(sx, sy) {
    const dx = sx - panX, dy = sy - panY;
    const c = Math.cos(-rot2D), s = Math.sin(-rot2D);
    return { x: (dx * c - dy * s) / zoom, y: (dx * s + dy * c) / zoom };
}

function worldToView(wx, wy) {
    const c = Math.cos(rot2D), s = Math.sin(rot2D);
    const x = wx * zoom, y = wy * zoom;
    return { x: panX + x * c - y * s, y: panY + x * s + y * c };
}

function rotateView2D(rad) {
    if (!canvas2D) return;
    const cx = canvas2D.width / 2, cy = canvas2D.height / 2;
    const anchor = viewToWorld(cx, cy);
    rot2D = ((rad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const p = worldToView(anchor.x, anchor.y);
    panX += cx - p.x;
    panY += cy - p.y;
    const deg = Math.round(rot2D * 180 / Math.PI) % 360;
    const slider = document.getElementById('rot2d-slider');
    const label = document.getElementById('rot2d-val');
    if (slider) slider.value = deg;
    if (label) label.textContent = deg + '°';
    redraw2D();
}

function setPlanRotation(deg) {
    const v = parseFloat(deg) || 0;
    rotateView2D(v * Math.PI / 180);
    // 360 affiché tel quel (même orientation que 0°)
    const slider = document.getElementById('rot2d-slider');
    const label = document.getElementById('rot2d-val');
    if (slider) slider.value = v;
    if (label) label.textContent = v + '°';
}

function rotatePlan(deltaDeg) { rotateView2D(rot2D + deltaDeg * Math.PI / 180); }

// Trémies et escaliers sont des ouvertures (ils percent le plafond) : même sélection que les ouvertures
function isOpeningLikeId(id) {
    return openingsOn().some(x => x.id === id) || shaftsOn().some(x => x.id === id) || stairsOn().some(x => x.id === id);
}

// Tronçon de câble sélectionné (réglage par tronçon, inspecteur « Tronçon de câble »)
let selectedCableKey = null;
// circuit en réglage manuel par tronçon (bouton dans la fiche du circuit)
let cableManualId = null;

// emplacement vu de chaque tronçon de mur, pour le retrouver quand il est réglé « faux plafond » (plus de mur dessiné)
const CUT_GEOM = new Map();

function pickCable2D(coords, tolCm) {
    // tronçons sélectionnables seulement pour le circuit en réglage manuel et sélectionné, et seulement les siens
    if (!selectedCircuitId || selectedCircuitId !== cableManualId) return null;
    const circ = projectData.circuits.find(c => c.id === selectedCircuitId);
    const tol = tolCm || 8 / zoom;   // 164 : la 3D passe une tolérance en cm
    let best = null, bestD = Infinity;
    const distOf = g => {
        const isLow = g.a.z < 50 && g.b.z < 50;
        const off = isLow ? -3.5 : (g.a.z > 150 && g.b.z > 150 ? 3.5 : 0);
        const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, len = Math.hypot(dx, dy) || 1;
        const ox = -dy / len * off, oy = dx / len * off;
        return distToSegment(coords, { x: g.a.x + ox, y: g.a.y + oy }, { x: g.b.x + ox, y: g.b.y + oy });
    };
    getCableNetwork().segments.forEach(sg => {
        const key = cableSegKey(sg, selectedCircuitId);
        if (!key) return;
        if (sg.kind === 'low' || sg.kind === 'ceil') CUT_GEOM.set(key, { a: sg.a, b: sg.b });
        // 176 : un câble partagé se trace en voies côte à côte (3 cm chacune) : la tolérance couvre toutes les voies
        const nCirc = new Set((sg.cids || []).filter(Boolean)).size;
        const reach = tol + 1.5 * Math.max(0, nCirc - 1);
        const d = distOf(sg);
        if (d < reach && d < bestD) { bestD = d; best = { cutKey: key }; }
    });
    // tronçon réglé « faux plafond » : plus de mur dessiné, on le retrouve à son emplacement mémorisé
    if (!best && circ && circ.cableCuts) {
        Object.keys(circ.cableCuts).forEach(key => {
            const g = CUT_GEOM.get(key);
            if (!g) return;
            const d = distOf(g);
            if (d < tol && d < bestD) { bestD = d; best = { cutKey: key }; }
        });
    }
    return best;
}

function on2DMouseDown(e) {
    const coords = worldToCanvasCoords(e.clientX, e.clientY);
    if (e.button === 2) {
        e.preventDefault();
        if (currentTool === 'wall' && drawingStartPoint) {
            drawingStartPoint = null;
            mouseCurrentPos = null;
            document.getElementById('drawing-instruction-hint').textContent = "Tracé arrêté. Cliquez pour placer un nouveau point de mur.";
            redraw2D();
        } else if (currentTool === 'place') {
            // clic droit : on arrête la pose (comme Échap)
            setTool('select');
        }
        return;
    }
    if (e.button === 1 || (e.shiftKey && currentTool !== 'select') || currentTool === 'pan') {
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        return;
    }
    if (currentTool === 'wall') {
        let snapX = coords.x;
        let snapY = coords.y;

        if (gridSnap) {
            let bestSnapX = snapX;
            let bestSnapY = snapY;
            let minSnapDist = 25 / zoom;

            wallsOn().forEach(w => {
                const d1 = Math.hypot(w.x1 - snapX, w.y1 - snapY);
                if (d1 < minSnapDist) {
                    minSnapDist = d1;
                    bestSnapX = w.x1;
                    bestSnapY = w.y1;
                }
                const d2 = Math.hypot(w.x2 - snapX, w.y2 - snapY);
                if (d2 < minSnapDist) {
                    minSnapDist = d2;
                    bestSnapX = w.x2;
                    bestSnapY = w.y2;
                }
            });
            if (minSnapDist < 25 / zoom) {
                snapX = bestSnapX;
                snapY = bestSnapY;
            } else {
                snapX = Math.round(snapX / 25) * 25;
                snapY = Math.round(snapY / 25) * 25;
            }
        }
        if (angleSnap && drawingStartPoint) {
            const dx = snapX - drawingStartPoint.x;
            const dy = snapY - drawingStartPoint.y;
            if (Math.abs(dx) > Math.abs(dy)) snapY = drawingStartPoint.y;
            else snapX = drawingStartPoint.x;
        }
        if (!drawingStartPoint) {
            // départ : accroché à un bout ou à l'axe d'un mur existant (murs bien jointifs)
            const ms = magnetWallEnd({ x: snapX, y: snapY }, null, null, null);
            snapX = ms.x;
            snapY = ms.y;
            drawingStartPoint = { x: snapX, y: snapY };
            mouseCurrentPos = { x: snapX, y: snapY };
            document.getElementById('drawing-instruction-hint').textContent = "Cliquez pour terminer le mur (Clic droit pour fermer/arrêter)";
        } else {
            let endX = snapX;
            let endY = snapY;
            if (angleSnap) {
                const dx = endX - drawingStartPoint.x;
                const dy = endY - drawingStartPoint.y;
                if (Math.abs(dx) > Math.abs(dy)) endY = drawingStartPoint.y;
                else endX = drawingStartPoint.x;
            }

            // fin : accroche sur un bout / un axe voisin, ou angle droit avec le mur qui arrive au point de départ
            const me = magnetWallEnd({ x: endX, y: endY }, drawingStartPoint, null, null);
            endX = me.x;
            endY = me.y;
            const len = Math.hypot(endX - drawingStartPoint.x, endY - drawingStartPoint.y);
            if (len > 10 && segmentOverlapsWall(drawingStartPoint.x, drawingStartPoint.y, endX, endY)) {
                showNotification("Mur déjà existant à cet endroit : tracé refusé", "error");
            } else {
                if (len > 10) {
                    saveStateToUndo();
                    projectData.walls.push({ levelId: activeLevelId,
                        id: 'w_' + Date.now(),
                        x1: drawingStartPoint.x,
                        y1: drawingStartPoint.y,
                        x2: endX,
                        y2: endY,
                        thickness: activeWallThickness,
                        height: activeWallHeight
                    });
                    updateStats();
                }
                drawingStartPoint = { x: endX, y: endY };
                mouseCurrentPos = { x: endX, y: endY };
                document.getElementById('drawing-instruction-hint').textContent = "Déplacez et cliquez pour tracer un autre mur connecté (Clic droit pour arrêter)";
            }
        }
    } else if (currentTool === 'place') {
        place2DAt(coords);
        return;
    } else if (currentTool === 'text') {
        placeText2D(coords);
        return;
    } else if (currentTool === 'select') {
        if (selectedCableKey) { selectedCableKey = null; syncCableCutInspector(); }   // tout clic en sélection remplace le tronçon choisi
        // circuit en réglage manuel : il reste sélectionné pendant qu'on clique le plan
        const keepCircuit = !!cableManualId && selectedCircuitId === cableManualId;
        const hit = pickElement2D(coords);
        // patch 78 : Ctrl / Maj + clic ajoute ou retire un appareil ou une ouverture (trémies et escaliers compris)
        if (hit && (e.ctrlKey || e.metaKey || e.shiftKey) && !textById(hit.id)) {
            const isDev = electricalOn().some(x => x.id === hit.id);
            const isOp = !isDev && isOpeningLikeId(hit.id);
            if (isDev || isOp) {
                // l'élément seul déjà sélectionné rejoint la sélection multiple
                const prev = selected3DId;
                if (prev && prev !== hit.id) {
                    if (electricalOn().some(x => x.id === prev) && !selectedDeviceIds.includes(prev)) selectedDeviceIds = [...selectedDeviceIds, prev];
                    else if (isOpeningLikeId(prev) && !selectedOpeningIds.includes(prev)) selectedOpeningIds = [...selectedOpeningIds, prev];
                }
                if (isDev) selectedDeviceIds = selectedDeviceIds.includes(hit.id) ? selectedDeviceIds.filter(id => id !== hit.id) : [...selectedDeviceIds, hit.id];
                else selectedOpeningIds = selectedOpeningIds.includes(hit.id) ? selectedOpeningIds.filter(id => id !== hit.id) : [...selectedOpeningIds, hit.id];
                selected3DId = null;
                if (!keepCircuit) selectedCircuitId = null;
                syncElementInspectors();
                updateCircuitsUI();
                redraw2D();
                return;
            }
        }
        if (hit && textById(hit.id)) {
            // texte : un clic le sélectionne et le déplacement commence, comme les autres éléments en 2D
            setSelectedWalls([]);
            draggingWall = null;
            selected3DId = hit.id;
            if (!keepCircuit) selectedCircuitId = null;
            draggingEl2D = { id: hit.id, moved: false, grab: textGrab2D(hit.id, coords) };
            syncElementInspectors();
            updateCircuitsUI();
            redraw2D();
            return;
        }
        if (hit) {
            setSelectedWalls([]);
            draggingWall = null;
            selected3DId = hit.id;
            draggingEl2D = { id: hit.id, moved: false, grab: stairGrab(hit.id, coords) };
            // comme en 3D : cliquer un point de circuit sélectionne son câblage
            const hitEl = electricalOn().find(x => x.id === hit.id);
            const hitCircuit = highlightCircuitOf(hitEl);
            if (!keepCircuit) selectedCircuitId = hitCircuit ? hitCircuit.id : null;
            syncElementInspectors();
            updateCircuitsUI();
            redraw2D();
            return;
        }
        // clic dans le vide : on retire les appareils sélectionnés, mais le circuit choisi reste sélectionné
        if (selected3DId || selectedDeviceIds.length || selectedOpeningIds.length) {
            selected3DId = null;
            if (!(e.ctrlKey || e.metaKey || e.shiftKey)) { selectedDeviceIds = []; selectedOpeningIds = []; }
            syncElementInspectors();
            updateCircuitsUI();
        }
        const additiveSelection = e.ctrlKey || e.metaKey || e.shiftKey;
        let endpointHit = null;
        const endpointRadius = 14 / zoom;
        let endpointScore = Infinity;
        // murs verrouillés : ils ne sont plus sélectionnables (seuls les autres éléments le sont)
        const wallsPickable = !projectData.wallsLocked;
        if (wallsPickable) wallsOn().forEach(w => {
            [['start', w.x1, w.y1], ['end', w.x2, w.y2]].forEach(([endpoint, x, y]) => {
                const distance = Math.hypot(coords.x - x, coords.y - y);
                if (distance >= endpointRadius) return;
                // deux murs se rejoignant au même coin : le mur déjà sélectionné garde la poignée
                const score = distance - (selectedWallIds.includes(w.id) ? endpointRadius : 0);
                if (score < endpointScore) {
                    endpointScore = score;
                    endpointHit = { wall: w, endpoint };
                }
            });
        });
        if (endpointHit) {
            if (additiveSelection) {
                const nextIds = selectedWallIds.includes(endpointHit.wall.id)
                    ? selectedWallIds.filter(id => id !== endpointHit.wall.id)
                    : [...selectedWallIds, endpointHit.wall.id];
                setSelectedWalls(nextIds);
                draggingWall = null;
            } else if (canEditWalls()) {
                // poignée : on tire le bout de n'importe quel mur en mode Modifier les murs
                // (le seuil de 8 px évite les déplacements involontaires : un simple clic ne fait que sélectionner)
                if (!selectedWallIds.includes(endpointHit.wall.id)) setSelectedWalls([endpointHit.wall.id]);
                resetWallSnap();
                draggingWall = { wall: endpointHit.wall, mode: endpointHit.endpoint, last: coords, origin: coords, moved: false };
            } else {
                setSelectedWalls([endpointHit.wall.id]);
            }
            selectionBoxStart = null;
            selectionBoxEnd = null;
            redraw2D();
            return;
        }
        // tronçon de câble : prioritaire sur le mur qu'il longe (les câbles sont sur l'axe du mur)
        const cableHit = additiveSelection ? null : pickCable2D(coords);
        if (cableHit) {
            setSelectedWalls([]);
            draggingWall = null;
            selectionBoxStart = null;
            selectionBoxEnd = null;
            selectedCableKey = cableHit.cutKey;
            selected3DId = null;
            syncElementInspectors();
            updateCircuitsUI();
            redraw2D();
            placeCablePopover(e.clientX, e.clientY);
            return;
        }
        let foundId = null;
        if (wallsPickable) wallsOn().forEach(w => {
            const dist = distToSegment(coords, {x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
            if (dist < w.thickness / 2 + 12 / zoom) {
                foundId = w.id;
            }
        });
        if (additiveSelection && foundId) {
            const nextIds = selectedWallIds.includes(foundId)
                ? selectedWallIds.filter(id => id !== foundId)
                : [...selectedWallIds, foundId];
            setSelectedWalls(nextIds);
            draggingWall = null;
            selectionBoxStart = null;
            selectionBoxEnd = null;
        } else {
            const wall = wallsOn().find(w => w.id === foundId);
            if (wall) {
                setSelectedWalls([wall.id]);
                draggingWall = canEditWalls() ? { wall, mode: 'move', last: coords, origin: coords, moved: false } : null;
                selectionBoxStart = null;
                selectionBoxEnd = null;
            } else {
                if (!additiveSelection) setSelectedWalls([]);
                draggingWall = null;
                selectionBoxStart = coords;
                selectionBoxEnd = coords;
            }
        }
    }
    redraw2D();
}

// Circuit affiché par un double clic : celui de l'appareil. Au simple clic, une commande ou une charge commandée
// ne sélectionne pas de circuit (highlightCircuitOf renvoie null) ; ici on prend le circuit de la charge pilotée.
function circuitForDoubleClick(el) {
    if (!el) return null;
    if (el.type === 'junction_box') return boxCircuitOf(el);
    return deviceCircuitOf(el, controlTargetsOf(getCableNetwork()));
}

// Double clic sur un appareil (outil Sélectionner) : affiche le circuit entier
function on2DDoubleClick(e) {
    if (currentTool !== 'select') return;
    const hit = pickElement2D(worldToCanvasCoords(e.clientX, e.clientY));
    if (hit && textById(hit.id)) { editText2D(hit.id); return; }
    const el = hit ? electricalOn().find(x => x.id === hit.id) : null;
    const circ = el ? circuitForDoubleClick(el) : null;
    if (circ) selectCircuit(circ.id);
}

// ---------- Fantôme de pose (2D) ----------
// Montre l'élément qui serait posé à la position du curseur, sans le créer.
// Rouge : il y en a déjà un identique à cet endroit (la pose serait refusée).
let placeGhost2D = null;
// Niveaux qui seront reliés à l'escalier en cours de pose (cases cochées), sans message ni arrêt
function previewStairLevels() {
    const list = document.getElementById(currentMode === '3d' ? 'shaft-link-list-3d' : 'shaft-link-list');
    const checked = new Set(list ? [...list.querySelectorAll('input:checked')].map(i => i.value) : []);
    return [activeLevelId, ...otherLevelsByDistance().filter(l => checked.has(l.id)).map(l => l.id)];
}

function updatePlaceGhost2D(coords) {
    const type = document.getElementById('place-type').value;
    let ghost = null;
    if (CEILING_TYPES.includes(type)) {
        ghost = { id: '__ghost', levelId: activeLevelId, type, x: coords.x, y: 245, z: coords.y };
        ghost.blocked = !!ceilingSpotBlocker(coords.x, coords.y, activeLevelId);
    } else if (type === 'stair' || type === 'shaft') {
        // escalier ou trémie : posés au point du curseur (arrondi au cm) ; l'escalier se colle aux murs
        ghost = { id: '__ghost', type, levelId: activeLevelId, levelIds: previewStairLevels(),
            x: Math.round(coords.x), y: Math.round(coords.y), angleDeg: 0, width: 90, length: 300, size: 40 };
        if (type === 'stair') snapStairToWalls(ghost);
    } else {
        const info = nearestWallInfo(coords);
        if (info && info.d <= (info.wall.thickness || 10) / 2 + 60) {
            const height = defaultHeightFor(type);
            const dist = placedDistance({ type, height }, info.wall.id, Math.round(info.dist), info.side);
            ghost = { id: '__ghost', levelId: activeLevelId, type, wallId: info.wall.id, distanceFromStart: dist, height, side: info.side };
            if (type === 'shaft') { ghost.size = 40; ghost.levelIds = [activeLevelId]; }
            if (type === 'door_single' || type === 'window_std') {
                ghost.width = type === 'door_single' ? 96 : 120;
                ghost.hingeSide = type === 'door_single' ? doorHingeForPlacement() : undefined;
                if (type === 'window_std') ghost.sillHeight = 90;
            }
            ghost.blocked = !!sameSpotBlocker(type, activeLevelId, info.wall.id, dist, info.side, height);
        }
    }
    placeGhost2D = ghost;
}

function drawShaftGhost2D(g, color, blocked) {
    const p = shaftPos2D(g);
    if (!p) return;
    const s = g.size || 40;
    ctx2D.save();
    ctx2D.globalAlpha = 0.7;
    ctx2D.translate(p.x, p.y);
    ctx2D.rotate(p.angle);
    ctx2D.fillStyle = blocked ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)';
    ctx2D.strokeStyle = color;
    ctx2D.lineWidth = 3 / zoom;
    ctx2D.fillRect(-s / 2, -s / 2, s, s);
    ctx2D.strokeRect(-s / 2, -s / 2, s, s);
    ctx2D.restore();
}

function drawPlaceGhost2D(g) {
    const color = g.blocked ? '#ef4444' : '#38bdf8';
    if (g.type === 'stair') { ctx2D.save(); ctx2D.globalAlpha = 0.6; drawStair2D(g, new Set()); ctx2D.restore(); return; }
    if (g.type === 'door_single' || g.type === 'window_std') { drawOpening2D(g, color); return; }
    if (g.type === 'shaft') { drawShaftGhost2D(g, color, g.blocked); return; }
    const p = getElCoords(g);
    if (!p) return;
    if (EL_COLORS[g.type]) {
        ctx2D.save();
        ctx2D.globalAlpha = 0.7;
        drawElementSymbol2D(g);
        ctx2D.restore();
    }
    ctx2D.save();
    ctx2D.strokeStyle = g.blocked ? '#ef4444' : '#38bdf8';
    ctx2D.lineWidth = 2 / zoom;
    ctx2D.setLineDash([4 / zoom, 3 / zoom]);
    ctx2D.beginPath();
    ctx2D.arc(p.x, p.y, 12 / zoom, 0, Math.PI * 2);
    ctx2D.stroke();
    ctx2D.restore();
}

function on2DMouseMove(e) {
    const coords = worldToCanvasCoords(e.clientX, e.clientY);
    document.getElementById('cursor-coords').textContent = `X: ${(coords.x/100).toFixed(2)}m, Y: ${(coords.y/100).toFixed(2)}m`;
    if (currentTool === 'place' && !isPanning) { updatePlaceGhost2D(coords); redraw2D(); }
    // survol : étiquette de l'élément visé (hors placement, glissement et tracé)
    scheduleHover2D(e.clientX, e.clientY, coords);
    if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        requestRedraw2D();
        return;
    }
    if (draggingEl2D) {
        dragElement2D(coords);
        return;
    }
    if (currentTool === 'select' && selectionBoxStart) {
        selectionBoxEnd = coords;
        redraw2D();
        return;
    }
    if (currentTool === 'select' && draggingWall) {
        const drag = draggingWall;
        if (!drag.moved) {
            // seuil : rien ne bouge avant 8 px à l'écran (évite les modifications involontaires)
            if (Math.hypot(coords.x - drag.origin.x, coords.y - drag.origin.y) * zoom < 8) return;
            saveStateToUndo();
            drag.moved = true;
            drag.linksBefore = shaftLinksValid();
            // direction du mur avant étirement : le bout qu'on tire la suit (prolongement jusqu'au mur suivant)
            const wl = Math.hypot(drag.wall.x2 - drag.wall.x1, drag.wall.y2 - drag.wall.y1) || 1;
            drag.dir0 = { ux: (drag.wall.x2 - drag.wall.x1) / wl, uy: (drag.wall.y2 - drag.wall.y1) / wl };
            drag.last = drag.origin;
        }
        const dx = coords.x - drag.last.x;
        const dy = coords.y - drag.last.y;
        if (drag.moved) {
            const prevWall = { x1: drag.wall.x1, y1: drag.wall.y1, x2: drag.wall.x2, y2: drag.wall.y2 };
            // bout étiré : aimanté (mur suivant sur l'axe, bout voisin, angle droit)
            let pEnd = coords;
            if (drag.mode === 'start' || drag.mode === 'end') {
                const fixed = drag.mode === 'start' ? { x: drag.wall.x2, y: drag.wall.y2 } : { x: drag.wall.x1, y: drag.wall.y1 };
                const sg = drag.mode === 'end' ? 1 : -1;
                pEnd = magnetWallEnd(coords, fixed, { x: sg * drag.dir0.ux, y: sg * drag.dir0.uy }, drag.wall.id);
            }
            if (drag.mode === 'start') {
                if (Math.hypot(drag.wall.x2 - pEnd.x, drag.wall.y2 - pEnd.y) > 1) {
                    drag.wall.x1 = pEnd.x;
                    drag.wall.y1 = pEnd.y;
                }
            } else if (drag.mode === 'end') {
                if (Math.hypot(drag.wall.x1 - pEnd.x, drag.wall.y1 - pEnd.y) > 1) {
                    drag.wall.x2 = pEnd.x;
                    drag.wall.y2 = pEnd.y;
                }
            } else {
                drag.wall.x1 += dx;
                drag.wall.y1 += dy;
                drag.wall.x2 += dx;
                drag.wall.y2 += dy;
            }
            // sécurité trémie : geste refusé s'il couperait des câbles (position précédente conservée)
            const lostLinks = shaftLinksLostSince(drag.linksBefore);
            if (lostLinks.length) {
                Object.assign(drag.wall, prevWall);
                if (!drag.refused) { drag.refused = true; showNotification(shaftRefusalMessage(lostLinks), 'error'); }
                drag.last = coords;
                redraw2D();
                return;
            }
            drag.refused = false;
            drag.last = coords;
            const lengthM = Math.hypot(drag.wall.x2 - drag.wall.x1, drag.wall.y2 - drag.wall.y1) / 100;
            document.getElementById('inspector-length-input').value = lengthM.toFixed(2);
            document.getElementById('inspector-length-val').textContent = lengthM.toFixed(2) + ' m';
            // longueur pendant l'étirement : visible sous le plan, comme dans l'inspecteur
            document.getElementById('drawing-instruction-hint').textContent = (drag.mode === 'move' ? 'Mur déplacé' : 'Longueur du mur : ' + lengthM.toFixed(2).replace('.', ',') + ' m') + ' (Ctrl+Z pour annuler)';
            redraw2D();
        }
        return;
    }
    if (currentTool === 'wall' && drawingStartPoint) {
        let snapX = coords.x;
        let snapY = coords.y;
        if (gridSnap) {
            snapX = Math.round(snapX / 25) * 25;
            snapY = Math.round(snapY / 25) * 25;
        }
        if (angleSnap) {
            const dx = snapX - drawingStartPoint.x;
            const dy = snapY - drawingStartPoint.y;
            if (Math.abs(dx) > Math.abs(dy)) snapY = drawingStartPoint.y;
            else snapX = drawingStartPoint.x;
        }
        const mp = magnetWallEnd({ x: snapX, y: snapY }, drawingStartPoint, null, null);
        snapX = mp.x;
        snapY = mp.y;
        mouseCurrentPos = { x: snapX, y: snapY };
        redraw2D();
    }
}

function on2DMouseUp(e) {
    // le relâchement compte pour le plan seulement s'il a lieu sur le canevas ou termine une action en cours
    const surPlan = e.target === canvas2D;
    const actionEnCours = !!(isPanning || draggingWall || draggingEl2D || (selectionBoxStart && selectionBoxEnd));
    const layoutMoved = !!((draggingWall && draggingWall.moved) || (draggingEl2D && draggingEl2D.moved));
    if (isPanning) isPanning = false;
    if (selectionBoxStart && selectionBoxEnd) {
        const start = selectionBoxStart;
        const end = selectionBoxEnd;
        const left = Math.min(start.x, end.x);
        const right = Math.max(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const bottom = Math.max(start.y, end.y);
        const isEnclosing = end.x >= start.x;
        const inRect = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
        const segmentIntersectsRect = (a, b) => {
            const dx = b.x - a.x, dy = b.y - a.y;
            let t0 = 0, t1 = 1;
            const p = [-dx, dx, -dy, dy];
            const q = [a.x - left, right - a.x, a.y - top, bottom - a.y];
            for (let i = 0; i < 4; i++) {
                if (p[i] === 0) {
                    if (q[i] < 0) return false;
                } else {
                    const t = q[i] / p[i];
                    if (p[i] < 0) t0 = Math.max(t0, t);
                    else t1 = Math.min(t1, t);
                    if (t0 > t1) return false;
                }
            }
            return true;
        };
        const matched = Math.hypot(end.x - start.x, end.y - start.y) > 4 / zoom && !projectData.wallsLocked
            ? wallsOn().filter(w => {
                const a = { x: w.x1, y: w.y1 }, b = { x: w.x2, y: w.y2 };
                return isEnclosing
                    ? inRect(a) && inRect(b)
                    : segmentIntersectsRect(a, b);
            }).map(w => w.id)
            : null;
        // C2 : le rectangle prend aussi les appareils et les ouvertures (suppression groupée)
        const addMode = e.ctrlKey || e.metaKey || e.shiftKey;
        const rectBig = Math.hypot(end.x - start.x, end.y - start.y) > 4 / zoom;
        const devMatch = rectBig ? electricalOn().filter(el => inRect(getElCoords(el))).map(el => el.id) : [];
        const opMatch = rectBig ? openingsOn().filter(op => {
            const w = wallsOn().find(x => x.id === op.wallId);
            if (!w) return false;
            const b = openingBox(op, w);
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
            const t = b.d / len;
            return inRect({ x: w.x1 + t * (w.x2 - w.x1), y: w.y1 + t * (w.y2 - w.y1) });
        }).map(op => op.id) : [];
        if (matched || devMatch.length || opMatch.length) {
            setSelectedWalls(addMode ? [...new Set([...selectedWallIds, ...(matched || [])])] : (matched || []));
            selectedDeviceIds = addMode ? [...new Set([...selectedDeviceIds, ...devMatch])] : devMatch;
            selectedOpeningIds = addMode ? [...new Set([...selectedOpeningIds, ...opMatch])] : opMatch;
            selected3DId = null;
            syncElementInspectors();
        } else if (!addMode) {
            setSelectedWalls([]);
            selectedDeviceIds = [];
            selectedOpeningIds = [];
        }
        selectionBoxStart = null;
        selectionBoxEnd = null;
    }
    if (draggingWall && draggingWall.moved) {
        // même message qu'en 3D : fin de geste et superposition dans la même barre
        const msg = wallMoveMessage(draggingWall.linksBefore, draggingWall.mode === 'move' ? 'déplacé' : 'étiré');
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
    if (draggingWall) draggingWall = null;
    resetWallSnap();
    if (draggingEl2D) draggingEl2D = null;
    // calcul en fond seulement si le relâchement a déplacé quelque chose (évite la signature à chaque clic)
    if (layoutMoved) startCableJob();
    // pas de vidage du cache : la signature du réseau change d'elle-même si une position a bougé
    if (surPlan || actionEnCours) redraw2D();
}

function distToSegment(p, p1, p2) {
    const l2 = (p2.x - p1.x)*(p2.x - p1.x) + (p2.y - p1.y)*(p2.y - p1.y);
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    let t = ((p.x - p1.x)*(p2.x - p1.x) + (p.y - p1.y)*(p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

// ---------- Zoom / recentrage ----------
// =====================================================================
//  AIMANTATION DES MURS : un seul modèle pour tous les gestes
//  (tracer un mur, étirer un bout, prolonger, faire un T).
//  À chaque mouvement on liste les accroches possibles autour du curseur :
//    - bout d'un autre mur ........................ « bout de mur »
//    - mur suivant sur la droite du tracé ......... « mur suivant »
//    - axe d'un autre mur (jonction en T) ......... « mur en T »
//    - angle droit avec un mur posé au point fixe . « angle droit »
//    - alignement sur un mur posé ou sur le tracé . « alignement »
//  La distance se mesure à l'écran (pixels) : le même ressenti à tous les zooms.
//  Une accroche « colle » tant que le curseur reste dans un rayon de sortie plus
//  large que le rayon d'entrée (hystérésis) : pas de saut, pas de collage.
//  L'accroche active est affichée (repère + nom) : on sait où le bout va tomber.
// =====================================================================
const SNAP_RADIUS_PX = 12;     // rayon d'entrée d'une accroche (pixels à l'écran)
const SNAP_RELEASE = 1.8;      // on quitte une accroche au-delà de RADIUS × 1,8
const SNAP_RANK = { end: 0, wall: 0, axis: 1, right: 2, align: 3 };   // départage : les bouts d'abord
const SNAP_LABEL = { end: 'bout de mur', wall: 'mur suivant', axis: 'mur en T', right: 'angle droit', align: 'alignement' };
let wallSnap = null;           // accroche active : { ctx, key, kind, pt }

function resetWallSnap() { wallSnap = null; }

// Toutes les accroches possibles pour le curseur p.
// anchor : point fixe du mur (null pour un premier point) ; dirU : direction du mur étiré (ou null)
function wallSnapCandidates(p, anchor, dirU, excludeId) {
    const list = [];
    const others = wallsOn().filter(w => w.id !== excludeId);
    others.forEach(w => {
        list.push({ key: 'end:' + w.id + ':1', kind: 'end', pt: { x: w.x1, y: w.y1 } });
        list.push({ key: 'end:' + w.id + ':2', kind: 'end', pt: { x: w.x2, y: w.y2 } });
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
        if (l2) {
            const t = ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / l2;
            if (t > 0.02 && t < 0.98) {
                list.push({ key: 'axis:' + w.id, kind: 'axis', pt: { x: w.x1 + dx * t, y: w.y1 + dy * t } });
            }
        }
    });
    if (!anchor) return list;
    // droites issues du point fixe : alignement et angle droit avec les murs qui y arrivent
    const rays = [];
    others.forEach(w => {
        let o = null;
        if (Math.hypot(w.x1 - anchor.x, w.y1 - anchor.y) < 1) o = { x: w.x2, y: w.y2 };
        else if (Math.hypot(w.x2 - anchor.x, w.y2 - anchor.y) < 1) o = { x: w.x1, y: w.y1 };
        if (!o) return;
        const a = Math.atan2(o.y - anchor.y, o.x - anchor.x);
        rays.push({ key: 'align:' + w.id, kind: 'align', ang: a });
        rays.push({ key: 'right:' + w.id + ':+', kind: 'right', ang: a + Math.PI / 2 });
        rays.push({ key: 'right:' + w.id + ':-', kind: 'right', ang: a - Math.PI / 2 });
    });
    if (dirU) rays.push({ key: 'own', kind: 'align', ang: Math.atan2(dirU.y, dirU.x) });
    rays.forEach(r => {
        const ux = Math.cos(r.ang), uy = Math.sin(r.ang);
        const s = (p.x - anchor.x) * ux + (p.y - anchor.y) * uy;   // projection : seulement vers l'avant
        if (s > 0) list.push({ key: r.key, kind: r.kind, pt: { x: anchor.x + ux * s, y: anchor.y + uy * s } });
    });
    // prolongement : point où le tracé rencontre un mur suivant
    if (dirU) {
        others.forEach(w => {
            const vx = w.x2 - w.x1, vy = w.y2 - w.y1, L = Math.hypot(vx, vy);
            if (!L) return;
            const hx = vx / L, hy = vy / L;
            const den = dirU.x * hy - dirU.y * hx;          // nul si parallèles
            if (Math.abs(den) < 1e-6) return;
            const ax = w.x1 - anchor.x, ay = w.y1 - anchor.y;
            const s = (ax * hy - ay * hx) / den;              // distance le long du tracé
            const r = (ax * dirU.y - ay * dirU.x) / den;    // position sur le mur suivant
            if (s <= 1 || r < -2 || r > L + 2) return;
            list.push({ key: 'wall:' + w.id, kind: 'wall', pt: { x: anchor.x + dirU.x * s, y: anchor.y + dirU.y * s } });
        });
    }
    return list;
}

// Point accroché pour un bout de mur (ou p si rien n'est proche).
// F : point fixe (null pour un premier point), u : direction du tracé (ou null), excludeId : mur édité.
function magnetWallEnd(p, F, u, excludeId) {
    const ctx = String(excludeId) + '|' + (F ? F.x.toFixed(1) + ',' + F.y.toFixed(1) : '-');
    const rPx = SNAP_RADIUS_PX / zoom;
    const cands = wallSnapCandidates(p, F, u, excludeId);
    const dist = c => Math.hypot(p.x - c.pt.x, p.y - c.pt.y);
    // meilleure accroche dans le rayon d'entrée (les bouts et le mur suivant d'abord)
    let best = null, bestScore = Infinity;
    cands.forEach(c => {
        const d = dist(c);
        if (!(d <= rPx)) return;   // NaN exclu
        const score = d + SNAP_RANK[c.kind] * rPx * 0.3;
        if (score < bestScore) { bestScore = score; best = c; }
    });
    // accroche en cours : elle tient tant que le curseur reste dans le rayon de sortie,
    // sauf si une accroche plus prioritaire entre dans le rayon d'entrée
    let sticky = null;
    if (wallSnap && wallSnap.ctx === ctx) {
        const same = cands.find(c => c.key === wallSnap.key);
        if (same && dist(same) <= rPx * SNAP_RELEASE) sticky = same;
    }
    let pick = null;
    if (sticky && (!best || SNAP_RANK[best.kind] >= SNAP_RANK[sticky.kind])) pick = sticky;
    else pick = best;

    wallSnap = pick ? { ctx, key: pick.key, kind: pick.kind, pt: pick.pt } : null;
    return pick ? pick.pt : p;
}

function resetZoomPan() {
    recenter2DView();
    redraw2D();
}

// Écritures, réglables une par une, en 2D comme en 3D : textes (noms de pièces), cotes de longueur, noms des niveaux reliés
let writingsShown = { text: true, cote: true, niveau: true };
function toggleWriting2D(kind, label) {
    writingsShown[kind] = !writingsShown[kind];
    const on = writingsShown[kind];
    // tous les boutons de ce type (barre 2D et barre 3D) prennent le même état
    document.querySelectorAll('[data-writing="' + kind + '"]').forEach(b => {
        b.innerHTML = '<b class="font-semibold">' + (on ? 'ON' : 'OFF') + '</b>';
        b.className = 'h-7 px-2 rounded-lg border transition text-[11px] ' +
            (on ? 'border-yellow-400 ring-1 ring-yellow-400/60 bg-slate-800 text-slate-100' : 'border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700');
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (currentMode === '3d') build3DScene(); else redraw2D();
}

// ---------- Appareils, ouvertures, câbles ----------
function toggleCables2D() {
    showCables2D = !showCables2D;   // réglage commun 2D et 3D
    paintAideBtn(document.getElementById('btn-cables-2d'), 'fa-bezier-curve', 'Câbles', showCables2D);
    refreshSelectedView();
}
function openingPos2D(op) {
    const w = projectData.walls.find(x => x.id === op.wallId);
    if (!w) return null;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
    if (len < 1) return null;
    let d = op.distanceFromStart !== undefined ? op.distanceFromStart : (op.positionRatio !== undefined ? op.positionRatio * len : len / 2);
    const hw = openingWidthOf(op) / 2;
    d = Math.max(hw, Math.min(len - hw, d));
    const t = d / len;
    return { x: w.x1 + t * dx, y: w.y1 + t * dy, angle: Math.atan2(dy, dx), th: w.thickness || 10 };
}

// Trémie : position libre (son centre en plan)
function shaftPos2D(sh) {
    return { x: sh.x, y: sh.y, angle: 0, th: 0 };
}

// Point de dérivation d'une trémie : son centre (le câble part de là vers le mur le plus proche)
function derivFacePos2D(sh) {
    return { x: sh.x, y: sh.y, angle: 0 };
}

// Angle de la face avant d'un appareil mural (direction opposée au mur) dans le repère du plan
function elFrontAngle(el) {
    if (CEILING_TYPES.includes(el.type)) return 0;
    const w = projectData.walls.find(x => x.id === el.wallId);
    if (!w) return 0;
    const ux = w.x2 - w.x1, uy = w.y2 - w.y1, l = Math.hypot(ux, uy) || 1;
    const side = el.side !== undefined ? el.side : 1;
    return Math.atan2(side * (-ux / l), side * (uy / l));
}

// Symboles de plan : le mur est à gauche (x = -1), la face avant vers +x
function drawElementSymbol2D(el) {
    const c = getElCoords(el);
    const ink = '#0f172a', paper = 'transparent';
    const circ = el.legendOnly ? null : circuitOf(el);       // circuit propre du point (légende : aucun)
    // circuit de l'anneau : pour une commande, celui de la charge qu'elle pilote
    const ringCirc = el.legendOnly ? null : deviceCircuitOf(el, _controlTargets2D);
    // même couleur que le circuit de l'appareil (légende : circuit par défaut du type)
    const col = deviceColor(el, el.legendOnly ? null : _controlTargets2D) || EL_COLORS[el.type] || '#94a3b8';
    // groupe double / triple / quadruple dont toutes les prises sont sur le même circuit : un seul liseré autour
    const grp = !el.legendOnly && _gangGroups2D ? _gangGroups2D.get(el.id) : null;
    // liseré commun : toujours pour un groupe d'interrupteurs ; pour une prise, seulement si tout le groupe est sur le même circuit
    const isGangRing = !!grp && grp.length > 1 && (gangFamily(el.type) === 'switch' || (!!circ && grp.every(id => {
        const m = projectData.electrical.find(x => x.id === id);
        const mc = m && circuitOf(m);
        return !!mc && mc.id === circ.id;
    })));
    const ringLead = isGangRing && grp[0] === el.id;
    const ang = elFrontAngle(el);
    const t = el.type;
    // prise d'un circuit sélectionné : son liseré clignote (opacité qui alterne)
    const circHot = !isPrintRendering && !!ringCirc && ringCirc.id === selectedCircuitId;
    const LW = el.legendOnly ? 0.5 : 0.6;                    // traits fins sur le plan et sur la légende
    const line = (x1, y1, x2, y2, w, color) => {
        ctx2D.beginPath();
        ctx2D.moveTo(x1, y1);
        ctx2D.lineTo(x2, y2);
        ctx2D.lineWidth = (w || 1.8) * LW;
        ctx2D.strokeStyle = color || col;
        ctx2D.stroke();
    };
    let ringX = 7, ringR = 12, textAt = null;
    ctx2D.save();
    ctx2D.translate(c.x, c.y);
    ctx2D.rotate(ang);
    ctx2D.lineJoin = 'round';
    ctx2D.lineCap = 'round';
    // appareillage du circuit sélectionné : l'appareil lui-même clignote (estompé une phase sur deux)
    const blinkMember = !isPrintRendering && !el.legendOnly && !!_circuitMembers2D && _circuitMembers2D.has(el.id) && el.id !== selected3DId;
    if (blinkMember && !blinkOn) ctx2D.globalAlpha = 0.50;

    if (t === 'outlet_16a' || t === 'outlet_20a' || t === 'outlet_20a_classic' || t === 'outlet_dedicated_20' || t === 'outlet_dedicated_32' || t === 'outlet_switched') {
        // symbole de référence, identique pour toutes les prises ; tout est côté pièce (+x),
        // seul le bout de la broche touche le mur (x = -1)
        const inGang = (_gangSizes2D || computeOutletGangs().sizeOf).get(el.id) > 1;
        const R = isDedicatedOutlet(el) ? 6.0 : (inGang ? 3.4 : 4.5);
        const tipX = -1 + 2 * LW;                  // bout de la broche, arrondi compris, juste au contact du mur
        const barX = tipX + 0.9 * R;               // barre perpendiculaire à la broche
        const cx = barX + R;                       // coupelle : fond posé sur la barre, bord ouvert vers la pièce
        line(tipX, 0, barX, 0, 1.8);               // broche de terre (seul son bout touche le mur)
        line(barX, -1.25 * R, barX, 1.25 * R, 1.8); // barre
        // coupelle : fond blanc, trait ouvert (pas de diamètre)
        ctx2D.beginPath();
        ctx2D.arc(cx, 0, R, Math.PI / 2, Math.PI * 1.5);
        ctx2D.closePath();
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.beginPath();
        ctx2D.arc(cx, 0, R, Math.PI / 2, Math.PI * 1.5);
        ctx2D.lineWidth = 2 * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(cx, R, cx, R + 0.4 * R, 1.8);         // rebords de la coupelle
        line(cx, -R, cx, -R - 0.4 * R, 1.8);
        if (t === 'outlet_switched') {             // repère : prise pilotée par une commande
            ctx2D.beginPath();
            ctx2D.arc(cx + 1.5, R + 3.2, 1.6, 0, Math.PI * 2);
            ctx2D.fillStyle = col;
            ctx2D.fill();
        }
        ringX = 0.95 * R; ringR = R + 3.5;
        textAt = { x: ringX + ringR + 3, y: 0, label: isDedicatedOutlet(el) ? String(dedicatedAmpsOf(el)) : t === 'outlet_switched' ? 'C' : t.slice(7, 9) };
    } else if (isLightingControl(el) || t === 'doorbell_button' || t === 'shutter_control') {
        line(-1, 0, 5, 0, 1.8);
        ctx2D.beginPath();
        ctx2D.arc(8.5, 0, 3.6, 0, Math.PI * 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (1.8) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        if (t === 'switch_pushbutton' || t === 'doorbell_button') {
            ctx2D.beginPath();
            ctx2D.arc(8.5, 0, 1.2, 0, Math.PI * 2);
            ctx2D.fillStyle = col;
            ctx2D.fill();
        } else if (t === 'switch_va_et_vient') {
            line(8.5, 0, 13.5, -4.5, 2);
            line(8.5, 0, 13.5, 4.5, 2);
            ctx2D.fillStyle = col;
            [[13.5, -4.5], [13.5, 4.5]].forEach(([x, y]) => {
                ctx2D.beginPath();
                ctx2D.arc(x, y, 1, 0, Math.PI * 2);
                ctx2D.fill();
            });
        } else if (t === 'shutter_control') {
            // commande de volet : flèche vers le haut (monter) et vers le bas (descendre)
            ctx2D.fillStyle = col;
            ctx2D.beginPath(); ctx2D.moveTo(8.5, -2.4); ctx2D.lineTo(7.4, -0.9); ctx2D.lineTo(9.6, -0.9); ctx2D.closePath(); ctx2D.fill();
            ctx2D.beginPath(); ctx2D.moveTo(8.5, 2.4); ctx2D.lineTo(7.4, 0.9); ctx2D.lineTo(9.6, 0.9); ctx2D.closePath(); ctx2D.fill();
        } else {
            line(8.5, 0, 12.7, -4.2, 1.8);
            ctx2D.fillStyle = col;
            ctx2D.beginPath();
            ctx2D.arc(12.7, -4.2, 1, 0, Math.PI * 2);
            ctx2D.fill();
        }
        ringX = 8; ringR = 10;
        if (t === 'switch_dimmer') {
            // variateur : arc de graduation au-dessus du bouton
            ctx2D.beginPath();
            ctx2D.arc(8.5, 0, 6.2, -1.1, 1.1);
            ctx2D.lineWidth = (1.2) * LW;
            ctx2D.strokeStyle = col;
            ctx2D.stroke();
        } else if (t === 'motion_timer') {
            // détecteur de mouvement : ondes émises vers l'extérieur du bouton
            [6.5, 9.5].forEach(r => {
                ctx2D.beginPath();
                ctx2D.arc(8.5, 0, r, -0.7, 0.7);
                ctx2D.lineWidth = (1.2) * LW;
                ctx2D.strokeStyle = col;
                ctx2D.stroke();
            });
        }
    } else if (t === 'doorbell_chime') {
        // sonnerie : disque clair avec ondes sonores
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 5, 0, Math.PI * 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        [8, 11].forEach(r => {
            ctx2D.beginPath();
            ctx2D.arc(0, 0, r, -0.7, 0.7);
            ctx2D.lineWidth = (1.2) * LW;
            ctx2D.strokeStyle = col;
            ctx2D.stroke();
        });
        ringX = 0; ringR = 13;
    } else if (t === 'shutter_motor') {
        // moteur de volet : petit boîtier clair avec deux traits d'axe
        ctx2D.beginPath();
        ctx2D.roundRect(-7, -5, 14, 10, 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(-4, -2, 4, -2, 1.2, ink);
        line(-4, 2, 4, 2, 1.2, ink);
        ringX = 0; ringR = 10;
    } else if (t === 'wall_light') {
        ctx2D.fillStyle = '#facc15';
        ctx2D.strokeStyle = '#ca8a04';
        ctx2D.lineWidth = (1.8) * LW;
        ctx2D.beginPath();
        ctx2D.roundRect(-3, -7, 3, 14, 1);
        ctx2D.fill();
        ctx2D.stroke();
        line(0, 0, 4, 0, 2, '#eab308');
        ctx2D.beginPath();
        ctx2D.moveTo(4, -6);
        ctx2D.quadraticCurveTo(15, -5, 15, 0);
        ctx2D.quadraticCurveTo(15, 5, 4, 6);
        ctx2D.closePath();
        ctx2D.fillStyle = '#facc15';
        ctx2D.fill();
        ctx2D.lineWidth = (1.8) * LW;
        ctx2D.strokeStyle = '#ca8a04';
        ctx2D.stroke();
        line(17, -5, 21, -7, 1.5, '#eab308');
        line(18, 0, 23, 0, 1.5, '#eab308');
        line(17, 5, 21, 7, 1.5, '#eab308');
        ringX = 10; ringR = 14;
    } else if (t === 'light_spot') {
        // spot encastré : petit disque affleurant avec une lentille au centre
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 6, 0, Math.PI * 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx2D.fillStyle = col;
        ctx2D.fill();
        ringX = 0; ringR = 9;
    } else if (t === 'smoke_detector') {
        // DAAF : disque clair à double cercle (capteur)
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 9, 0, Math.PI * 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 4, 0, Math.PI * 2);
        ctx2D.lineWidth = (1.4) * LW;
        ctx2D.stroke();
        ringX = 0; ringR = 12;
    } else if (t === 'light_ceiling') {
        ctx2D.rotate(-ang);
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 10, 0, Math.PI * 2);
        ctx2D.fillStyle = '#fef9c3';
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(-6.5, -6.5, 6.5, 6.5, 1.5, ink);
        line(-6.5, 6.5, 6.5, -6.5, 1.5, ink);
        ringX = 0; ringR = 13.5;
    } else if (t === 'junction_box') {
        // boîte de dérivation posée : petit carré clair, croix de fermeture
        ctx2D.beginPath();
        ctx2D.rect(-6, -6, 12, 12);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2) * LW;
        ctx2D.strokeStyle = '#64748b';   // liseré gris foncé, visible sur fond clair comme sombre
        ctx2D.stroke();
        line(-4, 0, 4, 0, 1.2, ink);
        line(0, -4, 0, 4, 1.2, ink);
        ringX = 0; ringR = 9;
    } else if (t === 'meter') {
        // compteur posé : coffret clair, cadran de mesure et sigle kWh
        ctx2D.beginPath();
        ctx2D.rect(-7, -10, 14, 20);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2.2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        ctx2D.beginPath();
        ctx2D.arc(0, -2, 3.2, 0, Math.PI * 2);
        ctx2D.strokeStyle = col;
        ctx2D.lineWidth = (1) * LW;
        ctx2D.stroke();
        ctx2D.fillStyle = col;
        ctx2D.font = 'bold 4px Inter, sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.fillText('kWh', 0, 6.5);
        ringX = 0; ringR = 12;
    } else if (t === 'panel') {
        ctx2D.beginPath();
        ctx2D.rect(-1, -18, 11, 36);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = (2.2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(-1, -6, 10, -6, 1, col);                               // rangées de modules
        line(-1, 6, 10, 6, 1, col);
        ctx2D.beginPath();                                          // éclair
        ctx2D.moveTo(3, -4); ctx2D.lineTo(7.5, -0.5); ctx2D.lineTo(5, -0.5);
        ctx2D.lineTo(7.5, 4); ctx2D.lineTo(2.5, 0.5); ctx2D.lineTo(5, 0.5);
        ctx2D.closePath();
        ctx2D.fillStyle = col;
        ctx2D.fill();
        ringR = 0;
    }

    // anneau de circuit : permanent sur les points de circuit, sauf sonnerie et moteur de volet.
    // Les autres appareils (commandes, sonnerie, moteur) n'en ont pas au repos : il apparaît en clignotant quand leur circuit est sélectionné
    // prise simple (non groupée) : pas de liseré rond, ni au repos ni quand son circuit est sélectionné
    // pas d'anneau rond sur ces appareils, ni au repos ni quand leur circuit est sélectionné
    const NO_RING_TYPES = ['doorbell_chime', 'shutter_motor', 'outlet_dedicated_20', 'outlet_dedicated_32', 'outlet_switched', 'shutter_control'];
    // prise simple (non groupée) : même règle ; les groupes double, triple et quadruple gardent leur anneau
    const simpleOutlet = GANGABLE_OUTLETS.includes(t) && !((_gangSizes2D || computeOutletGangs().sizeOf).get(el.id) > 1);
    const ringless = NO_RING_TYPES.includes(t) || simpleOutlet;
    const permanentRing = !!circ && !ringless;
    if (ringCirc && ringR > 0 && !isGangRing && !ringless && (permanentRing || circHot)) {
        ctx2D.beginPath();
        ctx2D.arc(ringX, 0, ringR, 0, Math.PI * 2);
        ctx2D.lineWidth = (2.2) * LW;
        ctx2D.strokeStyle = circuitColor(ringCirc);
        ctx2D.globalAlpha = circHot ? (blinkOn ? 0.95 : 0.5) : 0.9;
        ctx2D.stroke();
        ctx2D.globalAlpha = 1;
    }
    // liseré unique autour du groupe (tracé une fois, par la première prise), dans le repère du symbole
    if (ringLead && ringR > 0) {
        let y0 = 0, y1 = 0;
        grp.forEach(id => {
            const m = projectData.electrical.find(x => x.id === id);
            if (!m) return;
            const p = getElCoords(m);
            const ly = -(p.x - c.x) * Math.sin(ang) + (p.y - c.y) * Math.cos(ang);
            y0 = Math.min(y0, ly); y1 = Math.max(y1, ly);
        });
        ctx2D.beginPath();
        ctx2D.roundRect(ringX - ringR, y0 - ringR, 2 * ringR, y1 - y0 + 2 * ringR, ringR);
        ctx2D.lineWidth = (2.2) * LW;
        ctx2D.strokeStyle = col;
        ctx2D.globalAlpha = circHot ? (blinkOn ? 0.95 : 0.5) : 0.9;
        ctx2D.stroke();
        ctx2D.globalAlpha = 1;
    }
    // sélection (simple ou multiple) : cadre comme en 3D, autour du symbole
    if (!isPrintRendering && (el.id === selected3DId || selectedDeviceIds.includes(el.id))) {
        const r = Math.max(ringR, 10);
        if (t === 'panel') selectionFrame2D(-5, -22, 19, 44);
        else if (t === 'meter') selectionFrame2D(-11, -14, 22, 28);
        else selectionFrame2D(ringX - r, -r, 2 * r, 2 * r);
    }
    ctx2D.restore();

    // calibre (10 / 16 / 20 / 32), hors du symbole, dans sa couleur. Absent de la légende : le libellé porte déjà l'ampérage, et le chiffre chevauche les lignes voisines
    if (textAt && !el.legendOnly) {
        const fx = Math.cos(ang), fy = Math.sin(ang);
        ctx2D.save();
        if (blinkMember && !blinkOn) ctx2D.globalAlpha = 0.50;
        ctx2D.fillStyle = col;
        ctx2D.font = 'bold 6.5px Inter, sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.translate(c.x + fx * (textAt.x + 1), c.y + fy * (textAt.x + 1));
        ctx2D.rotate(-rot2D);
        ctx2D.fillText(textAt.label, 0, 0);
        ctx2D.restore();
    }
}

// Cotes des murs : taille fixe à l'écran (11 px, quel que soit le zoom), texte « 4,00 m »,
// placées hors de l'épaisseur des murs, à l'écart des appareils, des ouvertures et des autres cotes
function drawWallLengthLabels() {
    // k : taille d'un pixel écran en unités du plan, pour que police, marges et halo restent fixes à l'écran
    const k = 1 / zoom;
    ctx2D.font = 'bold ' + (textSizePx('cote') * k) + 'px Inter, sans-serif';
    ctx2D.textAlign = 'center';
    ctx2D.textBaseline = 'middle';
    const hh = 7 * k;
    const obstacles = [];
    electricalOn().forEach(el => {
        const p = getElCoords(el);
        obstacles.push({ x: p.x, y: p.y, r: el.type === 'panel' ? 24 : 18 });
    });
    openingsOn().forEach(op => {
        const p = openingPos2D(op);
        if (p) obstacles.push({ x: p.x, y: p.y, r: op.type === 'door_single' ? 50 : 62 });
    });
    const placed = [];
    const rectHitsCircle = (cx, cy, hw, o) => {
        const nx = Math.max(cx - hw, Math.min(o.x, cx + hw));
        const ny = Math.max(cy - hh, Math.min(o.y, cy + hh));
        return Math.hypot(o.x - nx, o.y - ny) < o.r;
    };
    const rectHitsWall = (cx, cy, hw, w) => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        const margin = (w.thickness || 10) / 2 + 3;
        const steps = Math.max(1, Math.ceil(len / 8));
        for (let i = 0; i <= steps; i++) {
            const px = w.x1 + dx * i / steps, py = w.y1 + dy * i / steps;
            if (px > cx - hw - margin && px < cx + hw + margin && py > cy - hh - margin && py < cy + hh + margin) return true;
        }
        return false;
    };
    wallsOn().forEach(wall => {
        const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const label = (len / 100).toFixed(2).replace('.', ',') + ' m';
        const hw = ctx2D.measureText(label).width / 2 + 3 * k;
        const nx = -dy / len, ny = dx / len;
        const off = (wall.thickness || 10) / 2 + 4 * k + hh;
        let best = null, bestScore = Infinity;
        [0.5, 0.35, 0.65, 0.2, 0.8].forEach(t => {
            [1, -1].forEach(side => {
                const mx = wall.x1 + dx * t, my = wall.y1 + dy * t;
                // décalage perpendiculaire suffisant pour sortir de l'épaisseur du mur, même pour un mur oblique
                const extra = Math.abs(nx) * hw + Math.abs(ny) * hh - hh;
                const d = off + Math.max(0, extra);
                const cx = mx + nx * side * d, cy = my + ny * side * d;
                let score = 0;
                obstacles.forEach(o => { if (rectHitsCircle(cx, cy, hw, o)) score += 3; });
                wallsOn().forEach(w => { if (rectHitsWall(cx, cy, hw, w)) score += 3; });
                placed.forEach(r => { if (Math.abs(r.x - cx) < r.hw + hw && Math.abs(r.y - cy) < hh * 2) score += 3; });
                score += Math.abs(t - 0.5) * 0.1;
                if (score < bestScore) { bestScore = score; best = { x: cx, y: cy }; }
            });
        });
        placed.push({ x: best.x, y: best.y, hw });
        ctx2D.save();
        ctx2D.translate(best.x, best.y);
        ctx2D.rotate(-rot2D);
        ctx2D.globalAlpha = 0.50;
        ctx2D.fillStyle = currentTheme === 'light' ? '#0f172a' : '#f1f5f9';
        ctx2D.fillText(label, 0, 0);
        ctx2D.restore();
    });
    ctx2D.textBaseline = 'alphabetic';
}


// Tailles des groupes de prises (double, triple…), calculées une fois par dessin du plan
let _gangSizes2D = null;
let _gangGroups2D = null;
// Appareillages du circuit sélectionné (clignotent eux-mêmes), calculé une fois par dessin du plan
let _circuitMembers2D = null;
// Commande -> charge qu'elle pilote, calculé une fois par dessin du plan
let _controlTargets2D = new Map();

// Même couleur, plus sombre (facteur 0,55) : sert au clignotement du fil sélectionné en 2D
function darkerCss2D(css) {
    try {
        const c = new THREE.Color(css);
        c.multiplyScalar(0.55);
        return c.getStyle();
    } catch (e) {
        return css;
    }
}

// Cadre de sélection 2D : mêmes couleurs, mêmes tirets et mêmes décalages qu'en 3D (selectionFramePalette3D,
// selectionIsMulti3D). x, y, w, h : rectangle dans le repère courant (déjà tourné pour un mur).
function selectionFrame2D(x, y, w, h) {
    const multi = selectionIsMulti3D();
    const [base, alt] = selectionFramePalette3D();
    // valeurs de la 3D, en pixels écran : multiple = tirets 2/2 décalés de 2 px ; simple = tirets 4/2 décalés de 4 px
    const pad = (multi ? 2 : 4) / zoom;
    const dash = (multi ? 2 : 4) / zoom;
    const gap = 2 / zoom;
    ctx2D.save();
    ctx2D.beginPath();
    ctx2D.rect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
    ctx2D.lineWidth = 1 / zoom;
    ctx2D.strokeStyle = blinkOn ? base : alt;
    ctx2D.setLineDash([dash, gap]);
    ctx2D.stroke();
    ctx2D.restore();
}

// Dessin d'une porte ou d'une fenêtre sur le mur. ghostColor : fantôme de pose (translucide, couleur donnée)
function drawOpening2D(op, ghostColor, colliding) {
        const p = openingPos2D(op);
        if (!p) return;
        const isDoor = op.type === 'door_single';
        const opWall = projectData.walls.find(x => x.id === op.wallId);
        const w = opWall ? openingBox(op, opWall).half * 2 : (isDoor ? 96 : 120);
        ctx2D.save();
        if (ghostColor) ctx2D.globalAlpha = 0.7;
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        const selOp = op.id === selected3DId || selectedOpeningIds.includes(op.id);
        const lightOp = currentTheme === 'light';
        ctx2D.strokeStyle = selOp
            ? (isDoor ? '#b07a4a' : (lightOp ? '#1e40af' : '#3db1ff'))
            : (ghostColor || (isDoor ? '#a16207' : (lightOp ? '#0369a1' : '#49b6ff')));
        ctx2D.lineWidth = 1;
        ctx2D.beginPath();
        if (isDoor) {
            const hx = doorHingeSign(op);
            const hingeX = hx * w / 2;
            const swing = op.side === -1 ? 1 : -1;
            const start = hx > 0 ? Math.PI : 0;
            const end = hx > 0
                ? (swing > 0 ? Math.PI / 2 : 3 * Math.PI / 2)
                : (swing > 0 ? Math.PI / 2 : -Math.PI / 2);
            const anticlockwise = hx > 0 ? swing > 0 : swing < 0;
            ctx2D.moveTo(hingeX, p.th / 2);
            ctx2D.lineTo(hingeX + (hx > 0 ? -1 : 1) * w * Math.cos(end), p.th / 2 + w * Math.sin(end));
            // Sans ce moveTo, l'arc relie le bout de la feuille à son début par une diagonale
            ctx2D.moveTo(hingeX + w * Math.cos(start), p.th / 2 + w * Math.sin(start));
            ctx2D.arc(hingeX, p.th / 2, w, start, end, anticlockwise);
        } else {
            ctx2D.rect(-w / 2, -p.th / 2, w, p.th);
            ctx2D.moveTo(-w / 2, 0);
            ctx2D.lineTo(w / 2, 0);
        }
        ctx2D.stroke();
        // liseré de l'ouverture de porte, en tirets (tracé à part : un tiret s'appliquerait à tout le chemin)
        if (isDoor) {
            ctx2D.setLineDash([4, 3]);
            ctx2D.strokeRect(-w / 2, -p.th / 2, w, p.th);
            ctx2D.setLineDash([]);
        }

        // fenêtre : deux ventaux ouverts à 90° depuis chaque montant, du côté d'ouverture ; arcs en tirets = trajet balayé
        if (!isDoor) {
            const sy = op.side === -1 ? 1 : -1;   // même convention que windowSquaresOf
            const L = w / 2;
            ctx2D.beginPath();
            ctx2D.moveTo(-w / 2, 0); ctx2D.lineTo(-w / 2, sy * L);
            ctx2D.moveTo(w / 2, 0); ctx2D.lineTo(w / 2, sy * L);
            ctx2D.stroke();
            ctx2D.setLineDash([4, 3]);
            ctx2D.beginPath();
            ctx2D.arc(-w / 2, 0, L, 0, sy * Math.PI / 2, sy < 0);
            // Sans ce moveTo, l'arc relie la fin du premier arc au début du second par une diagonale
            ctx2D.moveTo(w / 2 - L, 0);
            ctx2D.arc(w / 2, 0, L, Math.PI, sy * Math.PI / 2, sy > 0);
            ctx2D.stroke();
            ctx2D.setLineDash([]);
        }

        // porte ou fenêtre en superposition ou citée par une alerte : contour rouge clignotant, comme les appareils
        if (!ghostColor && !isPrintRendering && blinkOn && colliding && colliding.has(op.id)) {
            ctx2D.strokeStyle = '#ef4444';
            ctx2D.lineWidth = 2;
            ctx2D.beginPath();
            ctx2D.rect(-w / 2 - 3, -p.th / 2 - 3, w + 6, p.th + 6);
            ctx2D.stroke();
        }
        if (!ghostColor && !isPrintRendering && (op.id === selected3DId || selectedOpeningIds.includes(op.id))) {
            selectionFrame2D(-w / 2, -p.th / 2, w, p.th);
        }
        ctx2D.restore();
}

// Parties d'un segment de câble situées hors des emprises des appareils (paires de points) ; affichage seulement
function cableOutsideDevices2D(a, b, discs) {
    const dx = b.x - a.x, dy = b.y - a.y, A = dx * dx + dy * dy;
    const cut = [];
    discs.forEach(({ c, R }) => {
        const fx = a.x - c.x, fy = a.y - c.y;
        const B = 2 * (dx * fx + dy * fy), C = fx * fx + fy * fy - R * R;
        const disc = B * B - 4 * A * C;
        if (disc <= 0) return;
        const root = Math.sqrt(disc);
        const t0 = Math.max(0, (-B - root) / (2 * A)), t1 = Math.min(1, (-B + root) / (2 * A));
        if (t1 > t0) cut.push([t0, t1]);
    });
    cut.sort((u, v) => u[0] - v[0]);
    const spans = [];
    let t = 0;
    cut.forEach(([t0, t1]) => {
        if (t0 > t) spans.push([t, t0]);
        t = Math.max(t, t1);
    });
    if (t < 1) spans.push([t, 1]);
    return spans.map(([p, q]) => [{ x: a.x + dx * p, y: a.y + dy * p }, { x: a.x + dx * q, y: a.y + dy * q }]);
}

function draw2DEquipment() {
    // 243 : les conflits sont calculés une seule fois par image (au lieu de 4 fois)
    let _collidingCache = null;
    const collidingNow = () => _collidingCache || (_collidingCache = collidingElementIds());
    const gangs = computeOutletGangs();
    _gangSizes2D = gangs.sizeOf;
    
    _gangGroups2D = gangs.groupOf;
    const selCircuit = selectedCircuitId ? circuitById(selectedCircuitId) : null;
    _circuitMembers2D = selCircuit ? circuitHighlightIds(selCircuit) : null;
    ensureCircuitAssignment();
    // 1. Câbles (trait plein = plafond, pointillé = plinthe)
    const net = projectData.electrical.length ? getCableNetwork() : null;
    _controlTargets2D = controlTargetsOf(net);
    if (showCables2D && net) {
        const selectedElement = projectData.electrical.find(el => el.id === selected3DId);
        const isLightingSelection = selectedElement &&
            (isControl(selectedElement) || isControlledLoad(selectedElement));
        // circuit en réglage manuel sélectionné : son surlignage l'emporte sur la liaison de la lumière cliquée
        const manualKeep = !!cableManualId && selectedCircuitId === cableManualId;
        const selectedLinkIds = new Set(isLightingSelection && !manualKeep
            ? (net.controlLinks || [])
                .filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId))
                .flatMap(link => link.linkIds || [])
            : []);
        const hasLinkFocus = selectedLinkIds.size > 0;
        const focusCircuit = !hasLinkFocus && selectedCircuitId
            ? circuitById(selectedCircuitId)
            : null;
        const focusMode = hasLinkFocus || !!focusCircuit;
        // câbles hors focus : couleur pâle pleine (pas de transparence, sinon les croisements se mélangent)
        const dimColor = currentTheme === 'light' ? '#d5dde8' : '#2f3e52';

        ctx2D.lineCap = 'round';
        const deviceDiscs = electricalOn().map(el => ({ c: getElCoords(el), R: isDedicatedOutlet(el) ? 14 : 12 }));
        const ctlColors = switchedOutletCableColors(net);
        const linkCableColors = controlCableColors(net, null);
        // Le cheminement bas et le cheminement haut ont les mêmes coordonnées en plan : on les décale
        // de part et d'autre de l'axe pour que les deux restent visibles (haut : trait plein, bas : pointillé).
        ctx2D.globalAlpha = 1;
        net.segments.forEach(s => {
            const linkHighlighted = (s.links || []).some(id => selectedLinkIds.has(id));
            // lumière ou commande sélectionnée : seuls les tronçons de sa liaison restent visibles
            if (hasLinkFocus && !linkHighlighted) return;
            const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, len = Math.hypot(dx, dy);
            if (len < 0.05) return;
            const isLow = s.a.z < 50 && s.b.z < 50;
            const off = isLow ? -3.5 : (s.a.z > 150 && s.b.z > 150 ? 3.5 : 0);
            const ox = -dy / len * off, oy = dx / len * off;
            const ids = [...new Set((s.cids || []).filter(Boolean))];
            const circs = ids.map(id => projectData.circuits.find(c => c.id === id)).filter(Boolean);
            const focusHit = hasLinkFocus ? linkHighlighted : (!!focusCircuit && (s.cids || []).includes(focusCircuit.id));
            // 253 : circuit ou liaison sélectionné : les autres tronçons ne sont plus dessinés (sauf les escaliers)
            if (focusMode && !focusHit && !s.stairHit) return;
            // couleur du lien sélectionné uniquement (un tronçon partagé peut porter aussi d'autres commandes)
            const linkColor = (s.links || []).filter(id => selectedLinkIds.has(id)).map(id => linkCableColors.get(id)).find(Boolean);
            const focusColor = hasLinkFocus ? (linkColor || '#ffffff') : (focusCircuit && (s.cids || []).includes(focusCircuit.id) ? circuitColor(focusCircuit) : '#ffffff');
            // fil du circuit (ou de la commande) sélectionné : il alterne avec le contraste, comme les appareils
            const focusBlinkColour = (!isPrintRendering && !blinkOn) ? darkerCss2D(focusColor) : focusColor;
            ctx2D.lineWidth = (focusMode && focusHit ? 3.0 : 2.0) / zoom;
            const nx = -dy / len, ny = dx / len;
            // trace le tronçon décalé de `shift` perpendiculairement à sa direction ; faux si rien à tracer
            const strokeRun = (shift) => {
                const pieces = cableOutsideDevices2D(
                    { x: s.a.x + ox + nx * shift, y: s.a.y + oy + ny * shift },
                    { x: s.b.x + ox + nx * shift, y: s.b.y + oy + ny * shift },
                    deviceDiscs);
                if (!pieces.length) return false;
                ctx2D.beginPath();
                pieces.forEach(([p, q]) => { ctx2D.moveTo(p.x, p.y); ctx2D.lineTo(q.x, q.y); });
                return true;
            };
            if (!strokeRun(0)) return;
            // couleurs du tronçon : circuits qui le traversent, plus la couleur des commandes vers une prise commandée
            // (triées pour garder le même ordre d'un tronçon à l'autre)
            const bandColors = focusMode ? [] : [...new Set([...circs.map(c => circuitColor(c)), ...(s.links || []).filter(id => ctlColors.has(id)).map(id => ctlColors.get(id))])].sort();
            if (s.stairHit || focusMode || bandColors.length <= 1) {
                ctx2D.globalAlpha = 1.0;
                ctx2D.strokeStyle = s.stairHit ? (blinkOn ? '#ef4444' : '#fecaca') : focusMode
                    ? (focusHit ? focusColor : dimColor)
                    : bandColors[0] || '#94a3b8';
                ctx2D.setLineDash(isLow ? [8, 6] : []);
                ctx2D.stroke();
            } else {
                // tronçon partagé : une voie par circuit, côte à côte, tracée d'un seul tenant
                // (chaque couleur garde la même longueur visible, sans rupture aux jonctions)
                const n = bandColors.length, lane = 3;
                ctx2D.lineCap = 'butt';
                ctx2D.setLineDash(isLow ? [8, 6] : []);
                bandColors.forEach((hex, k) => {
                    if (!strokeRun((k - (n - 1) / 2) * lane)) return;
                    ctx2D.strokeStyle = hex;
                    ctx2D.stroke();
                });
                ctx2D.lineCap = 'round';
            }
        });
        ctx2D.setLineDash([]);
        ctx2D.globalAlpha = 1;
    }

    // tronçon de câble sélectionné : liseré à tirets qui alterne entre les couleurs du cadre de sélection, autour de chaque segment de la travée
    if (showCables2D && net && selectedCableKey) {
        ctx2D.save();
        ctx2D.setLineDash([4 / zoom, 2 / zoom]);
        ctx2D.lineWidth = 1 / zoom;
        const [selBase, selAlt] = selectionFramePalette3D();
        ctx2D.strokeStyle = blinkOn ? selBase : selAlt;
        const R = 6;   // demi-largeur du liseré (cm), autour du câble tel qu'il est tracé
        net.segments.forEach(sg => {
            if (cableSegKey(sg, cableManualId) !== selectedCableKey) return;
            const isLow = sg.a.z < 50 && sg.b.z < 50;
            const off = isLow ? -3.5 : (sg.a.z > 150 && sg.b.z > 150 ? 3.5 : 0);
            const dx = sg.b.x - sg.a.x, dy = sg.b.y - sg.a.y, len = Math.hypot(dx, dy);
            ctx2D.beginPath();
            if (len < 0.5) {
                ctx2D.arc(sg.a.x, sg.a.y, R, 0, Math.PI * 2);   // montée : vue de dessus, un point
            } else {
                const ox = -dy / len * off, oy = dx / len * off;   // même décalage que le tracé du câble
                const nx = -dy / len * R, ny = dx / len * R;
                const p = (q, s) => ({ x: q.x + ox + nx * s, y: q.y + oy + ny * s });
                const a1 = p(sg.a, 1), a2 = p(sg.a, -1), b1 = p(sg.b, 1), b2 = p(sg.b, -1);
                ctx2D.moveTo(a1.x, a1.y);
                ctx2D.lineTo(b1.x, b1.y);
                ctx2D.lineTo(b2.x, b2.y);
                ctx2D.lineTo(a2.x, a2.y);
                ctx2D.closePath();
            }
            ctx2D.stroke();
        });
        ctx2D.restore();
    }

    // 2. Ouvertures
    // calculé une fois par image, puis partagé par toutes les ouvertures
    const collidingOpen = !isPrintRendering && blinkOn ? collidingNow() : null;
    openingsOn().forEach(op => drawOpening2D(op, null, collidingOpen));
    // 2 bis. Trémies (D5) : carré en pointillés, aligné sur le mur
    shaftsOn().forEach(sh => {
        const p = shaftPos2D(sh);
        if (!p) return;
        const s = sh.size || 40, hot = sh.id === selected3DId;
        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        // toujours visible en fort (comme à la sélection) ; sélectionnée : liseré blanc extérieur
        ctx2D.fillStyle = currentTheme === 'light' ? 'rgba(15,23,42,0.30)' : 'rgba(248,250,252,0.30)';
        ctx2D.strokeStyle = shaftColour();
        ctx2D.lineWidth = 3 / zoom;
        ctx2D.fillRect(-s / 2, -s / 2, s, s);
        ctx2D.strokeRect(-s / 2, -s / 2, s, s);
        if (!isPrintRendering && (hot || selectedOpeningIds.includes(sh.id))) {
            selectionFrame2D(-s / 2, -s / 2, s, s);
        }
        // chevauchement avec une ouverture ou un appareil : contour rouge clignotant, comme les appareils
        if (!isPrintRendering && blinkOn && collidingNow().has(sh.id)) {
            ctx2D.strokeStyle = '#ef4444';
            ctx2D.lineWidth = 3 / zoom;
            ctx2D.strokeRect(-s / 2 - 10 / zoom, -s / 2 - 10 / zoom, s + 20 / zoom, s + 20 / zoom);
        }
        ctx2D.restore();
        // point de dérivation : là où ce niveau prend ses circuits dans la gaine
        ctx2D.save();
        const dq = derivFacePos2D(sh);
        const dh = DERIV_HALF;   // demi-côté du carré : il grossit et rétrécit avec le zoom
        ctx2D.fillStyle = '#f8fafc';
        ctx2D.strokeStyle = '#334155';
        ctx2D.lineWidth = 1.5 / zoom;
        ctx2D.fillRect(dq.x - dh, dq.y - dh, dh * 2, dh * 2);
        ctx2D.strokeRect(dq.x - dh, dq.y - dh, dh * 2, dh * 2);
        ctx2D.fillStyle = currentTheme === 'light' ? '#0f172a' : '#f8fafc';
        ctx2D.font = 'bold ' + (textSizePx('niveau') / zoom) + 'px sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        if (writingsShown.niveau) drawArrowText(ctx2D, shaftLevelNames(sh).join(' ↔ '), p.x, p.y - s / 2 - (textSizePx('niveau') / 2 + 20) / zoom, textSizePx('niveau') / zoom, 1.6, 'sans-serif');
        ctx2D.restore();
    });
    // 2 ter. Escaliers : emprise au sol, marches tracées, flèche vers la marche haute
    if (stairsOn().length) {
        const stairColliding = collidingNow();
        stairsOn().forEach(st => drawStair2D(st, stairColliding));
    }
    // 3. Appareils électriques (symboles de plan)
    electricalOn().forEach(el => drawElementSymbol2D(el));
    if (!isPrintRendering && blinkOn) {
        const colliding = collidingNow();
        electricalOn().forEach(el => {
            if (!colliding.has(el.id)) return;
            const p = getElCoords(el);
            ctx2D.beginPath();
            ctx2D.arc(p.x, p.y, 20, 0, Math.PI * 2);
            ctx2D.fillStyle = 'rgba(239,68,68,0.35)';
            ctx2D.fill();
            ctx2D.lineWidth = 3;
            ctx2D.strokeStyle = '#ef4444';
            ctx2D.stroke();
        });
    }
    if (writingsShown.cote) drawWallLengthLabels();
    ctx2D.textBaseline = 'alphabetic';
}

// Escalier ou trémie saisi au clic : décalage entre le curseur et le centre, pour glisser sans saut
function stairGrab(id, coords) {
    const st = (projectData.stairs || []).find(s => s.id === id) || (projectData.shafts || []).find(s => s.id === id);
    if (!st) return null;
    // Calcul du point de saisie en tenant compte de la rotation (centre de l'escalier)
    const angleRad = (st.angleDeg || 0) * Math.PI / 180;
    const dx = coords.x - st.x;
    const dy = coords.y - st.y;
    // Rotation inverse pour obtenir le décalage local
    const cosA = Math.cos(-angleRad);
    const sinA = Math.sin(-angleRad);
    return {
        x: dx * cosA - dy * sinA,
        y: dx * sinA + dy * cosA
    };
}

// Sens de la flèche d'un escalier : +1 si le niveau relié est au-dessus du niveau affiché (montée vers +x),
// -1 s'il est en dessous (la flèche descend vers le niveau relié)
function stairArrowSign(st) {
    const elevOf = id => Number(((projectData.levels || []).find(l => l.id === id) || {}).elevation) || 0;
    const here = elevOf(activeLevelId);
    const others = (st.levelIds || [st.levelId]).filter(id => id !== activeLevelId);
    if (!others.length) return 1;
    return others.some(id => elevOf(id) > here) ? 1 : -1;
}

// Escalier en 2D : emprise orientée, traits de marches, flèche vers la marche haute, nom des niveaux reliés
function drawStair2D(st, colliding) {
    const L = st.length || 300, W = st.width || 90, n = stairStepCount(st), hot = st.id === selected3DId;
    ctx2D.save();
    ctx2D.translate(st.x, st.y);
    ctx2D.rotate((st.angleDeg || 0) * Math.PI / 180);
    ctx2D.fillStyle = 'rgba(167,139,250,0.28)';
    ctx2D.strokeStyle = '#8b5cf6';
    ctx2D.lineWidth = 2.5 / zoom;
    ctx2D.fillRect(-L / 2, -W / 2, L, W);
    // niveau d'arrivée (où l'escalier n'a pas été posé) : contour en pointillés
    if (st.levelId !== activeLevelId) ctx2D.setLineDash([6 / zoom, 4 / zoom]);
    ctx2D.strokeRect(-L / 2, -W / 2, L, W);
    ctx2D.setLineDash([]);
    ctx2D.beginPath();
    for (let i = 1; i < n; i++) {
        const x = -L / 2 + i * L / n;
        ctx2D.moveTo(x, -W / 2);
        ctx2D.lineTo(x, W / 2);
    }
    ctx2D.lineWidth = 1 / zoom;
    ctx2D.stroke();
    // flèche : montée vers la marche haute (sens +x de l'emprise)
    // le sens de la flèche suit le niveau relié : vu de l'étage haut, elle descend
    const sgn = stairArrowSign(st);
    const tip = L * 0.42 * sgn, head = 9 / zoom * sgn;
    ctx2D.beginPath();
    ctx2D.moveTo(-tip, 0); ctx2D.lineTo(tip, 0);
    ctx2D.moveTo(tip, 0); ctx2D.lineTo(tip - head, -head * 0.6);
    ctx2D.moveTo(tip, 0); ctx2D.lineTo(tip - head, head * 0.6);
    ctx2D.strokeStyle = '#c4b5fd';
    ctx2D.lineWidth = 2 / zoom;
    ctx2D.stroke();
    if (!isPrintRendering && (hot || selectedOpeningIds.includes(st.id))) selectionFrame2D(-L / 2, -W / 2, L, W);
    if (!isPrintRendering && blinkOn && colliding.has(st.id)) {
        ctx2D.strokeStyle = '#ef4444';
        ctx2D.lineWidth = 3 / zoom;
        ctx2D.strokeRect(-L / 2 - 10 / zoom, -W / 2 - 10 / zoom, L + 20 / zoom, W + 20 / zoom);
    }
    ctx2D.restore();
    ctx2D.save();
    ctx2D.fillStyle = currentTheme === 'light' ? '#6d28d9' : '#c4b5fd';
    ctx2D.font = 'bold ' + (textSizePx('niveau') / zoom) + 'px sans-serif';
    ctx2D.textAlign = 'center';
    // demi-hauteur de l'emprise tournée (en cm) ; l'étiquette est à 30 px à l'écran au-dessus de son bord haut
    const aRad = (st.angleDeg || 0) * Math.PI / 180;
    const hy = Math.abs(Math.sin(aRad)) * L / 2 + Math.abs(Math.cos(aRad)) * W / 2;
    if (writingsShown.niveau) drawArrowText(ctx2D, stairLevelLabel(st), st.x, st.y - hy - 30 / zoom, textSizePx('niveau') / zoom, 1.6, 'sans-serif');
    ctx2D.restore();
}

// Porte : emprise = rectangle de la baie + quart de cercle balayé par le vantail (même géométrie que drawOpening2D)
function doorHit2D(op, p, coords) {
    const wall = projectData.walls.find(x => x.id === op.wallId);
    if (!wall) return false;
    const w = openingBox(op, wall).half * 2;
    const th = p.th;
    const dx = coords.x - p.x, dy = coords.y - p.y;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    const lx = dx * c + dy * s;   // repère de la baie : x le long du mur
    const ly = -dx * s + dy * c;  // y perpendiculaire au mur
    const m = 6 / zoom;           // marge de clic
    if (Math.abs(lx) <= w / 2 + m && Math.abs(ly) <= th / 2 + m) return true;
    // vantail : arc de rayon w autour de la charnière, du même côté que le tracé
    const hx = doorHingeSign(op);
    const hingeX = hx * w / 2, hingeY = th / 2;
    const swing = op.side === -1 ? 1 : -1;
    const start = hx > 0 ? Math.PI : 0;
    const end = hx > 0
        ? (swing > 0 ? Math.PI / 2 : 3 * Math.PI / 2)
        : (swing > 0 ? Math.PI / 2 : -Math.PI / 2);
    const ux = lx - hingeX, uy = ly - hingeY;
    if (Math.hypot(ux, uy) > w + m) return false;
    return angleInSweep2D(Math.atan2(uy, ux), start, end);
}

// Vrai si l'angle a est dans l'arc court allant de s à e
function angleInSweep2D(a, s, e) {
    const norm = v => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const sweep = norm(e - s);
    return sweep <= Math.PI ? norm(a - s) <= sweep : norm(s - a) <= norm(s - e);
}

function pickElement2D(coords) {
    let best = null, bd = Infinity;
    electricalOn().forEach(el => {
        const c = getElCoords(el);
        const d = Math.hypot(c.x - coords.x, c.y - coords.y);
        if (d < (el.type === 'panel' ? 20 : 14) && d < bd) { bd = d; best = { id: el.id }; }
    });
    openingsOn().forEach(op => {
        const p = openingPos2D(op);
        if (!p) return;
        const d = Math.hypot(p.x - coords.x, p.y - coords.y);
        // porte : emprise = baie + vantail (quart de cercle) ; fenêtre : autour de la baie
        const inDoor = op.type === 'door_single' && doorHit2D(op, p, coords);
        if ((d < 40 || inDoor) && d < bd) { bd = d; best = { id: op.id }; }
    });
    // Trémies (D5) : cliquables dans leur carré
    shaftsOn().forEach(sh => {
        const p = shaftPos2D(sh);
        if (!p) return;
        const d = Math.hypot(p.x - coords.x, p.y - coords.y);
        if (d < (sh.size || 40) / 2 + 6 && d < bd) { bd = d; best = { id: sh.id }; }
        // boîte de dérivation : un clic dessus sélectionne la trémie (et non le mur voisin)
        const dq = derivFacePos2D(sh);
        if (dq) {
            const half = DERIV_HALF + 4 / zoom;   // carré dessiné + marge de 4 px écran
            const dx = Math.abs(dq.x - coords.x), dy = Math.abs(dq.y - coords.y);
            const dd = Math.hypot(dx, dy);
            if (dx <= half && dy <= half && dd < bd) { bd = dd; best = { id: sh.id }; }
        }
    });
    if (!best) textsOn().forEach(tx => {
        const b = textBox2D(tx);
        if (Math.abs(coords.x - tx.x) <= b.w / 2 + 4 / zoom && Math.abs(coords.y - tx.y) <= b.h / 2 + 4 / zoom) best = { id: tx.id };
    });
    if (!best) stairsOn().forEach(st => {
        const R = stairRect(st);
        const dx = coords.x - R.cx, dy = coords.y - R.cy;
        if (!best && Math.abs(dx * R.ux + dy * R.uy) <= R.hl + 6 && Math.abs(dx * R.vx + dy * R.vy) <= R.hw + 6) best = { id: st.id };
    });
    return best;
}

function nearestWallInfo(coords) {
    let best = null;
    wallsOn().forEach(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const s = Math.max(0, Math.min(len, (coords.x - w.x1) * ux + (coords.y - w.y1) * uy));
        const px = w.x1 + ux * s, py = w.y1 + uy * s;
        const d = Math.hypot(coords.x - px, coords.y - py);
        if (!best || d < best.d) {
            best = { wall: w, d, len, dist: Math.max(10, Math.min(len - 10, s)), side: ((coords.x - px) * uy - (coords.y - py) * ux) >= 0 ? 1 : -1 };
        }
    });
    return best;
}

function defaultHeightFor(type) {
    if (type === 'panel' || type === 'junction_box' || type === 'meter') return 150;
    if (type === 'wall_light') return 180;
    if (type === 'doorbell_chime') return 200;
    if (type === 'shutter_motor') return 210;
    if (type === 'outlet_20a') return 110;   // prise plan de travail
    if (type.startsWith('outlet_dedicated')) return 30;
    if (type.startsWith('outlet')) return 30;
    return 110;
}

// Trémie / escalier : niveaux reliés cochés dans la liste de la barre de droite (le plus proche coché par défaut).
// Renvoie null si aucun niveau n'est coché.
function askShaftLevels() {
    const others = otherLevelsByDistance();
    if (!others.length) {
        showNotification('Aucun autre niveau : rien à relier pour l’instant. Ajoutez un étage pour le relier.', 'info');
        return [activeLevelId];
    }
    const list = document.getElementById(currentMode === '3d' ? 'shaft-link-list-3d' : 'shaft-link-list');
    const checked = new Set(list ? [...list.querySelectorAll('input:checked')].map(i => i.value) : []);
    const chosen = others.filter(l => checked.has(l.id)).map(l => l.id);
    if (!chosen.length) {
        showNotification('Cochez au moins un niveau à relier', 'error');
        return null;
    }
    return [activeLevelId, ...chosen];
}

function place2DAt(coords) {
    const type = document.getElementById('place-type').value;
    const uid = Date.now() + '_' + Math.floor(Math.random() * 1000);
    if (type === 'shaft') {
        // trémie : posée où l'on clique, sans mur à côté
        const links = askShaftLevels();
        if (!links) return;
        saveStateToUndo();
        if (!projectData.shafts) projectData.shafts = [];
        projectData.shafts.push({ id: 'sh_' + uid, levelId: activeLevelId, levelIds: links,
            x: Math.round(coords.x), y: Math.round(coords.y), size: 40 });
        redraw2D();
        showNotification('Trémie posée', 'success');
        return;
    }
    if (type === 'stair') {
        const links = askShaftLevels();
        if (!links) return;
        saveStateToUndo();
        if (!projectData.stairs) projectData.stairs = [];
        projectData.stairs.push({ id: 'st_' + uid, levelId: activeLevelId, levelIds: links, x: Math.round(coords.x), y: Math.round(coords.y), angleDeg: 0, width: 90, length: 300 });
        snapStairToWalls(projectData.stairs[projectData.stairs.length - 1]);
        redraw2D();
        showNotification('Escalier posé', 'success');
        return;
    }
    if (CEILING_TYPES.includes(type)) {
        if (ceilingSpotBlocker(coords.x, coords.y, activeLevelId)) { refuseSameSpot(); return; }
        saveStateToUndo();
        projectData.electrical.push({ levelId: activeLevelId, id: 'el_' + uid, type, x: coords.x, y: 245, z: coords.y });
    } else {
        if (type === 'meter') {
            if (activeLevelId !== 'lvl_rdc') { showNotification('Le compteur se place au RDC', 'error'); return; }
            if (projectData.electrical.some(el => el.type === 'meter')) { showNotification('Un seul compteur par projet', 'error'); return; }
        }
        const info = nearestWallInfo(coords);
        if (!info || info.d > (info.wall.thickness || 10) / 2 + 60) {
            showNotification("Cliquez près d'un mur pour placer cet élément", 'error');
            return;
        }
        const height = defaultHeightFor(type);
        const dist = placedDistance({ type, height }, info.wall.id, Math.round(info.dist), info.side);
        const why = sameSpotBlocker(type, activeLevelId, info.wall.id, dist, info.side, height);
        if (why) { refuseSameSpot(why); return; }
        let shaftLinks = null;
        if (type === 'shaft') {
            shaftLinks = askShaftLevels();
            if (!shaftLinks) return;
        }
        saveStateToUndo();
        if (type === 'door_single' || type === 'window_std') {
            const opening = { id: 'op_' + uid, type, wallId: info.wall.id, distanceFromStart: dist, height: type === 'door_single' ? 210 : 120, width: type === 'door_single' ? 96 : 120 };
            if (type === 'window_std') opening.sillHeight = 90;
            opening.side = info.side;
            if (type === 'door_single') opening.hingeSide = doorHingeForPlacement();
            projectData.openings.push(Object.assign(opening, { levelId: activeLevelId }));
        } else if (type === 'shaft') {
            projectData.shafts.push({ id: 'sh_' + uid, levelId: activeLevelId, levelIds: shaftLinks, wallId: info.wall.id, distanceFromStart: dist, side: info.side, size: 40 });
        } else {
            projectData.electrical.push({ levelId: activeLevelId, id: 'el_' + uid, type, wallId: info.wall.id, distanceFromStart: dist, height, side: info.side });
        }
    }
    redraw2D();
    const lastShaft = type === 'shaft' ? projectData.shafts[projectData.shafts.length - 1] : null;
    if (lastShaft) {
        const linkedNames = (lastShaft.levelIds || []).filter(id => id !== activeLevelId)
            .map(id => (projectData.levels.find(l => l.id === id) || {}).name).filter(Boolean);
        showNotification(linkedNames.length ? 'Trémie reliée à : ' + linkedNames.join(', ') : 'Trémie placée (un seul niveau)', 'success');
    } else if (type === 'outlet_switched') {
        showNotification('Prise commandée placée : elle sera reliée au circuit 16A (même couleur)', 'success');
    } else {
        showNotification('Élément placé', 'success');
    }
}

function dragElement2D(coords) {
    if (!draggingEl2D) return;
    const tx = textById(draggingEl2D.id);
    if (tx) {
        if (!draggingEl2D.moved) { saveStateToUndo(); draggingEl2D.moved = true; }
        tx.x = Math.round(coords.x - draggingEl2D.grab.x);
        tx.y = Math.round(coords.y - draggingEl2D.grab.y);
        requestRedraw2D();
        return;
    }
    const el = projectData.electrical.find(e => e.id === draggingEl2D.id);
    const op = !el ? projectData.openings.find(o => o.id === draggingEl2D.id) : null;
    const sh = !el && !op ? (projectData.shafts || []).find(s => s.id === draggingEl2D.id) : null;
    const st = !el && !op && !sh ? (projectData.stairs || []).find(s => s.id === draggingEl2D.id) : null;
    if (st) {
        if (!draggingEl2D.moved) { saveStateToUndo(); draggingEl2D.moved = true; }
        const prevSt = { x: st.x, y: st.y };
        const angleRad = (st.angleDeg || 0) * Math.PI / 180;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        const grab = draggingEl2D.grab || { x: 0, y: 0 };
        st.x = Math.round(coords.x - (grab.x * cosA - grab.y * sinA));
        st.y = Math.round(coords.y - (grab.x * sinA + grab.y * cosA));
        snapStairToWalls(st, prevSt);
        requestRedraw2D();
        return;
    }
    const item = el || op || sh;
    if (!item) return;
    if (!draggingEl2D.moved) { saveStateToUndo(); draggingEl2D.moved = true; }
    if (sh) {
        sh.x = Math.round(coords.x - (draggingEl2D.grab ? draggingEl2D.grab.x : 0));
        sh.y = Math.round(coords.y - (draggingEl2D.grab ? draggingEl2D.grab.y : 0));
        requestRedraw2D();
        return;
    }
    if (el && CEILING_TYPES.includes(el.type)) {
        el.x = coords.x;
        el.z = coords.y;
    } else {
        const info = nearestWallInfo(coords);
        if (!info) return;
        const dist = placedDistance(item, info.wall.id, Math.round(info.dist), info.side);
        const moveRefusal = openingMoveRefusal(op, info.wall.id, dist);
        if (moveRefusal) {
            if (!draggingEl2D.refusedOp) { draggingEl2D.refusedOp = true; showNotification(moveRefusal, 'error'); }
            return;   // reste à sa dernière position valide
        }
        draggingEl2D.refusedOp = false;
        item.wallId = info.wall.id;
        item.distanceFromStart = dist;
        if (el || sh || (op && op.type === 'door_single')) item.side = info.side;
    }
    requestRedraw2D();
}

// ---------- Textes ajoutables (noms de pièces), patch 71 ----------
// Données : projectData.annotations, { id, kind: 'texte', levelId, x, y, text }. Hors câblage et collisions.
// Tailles des écritures (px à l'écran), réglées dans la barre gauche et enregistrées avec le projet
const TEXT_SIZE_DEFAULTS = { text: 12, cote: 12, niveau: 12 };
function textSizePx(kind) {
    const v = Number(projectData.textSizes && projectData.textSizes[kind]);
    return v >= 8 && v <= 32 ? v : TEXT_SIZE_DEFAULTS[kind];
}

function textsOn() {
    return (projectData.annotations || []).filter(a => a.kind === 'texte' && a.levelId === activeLevelId);
}

function textById(id) {
    if (!id) return null;
    return (projectData.annotations || []).find(a => a.kind === 'texte' && a.id === id) || null;
}

// Taille approximative du texte dans le plan (cm), pour la sélection au clic
function textBox2D(tx) {
    ctx2D.font = 'bold ' + (textSizePx('text') / zoom) + 'px Inter, sans-serif';
    return { w: ctx2D.measureText(tx.text || '').width, h: textSizePx('text') / zoom };
}

function textGrab2D(id, coords) {
    const tx = textById(id);
    return tx ? { x: coords.x - tx.x, y: coords.y - tx.y } : { x: 0, y: 0 };
}

// Style aligné sur les noms de trémies : 12 px, gras, sans fond ; taille fixe à l'écran
function drawTexts2D() {
    const light = currentTheme === 'light';
    textsOn().forEach(tx => {
        ctx2D.save();
        ctx2D.translate(tx.x, tx.y);
        ctx2D.rotate(-rot2D);
        ctx2D.font = 'bold ' + (textSizePx('text') / zoom) + 'px Inter, sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.fillStyle = light ? '#1e3a8a' : '#fde68a';
        ctx2D.fillText(tx.text || '', 0, 0);
        if (!isPrintRendering && selected3DId === tx.id) {
            const b = textBox2D(tx);
            ctx2D.strokeStyle = light ? '#047857' : '#f8fafc';
            ctx2D.lineWidth = 1 / zoom;
            ctx2D.setLineDash([4 / zoom, 3 / zoom]);
            ctx2D.strokeRect(-b.w / 2 - 4 / zoom, -b.h / 2 - 4 / zoom, b.w + 8 / zoom, b.h + 8 / zoom);
            ctx2D.setLineDash([]);
        }
        ctx2D.restore();
    });
}

// Rafraîchit la vue active après une modification de texte
function refreshAfterText() {
    if (currentMode === '3d') build3DScene();
    else redraw2D();
}

function placeText2D(coords) {
    askFields('Nouveau texte', [{ id: 'text', label: 'Texte (nom de pièce)', value: '' }], 'Ajouter',
        v => v.text ? null : 'Saisissez un texte.')
        .then(r => {
            if (!r) return;
            saveStateToUndo();
            if (!projectData.annotations) projectData.annotations = [];
            const tx = { id: 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000), kind: 'texte',
                levelId: activeLevelId, x: Math.round(coords.x), y: Math.round(coords.y), height: 150, text: r.text };
            projectData.annotations.push(tx);
            selected3DId = tx.id;
            syncElementInspectors();
            refreshAfterText();
            showNotification('Texte ajouté', 'success');
        });
}

function editText2D(id) {
    const tx = textById(id);
    if (!tx) return;
    askFields('Modifier le texte', [{ id: 'text', label: 'Texte', value: tx.text || '' }], 'Enregistrer',
        v => v.text ? null : 'Saisissez un texte.')
        .then(r => {
            if (!r || r.text === tx.text) return;
            saveStateToUndo();
            tx.text = r.text;
            syncElementInspectors();
            refreshAfterText();
        });
}

function setSelectedTextValue(value) {
    const tx = textById(selected3DId);
    const v = (value || '').trim();
    if (!tx || !v || v === tx.text) return;
    saveStateToUndo();
    tx.text = v;
    syncElementInspectors();
    refreshAfterText();
}

function deleteText2D() {
    const tx = textById(selected3DId);
    if (!tx) return;
    return confirmDeletion('le texte « ' + tx.text + ' »').then(ok => {
        if (!ok) return;
        saveStateToUndo();
        projectData.annotations = projectData.annotations.filter(a => a.id !== tx.id);
        selected3DId = null;
        syncElementInspectors();
        refreshAfterText();
    });
}

// Texte centré dont les flèches (↑ ↓ ↔) sont agrandies ; px en unités du contexte, arrowScale = facteur des flèches
function drawArrowText(ctx, text, x, y, px, arrowScale, family) {
    const parts = text.split(/([↑↓↔])/).filter(s => s !== '');
    const fontFor = s => 'bold ' + (('↑↓↔'.includes(s) && s.length === 1) ? px * arrowScale : px) + 'px ' + family;
    const align = ctx.textAlign;
    ctx.textAlign = 'left';
    let total = 0;
    parts.forEach(s => { ctx.font = fontFor(s); total += ctx.measureText(s).width; });
    let cur = x - total / 2;
    parts.forEach(s => { ctx.font = fontFor(s); ctx.fillText(s, cur, y); cur += ctx.measureText(s).width; });
    ctx.textAlign = align;
}