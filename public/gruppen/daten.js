/*
 * Herzblatt-Gruppenwahl – gemeinsame Daten für Server, Handy und Beamer
 * Fragen fürs Profil, Decknamen und die Bausteine fürs zufällige Aussehen.
 */

/* ---------- Profilfragen: vier zur Gruppenarbeit, zwei zum Spaß ---------- */
export const FRAGEN = [
  {
    id: "rolle", art: "arbeit", frage: "Meine Rolle in der Gruppe", antworten: [
      { id: "plan", e: "👑", text: "Ich mache den Plan und verteile die Aufgaben", kurz: "Plan" },
      { id: "infos", e: "🔍", text: "Ich lese die Texte und finde die Infos", kurz: "Infos" },
      { id: "schreiben", e: "✍️", text: "Ich schreibe alles mit", kurz: "Mitschrift" },
      { id: "huebsch", e: "🎨", text: "Ich mache es hübsch (Plakat, Folien)", kurz: "Design" },
      { id: "praes", e: "🎤", text: "Ich präsentiere", kurz: "Präsentieren" },
      { id: "stimmung", e: "🥳", text: "Ich bin für die Stimmung zuständig", kurz: "Stimmung" },
    ],
  },
  {
    id: "tempo", art: "arbeit", frage: "Mein Arbeitstempo", antworten: [
      { id: "sofort", e: "🚀", text: "Ich lege sofort los", kurz: "sofort los" },
      { id: "gruendlich", e: "🐢", text: "Langsam, aber gründlich", kurz: "gründlich" },
      { id: "lastminute", e: "⏰", text: "Ich bin ein Last-Minute-Genie", kurz: "Last Minute" },
    ],
  },
  {
    id: "buehne", art: "arbeit", frage: "Vor der Klasse präsentieren", antworten: [
      { id: "mikro", e: "📣", text: "Gib mir das Mikro", kurz: "Mikro her" },
      { id: "muss", e: "😐", text: "Wenn's sein muss", kurz: "wenn's sein muss" },
      { id: "leiche", e: "🙈", text: "Nur über meine Leiche", kurz: "bloß nicht" },
    ],
  },
  {
    id: "krach", art: "arbeit", frage: "Wenn's in der Gruppe kracht", antworten: [
      { id: "vermittle", e: "🕊️", text: "Ich vermittle", kurz: "vermittelt" },
      { id: "diskutiere", e: "🔥", text: "Ich diskutiere mit", kurz: "diskutiert" },
      { id: "popcorn", e: "🍿", text: "Ich hole Popcorn", kurz: "Popcorn" },
    ],
  },
  {
    id: "pizza", art: "spass", frage: "Pizza Hawaii?", antworten: [
      { id: "ja", e: "🍍", text: "Na klar", kurz: "Hawaii ja" },
      { id: "nein", e: "🚫", text: "Ist ein Verbrechen", kurz: "Hawaii nein" },
    ],
  },
  {
    id: "getraenk", art: "spass", frage: "Welches Getränk bist du?", antworten: [
      { id: "kaffee", e: "☕", text: "Kaffee schwarz", kurz: "Kaffee schwarz" },
      { id: "capri", e: "🧃", text: "Capri-Sun", kurz: "Capri-Sun" },
      { id: "energy", e: "⚡", text: "Energy um 7:45", kurz: "Energy um 7:45" },
      { id: "tee", e: "🍵", text: "Kamillentee", kurz: "Kamillentee" },
    ],
  },
];
export const FRAGE = Object.fromEntries(FRAGEN.map((f) => [f.id, f]));
export const ANTWORT = Object.fromEntries(FRAGEN.map((f) => [f.id, Object.fromEntries(f.antworten.map((a) => [a.id, a]))]));

/* Ist das Profil vollständig und gültig? */
export function profilOk(p) {
  if (!p || typeof p !== "object") return false;
  return FRAGEN.every((f) => typeof p[f.id] === "string" && p[f.id] in ANTWORT[f.id]);
}

/* Diese Aufgaben sollte jede Gruppe abdecken („Noch gesucht“) */
export const KERNROLLEN = ["plan", "infos", "schreiben", "praes"];
export function nochGesucht(profile) {
  const da = new Set();
  for (const p of profile) {
    if (!p) continue;
    da.add(p.rolle);
    if (p.buehne === "mikro") da.add("praes"); // wer das Mikro will, kann auch präsentieren
  }
  return KERNROLLEN.filter((r) => !da.has(r));
}

