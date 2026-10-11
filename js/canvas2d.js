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
    canvas2D.addEventListener('mousemove', on2DMouseMove);
    canvas2D.addEventListener('mouseleave', hidePlanTooltip);
    window.addEventListener('mouseup', on2DMouseUp);
    canvas2D.addEventListener('wheel', on2DWheel);
    
    canvas2D.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    recenter2DView();
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
    redraw2D();
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

function redraw2D() {
    if (!ctx2D || !canvas2D) return;
    ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
    if (isPrintRendering) {
        ctx2D.fillStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
        ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
    }

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

    wallsOn().forEach(wall => {
        const isSelected = !isPrintRendering && selectedWallIds.includes(wall.id);
        
        ctx2D.strokeStyle = isSelected ? (currentTheme === 'light' ? '#047857' : '#34d399') : (currentTheme === 'light' ? '#94a3b8' : '#334155');
        ctx2D.lineWidth = wall.thickness + 4;
        ctx2D.lineCap = 'round';
        ctx2D.beginPath();
        ctx2D.moveTo(wall.x1, wall.y1);
        ctx2D.lineTo(wall.x2, wall.y2);
        ctx2D.stroke();

        ctx2D.strokeStyle = isSelected ? (currentTheme === 'light' ? '#059669' : '#6ee7b7') : (currentTheme === 'light' ? '#047857' : '#0f766e');
        ctx2D.lineWidth = wall.thickness;
        ctx2D.beginPath();
        ctx2D.moveTo(wall.x1, wall.y1);
        ctx2D.lineTo(wall.x2, wall.y2);
        ctx2D.stroke();

        ctx2D.strokeStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
        ctx2D.lineWidth = Math.max(2, wall.thickness - 8);
        ctx2D.beginPath();
        ctx2D.moveTo(wall.x1, wall.y1);
        ctx2D.lineTo(wall.x2, wall.y2);
        ctx2D.stroke();

    });

    draw2DEquipment();

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
            const labelX = (drawingStartPoint.x + mouseCurrentPos.x) / 2 - dy / length * 18;
            const labelY = (drawingStartPoint.y + mouseCurrentPos.y) / 2 + dx / length * 18;
            const label = (length / 100).toFixed(2) + ' m';
            ctx2D.font = 'bold 14px Inter, sans-serif';
            ctx2D.textAlign = 'center';
            ctx2D.textBaseline = 'middle';
            const labelWidth = ctx2D.measureText(label).width + 12;
            ctx2D.save();
            ctx2D.translate(labelX, labelY);
            ctx2D.rotate(-rot2D);
            ctx2D.fillStyle = currentTheme === 'light' ? '#ffffff' : '#020617';
            ctx2D.fillRect(-labelWidth / 2, -10, labelWidth, 20);
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
            [ [wall.x1, wall.y1], [wall.x2, wall.y2] ].forEach(([x, y]) => {
                ctx2D.beginPath();
                ctx2D.arc(x, y, 7 / zoom, 0, Math.PI * 2);
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

function on2DMouseDown(e) {
    const coords = worldToCanvasCoords(e.clientX, e.clientY);

    if (e.button === 2) {
        e.preventDefault();
        if (currentTool === 'wall' && drawingStartPoint) {
            drawingStartPoint = null;
            mouseCurrentPos = null;
            document.getElementById('drawing-instruction-hint').textContent = "Tracé arrêté. Cliquez pour placer un nouveau point de mur.";
            redraw2D();
            showNotification("Tracé de mur arrêté", "info");
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

            const len = Math.hypot(endX - drawingStartPoint.x, endY - drawingStartPoint.y);
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
                showNotification("Mur tracé avec succès", "success");
            }

            drawingStartPoint = { x: endX, y: endY };
            mouseCurrentPos = { x: endX, y: endY };
            document.getElementById('drawing-instruction-hint').textContent = "Déplacez et cliquez pour tracer un autre mur connecté (Clic droit pour arrêter)";
        }
    } else if (currentTool === 'place') {
        place2DAt(coords);
        return;
    } else if (currentTool === 'select') {
        const hit = pickElement2D(coords);
        if (hit) {
            setSelectedWalls([]);
            draggingWall = null;
            selected3DId = hit.id;
            draggingEl2D = { id: hit.id, moved: false, grab: stairGrab(hit.id, coords) };
            // comme en 3D : cliquer un point de circuit sélectionne son câblage
            const hitEl = electricalOn().find(x => x.id === hit.id);
            const hitCircuit = highlightCircuitOf(hitEl);
            selectedCircuitId = hitCircuit ? hitCircuit.id : null;
            syncElementInspectors();
            updateCircuitsUI();
            redraw2D();
            return;
        }
        if (selected3DId || selectedCircuitId || selectedDeviceIds.length || selectedOpeningIds.length) {
            selected3DId = null;
            selectedCircuitId = null;
            if (!(e.ctrlKey || e.metaKey || e.shiftKey)) { selectedDeviceIds = []; selectedOpeningIds = []; }
            syncElementInspectors();
            updateCircuitsUI();
        }
        const additiveSelection = e.ctrlKey || e.metaKey || e.shiftKey;
        let endpointHit = null;
        let endpointDistance = 14 / zoom;
        wallsOn().forEach(w => {
            [['start', w.x1, w.y1], ['end', w.x2, w.y2]].forEach(([endpoint, x, y]) => {
                const distance = Math.hypot(coords.x - x, coords.y - y);
                if (distance < endpointDistance) {
                    endpointDistance = distance;
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
            } else if (canEditWalls() && selectedWallIds.includes(endpointHit.wall.id)) {
                // poignée : seulement sur un mur déjà sélectionné, en mode Modifier les murs
                draggingWall = { wall: endpointHit.wall, mode: endpointHit.endpoint, last: coords, origin: coords, moved: false };
            } else {
                setSelectedWalls([endpointHit.wall.id]);
            }
            selectionBoxStart = null;
            selectionBoxEnd = null;
            redraw2D();
            return;
        }
        let foundId = null;
        wallsOn().forEach(w => {
            const dist = distToSegment(coords, {x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
            if (dist < w.thickness / 2 + 12) {
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

function on2DMouseMove(e) {
    const coords = worldToCanvasCoords(e.clientX, e.clientY);
    document.getElementById('cursor-coords').textContent = `X: ${(coords.x/100).toFixed(2)}m, Y: ${(coords.y/100).toFixed(2)}m`;

    // survol : étiquette de l'élément visé (hors placement, glissement et tracé)
    if (!isPanning && !draggingEl2D && !selectionBoxStart && !draggingWall && currentTool !== 'place' && currentTool !== 'wall') {
        const hovered = pickElement2D(coords);
        showPlanTooltip(e.clientX, e.clientY, hovered ? hovered.id : null);
    } else {
        hidePlanTooltip();
    }

    if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        redraw2D();
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
            drag.last = drag.origin;
        }
        const dx = coords.x - drag.last.x;
        const dy = coords.y - drag.last.y;
        if (drag.moved) {
            const prevWall = { x1: drag.wall.x1, y1: drag.wall.y1, x2: drag.wall.x2, y2: drag.wall.y2 };
            if (drag.mode === 'start') {
                if (Math.hypot(drag.wall.x2 - coords.x, drag.wall.y2 - coords.y) > 1) {
                    drag.wall.x1 = coords.x;
                    drag.wall.y1 = coords.y;
                }
            } else if (drag.mode === 'end') {
                if (Math.hypot(drag.wall.x1 - coords.x, drag.wall.y1 - coords.y) > 1) {
                    drag.wall.x2 = coords.x;
                    drag.wall.y2 = coords.y;
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
        mouseCurrentPos = { x: snapX, y: snapY };
        redraw2D();
    }
}

function on2DMouseUp(e) {
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
        const matched = Math.hypot(end.x - start.x, end.y - start.y) > 4 / zoom
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
    if (draggingWall && draggingWall.moved) showUndoBar(wallMoveMessage(draggingWall.linksBefore, draggingWall.mode === 'move' ? 'déplacé' : 'étiré'));
    if (draggingWall) draggingWall = null;
    if (draggingEl2D) draggingEl2D = null;
    redraw2D();
}

function distToSegment(p, p1, p2) {
    const l2 = (p2.x - p1.x)*(p2.x - p1.x) + (p2.y - p1.y)*(p2.y - p1.y);
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    let t = ((p.x - p1.x)*(p2.x - p1.x) + (p.y - p1.y)*(p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

// ---------- Zoom / recentrage ----------
function zoomCanvas(factor) {
    zoom = Math.max(0.2, Math.min(5.0, zoom * factor));
    document.getElementById('zoom-level').textContent = `Zoom: ${Math.round(zoom * 100)}%`;
    redraw2D();
}

function resetZoomPan() {
    recenter2DView();
    redraw2D();
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
    d = Math.max(10, Math.min(len - 10, d));
    const t = d / len;
    return { x: w.x1 + t * dx, y: w.y1 + t * dy, angle: Math.atan2(dy, dx), th: w.thickness || 10 };
}

// Trémie : son centre est décalé côté pièce choisi à la pose (la face de la trémie touche le mur, le mur n'est pas percé)
function shaftPos2D(sh, dist) {
    const p = openingPos2D({ wallId: sh.wallId, distanceFromStart: dist !== undefined ? dist : sh.distanceFromStart });
    if (!p) return null;
    const off = p.th / 2 + (sh.size || 40) / 2;
    const side = sh.side === -1 ? -1 : 1;
    return { x: p.x + Math.sin(p.angle) * side * off, y: p.y - Math.cos(p.angle) * side * off, angle: p.angle, th: p.th };
}

// Point de dérivation d'une trémie pour un niveau : collé à la face du mur, côté pièce (boîte de 10 cm d'épaisseur)
function derivFacePos2D(sh, dist) {
    const wp = openingPos2D({ wallId: sh.wallId, distanceFromStart: dist });
    if (!wp) return null;
    const side = sh.side === -1 ? -1 : 1;
    const off = wp.th / 2 + 5;
    return { x: wp.x + Math.sin(wp.angle) * side * off, y: wp.y - Math.cos(wp.angle) * side * off, angle: wp.angle };
}

// Angle de la face avant d'un appareil mural (direction opposée au mur) dans le repère du plan
function elFrontAngle(el) {
    if (el.type === 'light_ceiling') return 0;
    const w = projectData.walls.find(x => x.id === el.wallId);
    if (!w) return 0;
    const ux = w.x2 - w.x1, uy = w.y2 - w.y1, l = Math.hypot(ux, uy) || 1;
    const side = el.side !== undefined ? el.side : 1;
    return Math.atan2(side * (-ux / l), side * (uy / l));
}

// Symboles de plan : le mur est à gauche (x = -1), la face avant vers +x
function drawElementSymbol2D(el) {
    const c = getElCoords(el);
    const col = el.type === 'wall_light' ? '#facc15' : EL_COLORS[el.type] || '#94a3b8';
    const ink = '#0f172a', paper = '#f8fafc';
    const circ = circuitOf(el);
    const ang = elFrontAngle(el);
    const t = el.type;
    const line = (x1, y1, x2, y2, w, color) => {
        ctx2D.beginPath();
        ctx2D.moveTo(x1, y1);
        ctx2D.lineTo(x2, y2);
        ctx2D.lineWidth = w || 1.8;
        ctx2D.strokeStyle = color || col;
        ctx2D.stroke();
    };
    let ringX = 7, ringR = 12, textAt = null;

    ctx2D.save();
    ctx2D.translate(c.x, c.y);
    ctx2D.rotate(ang);
    ctx2D.lineJoin = 'round';
    ctx2D.lineCap = 'round';

    if (t === 'outlet_16a' || t === 'outlet_20a' || t === 'outlet_32a') {
        const r = t === 'outlet_32a' ? 9.5 : 4.5;   // prise simple : demi-disque à l'échelle du module
        line(-1, -r - 1.5, -1, r + 1.5, 2.2);                      // trait de mur
        ctx2D.beginPath();                                          // demi-disque
        ctx2D.arc(-1, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx2D.closePath();
        ctx2D.fillStyle = t === 'outlet_32a' ? col : paper;
        ctx2D.fill();
        ctx2D.lineWidth = 2;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(r - 1, 0, r + 4, 0, 1.8);                             // broche de terre
        line(r + 4, -3.5, r + 4, 3.5, 1.8);
        if (t === 'outlet_20a') line(r + 1.5, -3, r + 1.5, 3, 1.8);
        if (t === 'outlet_32a') line(r + 1.5, -4.5, r + 1.5, 4.5, 1.8);
        ringX = 3; ringR = r + 4;
        textAt = { x: r * 0.45 - 1, y: 0, label: t.slice(7, 9) };
    } else if (isLightingControl(el)) {
        line(-1, 0, 5, 0, 1.8);
        ctx2D.beginPath();
        ctx2D.arc(8.5, 0, 3.6, 0, Math.PI * 2);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = 1.8;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        if (t === 'switch_pushbutton') {
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
        } else {
            line(8.5, 0, 12.7, -4.2, 1.8);
            ctx2D.fillStyle = col;
            ctx2D.beginPath();
            ctx2D.arc(12.7, -4.2, 1, 0, Math.PI * 2);
            ctx2D.fill();
        }
        ringX = 8; ringR = 10;
    } else if (t === 'wall_light') {
        ctx2D.fillStyle = '#facc15';
        ctx2D.strokeStyle = '#ca8a04';
        ctx2D.lineWidth = 1.8;
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
        ctx2D.lineWidth = 1.8;
        ctx2D.strokeStyle = '#ca8a04';
        ctx2D.stroke();
        line(17, -5, 21, -7, 1.5, '#eab308');
        line(18, 0, 23, 0, 1.5, '#eab308');
        line(17, 5, 21, 7, 1.5, '#eab308');
        ringX = 10; ringR = 14;
    } else if (t === 'light_ceiling') {
        ctx2D.rotate(-ang);
        ctx2D.beginPath();
        ctx2D.arc(0, 0, 10, 0, Math.PI * 2);
        ctx2D.fillStyle = '#fef9c3';
        ctx2D.fill();
        ctx2D.lineWidth = 2;
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
        ctx2D.lineWidth = 2;
        ctx2D.strokeStyle = col;
        ctx2D.stroke();
        line(-4, 0, 4, 0, 1.2, ink);
        line(0, -4, 0, 4, 1.2, ink);
        ringX = 0; ringR = 9;
    } else if (t === 'panel') {
        ctx2D.beginPath();
        ctx2D.rect(-1, -18, 11, 36);
        ctx2D.fillStyle = paper;
        ctx2D.fill();
        ctx2D.lineWidth = 2.2;
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

    if (circ && ringR > 0) {                                        // anneau = couleur du circuit
        ctx2D.beginPath();
        ctx2D.arc(ringX, 0, ringR, 0, Math.PI * 2);
        ctx2D.lineWidth = 2.2;
        ctx2D.strokeStyle = circuitColor(circ);
        ctx2D.globalAlpha = 0.9;
        ctx2D.stroke();
        ctx2D.globalAlpha = 1;
    }
    if (!isPrintRendering && (el.id === selected3DId || selectedDeviceIds.includes(el.id))) {
        ctx2D.beginPath();
        if (t === 'panel') ctx2D.rect(-5, -22, 19, 44);
        else ctx2D.arc(ringX, 0, Math.max(ringR, 10) + 4, 0, Math.PI * 2);
        ctx2D.lineWidth = 2;
        ctx2D.strokeStyle = currentTheme === 'light' || isPrintRendering ? '#047857' : '#ffffff';
        ctx2D.setLineDash([4, 3]);
        ctx2D.stroke();
        ctx2D.setLineDash([]);
    }
    ctx2D.restore();

    if (textAt) {                                                   // calibre (10 / 16 / 20 / 32), texte à l'endroit
        const fx = Math.cos(ang), fy = Math.sin(ang);
        ctx2D.save();
        ctx2D.fillStyle = t === 'outlet_32a' ? paper : ink;
        ctx2D.font = 'bold 6.5px Inter, sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.translate(c.x + fx * (textAt.x + 1), c.y + fy * (textAt.x + 1));
        ctx2D.rotate(-rot2D);
        ctx2D.fillText(textAt.label, 0, 0);
        ctx2D.restore();
    }
}

// Cotes des murs : placées hors de l'épaisseur des murs, à l'écart des appareils, des ouvertures et des autres cotes
function drawWallLengthLabels() {
    ctx2D.font = 'bold 11px Inter, sans-serif';
    ctx2D.textAlign = 'center';
    ctx2D.textBaseline = 'middle';
    const hh = 7;
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
    const bg = currentTheme === 'light' ? '#ffffff' : '#020617';

    wallsOn().forEach(wall => {
        const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const label = (len / 100).toFixed(2) + ' m';
        const hw = ctx2D.measureText(label).width / 2 + 3;
        const nx = -dy / len, ny = dx / len;
        const off = (wall.thickness || 10) / 2 + 4 + hh;
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
        ctx2D.lineJoin = 'round';
        ctx2D.lineWidth = 4;
        ctx2D.strokeStyle = bg;
        ctx2D.strokeText(label, 0, 0);
        ctx2D.fillStyle = currentTheme === 'light' ? '#0f172a' : '#f1f5f9';
        ctx2D.fillText(label, 0, 0);
        ctx2D.restore();
    });
    ctx2D.textBaseline = 'alphabetic';
}

function draw2DEquipment() {
    ensureCircuitAssignment();
    // 1. Câbles (trait plein = plafond, pointillé = plinthe)
    if (showCables2D && projectData.electrical.length) {
        const net = getCableNetwork();
        const selectedElement = projectData.electrical.find(el => el.id === selected3DId);
        const isLightingSelection = selectedElement &&
            (isLightingControl(selectedElement) || selectedElement.type === 'light_ceiling' || selectedElement.type === 'wall_light');
        const selectedLinkIds = new Set(isLightingSelection
            ? (net.controlLinks || [])
                .filter(link => link.switchId === selected3DId || link.lightIds.includes(selected3DId))
                .flatMap(link => link.linkIds || [])
            : []);
        const hasLinkFocus = selectedLinkIds.size > 0;
        const focusCircuit = !hasLinkFocus && selectedCircuitId
            ? projectData.circuits.find(c => c.id === selectedCircuitId) || null
            : null;
        const focusMode = hasLinkFocus || !!focusCircuit;
        const dimColor = currentTheme === 'light' ? '#94a3b8' : '#64748b';
        ctx2D.lineCap = 'round';
        ctx2D.globalAlpha = 0.85;
        // Le cheminement bas et le cheminement haut ont les mêmes coordonnées en plan : on les décale
        // de part et d'autre de l'axe pour que les deux restent visibles (haut : trait plein, bas : pointillé).
        net.segments.forEach(s => {
            const linkHighlighted = (s.links || []).some(id => selectedLinkIds.has(id));
            const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, len = Math.hypot(dx, dy);
            if (len < 0.05) return;
            const isLow = s.a.z < 50 && s.b.z < 50;
            const off = isLow ? -3.5 : (s.a.z > 150 && s.b.z > 150 ? 3.5 : 0);
            const ox = -dy / len * off, oy = dx / len * off;
            const ids = [...new Set((s.cids || []).filter(Boolean))];
            const circs = ids.map(id => projectData.circuits.find(c => c.id === id)).filter(Boolean);
            const focusHit = hasLinkFocus ? linkHighlighted : (!!focusCircuit && (s.cids || []).includes(focusCircuit.id));
            ctx2D.globalAlpha = focusMode ? (focusHit ? 1 : 0.16) : 0.85;
            ctx2D.lineWidth = focusMode && focusHit ? 5 : 3;
            ctx2D.beginPath();
            ctx2D.moveTo(s.a.x + ox, s.a.y + oy);
            ctx2D.lineTo(s.b.x + ox, s.b.y + oy);
            if (focusMode || circs.length <= 1) {
                ctx2D.strokeStyle = focusMode
                    ? (focusHit ? (hasLinkFocus ? '#facc15' : circuitColor(focusCircuit)) : dimColor)
                    : circs.length ? circuitColor(circs[0]) : '#94a3b8';
                ctx2D.setLineDash(isLow ? [8, 6] : []);
                ctx2D.stroke();
            } else {
                // tronçon partagé : bandes alternées aux couleurs de chaque circuit
                const n = circs.length, seg = isLow ? 5 : 8;
                circs.forEach((c, k) => {
                    ctx2D.strokeStyle = circuitColor(c);
                    ctx2D.setLineDash([seg, seg * (n - 1)]);
                    ctx2D.lineDashOffset = -seg * k;
                    ctx2D.stroke();
                });
                ctx2D.lineDashOffset = 0;
            }
        });
        ctx2D.setLineDash([]);
        ctx2D.globalAlpha = 1;
    }

    // 2. Ouvertures
    openingsOn().forEach(op => {
        const p = openingPos2D(op);
        if (!p) return;
        const isDoor = op.type === 'door_single';
        const opWall = projectData.walls.find(x => x.id === op.wallId);
        const w = opWall ? openingBox(op, opWall).half * 2 : (isDoor ? 96 : 120);
        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        ctx2D.fillStyle = '#020617';
        ctx2D.fillRect(-w / 2, -p.th / 2 - 1, w, p.th + 2);
        ctx2D.strokeStyle = (op.id === selected3DId || selectedOpeningIds.includes(op.id)) ? '#f59e0b' : (isDoor ? '#38bdf8' : '#22d3ee');
        ctx2D.lineWidth = 2;
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
            ctx2D.arc(hingeX, p.th / 2, w, start, end, anticlockwise);
        } else {
            ctx2D.rect(-w / 2, -p.th / 2 + 3, w, p.th - 6);
            ctx2D.moveTo(-w / 2, 0);
            ctx2D.lineTo(w / 2, 0);
        }
        ctx2D.stroke();
        ctx2D.restore();
    });

    // 2 bis. Trémies (D5) : carré en pointillés, aligné sur le mur
    shaftsOn().forEach(sh => {
        const p = shaftPos2D(sh);
        if (!p) return;
        const s = sh.size || 40, hot = sh.id === selected3DId;
        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(p.angle);
        // toujours visible en fort (comme à la sélection) ; sélectionnée : liseré blanc extérieur
        ctx2D.fillStyle = 'rgba(251,191,36,0.30)';
        ctx2D.strokeStyle = '#f59e0b';
        ctx2D.lineWidth = 3 / zoom;
        ctx2D.fillRect(-s / 2, -s / 2, s, s);
        ctx2D.strokeRect(-s / 2, -s / 2, s, s);
        if (hot) {
            ctx2D.strokeStyle = currentTheme === 'light' ? '#78350f' : '#fef3c7';
            ctx2D.lineWidth = 2 / zoom;
            ctx2D.strokeRect(-s / 2 - 6 / zoom, -s / 2 - 6 / zoom, s + 12 / zoom, s + 12 / zoom);
        }
        // chevauchement avec une ouverture ou un appareil : contour rouge clignotant, comme les appareils
        if (!isPrintRendering && blinkOn && collidingElementIds().has(sh.id)) {
            ctx2D.strokeStyle = '#ef4444';
            ctx2D.lineWidth = 3 / zoom;
            ctx2D.strokeRect(-s / 2 - 10 / zoom, -s / 2 - 10 / zoom, s + 20 / zoom, s + 20 / zoom);
        }
        ctx2D.restore();
        // point de dérivation : là où ce niveau prend ses circuits dans la gaine
        ctx2D.save();
        const dq = derivFacePos2D(sh, derivDistOf(sh, activeLevelId)) || p;
        ctx2D.beginPath();
        ctx2D.arc(dq.x, dq.y, 5 / zoom, 0, Math.PI * 2);
        ctx2D.fillStyle = '#fbbf24';
        ctx2D.strokeStyle = '#78350f';
        ctx2D.lineWidth = 1.5 / zoom;
        ctx2D.fill();
        ctx2D.stroke();
        ctx2D.fillStyle = '#fbbf24';
        ctx2D.font = 'bold ' + (12 / zoom) + 'px sans-serif';
        ctx2D.textAlign = 'center';
        ctx2D.fillText(shaftLevelNames(sh).join(' ↔ '), p.x, p.y - s / 2 - 6 / zoom);
        ctx2D.restore();
    });

    // 2 ter. Escaliers : emprise au sol, marches tracées, flèche vers la marche haute
    if (stairsOn().length) {
        const stairColliding = collidingElementIds();
        stairsOn().forEach(st => drawStair2D(st, stairColliding));
    }

    // 3. Appareils électriques (symboles de plan)
    electricalOn().forEach(el => drawElementSymbol2D(el));
    if (!isPrintRendering && blinkOn) {
        const colliding = collidingElementIds();
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
    drawWallLengthLabels();
    ctx2D.textBaseline = 'alphabetic';
}

// Escalier saisi au clic : décalage entre le curseur et le centre, pour glisser sans saut
function stairGrab(id, coords) {
    const st = (projectData.stairs || []).find(s => s.id === id);
    return st ? { x: coords.x - st.x, y: coords.y - st.y } : null;
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
    ctx2D.strokeRect(-L / 2, -W / 2, L, W);
    ctx2D.beginPath();
    for (let i = 1; i < n; i++) {
        const x = -L / 2 + i * L / n;
        ctx2D.moveTo(x, -W / 2);
        ctx2D.lineTo(x, W / 2);
    }
    ctx2D.lineWidth = 1 / zoom;
    ctx2D.stroke();
    // flèche : montée vers la marche haute (sens +x de l'emprise)
    const tip = L * 0.42, head = 9 / zoom;
    ctx2D.beginPath();
    ctx2D.moveTo(-tip, 0); ctx2D.lineTo(tip, 0);
    ctx2D.moveTo(tip, 0); ctx2D.lineTo(tip - head, -head * 0.6);
    ctx2D.moveTo(tip, 0); ctx2D.lineTo(tip - head, head * 0.6);
    ctx2D.strokeStyle = '#c4b5fd';
    ctx2D.lineWidth = 2 / zoom;
    ctx2D.stroke();
    if (hot) {
        ctx2D.strokeStyle = currentTheme === 'light' ? '#4c1d95' : '#ede9fe';
        ctx2D.lineWidth = 2 / zoom;
        ctx2D.strokeRect(-L / 2 - 6 / zoom, -W / 2 - 6 / zoom, L + 12 / zoom, W + 12 / zoom);
    }
    if (!isPrintRendering && blinkOn && colliding.has(st.id)) {
        ctx2D.strokeStyle = '#ef4444';
        ctx2D.lineWidth = 3 / zoom;
        ctx2D.strokeRect(-L / 2 - 10 / zoom, -W / 2 - 10 / zoom, L + 20 / zoom, W + 20 / zoom);
    }
    ctx2D.restore();
    ctx2D.save();
    ctx2D.fillStyle = '#c4b5fd';
    ctx2D.font = 'bold ' + (12 / zoom) + 'px sans-serif';
    ctx2D.textAlign = 'center';
    ctx2D.fillText(stairLevelNames(st).join(' ↔ '), st.x, st.y - Math.max(L, W) / 2 - 6 / zoom);
    ctx2D.restore();
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
        if (d < 40 && d < bd) { bd = d; best = { id: op.id }; }
    });
    // Trémies (D5) : cliquables dans leur carré
    shaftsOn().forEach(sh => {
        const p = shaftPos2D(sh);
        if (!p) return;
        const d = Math.hypot(p.x - coords.x, p.y - coords.y);
        if (d < (sh.size || 40) / 2 + 6 && d < bd) { bd = d; best = { id: sh.id }; }
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
    if (type === 'panel' || type === 'junction_box') return 150;
    if (type === 'wall_light') return 180;
    if (type === 'outlet_32a') return 20;
    if (type.startsWith('outlet')) return 30;
    return 110;
}

// Trémie : niveau relié choisi dans la liste de la barre de droite (le plus proche par défaut).
function askShaftLevels() {
    const others = otherLevelsByDistance();
    if (!others.length) return [activeLevelId];
    const linkSel = document.getElementById(currentMode === '3d' ? 'shaft-link-level-3d' : 'shaft-link-level');
    const chosen = linkSel && others.some(l => l.id === linkSel.value) ? linkSel.value : others[0].id;
    return [activeLevelId, chosen];
}

function place2DAt(coords) {
    const type = document.getElementById('place-type').value;
    const uid = Date.now() + '_' + Math.floor(Math.random() * 1000);
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
    if (type === 'light_ceiling') {
        saveStateToUndo();
        projectData.electrical.push({ levelId: activeLevelId, id: 'el_' + uid, type, x: coords.x, y: 245, z: coords.y });
    } else {
        const info = nearestWallInfo(coords);
        if (!info || info.d > (info.wall.thickness || 10) / 2 + 60) {
            showNotification("Cliquez près d'un mur pour placer cet élément", 'error');
            return;
        }
        let shaftLinks = null;
        if (type === 'shaft') {
            shaftLinks = askShaftLevels();
            if (!shaftLinks) return;
        }
        saveStateToUndo();
        if (type === 'door_single' || type === 'window_std') {
            const opening = { id: 'op_' + uid, type, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), height: type === 'door_single' ? 210 : 120, width: type === 'door_single' ? 96 : 120 };
            if (type === 'window_std') opening.sillHeight = 90;
            if (type === 'door_single') {
                opening.hingeSide = doorHingeForPlacement();
                opening.side = info.side;
            }
            projectData.openings.push(Object.assign(opening, { levelId: activeLevelId }));
        } else if (type === 'shaft') {
            projectData.shafts.push({ id: 'sh_' + uid, levelId: activeLevelId, levelIds: shaftLinks, wallId: info.wall.id, distanceFromStart: Math.round(info.dist), side: info.side, size: 40 });
        } else {
            const height = defaultHeightFor(type);
        projectData.electrical.push({ levelId: activeLevelId, id: 'el_' + uid, type, wallId: info.wall.id, distanceFromStart: snapOutletDistance(type, info.wall.id, Math.round(info.dist), info.side, height, null), height, side: info.side });
        }
    }
    redraw2D();
    const lastShaft = type === 'shaft' ? projectData.shafts[projectData.shafts.length - 1] : null;
    if (lastShaft) {
        const other = projectData.levels.find(l => l.id === (lastShaft.levelIds || []).find(id => id !== activeLevelId));
        showNotification(other ? 'Trémie reliée à : ' + other.name : 'Trémie placée (un seul niveau)', 'success');
    } else {
        showNotification('Élément placé', 'success');
    }
}

function dragElement2D(coords) {
    if (!draggingEl2D) return;
    const el = projectData.electrical.find(e => e.id === draggingEl2D.id);
    const op = !el ? projectData.openings.find(o => o.id === draggingEl2D.id) : null;
    const sh = !el && !op ? (projectData.shafts || []).find(s => s.id === draggingEl2D.id) : null;
    const st = !el && !op && !sh ? (projectData.stairs || []).find(s => s.id === draggingEl2D.id) : null;
    if (st) {
        if (!draggingEl2D.moved) { saveStateToUndo(); draggingEl2D.moved = true; }
        const prevSt = { x: st.x, y: st.y };
        st.x = Math.round(coords.x - (draggingEl2D.grab ? draggingEl2D.grab.x : 0));
        st.y = Math.round(coords.y - (draggingEl2D.grab ? draggingEl2D.grab.y : 0));
        snapStairToWalls(st, prevSt);
        redraw2D();
        return;
    }
    const item = el || op || sh;
    if (!item) return;
    if (!draggingEl2D.moved) { saveStateToUndo(); draggingEl2D.moved = true; }
    if (el && el.type === 'light_ceiling') {
        el.x = coords.x;
        el.z = coords.y;
    } else {
        const info = nearestWallInfo(coords);
        if (!info) return;
        item.wallId = info.wall.id;
        item.distanceFromStart = el ? snapOutletDistance(el.type, info.wall.id, Math.round(info.dist), info.side, el.height || defaultHeightFor(el.type), el.id) : Math.round(info.dist);
        if (el || sh || (op && op.type === 'door_single')) item.side = info.side;
    }
    redraw2D();
}
