import { createTerrain } from '../../sim/terrain.js';
import { buildChunk } from './chunk-builder.js';

let terrain = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    terrain = createTerrain({ seed: m.seed, radius: m.radius, pads: m.pads });
    return;
  }
  if (m.type === 'build') {
    const c = buildChunk(m.node, terrain, terrain.radius);
    self.postMessage(
      { key: m.key, center: c.center, positions: c.positions, normals: c.normals, colors: c.colors, boundingRadius: c.boundingRadius },
      [c.positions.buffer, c.normals.buffer, c.colors.buffer],
    );
  }
};
