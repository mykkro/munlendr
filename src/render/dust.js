import * as THREE from 'three';
import { PALETTE } from './toon.js';
import { tangentBasis } from '../sim/frame.js';

const FAR = 1e8; // beyond the far plane: parks dead particles out of view
const G = 1.62;

export class Dust {
  constructor(scene, count = 240) {
    this.scene = scene;
    this.count = count;
    this.pos = new Float64Array(count * 3);
    this.vel = new Float64Array(count * 3);
    this.life = new Float32Array(count);
    this.up = [0, 0, 1];
    this.next = 0;
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(count * 3).fill(FAR), 3);
    this.geo.setAttribute('position', this.attr);
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: PALETTE.dust, size: 1.4, transparent: true, opacity: 0.75, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.userData.noNormalPass = true;
    scene.add(this.points);
  }

  update(dt, sr, { active, groundPoint, up, intensity }) {
    if (active && dt > 0) {
      this.up = up;
      const { east, north } = tangentBasis(up);
      const n = Math.ceil(intensity * 8);
      for (let k = 0; k < n; k++) {
        const i = this.next;
        this.next = (this.next + 1) % this.count;
        const a = Math.random() * Math.PI * 2, speed = 8 + Math.random() * 10, rise = 1 + Math.random() * 3;
        for (let c = 0; c < 3; c++) {
          this.pos[i * 3 + c] = groundPoint[c] + up[c] * 0.3;
          this.vel[i * 3 + c] = (east[c] * Math.cos(a) + north[c] * Math.sin(a)) * speed + up[c] * rise;
        }
        this.life[i] = 1.2 + Math.random() * 0.6;
      }
    }
    const arr = this.attr.array, cam = sr.camWorld;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        for (let c = 0; c < 3; c++) {
          this.vel[i * 3 + c] -= this.up[c] * G * dt;
          this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt;
          arr[i * 3 + c] = this.pos[i * 3 + c] - cam[c];
        }
      } else {
        arr[i * 3] = FAR; arr[i * 3 + 1] = FAR; arr[i * 3 + 2] = FAR;
      }
    }
    this.attr.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}
