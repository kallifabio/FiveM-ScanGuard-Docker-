#!/usr/bin/env node
/*
 * Baut aus dem npm-Paket @fortawesome/fontawesome-free ein schlankes
 * SVG-Sprite mit ausschließlich den Icons, die das Dashboard wirklich nutzt.
 * Ergebnis: public/assets/icons.svg  (per <use href="assets/icons.svg#name">)
 *
 * So braucht die UI kein CDN und keinen 1-MB-Webfont – nur ~2 KB Sprite.
 */
const fs = require('fs');
const path = require('path');

// Verwendete Icons: Sprite-Name -> FontAwesome-Solid-Dateiname
const ICONS = {
  'shield-halved': 'shield-halved',
  'magnifying-glass-chart': 'magnifying-glass-chart',
  'file-zipper': 'file-zipper',
  'circle-check': 'circle-check',
  'circle-xmark': 'circle-xmark',
  'circle-exclamation': 'circle-exclamation',
  'circle-info': 'circle-info',
  'triangle-exclamation': 'triangle-exclamation',
  'skull-crossbones': 'skull-crossbones',
  'clock-rotate-left': 'clock-rotate-left',
  'gauge-high': 'gauge-high',
  terminal: 'terminal',
  'location-dot': 'location-dot',
  spinner: 'spinner',
  'folder-tree': 'folder-tree',
  xmark: 'xmark',
  trash: 'trash',
  download: 'download',
  'chevron-right': 'chevron-right',
  filter: 'filter',
  lock: 'lock'
};

const solidDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@fortawesome',
  'fontawesome-free',
  'svgs',
  'solid'
);

if (!fs.existsSync(solidDir)) {
  console.error(
    '[build-icons] @fortawesome/fontawesome-free nicht gefunden. Erst `npm install` ausführen.'
  );
  process.exit(1);
}

const symbols = [];
for (const [name, file] of Object.entries(ICONS)) {
  const svgPath = path.join(solidDir, `${file}.svg`);
  const raw = fs.readFileSync(svgPath, 'utf8');
  const viewBox = (raw.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 512 512';
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  symbols.push(`  <symbol id="${name}" viewBox="${viewBox}">${inner.trim()}</symbol>`);
}

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join(
  '\n'
)}\n</svg>\n`;

const outDir = path.join(__dirname, '..', 'public', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icons.svg'), sprite, 'utf8');

console.log(`[build-icons] ${symbols.length} Icons -> public/assets/icons.svg`);
