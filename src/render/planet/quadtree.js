import { length, scale, sub, angleBetween } from '../../math/vec3.js';
import { roots, children, nodeCenterDir, nodeEdgeLength } from './cubesphere.js';

export function selectNodes({ cameraPos, radius, maxLevel, splitFactor = 1.5, maxTerrain = 2500, centerHeight = () => 0, isReady, request }) {
  const nodes = [];
  let pending = 0;
  const camDist = length(cameraPos);
  const camDir = scale(cameraPos, 1 / camDist);
  const h = Math.max(1, camDist - radius);
  const horizon = Math.acos(radius / (radius + h)) + Math.acos(radius / (radius + maxTerrain));

  const culled = (n) => angleBetween(camDir, nodeCenterDir(n)) > horizon + ((Math.PI / 4) * 1.5) / 2 ** n.level;
  const wantsSplit = (n) => {
    if (n.level >= maxLevel) return false;
    const center = scale(nodeCenterDir(n), radius + centerHeight(n));
    return length(sub(cameraPos, center)) < splitFactor * nodeEdgeLength(n, radius);
  };

  const visit = (n) => {
    if (culled(n)) return;
    if (wantsSplit(n)) {
      const kids = children(n).filter((k) => !culled(k));
      let allReady = true;
      for (const k of kids) {
        if (!isReady(k)) { request(k); allReady = false; pending++; }
      }
      if (allReady) { kids.forEach(visit); return; }
    }
    if (isReady(n)) nodes.push(n);
    else { request(n); pending++; }
  };

  roots().forEach(visit);
  return { nodes, pending };
}
