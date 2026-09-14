// models.js — piezas construidas por código: cada una es un guerrero con esqueleto.
//
// Cada pieza es un THREE.Group cuyo `userData.rig` expone los nodos articulados
// (caderas, torso, cabeza, brazos, piernas, arma, capa…). Las geometrías rígidas
// de cada nodo se fusionan en 1-2 mallas con colores por vértice, de modo que una
// pieza completa cuesta ~10 draw calls en vez de ~40.

import * as THREE from 'three';

// ------------------------------------------------------------- paletas

export const PALETTES = {
  w: {
    name: 'Orden del Alba',
    armor: 0xe9e3d3,
    armorDark: 0xc6bda6,
    metal: 0xd9a63c,
    cloth: 0xd6c8a6,
    accent: 0xa8402c,
    leather: 0x7a5636,
    stone: 0xded5bf,
    glow: 0xffd27f,
    eye: 0xfff0c0,
    aura: 0xffc35c,
  },
  b: {
    name: 'Legión de Obsidiana',
    armor: 0x4d5470,
    armorDark: 0x303545,
    metal: 0x9d8bff,
    cloth: 0x4a3470,
    accent: 0x9d8bff,
    leather: 0x3a3128,
    stone: 0x545b73,
    glow: 0xa78bff,
    eye: 0xc3b0ff,
    aura: 0x8f6bff,
  },
};

// ------------------------------------------------------ fusión de mallas

function toLinear(hex) {
  return new THREE.Color(hex).convertSRGBToLinear();
}

function mergeGeos(geos) {
  let total = 0;
  const prepared = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    prepared.push(ng);
    total += ng.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** Acumula primitivas con transformación y color por vértice. */
class Builder {
  constructor() { this.solid = []; this.glow = []; }

  push(geo, o = {}) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.deleteAttribute('uv');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0),
    );
    m.compose(
      new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0),
      q,
      new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1),
    );
    geo.applyMatrix4(m);
    const c = toLinear(o.color ?? 0xffffff);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    (o.glow ? this.glow : this.solid).push(geo);
    return this;
  }

  box(w, h, d, o = {}) { return this.push(new THREE.BoxGeometry(w, h, d), o); }
  cyl(rt, rb, h, seg, o = {}) { return this.push(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), o); }
  sphere(r, o = {}) { return this.push(new THREE.SphereGeometry(r, o.seg || 10, o.seg2 || 8), o); }
  cone(r, h, o = {}) { return this.push(new THREE.ConeGeometry(r, h, o.seg || 8), o); }
  torus(r, tube, o = {}) { return this.push(new THREE.TorusGeometry(r, tube, 6, o.seg || 12), o); }
  tetra(r, o = {}) { return this.push(new THREE.TetrahedronGeometry(r, 0), o); }
  octa(r, o = {}) { return this.push(new THREE.OctahedronGeometry(r, 0), o); }
  lathe(points, o = {}) {
    return this.push(new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || 12), o);
  }

  isEmpty() { return !this.solid.length && !this.glow.length; }
}

class Rig {
  constructor(mats) {
    this.root = new THREE.Group();
    this.mats = mats;
    this.nodes = { root: this.root };
    this.builders = new Map();
    this.root.userData.rest = { x: 0, y: 0, z: 0 };
  }

  node(name, parent = 'root', x = 0, y = 0, z = 0, rot = null) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    if (rot) g.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.userData.rest = { x: g.rotation.x, y: g.rotation.y, z: g.rotation.z };
    g.userData.restPos = { x, y, z };
    this.nodes[parent].add(g);
    this.nodes[name] = g;
    return g;
  }

  b(name) {
    if (!this.builders.has(name)) this.builders.set(name, new Builder());
    return this.builders.get(name);
  }

  finish() {
    for (const [name, builder] of this.builders) {
      const node = this.nodes[name];
      if (builder.solid.length) {
        const mesh = new THREE.Mesh(mergeGeos(builder.solid), this.mats.solid);
        mesh.castShadow = true;
        mesh.userData.pieceMesh = true;
        node.add(mesh);
      }
      if (builder.glow.length) {
        const mesh = new THREE.Mesh(mergeGeos(builder.glow), this.mats.glow);
        mesh.userData.glowMesh = true;
        node.add(mesh);
      }
    }
    return this.root;
  }
}

