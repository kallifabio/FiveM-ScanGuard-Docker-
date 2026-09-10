const fs = require('fs');
const path = require('path');
const { CONTENT_RULES, DEFAULT_BLOCKLIST } = require('./rules');

const SCAN_EXTENSIONS = new Set(['.lua', '.js', '.html', '.json', '.cfg']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.vscode']);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // Dateien > 2 MB werden übersprungen
const ENTROPY_THRESHOLD = 4.4;
const ENTROPY_MIN_LENGTH = 60;
// Obergrenzen, damit ein bösartig konstruiertes Repo den Scan nicht mit
// Millionen Treffern aufblähen kann (Speicher/Antwortgröße).
const MAX_FINDINGS_PER_RULE_PER_FILE = 100;
const MAX_TOTAL_FINDINGS = 5000;

function entropyPattern() {
  // Frische Regex je Aufruf – kein geteilter lastIndex zwischen Scans.
  return new RegExp(`['"\`]([A-Za-z0-9+/=_-]{${ENTROPY_MIN_LENGTH},})['"\`]`, 'g');
}

function shannonEntropy(str) {
  if (!str.length) return 0;
  const freq = new Map();
  for (const ch of str) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function loadBlocklist(dataDir) {
  const customPath = path.join(dataDir, 'blocklist.txt');
  try {
    if (fs.existsSync(customPath)) {
      const lines = fs
        .readFileSync(customPath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      return [...new Set([...DEFAULT_BLOCKLIST, ...lines])];
    }
  } catch (err) {
    // Bei Lesefehlern greift die eingebaute Standardliste.
  }
  return DEFAULT_BLOCKLIST;
}

function walkFiles(rootDir) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(rootDir);
  return results;
}

function lineNumberFromIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function snippetForLine(content, lineNumber) {
  const line = content.split('\n')[lineNumber - 1] || '';
  const trimmed = line.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
}

function scanFileContent(content, fileName, relativePath) {
  const findings = [];

  for (const rule of CONTENT_RULES) {
    if (rule.fileNames && !rule.fileNames.includes(fileName)) continue;
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const regex = new RegExp(rule.pattern.source, flags);
    let match = regex.exec(content);
    let hits = 0;
    while (match !== null) {
      const lineNumber = lineNumberFromIndex(content, match.index);
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        file: relativePath,
        line: lineNumber,
        snippet: snippetForLine(content, lineNumber)
      });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
      if (++hits >= MAX_FINDINGS_PER_RULE_PER_FILE) break;
      match = regex.exec(content);
    }
  }

  const entropyRegex = entropyPattern();
  let entropyMatch = entropyRegex.exec(content);
  let entropyHits = 0;
  while (entropyMatch !== null) {
    const entropy = shannonEntropy(entropyMatch[1]);
    if (entropy >= ENTROPY_THRESHOLD) {
      const lineNumber = lineNumberFromIndex(content, entropyMatch.index);
      findings.push({
        ruleId: 'ENTROPY-001',
        severity: 'medium',
        title: 'Hohe Entropie in Zeichenkette',
        description: `Zeichenkette mit Entropie ${entropy.toFixed(2)} deutet auf verschlüsselte oder obfuskierte Nutzlast hin.`,
        file: relativePath,
        line: lineNumber,
        snippet: snippetForLine(content, lineNumber)
      });
      if (++entropyHits >= MAX_FINDINGS_PER_RULE_PER_FILE) break;
    }
    entropyMatch = entropyRegex.exec(content);
  }

  return findings;
}

function scanForBlocklist(content, relativePath, blocklist) {
  const findings = [];
  for (const domain of blocklist) {
    const idx = content.indexOf(domain);
    if (idx !== -1) {
      const lineNumber = lineNumberFromIndex(content, idx);
      findings.push({
        ruleId: 'NET-001',
        severity: 'critical',
        title: 'Bekannte bösartige Infrastruktur',
        description: `Die Domain "${domain}" ist als bekannte Backdoor-/C2-Infrastruktur gelistet.`,
        file: relativePath,
        line: lineNumber,
        snippet: snippetForLine(content, lineNumber)
      });
    }
  }
  return findings;
}

function summarize(findings, resourceCount, fileCount) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const riskScore = counts.critical * 10 + counts.high * 5 + counts.medium * 2 + counts.low * 1;
  return { resourceCount, fileCount, findingCount: findings.length, counts, riskScore };
}

function scanDirectory(rootDir, options = {}) {
  const dataDir = options.dataDir || '/data';
  const blocklist = loadBlocklist(dataDir);
  const files = walkFiles(rootDir);
  const findings = [];
  const resources = new Set();

  for (const filePath of files) {
    let content;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) continue;
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      continue;
    }

    const relativePath = path.relative(rootDir, filePath);
    const fileName = path.basename(filePath);
    const topLevelDir = relativePath.split(path.sep)[0];
    resources.add(topLevelDir);

    findings.push(...scanFileContent(content, fileName, relativePath));
    findings.push(...scanForBlocklist(content, relativePath, blocklist));

    if (findings.length >= MAX_TOTAL_FINDINGS) {
      findings.length = MAX_TOTAL_FINDINGS;
      break;
    }
  }

  findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return { findings, summary: summarize(findings, resources.size, files.length) };
}

module.exports = { scanDirectory, shannonEntropy };
