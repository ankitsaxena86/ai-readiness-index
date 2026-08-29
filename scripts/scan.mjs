/**
 * Batch-scan one or more repositories with the AI-Readiness engine, outside
 * VS Code. The engine is the exact same code the extension runs.
 *
 *   npm run scan -- <path> [<path> ...] [options]
 *
 * Options:
 *   --md                 print the full Markdown report for each repo
 *   --json               print the raw ScanResult as JSON (implies one object per repo)
 *   --threshold <n>      remediation threshold (default 70)
 *   --weights c,v,r,d,n,s override the six weights (context,verifiability,
 *                        reproducibility,documentation,navigability,changeSafety)
 *   --exclude <glob>     add an exclude pattern (repeatable)
 *
 * Examples:
 *   npm run scan -- ../my-service
 *   npm run scan -- ~/code/*        --md
 *   npm run scan -- . ../a ../b     --weights 30,20,15,15,15,5
 */

import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanRepository } from '../out/engine/scanner.js';
import { toMarkdown, toSummaryLine } from '../out/engine/report.js';

const DIMS = ['context', 'verifiability', 'reproducibility', 'documentation', 'navigability', 'changeSafety'];

function parseArgs(argv) {
  const paths = [];
  const opts = { md: false, json: false, threshold: undefined, weights: undefined, exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md') opts.md = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--threshold') opts.threshold = Number(argv[++i]);
    else if (a === '--weights') {
      const nums = argv[++i].split(',').map(Number);
      opts.weights = Object.fromEntries(DIMS.map((d, k) => [d, nums[k] ?? 0]));
    } else if (a === '--exclude') opts.exclude.push(argv[++i]);
    else if (a.startsWith('--')) {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    } else paths.push(a);
  }
  return { paths, opts };
}

function looksLikeRepo(p) {
  try {
    const entries = readdirSync(p);
    return entries.some((e) =>
      ['.git', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'README.md'].includes(e),
    );
  } catch {
    return false;
  }
}

const { paths, opts } = parseArgs(process.argv.slice(2));
if (paths.length === 0) {
  console.error('usage: npm run scan -- <path> [<path> ...] [--md] [--json] [--threshold n] [--weights c,v,r,d,n,s]');
  process.exit(2);
}

// Expand a directory of repos: `scan -- ~/code` with no repo markers -> scan each child.
const targets = [];
for (const raw of paths) {
  const p = resolve(raw);
  try {
    if (!statSync(p).isDirectory()) continue;
  } catch {
    console.error(`skip (not found): ${p}`);
    continue;
  }
  if (looksLikeRepo(p) || paths.length > 1) {
    targets.push(p);
  } else {
    for (const child of readdirSync(p)) {
      const cp = resolve(p, child);
      try {
        if (statSync(cp).isDirectory() && looksLikeRepo(cp)) targets.push(cp);
      } catch {
        /* ignore */
      }
    }
  }
}

if (targets.length === 0) {
  console.error('no scannable directories found');
  process.exit(1);
}

const results = [];
for (const repoPath of targets) {
  const result = await scanRepository({
    repoPath,
    remediationThreshold: opts.threshold,
    weights: opts.weights,
    exclude: opts.exclude.length ? opts.exclude : undefined,
  });
  results.push(result);
}

if (opts.json) {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  process.exit(0);
}

if (opts.md) {
  for (const r of results) {
    console.log(toMarkdown(r));
    console.log('\n---\n');
  }
  process.exit(0);
}

// Default: a compact table.
const nameW = Math.max(4, ...results.map((r) => shortName(r.repoPath).length));
console.log(
  `${'repo'.padEnd(nameW)}  score  grade   ` + DIMS.map((d) => d.slice(0, 4).padStart(5)).join(' '),
);
console.log('-'.repeat(nameW + 9 + 6 * 6));
for (const r of results) {
  const cells = r.dimensions.map((d) => String(d.score).padStart(5)).join(' ');
  console.log(
    `${shortName(r.repoPath).padEnd(nameW)}  ${String(r.overall).padStart(5)}  ${r.grade.padEnd(5)}   ${cells}`,
  );
}
console.log();
for (const r of results) {
  console.log(`• ${shortName(r.repoPath)}: ${toSummaryLine(r)}  (${r.remediation.length} fixes)`);
}

function shortName(p) {
  return p.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? p;
}
