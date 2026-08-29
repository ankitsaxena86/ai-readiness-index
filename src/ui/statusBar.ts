/** Status bar item showing the last scan's overall score. */

import * as vscode from 'vscode';
import type { ScanResult } from '../engine/types';

export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.command = 'ari.showResults';
    this.item.tooltip = 'AI-Readiness Index — click to view the last scan';
  }

  setScanning(): void {
    this.item.text = '$(sync~spin) ARI scanning…';
    this.item.show();
  }

  setResult(result: ScanResult): void {
    this.item.text = `$(pulse) ARI ${result.overall} (${result.grade})`;
    this.item.show();
  }

  setIdle(): void {
    this.item.text = '$(pulse) ARI';
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
