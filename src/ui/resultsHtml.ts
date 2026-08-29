/**
 * Pure HTML rendering for the results panel. No `vscode` import, so it can be
 * unit-tested and previewed in a browser. {@link ResultsPanel} owns the webview
 * lifecycle and message handling; this file only turns a {@link ScanResult}
 * into a self-contained HTML document.
 *
 * All colour comes from VS Code theme CSS variables (with fallbacks) so the
 * page reads as native chrome. The one inline script is nonce-guarded and does
 * no network I/O; it only persists checklist ticks via the webview state API.
 */

import { DIMENSION_LABELS } from '../engine/types';
import type { DimensionResult, RemediationItem, ScanResult, Signal } from '../engine/types';

export function renderResultsHtml(result: ScanResult, nonce = generateNonce()): string {
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const weakest = [...result.dimensions].sort((a, b) => a.score - b.score)[0];
  const counts = tally(result);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 1.25rem 1.5rem 4rem;
    line-height: 1.5;
    max-width: 60rem;
  }
  h1 { font-size: 1.05rem; font-weight: 600; margin: 0 0 .15rem; }
  h2 { font-size: .8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
       color: var(--vscode-descriptionForeground, #999); margin: 2rem 0 .6rem; }
  .muted { color: var(--vscode-descriptionForeground, #999); font-size: .85rem; }

  .hero {
    display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;
    border: 1px solid var(--vscode-panel-border, #444); border-radius: 8px;
    padding: 1.1rem 1.35rem; margin-top: .75rem;
    background: var(--vscode-editorWidget-background, #252526);
  }
  .score { font-size: 3rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
  .score small { font-size: 1rem; font-weight: 400; color: var(--vscode-descriptionForeground, #999); }
  .grade { font-size: 1rem; font-weight: 700; padding: .2rem .55rem; border-radius: 5px;
           border: 1px solid var(--vscode-panel-border, #444); }
  .grade[data-g="A"], .grade[data-g="B"] { color: var(--vscode-charts-green, #89d185); }
  .grade[data-g="C"] { color: var(--vscode-editorWarning-foreground, #cca700); }
  .grade[data-g="D"], .grade[data-g="F"] { color: var(--vscode-errorForeground, #f48771); }
  .hero .grow { flex: 1; min-width: 12rem; }

  .bar { height: 7px; border-radius: 4px; overflow: hidden;
         background: var(--vscode-editor-inactiveSelectionBackground, #333); margin-top: .45rem; }
  .bar > span { display: block; height: 100%; background: var(--vscode-progressBar-background, #0e70c0); }

  .chips { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .5rem; }
  .chip { font-size: .74rem; padding: .12rem .5rem; border-radius: 999px;
          border: 1px solid var(--vscode-panel-border, #444); color: var(--vscode-descriptionForeground, #999); }

  details.dim {
    border: 1px solid var(--vscode-panel-border, #444); border-radius: 6px;
    margin-bottom: .5rem; background: var(--vscode-editorWidget-background, #252526);
  }
  details.dim > summary {
    list-style: none; cursor: pointer; padding: .6rem .8rem;
    display: grid; grid-template-columns: 1fr 8rem auto; gap: .75rem; align-items: center;
  }
  details.dim > summary::-webkit-details-marker { display: none; }
  details.dim > summary:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .dim-name { font-weight: 600; }
  .dim-name .w { font-weight: 400; color: var(--vscode-descriptionForeground, #999); font-size: .8rem; margin-left: .4rem; }
  .dim-score { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 2.5rem; text-align: right; }
  .dim-body { padding: .2rem .9rem .8rem; }
  .dim-summary { font-size: .88rem; margin: .1rem 0 .6rem; color: var(--vscode-descriptionForeground, #999); }
  ul.signals { list-style: none; padding: 0; margin: 0; }
  ul.signals li { padding: .28rem 0; display: flex; gap: .55rem; align-items: baseline; font-size: .86rem;
                  border-top: 1px solid var(--vscode-panel-border, #444); }
  ul.signals li:first-child { border-top: none; }
  .sig-mark { flex: none; width: 1.1rem; text-align: center; }
  .sig-detail { color: var(--vscode-descriptionForeground, #999); }
  .sig-pts { margin-left: auto; flex: none; color: var(--vscode-descriptionForeground, #999);
             font-variant-numeric: tabular-nums; font-size: .8rem; }

  ul.checklist { list-style: none; padding: 0; margin: 0; }
  ul.checklist li {
    border: 1px solid var(--vscode-panel-border, #444); border-radius: 6px;
    padding: .55rem .7rem .6rem; margin-bottom: .45rem;
    background: var(--vscode-editorWidget-background, #252526);
    display: grid; grid-template-columns: auto 1fr; gap: .55rem;
  }
  ul.checklist input { margin-top: .2rem; accent-color: var(--vscode-progressBar-background, #0e70c0); }
  ul.checklist li.done .item-title { text-decoration: line-through; opacity: .6; }
  .item-title { font-weight: 600; font-size: .9rem; }
  .item-detail { font-size: .84rem; color: var(--vscode-descriptionForeground, #999); margin-top: .15rem; }
  .pill { display: inline-block; font-size: .66rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; padding: .06rem .35rem; border-radius: 3px; margin-right: .4rem;
          border: 1px solid var(--vscode-panel-border, #444); vertical-align: middle; }
  .pill.high { color: var(--vscode-errorForeground, #f48771); }
  .pill.medium { color: var(--vscode-editorWarning-foreground, #cca700); }
  .pill.low { color: var(--vscode-descriptionForeground, #999); }

  .actions { position: sticky; bottom: 0; display: flex; gap: .5rem; flex-wrap: wrap;
             padding: .9rem 0 .2rem; margin-top: 1.5rem;
             background: linear-gradient(transparent, var(--vscode-editor-background, #1e1e1e) 35%); }
  button { font-family: inherit; font-size: .85rem; cursor: pointer; border: none; border-radius: 4px;
           padding: .42rem .85rem; color: var(--vscode-button-foreground, #fff);
           background: var(--vscode-button-background, #0e70c0); }
  button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button.secondary { color: var(--vscode-button-secondaryForeground, #ccc);
                     background: var(--vscode-button-secondaryBackground, #3a3d41); }
  .warn { color: var(--vscode-editorWarning-foreground, #cca700); font-size: .85rem; margin-top: .6rem;
          border-left: 2px solid var(--vscode-editorWarning-foreground, #cca700); padding-left: .6rem; }
</style>
</head>
<body>
  <h1>AI-Readiness Index</h1>
  <div class="muted">${escapeHtml(shortPath(result.repoPath))} &middot; scanned ${escapeHtml(
    new Date(result.scannedAt).toLocaleString(),
  )}</div>

  <div class="hero">
    <div class="score">${result.overall}<small>/100</small></div>
    <div class="grade" data-g="${result.grade}">Grade ${result.grade}</div>
    <div class="grow">
      <div class="muted">Weighted across the six dimensions</div>
      <div class="bar"><span style="width:${result.overall}%"></span></div>
      <div class="chips">
        <span class="chip">${counts.met} met</span>
        <span class="chip">${counts.partial} partial</span>
        <span class="chip">${counts.missing} missing</span>
        ${
          weakest
            ? `<span class="chip">weakest: ${escapeHtml(DIMENSION_LABELS[weakest.dimension])} (${weakest.score})</span>`
            : ''
        }
      </div>
    </div>
  </div>

  ${result.warnings.length ? `<div class="warn">${result.warnings.map(escapeHtml).join('<br/>')}</div>` : ''}

  <h2>Dimension breakdown</h2>
  ${result.dimensions.map((d) => renderDimension(d, result)).join('')}

  <h2>Remediation matrix ${result.remediation.length ? `(${result.remediation.length})` : ''}</h2>
  ${
    result.remediation.length
      ? `<ul class="checklist">${result.remediation.map((r, i) => renderItem(r, i)).join('')}</ul>`
      : `<div class="muted">No dimension scored below the remediation threshold &mdash; nothing to fix. 🎉</div>`
  }

  <div class="actions">
    <button id="rescan">Re-scan</button>
    <button id="copy" class="secondary">Copy as Markdown</button>
    <button id="settings" class="secondary">Open settings</button>
  </div>

<script nonce="${nonce}">
  const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const KEY = ${JSON.stringify(stateKey(result))};
  const saved = (api && api.getState()) || {};
  const checks = saved[KEY] || {};

  for (const el of document.querySelectorAll('input[type=checkbox][data-item]')) {
    if (checks[el.dataset.item]) {
      el.checked = true;
      el.closest('li').classList.add('done');
    }
    el.addEventListener('change', () => {
      checks[el.dataset.item] = el.checked;
      el.closest('li').classList.toggle('done', el.checked);
      if (api) {
        const next = api.getState() || {};
        next[KEY] = checks;
        api.setState(next);
      }
    });
  }

  function send(command) { if (api) api.postMessage({ command: command }); }
  document.getElementById('rescan').addEventListener('click', () => send('rescan'));
  document.getElementById('copy').addEventListener('click', () => send('copyMarkdown'));
  document.getElementById('settings').addEventListener('click', () => send('openSettings'));
</script>
</body>
</html>`;
}

function renderDimension(d: DimensionResult, result: ScanResult): string {
  const weightPct = Math.round((result.weights[d.dimension] ?? 0) * 100);
  const open = d.score < 70 ? ' open' : '';
  return `<details class="dim"${open}>
    <summary>
      <span class="dim-name">${escapeHtml(DIMENSION_LABELS[d.dimension])}<span class="w">${weightPct}% weight</span></span>
      <span class="bar"><span style="width:${d.score}%"></span></span>
      <span class="dim-score">${d.score}</span>
    </summary>
    <div class="dim-body">
      <div class="dim-summary">${escapeHtml(d.summary)}</div>
      <ul class="signals">${d.signals.map(renderSignal).join('')}</ul>
    </div>
  </details>`;
}

function renderSignal(s: Signal): string {
  const mark = s.status === 'met' ? '✅' : s.status === 'partial' ? '🟡' : '❌';
  return `<li>
    <span class="sig-mark">${mark}</span>
    <span>${escapeHtml(s.label)}${s.detail ? ` <span class="sig-detail">&mdash; ${escapeHtml(s.detail)}</span>` : ''}</span>
    <span class="sig-pts">${round1(s.earned)}/${s.weight}</span>
  </li>`;
}

function renderItem(r: RemediationItem, index: number): string {
  const id = `${r.dimension}:${index}:${r.title}`;
  return `<li>
    <input type="checkbox" data-item="${escapeHtml(id)}" aria-label="Mark done" />
    <div>
      <div><span class="pill ${r.priority}">${r.priority}</span><span class="pill low">${escapeHtml(
        DIMENSION_LABELS[r.dimension],
      )}</span></div>
      <div class="item-title">${escapeHtml(r.title)}</div>
      <div class="item-detail">${escapeHtml(r.detail)}</div>
    </div>
  </li>`;
}

function tally(result: ScanResult): { met: number; partial: number; missing: number } {
  const out = { met: 0, partial: 0, missing: 0 };
  for (const d of result.dimensions) {
    for (const s of d.signals) {
      out[s.status]++;
    }
  }
  return out;
}

function stateKey(result: ScanResult): string {
  return `${result.repoPath}::${result.remediation.length}`;
}

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || p;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export function generateNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
