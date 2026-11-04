/*
 * X-Simulator – Posting-Übung im X-Look für beliebige Klassen und Aufgaben
 *
 * Jede Klasse/Aufgabe ist ein „Raum" mit eigener Adresse /r/<code>, eigenem
 * angehefteten Aufgaben-Post und eigener Timeline. Die Lehrkraft verwaltet die
 * Räume unter /?lehrer=<TOKEN> und zeigt die Wand unter /r/<code>?lehrer=<TOKEN>.
 * Läuft auf Deno Deploy, alles liegt in Deno KV.
 */

import { analysiere } from "./public/zaehlen.js";
import { rolleRoute } from "./rolle.ts";

const LEHRER_TOKEN = Deno.env.get("LEHRER_TOKEN") ?? "";

/* Notschalter für die ganze Seite: auf true setzen und pushen.
   Einzelne Räume schließt man besser in der Verwaltung. */
const DEAKTIVIERT = false;

const MAX_NAME = 50;
const MAX_TOTAL = 300; // Posts pro Raum
const MAX_PRO_GERAET = 5; // Posts pro Gerät und Raum
const MIN_ABSTAND = 5000; // ms zwischen zwei Posts desselben Geräts
const LEBENSDAUER = 14 * 24 * 60 * 60 * 1000; // Posts, Likes, Namen laufen danach ab
const RESERVIERT = ["admin", "lehrer", "lehrerin", "lehrkraft", "x", "elonmusk", "moderation"];
const PIN_ID = "pinned";
const KLAR_ID = "klarstellung"; // Likes der Klarstellung der Moderation (Streitfall-Räume)
const MAX_KLAR = 700;
const ESK_ID = "eskalation"; // Streitfall: vorbereitete Antwort, die die Lehrkraft in der Auswertung live stellt
/* Streitfall: Für die Verteilung der Infokarten zählen die Geräte, die in den letzten 90 Minuten im Raum waren */
const KARTEN_FENSTER = 90 * 60 * 1000;
const BILD_TEIL = 60_000; // KV-Werte dürfen höchstens 64 KiB groß sein
const BILD_MAX = 2_000_000;
const BILD_TYPEN = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

/* Bewusst pro Gerät (clientId), nicht pro IP: im Schul-WLAN teilen sich
   alle Schüler*innen dieselbe öffentliche IP. */

type Status = "offen" | "pausiert" | "geschlossen";
type KartenStatus = "offen" | "zu";
/* Vorbereitete Antworten unter dem angehefteten Post (Thread-Räume).
   nach = Minuten nach dem angehefteten Post, daraus entsteht die Zeitangabe. */
type Antwort = { id: string; name: string; handle: string; e: string; c: string; text: string; nach: number };
type Eskalation = { name: string; handle: string; e: string; c: string; text: string };
type Raum = {
  code: string;
  titel: string;
  klasse: string;
  status: Status;
  pin: {
    name: string;
    handle: string;
    e: string;
    c: string;
    verifiziert: boolean;
    text: string;
    alt: string;
    ts: number;
  };
  bild: { typ: string; teile: number; groesse: number; v: number } | null;
  kriterien: string[];
  zahlen: number[];
  eh: string;
  /* Nur Thread-Räume: Antworten unter dem angehefteten Post und Community-Notes-Modus
     (Posts sind dann Note-Vorschläge zu einer Antwort, die Lehrkraft schaltet sie live) */
  antworten?: Antwort[];
  notes?: boolean;
  /* Notes auch zum angehefteten Post, z. B. für das eigene Urteil zur Ausgangsfrage */
  pinNotes?: boolean;
  /* Eigene Texte für den Hinweis über den Note-Vorschlägen und den Platzhalter im Eingabefeld */
  notesHinweis?: string;
  notesPlatzhalter?: string;
  /* Streitfall: Posts sind Kommentare unter einer Antwort (zu = ID der Antwort) oder eigene Antworten an den
     angehefteten Post (zu = "pinned"), sofort sichtbar und likebar. Dazu stellt die Lehrkraft am Ende eine
     Klarstellung der Moderation oben in den Thread. */
  kommentare?: boolean;
  kommentarPlatzhalter?: string;
  /* Streitfall: vorbereitete Antwort, die den Streit eskalieren lässt. Sie erscheint erst, wenn die Lehrkraft
     sie an der Wand live stellt, und gehört dann wie eine Antwort zum Thread (ID „eskalation“). */
  eskalation?: Eskalation;
  vorlageStand?: number; // nur vorbereitete Räume: Stand der Vorlage im Code
  erstellt: number;
  geaendert: number;
};
type Avatar = { e: string; c: string };
type Post = {
  id: string;
  name: string;
  handle: string;
  avatar: Avatar;
  text: string;
  ts: number;
  edited?: number;
  clientId: string;
  hidden?: boolean;
  badge?: "ok" | "fehler" | null;
  checks?: string[];
  zu?: string; // Community Note oder Kommentar: ID der Antwort, zu der der Post gehört (oder "pinned")
  live?: boolean; // Community Note: von der Lehrkraft live geschaltet
};
type Klarstellung = { text: string; ts: number; edited?: number };

/* Ohne angehängte KV-Datenbank soll die App trotzdem starten und das im
   Frontend melden, statt beim Start abzustürzen. */
let kv: Deno.Kv | null = null;
let kvFehler = "";
try {
  kv = await Deno.openKv(Deno.env.get("KV_PATH") || undefined); // KV_PATH nur für lokale Tests
} catch (e) {
  kvFehler = e instanceof Error ? e.message : String(e);
  console.error("Keine KV-Datenbank verbunden:", kvFehler);
}

/* ---------- Helfer ---------- */
function einzeilig(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/* Mehrzeiliger Text: Zeilenumbrüche bleiben, mehr als eine Leerzeile nicht */
function mehrzeilig(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function sauberesHandle(s: unknown): string {
  return String(s ?? "").replace(/^@/, "").trim();
}

function handleGueltig(h: string): boolean {
  return /^[A-Za-z0-9_]{4,15}$/.test(h);
}

function codeGueltig(c: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,19}$/.test(c);
}

function farbe(c: unknown, ersatz: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? String(c) : ersatz;
}

function sauberesAvatar(a: unknown): Avatar {
  const o = (a ?? {}) as Record<string, unknown>;
  return { e: String(o.e ?? "").slice(0, 16) || "🙂", c: farbe(o.c, "#1D9BF0") };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fehler(text: string, status = 400): Response {
  return json({ error: text }, status);
}

/* Token aus dem Link: einmal wie der Browser ihn liest (+ wird zu Leerzeichen),
   einmal roh – so klappt auch ein Token mit „+“ */
function tokenImLink(url: URL): string[] {
  const roh = url.search.match(/[?&]lehrer=([^&]*)/)?.[1] ?? "";
  let dekodiert = roh;
  try {
    dekodiert = decodeURIComponent(roh);
  } catch { /* kaputte %-Folge: roh vergleichen */ }
  return [url.searchParams.get("lehrer") ?? "", dekodiert].map((t) => t.trim());
}

function istLehrer(url: URL): boolean {
  const soll = LEHRER_TOKEN.trim();
  if (!soll) return false;
  return tokenImLink(url).includes(soll);
}

function kvFehltAntwort(): Response {
  return json(
    { error: "Der Simulator ist noch nicht fertig eingerichtet – es fehlt die Datenbank.", detail: kvFehler },
    503,
  );
}

async function leseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : null;
  } catch {
    return null;
  }
}

async function loescheAlles(kv: Deno.Kv, prefix: Deno.KvKey) {
  for await (const e of kv.list({ prefix })) await kv.delete(e.key);
}

function zufallsCode(): string {
  const z = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(b, (x) => z[x % z.length]).join("");
}

/* ---------- Räume ---------- */
async function holeRaum(kv: Deno.Kv, code: string): Promise<Raum | null> {
  if (!codeGueltig(code)) return null;
  return (await kv.get<Raum>(["rooms", code])).value ?? null;
}

async function alleRaeume(kv: Deno.Kv): Promise<Raum[]> {
  const l: Raum[] = [];
  for await (const e of kv.list<Raum>({ prefix: ["rooms"] })) if (e.value) l.push(e.value);
  l.sort((a, b) => b.geaendert - a.geaendert);
  return l;
}

/* Zusätze für Thread-Räume, die nur im Code gepflegt werden */
function threadZusatz(r: {
  pinNotes?: boolean;
  notesHinweis?: string;
  notesPlatzhalter?: string;
  kommentare?: boolean;
  kommentarPlatzhalter?: string;
}) {
  return {
    ...(r.pinNotes ? { pinNotes: true } : {}),
    ...(r.notesHinweis ? { notesHinweis: r.notesHinweis } : {}),
    ...(r.notesPlatzhalter ? { notesPlatzhalter: r.notesPlatzhalter } : {}),
    ...(r.kommentare ? { kommentare: true } : {}),
    ...(r.kommentarPlatzhalter ? { kommentarPlatzhalter: r.kommentarPlatzhalter } : {}),
  };
}

/* Raum-Einstellungen aus der Verwaltung übernehmen (nur bekannte Felder) */
function raumAusBody(b: Record<string, unknown>, alt?: Raum): Raum {
  const p = (b.pin ?? {}) as Record<string, unknown>;
  const jetzt = Date.now();
  const status = ["offen", "pausiert", "geschlossen"].includes(String(b.status))
    ? (b.status as Status)
    : alt?.status ?? "offen";
  const pinText = mehrzeilig(p.text, 1000);
  const pinHandle = sauberesHandle(p.handle).replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  return {
    code: alt?.code ?? "",
    titel: einzeilig(b.titel, 80) || "Neue Aufgabe",
    klasse: einzeilig(b.klasse, 30),
    status,
    pin: {
      name: einzeilig(p.name, 50) || "Politik",
      handle: pinHandle || "Unterricht",
      e: String(p.e ?? "").slice(0, 16) || "🏛️",
      c: farbe(p.c, "#536471"),
      verifiziert: p.verifiziert !== false,
      text: pinText,
      alt: einzeilig(p.alt, 400),
      ts: alt && alt.pin.text === pinText ? alt.pin.ts : jetzt,
    },
    bild: alt?.bild ?? null,
    kriterien: (Array.isArray(b.kriterien) ? b.kriterien : [])
      .map((k) => einzeilig(k, 60))
      .filter(Boolean)
      .slice(0, 12),
    zahlen: (Array.isArray(b.zahlen) ? b.zahlen : [])
      .map((z) => Number(z))
      .filter((z) => Number.isFinite(z))
      .slice(0, 80),
    eh: mehrzeilig(b.eh, 8000),
    /* Antworten und Notes-Modus gibt es nur in vorbereiteten Räumen;
       die Verwaltung schickt sie nicht mit, sie bleiben beim Speichern erhalten */
    ...(alt?.antworten?.length ? { antworten: alt.antworten, notes: !!alt.notes, ...threadZusatz(alt) } : {}),
    ...(alt?.eskalation ? { eskalation: alt.eskalation } : {}),
    ...(alt?.vorlageStand ? { vorlageStand: alt.vorlageStand } : {}),
    erstellt: alt?.erstellt ?? jetzt,
    geaendert: jetzt,
  };
}

