/**
 * The results webview: a singleton panel rendering the most recent
 * {@link ScanResult}. HTML generation lives in {@link renderResultsHtml}
 * (pure, testable); this class owns the webview lifecycle and the message
 * channel back to the extension (re-scan, copy report, open settings).
 */

import * as vscode from 'vscode';
import { toMarkdown } from '../engine/report';
import type { ScanResult } from '../engine/types';
import { renderResultsHtml } from './resultsHtml';

export class ResultsPanel {
  public static readonly viewType = 'ari.results';
  private static current: ResultsPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private lastResult: ScanResult | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this.disposables);
  }

  static show(result: ScanResult): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ResultsPanel.current) {
      ResultsPanel.current.panel.reveal(column, true);
      ResultsPanel.current.update(result);
      return;
    }
    const panel = vscode.window.createWebviewPanel(ResultsPanel.viewType, 'AI-Readiness Index', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    ResultsPanel.current = new ResultsPanel(panel);
    ResultsPanel.current.update(result);
  }

  /** Update the panel in place if it is currently open; otherwise do nothing. */
  static refreshIfOpen(result: ScanResult): void {
    ResultsPanel.current?.update(result);
  }

  update(result: ScanResult): void {
    this.lastResult = result;
    this.panel.webview.html = renderResultsHtml(result);
  }

  private handleMessage(msg: { command?: string }): void {
    switch (msg?.command) {
      case 'openSettings':
        void vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:ankitsaxena.ai-readiness-index',
        );
        return;
      case 'rescan':
        void vscode.commands.executeCommand('ari.scanRepository');
        return;
      case 'copyMarkdown':
        if (this.lastResult) {
          void vscode.env.clipboard
            .writeText(toMarkdown(this.lastResult))
            .then(() =>
              vscode.window.showInformationMessage('AI-Readiness report copied as Markdown.'),
            );
        }
        return;
    }
  }

  dispose(): void {
    ResultsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
