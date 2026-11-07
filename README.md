# X-Simulator

Schüler*innen schreiben auf dem Handy X-Nachrichten (max. 280 Zeichen) zu einer Aufgabe,
die Lehrkraft zeigt alle Posts live auf dem Beamer. Jede Klasse/Aufgabe ist ein **Raum**.

| Wer | Adresse |
|---|---|
| Klasse (QR-Code) | `https://x-simulator-tarifbindung.yannickbernhardt.deno.net/r/<code>` |
| Klasse ohne QR | Startseite `/` → Raumcode eingeben |
| Lehrkraft: alle Räume | `/?lehrer=<LEHRER_TOKEN>` |
| Lehrkraft: Wand eines Raums | `/r/<code>?lehrer=<LEHRER_TOKEN>` (auch per Knopf in der Verwaltung) |
| Hörseiten zu Arbeitsblättern | `/hoeren/<name>` zeigt `public/hoeren/<name>.html` |
| Lernspiele | `/spiel/<name>` zeigt `public/spiel/<name>.html`, z. B. `/spiel/auftrag-wallbox` (ELT-O, Ablauforganisation) |

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

## Streitfall: Post-Ansicht wie in X
In Streitfall-Räumen öffnet der Raum auf dem Handy direkt den angehefteten Post wie einen geteilten Link in X:
Kopfzeile „← Post“, der Post groß mit Uhrzeit, Datum und Aufrufen, darunter alle Antworten und Kommentare, unten
die Leiste „Poste deine Antwort“ (nach dem Gruppenbilden steht die Antwort der eigenen Gruppe schon unter „Antwort an“).
Im Feed „Für dich“ (Pfeil zurück oder Startseite) steht nur der angeheftete Post; Antippen öffnet ihn wieder.
Beiträge ohne Bezug gibt es dort nicht: Sie stehen als Antwort unter dem angehefteten Post. Die Wand bleibt unverändert.

## Streitfall: Gruppen bilden
In Streitfall-Räumen (`kommentare: true`, z. B. `eah12-piaget`) gibt es an der Wand den Knopf **„Gruppen bilden“**.
Er öffnet eine eigene Bühne für den Beamer: ein Feld je Antwort, nebeneinander, mit Nummer, Schlagzeile und Anzahl.
Die Nummer des Feldes ist die Nummer der Antwort und der Infokarte, die vorn liegt.
- **Schlagzeilen:** je Antwort eine Zeile (z. B. aus der Vorstunde). Vorschläge stehen als `kartenTitel` im Raum in
  `main.ts`; was die Lehrkraft einträgt, gilt für diesen Raum (bleibt bei „Neue Runde“ erhalten, läuft nach 14 Tagen ab).
- **Gruppenwahl starten:** Auf den Handys erscheint die Phase über dem Thread. Wer sie sieht, steht als Figur mit
  Benutzernamen am Rand; wer eine Schlagzeile antippt, läuft in sein Feld, bei einem Wechsel weiter. Keine Sperre:
  Die Klasse achtet selbst auf die Verteilung, die Bühne zeigt „2 bis 3 je Gruppe“ und färbt zu volle Felder gelb.
- **Einteilung festhalten:** Die Felder leuchten, die Handys zeigen „Deine Gruppe: Karte N“, danach oben im Thread.
  „Wieder öffnen“ behält die Wahl, „Zurücksetzen“ löscht sie (Schlagzeilen bleiben). Wird die Wand während der Wahl
  neu geladen, öffnet sie gleich die Bühne.
- An den Antworten im Thread steht „Gruppe N: Anzahl“ (Benutzernamen beim Darüberfahren).
Gespeichert werden je Gerät Feld, Benutzername und Avatar (läuft nach 14 Tagen ab, „Neue Runde“ löscht es).

## Aufbau
- `main.ts` – Deno-Server (nur Standardbibliothek), alles in Deno KV.
  Posts, Likes und Benutzernamen laufen nach 14 Tagen ab; Räume bleiben.
- `public/start.html` – Code-Eingabe · `public/index.html` – Schüler-App ·
  `public/lehrer.html` – Wand · `public/verwaltung.html` – Räume.
- `public/zaehlen.js` – Zeichenzählung wie X (Emoji/CJK = 2, Link = 23), Server und Browser.
- `public/m4.svg` – Schaubild des ersten Raums (`eltm2-a4`), wird beim ersten Start übernommen.

## Live-Spiel „Alle ziehen an Finn“ (Rollentheorie nach Dahrendorf)
| Wer | Adresse |
|---|---|
| Lehrkraft (Beamer) | `/rolle?lehrer=<LEHRER_TOKEN>` → „Neues Spiel starten“ |
| Klasse (QR-Code am Beamer) | `/rolle/<code>`, ohne QR: `/rolle` → Code eingeben |

Jedes Handy bekommt reihum eine Bezugsgruppe (Anleiterin, Leitung, Team, Fahrlehrer, Trainer, Lehrerin,
Freunde, Eltern, Kinder) und zieht per Knopf an Finn. Phasen am Beamer (Tasten 1–6):
Anmelden · Ziehen (Karte anklicken = Gruppe aufrufen, Blitze bei unvereinbaren Erwartungen) ·
Aufdecken (Positionen, Intra/Inter) · Einordnen (Muss/Soll/Kann abstimmen, L = Auflösung) ·
Quiz (6 Fälle, ←/→, L = Ergebnis) · Beispiele (anonym, „Abstimmen lassen“). H blendet die Leiste aus.
Keine Namen, alles läuft nach 12 Stunden ab. Inhalte stehen in `public/rolle/szenario.js`,
Server in `rolle.ts` (sparsam mit KV-Lesezugriffen: Raum-Cache, Versionsschlüssel, ein Zug-Schlüssel pro Gruppe).

## Deno Deploy
KV-Datenbank muss angehängt sein, `LEHRER_TOKEN` als Secret. Update = auf `main` pushen.
Notschalter für die ganze Seite: `DEAKTIVIERT = true` in `main.ts`.

## Lokal
```
LEHRER_TOKEN=test PORT=8123 KV_PATH=./test.kv deno run -A --unstable-kv main.ts
```
