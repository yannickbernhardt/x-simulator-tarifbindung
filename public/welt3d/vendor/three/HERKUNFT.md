# three.js

- Version: 0.185.0 (r185), unverändert aus dem npm-Paket `three@0.185.0`, Ordner `build/`
- Lizenz: MIT, siehe `LICENSE`
- Dateien: `three.module.min.js` (lädt `three.core.min.js` aus demselben Ordner)
- Kein CDN: Das Spiel lädt three.js nur aus diesem Ordner.

Prüfsummen (SHA-256):

    0e9dd2793e01d0d9eb4f2ab00b4ffcdd4488275ebebee5c31fa8d347bc29f0bf  three.core.min.js
    86bcee248b64f44bcfc23c331ae74619061957d59cab040171dcb6fb5900beb6  three.module.min.js

Erneuern: `npm pack three@<Version>`, die beiden Dateien aus `package/build/` und `package/LICENSE`
hierher kopieren, Version und Prüfsummen in dieser Datei anpassen, danach das Spiel im Browser prüfen.
