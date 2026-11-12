/*
 * welt3d – Häuser
 * Schlichte Häuser mit Satteldach als InstancedMesh (alle Wände ein Zeichenaufruf, alle Dächer einer).
 * Türen, Fenster und Schornsteine kommen als Teile dazu und werden mit anderem Schmuck verbunden.
 *
 * Ein Haus: { x, z, hw, hd, winkel, cos, sin, hoehe, dachHoehe, wand: 0..2, dach: 0..2 }
 * hw und hd sind die halbe Breite und die halbe Tiefe, der Winkel w zeigt nach (sin w, cos w),
 * dort ist die Vorderseite mit der Tür.
 */

import * as THREE from './drei.js';
import { teil, lage, dachGeometrie } from './formen.js';

export const BAUTEN = {
  wand: ['#f6efe0', '#f1dcc4', '#dfe9ec'],
  dach: ['#c8553d', '#3f8f8c', '#566575'],
};

const FARBE = new THREE.Color();

/** Wände und Dächer aller Häuser. „stoff“ ist ein Lambert-Stoff mit Eckenfarben. */
export function baueHaeuser(haeuser, stoff, farben = BAUTEN) {
  const n = haeuser.length;
  const wand = new THREE.InstancedMesh(teil(new THREE.BoxGeometry(1, 1, 1), '#ffffff', { y: 0.5 }), stoff, n);
  const dach = new THREE.InstancedMesh(teil(dachGeometrie(), '#ffffff'), stoff, n);
  haeuser.forEach((h, i) => {
    wand.setMatrixAt(i, lage(h.x, 0, h.z, h.winkel, 2 * h.hw, h.hoehe, 2 * h.hd));
    wand.setColorAt(i, FARBE.set(farben.wand[h.wand]));
    dach.setMatrixAt(i, lage(h.x, h.hoehe, h.z, h.winkel, 2 * h.hw + 0.8, h.dachHoehe, 2 * h.hd + 0.8));
    dach.setColorAt(i, FARBE.set(farben.dach[h.dach]));
  });
  wand.frustumCulled = false;
  dach.frustumCulled = false;
  return { wand, dach };
}

/** Türen, Fenster und Schornsteine der Häuser, als Teile zum Verbinden. */
export function hausTeile(haeuser) {
  const teile = [];
  for (const h of haeuser) {
    const ort = (lx, lz) => [h.x + lx * h.cos + lz * h.sin, h.z - lx * h.sin + lz * h.cos];
    const [tx, tz] = ort(-h.hw * 0.35, h.hd + 0.03);
    teile.push(teil(new THREE.BoxGeometry(1.0, 2.0, 0.12), '#6b4a35', { x: tx, y: 1.0, z: tz, ry: h.winkel }));
    for (const [lx, lz, quer] of [[h.hw * 0.4, h.hd + 0.03, 0], [-h.hw * 0.5, -h.hd - 0.03, 0], [h.hw * 0.5, -h.hd - 0.03, 0], [h.hw + 0.03, 0, 1], [-h.hw - 0.03, 0, 1]]) {
      const [x, z] = ort(lx, lz);
      teile.push(teil(new THREE.BoxGeometry(1.0, 0.95, 0.1), '#bfe3f0', { x, y: 1.75, z, ry: h.winkel + (quer ? Math.PI / 2 : 0) }));
    }
    const [sx, sz] = ort(h.hw * 0.5, -h.hd * 0.3);
    teile.push(teil(new THREE.BoxGeometry(0.55, 1.3, 0.55), '#a8553f', { x: sx, y: h.hoehe + h.dachHoehe * 0.75, z: sz, ry: h.winkel }));
  }
  return teile;
}