/* Was Schüler*innen vom Raum sehen – Erwartungshorizont & Co. bleiben intern */
function raumOeffentlich(r: Raum, lehrer: boolean) {
  const basis = {
    code: r.code,
    titel: r.titel,
    klasse: r.klasse,
    status: r.status,
    pin: r.pin,
    bild: r.bild ? { v: r.bild.v } : null,
    antworten: r.antworten ?? [],
    notes: !!r.notes,
    ...threadZusatz(r),
  };
  return lehrer ? { ...basis, kriterien: r.kriterien, zahlen: r.zahlen, eh: r.eh } : basis;
}

function istAntwort(r: Raum, id: string): boolean {
  return (r.antworten ?? []).some((a) => a.id === id);
}

/* Streitfall: Ist die Eskalation live? Dann gehört sie wie eine Antwort zum Thread (hinter den vorbereiteten). */
async function eskalationAn(kv: Deno.Kv, r: Raum): Promise<{ ts: number } | null> {
  if (!r.kommentare || !r.eskalation) return null;
  return (await kv.get<{ ts: number }>(["eskalation", r.code, "an"])).value ?? null;
}
function mitEskalation(r: Raum, an: { ts: number } | null): Raum {
  if (!an || !r.eskalation) return r;
  const e: Antwort = { id: ESK_ID, ...r.eskalation, nach: Math.max(0, (an.ts - r.pin.ts) / 60_000) };
  return { ...r, antworten: [...(r.antworten ?? []), e] };
}

async function speichereBild(kv: Deno.Kv, code: string, daten: Uint8Array, typ: string) {
  await loescheAlles(kv, ["bild", code]);
  let teile = 0;
  for (let i = 0; i < daten.length; i += BILD_TEIL) {
    await kv.set(["bild", code, teile++], daten.slice(i, i + BILD_TEIL));
  }
  return { typ, teile, groesse: daten.length, v: Date.now() };
}

async function leseBild(kv: Deno.Kv, code: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const teile: Uint8Array[] = [];
  for await (const e of kv.list<Uint8Array>({ prefix: ["bild", code] })) teile.push(e.value);
  if (!teile.length) return null;
  const gesamt = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
  let pos = 0;
  for (const t of teile) {
    gesamt.set(t, pos);
    pos += t.length;
  }
  return gesamt;
}

async function kopiereBild(kv: Deno.Kv, von: string, nach: string) {
  for await (const e of kv.list<Uint8Array>({ prefix: ["bild", von] })) {
    await kv.set(["bild", nach, e.key[2]], e.value);
  }
}

async function loescheRaumDaten(kv: Deno.Kv, code: string, auchRaum: boolean) {
  for (const p of ["posts", "likes", "handles", "seen", "runde1", "pinfrei", "klarstellung", "eskalation", "karten"]) {
    await loescheAlles(kv, [p, code]);
  }
  if (auchRaum) {
    await loescheAlles(kv, ["bild", code]);
    await kv.delete(["rooms", code]);
  }
}

/* ---------- Posts, Likes, Aufrufe (je Raum) ---------- */
async function allePosts(kv: Deno.Kv, code: string): Promise<Post[]> {
  const l: Post[] = [];
  for await (const e of kv.list<Post>({ prefix: ["posts", code] })) if (e.value) l.push(e.value);
  l.sort((a, b) => b.ts - a.ts);
  return l;
}

async function alleLikes(kv: Deno.Kv, code: string) {
  const anzahl = new Map<string, number>();
  const vonMir = new Map<string, Set<string>>();
  for await (const e of kv.list({ prefix: ["likes", code] })) {
    const postId = String(e.key[2]);
    const cid = String(e.key[3]);
    anzahl.set(postId, (anzahl.get(postId) ?? 0) + 1);
    if (!vonMir.has(cid)) vonMir.set(cid, new Set());
    vonMir.get(cid)!.add(postId);
  }
  return { anzahl, vonMir };
}

async function alleGesehen(kv: Deno.Kv, code: string): Promise<number[]> {
  const l: number[] = [];
  for await (const e of kv.list<number>({ prefix: ["seen", code] })) {
    if (typeof e.value === "number") l.push(e.value);
  }
  return l;
}

async function anzahlPosts(kv: Deno.Kv, code: string) {
  let n = 0, letzte = 0;
  for await (const e of kv.list<Post>({ prefix: ["posts", code] })) {
    n++;
    if (e.value && e.value.ts > letzte) letzte = e.value.ts;
  }
  return { n, letzte };
}

/* Community Notes wie bei X: Haben die, die eine Note hilfreich finden (Like), der Antwort
   selbst zugestimmt oder nicht? Maßgeblich ist die Zustimmung aus Runde 1, sonst der jetzige Stand.
   Eigene Likes zählen nicht. */
type Runde1 = { ts: number; likes: Record<string, number>; wer?: Record<string, string[]> };
function seitenDerNote(p: Post, vonMir: Map<string, Set<string>>, runde1: Runde1 | null) {
  let mit = 0, ohne = 0;
  const damals = runde1?.wer && p.zu ? new Set(runde1.wer[p.zu] ?? []) : null;
  for (const [cid, s] of vonMir) {
    if (cid === p.clientId || !s.has(p.id)) continue;
    const zugestimmt = damals ? damals.has(cid) : !!p.zu && s.has(p.zu);
    if (zugestimmt) mit++;
    else ohne++;
  }
  return { mit, ohne };
}

/* Notes zum angehefteten Post gibt es erst, wenn die Lehrkraft sie freigibt */
async function urteileFrei(kv: Deno.Kv, r: Raum): Promise<boolean> {
  if (!r.pinNotes) return false;
  return !!(await kv.get(["pinfrei", r.code, "an"])).value;
}

/* ---------- Streitfall: Infokarten nach Interesse verteilen ----------
   Jede Person wählt im Thread die Antwort, der sie nachgehen will, und bekommt die Infokarte mit derselben
   Nummer (Antwort 1 bis 7). Damit alle Antworten geprüft werden, bleibt die Verteilung ausgeglichen: Bei N Geräten
   und M Karten hat am Ende jede Karte ⌊N/M⌋ oder ⌊N/M⌋ + 1 Personen. Eine Karte ist gesperrt, sobald sonst
   eine andere zu wenige bekäme – wie ein leerer Stapel vorn auf dem Tisch. Gespeichert wird nur Gerät → Antwort. */
function kartenAntworten(r: Raum): Antwort[] {
  return r.kommentare ? (r.antworten ?? []) : [];
}
async function kartenStand(kv: Deno.Kv, code: string) {
  const status = (await kv.get<KartenStatus>(["karten", code, "status"])).value ?? null;
  const wahl = new Map<string, string>();
  for await (const e of kv.list<string>({ prefix: ["karten", code, "wahl"] })) wahl.set(String(e.key[3]), e.value);
  return { status, wahl };
}
function kartenZaehlung(r: Raum, wahl: Map<string, string>): Record<string, number> {
  const z: Record<string, number> = {};
  for (const a of kartenAntworten(r)) z[a.id] = 0;
  for (const id of wahl.values()) if (id in z) z[id]++;
  return z;
}
/* Darf ein Gerät mit der bisherigen Wahl `alt` die Karte `zu` nehmen, bei `n` Geräten im Raum? */
function karteFrei(z: Record<string, number>, n: number, alt: string | null, zu: string): boolean {
  const ids = Object.keys(z);
  if (!ids.includes(zu)) return false;
  if (alt === zu) return true;
  const neu = { ...z };
  if (alt && alt in neu) neu[alt]--;
  neu[zu]++;
  const vergeben = Object.values(neu).reduce((s, x) => s + x, 0);
  const gesamt = Math.max(n, vergeben);
  const basis = Math.floor(gesamt / ids.length);
  const extra = gesamt - basis * ids.length;
  if (neu[zu] > basis + (extra > 0 ? 1 : 0)) return false;
  if (Object.values(neu).filter((x) => x > basis).length > extra) return false;
  const fehlen = Object.values(neu).reduce((s, x) => s + Math.max(0, basis - x), 0);
  return gesamt - vergeben >= fehlen;
}
function aktiveGeraete(gesehen: number[], jetzt: number): number {
  return gesehen.filter((t) => t >= jetzt - KARTEN_FENSTER).length;
}

/* Handle je Raum reservieren – false, wenn ein anderes Gerät es hat */
async function beanspruche(kv: Deno.Kv, code: string, handle: string, clientId: string): Promise<boolean> {
  const key = ["handles", code, handle.toLowerCase()];
  const e = await kv.get<string>(key);
  if (e.value && e.value !== clientId) return false;
  const ok = await kv.atomic().check(e).set(key, clientId, { expireIn: LEBENSDAUER }).commit();
  if (!ok.ok) return (await kv.get<string>(key)).value === clientId;
  return true;
}

function handleReserviert(r: Raum, h: string): boolean {
  const k = h.toLowerCase();
  return RESERVIERT.includes(k) || k === r.pin.handle.toLowerCase() ||
    (r.antworten ?? []).some((a) => a.handle.toLowerCase() === k) || r.eskalation?.handle.toLowerCase() === k;
}

/* ---------- Übernahme der ersten Version (ein Raum, Schlüssel ohne Raumcode) ---------- */
const ALT_CODE = "eltm2-a4";

