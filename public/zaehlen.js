/*
 * Zeichenzählung wie bei X (twitter-text v3, vereinfacht).
 *
 * Lateinische Schrift und gängige Satzzeichen zählen 1, alles andere 2.
 * Ein Emoji zählt als Ganzes 2, ein Link immer 23 – egal wie lang er ist.
 * Die Datei wird vom Browser und vom Server gleichermaßen importiert,
 * damit beide exakt dieselbe Grenze ziehen.
 */

export const MAX_GEWICHT = 280;
const URL_GEWICHT = 23;

const EINFACH = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

const URL_RE =
  /\bhttps?:\/\/[^\s<>"]+|\b(?:[a-z0-9-]+\.)+(?:de|com|org|net|eu|info|io|gov|edu)\b(?:\/[^\s<>"]*)?/gi;

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter("de", { granularity: "grapheme" })
  : null;

function graphemes(s) {
  if (segmenter) return Array.from(segmenter.segment(s), (x) => x.segment);
  return Array.from(s);
}

function gewichtGraphem(g) {
  if (EMOJI_RE.test(g)) return 2;
  let w = 0;
  for (const ch of g) {
    const cp = ch.codePointAt(0);
    w += EINFACH.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return w;
}

/**
 * Liefert das Gesamtgewicht und die Stelle (String-Index), ab der der Text
 * über 280 liegt. grenze === text.length heißt: alles passt.
 */
export function analysiere(text) {
  const s = String(text ?? "");
  let gewicht = 0;
  let grenze = s.length;
  let pos = 0;

  const markiere = (neu, index) => {
    if (grenze === s.length && neu > MAX_GEWICHT) grenze = index;
  };

  URL_RE.lastIndex = 0;
  let m;
  const stuecke = [];
  while ((m = URL_RE.exec(s))) {
    stuecke.push([pos, m.index, false]);
    stuecke.push([m.index, m.index + m[0].length, true]);
    pos = m.index + m[0].length;
  }
  stuecke.push([pos, s.length, false]);

  for (const [a, b, istUrl] of stuecke) {
    if (a >= b) continue;
    if (istUrl) {
      markiere(gewicht + URL_GEWICHT, a);
      gewicht += URL_GEWICHT;
      continue;
    }
    let i = a;
    for (const g of graphemes(s.slice(a, b))) {
      const neu = gewicht + gewichtGraphem(g);
      markiere(neu, i);
      gewicht = neu;
      i += g.length;
    }
  }
  return { gewicht, grenze, rest: MAX_GEWICHT - gewicht };
}
