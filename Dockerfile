# ---------- Build-Stage: UI-Assets erzeugen (Tailwind, Icons, Schriften) ----------
# Läuft IMMER nativ auf der Runner-Architektur (--platform=$BUILDPLATFORM), nie
# emuliert: die Assets (CSS/SVG/woff2) sind architektur-unabhängig, und `npm ci`
# mit den vollen devDeps crasht unter QEMU-arm64 ("Illegal instruction").
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tailwind.config.js ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public
RUN npm run build

# ---------- Runtime-Stage: nur Produktions-Abhängigkeiten + fertige Assets ----------
FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="FiveM ScanGuard" \
      org.opencontainers.image.description="Self-hosted security scanner for FiveM resources with dashboard, API and Discord alerts." \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache wget

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY --from=build /app/public ./public

# Datenverzeichnis dem non-root-User übergeben (auch für Named Volumes relevant)
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV PORT=8080 \
    RESOURCES_PATH=/resources \
    DATA_DIR=/data \
    SCAN_INTERVAL_MINUTES=0 \
    DISCORD_WEBHOOK_URL= \
    AUTH_TOKEN=

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "src/server.js"]
