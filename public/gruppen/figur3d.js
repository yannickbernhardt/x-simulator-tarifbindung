/*
 * Herzblatt – die Figur in 3D
 * Die Grundfigur kommt aus dem gemeinsamen Bausatz welt3d (wie in Zinssturm). Hier bekommt sie das
 * Aussehen von Herzblatt: aussehen = { f: Farbe, k: Körper, a: Augen, m: Mund, h: Kopf, b: Brille, x: Extra }
 * (siehe daten.js). Das Getränk aus dem Profil ist ein eigenes kleines Modell (getraenkForm): Der Platz
 * stellt es aufrecht in die Hand oder auf den Tisch.
 * Alles entsteht im Code aus Grundformen. Die Figur schaut nach +z.
 */

import * as THREE from "/welt3d/drei.js";
import { teil, verbinde, toene } from "/welt3d/formen.js";
import { FIGUR, baueFigur, armForm, beinForm, rumpfTeil, stoffFigur } from "/welt3d/figur.js";
import { FARBEN } from "./daten.js";

const DUNKEL = "#1d1d22";
const KOPF_Y = 1.7; // Mitte des Kopfes
const KOPF_R = 0.27; // etwas größer als in Zinssturm, damit das Gesicht zu erkennen ist
const SCHEITEL = KOPF_Y + KOPF_R;
const AUGEN_Y = 0.035; // Höhe der Augen über der Kopfmitte
const STIRN = 0.135; // bis hierhin reichen Mützen herunter (über Augen und Brille)

/** Ort und Drehung für ein flaches Teil auf dem Gesicht: px nach rechts, py nach oben, in Metern. */
function aufGesicht(px, py, vor = 0.006) {
  const r = KOPF_R + vor;
  const b = Math.asin(Math.max(-1, Math.min(1, px / r)));
  const a = -Math.asin(Math.max(-1, Math.min(1, py / (r * Math.cos(b)))));
  return {
    x: Math.sin(b) * r,
    y: KOPF_Y - Math.cos(b) * Math.sin(a) * r,
    z: Math.cos(b) * Math.cos(a) * r,
    rx: a,
    ry: b,
  };
}
const scheibe = (r, farbe, px, py, vor, sx = 1, sy = 1, rz = 0) =>
  teil(new THREE.CircleGeometry(r, 12), farbe, { ...aufGesicht(px, py, vor), sx, sy, rz });
const strich = (b, h, farbe, px, py, vor, rz = 0) =>
  teil(new THREE.PlaneGeometry(b, h), farbe, { ...aufGesicht(px, py, vor), rz });
/** Bogen: oben offen („lächelt“) oder unten offen. */
const bogen = (r, dicke, farbe, px, py, vor, nachUnten = false) =>
  teil(new THREE.TorusGeometry(r, dicke, 4, 9, Math.PI), farbe, { ...aufGesicht(px, py, vor), rz: nachUnten ? 0 : Math.PI });

/* ---------- Körper: Bohne, Kiste, Birne ---------- */
function koerper(k, farbe) {
  const teile = [];
  if (k === 1) teile.push(rumpfTeil(farbe));
  else if (k === 2) teile.push(teil(new THREE.CylinderGeometry(0.2, 0.34, 0.68, 10), farbe, { y: 1.12 }));
  else teile.push(teil(new THREE.CapsuleGeometry(0.27, 0.16, 3, 10), farbe, { y: 1.12 }));
  // runde Schultern, damit die Arme an jeder Körperform ansetzen
  for (const seite of [-1, 1]) {
    teile.push(teil(new THREE.IcosahedronGeometry(0.1, 0), farbe, { x: seite * (FIGUR.schulterBreite - 0.05), y: FIGUR.schulterHoehe - 0.02 }));
  }
  return teile;
}

