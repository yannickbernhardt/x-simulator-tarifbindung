/*
 * „Alle ziehen an Finn“ – Live-Spiel zur Rollentheorie nach Dahrendorf
 *
 * Schüler*innen öffnen /rolle/<code> (QR-Code am Beamer), bekommen eine Bezugsgruppe
 * und ziehen per Knopf an Finn. Die Lehrkraft steuert die Phasen am Beamer unter
 * /rolle/<code>?lehrer=<TOKEN>; der Token steht nie im QR-Code der Klasse.
 * Es werden keine Namen erhoben. Alles liegt in Deno KV und läuft nach 12 Stunden ab.
 *
 * Sparsam mit KV-Lesezugriffen (Free-Plan): Der Raum wird pro Instanz kurz zwischengespeichert,
 * Teilnehmerdaten liest der Beamer nur neu, wenn sich der Versionsschlüssel ["rolle",code,"v"]
 * geändert hat, und Züge liegen in neun kleinen Schlüsseln (einer pro Bezugsgruppe).
 */

import { konfliktArt, PHASEN, SZENARIO } from "./public/rolle/szenario.js";

const ABLAUF = 12 * 60 * 60 * 1000;
const ZUG_DAUER = 10_000; // ms; das Handy frischt alle 4 s auf und meldet das Loslassen sofort
const RAUM_CACHE_MS = 700;
const MAX_TEILNEHMER = 60;
const MAX_BEISPIELE = 80;
const MAX_BEISPIEL_LAENGE = 300;
const REIHENFOLGE = ["zeit", "fahrlehrer", "schweigen", "clique", "kinder", "team", "trainer", "eltern", "schule"];
const KNOTEN_IDS: string[] = SZENARIO.knoten.map((k: { id: string }) => k.id);

type Frage = { typ: "vor" | "bsp"; id: string };
type Raum = {
  code: string;
  phase: string;
  spot: string | null; // hervorgehobene Bezugsgruppe
  quiz: Frage | null;
  quizZeigen: boolean; // Ergebnis/Lösung der aktuellen Quizfrage zeigen
  loesung: boolean; // Auflösung beim Einordnen
  runde: number; // steigt beim Zurücksetzen, damit Handys ihre Antworten verwerfen
  erstellt: number;
};
type Teilnehmer = {
  pid: string;
  knoten: string;
  beigetreten: number;
  wahl: string | null;
  quiz: Record<string, string>;
};
type Beispiel = { bid: string; text: string; ts: number; pid: string };

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
const codeOk = (c: string) => /^[a-z0-9]{4}$/.test(c);
const pidOk = (p: unknown): p is string => typeof p === "string" && /^[a-z0-9]{12}$/.test(p);
const frageSchluessel = (f: Frage | null) => (f ? `${f.typ}:${f.id}` : "");
const k = {
  raum: (c: string) => ["rolle", c],
  version: (c: string) => ["rolle", c, "v"],
  zaehler: (c: string) => ["rolle", c, "n"],
  tn: (c: string, pid: string) => ["rolle", c, "p", pid],
  bsp: (c: string, bid: string) => ["rolle", c, "b", bid],
  zug: (c: string, knoten: string) => ["rolle", c, "z", knoten],
};

/* ---------- Zwischenspeicher dieser Instanz ---------- */
type BspText = { id: string; text: string } | null;
type RaumCache = { zeit: number; raum: Raum | null; bspText: BspText };
const raumCache = new Map<string, RaumCache>();
type Stamm = { vs: string | null; tn: Teilnehmer[]; bsp: Beispiel[]; zeit: number };
const stammCache = new Map<string, Stamm>();
const knotenVon = new Map<string, string>(); // `${code}:${pid}` -> knoten
function aufraeumen() {
  const grenze = Date.now() - ABLAUF;
  for (const [c, s] of stammCache) if (s.zeit < grenze) stammCache.delete(c);
  for (const [c, r] of raumCache) if (r.zeit < grenze) raumCache.delete(c);
  if (knotenVon.size > 5000) knotenVon.clear();
}

