/*
 * „Herzblatt“ – anonyme Gruppenwahl
 *
 * Schüler*innen öffnen /gruppen/<code> (QR-Code am Beamer), geben ihren Vornamen ein und bekommen einen
 * zufälligen Decknamen mit zufällig aussehender Figur. Sie füllen ein kurzes Profil aus (vier Fragen zur
 * Gruppenarbeit, zwei zum Spaß) und ziehen ihre Figur danach an einen Tisch – nur nach den Profilen der anderen.
 * Beim Auflösen stehen die Vornamen unter den Figuren. Vorher verlässt kein Vorname den Server.
 * Die Lehrkraft steuert am Beamer unter /gruppen/<code>?lehrer=<TOKEN>; der Token steht nie im QR-Code.
 * Gespeichert wird nur der Vorname. Alles liegt in Deno KV und läuft nach 12 Stunden ab.
 *
 * Sparsam mit KV-Lesezugriffen: Raum pro Instanz kurz zwischengespeichert, Teilnehmende und Sitzplan
 * werden nur neu gelesen, wenn sich der Versionsschlüssel ["gruppen",code,"v"] geändert hat.
 * Der Sitzplan liegt in einem Schlüssel und wird mit kv.atomic() geschrieben, damit zwei Personen
 * nie denselben letzten Platz bekommen.
 */

import { ADJEKTIVE, ANZAHL_NAMEN, AUSSEHEN, deckname, FRAGEN, NOMEN, profilOk } from "./public/gruppen/daten.js";

const ABLAUF = 12 * 60 * 60 * 1000;
const RAUM_CACHE_MS = 700;
const MAX_TEILNEHMER = 60;
const PHASEN = ["anmelden", "wahl", "aufloesen"];
const TISCHE = { min: 2, max: 8, start: 6 };
const PLAETZE = { min: 2, max: 6, start: 4 };

type Aussehen = Record<string, number>;
type Profil = Record<string, string>;
type Raum = {
  code: string;
  phase: string;
  tische: number;
  plaetze: number;
  rev: number; // steigt bei jeder Änderung durch die Lehrkraft
  erstellt: number;
  namenStart: number;
  namenSchritt: number;
  farbStart: number;
};
type Teilnehmer = { pid: string; fid: string; nr: number; name: string; vorname: string; aussehen: Aussehen; profil: Profil | null; beigetreten: number };
type Sitze = Record<string, [number, number]>; // fid -> [Tisch, Platz]

type Helfer = {
  statisch: (rel: string) => Promise<Response>;
  json: (body: unknown, status?: number) => Response;
  fehler: (text: string, status?: number) => Response;
  leseBody: (req: Request) => Promise<Record<string, unknown> | null>;
  kvFehlt: () => Response;
};