/* ---------- Augen: Punkte, groß, müde, zwinkert, Sternchen ---------- */
function augen(a) {
  const X = 0.1;
  const Y = AUGEN_Y;
  const glanz = (x) => scheibe(0.011, "#ffffff", x + 0.012, Y + 0.014, 0.014);
  if (a === 1) {
    return [-1, 1].flatMap((s) => [
      scheibe(0.062, "#ffffff", s * X, Y, 0.006),
      scheibe(0.032, DUNKEL, s * (X - 0.014), Y - 0.006, 0.01),
      glanz(s * (X - 0.014)),
    ]);
  }
  if (a === 2) {
    return [-1, 1].flatMap((s) => [
      scheibe(0.052, "#ffffff", s * X, Y, 0.006, 1, 0.82),
      scheibe(0.026, DUNKEL, s * X, Y - 0.014, 0.01),
      // schweres Lid über der oberen Hälfte
      teil(new THREE.CircleGeometry(0.056, 10, 0, Math.PI), toene(FIGUR.haut, -0.14), { ...aufGesicht(s * X, Y + 0.004, 0.012), sy: 0.82 }),
      strich(0.116, 0.014, DUNKEL, s * X, Y + 0.004, 0.014),
    ]);
  }
  if (a === 3) {
    return [
      scheibe(0.034, DUNKEL, -X, Y, 0.008),
      glanz(-X),
      bogen(0.042, 0.011, DUNKEL, X, Y - 0.012, 0.01, true), // zugekniffenes Auge
    ];
  }
  if (a === 4) {
    return [-1, 1].flatMap((s) => [
      scheibe(0.058, DUNKEL, s * X, Y, 0.008, 1, 0.3),
      scheibe(0.058, DUNKEL, s * X, Y, 0.009, 0.3, 1),
      scheibe(0.03, DUNKEL, s * X, Y, 0.01, 1, 1, Math.PI / 4),
    ]);
  }
  return [-1, 1].flatMap((s) => [scheibe(0.034, DUNKEL, s * X, Y, 0.008), glanz(s * X)]);
}

/* ---------- Mund: lächelt, grinst, staunt, schief, Zunge ---------- */
function mund(m) {
  const Y = -0.105;
  if (m === 1) {
    return [
      teil(new THREE.CircleGeometry(0.082, 12, Math.PI, Math.PI), DUNKEL, aufGesicht(0, Y + 0.025, 0.008)),
      strich(0.13, 0.022, "#ffffff", 0, Y + 0.014, 0.011),
    ];
  }
  if (m === 2) return [scheibe(0.036, DUNKEL, 0, Y - 0.008, 0.008, 1, 1.3)];
  if (m === 3) return [strich(0.13, 0.024, DUNKEL, 0.005, Y, 0.008, 0.28)];
  if (m === 4) {
    return [
      bogen(0.068, 0.012, DUNKEL, 0, Y + 0.03, 0.008),
      teil(new THREE.CircleGeometry(0.036, 10, Math.PI, Math.PI), "#ff7a9c", { ...aufGesicht(0.03, Y - 0.03, 0.011), sy: 1.5 }),
    ];
  }
  return [bogen(0.062, 0.012, DUNKEL, 0, Y + 0.03, 0.008)];
}

