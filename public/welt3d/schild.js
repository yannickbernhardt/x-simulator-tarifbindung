/*
 * welt3d – Schilder
 * Beschriftungen, die immer zur Kamera schauen: Namensschild über einer Figur, Text- und Zahlenschilder.
 * Sie entstehen als Bild im Code (keine fremden Schriften, die Schrift des Geräts).
 */

import * as THREE from './drei.js';

const SCHRIFT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function rundesRechteck(stift, x, y, b, h, r) {
  stift.beginPath();
  stift.moveTo(x + r, y);
  stift.arcTo(x + b, y, x + b, y + h, r);
  stift.arcTo(x + b, y + h, x, y + h, r);
  stift.arcTo(x, y + h, x, y, r);
  stift.arcTo(x, y, x + b, y, r);
  stift.closePath();
}

function alsSchild(leinwand, massstab, stoff = {}) {
  const textur = new THREE.CanvasTexture(leinwand);
  textur.colorSpace = THREE.SRGBColorSpace;
  const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: textur, depthWrite: false, fog: false, ...stoff }));
  schild.scale.set(leinwand.width * massstab, leinwand.height * massstab, 1);
  return schild;
}

/** Namensschild über einer Figur: heller Streifen mit Farbpunkt und Name. */
export function namensSchild(name, farbe) {
  const leinwand = document.createElement('canvas');
  const hoehe = 64;
  const stift = leinwand.getContext('2d');
  const schrift = `600 34px ${SCHRIFT}`;
  stift.font = schrift;
  const breite = Math.ceil(stift.measureText(name).width) + 78;
  leinwand.width = breite;
  leinwand.height = hoehe;
  stift.font = schrift;
  stift.fillStyle = 'rgba(251, 248, 241, 0.94)';
  const r = 26;
  stift.beginPath();
  stift.moveTo(r + 4, 6);
  stift.arcTo(breite - 4, 6, breite - 4, hoehe - 6, r);
  stift.arcTo(breite - 4, hoehe - 6, 4, hoehe - 6, r);
  stift.arcTo(4, hoehe - 6, 4, 6, r);
  stift.arcTo(4, 6, breite - 4, 6, r);
  stift.closePath();
  stift.fill();
  stift.fillStyle = farbe;
  stift.beginPath();
  stift.arc(32, hoehe / 2, 12, 0, 2 * Math.PI);
  stift.fill();
  stift.fillStyle = '#1f2a33';
  stift.textBaseline = 'middle';
  stift.fillText(name, 54, hoehe / 2 + 2);
  return alsSchild(leinwand, 0.011);
}

/**
 * Textschild: abgerundete Fläche mit einer oder mehreren Zeilen.
 * zeilen: Text oder Liste von Texten.
 * optionen:
 *   hoehe          Höhe des ganzen Schilds in der Welt (Meter)
 *   groessen       Schriftgröße je Zeile im Verhältnis, zum Beispiel [1.5, 0.6]
 *   grund, schrift Farben
 *   punkt          Farbe eines Punkts vor der ersten Zeile (oder nichts)
 *   immerSichtbar  true: wird nicht von Bauten verdeckt
 */
export function textSchild(zeilen, optionen = {}) {
  const texte = Array.isArray(zeilen) ? zeilen : [zeilen];
  const {
    hoehe = 0.5, groessen = [], grund = 'rgba(251, 248, 241, 0.94)', schrift = '#1f2a33', punkt = null, immerSichtbar = false,
  } = optionen;
  const leinwand = document.createElement('canvas');
  const stift = leinwand.getContext('2d');
  const basis = 44; // Schriftgröße einer normalen Zeile in Pixeln
  const arten = texte.map((_, i) => `700 ${Math.round(basis * (groessen[i] ?? 1))}px ${SCHRIFT}`);
  const zeilenhoehen = texte.map((_, i) => Math.round(basis * (groessen[i] ?? 1) * 1.16));
  let breite = 0;
  texte.forEach((text, i) => {
    stift.font = arten[i];
    breite = Math.max(breite, stift.measureText(text).width);
  });
  const rand = 16;
  const punktBreite = punkt ? 34 : 0;
  leinwand.width = Math.ceil(breite) + 2 * rand + 12 + punktBreite;
  leinwand.height = zeilenhoehen.reduce((a, b) => a + b, 0) + 2 * rand - 6;
  rundesRechteck(stift, 2, 2, leinwand.width - 4, leinwand.height - 4, Math.min(26, leinwand.height / 2 - 2));
  stift.fillStyle = grund;
  stift.fill();
  stift.textAlign = 'center';
  stift.textBaseline = 'middle';
  let y = rand - 3;
  texte.forEach((text, i) => {
    stift.font = arten[i];
    stift.fillStyle = schrift;
    stift.fillText(text, (leinwand.width + punktBreite) / 2, y + zeilenhoehen[i] / 2 + 2);
    if (punkt && i === 0) {
      const halbe = stift.measureText(text).width / 2;
      stift.fillStyle = punkt;
      stift.beginPath();
      stift.arc((leinwand.width + punktBreite) / 2 - halbe - 20, y + zeilenhoehen[i] / 2, 11, 0, 2 * Math.PI);
      stift.fill();
    }
    y += zeilenhoehen[i];
  });
  const schild = alsSchild(leinwand, hoehe / leinwand.height, immerSichtbar ? { depthTest: false } : {});
  if (immerSichtbar) schild.renderOrder = 20;
  return schild;
}

/** Ersetzt den Text eines Textschilds (zum Beispiel einen Zähler), ohne ein neues Objekt anzulegen. */
export function schreibeSchild(schild, zeilen, optionen = {}) {
  const neu = textSchild(zeilen, optionen);
  schild.material.map.dispose();
  schild.material.map = neu.material.map;
  schild.material.needsUpdate = true;
  schild.scale.copy(neu.scale);
  neu.material.dispose();
}

/** Kleine Denkblase mit drei Punkten (zum Beispiel für „füllt noch etwas aus“). */
export function denkblase(hoehe = 0.55) {
  const leinwand = document.createElement('canvas');
  leinwand.width = 120;
  leinwand.height = 96;
  const stift = leinwand.getContext('2d');
  stift.fillStyle = '#ffffff';
  stift.strokeStyle = '#9fb4c4';
  stift.lineWidth = 4;
  stift.beginPath();
  stift.ellipse(66, 38, 48, 32, 0, 0, 2 * Math.PI);
  stift.fill();
  stift.stroke();
  for (const [x, y, r] of [[22, 78, 7], [10, 91, 4]]) {
    stift.beginPath();
    stift.arc(x, y, r, 0, 2 * Math.PI);
    stift.fill();
    stift.stroke();
  }
  stift.fillStyle = '#5c6f7e';
  for (const x of [46, 66, 86]) {
    stift.beginPath();
    stift.arc(x, 38, 6, 0, 2 * Math.PI);
    stift.fill();
  }
  return alsSchild(leinwand, hoehe / 96);
}
