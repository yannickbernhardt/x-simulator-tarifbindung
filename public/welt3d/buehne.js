/*
 * welt3d – Bühne
 * Renderer, Szene, Kamera und die Sorge um schwache Handys:
 *   - Pixeldichte höchstens 1,5
 *   - keine echten Schatten
 *   - Nebel in der Ferne
 *   - fällt die Bildrate drei Sekunden unter 25, schaltet die Bühne eine Qualitätsstufe herunter
 */

import * as THREE from './drei.js';
import { HIMMEL } from './himmel.js';

// Stufen für die Bildqualität. Die Bühne setzt die Pixeldichte, den Rest regelt das Spiel in „beiStufe“.
export const STUFEN = [
  { pixel: 0.75, wolken: false, randAnteil: 0.4 },
  { pixel: 1.0, wolken: false, randAnteil: 0.6 },
  { pixel: 1.25, wolken: true, randAnteil: 1 },
  { pixel: 1.5, wolken: true, randAnteil: 1 },
];

/** Kann dieser Browser die 3D-Ansicht zeigen? */
export function kannDrei() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * optionen:
 *   stufen        Qualitätsstufen (Standard: STUFEN)
 *   festeStufe    wenn gesetzt, schaltet die Bühne nie selbst herunter
 *   beiStufe(s)   wird bei jedem Stufenwechsel aufgerufen (Wolken an oder aus, weniger Bäume …)
 *   nebel         { farbe, nah, fern }
 *   blickwinkel   Funktion: Seitenverhältnis → Blickwinkel der Kamera in Grad
 *   durchsichtig  true: Die Leinwand kann stellenweise durchsichtig sein (für Fenster auf die Seite darunter)
 */
export function erzeugeBuehne(leinwand, optionen = {}) {
  const {
    stufen = STUFEN,
    festeStufe,
    beiStufe = () => {},
    nebel = { farbe: HIMMEL.unten, nah: 80, fern: 460 },
    blickwinkel = (verhaeltnis) => (verhaeltnis < 1.2 ? 68 : 58),
    durchsichtig = false,
  } = optionen;

  const dichte = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({
    canvas: leinwand,
    antialias: dichte < 2, // auf dichten Handy-Bildschirmen reicht die Auflösung
    powerPreference: 'high-performance',
    alpha: durchsichtig,
    stencil: false,
  });
  renderer.setClearColor(nebel.farbe);

  const szene = new THREE.Scene();
  szene.fog = new THREE.Fog(nebel.farbe, nebel.nah, nebel.fern);
  const kamera = new THREE.PerspectiveCamera(58, 1, 0.6, 1600);

  let stufe = stufen.length - 1;
  let breite = 0;
  let hoehe = 0;

  function setzeStufe(neu) {
    stufe = Math.max(0, Math.min(stufen.length - 1, neu));
    const s = stufen[stufe];
    renderer.setPixelRatio(Math.min(dichte, s.pixel));
    renderer.setSize(breite, hoehe, false);
    beiStufe(s);
  }

  function passeGroesseAn() {
    const b = leinwand.clientWidth || window.innerWidth;
    const h = leinwand.clientHeight || window.innerHeight;
    if (b === breite && h === hoehe) return;
    breite = b;
    hoehe = h;
    kamera.aspect = b / h;
    // im schmalen Fenster etwas mehr Blickwinkel, damit die Figur nicht den Blick verstellt
    kamera.fov = blickwinkel(b / h);
    kamera.updateProjectionMatrix();
    setzeStufe(stufe);
  }

  // Bildrate beobachten: drei Sekunden unter 25 Bildern → eine Stufe herunter
  const takt = { bilder: 0, zeit: 0, schwach: 0, fps: 60, schonfrist: 3 };
  function beobachte(dt) {
    if (takt.schonfrist > 0) {
      takt.schonfrist -= dt; // nach dem Start und nach jedem Umschalten kurz abwarten
      return;
    }
    takt.bilder++;
    takt.zeit += dt;
    if (takt.zeit < 1) return;
    takt.fps = takt.bilder / takt.zeit;
    takt.bilder = 0;
    takt.zeit = 0;
    takt.schwach = takt.fps < 25 ? takt.schwach + 1 : 0;
    if (takt.schwach >= 3 && stufe > 0 && festeStufe === undefined) {
      setzeStufe(stufe - 1);
      takt.schwach = 0;
      takt.schonfrist = 2;
    }
  }

  return {
    renderer,
    szene,
    kamera,
    dichte,
    setzeStufe,
    passeGroesseAn,
    beobachte,
    zeichne: () => renderer.render(szene, kamera),
    stufe: () => stufe,
    fps: () => takt.fps,
    zeichenaufrufe: () => renderer.info.render.calls,
    dreiecke: () => renderer.info.render.triangles,
    /** Gibt den Grafikspeicher frei, wenn die Ansicht geschlossen wird. */
    zerlegen() {
      szene.traverse((o) => {
        o.geometry?.dispose?.();
        const stoffe = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const s of stoffe) {
          s.map?.dispose?.();
          s.dispose?.();
        }
      });
      renderer.dispose();
      // den Grafikkontext sofort zurückgeben: Browser erlauben nur wenige gleichzeitig
      renderer.forceContextLoss();
    },
  };
}
