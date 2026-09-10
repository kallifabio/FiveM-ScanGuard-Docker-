# Neue Version veröffentlichen

`kallifabio` = dein Docker-Hub-Benutzer/Namespace.

## Einmalig einrichten

```bash
docker login
docker buildx create --use --name scanguard-builder   # Multi-Arch-Builder
```

## Release-Ablauf

### 1. Arbeitsstand prüfen

```bash
npm ci
npm run lint
npm test
```

Working Tree sauber, auf `main`, alles gepusht.

### 2. Version anheben

```bash
npm version patch     # 1.0.0 -> 1.0.1   (Bugfix)
# npm version minor   # 1.0.0 -> 1.1.0   (neue Features, abwärtskompatibel)
# npm version major   # 1.0.0 -> 2.0.0   (Breaking Change)
```

`npm version` …

- baut über den `version`-Hook die UI-Assets neu (`npm run build`) und legt sie mit in den Commit,
- aktualisiert `package.json` + `package-lock.json`,
- erstellt Commit **und** Git-Tag `vX.Y.Z`.

### 3. Image bauen und pushen (Multi-Arch)

```bash
VERSION=$(node -p "require('./package.json').version")

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t kallifabio/fivem-scanguard:$VERSION \
  -t kallifabio/fivem-scanguard:latest \
  --push .
```

Nur eine Architektur (schneller, lokal testbar):

```bash
docker build -t kallifabio/fivem-scanguard:$VERSION -t kallifabio/fivem-scanguard:latest .
docker push kallifabio/fivem-scanguard:$VERSION
docker push kallifabio/fivem-scanguard:latest
```

### 4. Git pushen

```bash
git push --follow-tags
```

### 5. Docker-Hub-Overview aktualisieren

Docker Hub → Repository → **Edit** → Inhalt von [`docs/DOCKERHUB.md`](./DOCKERHUB.md)
in „Overview" einfügen. Oder automatisiert per GitHub Action (siehe unten).

## Deployen der neuen Version

| Umgebung | Update |
|---|---|
| `docker run` | `docker pull kallifabio/fivem-scanguard:latest && docker rm -f fivem-scanguard && docker run …` |
| `docker compose` | `docker compose pull && docker compose up -d` |
| **Portainer** | Stack öffnen → **Pull and redeploy** (bzw. „Re-pull image" aktivieren) |

Das `/data`-Volume (Scan-Historie) bleibt bei Updates erhalten.

## Optional: automatisch per GitHub Actions

`.github/workflows/docker-publish.yml` baut und pusht bei jedem `v*`-Tag und
synchronisiert die Docker-Hub-Beschreibung. Vorher als Repository-Secrets
hinterlegen:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN` (Docker Hub → Account Settings → Personal access tokens)

Danach reicht Schritt 2 + 4 (`npm version …` und `git push --follow-tags`) – den
Rest erledigt die Action.
