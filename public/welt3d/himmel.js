/*
 * welt3d – Himmel, Licht, Wolken, Hügel
 * Die freundliche, klare Stimmung der Welt: heller Himmel mit Verlauf, Sonne ohne echte Schatten,
 * ein paar kantige Wolken und Hügel in der Ferne.
 * „zw(von, bis)“ ist der Zufall des Spiels für das Aussehen (mit Startwert, damit alles wiederholbar ist).
 */

import * as THREE from './drei.js';
import { teil, lage } from './formen.js';

export const HIMMEL = {
  oben: '#5aa9e6',
  unten: '#dff0f2', // auch Farbe des Nebels
  huegel: ['#86ad8f', '#7aa387', '#93b79a'],
};

/** Himmelskuppel mit Farbverlauf vom Horizont nach oben. */
export function baueHimmel(farben = HIMMEL) {
  const farbe = new THREE.Color();
  const g = new THREE.SphereGeometry(1200, 20, 12).toNonIndexed();
  const oben = new THREE.Color(farben.oben);
  const unten = new THREE.Color(farben.unten);
  const ort = g.attributes.position;
  const farbfeld = new Float32Array(ort.count * 3);
  for (let i = 0; i < ort.count; i++) {
    const t = Math.pow(Math.max(0, Math.min(1, ort.getY(i) / 700)), 0.55);
    farbe.copy(unten).lerp(oben, t);
    farbfeld[3 * i] = farbe.r;
    farbfeld[3 * i + 1] = farbe.g;
    farbfeld[3 * i + 2] = farbe.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(farbfeld, 3));
  const himmel = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  himmel.renderOrder = -10;
  himmel.frustumCulled = false;
  return himmel;
}

/** Licht vom Himmel und von der Sonne. Keine echten Schatten. */
export function baueLicht() {
  const sonne = new THREE.DirectionalLight('#fff2d9', 2.3);
  sonne.position.set(-0.5, 1, 0.42);
  return [new THREE.HemisphereLight('#eef7ff', '#a9bd92', 2.0), sonne];
}

/** Kantige Wolken, je drei Ballen. Die Gruppe kann sich langsam drehen. */
export function baueWolken(zw, anzahl = 16) {
  const wolken = new THREE.Group();
  const g = teil(new THREE.IcosahedronGeometry(1, 0), '#ffffff');
  const netz = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({
    color: '#ffffff', emissive: '#aeb9c2', emissiveIntensity: 0.55, fog: false,
  }), anzahl * 3);
  let n = 0;
  for (let i = 0; i < anzahl; i++) {
    const w = (i / anzahl) * 2 * Math.PI + zw(-0.15, 0.15);
    const rho = zw(140, 420);
    const hoehe = zw(75, 120);
    const gross = zw(11, 20);
    for (let k = 0; k < 3; k++) {
      netz.setMatrixAt(n++, lage(
        Math.sin(w) * rho + (k - 1) * gross * 0.95, hoehe + (k === 1 ? gross * 0.22 : 0), Math.cos(w) * rho + zw(-4, 4),
        zw(0, 6), gross * (k === 1 ? 1.25 : 0.9), gross * (k === 1 ? 0.62 : 0.45), gross * 0.8,
      ));
    }
  }
  netz.frustumCulled = false;
  wolken.add(netz);
  return wolken;
}

/** Hügel in der Ferne rund um die Welt, als Teile zum Verbinden. „innen“ ist der Radius der Welt. */
export function huegelTeile(zw, innen, farben = HIMMEL.huegel, anzahl = 26) {
  const teile = [];
  for (let i = 0; i < anzahl; i++) {
    const w = (i / anzahl) * 2 * Math.PI + zw(-0.08, 0.08);
    const rho = innen + zw(150, 300);
    const radius = zw(45, 85);
    const hoehe = zw(20, 52);
    teile.push(teil(new THREE.ConeGeometry(radius, hoehe, 5 + (i % 3)), farben[i % 3],
      { x: Math.sin(w) * rho, y: hoehe / 2 - 3, z: Math.cos(w) * rho, ry: zw(0, 3) }));
  }
  return teile;
}