export function createMaterials(color) {
  const P = PALETTES[color];
  return {
    solid: new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: color === 'w' ? 0.52 : 0.46,
      metalness: 0.28,
      envMapIntensity: 0.55,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    P,
  };
}

// ------------------------------------------------------------ utilidades

function limb(b, node, len, thick, color, o = {}) {
  b(node).box(thick, len, thick * 0.95, { y: -len / 2, color });
  if (o.pad) b(node).box(thick * 1.35, thick * 0.9, thick * 1.25, { y: -thick * 0.3, color: o.padColor ?? color });
}

function head(rig, P, o = {}) {
  // crea el nodo 'head' si aún no existe, con su posición de reposo correcta
  if (!rig.nodes.head) rig.node('head', o.parent ?? 'torso', 0, o.y ?? 0, 0);
  const b = rig.b('head');
  const r = o.r ?? 0.075;
  b.box(r * 1.7, r * 1.8, r * 1.6, { y: r * 0.6, color: o.skin ?? P.armorDark });
  // visor / ranura de ojos
  b.box(r * 1.5, r * 0.24, r * 0.2, { y: r * 0.7, z: r * 0.78, color: P.eye, glow: true });
  if (o.helmet !== false) {
    b.cyl(r * 1.15, r * 1.25, r * 1.2, 8, { y: r * 1.05, color: P.armor });
    b.cone(r * 1.2, r * 0.8, { y: r * 1.95, seg: 8, color: P.armor });
  }
  if (o.crest) {
    for (let i = 0; i < 5; i++) {
      b.box(r * 0.16, r * (0.5 - i * 0.06), r * 0.28, {
        y: r * (2.2 + 0.1 * Math.sin(i)), z: r * (-0.1 + i * 0.22), color: P.accent,
      });
    }
  }
  if (o.crown) {
    b.cyl(r * 1.35, r * 1.3, r * 0.42, 10, { y: r * 1.7, color: P.metal });
    const n = o.crownPoints ?? 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      b.cone(r * 0.22, r * 0.6, {
        x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r * 1.2, y: r * 2.2, seg: 5,
        color: P.metal,
      });
      b.octa(r * 0.12, {
        x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r * 1.2, y: r * 2.5,
        color: P.glow, glow: true,
      });
    }
  }
  if (o.mitre) {
    b.cone(r * 1.25, r * 1.9, { y: r * 2.0, seg: 4, ry: Math.PI / 4, color: P.cloth });
    b.torus(r * 1.2, r * 0.1, { y: r * 1.15, rx: Math.PI / 2, seg: 10, color: P.metal });
    b.octa(r * 0.16, { y: r * 3.0, color: P.glow, glow: true });
  }
  if (o.hood) {
    b.sphere(r * 1.35, { y: r * 0.75, color: P.cloth, seg: 10 });
    b.cone(r * 1.1, r * 1.1, { y: r * 1.75, seg: 8, color: P.cloth });
  }
}

function sword(b, node, P, o = {}) {
  const len = o.len ?? 0.34;
  const w = o.w ?? 0.05;
  b(node).box(w, len, 0.016, { y: len / 2 + 0.05, color: o.blade ?? 0xcfd6e4 });
  b(node).cone(w * 0.7, 0.07, { y: len + 0.09, seg: 4, ry: Math.PI / 4, color: o.blade ?? 0xcfd6e4 });
  b(node).box(w * 2.6, 0.022, 0.03, { y: 0.045, color: P.metal });       // guarda
  b(node).cyl(0.016, 0.016, 0.09, 6, { y: 0, color: P.leather });        // empuñadura
  b(node).sphere(0.026, { y: -0.05, color: P.metal, seg: 6 });           // pomo
  if (o.runes) b(node).box(w * 0.3, len * 0.8, 0.02, { y: len / 2 + 0.05, z: 0.004, color: P.glow, glow: true });
}

