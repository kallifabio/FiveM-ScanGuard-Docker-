const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../src/store');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scanguard-store-'));
}

function makeScan(i) {
  return {
    id: `id-${i}`,
    createdAt: new Date(Date.now() + i * 1000).toISOString(),
    targetLabel: `ziel-${i}`,
    summary: { riskScore: i, counts: { critical: 0, high: 0, medium: 0, low: 0 }, findingCount: 0 }
  };
}

test('saveScan / listScans / getScan – neuester zuerst', () => {
  const dir = tmpDataDir();
  store.saveScan(dir, makeScan(1));
  store.saveScan(dir, makeScan(2));
  store.saveScan(dir, makeScan(3));

  const list = store.listScans(dir);
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'id-3');
  assert.equal(store.getScan(dir, 'id-2').targetLabel, 'ziel-2');
  assert.equal(store.getScan(dir, 'fehlt'), null);
});

test('deleteScan entfernt Datei und Index-Eintrag', () => {
  const dir = tmpDataDir();
  store.saveScan(dir, makeScan(1));
  store.saveScan(dir, makeScan(2));
  assert.equal(store.deleteScan(dir, 'id-1'), true);
  assert.equal(store.deleteScan(dir, 'id-1'), false);
  assert.equal(store.listScans(dir).length, 1);
  assert.equal(store.getScan(dir, 'id-1'), null);
});

test('clearScans leert alles', () => {
  const dir = tmpDataDir();
  store.saveScan(dir, makeScan(1));
  store.clearScans(dir);
  assert.equal(store.listScans(dir).length, 0);
});

test('MAX_HISTORY rotiert alte Scans weg', () => {
  const prev = process.env.MAX_HISTORY;
  process.env.MAX_HISTORY = '3';
  try {
    const dir = tmpDataDir();
    for (let i = 1; i <= 6; i += 1) store.saveScan(dir, makeScan(i));
    const list = store.listScans(dir);
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((e) => e.id),
      ['id-6', 'id-5', 'id-4']
    );
    assert.equal(store.getScan(dir, 'id-1'), null);
    assert.ok(store.getScan(dir, 'id-6'));
  } finally {
    if (prev === undefined) delete process.env.MAX_HISTORY;
    else process.env.MAX_HISTORY = prev;
  }
});

test('rebuildIndex stellt Index aus Scan-Dateien wieder her', () => {
  const dir = tmpDataDir();
  store.saveScan(dir, makeScan(1));
  store.saveScan(dir, makeScan(2));
  fs.rmSync(path.join(dir, 'scans', '_index.json'), { force: true });
  const rebuilt = store.rebuildIndex(dir);
  assert.equal(rebuilt.length, 2);
  assert.equal(rebuilt[0].id, 'id-2');
});
