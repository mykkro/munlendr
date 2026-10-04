import { CONFIG } from '../config.js';
import { createTerrain } from '../sim/terrain.js';
import { createBody } from '../sim/body.js';
import { latLonToDir, tangentBasis, offsetDirection, surfaceOffset } from '../sim/frame.js';
import { createRocketState } from '../sim/rocket.js';
import { fromBasis } from '../math/quat.js';
import { add, scale, normalize, DEG } from '../math/vec3.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'First Touchdown',
    tagline: 'Learn the lander and set it down anywhere flat.',
    seed: 1969,
    site: { lat: 8, lon: 23 },
    sun: { elevation: 22, azimuth: 115 },
    start: { agl: 1500, east: -1200, north: 0, vEast: 30, vNorth: 0, vUp: -20 },
    fuel: 500,
    rcs: 60,
    sasOn: true,
    targetPad: { radius: 60 },
    goal: { type: 'any' },
    unlockedBy: null,
  },
  {
    id: 2,
    name: 'Pinpoint',
    tagline: 'Kill your drift and land on the marked pad.',
    seed: 4242,
    site: { lat: -12, lon: 41 },
    sun: { elevation: 18, azimuth: 250 },
    start: { agl: 3000, east: -2000, north: 0, vEast: 60, vNorth: 0, vUp: 0 },
    fuel: 700,
    rcs: 60,
    sasOn: false,
    targetPad: { radius: 70 },
    goal: { type: 'pinpoint', medals: { gold: 5, silver: 20, bronze: 50 } },
    unlockedBy: 1,
  },
];

export const getMission = (id) => MISSIONS.find((m) => m.id === id) ?? null;

export function buildWorld(mission, cfg = CONFIG) {
  const radius = cfg.moon.radius;
  const siteDir = latLonToDir(mission.site.lat, mission.site.lon);
  const pads = [{ dir: siteDir, radius: mission.targetPad.radius }];
  const terrain = createTerrain({ seed: mission.seed, radius, pads });
  const body = createBody({ radius, gm: cfg.moon.gm, terrain });
  const { east, north } = tangentBasis(siteDir);
  const el = mission.sun.elevation * DEG, az = mission.sun.azimuth * DEG;
  const horizontal = add(scale(east, Math.sin(az)), scale(north, Math.cos(az)));
  const sunDir = normalize(add(scale(siteDir, Math.sin(el)), scale(horizontal, Math.cos(el))));
  const padHints = mission.goal.type === 'any'
    ? terrain.padsNear(siteDir, 4000).map((p) => ({ point: scale(p.dir, radius + p.height), up: p.dir, radius: p.radius }))
    : [];
  return { body, terrain, siteDir, sitePoint: body.surfacePoint(siteDir), pads, padHints, sunDir };
}

export function makeStartState(mission, world) {
  const { start } = mission;
  const { body, siteDir } = world;
  const dir = offsetDirection(siteDir, start.east, start.north, body.radius);
  const { east, north } = tangentBasis(dir);
  const position = scale(dir, body.surfaceRadius(dir) + start.agl);
  const velocity = add(add(scale(east, start.vEast), scale(north, start.vNorth)), scale(dir, start.vUp));
  return createRocketState({ position, velocity, orientation: fromBasis(east, north, dir), fuel: mission.fuel, rcs: mission.rcs });
}

export const landingDistance = (world, r) => surfaceOffset(world.siteDir, normalize(r), world.body.radius).distance;

export function medalFor(mission, distance) {
  if (mission.goal.type !== 'pinpoint') return null;
  const { gold, silver, bronze } = mission.goal.medals;
  if (distance <= gold) return 'gold';
  if (distance <= silver) return 'silver';
  if (distance <= bronze) return 'bronze';
  return null;
}

export const GRADE_POINTS = { perfect: 1000, safe: 600 };

export function computeScore({ mission, outcome, grade, fuel, distance, time, difficulty }) {
  if (outcome !== 'landed') return { total: 0, parts: { grade: 0, fuel: 0, distance: 0, time: 0 }, multiplier: 1 };
  const parts = {
    grade: GRADE_POINTS[grade] ?? 0,
    fuel: Math.round(fuel),
    distance: mission.goal.type === 'pinpoint' ? Math.max(0, Math.round(500 - 10 * distance)) : 0,
    time: Math.max(0, Math.round(300 - time)),
  };
  const multiplier = difficulty === 'hard' ? 1.5 : 1;
  return { total: Math.round((parts.grade + parts.fuel + parts.distance + parts.time) * multiplier), parts, multiplier };
}

export const unlocksAfter = (missionId, outcome) =>
  outcome === 'landed' ? MISSIONS.filter((m) => m.unlockedBy === missionId).map((m) => m.id) : [];

export const isUnlocked = (mission, unlocked) => mission.unlockedBy === null || unlocked.includes(mission.id);