async function holeRaum(kv: Deno.Kv, code: string): Promise<Raum | null> {
  if (!codeOk(code)) return null;
  const r = (await kv.get<Raum>(k.raum(code))).value;
  raumCache.set(code, { zeit: Date.now(), raum: r, bspText: raumCache.get(code)?.bspText ?? null });
  return r;
}
/* Für die vielen Handy-Abfragen: Raum höchstens alle 0,7 s neu lesen */
async function raumGecacht(kv: Deno.Kv, code: string): Promise<RaumCache> {
  const c = raumCache.get(code);
  if (c && Date.now() - c.zeit < RAUM_CACHE_MS) return c;
  if (!codeOk(code)) return { zeit: Date.now(), raum: null, bspText: null };
  const raum = (await kv.get<Raum>(k.raum(code))).value;
  let bspText = c?.bspText ?? null;
  if (raum?.phase === "quiz" && raum.quiz?.typ === "bsp") {
    if (bspText?.id !== raum.quiz.id) {
      const b = (await kv.get<Beispiel>(k.bsp(code, raum.quiz.id))).value;
      bspText = b ? { id: b.bid, text: b.text } : null;
    }
  } else bspText = null;
  const neu = { zeit: Date.now(), raum, bspText };
  raumCache.set(code, neu);
  return neu;
}
async function speichereRaum(kv: Deno.Kv, raum: Raum) {
  await kv.set(k.raum(raum.code), raum, { expireIn: ABLAUF });
  const alt = raumCache.get(raum.code);
  raumCache.set(raum.code, { zeit: Date.now(), raum, bspText: alt?.bspText ?? null });
}

async function alleTeilnehmer(kv: Deno.Kv, code: string): Promise<Teilnehmer[]> {
  const liste: Teilnehmer[] = [];
  for await (const e of kv.list<Teilnehmer>({ prefix: ["rolle", code, "p"] })) liste.push(e.value);
  return liste;
}
async function alleBeispiele(kv: Deno.Kv, code: string): Promise<Beispiel[]> {
  const liste: Beispiel[] = [];
  for await (const e of kv.list<Beispiel>({ prefix: ["rolle", code, "b"] })) liste.push(e.value);
  return liste.sort((a, b) => a.ts - b.ts);
}
/* Teilnehmer und Beispiele nur neu lesen, wenn sich etwas geändert hat */
async function stammdaten(kv: Deno.Kv, code: string): Promise<Stamm> {
  const vs = (await kv.get(k.version(code))).versionstamp;
  const c = stammCache.get(code);
  if (c && c.vs === vs) return c;
  const [tn, bsp] = await Promise.all([alleTeilnehmer(kv, code), alleBeispiele(kv, code)]);
  const neu = { vs, tn, bsp, zeit: Date.now() };
  stammCache.set(code, neu);
  for (const t of tn) knotenVon.set(`${code}:${t.pid}`, t.knoten);
  return neu;
}
const versionHoch = (code: string) => [k.version(code), Date.now(), { expireIn: ABLAUF }] as const;

/* Zug eintragen: kleiner Schlüssel pro Bezugsgruppe, mit Prüfung gegen gleichzeitige Änderungen */
async function setzeZug(kv: Deno.Kv, code: string, knoten: string, pid: string, an: boolean): Promise<boolean> {
  const schluessel = k.zug(code, knoten);
  for (let i = 0; i < 8; i++) {
    const e = await kv.get<Record<string, number>>(schluessel);
    const jetzt = Date.now();
    const m: Record<string, number> = {};
    for (const [p, t] of Object.entries(e.value ?? {})) if (t > jetzt && p !== pid) m[p] = t;
    if (an) m[pid] = jetzt + ZUG_DAUER;
    const r = await kv.atomic().check(e).set(schluessel, m, { expireIn: ABLAUF }).commit();
    if (r.ok) return true;
  }
  return false;
}
async function zugStand(kv: Deno.Kv, code: string): Promise<Record<string, number>> {
  const eintraege = await kv.getMany<Record<string, number>[]>(KNOTEN_IDS.map((id) => k.zug(code, id)));
  const jetzt = Date.now();
  const aktiv: Record<string, number> = {};
  KNOTEN_IDS.forEach((id, i) => (aktiv[id] = Object.values(eintraege[i].value ?? {}).filter((t) => t > jetzt).length));
  return aktiv;
}

