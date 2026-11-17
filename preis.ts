/*
 * „Wohin gehen 2,11 Euro?“ – Live-Schätzspiel zur Zusammensetzung des Spritpreises
 *
 * Schüler*innen öffnen /preis/<code> (QR-Code am Beamer) und verteilen 211 Cent auf drei Töpfe:
 * Staat, Einkauf und Rest. Die Lehrkraft steuert am Beamer unter /preis/<code>?lehrer=<TOKEN>;
 * der Token steht nie im QR-Code der Klasse. Beim Auflösen zeigt der Beamer alle Schätzungen
 * gegen die echten Werte, jedes Handy die eigene Abweichung.
 * Es werden keine Namen erhoben. Alles liegt in Deno KV und läuft nach 12 Stunden ab.
 *
 * Zahlen: en2x, Realitätscheck Kraftstoffmarkt, Stand 26.10.2026, S. 9 (Super E10 211,1 ct/l):
 * Staat = Energiesteuer 51,41 (Tankrabatt 1.10.–31.12.2026) + CO2-Preis 15,6 + Mehrwertsteuer 33,7 = 100,7 ct,
 * Einkauf 80,4 ct, Rest 30,0 ct. Auf ganze Cent gerundet: 101 + 80 + 30 = 211.
 */

const ABLAUF = 12 * 60 * 60 * 1000;
const RAUM_CACHE_MS = 700;
const MAX_ABGABEN = 80;
const GESAMT = 211;
const WAHR = { staat: 101, einkauf: 80, rest: 30 };

type Phase = "schaetzen" | "aufloesen";
type Auswertung = { n: number; schnitt: { staat: number; einkauf: number; rest: number } | null; fehler: number[] };
type Raum = { code: string; phase: Phase; runde: number; erstellt: number; auswertung: Auswertung | null };
type Abgabe = { pid: string; staat: number; einkauf: number; rest: number; runde: number; ts: number };

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
const centOk = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= GESAMT;
const k = {
  raum: (c: string) => ["preis", c],
  version: (c: string) => ["preis", c, "v"],
  abgabe: (c: string, pid: string) => ["preis", c, "a", pid],
};
const versionHoch = (code: string) => [k.version(code), Date.now(), { expireIn: ABLAUF }] as const;

/* Falsch verteilte Cent: Was in einem Topf zu viel liegt, fehlt in einem anderen. Die Summe der
   Abweichungen zählt jeden Cent doppelt, darum halbiert. */
export function falschVerteilt(a: { staat: number; einkauf: number; rest: number }): number {
  return (Math.abs(a.staat - WAHR.staat) + Math.abs(a.einkauf - WAHR.einkauf) + Math.abs(a.rest - WAHR.rest)) / 2;
}

/* ---------- Zwischenspeicher dieser Instanz ---------- */
const raumCache = new Map<string, { zeit: number; raum: Raum | null }>();
const abgabenCache = new Map<string, { vs: string | null; liste: Abgabe[]; zeit: number }>();
function aufraeumen() {
  const grenze = Date.now() - ABLAUF;
  for (const [c, r] of raumCache) if (r.zeit < grenze) raumCache.delete(c);
  for (const [c, a] of abgabenCache) if (a.zeit < grenze) abgabenCache.delete(c);
}
async function holeRaum(kv: Deno.Kv, code: string): Promise<Raum | null> {
  if (!codeOk(code)) return null;
  const r = (await kv.get<Raum>(k.raum(code))).value;
  raumCache.set(code, { zeit: Date.now(), raum: r });
  return r;
}
/* Für die vielen Handy-Abfragen: Raum höchstens alle 0,7 s neu lesen */
async function raumGecacht(kv: Deno.Kv, code: string): Promise<Raum | null> {
  const c = raumCache.get(code);
  if (c && Date.now() - c.zeit < RAUM_CACHE_MS) return c.raum;
  return await holeRaum(kv, code);
}
async function speichereRaum(kv: Deno.Kv, raum: Raum) {
  await kv.set(k.raum(raum.code), raum, { expireIn: ABLAUF });
  raumCache.set(raum.code, { zeit: Date.now(), raum });
}
/* Abgaben nur neu lesen, wenn sich der Versionsschlüssel geändert hat */
async function abgaben(kv: Deno.Kv, code: string): Promise<Abgabe[]> {
  const vs = (await kv.get(k.version(code))).versionstamp;
  const c = abgabenCache.get(code);
  if (c && c.vs === vs) return c.liste;
  const liste: Abgabe[] = [];
  for await (const e of kv.list<Abgabe>({ prefix: ["preis", code, "a"] })) liste.push(e.value);
  abgabenCache.set(code, { vs, liste, zeit: Date.now() });
  return liste;
}

function auswerten(liste: Abgabe[], runde: number): Auswertung {
  const gueltig = liste.filter((a) => a.runde === runde);
  const n = gueltig.length;
  if (!n) return { n, schnitt: null, fehler: [] };
  const summe = gueltig.reduce((s, a) => ({ staat: s.staat + a.staat, einkauf: s.einkauf + a.einkauf, rest: s.rest + a.rest }), { staat: 0, einkauf: 0, rest: 0 });
  const schnitt = { staat: Math.round(summe.staat / n), einkauf: Math.round(summe.einkauf / n), rest: Math.round(summe.rest / n) };
  return { n, schnitt, fehler: gueltig.map(falschVerteilt).sort((a, b) => a - b) };
}