function shield(b, node, P, o = {}) {
  const r = o.r ?? 0.11;
  b(node).cyl(r, r * 0.95, 0.03, 10, { rx: Math.PI / 2, color: P.armorDark });
  b(node).cyl(r * 0.98, r * 0.98, 0.012, 10, { rx: Math.PI / 2, z: 0.022, color: P.cloth });
  b(node).sphere(r * 0.28, { z: 0.035, color: P.metal, seg: 8 });
  b(node).torus(r * 0.62, 0.012, { z: 0.03, seg: 12, color: P.metal });
}

function cape(rig, P, from, y, w, len, segs = 3) {
  let parent = from;
  for (let i = 0; i < segs; i++) {
    const name = `cape${i}`;
    rig.node(name, parent, 0, i === 0 ? y : -len / segs, i === 0 ? -0.07 : 0);
    const t = i / segs;
    rig.b(name).box(w * (1 - t * 0.25), len / segs, 0.03, {
      y: -len / segs / 2, color: P.cloth,
    });
    parent = name;
  }
}

// ------------------------------------------------------------- las piezas

function buildPawn(rig, P) {
  const legLen = 0.19;
  rig.node('body');
  rig.node('hips', 'body', 0, 0.21, 0);
  rig.b('hips').box(0.2, 0.09, 0.14, { y: 0.01, color: P.leather });
  rig.node('torso', 'hips', 0, 0.03, 0);
  const b = rig.b('torso');
  b.box(0.23, 0.19, 0.145, { y: 0.095, color: P.armor });
  b.box(0.25, 0.06, 0.16, { y: 0.17, color: P.armorDark });        // hombreras
  b.box(0.1, 0.12, 0.02, { y: 0.1, z: 0.08, color: P.accent });    // tabardo
  b.box(0.22, 0.03, 0.15, { y: 0.005, color: P.metal });           // cinturón

  head(rig, P, { r: 0.062, crest: true, y: 0.235 });

  rig.node('armR', 'torso', -0.135, 0.175, 0, [0, 0, 0.12]);
  rig.node('armL', 'torso', 0.135, 0.175, 0, [0, 0, -0.12]);
  limb(rig.b.bind(rig), 'armR', 0.11, 0.055, P.armor, { pad: true, padColor: P.armorDark });
  limb(rig.b.bind(rig), 'armL', 0.11, 0.055, P.armor, { pad: true, padColor: P.armorDark });
  rig.node('handR', 'armR', 0, -0.12, 0);
  rig.node('handL', 'armL', 0, -0.12, 0);
  rig.b('handR').box(0.05, 0.05, 0.05, { color: P.leather });
  rig.b('handL').box(0.05, 0.05, 0.05, { color: P.leather });
  rig.node('weapon', 'handR', 0, 0, 0.02, [-0.5, 0, 0]);
  sword(rig.b.bind(rig), 'weapon', P, { len: 0.22, w: 0.042 });
  rig.node('shield', 'handL', 0.02, 0, 0.02, [0, 0, 0]);
  shield(rig.b.bind(rig), 'shield', P, { r: 0.095 });

  rig.node('legL', 'hips', -0.06, -0.02, 0);
  rig.node('legR', 'hips', 0.06, -0.02, 0);
  for (const n of ['legL', 'legR']) {
    limb(rig.b.bind(rig), n, legLen, 0.072, P.armorDark);
    rig.b(n).box(0.09, 0.045, 0.12, { y: -legLen - 0.01, z: 0.02, color: P.leather });
  }
  return { height: 0.58, radius: 0.2, walkSpeed: 1.5, weight: 0.8 };
}

