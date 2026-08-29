/**
 * Filesystem helpers for the scoring engine. Pure Node, no `vscode`.
 *
 * All scorers operate on a single pre-built {@link RepoTree} so we walk the
 * disk once per scan. Individual scorers may still read specific file contents
 * on demand via {@link readFileSafe}.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { RepoTree } from './types';

/** Convert an OS path (repo-relative) to POSIX separators for stable matching. */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Minimal glob matcher supporting the subset we need: `**`, `*`, and literal
 * segments. Patterns and paths are POSIX-style. Good enough for exclude lists
 * like `**\/node_modules/**` without pulling in a dependency.
 */
export function matchGlob(pattern: string, filePath: string): boolean {
  const rx = globToRegExp(pattern);
  return rx.test(filePath);
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — match across path segments
        re += '.*';
        i++;
        if (glob[i + 1] === '/') {
          i++;
        }
      } else {
        // `*` — match within a segment
        re += '[^/]*';
      }
    } else if ('/.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function isExcluded(relPosixPath: string, excludes: string[]): boolean {
  return excludes.some((p) => matchGlob(p, relPosixPath) || matchGlob(p, relPosixPath + '/'));
}

export interface BuildTreeOptions {
  exclude: string[];
  /** Hard cap on files walked, to keep pathological repos fast. */
  maxFiles?: number;
}

/** Walk `root` once, applying excludes, and return an in-memory tree. */
export async function buildRepoTree(root: string, opts: BuildTreeOptions): Promise<RepoTree> {
  const files: string[] = [];
  const dirs: string[] = [];
  const sizes = new Map<string, number>();
  const maxFiles = opts.maxFiles ?? 50_000;

  async function walk(absDir: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (!rel || isExcluded(rel, opts.exclude)) {
        continue;
      }
      if (entry.isDirectory()) {
        dirs.push(rel);
        await walk(abs);
      } else if (entry.isFile()) {
        files.push(rel);
        try {
          const st = await fsp.stat(abs);
          sizes.set(rel, st.size);
        } catch {
          sizes.set(rel, 0);
        }
      }
    }
  }

  await walk(root);
  files.sort();
  dirs.sort();
  return { root, files, dirs, sizes };
}

/** Read a repo-relative file as UTF-8, returning `undefined` if it can't be read. */
export async function readFileSafe(root: string, relPath: string): Promise<string | undefined> {
  try {
    return await fsp.readFile(path.join(root, relPath), 'utf8');
  } catch {
    return undefined;
  }
}

/** First file in the tree whose basename matches (case-insensitive). */
export function findByName(tree: RepoTree, name: string): string | undefined {
  const lower = name.toLowerCase();
  return tree.files.find((f) => f.slice(f.lastIndexOf('/') + 1).toLowerCase() === lower);
}

/**
 * Locate a file that is conceptually "the repo's" — README, CONTRIBUTING,
 * LICENSE, package.json. Prefers an exact repo-root match, then the shallowest
 * match, so a vendored or fixture copy deeper in the tree never wins over the
 * real one.
 */
export function findRootFile(tree: RepoTree, ...names: string[]): string | undefined {
  const lowers = names.map((n) => n.toLowerCase());
  // 1. exact root
  for (const f of tree.files) {
    if (!f.includes('/') && lowers.includes(f.toLowerCase())) {
      return f;
    }
  }
  // 2. shallowest basename match
  let best: string | undefined;
  let bestDepth = Infinity;
  for (const f of tree.files) {
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase();
    if (!lowers.includes(base)) {
      continue;
    }
    const depth = f.split('/').length;
    if (depth < bestDepth) {
      best = f;
      bestDepth = depth;
    }
  }
  return best;
}

/** All files matching a predicate on the repo-relative POSIX path. */
export function filesMatching(tree: RepoTree, pred: (relPath: string) => boolean): string[] {
  return tree.files.filter(pred);
}

/** Does any directory in the tree have this exact name at any depth? */
export function hasDir(tree: RepoTree, name: string): boolean {
  const lower = name.toLowerCase();
  return tree.dirs.some((d) => d.slice(d.lastIndexOf('/') + 1).toLowerCase() === lower);
}

/** Does a file/dir exist at an exact repo-relative path (case-insensitive)? */
export function hasPath(tree: RepoTree, relPath: string): boolean {
  const lower = toPosix(relPath).toLowerCase();
  return (
    tree.files.some((f) => f.toLowerCase() === lower) ||
    tree.dirs.some((d) => d.toLowerCase() === lower)
  );
}
