import * as THREE from 'three';
import { PALETTE } from './toon.js';

const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

const flatMaterial = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });

function groundRing(inner, outer, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), flatMaterial(color, opacity));
  m.userData.noNormalPass = true;
  return m;
}

function orient(mesh, up, axis = Z) {
  mesh.quaternion.setFromUnitVectors(axis, tmp.set(up[0], up[1], up[2]));
}

const lift = (p, up, h) => [p[0] + up[0] * h, p[1] + up[1] * h, p[2] + up[2] * h];

export class Markers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.groundDot = groundRing(1.2, 1.9, PALETTE.hint, 0.9);
    this.dropGeo = new THREE.BufferGeometry();
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.drop = new THREE.Line(this.dropGeo, new THREE.LineDashedMaterial({ color: PALETTE.hint, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.8 }));
    this.drop.userData.noNormalPass = true;
    this.drop.frustumCulled = false;
    this.impact = groundRing(3, 4.2, PALETTE.impact, 0.85);
    this.impact.visible = false;
    this.group.add(this.groundDot, this.drop, this.impact);
  }

  place(mesh, world, up, height = 0.3) {
    this.items.push({ mesh, world: lift(world, up, height) });
    this.group.add(mesh);
  }

  setTarget(point, up, radius) {
    const ring = groundRing(radius - 3, radius, PALETTE.target, 0.9);
    orient(ring, up);
    this.place(ring, point, up);
    const core = groundRing(0, 2.5, PALETTE.target, 0.9);
    orient(core, up);
    this.place(core, point, up);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 400, 8, 1, true), flatMaterial(PALETTE.target, 0.35));
    beacon.userData.noNormalPass = true;
    orient(beacon, up, Y);
    this.place(beacon, point, up, 200);
  }

  setPadHints(hints) {
    for (const h of hints) {
      const ring = groundRing(h.radius - 2, h.radius, PALETTE.hint, 0.45);
      orient(ring, h.up);
      this.place(ring, h.point, h.up);
    }
  }

  update(sr, { rocketPos, groundPoint, up, impact }) {
    for (const it of this.items) sr.toRender(it.world, it.mesh.position);
    sr.toRender(lift(groundPoint, up, 0.2), this.groundDot.position);
    orient(this.groundDot, up);
    const a = sr.toRender(rocketPos), b = this.groundDot.position;
    this.dropGeo.attributes.position.array.set([a.x, a.y, a.z, b.x, b.y, b.z]);
    this.dropGeo.attributes.position.needsUpdate = true;
    this.drop.computeLineDistances();
    this.impact.visible = !!impact;
    if (impact) {
      sr.toRender(lift(impact.point, impact.up, 0.3), this.impact.position);
      orient(this.impact, impact.up);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
