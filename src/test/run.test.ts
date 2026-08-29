/**
 * Driver: exercises the REAL extension inside a real VS Code instance the way a
 * user would — activate, run the scan command, open the panel, then drive the
 * scan engine against arbitrary repos on disk. Run with `npm run drive`.
 *
 * It writes the rendered panel HTML and the Markdown report to a `drive-output/`
 * folder at the repo root so the results can be eyeballed.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AriApi } from '../extension';
import { renderResultsHtml } from '../ui/resultsHtml';
import { toMarkdown, toSummaryLine } from '../engine/report';
import { scanRepository } from '../engine/scanner';

const EXT_ID = 'ankitsaxena.ai-readiness-index';
const OUT = path.resolve(__dirname, '../../drive-output');

function log(s: string): void {
  console.log(s);
}

suite('DRIVE — the extension, running', () => {
  suiteSetup(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test('activate the extension and run the scan command on the open workspace', async () => {
    const ext = vscode.extensions.getExtension<AriApi>(EXT_ID);
    assert.ok(ext, 'extension not installed in the host');
    const api = await ext!.activate();

    log('\n▶ Running command: AI-Readiness Index: Scan Repository');
    await vscode.commands.executeCommand('ari.scanRepository');

    const result = api.last();
    assert.ok(result, 'no scan result after running the command');

    log(`\n  ${toSummaryLine(result!)}`);
    for (const d of result!.dimensions) {
      const w = Math.round((result!.weights[d.dimension] ?? 0) * 100);
      log(`  ${d.dimension.padEnd(15)} ${String(d.score).padStart(3)}/100  (weight ${w}%)  ${d.summary}`);
    }
    log(`\n  Remediation items: ${result!.remediation.length}`);
    for (const r of result!.remediation.slice(0, 6)) {
      log(`   - [${r.priority}] ${r.dimension}: ${r.title}`);
    }

    const panelOpen = async (): Promise<boolean> => {
      for (let i = 0; i < 30; i++) {
        const open = vscode.window.tabGroups.all
          .flatMap((g) => g.tabs)
          .some((t) => t.label === 'AI-Readiness Index');
        if (open) {
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };
    const opened = await panelOpen();
    log(`\n  Results panel tab open in the editor: ${opened}`);
    assert.ok(opened, 'the results panel did not open');

    fs.writeFileSync(path.join(OUT, 'workspace-panel.html'), renderResultsHtml(result!));
    fs.writeFileSync(path.join(OUT, 'workspace-report.md'), toMarkdown(result!));
    log(`\n  Wrote drive-output/workspace-panel.html and workspace-report.md`);
  });

  test('drive the scan engine against other real repositories on disk', async () => {
    // Point at whatever repos are handy: the ARI project itself, and both fixtures.
    const fixtures = path.resolve(__dirname, '../../test/fixtures');
    const targets: Array<[string, string]> = [
      ['ARI itself (dogfood)', path.resolve(__dirname, '../..')],
      ['fixture: ready-repo', path.join(fixtures, 'ready-repo')],
      ['fixture: not-ready-repo', path.join(fixtures, 'not-ready-repo')],
    ];

    log('\n▶ Scanning repositories directly through the engine:\n');
    for (const [label, repoPath] of targets) {
      const r = await scanRepository({ repoPath });
      log(`  ${label.padEnd(24)} ${String(r.overall).padStart(3)}/100  (${r.grade})  — ${r.dimensions
        .map((d) => `${d.dimension[0].toUpperCase()}${d.score}`)
        .join(' ')}`);
      const slug = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      fs.writeFileSync(path.join(OUT, `${slug}.md`), toMarkdown(r));
    }
    log(`\n  Full per-repo reports written to drive-output/`);
  });
});