function buildRook(rig, P) {
  rig.node('body');
  rig.node('hips', 'body', 0, 0.2, 0);
  rig.b('hips').box(0.3, 0.1, 0.24, { color: P.stone });
  rig.node('torso', 'hips', 0, 0.04, 0);
  const b = rig.b('torso');
  b.cyl(0.19, 0.22, 0.32, 8, { y: 0.16, color: P.stone });
  b.cyl(0.205, 0.205, 0.05, 8, { y: 0.05, color: P.armorDark });
  b.box(0.1, 0.12, 0.05, { y: 0.22, z: 0.18, color: P.eye, glow: true });   // ventana-ojo
  b.box(0.14, 0.16, 0.03, { y: 0.22, z: 0.195, color: P.armorDark });
  b.box(0.03, 0.16, 0.04, { y: 0.22, z: 0.2, color: P.stone });

  // almenas
  rig.node('head', 'torso', 0, 0.32, 0);
  const h = rig.b('head');
  h.cyl(0.21, 0.2, 0.06, 8, { y: 0.03, color: P.armorDark });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    h.box(0.08, 0.09, 0.08, { x: Math.cos(a) * 0.15, z: Math.sin(a) * 0.15, y: 0.1, ry: -a, color: P.stone });
  }
  h.torus(0.13, 0.012, { y: 0.075, rx: Math.PI / 2, seg: 10, color: P.glow, glow: true });

  rig.node('armR', 'torso', -0.22, 0.26, 0, [0, 0, 0.18]);
  rig.node('armL', 'torso', 0.22, 0.26, 0, [0, 0, -0.18]);
  for (const n of ['armR', 'armL']) {
    rig.b(n).box(0.1, 0.2, 0.1, { y: -0.1, color: P.stone });
    rig.b(n).box(0.13, 0.08, 0.13, { y: -0.02, color: P.armorDark });
  }
  rig.node('handR', 'armR', 0, -0.21, 0);
  rig.node('handL', 'armL', 0, -0.21, 0);
  rig.b('handR').box(0.11, 0.1, 0.11, { color: P.stone });
  rig.b('handL').box(0.11, 0.1, 0.11, { color: P.stone });

  // martillo de guerra
  rig.node('weapon', 'handR', 0, 0, 0.03, [-0.55, 0, 0]);
  const w = rig.b('weapon');
  w.cyl(0.022, 0.025, 0.34, 6, { y: 0.12, color: P.leather });
  w.box(0.15, 0.12, 0.13, { y: 0.3, color: P.armorDark });
  w.box(0.05, 0.14, 0.15, { x: 0.09, y: 0.3, color: P.metal });
  w.box(0.05, 0.14, 0.15, { x: -0.09, y: 0.3, color: P.metal });
  w.box(0.16, 0.03, 0.03, { y: 0.3, z: 0.075, color: P.glow, glow: true });

  rig.node('legL', 'hips', -0.1, -0.04, 0);
  rig.node('legR', 'hips', 0.1, -0.04, 0);
  for (const n of ['legL', 'legR']) {
    rig.b(n).box(0.11, 0.15, 0.12, { y: -0.075, color: P.armorDark });
    rig.b(n).box(0.14, 0.06, 0.17, { y: -0.16, z: 0.02, color: P.stone });
  }
  return { height: 0.72, radius: 0.26, walkSpeed: 1.0, weight: 1.6 };
}

