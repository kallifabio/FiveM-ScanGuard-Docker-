<div align="center">

# 🛡️ FiveM ScanGuard

**Selbst gehosteter Malware-Scanner für FiveM-Ressourcen — als Docker-Container mit Dashboard, API und Discord-Alerts.**

[![Docker Image](https://img.shields.io/badge/docker-fivem--scanguard-9d5cff?logo=docker&logoColor=white)](https://hub.docker.com/r/dein-dockerhub-name/fivem-scanguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Made for FiveM](https://img.shields.io/badge/made%20for-FiveM-ff4d6d)](https://fivem.net)

</div>

---

Die meisten FiveM-Scanner sind einmalig ausführbare Skripte oder `.exe`-Dateien.
**FiveM ScanGuard** läuft stattdessen dauerhaft als Service: Ressourcenordner
mounten (oder ZIP hochladen), Scan starten oder automatisch im Intervall
laufen lassen, Ergebnisse im Dashboard ansehen — und bei Funden direkt eine
Discord-Nachricht bekommen.

```
┌───────────────────────┐        ┌──────────────────────────┐
│  resources/ (Volume)   │  ───▶  │   FiveM ScanGuard         │
│  oder ZIP-Upload       │        │   • Scan-Engine           │
└───────────────────────┘        │   • Web-Dashboard          │
                                  │   • REST-API               │
                                  │   • Discord-Webhook        │
                                  └──────────────────────────┘
```

## ✨ Funktionen

| | |
|---|---|
| 🕵️ **Statische Analyse** | Über ein Dutzend Regeln für RCE, Shell-Exec, Exfiltration u. v. m. |
| 📊 **Web-Dashboard** | Scan-Log nach Ressource gruppiert, Risiko-Score, Schweregrad-Filter, Textsuche |
| 📤 **Report-Export** | Aktuellen Scan als JSON oder Markdown herunterladen |
| 🔌 **REST-API** | Scans per `curl`/CI-Pipeline auslösen, Ergebnisse als JSON abfragen |
| 🔒 **Zugriffsschutz** | Optionales `AUTH_TOKEN` schützt Dashboard und API (Bearer-Token) |
| 🔔 **Discord-Alerts** | Automatische Benachrichtigung bei kritischen/hohen Funden |
| ⏱️ **Auto-Scan** | Optionales Intervall statt manuellem Anstoßen |
| 🧩 **Erweiterbar** | Eigene Domain-Blockliste per `blocklist.txt`, Regeln in einer Datei |
| 🧱 **Robust** | Scan im Worker-Thread (Server bleibt responsiv), gehärteter ZIP-Upload, Rate-Limit |
| 🌐 **Offline-fähig** | UI ohne CDN – Tailwind, Icons und Schriften werden lokal ausgeliefert |

## 🕵️ Was wird erkannt?

Musteranalyse über `.lua`, `.js`, `.html`, `.cfg` und `fxmanifest.lua`:

- Dynamisches Nachladen/Ausführen von Code (`load`, `loadstring`, HTTP-Fetch + Exec)
- Shell-Ausführung (`os.execute`, `io.popen`)
- Selbstmodifizierende Dateien (`SaveResourceFile`)
- Fest codierte Discord-Webhooks / Telegram-Bot-Tokens (typische Exfiltrationskanäle)
- Laufzeit-Rechteausweitung (`add_ace`, `add_principal`)
- Mögliches Identifier-Harvesting
- Hohe Entropie in Zeichenketten (Hinweis auf verschlüsselte/obfuskierte Payloads)
- Verdächtige externe URLs im `fxmanifest.lua`
- Abgleich gegen eine Blockliste bekannter Backdoor-/C2-Domains (erweiterbar)

> ⚠️ **Hinweis:** Das ist statische Heuristik, kein Ersatz für eine manuelle
> Code-Review. Gute Obfuskierung kann Erkennung umgehen, und False Positives
> sind möglich (z. B. legitime Nutzung von `SaveResourceFile`). Funde sind ein
> Hinweis, kein Urteil.

## 🚀 Schnellstart

```bash
docker compose up -d
```

Dashboard danach unter `http://localhost:8080`. Standardmäßig wird
`./resources` (dein FiveM-`resources`-Ordner) read-only in den Container
gemountet.

Alternativ direkt mit `docker run`:

```bash
docker run -d \
  --name fivem-scanguard \
  -p 8080:8080 \
  -v /pfad/zu/deinem/resources:/resources:ro \
  -v scanguard-data:/data \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
  -e SCAN_INTERVAL_MINUTES=60 \
  dein-dockerhub-name/fivem-scanguard:latest
```

## ⚙️ Umgebungsvariablen

Eine `.env`-Datei im Projektverzeichnis wird beim Start automatisch geladen
(`dotenv`); bereits gesetzte Variablen der Umgebung haben Vorrang. Als Vorlage
dient [`.env.example`](./.env.example). Im Docker-Betrieb kommen die Werte aus
`docker-compose.yml` bzw. `docker run -e …`.

| Variable                | Standard      | Beschreibung                                                    |
| ------------------------ | ------------- | ----------------------------------------------------------------- |
| `PORT`                   | `8080`        | Port für Dashboard und API                                        |
| `RESOURCES_PATH`         | `/resources`  | Pfad im Container, der gescannt wird                               |
| `DATA_DIR`               | `/data`       | Ablage für Scan-Historie und optionale `blocklist.txt`             |
| `DISCORD_WEBHOOK_URL`    | *(leer)*      | Webhook-URL für Benachrichtigungen bei kritischen/hohen Funden     |
| `SCAN_INTERVAL_MINUTES`  | `0`           | > 0 aktiviert automatische Scans im angegebenen Minutenabstand     |
| `AUTH_TOKEN`             | *(leer)*      | Gesetzt = Dashboard/API verlangen `Authorization: Bearer <token>` |
| `TRUST_PROXY`            | *(leer)*      | Hinter Reverse-Proxy (`loopback`/`1`/`true`) für korrekte Client-IP |
| `MAX_HISTORY`            | `100`         | Anzahl behaltener Scans; ältere werden automatisch rotiert         |
| `SCAN_TIMEOUT_MS`        | `120000`      | Harte Obergrenze für die Laufzeit eines Scans                      |
| `SCAN_MIN_INTERVAL_MS`   | `3000`        | Mindestabstand zwischen zwei Scan-Anfragen pro Client              |
| `MAX_ZIP_ENTRIES` / `MAX_ZIP_BYTES` / `MAX_ZIP_FILE_BYTES` / `MAX_ZIP_RATIO` | `20000` / `512 MiB` / `64 MiB` / `120` | Grenzen für den ZIP-Upload (Zip-Slip / Zip-Bomben) |

Eigene Blockliste: Lege eine Datei `blocklist.txt` im `/data`-Volume ab (eine
Domain pro Zeile, `#` für Kommentare) — sie ergänzt die eingebaute Liste.

## 🔌 REST-API

| Methode & Pfad          | Beschreibung                                            |
| ------------------------ | -------------------------------------------------------- |
| `GET /api/health`       | Health-Check (auch für `HEALTHCHECK` im Image genutzt)   |
| `GET /api/config`       | Aktuelle Konfiguration (Pfad, ob Discord aktiv ist)      |
| `POST /api/scan/path`   | Scannt `RESOURCES_PATH`                                  |
| `POST /api/scan/upload` | Multipart-Upload eines ZIP-Archivs (Feldname `archive`)  |
| `GET /api/scans`        | Liste der letzten Scans (Zusammenfassung)                |
| `GET /api/scans/:id`    | Vollständiger Scan inkl. aller Funde                     |
| `DELETE /api/scans/:id` | Einzelnen Scan aus dem Verlauf löschen                   |
| `DELETE /api/scans`     | Kompletten Verlauf löschen                               |

Ist `AUTH_TOKEN` gesetzt, brauchen alle Endpunkte außer `GET /api/health` den
Header `Authorization: Bearer <token>`:

```bash
curl -s -X POST -H "Authorization: Bearer $AUTH_TOKEN" http://scanguard:8080/api/scan/path | jq '.summary'
```

Praktisch für CI/CD: Scan nach dem Deploy neuer Ressourcen triggern und die
Response auf `summary.counts.critical > 0` prüfen, um einen Merge zu blocken.

```bash
curl -s -X POST http://scanguard:8080/api/scan/path | jq '.summary'
```

## 🐳 Portainer

`portainer-stack.yml` ist ein fertiger Stack: **Stacks → Add stack → Web editor**,
Inhalt einfügen, `DEINUSER` ersetzen, unter *Environment variables* mindestens
`RESOURCES_HOST_PATH` (Pfad zum resources-Ordner auf dem Docker-Host) und – wenn
gewünscht – `AUTH_TOKEN` setzen, dann **Deploy the stack**. Update später über
**Pull and redeploy**. Das `/data`-Volume bleibt erhalten.

## 📦 Release / neue Version auf Docker Hub

Kurzfassung – Details in [`docs/RELEASE.md`](./docs/RELEASE.md):

```bash
npm test
npm version patch          # baut Assets, bumpt Version, setzt Git-Tag vX.Y.Z
VERSION=$(node -p "require('./package.json').version")
docker buildx build --platform linux/amd64,linux/arm64 \
  -t DEINUSER/fivem-scanguard:$VERSION \
  -t DEINUSER/fivem-scanguard:latest --push .
git push --follow-tags
```

Die Overview-Seite des Docker-Hub-Repos wird aus [`docs/DOCKERHUB.md`](./docs/DOCKERHUB.md)
gepflegt (manuell einfügen oder automatisch über
[`.github/workflows/docker-publish.yml`](./.github/workflows/docker-publish.yml),
das bei jedem `v*`-Tag baut, pusht und die Beschreibung synchronisiert).

## 🧪 Lokale Entwicklung ohne Docker

```bash
npm install
npm run build      # UI-Assets erzeugen (Tailwind, Icons, Schriften -> public/assets/)
npm run dev        # startet mit RESOURCES_PATH=./test-resources, DATA_DIR=./data
```

`npm run dev` nutzt `cross-env` und funktioniert damit auch unter PowerShell und
`cmd.exe`. Wer die Variablen selbst setzen will:

```powershell
# PowerShell
$env:RESOURCES_PATH="./test-resources"; $env:DATA_DIR="./data"; npm start
```

```bash
# bash / zsh
RESOURCES_PATH=./test-resources DATA_DIR=./data npm start
```

Weitere Skripte: `npm test` (Unit-Tests via `node --test`), `npm run lint`
(ESLint), `npm run format` (Prettier). Die gebauten Assets unter
`public/assets/` sind eingecheckt, damit `npm install && npm start` ohne
Build-Schritt läuft; nach Änderungen an `src/styles/` oder den Icons `npm run
build` erneut ausführen.

## 📄 Lizenz

MIT — siehe [`LICENSE`](./LICENSE).
