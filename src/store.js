const fs = require('fs');
const path = require('path');

/*
 * Scan-Ablage. Jeder Scan liegt als <id>.json im Ordner data/scans/.
 * Zusätzlich wird eine _index.json mit den Zusammenfassungen gepflegt, damit
 * die Verlaufsliste nicht bei jedem Aufruf sämtliche Scan-Dateien lesen und
 * parsen muss. Alte Scans werden über MAX_HISTORY automatisch rotiert.
 */

const INDEX_FILE = '_index.json';

function maxHistory() {
  const n = parseInt(process.env.MAX_HISTORY || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function scansDir(dataDir) {
  const dir = path.join(dataDir, 'scans');
  ensureDir(dir);
  return dir;
}

function indexPath(dataDir) {
  return path.join(scansDir(dataDir), INDEX_FILE);
}

function summaryOf(scan) {
  return {
    id: scan.id,
    createdAt: scan.createdAt,
    targetLabel: scan.targetLabel,
    summary: scan.summary
  };
}

function readIndex(dataDir) {
  try {
    const raw = fs.readFileSync(indexPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    /* Kein/kaputter Index -> unten neu aufbauen. */
  }
  return rebuildIndex(dataDir);
}

function writeIndex(dataDir, entries) {
  fs.writeFileSync(indexPath(dataDir), JSON.stringify(entries, null, 2), 'utf8');
}

function rebuildIndex(dataDir) {
  const dir = scansDir(dataDir);
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== INDEX_FILE)
    .map((f) => {
      try {
        return summaryOf(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  writeIndex(dataDir, entries);
  return entries;
}

function removeScanFile(dataDir, id) {
  try {
    fs.rmSync(path.join(scansDir(dataDir), `${id}.json`), { force: true });
  } catch (err) {
    /* egal */
  }
}

function saveScan(dataDir, scan) {
  const dir = scansDir(dataDir);
  fs.writeFileSync(path.join(dir, `${scan.id}.json`), JSON.stringify(scan, null, 2), 'utf8');

  let index = readIndex(dataDir).filter((e) => e.id !== scan.id);
  index.unshift(summaryOf(scan));

  if (index.length > maxHistory()) {
    for (const stale of index.slice(maxHistory())) removeScanFile(dataDir, stale.id);
    index = index.slice(0, maxHistory());
  }

  writeIndex(dataDir, index);
  return scan;
}

function getScan(dataDir, id) {
  const filePath = path.join(scansDir(dataDir), `${path.basename(String(id))}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function listScans(dataDir, limit = 50) {
  return readIndex(dataDir).slice(0, limit);
}

function deleteScan(dataDir, id) {
  const index = readIndex(dataDir);
  const next = index.filter((e) => e.id !== id);
  if (next.length === index.length) return false;
  removeScanFile(dataDir, id);
  writeIndex(dataDir, next);
  return true;
}

function clearScans(dataDir) {
  const dir = scansDir(dataDir);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) fs.rmSync(path.join(dir, f), { force: true });
  }
  writeIndex(dataDir, []);
}

module.exports = {
  saveScan,
  getScan,
  listScans,
  deleteScan,
  clearScans,
  ensureDir,
  rebuildIndex
};