function buildKnight(rig, P) {
  // caballo
  rig.node('body');
  rig.node('horse', 'body', 0, 0.34, 0);
  const hb = rig.b('horse');
  hb.box(0.2, 0.2, 0.46, { y: 0.02, color: P.armorDark });
  hb.box(0.22, 0.16, 0.2, { y: 0.03, z: -0.1, color: P.leather });   // grupa
  hb.box(0.24, 0.06, 0.26, { y: 0.11, z: 0.02, color: P.accent });   // gualdrapa
  hb.box(0.26, 0.1, 0.06, { y: 0.02, z: 0.16, color: P.armor });     // peto

  rig.node('neck', 'horse', 0, 0.08, 0.2, [-0.5, 0, 0]);
  const nb = rig.b('neck');
  nb.box(0.13, 0.24, 0.15, { y: 0.11, color: P.armorDark });
  for (let i = 0; i < 5; i++) nb.box(0.03, 0.07, 0.06, { y: 0.05 + i * 0.05, z: -0.07, color: P.accent });
  rig.node('horseHead', 'neck', 0, 0.24, 0, [0.6, 0, 0]);
  const hh = rig.b('horseHead');
  hh.box(0.11, 0.11, 0.2, { z: 0.06, color: P.armorDark });
  hh.box(0.09, 0.08, 0.1, { z: 0.17, y: -0.02, color: P.leather });
  hh.box(0.12, 0.09, 0.08, { z: 0.02, y: 0.05, color: P.armor });     // testera
  hh.cone(0.028, 0.09, { z: 0.02, y: 0.13, seg: 5, color: P.metal });
  hh.box(0.02, 0.05, 0.02, { x: 0.04, y: 0.09, z: -0.03, color: P.armorDark });
  hh.box(0.02, 0.05, 0.02, { x: -0.04, y: 0.09, z: -0.03, color: P.armorDark });
  hh.box(0.03, 0.02, 0.03, { x: 0.035, y: 0.03, z: 0.1, color: P.eye, glow: true });
  hh.box(0.03, 0.02, 0.03, { x: -0.035, y: 0.03, z: 0.1, color: P.eye, glow: true });

  rig.node('tail', 'horse', 0, 0.06, -0.24, [0.5, 0, 0]);
  rig.b('tail').box(0.05, 0.18, 0.05, { y: -0.09, color: P.cloth });

  const legs = [
    ['legFL', -0.09, 0.17], ['legFR', 0.09, 0.17],
    ['legBL', -0.09, -0.16], ['legBR', 0.09, -0.16],
  ];
  for (const [name, x, z] of legs) {
    rig.node(name, 'horse', x, -0.06, z);
    rig.b(name).box(0.07, 0.16, 0.07, { y: -0.08, color: P.armorDark });
    rig.node(name + 'L', name, 0, -0.16, 0);
    rig.b(name + 'L').box(0.055, 0.14, 0.055, { y: -0.07, color: P.leather });
    rig.b(name + 'L').box(0.075, 0.04, 0.09, { y: -0.15, z: 0.01, color: P.metal });
  }

  // jinete
  rig.node('hips', 'horse', 0, 0.12, -0.02);
  rig.node('torso', 'hips', 0, 0.02, 0);
  const tb = rig.b('torso');
  tb.box(0.19, 0.18, 0.14, { y: 0.09, color: P.armor });
  tb.box(0.23, 0.055, 0.16, { y: 0.16, color: P.armorDark });
  tb.box(0.09, 0.13, 0.02, { y: 0.09, z: 0.08, color: P.accent });
  head(rig, P, { r: 0.058, crest: true, y: 0.22 });

  rig.node('armR', 'torso', -0.12, 0.16, 0, [0, 0, 0.2]);
  rig.node('armL', 'torso', 0.12, 0.16, 0, [0, 0, -0.2]);
  limb(rig.b.bind(rig), 'armR', 0.1, 0.05, P.armor, { pad: true, padColor: P.armorDark });
  limb(rig.b.bind(rig), 'armL', 0.1, 0.05, P.armor, { pad: true, padColor: P.armorDark });
  rig.node('handR', 'armR', 0, -0.11, 0);
  rig.node('handL', 'armL', 0, -0.11, 0);
  rig.b('handR').box(0.045, 0.045, 0.045, { color: P.leather });
  rig.b('handL').box(0.045, 0.045, 0.045, { color: P.leather });

  // lanza (apuntando al frente, +Z)
  rig.node('weapon', 'handR', 0, 0, 0, [Math.PI / 2, 0, 0]);
  const wb = rig.b('weapon');
  wb.cyl(0.016, 0.022, 0.46, 6, { y: 0.12, color: P.leather });
  wb.cone(0.035, 0.12, { y: 0.4, seg: 6, color: 0xcfd6e4 });
  wb.cone(0.05, 0.07, { y: 0.26, seg: 6, color: P.metal });
  wb.box(0.02, 0.08, 0.06, { y: 0.33, color: P.glow, glow: true });

  rig.node('legL', 'hips', -0.11, 0, 0.01, [0, 0, -0.25]);
  rig.node('legR', 'hips', 0.11, 0, 0.01, [0, 0, 0.25]);
  for (const n of ['legL', 'legR']) {
    rig.b(n).box(0.06, 0.14, 0.07, { y: -0.07, color: P.armorDark });
    rig.b(n).box(0.07, 0.04, 0.1, { y: -0.15, z: 0.015, color: P.metal });
  }
  return { height: 0.84, radius: 0.3, walkSpeed: 2.4, weight: 1.3, mounted: true };
}