const ZEICHEN = "abcdefghjkmnpqrstuvwxyz23456789";
function zufall(n: number): string {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => ZEICHEN[x % ZEICHEN.length]).join("");
}
const zufallsZahl = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const ggT = (a: number, b: number): number => (b ? ggT(b, a % b) : a);
const codeOk = (c: string) => /^[a-z0-9]{4}$/.test(c);
const pidOk = (p: unknown): p is string => typeof p === "string" && /^[a-z0-9]{12}$/.test(p);
/* Vorname: höchstens 20 Zeichen, keine Steuerzeichen, mindestens ein Buchstabe */
function vornameAus(roh: unknown): string | null {
  const v = String(roh ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return /\p{L}/u.test(v) ? v : null;
}
const k = {
  raum: (c: string) => ["gruppen", c],
  version: (c: string) => ["gruppen", c, "v"],
  zaehler: (c: string) => ["gruppen", c, "n"],
  sitze: (c: string) => ["gruppen", c, "s"],
  tn: (c: string, pid: string) => ["gruppen", c, "p", pid],
};
const versionHoch = (code: string) => [k.version(code), Date.now(), { expireIn: ABLAUF }] as const;
const warte = () => new Promise((ok) => setTimeout(ok, 5 + Math.random() * 40));

/* Schrittweite für die Decknamen: teilerfremd zur Anzahl, und Adjektiv und Nomen wechseln jedes Mal */
function namenSchritt(): number {
  const nomen = NOMEN.length;
  for (;;) {
    const s = (3 + zufallsZahl(25)) * nomen + 5 + zufallsZahl(40);
    if (ggT(s, ANZAHL_NAMEN) === 1 && ggT(s % nomen, nomen) === 1 && ggT(Math.floor(s / nomen), ADJEKTIVE.length) === 1) return s;
  }
}

/* ---------- Zwischenspeicher dieser Instanz ---------- */
const raumCache = new Map<string, { zeit: number; raum: Raum | null }>();
type Stamm = { vs: string | null; leute: Teilnehmer[]; sitze: Sitze; zeit: number };
const stammCache = new Map<string, Stamm>();
const fidVon = new Map<string, string>(); // `${code}:${pid}` -> fid
function aufraeumen() {
  const grenze = Date.now() - ABLAUF;
  for (const [c, s] of stammCache) if (s.zeit < grenze) stammCache.delete(c);
  for (const [c, r] of raumCache) if (r.zeit < grenze) raumCache.delete(c);
  if (fidVon.size > 5000) fidVon.clear();
}

async function holeRaum(kv: Deno.Kv, code: string): Promise<Raum | null> {
  if (!codeOk(code)) return null;
  const raum = (await kv.get<Raum>(k.raum(code))).value;
  raumCache.set(code, { zeit: Date.now(), raum });
  return raum;
}
async function raumGecacht(kv: Deno.Kv, code: string): Promise<Raum | null> {
  const c = raumCache.get(code);
  if (c && Date.now() - c.zeit < RAUM_CACHE_MS) return c.raum;
  return await holeRaum(kv, code);
}
async function speichereRaum(kv: Deno.Kv, raum: Raum) {
  await kv.set(k.raum(raum.code), raum, { expireIn: ABLAUF });
  raumCache.set(raum.code, { zeit: Date.now(), raum });
}

async function stammdaten(kv: Deno.Kv, code: string): Promise<Stamm> {
  const vs = (await kv.get(k.version(code))).versionstamp;
  const c = stammCache.get(code);
  if (c && c.vs === vs) return c;
  const leute: Teilnehmer[] = [];
  for await (const e of kv.list<Teilnehmer>({ prefix: ["gruppen", code, "p"] })) leute.push(e.value);
  leute.sort((a, b) => a.nr - b.nr);
  const sitze = (await kv.get<Sitze>(k.sitze(code))).value ?? {};
  const neu = { vs, leute, sitze, zeit: Date.now() };
  stammCache.set(code, neu);
  for (const t of leute) fidVon.set(`${code}:${t.pid}`, t.fid);
  return neu;
}

/* Sitzplan ändern: alles in einem Schlüssel, mit Prüfung gegen gleichzeitige Änderungen */
async function aendereSitze(kv: Deno.Kv, code: string, aendern: (m: Sitze) => string | null): Promise<string | null> {
  for (let i = 0; i < 14; i++) {
    const e = await kv.get<Sitze>(k.sitze(code));
    const m: Sitze = { ...(e.value ?? {}) };
    const problem = aendern(m);
    if (problem === "gleich") return null;
    if (problem) return problem;
    const r = await kv.atomic().check(e).set(k.sitze(code), m, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    if (r.ok) return null;
    await warte();
  }
  return "Gerade setzen sich sehr viele gleichzeitig. Bitte noch einmal tippen.";
}

function raumOeffentlich(r: Raum) {
  return { code: r.code, phase: r.phase, tische: r.tische, plaetze: r.plaetze, rev: r.rev };
}

export async function gruppenRoute(req: Request, url: URL, pfad: string, lehrer: boolean, kv: Deno.Kv | null, h: Helfer): Promise<Response | null> {
  /* ---------- Seiten ---------- */
  if (req.method === "GET" && /^\/gruppen(\/[A-Za-z0-9]{4})?\/?$/.test(pfad) && url.searchParams.has("lehrer") && !lehrer) return null;
  if (req.method === "GET" && (pfad === "/gruppen" || pfad === "/gruppen/")) {
    return await h.statisch(lehrer ? "gruppen/beamer.html" : "gruppen/start.html");
  }
  const seite = pfad.match(/^\/gruppen\/([A-Za-z0-9]{4})\/?$/);
  if (req.method === "GET" && seite) {
    const code = seite[1].toLowerCase();
    if (code !== seite[1]) return Response.redirect(new URL(`/gruppen/${code}${url.search}`, url), 302);
    return await h.statisch(lehrer ? "gruppen/beamer.html" : "gruppen/schueler.html");
  }

  if (!pfad.startsWith("/api/gruppen")) return null;
  if (!kv) return h.kvFehlt();
  aufraeumen();

  /* ---------- Neue Gruppenwahl (Lehrkraft) ---------- */
  if (pfad === "/api/gruppen" && req.method === "POST") {
    if (!lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
    let code = "";
    do code = zufall(4); while (await holeRaum(kv, code));
    const raum: Raum = {
      code, phase: "anmelden", tische: TISCHE.start, plaetze: PLAETZE.start, rev: 1, erstellt: Date.now(),
      namenStart: zufallsZahl(ANZAHL_NAMEN), namenSchritt: namenSchritt(), farbStart: zufallsZahl(AUSSEHEN.f),
    };
    await speichereRaum(kv, raum);
    await kv.set(...versionHoch(code));
    return h.json({ code }, 201);
  }

  const m = pfad.match(/^\/api\/gruppen\/([a-z0-9]{4})\/([a-z]+)$/);
  if (!m) return h.fehler("Unbekannte Anfrage.", 404);
  const [, code, aktion] = m;
  if (aktion === "steuer" && !lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
  const raum = aktion === "steuer" ? await holeRaum(kv, code) : await raumGecacht(kv, code);
  if (!raum) return h.fehler("Diesen Raum gibt es nicht (mehr). Bitte den Code prüfen.", 404);

  /* ---------- Stand für Beamer und Handys (nur öffentliche Angaben, keine Geräte-IDs).
     Vornamen gibt es erst nach dem Auflösen – vorher stehen sie in keiner Antwort. ---------- */
  if (aktion === "stand" && req.method === "GET") {
    const stamm = await stammdaten(kv, code);
    const sig = `${raum.rev}.${stamm.vs}`;
    if (url.searchParams.get("sig") === sig) return h.json({ gleich: true, sig });
    const aufgeloest = raum.phase === "aufloesen";
    return h.json({
      raum: raumOeffentlich(raum),
      leute: stamm.leute.map((t) => ({
        fid: t.fid, name: t.name, aussehen: t.aussehen, profil: t.profil,
        tisch: stamm.sitze[t.fid]?.[0] ?? null, platz: stamm.sitze[t.fid]?.[1] ?? null,
        ...(aufgeloest ? { vorname: t.vorname } : {}),
      })),
      sig,
    });
  }

  /* ---------- Lehrkraft: Steuerung ---------- */
  if (aktion === "steuer" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (!b) return h.fehler("Konnte die Anfrage nicht lesen.");
    const neu: Raum = { ...raum, rev: (raum.rev ?? 1) + 1 };
    if (typeof b.phase === "string" && PHASEN.includes(b.phase)) neu.phase = b.phase;
    let groesse = false;
    if (Number.isInteger(b.tische)) {
      neu.tische = Math.min(TISCHE.max, Math.max(TISCHE.min, b.tische as number));
      groesse = true;
    }
    if (Number.isInteger(b.plaetze)) {
      neu.plaetze = Math.min(PLAETZE.max, Math.max(PLAETZE.min, b.plaetze as number));
      groesse = true;
    }
    await speichereRaum(kv, neu);
    /* Wer an einem weggefallenen Tisch oder Platz saß, steht wieder am Eingang */
    if (groesse) {
      const problem = await aendereSitze(kv, code, (s) => {
        let geaendert = false;
        for (const [fid, [t, p]] of Object.entries(s)) {
          if (t > neu.tische || p >= neu.plaetze) { delete s[fid]; geaendert = true; }
        }
        return geaendert ? null : "gleich";
      });
      if (problem) return h.fehler(problem, 503);
    }
    return h.json({ raum: raumOeffentlich(neu) });
  }

  /* ---------- Schüler*innen ---------- */
  if (aktion === "beitreten" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (pidOk(b?.pid)) {
      const alt = (await kv.get<Teilnehmer>(k.tn(code, b!.pid as string))).value;
      if (alt) return h.json({ pid: alt.pid, fid: alt.fid, name: alt.name, vorname: alt.vorname, aussehen: alt.aussehen, profil: alt.profil });
    }
    const vorname = vornameAus(b?.vorname);
    if (!vorname) return h.json({ error: "Bitte deinen Vornamen eingeben.", brauchtName: true }, 400);
    const pid = zufall(12), fid = zufall(8);
    for (let i = 0; i < 12; i++) {
      const zaehler = await kv.get<number>(k.zaehler(code));
      const nr = zaehler.value ?? 0;
      if (nr >= MAX_TEILNEHMER) return h.fehler("Hier sind schon alle Plätze vergeben.", 409);
      const aussehen: Aussehen = {};
      for (const [teil, n] of Object.entries(AUSSEHEN)) aussehen[teil] = zufallsZahl(n as number);
      aussehen.f = (raum.farbStart + nr * 5) % AUSSEHEN.f; // Farben gut gemischt: 5 ist teilerfremd zu 12
      const name = deckname((raum.namenStart + nr * raum.namenSchritt) % ANZAHL_NAMEN);
      const t: Teilnehmer = { pid, fid, nr, name, vorname, aussehen, profil: null, beigetreten: Date.now() };
      const r = await kv.atomic().check(zaehler)
        .set(k.zaehler(code), nr + 1, { expireIn: ABLAUF })
        .set(k.tn(code, pid), t, { expireIn: ABLAUF })
        .set(...versionHoch(code)).commit();
      if (r.ok) {
        fidVon.set(`${code}:${pid}`, fid);
        return h.json({ pid, fid, name, vorname, aussehen, profil: null }, 201);
      }
      await warte();
    }
    return h.fehler("Gerade kommen sehr viele gleichzeitig. Bitte noch einmal versuchen.", 503);
  }

  const b = await h.leseBody(req);
  if (!b || !pidOk(b.pid)) return h.fehler("Bitte die Seite neu laden.", 400);
  const pid = b.pid as string;

  if (aktion === "profil" && req.method === "POST") {
    if (raum.phase !== "anmelden" && raum.phase !== "wahl") return h.fehler("Die Profile sind jetzt fest.", 409);
    const roh = (b.profil ?? {}) as Record<string, unknown>;
    const profil: Profil = {};
    for (const f of FRAGEN) profil[f.id] = String(roh[f.id] ?? "");
    if (!profilOk(profil)) return h.fehler("Bitte alle Fragen beantworten.");
    const t = (await kv.get<Teilnehmer>(k.tn(code, pid))).value;
    if (!t) return h.fehler("Du bist hier nicht angemeldet. Bitte die Seite neu laden.", 404);
    await kv.atomic().set(k.tn(code, pid), { ...t, profil }, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    return h.json({ ok: true });
  }

  if (aktion === "setzen" && req.method === "POST") {
    if (raum.phase !== "wahl") return h.fehler("Die Tische sind gerade nicht offen.", 409);
    const tisch = Number(b.tisch);
    if (!Number.isInteger(tisch) || tisch < 0 || tisch > raum.tische) return h.fehler("Diesen Tisch gibt es nicht.");
    let fid = fidVon.get(`${code}:${pid}`);
    if (!fid || tisch > 0) {
      const t = (await kv.get<Teilnehmer>(k.tn(code, pid))).value;
      if (!t) return h.fehler("Du bist hier nicht angemeldet. Bitte die Seite neu laden.", 404);
      if (tisch > 0 && !t.profil) return h.fehler("Bitte erst das Profil ausfüllen.", 409);
      fid = t.fid;
      fidVon.set(`${code}:${pid}`, fid);
    }
    const ich = fid;
    const problem = await aendereSitze(kv, code, (s) => {
      if (tisch === 0) {
        if (!(ich in s)) return "gleich";
        delete s[ich];
        return null;
      }
      if (s[ich]?.[0] === tisch && s[ich][1] < raum.plaetze) return "gleich";
      const belegt = new Set(Object.entries(s).filter(([f, [t]]) => t === tisch && f !== ich).map(([, [, p]]) => p));
      let platz = -1;
      for (let p = 0; p < raum.plaetze; p++) if (!belegt.has(p)) { platz = p; break; }
      if (platz < 0) return "voll";
      s[ich] = [tisch, platz];
      return null;
    });
    if (problem === "voll") return h.fehler("Der Tisch ist schon voll.", 409);
    if (problem) return h.fehler(problem, 503);
    return h.json({ ok: true });
  }

  return h.fehler("Unbekannte Anfrage.", 404);
}
