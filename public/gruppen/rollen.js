/*
 * Herzblatt – Rollen-Tische
 * Mit Rollen tragen die Tische keine Nummern, sondern Rollen (zum Beispiel „SPD“ oder „Leon“). Wer an einem Tisch
 * steht, sieht auf dem Handy die Rollenkarte: wer das ist, was er will und ob er dafür oder dagegen ist. In der
 * 3D-Welt steht an jedem Tisch eine Infotafel mit Bild. Die Tische füllen sich dann gleichmäßig (siehe
 * obergrenzen in daten.js), damit keine Rolle leer bleibt.
 *
 * Die Reihenfolge zählt: Stellt die Lehrkraft weniger Tische ein, fallen die letzten Rollen weg.
 * Bilder sind eigene Zeichnungen: keine Logos, keine Fotos echter Personen.
 */

import { TISCHFARBEN } from "./daten.js";

export const ROLLENSETS = {
  sprit: {
    titel: "Spritpreisdeckel",
    frage: "Soll Deutschland einen Spritpreisdeckel einführen?",
    rollen: [
      {
        id: "leon", name: "Leon", bild: "auto", farbe: "#d99a00", seite: "offen",
        wer: "19, Azubi zum Kfz-Mechatroniker, pendelt jeden Tag 35 km (erfundene Person)",
        ziel: "Vorher wissen, was Tanken kostet. Und an der Tankstelle soll es immer Sprit geben.",
      },
      {
        id: "spd", name: "SPD", bild: "pult", farbe: "#e5412d", seite: "dafür",
        wer: "Partei in der Bundesregierung",
        ziel: "Pendler entlasten. Die Ölkonzerne sollen an hohen Preisen nicht zu viel verdienen.",
      },
      {
        id: "cdu", name: "CDU", bild: "pult", farbe: "#3d4650", seite: "dagegen", position: "dagegen, höchstens im Notfall",
        wer: "Partei, stellt den Bundeskanzler",
        ziel: "Immer genug Benzin und Diesel an den Tankstellen. Der Staat greift nur im Notfall ein.",
      },
      {
        id: "en2x", name: "en2x", bild: "raffinerie", farbe: "#2c6fd6", seite: "dagegen",
        wer: "Verband der Firmen, die in Deutschland Sprit herstellen und verkaufen",
        ziel: "Freie Preise, sichere Lieferungen und Geld für Investitionen.",
      },
      {
        id: "sovd", name: "SoVD", bild: "schirm", farbe: "#138f89", seite: "dafür",
        wer: "Sozialverband, setzt sich für Menschen mit wenig Geld ein",
        ziel: "Menschen mit wenig Geld vor hohen Preisen schützen.",
      },
      {
        id: "petra", name: "Petra", bild: "tankstelle", farbe: "#7a5cff", seite: "dagegen",
        wer: "52, hat eine freie Tankstelle mit vier Angestellten (erfundene Person)",
        ziel: "Den Sprit nie billiger verkaufen müssen, als sie ihn selbst einkauft.",
      },
    ],
  },
};
export const ROLLEN_IDS = Object.keys(ROLLENSETS);

/* Was auf dem Schild „dafür / dagegen“ steht (eine Rolle kann es mit „position“ genauer sagen) */
export const SEITE_TEXT = { "dafür": "dafür", "dagegen": "dagegen", offen: "offen, ihr entscheidet" };
export const SEITE_KURZ = { "dafür": "dafür", "dagegen": "dagegen", offen: "offen" };

/* Rolle eines Tisches (oder null ohne Rollen) */
export function rolleVon(raum, tisch) {
  const set = raum?.rollen ? ROLLENSETS[raum.rollen] : null;
  return set?.rollen[tisch - 1] ?? null;
}
/* „SPD“ oder „1“: Name des Tisches, so wie er nach „Tisch“ steht */
export function tischName(raum, tisch) {
  return rolleVon(raum, tisch)?.name ?? String(tisch);
}
export function tischFarbe(raum, tisch) {
  return rolleVon(raum, tisch)?.farbe ?? TISCHFARBEN[tisch - 1] ?? "#12324a";
}

