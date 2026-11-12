/*
 * Herzblatt – der Platz in 3D
 * Die Tische stehen auf einem Platz in der Zinssturm-Welt: Boden, Bäume, Häuser, Licht und Nebel
 * kommen aus dem gemeinsamen Bausatz welt3d, die Figuren sehen aus wie dort.
 *
 * Gemeinsame Sprache mit dem Server und der 2D-Ansicht bleiben die Bühnen-Pixel aus raum.js
 * (x 0 bis 1250, y 90 bis 900). Die Welt rechnet sie um: 1 Pixel = 1,25 cm nach rechts und 2 cm in
 * die Tiefe. Die 2D-Bühne ist in der Tiefe gestaucht gezeichnet; so wird aus ihr ein Platz von
 * etwa 15 × 16 Metern, und Handy, Beamer und alte 2D-Geräte passen weiter zusammen.
 *
 * Dieselbe Szene dient dem Handy (Kamera folgt der eigenen Figur) und dem Beamer (feste Kamera).
 */

import * as THREE from "/welt3d/drei.js";
import { teil, verbinde, bodenSammler, toene, lage, flachGeometrie, fleckStoff, fleckTextur, schattenTextur } from "/welt3d/formen.js";
import { durchblick } from "/welt3d/durchblick.js";
import { baueHimmel, baueLicht, baueWolken, huegelTeile } from "/welt3d/himmel.js";
import { baueBaeume } from "/welt3d/natur.js";
import { baueHaeuser, hausTeile } from "/welt3d/bauten.js";
import { FIGUR, bewegeFigur } from "/welt3d/figur.js";
import { textSchild, schreibeSchild, denkblase } from "/welt3d/schild.js";
import { erzeugeBuehne } from "/welt3d/buehne.js";
import { verfolger } from "/welt3d/kamera.js";
import { baueHerzblattFigur, farbeVon, getraenkForm, GETRAENKE, GRIFF } from "./figur3d.js";
import { TISCHFARBEN } from "./daten.js";
import { RAUM } from "./raum.js";

/* ---------- Umrechnung Bühne ↔ Welt ---------- */
export const SX = 0.0125; // Meter je Bühnen-Pixel nach rechts
export const SZ = 0.02; // Meter je Bühnen-Pixel in die Tiefe
const MITTE_X = 625;
const MITTE_Y = 495;
export const zuWelt = (x, y) => [(x - MITTE_X) * SX, (y - MITTE_Y) * SZ];

export const LAUFTEMPO = 3.6; // Meter je Sekunde, entspricht dem Tempo der 2D-Ansicht
const STUHL_ABSTAND = 0.3; // Stuhlmitte hinter der Tischkante
const ARME_AM_TISCH = -1.33; // Arme beim Sitzen: Die Hände liegen auf der Platte
const MAX_FIGUREN = 64;
// Feste Kamera (Beamer): Neigung nach unten, langes Objektiv (wenig Verzerrung, die hinteren Tische bleiben groß),
// dazu die Ränder des Platzes im Bild (−1 = unten, 1 = oben)
const FEST = { neigung: 0.72, blickwinkel: 15, unten: -0.95, seite: 0.965 };
const NAH_SCHILD = 6.5; // näher als so viele Meter wachsen Namensschilder auf dem Bildschirm nicht weiter

const FARBEN = {
  pflaster: ["#efe5cf", "#e4d8be"],
  feld: "#f7f1e3",
  eingang: ["#e9dfc8", "#dfd3b8"],
  bord: "#c2b69c",
  wiese: ["#86c670", "#80c268", "#8cc66f", "#74b163"],
  umland: "#6aa85e",
  holz: "#d9a066",
  holzDunkel: "#a8743f",
  stuhl: "#c7d3dc",
  stuhlDunkel: "#9fb0bd",
  mast: "#f4f1ea",
  tafel: "#12324a",
  ich: "#ffc531",
};

const M4 = new THREE.Matrix4();
const V = new THREE.Vector3();

