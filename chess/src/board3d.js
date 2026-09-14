// board3d.js — escena, tablero, luces, cámara orbital (ratón + táctil) y picking.

import * as THREE from 'three';
import { createPiece, PALETTES } from './models.js';
import { applyPieceAnim } from './anim.js';
import { FX } from './fx.js';
import { clamp, damp, tween, Ease, rand, shortAngle } from './util.js';

export const SQUARE = 1;

export function squareToWorld(idx, out = new THREE.Vector3()) {
  const file = idx & 7, rank = idx >> 3;
  return out.set(file - 3.5, 0, 3.5 - rank);
}

export function worldToSquare(point) {
  const file = Math.round(point.x + 3.5);
  const rank = Math.round(3.5 - point.z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

function labelTexture(text, color = '#e8dfc8') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = color;
  g.font = 'bold 44px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Board3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.quality = opts.quality || 'high';
    this.orientation = 'w';
    this.pieces = new Map();          // idx -> pieza
    this.loose = new Set();           // piezas fuera del tablero (muriendo)
    this.tapHandlers = [];
    this.hoverSquare = -1;
    this.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c14);
    this.scene.fog = new THREE.Fog(0x0a0c14, 14, 34);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.target = new THREE.Vector3(0, 0.35, 0);
    this.sph = { r: 11.8, theta: 0, phi: 0.76 };
    this.sphGoal = { ...this.sph };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'low' ? 1.2 : 2));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.fx = new FX(this.scene, this.quality);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clockShake = new THREE.Vector3();

    this.setupEnvironmentMap();
    this.buildEnvironment();
    this.buildBoard();
    this.buildHighlights();
    this.bindInput();
    this.resize();
  }

  // ------------------------------------------------------------ escenario

  /** Entorno propio (oscuro, con dos focos de color) para que los metales reflejen
   *  algo coherente con la sala en vez de verse negros o lavados. */
  setupEnvironmentMap() {
    const envScene = new THREE.Scene();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(12, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x10121c, side: THREE.BackSide }),
    );
    envScene.add(shell);
    const panel = (color, w, h, pos, rot) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
      );
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      envScene.add(m);
    };
    panel(0xfff0d8, 7, 7, [0, 5.6, 0], [Math.PI / 2, 0, 0]);     // cenital cálido
    panel(0xffa65a, 5, 3, [0, 0.6, 5.6], [0, Math.PI, 0]);       // brasero del Alba
    panel(0x8f6bff, 5, 3, [0, 0.6, -5.6], [0, 0, 0]);            // brasero de Obsidiana
    panel(0x1a1d2b, 10, 6, [-5.6, 0, 0], [0, Math.PI / 2, 0]);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(envScene, 0.04);
    this.scene.environment = env.texture;
    pmrem.dispose();
    shell.geometry.dispose();
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0x9db4e8, 0x2b2420, 0.8);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff0d0, 1.75);
    key.position.set(5, 9.5, 5.5);
    key.castShadow = this.quality !== 'low';
    if (key.castShadow) {
      const s = this.quality === 'high' ? 2048 : 1024;
      key.shadow.mapSize.set(s, s);
      key.shadow.camera.left = -7;
      key.shadow.camera.right = 7;
      key.shadow.camera.top = 7;
      key.shadow.camera.bottom = -7;
      key.shadow.camera.far = 30;
      key.shadow.bias = -0.0016;
      key.shadow.normalBias = 0.02;
    }
    this.scene.add(key);
    this.keyLight = key;

    const warm = new THREE.PointLight(0xffb46b, 26, 16, 2);
    warm.position.set(0, 3.2, 7.5);
    this.scene.add(warm);
    const cold = new THREE.PointLight(0x9d8bff, 30, 18, 2);
    cold.position.set(0, 3.6, -7.5);
    this.scene.add(cold);
    // relleno cenital suave: evita que el bando oscuro se funda con el fondo
    const fill = new THREE.DirectionalLight(0xc9d6ff, 0.8);
    fill.position.set(-4, 6, -5);
    this.scene.add(fill);
    // contraluz para recortar la silueta del bando oscuro contra el fondo
    const rim = new THREE.DirectionalLight(0xa99bff, 0.7);
    rim.position.set(2, 3.5, -8);
    this.scene.add(rim);

    // suelo del salón
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(26, 48),
      new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.95, metalness: 0.05, envMapIntensity: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = this.quality !== 'low';
    this.scene.add(floor);

    // braseros en las esquinas
    this.braziers = [];
    const brazierGeo = new THREE.CylinderGeometry(0.17, 0.24, 0.3, 8);
    const columnGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.1, 8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b2d3a, roughness: 0.9, flatShading: true, envMapIntensity: 0.3 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const g = new THREE.Group();
      g.position.set(sx * 5.3, 0, sz * 5.3);
      const col = new THREE.Mesh(columnGeo, stoneMat);
      col.position.y = 0.45;
      col.castShadow = this.quality === 'high';
      g.add(col);
      const bowl = new THREE.Mesh(brazierGeo, stoneMat);
      bowl.position.y = 1.62;
      g.add(bowl);
      const warmSide = sz > 0;
      const flameColor = warmSide ? 0xffa24b : 0x9a7bff;
      const flame = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: flameColor, toneMapped: false }),
      );
      flame.position.y = 1.78;
      g.add(flame);
      const light = new THREE.PointLight(flameColor, 14, 11, 2);
      light.position.y = 1.85;
      g.add(light);
      this.scene.add(g);
      this.braziers.push({ group: g, flame, light, color: flameColor, seed: Math.random() * 10 });
    }
  }

  buildBoard() {
    const light = [];
    const dark = [];
    const tile = new THREE.BoxGeometry(0.985, 0.22, 0.985);
    for (let i = 0; i < 64; i++) {
      const g = tile.clone();
      const p = squareToWorld(i);
      g.translate(p.x, -0.11, p.z);
      ((i & 7) + (i >> 3)) % 2 === 1 ? light.push(g) : dark.push(g);
    }
    const merge = (list) => {
      const geo = new THREE.BufferGeometry();
      // hay que desindexar ANTES de contar: el conteo cambia al expandir el índice
      const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let total = 0;
      for (const g of flat) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      const uv = new Float32Array(total * 2);
      let o = 0;
      for (const ng of flat) {
        pos.set(ng.attributes.position.array, o * 3);
        nor.set(ng.attributes.normal.array, o * 3);
        uv.set(ng.attributes.uv.array, o * 2);
        o += ng.attributes.position.count;
        ng.dispose();
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return geo;
    };
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xbfb59a, roughness: 0.74, metalness: 0.06, envMapIntensity: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x343a4d, roughness: 0.64, metalness: 0.18, envMapIntensity: 0.35 });
    for (const [list, mat] of [[light, lightMat], [dark, darkMat]]) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.receiveShadow = this.quality !== 'low';
      this.scene.add(mesh);
    }

    // marco
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.8, metalness: 0.25, flatShading: true, envMapIntensity: 0.35 });
    const frame = new THREE.Group();
    const sides = [
      [0, 0, 4.35, 9.4, 0.7], [0, 0, -4.35, 9.4, 0.7],
      [4.35, 0, 0, 0.7, 9.4], [-4.35, 0, 0, 0.7, 9.4],
    ];
    for (const [x, y, z, w, d] of sides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), frameMat);
      m.position.set(x, -0.13, z);
      m.receiveShadow = this.quality !== 'low';
      m.castShadow = this.quality === 'high';
      frame.add(m);
    }
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.85, emissive: 0x2a1e06, envMapIntensity: 0.7 });
    const inner = new THREE.Mesh(new THREE.TorusGeometry(5.72, 0.035, 4, 4), goldMat);
    inner.rotation.x = Math.PI / 2;
    inner.rotation.z = Math.PI / 4;
    inner.position.y = -0.005;
    inner.scale.set(0.999, 0.999, 1);
    frame.add(inner);
    this.scene.add(frame);
    this.frame = frame;

    // coordenadas
    this.labels = new THREE.Group();
    const geoLabel = new THREE.PlaneGeometry(0.42, 0.42);
    for (let i = 0; i < 8; i++) {
      for (const side of [-1, 1]) {
        const fileTex = labelTexture('abcdefgh'[i]);
        const fm = new THREE.Mesh(geoLabel, new THREE.MeshBasicMaterial({ map: fileTex, transparent: true, toneMapped: false }));
        fm.rotation.x = -Math.PI / 2;
        fm.position.set(i - 3.5, 0.005, side * 4.32);
        fm.userData.label = 'file';
        this.labels.add(fm);

        const rankTex = labelTexture(String(i + 1));
        const rm = new THREE.Mesh(geoLabel, new THREE.MeshBasicMaterial({ map: rankTex, transparent: true, toneMapped: false }));
        rm.rotation.x = -Math.PI / 2;
        rm.position.set(side * 4.32, 0.005, 3.5 - i);
        rm.userData.label = 'rank';
        this.labels.add(rm);
      }
    }
    this.scene.add(this.labels);

    // plano invisible para el picking
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);
  }

  buildHighlights() {
    this.hl = {};
    const mk = (geo, color, opacity, y = 0.013) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return m;
    };
    const sqGeo = new THREE.PlaneGeometry(0.97, 0.97);
    this.hl.selection = mk(new THREE.RingGeometry(0.36, 0.46, 24), 0xffd166, 0.95, 0.016);
    this.hl.hover = mk(sqGeo, 0xffffff, 0.1);
    this.hl.lastFrom = mk(sqGeo, 0x6fd3ff, 0.16);
    this.hl.lastTo = mk(sqGeo, 0x6fd3ff, 0.26);
    this.hl.check = mk(new THREE.RingGeometry(0.3, 0.5, 24), 0xff4b4b, 0.8, 0.017);

    this.moveDots = [];
    const dotGeo = new THREE.CircleGeometry(0.13, 16);
    const capGeo = new THREE.RingGeometry(0.4, 0.48, 24);
    for (let i = 0; i < 32; i++) {
      const dot = mk(dotGeo, 0x9de07a, 0.75, 0.015);
      const cap = mk(capGeo, 0xff6b5e, 0.85, 0.015);
      this.moveDots.push({ dot, cap });
    }
  }

  // ----------------------------------------------------------------- piezas

  addPiece(type, color, idx) {
    const piece = createPiece(type, color);
    const p = squareToWorld(idx);
    piece.position.copy(p);
    piece.rotation.y = color === 'w' ? Math.PI : 0;
    piece.userData.square = idx;
    this.scene.add(piece);
    this.pieces.set(idx, piece);
    return piece;
  }

  setPosition(board) {
    for (const piece of this.pieces.values()) this.scene.remove(piece);
    this.pieces.clear();
    for (const piece of this.loose) this.scene.remove(piece);
    this.loose.clear();
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      this.addPiece(p.toLowerCase(), p === p.toUpperCase() ? 'w' : 'b', i);
    }
  }

  pieceAt(idx) { return this.pieces.get(idx) || null; }

  relocate(piece, from, to) {
    if (this.pieces.get(from) === piece) this.pieces.delete(from);
    this.pieces.set(to, piece);
    piece.userData.square = to;
  }

  detach(piece) {
    if (piece.userData.square != null) this.pieces.delete(piece.userData.square);
    this.loose.add(piece);
  }

  removePiece(piece) {
    this.loose.delete(piece);
    if (this.pieces.get(piece.userData.square) === piece) this.pieces.delete(piece.userData.square);
    this.scene.remove(piece);
  }

  // ------------------------------------------------------------- resaltados

  showSelection(idx) {
    if (idx < 0) { this.hl.selection.visible = false; return; }
    const p = squareToWorld(idx);
    this.hl.selection.position.set(p.x, 0.016, p.z);
    this.hl.selection.visible = true;
  }

  showMoves(moves) {
    let i = 0;
    for (const m of moves) {
      if (i >= this.moveDots.length) break;
      const { dot, cap } = this.moveDots[i++];
      const p = squareToWorld(m.to);
      const isCapture = !!m.captured;
      dot.position.set(p.x, 0.015, p.z);
      cap.position.set(p.x, 0.015, p.z);
      dot.visible = !isCapture;
      cap.visible = isCapture;
    }
    for (; i < this.moveDots.length; i++) {
      this.moveDots[i].dot.visible = false;
      this.moveDots[i].cap.visible = false;
    }
  }

  clearMoves() {
    for (const d of this.moveDots) { d.dot.visible = false; d.cap.visible = false; }
    this.hl.selection.visible = false;
  }

  showLastMove(from, to) {
    if (from == null) { this.hl.lastFrom.visible = this.hl.lastTo.visible = false; return; }
    const a = squareToWorld(from), b = squareToWorld(to);
    this.hl.lastFrom.position.set(a.x, 0.013, a.z);
    this.hl.lastTo.position.set(b.x, 0.013, b.z);
    this.hl.lastFrom.visible = this.hl.lastTo.visible = true;
  }

  showCheck(idx) {
    if (idx == null || idx < 0) { this.hl.check.visible = false; return; }
    const p = squareToWorld(idx);
    this.hl.check.position.set(p.x, 0.017, p.z);
    this.hl.check.visible = true;
  }

  setHover(idx) {
    this.hoverSquare = idx;
    if (idx < 0) { this.hl.hover.visible = false; return; }
    const p = squareToWorld(idx);
    this.hl.hover.position.set(p.x, 0.012, p.z);
    this.hl.hover.visible = true;
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const el = this.canvas;
    const pointers = new Map();
    let dragging = false;
    let pinchDist = 0;
    let downAt = 0;
    let downPos = null;

    const setPointer = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = false;
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') {
          setPointer(e);
          this.setHover(this.pickSquare());
        }
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX; prev.y = e.clientY;

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist) { this.sphGoal.r = clamp(this.sphGoal.r * (pinchDist / d), 6, 26); this.userZoomed = true; }
        pinchDist = d;
        dragging = true;
        return;
      }
      if (!dragging && downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 7) dragging = true;
      if (dragging) {
        this.sphGoal.theta -= dx * 0.0075;
        this.sphGoal.phi = clamp(this.sphGoal.phi - dy * 0.006, 0.18, 1.35);
        this.userRotated = true;
      }
    });

    const end = (e) => {
      const had = pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!had) return;
      const quick = performance.now() - downAt < 600;
      if (!dragging && quick && this.enabled) {
        setPointer(e);
        const idx = this.pickSquare();
        if (idx >= 0) for (const cb of this.tapHandlers) cb(idx);
      }
      dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => this.setHover(-1));

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.sphGoal.r = clamp(this.sphGoal.r * (1 + Math.sign(e.deltaY) * 0.09), 6, 26);
      this.userZoomed = true;
    }, { passive: false });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.resize());
  }

  onSquareTap(cb) { this.tapHandlers.push(cb); }

  /** Devuelve la casilla bajo el puntero: gana lo primero que se ve (pieza o casilla). */
  pickSquare() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [this.pickPlane];
    for (const p of this.pieces.values()) targets.push(p);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      if (hit.object === this.pickPlane) return worldToSquare(hit.point);
      let o = hit.object;
      while (o && o.userData.square == null) o = o.parent;
      if (o) return o.userData.square;
    }
    return -1;
  }

  // ----------------------------------------------------------------- cámara

  setOrientation(color, animate = true) {
    this.orientation = color;
    const goal = color === 'w' ? 0 : Math.PI;
    if (!animate) { this.sphGoal.theta = goal; this.sph.theta = goal; return Promise.resolve(); }
    const start = this.sphGoal.theta;
    const delta = shortAngle(start, goal);
    return tween(700, (t) => { this.sphGoal.theta = start + delta * t; }, Ease.inOutCubic);
  }

  flip() {
    return this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
  }

  focusOn(worldPos, weight = 0.35) {
    this.focusTarget = worldPos ? worldPos.clone() : null;
    this.focusWeight = weight;
  }

  /** Distancia a la que el tablero completo entra en el encuadre. */
  fitRadius() {
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const aspect = Math.min(1, this.camera.aspect);
    return clamp((aspect < 0.7 ? 4.95 : 5.2) / (half * aspect), 7, 26);
  }

  /** En vertical conviene mirar más desde arriba: el tablero se ve más cuadrado. */
  fitPhi() {
    return this.camera.aspect < 0.85 ? 0.62 : 0.76;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    // en pantallas angostas se abre el campo para que el tablero quepa entero
    const aspect = w / h;
    this.camera.fov = aspect < 0.6 ? 58 : aspect < 1 ? 52 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    const fit = this.fitRadius();
    if (!this.userZoomed) { this.sphGoal.r = fit; this.sph.r = this.sph.r || fit; }
    else this.sphGoal.r = clamp(this.sphGoal.r, fit * 0.45, fit * 1.7);
    if (!this.userRotated) { this.sphGoal.phi = this.fitPhi(); }
  }

  update(dt, time) {
    // cámara
    this.sph.theta = damp(this.sph.theta, this.sphGoal.theta, 8, dt);
    this.sph.phi = damp(this.sph.phi, this.sphGoal.phi, 8, dt);
    this.sph.r = damp(this.sph.r, this.sphGoal.r, 7, dt);

    const center = new THREE.Vector3(0, 0.35, 0);
    if (this.focusTarget) center.lerp(this.focusTarget, this.focusWeight ?? 0.35);
    this.target.lerp(center, 1 - Math.exp(-4 * dt));

    const { r, theta, phi } = this.sph;
    this.camera.position.set(
      this.target.x + r * Math.sin(phi) * Math.sin(theta),
      this.target.y + r * Math.cos(phi),
      this.target.z + r * Math.sin(phi) * Math.cos(theta),
    );
    this.fx.shakeOffset(this.clockShake);
    this.camera.position.add(this.clockShake);
    this.camera.lookAt(this.target);

    // animación de piezas
    for (const piece of this.pieces.values()) applyPieceAnim(piece, time);
    for (const piece of this.loose) applyPieceAnim(piece, time);

    // braseros
    for (const br of this.braziers) {
      const f = 0.75 + Math.sin(time * 9 + br.seed) * 0.12 + Math.sin(time * 23 + br.seed * 2) * 0.07;
      br.light.intensity = 11 * f;
      br.flame.scale.setScalar(0.85 + f * 0.3);
      br.flame.rotation.y += dt * 2;
      if (Math.random() < 0.25) {
        this.fx.spawn(
          br.group.position.x + rand(-0.06, 0.06), 1.85, br.group.position.z + rand(-0.06, 0.06),
          { color: br.color, size: rand(0.04, 0.09), life: rand(0.5, 1.2), vx: rand(-0.12, 0.12), vy: rand(0.5, 1.1), vz: rand(-0.12, 0.12), gravity: 0.35, drag: 0.7 },
        );
      }
    }

    // pulso de resaltados
    const pulse = 0.72 + Math.sin(time * 4) * 0.22;
    this.hl.selection.material.opacity = pulse;
    this.hl.check.material.opacity = 0.55 + Math.sin(time * 7) * 0.35;
    for (const d of this.moveDots) {
      if (d.cap.visible) d.cap.material.opacity = 0.6 + Math.sin(time * 5) * 0.25;
    }

    this.fx.update(dt, this.camera);
    this.render();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  async enableBloom() {
    if (this.quality === 'low') return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
      ]);
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight), 0.55, 0.6, 0.72,
      );
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
      this.bloomPass = bloom;
      const resize = () => composer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
      window.addEventListener('resize', resize);
      resize();
    } catch (err) {
      console.warn('Bloom no disponible:', err);
    }
  }
}
