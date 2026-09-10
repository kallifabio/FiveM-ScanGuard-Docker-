const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { scanDirectory, shannonEntropy } = require('../src/scanner/engine');

const FIX = path.join(__dirname, 'fixtures');

test('erkennt mehrere kritische Muster in einer bösartigen Ressource', () => {
  const { findings, summary } = scanDirectory(path.join(FIX, 'malicious'), { dataDir: FIX });
  const ruleIds = new Set(findings.map((f) => f.ruleId));

  assert.ok(summary.findingCount >= 4, `erwartet >= 4 Funde, war ${summary.findingCount}`);
  assert.ok(summary.counts.critical >= 3, 'mehrere kritische Funde erwartet');
  assert.ok(summary.riskScore > 0);
  assert.ok(ruleIds.has('RCE-001'), 'loadstring-Regel sollte greifen');
  assert.ok(ruleIds.has('EXEC-001'), 'os.execute-Regel sollte greifen');
  assert.ok(ruleIds.has('EXFIL-001'), 'Discord-Webhook-Regel sollte greifen');
  assert.ok(ruleIds.has('MANIFEST-001'), 'externe fxmanifest-URL sollte greifen');
});

test('meldet keine Funde für eine saubere Ressource', () => {
  const { findings, summary } = scanDirectory(path.join(FIX, 'clean'), { dataDir: FIX });
  assert.equal(findings.length, 0);
  assert.equal(summary.riskScore, 0);
  assert.equal(summary.counts.critical, 0);
});

test('Findings tragen Datei, Zeile und Snippet', () => {
  const { findings } = scanDirectory(path.join(FIX, 'malicious'), { dataDir: FIX });
  for (const f of findings) {
    assert.ok(typeof f.file === 'string' && f.file.length > 0);
    assert.ok(Number.isInteger(f.line) && f.line > 0);
    assert.ok('snippet' in f);
  }
});

test('shannonEntropy: hoher Wert bei zufälligem String, 0 bei leer', () => {
  assert.equal(shannonEntropy(''), 0);
  assert.ok(shannonEntropy('aGVsbG8gd29ybGQgZm9vIGJhciBiYXo9PT0rLy8xMjM0') > 3.5);
});
