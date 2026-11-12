/*
 * Herzblatt-Gruppenwahl – zufällige Figur als SVG
 * aussehen = { f: Farbe, k: Körper, a: Augen, m: Mund, h: Kopf, b: Brille, x: Extra } (siehe daten.js)
 * Die Figur steht mit den Füßen auf der Unterkante (viewBox -5 -10 110 138).
 */
import { FARBEN, ANTWORT } from "./daten.js";

const DUNKEL = "#1d1d22";
const OBEN = [32, 36, 30]; // Oberkante je Körperform

function dunkler(hex, anteil = 0.28) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v) => Math.round(v * (1 - anteil)).toString(16).padStart(2, "0");
  return "#" + k((n >> 16) & 255) + k((n >> 8) & 255) + k(n & 255);
}

function koerper(k, c) {
  if (k === 1) return `<rect x="20" y="36" width="60" height="72" rx="15" fill="${c}"/>`;
  if (k === 2) return `<path d="M50 30 C67 30 71 45 71 57 C84 69 84 107 64 109 L36 109 C16 107 16 69 29 57 C29 45 33 30 50 30 Z" fill="${c}"/>`;
  return `<rect x="22" y="32" width="56" height="78" rx="28" fill="${c}"/>`;
}

function augen(a, y, c) {
  const glanz = (x) => `<circle cx="${x + 1.6}" cy="${y - 1.6}" r="1.4" fill="#fff"/>`;
  if (a === 1) return [39, 61].map((x) => `<circle cx="${x}" cy="${y}" r="8.5" fill="#fff"/><circle cx="${x + (x < 50 ? 2 : -2)}" cy="${y + 1}" r="4.4" fill="${DUNKEL}"/>${glanz(x + (x < 50 ? 2 : -2))}`).join("");
  if (a === 2) return [39, 61].map((x) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="6" fill="#fff"/><circle cx="${x}" cy="${y + 2}" r="3.6" fill="${DUNKEL}"/><path d="M${x - 8} ${y + 0.5} Q${x} ${y - 9} ${x + 8} ${y + 0.5} Z" fill="${dunkler(c, 0.12)}"/><path d="M${x - 8} ${y + 0.5} L${x + 8} ${y + 0.5}" stroke="${DUNKEL}" stroke-width="2" stroke-linecap="round"/>`).join("");
  if (a === 3) return `<circle cx="39" cy="${y}" r="4.6" fill="${DUNKEL}"/>${glanz(39)}<path d="M55 ${y + 1} Q61 ${y - 6} 67 ${y + 1}" stroke="${DUNKEL}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  if (a === 4) return [39, 61].map((x) => `<path d="M${x} ${y - 7} L${x + 2.2} ${y - 2.2} L${x + 7} ${y} L${x + 2.2} ${y + 2.2} L${x} ${y + 7} L${x - 2.2} ${y + 2.2} L${x - 7} ${y} L${x - 2.2} ${y - 2.2} Z" fill="${DUNKEL}"/>`).join("");
  return [39, 61].map((x) => `<circle cx="${x}" cy="${y}" r="4.6" fill="${DUNKEL}"/>${glanz(x)}`).join("");
}

function brille(b, y) {
  if (b === 1) return `<rect x="28" y="${y - 6.5}" width="19" height="13" rx="5" fill="${DUNKEL}"/><rect x="53" y="${y - 6.5}" width="19" height="13" rx="5" fill="${DUNKEL}"/><path d="M47 ${y - 2} L53 ${y - 2}" stroke="${DUNKEL}" stroke-width="3"/><path d="M31 ${y - 3} L36 ${y - 3}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
  if (b === 2) return `<circle cx="39" cy="${y}" r="9.5" fill="#fff" fill-opacity=".18" stroke="${DUNKEL}" stroke-width="3"/><circle cx="61" cy="${y}" r="9.5" fill="#fff" fill-opacity=".18" stroke="${DUNKEL}" stroke-width="3"/><path d="M48.5 ${y - 1} Q50 ${y - 3} 51.5 ${y - 1}" stroke="${DUNKEL}" stroke-width="3" fill="none"/>`;
  if (b === 3) return `<circle cx="61" cy="${y}" r="9.5" fill="#fff" fill-opacity=".2" stroke="#c9a227" stroke-width="2.6"/><path d="M70 ${y + 3} Q76 ${y + 18} 72 ${y + 30}" stroke="#c9a227" stroke-width="1.6" fill="none"/>`;
  return "";
}

function mund(m, y) {
  if (m === 1) return `<path d="M38 ${y - 3} Q50 ${y + 14} 62 ${y - 3} Z" fill="${DUNKEL}"/><path d="M41 ${y - 1.5} L59 ${y - 1.5}" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`;
  if (m === 2) return `<ellipse cx="50" cy="${y + 2}" rx="4.2" ry="5.6" fill="${DUNKEL}"/>`;
  if (m === 3) return `<path d="M41 ${y + 2} Q51 ${y + 5} 59 ${y - 3}" stroke="${DUNKEL}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  if (m === 4) return `<path d="M51 ${y + 3} q0 9 5 9 q5 0 5 -9 z" fill="#ff7a9c"/><path d="M40 ${y - 2} Q50 ${y + 8} 60 ${y - 2}" stroke="${DUNKEL}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  return `<path d="M41 ${y - 2} Q50 ${y + 8} 59 ${y - 2}" stroke="${DUNKEL}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
}

function extra(x, yA, yM, oben) {
  if (x === 1) return `<path d="M50 ${yM - 6} C44 ${yM - 11} 36 ${yM - 9} 34 ${yM - 3} C38 ${yM - 6} 43 ${yM - 4} 50 ${yM - 3} C57 ${yM - 4} 62 ${yM - 6} 66 ${yM - 3} C64 ${yM - 9} 56 ${yM - 11} 50 ${yM - 6} Z" fill="${DUNKEL}"/>`;
  if (x === 2) { const y = oben + 56; return `<path d="M50 ${y} L37 ${y - 7} L37 ${y + 7} Z M50 ${y} L63 ${y - 7} L63 ${y + 7} Z" fill="${DUNKEL}"/><circle cx="50" cy="${y}" r="3.4" fill="${DUNKEL}"/>`; }
  if (x === 3) return `<circle cx="31" cy="${yA + 11}" r="5" fill="#ff7a9c" opacity=".55"/><circle cx="69" cy="${yA + 11}" r="5" fill="#ff7a9c" opacity=".55"/>`;
  if (x === 4) return [[31, 9], [35, 12], [29, 13], [69, 9], [65, 12], [71, 13]].map(([px, dy]) => `<circle cx="${px}" cy="${yA + dy}" r="1.3" fill="${DUNKEL}" opacity=".45"/>`).join("");
  return "";
}

function kopf(h, y) {
  switch (h) {
    case 1: return `<rect x="34" y="${y - 32}" width="32" height="30" rx="2" fill="${DUNKEL}"/><rect x="34" y="${y - 12}" width="32" height="6" fill="#e5412d"/><rect x="24" y="${y - 5}" width="52" height="7" rx="3.5" fill="${DUNKEL}"/>`;
    case 2: return `<path d="M27 ${y + 5} Q27 ${y - 22} 50 ${y - 22} Q73 ${y - 22} 73 ${y + 5} Z" fill="#2c6fd6"/><path d="M60 ${y + 3} Q86 ${y - 1} 90 ${y + 7} Q74 ${y + 9} 60 ${y + 7} Z" fill="#1f56ad"/><circle cx="50" cy="${y - 22}" r="3" fill="#1f56ad"/>`;
    case 3: return `<path d="M32 ${y + 2} L30 ${y - 22} L40 ${y - 12} L50 ${y - 28} L60 ${y - 12} L70 ${y - 22} L68 ${y + 2} Z" fill="#f2c94c" stroke="#c9a227" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="${y - 6}" r="3.2" fill="#e5412d"/><circle cx="39" cy="${y - 5}" r="2.4" fill="#2c6fd6"/><circle cx="61" cy="${y - 5}" r="2.4" fill="#3fbf7f"/>`;
    case 4: return `<path d="M35 ${y + 4} L50 ${y - 34} L65 ${y + 4} Z" fill="#7a5cff"/><path d="M40 ${y - 8} L46 ${y - 23} M47 ${y + 2} L55 ${y - 17} M55 ${y + 3} L60 ${y - 6}" stroke="#f2c94c" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="${y - 35}" r="5" fill="#f2c94c"/>`;
    case 5: return `<path d="M25 ${y + 8} Q25 ${y - 24} 50 ${y - 24} Q75 ${y - 24} 75 ${y + 8} Z" fill="#e5412d"/><rect x="23" y="${y - 1}" width="54" height="10" rx="5" fill="#b8311f"/><circle cx="50" cy="${y - 27}" r="7.5" fill="#fff"/>`;
    case 6: return `<circle cx="38" cy="${y - 17}" r="10" fill="#fff"/><circle cx="62" cy="${y - 17}" r="10" fill="#fff"/><circle cx="50" cy="${y - 24}" r="12" fill="#fff"/><rect x="31" y="${y - 16}" width="38" height="18" rx="3" fill="#fff"/><path d="M33 ${y - 3} L67 ${y - 3}" stroke="#d3dde4" stroke-width="2"/>`;
    case 7: return `<path d="M30 ${y + 5} Q30 ${y - 18} 50 ${y - 18} Q70 ${y - 18} 70 ${y + 5} Z" fill="#3fbf7f"/><path d="M30 ${y + 5} Q30 ${y - 18} 50 ${y - 18} L50 ${y + 5} Z" fill="#f2c94c"/><path d="M50 ${y - 18} L50 ${y - 26}" stroke="${DUNKEL}" stroke-width="2.5"/><g class="propeller" style="transform-origin:50px ${y - 27}px"><path d="M50 ${y - 27} Q38 ${y - 33} 32 ${y - 27} Q38 ${y - 22} 50 ${y - 27} Q62 ${y - 32} 68 ${y - 27} Q62 ${y - 22} 50 ${y - 27} Z" fill="#e5412d"/></g><circle cx="50" cy="${y - 27}" r="2.4" fill="${DUNKEL}"/>`;
    case 8: return `<path d="M36 ${y + 3} L32 ${y - 12} L42 ${y - 3} L44 ${y - 18} L50 ${y - 4} L57 ${y - 19} L58 ${y - 3} L68 ${y - 12} L64 ${y + 3} Z" fill="${DUNKEL}"/>`;
    default: return "";
  }
}

/* opts: getraenk (Antwort-ID), denkt (Gedankenblase), klasse */
export function figurSvg(o, opts = {}) {
  const c = FARBEN[o?.f] ?? FARBEN[0];
  const d = dunkler(c);
  const k = o?.k ?? 0, oben = OBEN[k] ?? 32;
  const yA = oben + 22, yM = oben + 41;
  const g = opts.getraenk ? ANTWORT.getraenk[opts.getraenk] : null;
  return `<svg class="figur${opts.klasse ? " " + opts.klasse : ""}" viewBox="-5 -10 110 138" aria-hidden="true">
  <g class="glied b1"><path d="M40 104 L38 123" stroke="${d}" stroke-width="8" stroke-linecap="round"/></g>
  <g class="glied b2"><path d="M60 104 L62 123" stroke="${d}" stroke-width="8" stroke-linecap="round"/></g>
  <g class="glied a1"><path d="M25 74 L11 92" stroke="${d}" stroke-width="7" stroke-linecap="round"/></g>
  <g class="glied a2"><path d="M75 74 L89 92" stroke="${d}" stroke-width="7" stroke-linecap="round"/>${g ? `<text x="92" y="101" font-size="19" text-anchor="middle">${g.e}</text>` : ""}</g>
  ${koerper(k, c)}
  <ellipse cx="50" cy="${oben + 60}" rx="15" ry="11" fill="#fff" opacity=".2"/>
  ${augen(o?.a ?? 0, yA, c)}${brille(o?.b ?? 0, yA)}${mund(o?.m ?? 0, yM)}${extra(o?.x ?? 0, yA, yM, oben)}${kopf(o?.h ?? 0, oben)}
  ${opts.denkt ? `<g class="denkt"><circle cx="82" cy="${oben - 4}" r="2.6" fill="#fff" stroke="#9fb4c4" stroke-width="1.5"/><ellipse cx="92" cy="${oben - 18}" rx="13" ry="10" fill="#fff" stroke="#9fb4c4" stroke-width="1.5"/><text x="92" y="${oben - 13.5}" font-size="13" text-anchor="middle">✏️</text></g>` : ""}
</svg>`;
}

export const farbeVon = (o) => FARBEN[o?.f] ?? FARBEN[0];
