/**
 * Host integration tests, run inside the Extension Development Host via
 * `@vscode/test-cli` (`npm test`) with `test/fixtures/ready-repo` opened as the
 * workspace. Pure scoring-engine and HTML tests live next to their source as
 * `*.vitest.test.ts` and run under vitest (`npm run test:unit`).
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXT_ID = 'ankitsaxena.ai-readiness-index';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function panelIsOpen(): boolean {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .some((t) => t.label === 'AI-Readiness Index');
}

suite('AI-Readiness Index — activation', () => {
  test('extension is present and activates', async () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, 'extension not found');
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  test('both commands are registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('ari.scanRepository'), 'ari.scanRepository missing');
    assert.ok(commands.includes('ari.showResults'), 'ari.showResults missing');
  });
});

suite('AI-Readiness Index — configuration', () => {
  test('contributes the six weights, threshold and toggles with expected defaults', () => {
    const c = vscode.workspace.getConfiguration('ari');
    assert.strictEqual(c.get('weights.context'), 25);
    assert.strictEqual(c.get('weights.verifiability'), 20);
    assert.strictEqual(c.get('weights.reproducibility'), 15);
    assert.strictEqual(c.get('weights.documentation'), 15);
    assert.strictEqual(c.get('weights.navigability'), 15);
    assert.strictEqual(c.get('weights.changeSafety'), 10);
    assert.strictEqual(c.get('remediationThreshold'), 70);
    assert.strictEqual(c.get('scanOnStartup'), true);
    assert.strictEqual(c.get('showStatusBarItem'), true);
    assert.ok(Array.isArray(c.get('exclude')));
  });
});

suite('AI-Readiness Index — scan command', () => {
  test('scanning the ready fixture opens the results panel', async () => {
    await vscode.extensions.getExtension(EXT_ID)!.activate();
    await vscode.commands.executeCommand('ari.scanRepository');
    // performScan awaits the scan; the panel is shown synchronously afterwards,
    // but tab bookkeeping can lag a tick.
    for (let i = 0; i < 20 && !panelIsOpen(); i++) {
      await delay(100);
    }
    assert.ok(panelIsOpen(), 'results panel tab did not open');
  });

  test('showResults reopens the panel after it is closed', async () => {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label === 'AI-Readiness Index') {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
    await delay(200);
    await vscode.commands.executeCommand('ari.showResults');
    for (let i = 0; i < 20 && !panelIsOpen(); i++) {
      await delay(100);
    }
    assert.ok(panelIsOpen(), 'results panel did not reopen via ari.showResults');
  });
});
