/*
 * welt3d – Eingabe
 * Handy:       links ein Joystick, der dort erscheint, wo der Daumen aufsetzt;
 *              Wischen auf der rechten Bildhälfte dreht die Kamera; dazu Knöpfe des Spiels.
 * Am Rechner:  WASD oder Pfeiltasten, Maus ziehen zum Drehen, weitere Tasten des Spiels.
 *
 * optionen:
 *   flaeche                    Element, das Joystick und Wischen aufnimmt
 *   zeigeStick(bx, by, dx, dy, radius), versteckeStick()   so zeichnet das Spiel seinen Joystick
 *   knoepfe                    { name: Element } – ein Druck setzt die Meldung „name“
 *   tasten                     { 'Space': { name, wiederholt, verhindern } } – Tasten für Meldungen
 *   ausnahme(ziel)             true, wenn eine Berührung an diesem Element nicht steuern soll (Knöpfe, Karten)
 *   sperreSeite                true: auf der ganzen Seite kein Scrollen, Zoomen, Markieren, Kontextmenü
 */

export function erzeugeSteuerung(optionen) {
  const {
    flaeche, zeigeStick = () => {}, versteckeStick = () => {}, knoepfe = {}, tasten: meldeTasten = {},
    ausnahme = () => false, sperreSeite = false,
  } = optionen;

  const zustand = {
    x: 0, // Joystick nach rechts (−1 bis 1)
    y: 0, // Joystick nach vorn (−1 bis 1)
    meldung: {}, // einmalige Tastendrücke, werden abgeholt
    drehX: 0, // aufgelaufene Kameradrehung in Pixeln
    drehY: 0,
    drehMaus: false,
    finger: false, // wird das Gerät mit dem Finger bedient?
  };
  const tasten = new Set();
  let stickZeiger = null; // { id, bx, by }
  let blickZeiger = null; // { id, x, y }
  const ende = new AbortController();
  const hoert = { signal: ende.signal };

  const radius = () => Math.max(44, Math.min(72, window.innerHeight * 0.17));

  function bewegeStick(e) {
    const s = stickZeiger;
    const r = radius();
    let dx = e.clientX - s.bx;
    let dy = e.clientY - s.by;
    let d = Math.sqrt(dx * dx + dy * dy);
    // Wandert der Daumen über den Rand hinaus, wandert der Joystick mit
    if (d > r * 1.15) {
      const zuviel = d - r * 1.15;
      s.bx += (dx / d) * zuviel;
      s.by += (dy / d) * zuviel;
      dx = e.clientX - s.bx;
      dy = e.clientY - s.by;
      d = r * 1.15;
    }
    // kleine tote Zone in der Mitte, volles Tempo schon bei 85 % des Wegs
    const staerke = Math.min(1, Math.max(0, (d / r - 0.14) / (0.85 - 0.14)));
    zustand.x = d > 0 ? (dx / d) * staerke : 0;
    zustand.y = d > 0 ? (-dy / d) * staerke : 0;
    const sicht = Math.min(d, r);
    zeigeStick(s.bx, s.by, d > 0 ? (dx / d) * sicht : 0, d > 0 ? (dy / d) * sicht : 0, r);
  }

  function loseStick() {
    stickZeiger = null;
    zustand.x = 0;
    zustand.y = 0;
    versteckeStick();
  }

  flaeche.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && ausnahme(e.target)) return;
    if (e.pointerType === 'mouse') {
      if (blickZeiger) return;
      blickZeiger = { id: e.pointerId, x: e.clientX, y: e.clientY, maus: true };
    } else {
      zustand.finger = true;
      const links = e.clientX < window.innerWidth * 0.5;
      if (links && !stickZeiger) {
        stickZeiger = { id: e.pointerId, bx: e.clientX, by: e.clientY };
        zeigeStick(e.clientX, e.clientY, 0, 0, radius());
      } else if (!blickZeiger) {
        blickZeiger = { id: e.pointerId, x: e.clientX, y: e.clientY, maus: false };
      } else {
        return;
      }
    }
    try { flaeche.setPointerCapture(e.pointerId); } catch { /* manche Browser erlauben das nicht */ }
    e.preventDefault();
  }, hoert);

  flaeche.addEventListener('pointermove', (e) => {
    if (stickZeiger && e.pointerId === stickZeiger.id) {
      bewegeStick(e);
    } else if (blickZeiger && e.pointerId === blickZeiger.id) {
      zustand.drehX += e.clientX - blickZeiger.x;
      zustand.drehY += e.clientY - blickZeiger.y;
      zustand.drehMaus = blickZeiger.maus;
      blickZeiger.x = e.clientX;
      blickZeiger.y = e.clientY;
    } else {
      return;
    }
    e.preventDefault();
  }, hoert);

  const los = (e) => {
    if (stickZeiger && e.pointerId === stickZeiger.id) loseStick();
    if (blickZeiger && e.pointerId === blickZeiger.id) blickZeiger = null;
  };
  flaeche.addEventListener('pointerup', los, hoert);
  flaeche.addEventListener('pointercancel', los, hoert);
  flaeche.addEventListener('lostpointercapture', los, hoert);

  // --- Knöpfe ---
  for (const [name, element] of Object.entries(knoepfe)) {
    const druecke = (e) => {
      zustand.meldung[name] = true;
      if (e.pointerType !== 'mouse') zustand.finger = true;
      element.classList.add('gedrueckt');
      e.preventDefault();
    };
    const lasse = () => element.classList.remove('gedrueckt');
    element.addEventListener('pointerdown', druecke, hoert);
    element.addEventListener('pointerup', lasse, hoert);
    element.addEventListener('pointercancel', lasse, hoert);
    element.addEventListener('pointerleave', lasse, hoert);
    // Tastatur und Vorlesehilfen: Enter oder Leertaste auf dem Knopf
    element.addEventListener('click', (e) => {
      if (e.detail === 0) zustand.meldung[name] = true;
    }, hoert);
  }

  // --- Tastatur ---
  const LAUFTASTEN = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    if (LAUFTASTEN.includes(e.code)) {
      tasten.add(e.code);
      e.preventDefault();
      return;
    }
    const taste = meldeTasten[e.code];
    if (!taste || (e.repeat && !taste.wiederholt)) return;
    zustand.meldung[taste.name] = true;
    if (taste.verhindern) e.preventDefault();
  }, hoert);
  window.addEventListener('keyup', (e) => tasten.delete(e.code), hoert);
  window.addEventListener('blur', () => {
    tasten.clear();
    if (stickZeiger) loseStick();
    blickZeiger = null;
  }, hoert);

  // --- Kein Scrollen, kein Zoomen, keine Textauswahl, kein Kontextmenü ---
  if (sperreSeite) {
    const verhindere = (e) => {
      if (e.target instanceof Element && e.target.closest('.rollbar')) return; // Listen dürfen rollen
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', verhindere, { passive: false, signal: ende.signal });
    document.addEventListener('gesturestart', verhindere, hoert);
    document.addEventListener('gesturechange', verhindere, hoert);
    document.addEventListener('dblclick', verhindere, hoert);
    document.addEventListener('contextmenu', verhindere, hoert);
    document.addEventListener('selectstart', verhindere, hoert);
  }

  const taste = (...codes) => codes.some((c) => tasten.has(c));

  return {
    /** Laufrichtung: x nach rechts, y nach vorn, Länge höchstens 1. */
    richtung() {
      const kx = (taste('KeyD', 'ArrowRight') ? 1 : 0) - (taste('KeyA', 'ArrowLeft') ? 1 : 0);
      const ky = (taste('KeyW', 'ArrowUp') ? 1 : 0) - (taste('KeyS', 'ArrowDown') ? 1 : 0);
      if (kx || ky) {
        const l = Math.sqrt(kx * kx + ky * ky);
        return { x: kx / l, y: ky / l };
      }
      return { x: zustand.x, y: zustand.y };
    },
    /** Holt eine Meldung ab (Knopf oder Taste): true genau einmal je Druck. */
    hole(name) {
      const da = !!zustand.meldung[name];
      zustand.meldung[name] = false;
      return da;
    },
    /** Kameradrehung seit dem letzten Aufruf, in Pixeln. */
    holeDrehung() {
      const d = { x: zustand.drehX, y: zustand.drehY, maus: zustand.drehMaus };
      zustand.drehX = 0;
      zustand.drehY = 0;
      return d;
    },
    finger: () => zustand.finger,
    /** Liegt gerade ein Daumen auf dem Joystick? */
    lenkt: () => !!stickZeiger,
    /** Alle Lauscher wieder entfernen. */
    zerlegen() {
      ende.abort();
    },
  };
}