/* ---------- Bilder: eigene Zeichnungen, 120 × 120 ---------- */
const TINTE = "#12324a";
const GLAS = "#cfe8f7";
const GRAU = "#d3dde4";
const STRASSE = "#8a9aa6";

function hell(hex, anteil) {
  const n = parseInt(hex.slice(1), 16);
  const kanal = (v) => Math.round(v + (255 - v) * anteil).toString(16).padStart(2, "0");
  return "#" + kanal((n >> 16) & 255) + kanal((n >> 8) & 255) + kanal(n & 255);
}

const ZEICHNUNG = {
  /* Kleinwagen auf der Landstraße, daneben ein Schild mit 35 km */
  auto: (f) => `
    <rect x="6" y="88" width="108" height="14" rx="3" fill="${STRASSE}"/>
    <path d="M14 95 H28 M42 95 H56 M70 95 H84 M98 95 H108" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M97 48 V88" stroke="#5c6f7e" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="80" y="26" width="34" height="22" rx="4" fill="#2e7d4f" stroke="${TINTE}" stroke-width="2.4"/>
    <text x="97" y="41.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11.5" fill="#fff">35 km</text>
    <path d="M10 84 V70 Q10 63 17 62 L28 60 L39 47 Q42 44 47 44 H62 Q67 44 70 48 L79 60 Q86 61.5 87 68 V84 Z" fill="${f}" stroke="${TINTE}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M42 49 H53 V60 H32 Z" fill="${GLAS}" stroke="${TINTE}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M57 49 H64 Q66 49 67 51 L73 60 H57 Z" fill="${GLAS}" stroke="${TINTE}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="80" y="66" width="7" height="5" rx="1.5" fill="#ffe08a"/>
    <circle cx="27" cy="84" r="9" fill="${TINTE}"/><circle cx="27" cy="84" r="3.8" fill="${GRAU}"/>
    <circle cx="70" cy="84" r="9" fill="${TINTE}"/><circle cx="70" cy="84" r="3.8" fill="${GRAU}"/>`,

  /* Rednerpult mit Mikrofon und Sprechblase: eine Partei */
  pult: (f, name) => `
    <path d="M73 14 H104 Q109 14 109 19 V33 Q109 38 104 38 H86 L78 45 V38 H73 Q68 38 68 33 V19 Q68 14 73 14 Z" fill="#fff" stroke="${TINTE}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M75 22.5 H101 M75 29.5 H93" stroke="${f}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M60 52 V36 Q60 30 54 28" stroke="${TINTE}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="45" y="19" width="11" height="15" rx="5.5" fill="${TINTE}" transform="rotate(-24 50 26)"/>
    <path d="M33 60 H87 L80 106 H40 Z" fill="${f}" stroke="${TINTE}" stroke-width="3.2" stroke-linejoin="round"/>
    <rect x="27" y="50" width="66" height="11" rx="3" fill="#fff" stroke="${TINTE}" stroke-width="3"/>
    <text x="60" y="90" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" fill="#fff">${name}</text>
    <path d="M30 108 H90" stroke="${TINTE}" stroke-width="3.2" stroke-linecap="round"/>`,

  /* Raffinerie: zwei Kolonnen mit Flamme, ein Tank mit Tropfen */
  raffinerie: (f) => `
    <rect x="6" y="98" width="108" height="6" rx="2" fill="${STRASSE}"/>
    <path d="M31 30 C25 23 30 17 30 9 C38 16 39 24 31 30 Z" fill="#ffc531" stroke="#e8702a" stroke-width="2" stroke-linejoin="round"/>
    <rect x="23" y="32" width="15" height="66" rx="3" fill="${GRAU}" stroke="${TINTE}" stroke-width="3"/>
    <path d="M23 50 H38 M23 66 H38 M23 82 H38" stroke="${TINTE}" stroke-width="2.2"/>
    <rect x="44" y="50" width="12" height="48" rx="3" fill="${GRAU}" stroke="${TINTE}" stroke-width="3"/>
    <path d="M44 66 H56 M44 82 H56" stroke="${TINTE}" stroke-width="2.2"/>
    <path d="M56 90 H62" stroke="${TINTE}" stroke-width="3"/>
    <path d="M62 98 V74 Q62 64 84 64 Q106 64 106 74 V98 Z" fill="${f}" stroke="${TINTE}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M84 70 C79 77 77 81 77 84.5 A7 7 0 0 0 91 84.5 C91 81 89 77 84 70 Z" fill="#fff"/>`,

  /* Schirm schützt zwei Menschen vor dem Regen */
  schirm: (f) => `
    <path d="M22 12 l-3 6 M37 8 l-3 6 M86 8 l-3 6 M101 12 l-3 6" stroke="#5aa8d6" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 22 V17" stroke="${TINTE}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M12 58 Q14 24 60 22 Q106 24 108 58 Q100 51 92 58 Q84 51 76 58 Q68 51 60 58 Q52 51 44 58 Q36 51 28 58 Q20 51 12 58 Z" fill="${f}" stroke="${TINTE}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M60 58 V98 Q60 104 66 104" stroke="${TINTE}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <circle cx="39" cy="73" r="7.5" fill="#fff" stroke="${TINTE}" stroke-width="3"/>
    <path d="M26 108 Q26 86 39 86 Q52 86 52 108 Z" fill="${hell(f, 0.55)}" stroke="${TINTE}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="82" cy="78" r="6.5" fill="#fff" stroke="${TINTE}" stroke-width="3"/>
    <path d="M71 108 Q71 90 82 90 Q93 90 93 108 Z" fill="${hell(f, 0.55)}" stroke="${TINTE}" stroke-width="3" stroke-linejoin="round"/>`,

  /* Kleine freie Tankstelle: Dach, Zapfsäule, Shop */
  tankstelle: (f) => `
    <rect x="6" y="98" width="108" height="6" rx="2" fill="${STRASSE}"/>
    <rect x="8" y="22" width="64" height="13" rx="3" fill="${f}" stroke="${TINTE}" stroke-width="3"/>
    <rect x="15" y="35" width="6" height="63" fill="${GRAU}" stroke="${TINTE}" stroke-width="2.2"/>
    <rect x="59" y="35" width="6" height="63" fill="${GRAU}" stroke="${TINTE}" stroke-width="2.2"/>
    <rect x="28" y="56" width="22" height="42" rx="3" fill="#fff" stroke="${TINTE}" stroke-width="3"/>
    <rect x="32" y="61" width="14" height="10" rx="1.5" fill="${GLAS}" stroke="${TINTE}" stroke-width="1.6"/>
    <path d="M50 66 H53 Q56 66 56 69 V86" stroke="${TINTE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="73" y="50" width="38" height="48" fill="#fff" stroke="${TINTE}" stroke-width="3"/>
    <path d="M70 50 L92 36 L114 50 Z" fill="${hell(f, 0.45)}" stroke="${TINTE}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="78" y="58" width="13" height="13" fill="${GLAS}" stroke="${TINTE}" stroke-width="2"/>
    <rect x="96" y="72" width="10" height="26" fill="${f}" stroke="${TINTE}" stroke-width="2.2"/>`,
};

/** Bild einer Rolle als SVG-Text (runder heller Grund in der Rollenfarbe). */
export function rollenBild(rolle) {
  const f = rolle.farbe;
  const innen = (ZEICHNUNG[rolle.bild] ?? ZEICHNUNG.pult)(f, rolle.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="59" fill="${hell(f, 0.84)}"/>${innen}</svg>`;
}
/** Dasselbe als Adresse für <img> oder zum Malen auf eine Leinwand. */
export function rollenBildUri(rolle) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(rollenBild(rolle));
}