/* ---------- Brille: keine, Sonnenbrille, Nerdbrille, Monokel ---------- */
function brille(b) {
  const Y = AUGEN_Y;
  if (b === 1) {
    return [
      teil(new THREE.BoxGeometry(0.125, 0.085, 0.02), DUNKEL, aufGesicht(-0.1, Y, 0.022)),
      teil(new THREE.BoxGeometry(0.125, 0.085, 0.02), DUNKEL, aufGesicht(0.1, Y, 0.022)),
      teil(new THREE.BoxGeometry(0.09, 0.02, 0.02), DUNKEL, aufGesicht(0, Y + 0.02, 0.03)),
      strich(0.04, 0.012, "#ffffff", -0.125, Y + 0.02, 0.036),
    ];
  }
  if (b === 2) {
    return [
      teil(new THREE.TorusGeometry(0.062, 0.011, 4, 12), DUNKEL, aufGesicht(-0.1, Y, 0.016)),
      teil(new THREE.TorusGeometry(0.062, 0.011, 4, 12), DUNKEL, aufGesicht(0.1, Y, 0.016)),
      teil(new THREE.BoxGeometry(0.07, 0.016, 0.016), DUNKEL, aufGesicht(0, Y + 0.012, 0.024)),
    ];
  }
  if (b === 3) {
    return [
      teil(new THREE.TorusGeometry(0.064, 0.009, 4, 12), "#c9a227", aufGesicht(0.1, Y, 0.016)),
      teil(new THREE.BoxGeometry(0.008, 0.2, 0.008), "#c9a227", { ...aufGesicht(0.17, Y - 0.14, 0.012), rz: -0.12 }), // Kettchen
    ];
  }
  return [];
}

/* ---------- Extra: nichts, Schnurrbart, Fliege, Bäckchen, Sommersprossen ---------- */
function extra(x) {
  if (x === 1) {
    return [-1, 1].map((s) => scheibe(0.058, DUNKEL, s * 0.045, -0.058, 0.013, 1, 0.42, s * -0.28));
  }
  if (x === 2) {
    // Fliege vorn am Kragen
    return [
      teil(new THREE.ConeGeometry(0.06, 0.1, 4), DUNKEL, { x: -0.06, y: 1.41, z: 0.2, rz: -Math.PI / 2, sz: 0.5 }),
      teil(new THREE.ConeGeometry(0.06, 0.1, 4), DUNKEL, { x: 0.06, y: 1.41, z: 0.2, rz: Math.PI / 2, sz: 0.5 }),
      teil(new THREE.IcosahedronGeometry(0.03, 0), DUNKEL, { y: 1.41, z: 0.21 }),
    ];
  }
  if (x === 3) return [-1, 1].map((s) => scheibe(0.042, "#f7a3b5", s * 0.165, -0.04, 0.007));
  if (x === 4) {
    return [[0.13, -0.02], [0.165, -0.045], [0.185, -0.012]].flatMap(([px, py]) =>
      [-1, 1].map((s) => scheibe(0.009, "#8a6a52", s * px, py, 0.008)));
  }
  return [];
}

/* ---------- Kopf: nichts, Zylinder, Cap, Krone, Partyhut, Bommelmütze, Kochmütze, Propeller, Strubbelhaare ----------
   Liefert die festen Teile; der Propeller dreht sich und kommt als eigenes Netz dazu. */
