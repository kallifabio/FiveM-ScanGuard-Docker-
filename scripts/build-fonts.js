#!/usr/bin/env node
/*
 * Kopiert die benötigten Schriftschnitte (woff2, latin) aus den
 * @fontsource-Paketen nach public/assets/fonts/ und schreibt ein passendes
 * fonts.css. Damit rendert die UI ohne Google Fonts / ohne Internet.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'fonts');

const FACES = [
  { family: 'Space Grotesk', pkg: 'space-grotesk', weights: [500, 600, 700] },
  { family: 'JetBrains Mono', pkg: 'jetbrains-mono', weights: [400, 500, 600] }
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let css =
  '/* Automatisch erzeugt von scripts/build-fonts.js – nicht von Hand bearbeiten. */\n';
let copied = 0;

for (const face of FACES) {
  for (const weight of face.weights) {
    const file = `${face.pkg}-latin-${weight}-normal.woff2`;
    const src = path.join(ROOT, 'node_modules', '@fontsource', face.pkg, 'files', file);
    fs.copyFileSync(src, path.join(OUT_DIR, file));
    copied += 1;
    css +=
      `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${weight};` +
      `font-display:swap;src:url('fonts/${file}') format('woff2');}\n`;
  }
}

fs.writeFileSync(path.join(ROOT, 'public', 'assets', 'fonts.css'), css, 'utf8');
console.log(`[build-fonts] ${copied} Schriftdateien -> public/assets/fonts/`);
