export const STORAGE_KEY = 'munlendr.v1';
export const HISTORY_LIMIT = 10;

export function defaultData() {
  return {
    version: 1,
    unlocked: [1],
    best: {},
    history: [],
    settings: { controlFrame: 'camera', invertDrag: false, hudScale: 1 },
  };
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValid(d) {
  return !!d && typeof d === 'object' && d.version === 1 && Array.isArray(d.unlocked)
    && !!d.best && typeof d.best === 'object' && Array.isArray(d.history);
}

export function createStorage(backend = safeLocalStorage()) {
  return {
    load() {
      try {
        const raw = backend?.getItem(STORAGE_KEY);
        if (!raw) return defaultData();
        const d = JSON.parse(raw);
        if (!isValid(d)) return defaultData();
        const def = defaultData();
        return { ...def, ...d, settings: { ...def.settings, ...(d.settings ?? {}) } };
      } catch {
        return defaultData();
      }
    },
    save(data) {
      try {
        if (!backend) return false;
        backend.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
  };
}

const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
const bestMedal = (a, b) => [a, b].filter(Boolean).sort((x, y) => MEDAL_RANK[y] - MEDAL_RANK[x])[0] ?? null;

export function recordAttempt(data, attempt, unlockIds = []) {
  const next = structuredClone(data);
  next.history = [attempt, ...next.history].slice(0, HISTORY_LIMIT);
  next.unlocked = [...new Set([...next.unlocked, ...unlockIds])].sort((a, b) => a - b);
  if (attempt.outcome === 'landed') {
    const key = String(attempt.mission);
    next.best[key] ??= { easy: null, hard: null };
    const prev = next.best[key][attempt.difficulty];
    const medal = bestMedal(prev?.medal, attempt.medal);
    next.best[key][attempt.difficulty] = !prev || attempt.score > prev.score
      ? { score: attempt.score, grade: attempt.grade, fuel: attempt.fuel, distance: attempt.distance, time: attempt.time, date: attempt.date, medal }
      : { ...prev, medal };
  }
  return next;
}

export function isNewBest(data, attempt) {
  if (attempt.outcome !== 'landed') return false;
  const prev = data.best?.[String(attempt.mission)]?.[attempt.difficulty];
  return !prev || attempt.score > prev.score;
}
