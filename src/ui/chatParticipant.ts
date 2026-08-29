/**
 * The `@ari` chat participant. It answers entirely from scan data — running a
 * scan when needed and streaming Markdown — so it works even with no language
 * model available. When a model *is* available (e.g. the user has Copilot), a
 * bare `@ari <question>` is answered by the model, grounded in the scan report.
 *
 * Slash commands:
 *   /scan     — run a fresh scan and show the summary
 *   /fixes    — show the remediation checklist
 *   /explain  — break down one dimension (e.g. `/explain documentation`)
 */

import * as vscode from 'vscode';
import { dimensionToMarkdown, toMarkdown, toSummaryLine } from '../engine/report';
import { DIMENSION_IDS, DIMENSION_LABELS } from '../engine/types';
import type { DimensionId, ScanResult } from '../engine/types';

export interface ChatDeps {
  /** Run a scan now (no panel side effects) and persist it as the last result. */
  runScan(): Promise<ScanResult | undefined>;
  /** The most recent scan, if any. */
  getLast(): ScanResult | undefined;
}

const PARTICIPANT_ID = 'ari.chat';

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  deps: ChatDeps,
): void {
  if (!vscode.chat?.createChatParticipant) {
    return; // Chat API not available in this build — participant simply absent.
  }

  const handler: vscode.ChatRequestHandler = async (request, _chatCtx, stream, token) => {
    const command = request.command;

    if (command === 'scan') {
      const result = await scanWithProgress(deps, stream);
      if (result) {
        renderSummary(result, stream);
      }
      return { metadata: { command } };
    }

    if (command === 'fixes') {
      const result = deps.getLast() ?? (await scanWithProgress(deps, stream));
      if (result) {
        renderFixes(result, stream);
      }
      return { metadata: { command } };
    }

    if (command === 'explain') {
      const result = deps.getLast() ?? (await scanWithProgress(deps, stream));
      if (result) {
        renderExplain(result, request.prompt, stream);
      }
      return { metadata: { command } };
    }

    // No slash command: freeform question.
    let result = deps.getLast();
    if (!result) {
      result = await scanWithProgress(deps, stream);
    }
    if (!result) {
      return { metadata: { command: 'none' } };
    }

    const targeted = matchDimension(request.prompt);
    if (request.model) {
      await answerWithModel(request, result, stream, token);
    } else if (targeted) {
      renderExplain(result, targeted, stream);
    } else {
      stream.markdown(`${toSummaryLine(result)}\n\n`);
      stream.markdown('Ask me about a specific dimension, or use a command:');
      stream.button({ command: 'ari.scanRepository', title: 'Re-scan repository' });
    }
    return { metadata: { command: 'none' } };
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('pulse');
  participant.followupProvider = {
    provideFollowups(result) {
      const cmd = (result.metadata as { command?: string } | undefined)?.command;
      const followups: vscode.ChatFollowup[] = [];
      if (cmd !== 'fixes') {
        followups.push({ prompt: '', command: 'fixes', label: 'Show the remediation checklist' });
      }
      if (cmd !== 'explain') {
        followups.push({
          prompt: 'context',
          command: 'explain',
          label: 'Explain the weakest dimension',
        });
      }
      followups.push({ prompt: '', command: 'scan', label: 'Run a fresh scan' });
      return followups;
    },
  };

  context.subscriptions.push(participant);
}

async function scanWithProgress(
  deps: ChatDeps,
  stream: vscode.ChatResponseStream,
): Promise<ScanResult | undefined> {
  stream.progress('Scanning the repository…');
  const result = await deps.runScan();
  if (!result) {
    stream.markdown(
      '⚠️ No folder is open, so there is nothing to scan. Open a project folder and try again.',
    );
  }
  return result;
}

function renderSummary(result: ScanResult, stream: vscode.ChatResponseStream): void {
  stream.markdown(`## ${toSummaryLine(result)}\n\n`);
  stream.markdown('| Dimension | Weight | Score |\n|---|---:|---:|\n');
  for (const d of result.dimensions) {
    const w = Math.round((result.weights[d.dimension] ?? 0) * 100);
    stream.markdown(`| ${DIMENSION_LABELS[d.dimension]} | ${w}% | ${d.score} |\n`);
  }
  stream.markdown('\n');

  const top = result.remediation.slice(0, 3);
  if (top.length) {
    stream.markdown(`**Top ${top.length} fix${top.length > 1 ? 'es' : ''}:**\n`);
    for (const r of top) {
      stream.markdown(`- _(${r.priority})_ **${r.title}** — ${r.detail}\n`);
    }
    stream.markdown('\n');
  } else {
    stream.markdown('Nothing scored below the remediation threshold. 🎉\n\n');
  }
  stream.button({ command: 'ari.showResults', title: 'Open full report' });
}

function renderFixes(result: ScanResult, stream: vscode.ChatResponseStream): void {
  if (result.remediation.length === 0) {
    stream.markdown('Every dimension cleared the remediation threshold — no fixes needed. 🎉');
    return;
  }
  stream.markdown(`### Remediation matrix — ${result.remediation.length} item(s)\n\n`);
  for (const priority of ['high', 'medium', 'low'] as const) {
    const items = result.remediation.filter((r) => r.priority === priority);
    if (!items.length) {
      continue;
    }
    stream.markdown(`**${priority.toUpperCase()}**\n\n`);
    for (const r of items) {
      stream.markdown(`- [ ] **${r.title}** (${DIMENSION_LABELS[r.dimension]})\n  ${r.detail}\n`);
    }
    stream.markdown('\n');
  }
  stream.button({ command: 'ari.showResults', title: 'Open full report' });
}

function renderExplain(
  result: ScanResult,
  prompt: string,
  stream: vscode.ChatResponseStream,
): void {
  const id = matchDimension(prompt) ?? weakestDimension(result);
  const d = result.dimensions.find((x) => x.dimension === id);
  if (!d) {
    stream.markdown(
      `Which dimension? One of: ${DIMENSION_IDS.map((x) => `\`${x}\``).join(', ')}.`,
    );
    return;
  }
  const weightPct = Math.round((result.weights[d.dimension] ?? 0) * 100);
  stream.markdown(dimensionToMarkdown(d, weightPct));
}

async function answerWithModel(
  request: vscode.ChatRequest,
  result: ScanResult,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const report = toMarkdown(result, { includeSignals: true, includeRemediation: true });
  const messages = [
    vscode.LanguageModelChatMessage.User(
      [
        'You are ARI, an assistant that helps developers make their repository easier for AI coding assistants to work in.',
        'Answer the user using ONLY the scan report below. Be concrete and cite specific signals. If the report does not cover something, say so.',
        '',
        '--- SCAN REPORT ---',
        report,
        '--- END REPORT ---',
        '',
        `User question: ${request.prompt}`,
      ].join('\n'),
    ),
  ];

  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch (err) {
    stream.markdown(
      `_(Could not reach the language model: ${
        err instanceof Error ? err.message : String(err)
      }. Falling back to the raw breakdown.)_\n\n`,
    );
    const id = matchDimension(request.prompt) ?? weakestDimension(result);
    const d = result.dimensions.find((x) => x.dimension === id);
    if (d) {
      stream.markdown(dimensionToMarkdown(d, Math.round((result.weights[d.dimension] ?? 0) * 100)));
    } else {
      stream.markdown(toSummaryLine(result));
    }
  }
}

function matchDimension(prompt: string): DimensionId | undefined {
  const p = prompt.toLowerCase();
  for (const id of DIMENSION_IDS) {
    if (p.includes(id.toLowerCase()) || p.includes(DIMENSION_LABELS[id].toLowerCase())) {
      return id;
    }
  }
  if (/\bcontext\b/.test(p)) {
    return 'context';
  }
  if (/\btest|ci\b|lint/.test(p)) {
    return 'verifiability';
  }
  if (/\bsetup|build|repro|lockfile|depend/.test(p)) {
    return 'reproducibility';
  }
  if (/\bdoc(s|umentation)?\b/.test(p)) {
    return 'documentation';
  }
  if (/\bnavig|structure|layout|folder/.test(p)) {
    return 'navigability';
  }
  if (/\bregression|changelog|branch protection|safety/.test(p)) {
    return 'changeSafety';
  }
  return undefined;
}

function weakestDimension(result: ScanResult): DimensionId {
  return [...result.dimensions].sort((a, b) => a.score - b.score)[0].dimension;
}
