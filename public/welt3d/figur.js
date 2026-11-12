/*
 * welt3d – Figur
 * Schlichte Figur aus Grundformen: Rumpf mit Kopf, zwei Arme, zwei Beine. Sie schaut nach +z und ist
 * etwa 1,8 m groß. Jedes Spiel setzt seinen Rumpf selbst zusammen (Mütze, Rucksack, Hut, Gesicht …)
 * und gibt ihn als eine verbundene Geometrie hinein. So bleibt es bei fünf Zeichenaufrufen je Figur.
 *
 * Haltungen: stehen und laufen (nach Tempo), springen (nach Höhe), sitzen, jubeln.
 */

import * as THREE from './drei.js';
import { teil, verbinde } from './formen.js';

export const FIGUR = {
  haut: '#f1dcc2',
  hose: '#2f3b47',
  schuh: '#1f262d',
  hueftHoehe: 0.82, // hier hängen die Beine
  schulterHoehe: 1.4, // hier hängen die Arme
  schulterBreite: 0.36,
  sitzTiefe: 0.36, // so weit sinkt der Körper beim Sitzen (Sitzfläche bei 0,46 m)
};

/** Ein Stoff für alle Figuren: Die Farben stecken in den Ecken der Geometrie. */
export const stoffFigur = new THREE.MeshLambertMaterial({ vertexColors: true });

const beinFormen = new Map();
const alsText = (farbe) => (farbe.isColor ? farbe.getHexString() : String(farbe));

/** Bein mit Schuh. Es hängt an seinem oberen Ende, damit es um die Hüfte schwingt. */
export function beinForm(hose = FIGUR.hose, schuh = FIGUR.schuh) {
  const schluessel = `${alsText(hose)}|${alsText(schuh)}`;
  if (!beinFormen.has(schluessel)) {
    beinFormen.set(schluessel, verbinde([
      teil(new THREE.BoxGeometry(0.2, 0.76, 0.24), hose, { y: -0.38 }),
      teil(new THREE.BoxGeometry(0.22, 0.12, 0.34), schuh, { y: -0.76, z: 0.05 }),
    ]));
  }
  return beinFormen.get(schluessel);
}

/** Arm mit Hand. Er hängt an der Schulter. */
export function armForm(farbe, haut = FIGUR.haut) {
  return verbinde([
    teil(new THREE.BoxGeometry(0.15, 0.56, 0.17), farbe, { y: -0.28 }),
    teil(new THREE.BoxGeometry(0.14, 0.13, 0.15), haut, { y: -0.6 }),
  ]);
}

/** Rumpf als Quader in der Farbe der Jacke. */
export function rumpfTeil(farbe) {
  return teil(new THREE.BoxGeometry(0.56, 0.64, 0.34), farbe, { y: 1.12 });
}

/** Kopf: Kugel mit wenigen Flächen. */
export function kopfTeil(haut = FIGUR.haut, radius = 0.21, y = 1.64) {
  return teil(new THREE.IcosahedronGeometry(radius, 1), haut, { y });
}

/**
 * Baut eine Figur aus drei Geometrien: rumpf (alles, was sich nicht einzeln bewegt), arm, bein.
 * armRechts ist nur nötig, wenn die rechte Hand etwas hält (dann steckt es in dieser Geometrie).
 * Liefert die Gruppe und die beweglichen Teile.
 */
export function baueFigur({ rumpf, arm, armRechts = arm, bein = beinForm() }) {
  const gruppe = new THREE.Group();
  const koerper = new THREE.Group(); // wippt beim Laufen, neigt sich nach vorn
  gruppe.add(koerper);

  const rumpfNetz = new THREE.Mesh(rumpf, stoffFigur);
  koerper.add(rumpfNetz);

  const glied = (form, x, y) => {
    const netz = new THREE.Mesh(form, stoffFigur);
    netz.position.set(x, y, 0);
    koerper.add(netz);
    return netz;
  };
  const beinL = glied(bein, -0.14, FIGUR.hueftHoehe);
  const beinR = glied(bein, 0.14, FIGUR.hueftHoehe);
  const armL = glied(arm, -FIGUR.schulterBreite, FIGUR.schulterHoehe);
  const armR = glied(armRechts, FIGUR.schulterBreite, FIGUR.schulterHoehe);

  return { gruppe, koerper, rumpf: rumpfNetz, beinL, beinR, armL, armR, phase: 0, tempo: 0 };
}

/**
 * Bewegt Arme und Beine.
 * tempo in m/s, hoehe = Sprunghöhe in m, dt in Sekunden, laufTempo = volles Lauftempo des Spiels.
 * haltung: nichts (stehen, laufen, springen), 'sitzt' oder 'jubelt'.
 */
export function bewegeFigur(figur, tempo, hoehe, dt, laufTempo, haltung) {
  // weich an das Tempo anpassen, damit Anlaufen und Abbremsen nicht ruckeln
  figur.tempo += (tempo - figur.tempo) * Math.min(1, dt * 12);
  const anteil = Math.min(1.2, figur.tempo / laufTempo);
  figur.phase += dt * (3 + figur.tempo * 1.25);
  const schwung = Math.sin(figur.phase) * 0.95 * anteil;
  const inDerLuft = hoehe > 0.02;
  if (haltung === 'sitzt') {
    // Beine nach vorn, Hände auf dem Tisch, ruhiges Atmen
    figur.beinL.rotation.x = -1.5;
    figur.beinR.rotation.x = -1.5;
    figur.armL.rotation.x = -0.95;
    figur.armR.rotation.x = -0.95;
    figur.koerper.position.y = -FIGUR.sitzTiefe + Math.sin(figur.phase * 0.5) * 0.008;
    figur.koerper.rotation.x = 0.05;
  } else if (haltung === 'jubelt') {
    // Arme hoch, Beine leicht angezogen
    const wink = Math.sin(figur.phase * 4) * 0.25;
    figur.beinL.rotation.x = -0.35;
    figur.beinR.rotation.x = 0.25;
    figur.armL.rotation.x = -2.9 + wink;
    figur.armR.rotation.x = -2.9 - wink;
    figur.koerper.position.y = 0;
    figur.koerper.rotation.x = -0.06;
  } else if (inDerLuft) {
    figur.beinL.rotation.x = -0.5;
    figur.beinR.rotation.x = 0.35;
    figur.armL.rotation.x = -2.2;
    figur.armR.rotation.x = -2.2;
    figur.koerper.position.y = 0;
    figur.koerper.rotation.x = 0.1;
  } else {
    figur.beinL.rotation.x = schwung;
    figur.beinR.rotation.x = -schwung;
    figur.armL.rotation.x = -schwung * 0.8;
    figur.armR.rotation.x = schwung * 0.8;
    // leichtes Wippen und Vorneigen beim Laufen, ruhiges Atmen im Stand
    figur.koerper.position.y = Math.abs(Math.cos(figur.phase)) * 0.07 * anteil
      + (anteil < 0.1 ? Math.sin(figur.phase * 0.5) * 0.008 : 0);
    figur.koerper.rotation.x = 0.16 * anteil;
  }
  return anteil;
}