function quizText(raum: Raum, bspText: BspText) {
  const f = raum.quiz;
  if (!f) return null;
  if (f.typ === "vor") {
    const q = SZENARIO.quiz.find((x: { id: string }) => x.id === f.id);
    return q ? { schluessel: frageSchluessel(f), text: q.text, loesung: raum.quizZeigen ? q.loesung : null, warum: raum.quizZeigen ? q.warum : null, eigen: false } : null;
  }
  return bspText && bspText.id === f.id ? { schluessel: frageSchluessel(f), text: bspText.text, loesung: null, warum: null, eigen: true } : null;
}

export async function rolleRoute(req: Request, url: URL, pfad: string, lehrer: boolean, kv: Deno.Kv | null, h: Helfer): Promise<Response | null> {
  /* ---------- Seiten ---------- */
  /* Lehrer-Link mit falschem Token: main.ts erklärt, woran es liegt */
  if (req.method === "GET" && /^\/rolle(\/[A-Za-z0-9]{4})?\/?$/.test(pfad) && url.searchParams.has("lehrer") && !lehrer) return null;
  if (req.method === "GET" && (pfad === "/rolle" || pfad === "/rolle/")) {
    return await h.statisch(lehrer ? "rolle/beamer.html" : "rolle/start.html");
  }
  const seite = pfad.match(/^\/rolle\/([A-Za-z0-9]{4})\/?$/);
  if (req.method === "GET" && seite) {
    const code = seite[1].toLowerCase();
    if (code !== seite[1]) return Response.redirect(new URL(`/rolle/${code}${url.search}`, url), 302);
    return await h.statisch(lehrer ? "rolle/beamer.html" : "rolle/schueler.html");
  }

  if (!pfad.startsWith("/api/rolle")) return null;
  if (!kv) return h.kvFehlt();
  aufraeumen();

  /* ---------- Neuer Raum (Lehrkraft) ---------- */
  if (pfad === "/api/rolle" && req.method === "POST") {
    if (!lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
    let code = "";
    do code = zufall(4); while (await holeRaum(kv, code));
    const raum: Raum = { code, phase: "anmelden", spot: null, quiz: null, quizZeigen: false, loesung: false, runde: 1, erstellt: Date.now() };
    await speichereRaum(kv, raum);
    await kv.set(...versionHoch(code));
    return h.json({ code }, 201);
  }

  const m = pfad.match(/^\/api\/rolle\/([a-z0-9]{4})\/([a-z]+)$/);
  if (!m) return h.fehler("Unbekannte Anfrage.", 404);
  const [, code, aktion] = m;
  const istLehrerAktion = aktion === "lehrer" || aktion === "steuer";
  if (istLehrerAktion && !lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
  const rc: { raum: Raum | null; bspText: BspText } = istLehrerAktion ? { raum: await holeRaum(kv, code), bspText: null } : await raumGecacht(kv, code);
  const raum = rc.raum;
  if (!raum) return h.fehler("Diesen Raum gibt es nicht (mehr). Bitte den Code prüfen.", 404);
  const jetzt = Date.now();

  /* ---------- Lehrkraft: Gesamtstand ---------- */
  if (aktion === "lehrer" && req.method === "GET") {
    const stamm = await stammdaten(kv, code);
    const ziehen = raum.phase === "ziehen" || raum.phase === "aufdecken";
    const aktiv = ziehen ? await zugStand(kv, code) : {};
    const knoten: Record<string, { n: number; aktiv: number; wahlen: Record<string, number> }> = {};
    for (const id of KNOTEN_IDS) knoten[id] = { n: 0, aktiv: aktiv[id] ?? 0, wahlen: { muss: 0, soll: 0, kann: 0 } };
    const quizStand: Record<string, Record<string, number>> = {};
    for (const t of stamm.tn) {
      const kn = knoten[t.knoten];
      if (!kn) continue;
      kn.n++;
      if (t.wahl && t.wahl in kn.wahlen) kn.wahlen[t.wahl]++;
      for (const [f, a] of Object.entries(t.quiz ?? {})) {
        quizStand[f] ??= { intra: 0, inter: 0 };
        if (a in quizStand[f]) quizStand[f][a]++;
      }
    }
    for (const id of KNOTEN_IDS) knoten[id].aktiv = Math.min(knoten[id].aktiv, knoten[id].n);
    const bspAktuell = raum.quiz?.typ === "bsp" ? stamm.bsp.find((b) => b.bid === raum.quiz!.id) : null;
    return h.json({
      raum,
      teilnehmer: stamm.tn.length,
      knoten,
      quizStand,
      quiz: quizText(raum, bspAktuell ? { id: bspAktuell.bid, text: bspAktuell.text } : null),
      beispiele: stamm.bsp.map(({ bid, text, ts }) => ({ bid, text, ts })),
      jetzt,
    });
  }

  /* ---------- Lehrkraft: Steuerung ---------- */
  if (aktion === "steuer" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (!b) return h.fehler("Konnte die Anfrage nicht lesen.");
    const neu: Raum = { ...raum, runde: raum.runde ?? 1 };
    let versionAendern = false;
    if (typeof b.phase === "string" && PHASEN.includes(b.phase)) {
      if (neu.phase !== b.phase) {
        neu.spot = null;
        neu.quizZeigen = false;
        if (b.phase === "quiz" && !neu.quiz) neu.quiz = { typ: "vor", id: SZENARIO.quiz[0].id };
      }
      neu.phase = b.phase;
    }
    if ("spot" in b) neu.spot = typeof b.spot === "string" && KNOTEN_IDS.includes(b.spot) ? b.spot : null;
    if (typeof b.loesung === "boolean") neu.loesung = b.loesung;
    if (typeof b.quizZeigen === "boolean") neu.quizZeigen = b.quizZeigen;
    if (b.quiz && typeof b.quiz === "object") {
      const q = b.quiz as Record<string, unknown>;
      if ((q.typ === "vor" && SZENARIO.quiz.some((x: { id: string }) => x.id === q.id)) || (q.typ === "bsp" && typeof q.id === "string" && /^[a-z0-9]{8}$/.test(q.id))) {
        neu.quiz = { typ: q.typ, id: q.id as string };
        neu.quizZeigen = false;
        neu.phase = "quiz";
      }
    }
    if (typeof b.loescheBeispiel === "string" && /^[a-z0-9]{8}$/.test(b.loescheBeispiel)) {
      await kv.delete(k.bsp(code, b.loescheBeispiel));
      if (neu.quiz?.typ === "bsp" && neu.quiz.id === b.loescheBeispiel) neu.quiz = null;
      versionAendern = true;
    }
    if (b.zuruecksetzen === true) {
      for await (const e of kv.list<Teilnehmer>({ prefix: ["rolle", code, "p"] })) {
        await kv.set(e.key, { ...e.value, wahl: null, quiz: {} }, { expireIn: ABLAUF });
      }
      for (const id of KNOTEN_IDS) await kv.delete(k.zug(code, id));
      neu.loesung = false;
      neu.quizZeigen = false;
      neu.runde = (raum.runde ?? 1) + 1;
      versionAendern = true;
    }
    await speichereRaum(kv, neu);
    if (versionAendern) await kv.set(...versionHoch(code));
    return h.json({ raum: neu });
  }

  /* ---------- Schüler*innen ---------- */
  if (aktion === "beitreten" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (pidOk(b?.pid)) {
      const alt = (await kv.get<Teilnehmer>(k.tn(code, b!.pid as string))).value;
      if (alt) return h.json({ pid: alt.pid, knoten: alt.knoten, wahl: alt.wahl, quiz: alt.quiz ?? {}, runde: raum.runde ?? 1 });
    }
    /* Reihum verteilen; der Zähler wird atomar erhöht, damit auch gleichzeitiges Scannen gleichmäßig verteilt */
    const pid = zufall(12);
    for (let i = 0; i < 12; i++) {
      const zaehler = await kv.get<number>(k.zaehler(code));
      const nr = zaehler.value ?? 0;
      if (nr >= MAX_TEILNEHMER) return h.fehler("Der Raum ist voll.", 409);
      const knoten = REIHENFOLGE[nr % REIHENFOLGE.length];
      const t: Teilnehmer = { pid, knoten, beigetreten: jetzt, wahl: null, quiz: {} };
      const r = await kv.atomic().check(zaehler)
        .set(k.zaehler(code), nr + 1, { expireIn: ABLAUF })
        .set(k.tn(code, pid), t, { expireIn: ABLAUF })
        .set(...versionHoch(code)).commit();
      if (r.ok) {
        knotenVon.set(`${code}:${pid}`, knoten);
        return h.json({ pid, knoten, wahl: null, quiz: {}, runde: raum.runde ?? 1 }, 201);
      }
      await new Promise((ok) => setTimeout(ok, 5 + Math.random() * 40));
    }
    return h.fehler("Gerade melden sich sehr viele an. Bitte noch einmal versuchen.", 503);
  }

  if (aktion === "zustand" && req.method === "GET") {
    return h.json({
      phase: raum.phase,
      spot: raum.spot,
      loesung: raum.loesung,
      runde: raum.runde ?? 1,
      quiz: raum.phase === "quiz" ? quizText(raum, rc.bspText) : null,
    });
  }

  const b = await h.leseBody(req);
  if (!b || !pidOk(b.pid)) return h.fehler("Bitte die Seite neu laden.", 400);
  const pid = b.pid as string;

  if (aktion === "zug" && req.method === "POST") {
    if (raum.phase !== "ziehen" && raum.phase !== "aufdecken") return h.json({ ok: false });
    let knoten = knotenVon.get(`${code}:${pid}`);
    if (!knoten) {
      const t = (await kv.get<Teilnehmer>(k.tn(code, pid))).value;
      if (!t) return h.fehler("Sie sind in diesem Raum nicht angemeldet. Bitte die Seite neu laden.", 404);
      knoten = t.knoten;
      knotenVon.set(`${code}:${pid}`, knoten);
    }
    const ok = await setzeZug(kv, code, knoten, pid, b.an === true);
    return h.json({ ok });
  }

  const schluessel = k.tn(code, pid);
  const t = (await kv.get<Teilnehmer>(schluessel)).value;
  if (!t) return h.fehler("Sie sind in diesem Raum nicht angemeldet. Bitte die Seite neu laden.", 404);

  if (aktion === "wahl" && req.method === "POST") {
    if (raum.phase !== "einordnen" || raum.loesung) return h.fehler("Gerade wird nicht abgestimmt.", 409);
    if (!["muss", "soll", "kann"].includes(String(b.wahl))) return h.fehler("Unbekannte Antwort.");
    await kv.atomic().set(schluessel, { ...t, wahl: String(b.wahl) }, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    return h.json({ ok: true });
  }
  if (aktion === "quiz" && req.method === "POST") {
    const f = frageSchluessel(raum.quiz);
    if (raum.phase !== "quiz" || !f || raum.quizZeigen || b.frage !== f) return h.fehler("Diese Frage ist gerade nicht offen.", 409);
    if (!["intra", "inter"].includes(String(b.antwort))) return h.fehler("Unbekannte Antwort.");
    await kv.atomic().set(schluessel, { ...t, quiz: { ...(t.quiz ?? {}), [f]: String(b.antwort) } }, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    return h.json({ ok: true });
  }
  if (aktion === "beispiel" && req.method === "POST") {
    if (raum.phase !== "beispiele") return h.fehler("Gerade werden keine Beispiele gesammelt.", 409);
    const text = String(b.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_BEISPIEL_LAENGE);
    if (text.length < 15) return h.fehler("Bitte beschreiben Sie Ihr Beispiel etwas genauer.");
    const vorhanden = await alleBeispiele(kv, code);
    if (vorhanden.length >= MAX_BEISPIELE) return h.fehler("Es sind schon genug Beispiele da.", 409);
    if (vorhanden.filter((x) => x.pid === pid).length >= 2) return h.fehler("Sie haben schon zwei Beispiele geschickt.", 409);
    const bid = zufall(8);
    await kv.atomic().set(k.bsp(code, bid), { bid, text, ts: jetzt, pid }, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    return h.json({ ok: true }, 201);
  }
  return h.fehler("Unbekannte Anfrage.", 404);
}

export { konfliktArt };
