# FiveM ScanGuard

**Selbst gehosteter Malware-Scanner für FiveM-Ressourcen – Docker-Container mit Web-Dashboard, REST-API und Discord-Alerts.**

Ressourcenordner read-only mounten (oder ZIP hochladen), Scan manuell oder im
Intervall laufen lassen, Ergebnisse im Dashboard ansehen – bei kritischen Funden
kommt optional eine Discord-Nachricht.

- 🕵️ Statische Analyse: über ein Dutzend Regeln für RCE, Shell-Exec, Exfiltration, Rechteausweitung, Obfuskation, C2-Domains
- 📊 Dashboard: Scan-Log nach Ressource gruppiert, Risiko-Score, Schweregrad-Filter, Textsuche
- 📤 Report-Export als JSON oder Markdown
- 🔌 REST-API für CI/CD
- 🔒 Optionaler Token-Schutz (`AUTH_TOKEN`) für Dashboard und API
- 🔔 Discord-Webhook bei kritischen/hohen Funden
- 🧱 Scan im Worker-Thread (Server bleibt responsiv), gehärteter ZIP-Upload, Rate-Limit
- 🌐 UI läuft komplett offline (keine CDNs)

---

## Schnellstart

```bash
docker run -d \
  --name fivem-scanguard \
  -p 8080:8080 \
  -v /pfad/zu/deinem/resources:/resources:ro \
  -v scanguard-data:/data \
  -e AUTH_TOKEN="ein-langes-zufaelliges-token" \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
  -e SCAN_INTERVAL_MINUTES=60 \
  --read-only --tmpfs /tmp \
  --security-opt no-new-privileges:true \
  kallifabio/fivem-scanguard:latest
```

Dashboard danach unter `http://SERVER-IP:8080`. Ist `AUTH_TOKEN` gesetzt, fragt
das Dashboard beim ersten Aufruf danach.

## docker-compose

```yaml
services:
  scanguard:
    image: kallifabio/fivem-scanguard:latest
    container_name: fivem-scanguard
    ports:
      - "8080:8080"
    environment:
      AUTH_TOKEN: "ein-langes-zufaelliges-token"
      DISCORD_WEBHOOK_URL: ""
      SCAN_INTERVAL_MINUTES: "0"
      RESOURCES_PATH: /resources
    volumes:
      - ./resources:/resources:ro
      - scanguard-data:/data
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    mem_limit: 512m
    cpus: 1.0

volumes:
  scanguard-data:
```

## Portainer

1. **Stacks → Add stack → Web editor**.
2. Den Inhalt von [`portainer-stack.yml`](https://github.com/kallifabio/fivem-scanguard/blob/main/portainer-stack.yml) einfügen.
3. Unter **Environment variables** setzen:
   | Name | Beispiel | Zweck |
   |---|---|---|
   | `RESOURCES_HOST_PATH` | `/opt/fivem/server-data/resources` | Pfad zum resources-Ordner **auf dem Docker-Host** |
   | `AUTH_TOKEN` | *(langes Zufallstoken)* | Schutz für Dashboard/API |
   | `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/…` | Alerts (optional) |
   | `SCAN_INTERVAL_MINUTES` | `60` | Auto-Scan (optional, `0` = aus) |
   | `SCANGUARD_PORT` | `8080` | Host-Port (optional) |
4. **Deploy the stack**. Update später über **Pull and redeploy** (holt `:latest` neu).

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `8080` | Port für Dashboard und API |
| `RESOURCES_PATH` | `/resources` | Pfad im Container, der gescannt wird |
| `DATA_DIR` | `/data` | Ablage für Scan-Historie und optionale `blocklist.txt` |
| `AUTH_TOKEN` | *(leer)* | Gesetzt = `Authorization: Bearer <token>` für alles außer `/api/health` |
| `DISCORD_WEBHOOK_URL` | *(leer)* | Webhook für kritische/hohe Funde |
| `SCAN_INTERVAL_MINUTES` | `0` | > 0 aktiviert automatische Scans |
| `TRUST_PROXY` | *(leer)* | `1`/`loopback`/`true` hinter Reverse-Proxy (korrekte Client-IP fürs Rate-Limit) |
| `MAX_HISTORY` | `100` | Behaltene Scans; ältere werden rotiert |
| `SCAN_TIMEOUT_MS` | `120000` | Harte Obergrenze pro Scan |
| `SCAN_MIN_INTERVAL_MS` | `3000` | Mindestabstand zwischen Scan-Anfragen pro Client |
| `MAX_ZIP_ENTRIES` / `MAX_ZIP_BYTES` / `MAX_ZIP_FILE_BYTES` / `MAX_ZIP_RATIO` | `20000` / `512 MiB` / `64 MiB` / `120` | Grenzen für den ZIP-Upload (Zip-Slip / Zip-Bomben) |

## Volumes & Ports

| | |
|---|---|
| `/resources` | resources-Ordner, **read-only** mounten |
| `/data` | benanntes Volume für Scan-Historie (`scanguard-data`) |
| `8080/tcp` | Dashboard + API |

Eigene Blockliste: Datei `blocklist.txt` ins `/data`-Volume legen (eine Domain
pro Zeile, `#` für Kommentare) – ergänzt die eingebaute Liste.

## Tags

| Tag | Bedeutung |
|---|---|
| `latest` | jeweils neuster Release |
| `X.Y.Z` | fixierte Release-Version (empfohlen für Produktion) |

Plattformen: `linux/amd64`, `linux/arm64` (z. B. Raspberry Pi).

## REST-API (Kurzform)

| Methode & Pfad | Zweck |
|---|---|
| `GET /api/health` | Health-Check (kein Token nötig) |
| `POST /api/scan/path` | scannt `RESOURCES_PATH` |
| `POST /api/scan/upload` | Multipart-ZIP-Upload (Feld `archive`) |
| `GET /api/scans` · `GET /api/scans/:id` | Verlauf / einzelner Scan |
| `DELETE /api/scans/:id` · `DELETE /api/scans` | Scan bzw. Verlauf löschen |

```bash
curl -s -X POST -H "Authorization: Bearer $AUTH_TOKEN" \
  http://SERVER:8080/api/scan/path | jq '.summary.counts'
```

## Hinweis

Statische Heuristik, kein Ersatz für eine manuelle Code-Review. Gute
Obfuskierung kann Erkennung umgehen, False Positives sind möglich. Funde sind
ein Hinweis, kein Urteil.

Quellcode & Doku: **https://github.com/kallifabio/fivem-scanguard** · Lizenz: MIT
