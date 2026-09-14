// fx.js — partículas, ondas de choque, proyectiles y destellos.

import * as THREE from 'three';
import { tween, Ease, rand, clamp } from './util.js';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (320.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export class FX {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.max = quality === 'low' ? 500 : 1600;
    this.count = 0;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.siz = new Float32Array(this.max);
    this.alp = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.size0 = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);

    this.rings = [];
    this.flashes = [];
    this.shards = [];
    this.trails = [];
    this.shake = 0;

    this.ringGeo = new THREE.RingGeometry(0.5, 0.62, 28);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.flashGeo = new THREE.PlaneGeometry(1, 1);
    this.shardGeo = new THREE.TetrahedronGeometry(0.05, 0);
    this.sphereGeo = new THREE.IcosahedronGeometry(0.07, 1);
  }

  spawn(x, y, z, opts) {
    let i = this.count;
    if (i >= this.max) {
      // recicla la partícula más vieja
      let oldest = 0, best = Infinity;
      for (let j = 0; j < this.max; j++) {
        const rem = this.maxLife[j] - this.life[j];
        if (rem < best) { best = rem; oldest = j; }
      }
      i = oldest;
    } else {
      this.count++;
    }
    const c = opts.color instanceof THREE.Color ? opts.color : new THREE.Color(opts.color);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.vel[i * 3] = opts.vx; this.vel[i * 3 + 1] = opts.vy; this.vel[i * 3 + 2] = opts.vz;
    this.life[i] = 0;
    this.maxLife[i] = opts.life;
    this.size0[i] = opts.size;
    this.siz[i] = opts.size;
    this.alp[i] = 1;
    this.grav[i] = opts.gravity ?? -3;
    this.drag[i] = opts.drag ?? 1.2;
    this.geo.setDrawRange(0, this.count);
  }

  sparks(p, n, color, opts = {}) {
    const speed = opts.speed ?? 3.2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(-0.3, 1);
      const s = speed * rand(0.4, 1.3);
      this.spawn(p.x + rand(-0.03, 0.03), p.y + rand(-0.03, 0.03), p.z + rand(-0.03, 0.03), {
        color, size: rand(0.035, 0.075), life: rand(0.25, 0.65),
        vx: Math.cos(a) * s * (1 - Math.abs(e) * 0.4),
        vy: e * s * 0.9 + (opts.up ?? 0.6),
        vz: Math.sin(a) * s * (1 - Math.abs(e) * 0.4),
        gravity: opts.gravity ?? -5.5, drag: 1.6,
      });
    }
  }

  dust(p, n, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed ?? 0.8) * rand(0.3, 1);
      this.spawn(p.x + rand(-0.1, 0.1), p.y + rand(0, 0.05), p.z + rand(-0.1, 0.1), {
        color, size: rand(0.09, 0.2), life: rand(0.6, 1.3),
        vx: Math.cos(a) * s, vy: rand(0.15, 0.7), vz: Math.sin(a) * s,
        gravity: opts.gravity ?? 0.15, drag: 2.4,
      });
    }
  }

  embers(p, n, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0, opts.radius ?? 0.2);
      this.spawn(p.x + Math.cos(a) * r, p.y + rand(0, opts.height ?? 0.5), p.z + Math.sin(a) * r, {
        color, size: rand(0.04, 0.1), life: rand(0.8, 1.8),
        vx: rand(-0.25, 0.25), vy: rand(0.35, 1.1), vz: rand(-0.25, 0.25),
        gravity: 0.5, drag: 0.9,
      });
    }
  }

  ring(p, color, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: opts.opacity ?? 0.9,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(p.x, p.y + 0.02, p.z);
    mesh.scale.setScalar(0.2);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const entry = { mesh, t: 0, dur: opts.duration ?? 0.6, max: opts.radius ?? 1.2, op: opts.opacity ?? 0.9 };
    this.rings.push(entry);
    return entry;
  }

  flash(p, color, size = 0.8, duration = 0.25) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.flashGeo, mat);
    mesh.position.copy(p);
    mesh.scale.setScalar(size);
    mesh.renderOrder = 6;
    mesh.userData.billboard = true;
    this.scene.add(mesh);
    this.flashes.push({ mesh, t: 0, dur: duration, size });
  }

  /** Fragmentos sólidos que salen despedidos (cuando una pieza se rompe). */
  shatter(p, color, n = 14, spread = 2.6) {
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.3 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.shardGeo, mat);
      m.position.set(p.x + rand(-0.1, 0.1), p.y + rand(0, 0.35), p.z + rand(-0.1, 0.1));
      m.scale.setScalar(rand(0.5, 1.6));
      m.castShadow = true;
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      this.shards.push({
        mesh: m, mat,
        v: new THREE.Vector3(Math.cos(a) * rand(0.4, 1) * spread, rand(1.4, 3.4), Math.sin(a) * rand(0.4, 1) * spread),
        spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        t: 0, dur: rand(1.1, 1.8),
      });
    }
  }

  /** Proyectil mágico que viaja de `from` a `to`. Devuelve una promesa. */
  bolt(from, to, color, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true });
    const mesh = new THREE.Mesh(this.sphereGeo, mat);
    mesh.position.copy(from);
    mesh.scale.setScalar(opts.scale ?? 1);
    this.scene.add(mesh);
    const light = new THREE.PointLight(color, 2.5, 2.4);
    mesh.add(light);
    const arc = opts.arc ?? 0.28;
    const dur = opts.duration ?? 420;
    const tmp = new THREE.Vector3();
    return tween(dur, (t) => {
      tmp.lerpVectors(from, to, t);
      tmp.y += Math.sin(t * Math.PI) * arc;
      mesh.position.copy(tmp);
      mesh.scale.setScalar((opts.scale ?? 1) * (1 + Math.sin(t * Math.PI * 6) * 0.12));
      if (Math.random() < 0.9) {
        this.spawn(tmp.x, tmp.y, tmp.z, {
          color, size: rand(0.05, 0.1), life: rand(0.15, 0.4),
          vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.4), vz: rand(-0.3, 0.3),
          gravity: 0.4, drag: 2,
        });
      }
    }, Ease.linear).then(() => {
      this.scene.remove(mesh);
      mat.dispose();
    });
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt, camera) {
    // partículas
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] > this.maxLife[i]) { this.alp[i] = 0; continue; }
      this.life[i] += dt;
      const k = clamp(this.life[i] / this.maxLife[i], 0, 1);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.25; }
      this.alp[i] = 1 - k * k;
      this.siz[i] = this.size0[i] * (1 - k * 0.55);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    // anillos
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = clamp(r.t / r.dur, 0, 1);
      r.mesh.scale.setScalar(0.2 + Ease.outCubic(k) * r.max);
      r.mesh.material.opacity = r.op * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    // destellos
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1);
      f.mesh.scale.setScalar(f.size * (0.6 + Ease.outCubic(k) * 1.4));
      f.mesh.material.opacity = 1 - k;
      if (camera) f.mesh.quaternion.copy(camera.quaternion);
      if (k >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }

    // fragmentos
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      s.v.y -= 9.2 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < 0.03) {
        s.mesh.position.y = 0.03;
        s.v.y *= -0.35;
        s.v.x *= 0.6; s.v.z *= 0.6;
        s.spin.multiplyScalar(0.5);
      }
      const k = clamp(s.t / s.dur, 0, 1);
      if (k > 0.6) s.mesh.scale.multiplyScalar(1 - dt * 3);
      if (k >= 1) {
        this.scene.remove(s.mesh);
        this.shards.splice(i, 1);
      }
    }

    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  shakeOffset(out) {
    const s = this.shake * this.shake * 0.16;
    out.set(rand(-s, s), rand(-s, s), rand(-s, s));
    return out;
  }
}

/** Tinte temporal sobre una pieza (impacto, selección, jaque). */
export function flashPiece(piece, color, ms = 220, intensity = 0.9) {
  const mat = piece.userData.mats.solid;
  mat.emissive = new THREE.Color(color);
  return tween(ms, (t) => {
    mat.emissiveIntensity = (1 - t) * intensity;
  }, Ease.outCubic).then(() => { mat.emissiveIntensity = 0; });
}
