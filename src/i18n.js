import { en } from './i18n/en.js';
import { cs } from './i18n/cs.js';

export const LANGS = {
  en: { name: 'English', dict: en },
  cs: { name: 'Čeština', dict: cs },
};

let current = 'en';
const listeners = new Set();

export const getLanguage = () => current;

export function setLanguage(lang) {
  current = LANGS[lang] ? lang : 'en';
  if (globalThis.document) document.documentElement.lang = current;
  listeners.forEach((fn) => fn(current));
  return current;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Values are strings with {placeholders} or functions of the vars (used for plurals).
export function t(key, vars = {}) {
  const v = LANGS[current].dict[key] ?? en[key];
  if (v === undefined) return key;
  if (typeof v === 'function') return v(vars);
  return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function detectLanguage(languages) {
  for (const l of languages ?? []) {
    const code = String(l).toLowerCase().slice(0, 2);
    if (LANGS[code]) return code;
  }
  return 'en';
}
