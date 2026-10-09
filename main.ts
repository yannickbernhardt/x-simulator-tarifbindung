/*
 * X-Simulator – Posting-Übung im X-Look für beliebige Klassen und Aufgaben
 *
 * Jede Klasse/Aufgabe ist ein „Raum" mit eigener Adresse /r/<code>, eigenem
 * angehefteten Aufgaben-Post und eigener Timeline. Die Lehrkraft verwaltet die
 * Räume unter /?lehrer=<TOKEN> und zeigt die Wand unter /r/<code>?lehrer=<TOKEN>.
 * Läuft auf Deno Deploy, alles liegt in Deno KV.
 */

import { analysiere } from "./public/zaehlen.js";

const LEHRER_TOKEN = Deno.env.get("LEHRER_TOKEN") ?? "";

/* Notschalter für die ganze Seite: auf true setzen und pushen.
   Einzelne Räume schließt man besser in der Verwaltung. */
const DEAKTIVIERT = false;

const MAX_NAME = 50;
const MAX_TOTAL = 300; // Posts pro Raum
const MAX_PRO_GERAET = 5; // Posts pro Gerät und Raum
const MIN_ABSTAND = 5000; // ms zwischen zwei Posts desselben Geräts
const LEBENSDAUER = 14 * 24 * 60 * 60 * 1000; // Posts, Likes, Namen laufen danach ab
const RESERVIERT = ["admin", "lehrer", "lehrerin", "lehrkraft", "x", "elonmusk"];
const PIN_ID = "pinned";
const BILD_TEIL = 60_000; // KV-Werte dürfen höchstens 64 KiB groß sein
const BILD_MAX = 2_000_000;
const BILD_TYPEN = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

/* Bewusst pro Gerät (clientId), nicht pro IP: im Schul-WLAN teilen sich
   alle Schüler*innen dieselbe öffentliche IP. */

type Status = "offen" | "pausiert" | "geschlossen";
/* Vorbereitete Antworten unter dem angehefteten Post (Thread-Räume).
   nach = Minuten nach dem angehefteten Post, daraus entsteht die Zeitangabe. */
type Antwort = { id: string; name: string; handle: string; e: string; c: string; text: string; nach: number };
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
  zu?: string; // Community Note: ID der Antwort, zu der die Note gehört
  live?: boolean; // Community Note: von der Lehrkraft live geschaltet
};

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
    ...(alt?.antworten?.length ? { antworten: alt.antworten, notes: !!alt.notes } : {}),
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
  };
  return lehrer ? { ...basis, kriterien: r.kriterien, zahlen: r.zahlen, eh: r.eh } : basis;
}

function istAntwort(r: Raum, id: string): boolean {
  return (r.antworten ?? []).some((a) => a.id === id);
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
  for (const p of ["posts", "likes", "handles", "seen"]) await loescheAlles(kv, [p, code]);
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
    (r.antworten ?? []).some((a) => a.handle.toLowerCase() === k);
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
    const neu: Raum = {
      ...da.value,
      eh: v.eh,
      kriterien: v.kriterien,
      zahlen: v.zahlen,
      ...(v.antworten ? { antworten: v.antworten, notes: !!v.notes } : {}),
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
      const meine = likes.vonMir.get(cid) ?? new Set<string>();
      const aufrufe = (ts: number) => gesehen.filter((s) => s >= ts).length;

      return json({
        now: jetzt,
        lehrer,
        raum: raumOeffentlich(r, lehrer),
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
          })),
        pinned: { likes: likes.anzahl.get(PIN_ID) ?? 0, liked: meine.has(PIN_ID), views: gesehen.length },
        antwortStand: (r.antworten ?? []).map((a) => ({
          id: a.id,
          likes: likes.anzahl.get(a.id) ?? 0,
          liked: meine.has(a.id),
          views: Math.max(1, aufrufe(r.pin.ts + a.nach * 60_000)),
        })),
        geraete: gesehen.length,
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
      if (r.notes && !istAntwort(r, zu)) return fehler("Wähle die Antwort aus, zu der deine Community Note gehört.");
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
        ...(r.notes ? { zu } : {}),
      };
      await kv.set(["posts", code, p.id], p, { expireIn: LEBENSDAUER });
      return json({ ok: true, id: p.id }, 201);
    }

    /* Alle Posts des Raums löschen – „Neue Runde" */
    if (rest === "/posts" && req.method === "DELETE") {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      await loescheRaumDaten(kv, code, false);
      return json({ ok: true });
    }

    /* Like setzen oder entfernen */
    const lk = rest.match(/^\/posts\/([\w.-]+)\/like$/);
    if (lk && req.method === "POST") {
      const id = lk[1];
      const b = await leseBody(req);
      const cid = einzeilig(b?.clientId, 64);
      if (!cid) return fehler("Gerätekennung fehlt.");
      if (id !== PIN_ID && !istAntwort(r, id) && !(await kv.get(["posts", code, id])).value) {
        return fehler("Diesen Post gibt es nicht mehr.", 404);
      }
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
  if (url.searchParams.has("lehrer") && !lehrer && (pfad === "/" || pfad.startsWith("/r/"))) {
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