async function uebernehmeAltdaten(kv: Deno.Kv) {
  if ((await kv.get(["meta", "migriert"])).value) return;
  const jetzt = Date.now();
  if (!(await holeRaum(kv, ALT_CODE))) {
    const raum: Raum = {
      code: ALT_CODE,
      titel: "A4 Tarifverträge und Betriebsräte (M4)",
      klasse: "ELTM2",
      status: "offen",
      pin: {
        name: "Politik ELTM2",
        handle: "PolitikBKTL",
        e: "🏛️",
        c: "#536471",
        verifiziert: true,
        text:
          "📊 A4: Werten Sie die Schaubilder (M4) aus und verfassen Sie eine X-Nachricht (max. 280 Zeichen) über die Ergebnisse.\n\nWas hat sich zwischen 2000 und 2022 verändert – und was heißt das für Beschäftigte? 👇 #Tarifbindung #Mitbestimmung",
        alt:
          "Schaubild M4: Weniger Tarifbindung und Mitbestimmung. 2000: 45 % Betriebsrat und Tarifvertrag, 23 % nur Tarifvertrag, 6 % nur Betriebsrat, 26 % weder noch. 2022: 35 %, 16 %, 8 %, 41 %.",
        ts: jetzt,
      },
      bild: null,
      kriterien: [
        "Zeitraum/Quelle genannt",
        "„weder noch“ 26 → 41 %",
        "Tarifbindung 68 → 51 %",
        "Betriebsrat 51 → 43 %",
        "Folgen für Beschäftigte",
        "X-typisch auf den Punkt",
      ],
      zahlen: [45, 23, 6, 26, 35, 16, 8, 41, 68, 51, 43, 15, 17, 10, 7, 2, 22, 58, 25, 2000, 2022, 100],
      eh: `## Werte aus M4 (Anteil aller Beschäftigten, 2000 → 2022)
- Betriebsrat + Tarifvertrag: 45 % → 35 % (−10)
- nur Tarifvertrag: 23 % → 16 % (−7)
- nur Betriebsrat: 6 % → 8 % (+2)
- **weder noch: 26 % → 41 % (+15)**
- Tarifbindung gesamt: 68 % → 51 % (−17)
- Betriebsrat gesamt: 51 % → 43 % (−8)
Veränderungen in Prozentpunkten. Relativ: „weder noch“ +58 %, Tarifbindung −25 %.

## Kriterien für einen gelungenen Post
- **Beschreiben:** Zeitraum (2000 → 2022) und Bezug (alle Beschäftigten) nennen, ggf. Quelle (Hans-Böckler-Stiftung).
- **Kernbefund:** Der Anteil ohne Betriebsrat und ohne Tarifvertrag steigt von gut einem Viertel auf rund vier von zehn.
- **Tendenz:** Tarifbindung und Mitbestimmung nehmen ab – nur „nur Betriebsrat“ wächst leicht.
- **Deuten:** Folgen für Beschäftigte (Löhne, Arbeitszeit, Urlaub, Mitsprache im Betrieb).
- **Format:** ≤ 280 Zeichen, adressatengerecht, zugespitzt, aber sachlich korrekt.

## Typische Fehler
- Prozentpunkte und Prozent verwechselt („41 % mehr“ statt „+15 Prozentpunkte“).
- „Nur Tarifvertrag“ als ganze Tarifbindung gelesen (16 % statt 51 %).
- Bezugsgröße vertauscht: Beschäftigte ≠ Betriebe.
- Wertung ohne Befund („Skandal!!!“ ohne Zahl).`,
      erstellt: jetzt,
      geaendert: jetzt,
    };
    try {
      const svg = await Deno.readFile(new URL("./public/m4.svg", import.meta.url));
      raum.bild = await speichereBild(kv, ALT_CODE, svg, "image/svg+xml");
    } catch (e) {
      console.error("M4-Bild nicht übernommen:", e);
    }
    await kv.set(["rooms", ALT_CODE], raum);
  }

  /* Alte Schlüssel ohne Raumcode in den Raum verschieben; die alten
     Kriterien-Kürzel werden dabei zu den Beschriftungen */
  const KUERZEL: Record<string, string> = {
    quelle: "Zeitraum/Quelle genannt",
    kern: "„weder noch“ 26 → 41 %",
    tarif: "Tarifbindung 68 → 51 %",
    br: "Betriebsrat 51 → 43 %",
    deutung: "Folgen für Beschäftigte",
    x: "X-typisch auf den Punkt",
  };
  for await (const e of kv.list<Post>({ prefix: ["posts"] })) {
    if (e.key.length === 2 && e.value) {
      const p = { ...e.value, checks: (e.value.checks ?? []).map((c) => KUERZEL[c] ?? c) };
      await kv.set(["posts", ALT_CODE, String(e.key[1])], p, { expireIn: LEBENSDAUER });
      await kv.delete(e.key);
    }
  }
  for await (const e of kv.list({ prefix: ["likes"] })) {
    if (e.key.length === 3) {
      await kv.set(["likes", ALT_CODE, e.key[1], e.key[2]], true, { expireIn: LEBENSDAUER });
      await kv.delete(e.key);
    }
  }
  for await (const e of kv.list<string>({ prefix: ["handles"] })) {
    if (e.key.length === 2) {
      await kv.set(["handles", ALT_CODE, e.key[1]], e.value, { expireIn: LEBENSDAUER });
      await kv.delete(e.key);
    }
  }
  for await (const e of kv.list({ prefix: ["seen"] })) if (e.key.length === 2) await kv.delete(e.key);
  await kv.set(["meta", "migriert"], jetzt);
}

/* ---------- Vorbereitete Räume ----------
   Werden beim Start einmal angelegt, falls es den Code noch nicht gibt.
   Danach gehören sie der Verwaltung: Änderungen dort bleiben erhalten, und ein
   gelöschter Raum kommt nicht zurück (Vermerk unter ["meta", "vorbereitet", code]).
   Ausnahme: Ein höherer „stand“ als im gespeicherten Raum überschreibt beim Start
   Erwartungshorizont, Kriterien, Referenzzahlen und Antworten (Posts bleiben). */
type Vorlage = Omit<Raum, "pin" | "bild" | "erstellt" | "geaendert" | "vorlageStand"> & {
  pin: Omit<Raum["pin"], "ts">;
  stand?: number;
};

