/*
 * X-Simulator ELTM2 – A4 „Tarifverträge und Betriebsräte" (M4)
 *
 * Schüler*innen posten auf dem Handy in einer X-Oberfläche, die Lehrkraft
 * zeigt alle Posts über /?lehrer=<TOKEN> auf dem Beamer.
 * Läuft auf Deno Deploy, Posts und Likes liegen in Deno KV.
 */

import { analysiere } from "./public/zaehlen.js";

const LEHRER_TOKEN = Deno.env.get("LEHRER_TOKEN") ?? "";

const MAX_NAME = 50;
const MAX_TOTAL = 300; // Obergrenze für die ganze Klasse
const MAX_PRO_GERAET = 5;
const MIN_ABSTAND = 5000; // ms zwischen zwei Posts desselben Geräts
const LEBENSDAUER = 14 * 24 * 60 * 60 * 1000; // danach räumt KV selbst auf
const RESERVIERT = ["politikbktl", "admin", "lehrer", "lehrerin", "x", "elonmusk"];
const PIN_ID = "pinned";

/* Bewusst pro Gerät (clientId), nicht pro IP: im Schul-WLAN teilen sich
   alle Schüler*innen dieselbe öffentliche IP. */

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
};

/* Ohne angehängte KV-Datenbank soll die App trotzdem starten und das im
   Frontend melden, statt beim Start abzustürzen. */
