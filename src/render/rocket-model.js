import * as THREE from 'three';
import { toonMaterial, addOutline, PALETTE } from './toon.js';
import { createMainPlume, createPuff } from './plumes.js';
import { THRUSTERS } from '../sim/actuators.js';
import { CONFIG } from '../config.js';

const Y = new THREE.Vector3(0, 1, 0);

function strut(a, b, radius, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, A.distanceTo(B), 6), material);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
  return mesh;
}

// Built in the body frame: +Z is the rocket axis, geometric centre at the origin, spans z = -3..3.
export function createRocketModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const foil = toonMaterial(PALETTE.rocketFoil);
  const white = toonMaterial(PALETTE.rocketBody);
  const accent = toonMaterial(PALETTE.rocketAccent);
  const dark = toonMaterial(PALETTE.rocketDark, { side: THREE.DoubleSide });
  const parts = [];
  const part = (mesh, outline = 0.06) => {
    body.add(mesh);
    if (outline) addOutline(mesh, outline);
    parts.push(mesh);
    return mesh;
  };

  part(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 8).rotateX(Math.PI / 2).translate(0, 0, -1.6), foil));
  part(new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, -0.42), accent), 0.03);
  part(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.35, 2.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.9), white));
  part(new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 2.0), white));
  part(new THREE.Mesh(new THREE.CircleGeometry(0.32, 16).rotateY(Math.PI / 2).translate(1.15, 0, 1.15), dark), 0);
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4).rotateX(Math.PI / 2).translate(0.4, 0.3, 3.1), dark), 0.02);
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 0.5, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, -2.95), dark), 0.03);

  for (const f of CONFIG.legs.feet) {
    part(strut([f[0] * 0.62, f[1] * 0.62, -0.9], f, 0.09, foil), 0.03);
    part(strut([f[0] * 0.6, f[1] * 0.6, -2.85], [f[0] * 0.85, f[1] * 0.85, -3.25], 0.06, dark), 0.02);
    part(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.1, 10).rotateX(Math.PI / 2).translate(f[0], f[1], f[2] + 0.05), dark), 0.03);
  }

  const puffs = THRUSTERS.map((t) => {
    const ringZ = t.ring === 'top' ? 2.2 : -2.2;
    const ringR = t.ring === 'top' ? 1.12 : 1.55;
    const d = [0, 0, 0];
    d[t.axis] = t.sign;
    const pos = new THREE.Vector3(-d[0] * ringR, -d[1] * ringR, ringZ); // a thruster pushing +d sits on the -d side
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.36), dark);
    pod.position.copy(pos);
    part(pod, 0.02);
    const puff = createPuff();
    puff.position.copy(pos);
    puff.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...d)); // puff extends along -d (outward)
    body.add(puff);
    return puff;
  });

  const plume = createMainPlume();
  plume.position.set(0, 0, -3.2);
  body.add(plume);

  return { root, body, parts, puffs, plume };
}

export function updateRocketModel(model, { renderPos, q, zcm, engineOn, throttle, thrusters, time }) {
  model.root.position.copy(renderPos);
  model.root.quaternion.set(q[1], q[2], q[3], q[0]);
  model.body.position.set(0, 0, -zcm);
  const on = engineOn && throttle > 0;
  model.plume.visible = on;
  if (on) {
    const w = 0.8 + 0.4 * throttle;
    const flicker = 0.92 + 0.08 * Math.sin(time * 47) + 0.04 * Math.sin(time * 113);
    model.plume.scale.set(w, w, (2 + 9 * throttle) * flicker);
  }
  model.puffs.forEach((p, i) => {
    const o = thrusters[i];
    p.visible = o > 0.05;
    if (p.visible) p.scale.set(o, 0.6 + 1.4 * o, o);
  });
}