function buildBishop(rig, P) {
  rig.node('body');
  rig.node('hips', 'body', 0, 0.3, 0);
  // túnica estrecha y alta: silueta de báculo, no de campana
  rig.b('hips').lathe([
    [0.005, -0.3], [0.165, -0.3], [0.155, -0.22], [0.125, -0.1],
    [0.1, 0.0], [0.095, 0.05], [0.0, 0.06],
  ], { seg: 14, color: P.cloth });
  rig.b('hips').lathe([
    [0.166, -0.3], [0.15, -0.25],
  ], { seg: 14, color: P.metal });
  rig.b('hips').torus(0.1, 0.016, { y: 0.02, rx: Math.PI / 2, seg: 14, color: P.metal });

  rig.node('torso', 'hips', 0, 0.04, 0);
  const b = rig.b('torso');
  b.box(0.15, 0.18, 0.12, { y: 0.09, color: P.cloth });
  // manto sobre los hombros
  b.lathe([[0.02, 0.19], [0.13, 0.12], [0.15, 0.02]], { seg: 14, color: P.accent });
  b.box(0.05, 0.17, 0.02, { y: 0.09, z: 0.065, color: P.metal });
  b.torus(0.03, 0.009, { y: 0.145, z: 0.072, seg: 10, color: P.glow, glow: true });

  head(rig, P, { r: 0.058, helmet: false, mitre: true, hood: true, y: 0.23 });

  rig.node('armR', 'torso', -0.105, 0.155, 0, [0, 0, 0.3]);
  rig.node('armL', 'torso', 0.105, 0.155, 0, [0, 0, -0.28]);
  for (const n of ['armR', 'armL']) {
    rig.b(n).box(0.055, 0.2, 0.055, { y: -0.1, color: P.cloth });
    rig.b(n).lathe([[0.045, -0.02], [0.09, -0.12], [0.075, -0.16]], { seg: 10, color: P.accent });
  }
  rig.node('handR', 'armR', 0, -0.21, 0);
  rig.node('handL', 'armL', 0, -0.21, 0);
  rig.b('handR').box(0.045, 0.045, 0.045, { color: P.armorDark });
  rig.b('handL').box(0.045, 0.045, 0.045, { color: P.armorDark });

  // báculo largo, bien visible por encima de la cabeza
  rig.node('weapon', 'handR', -0.02, 0, 0.01, [0, 0, -0.08]);
  const w = rig.b('weapon');
  w.cyl(0.013, 0.016, 0.66, 6, { y: 0.16, color: P.leather });
  w.torus(0.055, 0.013, { y: 0.47, seg: 12, color: P.metal });
  w.cone(0.032, 0.08, { y: 0.53, seg: 6, color: P.metal });
  rig.node('orb', 'weapon', 0, 0.47, 0);
  rig.b('orb').sphere(0.045, { color: P.glow, glow: true, seg: 10 });
  return { height: 0.86, radius: 0.2, walkSpeed: 1.7, weight: 0.9, robed: true, caster: true };
}

