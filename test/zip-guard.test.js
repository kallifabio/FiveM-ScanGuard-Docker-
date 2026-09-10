const test = require('node:test');
const assert = require('node:assert/strict');

const { isUnsafePath, inspectZipEntries } = require('../src/scanner/zip-guard');

function fakeEntry(name, { size = 10, compressedSize = 10, isDirectory = false } = {}) {
  return { entryName: name, isDirectory, header: { size, compressedSize } };
}

test('isUnsafePath erkennt Zip-Slip und absolute Pfade', () => {
  assert.equal(isUnsafePath('resource/server.lua'), false);
  assert.equal(isUnsafePath('a/b/c.lua'), false);
  assert.equal(isUnsafePath('../secret'), true);
  assert.equal(isUnsafePath('a/../../b'), true);
  assert.equal(isUnsafePath('/etc/passwd'), true);
  assert.equal(isUnsafePath('C:\\Windows\\x'), true);
  assert.equal(isUnsafePath(''), true);
});

test('inspectZipEntries akzeptiert ein harmloses Archiv', () => {
  const res = inspectZipEntries([
    fakeEntry('res/fxmanifest.lua', { size: 200, compressedSize: 120 }),
    fakeEntry('res/server.lua', { size: 1000, compressedSize: 400 })
  ]);
  assert.equal(res.entryCount, 2);
  assert.equal(res.totalUncompressed, 1200);
});

test('inspectZipEntries wirft bei unsicherem Pfad', () => {
  assert.throws(() => inspectZipEntries([fakeEntry('../evil.lua')]), /Unsicherer Pfad/);
});

test('inspectZipEntries wirft bei zu vielen Einträgen', () => {
  const many = Array.from({ length: 5 }, (_, i) => fakeEntry(`f${i}.lua`));
  assert.throws(() => inspectZipEntries(many, { maxEntries: 3, maxTotalBytes: 1e9, maxSingleBytes: 1e9, maxRatio: 100 }), /zu viele Einträge/);
});

test('inspectZipEntries wirft bei ZIP-Bombe (Kompressionsverhältnis)', () => {
  assert.throws(
    () =>
      inspectZipEntries([fakeEntry('bomb.txt', { size: 100 * 1024 * 1024, compressedSize: 50 * 1024 })], {
        maxEntries: 100,
        maxTotalBytes: 1024 * 1024 * 1024,
        maxSingleBytes: 1024 * 1024 * 1024,
        maxRatio: 120
      }),
    /ZIP-Bombe/
  );
});
