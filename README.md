# X-Simulator

Schüler*innen schreiben auf dem Handy X-Nachrichten (max. 280 Zeichen) zu einer Aufgabe,
die Lehrkraft zeigt alle Posts live auf dem Beamer. Jede Klasse/Aufgabe ist ein **Raum**.

| Wer | Adresse |
|---|---|
| Klasse (QR-Code) | `https://x-simulator-tarifbindung.yannickbernhardt.deno.net/r/<code>` |
| Klasse ohne QR | Startseite `/` → Raumcode eingeben |
| Lehrkraft: alle Räume | `/?lehrer=<LEHRER_TOKEN>` |
| Lehrkraft: Wand eines Raums | `/r/<code>?lehrer=<LEHRER_TOKEN>` (auch per Knopf in der Verwaltung) |

## Räume verwalten (`/?lehrer=…`)
- **Neuer Raum:** Klasse, Code (optional, sonst zufällig), angehefteter Aufgaben-Post
  (Absender, Emoji, Text, optional Bild), Bewertungskriterien, Referenzzahlen, Erwartungshorizont.
  Rechts eine Live-Vorschau im X-Look.
- **Für andere Klasse kopieren:** übernimmt alles außer den Posts.
- **Status:** offen (Posten möglich) · pausiert (nur lesen/liken) · geschlossen (nicht erreichbar).
- **QR-Code:** groß anzeigen, als PNG speichern, Link kopieren.

## Thread-Räume mit Community Notes
Ein vorbereiteter Raum (`VORBEREITET` in `main.ts`) kann `antworten` und `notes: true` haben,
z. B. `eltu2-tim`: Unter dem angehefteten Post stehen feste Antworten (Likes möglich).
Die Klasse schlägt zu einer Antwort eine **Community Note** vor („Community Note vorschlagen“).
Vorschläge stehen unter „Vorschläge für Community Notes“, auf der Wand unter der jeweiligen Antwort.
Mit ✓ schaltet die Lehrkraft eine Note **live**, dann erscheint sie bei allen als Kasten unter der Antwort.
Live geschaltete Notes lassen sich nicht mehr bearbeiten. Antworten und Notes-Modus werden nur im Code
gepflegt; Speichern in der Verwaltung lässt sie unverändert.

## Aufbau
- `main.ts` – Deno-Server (nur Standardbibliothek), alles in Deno KV.
  Posts, Likes und Benutzernamen laufen nach 14 Tagen ab; Räume bleiben.
- `public/start.html` – Code-Eingabe · `public/index.html` – Schüler-App ·
  `public/lehrer.html` – Wand · `public/verwaltung.html` – Räume.
- `public/zaehlen.js` – Zeichenzählung wie X (Emoji/CJK = 2, Link = 23), Server und Browser.
- `public/m4.svg` – Schaubild des ersten Raums (`eltm2-a4`), wird beim ersten Start übernommen.

## Deno Deploy
KV-Datenbank muss angehängt sein, `LEHRER_TOKEN` als Secret. Update = auf `main` pushen.
Notschalter für die ganze Seite: `DEAKTIVIERT = true` in `main.ts`.

## Lokal
```
LEHRER_TOKEN=test PORT=8123 KV_PATH=./test.kv deno run -A --unstable-kv main.ts
```
