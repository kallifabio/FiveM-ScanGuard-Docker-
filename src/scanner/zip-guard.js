const fs = require('fs');
const path = require('path');

/*
 * Schutz gegen bösartige ZIP-Uploads:
 *   - Zip-Slip: Einträge mit ".." oder absolutem Pfad, die aus dem Zielordner
 *     ausbrechen würden.
 *   - Zip-Bomben: sehr viele Einträge, riesige entpackte Gesamtgröße oder ein
 *     extremes Kompressionsverhältnis.
 * Entpackt wird anschließend Eintrag für Eintrag mit erneuter Pfadprüfung –
 * nicht per adm-zip `extractAllTo`.
 */

const DEFAULT_LIMITS = {
  maxEntries: intEnv('MAX_ZIP_ENTRIES', 20000),
  maxTotalBytes: intEnv('MAX_ZIP_BYTES', 512 * 1024 * 1024),
  maxSingleBytes: intEnv('MAX_ZIP_FILE_BYTES', 64 * 1024 * 1024),
  maxRatio: intEnv('MAX_ZIP_RATIO', 120)
};

function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isUnsafePath(entryName) {
  if (!entryName) return true;
  const normalized = entryName.replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) return true;
  return normalized.split('/').some((seg) => seg === '..');
}

function inspectZipEntries(entries, limits = DEFAULT_LIMITS) {
  if (entries.length > limits.maxEntries) {
    throw new Error(`ZIP hat zu viele Einträge (${entries.length} > ${limits.maxEntries}).`);
  }

  let totalUncompressed = 0;
  let totalCompressed = 0;

  for (const entry of entries) {
    if (isUnsafePath(entry.entryName)) {
      throw new Error(`Unsicherer Pfad im Archiv: "${entry.entryName}".`);
    }
    if (entry.isDirectory) continue;

    const size = entry.header.size || 0;
    const compressed = entry.header.compressedSize || 0;
    if (size > limits.maxSingleBytes) {
      throw new Error(
        `Datei "${entry.entryName}" ist entpackt zu groß (${size} > ${limits.maxSingleBytes} Bytes).`
      );
    }
    totalUncompressed += size;
    totalCompressed += compressed;
  }

  if (totalUncompressed > limits.maxTotalBytes) {
    throw new Error(
      `Archiv ist entpackt zu groß (${totalUncompressed} > ${limits.maxTotalBytes} Bytes).`
    );
  }
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > limits.maxRatio) {
    throw new Error(
      `Verdächtiges Kompressionsverhältnis (${Math.round(
        totalUncompressed / totalCompressed
      )}:1) – mögliche ZIP-Bombe.`
    );
  }

  return { entryCount: entries.length, totalUncompressed, totalCompressed };
}

function safeExtract(zip, destDir) {
  const resolvedDest = path.resolve(destDir);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (isUnsafePath(entry.entryName)) {
      throw new Error(`Unsicherer Pfad im Archiv: "${entry.entryName}".`);
    }
    const target = path.resolve(resolvedDest, entry.entryName);
    if (target !== resolvedDest && !target.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Eintrag "${entry.entryName}" bricht aus dem Zielordner aus.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
}

module.exports = { inspectZipEntries, safeExtract, isUnsafePath, DEFAULT_LIMITS };