const VORBEREITET: Vorlage[] = [
  {
    code: "kfz-tankrabatt",
    titel: "Aufgabe 3: Ist der Tankrabatt sein Geld wert?",
    klasse: "KFZ",
    status: "offen",
    pin: {
      name: "Politik KFZ",
      handle: "PolitikBKTL",
      e: "⛽",
      c: "#F4B43A",
      verifiziert: true,
      text:
        "⚖️ Aufgabe 3: Ist der Tankrabatt sein Geld wert?\n\nSchreiben Sie Ihr Urteil als Post (max. 280 Zeichen). Nennen Sie eine Zahl aus Aufgabe 1 und einen Grund aus Aufgabe 2.\n\nWählen Sie einen Spitznamen, nicht Ihren echten Namen. 👇 #Tankrabatt",
      alt: "",
    },
    kriterien: [
      "Klares Urteil: Geld wert oder nicht",
      "Zahl aus Aufgabe 1 (z. B. 12 von 17 Cent)",
      "Grund aus Aufgabe 2",
      "Zahl passt zum Grund",
      "Gegenseite bedacht („Zwar …, aber …“)",
      "Sachlich und X-typisch auf den Punkt",
    ],
    zahlen: [
      17, 0.17, 8.5, 13, 0.13, 6.5, 12, 0.12, 6, 2.5, 2, 4, 5, 50, 14.04, 16, 15, 2.114, 2.262,
      2.8, 2.485, 293, 30, 434, 128, 32, 36, 200, 33, 40, 7, 70, 71, 76, 3, 1, 31, 25, 2022, 2026,
    ],
    eh: `## Zahlen aus M1 und M2 (Aufgabe 1, 50 Liter Diesel)
- Möglich: bis zu 17 Cent pro Liter → 50 × 0,17 € = **8,50 €**
- Am 1. Oktober angekommen: rund 13 Cent (ADAC) → **6,50 €**, es fehlen 2,00 €
- Im Mai bei Diesel angekommen: 12 Cent (ifo) → **6,00 €**, es fehlten **2,50 €**
- Im Mai bei Benzin: Super E5 16 Cent, Super E10 15 Cent (ifo)
- Kosten: rund 2,8 Mrd. € in drei Monaten, etwa 30 Mio. € am Tag (M1, M4)
- Abstimmung am 25.09.2026: 434 dafür, 128 dagegen (M3)

## Gründe (Aufgabe 2)
- **Dafür:** wirkt sofort und ohne Antrag (CDU/CSU); entlastet alle, die mit dem Auto zur Arbeit pendeln (SPD); jede Entlastung hilft, kommt aber zu spät und ist zu klein (AfD)
- **Dagegen:** keine Pflicht zur Weitergabe, im Mai bei Diesel nur 12 von 17 Cent (Grüne, Kommentar); teuer, rund 2,8 Mrd. € (Grüne, Kommentar); Gießkanne statt gezielter Hilfe, wer viel tankt, spart am meisten (Linke, Kommentar)

## Beispiele für gelungene Posts
- „Sein Geld wert: Er wirkt sofort und ohne Antrag. Am 1. Oktober war Sprit rund 13 Cent billiger, bei 50 l Diesel sind das 6,50 €. #Tankrabatt“
- „Nicht sein Geld wert: 2,8 Mrd. € für drei Monate, und im Mai kamen bei Diesel nur 12 von 17 Cent an. Zwar wirkt er schnell, aber niemand muss ihn weitergeben. #Tankrabatt“

## Typische Fehler
- Urteil ohne Zahl oder ohne Grund
- Cent und Euro verwechselt (17 € statt 17 Cent)
- 13 Cent (1. Oktober, im Schnitt) und 12 Cent (Mai, Diesel) verwechselt
- Meinung statt Beleg („weil Sprit eh zu teuer ist“)`,
  },
  {
    /* WBL ELTU2, LS 1.2 Ausbildungsvertrag: Tims Thread mit acht Antworten,
       die Gruppen schreiben Community Notes dazu (Arbeitsblatt „Welche Antworten helfen Tim weiter?“) */
    code: "eltu2-tim",
    stand: 2,
    titel: "Tims Thread: Welche Antworten helfen Tim weiter?",
    klasse: "ELTU2",
    status: "offen",
    pin: {
      name: "Tim",
      handle: "tim_azubi",
      e: "🙋‍♂️",
      c: "#1D9BF0",
      verifiziert: false,
      text:
        "Bin seit ein paar Wochen Azubi als Elektroniker. Mein Chef lässt mich jede Woche seinen Privatwagen waschen. Überstunden gibt's weder bezahlt noch frei. Mein Berichtsheft hat noch nie jemand angeguckt. Ein Kollege meint, in der Probezeit lieber Klappe halten. Was meint ihr? 🤔",
      alt: "",
    },
    antworten: [
      { id: "a1", name: "René", handle: "rene_montage", e: "🔧", c: "#FF7A00", nach: 4,
        text: "Probezeit = Klappe halten. Sonst bist du schneller raus, als du gucken kannst. Hab ich selbst so erlebt 🤐" },
      { id: "a2", name: "Dennis", handle: "dennis_kabel", e: "💪", c: "#00BA7C", nach: 9,
        text: "Autowaschen gehört halt dazu. Lehrjahre sind keine Herrenjahre 🤷‍♂️" },
      { id: "a3", name: "Sarah", handle: "sarah_sicherung", e: "🔌", c: "#F91880", nach: 13,
        text: "Überstunden kriegst du als Azubi nie bezahlt. Ist überall so 💸" },
      { id: "a4", name: "Maik", handle: "maik_elektro", e: "😎", c: "#7856FF", nach: 21,
        text: "Berichtsheft guckt eh keiner an. Schreib alles kurz vor der Prüfung, hab ich auch so gemacht 😎" },
      { id: "a5", name: "Jule", handle: "jule_volt", e: "⚡", c: "#005A9C", nach: 26,
        text: "Und Werkzeug und Material für die Gesellenprüfung zahlst du dann auch selbst. Spar schon mal 😬" },
      { id: "a6", name: "Kevin", handle: "kevin_baustelle", e: "🏗️", c: "#F4B43A", nach: 34,
        text: "Kaffee holen, Werkstatt fegen: alles ausbildungsfremd. Musst du NIE machen 💅" },
      { id: "a7", name: "Lea", handle: "lea_lichtwerk", e: "💡", c: "#00A3A3", nach: 41,
        text: "Weisungen musst du als Azubi eh nicht befolgen. Bist ja kein richtiger Mitarbeiter 😏" },
      { id: "a8", name: "Ole", handle: "ole_verteiler", e: "🧰", c: "#B5651D", nach: 55,
        text: "Nach der Probezeit kann dein Chef dich nicht mehr einfach so rauswerfen 👍" },
    ],
    notes: true,
    kriterien: [
      "Urteil klar: stimmt, teilweise oder falsch",
      "Passender Paragraf genannt",
      "Inhalt rechtlich richtig",
      "Höchstens zwei Sätze",
      "Verständlich im ersten Ausbildungsjahr",
      "Fair aus Azubi- und Betriebssicht",
    ],
    zahlen: [],
    eh: `## Ablauf
- Einstieg: Thread am Beamer. Likes oder Handzeichen: Welcher Antwort würden Sie folgen?
- Notes: acht Gruppen, Gruppe n übernimmt Antwort n und postet eine Note (oder begründet „keine Note nötig“)
- Bewerten: Gruppe n bewertet die Note zu Antwort n+1 aus Azubi-Sicht und die zu Antwort n+2 aus Betriebssicht (nach 8 kommt 1)
- Live: Was beide Bewertungen „hilfreich“ hat, mit ✓ live schalten. Den Rest in der Auswertung gemeinsam verbessern.

## Antwort 1 · @rene_montage · stimmt teilweise
- § 20 und § 22 Abs. 1 BBiG
- **Note:** „Stimmt nur teilweise: In der Probezeit können beide Seiten ohne Frist kündigen (§ 22 Abs. 1 BBiG). Die Probezeit gehört aber schon zur Ausbildung, alle Rechte gelten also ab dem ersten Tag (§ 20 BBiG).“
- Für die Auswertung: Das Risiko ist echt. Wie Tim es klug anspricht, ist die Frage für DS 3.

## Antwort 2 · @dennis_kabel · falsch
- § 14 Abs. 3 BBiG
- **Note:** „Falsch: Azubis dürfen nur Aufgaben bekommen, die der Ausbildung dienen. Den Privatwagen des Chefs zu waschen gehört nicht dazu (§ 14 Abs. 3 BBiG).“

## Antwort 3 · @sarah_sicherung · falsch
- § 17 Abs. 7 BBiG
- **Note:** „Falsch: Überstunden muss der Betrieb extra bezahlen oder mit Freizeit ausgleichen (§ 17 Abs. 7 BBiG).“

## Antwort 4 · @maik_elektro · falsch
- § 13 Satz 2 Nr. 7 und § 14 Abs. 2 BBiG
- **Note:** „Falsch: Azubis müssen das Berichtsheft führen (§ 13 Nr. 7 BBiG). Der Betrieb muss es regelmäßig durchsehen und Zeit dafür am Arbeitsplatz geben (§ 14 Abs. 2 BBiG).“
- Zusatz: Ohne unterschriebenes Berichtsheft keine Zulassung zur Gesellenprüfung (§ 36 Abs. 1 Nr. 2 HwO).

## Antwort 5 · @jule_volt · falsch
- § 14 Abs. 1 Nr. 3 BBiG
- **Note:** „Falsch: Werkzeuge, Werkstoffe und Fachliteratur muss der Betrieb kostenlos stellen, auch für die Prüfungen (§ 14 Abs. 1 Nr. 3 BBiG).“

## Antwort 6 · @kevin_baustelle · stimmt teilweise
- § 14 Abs. 3 BBiG
- **Note:** „Stimmt so nicht: Sind alle im Team reihum dran, gilt das auch für Azubis. Zum Problem wird es, wenn solche Aufgaben die Ausbildung verdrängen (§ 14 Abs. 3 BBiG).“
- Kontrast zu Antwort 2: einmal reihum mit dem Team oder jede Woche für den Chef privat.

## Antwort 7 · @lea_lichtwerk · falsch
- § 13 Satz 2 Nr. 3 BBiG
- **Note:** „Falsch: Azubis müssen Weisungen befolgen, die im Rahmen der Ausbildung erteilt werden (§ 13 Nr. 3 BBiG). Für den Privatwagen des Chefs gilt das nicht.“

## Antwort 8 · @ole_verteiler · stimmt
- § 22 Abs. 2 und 3 BBiG
- **Keine Note nötig.** Falls doch: „Stimmt: Nach der Probezeit darf der Betrieb nur aus einem wichtigen Grund kündigen, schriftlich und mit Begründung (§ 22 Abs. 2 und 3 BBiG).“

## Typische Fehler
- § 13 (Pflichten der Azubis) und § 14 (Pflichten des Betriebs) verwechselt
- „nie“ und „immer“ übernommen, statt sie zu prüfen
- Note ohne Paragraf oder mit einem Paragrafen, der nicht passt
- Antwort 8 „korrigiert“, obwohl sie stimmt
- Probezeit als Zeit ohne Rechte verstanden`,
  },
  {
    /* EAH-12, Erziehungswissenschaften, UB 09.11.2026: Kritik an Piaget (Wiersing, M9, Punkte 3 bis 9).
       Streitfall: Jede Antwort spitzt einen Kritikpunkt zu. Like heißt „Diese Kritik halte ich für berechtigt“
       (Runde 1 und 2), nach dem Faktencheck mit Infokarten kommentieren die Lernenden mit Beleg; am Ende stellt
       die Lehrkraft als Moderation die Klarstellung der Klasse oben in den Thread. */
    code: "eah12-piaget",
    stand: 4,
    titel: "Mias Thread: Lerne ich hier gerade Quatsch?",
    klasse: "EAH-12",
    status: "offen",
    pin: {
      name: "Mia",
      handle: "mia_azubi",
      e: "🎒",
      c: "#1D9BF0",
      verifiziert: false,
      text:
        "Wir haben in der Erzieherausbildung gerade Piaget. Mein Bruder studiert Erziehungswissenschaft und meint, Piaget ist längst überholt, ein Professor hat seine Theorie in zehn Punkten zerlegt. Lerne ich hier gerade Quatsch? 🤔 #Piaget",
      alt: "",
    },
    antworten: [
      { id: "a1", name: "Jonas | Philosophie", handle: "jonas_denkt", e: "📚", c: "#7856FF", nach: 7,
        text: "Piagets Logik: Das Kind denkt so, weil es in Stufe 2 ist. Und woran erkennt man Stufe 2? Daran, dass es so denkt 🔄 Ein Zirkelschluss, der nichts erklärt." },
      { id: "a2", name: "Petra | Grundschule", handle: "petra_3b", e: "✏️", c: "#00BA7C", nach: 12,
        text: "Piaget hat sich seine Stufen am Schreibtisch ausgedacht und danach Kinder gesucht, die reinpassen. Erst die Theorie, dann die Kinder 📐" },
      { id: "a3", name: "Sandra", handle: "zwillingsmama_s", e: "👯‍♀️", c: "#F91880", nach: 18,
        text: "Meine Zwillinge sind beide fünf. Er weiß längst, dass beim Umschütten nichts verloren geht, sie nicht. So viel zu Piagets festen Stufen für alle 🙄" },
      { id: "a4", name: "Lea | Psychologie", handle: "lea_psycho", e: "🧠", c: "#FF7A00", nach: 25,
        text: "Assimilation, Akkommodation, Äquilibration 🤯 Klingt schlau, aber damit kann man hinterher jedes Verhalten erklären. Reines Fachchinesisch 🤷‍♀️" },
      { id: "a5", name: "Birgit | Kita-Leitung", handle: "birgit_kita", e: "🏡", c: "#005A9C", nach: 33,
        text: "Piaget hat Kinder wie Versuchskaninchen behandelt 🐹 Kein Wunder, dass sie bei seinen komischen Fragen danebenlagen. Wer kindgerecht fragt, merkt: Kinder können viel mehr!" },
      { id: "a6", name: "Opa Heinz", handle: "opa_heinz", e: "👴", c: "#B5651D", nach: 41,
        text: "Knete, Limo, Pendel: Bei Piaget geht's nur um Physik. Meine Enkelin spielt Kaufladen, verhandelt Preise und tröstet ihre Puppe. DAS ist Denken! 🧸" },
      { id: "a7", name: "Can | Erzieher", handle: "can_erzieher", e: "🗣️", c: "#00A3A3", nach: 52,
        text: "Kinder lernen im Gespräch: mit Eltern, Erzieher*innen und anderen Kindern. Bei Piaget tüftelt das Kind allein vor sich hin. Sprache und Kultur? Fehlanzeige 🌍" },
    ],
    kommentare: true,
    kommentarPlatzhalter: "Stimmt das? Folgt der Schluss daraus? Am Ende der Beleg, z. B. (M1, Z. 21–24).",
    eskalation: {
      name: "Ben | Erziehungswissenschaft",
      handle: "ben_studiert",
      e: "🎓",
      c: "#F4212E",
      text:
        "Sag ich doch, Schwesterherz 🙄 Im Spiel schaffen es 70 statt 5 von 100 Kindern, Zwillinge passen in keine Stufe, und Kultur fehlt bei Piaget komplett. Piaget ist WIDERLEGT. Streich das Kapitel und lern was Aktuelles! 🗑️ #PiagetIstTot",
    },
    kriterien: [
      "Position klar: stimmt, teilweise oder nicht",
      "Beleg mit Zeilenangabe oder Studie",
      "Sachlich richtig",
      "Schluss geprüft (Einzelfall oder Regel?)",
      "Bezieht sich auf die Antwort",
      "Fair zu beiden Seiten",
    ],
    zahlen: [],
    eh: `## Ablauf (UB, 45 Minuten)
- Einstieg (3 Min.): „Wir haben alle Argumente gesammelt. Für wie berechtigt halten Sie diese Kritik?“ Mia fragt: „Lerne ich hier gerade Quatsch?“
- Runde 1 (3 Min.): Like heißt: Diese Kritik halte ich für berechtigt (bewusst ein grobes Spontanurteil). Dann „Runde 1 festhalten“.
- Faktencheck (6 Min., allein): Knopf „Infokarten verteilen“. Jede Person tippt unter der Antwort, der sie nachgehen will, auf „Diese prüfen“, sieht ihre Kartennummer (= Nummer der Antwort) und holt die Karte vorn (je Nummer drei Exemplare). Volle Karten sind gesperrt, damit alle sieben Antworten geprüft werden. Erst ein spontaner Einwand, dann die Befunde A bis D selbst einordnen (+ oder –). Danach Knopf noch einmal: Verteilung beenden.
- Prüfen und kommentieren (7 Min., zu zweit oder zu dritt): Raum auf „offen“. Alle mit derselben Karte vergleichen ihre Einordnung, prüfen mit den zwei Fragen und schreiben einen gemeinsamen Kommentar mit Beleg. Wer anders urteilt, antwortet mit eigenem Kommentar.
- Lesen (4 Min.): den Streit unter den eigenen Likes lesen, Likes behalten oder zurücknehmen. Die Wand zeigt vorher → jetzt.
- Auswertung (7 Min.): Murmelphase („Was hat Sie umgestimmt, oder warum hält Ihr Urteil?“), dann zwei Streitpunkte fachlich klären. Bei Antwort 7 den Spiegel zeigen (P5, 94 %).
- Eskalation (2 Min.): Knopf „Eskalation“. Mias Bruder antwortet, der Kommentar steht oben im Thread, auf allen Handys. „Stimmt das?“ Zwei, drei spontane Reaktionen.
- Moderation (8 Min.): „Dieser Thread eskaliert, die Moderation greift ein.“ Klarstellung in drei Sätzen (berechtigt, übertrieben, nicht haltbar), an der Wand mitschreiben, live stellen.
- Abschluss (3 Min.): mündlich „Was antworten Sie Mia, und was ihrem Bruder?“ Auch abweichende Antworten zulassen. Puffer (2 Min.)

## Diagnose (Ankerpunkt, 02.11., 16 Abgaben)
- P5 „Ein Kind entwickelt sein Denken vor allem allein, indem es selbst ausprobiert“: 94 % → Can (Antwort 7) in Runde 1 eher wenige Likes, nach dem Faktencheck mehr. **Spiegel:** „94 % von Ihnen haben gesagt, ein Kind entwickelt sein Denken vor allem allein. Genau das kritisiert Can.“
- P2 abgelehnt (Ø 1,8), meist mit „ein Kind denkt immer“ → Birgit (Antwort 5) viel Zustimmung; Können und Zeigen ausdrücklich benennen.
- P3 40 %, P1 31 % → Sandra (Antwort 3) wirkt zunächst überzeugend.
- P4 53 % → Opa Heinz (Antwort 6) spaltet die Klasse.
- P6 0 % → niemand will Piaget verwerfen; in der Klarstellung „Was stimmt nicht?“ einfordern.
- Mot6 (frei vor der Klasse sprechen) Ø 2,3 → Murmelphase vor dem Plenum. Beispiele aus P7: Kind vermutet im größeren Glas mehr (für Piaget), Kind stellt sich vor, auf einem Pferd zu reiten (Symbolspiel).

## Antwort 1 · @jonas_denkt · Punkt 3, Zirkelschluss · stimmt teilweise
- M1, Z. 12–20; M9, Abschnitt zu Punkt 3 (Z. 11–30, Zeilen prüfen)
- **Kommentar:** „Stimmt nur teilweise: Die Stufe beschreibt, wie ein Kind denkt. Erklären will Piaget die Entwicklung mit Assimilation, Akkommodation und Äquilibration (M1, Z. 12–20). Zirkulär wird es erst, wenn man die Stufe selbst als Grund nennt.“
- Für die Auswertung: Beschreiben und Erklären unterscheiden.

## Antwort 2 · @petra_3b · Punkt 4, Schreibtisch · stimmt eher nicht
- M1, Z. 1–5 und 45–51 (eigene Kinder), Z. 78–79 und 96–97 (Antworten der Kinder); dagegen M1, Z. 101–103 und M9, Z. 39–40
- **Kommentar:** „Stimmt eher nicht: Piaget beobachtete jahrelang seine drei Kinder und befragte viele Kinder (M1, Z. 1–5, 45–51). Richtig ist, dass er die Stufen nach logischen Operationen benennt (M1, Z. 101–103).“

## Antwort 3 · @zwillingsmama_s · Punkt 5, feste Stufen · Schluss folgt nicht
- M1, Z. 21–24 (Richtwerte), Z. 9–10 (Reihenfolge), Z. 24–29 (horizontale Verschiebung); M9, Z. 49–53
- **Kommentar:** „Der Schluss folgt nicht: Piaget nennt die Altersangaben nur Richtwerte, Kinder erreichen die Stadien unterschiedlich früh (M1, Z. 21–24). Fest ist die Reihenfolge, nicht das Alter (M1, Z. 9–10).“
- Für die Auswertung: Einzelfall und Regel. Wiersings eigentlicher Punkt, Entwicklung könne auch zurückgehen (M9, Z. 49–53), reicht weiter als das Zwillingsbeispiel.

## Antwort 4 · @lea_psycho · Punkt 6, vage Begriffe · stimmt teilweise
- M9, Z. 59–73; M1, Z. 12–20; eigenes Beispiel, etwa aus dem Fall Derek
- **Kommentar:** „Teilweise: Die Begriffe sind abstrakt und lassen sich leicht im Nachhinein anwenden (M9, Z. 59–73). Sie sind aber genau bestimmt: Eine neue Erfahrung ins Schema einordnen heißt Assimilation (M1, Z. 12–20).“

## Antwort 5 · @birgit_kita · Punkt 7, Kind als Versuchsobjekt · stimmt teilweise
- Light u. a., 1979 (Einstieg: 5 zu 70 von 100); McGarrigle/Donaldson, 1974 (frecher Teddy, rund 16 zu 62 %); Hughes, 1975, nach Donaldson, 1978 (Polizisten-Versuch, rund 90 %); dagegen M1, Z. 96–97 und 110–114 (Begründungen), Z. 30–31 (konkrete Operationen mit sieben bis acht)
- **Kommentar:** „Teilweise: Fragt man kindgerecht, sagen viel mehr Kinder „gleich viel“, beiläufig im Spiel 70 statt 5 von 100 (Light u. a., 1979). Piaget ließ Kinder aber begründen (M1, Z. 110–114), und „gleich viel“ allein zeigt noch keine Invarianz.“
- Für die Auswertung: Präkonzept P2 (Können und Zeigen; die Klasse lehnt P2 ab, begründet aber meist mit „ein Kind denkt immer“), Rückbezug zum Einstieg.

## Antwort 6 · @opa_heinz · Punkt 8, nur Physik · stimmt teilweise
- M1, Z. 26–29, 85–89, 148–158; M9, Z. 83–100; dagegen M1, Z. 64–67 (Symbolspiel), Z. 75–77, Z. 159–163; Garz, 2006, S. 60 ff. (Murmelspiel)
- **Kommentar:** „Teilweise: Seine Versuche prüfen vor allem Menge, Gewicht und Volumen (M1, Z. 26–29). Das Spiel hat Piaget aber selbst untersucht, etwa das Symbolspiel (M1, Z. 64–67) und die Regeln beim Murmelspiel (Garz, 2006, S. 60 ff.).“
- Für die Auswertung: Beispiel aus der Diagnose, ein Kind stellt sich vor, auf einem Pferd zu reiten (Symbolspiel, M1, Z. 64–67).

## Antwort 7 · @can_erzieher · Punkt 9, Kultur und Kommunikation · stimmt weitgehend
- M9, ab Z. 101 (Zeilen prüfen); M1, Z. 12–20; Garz, 2006, S. 84 (soziale Erfahrung als ein Faktor), S. 85 (Äquilibration ausschlaggebend)
- **Kommentar:** „Stimmt weitgehend: Für Piaget treibt vor allem das Kind selbst seine Entwicklung an (M1, Z. 12–20). Soziale Erfahrung nennt er zwar als Faktor, entscheidend ist aber die Äquilibration (Garz, 2006, S. 84 f.). „Fehlanzeige“ übertreibt.“
- Für die Auswertung: Spiegel aus der Diagnose (P5, 94 %); die Kritik trifft die Überzeugung der Klasse. Ausblick auf das Kita-Angebot am 16.11.

## Eskalation · @ben_studiert (Mias Bruder)
- Erscheint erst nach Klick auf „Eskalation“ an der Wand, oben im Thread; ein zweiter Klick oder „Neue Runde“ nimmt sie heraus.
- Überdehnt drei Befunde aus dem Thread: 70 statt 5 von 100 zeigt, dass Piagets Aufgabe Kinder unterschätzt, nicht dass die Theorie falsch ist (Kinder erst sechs, „gleich viel“ ohne Begründung); Zwillinge sind ein Einzelfall (Richtwerte, M1, Z. 21–24); soziale Erfahrung ist ein Faktor, nur nicht der entscheidende (Garz, 2006, S. 84 f.).
- „widerlegt“ macht aus „teilweise berechtigt“ ein „falsch“. P6: Niemand in der Klasse will Piaget verwerfen (0 %).
- Erwartete Reaktionen: „Widerlegt ist er nicht, nur an manchen Stellen ungenau.“ – „Er macht aus Einzelfällen eine Regel.“ – „Fehlanzeige stimmt nicht, soziale Erfahrung ist ein Faktor.“
- Überleitung: „Dieser Thread eskaliert. Als Moderation greifen wir ein.“

## Klarstellung der Moderation · Beispiel
- „Berechtigt ist: Gespräch und Kultur kommen bei Piaget zu kurz, und seine Aufgaben unterschätzen Kinder oft (Light u. a., 1979). Übertrieben ist: Die Altersangaben sind nur Richtwerte, und das Spiel hat Piaget selbst untersucht (M1, Z. 21–24, 64–67). Nicht haltbar ist: Widerlegt ist Piaget nicht, und ausgedacht hat er sich die Stufen auch nicht, er hat Kinder beobachtet und befragt (M1, Z. 1–5).“
- Für den Abschluss: Mia lernt keinen Quatsch, aber auch nicht das letzte Wort. Bezug: Präkonzept P6 der Ankerpunkt-Diagnose.

## Typische Fehler
- Einzelfall als Beweis übernommen (Zwillinge, Enkelin) oder umgekehrt als Gegenbeweis
- „nur“, „nichts“, „Fehlanzeige“ nicht geprüft
- Kommentar ohne Beleg oder mit einer Zeile, die nicht passt
- Like aus Sympathie für den Account statt für die Sache
- Antwort 7 „widerlegt“, obwohl sie weitgehend stimmt
- Altersangaben als feste Grenzen gelesen`,
  },
];

