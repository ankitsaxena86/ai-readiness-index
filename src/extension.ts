/**
 * Extension entry point. Wires the two commands, the status bar item, the
 * `@ari` chat participant, and the optional scan-on-startup behaviour. All
 * scoring logic lives in `./engine`, which never imports `vscode`.
 */

import * as vscode from 'vscode';
import { readConfig, SCAN_AFFECTING_KEYS, toScanOptions } from './config';
import { scanRepository } from './engine/scanner';
import type { ScanResult } from './engine/types';
import { registerChatParticipant } from './ui/chatParticipant';
import { ResultsPanel } from './ui/resultsPanel';
import { StatusBar } from './ui/statusBar';

const LAST_RESULT_KEY = 'ari.lastResult';

let statusBar: StatusBar;
let lastResult: ScanResult | undefined;
let extensionContext: vscode.ExtensionContext;

/** Public API returned from {@link activate}, for tests and other extensions. */
export interface AriApi {
  /** Run a scan of the current workspace now. */
  scan(): Promise<ScanResult | undefined>;
  /** The most recent scan result, if any. */
  last(): ScanResult | undefined;
}

export function activate(context: vscode.ExtensionContext): AriApi {
  extensionContext = context;
  statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  lastResult = context.workspaceState.get<ScanResult>(LAST_RESULT_KEY);
  const config = readConfig();
  reflectStatusBar(config.showStatusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('ari.scanRepository', async () => {
      const result = await performScan({ reveal: true });
      if (!result) {
        void vscode.window.showWarningMessage('AI-Readiness Index: open a folder to scan.');
      }
    }),
    vscode.commands.registerCommand('ari.showResults', () => {
      if (lastResult) {
        ResultsPanel.show(lastResult);
      } else {
        void vscode.window.showInformationMessage(
          'No AI-Readiness scan yet. Run "AI-Readiness Index: Scan Repository".',
        );
      }
    }),
  );

  registerChatParticipant(context, {
    runScan: () => performScan({ reveal: false }),
    getLast: () => lastResult,
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => onConfigChange(e)),
  );

  if (config.scanOnStartup && getRepoPath()) {
    void performScan({ reveal: false });
  }

  return {
    scan: () => performScan({ reveal: false }),
    last: () => lastResult,
  };
}

let rescanTimer: ReturnType<typeof setTimeout> | undefined;

function onConfigChange(e: vscode.ConfigurationChangeEvent): void {
  if (e.affectsConfiguration('ari.showStatusBarItem')) {
    reflectStatusBar(readConfig().showStatusBarItem);
  }
  const scanAffected = SCAN_AFFECTING_KEYS.some((k) => e.affectsConfiguration(k));
  if (!scanAffected || !lastResult) {
    return; // nothing scanned yet, or only a UI toggle changed
  }
  const config = readConfig();
  if (!config.rescanOnConfigChange || !getRepoPath()) {
    return;
  }
  // Debounce: settings often change in bursts (e.g. editing a weight).
  if (rescanTimer) {
    clearTimeout(rescanTimer);
  }
  rescanTimer = setTimeout(() => {
    void performScan({ reveal: false });
  }, 600);
}

export function deactivate(): void {
  if (rescanTimer) {
    clearTimeout(rescanTimer);
  }
  statusBar?.dispose();
}

interface RunOptions {
  reveal: boolean;
}

/**
 * Run a scan of the first workspace folder, persist it, refresh the status bar,
 * and (optionally) reveal the results panel. Returns `undefined` when there is
 * no folder to scan.
 */
async function performScan(opts: RunOptions): Promise<ScanResult | undefined> {
  const repoPath = getRepoPath();
  if (!repoPath) {
    return undefined;
  }

  const config = readConfig();
  if (config.showStatusBarItem) {
    statusBar.setScanning();
  }

  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'AI-Readiness Index: scanning…' },
      () => scanRepository(toScanOptions(repoPath, config)),
    );

    lastResult = result;
    await extensionContext.workspaceState.update(LAST_RESULT_KEY, result);
    reflectStatusBar(config.showStatusBarItem);

    if (opts.reveal) {
      ResultsPanel.show(result);
    } else {
      ResultsPanel.refreshIfOpen(result);
    }
    return result;
  } catch (err) {
    reflectStatusBar(config.showStatusBarItem);
    void vscode.window.showErrorMessage(
      `AI-Readiness Index scan failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

function reflectStatusBar(show: boolean): void {
  if (!show) {
    statusBar.hide();
    return;
  }
  if (lastResult) {
    statusBar.setResult(lastResult);
  } else {
    statusBar.setIdle();
  }
}

function getRepoPath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
