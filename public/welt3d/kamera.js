/*
 * welt3d – Kamera
 * Verfolger: Die Kamera folgt einer Figur von hinten. Wischen dreht sie; beim Laufen dreht sie sich
 * von selbst sanft hinter die Figur. Steht hinter der Figur ein Hindernis, rückt sie nur waagerecht
 * heran, behält ihre Höhe und schaut steiler herab. So bleibt die Figur immer im Bild.
 */

/** Winkelunterschied b − a im Bereich −π bis π. */
function winkelDifferenz(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * optionen:
 *   gier, neigung        Blickrichtung der Kamera (Winkel w zeigt nach (sin w, cos w)) und Neigung nach unten
 *   abstand              Abstand zur Figur in Metern
 *   folgen               so stark dreht die Kamera von selbst hinter die Figur (0 = aus)
 *   x, z                 Startort
 *   zielHoehe            Höhe, auf die die Kamera schaut
 *   freierAbstand(tx, tz, gier, wunsch)  liefert, wie weit die Kamera waagerecht zurück darf
 */
export function verfolger(optionen = {}) {
  const {
    gier = 0, neigung = 0.34, abstand = 8.5, folgen = 1.2, x = 0, z = 0, zielHoehe = 1.95,
    neigungVon = 0.1, neigungBis = 1.05, voraus = 1.2,
    freierAbstand = (tx, tz, richtung, wunsch) => wunsch,
  } = optionen;

  const blick = {
    gier, // Blickrichtung der Kamera
    neigung,
    wunschAbstand: abstand,
    flach: abstand * Math.cos(neigung), // waagerechter Abstand, geglättet
    folgen,
    letzteHand: -10, // Zeitpunkt der letzten Drehung von Hand (Sekunden)
    zeit: 0,
    x,
    y: 0,
    z,
  };

  return {
    blick,
    /** Zeit weiterzählen, einmal je Bild und vor allem anderen. */
    tick(dt) {
      blick.zeit += dt;
    },
    /** Dreht die Kamera von Hand (Wischen oder Maus). Werte in Radiant. */
    drehe(dGier, dNeigung) {
      blick.gier -= dGier;
      blick.neigung = Math.max(neigungVon, Math.min(neigungBis, blick.neigung + dNeigung));
      blick.letzteHand = blick.zeit;
    },
    /**
     * Stellt die Kamera hinter die Figur.
     * ziel: { x, y, z, richtung, laeuft } – laeuft ist der Anteil am vollen Lauftempo (0 bis 1).
     */
    setze(kamera, ziel, dt) {
      if (blick.folgen > 0 && blick.zeit - blick.letzteHand > 1.1 && ziel.laeuft > 0.1) {
        // sanft hinter die Figur drehen; läuft sie auf die Kamera zu, bleibt die Kamera ruhig
        blick.gier += Math.sin(winkelDifferenz(blick.gier, ziel.richtung)) * blick.folgen * ziel.laeuft * dt;
      }
      blick.x = ziel.x;
      blick.z = ziel.z;
      blick.y += (ziel.y * 0.55 - blick.y) * Math.min(1, dt * 9); // Sprünge nur gedämpft mitmachen
      const wunschFlach = blick.wunschAbstand * Math.cos(blick.neigung);
      const frei = freierAbstand(blick.x, blick.z, blick.gier, wunschFlach);
      blick.flach += (frei - blick.flach) * Math.min(1, dt * (frei < blick.flach ? 18 : 3.5));
      const nah = Math.min(1, blick.flach / wunschFlach); // 1 = voller Abstand
      const hoehe = zielHoehe + blick.y;
      const hoch = Math.sin(blick.neigung) * blick.wunschAbstand * (0.78 + 0.22 * nah);
      kamera.position.set(
        blick.x - Math.sin(blick.gier) * blick.flach,
        hoehe + hoch,
        blick.z - Math.cos(blick.gier) * blick.flach,
      );
      const vor = voraus * nah;
      kamera.lookAt(blick.x + Math.sin(blick.gier) * vor, hoehe + 0.25 * nah - 0.9 * (1 - nah), blick.z + Math.cos(blick.gier) * vor);
    },
  };
}
