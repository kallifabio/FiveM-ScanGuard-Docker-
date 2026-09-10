const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const { scanDirectoryAsync, isScanRunning } = require('../scanner/run');
const { inspectZipEntries, safeExtract } = require('../scanner/zip-guard');
const { saveScan, getScan, listScans, deleteScan, clearScans } = require('../store');
const { sendDiscordNotification } = require('../discord');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

function getEnv() {
  return {
    resourcesPath: process.env.RESOURCES_PATH || '/resources',
    dataDir: process.env.DATA_DIR || '/data',
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    authToken: process.env.AUTH_TOKEN || ''
  };
}

/* ---------- Auth ---------- */

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return require('crypto').timingSafeEqual(bufA, bufB);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      return decoded.slice(decoded.indexOf(':') + 1);
    } catch (err) {
      return '';
    }
  }
  return '';
}

function requireAuth(req, res, next) {
  const { authToken } = getEnv();
  if (!authToken) return next(); // Auth deaktiviert
  if (req.path === '/health') return next();
  if (timingSafeEqual(extractToken(req), authToken)) return next();
  res.set('WWW-Authenticate', 'Bearer realm="ScanGuard"');
  return res.status(401).json({ error: 'Token erforderlich oder ungültig.' });
}

router.use(requireAuth);

/* ---------- Rate-Limit für Scans ---------- */

const lastScanByClient = new Map();

function scanRateLimit(req, res, next) {
  const minInterval = parseInt(process.env.SCAN_MIN_INTERVAL_MS || '', 10) || 3000;
  const key = req.ip || 'unknown';
  const now = Date.now();
  const last = lastScanByClient.get(key) || 0;
  if (now - last < minInterval) {
    return res.status(429).json({ error: 'Zu viele Scan-Anfragen. Bitte kurz warten.' });
  }
  if (isScanRunning()) {
    return res.status(429).json({ error: 'Es läuft bereits ein Scan. Bitte kurz warten.' });
  }
  lastScanByClient.set(key, now);
  next();
}

/* ---------- Scan-Ausführung ---------- */

async function runScan(targetPath, targetLabel) {
  const { dataDir, discordWebhookUrl } = getEnv();
  const { findings, summary } = await scanDirectoryAsync(targetPath, { dataDir });
  const scan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    targetLabel,
    summary,
    findings
  };
  saveScan(dataDir, scan);
  if (discordWebhookUrl && (summary.counts.critical > 0 || summary.counts.high > 0)) {
    sendDiscordNotification(discordWebhookUrl, { summary, findings, targetLabel }).catch(() => {});
  }
  return scan;
}

/* ---------- Routen ---------- */

router.get('/health', (req, res) => {
  res.json({ status: 'ok', scanning: isScanRunning() });
});

router.get('/config', (req, res) => {
  const { resourcesPath, discordWebhookUrl, authToken } = getEnv();
  res.json({
    resourcesPath,
    discordConfigured: Boolean(discordWebhookUrl),
    authRequired: Boolean(authToken)
  });
});

router.post('/scan/path', scanRateLimit, async (req, res) => {
  const { resourcesPath } = getEnv();
  if (!fs.existsSync(resourcesPath)) {
    return res
      .status(400)
      .json({ error: `Pfad ${resourcesPath} existiert nicht. Ist das Volume gemountet?` });
  }
  try {
    res.json(await runScan(resourcesPath, resourcesPath));
  } catch (err) {
    const status = err.code === 'SCAN_BUSY' ? 429 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/scan/upload', scanRateLimit, upload.single('archive'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei erhalten (Feldname: archive).' });
  const extractDir = path.join(os.tmpdir(), `scanguard-${randomUUID()}`);
  try {
    fs.mkdirSync(extractDir, { recursive: true });
    const zip = new AdmZip(req.file.path);
    inspectZipEntries(zip.getEntries());
    safeExtract(zip, extractDir);
    res.json(await runScan(extractDir, req.file.originalname));
  } catch (err) {
    const status = err.code === 'SCAN_BUSY' ? 429 : 400;
    res.status(status).json({ error: `Konnte ZIP nicht verarbeiten: ${err.message}` });
  } finally {
    fs.rm(extractDir, { recursive: true, force: true }, () => {});
    fs.unlink(req.file.path, () => {});
  }
});

router.get('/scans', (req, res) => {
  res.json(listScans(getEnv().dataDir));
});

router.get('/scans/:id', (req, res) => {
  const scan = getScan(getEnv().dataDir, req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan nicht gefunden.' });
  res.json(scan);
});

router.delete('/scans/:id', (req, res) => {
  const removed = deleteScan(getEnv().dataDir, req.params.id);
  if (!removed) return res.status(404).json({ error: 'Scan nicht gefunden.' });
  res.json({ deleted: req.params.id });
});

router.delete('/scans', (req, res) => {
  clearScans(getEnv().dataDir);
  res.json({ cleared: true });
});

module.exports = { router, runScan, getEnv };