/* Ein Spruch pro Tisch, wenn die Mischung auffällt (erste Regel, die passt) */
export function tischSpruch(profile) {
  const ps = profile.filter(Boolean);
  if (ps.length < 2) return null;
  const n = (frage, id) => ps.filter((p) => p[frage] === id).length;
  if (n("rolle", "plan") >= 2) return "👑 Machtkampf um den Plan?";
  if (n("rolle", "stimmung") >= 3) return "🥳 Party-Tisch";
  if (ps.length >= 3 && n("buehne", "leiche") === ps.length) return "🙈 Wer präsentiert hier bloß?";
  if (n("krach", "diskutiere") >= 2) return "🔥 Hier wird's hitzig";
  if (n("krach", "popcorn") >= 2) return "🍿 Popcorn-Fraktion";
  if (n("tempo", "lastminute") >= 2) return "⏰ Last-Minute-Gang";
  if (n("tempo", "sofort") >= 3) return "🚀 Turbo-Tisch";
  if (n("getraenk", "energy") >= 2) return "⚡ Hochspannung";
  if (ps.length >= 3 && n("pizza", "ja") === ps.length) return "🍍 Hawaii-Allianz";
  if (ps.length >= 3 && n("pizza", "nein") === ps.length) return "🚫 Anti-Ananas-Bündnis";
  return null;
}

/* ---------- Decknamen: Adjektiv + Nomen, stark gebeugt (ohne Artikel) ---------- */
export const ADJEKTIVE = [
  "melancholisch", "verschlafen", "dramatisch", "pünktlich", "philosophisch", "gechillt", "geheimnisvoll",
  "hungrig", "motiviert", "tiefenentspannt", "heldenhaft", "verwirrt", "elegant", "mutig", "poetisch",
  "chaotisch", "ehrgeizig", "flauschig", "glamourös", "legendär", "rebellisch", "sportlich", "neugierig",
  "höflich", "optimistisch", "nachdenklich", "fleißig", "lässig", "verträumt", "weis", "sparsam",
  "kreativ", "majestätisch", "vornehm", "tanzend", "singend", "grübelnd", "zufrieden",
];
export const NOMEN = [
  ["Bratwurst", "f"], ["Giraffe", "f"], ["Ente", "f"], ["Brezel", "f"], ["Qualle", "f"], ["Steckdose", "f"],
  ["Mikrowelle", "f"], ["Schildkröte", "f"], ["Waffel", "f"], ["Zitrone", "f"], ["Möwe", "f"], ["Eule", "f"],
  ["Robbe", "f"], ["Ananas", "f"], ["Glühbirne", "f"], ["Socke", "f"], ["Sanduhr", "f"], ["Avocado", "f"],
  ["Igel", "m"], ["Toaster", "m"], ["Flamingo", "m"], ["Pinguin", "m"], ["Kaktus", "m"], ["Waschbär", "m"],
  ["Hamster", "m"], ["Keks", "m"], ["Drache", "m"], ["Tintenfisch", "m"], ["Koala", "m"], ["Elch", "m"],
  ["Dino", "m"], ["Schneemann", "m"], ["Leuchtturm", "m"], ["Muffin", "m"], ["Staubsauger", "m"], ["Bagger", "m"],
  ["Brokkoli", "m"],
  ["Faultier", "n"], ["Lama", "n"], ["Alpaka", "n"], ["Erdmännchen", "n"], ["Croissant", "n"], ["Einhorn", "n"],
  ["Gürteltier", "n"], ["Känguru", "n"], ["Schnitzel", "n"], ["Toastbrot", "n"], ["Krokodil", "n"],
  ["Gummibärchen", "n"], ["Eichhörnchen", "n"], ["Chamäleon", "n"],
];
const ENDUNG = { f: "e", m: "er", n: "es" };
export const ANZAHL_NAMEN = ADJEKTIVE.length * NOMEN.length;
export function deckname(i) {
  const a = ADJEKTIVE[Math.floor(i / NOMEN.length) % ADJEKTIVE.length];
  const [nomen, g] = NOMEN[i % NOMEN.length];
  const adj = a + ENDUNG[g];
  return adj[0].toUpperCase() + adj.slice(1) + " " + nomen;
}
/* ---------- Bausteine fürs Aussehen ---------- */
export const FARBEN = ["#e5412d", "#ff8a3d", "#f2b705", "#3fbf7f", "#19a7a0", "#2c6fd6", "#7a5cff", "#e06aa3", "#9c6b4e", "#5c7d99", "#c2185b", "#7cb342"];
export const AUSSEHEN = {
  f: FARBEN.length, // Körperfarbe
  k: 3, // Körperform: Bohne, Kiste, Birne
  a: 5, // Augen: Punkte, groß, müde, zwinkert, Sternchen
  m: 5, // Mund: lächelt, grinst, staunt, schief, Zunge
  h: 9, // Kopf: nichts, Zylinder, Cap, Krone, Partyhut, Bommelmütze, Kochmütze, Propeller, Strubbelhaare
  b: 4, // Brille: keine, Sonnenbrille, Nerdbrille, Monokel
  x: 5, // Extra: nichts, Schnurrbart, Fliege, Bäckchen, Sommersprossen
};
export function aussehenOk(o) {
  if (!o || typeof o !== "object") return false;
  return Object.entries(AUSSEHEN).every(([k, n]) => Number.isInteger(o[k]) && o[k] >= 0 && o[k] < n);
}

/* Farben der Tische (Tisch 1 bis 8) */
export const TISCHFARBEN = ["#e5412d", "#2c6fd6", "#2e9e5b", "#d99a00", "#7a5cff", "#138f89", "#d4508f", "#e8702a"];
