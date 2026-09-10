const path = require('path');
const { Worker } = require('worker_threads');

/*
 * Führt einen Scan in einem Worker-Thread aus – mit hartem Timeout und einer
 * prozessweiten Sperre, sodass immer nur ein Scan gleichzeitig läuft
 * (Intervall-Scan + manuelle Scans kollidieren nicht).
 */

let running = false;

function isScanRunning() {
  return running;
}

function scanTimeoutMs() {
  const n = parseInt(process.env.SCAN_TIMEOUT_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 120000;
}

function scanDirectoryAsync(rootDir, { dataDir } = {}) {
  if (running) {
    const err = new Error('Es läuft bereits ein Scan. Bitte kurz warten.');
    err.code = 'SCAN_BUSY';
    return Promise.reject(err);
  }
  running = true;

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { rootDir, dataDir }
    });

    const timer = setTimeout(() => {
      worker.terminate();
      const err = new Error(`Scan-Timeout nach ${scanTimeoutMs()} ms abgebrochen.`);
      err.code = 'SCAN_TIMEOUT';
      finish(() => reject(err));
    }, scanTimeoutMs());

    function finish(fn) {
      clearTimeout(timer);
      running = false;
      fn();
    }

    worker.on('message', (msg) => {
      if (msg && msg.ok) finish(() => resolve(msg.result));
      else finish(() => reject(new Error((msg && msg.error) || 'Scan im Worker fehlgeschlagen.')));
    });
    worker.on('error', (err) => finish(() => reject(err)));
    worker.on('exit', (code) => {
      if (code !== 0 && running) finish(() => reject(new Error(`Worker mit Code ${code} beendet.`)));
    });
  });
}

module.exports = { scanDirectoryAsync, isScanRunning };
