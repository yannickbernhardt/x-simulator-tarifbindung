/*
 * welt3d – Formen
 * Werkzeug für alle Modelle: Sie entstehen im Code aus Grundformen (Quader, Zylinder, Kegel,
 * Kugeln mit wenigen Flächen). Keine fremden 3D-Modelle, Texturen, Fotos oder Logos.
 * Kantig und flach schattiert: jede Fläche hat ihre eigene Farbe.
 */

import * as THREE from './drei.js';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const HOCH = new THREE.Vector3(0, 1, 0);
const FARBE = new THREE.Color();

/** Hellt eine Farbe auf (t > 0) oder dunkelt sie ab (t < 0). Liefert eine neue THREE.Color. */
export function toene(farbe, t) {
  const c = new THREE.Color(farbe);
  if (t >= 0) c.lerp(FARBE.set('#ffffff'), t);
  else c.lerp(FARBE.set('#000000'), -t);
  return c;
}

/**
 * Lage für eine Instanz: Ort, Drehung um die Hochachse, Größe.
 * Liefert immer dieselbe Matrix, also sofort verwenden (setMatrixAt kopiert sie).
 */
export function lage(x, y, z, winkel, sx, sy, sz) {
  Q.setFromAxisAngle(HOCH, winkel);
  return M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
}

/**
 * Ein Teil: Grundform an ihren Platz bringen, in flache Dreiecke zerlegen und einfärben.
 * ort: { x, y, z, rx, ry, rz, sx, sy, sz }
 */
export function teil(geometrie, farbe, ort = {}) {
  const g = geometrie.index ? geometrie.toNonIndexed() : geometrie.clone();
  E.set(ort.rx ?? 0, ort.ry ?? 0, ort.rz ?? 0);
  Q.setFromEuler(E);
  M.compose(P.set(ort.x ?? 0, ort.y ?? 0, ort.z ?? 0), Q, S.set(ort.sx ?? 1, ort.sy ?? 1, ort.sz ?? 1));
  g.applyMatrix4(M);
  g.computeVertexNormals();
  const c = farbe.isColor ? farbe : FARBE.set(farbe);
  const n = g.attributes.position.count;
  const farben = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    farben[3 * i] = c.r;
    farben[3 * i + 1] = c.g;
    farben[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  geometrie.dispose();
  return g;
}

/** Mehrere Teile zu einer Geometrie verbinden (ein Zeichenaufruf statt vieler). */
export function verbinde(teile) {
  let n = 0;
  for (const t of teile) n += t.attributes.position.count;
  const ort = new Float32Array(n * 3);
  const normale = new Float32Array(n * 3);
  const farbe = new Float32Array(n * 3);
  let o = 0;
  for (const t of teile) {
    ort.set(t.attributes.position.array, o);
    normale.set(t.attributes.normal.array, o);
    farbe.set(t.attributes.color.array, o);
    o += t.attributes.position.count * 3;
    t.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(ort, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normale, 3));
  g.setAttribute('color', new THREE.BufferAttribute(farbe, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Sammler für flache Flächen am Boden (Wiese, Pflaster, Straßen, Linien).
 * Jedes Viereck liegt in der Höhe y und zeigt nach oben.
 */
export function bodenSammler() {
  const ort = [];
  const farbe = [];
  const dreieck = (ax, az, bx, bz, cx, cz, y, c) => {
    // Umlaufsinn so wählen, dass die Fläche nach oben zeigt
    const oben = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (oben >= 0) ort.push(ax, y, az, bx, y, bz, cx, y, cz);
    else ort.push(ax, y, az, cx, y, cz, bx, y, bz);
    for (let i = 0; i < 3; i++) farbe.push(c.r, c.g, c.b);
  };
  return {
    viereck(ax, az, bx, bz, cx, cz, dx, dz, y, c) {
      dreieck(ax, az, bx, bz, cx, cz, y, c);
      dreieck(ax, az, cx, cz, dx, dz, y, c);
    },
    /** Stück eines Rings zwischen zwei Radien und zwei Winkeln (Winkel w zeigt nach (sin w, cos w)). */
    ringstueck(r1, r2, w1, w2, y, c) {
      const s1 = Math.sin(w1);
      const c1 = Math.cos(w1);
      const s2 = Math.sin(w2);
      const c2 = Math.cos(w2);
      if (r1 < 1e-6) dreieck(0, 0, s1 * r2, c1 * r2, s2 * r2, c2 * r2, y, c);
      else this.viereck(s1 * r1, c1 * r1, s1 * r2, c1 * r2, s2 * r2, c2 * r2, s2 * r1, c2 * r1, y, c);
    },
    /** Gedrehtes Rechteck um (x, z): halbe Breite hw, halbe Tiefe hd, Winkel w zeigt nach (sin w, cos w). */
    rechteck(x, z, hw, hd, winkel, y, c) {
      const co = Math.cos(winkel);
      const si = Math.sin(winkel);
      const ecke = (lx, lz) => [x + lx * co + lz * si, z - lx * si + lz * co];
      const [ax, az] = ecke(-hw, -hd);
      const [bx, bz] = ecke(hw, -hd);
      const [cx, cz] = ecke(hw, hd);
      const [dx, dz] = ecke(-hw, hd);
      this.viereck(ax, az, bx, bz, cx, cz, dx, dz, y, c);
    },
    /** Scheibe oder Ring um (x, z). */
    scheibe(x, z, r1, r2, y, c, ecken = 24) {
      for (let i = 0; i < ecken; i++) {
        const w1 = (i / ecken) * 2 * Math.PI;
        const w2 = ((i + 1) / ecken) * 2 * Math.PI;
        const s1 = Math.sin(w1);
        const c1 = Math.cos(w1);
        const s2 = Math.sin(w2);
        const c2 = Math.cos(w2);
        if (r1 < 1e-6) dreieck(x, z, x + s1 * r2, z + c1 * r2, x + s2 * r2, z + c2 * r2, y, c);
        else this.viereck(x + s1 * r1, z + c1 * r1, x + s1 * r2, z + c1 * r2, x + s2 * r2, z + c2 * r2, x + s2 * r1, z + c2 * r1, y, c);
      }
    },
    geometrie() {
      const g = new THREE.BufferGeometry();
      const n = ort.length / 3;
      const normale = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) normale[3 * i + 1] = 1;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ort), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normale, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(farbe), 3));
      g.computeBoundingSphere();
      return g;
    },
  };
}

