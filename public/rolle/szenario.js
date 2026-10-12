/* Szenario „Alle ziehen an Finn“: Rollentheorie nach Dahrendorf.
   Wird vom Server (Rollenverteilung, Prüfung) und von den Seiten im Browser genutzt. */

export const SZENARIO = {
  id: "finn",
  titel: "Alle ziehen an Finn",
  person: "Finn",
  intro: "Finn ist 17, geht in die FOS 11 und macht ein Praktikum in der Kita Schneckenhaus. Es ist Montag, 15:40 Uhr.",
  positionen: {
    praktikant: "Praktikant",
    fahrschueler: "Fahrschüler",
    spieler: "Spieler im Verein",
    freund: "Freund",
  },
  /* winkel: Lage auf dem Beamer (0 = rechts, 90 = unten), alle 40 Grad eine Karte. Unvereinbare Erwartungen liegen sich ungefähr gegenüber. */
  knoten: [
    { id: "zeit", kurzname: "Anleiterin", gruppe: "Anleiterin Frau Kaya", icon: "🧑‍🏫", position: "praktikant", winkel: 210,
      kurz: "Dienst bis 16:30 Uhr",
      erwartung: "Dein Dienst geht bis 16:30 Uhr. So steht es in deiner Praktikumsvereinbarung.",
      art: "muss", folge: "Verstoß gegen die Praktikumsvereinbarung: Gespräch mit der Schule, im schlimmsten Fall wird das Praktikum beendet." },
    { id: "schweigen", kurzname: "Leitung", gruppe: "Kita-Leitung Herr Brandt", icon: "🤫", position: "praktikant", winkel: 250,
      kurz: "Schweigepflicht",
      erwartung: "Was du hier über die Kinder erfährst, bleibt in der Kita. Auskünfte an Eltern geben nur die Fachkräfte.",
      art: "muss", folge: "Verstoß gegen Schweigepflicht und Datenschutz: Das Praktikum kann beendet werden, rechtliche Folgen sind möglich." },
    { id: "team", kurzname: "Team", gruppe: "Kita-Team", icon: "🧹", position: "praktikant", winkel: 290,
      kurz: "Erst aufräumen",
      erwartung: "Erst wird aufgeräumt, dann gespielt. Und du packst mit an, auch bei Tischen und Wäsche.",
      art: "soll", folge: "Das Team ist genervt, Finn gilt als faul, die Stimmung kippt. Einen Vertrag oder ein Gesetz verletzt er nicht." },
    { id: "fahrlehrer", kurzname: "Fahrlehrer", gruppe: "Fahrlehrer", icon: "🚗", position: "fahrschueler", winkel: 330,
      kurz: "Fahrstunde um 16 Uhr",
      erwartung: "Montag, 16 Uhr, Fahrstunde. Wer nicht kommt und nicht 24 Stunden vorher absagt, zahlt trotzdem.",
      art: "muss", folge: "Ausfallgebühr laut Vertrag mit der Fahrschule, also eine rechtliche Folge." },
    { id: "trainer", kurzname: "Trainer", gruppe: "Fußballtrainer", icon: "⚽", position: "spieler", winkel: 10,
      kurz: "Training um 16:15 Uhr",
      erwartung: "Training ist Montag um 16:15 Uhr. Wer fehlt, sitzt am Samstag auf der Bank.",
      art: "soll", folge: "Bank am Samstag und Ärger mit dem Trainer. Ein Gesetz oder einen Vertrag verletzt Finn nicht." },
    { id: "schule", kurzname: "Lehrerin", gruppe: "FOS-Lehrerin", icon: "📓", position: "praktikant", winkel: 50,
      kurz: "Genaue Beobachtung für den Bericht",
      erwartung: "Für deinen Praktikumsbericht beobachtest du ein Kind genau und schreibst alles auf. Der Bericht wird benotet.",
      art: "muss", folge: "Ohne Bericht keine Note. Das ist eine schulrechtliche Folge und kann die Versetzung gefährden." },
    { id: "clique", kurzname: "Freunde", gruppe: "Freundeskreis", icon: "📱", position: "freund", winkel: 90,
      kurz: "Fotos aus der Kita posten",
      erwartung: "Poste doch mal was aus der Kita! Die Kids sind bestimmt voll süß.",
      art: "kann", folge: "Postet er, gibt es Likes. Postet er nicht, passiert nichts." },
    { id: "eltern", kurzname: "Eltern", gruppe: "Eltern beim Abholen", icon: "👪", position: "praktikant", winkel: 130,
      kurz: "Auskunft über ein anderes Kind",
      erwartung: "Sie arbeiten doch hier? Was war heute mit dem Jungen los, der so geweint hat?",
      art: "soll", folge: "Die Eltern sind verärgert und beschweren sich vielleicht. Rechtliche Folgen hat ein Nein für Finn nicht." },
    { id: "kinder", kurzname: "Kinder", gruppe: "Kinder der Schnecken\u00ADgruppe", icon: "🧒", position: "praktikant", winkel: 170,
      kurz: "Sofort Fußball spielen",
      erwartung: "Finn, spiel mit uns Fußball! Jetzt sofort, nicht erst nach dem Aufräumen!",
      art: "kann", folge: "Spielt er mit, ist er der Lieblingspraktikant. Spielt er nicht, gibt es kurz enttäuschte Gesichter, sonst nichts." },
  ],
  /* Unvereinbare Erwartungen: Blitz, wenn beide Seiten gleichzeitig ziehen */
  konflikte: [
    { a: "zeit", b: "fahrlehrer", text: "Bis 16:30 Uhr arbeiten und um 16 Uhr in der Fahrschule sein, das geht nicht." },
    { a: "zeit", b: "trainer", text: "Bis 16:30 Uhr arbeiten und um 16:15 Uhr beim Training sein, das geht nicht." },
    { a: "schweigen", b: "clique", text: "Fotos aus der Kita posten verträgt sich nicht mit der Schweigepflicht." },
    { a: "schweigen", b: "eltern", text: "Die Eltern wollen Auskunft über ein anderes Kind, die Leitung verbietet sie." },
    { a: "schweigen", b: "schule", text: "Die Lehrerin will eine genaue Beobachtung, die Leitung Verschwiegenheit. Ausweg: das Kind so beschreiben, dass niemand es erkennt." },
    { a: "kinder", b: "team", text: "Die Kinder wollen sofort spielen, das Team will erst aufräumen." },
  ],
  arten: {
    muss: { name: "Muss-Erwartung", farbe: "#b8433a", kurz: "rechtliche Folgen",
      text: "Verbindlich, oft durch Gesetz oder Vertrag geregelt. Wer sie nicht erfüllt, muss mit rechtlichen Folgen rechnen." },
    soll: { name: "Soll-Erwartung", farbe: "#d9a21b", kurz: "Ärger mit den Leuten",
      text: "Fast genauso verbindlich. Wer sie nicht erfüllt, bekommt soziale Folgen: Ärger, Ausgrenzung, schlechter Ruf." },
    kann: { name: "Kann-Erwartung", farbe: "#3f8f4f", kurz: "freiwillig",
      text: "Freiwillig. Wer sie erfüllt, bekommt Anerkennung. Wer sie nicht erfüllt, muss kaum mit Folgen rechnen." },
  },
  frageEinordnen: "Was passiert, wenn Finn Ihre Erwartung nicht erfüllt?",
  antwortenEinordnen: [
    { id: "muss", text: "Rechtliche Folgen", hilfe: "Vertrag, Gesetz, Note oder Gebühr" },
    { id: "soll", text: "Ärger mit den Leuten", hilfe: "Sie sind sauer, er hat einen schlechten Ruf" },
    { id: "kann", text: "Eigentlich nichts", hilfe: "Aber wenn er es tut, freuen sich alle" },
  ],
  begriffe: [
    { wort: "Position", text: "Ein Platz im Netz sozialer Beziehungen, zum Beispiel Praktikant, Fahrschüler, Freund. Jeder Mensch hat viele Positionen." },
    { wort: "Soziale Rolle", text: "Das Bündel von Erwartungen, das an jemanden in einer Position gerichtet ist." },
    { wort: "Bezugsgruppe", text: "Die Personen oder Gruppen, von denen diese Erwartungen kommen." },
  ],
  konfliktArten: {
    intra: { name: "Intrarollenkonflikt", merk: "intra = innerhalb",
      text: "Verschiedene Bezugsgruppen haben unvereinbare Erwartungen an dieselbe Rolle." },
    inter: { name: "Interrollenkonflikt", merk: "inter = zwischen",
      text: "Die Erwartungen an zwei verschiedene Rollen derselben Person lassen sich nicht vereinbaren." },
  },
  quiz: [
    { id: "q1", text: "Lina macht ihr Praktikum im Krankenhaus. Die Stationsleitung will, dass sie beim Bettenmachen hilft. Gleichzeitig bittet ein Patient sie, ihm aus der Cafeteria etwas zu holen.", loesung: "intra",
      warum: "Stationsleitung und Patient erwarten beide etwas von Lina als Praktikantin." },
    { id: "q2", text: "Jonas jobbt abends im Kino. Sein Chef will, dass er bis Mitternacht bleibt. In der Kita beginnt sein Dienst am nächsten Morgen um 7 Uhr, und die Anleiterin erwartet, dass er fit ist.", loesung: "inter",
      warum: "Zwei Rollen prallen aufeinander: Aushilfe im Kino und Praktikant in der Kita." },
    { id: "q3", text: "Mara ist Praktikantin im Altenheim. Eine Bewohnerin möchte, dass Mara sich lange zu ihr setzt und erzählt. Die Pflegefachkraft erwartet, dass Mara in dieser Zeit die Getränke verteilt.", loesung: "intra",
      warum: "Bewohnerin und Pflegefachkraft richten ihre Erwartungen an dieselbe Rolle: Mara als Praktikantin." },
    { id: "q4", text: "Elif ist Praktikantin in einer Wohngruppe für Menschen mit Behinderung. Ihre beste Freundin will wissen, wie die Bewohner so sind. Die Einrichtung verlangt Verschwiegenheit.", loesung: "inter",
      warum: "Die Freundin erwartet etwas von Elif als Freundin, die Einrichtung von Elif als Praktikantin." },
    { id: "q5", text: "Tom macht sein Praktikum in einer offenen Ganztagsschule. Die Kinder wollen, dass er ihnen bei den Hausaufgaben die Lösungen verrät. Die Lehrerin erwartet, dass die Kinder selbst arbeiten.", loesung: "intra",
      warum: "Kinder und Lehrerin erwarten Gegensätzliches von Tom als Praktikant." },
    { id: "q6", text: "Sophie ist Praktikantin in der Kita und Kapitänin ihrer Handballmannschaft. Am Freitag ist Laternenfest in der Kita, die Anleiterin zählt auf sie. Zur selben Zeit hat ihr Team ein wichtiges Spiel.", loesung: "inter",
      warum: "Die Rolle als Praktikantin und die Rolle als Kapitänin stoßen zusammen." },
  ],
  merksatz: "Nach Dahrendorf folgt man meist der Erwartung mit dem stärksten Druck: Muss vor Soll vor Kann.",
};

export const PHASEN = ["anmelden", "ziehen", "aufdecken", "einordnen", "quiz", "beispiele"];

export function konfliktArt(sz, k) {
  const pa = sz.knoten.find((n) => n.id === k.a).position, pb = sz.knoten.find((n) => n.id === k.b).position;
  return pa === pb ? "intra" : "inter";
}
