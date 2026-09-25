# X-Simulator ELTM2 – A4 Tarifbindung & Betriebsräte

Schüler*innen verfassen auf dem Handy eine X-Nachricht (max. 280 Zeichen) zu M4
(Hans-Böckler-Stiftung: Tarifbindung und Betriebsräte 2000/2022). Die Lehrkraft
zeigt alle Posts live auf dem Beamer.

- **Klasse:** `https://<app>.yannickbernhardt.deno.net/` (QR-Code)
- **Lehrkraft:** dieselbe URL mit `?lehrer=<LEHRER_TOKEN>` – der Link gehört nicht in den QR-Code.

## Aufbau
- `main.ts` – Deno-Server (nur Standardbibliothek), Posts/Likes/Handles in Deno KV,
  alles läuft nach 14 Tagen ab.
- `public/index.html` – Schüler-App im X-Look (Onboarding, Timeline, Compose, Likes).
- `public/lehrer.html` – Dashboard: Wand, Spotlight, Bewertung, Timer, QR, CSV, Druck.
- `public/zaehlen.js` – Zeichenzählung wie X (Emoji/CJK = 2, Link = 23), von Server
  und Browser gemeinsam genutzt.
- `public/m4.svg` – nachgebautes Schaubild M4.

## Deno Deploy
1. console.deno.com → *+ New App* → dieses Repo wählen → *Create App*.
2. *Databases → Attach Deno KV → Provision Database* (sonst meldet die App „Datenbank fehlt").
3. *Settings → Environment Variables*: `LEHRER_TOKEN` als Secret setzen.

Update = auf `main` pushen.

## Lokal
```
LEHRER_TOKEN=test PORT=8123 deno task start
```
