import * as THREE from 'three';
import { PALETTE } from './toon.js';

const additive = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

export function createMainPlume() {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1, 16, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), additive(PALETTE.plumeOuter, 0.7));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 12, 1, true).translate(0, 0.35, 0).rotateX(-Math.PI / 2), additive(PALETTE.plumeInner, 0.95));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), additive(PALETTE.plumeOuter, 0.5));
  glow.scale.set(1, 1, 0.3);
  group.add(outer, inner, glow);
  group.traverse((o) => { o.userData.noNormalPass = true; });
  group.visible = false;
  return group;
}

export function createPuff() {
  const puff = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8, 1, true).translate(0, -0.45, 0), additive(PALETTE.rcsPuff, 0.8));
  puff.userData.noNormalPass = true;
  puff.visible = false;
  return puff;
}