export async function preisRoute(req: Request, url: URL, pfad: string, lehrer: boolean, kv: Deno.Kv | null, h: Helfer): Promise<Response | null> {
  /* ---------- Seiten ---------- */
  /* Lehrer-Link mit falschem Token: main.ts erklärt, woran es liegt */
  if (req.method === "GET" && /^\/preis(\/[A-Za-z0-9]{4})?\/?$/.test(pfad) && url.searchParams.has("lehrer") && !lehrer) return null;
  if (req.method === "GET" && (pfad === "/preis" || pfad === "/preis/")) {
    return await h.statisch(lehrer ? "preis/beamer.html" : "preis/start.html");
  }
  const seite = pfad.match(/^\/preis\/([A-Za-z0-9]{4})\/?$/);
  if (req.method === "GET" && seite) {
    const code = seite[1].toLowerCase();
    if (code !== seite[1]) return Response.redirect(new URL(`/preis/${code}${url.search}`, url), 302);
    return await h.statisch(lehrer ? "preis/beamer.html" : "preis/schueler.html");
  }

  if (!pfad.startsWith("/api/preis")) return null;
  if (!kv) return h.kvFehlt();
  aufraeumen();

  /* ---------- Neuer Raum (Lehrkraft) ---------- */
  if (pfad === "/api/preis" && req.method === "POST") {
    if (!lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
    let code = "";
    do code = zufall(4); while (await holeRaum(kv, code));
    const raum: Raum = { code, phase: "schaetzen", runde: 1, erstellt: Date.now(), auswertung: null };
    await speichereRaum(kv, raum);
    await kv.set(...versionHoch(code));
    return h.json({ code }, 201);
  }

  const m = pfad.match(/^\/api\/preis\/([a-z0-9]{4})\/([a-z]+)$/);
  if (!m) return h.fehler("Unbekannte Anfrage.", 404);
  const [, code, aktion] = m;
  const istLehrerAktion = aktion === "lehrer" || aktion === "steuer";
  if (istLehrerAktion && !lehrer) return h.fehler("Nur mit Lehrer-Link.", 403);
  const raum = istLehrerAktion ? await holeRaum(kv, code) : await raumGecacht(kv, code);
  if (!raum) return h.fehler("Diesen Raum gibt es nicht (mehr). Bitte den Code prüfen.", 404);

  /* ---------- Lehrkraft: Stand mit allen Schätzungen dieser Runde ---------- */
  if (aktion === "lehrer" && req.method === "GET") {
    const liste = (await abgaben(kv, code)).filter((a) => a.runde === raum.runde);
    return h.json({
      raum,
      wahr: WAHR,
      gesamt: GESAMT,
      n: liste.length,
      schaetzungen: liste.map(({ staat, einkauf, rest }) => ({ staat, einkauf, rest })),
    });
  }

  /* ---------- Lehrkraft: Steuerung ---------- */
  if (aktion === "steuer" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (!b) return h.fehler("Konnte die Anfrage nicht lesen.");
    const neu: Raum = { ...raum };
    if (b.neueRunde === true) {
      for await (const e of kv.list({ prefix: ["preis", code, "a"] })) await kv.delete(e.key);
      neu.runde = raum.runde + 1;
      neu.phase = "schaetzen";
      neu.auswertung = null;
    } else if (b.phase === "aufloesen") {
      neu.phase = "aufloesen";
      neu.auswertung = auswerten(await abgaben(kv, code), raum.runde);
    } else if (b.phase === "schaetzen") {
      neu.phase = "schaetzen";
      neu.auswertung = null;
    } else return h.fehler("Unbekannte Steuerung.");
    await speichereRaum(kv, neu);
    await kv.set(...versionHoch(code));
    return h.json({ raum: neu });
  }

  /* ---------- Schüler*innen ---------- */
  if (aktion === "zustand" && req.method === "GET") {
    const auf = raum.phase === "aufloesen";
    return h.json({
      phase: raum.phase,
      runde: raum.runde,
      gesamt: GESAMT,
      ...(auf ? { wahr: WAHR, auswertung: raum.auswertung } : {}),
    });
  }

  if (aktion === "abgabe" && req.method === "POST") {
    const b = await h.leseBody(req);
    if (!b || !pidOk(b.pid)) return h.fehler("Bitte die Seite neu laden.", 400);
    if (raum.phase !== "schaetzen") return h.fehler("Die Auflösung läuft schon. Schauen Sie zum Beamer.", 409);
    if (b.runde !== raum.runde) return h.fehler("Es gibt eine neue Runde. Bitte die Seite neu laden.", 409);
    if (!centOk(b.staat) || !centOk(b.einkauf) || (b.staat as number) + (b.einkauf as number) > GESAMT) {
      return h.fehler("Bitte genau 211 Cent verteilen.");
    }
    const pid = b.pid as string;
    const schluessel = k.abgabe(code, pid);
    const alt = await kv.get<Abgabe>(schluessel);
    if (!alt.value) {
      const anzahl = (await abgaben(kv, code)).filter((a) => a.runde === raum.runde).length;
      if (anzahl >= MAX_ABGABEN) return h.fehler("Es haben schon sehr viele geschätzt. Der Raum ist voll.", 409);
    }
    const staat = b.staat as number, einkauf = b.einkauf as number;
    const abgabe: Abgabe = { pid, staat, einkauf, rest: GESAMT - staat - einkauf, runde: raum.runde, ts: Date.now() };
    await kv.atomic().set(schluessel, abgabe, { expireIn: ABLAUF }).set(...versionHoch(code)).commit();
    return h.json({ ok: true, rest: abgabe.rest });
  }

  return h.fehler("Unbekannte Anfrage.", 404);
}
