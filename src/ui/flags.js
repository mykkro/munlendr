// Small inline SVG flags (Windows does not render flag emoji).
let uid = 0;

function unionJack() {
  const id = `uj${++uid}`;
  return `<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="${id}s"><path d="M0,0v30h60V0z"/></clipPath>
    <clipPath id="${id}t"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath>
    <g clip-path="url(#${id}s)"><path d="M0,0v30h60V0z" fill="#012169"/>
    <path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>
    <path d="M0,0L60,30M60,0L0,30" clip-path="url(#${id}t)" stroke="#C8102E" stroke-width="4"/>
    <path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/>
    <path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`;
}

const czech = () => `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#d7141a"/>
  <rect width="30" height="10" fill="#fff"/><path d="M0,0L15,10L0,20z" fill="#11457e"/></svg>`;

export const FLAGS = { en: unionJack, cs: czech };
