/*
 * Herzblatt – gemeinsame Geometrie des Raums für Beamer und Handy.
 * Alle Angaben in Bühnen-Pixeln der 1600×900-Beamerbühne. Das Handy zeigt denselben Raum mit Kamera.
 * Eine Figur wird an ihren Füßen verortet (x = Mitte, fuss = Unterkante).
 */

export const H_FIG = 1.2545; // Höhe : Breite der Figur
export const RAUM = { x0: 30, y0: 106, breite: 1190, tischHoehe: 606, eingangOben: 724, eingangHoehe: 164 };
export const LAUF = { links: 50, rechts: 1200, oben: 175, unten: 882 }; // Grenzen für die Füße
export const TEMPO = 290; // Bühnen-Pixel pro Sekunde

/* Tische, Sitzplätze und Maße der Listen (die Listen zeigt nur der Beamer) */
export function berechneLayout(n, P) {
  const { x0: X0, y0: Y0, breite: W, tischHoehe: H } = RAUM, gap = 14;
  const cols = n <= 4 ? n : Math.ceil(n / 2), rows = n <= 4 ? 1 : 2;
  const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
  const eng = rows === 2;
  const kopf = eng ? 38 : 50, zh = eng ? 20 : 52, zf = eng ? 14.5 : 18, kf = eng ? 17 : 21, gesH = eng ? 24 : 36;
  const S = ch - kopf - P * zh - gesH - 8;
  const nb = Math.ceil(P / 2), nf = P - nb;
  const f = Math.max(30, Math.min(S / 2.15, (cw / (Math.max(nb, nf * 1.3) + 0.5)) * 0.95, eng ? 82 : 116));
  const tw = Math.min(cw * 0.86, Math.max(nb * f * 1.12 + f * 0.5, f * 2.2));
  const th = Math.min(tw * 0.3, f * 0.62);
  const tische = [];
  for (let t = 0; t < n; t++) {
    const c = t % cols, r = Math.floor(t / cols);
    const x = X0 + c * (cw + gap), y = Y0 + r * (ch + gap);
    const cx = x + cw / 2;
    /* Hintere Reihe sitzt hinter der Platte, vordere Reihe davor, etwas tiefer und breiter verteilt */
    const hoehe = 0.55 * th + 1.8 * f;
    const szeneOben = y + kopf + Math.max(0, (S - hoehe) / 2);
    const tischOben = szeneOben + H_FIG * f - 0.45 * th;
    const sb = Math.min(f * 1.0, (tw * 0.9) / nb), sf = nf ? Math.min(f * 1.3, (cw * 0.94) / nf) : 0;
    const plaetze = [];
    for (let i = 0; i < nb; i++) plaetze.push({ x: cx + (i - (nb - 1) / 2) * sb, fuss: tischOben + th * 0.45, hinten: true });
    for (let j = 0; j < nf; j++) plaetze.push({ x: cx + (j - (nf - 1) / 2) * sf, fuss: tischOben + th + 0.55 * f, hinten: false });
    tische.push({ nr: t + 1, x, y, cw, ch, cx, cy: tischOben + th / 2, tischOben, tw, th, plaetze });
  }
  return { n, P, f, kopf, zh, zf, kf, S, tische, eng, lauf: Math.max(46, Math.min(72, f)) };
}

/* Wo steht Figur i von n am Eingang, solange sie sich noch nicht bewegt hat? */
export function eingangPlatz(i, n) {
  const g = 46, links = 160, breite = 1040;
  const proReihe = n <= 20 ? Math.max(1, n) : Math.ceil(n / 2);
  const reihe = Math.floor(i / proReihe), spalte = i % proReihe;
  const inDieserReihe = Math.min(proReihe, n - reihe * proReihe);
  const abstand = Math.min(52, breite / Math.max(1, proReihe));
  const x0 = links + (breite - abstand * (inDieserReihe - 1)) / 2;
  const fuss = n > proReihe ? (reihe === 0 ? 806 : 878) : 842;
  return { x: x0 + spalte * abstand, fuss, g };
}

/* Die Tischplatte ist ein Hindernis */
function imTisch(T, x, y, rand = 0) {
  const rx = T.tw / 2 + 4 + rand, ry = T.th / 2 + 6 + rand * 0.4;
  return ((x - T.cx) / rx) ** 2 + ((y - T.cy) / ry) ** 2 < 1;
}
export function frei(L, x, y) {
  if (x < LAUF.links || x > LAUF.rechts || y < LAUF.oben || y > LAUF.unten) return false;
  return !L.tische.some((T) => imTisch(T, x, y));
}
/* Schritt mit Gleiten an Hindernissen entlang (erst beide Achsen, dann einzeln) */
export function schritt(L, x, y, dx, dy) {
  const klemme = (px, py) => [Math.min(LAUF.rechts, Math.max(LAUF.links, px)), Math.min(LAUF.unten, Math.max(LAUF.oben, py))];
  const versuche = [[dx, dy], [dx, 0], [0, dy]];
  /* Steht ein Tisch im Weg, gleitet die Figur schräg daran vorbei */
  for (const w of [Math.PI / 4, -Math.PI / 4, Math.PI / 2.2, -Math.PI / 2.2]) {
    const c = Math.cos(w), s = Math.sin(w);
    versuche.push([(dx * c - dy * s) * 0.8, (dx * s + dy * c) * 0.8]);
  }
  for (const [vx, vy] of versuche) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) continue;
    const [nx, ny] = klemme(x + vx, y + vy);
    if ((nx !== x || ny !== y) && frei(L, nx, ny)) return [nx, ny];
  }
  return [x, y];
}
/* Steht die Figur nah genug an einem Tisch, um sich zu setzen? */
export function tischInDerNaehe(L, x, y) {
  let best = null, bestD = Infinity;
  for (const T of L.tische) {
    const d = ((x - T.cx) / (T.tw / 2 + 60)) ** 2 + ((y - T.cy) / (T.th / 2 + 75)) ** 2;
    if (d < 1 && d < bestD) { best = T; bestD = d; }
  }
  return best;
}
/* Läuft die Figur gerade hinter einem Tisch entlang? Dann wird sie hinter der Platte gezeichnet. */
export function hinterTisch(L, x, y) {
  return L.tische.some((T) => y < T.cy && Math.abs(x - T.cx) < T.tw / 2 + L.lauf * 0.5 && y > T.tischOben - L.lauf * 0.9);
}
/* Freier Stehplatz vor einem Tisch (beim Aufstehen) */
export function vorDemTisch(L, T) {
  const y = Math.min(LAUF.unten, T.cy + T.th / 2 + 40);
  for (const dx of [0, -40, 40, -80, 80]) if (frei(L, T.cx + dx, y)) return [T.cx + dx, y];
  return [T.cx, y];
}
