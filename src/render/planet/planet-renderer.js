import * as THREE from 'three';
import { selectNodes } from './quadtree.js';
import { nodeKey, nodeCenterDir, parent } from './cubesphere.js';
import { buildIndices } from './chunk-builder.js';
import { getGradientMap } from '../toon.js';

const MAX_LEVEL = 14;
const CACHE_LIMIT = 1800;

export class PlanetRenderer {
  constructor(scene, { terrain, pads, workerCount }) {
    this.scene = scene;
    this.radius = terrain.radius;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.index = new THREE.BufferAttribute(buildIndices(), 1);
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() });
    this.cache = new Map(); // key -> { node, state: 'pending'|'ready', mesh, center, used }
    this.queue = new Map();
    this.centerHeights = new Map();
    this.inFlight = 0;
    this.frame = 0;
    this.visible = [];
    this.failed = null;
    this.disposed = false;

    const n = workerCount ?? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.maxInFlight = n * 3;
    this.nextWorker = 0;
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./chunk-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onChunk(e.data);
      w.onerror = (e) => {
        this.failed = e.message || 'terrain worker failed to start';
        console.error(this.failed);
      };
      w.postMessage({ type: 'init', seed: terrain.seed, radius: this.radius, pads });
      return w;
    });

    this.isReady = (node) => this.cache.get(nodeKey(node))?.state === 'ready';
    this.request = (node) => {
      const key = nodeKey(node);
      if (!this.cache.has(key)) this.queue.set(key, node);
    };
    this.centerHeight = (node) => {
      const key = nodeKey(node);
      let h = this.centerHeights.get(key);
      if (h === undefined) {
        h = terrain.height(nodeCenterDir(node));
        this.centerHeights.set(key, h);
      }
      return h;
    };
  }

  update(cameraWorld) {
    this.frame++;
    this.queue.clear();
    const { nodes, pending } = selectNodes({
      cameraPos: cameraWorld, radius: this.radius, maxLevel: MAX_LEVEL,
      centerHeight: this.centerHeight, isReady: this.isReady, request: this.request,
    });
    for (const m of this.visible) m.visible = false;
    this.visible = [];
    for (const n of nodes) {
      const e = this.cache.get(nodeKey(n));
      e.mesh.visible = true;
      e.mesh.position.set(e.center[0] - cameraWorld[0], e.center[1] - cameraWorld[1], e.center[2] - cameraWorld[2]);
      this.visible.push(e.mesh);
      for (let p = n; p; p = parent(p)) {
        const a = this.cache.get(nodeKey(p));
        if (a) a.used = this.frame;
      }
    }
    this.pump(cameraWorld);
    this.evict();
    return { pending, visible: nodes.length, cached: this.cache.size };
  }

  pump(cameraWorld) {
    if (this.inFlight >= this.maxInFlight || this.queue.size === 0) return;
    const R = this.radius;
    const dist2 = (node) => {
      const d = nodeCenterDir(node);
      return (d[0] * R - cameraWorld[0]) ** 2 + (d[1] * R - cameraWorld[1]) ** 2 + (d[2] * R - cameraWorld[2]) ** 2;
    };
    const list = [...this.queue].map(([key, node]) => ({ key, node, d: dist2(node) })).sort((a, b) => a.d - b.d);
    for (const { key, node } of list) {
      if (this.inFlight >= this.maxInFlight) break;
      this.cache.set(key, { node, state: 'pending', used: this.frame });
      this.workers[this.nextWorker].postMessage({ type: 'build', key, node });
      this.nextWorker = (this.nextWorker + 1) % this.workers.length;
      this.inFlight++;
    }
  }

  onChunk(data) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const entry = this.cache.get(data.key);
    if (!entry || this.disposed) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(this.index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), data.boundingRadius);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.visible = false;
    this.group.add(mesh);
    Object.assign(entry, { state: 'ready', mesh, center: data.center });
  }

  evict() {
    if (this.cache.size <= CACHE_LIMIT) return;
    const old = [...this.cache].filter(([, e]) => e.state === 'ready' && e.used < this.frame).sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of old) {
      if (this.cache.size <= CACHE_LIMIT * 0.9) break;
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      this.cache.delete(key);
    }
  }

  dispose() {
    this.disposed = true;
    this.workers.forEach((w) => w.terminate());
    for (const e of this.cache.values()) if (e.mesh) e.mesh.geometry.dispose();
    this.cache.clear();
    this.scene.remove(this.group);
    this.material.dispose();
  }
}