/** Dreiecksprisma: Satteldach mit dem First entlang x. Einheitsgröße 1 × 1 × 1, Unterkante bei y = 0. */
export function dachGeometrie() {
  const g = new THREE.BufferGeometry();
  const a = [-0.5, 0, -0.5];
  const b = [0.5, 0, -0.5];
  const c = [0.5, 0, 0.5];
  const d = [-0.5, 0, 0.5];
  const e = [-0.5, 1, 0];
  const f = [0.5, 1, 0];
  const flaechen = [
    d, c, f, d, f, e, // vordere Dachfläche
    b, a, e, b, e, f, // hintere Dachfläche
    a, d, e, // Giebel links
    c, b, f, // Giebel rechts
  ];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flaechen.flat()), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Sheddach (Sägezahn): „zaehne“ Zähne nebeneinander entlang x, jeder mit einer steilen und einer flachen Seite.
 * Breite 1 (x), Tiefe 1 (z), Höhe 1, Unterkante bei y = 0.
 */
export function sheddachGeometrie(zaehne) {
  const ort = [];
  const breite = 1 / zaehne;
  for (let i = 0; i < zaehne; i++) {
    const x0 = -0.5 + i * breite;
    const x1 = x0 + breite;
    const a = [x0, 0, -0.5];
    const b = [x1, 0, -0.5];
    const c = [x1, 0, 0.5];
    const d = [x0, 0, 0.5];
    const e = [x0, 1, -0.5];
    const f = [x0, 1, 0.5];
    ort.push(
      ...f, ...c, ...b, ...f, ...b, ...e, // flache Dachfläche
      ...a, ...d, ...f, ...a, ...f, ...e, // steile Seite (Fensterband)
      ...d, ...c, ...f, // Stirnseite vorn
      ...b, ...a, ...e, // Stirnseite hinten
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ort), 3));
  g.computeVertexNormals();
  return g;
}

// ====================================================================
// Weiche dunkle Flecken am Boden (keine echten Schatten)
// ====================================================================

/** Flache Einheitsfläche am Boden, 1 × 1, zeigt nach oben. */
export function flachGeometrie() {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

/** Stoff für einen Fleck am Boden: liegt knapp über dem Boden, schreibt nicht in die Tiefe. */
export function fleckStoff(textur) {
  return new THREE.MeshBasicMaterial({
    map: textur, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/** Runder, weicher dunkler Fleck (unter Figuren und Bäumen). */
export function fleckTextur() {
  const leinwand = document.createElement('canvas');
  leinwand.width = leinwand.height = 64;
  const stift = leinwand.getContext('2d');
  const verlauf = stift.createRadialGradient(32, 32, 2, 32, 32, 31);
  verlauf.addColorStop(0, 'rgba(20, 32, 28, 0.55)');
  verlauf.addColorStop(0.55, 'rgba(20, 32, 28, 0.32)');
  verlauf.addColorStop(1, 'rgba(20, 32, 28, 0)');
  stift.fillStyle = verlauf;
  stift.fillRect(0, 0, 64, 64);
  const textur = new THREE.CanvasTexture(leinwand);
  textur.colorSpace = THREE.SRGBColorSpace;
  return textur;
}

/** Eckiger, weicher dunkler Fleck (unter Häusern und Hallen). */
export function schattenTextur() {
  const leinwand = document.createElement('canvas');
  leinwand.width = leinwand.height = 64;
  const stift = leinwand.getContext('2d');
  stift.filter = 'blur(5px)';
  stift.fillStyle = 'rgba(20, 32, 28, 0.5)';
  stift.fillRect(10, 10, 44, 44);
  const bild = stift.getImageData(0, 0, 64, 64);
  // Falls der Browser „filter“ nicht kennt, ist die Fläche hart: dann selbst weichzeichnen
  if (bild.data[4 * (10 * 64 + 10) + 3] > 120) {
    stift.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 9; i++) {
      stift.fillStyle = `rgba(20, 32, 28, ${0.07})`;
      stift.fillRect(4 + i, 4 + i, 56 - 2 * i, 56 - 2 * i);
    }
  }
  const textur = new THREE.CanvasTexture(leinwand);
  textur.colorSpace = THREE.SRGBColorSpace;
  return textur;
}
