'use strict';

const SEVERITY = {
  critical: { label: 'CRITICAL', icon: 'skull-crossbones', text: 'text-critical', bg: 'bg-critical/15' },
  high: { label: 'HIGH', icon: 'triangle-exclamation', text: 'text-high', bg: 'bg-high/15' },
  medium: { label: 'MEDIUM', icon: 'circle-exclamation', text: 'text-medium', bg: 'bg-medium/15' },
  low: { label: 'LOW', icon: 'circle-info', text: 'text-low', bg: 'bg-low/15' }
};
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const TOKEN_KEY = 'scanguard_token';

const el = (id) => document.getElementById(id);
const scanPathBtn = el('scan-path-btn');
const uploadInput = el('upload-input');
const statusLine = el('status-line');
const historyList = el('history-list');
const historyClear = el('history-clear');
const consoleEl = el('console');
const riskNumber = el('risk-number');
const toolbarEl = el('toolbar');
const filterText = el('filter-text');
const loginOverlay = el('login-overlay');
const loginForm = el('login-form');
const loginToken = el('login-token');
const loginError = el('login-error');

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  scan: null,
  activeId: null,
  sev: new Set(SEV_ORDER),
  text: ''
};

/* ---------- Helfer ---------- */

function icon(name, cls = '') {
  return `<svg class="icon ${cls}"><use href="assets/icons.svg#${name}" /></svg>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setStatus(text, ic = 'circle-info', tone = 'text-muted') {
  statusLine.innerHTML = `${icon(ic, tone)} ${escapeHtml(text)}`;
}

function setBusy(isBusy) {
  scanPathBtn.disabled = isBusy;
  uploadInput.disabled = isBusy;
  consoleEl.classList.toggle('scanning', isBusy);
}

function resourceOf(file) {
  return String(file).split(/[\\/]/)[0] || '(Wurzel)';
}

/* ---------- Auth ---------- */

async function authFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    showLogin();
    throw new Error('Nicht autorisiert – Token erforderlich.');
  }
  return res;
}

function showLogin() {
  loginOverlay.hidden = false;
  loginToken.focus();
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = loginToken.value.trim();
  if (!value) return;
  state.token = value;
  localStorage.setItem(TOKEN_KEY, value);
  loginError.classList.add('hidden');
  loginOverlay.hidden = true;
  loginToken.value = '';
  loadHistory(state.activeId);
});

/* ---------- Rendering ---------- */

function riskLevel(score) {
  if (score >= 30) return 'critical';
  if (score >= 10) return 'high';
  if (score === 0) return 'clean';
  return '';
}

function renderMeters(counts) {
  const max = Math.max(counts.critical, counts.high, counts.medium, counts.low, 1);
  document.querySelectorAll('.meter-row').forEach((row) => {
    const severity = row.dataset.severity;
    const count = counts[severity] || 0;
    row.querySelector('.meter-fill').style.width = `${(count / max) * 100}%`;
    row.querySelector('.meter-count').textContent = count;
    const track = row.querySelector('.meter-track');
    track.setAttribute('aria-valuenow', String(count));
    track.setAttribute('aria-valuemax', String(max));
  });
}

function renderRisk(summary) {
  riskNumber.textContent = summary.riskScore;
  riskNumber.dataset.level = riskLevel(summary.riskScore);
  riskNumber.className = 'font-ui text-[44px] font-bold leading-none text-accent';
  renderMeters(summary.counts);
}

function findingRow(f) {
  const sev = SEVERITY[f.severity] || {
    label: String(f.severity).toUpperCase(),
    icon: 'circle-info',
    text: 'text-muted',
    bg: 'bg-panel-alt'
  };
  return `
    <div class="log-line text-[13px] leading-[1.55]" data-severity="${escapeHtml(f.severity)}">
      <div class="flex flex-wrap items-baseline gap-2.5">
        <span class="inline-flex items-center gap-1.5 rounded px-1.5 py-px text-[11.5px] font-semibold ${sev.bg} ${sev.text}">
          ${icon(sev.icon)}${sev.label}
        </span>
        <span class="text-ink">${escapeHtml(f.title)}</span>
        <span class="text-xs text-muted">${icon('location-dot', 'mr-1')}${escapeHtml(f.file)}:${f.line}</span>
      </div>
      <p class="mt-1.5 text-[12.5px] text-muted">${escapeHtml(f.description)}</p>
      ${f.snippet ? `<div class="log-snippet">${escapeHtml(f.snippet)}</div>` : ''}
    </div>`;
}

function passesFilter(f) {
  if (!state.sev.has(f.severity)) return false;
  if (!state.text) return true;
  const hay = `${f.file} ${f.ruleId || ''} ${f.title} ${f.description}`.toLowerCase();
  return hay.includes(state.text);
}

function renderFindings() {
  const scan = state.scan;
  if (!scan) return;

  if (!scan.findings.length) {
    toolbarEl.hidden = true;
    consoleEl.innerHTML = `<p class="flex items-center gap-2 text-[13.5px] text-success">
      ${icon('circle-check')} Keine verdächtigen Muster gefunden – ${escapeHtml(scan.targetLabel)} sieht sauber aus.</p>`;
    return;
  }

  toolbarEl.hidden = false;
  const visible = scan.findings.filter(passesFilter);
  if (!visible.length) {
    consoleEl.innerHTML = `<p class="text-[13px] text-muted">${icon(
      'filter'
    )} Keine Funde für die aktuelle Filterauswahl.</p>`;
    return;
  }

  const groups = new Map();
  for (const f of visible) {
    const res = resourceOf(f.file);
    if (!groups.has(res)) groups.set(res, []);
    groups.get(res).push(f);
  }

  consoleEl.innerHTML = [...groups.entries()]
    .map(([res, items]) => {
      const counts = SEV_ORDER.map((s) => {
        const n = items.filter((i) => i.severity === s).length;
        return n ? `<span class="${SEVERITY[s].text}">${n} ${SEVERITY[s].label.toLowerCase()}</span>` : '';
      })
        .filter(Boolean)
        .join('<span class="text-edge">·</span>');
      const rows = items
        .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
        .map(findingRow)
        .join('');
      return `
        <details class="res-group mb-3 rounded-lg border border-edge bg-panel/40" open>
          <summary class="flex items-center gap-2 px-3 py-2.5 font-ui text-[13px] text-ink">
            ${icon('chevron-right', 'res-chevron text-muted')}
            ${icon('folder-tree', 'text-accent-dim')}
            <span class="font-semibold">${escapeHtml(res)}</span>
            <span class="ml-auto flex items-center gap-2 text-[11px]">${counts}</span>
          </summary>
          <div class="px-3 pb-1">${rows}</div>
        </details>`;
    })
    .join('');
}

function renderHistory(scans) {
  historyClear.hidden = scans.length === 0;
  if (!scans.length) {
    historyList.innerHTML = '<li class="text-[12.5px] text-muted">Noch keine Scans.</li>';
    return;
  }
  historyList.innerHTML = scans
    .map((s) => {
      const time = new Date(s.createdAt).toLocaleString('de-DE');
      const active = s.id === state.activeId ? ' border-accent-dim bg-panel-alt' : ' border-edge';
      return `
        <li class="history-item group flex items-start gap-1.5 rounded-lg border${active} bg-panel-alt px-2.5 py-2.5 text-[12.5px] transition hover:border-accent-dim" data-id="${s.id}">
          <button class="h-open min-w-0 flex-1 text-left">
            <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-ink">
              ${icon('folder-tree', 'mr-1.5 text-accent-dim')}${escapeHtml(s.targetLabel)}
            </span>
            <span class="text-[11px] text-muted">${time} · Score ${s.summary.riskScore}</span>
          </button>
          <button class="h-del rounded p-1 text-muted opacity-0 transition hover:text-critical group-hover:opacity-100" title="Scan löschen" aria-label="Scan löschen">
            ${icon('xmark')}
          </button>
        </li>`;
    })
    .join('');

  historyList.querySelectorAll('.history-item').forEach((item) => {
    const id = item.dataset.id;
    item.querySelector('.h-open').addEventListener('click', () => loadScan(id));
    item.querySelector('.h-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteScan(id);
    });
  });
}

/* ---------- API ---------- */

async function loadHistory(activeId) {
  state.activeId = activeId ?? state.activeId;
  try {
    const res = await authFetch('/api/scans');
    renderHistory(await res.json());
  } catch (err) {
    /* Verlauf ist nicht kritisch – still fehlschlagen lassen. */
  }
}

async function loadScan(id) {
  setStatus('Lade Scan …', 'spinner', 'text-accent animate-spin');
  try {
    const res = await authFetch(`/api/scans/${id}`);
    if (!res.ok) throw new Error('Scan nicht gefunden.');
    state.scan = await res.json();
    state.activeId = id;
    renderRisk(state.scan.summary);
    renderFindings();
    setStatus(`Scan vom ${new Date(state.scan.createdAt).toLocaleString('de-DE')}`, 'clock-rotate-left');
    loadHistory(id);
  } catch (err) {
    setStatus(err.message, 'circle-exclamation', 'text-high');
  }
}

async function deleteScan(id) {
  if (!window.confirm('Diesen Scan aus dem Verlauf löschen?')) return;
  try {
    await authFetch(`/api/scans/${id}`, { method: 'DELETE' });
    if (state.activeId === id) {
      state.scan = null;
      state.activeId = null;
      consoleEl.innerHTML =
        '<p class="text-[13.5px] text-muted">Scan gelöscht. Starte einen neuen Scan.</p>';
      toolbarEl.hidden = true;
    }
    loadHistory();
  } catch (err) {
    setStatus(err.message, 'circle-xmark', 'text-critical');
  }
}

async function clearHistory() {
  if (!window.confirm('Wirklich den kompletten Scan-Verlauf löschen?')) return;
  try {
    await authFetch('/api/scans', { method: 'DELETE' });
    state.scan = null;
    state.activeId = null;
    toolbarEl.hidden = true;
    consoleEl.innerHTML = '<p class="text-[13.5px] text-muted">Verlauf geleert.</p>';
    loadHistory();
  } catch (err) {
    setStatus(err.message, 'circle-xmark', 'text-critical');
  }
}

async function runScan(promise) {
  setBusy(true);
  setStatus('Scan läuft …', 'spinner', 'text-accent animate-spin');
  try {
    const res = await promise;
    const data = await res.json();
    if (res.status === 429) throw new Error(data.error || 'Ein Scan läuft bereits. Kurz warten.');
    if (!res.ok) throw new Error(data.error || 'Scan fehlgeschlagen.');
    state.scan = data;
    state.activeId = data.id;
    renderRisk(data.summary);
    renderFindings();
    setStatus(
      `Fertig – ${data.summary.findingCount} Fund(e) in ${data.summary.resourceCount} Ressource(n).`,
      'circle-check',
      'text-success'
    );
    loadHistory(data.id);
  } catch (err) {
    setStatus(`Fehler: ${err.message}`, 'circle-xmark', 'text-critical');
  } finally {
    setBusy(false);
  }
}

/* ---------- Report-Export ---------- */

function triggerDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportMarkdown(scan) {
  const s = scan.summary;
  const lines = [
    '# FiveM ScanGuard – Report',
    '',
    `- **Ziel:** \`${scan.targetLabel}\``,
    `- **Erstellt:** ${new Date(scan.createdAt).toLocaleString('de-DE')}`,
    `- **Risiko-Score:** ${s.riskScore}`,
    `- **Funde:** ${s.findingCount} (Kritisch ${s.counts.critical} · Hoch ${s.counts.high} · Mittel ${s.counts.medium} · Niedrig ${s.counts.low})`,
    `- **Ressourcen:** ${s.resourceCount} · **Dateien:** ${s.fileCount}`,
    ''
  ];
  if (!scan.findings.length) {
    lines.push('Keine verdächtigen Muster gefunden.');
    return lines.join('\n');
  }
  const groups = new Map();
  for (const f of scan.findings) {
    const res = resourceOf(f.file);
    if (!groups.has(res)) groups.set(res, []);
    groups.get(res).push(f);
  }
  lines.push('## Funde', '');
  for (const [res, items] of groups) {
    lines.push(`### ${res}`, '');
    for (const f of items) {
      lines.push(`- **[${(SEVERITY[f.severity] || {}).label || f.severity}]** ${f.title} — \`${f.file}:${f.line}\``);
      lines.push(`  ${f.description}`);
      if (f.snippet) lines.push('  ```', `  ${f.snippet}`, '  ```');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function shortId(scan) {
  return String(scan.id).slice(0, 8);
}

el('dl-json').addEventListener('click', () => {
  if (state.scan) {
    triggerDownload(`scanguard-${shortId(state.scan)}.json`, JSON.stringify(state.scan, null, 2), 'application/json');
  }
});
el('dl-md').addEventListener('click', () => {
  if (state.scan) triggerDownload(`scanguard-${shortId(state.scan)}.md`, reportMarkdown(state.scan), 'text/markdown');
});

/* ---------- Filter ---------- */

el('severity-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('.sev-chip');
  if (!btn) return;
  const sev = btn.dataset.filter;
  const pressed = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!pressed));
  btn.classList.toggle('opacity-40', pressed);
  btn.classList.toggle('bg-panel-alt', !pressed);
  if (pressed) state.sev.delete(sev);
  else state.sev.add(sev);
  renderFindings();
});

let filterDebounce;
filterText.addEventListener('input', () => {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => {
    state.text = filterText.value.trim().toLowerCase();
    renderFindings();
  }, 150);
});

/* ---------- Events ---------- */

scanPathBtn.addEventListener('click', () => {
  runScan(authFetch('/api/scan/path', { method: 'POST' }));
});

uploadInput.addEventListener('change', () => {
  const file = uploadInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('archive', file);
  runScan(authFetch('/api/scan/upload', { method: 'POST', body: formData })).finally(() => {
    uploadInput.value = '';
  });
});

historyClear.addEventListener('click', clearHistory);

loadHistory();