function buildQueen(rig, P) {
  rig.node('body');
  rig.node('hips', 'body', 0, 0.36, 0);
  rig.b('hips').lathe([
    [0.005, -0.36], [0.25, -0.36], [0.225, -0.26], [0.17, -0.12],
    [0.13, 0.0], [0.12, 0.05], [0.0, 0.06],
  ], { seg: 16, color: P.cloth });
  // orfebrería vertical sobre la falda
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rig.b('hips').box(0.014, 0.22, 0.016, {
      x: Math.cos(a) * 0.195, z: Math.sin(a) * 0.195, y: -0.24, ry: -a, rx: 0.14, color: P.metal,
    });
  }
  rig.b('hips').torus(0.125, 0.02, { y: 0.02, rx: Math.PI / 2, seg: 16, color: P.metal });

  rig.node('torso', 'hips', 0, 0.04, 0);
  const b = rig.b('torso');
  b.box(0.17, 0.22, 0.125, { y: 0.11, color: P.armor });
  b.box(0.215, 0.05, 0.145, { y: 0.2, color: P.metal });
  b.octa(0.04, { y: 0.14, z: 0.072, color: P.glow, glow: true });
  b.box(0.028, 0.22, 0.014, { x: 0.058, y: 0.11, z: 0.066, color: P.metal });
  b.box(0.028, 0.22, 0.014, { x: -0.058, y: 0.11, z: 0.066, color: P.metal });
  // cuello real en abanico (silueta inconfundible)
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.9;
    b.box(0.032, 0.2 - Math.abs(a) * 0.05, 0.018, {
      x: Math.sin(a) * 0.13, z: -0.07 - Math.cos(a) * 0.02, y: 0.27, ry: -a, rz: Math.sin(a) * 0.3, rx: -0.22,
      color: i % 2 ? P.metal : P.accent,
    });
  }

  head(rig, P, { r: 0.062, helmet: false, crown: true, crownPoints: 6, skin: P.armorDark, y: 0.27 });
  rig.b('head').box(0.14, 0.13, 0.05, { y: 0.05, z: -0.06, color: P.accent });

  rig.node('armR', 'torso', -0.115, 0.195, 0, [0, 0, 0.25]);
  rig.node('armL', 'torso', 0.115, 0.195, 0, [0, 0, -0.25]);
  for (const n of ['armR', 'armL']) {
    rig.b(n).box(0.05, 0.22, 0.05, { y: -0.11, color: P.armor });
    rig.b(n).lathe([[0.04, -0.04], [0.085, -0.14], [0.07, -0.19]], { seg: 10, color: P.cloth });
  }
  rig.node('handR', 'armR', 0, -0.23, 0);
  rig.node('handL', 'armL', 0, -0.23, 0);
  rig.b('handR').box(0.042, 0.042, 0.042, { color: P.armorDark });
  rig.b('handL').box(0.042, 0.042, 0.042, { color: P.armorDark });

  // no lleva arma: canaliza energía entre las manos
  rig.node('orb', 'handR', 0, -0.06, 0.02);
  rig.b('orb').octa(0.055, { color: P.glow, glow: true });

  rig.node('halo', 'torso', 0, 0.44, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rig.b('halo').octa(0.026, { x: Math.cos(a) * 0.16, z: Math.sin(a) * 0.16, y: 0.02 * i, color: P.glow, glow: true });
  }
  cape(rig, P, 'torso', 0.21, 0.26, 0.46, 3);
  return { height: 1.05, radius: 0.25, walkSpeed: 1.6, weight: 1.0, robed: true, caster: true };
}

