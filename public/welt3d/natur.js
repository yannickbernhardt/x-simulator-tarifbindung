/*
 * welt3d – Bäume
 * Laubbäume (Kugelkrone mit wenigen Flächen) und Nadelbäume (drei gestapelte Kegel) als InstancedMesh:
 * alle Stämme ein Zeichenaufruf, alle Laubkronen einer, alle Nadelkronen einer.
 * Bäume dicht vor der Kamera lösen sich auf (siehe durchblick.js).
 */

import * as THREE from './drei.js';
import { teil, verbinde, lage, toene } from './formen.js';
import { durchblick } from './durchblick.js';

export const NATUR = {
  stammholz: '#8a6243',
  laub: ['#4f9d58', '#5fae5c', '#3f8a4c'],
  nadel: ['#2f7a55', '#37855a', '#2a6a4b'],
};

const M = new THREE.Matrix4();
const FARBE = new THREE.Color();

export function stammGeometrie() {
  return teil(new THREE.CylinderGeometry(0.2, 0.32, 1, 6), '#ffffff', { y: 0.5 });
}

/** Laubkrone: Kugel mit wenigen Flächen, Radius 1. */
export function laubGeometrie() {
  return teil(new THREE.IcosahedronGeometry(1, 0), '#ffffff');
}

/** Nadelkrone: drei gestapelte Kegel. Radius 1, Höhe 2,3, Unterkante bei y = 0. */
export function nadelGeometrie() {
  return verbinde([
    teil(new THREE.ConeGeometry(1, 1.15, 7), '#ffffff', { y: 0.575 }),
    teil(new THREE.ConeGeometry(0.78, 1.0, 7), '#ffffff', { y: 1.2 }),
    teil(new THREE.ConeGeometry(0.52, 0.9, 7), '#ffffff', { y: 1.85 }),
  ]);
}

/**
 * Baut alle Bäume. Jeder Baum: { x, z, hoehe, krone, art: 'laub' | 'nadel', ton: 0..2, dunkel? }.
 * Liefert die drei Netze und je Baum die Nummern seiner Instanzen (für „entferneBaum“).
 */
export function baueBaeume(alle, zw, farben = NATUR) {
  const laubZahl = alle.filter((b) => b.art === 'laub').length;
  const stoffStamm = durchblick(new THREE.MeshLambertMaterial({ color: farben.stammholz }));
  const stoffKrone = durchblick(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  const stammNetz = new THREE.InstancedMesh(stammGeometrie(), stoffStamm, alle.length);
  const laubNetz = new THREE.InstancedMesh(laubGeometrie(), stoffKrone, Math.max(1, laubZahl * 2));
  const nadelNetz = new THREE.InstancedMesh(nadelGeometrie(), stoffKrone, Math.max(1, alle.length - laubZahl));
  laubNetz.count = laubZahl * 2;
  nadelNetz.count = alle.length - laubZahl;
  const eintraege = [];
  let l = 0;
  let nd = 0;
  alle.forEach((b, i) => {
    const dreh = zw(0, 6.28);
    const eintrag = { stamm: i, laub: -1, nadel: -1 };
    if (b.art === 'laub') {
      const stammHoehe = b.hoehe * 0.42;
      stammNetz.setMatrixAt(i, lage(b.x, 0, b.z, dreh, 1, stammHoehe, 1));
      eintrag.laub = l;
      laubNetz.setMatrixAt(l, lage(b.x, stammHoehe + b.krone * 0.72, b.z, dreh, b.krone, b.krone * 1.02, b.krone));
      laubNetz.setColorAt(l++, FARBE.set(farben.laub[b.ton]));
      const seite = zw(0, 6.28);
      laubNetz.setMatrixAt(l, lage(b.x + Math.sin(seite) * b.krone * 0.55, stammHoehe + b.krone * 1.38, b.z + Math.cos(seite) * b.krone * 0.55,
        dreh + 1, b.krone * 0.62, b.krone * 0.6, b.krone * 0.62));
      laubNetz.setColorAt(l++, toene(farben.laub[b.ton], 0.08));
    } else {
      const stammHoehe = b.hoehe * 0.18;
      stammNetz.setMatrixAt(i, lage(b.x, 0, b.z, dreh, 1.1, stammHoehe, 1.1));
      eintrag.nadel = nd;
      nadelNetz.setMatrixAt(nd, lage(b.x, stammHoehe, b.z, dreh, b.krone, (b.hoehe - stammHoehe) / 2.3, b.krone));
      nadelNetz.setColorAt(nd++, b.dunkel ? toene(farben.nadel[b.ton], -0.12) : FARBE.set(farben.nadel[b.ton]));
    }
    eintraege.push(eintrag);
  });
  for (const netz of [stammNetz, laubNetz, nadelNetz]) netz.frustumCulled = false;
  return { stammNetz, laubNetz, nadelNetz, eintraege };
}

/** Lässt einen Baum verschwinden (zum Beispiel, wenn dort gebaut wird). */
export function entferneBaum(baeume, eintrag) {
  const nichts = M.makeScale(0, 0, 0);
  baeume.stammNetz.setMatrixAt(eintrag.stamm, nichts);
  if (eintrag.laub >= 0) {
    baeume.laubNetz.setMatrixAt(eintrag.laub, nichts);
    baeume.laubNetz.setMatrixAt(eintrag.laub + 1, nichts);
  }
  if (eintrag.nadel >= 0) baeume.nadelNetz.setMatrixAt(eintrag.nadel, nichts);
  baeume.stammNetz.instanceMatrix.needsUpdate = true;
  baeume.laubNetz.instanceMatrix.needsUpdate = true;
  baeume.nadelNetz.instanceMatrix.needsUpdate = true;
}