/* Kleiner Zufall mit Startwert nur für das Aussehen: Der Platz sieht jedes Mal gleich aus. */
function wuerfel(start) {
  let a = start | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function winkelDifferenz(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function haus(x, z, hw, hd, winkel, hoehe, dachHoehe, wand, dach) {
  return { x, z, hw, hd, winkel, cos: Math.cos(winkel), sin: Math.sin(winkel), hoehe, dachHoehe, wand, dach };
}

/**
 * Baut den Platz.
 * optionen:
 *   layout      Ergebnis von berechneLayout(tische, plaetze) aus raum.js
 *   sicht       "verfolger" (Handy: Kamera folgt der eigenen Figur) oder "fest" (Beamer: schräg von oben,
 *               alle Tische und der Eingang sind im Bild; aufBild rechnet Orte für Anzeigen über der Szene um)
 *   festeStufe  feste Bildqualität 0 bis 3 (sonst schaltet die Bühne bei schwacher Bildrate selbst herunter)
 *   abstand, folgen   Abstand der Kamera und wie stark sie von selbst hinter die Figur dreht
 */
export function erzeugePlatz(leinwand, optionen) {
  const L = optionen.layout;
  const sicht = optionen.sicht ?? "verfolger";
  const fest = sicht === "fest";
  const zufall = wuerfel(20261112);
  const zw = (von, bis) => von + zufall() * (bis - von);
  const rausch = (farbe, staerke) => toene(farbe, (zufall() - 0.5) * staerke);

  // Größe der Figuren: so, dass sie nebeneinander auf die Stühle passen
  let eng = Infinity;
  for (const T of L.tische) {
    for (const hinten of [true, false]) {
      const xs = T.plaetze.filter((p) => p.hinten === hinten).map((p) => p.x);
      for (let i = 1; i < xs.length; i++) eng = Math.min(eng, (xs[i] - xs[i - 1]) * SX);
    }
  }
  const mass = Math.max(0.7, Math.min(0.85, eng / 0.8));
  const SITZ_HOEHE = (FIGUR.hueftHoehe - FIGUR.sitzTiefe) * mass;
  const TISCH_HOEHE = 0.8 * mass;
  const BECHER = mass * 1.4; // Getränke etwas größer, damit man sie erkennt
  const VORNAME_HOEHE = Math.max(0.42, Math.min(0.6, eng * 0.62)); // Namensschild nach dem Auflösen: groß, aber Nachbarn sollen sich nicht verdecken
  // Mast am Tischende mit Fähnchen und Nummernschild. Am Beamer niedriger: Über den hinteren Tischen stehen dort die Listen.
  const MAST_HOEHE = fest ? 1.85 : 2.45;
  const SCHILD_HOEHE = fest ? 0.8 : 0.95;

  const buehne = erzeugeBuehne(leinwand, {
    festeStufe: optionen.festeStufe,
    durchsichtig: fest, // am Beamer liegen die Listen der Tische als HTML unter der Szene und scheinen durch Fenster im Boden
    blickwinkel: (v) => (fest ? FEST.blickwinkel : v < 0.8 ? 74 : v < 1.25 ? 66 : 58),
    beiStufe(s) {
      wolken.visible = s.wolken;
      const randZahl = Math.round((baeume.eintraege.length - baeumeNah) * s.randAnteil);
      baeume.stammNetz.count = baeumeNah + randZahl;
      baeume.nadelNetz.count = nadelNah + randZahl;
    },
  });
  const { szene, kamera } = buehne;
  for (const licht of baueLicht()) szene.add(licht);
  szene.add(baueHimmel());
  const wolken = baueWolken(zw);
  szene.add(wolken);

  const stoffFarbig = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Was der Kamera zu nah kommt, löst sich auf: Möbel, Fähnchen und fremde Figuren verstellen nie den Blick
  const stoffMoebel = durchblick(new THREE.MeshLambertMaterial({ vertexColors: true }), 1.4, 3.6);
  const stoffLeute = durchblick(new THREE.MeshLambertMaterial({ vertexColors: true }), 1.6, 3.8);

  // Ränder des Platzes in der Welt
  const [x0, z0] = zuWelt(12, 90);
  const [x1, z1] = zuWelt(1238, 898);
  const [, zEingang] = zuWelt(0, RAUM.eingangOben);

  // ------------------------------------------------------------------
  // Boden: Wiese ringsum, Pflaster auf dem Platz, Felder der Tische, Eingang
  // ------------------------------------------------------------------
  {
    const b = bodenSammler();
    const ringe = [0, 9, 14, 20, 28, 40, 60, 110, 260, 1300];
    for (let i = 0; i < ringe.length - 1; i++) {
      for (let s = 0; s < 40; s++) {
        const farbe = i < 6 ? FARBEN.wiese[(s * 7 + i * 3) % 4] : toene(FARBEN.umland, -0.05 * (i - 6));
        b.ringstueck(ringe[i], ringe[i + 1], (s / 40) * 2 * Math.PI, ((s + 1) / 40) * 2 * Math.PI, 0, rausch(farbe, 0.07));
      }
    }
    // Pflaster im Wechsel
    const nx = 15;
    const nz = 16;
    const bx = (x1 - x0) / nx;
    const bz = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const z = z0 + (j + 0.5) * bz;
        const farben = z > zEingang ? FARBEN.eingang : FARBEN.pflaster;
        b.rechteck(x0 + (i + 0.5) * bx, z, bx / 2, bz / 2, 0, 0.02, rausch(farben[(i + j) % 2], 0.03));
      }
    }
    // Bordüre rund um den Platz
    const bord = new THREE.Color(FARBEN.bord);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    b.rechteck(mx, z0 - 0.2, (x1 - x0) / 2 + 0.4, 0.2, 0, 0.03, bord);
    b.rechteck(mx, z1 + 0.2, (x1 - x0) / 2 + 0.4, 0.2, 0, 0.03, bord);
    b.rechteck(x0 - 0.2, mz, 0.2, (z1 - z0) / 2, 0, 0.03, bord);
    b.rechteck(x1 + 0.2, mz, 0.2, (z1 - z0) / 2, 0, 0.03, bord);
    // Felder der Tische: helle Fläche mit Rand in der Tischfarbe
    L.tische.forEach((T, i) => {
      const [fx, fz] = zuWelt(T.x + T.cw / 2, T.y + T.ch / 2);
      const hw = (T.cw * SX) / 2 - 0.06;
      const hd = (T.ch * SZ) / 2 - 0.06;
      const farbe = new THREE.Color(TISCHFARBEN[i]);
      b.rechteck(fx, fz, hw, hd, 0, 0.03, new THREE.Color(FARBEN.feld));
      b.rechteck(fx, fz - hd, hw, 0.05, 0, 0.04, farbe);
      b.rechteck(fx, fz + hd, hw, 0.05, 0, 0.04, farbe);
      b.rechteck(fx - hw, fz, 0.05, hd, 0, 0.04, farbe);
      b.rechteck(fx + hw, fz, 0.05, hd, 0, 0.04, farbe);
    });
    // Eingang: gestrichelter Rand
    {
      const [ex0, ez0] = zuWelt(RAUM.x0, RAUM.eingangOben);
      const [ex1, ez1] = zuWelt(RAUM.x0 + RAUM.breite, RAUM.eingangOben + RAUM.eingangHoehe);
      const strich = toene(FARBEN.bord, -0.12);
      for (let x = ex0; x < ex1 - 0.3; x += 0.9) {
        b.rechteck(x + 0.28, ez0, 0.28, 0.045, 0, 0.04, strich);
        b.rechteck(x + 0.28, ez1, 0.28, 0.045, 0, 0.04, strich);
      }
      for (let z = ez0; z < ez1 - 0.3; z += 0.9) {
        b.rechteck(ex0, z + 0.28, 0.045, 0.28, 0, 0.04, strich);
        b.rechteck(ex1, z + 0.28, 0.045, 0.28, 0, 0.04, strich);
      }
    }
    const boden = new THREE.Mesh(b.geometrie(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    boden.frustumCulled = false;
    szene.add(boden);
  }

  // ------------------------------------------------------------------
  // Tische, Stühle, Fähnchen (eine Geometrie), dazu je Tisch ein Schild und ein Leuchtfeld
  // ------------------------------------------------------------------
  const tische = L.tische.map((T, i) => {
    const [x, z] = zuWelt(T.cx, T.cy);
    const t = { nr: i + 1, x, z, a: (T.tw * SX) / 2, c: (T.th * SZ) / 2, farbe: TISCHFARBEN[i], T, belegt: -1, nah: false, leuchtet: 0, dauerlicht: 0 };
    t.mastX = x - t.a - 0.32;
    // Sitzplätze: hintere Reihe schaut zum Eingang, vordere zu ihr hin. Die Platte ist oval,
    // deshalb stehen die Stühle am Rand etwas näher zur Mitte.
    let hinten = 0;
    let vorn = 0;
    t.sitze = T.plaetze.map((p) => {
      const [sx] = zuWelt(p.x, 0);
      const u = Math.min(0.95, Math.abs(sx - x) / t.a);
      const kante = t.c * Math.sqrt(1 - u * u);
      // „stufe“: Nachbarn in einer Reihe tragen ihr Schild abwechselnd auf zwei Höhen, damit sich die Schilder nicht verdecken
      return p.hinten
        ? { x: sx, z: z - kante - STUHL_ABSTAND, richtung: 0, kante, hinten: true, stufe: hinten++ % 2 }
        : { x: sx, z: z + kante + STUHL_ABSTAND, richtung: Math.PI, kante, hinten: false, stufe: vorn++ % 2 };
    });
    return t;
  });
  const sitzOrt = (tischNr, platz) => tische[tischNr - 1]?.sitze[platz] ?? null;
  const eingangMasten = [zuWelt(RAUM.x0 + 14, 0)[0], zuWelt(RAUM.x0 + RAUM.breite - 14, 0)[0]];

  {
    const teile = [];
    const g = mass / 0.85; // Möbel wachsen mit den Figuren
    for (const t of tische) {
      // Tischplatte (oval wie in der 2D-Ansicht), Zarge, Füße
      teile.push(
        teil(new THREE.CylinderGeometry(1, 1, 0.07, 22), FARBEN.holz, { x: t.x, y: TISCH_HOEHE, z: t.z, sx: t.a, sz: t.c }),
        teil(new THREE.CylinderGeometry(0.96, 0.9, 0.07, 22), FARBEN.holzDunkel, { x: t.x, y: TISCH_HOEHE - 0.07, z: t.z, sx: t.a, sz: t.c }),
        teil(new THREE.RingGeometry(0.8, 0.88, 22), toene(t.farbe, 0.15), { x: t.x, y: TISCH_HOEHE + 0.037, z: t.z, rx: -Math.PI / 2, sx: t.a, sy: t.c }),
      );
      for (const seite of [-1, 1]) {
        teile.push(
          teil(new THREE.BoxGeometry(0.09, TISCH_HOEHE - 0.1, 0.09), FARBEN.holzDunkel, { x: t.x + seite * t.a * 0.6, y: (TISCH_HOEHE - 0.1) / 2, z: t.z }),
          teil(new THREE.BoxGeometry(0.12, 0.06, t.c * 1.3), FARBEN.holzDunkel, { x: t.x + seite * t.a * 0.6, y: 0.03, z: t.z }),
        );
      }
      // Stühle
      for (const s of t.sitze) {
        const co = Math.cos(s.richtung);
        const si = Math.sin(s.richtung);
        const ort = (lx, lz) => ({ x: s.x + (lx * co + lz * si) * g, z: s.z + (-lx * si + lz * co) * g });
        teile.push(teil(new THREE.BoxGeometry(0.42 * g, 0.05, 0.42 * g), FARBEN.stuhl, { ...ort(0, 0), y: SITZ_HOEHE - 0.025, ry: s.richtung }));
        teile.push(teil(new THREE.BoxGeometry(0.42 * g, 0.4 * g, 0.05), toene(t.farbe, 0.45), { ...ort(0, -0.2), y: SITZ_HOEHE + 0.24 * g, ry: s.richtung }));
        for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
          teile.push(teil(new THREE.BoxGeometry(0.045, SITZ_HOEHE - 0.05, 0.045), FARBEN.stuhlDunkel, { ...ort(lx, lz), y: (SITZ_HOEHE - 0.05) / 2 }));
        }
      }
      // Mast am Tischende: Fähnchen in der Tischfarbe, obendrauf das Schild mit der Nummer
      teile.push(
        teil(new THREE.CylinderGeometry(0.03, 0.045, MAST_HOEHE, 6), FARBEN.mast, { x: t.mastX, y: MAST_HOEHE / 2, z: t.z }),
        teil(new THREE.BoxGeometry(0.62, 0.34, 0.03), t.farbe, { x: t.mastX + 0.34, y: MAST_HOEHE - 0.42, z: t.z }),
        teil(new THREE.CylinderGeometry(0.2, 0.26, 0.07, 8), FARBEN.holzDunkel, { x: t.mastX, y: 0.035, z: t.z }),
      );
    }
    // Eingang: zwei Masten an den Ecken, obendrauf steht „Eingang“
    for (const ex of eingangMasten) {
      teile.push(
        teil(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 6), FARBEN.mast, { x: ex, y: 1.35, z: z1 - 0.25 }),
        teil(new THREE.CylinderGeometry(0.22, 0.28, 0.07, 8), FARBEN.holzDunkel, { x: ex, y: 0.035, z: z1 - 0.25 }),
      );
    }
    const moebel = new THREE.Mesh(verbinde(teile), stoffMoebel);
    moebel.frustumCulled = false;
    szene.add(moebel);
  }

  // Schild über jedem Tisch: große Nummer in der Tischfarbe, darunter „2/4“. Von Weitem lesbar.
  const schildOptionen = (t) => ({ hoehe: SCHILD_HOEHE, groessen: [1.5, 0.62], grund: t.farbe, schrift: "#ffffff" });
  for (const t of tische) {
    t.schild = textSchild([String(t.nr), `0/${L.P}`], schildOptionen(t));
    t.schild.position.set(t.mastX, MAST_HOEHE + SCHILD_HOEHE / 2, t.z);
    szene.add(t.schild);
    // Leuchtfeld: zeigt „hier stehst du“ und leuchtet beim Auflösen auf
    const [fx, fz] = zuWelt(t.T.x + t.T.cw / 2, t.T.y + t.T.ch / 2);
    t.feld = new THREE.Mesh(flachGeometrie(), new THREE.MeshBasicMaterial({
      color: t.farbe, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    t.feld.position.set(fx, 0.05, fz);
    t.feld.scale.set(t.T.cw * SX - 0.1, 1, t.T.ch * SZ - 0.1);
    t.feld.renderOrder = 1;
    t.feld.visible = false;
    szene.add(t.feld);
  }
  for (const ex of eingangMasten) {
    const eingangSchild = textSchild("Eingang", { hoehe: 0.46, grund: FARBEN.tafel, schrift: "#ffffff" });
    eingangSchild.position.set(ex, 2.93, z1 - 0.25);
    szene.add(eingangSchild);
  }

  // ------------------------------------------------------------------
  // Ringsum: Häuser und Bäume stehen nur außen, damit sie keine Wege versperren
  // ------------------------------------------------------------------
  // Am Beamer zeigt die feste Kamera nur einen schmalen Streifen hinter dem Platz: Dort steht eine Häuserzeile dicht am Rand.
  const haeuser = fest ? [
    haus(-12.4, z0 - 4.5, 3.8, 2.8, 0.05, 2.7, 1.6, 0, 0),
    haus(-4.2, z0 - 4.9, 3.7, 2.8, 0, 2.5, 1.5, 2, 1),
    haus(4.1, z0 - 4.6, 3.9, 2.8, -0.04, 2.8, 1.6, 1, 2),
    haus(12.5, z0 - 5, 3.6, 2.8, 0.07, 2.5, 1.5, 0, 1),
  ] : [
    haus(-13, z0 - 10.5, 4.4, 3.2, 0.12, 3.6, 2, 0, 0),
    haus(-3, z0 - 12, 4.2, 3.1, 0, 3.4, 1.9, 2, 1),
    haus(7.5, z0 - 10.8, 4.8, 3.3, -0.08, 3.9, 2.1, 1, 2),
    haus(18, z0 - 12.5, 4, 3, 0.3, 3.3, 1.8, 0, 0),
    haus(x0 - 11.5, -4.5, 4.2, 3.1, Math.PI / 2 - 0.1, 3.5, 1.9, 1, 1),
    haus(x0 - 12.5, 7, 4, 3, Math.PI / 2 + 0.12, 3.3, 1.8, 2, 0),
    haus(x1 + 11.5, -5.5, 4.4, 3.2, -Math.PI / 2 + 0.1, 3.7, 2, 0, 2),
    haus(x1 + 12.5, 6.5, 4, 3, -Math.PI / 2 - 0.1, 3.4, 1.8, 1, 0),
  ];
  {
    const { wand, dach } = baueHaeuser(haeuser, stoffFarbig);
    szene.add(wand, dach);
  }
  const frei = (x, z, rand) => {
    if (x > x0 - rand && x < x1 + rand && z > z0 - rand && z < z1 + rand) return false; // auf dem Platz
    if (Math.abs(x) < 14 && z > z1 - 3) return false; // freie Sicht für die Beamer-Kamera und beim Start am Eingang
    return !haeuser.some((h) => Math.abs(x - h.x) < h.hw + h.hd + 1.5 && Math.abs(z - h.z) < h.hw + h.hd + 1.5);
  };
  const liste = [];
  const baumRand = fest ? 2.3 : 3.4; // so viel Abstand halten die Bäume zum Platz
  for (let versuch = 0; versuch < 900 && liste.length < 46; versuch++) {
    const w = zw(0, 2 * Math.PI);
    const rho = zw(fest ? 9.5 : 10.5, fest ? 22 : 34);
    const x = Math.sin(w) * rho;
    const z = Math.cos(w) * rho;
    if (!frei(x, z, baumRand) || liste.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < 14)) continue;
    const nadel = zufall() < 0.3;
    liste.push({
      x, z, art: nadel ? "nadel" : "laub", ton: Math.floor(zufall() * 3),
      hoehe: nadel ? zw(6.5, 9.5) : zw(5, 7.5), krone: nadel ? zw(1.5, 2) : zw(1.9, fest ? 2.2 : 2.7),
    });
  }
  const baeumeNah = liste.length;
  const nadelNah = liste.filter((b) => b.art === "nadel").length;
  for (let i = 0; i < 70; i++) {
    const w = (i / 70) * 2 * Math.PI + zw(-0.02, 0.02);
    const rho = i % 2 ? zw(38, 44) : zw(46, 56);
    liste.push({ x: Math.sin(w) * rho, z: Math.cos(w) * rho, art: "nadel", ton: i % 3, hoehe: zw(8, 13), krone: zw(2.2, 3.2), dunkel: true });
  }
  const baeume = baueBaeume(liste, zw);
  szene.add(baeume.stammNetz, baeume.laubNetz, baeume.nadelNetz);
  {
    const schmuck = new THREE.Mesh(verbinde([...huegelTeile(zw, 70), ...hausTeile(haeuser)]),
      durchblick(new THREE.MeshLambertMaterial({ vertexColors: true }), 2.2, 5.5));
    schmuck.frustumCulled = false;
    szene.add(schmuck);
  }

  // Weiche dunkle Flecken (keine echten Schatten)
  const flachGeo = flachGeometrie();
  const stoffFleck = fleckStoff(fleckTextur());
  {
    const stoffSchatten = fleckStoff(schattenTextur());
    const eckig = new THREE.InstancedMesh(flachGeo, stoffSchatten, haeuser.length + tische.length);
    haeuser.forEach((h, i) => eckig.setMatrixAt(i, lage(h.x + 0.5, 0.06, h.z - 0.4, h.winkel, 2 * h.hw + 3.4, 1, 2 * h.hd + 3.4)));
    tische.forEach((t, i) => eckig.setMatrixAt(haeuser.length + i, lage(t.x + 0.15, 0.06, t.z - 0.1, 0, 2 * t.a + 1.3, 1, 2 * t.c + 2.6)));
    const rund = new THREE.InstancedMesh(flachGeo, stoffFleck, baeumeNah);
    for (let i = 0; i < baeumeNah; i++) rund.setMatrixAt(i, lage(liste[i].x + 0.5, 0.06, liste[i].z - 0.4, 0, liste[i].krone * 2.5, 1, liste[i].krone * 2.5));
    for (const netz of [eckig, rund]) {
      netz.frustumCulled = false;
      netz.renderOrder = 2;
      szene.add(netz);
    }
  }

  // ------------------------------------------------------------------
  // Figuren
  // ------------------------------------------------------------------
  const figuren = new Map(); // fid → Eintrag
  const figurFlecken = new THREE.InstancedMesh(flachGeo, stoffFleck, MAX_FIGUREN);
  figurFlecken.frustumCulled = false;
  figurFlecken.renderOrder = 3;
  figurFlecken.count = 0;
  szene.add(figurFlecken);

  // Getränke: je Sorte ein Netz für alle Figuren. Sie stehen aufrecht in der Hand oder auf dem Tisch.
  const becher = new Map();
  for (const [art, daten] of Object.entries(GETRAENKE)) {
    const netz = new THREE.InstancedMesh(getraenkForm(art), stoffFarbig, MAX_FIGUREN);
    netz.frustumCulled = false;
    netz.count = 0;
    szene.add(netz);
    becher.set(art, { netz, halb: daten.halb, n: 0 });
  }

  // Eigene Figur: gelber Lichtring am Boden und „du“ darüber
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.66, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: FARBEN.ich, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  );
  ring.renderOrder = 4;
  ring.visible = false;
  const duSchild = textSchild("du", { hoehe: 0.4, grund: FARBEN.tafel, schrift: "#ffffff", immerSichtbar: true });
  duSchild.visible = false;
  szene.add(ring, duSchild);
  let ichFid = null;

  function schildFuer(e) {
    if (e.schild) {
      szene.remove(e.schild);
      e.schild.material.map.dispose();
      e.schild.material.dispose();
    }
    if (e.daten.vorname) {
      // nach dem Auflösen: der Vorname, groß (der Deckname steht daneben in der Liste des Tisches)
      e.schild = textSchild(e.daten.vorname, { hoehe: VORNAME_HOEHE, punkt: farbeVon(e.daten.aussehen), immerSichtbar: e.amRuecken });
      e.pop = 0; // das Schild springt auf
    } else {
      // vorher: nur der Deckname, klein
      const worte = String(e.daten.name ?? "").split(" ");
      const zeilen = worte.length > 1 ? [worte.slice(0, -1).join(" "), worte[worte.length - 1]] : worte;
      e.schild = textSchild(zeilen, { hoehe: (0.19 * zeilen.length + 0.08) * (fest ? 1.2 : 1), punkt: farbeVon(e.daten.aussehen), immerSichtbar: !!e.daten.ich || e.amRuecken });
      e.pop = 1;
    }
    e.schildMass = e.schild.scale.clone();
    szene.add(e.schild);
  }

  function raeumeStarr(e) {
    for (const netz of Object.values(e.starr)) {
      e.figur.gruppe.remove(netz);
      netz.geometry.dispose();
    }
    e.starr = {};
    e.starrArt = null;
  }

  function baue(e) {
    if (e.figur) {
      raeumeStarr(e);
      szene.remove(e.figur.gruppe);
      e.figur.rumpf.geometry.dispose();
      e.figur.armL.geometry.dispose();
    }
    e.figur = baueHerzblattFigur(e.daten.aussehen);
    e.figur.gruppe.traverse((netz) => { if (netz.isMesh) netz.material = stoffLeute; });
    e.figur.gruppe.scale.setScalar(mass);
    szene.add(e.figur.gruppe);
  }

  /**
   * Eine Figur in Ruhe wird zu einer einzigen Geometrie (ein Zeichenaufruf statt fünf).
   * art: "steht", "sitzt" oder null (dann bewegt sie sich und besteht wieder aus ihren Teilen).
   */
  function zeigeStarr(e, art) {
    const f = e.figur;
    e.starrArt = art;
    if (art && !e.starr[art]) {
      const { tempo, phase } = f;
      f.tempo = 0;
      f.phase = 0;
      bewegeFigur(f, 0, 0, 0, LAUFTEMPO, art === "sitzt" ? "sitzt" : undefined);
      if (art === "sitzt") f.armL.rotation.x = f.armR.rotation.x = ARME_AM_TISCH;
      f.koerper.updateMatrix();
      const teile = [f.rumpf, f.armL, f.armR, f.beinL, f.beinR].map((netz) => {
        netz.updateMatrix();
        return netz.geometry.clone().applyMatrix4(M4.multiplyMatrices(f.koerper.matrix, netz.matrix));
      });
      f.tempo = tempo;
      f.phase = phase;
      e.starr[art] = new THREE.Mesh(verbinde(teile), stoffLeute);
      f.gruppe.add(e.starr[art]);
    }
    f.koerper.visible = !art;
    for (const [name, netz] of Object.entries(e.starr)) netz.visible = name === art;
  }

  /**
   * Stand aller Figuren. Jede: { fid, name, vorname?, aussehen, getraenk, denkt, ich,
   *   sitz: { tisch, platz } | null, x, y, stufe? } – x und y in Bühnen-Pixeln (Füße).
   * stufe: Höhe des Schilds (0, 1, 2) für Figuren, die dicht nebeneinander am Eingang stehen.
   * „sofort“: ohne Hinlaufen an den Ort stellen (erster Aufbau).
   */
  function setzeFiguren(leute, sofort = false) {
    const da = new Set();
    for (const p of leute) {
      da.add(p.fid);
      if (p.ich) ichFid = p.fid;
      let e = figuren.get(p.fid);
      const neu = !e;
      if (!e) {
        if (figuren.size >= MAX_FIGUREN) continue;
        e = {
          fid: p.fid, daten: p, figur: null, schild: null, blase: null, starr: {}, starrArt: null, ruhe: 0,
          x: 0, z: 0, y: 0, richtung: Math.PI, sitz: null, sitzNr: "", huepf: null, zielX: 0, zielZ: 0, schritt: 0,
          stufe: 0, amRuecken: false, pop: 1,
        };
        figuren.set(p.fid, e);
      }
      e.daten = p;
      const sitz = p.sitz ? sitzOrt(p.sitz.tisch, p.sitz.platz) : null;
      // Schild: Nachbarn tragen es auf verschiedenen Höhen. Am Beamer hängt es in der vorderen Reihe am Rücken,
      // damit es niemandem am Tisch das Gesicht verdeckt.
      e.stufe = sitz ? sitz.stufe : p.stufe ?? 0;
      e.amRuecken = fest && !!sitz && !sitz.hinten;
      const aussehen = JSON.stringify(p.aussehen);
      const text = `${p.name}|${p.vorname ?? ""}|${e.amRuecken}`;
      if (e.aussehen !== aussehen) { e.aussehen = aussehen; baue(e); }
      if (e.text !== text) { e.text = text; schildFuer(e); }
      if (p.denkt && !e.blase) { e.blase = denkblase(0.5); szene.add(e.blase); }
      if (e.blase) e.blase.visible = !!p.denkt;

      if (sitz) {
        const nr = `${p.sitz.tisch}-${p.sitz.platz}`;
        if (e.sitzNr !== nr) {
          e.sitz = sitz;
          e.sitzNr = nr;
          if (neu || sofort) { e.x = sitz.x; e.z = sitz.z; e.richtung = sitz.richtung; e.huepf = null; }
          else e.huepf = { t: 0, dauer: 0.5, vonX: e.x, vonZ: e.z, zuX: sitz.x, zuZ: sitz.z, jubel: true }; // Jubelsprung auf den Stuhl
        }
      } else {
        const [x, z] = zuWelt(p.x, p.y);
        if (e.sitz) {
          // aufstehen: mit einem kleinen Hüpfer vor den Tisch
          e.huepf = { t: 0, dauer: 0.35, vonX: e.x, vonZ: e.z, zuX: x, zuZ: z, jubel: false };
          e.sitz = null;
          e.sitzNr = "";
        }
        if (neu || sofort) {
          e.x = x; e.z = z; e.zielX = x; e.zielZ = z; e.schritt = 0;
          if (!sofort) e.huepf = { t: 0, dauer: 0.4, vonX: x, vonZ: z, zuX: x, zuZ: z, jubel: false }; // wer dazukommt, hüpft kurz
        } else if (!p.ich) {
          // die anderen laufen weich zu ihrem neuen Ort (so schnell, dass sie bis zur nächsten Meldung da sind)
          const weg = Math.hypot(x - e.x, z - e.z);
          e.zielX = x;
          e.zielZ = z;
          e.schritt = Math.min(LAUFTEMPO * 1.7, Math.max(weg / 0.5, weg > 0.05 ? 1.2 : 0));
        }
      }
    }
    for (const [fid, e] of figuren) {
      if (da.has(fid)) continue;
      raeumeStarr(e);
      szene.remove(e.figur.gruppe);
      e.figur.rumpf.geometry.dispose();
      e.figur.armL.geometry.dispose();
      for (const schild of [e.schild, e.blase]) {
        if (!schild) continue;
        szene.remove(schild);
        schild.material.map.dispose();
        schild.material.dispose();
      }
      figuren.delete(fid);
    }
  }

  /** Eigene Figur: Ort in Bühnen-Pixeln, jedes Bild. */
  function setzeIch(x, y) {
    const e = figuren.get(ichFid);
    if (!e || e.sitz || e.huepf) return;
    [e.zielX, e.zielZ] = zuWelt(x, y);
    e.schritt = Infinity; // folgt der Eingabe sofort
  }

  // ------------------------------------------------------------------
  // Kamera
  // ------------------------------------------------------------------
  /** Die Kamera bleibt vor den Häusern: so weit darf sie waagerecht zurück. */
  function freierAbstand(tx, tz, gier, wunsch) {
    const dx = -Math.sin(gier);
    const dz = -Math.cos(gier);
    let t = wunsch;
    const grenze = (ort, d, min, max) => {
      if (d > 1e-6) t = Math.min(t, (max - ort) / d);
      else if (d < -1e-6) t = Math.min(t, (min - ort) / d);
    };
    grenze(tx, dx, x0 - 6, x1 + 6);
    grenze(tz, dz, z0 - 5, z1 + 9);
    return Math.max(0.3, t);
  }
  const verfolgung = verfolger({
    gier: Math.PI, // schaut vom Eingang zu den Tischen
    neigung: 0.44,
    abstand: optionen.abstand ?? 6.4,
    folgen: optionen.folgen ?? 1.2,
    zielHoehe: 1.6,
    voraus: 0.9,
    x: 0,
    z: z1 - 1.5,
    freierAbstand,
  });
  const blick = verfolgung.blick;

  /**
   * Feste Kamera für den Beamer: schräg von oben, alle Tische und der Eingang sind im Bild.
   * Sie steht südlich des Platzes und schaut nach Norden. Höhe und Abstand ergeben sich daraus, wo der
   * vordere und der hintere Rand des Platzes im Bild liegen sollen.
   */
  let festesBild = 0;
  function festeKamera() {
    if (festesBild === kamera.aspect) return;
    festesBild = kamera.aspect;
    const sin = Math.sin(FEST.neigung);
    const cos = Math.cos(FEST.neigung);
    const t = Math.tan((kamera.fov * Math.PI) / 360);
    const zs = z1 + 0.45; // vorderer Rand (Eingang) samt Bordüre
    const zn = z0 - 0.2; // hinterer Rand
    // g(y): So weit nördlich der Kamera liegt der Bodenpunkt, der in der Bildhöhe y erscheint (je Meter Kamerahöhe)
    const g = (y) => (cos + y * t * sin) / (sin - y * t * cos);
    let rand = 1;
    let hoehe = 0;
    let zk = 0;
    // Bei zwei Tischreihen stehen die Listen der hinteren Tische über dem Platz: Dafür bleibt oben mehr frei.
    const festOben = L.eng ? 0.6 - Math.max(0, L.P - 4) * 0.045 : 0.64;
    for (let versuch = 0; versuch < 40; versuch++) {
      const mitte = (festOben + FEST.unten) / 2;
      const oben = mitte + (festOben - mitte) * rand;
      const unten = mitte + (FEST.unten - mitte) * rand;
      hoehe = (zs - zn) / (g(oben) - g(unten));
      zk = zs + hoehe * g(unten);
      // passt der Platz vorn auch in die Breite?
      const vor = hoehe * sin + (zk - zs) * cos;
      if ((x1 + 0.45) / (vor * t * kamera.aspect) <= FEST.seite) break;
      rand *= 0.97;
    }
    kamera.position.set(0, hoehe, zk);
    kamera.lookAt(0, hoehe - sin * 10, zk - cos * 10);
    kamera.updateMatrixWorld(true);
  }

  /**
   * Fenster im Boden (Beamer): An diesen Stellen wird die Leinwand durchsichtig, und die Seite darunter
   * scheint durch, zum Beispiel die Liste eines Tisches. Figuren, Schatten und Schilder liegen darüber:
   * Wer über eine Liste läuft, verdeckt sie kurz, so wie in der 2D-Ansicht.
   * rechtecke: [links, oben, rechts, unten] als Anteile der Bildbreite und Bildhöhe.
   */
  let fenster = null;
  function setzeFenster(rechtecke) {
    if (fenster) {
      szene.remove(fenster);
      fenster.geometry.dispose();
      fenster.material.dispose();
      fenster = null;
    }
    if (!rechtecke.length) return;
    // Punkt am Boden, der an einer Stelle des Bildes zu sehen ist
    const amBoden = (u, v) => {
      V.set(u * 2 - 1, 1 - v * 2, 0.5).unproject(kamera).sub(kamera.position);
      const t = (0.046 - kamera.position.y) / V.y;
      return [kamera.position.x + V.x * t, 0.046, kamera.position.z + V.z * t];
    };
    const orte = [];
    for (const [links, oben, rechts, unten] of rechtecke) {
      const a = amBoden(links, oben);
      const b = amBoden(rechts, oben);
      const c = amBoden(rechts, unten);
      const d = amBoden(links, unten);
      orte.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(orte), 3));
    fenster = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    fenster.frustumCulled = false;
    fenster.renderOrder = -5; // vor Schatten, Leuchtfeldern und Schildern, damit diese über dem Fenster liegen
    szene.add(fenster);
  }

  // ------------------------------------------------------------------
  // Ein Bild
  // ------------------------------------------------------------------
  let zeit = 0;
  function bild(dt) {
    zeit += dt;
    verfolgung.tick(dt);
    buehne.passeGroesseAn();
    buehne.beobachte(dt);
    wolken.rotation.y = zeit * 0.004;

    // „rechts“ aus Sicht der Kamera, für alles, was neben einer Figur schwebt
    const gier = fest ? Math.PI : blick.gier;
    const rechtsX = -Math.cos(gier);
    const rechtsZ = Math.sin(gier);

    let n = 0;
    let ich = null;
    for (const b of becher.values()) b.n = 0;
    for (const e of figuren.values()) {
      let haltung;
      let tempo = 0;
      if (e.huepf) {
        // Hüpfer auf den Stuhl (mit Jubel) oder vom Stuhl herunter
        const h = e.huepf;
        h.t += dt / h.dauer;
        const k = Math.min(1, h.t);
        e.x = h.vonX + (h.zuX - h.vonX) * k;
        e.z = h.vonZ + (h.zuZ - h.vonZ) * k;
        e.y = Math.sin(Math.PI * k) * (h.jubel ? 0.75 : 0.35);
        haltung = h.jubel ? "jubelt" : undefined;
        if (e.sitz) e.richtung += winkelDifferenz(e.richtung, e.sitz.richtung) * Math.min(1, dt * 12);
        if (k >= 1) {
          e.huepf = null;
          e.y = 0;
          e.zielX = e.x;
          e.zielZ = e.z;
          e.schritt = 0;
        }
      } else if (e.sitz) {
        e.x = e.sitz.x;
        e.z = e.sitz.z;
        e.y = 0;
        e.richtung = e.sitz.richtung;
        haltung = "sitzt";
      } else {
        const dx = e.zielX - e.x;
        const dz = e.zielZ - e.z;
        const weg = Math.hypot(dx, dz);
        if (weg > 0.004 && e.schritt > 0) {
          const schritt = Math.min(weg, e.schritt * dt);
          e.x += (dx / weg) * schritt;
          e.z += (dz / weg) * schritt;
          tempo = schritt / Math.max(dt, 1e-4);
          if (weg > 0.03) e.richtung += winkelDifferenz(e.richtung, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
        }
        e.y = 0;
      }
      const f = e.figur;
      const sitzt = haltung === "sitzt";
      f.gruppe.position.set(e.x, e.y * mass, e.z);
      f.gruppe.rotation.y = e.richtung;

      // Wer ruht, wird als eine Geometrie gezeichnet. Der Propeller dreht sich weiter, also bleibt er beweglich.
      e.ruhe = !e.huepf && tempo < 0.01 && !f.propeller ? e.ruhe + dt : 0;
      const starr = e.ruhe > 0.6 ? (sitzt ? "sitzt" : "steht") : null;
      if (starr !== e.starrArt) zeigeStarr(e, starr);
      if (!starr) {
        bewegeFigur(f, Math.min(tempo, LAUFTEMPO * 1.4), haltung === "jubelt" ? 0 : e.y, dt, LAUFTEMPO, haltung);
        if (sitzt) f.armL.rotation.x = f.armR.rotation.x = ARME_AM_TISCH;
        if (f.propeller) f.propeller.rotation.y = zeit * 9;
      }

      // Schild und Denkblase
      const kopf = (f.kopfHoehe - (sitzt ? FIGUR.sitzTiefe : 0) + e.y) * mass;
      // Dicht vor der Kamera wachsen Schilder nicht weiter und blenden aus, damit sie nicht den Blick verstellen
      const ferne = V.set(e.x, kopf, e.z).distanceTo(kamera.position);
      let klein = Math.max(0.3, Math.min(1, ferne / NAH_SCHILD));
      const sichtbar = Math.max(0, Math.min(1, (ferne - 2.4) / 1.6));
      if (e.pop < 1) {
        // neues Namensschild: springt mit etwas Überschwung auf
        e.pop = Math.min(1, e.pop + dt / 0.45);
        const t = e.pop - 1;
        klein *= Math.max(0.05, 1 + 2.70158 * t * t * t + 1.70158 * t * t);
      }
      e.schild.scale.set(e.schildMass.x * klein, e.schildMass.y * klein, 1);
      const hoch = e.schildMass.y * Math.min(1, ferne / NAH_SCHILD);
      if (e.amRuecken) e.schild.position.set(e.x, Math.max(hoch / 2 + 0.04, 0.95 * mass - e.stufe * (hoch + 0.03)), e.z + 0.36);
      else e.schild.position.set(e.x, kopf + hoch / 2 + 0.08 + e.stufe * (hoch + 0.04), e.z);
      e.schild.material.opacity = sichtbar;
      if (e.blase?.visible) {
        e.blase.scale.set(0.625 * klein, 0.5 * klein, 1);
        e.blase.position.set(e.x + rechtsX * 0.5 * klein, kopf - 0.02, e.z + rechtsZ * 0.5 * klein);
        e.blase.material.opacity = sichtbar;
      }

      // Getränk: beim Sitzen auf dem Tisch, sonst aufrecht in der rechten Hand
      const b = becher.get(e.daten.getraenk);
      if (b && b.n < MAX_FIGUREN) {
        if (sitzt) {
          const lx = 0.2 * mass;
          const lz = STUHL_ABSTAND + Math.min(0.2, e.sitz.kante * 0.75);
          const co = Math.cos(e.richtung);
          const si = Math.sin(e.richtung);
          V.set(e.x + lx * co + lz * si, TISCH_HOEHE + 0.036 + b.halb * BECHER, e.z - lx * si + lz * co);
        } else {
          f.gruppe.updateMatrixWorld(true);
          V.set(GRIFF.x, GRIFF.y, GRIFF.z).applyMatrix4(f.armR.matrixWorld);
        }
        b.netz.setMatrixAt(b.n++, lage(V.x, V.y, V.z, e.richtung, BECHER, BECHER, BECHER));
      }

      const gross = 1.25 / (1 + e.y * 0.8);
      if (n < MAX_FIGUREN) figurFlecken.setMatrixAt(n++, lage(e.x, 0.07, e.z, 0, gross, 1, gross));
      if (e.fid === ichFid) ich = e;
    }
    figurFlecken.count = n;
    figurFlecken.instanceMatrix.needsUpdate = true;
    for (const b of becher.values()) {
      b.netz.count = b.n;
      b.netz.instanceMatrix.needsUpdate = true;
    }

    // Eigene Figur hervorheben
    ring.visible = duSchild.visible = !!ich && !fest;
    if (ring.visible) {
      const puls = 1 + Math.sin(zeit * 4) * 0.06;
      ring.position.set(ich.x, 0.08, ich.z);
      ring.scale.set(puls, 1, puls);
      duSchild.position.set(ich.x, ich.schild.position.y + ich.schild.scale.y / 2 + 0.26, ich.z);
    }

    // Leuchtfelder der Tische
    for (const t of tische) {
      const ziel = Math.max(t.nah ? 0.2 + Math.sin(zeit * 5) * 0.06 : 0, t.leuchtet > 0 ? 0.6 * Math.min(1, t.leuchtet) : 0, t.dauerlicht);
      if (t.leuchtet > 0) t.leuchtet -= dt * 0.7;
      t.feld.material.opacity += (ziel - t.feld.material.opacity) * Math.min(1, dt * 8);
      t.feld.visible = t.feld.material.opacity > 0.01;
    }

    if (fest) festeKamera();
    else if (ich) {
      const laeuft = ich.sitz || ich.starrArt ? 0 : Math.min(1, ich.figur.tempo / LAUFTEMPO);
      verfolgung.setze(kamera, { x: ich.x, y: ich.y * mass, z: ich.z, richtung: ich.richtung, laeuft }, dt);
    } else {
      verfolgung.setze(kamera, { x: 0, y: 0, z: z1 - 2, richtung: Math.PI, laeuft: 0 }, dt);
    }
    buehne.zeichne();
  }

  buehne.passeGroesseAn();
  if (fest) festeKamera();

  return {
    bild,
    setzeFiguren,
    setzeIch,
    /** Joystick (rechts, vorn) → Schritt in Bühnen-Pixeln je Sekunde, aus Sicht der Kamera. */
    eingabeZuBuehne(rechts, vorn) {
      const sin = Math.sin(blick.gier);
      const cos = Math.cos(blick.gier);
      const wx = sin * vorn - cos * rechts;
      const wz = cos * vorn + sin * rechts;
      return [(wx * LAUFTEMPO) / SX, (wz * LAUFTEMPO) / SZ];
    },
    dreheKamera: verfolgung.drehe,
    /** Tisch hervorheben, an dem die eigene Figur steht (oder null). */
    nah(nr) {
      for (const t of tische) t.nah = t.nr === nr;
    },
    /** Zähler auf dem Schild eines Tisches, zum Beispiel 2/4. */
    zaehler(nr, belegt, plaetze) {
      const t = tische[nr - 1];
      if (!t || t.belegt === belegt) return;
      t.belegt = belegt;
      schreibeSchild(t.schild, [String(t.nr), `${belegt}/${plaetze}`], schildOptionen(t));
    },
    setzeFenster,
    /** Tisch aufleuchten lassen (beim Auflösen). „bleibt“: Danach leuchtet das Feld schwach weiter. */
    leuchte(nr, bleibt = false) {
      const t = tische[nr - 1];
      if (!t) return;
      t.leuchtet = 1.6;
      t.dauerlicht = bleibt ? 0.16 : 0;
    },
    /** Alle Leuchtfelder wieder aus. */
    lichtAus() {
      for (const t of tische) { t.leuchtet = 0; t.dauerlicht = 0; }
    },
    /** Kurzer Jubelsprung auf der Stelle (beim Auflösen). */
    jubel(fid) {
      const e = figuren.get(fid);
      if (e && !e.huepf) e.huepf = { t: 0, dauer: 0.55, vonX: e.x, vonZ: e.z, zuX: e.x, zuZ: e.z, jubel: true };
    },
    /**
     * Ort im Bild für Anzeigen über der Szene: Bühnen-Pixel (und Höhe in Metern) → [x, y] als Anteil
     * der Bildbreite und Bildhöhe (0 bis 1, y von oben). Gedacht für die feste Kamera.
     */
    aufBild(x, y, hoehe = 0) {
      const [wx, wz] = zuWelt(x, y);
      V.set(wx, hoehe, wz).project(kamera);
      return [V.x * 0.5 + 0.5, 0.5 - V.y * 0.5];
    },
    blick,
    buehne,
    mass,
    /** Für Tests: Ort einer Figur in der Welt und der Text auf ihrem Schild. */
    ortVon(fid) {
      const e = figuren.get(fid);
      return e ? { x: e.x, z: e.z, y: e.y, richtung: e.richtung, sitzt: !!e.sitz, huepft: !!e.huepf, starr: e.starrArt, schild: e.daten.vorname ?? e.daten.name } : null;
    },
    anzahl: () => figuren.size,
    kennungen: () => [...figuren.keys()],
    zerlegen() {
      buehne.zerlegen();
    },
  };
}
