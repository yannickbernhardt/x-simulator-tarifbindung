# welt3d – gemeinsamer Bausatz für Welt und Figuren

Ein Satz an Bausteinen für die 3D-Spiele: dieselbe Welt, dieselben Figuren, dieselbe Kamera und
dieselbe Steuerung. Entstanden aus Zinssturm, genutzt von Zinssturm und Herzblatt.

Alles sind ES-Module ohne Build-Schritt. Der Ordner trägt sich selbst: three.js liegt darin
(`vendor/three/`, Version und Prüfsummen in `HERKUNFT.md`, Lizenz daneben). Kein CDN, keine Tracker.

| Datei | Inhalt |
|---|---|
| `drei.js` | einzige Stelle, an der three.js geladen wird |
| `formen.js` | Werkzeug für Modelle aus Grundformen: Teile einfärben und verbinden, Boden-Flächen, Dächer, weiche dunkle Flecken |
| `himmel.js` | Himmel mit Verlauf, Licht ohne echte Schatten, Wolken, Hügel in der Ferne |
| `natur.js` | Laub- und Nadelbäume als InstancedMesh |
| `bauten.js` | Häuser als InstancedMesh, dazu Türen, Fenster, Schornsteine |
| `figur.js` | Grundfigur (Rumpf, Kopf, Arme, Beine) mit Laufen, Springen, Sitzen, Jubeln |
| `schild.js` | Namensschilder, Textschilder, Denkblase |
| `buehne.js` | Renderer, Szene, Kamera; Pixeldichte höchstens 1,5; schaltet bei unter 25 Bildern je Sekunde eine Stufe herunter |
| `kamera.js` | Kamera, die einer Figur von hinten folgt |
| `steuerung.js` | Joystick unter dem linken Daumen, Wischen zum Drehen, Tastatur und Maus |
| `durchblick.js` | was der Kamera zu nah kommt, löst sich in einem Punktmuster auf |

## Regeln für den Bausatz

- Ein Spiel bringt nur mit, was es ausmacht (Zinssturm: Werkstadt, Hallen, Kurier mit Rucksack;
  Herzblatt: Platz, Tische, Figuren mit Hut und Getränk). Alles Übrige kommt von hier.
- Der Zufall für das Aussehen kommt vom Spiel als Funktion `zw(von, bis)`. So bleibt jede Welt
  mit demselben Startwert gleich.
- Winkel `w` zeigt nach `(sin w, cos w)`. Figuren und Bauten schauen nach +z.
- Der Ordner wird immer als Ganzes kopiert. Liegt er in zwei Projekten, müssen beide Kopien gleich sein.