let kv: Deno.Kv | null = null;
let kvFehler = "";
try {
  kv = await Deno.openKv();
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

/* Posttext: Zeilenumbrüche bleiben erhalten, mehr als eine Leerzeile nicht */
function posttext(s: unknown): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

function sauberesHandle(s: unknown): string {
  return String(s ?? "").replace(/^@/, "").trim();
}

function handleGueltig(h: string): boolean {
  return /^[A-Za-z0-9_]{4,15}$/.test(h);
}

function sauberesAvatar(a: unknown): Avatar {
  const o = (a ?? {}) as Record<string, unknown>;
  const e = String(o.e ?? "").slice(0, 16) || "🙂";
  const c = /^#[0-9a-fA-F]{6}$/.test(String(o.c)) ? String(o.c) : "#1D9BF0";
  return { e, c };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function fehler(text: string, status = 400): Response {
  return json({ error: text }, status);
}

function istLehrer(url: URL): boolean {
  if (!LEHRER_TOKEN) return false;
  return url.searchParams.get("lehrer") === LEHRER_TOKEN;
}

function kvFehltAntwort(): Response {
  return json(
    {
      error: "Der Simulator ist noch nicht fertig eingerichtet – es fehlt die Datenbank.",
      detail: kvFehler,
    },
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

async function allePosts(kv: Deno.Kv): Promise<Post[]> {
  const liste: Post[] = [];
  for await (const e of kv.list<Post>({ prefix: ["posts"] })) {
    if (e.value) liste.push(e.value);
  }
  liste.sort((a, b) => b.ts - a.ts);
  return liste;
}

/* Likes: ["likes", postId, clientId] */
async function alleLikes(kv: Deno.Kv) {
  const anzahl = new Map<string, number>();
  const vonMir = new Map<string, Set<string>>();
  for await (const e of kv.list({ prefix: ["likes"] })) {
    const postId = String(e.key[1]);
    const cid = String(e.key[2]);
    anzahl.set(postId, (anzahl.get(postId) ?? 0) + 1);
    if (!vonMir.has(cid)) vonMir.set(cid, new Set());
    vonMir.get(cid)!.add(postId);
  }
  return { anzahl, vonMir };
}

/* Aufrufe: wie viele Geräte die Timeline seit dem Post geöffnet hatten */
async function alleGesehen(kv: Deno.Kv): Promise<number[]> {
  const liste: number[] = [];
  for await (const e of kv.list<number>({ prefix: ["seen"] })) {
    if (typeof e.value === "number") liste.push(e.value);
  }
  return liste;
}

async function handleBesitzer(kv: Deno.Kv, handle: string): Promise<string | null> {
  const e = await kv.get<string>(["handles", handle.toLowerCase()]);
  return e.value ?? null;
}

/* Handle für ein Gerät reservieren – liefert false, wenn ein anderes Gerät es hat */
async function beanspruche(kv: Deno.Kv, handle: string, clientId: string): Promise<boolean> {
  const key = ["handles", handle.toLowerCase()];
  const e = await kv.get<string>(key);
  if (e.value && e.value !== clientId) return false;
  const ok = await kv.atomic().check(e).set(key, clientId, { expireIn: LEBENSDAUER }).commit();
  if (!ok.ok) return (await handleBesitzer(kv, handle)) === clientId;
  return true;
}

/* ---------- Statische Dateien ---------- */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

async function statisch(rel: string): Promise<Response> {
  if (rel.includes("..")) return new Response("Verboten", { status: 403 });
  const endung = rel.slice(rel.lastIndexOf("."));
  try {
    const datei = await Deno.readFile(new URL(`./public/${rel}`, import.meta.url));
    return new Response(datei, {
      headers: {
        "content-type": TYPES[endung] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Nicht gefunden", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

/* ---------- Server ---------- */
const PORT = Number(Deno.env.get("PORT") ?? 8000);

/* Seite abgeschaltet: auf false setzen und pushen, um sie wieder freizugeben.
   Die Posts in KV bleiben erhalten (bis sie nach 14 Tagen ablaufen). */
const DEAKTIVIERT = true;

const ABGESCHALTET_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Nicht verfügbar</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:28px;margin:0 0 8px">Diese Seite ist gerade nicht verfügbar.</h1>
<p style="color:#71767b;margin:0">Die Unterrichtssimulation wurde von der Lehrkraft beendet.</p></div></body></html>`;

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

  /* Gesamtstand: Posts, Likes, Aufrufe. Gleichzeitig „gesehen" vermerken. */
  if (pfad === "/api/state" && req.method === "GET") {
    if (!kv) return kvFehltAntwort();
    const cid = einzeilig(url.searchParams.get("clientId"), 64);
    const jetzt = Date.now();
    if (cid && !lehrer) {
      await kv.set(["seen", cid], jetzt, { expireIn: LEBENSDAUER });
    }

    const [posts, likes, gesehen] = await Promise.all([
      allePosts(kv),
      alleLikes(kv),
      alleGesehen(kv),
    ]);
    const meine = likes.vonMir.get(cid) ?? new Set<string>();
    const aufrufe = (ts: number) => gesehen.filter((s) => s >= ts).length;

    const sicht = posts
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
        ...(lehrer ? { badge: p.badge ?? null, checks: p.checks ?? [] } : {}),
      }));

    return json({
      now: jetzt,
      lehrer,
      posts: sicht,
      pinned: {
        likes: likes.anzahl.get(PIN_ID) ?? 0,
        liked: meine.has(PIN_ID),
        views: gesehen.length,
      },
      geraete: gesehen.length,
    });
  }

  /* Benutzernamen prüfen und reservieren (Onboarding) */
  if (pfad === "/api/handle" && req.method === "POST") {
    if (!kv) return kvFehltAntwort();
    const b = await leseBody(req);
    if (!b) return fehler("Konnte die Anfrage nicht lesen.");
    const handle = sauberesHandle(b.handle);
    const cid = einzeilig(b.clientId, 64);
    const nurPruefen = b.pruefen === true;
    if (!cid) return fehler("Gerätekennung fehlt.");
    if (!handleGueltig(handle)) {
      return fehler("Dein Benutzername muss 4 bis 15 Zeichen lang sein und darf nur Buchstaben, Zahlen und _ enthalten.");
    }
    if (RESERVIERT.includes(handle.toLowerCase())) {
      return fehler("Dieser Benutzername ist bereits vergeben.", 409);
    }
    if (nurPruefen) {
      const besitzer = await handleBesitzer(kv, handle);
      if (besitzer && besitzer !== cid) return fehler("Dieser Benutzername ist bereits vergeben.", 409);
      return json({ ok: true });
    }
    if (!(await beanspruche(kv, handle, cid))) {
      return fehler("Dieser Benutzername ist bereits vergeben.", 409);
    }
    return json({ ok: true });
  }

  /* Neuer Post */
  if (pfad === "/api/posts" && req.method === "POST") {
    if (!kv) return kvFehltAntwort();
    const b = await leseBody(req);
    if (!b) return fehler("Konnte den Post nicht lesen.");

    const text = posttext(b.text);
    const name = einzeilig(b.name, MAX_NAME) || "Anonym";
    const handle = sauberesHandle(b.handle);
    const cid = einzeilig(b.clientId, 64);
    const avatar = sauberesAvatar(b.avatar);

    if (!cid) return fehler("Gerätekennung fehlt.");
    if (!text) return fehler("Der Post ist leer.");
    if (analysiere(text).gewicht > 280) return fehler("Dein Post ist länger als 280 Zeichen.");
    if (!handleGueltig(handle)) return fehler("Ungültiger Benutzername.");
    if (!(await beanspruche(kv, handle, cid))) {
      return fehler("Dieser Benutzername gehört inzwischen jemand anderem. Bitte ändere ihn im Profil.", 409);
    }

    /* Bremse pro Gerät. Den Zeitstempel selbst vergleichen – auf expireIn
       ist lokal kein Verlass, das räumt nur träge auf. */
    const bremse = await kv.get<number>(["lastpost", cid]);
    if (bremse.value && Date.now() - bremse.value < MIN_ABSTAND) {
      return fehler("Nicht so schnell – warte ein paar Sekunden.", 429);
    }
    const liste = await allePosts(kv);
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
      avatar,
      text,
      ts,
      clientId: cid,
    };
    await kv.set(["posts", p.id], p, { expireIn: LEBENSDAUER });
    return json({ ok: true, id: p.id }, 201);
  }

  /* Alles zurücksetzen – nur mit Lehrer-Link */
  if (pfad === "/api/posts" && req.method === "DELETE") {
    if (!kv) return kvFehltAntwort();
    if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
    for (const prefix of ["posts", "likes", "handles", "lastpost", "seen"]) {
      for await (const e of kv.list({ prefix: [prefix] })) await kv.delete(e.key);
    }
    return json({ ok: true });
  }

  /* Like setzen oder entfernen */
  const likeTreffer = pfad.match(/^\/api\/posts\/([\w.-]+)\/like$/);
  if (likeTreffer && req.method === "POST") {
    if (!kv) return kvFehltAntwort();
    const id = likeTreffer[1];
    const b = await leseBody(req);
    const cid = einzeilig(b?.clientId, 64);
    if (!cid) return fehler("Gerätekennung fehlt.");
    if (id !== PIN_ID) {
      const p = await kv.get<Post>(["posts", id]);
      if (!p.value) return fehler("Diesen Post gibt es nicht mehr.", 404);
    }
    if (b?.like === false) await kv.delete(["likes", id, cid]);
    else await kv.set(["likes", id, cid], true, { expireIn: LEBENSDAUER });
    return json({ ok: true });
  }

  /* Einzelnen Post bearbeiten, moderieren oder löschen */
  const postTreffer = pfad.match(/^\/api\/posts\/([\w.-]+)$/);
  if (postTreffer) {
    if (!kv) return kvFehltAntwort();
    const id = postTreffer[1];
    const eintrag = await kv.get<Post>(["posts", id]);
    if (!eintrag.value) return fehler("Diesen Post gibt es nicht mehr.", 404);
    const p = eintrag.value;

    if (req.method === "DELETE") {
      const cid = einzeilig(url.searchParams.get("clientId"), 64);
      if (!lehrer && !(cid && p.clientId === cid)) return fehler("Das darfst du nicht löschen.", 403);
      await kv.delete(["posts", id]);
      for await (const e of kv.list({ prefix: ["likes", id] })) await kv.delete(e.key);
      return json({ ok: true });
    }

    /* Eigenen Text bearbeiten */
    if (req.method === "PUT") {
      const b = await leseBody(req);
      const cid = einzeilig(b?.clientId, 64);
      if (!(cid && p.clientId === cid)) return fehler("Das darfst du nicht bearbeiten.", 403);
      const text = posttext(b?.text);
      if (!text) return fehler("Der Post ist leer.");
      if (analysiere(text).gewicht > 280) return fehler("Dein Post ist länger als 280 Zeichen.");
      await kv.set(["posts", id], { ...p, text, edited: Date.now() }, { expireIn: LEBENSDAUER });
      return json({ ok: true });
    }

    /* Moderation durch die Lehrkraft */
    if (req.method === "PATCH") {
      if (!lehrer) return fehler("Nur mit Lehrer-Link.", 403);
      const b = await leseBody(req);
      if (!b) return fehler("Konnte die Anfrage nicht lesen.");
      const neu: Post = { ...p };
      if (typeof b.hidden === "boolean") neu.hidden = b.hidden;
      if ("badge" in b) neu.badge = b.badge === "ok" || b.badge === "fehler" ? b.badge : null;
      if (Array.isArray(b.checks)) {
        neu.checks = b.checks.map((c) => einzeilig(c, 32)).filter(Boolean).slice(0, 20);
      }
      await kv.set(["posts", id], neu, { expireIn: LEBENSDAUER });
      return json({ ok: true });
    }
  }

  if (pfad.startsWith("/api/")) return fehler("Unbekannte Anfrage.", 404);
  if (req.method !== "GET") return new Response("Nicht erlaubt", { status: 405 });

  /* Startseite: mit gültigem Lehrer-Token das Dashboard, sonst die App */
  if (pfad === "/") return await statisch(lehrer ? "lehrer.html" : "index.html");
  return await statisch(pfad.replace(/^\/+/, ""));
});
