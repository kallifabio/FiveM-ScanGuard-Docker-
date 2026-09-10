// Worker-Thread: führt den (synchronen, CPU-lastigen) Scan aus, damit der
// HTTP-Server / Healthcheck währenddessen nicht blockiert.
const { parentPort, workerData } = require('worker_threads');
const { scanDirectory } = require('./engine');

try {
  const result = scanDirectory(workerData.rootDir, { dataDir: workerData.dataDir });
  parentPort.postMessage({ ok: true, result });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