function kopfbedeckung(h) {
  // Kugelkappe um den Kopf: reicht vom Scheitel bis zur Stirn herunter
  const kappe = (dick, farbe, phiVon = 0, phiLang = 2 * Math.PI) =>
    teil(new THREE.SphereGeometry(KOPF_R + dick, 12, 4, phiVon, phiLang, 0, Math.acos(STIRN / (KOPF_R + dick))), farbe, { y: KOPF_Y });
  switch (h) {
    case 1: return [
      teil(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), DUNKEL, { y: SCHEITEL + 0.1 }),
      teil(new THREE.CylinderGeometry(0.174, 0.174, 0.055, 10), "#e5412d", { y: SCHEITEL + 0.005 }),
      teil(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), DUNKEL, { y: SCHEITEL - 0.045 }),
    ];
    case 2: return [
      kappe(0.02, "#2c6fd6"),
      teil(new THREE.BoxGeometry(0.32, 0.025, 0.22), "#1f56ad", { y: KOPF_Y + STIRN + 0.01, z: KOPF_R + 0.06, rx: 0.14 }),
      teil(new THREE.IcosahedronGeometry(0.03, 0), "#1f56ad", { y: SCHEITEL + 0.03 }),
    ];
    case 3: {
      const teile = [teil(new THREE.CylinderGeometry(0.2, 0.19, 0.1, 10), "#f2c94c", { y: SCHEITEL - 0.02 })];
      for (let i = 0; i < 5; i++) {
        const w = (i / 5) * 2 * Math.PI;
        teile.push(teil(new THREE.ConeGeometry(0.055, 0.14, 4), "#f2c94c", { x: Math.sin(w) * 0.185, y: SCHEITEL + 0.09, z: Math.cos(w) * 0.185 }));
      }
      [["#e5412d", 0], ["#2c6fd6", -0.9], ["#3fbf7f", 0.9]].forEach(([farbe, w]) =>
        teile.push(teil(new THREE.IcosahedronGeometry(0.028, 0), farbe, { x: Math.sin(w) * 0.2, y: SCHEITEL - 0.02, z: Math.cos(w) * 0.2 })));
      return teile;
    }
    case 4: return [
      teil(new THREE.ConeGeometry(0.17, 0.42, 10), "#7a5cff", { y: SCHEITEL + 0.14 }),
      teil(new THREE.CylinderGeometry(0.175, 0.185, 0.045, 10), "#f2c94c", { y: SCHEITEL - 0.045 }),
      teil(new THREE.CylinderGeometry(0.095, 0.105, 0.035, 10), "#f2c94c", { y: SCHEITEL + 0.15 }),
      teil(new THREE.IcosahedronGeometry(0.055, 0), "#f2c94c", { y: SCHEITEL + 0.38 }),
    ];
    case 5: return [
      kappe(0.025, "#e5412d"),
      teil(new THREE.CylinderGeometry(0.262, 0.275, 0.085, 12), "#b8311f", { y: KOPF_Y + STIRN + 0.035 }),
      teil(new THREE.IcosahedronGeometry(0.085, 1), "#ffffff", { y: SCHEITEL + 0.1 }),
    ];
    case 6: return [
      teil(new THREE.CylinderGeometry(0.2, 0.19, 0.2, 10), "#ffffff", { y: SCHEITEL + 0.04 }),
      teil(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 10), "#d3dde4", { y: SCHEITEL - 0.045 }),
      teil(new THREE.IcosahedronGeometry(0.15, 1), "#ffffff", { x: -0.11, y: SCHEITEL + 0.2 }),
      teil(new THREE.IcosahedronGeometry(0.15, 1), "#ffffff", { x: 0.11, y: SCHEITEL + 0.2 }),
      teil(new THREE.IcosahedronGeometry(0.17, 1), "#ffffff", { y: SCHEITEL + 0.26, z: -0.02 }),
    ];
    case 7: return [
      kappe(0.02, "#3fbf7f", 0, Math.PI),
      kappe(0.02, "#f2c94c", Math.PI, Math.PI),
      teil(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5), DUNKEL, { y: SCHEITEL + 0.08 }),
    ];
    case 8: {
      const teile = [];
      [[0, 0, 0.2], [0.13, 0.04, 0.17], [-0.13, 0.04, 0.17], [0.07, -0.11, 0.16], [-0.07, -0.11, 0.16], [0.2, -0.04, 0.13], [-0.2, -0.04, 0.13], [0, 0.14, 0.15]]
        .forEach(([x, z, lang]) => {
          const hoch = Math.sqrt(Math.max(0.01, KOPF_R * KOPF_R - x * x - z * z));
          teile.push(teil(new THREE.ConeGeometry(0.075, lang, 5), DUNKEL, { x, y: KOPF_Y + hoch + lang * 0.3, z, rz: -x * 2.4, rx: z * 2.4 }));
        });
      return teile;
    }
    default: return [];
  }
}

const propellerForm = () => verbinde([
  teil(new THREE.BoxGeometry(0.34, 0.012, 0.07), "#e5412d", {}),
  teil(new THREE.IcosahedronGeometry(0.022, 0), DUNKEL, {}),
]);
let propellerGeo = null;