async function legeVorbereiteteRaeumeAn(kv: Deno.Kv) {
  for (const { stand, ...v } of VORBEREITET) {
    const raumKey = ["rooms", v.code];
    const vermerk = ["meta", "vorbereitet", v.code];
    const jetzt = Date.now();
    /* Thread-Räume: Der angeheftete Post liegt so weit zurück, dass alle Antworten schon „gepostet“ sind */
    const vorlauf = Math.max(0, ...(v.antworten ?? []).map((a) => a.nach)) * 60_000;
    const raum: Raum = {
      ...v,
      pin: { ...v.pin, ts: jetzt - vorlauf },
      bild: null,
      ...(stand ? { vorlageStand: stand } : {}),
      erstellt: jetzt,
      geaendert: jetzt,
    };
    const ok = await kv.atomic()
      .check({ key: raumKey, versionstamp: null })
      .check({ key: vermerk, versionstamp: null })
      .set(raumKey, raum)
      .set(vermerk, jetzt)
      .commit();
    if (ok.ok) {
      console.log(`Vorbereiteter Raum ${v.code} angelegt.`);
      continue;
    }
    /* Raum gibt es schon: nur bei höherem Stand die Vorlage-Inhalte nachziehen */
    if (!stand) continue;
    const da = await kv.get<Raum>(raumKey);
    if (!da.value || (da.value.vorlageStand ?? 0) >= stand) continue;
    const { pinNotes: _p, notesHinweis: _h, notesPlatzhalter: _t, kommentare: _k, kommentarPlatzhalter: _kp, eskalation: _es,
      ...bisher } =
      da.value;
    const neu: Raum = {
      ...bisher,
      titel: v.titel,
      pin: { ...v.pin, ts: da.value.pin.ts },
      eh: v.eh,
      kriterien: v.kriterien,
      zahlen: v.zahlen,
      ...(v.antworten ? { antworten: v.antworten, notes: !!v.notes, ...threadZusatz(v) } : {}),
      ...(v.eskalation ? { eskalation: v.eskalation } : {}),
      vorlageStand: stand,
    };
    const ok2 = await kv.atomic().check(da).set(raumKey, neu).commit();
    if (ok2.ok) console.log(`Vorbereiteter Raum ${v.code} auf Stand ${stand} gebracht.`);
  }
}