function buildKing(rig, P) {
  const legLen = 0.24;
  rig.node('body');
  rig.node('hips', 'body', 0, 0.28, 0);
  rig.b('hips').box(0.26, 0.11, 0.18, { color: P.armorDark });
  rig.b('hips').box(0.3, 0.04, 0.2, { y: 0.05, color: P.metal });
  // faldón
  rig.b('hips').lathe([[0.13, 0.0], [0.18, -0.12], [0.185, -0.2]], { seg: 14, color: P.cloth });

  rig.node('torso', 'hips', 0, 0.05, 0);
  const b = rig.b('torso');
  b.box(0.3, 0.24, 0.19, { y: 0.12, color: P.armor });
  b.box(0.34, 0.07, 0.21, { y: 0.22, color: P.armorDark });
  b.box(0.36, 0.09, 0.1, { y: 0.21, z: 0.02, color: P.metal });
  b.octa(0.045, { y: 0.16, z: 0.1, color: P.glow, glow: true });
  b.box(0.12, 0.16, 0.02, { y: 0.12, z: 0.1, color: P.accent });

  head(rig, P, { r: 0.075, helmet: false, crown: true, crownPoints: 5, skin: P.armorDark, y: 0.29 });
  rig.b('head').box(0.16, 0.08, 0.12, { y: -0.02, z: -0.02, color: P.cloth });

  rig.node('armR', 'torso', -0.17, 0.21, 0, [0, 0, 0.2]);
  rig.node('armL', 'torso', 0.17, 0.21, 0, [0, 0, -0.2]);
  limb(rig.b.bind(rig), 'armR', 0.14, 0.07, P.armor, { pad: true, padColor: P.metal });
  limb(rig.b.bind(rig), 'armL', 0.14, 0.07, P.armor, { pad: true, padColor: P.metal });
  rig.node('handR', 'armR', 0, -0.15, 0);
  rig.node('handL', 'armL', 0, -0.15, 0);
  rig.b('handR').box(0.06, 0.06, 0.06, { color: P.leather });
  rig.b('handL').box(0.06, 0.06, 0.06, { color: P.leather });

  rig.node('weapon', 'handR', 0, 0, 0.02, [-0.42, 0, 0]);
  sword(rig.b.bind(rig), 'weapon', P, { len: 0.42, w: 0.062, runes: true });

  rig.node('legL', 'hips', -0.08, -0.05, 0);
  rig.node('legR', 'hips', 0.08, -0.05, 0);
  for (const n of ['legL', 'legR']) {
    limb(rig.b.bind(rig), n, legLen, 0.085, P.armorDark);
    rig.b(n).box(0.11, 0.05, 0.15, { y: -legLen - 0.015, z: 0.025, color: P.metal });
  }
  cape(rig, P, 'torso', 0.24, 0.3, 0.5, 3);
  return { height: 1.02, radius: 0.26, walkSpeed: 1.1, weight: 1.5 };
}

const BUILDERS = { p: buildPawn, r: buildRook, n: buildKnight, b: buildBishop, q: buildQueen, k: buildKing };

export const PIECE_NAMES = {
  p: 'Peón', r: 'Torre', n: 'Caballo', b: 'Alfil', q: 'Dama', k: 'Rey',
};

/**
 * Crea una pieza jugable.
 * @returns {THREE.Group} con userData: {type,color,rig,nodes,spec,collider}
 */
export const PIECE_SCALE = 1.18;

export function createPiece(type, color) {
  const mats = createMaterials(color);
  const rig = new Rig(mats);
  const spec = BUILDERS[type](rig, mats.P);
  const root = rig.finish();

  // base luminosa bajo los pies (marca el bando)
  const baseGeo = new THREE.RingGeometry(spec.radius * 0.62, spec.radius * 0.78, 20);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({
    color: mats.P.aura, transparent: true, opacity: 0.34, toneMapped: false,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.011;
  root.add(base);

  // volumen de referencia (no se dibuja ni se raycastea: el picking usa la malla real)
  const collider = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.radius * 0.85, spec.radius * 0.85, spec.height, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  collider.position.y = spec.height / 2;
  collider.visible = false;
  collider.userData.isCollider = true;
  root.add(collider);

  root.scale.setScalar(PIECE_SCALE);
  // medidas en unidades de tablero (las del spec están en el espacio local de la pieza)
  spec.worldHeight = spec.height * PIECE_SCALE;
  spec.worldRadius = spec.radius * PIECE_SCALE;

  root.userData = {
    type, color, spec, mats,
    nodes: rig.nodes,
    base,
    collider,
    anim: { mode: 'idle', k: 0, phase: Math.random() * 10, walkPhase: 0, seed: Math.random() * 6.28 },
  };
  root.name = `${color}${type}`;
  return root;
}

export function disposePiece(piece) {
  piece.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material && !o.material.userData?.shared) o.material.dispose();
    }
  });
}