/* ---------- Getränk: kleines Modell, der Ursprung liegt in seiner Mitte ---------- */
export const GETRAENKE = {
  kaffee: { halb: 0.055 }, // halbe Höhe, damit es auf dem Tisch steht
  capri: { halb: 0.07 },
  energy: { halb: 0.075 },
  tee: { halb: 0.0425 },
};
export function getraenkForm(art) {
  if (art === "kaffee") {
    return verbinde([
      teil(new THREE.CylinderGeometry(0.058, 0.05, 0.11, 8), "#f4f1ea", {}),
      teil(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8), "#4b2e1e", { y: 0.052 }),
      teil(new THREE.TorusGeometry(0.034, 0.011, 4, 8), "#f4f1ea", { x: 0.062 }),
    ]);
  }
  if (art === "capri") {
    return verbinde([
      teil(new THREE.BoxGeometry(0.1, 0.14, 0.035), "#c9d2d9", {}),
      teil(new THREE.BoxGeometry(0.102, 0.06, 0.037), "#ff8a3d", { y: -0.01 }),
      teil(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 4), "#e5412d", { x: 0.025, y: 0.1, rz: -0.25 }),
    ]);
  }
  if (art === "energy") {
    return verbinde([
      teil(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8), "#2c6fd6", {}),
      teil(new THREE.CylinderGeometry(0.041, 0.041, 0.04, 8), "#f2c94c", {}),
      teil(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 8), "#c9d2d9", { y: 0.078 }),
    ]);
  }
  if (art === "tee") {
    return verbinde([
      teil(new THREE.CylinderGeometry(0.06, 0.045, 0.085, 8), "#cfe8c9", {}),
      teil(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 8), "#c7a25a", { y: 0.04 }),
      teil(new THREE.TorusGeometry(0.03, 0.01, 4, 8), "#cfe8c9", { x: 0.062 }),
      teil(new THREE.BoxGeometry(0.03, 0.035, 0.004), "#ffffff", { x: -0.065, y: -0.01 }), // Zettel am Teebeutel
    ]);
  }
  return null;
}
/** Hier hält die rechte Hand das Getränk (im Arm gemessen, der an der Schulter hängt). */
export const GRIFF = { x: 0, y: -0.66, z: 0.1 };

/** Farbe der Figur als Text, zum Beispiel für das Namensschild. */
export const farbeVon = (aussehen) => FARBEN[aussehen?.f] ?? FARBEN[0];

/**
 * Baut die Figur. Liefert die Figur aus dem Bausatz (gruppe, koerper, Arme, Beine),
 * dazu „propeller“ (oder null) und „kopfHoehe“ (Oberkante samt Kopfbedeckung).
 */
export function baueHerzblattFigur(aussehen) {
  const o = aussehen ?? {};
  const farbe = new THREE.Color(farbeVon(o));
  const dunkel = toene(farbe, -0.3);
  const rumpf = verbinde([
    ...koerper(o.k ?? 0, farbe),
    teil(new THREE.IcosahedronGeometry(KOPF_R, 2), FIGUR.haut, { y: KOPF_Y }),
    ...augen(o.a ?? 0),
    ...mund(o.m ?? 0),
    ...brille(o.b ?? 0),
    ...extra(o.x ?? 0),
    ...kopfbedeckung(o.h ?? 0),
  ]);
  const figur = baueFigur({ rumpf, arm: armForm(farbe), bein: beinForm(dunkel, toene(farbe, -0.55)) });
  figur.propeller = null;
  if (o.h === 7) {
    propellerGeo ??= propellerForm();
    figur.propeller = new THREE.Mesh(propellerGeo, stoffFigur);
    figur.propeller.position.set(0, SCHEITEL + 0.16, 0);
    figur.koerper.add(figur.propeller);
  }
  figur.kopfHoehe = SCHEITEL + [0, 0.26, 0.06, 0.17, 0.42, 0.2, 0.44, 0.2, 0.24][o.h ?? 0];
  return figur;
}