if (kv) {
  try {
    await uebernehmeAltdaten(kv);
  } catch (e) {
    console.error("Übernahme der Altdaten fehlgeschlagen:", e);
  }
  try {
    await legeVorbereiteteRaeumeAn(kv);
  } catch (e) {
    console.error("Vorbereitete Räume nicht angelegt:", e);
  }
}

/* ---------- Statische Dateien ---------- */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

async function statisch(rel: string): Promise<Response> {
  if (rel.includes("..")) return new Response("Verboten", { status: 403 });
  const endung = rel.slice(rel.lastIndexOf("."));
  try {
    const datei = await Deno.readFile(new URL(`./public/${rel}`, import.meta.url));
    return new Response(datei, {
      headers: { "content-type": TYPES[endung] ?? "application/octet-stream", "cache-control": "no-cache" },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

const ABGESCHALTET_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Nicht verfügbar</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:28px;margin:0 0 8px">Diese Seite ist gerade nicht verfügbar.</h1>
<p style="color:#71767b;margin:0">Die Unterrichtssimulation wurde von der Lehrkraft beendet.</p></div></body></html>`;

/* ---------- Server ---------- */
const PORT = Number(Deno.env.get("PORT") ?? 8000);

/* Hinweise, ohne den Token selbst zu verraten: nur Längen und Zeichenarten */
function diagnose(url: URL): string {
  const soll = LEHRER_TOKEN.trim();
  const ist = tokenImLink(url)[1];
  const tipps: string[] = [
    `Im Link kamen <b>${ist.length} Zeichen</b> an, eingetragen sind <b>${soll.length} Zeichen</b>.`,
  ];
  if (ist.length === soll.length) tipps.push("Die Länge stimmt – es weicht also ein einzelnes Zeichen ab (Groß-/Kleinschreibung? 0 statt O? l statt I?).");
  if (/[#&?/ ]/.test(soll)) tipps.push("Der eingetragene Token enthält Sonderzeichen wie # & ? / oder Leerzeichen, die in Links Probleme machen. Nimm einen Token nur aus Buchstaben und Zahlen.");
  if (LEHRER_TOKEN !== soll) tipps.push("Im eingetragenen Token stehen Leerzeichen am Anfang oder Ende (werden inzwischen ignoriert).");
  tipps.push("Wurde der Wert gerade geändert: einmal neu deployen.");
  return "Der Token im Link passt nicht zum eingetragenen <b>LEHRER_TOKEN</b>.<br><br>" + tipps.join("<br>");
}

Deno.serve({ port: PORT }, async (req: Request) => {
  const url = new URL(req.url);
  const pfad = url.pathname;
  const lehrer = istLehrer(url);

  if (DEAKTIVIERT) {
    if (pfad.startsWith("/api/")) return fehler("Die Simulation ist beendet.", 503);
    return new Response(ABGESCHALTET_HTML, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  /* ================= Live-Spiel „Alle ziehen an Finn“ (/rolle) ================= */
  const rolle = await rolleRoute(req, url, pfad, lehrer, kv, { statisch, json, fehler, leseBody, kvFehlt: kvFehltAntwort });
  if (rolle) return rolle;

  /* ================= Verwaltung der Räume (nur Lehrkraft) ================= */
  if (pfad === "/api/rooms" || pfad.startsWith("/api/rooms/")) {
    if (!kv) return kvFehltAntwort();
    if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
    const teile = pfad.split("/").slice(3); // [code, aktion?]
    const code = teile[0] ?? "";

    /* Liste mit Kennzahlen */
    if (!code && req.method === "GET") {
      const raeume = await alleRaeume(kv);
      const liste = await Promise.all(raeume.map(async (r) => ({ ...raumOeffentlich(r, true), ...(await anzahlPosts(kv!, r.code)), geaendert: r.geaendert })));
      return json({ raeume: liste });
    }

    /* Neuen Raum anlegen */
    if (!code && req.method === "POST") {
      const b = await leseBody(req);
      if (!b) return fehler("Konnte die Anfrage nicht lesen.");
      let neu = einzeilig(b.code, 20).toLowerCase();
      if (neu) {
        if (!codeGueltig(neu)) return fehler("Der Code darf nur a–z, 0–9 und - enthalten (3–20 Zeichen).");
        if (await holeRaum(kv, neu)) return fehler("Diesen Code gibt es schon.", 409);
      } else {
        do neu = zufallsCode(); while (await holeRaum(kv, neu));
      }
      const r = { ...raumAusBody(b), code: neu };
      await kv.set(["rooms", neu], r);
      return json({ raum: raumOeffentlich(r, true) }, 201);
    }

    const r = await holeRaum(kv, code);
    if (!r) return fehler("Diesen Raum gibt es nicht.", 404);
    const aktion = teile[1] ?? "";

    if (!aktion && req.method === "GET") return json({ raum: raumOeffentlich(r, true) });

    if (!aktion && req.method === "PUT") {
      const b = await leseBody(req);
      if (!b) return fehler("Konnte die Anfrage nicht lesen.");
      const neu = { ...raumAusBody(b, r), code: r.code };
      await kv.set(["rooms", r.code], neu);
      return json({ raum: raumOeffentlich(neu, true) });
    }

    /* Nur den Status umschalten (offen / pausiert / geschlossen) */
    if (aktion === "status" && req.method === "POST") {
      const b = await leseBody(req);
      if (!["offen", "pausiert", "geschlossen"].includes(String(b?.status))) return fehler("Unbekannter Status.");
      await kv.set(["rooms", r.code], { ...r, status: b!.status as Status, geaendert: Date.now() });
      return json({ ok: true });
    }

    if (!aktion && req.method === "DELETE") {
      await loescheRaumDaten(kv, r.code, true);
      return json({ ok: true });
    }

    /* Raum mit allen Einstellungen (ohne Posts) für eine andere Klasse kopieren */
    if (aktion === "kopie" && req.method === "POST") {
      const b = (await leseBody(req)) ?? {};
      let neu = einzeilig(b.code, 20).toLowerCase();
      if (neu && !codeGueltig(neu)) return fehler("Ungültiger Code.");
      if (neu && (await holeRaum(kv, neu))) return fehler("Diesen Code gibt es schon.", 409);
      if (!neu) do neu = zufallsCode(); while (await holeRaum(kv, neu));
      const jetzt = Date.now();
      const kopie: Raum = {
        ...structuredClone(r),
        code: neu,
        klasse: einzeilig(b.klasse, 30) || r.klasse,
        titel: einzeilig(b.titel, 80) || r.titel,
        status: "offen",
        erstellt: jetzt,
        geaendert: jetzt,
      };
      kopie.pin.ts = jetzt;
      if (r.bild) await kopiereBild(kv, r.code, neu);
      await kv.set(["rooms", neu], kopie);
      return json({ raum: raumOeffentlich(kopie, true) }, 201);
    }

    /* Bild hochladen (Rohdaten im Body) oder entfernen */
    if (aktion === "bild" && req.method === "PUT") {
      const typ = (req.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!BILD_TYPEN.includes(typ)) return fehler("Bitte ein PNG-, JPG-, WebP-, GIF- oder SVG-Bild hochladen.");
      const daten = new Uint8Array(await req.arrayBuffer());
      if (!daten.length) return fehler("Das Bild ist leer.");
      if (daten.length > BILD_MAX) return fehler("Das Bild ist zu groß (max. 2 MB).");
      const bild = await speichereBild(kv, r.code, daten, typ);
      await kv.set(["rooms", r.code], { ...r, bild, geaendert: Date.now() });
      return json({ ok: true, bild: { v: bild.v } });
    }
    if (aktion === "bild" && req.method === "DELETE") {
      await loescheAlles(kv, ["bild", r.code]);
      await kv.set(["rooms", r.code], { ...r, bild: null, geaendert: Date.now() });
      return json({ ok: true });
    }

    return fehler("Unbekannte Anfrage.", 404);
  }

  /* ================= Ein Raum: /api/r/<code>/… ================= */
  const rm = pfad.match(/^\/api\/r\/([a-z0-9-]{3,20})(\/.*)?$/);
  if (rm) {
    if (!kv) return kvFehltAntwort();
    const r = await holeRaum(kv, rm[1]);
    if (!r) return fehler("Diesen Raum gibt es nicht.", 404);
    const code = r.code;
    const rest = rm[2] ?? "";
    if (r.status === "geschlossen" && !lehrer) return json({ error: "Dieser Raum ist geschlossen.", geschlossen: true }, 423);

    /* Bild des angehefteten Posts */
    if (rest === "/bild" && req.method === "GET") {
      if (!r.bild) return new Response("Kein Bild", { status: 404 });
      const daten = await leseBild(kv, code);
      if (!daten) return new Response("Kein Bild", { status: 404 });
      return new Response(daten, {
        headers: {
          "content-type": r.bild.typ,
          "cache-control": "public, max-age=31536000, immutable",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          "x-content-type-options": "nosniff",
        },
      });
    }

    /* Gesamtstand: Raum, Posts, Likes, Aufrufe. Gleichzeitig „gesehen" vermerken. */
    if (rest === "/state" && req.method === "GET") {
      const cid = einzeilig(url.searchParams.get("clientId"), 64);
      const jetzt = Date.now();
      if (cid && !lehrer) await kv.set(["seen", code, cid], jetzt, { expireIn: LEBENSDAUER });

      const [posts, likes, gesehen] = await Promise.all([allePosts(kv, code), alleLikes(kv, code), alleGesehen(kv, code)]);
      const esk = await eskalationAn(kv, r);
      const rr = mitEskalation(r, esk);
      const runde1 = lehrer && r.antworten?.length ? (await kv.get<Runde1>(["runde1", code, "stand"])).value ?? null : null;
      const pinFrei = await urteileFrei(kv, r);
      const klar = r.kommentare ? (await kv.get<Klarstellung>(["klarstellung", code, "text"])).value ?? null : null;
      const meine = likes.vonMir.get(cid) ?? new Set<string>();
      const aufrufe = (ts: number) => gesehen.filter((s) => s >= ts).length;
      /* Streitfall: Infokarten (Schüler*innen sehen ihre Wahl und welche Karten noch frei sind, die Lehrkraft die Zahlen) */
      let karten = null;
      if (r.kommentare && r.antworten?.length) {
        const ks = await kartenStand(kv, code);
        if (ks.status) {
          const z = kartenZaehlung(r, ks.wahl);
          const n = aktiveGeraete(gesehen, jetzt);
          const mein = ks.wahl.get(cid) ?? null;
          karten = lehrer
            ? { status: ks.status, zahlen: z, gewaehlt: Object.values(z).reduce((s, x) => s + x, 0), geraete: n }
            : { status: ks.status, meine: mein, frei: Object.fromEntries(Object.keys(z).map((id) => [id, karteFrei(z, n, mein, id)])) };
        }
      }

      return json({
        now: jetzt,
        lehrer,
        raum: raumOeffentlich(rr, lehrer),
        posts: posts
          .filter((p) => lehrer || !p.hidden || p.clientId === cid)
          .map((p) => ({
            id: p.id,
            name: p.name,
            handle: p.handle,
            avatar: p.avatar,
            text: p.text,
            ts: p.ts,
            edited: p.edited ?? null,
            likes: likes.anzahl.get(p.id) ?? 0,
            liked: meine.has(p.id),
            views: Math.max(1, aufrufe(p.ts)),
            mine: !!cid && p.clientId === cid,
            hidden: !!p.hidden,
            zu: p.zu ?? null,
            live: !!p.live,
            ...(lehrer ? { badge: p.badge ?? null, checks: p.checks ?? [] } : {}),
            ...(lehrer && r.notes && p.zu && p.zu !== PIN_ID ? { seiten: seitenDerNote(p, likes.vonMir, runde1) } : {}),
          })),
        pinned: { likes: likes.anzahl.get(PIN_ID) ?? 0, liked: meine.has(PIN_ID), views: gesehen.length },
        antwortStand: (rr.antworten ?? []).map((a) => ({
          id: a.id,
          likes: likes.anzahl.get(a.id) ?? 0,
          liked: meine.has(a.id),
          views: Math.max(1, aufrufe(r.pin.ts + a.nach * 60_000)),
        })),
        geraete: gesehen.length,
        pinFrei,
        karten,
        klarstellung: klar
          ? {
            text: klar.text,
            ts: klar.ts,
            edited: klar.edited ?? null,
            likes: likes.anzahl.get(KLAR_ID) ?? 0,
            liked: meine.has(KLAR_ID),
          }
          : null,
        ...(lehrer ? { runde1: runde1 ? { ts: runde1.ts, likes: runde1.likes } : null } : {}),
        ...(lehrer && r.kommentare && r.eskalation
          ? { eskalation: { an: !!esk, ts: esk?.ts ?? null, name: r.eskalation.name, handle: r.eskalation.handle } }
          : {}),
      });
    }

    /* Benutzernamen prüfen und reservieren */
    if (rest === "/handle" && req.method === "POST") {
      const b = await leseBody(req);
      if (!b) return fehler("Konnte die Anfrage nicht lesen.");
      const handle = sauberesHandle(b.handle);
      const cid = einzeilig(b.clientId, 64);
      if (!cid) return fehler("Gerätekennung fehlt.");
      if (!handleGueltig(handle)) {
        return fehler("Dein Benutzername muss 4 bis 15 Zeichen lang sein und darf nur Buchstaben, Zahlen und _ enthalten.");
      }
      if (handleReserviert(r, handle)) return fehler("Dieser Benutzername ist bereits vergeben.", 409);
      if (b.pruefen === true) {
        const besitzer = (await kv.get<string>(["handles", code, handle.toLowerCase()])).value;
        if (besitzer && besitzer !== cid) return fehler("Dieser Benutzername ist bereits vergeben.", 409);
        return json({ ok: true });
      }
      if (!(await beanspruche(kv, code, handle, cid))) return fehler("Dieser Benutzername ist bereits vergeben.", 409);
      return json({ ok: true });
    }

    /* Notes zum angehefteten Post (eigenes Urteil) freigeben oder sperren */
    if (rest === "/pinfrei" && req.method === "POST") {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      const b = await leseBody(req);
      const key = ["pinfrei", code, "an"];
      if (b?.an === true) await kv.set(key, true, { expireIn: LEBENSDAUER });
      else await kv.delete(key);
      return json({ ok: true, pinFrei: b?.an === true });
    }

    /* Likes der Antworten festhalten (Runde 1), damit die Wand später vorher und nachher zeigt */
    if (rest === "/runde1" && (req.method === "POST" || req.method === "DELETE")) {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      const key = ["runde1", code, "stand"];
      if (req.method === "DELETE") {
        await kv.delete(key);
        return json({ ok: true });
      }
      const likes = await alleLikes(kv, code);
      const werte: Record<string, number> = { [PIN_ID]: likes.anzahl.get(PIN_ID) ?? 0 };
      const wer: Record<string, string[]> = {};
      for (const a of r.antworten ?? []) {
        werte[a.id] = likes.anzahl.get(a.id) ?? 0;
        wer[a.id] = [...likes.vonMir].filter(([, s]) => s.has(a.id)).map(([cid]) => cid);
      }
      const st: Runde1 = { ts: Date.now(), likes: werte, wer };
      await kv.set(key, st, { expireIn: LEBENSDAUER });
      return json({ ok: true, runde1: { ts: st.ts, likes: st.likes } });
    }

    /* Streitfall: Klarstellung der Moderation schreiben, ändern oder zurückziehen (nur Lehrkraft) */
    if (rest === "/klarstellung" && (req.method === "POST" || req.method === "DELETE")) {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      if (!r.kommentare) return fehler("Eine Klarstellung gibt es nur in Streitfall-Räumen.");
      const key = ["klarstellung", code, "text"];
      if (req.method === "DELETE") {
        await kv.delete(key);
        await loescheAlles(kv, ["likes", code, KLAR_ID]);
        return json({ ok: true, klarstellung: null });
      }
      const b = await leseBody(req);
      const text = mehrzeilig(b?.text, MAX_KLAR);
      if (!text) return fehler("Die Klarstellung ist leer.");
      const alt = (await kv.get<Klarstellung>(key)).value;
      const k: Klarstellung = { text, ts: alt?.ts ?? Date.now(), ...(alt ? { edited: Date.now() } : {}) };
      await kv.set(key, k, { expireIn: LEBENSDAUER });
      return json({ ok: true, klarstellung: { ...k, edited: k.edited ?? null } });
    }

    /* Streitfall: vorbereitete Eskalation live stellen oder zurücknehmen (nur Lehrkraft) */
    if (rest === "/eskalation" && (req.method === "POST" || req.method === "DELETE")) {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      if (!r.kommentare || !r.eskalation) return fehler("Für diesen Raum ist keine Eskalation vorbereitet.");
      const key = ["eskalation", code, "an"];
      if (req.method === "DELETE") {
        await kv.delete(key);
        await loescheAlles(kv, ["likes", code, ESK_ID]);
        for (const p of await allePosts(kv, code)) {
          if (p.zu !== ESK_ID) continue;
          await kv.delete(["posts", code, p.id]);
          await loescheAlles(kv, ["likes", code, p.id]);
        }
        return json({ ok: true, eskalation: { an: false, ts: null } });
      }
      const bisher = (await kv.get<{ ts: number }>(key)).value;
      const an = bisher ?? { ts: Date.now() };
      if (!bisher) await kv.set(key, an, { expireIn: LEBENSDAUER });
      return json({ ok: true, eskalation: { an: true, ts: an.ts } });
    }

    /* Streitfall: Verteilung der Infokarten öffnen, beenden oder zurücksetzen (nur Lehrkraft) */
    if (rest === "/karten" && (req.method === "POST" || req.method === "DELETE")) {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      if (!r.kommentare || !r.antworten?.length) return fehler("Infokarten gibt es nur in Streitfall-Räumen.");
      if (req.method === "DELETE") {
        await loescheAlles(kv, ["karten", code]);
        return json({ ok: true, status: null });
      }
      const b = await leseBody(req);
      const status: KartenStatus = b?.status === "zu" ? "zu" : "offen";
      await kv.set(["karten", code, "status"], status, { expireIn: LEBENSDAUER });
      return json({ ok: true, status });
    }

    /* Streitfall: Infokarte wählen (zu = ID der Antwort) oder Wahl zurücknehmen (zu = null) */
    if (rest === "/karte" && req.method === "POST") {
      if (!r.kommentare || !r.antworten?.length) return fehler("Infokarten gibt es nur in Streitfall-Räumen.");
      const b = await leseBody(req);
      const cid = einzeilig(b?.clientId, 64);
      if (!cid) return fehler("Gerätekennung fehlt.");
      const zu = b?.zu == null ? null : einzeilig(b.zu, 20);
      const key = ["karten", code, "wahl", cid];
      /* Optimistisch mit Versionszähler: Greifen zwei Geräte gleichzeitig nach der letzten Karte, gewinnt eines */
      for (let versuch = 0; versuch < 6; versuch++) {
        const st = await kv.get<KartenStatus>(["karten", code, "status"]);
        if (st.value !== "offen") return fehler("Die Infokarten werden gerade nicht verteilt.", 423);
        const v = await kv.get<number>(["karten", code, "v"]);
        const { wahl } = await kartenStand(kv, code);
        let op = kv.atomic().check(st).check(v).set(["karten", code, "v"], (v.value ?? 0) + 1, { expireIn: LEBENSDAUER });
        if (zu === null) op = op.delete(key);
        else {
          const n = aktiveGeraete(await alleGesehen(kv, code), Date.now());
          if (!karteFrei(kartenZaehlung(r, wahl), n, wahl.get(cid) ?? null, zu)) {
            return fehler("Diese Karte ist schon vergeben. Wähle eine andere Antwort.", 409);
          }
          op = op.set(key, zu, { expireIn: LEBENSDAUER });
        }
        if ((await op.commit()).ok) return json({ ok: true, meine: zu });
      }
      return fehler("Gerade wählen viele gleichzeitig. Tippe noch einmal.", 409);
    }

    /* Neuer Post */
    if (rest === "/posts" && req.method === "POST") {
      if (r.status !== "offen") return fehler("Posten ist gerade geschlossen.", 423);
      const b = await leseBody(req);
      if (!b) return fehler("Konnte den Post nicht lesen.");
      const text = mehrzeilig(b.text, 2000);
      const name = einzeilig(b.name, MAX_NAME) || "Anonym";
      const handle = sauberesHandle(b.handle);
      const cid = einzeilig(b.clientId, 64);

      if (!cid) return fehler("Gerätekennung fehlt.");
      if (!text) return fehler("Der Post ist leer.");
      if (analysiere(text).gewicht > 280) return fehler("Dein Post ist länger als 280 Zeichen.");
      if (!handleGueltig(handle) || handleReserviert(r, handle)) return fehler("Ungültiger Benutzername.");
      /* Im Notes-Modus gehört jeder Post als Note-Vorschlag zu einer Antwort */
      const zu = einzeilig(b.zu, 20);
      if (r.notes && !istAntwort(r, zu) && !(r.pinNotes && zu === PIN_ID)) {
        return fehler("Wähle die Antwort aus, zu der deine Community Note gehört.");
      }
      const zuRaum = zu === ESK_ID ? mitEskalation(r, await eskalationAn(kv, r)) : r;
      if (r.kommentare && !r.notes && !istAntwort(zuRaum, zu) && zu !== PIN_ID) {
        return fehler("Wähle aus, worauf du antwortest.");
      }
      if (r.notes && zu === PIN_ID && !(await urteileFrei(kv, r))) {
        return fehler("Das eigene Urteil zu dieser Frage ist noch nicht freigegeben.", 423);
      }
      if (!(await beanspruche(kv, code, handle, cid))) {
        return fehler("Diesen Benutzernamen hat hier schon jemand. Bitte ändere ihn im Profil.", 409);
      }

      /* Bremse pro Gerät. Den Zeitstempel selbst vergleichen – auf expireIn
         ist lokal kein Verlass, das räumt nur träge auf. */
      const bremse = await kv.get<number>(["lastpost", cid]);
      if (bremse.value && Date.now() - bremse.value < MIN_ABSTAND) {
        return fehler("Nicht so schnell – warte ein paar Sekunden.", 429);
      }
      const liste = await allePosts(kv, code);
      if (liste.length >= MAX_TOTAL) return fehler("Die Timeline ist voll.", 429);
      if (liste.filter((p) => p.clientId === cid).length >= MAX_PRO_GERAET) {
        return fehler(`Du hast schon ${MAX_PRO_GERAET} Posts abgesetzt. Bearbeite lieber einen davon.`, 429);
      }
      await kv.set(["lastpost", cid], Date.now(), { expireIn: 60_000 });

      const ts = Date.now();
      const p: Post = {
        id: `${ts}-${crypto.randomUUID().slice(0, 8)}`,
        name,
        handle,
        avatar: sauberesAvatar(b.avatar),
        text,
        ts,
        clientId: cid,
        ...(r.notes || r.kommentare ? { zu } : {}),
      };
      await kv.set(["posts", code, p.id], p, { expireIn: LEBENSDAUER });
      return json({ ok: true, id: p.id }, 201);
    }

    /* Alle Posts des Raums löschen – „Neue Runde" */
    if (rest === "/posts" && req.method === "DELETE") {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      await loescheRaumDaten(kv, code, false);
      /* Thread-Räume: Der Faden beginnt neu, die Antworten wirken wieder frisch */
      if (r.antworten?.length) {
        const vorlauf = Math.max(0, ...r.antworten.map((a) => a.nach)) * 60_000;
        await kv.set(["rooms", code], { ...r, pin: { ...r.pin, ts: Date.now() - vorlauf } });
      }
      return json({ ok: true });
    }

    /* Like setzen oder entfernen */
    const lk = rest.match(/^\/posts\/([\w.-]+)\/like$/);
    if (lk && req.method === "POST") {
      const id = lk[1];
      const b = await leseBody(req);
      const cid = einzeilig(b?.clientId, 64);
      if (!cid) return fehler("Gerätekennung fehlt.");
      const gibtEs = id === KLAR_ID
        ? !!(await kv.get(["klarstellung", code, "text"])).value
        : id === PIN_ID || istAntwort(r, id) || (id === ESK_ID && !!(await eskalationAn(kv, r))) ||
          !!(await kv.get(["posts", code, id])).value;
      if (!gibtEs) return fehler("Diesen Post gibt es nicht mehr.", 404);
      if (b?.like === false) await kv.delete(["likes", code, id, cid]);
      else await kv.set(["likes", code, id, cid], true, { expireIn: LEBENSDAUER });
      return json({ ok: true });
    }

    /* Einzelnen Post bearbeiten, moderieren oder löschen */
    const pm = rest.match(/^\/posts\/([\w.-]+)$/);
    if (pm) {
      const id = pm[1];
      const eintrag = await kv.get<Post>(["posts", code, id]);
      if (!eintrag.value) return fehler("Diesen Post gibt es nicht mehr.", 404);
      const p = eintrag.value;

      if (req.method === "DELETE") {
        const cid = einzeilig(url.searchParams.get("clientId"), 64);
        if (!lehrer && !(cid && p.clientId === cid)) return fehler("Das darfst du nicht löschen.", 403);
        await kv.delete(["posts", code, id]);
        await loescheAlles(kv, ["likes", code, id]);
        return json({ ok: true });
      }

      if (req.method === "PUT") {
        if (r.status !== "offen") return fehler("Posten ist gerade geschlossen.", 423);
        const b = await leseBody(req);
        const cid = einzeilig(b?.clientId, 64);
        if (!(cid && p.clientId === cid)) return fehler("Das darfst du nicht bearbeiten.", 403);
        if (p.live) return fehler("Diese Note ist schon live. Wenn du sie ändern willst, frag deine Lehrkraft.", 409);
        const text = mehrzeilig(b?.text, 2000);
        if (!text) return fehler("Der Post ist leer.");
        if (analysiere(text).gewicht > 280) return fehler("Dein Post ist länger als 280 Zeichen.");
        await kv.set(["posts", code, id], { ...p, text, edited: Date.now() }, { expireIn: LEBENSDAUER });
        return json({ ok: true });
      }

      if (req.method === "PATCH") {
        if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
        const b = await leseBody(req);
        if (!b) return fehler("Konnte die Anfrage nicht lesen.");
        const neu: Post = { ...p };
        if (typeof b.hidden === "boolean") neu.hidden = b.hidden;
        if (typeof b.live === "boolean" && p.zu) neu.live = b.live;
        if ("badge" in b) neu.badge = b.badge === "ok" || b.badge === "fehler" ? b.badge : null;
        if (Array.isArray(b.checks)) neu.checks = b.checks.map((c) => einzeilig(c, 60)).filter(Boolean).slice(0, 20);
        await kv.set(["posts", code, id], neu, { expireIn: LEBENSDAUER });
        return json({ ok: true });
      }
    }
    return fehler("Unbekannte Anfrage.", 404);
  }

  if (pfad.startsWith("/api/")) return fehler("Unbekannte Anfrage.", 404);
  if (req.method !== "GET") return new Response("Nicht erlaubt", { status: 405 });

  /* Lehrer-Link mit falschem oder fehlendem Token: sagen, woran es liegt,
     statt stillschweigend die Schülerseite zu zeigen */
  if (url.searchParams.has("lehrer") && !lehrer && (pfad === "/" || pfad.startsWith("/r/") || /^\/rolle(\/[A-Za-z0-9]{4})?\/?$/.test(pfad))) {
    const grund = !LEHRER_TOKEN
      ? "Auf dem Server ist <b>kein LEHRER_TOKEN</b> eingetragen. In der Deno-Console unter <i>Settings → Environment Variables</i> anlegen – für <b>Production</b> – und danach neu deployen."
      : diagnose(url);
    return new Response(
      `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Lehrer-Link ungültig</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px">
<div style="max-width:520px"><h1 style="font-size:26px;margin:0 0 12px">Lehrer-Link ungültig</h1>
<p style="color:#b0b5ba;line-height:1.5;margin:0 0 20px">${grund}</p>
<a href="/" style="color:#1d9bf0">Zur Schüler-Startseite</a></div></body></html>`,
      { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  /* Seiten: Startseite mit Code-Eingabe bzw. Verwaltung, Raum bzw. Wand */
  if (pfad === "/") return await statisch(lehrer ? "verwaltung.html" : "start.html");
  if (/^\/r\/[a-z0-9-]{3,20}\/?$/.test(pfad)) return await statisch(lehrer ? "lehrer.html" : "index.html");
  if (/^\/r\/[A-Za-z0-9-]{3,20}\/?$/.test(pfad)) {
    return Response.redirect(new URL(pfad.toLowerCase() + url.search, url), 302);
  }
  /* Hörseiten zu Arbeitsblättern: /hoeren/<name> zeigt public/hoeren/<name>.html */
  const hoeren = pfad.match(/^\/hoeren\/([a-z0-9-]{3,40})\/?$/);
  if (hoeren) return await statisch(`hoeren/${hoeren[1]}.html`);
  if (pfad.endsWith(".html")) return new Response("Nicht gefunden", { status: 404 });
  return await statisch(pfad.replace(/^\/+/, ""));
});
