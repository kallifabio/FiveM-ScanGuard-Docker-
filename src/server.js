// Lädt eine .env aus dem Projektverzeichnis (falls vorhanden) in process.env.
// Muss vor allen anderen Modulen laufen, die Env-Variablen auswerten.
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { router: apiRouter, runScan, getEnv } = require('./routes/api');
const { ensureDir } = require('./store');

const app = express();
const PORT = process.env.PORT || 8080;

// Hinter einem Reverse-Proxy: TRUST_PROXY=loopback|1|true, damit req.ip
// (Rate-Limit-Schlüssel) die echte Client-Adresse ist.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.disable('x-powered-by');

const { dataDir, authToken } = getEnv();
ensureDir(dataDir);
ensureDir(path.join(dataDir, 'scans'));

app.use(express.json({ limit: '256kb' }));
app.use('/api', apiRouter);
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    setHeaders(res, filePath) {
      // index.html nie lange cachen – Assets (mit Hash-freiem Namen) 1 h.
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

app.listen(PORT, () => {
  console.log(`[fivem-scanguard] läuft auf Port ${PORT}`);
  console.log(`[fivem-scanguard] Auth: ${authToken ? 'aktiv (AUTH_TOKEN gesetzt)' : 'deaktiviert'}`);

  const intervalMinutes = parseInt(process.env.SCAN_INTERVAL_MINUTES || '0', 10);
  if (intervalMinutes > 0) {
    const { resourcesPath } = getEnv();
    console.log(
      `[fivem-scanguard] automatischer Scan alle ${intervalMinutes} Minuten (${resourcesPath})`
    );
    setInterval(
      () => {
        if (fs.existsSync(resourcesPath)) {
          runScan(resourcesPath, resourcesPath).catch((err) => {
            console.error('[fivem-scanguard] automatischer Scan fehlgeschlagen:', err.message);
          });
        }
      },
      intervalMinutes * 60 * 1000
    );
  }
});
