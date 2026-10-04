import * as THREE from 'three';
import { length, normalize } from '../math/vec3.js';

const G = 1.62;

function makeFlash() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.4, 'rgba(255,170,80,0.8)');
  g.addColorStop(1, 'rgba(255,120,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  s.userData.noNormalPass = true;
  return s;
}

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pieces = [];
    this.up = [0, 0, 1];
    this.flash = makeFlash();
    this.flash.visible = false;
    this.flashT = 0;
    this.flashWorld = [0, 0, 0];
    this.group.add(this.flash);
  }

  explode(model, sr, { origin, velocity, up }) {
    model.root.updateMatrixWorld(true);
    model.plume.visible = false;
    model.puffs.forEach((p) => { p.visible = false; });
    const cam = sr.camWorld;
    for (const part of [...model.parts]) {
      const wp = part.getWorldPosition(new THREE.Vector3());
      const wq = part.getWorldQuaternion(new THREE.Quaternion());
      this.group.add(part);
      part.position.copy(wp);
      part.quaternion.copy(wq);
      const world = [wp.x + cam[0], wp.y + cam[1], wp.z + cam[2]];
      const out = normalize([world[0] - origin[0] + Math.random() - 0.5, world[1] - origin[1] + Math.random() - 0.5, world[2] - origin[2] + Math.random() - 0.5]);
      const speed = 4 + Math.random() * 10, rise = 3 + Math.random() * 6;
      const vel = [0, 1, 2].map((c) => velocity[c] * 0.3 + out[c] * speed + up[c] * rise);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.pieces.push({ mesh: part, world, vel, spin, rate: (1 + Math.random() * 2) * Math.PI });
    }
    this.up = up;
    this.flashWorld = origin.slice();
    this.flashT = 0;
    this.flash.visible = true;
  }

  update(dt, sr, body) {
    for (const p of this.pieces) {
      for (let c = 0; c < 3; c++) {
        p.vel[c] -= this.up[c] * G * dt;
        p.world[c] += p.vel[c] * dt;
      }
      const r = length(p.world);
      const dir = [p.world[0] / r, p.world[1] / r, p.world[2] / r];
      const ground = body.surfaceRadius(dir) + 0.3;
      if (r < ground) {
        p.world = [dir[0] * ground, dir[1] * ground, dir[2] * ground];
        const vn = p.vel[0] * dir[0] + p.vel[1] * dir[1] + p.vel[2] * dir[2];
        for (let c = 0; c < 3; c++) p.vel[c] = (p.vel[c] - dir[c] * vn * 1.4) * 0.6;
        p.rate *= 0.7;
      }
      sr.toRender(p.world, p.mesh.position);
      p.mesh.rotateOnAxis(p.spin, p.rate * dt);
    }
    if (this.flash.visible) {
      this.flashT += dt;
      const s = 4 + this.flashT * 60;
      this.flash.scale.set(s, s, s);
      this.flash.material.opacity = Math.max(0, 1 - this.flashT / 0.7);
      sr.toRender(this.flashWorld, this.flash.position);
      if (this.flashT > 0.7) this.flash.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
